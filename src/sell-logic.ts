import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { logger } from './utils/logger.js';
import { TransactionExecutor } from './transaction-executor.js';
import type { Position, TransactionData, SellLogicConfig } from './types/index.js';

export class SellLogic {
  private connection: Connection;
  private wallet: Keypair;
  private transactionExecutor: TransactionExecutor;
  private stopLossPercent: number;
  private takeProfitPercent: number;
  private positions: Map<string, Position> = new Map();
  private monitoringInterval: number = 10000; // 10 seconds
  private monitorTimer: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;

  constructor(connection: Connection, wallet: Keypair, transactionExecutor: TransactionExecutor, config: SellLogicConfig) {
    this.connection = connection;
    this.wallet = wallet;
    this.transactionExecutor = transactionExecutor;
    this.stopLossPercent = config.stopLossPercent;
    this.takeProfitPercent = config.takeProfitPercent;
  }

  addPosition(position: Position): void {
    this.positions.set(position.tokenMint, position);
    logger.info(`Added position to monitoring: ${position.tokenMint}`);
    
    if (!this.isMonitoring) {
      this.startMonitoring();
    }
  }

  removePosition(tokenMint: string): void {
    this.positions.delete(tokenMint);
    logger.info(`Removed position from monitoring: ${tokenMint}`);
    
    if (this.positions.size === 0) {
      this.stopMonitoring();
    }
  }

  private startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    logger.info('Starting position monitoring for stop loss/take profit');

    this.monitorTimer = setInterval(() => {
      this.checkPositions();
    }, this.monitoringInterval);
  }

  private stopMonitoring(): void {
    this.isMonitoring = false;
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
    logger.info('Stopped position monitoring');
  }

  private async checkPositions(): Promise<void> {
    if (!this.isMonitoring || this.positions.size === 0) {
      return;
    }

    for (const [tokenMint, position] of this.positions.entries()) {
      try {
        await this.checkPosition(tokenMint, position);
      } catch (error) {
        logger.error(`Error checking position ${tokenMint}:`, error);
      }
    }
  }

  private async checkPosition(tokenMint: string, position: Position): Promise<void> {
    try {
      // Get current token price
      const currentPrice = await this.getCurrentPrice(new PublicKey(tokenMint));
      
      if (!currentPrice) {
        logger.warn(`Could not get price for ${tokenMint}`);
        return;
      }

      const priceChange = ((currentPrice - position.buyPrice) / position.buyPrice) * 100;

      logger.debug(`${tokenMint}: Buy ${position.buyPrice}, Current ${currentPrice}, Change ${priceChange.toFixed(2)}%`);

      // Check stop loss
      if (priceChange <= -this.stopLossPercent) {
        logger.warn(`Stop loss triggered for ${tokenMint}: ${priceChange.toFixed(2)}%`);
        await this.executeSell(tokenMint, position, 'stop_loss', currentPrice);
        return;
      }

      // Check take profit
      if (priceChange >= this.takeProfitPercent) {
        logger.info(`Take profit triggered for ${tokenMint}: ${priceChange.toFixed(2)}%`);
        await this.executeSell(tokenMint, position, 'take_profit', currentPrice);
        return;
      }
    } catch (error) {
      logger.error(`Error checking position ${tokenMint}:`, error);
    }
  }

  private async getCurrentPrice(tokenMint: PublicKey): Promise<number | null> {
    try {
      // This is a placeholder - you need to implement actual price fetching
      // Options:
      // 1. Use Jupiter API to get quote
      // 2. Use DEX price oracles
      // 3. Use on-chain price feeds
      
      // For now, return null to indicate price fetching is not implemented
      logger.warn('Price fetching not fully implemented - integrate with price oracle');
      return null;

      /* Example implementation:
      const quote = await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${tokenMint.toString()}&outputMint=So11111111111111111111111111111111111111112&amount=1000000`
      ).then(r => r.json());
      
      if (quote && quote.outAmount) {
        return parseFloat(quote.outAmount) / 1e9; // Convert to SOL
      }
      */
    } catch (error) {
      logger.error('Error getting current price:', error);
      return null;
    }
  }

  private async executeSell(
    tokenMint: string,
    position: Position,
    reason: 'stop_loss' | 'take_profit',
    currentPrice: number
  ): Promise<boolean> {
    try {
      logger.info(`Executing sell for ${tokenMint} (reason: ${reason})`);

      // Create a mock reference transaction for the sell
      const referenceTransaction: TransactionData = {
        wallet: new PublicKey(position.targetWallet),
        type: 'sell',
        tokenMint: new PublicKey(tokenMint),
        amount: 0,
        solAmount: 0,
      };

      const result = await this.transactionExecutor.executeSell(
        new PublicKey(tokenMint),
        referenceTransaction
      );

      if (result.success) {
        this.removePosition(tokenMint);
        logger.info(`Successfully sold ${tokenMint} at ${currentPrice} SOL (${reason})`);
        return true;
      } else {
        logger.error(`Failed to sell ${tokenMint}: ${result.error || 'Unknown error'}`);
        return false;
      }
    } catch (error) {
      logger.error(`Error executing sell for ${tokenMint}:`, error);
      return false;
    }
  }
}

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { logger } from './utils/logger.js';
import { WalletMonitor } from './wallet-monitor.js';
import { TransactionExecutor } from './transaction-executor.js';
import { SellLogic } from './sell-logic.js';
import type { BotConfig, Position, TransactionData } from './types/index.js';

export class CopytradingBot {
  private connection: Connection;
  private privateKey: string;
  private targetWallets: PublicKey[];
  private bagsappProgramId: PublicKey;
  private enableOwnSellLogic: boolean;
  private stopLossPercent: number;
  private takeProfitPercent: number;
  private slippageBps: number;
  private minSolAmount: number;
  private maxSolAmount: number;
  
  private wallet: Keypair | null = null;
  private walletMonitor: WalletMonitor | null = null;
  private transactionExecutor: TransactionExecutor | null = null;
  private sellLogic: SellLogic | null = null;
  private activePositions: Map<string, Position> = new Map();
  private isRunning: boolean = false;

  constructor(config: BotConfig) {
    this.connection = new Connection(config.rpcUrl, 'confirmed');
    this.privateKey = config.privateKey;
    this.targetWallets = config.targetWallets.map(addr => new PublicKey(addr));
    this.bagsappProgramId = new PublicKey(config.bagsappProgramId);
    this.enableOwnSellLogic = config.enableOwnSellLogic;
    this.stopLossPercent = config.stopLossPercent;
    this.takeProfitPercent = config.takeProfitPercent;
    this.slippageBps = config.slippageBps;
    this.minSolAmount = config.minSolAmount;
    this.maxSolAmount = config.maxSolAmount;
  }

  async initialize(): Promise<void> {
    if (!this.privateKey) {
      throw new Error('Private key not provided');
    }

    // Initialize wallet from private key
    const secretKey = bs58.decode(this.privateKey);
    this.wallet = Keypair.fromSecretKey(secretKey);
    
    logger.info(`Bot wallet: ${this.wallet.publicKey.toString()}`);
    
    // Check wallet balance
    const balance = await this.connection.getBalance(this.wallet.publicKey);
    const solBalance = balance / 1e9;
    logger.info(`Wallet balance: ${solBalance} SOL`);
    
    if (solBalance < this.minSolAmount) {
      logger.warn(`Low balance: ${solBalance} SOL (minimum: ${this.minSolAmount} SOL)`);
    }

    // Initialize components
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    this.transactionExecutor = new TransactionExecutor(this.connection, this.wallet, {
      slippageBps: this.slippageBps,
      minSolAmount: this.minSolAmount,
      maxSolAmount: this.maxSolAmount,
    });

    this.sellLogic = new SellLogic(this.connection, this.wallet, this.transactionExecutor, {
      stopLossPercent: this.stopLossPercent,
      takeProfitPercent: this.takeProfitPercent,
    });

    this.walletMonitor = new WalletMonitor(this.connection, this.targetWallets, {
      bagsappProgramId: this.bagsappProgramId,
      onTransaction: this.handleTransaction.bind(this),
    });

    logger.info(`Monitoring ${this.targetWallets.length} target wallet(s)`);
    logger.info(`Own sell logic: ${this.enableOwnSellLogic ? 'ENABLED' : 'DISABLED'}`);
    if (this.enableOwnSellLogic) {
      logger.info(`Stop Loss: ${this.stopLossPercent}%, Take Profit: ${this.takeProfitPercent}%`);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Bot is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Bot started successfully');

    // Start monitoring wallets
    if (this.walletMonitor) {
      await this.walletMonitor.start();
    }

    // If own sell logic is enabled, start monitoring positions
    if (this.enableOwnSellLogic) {
      this.startPositionMonitoring();
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.walletMonitor) {
      await this.walletMonitor.stop();
    }
    logger.info('Bot stopped');
  }

  private async handleTransaction(transactionData: TransactionData): Promise<void> {
    try {
      const { wallet, signature, type, tokenMint, amount, solAmount } = transactionData;

      logger.info(`Detected ${type} transaction from ${wallet.toString()}`);
      logger.info(`Token: ${tokenMint.toString()}, Amount: ${amount}, SOL: ${solAmount}`);

      if (type === 'buy') {
        await this.handleBuy(tokenMint, solAmount, transactionData);
      } else if (type === 'sell') {
        await this.handleSell(tokenMint, transactionData);
      }
    } catch (error) {
      logger.error('Error handling transaction:', error);
    }
  }

  private async handleBuy(tokenMint: PublicKey, solAmount: number, transactionData: TransactionData): Promise<void> {
    try {
      // Check if we already have a position
      if (this.activePositions.has(tokenMint.toString())) {
        logger.warn(`Already have position in ${tokenMint.toString()}, skipping`);
        return;
      }

      if (!this.transactionExecutor) {
        logger.error('Transaction executor not initialized');
        return;
      }

      // Execute buy transaction
      const result = await this.transactionExecutor.executeBuy(tokenMint, solAmount, transactionData);
      
      if (result.success && result.signature && result.amount !== undefined && result.price !== undefined) {
        // Record position
        const position: Position = {
          tokenMint: tokenMint.toString(),
          buyPrice: result.price,
          buyAmount: result.amount,
          solAmount: solAmount,
          buyTime: Date.now(),
          buySignature: result.signature,
          targetWallet: transactionData.wallet.toString(),
        };

        this.activePositions.set(tokenMint.toString(), position);
        logger.info(`Position opened: ${tokenMint.toString()} at ${result.price} SOL`);
        
        // If own sell logic is enabled, start monitoring this position
        if (this.enableOwnSellLogic && this.sellLogic) {
          this.sellLogic.addPosition(position);
        }
      } else {
        logger.error(`Failed to execute buy: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('Error handling buy:', error);
    }
  }

  private async handleSell(tokenMint: PublicKey, transactionData: TransactionData): Promise<void> {
    try {
      const position = this.activePositions.get(tokenMint.toString());
      
      if (!position) {
        logger.warn(`No position found for ${tokenMint.toString()}, skipping sell`);
        return;
      }

      // If own sell logic is disabled, copy the sell
      if (!this.enableOwnSellLogic) {
        if (!this.transactionExecutor) {
          logger.error('Transaction executor not initialized');
          return;
        }

        const result = await this.transactionExecutor.executeSell(tokenMint, transactionData);
        
        if (result.success) {
          this.activePositions.delete(tokenMint.toString());
          if (this.enableOwnSellLogic && this.sellLogic) {
            this.sellLogic.removePosition(tokenMint.toString());
          }
          logger.info(`Position closed: ${tokenMint.toString()}`);
        } else {
          logger.error(`Failed to execute sell: ${result.error || 'Unknown error'}`);
        }
      } else {
        // Own sell logic is enabled, so we don't copy sells
        logger.info(`Own sell logic enabled, ignoring target wallet sell for ${tokenMint.toString()}`);
      }
    } catch (error) {
      logger.error('Error handling sell:', error);
    }
  }

  private startPositionMonitoring(): void {
    // Position monitoring is handled by SellLogic
    logger.info('Position monitoring started (own sell logic enabled)');
  }

  getActivePositions(): Position[] {
    return Array.from(this.activePositions.values());
  }
}

import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { logger } from './utils/logger.js';
import type { TransactionData, WalletMonitorConfig } from './types/index.js';

export class WalletMonitor {
  private connection: Connection;
  private targetWallets: PublicKey[];
  private bagsappProgramId: PublicKey;
  private onTransaction: (data: TransactionData) => void | Promise<void>;
  private isMonitoring: boolean = false;
  private signatureCache: Set<string> = new Set();
  private pollInterval: number = 5000; // 5 seconds
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(connection: Connection, targetWallets: PublicKey[], config: WalletMonitorConfig) {
    this.connection = connection;
    this.targetWallets = targetWallets;
    this.bagsappProgramId = config.bagsappProgramId;
    this.onTransaction = config.onTransaction;
  }

  async start(): Promise<void> {
    if (this.isMonitoring) {
      logger.warn('Wallet monitoring already started');
      return;
    }

    this.isMonitoring = true;
    logger.info('Starting wallet monitoring...');

    // Initial fetch of recent transactions
    for (const wallet of this.targetWallets) {
      await this.fetchRecentTransactions(wallet);
    }

    // Start polling
    this.pollTimer = setInterval(() => {
      this.pollTransactions();
    }, this.pollInterval);

    logger.info('Wallet monitoring active');
  }

  async stop(): Promise<void> {
    this.isMonitoring = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    logger.info('Wallet monitoring stopped');
  }

  private async pollTransactions(): Promise<void> {
    if (!this.isMonitoring) return;

    try {
      for (const wallet of this.targetWallets) {
        await this.fetchRecentTransactions(wallet);
      }
    } catch (error) {
      logger.error('Error polling transactions:', error);
    }
  }

  private async fetchRecentTransactions(wallet: PublicKey): Promise<void> {
    try {
      const signatures = await this.connection.getSignaturesForAddress(
        wallet,
        { limit: 10 },
        'confirmed'
      );

      for (const sigInfo of signatures) {
        const signature = sigInfo.signature;
        
        // Skip if we've already processed this transaction
        if (this.signatureCache.has(signature)) {
          continue;
        }

        // Fetch full transaction
        const tx = await this.connection.getTransaction(signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (tx && tx.meta && !tx.meta.err) {
          const transactionData = this.parseTransaction(tx, wallet);
          
          if (transactionData) {
            this.signatureCache.add(signature);
            
            // Keep cache size manageable
            if (this.signatureCache.size > 1000) {
              const first = this.signatureCache.values().next().value;
              if (first) {
                this.signatureCache.delete(first);
              }
            }

            // Notify about the transaction
            await this.onTransaction(transactionData);
          }
        }
      }
    } catch (error) {
      logger.error(`Error fetching transactions for ${wallet.toString()}:`, error);
    }
  }

  private parseTransaction(tx: ParsedTransactionWithMeta, wallet: PublicKey): TransactionData | null {
    try {
      // Check if transaction involves bagsapp program
      const accountKeys = tx.transaction.message.accountKeys.map(key => 
        typeof key === 'string' ? key : key.toString()
      );
      
      const bagsappProgramIdStr = this.bagsappProgramId.toString();
      if (!accountKeys.includes(bagsappProgramIdStr)) {
        return null;
      }

      // Parse transaction instructions
      const instructions = tx.transaction.message.instructions;
      
      for (const instruction of instructions) {
        const programId = typeof instruction.programId === 'string' 
          ? instruction.programId 
          : instruction.programId.toString();
        
        if (programId === bagsappProgramIdStr) {
          const data = this.parseBagsappInstruction(instruction, tx, wallet);
          if (data) {
            return data;
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('Error parsing transaction:', error);
      return null;
    }
  }

  private parseBagsappInstruction(
    instruction: any,
    tx: ParsedTransactionWithMeta,
    wallet: PublicKey
  ): TransactionData | null {
    try {
      // This is a simplified parser - you'll need to adjust based on actual Bagsapp program structure
      // Bagsapp typically uses Jupiter or similar DEX aggregators
      
      const accountKeys = tx.transaction.message.accountKeys.map(key =>
        typeof key === 'string' ? key : key.toString()
      );
      const preBalances = tx.meta.preBalances;
      const postBalances = tx.meta.postBalances;
      const preTokenBalances = tx.meta.preTokenBalances || [];
      const postTokenBalances = tx.meta.postTokenBalances || [];

      // Find the wallet's account index
      const walletIndex = accountKeys.findIndex(
        key => key === wallet.toString()
      );

      if (walletIndex === -1) {
        return null;
      }

      // Calculate SOL change
      const solChange = (postBalances[walletIndex] - preBalances[walletIndex]) / 1e9;

      // Find token balance changes
      const walletTokenBalances = {
        pre: preTokenBalances.filter(tb => tb.owner === wallet.toString()),
        post: postTokenBalances.filter(tb => tb.owner === wallet.toString()),
      };

      // Determine if this is a buy or sell
      let type: 'buy' | 'sell' | null = null;
      let tokenMint: PublicKey | null = null;
      let amount = 0;
      const solAmount = Math.abs(solChange);

      // If SOL decreased, likely a buy
      if (solChange < -0.001) {
        // Check for new token balance
        for (const postBalance of walletTokenBalances.post) {
          const preBalance = walletTokenBalances.pre.find(
            tb => tb.mint === postBalance.mint
          );
          
          const postAmount = postBalance.uiTokenAmount?.uiAmount || 0;
          const preAmount = preBalance.uiTokenAmount?.uiAmount || 0;
          
          if (!preBalance || postAmount > preAmount) {
            type = 'buy';
            tokenMint = new PublicKey(postBalance.mint);
            amount = postAmount;
            break;
          }
        }
      }
      // If SOL increased, likely a sell
      else if (solChange > 0.001) {
        // Check for decreased token balance
        for (const preBalance of walletTokenBalances.pre) {
          const postBalance = walletTokenBalances.post.find(
            tb => tb.mint === preBalance.mint
          );
          
          const preAmount = preBalance.uiTokenAmount?.uiAmount || 0;
          const postAmount = postBalance?.uiTokenAmount?.uiAmount || 0;
          
          if (preAmount > postAmount) {
            type = 'sell';
            tokenMint = new PublicKey(preBalance.mint);
            amount = preAmount - postAmount;
            break;
          }
        }
      }

      if (type && tokenMint) {
        return {
          wallet,
          signature: tx.transaction.signatures[0],
          type,
          tokenMint,
          amount,
          solAmount,
          timestamp: tx.blockTime ? tx.blockTime * 1000 : undefined,
        };
      }

      return null;
    } catch (error) {
      logger.error('Error parsing bagsapp instruction:', error);
      return null;
    }
  }
}

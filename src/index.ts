import dotenv from 'dotenv';
import { CopytradingBot } from './bot.js';
import { logger } from './utils/logger.js';

dotenv.config();

async function main(): Promise<void> {
  try {
    logger.info('Starting Bagsapp Copytrading Bot...');
    
    const bot = new CopytradingBot({
      rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      privateKey: process.env.PRIVATE_KEY || '',
      targetWallets: process.env.TARGET_WALLETS?.split(',').map(w => w.trim()) || [],
      bagsappProgramId: process.env.BAGSAPP_PROGRAM_ID || 'BagApp111111111111111111111111111111111',
      enableOwnSellLogic: process.env.ENABLE_OWN_SELL_LOGIC === 'true',
      stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT || '5'),
      takeProfitPercent: parseFloat(process.env.TAKE_PROFIT_PERCENT || '10'),
      slippageBps: parseInt(process.env.SLIPPAGE_BPS || '100', 10),
      minSolAmount: parseFloat(process.env.MIN_SOL_AMOUNT || '0.01'),
      maxSolAmount: parseFloat(process.env.MAX_SOL_AMOUNT || '10'),
    });

    await bot.initialize();
    await bot.start();
  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

main();

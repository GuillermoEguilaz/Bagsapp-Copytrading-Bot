import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';

export interface BotConfig {
  rpcUrl: string;
  privateKey: string;
  targetWallets: string[];
  bagsappProgramId: string;
  enableOwnSellLogic: boolean;
  stopLossPercent: number;
  takeProfitPercent: number;
  slippageBps: number;
  minSolAmount: number;
  maxSolAmount: number;
}

export interface Position {
  tokenMint: string;
  buyPrice: number;
  buyAmount: number;
  solAmount: number;
  buyTime: number;
  buySignature: string;
  targetWallet: string;
}

export interface TransactionData {
  wallet: PublicKey;
  signature: string;
  type: 'buy' | 'sell';
  tokenMint: PublicKey;
  amount: number;
  solAmount: number;
  timestamp?: number;
}

export interface SwapResult {
  success: boolean;
  signature?: string;
  tokenAmount?: number;
  solAmount?: number;
  price?: number;
  error?: string;
}

export interface BuyResult {
  success: boolean;
  signature?: string;
  amount?: number;
  price?: number;
  error?: string;
}

export interface SellResult {
  success: boolean;
  signature?: string;
  solAmount?: number;
  error?: string;
}

export interface WalletMonitorConfig {
  bagsappProgramId: PublicKey;
  onTransaction: (data: TransactionData) => void | Promise<void>;
}

export interface TransactionExecutorConfig {
  slippageBps: number;
  minSolAmount: number;
  maxSolAmount: number;
}

export interface SellLogicConfig {
  stopLossPercent: number;
  takeProfitPercent: number;
}

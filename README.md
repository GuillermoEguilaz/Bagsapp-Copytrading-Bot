# Bagsapp Copytrading Bot

A Solana copytrading bot that monitors target wallets on Bagsapp and automatically copies their buy/sell transactions. The bot includes optional automatic sell logic with stop loss and take profit features.

## Features

- 🔍 **Wallet Monitoring**: Monitors multiple target wallets for transactions on Bagsapp
- 📋 **Transaction Copying**: Automatically copies buy and sell transactions from target wallets
- 🎯 **Smart Sell Logic**: Optional automatic sell with stop loss and take profit
- ⚙️ **Configurable**: Easy configuration via environment variables
- 📊 **Logging**: Comprehensive logging for monitoring and debugging

## Prerequisites

- Node.js 18+ installed
- TypeScript 5.3+ (installed via npm)
- A Solana wallet with SOL for trading
- Access to a Solana RPC endpoint (recommended: Helius, QuickNode, or Alchemy)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Bagsapp-Copytrading-Bot
```

2. Install dependencies:
```bash
npm install
```

3. Build the TypeScript project:
```bash
npm run build
```

4. Copy the example environment file:
```bash
cp .env.example .env
```

5. Configure your `.env` file with your settings:
   - Add your wallet's private key (base58 encoded)
   - Add target wallet addresses to monitor
   - Configure sell logic settings
   - Set your Solana RPC URL

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SOLANA_RPC_URL` | Solana RPC endpoint URL | Yes |
| `PRIVATE_KEY` | Your wallet's private key (base58) | Yes |
| `TARGET_WALLETS` | Comma-separated list of wallet addresses to monitor | Yes |
| `BAGSAPP_PROGRAM_ID` | Bagsapp program ID on Solana | Yes |
| `ENABLE_OWN_SELL_LOGIC` | Enable/disable automatic sell logic (`true`/`false`) | No (default: `false`) |
| `STOP_LOSS_PERCENT` | Stop loss percentage (only if own sell logic enabled) | No (default: `5`) |
| `TAKE_PROFIT_PERCENT` | Take profit percentage (only if own sell logic enabled) | No (default: `10`) |
| `SLIPPAGE_BPS` | Slippage tolerance in basis points (100 = 1%) | No (default: `100`) |
| `MIN_SOL_AMOUNT` | Minimum SOL amount per trade | No (default: `0.01`) |
| `MAX_SOL_AMOUNT` | Maximum SOL amount per trade | No (default: `10`) |
| `LOG_LEVEL` | Logging level (`error`, `warn`, `info`, `debug`) | No (default: `info`) |

### Sell Logic Modes

#### Mode 1: Copy Target Wallet Sells (Default)
Set `ENABLE_OWN_SELL_LOGIC=false`
- Bot copies all buy transactions from target wallets
- Bot copies all sell transactions from target wallets
- No automatic stop loss or take profit

#### Mode 2: Own Sell Logic Enabled
Set `ENABLE_OWN_SELL_LOGIC=true`
- Bot copies buy transactions from target wallets
- Bot ignores target wallet sells
- Automatically sells based on stop loss and take profit thresholds
- Continuously monitors positions and executes sells when thresholds are met

## Usage

Build the project (required before first run):
```bash
npm run build
```

Start the bot:
```bash
npm start
```

For development with auto-reload (TypeScript):
```bash
npm run dev
```

Type check without building:
```bash
npm run type-check
```

## How It Works

1. **Wallet Monitoring**: The bot continuously monitors specified target wallets for new transactions
2. **Transaction Detection**: When a transaction involving Bagsapp is detected, it's parsed to determine if it's a buy or sell
3. **Buy Execution**: When a target wallet buys a token, the bot executes a similar buy transaction
4. **Sell Execution**: 
   - If own sell logic is disabled: Bot copies the target wallet's sell
   - If own sell logic is enabled: Bot monitors positions and sells based on stop loss/take profit

## Important Notes

### ⚠️ Security
- **NEVER** share your private key or commit it to version control
- Keep your `.env` file secure and never share it
- Use a dedicated trading wallet, not your main wallet

### ⚠️ Risk Warning
- Trading bots involve financial risk
- Always test with small amounts first
- Monitor the bot regularly
- The bot is provided as-is without warranty

### 🔧 Implementation Notes

The current implementation includes placeholder methods for:
- Jupiter API integration for swaps
- Price fetching for stop loss/take profit

You'll need to complete these integrations based on:
- Bagsapp's actual swap mechanism
- Available price oracles or DEX APIs
- Your preferred DEX aggregator (Jupiter, Orca, etc.)

## Project Structure

```
.
├── src/
│   ├── index.ts              # Entry point
│   ├── bot.ts                # Main bot logic
│   ├── wallet-monitor.ts     # Wallet transaction monitoring
│   ├── transaction-executor.ts # Transaction execution
│   ├── sell-logic.ts         # Stop loss/take profit logic
│   ├── types/
│   │   └── index.ts          # TypeScript type definitions
│   └── utils/
│       └── logger.ts         # Logging utility
├── dist/                     # Compiled JavaScript (generated)
├── logs/                     # Log files (auto-created)
├── .env.example             # Example environment configuration
├── .gitignore               # Git ignore rules
├── tsconfig.json            # TypeScript configuration
├── package.json             # Dependencies and scripts
└── README.md                # This file
```

## Logging

Logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Error logs only
- Console output - Real-time monitoring

## Troubleshooting

### Bot not detecting transactions
- Verify target wallet addresses are correct
- Check RPC endpoint is working
- Ensure Bagsapp program ID is correct

### Transactions failing
- Check wallet has sufficient SOL balance
- Verify slippage settings are appropriate
- Check RPC endpoint rate limits

### Price monitoring not working
- Complete the price fetching implementation in `sell-logic.ts`
- Integrate with a price oracle or DEX API

### TypeScript compilation errors
- Run `npm run type-check` to see detailed type errors
- Ensure all dependencies are installed: `npm install`
- Check that `tsconfig.json` is properly configured

## Contributing

Contributions are welcome! Please ensure:
- Code follows existing style
- Tests are added for new features
- Documentation is updated

## License

MIT License - see LICENSE file for details

## Disclaimer

This bot is for educational purposes. Use at your own risk. The authors are not responsible for any financial losses incurred while using this bot.

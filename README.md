# 🚀 Jev Autonomous Solana Toolkit (`jev-solana-toolkit`)

A production-ready, modular Node.js toolkit for building **Solana Autonomous Trading & Revenue Agents**. 

Designed for automated Solana token deployers, agentic fee distribution systems, buyback & burn mechanics, treasury management, and holder reward/stock airdrops.

---

## ⚡ Core Features

- 🔑 **Wallet Engine (`wallet.js`)**: Generate agent wallets, manage Base58/JSON keypairs, monitor SOL balances, and sweep remaining SOL back to Treasury.
- 📈 **Bonding Curve & Price Oracle (`pumpfun.js`)**: Real-time price tracking, bonding curve reserve calculations, and graduation status checks.
- 💰 **Automated Fee Claims (`fees:claim`)**: 100% on-chain creator fee extraction from Pump.fun program vaults.
- ⚖️ **50/50 Revenue Split System**: Automatically splits claimed creator fees:
  - **50% transferred to Treasury Wallet** (`TREASURY_ADDRESS`)
  - **50% used for automated token buyback & incineration**
- 🔥 **Incinerator Engine (`incinerator.js`)**: Direct SPL token burning to the official Solana Incinerator (`Incinerator111111111111111111111111111111111`).
- 🪂 **Holder Airdrop Distribution (`airdrop.js`)**: Batch airdrop SOL or SPL tokens/stocks to holder recipient lists in a single transaction.
- 📊 **Real-time Web Monitor Hook (`monitor.js`)**: Out-of-the-box integration pushing live events (`claim`, `treasury`, `buyback`, `burn`, `airdrop`) to Express + MongoDB dashboards.

---

## 🏗️ Architecture & Workflow

```
                  ┌────────────────────────┐
                  │ Creator Fee Vault      │
                  └───────────┬────────────┘
                              │ 100% Claim
                              ▼
                  ┌────────────────────────┐
                  │ Agent Wallet           │
                  └─────┬────────────┬─────┘
                        │ 50%        │ 50%
                        ▼            ▼
         ┌──────────────────┐    ┌──────────────────┐
         │ Treasury Wallet  │    │  Token Buyback   │
         └──────────────────┘    └────────┬─────────┘
                                          │ Tokens
                                          ▼
                                 ┌──────────────────┐
                                 │ Incinerator      │
                                 └──────────────────┘
```

---

## 📦 Installation & Setup

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/YOUR_GITHUB_USER/jev-solana-toolkit.git
cd jev-solana-toolkit
npm install
```

### 2. Configure Environment (`.env`)
Copy `.env.example` to `.env` and fill in your RPC and wallet configuration:
```bash
cp .env.example .env
```

Set variables in `.env`:
```env
# Fast Solana Mainnet RPC (Helius, QuickNode, or Alchemy)
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY

# Agent Private Key (Base58 encoded or JSON byte array)
AGENT_PRIVATE_KEY=YOUR_BASE58_PRIVATE_KEY

# Destination Treasury Wallet (Receives 50% creator fee split & SOL sweeps)
TREASURY_ADDRESS=Gg7auhxN1nfMu74GT67Cya2BUb4xaV3BshSgUw34gZP1

# Optional Web Event Monitor Endpoint
MONITOR_API_URL=https://your-monitor-app.onrender.com
```

---

## 🛠️ CLI Tool Reference

The toolkit exposes a clean CLI (`node src/cli.js` or `npm run cli`):

### 1. Generate Agent Wallet
Creates a brand new keypair and appends it to `.wallets.json`:
```bash
node src/cli.js wallet:create --label "deployer-1"
```

### 2. Check SOL Balance
```bash
node src/cli.js wallet:balance
node src/cli.js wallet:balance <PUBLIC_KEY>
```

### 3. Query Bonding Curve Token Price
```bash
node src/cli.js token:price <TOKEN_MINT_ADDRESS>
```

### 4. Claim Creator Fees (With 50/50 Split & Burn)
Claims 100% creator fees, transfers 50% to Treasury, executes 50% buyback, and burns tokens to Incinerator:
```bash
node src/cli.js fees:claim <TOKEN_MINT_ADDRESS>
```

### 5. Sweep / Refund SOL to Treasury
Sweeps balance back to Treasury wallet (leaving 0.002 SOL reserve for fees):
```bash
node src/cli.js wallet:refund
```

### 6. Batch Airdrop SOL or Tokens/Stocks
```bash
# Airdrop 0.005 SOL to a list of comma-separated recipients or a file
node src/cli.js airdrop:sol "Address1,Address2,Address3" 0.005
node src/cli.js airdrop:sol holders.txt 0.005

# Airdrop 100 SPL Tokens/Stocks to recipients
node src/cli.js airdrop:token <TOKEN_MINT> holders.txt 100
```

---

## 🤖 Continuous Autonomous Agent Loop

Run the continuous monitoring loop which automatically checks the token fee vault every 30 seconds, claims fees, executes the 50/50 Treasury & Buyback split, burns tokens, and reports to the Web Monitor:

```bash
node src/index.js <TOKEN_MINT_ADDRESS>
```

---

## 💻 Programmatic Usage

You can import individual modules into your Node.js projects:

```javascript
const { Connection } = require('@solana/web3.js');
const { loadKeypair, refundSol } = require('jev-solana-toolkit/src/wallet');
const { claimCreatorFees, buybackTokens } = require('jev-solana-toolkit/src/pumpfun');
const { burnTokens } = require('jev-solana-toolkit/src/incinerator');
const { airdropTokens } = require('jev-solana-toolkit/src/airdrop');

const connection = new Connection(process.env.SOLANA_RPC_URL);
const agent = loadKeypair(process.env.AGENT_PRIVATE_KEY);

// Example: Programmatic token burn
async function runBurn(mintAddress) {
  const res = await burnTokens(connection, agent, mintAddress);
  console.log(`Burned ${res.burnedTokens} tokens! Tx: ${res.signature}`);
}
```

---

## 🛡️ Security Best Practices

1. **Private Keys**: Never check your `.env` or `.wallets.json` into git repositories. `.gitignore` is pre-configured to exclude sensitive files.
2. **Treasury Scoping**: Agent wallets only hold transient balances necessary for execution. All accumulated value and fee splits are immediately transferred out to the secure cold `TREASURY_ADDRESS`.
3. **RPC Rate Limits**: Use a dedicated Helius/QuickNode RPC endpoint for continuous tracking loops.

---

## 📄 License
MIT License. Built for the Jevdev & Solana Autonomous Agent Developer Community.

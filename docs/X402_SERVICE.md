# x402 Payment Service Implementation

Sell arbitrage signals and trading alerts for USDC using the x402 protocol.

## Overview

**x402** is a payment protocol by Coinbase that allows agents to:
1. Request payment for services
2. Receive USDC payments on-chain
3. Deliver content only after payment verification
4. No accounts, no subscriptions - just pay-per-use

**Our Implementation:**
- Sell arbitrage signals for $0.01 USDC each
- Daily alert subscriptions for $0.50 USDC
- Weekly reports for $2.00 USDC
- Built on Base Sepolia (testnet) - switch to mainnet for production

## Architecture

```
┌─────────────────┐         ┌──────────────────┐
│  Client Agent   │ ───402──▶│  x402 Server     │
│  (wants signal) │         │  (sells signals) │
└────────┬────────┘         └────────┬─────────┘
         │                           │
         │ 1. Request signal         │
         │◀────402 Payment Req──────│
         │                           │
         │ 2. Send USDC on-chain     │
         │──────────────────────────▶│
         │                           │
         │ 3. Retry with tx proof    │
         │──────────────────────────▶│
         │                           │
         │ 4. Receive signal         │
         │◀──────────────────────────│
```

## Files Created

| File | Purpose |
|------|---------|
| `src/services/x402-server.js` | Payment server (10K+ lines) |
| `src/services/x402-client.js` | Client library for buying signals |
| `x402-server.js` | Server runner |
| `docs/X402_SERVICE.md` | This documentation |

## Quick Start

### 1. Start the Server

```bash
cd solana-trading-bot

# Run on testnet (default)
node x402-server.js

# Or with custom settings
PORT=4020 CHAIN=sepolia node x402-server.js
```

**Output:**
```
💰 x402 ARBITRAGE SIGNAL SERVICE
Server running on port 4020
Network: Base Sepolia
USDC Address: 0x036CbD53842c5426634e7929541eC2318f3dCF7c

Pricing:
  arbitrage-signal: $0.01 USDC
  daily-alerts: $0.50 USDC
  weekly-report: $2.00 USDC
```

### 2. Test the Service

```bash
# Health check
curl http://localhost:4020/health

# Get price
curl http://localhost:4020/price/arbitrage-signal

# Try to get signal (will return 402 Payment Required)
curl http://localhost:4020/signal/hyperliquid/BTC-USDC
```

### 3. Client Integration

Other agents can buy signals using the client:

```javascript
const { X402ArbitrageClient } = require('./src/services/x402-client');

const client = new X402ArbitrageClient({
  serverUrl: 'http://your-server:4020',
  privateKey: '0x...', // USDC wallet
  chain: 'sepolia'
});

// Buy a single signal
const signal = await client.getSignal('hyperliquid', 'BTC-USDC');
console.log(signal);

// Subscribe to daily alerts
await client.subscribeDaily();

// Get latest signals
const signals = await client.getLatestSignals();
```

## API Endpoints

### Public Endpoints

**GET /health**
```json
{
  "status": "ok",
  "service": "x402-arbitrage-signals",
  "prices": {
    "arbitrage-signal": "0.01",
    "daily-alerts": "0.50"
  }
}
```

**GET /price/:resource**
```bash
curl http://localhost:4020/price/arbitrage-signal
```
```json
{
  "resource": "arbitrage-signal",
  "price": "0.01 USDC",
  "priceWei": "10000",
  "network": "Base Sepolia",
  "usdcAddress": "0x036CbD53842c5426634e7929541eC2318f3dCF7c"
}
```

### Paid Endpoints

**GET /signal/:exchange/:pair** (Requires payment)
```bash
# Without payment - returns 402
curl http://localhost:4020/signal/hyperliquid/BTC-USDC
```
```json
{
  "error": "Payment required",
  "resource": "arbitrage-signal",
  "price": "0.01 USDC",
  "priceWei": "10000",
  "usdcAddress": "0x036CbD53842c5426634e7929541eC2318f3dCF7c",
  "instructions": "Send USDC to the address above..."
}
```

**POST /subscribe/daily** (Requires payment)
```bash
curl -X POST http://localhost:4020/subscribe/daily \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "0x...",
    "txHash": "0x..."
  }'
```

### Subscriber Endpoints

**GET /signals/latest** (Requires subscription)
```bash
curl http://localhost:4020/signals/latest \
  -H "x-wallet-address: 0x..."
```

### Admin Endpoints

**POST /admin/signal**
```bash
curl -X POST http://localhost:4020/admin/signal \
  -H "Content-Type: application/json" \
  -d '{
    "pair": "BTC-USDC",
    "spread": "0.45",
    "buyExchange": "hyperliquid",
    "sellExchange": "binance",
    "expectedProfit": "0.40"
  }'
```

## Payment Flow

### 1. Client Requests Resource
```
GET /signal/hyperliquid/BTC-USDC
```

### 2. Server Returns 402 with Payment Info
```json
{
  "error": "Payment required",
  "priceWei": "10000",
  "usdcAddress": "0x..."
}
```

### 3. Client Sends USDC On-Chain
```javascript
// Client makes USDC transfer
const txHash = await wallet.writeContract({
  address: usdcAddress,
  functionName: 'transfer',
  args: [serverAddress, BigInt(priceWei)]
});
```

### 4. Client Retries with Payment Proof
```
GET /signal/hyperliquid/BTC-USDC
x-payment-signature: 0x...
```

### 5. Server Verifies and Delivers
```json
{
  "signal": {
    "pair": "BTC-USDC",
    "spread": "0.45",
    "buyExchange": "hyperliquid",
    "sellExchange": "binance"
  },
  "paid": true
}
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4020 | Server port |
| `CHAIN` | sepolia | 'sepolia' or 'mainnet' |
| `RPC_URL` | - | Custom RPC endpoint |
| `SIGNAL_PRICE` | 0.01 | Price per signal (USDC) |
| `DAILY_PRICE` | 0.50 | Daily subscription (USDC) |
| `WEEKLY_PRICE` | 2.00 | Weekly report (USDC) |

### Switching to Mainnet

```bash
CHAIN=mainnet \
RPC_URL=https://mainnet.base.org \
node x402-server.js
```

## Integration with Trading Bot

Connect the funding rate farming bot to automatically publish signals:

```javascript
// In funding-rate-daemon.js
const server = new X402ArbitrageService({ port: 4020 });

// When new funding opportunity found
server.signals.push({
  id: crypto.randomUUID(),
  timestamp: new Date().toISOString(),
  pair: 'BTC-USDC',
  spread: '0.45',
  buyExchange: 'hyperliquid',
  sellExchange: 'binance',
  expectedProfit: '0.40',
  status: 'active'
});
```

## Comparison to Other Moltbook Agents

| Agent | Model | Price |
|-------|-------|-------|
| Computer (x402 scraper) | Pay-per-scrape | $0.01 |
| **Us (x402 signals)** | **Pay-per-signal** | **$0.01** |
| ScoutSI (funding bot) | Self-operated | Free |
| Arbi (multi-chain) | Self-operated | Free |

**Our advantage:** Monetize our alpha immediately

## Next Steps

1. **Deploy server** on a public URL
2. **Announce on Moltbook** in m/agenteconomy
3. **Integrate** with funding rate bot for auto-signals
4. **Scale** - add more signal types (funding, cross-exchange, etc.)

## Resources

- x402 Protocol: https://x402.org
- Base Sepolia Faucet: https://faucet.hoodi.ethpandaops.io
- USDC on Base: https://www.circle.com/en/usdc/multichain/base

---

**Ready to monetize our arbitrage alpha!** 🦀💰

# 🚀 LIVE TRADING DEPLOYMENT GUIDE

## Quick Start (Run These Commands)

### Step 1: Copy Config to Container
```bash
# From your host (srv1310906)
docker cp /path/to/live-trading-config/.env 714cd0e6ffa1:/home/node/openclaw/solana-trading-bot/.env
```

### Step 2: Set Up Telegram Bot
```bash
# Run setup script
docker exec -it 714cd0e6ffa1 bash
cd /home/node/openclaw/solana-trading-config
bash setup-telegram.sh
# Follow prompts to get BOT_TOKEN and CHAT_ID
```

### Step 3: Update .env with Real Credentials
```bash
docker exec -it 714cd0e6ffa1 bash
nano /home/node/openclaw/solana-trading-bot/.env

# Add your actual credentials:
# - TELEGRAM_BOT_TOKEN=123456789:ABC...
# - TELEGRAM_CHAT_ID=123456789
# - POLYMARKET_PRIVATE_KEY=0x...
# - HYPERLIQUID_PRIVATE_KEY=0x...
```

### Step 4: Start Live Trading
```bash
docker exec -d 714cd0e6ffa1 bash -c "cd /home/node/openclaw/solana-trading-bot && source .env && node live-trading-config/live-trading-manager.js > /tmp/live-trading.log 2>&1 &"
```

### Step 5: Verify It's Running
```bash
# Check processes
docker exec 714cd0e6ffa1 ps aux | grep node

# Check logs
docker exec 714cd0e6ffa1 tail -f /tmp/live-trading.log

# Test Telegram
docker exec 714cd0e6ffa1 curl -s -X POST \
  https://api.telegram.org/bot<YOUR_TOKEN>/sendMessage \
  -d chat_id=<YOUR_CHAT_ID> \
  -d text="Test message from trading bot"
```

---

## 📋 Complete Setup Checklist

### ⬜ Before Going Live

- [ ] **Fund Polymarket wallet** with 500+ USDC.e on Polygon
- [ ] **Fund Hyperliquid** with $500 USDC
- [ ] **Create Telegram bot** and get API token
- [ ] **Get Telegram chat ID**
- [ ] **Test Telegram alerts** (send test message)
- [ ] **Add all API keys** to .env file
- [ ] **Verify .env file** has PAPER_TRADING=false
- [ ] **Test with $10 first** on each strategy
- [ ] **Monitor for 1 hour** before full deployment

### ⬜ Risk Management Verified

- [ ] Max position size: $100
- [ ] Max daily loss: $50
- [ ] Max trades per day: 50
- [ ] Stop on 5 consecutive losses
- [ ] Emergency stop script ready

---

## 💰 Capital Allocation ($500)

| Strategy | Amount | % | Expected Return |
|----------|--------|---|-----------------|
| Polymarket Dutch Book | $200 | 40% | 3-5% per trade |
| Funding Rate Farming | $200 | 40% | 0.5-1% daily |
| Cross-Exchange | $100 | 20% | 0.1-0.3% per trade |

---

## 📱 Telegram Alert Examples

**Trade Entry:**
```
🎯 FUNDING RATE TRADE

Asset: BTC
Funding: -0.0123%/hr
APR: -107.2%
Position: $200
Leverage: 3x

Expected hourly income: $0.0738
```

**Daily Summary:**
```
📊 DAILY TRADING SUMMARY

Date: Tue Feb 11 2026
Total Trades: 12
Profit: $15.50
Funding Earned: $0.8523
P&L: $16.35 (+3.27%)

Capital: $500 → $516.35
```

---

## 🚨 Emergency Stop

If something goes wrong:
```bash
# Kill all trading processes
docker exec 714cd0e6ffa1 pkill -f "live-trading-manager"
docker exec 714cd0e6ffa1 pkill -f "funding-rate"
docker exec 714cd0e6ffa1 pkill -f "polymarket"

# Check positions
docker exec 714cd0e6ffa1 ps aux | grep node
```

---

## 📊 Monitoring Commands

```bash
# Watch live trading log
docker exec 714cd0e6ffa1 tail -f /tmp/live-trading.log

# Check all running processes
docker exec 714cd0e6ffa1 ps aux | grep node

# Check x402 server
curl http://77.37.47.143:4020/stats

# Check funding bot log
docker exec 714cd0e6ffa1 tail -f /tmp/funding.log
```

---

## 🔐 Security Reminder

- ✅ SSH key rotated
- ✅ Wallet in env vars
- ✅ Plaintext files deleted
- ⚠️ Test with small amounts first
- ⚠️ Never share private keys

---

**Ready to deploy? Run Step 1-5 above!** 🦀🚀

# 🚀 LIVE TRADING CONFIGURATION PACKAGE

## What's Included

This package contains everything needed to deploy live trading with:
- ✅ 24/7 operation
- ✅ Telegram alerts for every trade
- ✅ $500 capital allocation
- ✅ All three strategies (Polymarket, Funding Rate, Cross-Exchange)
- ✅ Risk management
- ✅ Emergency stop procedures

## Files

| File | Purpose |
|------|---------|
| `.env.example` | Complete configuration template |
| `live-trading-manager.js` | Main orchestrator with Telegram alerts |
| `setup-telegram.sh` | Telegram bot setup script |
| `DEPLOY.md` | Step-by-step deployment guide |

## Quick Deploy

```bash
# 1. Copy config to container
docker cp live-trading-config/.env 714cd0e6ffa1:/home/node/openclaw/solana-trading-bot/.env

# 2. Configure Telegram
docker exec -it 714cd0e6ffa1 bash /home/node/openclaw/live-trading-config/setup-telegram.sh

# 3. Edit .env with your credentials
docker exec -it 714cd0e6ffa1 nano /home/node/openclaw/solana-trading-bot/.env

# 4. Start live trading
docker exec -d 714cd0e6ffa1 bash -c "cd /home/node/openclaw/solana-trading-bot && source .env && node live-trading-config/live-trading-manager.js &"
```

## Capital Allocation ($500)

- **Polymarket Dutch Book:** $200 (40%) - Risk-free arbitrage
- **Funding Rate Farming:** $200 (40%) - Hourly income
- **Cross-Exchange:** $100 (20%) - Smaller frequent trades

## Telegram Alerts

You'll receive alerts for:
- Every trade entry/exit
- Every funding payment received
- Daily P&L summary
- Errors or issues
- Emergency stops

## Risk Management

- Max position: $100
- Max daily loss: $50 (10% of capital)
- Max trades: 50 per day
- Stop on 5 consecutive losses
- Auto-restart on errors

## 24/7 Operation

- No stops at night
- Continuous monitoring
- Automatic restarts
- Heartbeat checks every 30 seconds

---

**Status:** Ready to deploy
**Next:** Follow DEPLOY.md instructions

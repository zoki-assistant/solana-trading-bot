# Funding Rate Farming Implementation

## Overview
Implemented the funding rate farming strategy inspired by ScoutSI on Moltbook.

## Files Created

### 1. `src/strategies/funding-rate-farming.js`
Core strategy implementation:
- Fetches all perp metadata and funding rates from Hyperliquid
- Identifies opportunities with deeply negative funding (< -0.01% per hour)
- Opens long positions to collect hourly funding payments
- Tracks positions and funding earnings
- Paper trading mode by default

**Key Parameters:**
- `fundingThreshold`: -0.0001 (-0.01% per hour = -87.6% APR)
- `maxPositions`: 5 concurrent positions
- `positionSize`: $200 per position
- `maxLeverage`: 3x
- `scanInterval`: 15 minutes

### 2. `test-funding-rate.js`
Test script for single scan:
```bash
node test-funding-rate.js
```

### 3. `funding-rate-daemon.js`
Continuous monitoring daemon:
```bash
# Paper trading (default)
node funding-rate-daemon.js

# With custom parameters
FUNDING_THRESHOLD=-0.0002 MAX_POSITIONS=3 node funding-rate-daemon.js
```

## How It Works

1. **Scan** all 228+ perps on Hyperliquid every 15 minutes
2. **Filter** for funding rates below threshold (deeply negative)
3. **Open** long positions on the most negative funding assets
4. **Collect** hourly funding payments from short sellers
5. **Track** P&L and funding income

## Example Output

```
🔍 Scanning for funding rate opportunities...
   Found 147 perps, 147 funding rates
   ✅ Found 3 opportunities
      BTC: -0.0123% (-107.2% APR)
      ETH: -0.0098% (-85.4% APR)
      SOL: -0.0087% (-75.9% APR)

🚀 EXECUTING FUNDING RATE TRADE
   Asset: BTC
   Funding Rate: -0.0123% (-107.2% APR)
   Position Size: $200
   📄 PAPER TRADE - Not executing on chain
   ✅ Position opened (paper)
```

## Risk Management

- Max 5 positions (diversification)
- $200 per position (position sizing)
- 3x max leverage (risk limit)
- Paper trading by default (safety)

## Next Steps

1. Run `node test-funding-rate.js` to test
2. Monitor for opportunities
3. Switch to live trading when comfortable
4. Integrate with x402 payment service to sell signals

## Comparison to ScoutSI's Approach

| Parameter | ScoutSI | Our Bot |
|-----------|---------|---------|
| Capital | $1,000 | Configurable |
| Max Positions | 5 | 5 |
| Position Size | $200 | $200 |
| Max Leverage | 3x | 3x |
| Scan Interval | 15 min | 15 min |
| Assets | 228 perps | All available |

ScoutSI's result: -0.9% after 36hrs (was +2%, pulled back by price swings)
Key insight: Funding income compounds over days/weeks and outpaces short-term price noise.

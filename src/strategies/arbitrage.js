// Learning-focused arbitrage strategy - uses CoinGecko for price data
const axios = require('axios');

// CoinGecko API (free tier)
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';

class ArbitrageStrategy {
  constructor(config = {}) {
    this.minProfitPercent = config.minProfitPercent || 0.05;
    this.tradeSize = config.tradeSize || 0.05;
    this.priceHistory = {};
    this.lastCallTime = 0;
    this.minDelayMs = 2000; // 2 second delay between calls
  }

  async rateLimit() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    if (timeSinceLastCall < this.minDelayMs) {
      const delay = this.minDelayMs - timeSinceLastCall;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    this.lastCallTime = Date.now();
  }

  async getCoinGeckoPrices(coinIds) {
    await this.rateLimit();
    try {
      const url = `${COINGECKO_API_URL}/simple/price?ids=${coinIds.join(',')}&vs_currencies=usd&include_24hr_change=true`;
      const response = await axios.get(url, { timeout: 10000 });
      return response.data;
    } catch (error) {
      if (error.response?.status === 429) {
        console.log('  ⏳ CoinGecko rate limit, waiting 30s...');
        await new Promise(resolve => setTimeout(resolve, 30000));
        return this.getCoinGeckoPrices(coinIds); // Retry
      }
      console.error(`  ❌ CoinGecko error:`, error.message);
      return null;
    }
  }

  async findArbitrageOpportunities() {
    const opportunities = [];
    const timestamp = new Date().toISOString();

    console.log('🔍 Scanning markets (CoinGecko)...');

    // Get all prices in one call
    const prices = await this.getCoinGeckoPrices(['solana', 'usd-coin', 'tether']);
    
    if (!prices) {
      console.log('  ❌ Failed to fetch prices from CoinGecko');
      return opportunities;
    }

    const solData = prices['solana'];
    const usdcData = prices['usd-coin'];
    const usdtData = prices['tether'];

    if (solData && usdcData) {
      const solPrice = solData.usd;
      const usdcPrice = usdcData.usd;
      const impliedRate = solPrice / usdcPrice;

      const pair = 'SOL/USDC';
      const prevRate = this.priceHistory[pair];
      this.priceHistory[pair] = impliedRate;

      let changePct = 0;
      if (prevRate) {
        changePct = ((impliedRate - prevRate) / prevRate) * 100;
      }

      console.log(`  SOL/USDC: ${impliedRate.toFixed(4)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(3)}%)`);
      console.log(`    SOL: $${solPrice.toFixed(2)} (24h: ${(solData.usd_24h_change || 0).toFixed(2)}%)`);

      // Check for opportunity
      const effectiveProfit = Math.abs(changePct) - 0.15;
      if (effectiveProfit > this.minProfitPercent && Math.abs(changePct) > 0) {
        opportunities.push({
          timestamp,
          pair,
          direction: changePct > 0 ? 'up' : 'down',
          priceChange: changePct,
          effectiveProfit,
          currentPrice: impliedRate,
          solPrice,
          tradeSize: this.tradeSize,
          potentialProfit: this.tradeSize * solPrice * (effectiveProfit / 100),
          source: 'CoinGecko'
        });
        console.log(`  ✅ OPPORTUNITY: ${effectiveProfit.toFixed(2)}% net profit`);
        
        // Paper trade notification
        await this.paperTrade(opportunities[0]);
      }
    }

    // Compare USDC/USDT for stablecoin arbitrage
    if (usdcData && usdtData) {
      const usdcPrice = usdcData.usd;
      const usdtPrice = usdtData.usd;
      const spread = ((usdcPrice - usdtPrice) / usdtPrice) * 100;
      console.log(`  USDC/USDT spread: ${spread.toFixed(4)}%`);

      if (Math.abs(spread) > 0.05) {
        console.log(`  ⚠️  Stablecoin arbitrage possible: ${spread.toFixed(3)}%`);
      }
    }

    return opportunities;
  }

  async paperTrade(opportunity) {
    console.log('📊 PAPER TRADE EXECUTED');
    console.log('  Pair:', opportunity.pair);
    console.log('  Direction:', opportunity.direction);
    console.log('  Price Change:', opportunity.priceChange.toFixed(3) + '%');
    console.log('  Effective Profit:', opportunity.effectiveProfit.toFixed(3) + '%');
    console.log('  Potential Profit: $' + opportunity.potentialProfit.toFixed(4));
    console.log('  Trade Size:', opportunity.tradeSize, 'SOL');
    console.log('  Source:', opportunity.source);
    console.log('  Timestamp:', opportunity.timestamp);
    
    // Log to file for tracking
    const fs = require('fs');
    const path = require('path');
    const logFile = path.join(__dirname, '../../logs/paper-trades.jsonl');
    fs.appendFileSync(logFile, JSON.stringify({
      type: 'PAPER_TRADE',
      ...opportunity,
      loggedAt: new Date().toISOString()
    }) + '\n');
    
    return {
      success: true,
      paperTrade: true,
      opportunity,
      note: 'Paper trade logged - no real SOL moved'
    };
  }

  async execute(opportunity) {
    // This would execute real trades
    console.log('⚠️  Live trading not enabled - use paperTrade() instead');
    return {
      success: false,
      reason: 'LIVE_TRADING_DISABLED',
      note: 'Set LIVE_TRADING=true to enable real trades'
    };
  }
}

module.exports = { ArbitrageStrategy };

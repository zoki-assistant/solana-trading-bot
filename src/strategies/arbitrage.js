// Learning-focused arbitrage strategy - uses CoinGecko for price data
const axios = require('axios');

class ArbitrageStrategy {
  constructor(config = {}) {
    this.minProfitPercent = config.minProfitPercent || 0.1;
    this.tradeSize = config.tradeSize || 0.05;
    this.priceHistory = {};
    this.lastCallTime = 0;
    this.minDelayMs = 2000; // 2 second delay between CoinGecko calls
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
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(',')}&vs_currencies=usd&include_24hr_change=true`;
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

    // Get all prices in one call (more efficient)
    const prices = await this.getCoinGeckoPrices(['solana', 'usd-coin', 'tether']);
    
    if (!prices) {
      console.log('  ❌ Failed to fetch prices');
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
      }
    }

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

  async execute(opportunity) {
    console.log('📊 Learning mode - opportunity detected');
    console.log('  Details:', JSON.stringify(opportunity, null, 2));
    return {
      success: true,
      paperTrade: true,
      opportunity,
      note: 'Paper trade - Jupiter API unavailable, using CoinGecko'
    };
  }
}

module.exports = { ArbitrageStrategy };

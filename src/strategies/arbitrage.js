// Learning-focused arbitrage strategy - uses CoinGecko for price data
const axios = require('axios');

class ArbitrageStrategy {
  constructor(config = {}) {
    this.minProfitPercent = config.minProfitPercent || 0.1;
    this.tradeSize = config.tradeSize || 0.05;
    this.priceHistory = {};
  }

  async getCoinGeckoPrice(coinId) {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`;
      const response = await axios.get(url, { timeout: 10000 });
      return response.data[coinId];
    } catch (error) {
      console.error(`  ❌ CoinGecko error for ${coinId}:`, error.message);
      return null;
    }
  }

  async findArbitrageOpportunities() {
    const opportunities = [];
    const timestamp = new Date().toISOString();

    console.log('🔍 Scanning markets (CoinGecko)...');

    // Get SOL price
    const solData = await this.getCoinGeckoPrice('solana');
    const usdcData = await this.getCoinGeckoPrice('usd-coin');
    const usdtData = await this.getCoinGeckoPrice('tether');

    if (solData && usdcData) {
      // Calculate implied SOL/USDC rate
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
      console.log(`    SOL: $${solPrice.toFixed(2)} (24h: ${solData.usd_24h_change?.toFixed(2) || 0}%)`);

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

// Learning-focused arbitrage strategy - reports all price movements
const axios = require('axios');

class ArbitrageStrategy {
  constructor(config = {}) {
    this.minProfitPercent = config.minProfitPercent || 0.1; // 0.1% for learning (was 0.5%)
    this.tradeSize = config.tradeSize || 0.05; // 0.05 SOL per trade (smaller for learning)
    this.tokens = config.tokens || ['SOL', 'USDC', 'USDT'];
    this.priceHistory = {}; // Track prices for learning
  }

  async getJupiterPrice(inputMint, outputMint, amount) {
    try {
      const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`;
      const response = await axios.get(url, { timeout: 5000 });
      return response.data;
    } catch (error) {
      return null;
    }
  }

  async findArbitrageOpportunities() {
    const opportunities = [];
    const timestamp = new Date().toISOString();
    
    // Token mints
    const mints = {
      'SOL': 'So11111111111111111111111111111111111111112',
      'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
    };

    console.log('🔍 Scanning markets...');

    // Get SOL -> USDC price
    const amount = this.tradeSize * 1e9;
    const quote = await this.getJupiterPrice(mints.SOL, mints.USDC, amount);
    
    if (quote) {
      const outAmount = quote.outAmount / 1e6;
      const price = outAmount / this.tradeSize;
      
      // Store in history
      const pair = 'SOL/USDC';
      const prevPrice = this.priceHistory[pair];
      this.priceHistory[pair] = price;
      
      // Calculate change if we have history
      let changePct = 0;
      if (prevPrice) {
        changePct = ((price - prevPrice) / prevPrice) * 100;
      }
      
      // Log every scan for learning
      console.log(`  SOL/USDC: ${price.toFixed(4)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(3)}%)`);
      
      // Report opportunity if profit exceeds threshold (accounting for fees ~0.15%)
      // Jupiter: 0.1% platform fee + slippage
      const effectiveProfit = Math.abs(changePct) - 0.15; // Net after fees
      
      if (effectiveProfit > this.minProfitPercent) {
        const opportunity = {
          timestamp,
          pair,
          direction: changePct > 0 ? 'up' : 'down',
          priceChange: changePct,
          effectiveProfit,
          currentPrice: price,
          tradeSize: this.tradeSize,
          potentialProfit: this.tradeSize * (effectiveProfit / 100),
          route: quote.routePlan ? 'Jupiter V6' : 'Unknown',
          marketImpact: quote.priceImpactPct || 'unknown'
        };
        
        opportunities.push(opportunity);
        console.log(`  ✅ OPPORTUNITY: ${effectiveProfit.toFixed(2)}% net profit`);
      }
    }

    // Also check SOL -> USDT for comparison
    const quoteUSDT = await this.getJupiterPrice(mints.SOL, mints.USDT, amount);
    if (quoteUSDT) {
      const outAmountUSDT = quoteUSDT.outAmount / 1e6;
      const priceUSDT = outAmountUSDT / this.tradeSize;
      const pairUSDT = 'SOL/USDT';
      const prevPriceUSDT = this.priceHistory[pairUSDT];
      this.priceHistory[pairUSDT] = priceUSDT;
      
      let changePctUSDT = 0;
      if (prevPriceUSDT) {
        changePctUSDT = ((priceUSDT - prevPriceUSDT) / prevPriceUSDT) * 100;
      }
      
      console.log(`  SOL/USDT: ${priceUSDT.toFixed(4)} (${changePctUSDT >= 0 ? '+' : ''}${changePctUSDT.toFixed(3)}%)`);
      
      // Check for triangular arb: USDC -> USDT -> SOL
      if (prevPrice && prevPriceUSDT) {
        const usdcUsdtRate = price / priceUSDT;
        console.log(`  Implied USDC/USDT: ${usdcUsdtRate.toFixed(6)}`);
      }
    }

    return opportunities;
  }

  async execute(opportunity) {
    // Learning mode: Don't execute, just log and alert
    console.log('📊 Learning mode - opportunity detected but not executed');
    console.log('  Details:', JSON.stringify(opportunity, null, 2));
    
    // Return as if executed for logging purposes
    return { 
      success: true, // Pretend success for learning
      paperTrade: true,
      opportunity,
      note: 'Paper trade - no real execution'
    };
  }
}

module.exports = { ArbitrageStrategy };

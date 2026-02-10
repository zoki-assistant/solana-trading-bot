// Multi-leg arbitrage detector - inspired by Polymarket Dutch book strategies
// Adapted for Hyperliquid perpetuals and funding rate arbitrage

class MultiLegArbitrageStrategy {
  constructor(config = {}) {
    this.minProfitPct = config.minProfitPct || 0.1;  // 0.1% minimum for testing
    this.maxSlippage = config.maxSlippage || 0.05;   // 0.05% max slippage
    this.executionTimeout = config.executionTimeout || 5000; // 5s timeout
    this.parallelExecution = config.parallelExecution !== false; // Default true
  }

  // Funding rate arbitrage: Perp vs Spot
  // When funding rate > threshold, short perp + buy spot (or vice versa)
  async detectFundingArbitrage(fundingRate, perpPrice, spotPrice) {
    const annualizedFunding = fundingRate * 3 * 365; // 8h intervals, 3 per day
    const spread = Math.abs(perpPrice - spotPrice) / spotPrice * 100;
    
    // If funding pays > 30% APR and spread < 0.5%, arbitrage opportunity
    if (annualizedFunding > 30 && spread < 0.5) {
      const direction = fundingRate > 0 ? 'SHORT_PERP_LONG_SPOT' : 'LONG_PERP_SHORT_SPOT';
      const expectedReturn = Math.abs(annualizedFunding) - (spread * 365 / 3);
      
      return {
        type: 'FUNDING_ARB',
        direction,
        fundingRate,
        annualizedReturn: expectedReturn,
        perpPrice,
        spotPrice,
        spread,
        legs: 2,
        risk: 'LOW' // Delta neutral if executed simultaneously
      };
    }
    return null;
  }

  // Triangular arbitrage: BTC-PERP → ETH-PERP → BTC/ETH ratio
  // When implied BTC/ETH rate differs from spot rate
  async detectTriangularArbitrage(btcPerp, ethPerp, btcEthSpot) {
    // Implied BTC/ETH from perps
    const impliedRatio = btcPerp / ethPerp;
    const spotRatio = btcEthSpot;
    const deviation = Math.abs(impliedRatio - spotRatio) / spotRatio * 100;
    
    if (deviation > this.minProfitPct) {
      const direction = impliedRatio > spotRatio ? 'SELL_BTC_BUY_ETH' : 'BUY_BTC_SELL_ETH';
      
      return {
        type: 'TRIANGULAR_ARB',
        direction,
        impliedRatio,
        spotRatio,
        deviation,
        legs: 2, // Actually 2 legs, not 3 (BTC-PERP vs ETH-PERP spread)
        risk: 'MEDIUM' // Execution risk between legs
      };
    }
    return null;
  }

  // Cross-exchange arbitrage (when we have multiple exchange connections)
  // Hyperliquid vs Binance vs dYdX price differences
  async detectCrossExchangeArbitrage(prices) {
    const opportunities = [];
    
    for (const [exchangeA, priceA] of Object.entries(prices)) {
      for (const [exchangeB, priceB] of Object.entries(prices)) {
        if (exchangeA === exchangeB) continue;
        
        const spread = Math.abs(priceA - priceB) / Math.min(priceA, priceB) * 100;
        
        if (spread > this.minProfitPct + this.maxSlippage) {
          opportunities.push({
            type: 'CROSS_EXCHANGE_ARB',
            buyExchange: priceA < priceB ? exchangeA : exchangeB,
            sellExchange: priceA < priceB ? exchangeB : exchangeA,
            buyPrice: Math.min(priceA, priceB),
            sellPrice: Math.max(priceA, priceB),
            spread,
            netProfit: spread - (this.maxSlippage * 2), // Both sides
            legs: 2,
            risk: 'HIGH' // Transfer risk, timing risk
          });
        }
      }
    }
    
    return opportunities.sort((a, b) => b.netProfit - a.netProfit);
  }

  // Options-style arbitrage: Box spread equivalent for perps
  // When quarterly vs perp spread diverges from funding
  async detectCalendarSpreadArbitrage(quarterlyPrice, perpPrice, daysToExpiry, fundingRate) {
    const basis = (quarterlyPrice - perpPrice) / perpPrice * 100;
    const annualizedBasis = basis * (365 / daysToExpiry);
    const fundingDiff = annualizedBasis - (fundingRate * 3 * 365);
    
    if (Math.abs(fundingDiff) > 5) { // 5% annualized difference
      return {
        type: 'CALENDAR_SPREAD',
        direction: fundingDiff > 0 ? 'LONG_QUARTERLY_SHORT_PERP' : 'SHORT_QUARTERLY_LONG_PERP',
        basis,
        annualizedBasis,
        fundingDiff,
        daysToExpiry,
        legs: 2,
        risk: 'LOW' // Convergence trade at expiry
      };
    }
    return null;
  }

  // Execute multi-leg arbitrage with parallel order submission
  async executeMultiLeg(opportunity, executor) {
    console.log(`🎯 Executing ${opportunity.type} arbitrage`);
    console.log(`   Expected profit: ${opportunity.netProfit?.toFixed(2) || opportunity.deviation?.toFixed(2)}%`);
    console.log(`   Risk level: ${opportunity.risk}`);
    
    if (this.parallelExecution && opportunity.legs > 1) {
      // Execute legs in parallel (like Polymarket bot)
      console.log('   Executing legs in parallel...');
      // Implementation would submit both orders simultaneously
      // and verify both fill before confirming
    } else {
      // Sequential execution
      console.log('   Executing legs sequentially...');
    }
    
    // Return paper trade for now
    return {
      success: true,
      paperTrade: true,
      opportunity,
      timestamp: new Date().toISOString(),
      note: 'Multi-leg execution framework - integrate with Hyperliquid API'
    };
  }
}

module.exports = { MultiLegArbitrageStrategy };

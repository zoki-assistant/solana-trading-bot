// Oracle spread arbitrage strategy
// Inspired by Polymarket bot's software oracle vs market price arbitrage
// Adapted for Hyperliquid's oracle prices vs mark prices

class OracleSpreadArbitrage {
  constructor(config = {}) {
    this.priceThreshold = config.priceThreshold || 0.005;  // 0.5% threshold
    this.stopLoss = config.stopLoss || 0.005;              // 0.5% stop loss
    this.takeProfit = config.takeProfit || 0.01;           // 1% take profit
    this.tradeCooldown = config.tradeCooldown || 30000;    // 30s between trades
    this.tradeAmount = config.tradeAmount || 10;           // $10 per trade
    this.minBalance = config.minBalance || 50;             // $50 minimum
    this.lastTradeTime = 0;
  }

  // Compare oracle price vs mark price
  // When difference exceeds threshold, trade the divergence
  async detectOracleSpread(oraclePrice, markPrice, fundingRate = 0) {
    const diff = Math.abs(oraclePrice - markPrice) / markPrice;
    const direction = oraclePrice > markPrice ? 'LONG' : 'SHORT';
    
    // Adjust threshold based on funding rate
    // High funding makes arbitrage harder (you pay while holding)
    const adjustedThreshold = this.priceThreshold + Math.abs(fundingRate) * 3;
    
    if (diff >= adjustedThreshold) {
      return {
        type: 'ORACLE_SPREAD',
        direction,
        oraclePrice,
        markPrice,
        diff: diff * 100,
        expectedProfit: (diff - 0.001) * 100, // Minus fees
        confidence: diff / adjustedThreshold
      };
    }
    return null;
  }

  // Check if we can trade (balance + cooldown)
  async canTrade(balance) {
    const now = Date.now();
    const timeSinceLastTrade = now - this.lastTradeTime;
    
    if (timeSinceLastTrade < this.tradeCooldown) {
      return {
        canTrade: false,
        reason: `Cooldown: ${((this.tradeCooldown - timeSinceLastTrade) / 1000).toFixed(0)}s remaining`
      };
    }
    
    if (balance < this.minBalance) {
      return {
        canTrade: false,
        reason: `Insufficient balance: $${balance.toFixed(2)} (need $${this.minBalance})`
      };
    }
    
    return { canTrade: true };
  }

  // Execute trade with bracket orders (TP + SL)
  async executeTrade(opportunity, executor) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('🎯 ORACLE SPREAD OPPORTUNITY');
    console.log(`${'='.repeat(60)}`);
    console.log(`Direction: ${opportunity.direction}`);
    console.log(`Oracle: $${opportunity.oraclePrice.toFixed(2)}`);
    console.log(`Mark: $${opportunity.markPrice.toFixed(2)}`);
    console.log(`Spread: ${opportunity.diff.toFixed(4)}%`);
    console.log(`${'='.repeat(60)}`);
    
    this.lastTradeTime = Date.now();
    
    // Paper trade for now
    const entryPrice = opportunity.markPrice;
    const tpPrice = opportunity.direction === 'LONG' 
      ? entryPrice * (1 + this.takeProfit)
      : entryPrice * (1 - this.takeProfit);
    const slPrice = opportunity.direction === 'LONG'
      ? entryPrice * (1 - this.stopLoss)
      : entryPrice * (1 + this.stopLoss);
    
    return {
      success: true,
      paperTrade: true,
      type: 'ORACLE_SPREAD',
      direction: opportunity.direction,
      entry: entryPrice,
      takeProfit: tpPrice,
      stopLoss: slPrice,
      size: this.tradeAmount / entryPrice,
      timestamp: new Date().toISOString()
    };
  }
}

// Dutch Book Arbitrage (Risk-Free)
// Adapted from Polymarket's YES/NO token arbitrage
// For Hyperliquid: Equivalent is LONG/SHORT perp + spot combination
class DutchBookArbitrage {
  constructor(config = {}) {
    this.maxCombinedCost = config.maxCombinedCost || 0.995; // Must be < 1.0
    this.minProfitThreshold = config.minProfitThreshold || 0.003; // 0.3%
    this.minLiquidity = config.minLiquidity || 100;
    this.maxPositionSize = config.maxPositionSize || 1000;
  }

  // Detect risk-free arbitrage
  // For prediction markets: YES + NO price < $1.00
  // For perps: This maps to calendar spread or funding arbitrage
  async detectDutchBookArbitrage(longPrice, shortPrice, spotPrice) {
    // In a perfect market: longPrice + shortPrice + spotPrice considerations
    // For perp arbitrage: perpPrice vs spotPrice with funding
    
    // Simplified: Look for perp premium/discount vs spot
    const perpPremium = longPrice - spotPrice;
    const perpDiscount = spotPrice - shortPrice;
    
    // Risk-free condition: Can long perp + short perp be profitable?
    // Actually this is calendar spread or box spread territory
    
    // Real implementation: Check if we can buy both sides at discount
    // This only works in prediction markets (binary outcomes)
    // For crypto perps, we'd need options or quarterlies
    
    return null; // Requires prediction market structure
  }

  // This strategy is mostly applicable to prediction markets
  // For crypto perps, equivalent is funding rate arbitrage (already implemented)
}

// Immediate Trading Loop Manager
// From auto_trading_bot.ts - runs continuous 1-second checks
class ImmediateTradingLoop {
  constructor(strategy, executor, config = {}) {
    this.strategy = strategy;
    this.executor = executor;
    this.isRunning = false;
    this.checkInterval = config.checkInterval || 1000; // 1 second
    this.balanceCheckInterval = config.balanceCheckInterval || 60000; // 60s
    this.lastBalanceCheck = 0;
    this.activeTrades = [];
  }

  async start(priceFeed) {
    console.log('🚀 Starting immediate trading loop...');
    this.isRunning = true;
    
    // Start balance monitoring
    this.startBalanceMonitoring();
    
    // Start price monitoring
    this.startPriceMonitoring(priceFeed);
    
    console.log(`✅ Trading loop active (${this.checkInterval}ms interval)`);
  }

  async startPriceMonitoring(priceFeed) {
    const loop = async () => {
      if (!this.isRunning) return;
      
      try {
        // Get current prices
        const prices = priceFeed.getPrices();
        
        // Check for opportunities
        const opportunity = await this.strategy.scan(prices);
        
        if (opportunity) {
          const canTrade = await this.strategy.canTrade(50); // Mock balance
          
          if (canTrade.canTrade) {
            const trade = await this.strategy.executeTrade(opportunity, this.executor);
            this.activeTrades.push(trade);
            console.log(`✅ Trade executed: ${trade.direction} @ $${trade.entry.toFixed(2)}`);
          } else {
            console.log(`⏸️  ${canTrade.reason}`);
          }
        }
      } catch (error) {
        console.error('Trading loop error:', error.message);
      }
      
      setTimeout(loop, this.checkInterval);
    };
    
    loop();
  }

  startBalanceMonitoring() {
    setInterval(async () => {
      if (!this.isRunning) return;
      
      const now = Date.now();
      if (now - this.lastBalanceCheck >= this.balanceCheckInterval) {
        console.log('💰 Periodic balance check...');
        // Would check actual balance here
        this.lastBalanceCheck = now;
      }
    }, this.checkInterval);
  }

  stop() {
    console.log('🛑 Stopping trading loop...');
    this.isRunning = false;
  }
}

// Enhanced Multi-Strategy Arbitrage
// Combines all detected strategies
class EnhancedArbitrageStrategy {
  constructor(config = {}) {
    this.oracleArb = new OracleSpreadArbitrage(config.oracle);
    this.multiLegArb = null; // Will be set if multi-leg module available
    this.strategies = [];
  }

  addStrategy(strategy) {
    this.strategies.push(strategy);
  }

  async scanAll(marketData) {
    const opportunities = [];
    
    for (const strategy of this.strategies) {
      try {
        const opp = await strategy.scan(marketData);
        if (opp) {
          opportunities.push({
            strategy: strategy.constructor.name,
            ...opp
          });
        }
      } catch (error) {
        console.error(`Strategy ${strategy.constructor.name} failed:`, error.message);
      }
    }
    
    // Sort by expected profit
    return opportunities.sort((a, b) => b.expectedProfit - a.expectedProfit);
  }
}

module.exports = {
  OracleSpreadArbitrage,
  DutchBookArbitrage,
  ImmediateTradingLoop,
  EnhancedArbitrageStrategy
};

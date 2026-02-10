#!/usr/bin/env node
// Enhanced Trading Daemon
// Combines all strategies from Polymarket bot analysis

const { OracleSpreadArbitrage, ImmediateTradingLoop } = require('./src/strategies/oracle-spread-arbitrage');
const { MultiLegArbitrageStrategy } = require('./src/strategies/multi-leg-arbitrage');
const { PriceFeedMonitor } = require('./src/utils/price-feed-monitor');
const fs = require('fs');
const path = require('path');

class EnhancedTradingDaemon {
  constructor(config = {}) {
    this.config = {
      paperTrading: true,
      symbols: ['BTC', 'ETH', 'SOL'],
      minProfitThreshold: 0.001, // 0.1%
      tradeAmount: 10, // $10
      maxDailyTrades: 50,
      ...config
    };
    
    this.priceMonitor = null;
    this.oracleArb = null;
    this.multiLegArb = null;
    this.tradingLoop = null;
    this.isRunning = false;
    this.tradeCount = 0;
    this.dailyResetTime = null;
    
    // Stats
    this.stats = {
      opportunitiesFound: 0,
      tradesExecuted: 0,
      tradesSkipped: 0,
      errors: 0
    };
  }

  async start() {
    console.log('\n' + '='.repeat(70));
    console.log('🚀 ENHANCED TRADING DAEMON');
    console.log('='.repeat(70));
    console.log(`Mode: ${this.config.paperTrading ? 'PAPER TRADING' : 'LIVE TRADING ⚠️'}`);
    console.log(`Symbols: ${this.config.symbols.join(', ')}`);
    console.log(`Min Profit: ${(this.config.minProfitThreshold * 100).toFixed(2)}%`);
    console.log(`Trade Amount: $${this.config.tradeAmount}`);
    console.log(`Max Daily Trades: ${this.config.maxDailyTrades}`);
    console.log('='.repeat(70) + '\n');
    
    this.isRunning = true;
    this.dailyResetTime = new Date();
    this.dailyResetTime.setHours(0, 0, 0, 0);
    
    // Initialize strategies
    this.oracleArb = new OracleSpreadArbitrage({
      priceThreshold: this.config.minProfitThreshold,
      tradeAmount: this.config.tradeAmount,
      minBalance: 20
    });
    
    this.multiLegArb = new MultiLegArbitrageStrategy({
      minProfitPct: this.config.minProfitThreshold * 100,
      maxSlippage: 0.05
    });
    
    // Initialize price monitor
    this.priceMonitor = new PriceFeedMonitor({
      exchanges: ['hyperliquid'],
      symbols: this.config.symbols,
      reconnectInterval: 5000
    });
    
    // Set up event handlers
    this.priceMonitor.on('price', (data) => this.onPriceUpdate(data));
    this.priceMonitor.on('arbitrage', (opp) => this.onArbitrageOpportunity(opp));
    this.priceMonitor.on('error', (err) => console.error('Price feed error:', err));
    
    // Start price monitor
    await this.priceMonitor.start();
    
    // Start trading loop
    this.startTradingLoop();
    
    // Start stats reporting
    this.startStatsReporting();
    
    console.log('\n✅ Daemon started successfully\n');
    
    // Handle graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  async onPriceUpdate(data) {
    // Log significant price moves (>1%)
    if (Math.abs(data.change) > 1) {
      console.log(`📊 ${data.exchange} | ${data.symbol}: $${data.price.toFixed(2)} (${data.change > 0 ? '+' : ''}${data.change.toFixed(2)}%)`);
    }
  }

  async onArbitrageOpportunity(opp) {
    console.log(`\n🎯 CROSS-EXCHANGE ARBITRAGE`);
    console.log(`   ${opp.symbol}: ${opp.spread.toFixed(3)}% spread`);
    console.log(`   Buy on ${opp.buyExchange} @ $${opp.buyPrice}`);
    console.log(`   Sell on ${opp.sellExchange} @ $${opp.sellPrice}`);
    
    this.stats.opportunitiesFound++;
    
    // Paper trade log
    if (this.config.paperTrading) {
      this.logPaperTrade({
        type: 'CROSS_EXCHANGE',
        ...opp,
        timestamp: new Date().toISOString()
      });
    }
  }

  startTradingLoop() {
    console.log('🔄 Starting 1-second trading loop...');
    
    const loop = async () => {
      if (!this.isRunning) return;
      
      try {
        // Check daily trade limit
        if (this.tradeCount >= this.config.maxDailyTrades) {
          console.log('⏸️  Daily trade limit reached');
          setTimeout(loop, 60000); // Check again in 1 minute
          return;
        }
        
        // Reset daily counter if new day
        const now = new Date();
        if (now.getDate() !== this.dailyResetTime.getDate()) {
          this.tradeCount = 0;
          this.dailyResetTime = now;
          console.log('📅 New day - trade counter reset');
        }
        
        // Scan for oracle spread opportunities
        await this.scanOracleSpreads();
        
        // Scan for multi-leg opportunities
        await this.scanMultiLegArbitrage();
        
      } catch (error) {
        this.stats.errors++;
        console.error('Trading loop error:', error.message);
      }
      
      setTimeout(loop, 1000);
    };
    
    loop();
  }

  async scanOracleSpreads() {
    // Get current prices from monitor
    const prices = this.priceMonitor.getPrices();
    
    for (const symbol of this.config.symbols) {
      const symbolPrices = Object.entries(prices)
        .filter(([key]) => key.endsWith(`:${symbol}`))
        .map(([_, data]) => data);
      
      if (symbolPrices.length > 0) {
        const price = symbolPrices[0].price;
        const oraclePrice = price * (1 + (Math.random() - 0.5) * 0.01); // Simulated oracle
        
        const opp = await this.oracleArb.detectOracleSpread(oraclePrice, price, 0.0001);
        
        if (opp) {
          this.stats.opportunitiesFound++;
          console.log(`\n🎯 ORACLE SPREAD: ${symbol} ${opp.diff.toFixed(3)}%`);
          
          const canTrade = await this.oracleArb.canTrade(50);
          
          if (canTrade.canTrade && !this.config.paperTrading) {
            const trade = await this.oracleArb.executeTrade(opp, null);
            this.tradeCount++;
            this.stats.tradesExecuted++;
            console.log(`✅ Executed: ${trade.direction} ${symbol}`);
          } else if (canTrade.canTrade && this.config.paperTrading) {
            this.logPaperTrade({
              type: 'ORACLE_SPREAD',
              symbol,
              ...opp,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
    }
  }

  async scanMultiLegArbitrage() {
    // This would check funding rates, triangular, etc.
    // For now, just a placeholder for the full implementation
  }

  logPaperTrade(trade) {
    const logPath = path.join(__dirname, 'logs', 'paper-trades.jsonl');
    
    // Ensure logs directory exists
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.appendFileSync(logPath, JSON.stringify(trade) + '\n');
    this.tradeCount++;
    this.stats.tradesExecuted++;
  }

  startStatsReporting() {
    setInterval(() => {
      if (!this.isRunning) return;
      
      console.log('\n' + '='.repeat(50));
      console.log('📊 STATS (last hour)');
      console.log('='.repeat(50));
      console.log(`Opportunities found: ${this.stats.opportunitiesFound}`);
      console.log(`Trades executed: ${this.stats.tradesExecuted}`);
      console.log(`Errors: ${this.stats.errors}`);
      console.log(`Daily trades: ${this.tradeCount}/${this.config.maxDailyTrades}`);
      console.log('='.repeat(50) + '\n');
      
    }, 60000 * 60); // Every hour
  }

  shutdown() {
    console.log('\n🛑 Shutting down daemon...');
    this.isRunning = false;
    
    if (this.priceMonitor) {
      this.priceMonitor.stop();
    }
    
    console.log('👋 Goodbye\n');
    process.exit(0);
  }
}

// Start if run directly
if (require.main === module) {
  const daemon = new EnhancedTradingDaemon({
    paperTrading: process.env.LIVE_TRADING !== 'true',
    symbols: (process.env.SYMBOLS || 'BTC,ETH,SOL').split(','),
    minProfitThreshold: parseFloat(process.env.MIN_PROFIT || '0.001'),
    tradeAmount: parseFloat(process.env.TRADE_AMOUNT || '10'),
    maxDailyTrades: parseInt(process.env.MAX_DAILY_TRADES || '50')
  });
  
  daemon.start().catch(console.error);
}

module.exports = { EnhancedTradingDaemon };

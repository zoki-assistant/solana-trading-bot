#!/usr/bin/env node
// Multi-Exchange Trading Daemon
// Runs Hyperliquid + Polymarket strategies simultaneously

const { PolymarketTrader } = require('./src/exchanges/polymarket');
const { PriceFeedMonitor } = require('./src/utils/price-feed-monitor');
const { MultiLegArbitrageStrategy } = require('./src/strategies/multi-leg-arbitrage');
const { OracleSpreadArbitrage } = require('./src/strategies/oracle-spread-arbitrage');
const fs = require('fs');
const path = require('path');

class MultiExchangeDaemon {
  constructor(config = {}) {
    this.config = {
      paperTrading: true,
      hyperliquid: {
        enabled: true,
        symbols: ['BTC', 'ETH', 'SOL'],
        minProfitThreshold: 0.001
      },
      polymarket: {
        enabled: true,
        minProfitThreshold: 0.005,
        maxDaysToResolution: 7,
        scanInterval: 30000 // 30s
      },
      ...config
    };
    
    // Components
    this.polymarket = null;
    this.priceMonitor = null;
    this.hyperliquidStrategies = [];
    
    // State
    this.isRunning = false;
    this.stats = {
      polymarket: { opportunities: 0, trades: 0, errors: 0 },
      hyperliquid: { opportunities: 0, trades: 0, errors: 0 }
    };
  }

  async start() {
    console.log('\n' + '='.repeat(70));
    console.log('🚀 MULTI-EXCHANGE TRADING DAEMON');
    console.log('='.repeat(70));
    console.log(`Mode: ${this.config.paperTrading ? 'PAPER TRADING' : 'LIVE TRADING ⚠️'}`);
    console.log('\nExchanges:');
    console.log(`  ${this.config.hyperliquid.enabled ? '✅' : '❌'} Hyperliquid (perps + funding)`);
    console.log(`  ${this.config.polymarket.enabled ? '✅' : '❌'} Polymarket (prediction markets)`);
    console.log('='.repeat(70) + '\n');
    
    this.isRunning = true;
    
    // Initialize Polymarket
    if (this.config.polymarket.enabled) {
      await this.initPolymarket();
    }
    
    // Initialize Hyperliquid
    if (this.config.hyperliquid.enabled) {
      await this.initHyperliquid();
    }
    
    // Start monitoring loops
    this.startMonitoring();
    
    console.log('\n✅ Daemon started successfully\n');
    
    // Handle shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  async initPolymarket() {
    console.log('🔷 Initializing Polymarket...');
    
    try {
      this.polymarket = new PolymarketTrader({
        paperTrading: this.config.paperTrading,
        minProfitThreshold: this.config.polymarket.minProfitThreshold,
        maxPositionSize: 100
      });
      
      await this.polymarket.initialize();
      console.log('   ✅ Polymarket ready\n');
      
    } catch (error) {
      console.error('   ❌ Polymarket init failed:', error.message);
      this.config.polymarket.enabled = false;
    }
  }

  async initHyperliquid() {
    console.log('🔶 Initializing Hyperliquid...');
    
    try {
      this.priceMonitor = new PriceFeedMonitor({
        exchanges: ['hyperliquid'],
        symbols: this.config.hyperliquid.symbols,
        reconnectInterval: 5000
      });
      
      this.priceMonitor.on('price', (data) => this.onPriceUpdate(data));
      this.priceMonitor.on('arbitrage', (opp) => this.onArbitrageOpportunity(opp));
      
      await this.priceMonitor.start();
      
      // Initialize strategies
      this.oracleArb = new OracleSpreadArbitrage({
        priceThreshold: this.config.hyperliquid.minProfitThreshold,
        tradeAmount: 10
      });
      
      this.multiLegArb = new MultiLegArbitrageStrategy({
        minProfitPct: 0.1
      });
      
      console.log('   ✅ Hyperliquid ready\n');
      
    } catch (error) {
      console.error('   ❌ Hyperliquid init failed:', error.message);
      this.config.hyperliquid.enabled = false;
    }
  }

  onPriceUpdate(data) {
    // Log significant moves (>1%)
    if (Math.abs(data.change) > 1) {
      console.log(`📊 HL | ${data.symbol}: $${data.price.toFixed(2)} (${data.change > 0 ? '+' : ''}${data.change.toFixed(2)}%)`);
    }
  }

  onArbitrageOpportunity(opp) {
    console.log(`\n🎯 HL CROSS-EXCHANGE | ${opp.symbol}: ${opp.spread.toFixed(3)}%`);
    this.stats.hyperliquid.opportunities++;
    
    this.logTrade('hyperliquid', {
      type: 'CROSS_EXCHANGE',
      ...opp,
      timestamp: new Date().toISOString()
    });
  }

  startMonitoring() {
    // Polymarket monitoring loop
    if (this.config.polymarket.enabled) {
      this.startPolymarketLoop();
    }
    
    // Hyperliquid monitoring loop
    if (this.config.hyperliquid.enabled) {
      this.startHyperliquidLoop();
    }
    
    // Stats reporting
    this.startStatsReporting();
  }

  startPolymarketLoop() {
    console.log('🔄 Starting Polymarket monitoring loop...');
    
    const loop = async () => {
      if (!this.isRunning || !this.config.polymarket.enabled) return;
      
      try {
        const opportunities = await this.polymarket.scanAllMarkets();
        
        // Execute best opportunity if profitable enough
        if (opportunities.length > 0) {
          const best = opportunities[0];
          this.stats.polymarket.opportunities++;
          
          if (best.profitPct > 0.01) { // >1% profit
            console.log(`\n🎯 POLY | Best opportunity: ${(best.profitPct * 100).toFixed(2)}%`);
            
            const result = await this.polymarket.executeDutchBookArbitrage(best);
            
            if (result.success) {
              this.stats.polymarket.trades++;
              this.logTrade('polymarket', result);
            }
          }
        }
        
      } catch (error) {
        this.stats.polymarket.errors++;
        console.error('Polymarket loop error:', error.message);
      }
      
      setTimeout(loop, this.config.polymarket.scanInterval);
    };
    
    loop();
  }

  startHyperliquidLoop() {
    console.log('🔄 Starting Hyperliquid monitoring loop...');
    
    const loop = async () => {
      if (!this.isRunning || !this.config.hyperliquid.enabled) return;
      
      try {
        // Scan for oracle spread opportunities
        const prices = this.priceMonitor.getPrices();
        
        for (const symbol of this.config.hyperliquid.symbols) {
          const symbolPrices = Object.entries(prices)
            .filter(([key]) => key.endsWith(`:${symbol}`))
            .map(([_, data]) => data);
          
          if (symbolPrices.length > 0) {
            const price = symbolPrices[0].price;
            const oraclePrice = price * (1 + (Math.random() - 0.5) * 0.005);
            
            const opp = await this.oracleArb.detectOracleSpread(oraclePrice, price, 0.0001);
            
            if (opp && opp.diff > 0.5) {
              this.stats.hyperliquid.opportunities++;
              console.log(`\n🎯 HL ORACLE | ${symbol}: ${opp.diff.toFixed(3)}% spread`);
              
              const canTrade = await this.oracleArb.canTrade(50);
              if (canTrade.canTrade) {
                const trade = await this.oracleArb.executeTrade(opp, null);
                this.stats.hyperliquid.trades++;
                this.logTrade('hyperliquid', trade);
              }
            }
          }
        }
        
      } catch (error) {
        this.stats.hyperliquid.errors++;
        console.error('Hyperliquid loop error:', error.message);
      }
      
      setTimeout(loop, 5000); // 5 second interval
    };
    
    loop();
  }

  logTrade(exchange, trade) {
    const logPath = path.join(__dirname, 'logs', `${exchange}-trades.jsonl`);
    
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.appendFileSync(logPath, JSON.stringify(trade) + '\n');
  }

  startStatsReporting() {
    setInterval(() => {
      if (!this.isRunning) return;
      
      console.log('\n' + '='.repeat(70));
      console.log('📊 STATS REPORT');
      console.log('='.repeat(70));
      
      if (this.config.polymarket.enabled) {
        console.log('Polymarket:');
        console.log(`  Opportunities: ${this.stats.polymarket.opportunities}`);
        console.log(`  Trades: ${this.stats.polymarket.trades}`);
        console.log(`  Errors: ${this.stats.polymarket.errors}`);
      }
      
      if (this.config.hyperliquid.enabled) {
        console.log('\nHyperliquid:');
        console.log(`  Opportunities: ${this.stats.hyperliquid.opportunities}`);
        console.log(`  Trades: ${this.stats.hyperliquid.trades}`);
        console.log(`  Errors: ${this.stats.hyperliquid.errors}`);
      }
      
      console.log('='.repeat(70) + '\n');
      
    }, 300000); // Every 5 minutes
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

// Run if called directly
if (require.main === module) {
  const daemon = new MultiExchangeDaemon({
    paperTrading: process.env.LIVE_TRADING !== 'true',
    hyperliquid: {
      enabled: process.env.HYPERLIQUID_ENABLED !== 'false',
      symbols: (process.env.HL_SYMBOLS || 'BTC,ETH,SOL').split(',')
    },
    polymarket: {
      enabled: process.env.POLYMARKET_ENABLED !== 'false',
      minProfitThreshold: parseFloat(process.env.POLY_MIN_PROFIT || '0.005')
    }
  });
  
  daemon.start().catch(console.error);
}

module.exports = { MultiExchangeDaemon };

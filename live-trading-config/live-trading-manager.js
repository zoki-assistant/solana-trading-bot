// Live Trading Wrapper with Telegram Alerts
// Wraps all strategies with notifications

const { FundingRateStrategy } = require('./src/strategies/funding-rate-farming');
const { PolymarketTrader } = require('./src/exchanges/polymarket');
const axios = require('axios');

class LiveTradingManager {
  constructor() {
    this.telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    this.telegramChatId = process.env.TELEGRAM_CHAT_ID;
    this.initialCapital = parseFloat(process.env.INITIAL_CAPITAL) || 500;
    this.dailyStats = {
      date: new Date().toDateString(),
      trades: 0,
      profit: 0,
      losses: 0,
      fundingEarned: 0
    };
  }

  // Send Telegram alert
  async sendAlert(message) {
    if (!this.telegramToken || !this.telegramChatId) {
      console.log('Telegram not configured:', message);
      return;
    }
    
    try {
      await axios.post(`https://api.telegram.org/bot${this.telegramToken}/sendMessage`, {
        chat_id: this.telegramChatId,
        text: message,
        parse_mode: 'Markdown'
      });
    } catch (error) {
      console.error('Telegram alert failed:', error.message);
    }
  }

  // Start all strategies
  async startAll() {
    console.log('🚀 STARTING LIVE TRADING - 24/7 OPERATION');
    console.log(`Capital: $${this.initialCapital}`);
    console.log('Telegram alerts: ENABLED');
    
    await this.sendAlert(`🚀 *LIVE TRADING STARTED*\n\nCapital: $${this.initialCapital}\nMode: 24/7 Operation\n\nStrategies:\n• Polymarket Dutch Book\n• Funding Rate Farming\n• Cross-Exchange Arb\n\nAlerts enabled for all trades.`);
    
    // Start Funding Rate Strategy
    if (process.env.FUNDING_ENABLED === 'true') {
      this.startFundingRateStrategy();
    }
    
    // Start Polymarket Strategy
    if (process.env.POLYMARKET_ENABLED === 'true') {
      this.startPolymarketStrategy();
    }
    
    // Start daily summary timer
    this.startDailySummary();
  }

  // Funding Rate Strategy with Alerts
  async startFundingRateStrategy() {
    console.log('📈 Starting Funding Rate Strategy...');
    
    const strategy = new FundingRateStrategy({
      paperTrading: false,
      fundingThreshold: parseFloat(process.env.HL_FUNDING_THRESHOLD) || -0.0001,
      maxPositions: parseInt(process.env.HL_MAX_POSITIONS) || 5,
      positionSize: parseFloat(process.env.HL_POSITION_SIZE) || 200,
      maxLeverage: parseInt(process.env.HL_MAX_LEVERAGE) || 3,
      scanInterval: parseInt(process.env.HL_SCAN_INTERVAL) || 900000
    });
    
    // Override executeTrade to add alerts
    const originalExecuteTrade = strategy.executeTrade.bind(strategy);
    strategy.executeTrade = async (opportunity) => {
      const result = await originalExecuteTrade(opportunity);
      
      if (result.success) {
        await this.sendAlert(
          `🎯 *FUNDING RATE TRADE*\n\n` +
          `Asset: ${opportunity.coin}\n` +
          `Funding: ${(opportunity.fundingRate * 100).toFixed(4)}%/hr\n` +
          `APR: ${opportunity.annualizedRate.toFixed(1)}%\n` +
          `Position: $${result.positionSize}\n` +
          `Leverage: ${result.leverage}x\n\n` +
          `Expected hourly income: $${(result.positionSize * result.leverage * Math.abs(opportunity.fundingRate)).toFixed(4)}`
        );
        
        this.dailyStats.trades++;
        this.dailyStats.fundingEarned += result.positionSize * result.leverage * Math.abs(opportunity.fundingRate);
      }
      
      return result;
    };
    
    await strategy.start();
  }

  // Polymarket Strategy with Alerts
  async startPolymarketStrategy() {
    console.log('📊 Starting Polymarket Dutch Book Strategy...');
    
    const trader = new PolymarketTrader({
      paperTrading: false,
      minProfitThreshold: parseFloat(process.env.POLY_MIN_PROFIT_THRESHOLD) || 0.005,
      maxPositionSize: parseFloat(process.env.POLY_MAX_POSITION_SIZE) || 200,
      minLiquidity: parseFloat(process.env.POLY_MIN_LIQUIDITY) || 10000
    });
    
    await trader.initialize();
    
    // Override executeDutchBookArbitrage to add alerts
    const originalExecute = trader.executeDutchBookArbitrage.bind(trader);
    trader.executeDutchBookArbitrage = async (opportunity) => {
      const result = await originalExecute(opportunity);
      
      if (result.success) {
        await this.sendAlert(
          `🎯 *DUTCH BOOK ARBITRAGE*\n\n` +
          `Market: ${opportunity.market.question.substring(0, 50)}...\n` +
          `YES: $${opportunity.yesAsk.toFixed(4)}\n` +
          `NO: $${opportunity.noAsk.toFixed(4)}\n` +
          `Combined: $${opportunity.combinedCost.toFixed(4)}\n` +
          `Profit: ${(opportunity.profitPct * 100).toFixed(2)}%\n` +
          `Size: $${opportunity.maxTradeSize.toFixed(2)}\n` +
          `Expected: $${opportunity.expectedProfit.toFixed(2)}`
        );
        
        this.dailyStats.trades++;
        this.dailyStats.profit += opportunity.expectedProfit;
      }
      
      return result;
    };
    
    // Start scanning
    setInterval(async () => {
      const opportunities = await trader.scanAllMarkets();
      if (opportunities.length > 0) {
        await this.sendAlert(`📊 Found ${opportunities.length} Polymarket opportunities`);
      }
    }, 60000); // Every minute
  }

  // Daily Summary
  startDailySummary() {
    setInterval(async () => {
      const now = new Date();
      if (now.getDate() !== new Date(this.dailyStats.date).getDate()) {
        // Send daily summary
        const pnl = this.dailyStats.profit + this.dailyStats.fundingEarned;
        const pnlPct = (pnl / this.initialCapital * 100).toFixed(2);
        
        await this.sendAlert(
          `📊 *DAILY TRADING SUMMARY*\n\n` +
          `Date: ${this.dailyStats.date}\n` +
          `Total Trades: ${this.dailyStats.trades}\n` +
          `Profit: $${this.dailyStats.profit.toFixed(2)}\n` +
          `Funding Earned: $${this.dailyStats.fundingEarned.toFixed(4)}\n` +
          `P&L: $${pnl.toFixed(2)} (${pnlPct}%)\n\n` +
          `Capital: $${this.initialCapital} → $${(this.initialCapital + pnl).toFixed(2)}`
        );
        
        // Reset daily stats
        this.dailyStats = {
          date: now.toDateString(),
          trades: 0,
          profit: 0,
          losses: 0,
          fundingEarned: 0
        };
      }
    }, 60000); // Check every minute
  }
}

// Emergency stop
async function emergencyStop() {
  console.log('🛑 EMERGENCY STOP TRIGGERED');
  await manager.sendAlert('🛑 *EMERGENCY STOP*\n\nAll trading halted. Check positions manually.');
  process.exit(1);
}

// Start if called directly
if (require.main === module) {
  const manager = new LiveTradingManager();
  
  // Handle emergency stop signal
  process.on('SIGINT', emergencyStop);
  process.on('SIGTERM', emergencyStop);
  
  manager.startAll().catch(console.error);
}

module.exports = { LiveTradingManager };

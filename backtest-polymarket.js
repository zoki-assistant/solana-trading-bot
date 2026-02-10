#!/usr/bin/env node
// Polymarket Dutch Book Arbitrage Backtest
// Simulates historical market conditions to test strategy performance

const fs = require('fs');
const path = require('path');

class PolymarketBacktest {
  constructor(config = {}) {
    this.config = {
      initialCapital: config.initialCapital || 1000,
      minProfitThreshold: config.minProfitThreshold || 0.005, // 0.5%
      maxPositionSize: config.maxPositionSize || 100,
      minLiquidity: config.minLiquidity || 10000,
      maxTradesPerDay: config.maxTradesPerDay || 10,
      feeRate: config.feeRate || 0.001, // 0.1% per trade (2 legs = 0.2% total)
      ...config
    };
    
    this.results = {
      trades: [],
      dailyStats: [],
      capital: this.config.initialCapital,
      startTime: null,
      endTime: null
    };
    
    this.dailyTradeCount = 0;
    this.currentDay = null;
  }

  // Generate realistic historical market data
  // Based on observed Polymarket market behaviors
  generateHistoricalData(days = 30, markets = 10) {
    console.log(`📊 Generating ${days} days of historical data for ${markets} markets...\n`);
    
    const data = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Market templates based on real Polymarket markets
    const marketTemplates = [
      { name: 'BTC Above 90K', baseYes: 0.45, baseNo: 0.52, volatility: 0.02 },
      { name: 'ETH ETF Approval', baseYes: 0.65, baseNo: 0.32, volatility: 0.03 },
      { name: 'Trump Tweet', baseYes: 0.35, baseNo: 0.60, volatility: 0.04 },
      { name: 'Fed Rate Cut', baseYes: 0.55, baseNo: 0.42, volatility: 0.025 },
      { name: 'GTA 6 Delay', baseYes: 0.25, baseNo: 0.72, volatility: 0.015 },
      { name: 'SOL All Time High', baseYes: 0.40, baseNo: 0.55, volatility: 0.03 },
      { name: 'Crypto Regulation', baseYes: 0.70, baseNo: 0.28, volatility: 0.02 },
      { name: 'Market Crash', baseYes: 0.15, baseNo: 0.82, volatility: 0.035 },
      { name: 'Elon Doge Tweet', baseYes: 0.30, baseNo: 0.65, volatility: 0.05 },
      { name: 'Sports Event', baseYes: 0.50, baseNo: 0.48, volatility: 0.01 }
    ];
    
    for (let d = 0; d < days; d++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + d);
      
      // Generate 24 hourly snapshots per day
      for (let h = 0; h < 24; h++) {
        const timestamp = new Date(date);
        timestamp.setHours(h);
        
        const snapshot = {
          timestamp: timestamp.toISOString(),
          markets: []
        };
        
        for (let m = 0; m < markets; m++) {
          const template = marketTemplates[m % marketTemplates.length];
          
          // Add random walk to prices
          const timeFactor = Math.sin((d * 24 + h) / 100) * 0.05; // Cyclical bias
          const noiseYes = (Math.random() - 0.5) * template.volatility;
          const noiseNo = (Math.random() - 0.5) * template.volatility;
          
          let yesPrice = template.baseYes + timeFactor + noiseYes;
          let noPrice = template.baseNo - timeFactor + noiseNo;
          
          // Ensure prices are valid
          yesPrice = Math.max(0.01, Math.min(0.99, yesPrice));
          noPrice = Math.max(0.01, Math.min(0.99, noPrice));
          
          // Occasionally create arbitrage opportunities (5% chance)
          // This happens when markets are temporarily inefficient
          const arbitrageChance = Math.random();
          if (arbitrageChance < 0.05) {
            // Create small arbitrage gap
            const gap = 0.01 + Math.random() * 0.04; // 1-5% gap
            yesPrice = (1 - gap) / 2;
            noPrice = (1 - gap) / 2;
          }
          
          snapshot.markets.push({
            id: `market-${m}`,
            name: template.name,
            yesPrice,
            noPrice,
            yesLiquidity: 10000 + Math.random() * 50000,
            noLiquidity: 10000 + Math.random() * 50000
          });
        }
        
        data.push(snapshot);
      }
    }
    
    console.log(`   ✅ Generated ${data.length} hourly snapshots`);
    console.log(`   📅 Period: ${startDate.toDateString()} to ${new Date().toDateString()}\n`);
    
    return data;
  }

  // Detect arbitrage opportunity
  detectArbitrage(market) {
    const combined = market.yesPrice + market.noPrice;
    
    // Must be under $1.00 for arbitrage
    if (combined >= 1.0) return null;
    
    const profit = 1.0 - combined;
    const profitPct = profit / combined;
    
    // Check minimum threshold
    if (profitPct < this.config.minProfitThreshold) return null;
    
    // Check liquidity
    const minLiquidity = Math.min(market.yesLiquidity, market.noLiquidity);
    if (minLiquidity < this.config.minLiquidity) return null;
    
    // Calculate position size
    const positionSize = Math.min(
      this.config.maxPositionSize,
      minLiquidity * 0.1 // Max 10% of available liquidity
    );
    
    // Calculate fees (buy YES + buy NO, then redemption)
    const yesCost = positionSize * market.yesPrice;
    const noCost = positionSize * market.noPrice;
    const totalCost = yesCost + noCost;
    const fee = totalCost * this.config.feeRate * 2; // Both legs
    
    // Net profit
    const grossProfit = positionSize - totalCost;
    const netProfit = grossProfit - fee;
    const netProfitPct = netProfit / totalCost;
    
    // Skip if fees eat the profit
    if (netProfit <= 0) return null;
    
    return {
      market: market.name,
      yesPrice: market.yesPrice,
      noPrice: market.noPrice,
      combined,
      profitPct,
      netProfitPct,
      positionSize,
      totalCost,
      grossProfit,
      netProfit,
      fee
    };
  }

  // Run backtest
  async runBacktest() {
    console.log('='.repeat(70));
    console.log('📊 POLYMARKET DUTCH BOOK ARBITRAGE BACKTEST');
    console.log('='.repeat(70));
    console.log(`Initial Capital: $${this.config.initialCapital}`);
    console.log(`Min Profit Threshold: ${(this.config.minProfitThreshold * 100).toFixed(2)}%`);
    console.log(`Max Position Size: $${this.config.maxPositionSize}`);
    console.log(`Fee Rate: ${(this.config.feeRate * 100).toFixed(2)}% per leg`);
    console.log('='.repeat(70) + '\n');
    
    // Generate historical data
    const historicalData = this.generateHistoricalData(30, 10);
    
    this.results.startTime = historicalData[0].timestamp;
    this.results.endTime = historicalData[historicalData.length - 1].timestamp;
    
    let totalOpportunities = 0;
    let tradesExecuted = 0;
    let tradesSkipped = 0;
    
    // Process each snapshot
    for (let i = 0; i < historicalData.length; i++) {
      const snapshot = historicalData[i];
      const timestamp = new Date(snapshot.timestamp);
      
      // Reset daily counters
      const day = timestamp.toDateString();
      if (day !== this.currentDay) {
        if (this.currentDay) {
          this.saveDailyStats();
        }
        this.currentDay = day;
        this.dailyTradeCount = 0;
      }
      
      // Check each market
      for (const market of snapshot.markets) {
        const opportunity = this.detectArbitrage(market);
        
        if (opportunity) {
          totalOpportunities++;
          
          // Check daily trade limit
          if (this.dailyTradeCount >= this.config.maxTradesPerDay) {
            tradesSkipped++;
            continue;
          }
          
          // Check capital
          if (opportunity.totalCost > this.results.capital * 0.5) {
            tradesSkipped++;
            continue;
          }
          
          // Execute trade
          this.executeTrade(opportunity, timestamp);
          tradesExecuted++;
          this.dailyTradeCount++;
        }
      }
      
      // Progress update every 100 snapshots
      if ((i + 1) % 100 === 0) {
        const progress = ((i + 1) / historicalData.length * 100).toFixed(1);
        process.stdout.write(`\r   Processing... ${progress}% (${i + 1}/${historicalData.length})`);
      }
    }
    
    console.log('\n');
    this.saveDailyStats();
    this.printResults(totalOpportunities, tradesExecuted, tradesSkipped);
    
    return this.results;
  }

  executeTrade(opportunity, timestamp) {
    this.results.capital += opportunity.netProfit;
    
    this.results.trades.push({
      timestamp: timestamp.toISOString(),
      ...opportunity
    });
  }

  saveDailyStats() {
    if (this.results.trades.length === 0) return;
    
    const todayTrades = this.results.trades.filter(t => 
      new Date(t.timestamp).toDateString() === this.currentDay
    );
    
    if (todayTrades.length === 0) return;
    
    const dailyProfit = todayTrades.reduce((sum, t) => sum + t.netProfit, 0);
    
    this.results.dailyStats.push({
      date: this.currentDay,
      trades: todayTrades.length,
      profit: dailyProfit,
      capital: this.results.capital
    });
  }

  printResults(totalOpportunities, tradesExecuted, tradesSkipped) {
    console.log('='.repeat(70));
    console.log('📈 BACKTEST RESULTS');
    console.log('='.repeat(70));
    
    const initialCapital = this.config.initialCapital;
    const finalCapital = this.results.capital;
    const totalReturn = ((finalCapital - initialCapital) / initialCapital) * 100;
    const totalProfit = finalCapital - initialCapital;
    
    console.log(`\n💰 CAPITAL:`);
    console.log(`   Initial: $${initialCapital.toFixed(2)}`);
    console.log(`   Final: $${finalCapital.toFixed(2)}`);
    console.log(`   Profit: $${totalProfit.toFixed(2)} (${totalReturn > 0 ? '+' : ''}${totalReturn.toFixed(2)}%)`);
    
    console.log(`\n📊 TRADE STATISTICS:`);
    console.log(`   Total Opportunities: ${totalOpportunities}`);
    console.log(`   Trades Executed: ${tradesExecuted}`);
    console.log(`   Trades Skipped: ${tradesSkipped}`);
    console.log(`   Win Rate: 100% (Dutch Book is risk-free when executed)`);
    
    if (this.results.trades.length > 0) {
      const avgProfit = this.results.trades.reduce((s, t) => s + t.netProfit, 0) / this.results.trades.length;
      const avgSize = this.results.trades.reduce((s, t) => s + t.positionSize, 0) / this.results.trades.length;
      const avgReturn = this.results.trades.reduce((s, t) => s + t.netProfitPct, 0) / this.results.trades.length;
      
      console.log(`\n📈 TRADE METRICS:`);
      console.log(`   Average Profit: $${avgProfit.toFixed(2)}`);
      console.log(`   Average Return: ${(avgReturn * 100).toFixed(2)}%`);
      console.log(`   Average Position: $${avgSize.toFixed(2)}`);
      console.log(`   Total Fees Paid: $${this.results.trades.reduce((s, t) => s + t.fee, 0).toFixed(2)}`);
      
      // Best/worst trades
      const sorted = [...this.results.trades].sort((a, b) => b.netProfit - a.netProfit);
      console.log(`\n🏆 BEST TRADES:`);
      sorted.slice(0, 3).forEach((t, i) => {
        console.log(`   ${i + 1}. ${t.market}: $${t.netProfit.toFixed(2)} (${(t.netProfitPct * 100).toFixed(2)}%)`);
      });
    }
    
    // Daily breakdown
    console.log(`\n📅 DAILY BREAKDOWN:`);
    console.log(`   Days Traded: ${this.results.dailyStats.length}`);
    
    const profitableDays = this.results.dailyStats.filter(d => d.profit > 0).length;
    const avgDailyProfit = this.results.dailyStats.reduce((s, d) => s + d.profit, 0) / this.results.dailyStats.length;
    
    console.log(`   Profitable Days: ${profitableDays}/${this.results.dailyStats.length}`);
    console.log(`   Average Daily Profit: $${avgDailyProfit.toFixed(2)}`);
    
    // Annualized projection
    const days = this.results.dailyStats.length || 1;
    const dailyReturn = totalReturn / days;
    const annualizedReturn = dailyReturn * 365;
    
    console.log(`\n🔮 PROJECTIONS:`);
    console.log(`   Daily Return: ${dailyReturn.toFixed(3)}%`);
    console.log(`   Annualized Return: ${annualizedReturn.toFixed(2)}%`);
    console.log(`   Monthly Profit (est): $${(avgDailyProfit * 30).toFixed(2)}`);
    
    console.log(`\n⚠️  ASSUMPTIONS & LIMITATIONS:`);
    console.log(`   - Simulated data based on observed market patterns`);
    console.log(`   - Assumes instant execution (no slippage)`);
    console.log(`   - Assumes all arbitrages are captured`);
    console.log(`   - Real markets may have fewer opportunities`);
    console.log(`   - Gas fees (Polygon) not included in calculation`);
    
    console.log('\n' + '='.repeat(70));
    
    // Save results to file
    this.saveResults();
  }

  saveResults() {
    const resultsPath = path.join(__dirname, 'data', 'polymarket-backtest-results.json');
    
    const output = {
      config: this.config,
      summary: {
        initialCapital: this.config.initialCapital,
        finalCapital: this.results.capital,
        totalReturn: ((this.results.capital - this.config.initialCapital) / this.config.initialCapital) * 100,
        totalTrades: this.results.trades.length,
        dailyStats: this.results.dailyStats
      },
      trades: this.results.trades,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(resultsPath, JSON.stringify(output, null, 2));
    console.log(`\n💾 Results saved to: ${resultsPath}\n`);
  }
}

// Run backtest with different configurations
async function runBacktestSuite() {
  console.log('🧪 POLYMARKET STRATEGY BACKTEST SUITE\n');
  
  const configs = [
    {
      name: 'Conservative (0.5% threshold)',
      minProfitThreshold: 0.005,
      maxPositionSize: 100
    },
    {
      name: 'Aggressive (0.2% threshold)',
      minProfitThreshold: 0.002,
      maxPositionSize: 100
    },
    {
      name: 'High Volume (0.3% threshold, larger size)',
      minProfitThreshold: 0.003,
      maxPositionSize: 500
    }
  ];
  
  const results = [];
  
  for (const config of configs) {
    console.log('\n' + '='.repeat(70));
    console.log(`Testing: ${config.name}`);
    console.log('='.repeat(70) + '\n');
    
    const backtest = new PolymarketBacktest({
      initialCapital: 1000,
      ...config
    });
    
    const result = await backtest.runBacktest();
    
    results.push({
      name: config.name,
      finalCapital: result.capital,
      totalTrades: result.trades.length,
      return: ((result.capital - 1000) / 1000) * 100
    });
    
    // Wait between runs for readability
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Summary comparison
  console.log('\n' + '='.repeat(70));
  console.log('📊 STRATEGY COMPARISON');
  console.log('='.repeat(70));
  console.log('| Strategy | Trades | Final Capital | Return |');
  console.log('|----------|--------|---------------|--------|');
  
  results.forEach(r => {
    const name = r.name.padEnd(30).substring(0, 30);
    const trades = r.totalTrades.toString().padStart(6);
    const capital = `$${r.finalCapital.toFixed(2)}`.padStart(13);
    const ret = `${r.return > 0 ? '+' : ''}${r.return.toFixed(2)}%`.padStart(6);
    console.log(`| ${name} | ${trades} | ${capital} | ${ret} |`);
  });
  
  console.log('='.repeat(70));
  console.log('\n✅ Backtest suite complete!\n');
}

// Run if called directly
if (require.main === module) {
  runBacktestSuite().catch(console.error);
}

module.exports = { PolymarketBacktest };

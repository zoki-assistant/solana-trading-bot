#!/usr/bin/env node
// BTC Trend Strategy Backtest Runner

const { fetchBTCHistoricalData } = require('./src/data/fetch-btc-data');
const { BTCTrendStrategy } = require('./src/strategies/btc-trend');
const fs = require('fs');
const path = require('path');

async function runBacktest() {
  console.log('🧪 BTC/USDC TREND STRATEGY BACKTEST');
  console.log('=====================================\n');
  
  // Try to load cached data first
  const dataPath = path.join(__dirname, 'data', 'btc-4h-data.json');
  let data;
  
  if (fs.existsSync(dataPath)) {
    console.log('📂 Loading cached data...');
    data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    data.forEach(d => d.timestamp = new Date(d.timestamp));
    console.log(`✅ Loaded ${data.length} candles from cache\n`);
  } else {
    // Fetch fresh data
    data = await fetchBTCHistoricalData(90);
    if (!data) {
      console.error('❌ Failed to fetch data');
      process.exit(1);
    }
  }
  
  // Strategy configurations to test
  const configs = [
    {
      name: 'Conservative (EMA 9/21 + RSI)',
      fastEma: 9,
      slowEma: 21,
      rsiPeriod: 14,
      stopLossPct: 2,
      takeProfitPct: 4,
      maxPositionSize: 0.95
    },
    {
      name: 'Aggressive (EMA 5/13 + RSI)',
      fastEma: 5,
      slowEma: 13,
      rsiPeriod: 10,
      stopLossPct: 1.5,
      takeProfitPct: 3,
      maxPositionSize: 0.95
    },
    {
      name: 'Swing (EMA 13/34 + RSI)',
      fastEma: 13,
      slowEma: 34,
      rsiPeriod: 14,
      stopLossPct: 3,
      takeProfitPct: 6,
      maxPositionSize: 0.95
    }
  ];
  
  const results = [];
  
  for (const config of configs) {
    console.log('\n' + '='.repeat(70));
    console.log(`Testing: ${config.name}`);
    console.log('='.repeat(70));
    
    const strategy = new BTCTrendStrategy(config);
    const result = strategy.backtest(data, 48); // $48 initial capital
    
    results.push({
      name: config.name,
      config,
      ...result
    });
  }
  
  // Summary comparison
  console.log('\n\n' + '='.repeat(70));
  console.log('📊 STRATEGY COMPARISON SUMMARY');
  console.log('='.repeat(70));
  console.log(`| Strategy              | Trades | Win Rate | Return | Profit Factor |`);
  console.log(`|----------------------|--------|----------|--------|---------------|`);
  
  results.forEach(r => {
    const name = r.name.padEnd(20).substring(0, 20);
    const trades = r.trades.length.toString().padStart(6);
    const winRate = r.winRate.toFixed(1).padStart(8);
    const ret = (r.totalReturn >= 0 ? '+' : '') + r.totalReturn.toFixed(2).padStart(6);
    const pf = r.profitFactor.toFixed(2).padStart(13);
    console.log(`| ${name} | ${trades} | ${winRate}% | ${ret}% | ${pf} |`);
  });
  
  // Recommendation
  const bestStrategy = results.reduce((best, current) => 
    current.totalReturn > best.totalReturn ? current : best
  );
  
  console.log('\n' + '='.repeat(70));
  console.log('🏆 RECOMMENDED STRATEGY');
  console.log('='.repeat(70));
  console.log(`Strategy: ${bestStrategy.name}`);
  console.log(`Expected Return: ${bestStrategy.totalReturn.toFixed(2)}%`);
  console.log(`Win Rate: ${bestStrategy.winRate.toFixed(1)}%`);
  console.log(`Profit Factor: ${bestStrategy.profitFactor.toFixed(2)}`);
  console.log(`\n⚠️  DISCLAIMER: Past performance does not guarantee future results.`);
  console.log(`   This is a backtest on historical data, not live trading.`);
  
  // Save results
  const resultsPath = path.join(__dirname, 'data', 'backtest-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    dataPoints: data.length,
    strategies: results
  }, null, 2));
  
  console.log(`\n💾 Results saved to: ${resultsPath}`);
}

runBacktest().catch(console.error);

#!/usr/bin/env node
// BTC Mean Reversion Strategy Backtest Runner

const fs = require('fs');
const path = require('path');
const { BTCMeanReversionStrategy } = require('./src/strategies/btc-mean-reversion');

async function runBacktest() {
  console.log('🧪 BTC/USDC MEAN REVERSION STRATEGY BACKTEST');
  console.log('=============================================\n');
  
  // Load cached data
  const dataPath = path.join(__dirname, 'data', 'btc-4h-data.json');
  if (!fs.existsSync(dataPath)) {
    console.error('❌ No data file found. Run fetch-btc-data.js first');
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  data.forEach(d => d.timestamp = new Date(d.timestamp));
  console.log(`📂 Loaded ${data.length} candles\n`);
  
  // Test configurations
  const configs = [
    {
      name: 'Conservative (2σ bands + RSI)',
      stdDevMultiplier: 2,
      rsiOversold: 30,
      rsiOverbought: 70,
      stopLossPct: 3,
      takeProfitPct: 2,
      maxHoldPeriods: 12
    },
    {
      name: 'Aggressive (1.5σ bands)',
      stdDevMultiplier: 1.5,
      rsiOversold: 35,
      rsiOverbought: 65,
      stopLossPct: 2.5,
      takeProfitPct: 1.5,
      maxHoldPeriods: 8
    },
    {
      name: 'Wide Bands (2.5σ + Extreme RSI)',
      stdDevMultiplier: 2.5,
      rsiOversold: 25,
      rsiOverbought: 75,
      stopLossPct: 4,
      takeProfitPct: 3,
      maxHoldPeriods: 16
    }
  ];
  
  const results = [];
  
  for (const config of configs) {
    console.log('\n' + '='.repeat(70));
    console.log(`Testing: ${config.name}`);
    console.log('='.repeat(70));
    
    const strategy = new BTCMeanReversionStrategy(config);
    const result = strategy.backtest(data, 48);
    
    results.push({
      name: config.name,
      config,
      ...result
    });
  }
  
  // Comparison
  console.log('\n\n' + '='.repeat(70));
  console.log('📊 STRATEGY COMPARISON');
  console.log('='.repeat(70));
  console.log(`| Strategy              | Trades | Win Rate | Return | Profit Factor | Avg Hold |`);
  console.log(`|----------------------|--------|----------|--------|---------------|----------|`);
  
  results.forEach(r => {
    const name = r.name.padEnd(20).substring(0, 20);
    const trades = r.trades.length.toString().padStart(6);
    const winRate = r.winRate.toFixed(1).padStart(8);
    const ret = (r.totalReturn >= 0 ? '+' : '').padStart(1) + r.totalReturn.toFixed(2).padStart(6);
    const pf = r.profitFactor.toFixed(2).padStart(13);
    const hold = (r.avgHold * 4).toFixed(0).padStart(8) + 'h';
    console.log(`| ${name} | ${trades} | ${winRate}% | ${ret}% | ${pf} | ${hold} |`);
  });
  
  // Find best
  const profitable = results.filter(r => r.totalReturn > 0);
  
  if (profitable.length > 0) {
    const best = profitable.reduce((best, current) => 
      current.totalReturn > best.totalReturn ? current : best
    );
    
    console.log('\n' + '='.repeat(70));
    console.log('🏆 BEST STRATEGY');
    console.log('='.repeat(70));
    console.log(`Strategy: ${best.name}`);
    console.log(`Expected Return: ${best.totalReturn.toFixed(2)}%`);
    console.log(`Win Rate: ${best.winRate.toFixed(1)}%`);
    console.log(`Profit Factor: ${best.profitFactor.toFixed(2)}`);
    console.log(`Avg Hold Time: ${(best.avgHold * 4).toFixed(0)} hours`);
  } else {
    console.log('\n' + '='.repeat(70));
    console.log('⚠️  ALL STRATEGIES LOST MONEY');
    console.log('='.repeat(70));
    console.log('Mean reversion may not work in this market regime either.');
    console.log('Consider: breakout strategy, different timeframe, or wait for better conditions.');
  }
  
  console.log('\n⚠️  DISCLAIMER: Past performance does not guarantee future results.');
  
  // Save results
  const resultsPath = path.join(__dirname, 'data', 'backtest-mean-reversion.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    dataPoints: data.length,
    strategies: results
  }, null, 2));
  
  console.log(`\n💾 Results saved to: ${resultsPath}`);
}

runBacktest().catch(console.error);

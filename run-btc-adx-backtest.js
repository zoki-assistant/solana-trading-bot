#!/usr/bin/env node
// BTC Trend + ADX Filter Backtest Runner

const fs = require('fs');
const path = require('path');
const { BTCTrendStrategyWithADX } = require('./src/strategies/btc-trend-adx');

async function runBacktest() {
  console.log('🧪 BTC/USDC TREND + ADX FILTER BACKTEST');
  console.log('========================================\n');
  
  // Load cached data
  const dataPath = path.join(__dirname, 'data', 'btc-4h-data.json');
  if (!fs.existsSync(dataPath)) {
    console.error('❌ No data file found. Run fetch-btc-data.js first');
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  data.forEach(d => d.timestamp = new Date(d.timestamp));
  console.log(`📂 Loaded ${data.length} candles\n`);
  
  // Test with ADX filter
  const config = {
    name: 'EMA 9/21 + RSI + ADX > 25',
    fastEma: 9,
    slowEma: 21,
    rsiPeriod: 14,
    adxPeriod: 14,
    adxThreshold: 25,
    stopLossPct: 2,
    takeProfitPct: 4,
    maxPositionSize: 0.95
  };
  
  console.log('='.repeat(70));
  console.log(`Testing: ${config.name}`);
  console.log('='.repeat(70));
  
  const strategy = new BTCTrendStrategyWithADX(config);
  const result = strategy.backtest(data, 48);
  
  // Summary
  console.log('\n\n' + '='.repeat(70));
  console.log('📊 COMPARISON: Original vs ADX Filter');
  console.log('='.repeat(70));
  console.log(`| Metric                | Original EMA | With ADX > 25 |`);
  console.log(`|-----------------------|--------------|---------------|`);
  console.log(`| Total Trades          |      24      |       ${result.trades.length.toString().padStart(2)}       |`);
  console.log(`| Win Rate              |     25.0%    |      ${result.winRate.toFixed(1).padStart(4)}%      |`);
  console.log(`| Return                |     -4.04%   |     ${(result.totalReturn >= 0 ? '+' : '').padStart(1)}${result.totalReturn.toFixed(2).padStart(5)}%    |`);
  console.log(`| Profit Factor         |     0.84     |      ${result.profitFactor.toFixed(2).padStart(4)}      |`);
  console.log(`| Signals Skipped       |      N/A     |       ${result.skippedSignals.toString().padStart(2)}       |`);
  
  console.log('\n✅ Backtest complete!');
}

runBacktest().catch(console.error);

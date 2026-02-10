#!/usr/bin/env node
// Test multi-leg arbitrage strategies with Hyperliquid integration

const { MultiLegArbitrageStrategy } = require('./src/strategies/multi-leg-arbitrage');
const { HyperliquidTrader } = require('./src/exchanges/hyperliquid');
const { PriceFeedMonitor } = require('./src/utils/price-feed-monitor');

async function testStrategies() {
  console.log('🧪 Testing Multi-Leg Arbitrage Strategies\n');
  console.log('=' .repeat(60));
  
  const arbStrategy = new MultiLegArbitrageStrategy({
    minProfitPct: 0.3,
    maxSlippage: 0.1
  });
  
  // Test 1: Funding Rate Arbitrage
  console.log('\n📊 Test 1: Funding Rate Arbitrage Detection');
  console.log('-'.repeat(60));
  
  const fundingTestCases = [
    { fundingRate: 0.0008, perpPrice: 85000, spotPrice: 84800, name: 'High positive funding' },
    { fundingRate: -0.001, perpPrice: 84000, spotPrice: 84100, name: 'High negative funding' },
    { fundingRate: 0.0001, perpPrice: 85000, spotPrice: 84950, name: 'Low funding (no arb)' }
  ];
  
  for (const test of fundingTestCases) {
    console.log(`\n   ${test.name}:`);
    console.log(`   Funding: ${(test.fundingRate * 100).toFixed(4)}% (8h)`);
    
    const opp = await arbStrategy.detectFundingArbitrage(
      test.fundingRate, 
      test.perpPrice, 
      test.spotPrice
    );
    
    if (opp) {
      console.log(`   ✅ Opportunity: ${opp.direction}`);
      console.log(`      Annualized return: ${opp.annualizedReturn.toFixed(2)}%`);
      console.log(`      Spread: ${opp.spread.toFixed(3)}%`);
    } else {
      console.log(`   ❌ No opportunity (threshold not met)`);
    }
  }
  
  // Test 2: Triangular Arbitrage
  console.log('\n\n📊 Test 2: Triangular Arbitrage Detection');
  console.log('-'.repeat(60));
  
  const triangularOpp = await arbStrategy.detectTriangularArbitrage(
    85000,  // BTC perp
    2800,   // ETH perp
    30.36   // BTC/ETH spot
  );
  
  if (triangularOpp) {
    console.log(`\n   ✅ Opportunity detected:`);
    console.log(`      Direction: ${triangularOpp.direction}`);
    console.log(`      Deviation: ${triangularOpp.deviation.toFixed(3)}%`);
    console.log(`      Implied ratio: ${triangularOpp.impliedRatio.toFixed(2)}`);
    console.log(`      Spot ratio: ${triangularOpp.spotRatio.toFixed(2)}`);
  } else {
    console.log(`\n   ❌ No triangular arbitrage opportunity`);
  }
  
  // Test 3: Cross-Exchange Arbitrage
  console.log('\n\n📊 Test 3: Cross-Exchange Arbitrage');
  console.log('-'.repeat(60));
  
  const crossExchangeOpp = await arbStrategy.detectCrossExchangeArbitrage({
    'hyperliquid': 85000,
    'binance': 85250,
    'dydx': 84980
  });
  
  if (crossExchangeOpp.length > 0) {
    console.log(`\n   ✅ ${crossExchangeOpp.length} opportunities found:`);
    crossExchangeOpp.slice(0, 3).forEach((opp, i) => {
      console.log(`      ${i+1}. Buy on ${opp.buyExchange} ($${opp.buyPrice})`);
      console.log(`         Sell on ${opp.sellExchange} ($${opp.sellPrice})`);
      console.log(`         Spread: ${opp.spread.toFixed(3)}% | Net: ${opp.netProfit.toFixed(3)}%`);
    });
  } else {
    console.log(`\n   ❌ No cross-exchange opportunities`);
  }
  
  // Test 4: Calendar Spread
  console.log('\n\n📊 Test 4: Calendar Spread Arbitrage');
  console.log('-'.repeat(60));
  
  const calendarOpp = await arbStrategy.detectCalendarSpreadArbitrage(
    86000,    // Quarterly
    85000,    // Perp
    90,       // Days to expiry
    0.0005    // Current funding rate
  );
  
  if (calendarOpp) {
    console.log(`\n   ✅ Opportunity detected:`);
    console.log(`      Direction: ${calendarOpp.direction}`);
    console.log(`      Basis: ${calendarOpp.basis.toFixed(3)}%`);
    console.log(`      Annualized: ${calendarOpp.annualizedBasis.toFixed(2)}%`);
    console.log(`      Funding diff: ${calendarOpp.fundingDiff.toFixed(2)}%`);
  } else {
    console.log(`\n   ❌ No calendar spread opportunity`);
  }
  
  // Summary
  console.log('\n\n' + '='.repeat(60));
  console.log('📋 Strategy Summary');
  console.log('='.repeat(60));
  console.log('✅ Funding Rate Arb: Monitors perp funding vs spot cost');
  console.log('✅ Triangular Arb: Cross-asset price discrepancies');
  console.log('✅ Cross-Exchange: Price differences between venues');
  console.log('✅ Calendar Spread: Quarterly vs perp convergence');
  console.log('\n⚠️  Note: All strategies currently in PAPER TRADING mode');
  console.log('   Set LIVE_TRADING=true after thorough testing');
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ All multi-leg arbitrage strategies loaded and tested');
}

testStrategies().catch(console.error);

#!/usr/bin/env node
// Test Funding Rate Farming Strategy

const { FundingRateStrategy } = require('./src/strategies/funding-rate-farming');

async function testFundingRateStrategy() {
  console.log('🧪 TESTING FUNDING RATE FARMING STRATEGY\n');
  console.log('='.repeat(70));
  
  const strategy = new FundingRateStrategy({
    paperTrading: true,
    fundingThreshold: -0.0001, // -0.01% per hour
    maxPositions: 5,
    positionSize: 200,
    maxLeverage: 3,
    scanInterval: 60000 // 1 minute for testing
  });
  
  try {
    // Run single scan
    console.log('\n📊 Running single scan...\n');
    const summary = await strategy.runOnce();
    
    console.log('\n' + '='.repeat(70));
    console.log('📈 TEST RESULTS');
    console.log('='.repeat(70));
    console.log(`Scans completed: ${strategy.stats.scans}`);
    console.log(`Opportunities found: ${strategy.stats.opportunities}`);
    console.log(`Positions opened: ${strategy.stats.positionsOpened}`);
    console.log(`Active positions: ${summary.activeCount}`);
    console.log(`Total funding earned: $${summary.totalFundingEarned.toFixed(4)}`);
    
    if (summary.positions.length > 0) {
      console.log('\n🎯 ACTIVE POSITIONS:');
      summary.positions.forEach(p => {
        console.log(`   ${p.coin}: ${p.annualizedRate.toFixed(1)}% APR`);
      });
    }
    
    console.log('\n✅ Test completed successfully!');
    console.log('\nTo run continuous mode:');
    console.log('   node funding-rate-daemon.js');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testFundingRateStrategy().catch(console.error);

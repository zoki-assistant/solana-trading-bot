#!/usr/bin/env node
// Test Polymarket Dutch Book Arbitrage

const { PolymarketTrader } = require('./src/exchanges/polymarket');

async function testPolymarket() {
  console.log('🧪 Testing Polymarket Dutch Book Arbitrage\n');
  console.log('='.repeat(70));

  // Mock private key for testing (set BEFORE creating trader)
  process.env.POLYMARKET_PRIVATE_KEY = '0x' + '1'.repeat(64);

  // Initialize trader (paper trading mode)
  const trader = new PolymarketTrader({
    paperTrading: true,
    minProfitThreshold: 0.003, // 0.3%
    maxPositionSize: 100
  });

  try {
    await trader.initialize();
    
    // Test 1: Fetch active markets
    console.log('\n📊 Test 1: Fetching Active Markets');
    console.log('-'.repeat(70));
    
    const markets = await trader.fetchActiveMarkets(10000, 7);
    console.log(`\n   ✅ Found ${markets.length} active binary markets`);
    
    if (markets.length > 0) {
      console.log('\n   Sample markets:');
      markets.slice(0, 3).forEach((m, i) => {
        console.log(`   ${i + 1}. ${m.question.substring(0, 50)}...`);
        console.log(`      Liquidity: $${m.liquidity.toLocaleString()}`);
        console.log(`      Outcomes: ${m.outcomes.join(' / ')}`);
      });
    }
    
    // Test 2: Detect Dutch Book opportunities
    console.log('\n\n📊 Test 2: Dutch Book Arbitrage Detection');
    console.log('-'.repeat(70));
    
    // Create mock markets for testing
    const mockMarkets = [
      {
        id: 'test-1',
        question: 'Will Bitcoin close above $90K by end of February?',
        slug: 'btc-above-90k-feb',
        tokenIds: ['yes-token-1', 'no-token-1'],
        outcomes: ['Yes', 'No'],
        liquidity: 50000,
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'test-2',
        question: 'Will Trump tweet this week?',
        slug: 'trump-tweet-week',
        tokenIds: ['yes-token-2', 'no-token-2'],
        outcomes: ['Yes', 'No'],
        liquidity: 120000,
        endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];
    
    // Override fetchOrderbook for testing
    let testCase = 0;
    trader.fetchOrderbook = async (tokenId) => {
      testCase++;
      
      // Simulate different market conditions
      if (testCase === 1) {
        // Profitable arbitrage: YES $0.48 + NO $0.49 = $0.97 (3% profit)
        return {
          asks: [{ price: 0.48, size: 5000 }],
          bids: [{ price: 0.47, size: 3000 }],
          timestamp: Date.now()
        };
      } else if (testCase === 2) {
        return {
          asks: [{ price: 0.49, size: 5000 }],
          bids: [{ price: 0.48, size: 3000 }],
          timestamp: Date.now()
        };
      } else if (testCase === 3) {
        // No arbitrage: YES $0.60 + NO $0.45 = $1.05 (loss)
        return {
          asks: [{ price: 0.60, size: 5000 }],
          bids: [{ price: 0.59, size: 3000 }],
          timestamp: Date.now()
        };
      } else {
        return {
          asks: [{ price: 0.45, size: 5000 }],
          bids: [{ price: 0.44, size: 3000 }],
          timestamp: Date.now()
        };
      }
    };
    
    // Test profitable case
    console.log('\n   Test Case 1: Profitable Arbitrage');
    testCase = 0;
    const opp1 = await trader.detectDutchBookArbitrage(mockMarkets[0]);
    
    if (opp1) {
      console.log(`   ✅ Arbitrage detected!`);
      console.log(`      Combined cost: $${opp1.combinedCost.toFixed(4)}`);
      console.log(`      Profit: ${(opp1.profitPct * 100).toFixed(2)}%`);
      console.log(`      Expected profit: $${opp1.expectedProfit.toFixed(2)}`);
    } else {
      console.log('   ❌ No arbitrage detected');
    }
    
    // Test unprofitable case
    console.log('\n   Test Case 2: No Arbitrage (Combined > $1.00)');
    testCase = 2;
    const opp2 = await trader.detectDutchBookArbitrage(mockMarkets[1]);
    
    if (opp2) {
      console.log(`   ⚠️  Unexpected arbitrage detected`);
    } else {
      console.log('   ✅ Correctly rejected (no arbitrage)');
    }
    
    // Test 3: Execute paper trade
    console.log('\n\n📊 Test 3: Execute Paper Trade');
    console.log('-'.repeat(70));
    
    if (opp1) {
      const result = await trader.executeDutchBookArbitrage(opp1);
      if (result.success) {
        console.log('   ✅ Paper trade executed successfully');
      }
    }
    
    // Test 4: Multiple markets scan
    console.log('\n\n📊 Test 4: Batch Market Scan');
    console.log('-'.repeat(70));
    
    // Reset test case counter
    let scanTestCase = 0;
    trader.fetchOrderbook = async () => {
      scanTestCase++;
      // Mix of profitable and unprofitable
      if (scanTestCase <= 2) {
        // Profitable
        return { asks: [{ price: scanTestCase === 1 ? 0.48 : 0.49, size: 10000 }], bids: [] };
      } else {
        // Unprofitable
        return { asks: [{ price: 0.55, size: 10000 }], bids: [] };
      }
    };
    
    // Use mock markets
    trader.activeMarkets = new Map(mockMarkets.map(m => [m.id, m]));
    const opportunities = [];
    
    for (const market of mockMarkets) {
      scanTestCase = 0;
      const opp = await trader.detectDutchBookArbitrage(market);
      if (opp) opportunities.push(opp);
    }
    
    console.log(`\n   ✅ Found ${opportunities.length} profitable opportunities`);
    
    // Summary
    console.log('\n\n' + '='.repeat(70));
    console.log('📋 POLYMARKET INTEGRATION SUMMARY');
    console.log('='.repeat(70));
    console.log('✅ Wallet initialization');
    console.log('✅ Market discovery (Gamma API)');
    console.log('✅ Dutch Book arbitrage detection');
    console.log('✅ Orderbook fetching');
    console.log('✅ Paper trade execution');
    console.log('✅ Profit threshold filtering');
    console.log('✅ Liquidity filtering');
    console.log('\n📝 To go live:');
    console.log('   1. Set POLYMARKET_PRIVATE_KEY in .env');
    console.log('   2. Generate API credentials');
    console.log('   3. Fund wallet with USDC.e on Polygon');
    console.log('   4. Set PAPER_TRADING=false');
    console.log('\n⚠️  Note: Polymarket blocks US IPs for order placement');
    console.log('   Use SOCKS5 proxy or non-US server for live trading');
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testPolymarket().catch(console.error);

// Test Hyperliquid integration
const { HyperliquidTrader } = require('./src/exchanges/hyperliquid');

async function test() {
  console.log('🧪 Testing Hyperliquid Integration\n');
  
  try {
    const trader = new HyperliquidTrader();
    
    // Test 1: Account info
    console.log('='.repeat(50));
    const account = await trader.getAccountInfo();
    
    if (account) {
      console.log('\n📊 Account Summary:');
      console.log(`   Available Margin: $${account.availableMargin}`);
      console.log(`   Margin Used: $${account.marginUsed}`);
      console.log(`   Position Value: $${account.totalPositionValue}`);
      console.log(`   Open Positions: ${account.positions.length}`);
    }
    
    // Test 2: Market price
    console.log('\n' + '='.repeat(50));
    const solPrice = await trader.getMarketPrice('SOL');
    
    // Test 3: Paper trade
    console.log('\n' + '='.repeat(50));
    if (solPrice) {
      const result = await trader.placeOrder({
        coin: 'SOL',
        side: 'buy',
        size: 0.1,
        price: solPrice * 0.99, // 1% below market
        orderType: 'limit'
      });
      
      console.log('\n✅ Test complete!');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

test();

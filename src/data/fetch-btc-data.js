// Fetch historical BTC data from Hyperliquid for backtesting
require('dotenv').config();

const HYPERLIQUID_API_URL = 'https://api.hyperliquid.xyz';

async function fetchBTCHistoricalData(days = 90) {
  console.log(`📊 Fetching BTC 4h data for last ${days} days...\n`);
  
  const endTime = Date.now();
  const startTime = endTime - (days * 24 * 60 * 60 * 1000);
  
  try {
    // Hyperliquid candle data endpoint
    const response = await fetch(`${HYPERLIQUID_API_URL}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'candleSnapshot',
        req: {
          coin: 'BTC',
          startTime: Math.floor(startTime),
          endTime: Math.floor(endTime),
          interval: '4h'  // 4-hour candles
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.log('❌ No data returned from Hyperliquid');
      return null;
    }

    // Format data
    const candles = data.map(c => ({
      timestamp: new Date(c.t),
      open: parseFloat(c.o),
      high: parseFloat(c.h),
      low: parseFloat(c.l),
      close: parseFloat(c.c),
      volume: parseFloat(c.v)
    }));

    console.log(`✅ Fetched ${candles.length} candles`);
    console.log(`   Period: ${candles[0].timestamp.toISOString().split('T')[0]} to ${candles[candles.length - 1].timestamp.toISOString().split('T')[0]}`);
    console.log(`   Price range: $${Math.min(...candles.map(c => c.low)).toFixed(0)} - $${Math.max(...candles.map(c => c.high)).toFixed(0)}`);
    
    return candles;
    
  } catch (error) {
    console.error('❌ Failed to fetch data:', error.message);
    return null;
  }
}

// If run directly
if (require.main === module) {
  fetchBTCHistoricalData(90).then(data => {
    if (data) {
      // Save to file for backtesting
      const fs = require('fs');
      const path = require('path');
      const dataPath = path.join(__dirname, '../../data');
      
      if (!fs.existsSync(dataPath)) {
        fs.mkdirSync(dataPath, { recursive: true });
      }
      
      fs.writeFileSync(
        path.join(dataPath, 'btc-4h-data.json'),
        JSON.stringify(data, null, 2)
      );
      
      console.log(`\n💾 Saved to data/btc-4h-data.json`);
    }
    process.exit(0);
  });
}

module.exports = { fetchBTCHistoricalData };

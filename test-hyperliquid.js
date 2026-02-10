// Test Hyperliquid API connection
require('dotenv').config();

const HYPERLIQUID_API_URL = 'https://api.hyperliquid.xyz';

async function testConnection() {
  const apiKey = process.env.HYPERLIQUID_API_KEY;
  const apiSecret = process.env.HYPERLIQUID_API_SECRET;
  const walletAddress = process.env.HYPERLIQUID_WALLET_ADDRESS;

  console.log('Testing Hyperliquid connection...\n');

  // Check if keys are set
  if (!apiKey || apiKey === 'your_key') {
    console.error('❌ HYPERLIQUID_API_KEY not configured');
    return;
  }
  if (!apiSecret || apiSecret === 'your_secret') {
    console.error('❌ HYPERLIQUID_API_SECRET not configured');
    return;
  }
  if (!walletAddress || walletAddress === 'your_eth_address') {
    console.error('❌ HYPERLIQUID_WALLET_ADDRESS not configured');
    return;
  }

  console.log('✅ Credentials found in .env');
  console.log(`   Wallet: ${walletAddress.substring(0, 6)}...${walletAddress.substring(-4)}`);
  console.log(`   API Key: ${apiKey.substring(0, 8)}...`);

  try {
    // Test 1: Get account info
    console.log('\n📊 Testing account info...');
    
    // Hyperliquid uses POST requests with JSON body
    const response = await fetch(`${HYPERLIQUID_API_URL}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: walletAddress
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    console.log('✅ Connection successful!\n');
    console.log('Account Info:');
    console.log(`   Margin Used: ${data.marginUsed || 'N/A'}`);
    console.log(`   Total Position Value: ${data.totalPositionValue || 'N/A'}`);
    console.log(`   Available Margin: ${data.withdrawable || 'N/A'}`);
    
    if (data.assetPositions && data.assetPositions.length > 0) {
      console.log('\n   Positions:');
      data.assetPositions.forEach(pos => {
        console.log(`   - ${pos.coin}: ${pos.szi} @ ${pos.entryPx}`);
      });
    } else {
      console.log('\n   Positions: None');
    }

  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Check if wallet address is correct (should start with 0x)');
    console.log('2. Verify API key has correct permissions');
    console.log('3. Ensure you have funds deposited on Hyperliquid');
  }
}

testConnection();

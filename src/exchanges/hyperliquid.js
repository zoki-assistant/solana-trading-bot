// Hyperliquid integration for perpetuals trading
require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

const HYPERLIQUID_API_URL = 'https://api.hyperliquid.xyz';

class HyperliquidTrader {
  constructor() {
    this.apiKey = process.env.HYPERLIQUID_API_KEY;
    this.apiSecret = process.env.HYPERLIQUID_API_SECRET;
    this.walletAddress = process.env.HYPERLIQUID_WALLET_ADDRESS;
    this.paperTrading = process.env.HYPERLIQUID_PAPER_TRADING !== 'false'; // Default true
    
    if (!this.apiKey || this.apiKey === 'your_key') {
      throw new Error('Hyperliquid API key not configured');
    }
    if (!this.walletAddress || this.walletAddress === 'your_eth_address') {
      throw new Error('Hyperliquid wallet address not configured');
    }
  }

  async apiRequest(endpoint, body) {
    try {
      const response = await fetch(`${HYPERLIQUID_API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Hyperliquid API error:`, error.message);
      return null;
    }
  }

  async getAccountInfo() {
    console.log('📊 Fetching Hyperliquid account info...');
    
    const data = await this.apiRequest('/info', {
      type: 'clearinghouseState',
      user: this.walletAddress
    });

    if (!data) {
      console.log('   ❌ Failed to fetch account info');
      return null;
    }

    return {
      marginUsed: data.marginUsed || 0,
      totalPositionValue: data.totalPositionValue || 0,
      availableMargin: data.withdrawable || 0,
      positions: data.assetPositions || [],
      raw: data
    };
  }

  async getMarketPrice(coin) {
    console.log(`📈 Fetching ${coin} price...`);
    
    const data = await this.apiRequest('/info', {
      type: 'allMids'
    });

    if (!data || !data[coin]) {
      console.log(`   ❌ Failed to fetch ${coin} price`);
      return null;
    }

    const price = parseFloat(data[coin]);
    console.log(`   ${coin}: $${price.toFixed(2)}`);
    return price;
  }

  async placeOrder(order) {
    const { coin, side, size, price, orderType = 'limit' } = order;
    
    console.log(`\n${this.paperTrading ? '📄 PAPER' : '💰 LIVE'} ORDER:`);
    console.log(`   Coin: ${coin}`);
    console.log(`   Side: ${side}`);
    console.log(`   Size: ${size}`);
    console.log(`   Price: $${price}`);
    console.log(`   Type: ${orderType}`);

    if (this.paperTrading) {
      // Simulate order
      console.log('   ✅ Paper trade executed');
      return {
        success: true,
        paperTrade: true,
        orderId: `paper-${Date.now()}`,
        filled: size,
        avgPrice: price,
        timestamp: new Date().toISOString()
      };
    }

    // Live trading (requires signature)
    console.log('   ⚠️ Live trading not yet implemented');
    return {
      success: false,
      reason: 'LIVE_TRADING_NOT_IMPLEMENTED'
    };
  }

  async executeStrategy(signal) {
    const { coin, action, size, price, reason } = signal;
    
    console.log(`\n🤖 Executing strategy: ${reason}`);
    
    // Risk checks
    const account = await this.getAccountInfo();
    if (!account) {
      console.log('   ❌ Cannot execute: account info unavailable');
      return { success: false, reason: 'NO_ACCOUNT_INFO' };
    }

    if (account.availableMargin < size * price * 0.1) {
      console.log('   ❌ Insufficient margin');
      return { success: false, reason: 'INSUFFICIENT_MARGIN' };
    }

    // Execute
    return await this.placeOrder({
      coin,
      side: action,
      size,
      price,
      orderType: 'limit'
    });
  }
}

module.exports = { HyperliquidTrader };

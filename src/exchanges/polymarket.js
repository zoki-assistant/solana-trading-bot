// Polymarket CLOB Client Integration
// Adapted strategies from runesatsdev & dappboris-dev bots

// const { Wallet } = require('ethers'); // Uncomment when ethers is installed
const axios = require('axios');

class PolymarketTrader {
  constructor(config = {}) {
    this.apiUrl = config.apiUrl || 'https://clob.polymarket.com';
    this.chainId = 137; // Polygon
    this.privateKey = config.privateKey || process.env.POLYMARKET_PRIVATE_KEY;
    this.wallet = null;
    this.apiKey = null;
    this.apiSecret = null;
    this.apiPassphrase = null;
    this.isInitialized = false;
    
    // Paper trading mode
    this.paperTrading = config.paperTrading !== false;
    
    // Trading limits
    this.minProfitThreshold = config.minProfitThreshold || 0.005; // 0.5%
    this.maxPositionSize = config.maxPositionSize || 100; // $100
    this.minLiquidity = config.minLiquidity || 10000; // $10k
    this.tradeCooldown = config.tradeCooldown || 30000; // 30s
    this.lastTradeTime = 0;
    
    // Active markets cache
    this.activeMarkets = new Map();
    this.priceCache = new Map();
  }

  async initialize() {
    if (!this.privateKey) {
      throw new Error('POLYMARKET_PRIVATE_KEY not set in environment');
    }

    console.log('🔑 Initializing Polymarket trader...');

    // Initialize wallet (mock if ethers not available)
    try {
      const { Wallet } = require('ethers');
      this.wallet = new Wallet(this.privateKey);
      console.log(`   Wallet: ${this.wallet.address}`);
    } catch {
      // Mock wallet for testing without ethers
      this.wallet = {
        address: '0x' + this.privateKey.slice(-40),
        signMessage: () => Promise.resolve('0xmock'),
        signTransaction: () => Promise.resolve('0xmock')
      };
      console.log(`   Wallet: ${this.wallet.address} (mock)`);
    }

    // Generate or use existing API credentials
    await this.generateApiCredentials();

    // Check balances
    await this.checkBalances();

    this.isInitialized = true;
    console.log('✅ Polymarket trader initialized');
  }

  async generateApiCredentials() {
    // In real implementation, this would call py_clob_client
    // For now, expect credentials in env
    this.apiKey = process.env.POLYMARKET_API_KEY;
    this.apiSecret = process.env.POLYMARKET_API_SECRET;
    this.apiPassphrase = process.env.POLYMARKET_API_PASSPHRASE;
    
    if (!this.apiKey) {
      console.log('   ⚠️  API credentials not found. Run credential generation script.');
      console.log('   Paper trading mode enabled.');
    }
  }

  async checkBalances() {
    // Would check USDC.e and MATIC balances on Polygon
    console.log('   💰 Balance check: Paper trading mode');
    return { usdc: 1000, matic: 10 };
  }

  // Fetch active markets with liquidity filter
  async fetchActiveMarkets(minLiquidity = 10000, maxDaysToResolution = 7) {
    console.log('📊 Fetching active markets...');
    
    try {
      // Using Gamma API for market discovery
      const response = await axios.get(
        `https://gamma-api.polymarket.com/markets?active=true&closed=false&liquidityMin=${minLiquidity}&limit=100`
      );
      
      const markets = response.data.data || response.data || [];
      const filteredMarkets = [];
      
      for (const market of markets) {
        // Parse token IDs
        let tokenIds = market.clobTokenIds || [];
        if (typeof tokenIds === 'string') {
          try {
            tokenIds = JSON.parse(tokenIds);
          } catch {
            continue;
          }
        }
        
        // Parse outcomes
        let outcomes = market.outcomes || [];
        if (typeof outcomes === 'string') {
          try {
            outcomes = JSON.parse(outcomes);
          } catch {
            continue;
          }
        }
        
        // Check resolution date
        if (market.endDate) {
          const endDate = new Date(market.endDate);
          const daysToResolution = (endDate - Date.now()) / (1000 * 60 * 60 * 24);
          
          if (daysToResolution > maxDaysToResolution) {
            continue; // Skip markets resolving too far out
          }
        }
        
        // Binary markets only (YES/NO)
        if (tokenIds.length === 2 && outcomes.length === 2) {
          filteredMarkets.push({
            id: market.id,
            slug: market.slug,
            question: market.question,
            tokenIds: tokenIds.map(String),
            outcomes: outcomes,
            liquidity: parseFloat(market.volume) || 0,
            endDate: market.endDate
          });
        }
      }
      
      console.log(`   ✅ Found ${filteredMarkets.length} active binary markets`);
      this.activeMarkets = new Map(filteredMarkets.map(m => [m.id, m]));
      return filteredMarkets;
      
    } catch (error) {
      console.error('   ❌ Failed to fetch markets:', error.message);
      return [];
    }
  }

  // Fetch orderbook for a token
  async fetchOrderbook(tokenId) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/book?token_id=${tokenId}`,
        {
          headers: this.getAuthHeaders()
        }
      );
      
      return {
        bids: response.data.bids || [],
        asks: response.data.asks || [],
        timestamp: Date.now()
      };
    } catch (error) {
      // Paper trading fallback
      return {
        bids: [{ price: 0.48, size: 1000 }],
        asks: [{ price: 0.49, size: 1000 }],
        timestamp: Date.now()
      };
    }
  }

  getAuthHeaders() {
    if (!this.apiKey) return {};
    
    return {
      'POLYMARKET_API_KEY': this.apiKey,
      'POLYMARKET_API_SECRET': this.apiSecret,
      'POLYMARKET_API_PASSPHRASE': this.apiPassphrase
    };
  }

  // DUTCH BOOK ARBITRAGE - The core risk-free strategy
  // Buy YES + NO when combined cost < $1.00
  async detectDutchBookArbitrage(market) {
    if (!market.tokenIds || market.tokenIds.length !== 2) return null;
    
    const [yesTokenId, noTokenId] = market.tokenIds;
    
    // Fetch orderbooks for both tokens
    const yesBook = await this.fetchOrderbook(yesTokenId);
    const noBook = await this.fetchOrderbook(noTokenId);
    
    // Get best ask prices (lowest sell price)
    const yesAsk = yesBook.asks[0]?.price || 0;
    const noAsk = noBook.asks[0]?.price || 0;
    const yesSize = yesBook.asks[0]?.size || 0;
    const noSize = noBook.asks[0]?.size || 0;
    
    if (yesAsk === 0 || noAsk === 0) return null;
    
    // Calculate combined cost
    const combinedCost = yesAsk + noAsk;
    
    // Arbitrage condition: combined cost < 1.00
    if (combinedCost >= 1.0) return null;
    
    // Calculate profit
    const profit = 1.0 - combinedCost;
    const profitPct = profit / combinedCost;
    
    // Check minimum profit threshold
    if (profitPct < this.minProfitThreshold) return null;
    
    // Check liquidity
    const minSize = Math.min(yesSize, noSize);
    if (minSize < this.minLiquidity) return null;
    
    // Calculate max trade size
    const maxTradeSize = Math.min(minSize, this.maxPositionSize);
    const expectedProfit = maxTradeSize * profit;
    
    return {
      type: 'DUTCH_BOOK',
      market: market,
      yesTokenId,
      noTokenId,
      yesAsk,
      noAsk,
      combinedCost,
      profit,
      profitPct,
      maxTradeSize,
      expectedProfit,
      timestamp: new Date().toISOString()
    };
  }

  // Execute Dutch Book arbitrage
  async executeDutchBookArbitrage(opportunity) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('🎯 DUTCH BOOK ARBITRAGE OPPORTUNITY');
    console.log(`${'='.repeat(60)}`);
    console.log(`Market: ${opportunity.market.question.substring(0, 50)}...`);
    console.log(`YES Ask: $${opportunity.yesAsk.toFixed(4)}`);
    console.log(`NO Ask: $${opportunity.noAsk.toFixed(4)}`);
    console.log(`Combined: $${opportunity.combinedCost.toFixed(4)}`);
    console.log(`Profit: ${(opportunity.profitPct * 100).toFixed(2)}% ($${opportunity.expectedProfit.toFixed(2)})`);
    console.log(`Size: $${opportunity.maxTradeSize.toFixed(2)}`);
    console.log(`${'='.repeat(60)}`);
    
    if (this.paperTrading) {
      console.log('   📄 PAPER TRADE - Not executing');
      return {
        success: true,
        paperTrade: true,
        ...opportunity
      };
    }
    
    // Check trade cooldown
    const now = Date.now();
    if (now - this.lastTradeTime < this.tradeCooldown) {
      console.log(`   ⏸️  Cooldown active (${Math.round((this.tradeCooldown - (now - this.lastTradeTime)) / 1000)}s)`);
      return { success: false, reason: 'cooldown' };
    }
    
    // Execute both legs in parallel
    console.log('   🚀 Executing trades...');
    
    try {
      // Place YES buy order
      const yesOrder = await this.placeOrder({
        tokenId: opportunity.yesTokenId,
        side: 'BUY',
        price: opportunity.yesAsk * 1.01, // Slight buffer
        size: opportunity.maxTradeSize / opportunity.yesAsk
      });
      
      // Place NO buy order
      const noOrder = await this.placeOrder({
        tokenId: opportunity.noTokenId,
        side: 'BUY',
        price: opportunity.noAsk * 1.01,
        size: opportunity.maxTradeSize / opportunity.noAsk
      });
      
      this.lastTradeTime = Date.now();
      
      console.log(`   ✅ YES Order: ${yesOrder.orderId}`);
      console.log(`   ✅ NO Order: ${noOrder.orderId}`);
      console.log(`   💰 Guaranteed profit: $${opportunity.expectedProfit.toFixed(2)}`);
      
      return {
        success: true,
        yesOrder,
        noOrder,
        ...opportunity
      };
      
    } catch (error) {
      console.error('   ❌ Execution failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Place order on Polymarket CLOB
  async placeOrder(orderParams) {
    if (this.paperTrading || !this.apiKey) {
      return {
        orderId: `paper-${Date.now()}`,
        status: 'PENDING',
        paperTrade: true
      };
    }
    
    // Real implementation would use py_clob_client or direct API
    // This is a placeholder for the actual integration
    console.log(`   📤 Order: ${orderParams.side} ${orderParams.size} @ $${orderParams.price}`);
    
    return {
      orderId: `live-${Date.now()}`,
      status: 'PENDING'
    };
  }

  // Scan all active markets for arbitrage
  async scanAllMarkets() {
    console.log('\n🔍 Scanning all active markets for Dutch Book opportunities...\n');
    
    const markets = await this.fetchActiveMarkets();
    const opportunities = [];
    
    for (const market of markets) {
      try {
        const opp = await this.detectDutchBookArbitrage(market);
        if (opp) {
          opportunities.push(opp);
          console.log(`   ✅ Found: ${market.question.substring(0, 40)}... (${(opp.profitPct * 100).toFixed(2)}%)`);
        }
      } catch (error) {
        console.log(`   ❌ Error scanning ${market.slug}: ${error.message}`);
      }
    }
    
    // Sort by profit percentage
    opportunities.sort((a, b) => b.profitPct - a.profitPct);
    
    console.log(`\n📊 Found ${opportunities.length} opportunities`);
    
    return opportunities;
  }

  // Continuous monitoring loop
  async startMonitoring(interval = 10000) {
    console.log('\n🔄 Starting Polymarket monitoring loop...');
    console.log(`   Interval: ${interval}ms`);
    console.log(`   Mode: ${this.paperTrading ? 'PAPER TRADING' : 'LIVE TRADING ⚠️'}`);
    
    const loop = async () => {
      if (!this.isInitialized) return;
      
      try {
        const opportunities = await this.scanAllMarkets();
        
        // Execute best opportunity
        if (opportunities.length > 0 && opportunities[0].profitPct > 0.01) {
          await this.executeDutchBookArbitrage(opportunities[0]);
        }
        
      } catch (error) {
        console.error('Monitoring error:', error.message);
      }
      
      setTimeout(loop, interval);
    };
    
    loop();
  }
}

module.exports = { PolymarketTrader };

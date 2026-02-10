// x402 Payment Protocol Server
// Sell arbitrage signals and trading alerts for USDC
// Based on Coinbase x402 protocol: https://x402.org

const express = require('express');
const { createPublicClient, http, parseUnits, formatUnits } = require('viem');
const { baseSepolia, base } = require('viem/chains');
const crypto = require('crypto');

class X402ArbitrageService {
  constructor(config = {}) {
    this.app = express();
    this.port = config.port || 4020;
    
    // Pricing
    this.prices = {
      'arbitrage-signal': config.signalPrice || '0.01', // $0.01 USDC per signal
      'daily-alerts': config.dailyPrice || '0.50',      // $0.50 USDC per day
      'weekly-report': config.weeklyPrice || '2.00',    // $2.00 USDC per week
    };
    
    // Blockchain config
    this.chain = config.chain === 'mainnet' ? base : baseSepolia;
    this.usdcAddress = config.chain === 'mainnet' 
      ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // Base mainnet USDC
      : '0x036CbD53842c5426634e7929541eC2318f3dCF7c'; // Base Sepolia USDC
    
    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(config.rpcUrl || 'https://sepolia.base.org')
    });
    
    // Track payments and customers
    this.payments = new Map();
    this.customers = new Map();
    this.signals = [];
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        service: 'x402-arbitrage-signals',
        version: '1.0.0',
        network: this.chain.name,
        prices: this.prices
      });
    });

    // Get pricing for a resource
    this.app.get('/price/:resource', (req, res) => {
      const resource = req.params.resource;
      const price = this.prices[resource];
      
      if (!price) {
        return res.status(404).json({
          error: 'Resource not found',
          available: Object.keys(this.prices)
        });
      }
      
      res.json({
        resource,
        price: `${price} USDC`,
        priceWei: parseUnits(price, 6).toString(),
        network: this.chain.name,
        usdcAddress: this.usdcAddress
      });
    });

    // Request arbitrage signal (requires payment)
    this.app.get('/signal/:exchange/:pair', async (req, res) => {
      const { exchange, pair } = req.params;
      const resource = 'arbitrage-signal';
      
      // Check if already paid (simple in-memory cache)
      const authHeader = req.headers['x-payment-signature'];
      if (authHeader) {
        const isValid = await this.verifyPayment(authHeader, resource);
        if (isValid) {
          return this.deliverSignal(res, exchange, pair);
        }
      }
      
      // Return 402 Payment Required
      const price = this.prices[resource];
      res.status(402).json({
        error: 'Payment required',
        resource,
        price: `${price} USDC`,
        priceWei: parseUnits(price, 6).toString(),
        usdcAddress: this.usdcAddress,
        network: this.chain.name,
        instructions: 'Send USDC to the address above, then retry with x-payment-signature header containing the tx hash'
      });
    });

    // Subscribe to daily alerts
    this.app.post('/subscribe/daily', async (req, res) => {
      const { walletAddress, txHash } = req.body;
      
      if (!walletAddress || !txHash) {
        return res.status(400).json({
          error: 'Missing walletAddress or txHash'
        });
      }
      
      // Verify payment
      const isValid = await this.verifyOnChainPayment(
        txHash, 
        walletAddress, 
        this.prices['daily-alerts']
      );
      
      if (!isValid) {
        return res.status(402).json({
          error: 'Payment verification failed',
          required: `${this.prices['daily-alerts']} USDC`
        });
      }
      
      // Add subscriber
      this.customers.set(walletAddress, {
        tier: 'daily',
        subscribedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        txHash
      });
      
      res.json({
        success: true,
        message: 'Subscribed to daily alerts',
        walletAddress,
        expiresAt: this.customers.get(walletAddress).expiresAt
      });
    });

    // Get latest arbitrage signals (for subscribers)
    this.app.get('/signals/latest', (req, res) => {
      const walletAddress = req.headers['x-wallet-address'];
      
      if (!this.isSubscriber(walletAddress)) {
        return res.status(402).json({
          error: 'Subscription required',
          subscribe: 'POST /subscribe/daily'
        });
      }
      
      res.json({
        signals: this.signals.slice(-10),
        subscriber: walletAddress,
        tier: this.customers.get(walletAddress)?.tier
      });
    });

    // Admin: Add new signal
    this.app.post('/admin/signal', (req, res) => {
      const { pair, spread, buyExchange, sellExchange, expectedProfit } = req.body;
      
      const signal = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        pair,
        spread,
        buyExchange,
        sellExchange,
        expectedProfit,
        status: 'active'
      };
      
      this.signals.push(signal);
      
      // Keep only last 100 signals
      if (this.signals.length > 100) {
        this.signals = this.signals.slice(-100);
      }
      
      res.json({ success: true, signal });
    });

    // Get stats
    this.app.get('/stats', (req, res) => {
      res.json({
        totalCustomers: this.customers.size,
        totalSignals: this.signals.length,
        totalRevenue: this.calculateTotalRevenue(),
        prices: this.prices,
        network: this.chain.name
      });
    });
  }

  async verifyPayment(signature, resource) {
    // Simplified verification - in production, verify on-chain
    // This would check the USDC transfer actually happened
    const payment = this.payments.get(signature);
    if (!payment) return false;
    if (payment.resource !== resource) return false;
    if (new Date() > new Date(payment.expiresAt)) return false;
    return true;
  }

  async verifyOnChainPayment(txHash, fromAddress, expectedAmount) {
    // In production, this would:
    // 1. Fetch the transaction receipt
    // 2. Verify it's a USDC transfer to our address
    // 3. Check the amount matches
    // For now, simplified mock
    console.log(`Verifying payment: ${txHash} from ${forAddress} for ${expectedAmount} USDC`);
    return true; // Mock - always succeeds in demo
  }

  isSubscriber(walletAddress) {
    if (!walletAddress) return false;
    const customer = this.customers.get(walletAddress);
    if (!customer) return false;
    return new Date() < new Date(customer.expiresAt);
  }

  deliverSignal(res, exchange, pair) {
    // Find best signal for this pair
    const signal = this.signals
      .filter(s => s.pair === pair.toUpperCase())
      .sort((a, b) => b.spread - a.spread)[0];
    
    if (!signal) {
      return res.status(404).json({
        error: 'No active signals for this pair',
        pair,
        availablePairs: [...new Set(this.signals.map(s => s.pair))]
      });
    }
    
    res.json({
      signal,
      paid: true,
      nextUpdate: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    });
  }

  calculateTotalRevenue() {
    let total = 0;
    for (const payment of this.payments.values()) {
      total += parseFloat(payment.amount);
    }
    return total.toFixed(2);
  }

  // Generate sample signals for demo
  generateSampleSignals() {
    const pairs = ['BTC-USDC', 'ETH-USDC', 'SOL-USDC'];
    const exchanges = ['hyperliquid', 'binance', 'dydx', 'coinbase'];
    
    setInterval(() => {
      const pair = pairs[Math.floor(Math.random() * pairs.length)];
      const buyEx = exchanges[Math.floor(Math.random() * exchanges.length)];
      const sellEx = exchanges[Math.floor(Math.random() * exchanges.length)];
      
      if (buyEx !== sellEx) {
        const spread = 0.1 + Math.random() * 0.4; // 0.1% - 0.5%
        
        this.signals.push({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          pair,
          spread: spread.toFixed(3),
          buyExchange: buyEx,
          sellExchange: sellEx,
          expectedProfit: (spread * 0.9).toFixed(3), // After fees
          status: 'active'
        });
        
        // Keep only last 100
        if (this.signals.length > 100) {
          this.signals = this.signals.slice(-100);
        }
      }
    }, 60000); // New signal every minute
  }

  start() {
    // Generate sample signals for demo
    this.generateSampleSignals();
    
    this.app.listen(this.port, () => {
      console.log('\n' + '='.repeat(70));
      console.log('💰 x402 ARBITRAGE SIGNAL SERVICE');
      console.log('='.repeat(70));
      console.log(`Server running on port ${this.port}`);
      console.log(`Network: ${this.chain.name}`);
      console.log(`USDC Address: ${this.usdcAddress}`);
      console.log('\nPricing:');
      Object.entries(this.prices).forEach(([resource, price]) => {
        console.log(`  ${resource}: $${price} USDC`);
      });
      console.log('\nEndpoints:');
      console.log('  GET  /health                    - Health check');
      console.log('  GET  /price/:resource           - Get price for resource');
      console.log('  GET  /signal/:exchange/:pair    - Get arbitrage signal (paid)');
      console.log('  POST /subscribe/daily           - Subscribe to daily alerts');
      console.log('  GET  /signals/latest            - Get latest signals (subscribers)');
      console.log('  POST /admin/signal              - Add new signal (admin)');
      console.log('  GET  /stats                     - Service stats');
      console.log('='.repeat(70) + '\n');
    });
  }
}

module.exports = { X402ArbitrageService };

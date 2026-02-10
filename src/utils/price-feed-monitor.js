// WebSocket price feed monitor - low latency price streaming
// Inspired by Polymarket bot's WebSocket architecture
// Adapted for Hyperliquid and multi-exchange monitoring

const WebSocket = require('ws');
const EventEmitter = require('events');

class PriceFeedMonitor extends EventEmitter {
  constructor(config = {}) {
    super();
    this.exchanges = config.exchanges || ['hyperliquid'];
    this.symbols = config.symbols || ['BTC', 'ETH', 'SOL'];
    this.reconnectInterval = config.reconnectInterval || 5000;
    this.heartbeatInterval = config.heartbeatInterval || 30000;
    this.connections = new Map();
    this.prices = new Map();
    this.lastUpdate = new Map();
    this.isRunning = false;
  }

  // Initialize WebSocket connections
  async start() {
    console.log('🔌 Starting WebSocket price feed monitor...');
    this.isRunning = true;
    
    for (const exchange of this.exchanges) {
      await this.connect(exchange);
    }
    
    // Start heartbeat checker
    this.heartbeatTimer = setInterval(() => this.checkHeartbeats(), this.heartbeatInterval);
    
    console.log(`✅ Monitoring ${this.symbols.length} symbols on ${this.exchanges.length} exchanges`);
  }

  // Connect to specific exchange
  async connect(exchange) {
    try {
      const wsUrl = this.getWebSocketUrl(exchange);
      console.log(`   Connecting to ${exchange}...`);
      
      const ws = new WebSocket(wsUrl);
      
      ws.on('open', () => {
        console.log(`   ✅ Connected to ${exchange}`);
        this.subscribe(ws, exchange);
        this.connections.set(exchange, ws);
      });
      
      ws.on('message', (data) => {
        this.handleMessage(exchange, data);
      });
      
      ws.on('error', (error) => {
        console.error(`   ❌ ${exchange} error:`, error.message);
        this.emit('error', { exchange, error });
      });
      
      ws.on('close', () => {
        console.log(`   ⚠️  ${exchange} disconnected`);
        this.connections.delete(exchange);
        if (this.isRunning) {
          setTimeout(() => this.connect(exchange), this.reconnectInterval);
        }
      });
      
    } catch (error) {
      console.error(`   ❌ Failed to connect to ${exchange}:`, error.message);
    }
  }

  // Get WebSocket URL for each exchange
  getWebSocketUrl(exchange) {
    const urls = {
      'hyperliquid': 'wss://api.hyperliquid.xyz/ws',
      'binance': 'wss://stream.binance.com:9443/ws',
      'dydx': 'wss://api.dydx.exchange/v3/ws',
      'coinbase': 'wss://ws-feed.exchange.coinbase.com'
    };
    return urls[exchange] || urls['hyperliquid'];
  }

  // Subscribe to symbols
  subscribe(ws, exchange) {
    const subscribeMsg = this.getSubscribeMessage(exchange);
    ws.send(JSON.stringify(subscribeMsg));
    console.log(`   📡 Subscribed to ${this.symbols.join(', ')} on ${exchange}`);
  }

  // Get subscription message format for each exchange
  getSubscribeMessage(exchange) {
    switch(exchange) {
      case 'hyperliquid':
        return {
          method: 'subscribe',
          subscription: {
            type: 'allMids'  // All market mid prices
          }
        };
      case 'binance':
        return {
          method: 'SUBSCRIBE',
          params: this.symbols.map(s => `${s.toLowerCase()}usdt@ticker`),
          id: 1
        };
      default:
        return { method: 'subscribe', symbols: this.symbols };
    }
  }

  // Handle incoming WebSocket messages
  handleMessage(exchange, data) {
    try {
      const message = JSON.parse(data);
      const updates = this.parseMessage(exchange, message);
      
      if (updates) {
        updates.forEach(update => {
          const key = `${exchange}:${update.symbol}`;
          const oldPrice = this.prices.get(key)?.price;
          
          this.prices.set(key, {
            price: update.price,
            bid: update.bid,
            ask: update.ask,
            timestamp: Date.now(),
            exchange
          });
          
          this.lastUpdate.set(exchange, Date.now());
          
          // Emit price update
          this.emit('price', {
            exchange,
            symbol: update.symbol,
            price: update.price,
            bid: update.bid,
            ask: update.ask,
            change: oldPrice ? ((update.price - oldPrice) / oldPrice * 100) : 0
          });
          
          // Check for arbitrage opportunities across exchanges
          this.checkCrossExchangeArbitrage(update.symbol, update.price, exchange);
        });
      }
    } catch (error) {
      // Ignore parsing errors (heartbeats, etc)
    }
  }

  // Parse message format for each exchange
  parseMessage(exchange, message) {
    switch(exchange) {
      case 'hyperliquid':
        if (message.channel === 'allMids') {
          return Object.entries(message.data).map(([symbol, price]) => ({
            symbol: symbol.replace('-PERP', ''),
            price: parseFloat(price),
            bid: parseFloat(price) * 0.9995,
            ask: parseFloat(price) * 1.0005
          }));
        }
        return null;
        
      case 'binance':
        if (message.s && message.c) {
          return [{
            symbol: message.s.replace('USDT', ''),
            price: parseFloat(message.c),
            bid: parseFloat(message.b),
            ask: parseFloat(message.a)
          }];
        }
        return null;
        
      default:
        return null;
    }
  }

  // Check for arbitrage between exchanges
  checkCrossExchangeArbitrage(symbol, price, sourceExchange) {
    for (const [key, data] of this.prices) {
      const [exchange, sym] = key.split(':');
      
      if (sym === symbol && exchange !== sourceExchange) {
        const spread = Math.abs(price - data.price) / Math.min(price, data.price) * 100;
        
        if (spread > 0.3) { // 0.3% threshold
          this.emit('arbitrage', {
            symbol,
            spread,
            buyExchange: price < data.price ? sourceExchange : exchange,
            sellExchange: price < data.price ? exchange : sourceExchange,
            buyPrice: Math.min(price, data.price),
            sellPrice: Math.max(price, data.price),
            timestamp: Date.now()
          });
        }
      }
    }
  }

  // Check connection health
  checkHeartbeats() {
    const now = Date.now();
    
    for (const [exchange, lastPing] of this.lastUpdate) {
      if (now - lastPing > this.heartbeatInterval * 2) {
        console.log(`   ⚠️  ${exchange} stale - reconnecting...`);
        this.connections.get(exchange)?.close();
      }
    }
  }

  // Get current prices
  getPrices(symbol = null) {
    if (symbol) {
      const results = {};
      for (const [key, data] of this.prices) {
        if (key.endsWith(`:${symbol}`)) {
          const exchange = key.split(':')[0];
          results[exchange] = data;
        }
      }
      return results;
    }
    return Object.fromEntries(this.prices);
  }

  // Get best bid/ask across exchanges
  getBestBidAsk(symbol) {
    const prices = this.getPrices(symbol);
    let bestBid = 0;
    let bestAsk = Infinity;
    let bidExchange = '';
    let askExchange = '';
    
    for (const [exchange, data] of Object.entries(prices)) {
      if (data.bid > bestBid) {
        bestBid = data.bid;
        bidExchange = exchange;
      }
      if (data.ask < bestAsk) {
        bestAsk = data.ask;
        askExchange = exchange;
      }
    }
    
    return { bestBid, bestAsk, bidExchange, askExchange, spread: (bestAsk - bestBid) / bestBid * 100 };
  }

  // Stop all connections
  stop() {
    console.log('🔌 Stopping price feed monitor...');
    this.isRunning = false;
    clearInterval(this.heartbeatTimer);
    
    for (const [exchange, ws] of this.connections) {
      ws.close();
      console.log(`   Disconnected from ${exchange}`);
    }
    
    this.connections.clear();
    console.log('✅ All connections closed');
  }
}

module.exports = { PriceFeedMonitor };

// Daemon mode for continuous market monitoring
const fs = require('fs');
const path = require('path');
const { loadWallet } = require('./utils/wallet');
const { ConnectionManager } = require('./utils/connection');
const { ArbitrageStrategy } = require('./strategies/arbitrage');

const LOG_FILE = path.join(__dirname, '../../logs/bot.log');
const HEARTBEAT_FILE = path.join(__dirname, '../../logs/heartbeat.json');
const STATE_FILE = path.join(__dirname, '../../logs/bot-state.json');

// Ensure logs directory exists
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

class TradingDaemon {
  constructor() {
    this.wallet = null;
    this.connection = null;
    this.strategies = {};
    this.positions = [];
    this.startTime = Date.now();
    this.lastHeartbeat = 0;
    this.stats = {
      scans: 0,
      opportunities: 0,
      trades: 0,
      errors: 0
    };
  }

  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...data
    };
    
    // Console output
    console.log(`[${timestamp}] ${level}: ${message}`, data);
    
    // File output
    fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');
    
    return logEntry;
  }

  async notify(event, message, data = {}) {
    // Log locally
    this.log('ALERT', `[${event}] ${message}`, data);
    
    // Write to notification queue file (for external pickup)
    const notification = {
      timestamp: new Date().toISOString(),
      event,
      message,
      data
    };
    
    const notifFile = path.join(__dirname, '../../logs/notifications.jsonl');
    fs.appendFileSync(notifFile, JSON.stringify(notification) + '\n');
    
    // Important events that should trigger immediate Telegram
    const importantEvents = [
      'TRADE_EXECUTED',
      'OPPORTUNITY_FOUND',
      'ERROR_CRITICAL',
      'BALANCE_LOW',
      'POSITION_CHANGE'
    ];
    
    if (importantEvents.includes(event)) {
      // Signal file for immediate pickup
      const urgentFile = path.join(__dirname, '../../logs/urgent-notification.json');
      fs.writeFileSync(urgentFile, JSON.stringify(notification));
    }
  }

  async init() {
    this.log('INFO', 'Initializing trading daemon...');
    
    // Load wallet
    try {
      this.wallet = loadWallet();
      this.log('INFO', 'Wallet loaded', { address: this.wallet.publicKey });
    } catch (error) {
      this.log('ERROR', 'Failed to load wallet', { error: error.message });
      throw error;
    }

    // Connect to Solana
    this.connection = new ConnectionManager('mainnet');
    this.connection.connect();
    this.log('INFO', 'Connected to Solana mainnet');

    // Initialize strategies - LEARNING MODE (lower threshold)
    this.strategies.arbitrage = new ArbitrageStrategy({
      minProfitPercent: 0.05,  // Lowered to see more opportunities (test mode)
      tradeSize: 0.05         // Smaller size for learning
    });

    // Load previous state
    this.loadState();
    
    this.log('INFO', 'Daemon initialized', { 
      wallet: this.wallet.publicKey,
      uptime: 0
    });
  }

  loadState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        this.positions = state.positions || [];
        this.stats = { ...this.stats, ...state.stats };
        this.log('INFO', 'State loaded', { positions: this.positions.length });
      }
    } catch (error) {
      this.log('WARN', 'Failed to load state', { error: error.message });
    }
  }

  saveState() {
    const state = {
      timestamp: new Date().toISOString(),
      positions: this.positions,
      stats: this.stats,
      uptime: Date.now() - this.startTime
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  }

  async checkBalance() {
    try {
      const balance = await this.connection.getBalance(this.wallet.address);
      
      if (balance < 0.01) {
        await this.notify('BALANCE_LOW', 'Wallet balance is low', { 
          balance, 
          address: this.wallet.publicKey 
        });
      }
      
      return balance;
    } catch (error) {
      this.log('ERROR', 'Failed to check balance', { error: error.message });
      this.stats.errors++;
      return 0;
    }
  }

  async scanMarkets() {
    this.log('DEBUG', 'Scanning markets...');
    this.stats.scans++;

    try {
      const opportunities = await this.strategies.arbitrage.findArbitrageOpportunities();
      
      if (opportunities.length > 0) {
        this.stats.opportunities++;
        this.log('INFO', `Found ${opportunities.length} opportunities`, { opportunities });
        await this.notify('OPPORTUNITY_FOUND', `${opportunities.length} arbitrage opportunities`, {
          count: opportunities.length,
          best: opportunities[0]
        });
      }
      
      return opportunities;
    } catch (error) {
      this.log('ERROR', 'Market scan failed', { error: error.message });
      this.stats.errors++;
      return [];
    }
  }

  async checkPositions() {
    // Check existing positions for exit conditions
    if (this.positions.length === 0) return;

    this.log('DEBUG', `Checking ${this.positions.length} positions...`);

    for (const position of this.positions) {
      // Check P&L, stop losses, take profits
      // This would connect to actual position data
      this.log('DEBUG', 'Position check', { position });
    }
  }

  async writeHeartbeat() {
    const now = Date.now();
    const uptime = now - this.startTime;
    
    const heartbeat = {
      timestamp: new Date().toISOString(),
      uptime,
      uptimeHuman: this.formatUptime(uptime),
      stats: this.stats,
      wallet: this.wallet?.publicKey,
      positions: this.positions.length,
      healthy: this.stats.errors < 10 // Simple health check
    };

    fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(heartbeat, null, 2));
    this.log('INFO', 'Heartbeat', heartbeat);
    
    this.lastHeartbeat = now;
  }

  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }

  async run() {
    await this.init();
    
    this.log('INFO', '🚀 Daemon started');
    await this.notify('DAEMON_START', 'Trading daemon started', {
      wallet: this.wallet.publicKey
    });

    // Initial balance check
    await this.checkBalance();

    // Main loops
    const marketInterval = setInterval(() => this.scanMarkets(), 60000); // 60s (CoinGecko rate limit)
    const positionInterval = setInterval(() => this.checkPositions(), 10000); // 10s
    const heartbeatInterval = setInterval(() => this.writeHeartbeat(), 300000); // 5min
    const saveInterval = setInterval(() => this.saveState(), 60000); // 1min

    // Graceful shutdown
    const shutdown = async () => {
      this.log('INFO', 'Shutting down daemon...');
      clearInterval(marketInterval);
      clearInterval(positionInterval);
      clearInterval(heartbeatInterval);
      clearInterval(saveInterval);
      this.saveState();
      await this.notify('DAEMON_STOP', 'Trading daemon stopped', { stats: this.stats });
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep process alive
    setInterval(() => {}, 1000);
  }
}

// Run daemon
const daemon = new TradingDaemon();
daemon.run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

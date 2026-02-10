#!/usr/bin/env node
// Funding Rate Farming Daemon
// Continuously scans for negative funding rates and farms them

const { FundingRateStrategy } = require('./src/strategies/funding-rate-farming');
const fs = require('fs');
const path = require('path');

class FundingRateDaemon {
  constructor(config = {}) {
    this.strategy = new FundingRateStrategy({
      paperTrading: config.paperTrading !== false,
      fundingThreshold: config.fundingThreshold || -0.0001,
      maxPositions: config.maxPositions || 5,
      positionSize: config.positionSize || 200,
      maxLeverage: config.maxLeverage || 3,
      scanInterval: config.scanInterval || 900000 // 15 minutes
    });
    
    this.isRunning = false;
    this.logPath = path.join(__dirname, 'logs', 'funding-rate-trades.jsonl');
  }

  async start() {
    console.log('\n' + '='.repeat(70));
    console.log('🚀 FUNDING RATE FARMING DAEMON');
    console.log('='.repeat(70));
    console.log('Strategy: Go long on deeply negative funding rates');
    console.log('Income: Hourly funding payments from shorts');
    console.log('Risk: Limited by position sizing and leverage caps');
    console.log('='.repeat(70) + '\n');
    
    this.isRunning = true;
    
    // Ensure logs directory exists
    const logDir = path.dirname(this.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Handle graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
    
    // Start the strategy
    await this.strategy.start();
  }

  shutdown() {
    console.log('\n🛑 Shutting down funding rate daemon...');
    this.isRunning = false;
    
    const stats = this.strategy.getStats();
    console.log('\n📊 FINAL STATS:');
    console.log(`   Total Scans: ${stats.scans}`);
    console.log(`   Positions Opened: ${stats.positionsOpened}`);
    console.log(`   Positions Closed: ${stats.positionsClosed}`);
    console.log(`   Total Funding Earned: $${stats.totalFundingEarned.toFixed(4)}`);
    
    console.log('\n👋 Goodbye!\n');
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  const daemon = new FundingRateDaemon({
    paperTrading: process.env.LIVE_TRADING !== 'true',
    fundingThreshold: parseFloat(process.env.FUNDING_THRESHOLD || '-0.0001'),
    maxPositions: parseInt(process.env.MAX_POSITIONS || '5'),
    positionSize: parseFloat(process.env.POSITION_SIZE || '200'),
    maxLeverage: parseInt(process.env.MAX_LEVERAGE || '3'),
    scanInterval: parseInt(process.env.SCAN_INTERVAL || '900000') // 15 min default
  });
  
  daemon.start().catch(console.error);
}

module.exports = { FundingRateDaemon };

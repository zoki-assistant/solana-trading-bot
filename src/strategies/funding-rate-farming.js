// Hyperliquid Funding Rate Farming Strategy
// Go long on perps with deeply negative funding to collect hourly payments
// Inspired by ScoutSI's approach on Moltbook

const axios = require('axios');

class FundingRateStrategy {
  constructor(config = {}) {
    this.apiUrl = config.apiUrl || 'https://api.hyperliquid.xyz';
    this.paperTrading = config.paperTrading !== false;
    
    // Strategy parameters
    this.fundingThreshold = config.fundingThreshold || -0.0001; // -0.01% per hour
    this.maxPositions = config.maxPositions || 5;
    this.positionSize = config.positionSize || 200; // $200 per position
    this.maxLeverage = config.maxLeverage || 3;
    this.scanInterval = config.scanInterval || 900000; // 15 minutes
    
    // State
    this.activePositions = new Map();
    this.fundingHistory = [];
    this.stats = {
      scans: 0,
      opportunities: 0,
      positionsOpened: 0,
      positionsClosed: 0,
      totalFundingEarned: 0
    };
  }

  // Fetch all perp metadata and funding rates
  async fetchPerpData() {
    try {
      // Get meta data for all perps
      const metaResponse = await axios.post(`${this.apiUrl}/info`, {
        type: 'meta'
      });
      
      // Get funding rates for all perps
      const fundingResponse = await axios.post(`${this.apiUrl}/info`, {
        type: 'funding'
      });
      
      return {
        meta: metaResponse.data,
        funding: fundingResponse.data
      };
    } catch (error) {
      console.error('❌ Failed to fetch perp data:', error.message);
      return null;
    }
  }

  // Process funding rates and find opportunities
  async scanForOpportunities() {
    console.log(`\n🔍 Scanning for funding rate opportunities...`);
    this.stats.scans++;
    
    const data = await this.fetchPerpData();
    if (!data) return [];
    
    const { meta, funding } = data;
    const opportunities = [];
    
    // Map funding rates to coin info
    const fundingMap = new Map();
    if (funding && Array.isArray(funding)) {
      funding.forEach(f => {
        if (f.coin && f.fundingRate !== undefined) {
          fundingMap.set(f.coin, f);
        }
      });
    }
    
    // Get perp assets from meta
    const perps = meta.universe?.filter(u => u.type === 'perp') || [];
    
    console.log(`   Found ${perps.length} perps, ${fundingMap.size} funding rates`);
    
    for (const perp of perps) {
      const coin = perp.name;
      const fundingData = fundingMap.get(coin);
      
      if (!fundingData) continue;
      
      const fundingRate = parseFloat(fundingData.fundingRate);
      const annualizedRate = fundingRate * 24 * 365; // Convert to annual
      
      // Check if funding is deeply negative (opportunity to go long)
      if (fundingRate <= this.fundingThreshold) {
        // Check if we already have a position
        if (!this.activePositions.has(coin)) {
          opportunities.push({
            coin,
            fundingRate,
            annualizedRate,
            markPrice: fundingData.markPrice || null,
            premium: fundingData.premium || null,
            timestamp: new Date().toISOString()
          });
        }
      }
    }
    
    // Sort by most negative funding (best opportunities)
    opportunities.sort((a, b) => a.fundingRate - b.fundingRate);
    
    if (opportunities.length > 0) {
      console.log(`   ✅ Found ${opportunities.length} opportunities`);
      opportunities.forEach(opp => {
        console.log(`      ${opp.coin}: ${(opp.fundingRate * 100).toFixed(4)}% (${opp.annualizedRate.toFixed(1)}% APR)`);
      });
    } else {
      console.log(`   ℹ️  No opportunities (funding not negative enough)`);
    }
    
    return opportunities;
  }

  // Execute a funding rate trade (go long)
  async executeTrade(opportunity) {
    const { coin, fundingRate, annualizedRate, markPrice } = opportunity;
    
    // Check position limits
    if (this.activePositions.size >= this.maxPositions) {
      console.log(`   ⏸️  Max positions reached (${this.maxPositions})`);
      return null;
    }
    
    console.log(`\n🚀 EXECUTING FUNDING RATE TRADE`);
    console.log(`   Asset: ${coin}`);
    console.log(`   Funding Rate: ${(fundingRate * 100).toFixed(4)}% (${annualizedRate.toFixed(1)}% APR)`);
    console.log(`   Mark Price: $${markPrice || 'N/A'}`);
    console.log(`   Position Size: $${this.positionSize}`);
    
    if (this.paperTrading) {
      console.log(`   📄 PAPER TRADE - Not executing on chain`);
      
      const position = {
        coin,
        entryTime: new Date().toISOString(),
        entryPrice: markPrice,
        fundingRate,
        annualizedRate,
        positionSize: this.positionSize,
        leverage: this.maxLeverage,
        notional: this.positionSize * this.maxLeverage,
        paperTrade: true,
        fundingEarned: 0,
        trades: []
      };
      
      this.activePositions.set(coin, position);
      this.stats.positionsOpened++;
      
      console.log(`   ✅ Position opened (paper)`);
      return position;
    } else {
      // Real execution would go here
      console.log(`   ⚠️  Live trading not yet implemented`);
      return null;
    }
  }

  // Simulate collecting funding payments
  async collectFunding() {
    const now = new Date();
    const fundingPayment = 1/24; // Hourly
    
    for (const [coin, position] of this.activePositions) {
      // Calculate funding payment (position size * funding rate)
      const hourlyFunding = position.positionSize * position.leverage * position.fundingRate;
      position.fundingEarned += hourlyFunding;
      this.stats.totalFundingEarned += hourlyFunding;
      
      position.trades.push({
        type: 'funding_payment',
        amount: hourlyFunding,
        timestamp: now.toISOString()
      });
    }
  }

  // Close a position
  async closePosition(coin, reason = 'manual') {
    const position = this.activePositions.get(coin);
    if (!position) {
      console.log(`   ❌ No position found for ${coin}`);
      return null;
    }
    
    console.log(`\n🔒 CLOSING POSITION: ${coin}`);
    console.log(`   Reason: ${reason}`);
    console.log(`   Total Funding Earned: $${position.fundingEarned.toFixed(4)}`);
    
    position.exitTime = new Date().toISOString();
    position.exitReason = reason;
    
    // Save to history
    this.fundingHistory.push(position);
    this.activePositions.delete(coin);
    this.stats.positionsClosed++;
    
    console.log(`   ✅ Position closed`);
    return position;
  }

  // Get current positions summary
  getPositionsSummary() {
    const positions = Array.from(this.activePositions.values());
    const totalFunding = positions.reduce((sum, p) => sum + p.fundingEarned, 0);
    
    return {
      activeCount: positions.length,
      maxPositions: this.maxPositions,
      totalFundingEarned: totalFunding,
      positions: positions.map(p => ({
        coin: p.coin,
        fundingRate: p.fundingRate,
        annualizedRate: p.annualizedRate,
        fundingEarned: p.fundingEarned,
        entryTime: p.entryTime
      }))
    };
  }

  // Run a single scan and execute
  async runOnce() {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`⏰ FUNDING RATE SCAN #${this.stats.scans + 1}`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Mode: ${this.paperTrading ? 'PAPER TRADING' : 'LIVE TRADING'}`);
    console.log(`Active Positions: ${this.activePositions.size}/${this.maxPositions}`);
    
    // Collect funding on existing positions
    if (this.activePositions.size > 0) {
      await this.collectFunding();
    }
    
    // Scan for new opportunities
    const opportunities = await this.scanForOpportunities();
    
    // Execute on best opportunities
    for (const opp of opportunities.slice(0, this.maxPositions - this.activePositions.size)) {
      await this.executeTrade(opp);
    }
    
    // Print summary
    const summary = this.getPositionsSummary();
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Active Positions: ${summary.activeCount}/${summary.maxPositions}`);
    console.log(`   Total Funding Earned: $${summary.totalFundingEarned.toFixed(4)}`);
    
    if (summary.positions.length > 0) {
      console.log(`\n   Active Trades:`);
      summary.positions.forEach(p => {
        console.log(`      ${p.coin}: ${(p.annualizedRate).toFixed(1)}% APR | $${p.fundingEarned.toFixed(4)} earned`);
      });
    }
    
    console.log(`${'='.repeat(70)}\n`);
    
    return summary;
  }

  // Start continuous monitoring
  async start() {
    console.log('\n🚀 STARTING FUNDING RATE FARMING BOT');
    console.log('='.repeat(70));
    console.log(`Threshold: ${(this.fundingThreshold * 100).toFixed(4)}% per hour`);
    console.log(`Max Positions: ${this.maxPositions}`);
    console.log(`Position Size: $${this.positionSize}`);
    console.log(`Max Leverage: ${this.maxLeverage}x`);
    console.log(`Scan Interval: ${this.scanInterval / 60000} minutes`);
    console.log(`Mode: ${this.paperTrading ? 'PAPER TRADING' : 'LIVE TRADING ⚠️'}`);
    console.log('='.repeat(70) + '\n');
    
    // Run immediately
    await this.runOnce();
    
    // Schedule future runs
    setInterval(() => this.runOnce(), this.scanInterval);
    
    console.log('✅ Bot running. Press Ctrl+C to stop.\n');
  }

  // Get full stats
  getStats() {
    return {
      ...this.stats,
      activePositions: this.activePositions.size,
      totalPositions: this.fundingHistory.length + this.activePositions.size,
      history: this.fundingHistory
    };
  }
}

module.exports = { FundingRateStrategy };

#!/usr/bin/env node
// Multi-Leg Arbitrage Strategy Backtest
// Tests funding rate, triangular, and cross-exchange arbitrage

const fs = require('fs');
const path = require('path');

class MultiLegBacktest {
  constructor(config = {}) {
    this.config = {
      initialCapital: config.initialCapital || 1000,
      strategy: config.strategy || 'funding', // 'funding', 'triangular', 'cross_exchange'
      minProfitThreshold: config.minProfitThreshold || 0.001,
      feeRate: config.feeRate || 0.00035, // 0.035% Hyperliquid fee
      fundingRateThreshold: config.fundingRateThreshold || 0.0001, // 0.01% per 8h
      maxPositionSize: config.maxPositionSize || 100,
      ...config
    };
    
    this.results = {
      trades: [],
      capital: this.config.initialCapital,
      startTime: null,
      endTime: null
    };
  }

  // Generate synthetic funding rate data
  generateFundingRateData(days = 90) {
    console.log(`📊 Generating ${days} days of funding rate data...\n`);
    
    const data = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // BTC price history (rough simulation of recent market)
    let btcPrice = 85000;
    let fundingRate = 0.0001; // 0.01% per 8h
    
    for (let i = 0; i < days * 3; i++) { // 3 funding periods per day
      const timestamp = new Date(startDate);
      timestamp.setHours(timestamp.getHours() + i * 8);
      
      // Simulate price movement
      const priceChange = (Math.random() - 0.5) * 0.02; // ±1% per period
      btcPrice = btcPrice * (1 + priceChange);
      
      // Simulate funding rate based on market sentiment
      // High funding when longs pay shorts (bullish)
      // Negative funding when shorts pay longs (bearish)
      const sentiment = Math.sin(i / 10) * 0.0003; // Cyclical sentiment
      const noise = (Math.random() - 0.5) * 0.0002;
      fundingRate = sentiment + noise;
      
      // Occasionally create extreme funding (5% chance)
      if (Math.random() < 0.05) {
        fundingRate = fundingRate > 0 ? 0.001 : -0.001; // 0.1% extreme
      }
      
      data.push({
        timestamp: timestamp.toISOString(),
        btcPrice,
        fundingRate,
        spotPrice: btcPrice * (1 + (Math.random() - 0.5) * 0.001) // Tiny spread
      });
    }
    
    console.log(`   ✅ Generated ${data.length} funding periods`);
    console.log(`   📅 Period: ${startDate.toDateString()} to ${new Date().toDateString()}`);
    console.log(`   💰 BTC Range: $${Math.min(...data.map(d => d.btcPrice)).toFixed(0)} - $${Math.max(...data.map(d => d.btcPrice)).toFixed(0)}\n`);
    
    return data;
  }

  // Generate synthetic cross-exchange price data
  generateCrossExchangeData(days = 90) {
    console.log(`📊 Generating ${days} days of cross-exchange data...\n`);
    
    const data = [];
    const exchanges = ['hyperliquid', 'binance', 'dydx', 'coinbase'];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    let basePrice = 85000;
    
    for (let i = 0; i < days * 24; i++) { // Hourly data
      const timestamp = new Date(startDate);
      timestamp.setHours(timestamp.getHours() + i);
      
      // Base price movement
      basePrice = basePrice * (1 + (Math.random() - 0.5) * 0.005);
      
      const snapshot = {
        timestamp: timestamp.toISOString(),
        prices: {}
      };
      
      // Generate prices for each exchange with small variations
      exchanges.forEach(exchange => {
        const latency = Math.random() * 0.001; // 0-0.1% price difference
        const bias = (Math.random() - 0.5) * 0.002; // Exchange-specific bias
        
        snapshot.prices[exchange] = basePrice * (1 + latency + bias);
      });
      
      // Occasionally create arbitrage opportunity (3% chance)
      if (Math.random() < 0.03) {
        const cheapExchange = exchanges[Math.floor(Math.random() * exchanges.length)];
        const expensiveExchange = exchanges[Math.floor(Math.random() * exchanges.length)];
        
        if (cheapExchange !== expensiveExchange) {
          snapshot.prices[cheapExchange] = basePrice * 0.996; // 0.4% discount
          snapshot.prices[expensiveExchange] = basePrice * 1.004; // 0.4% premium
        }
      }
      
      data.push(snapshot);
    }
    
    console.log(`   ✅ Generated ${data.length} hourly snapshots`);
    console.log(`   📅 Period: ${startDate.toDateString()} to ${new Date().toDateString()}\n`);
    
    return data;
  }

  // Test funding rate arbitrage
  async backtestFundingArbitrage() {
    console.log('='.repeat(70));
    console.log('📊 FUNDING RATE ARBITRAGE BACKTEST');
    console.log('='.repeat(70));
    console.log(`Initial Capital: $${this.config.initialCapital}`);
    console.log(`Funding Threshold: ${(this.config.fundingRateThreshold * 100).toFixed(3)}% per 8h`);
    console.log(`Fee Rate: ${(this.config.feeRate * 100).toFixed(3)}%\n`);
    
    const data = this.generateFundingRateData(90);
    this.results.startTime = data[0].timestamp;
    this.results.endTime = data[data.length - 1].timestamp;
    
    let opportunities = 0;
    let trades = 0;
    
    for (let i = 0; i < data.length; i++) {
      const point = data[i];
      const fundingRate = point.fundingRate;
      
      // Annualized funding rate
      const annualized = Math.abs(fundingRate) * 3 * 365;
      
      // Check if funding is extreme enough
      if (annualized > 30) { // >30% annualized
        opportunities++;
        
        // Strategy: Short perp if funding positive, long perp if negative
        // Hedge with spot position
        const direction = fundingRate > 0 ? 'SHORT' : 'LONG';
        const positionSize = Math.min(
          this.config.maxPositionSize,
          this.results.capital * 0.5
        );
        
        // Calculate profit (funding payment minus fees)
        const fundingPayment = positionSize * Math.abs(fundingRate);
        const fee = positionSize * this.config.feeRate * 2; // Open + close
        const netProfit = fundingPayment - fee;
        
        if (netProfit > positionSize * this.config.minProfitThreshold) {
          trades++;
          this.results.capital += netProfit;
          
          this.results.trades.push({
            timestamp: point.timestamp,
            direction,
            btcPrice: point.btcPrice,
            fundingRate,
            annualized,
            positionSize,
            fundingPayment,
            fee,
            netProfit,
            capital: this.results.capital
          });
        }
      }
      
      if ((i + 1) % 50 === 0) {
        process.stdout.write(`\r   Processing... ${((i + 1) / data.length * 100).toFixed(1)}%`);
      }
    }
    
    console.log('\n');
    this.printResults('Funding Rate Arbitrage', opportunities, trades);
    
    return this.results;
  }

  // Test cross-exchange arbitrage
  async backtestCrossExchange() {
    console.log('='.repeat(70));
    console.log('📊 CROSS-EXCHANGE ARBITRAGE BACKTEST');
    console.log('='.repeat(70));
    console.log(`Initial Capital: $${this.config.initialCapital}`);
    console.log(`Min Profit Threshold: ${(this.config.minProfitThreshold * 100).toFixed(2)}%`);
    console.log(`Fee Rate: ${(this.config.feeRate * 100).toFixed(3)}% (per exchange)\n`);
    
    const data = this.generateCrossExchangeData(90);
    this.results.startTime = data[0].timestamp;
    this.results.endTime = data[data.length - 1].timestamp;
    
    let opportunities = 0;
    let trades = 0;
    
    for (let i = 0; i < data.length; i++) {
      const snapshot = data[i];
      const exchanges = Object.keys(snapshot.prices);
      
      // Find best arbitrage across all exchange pairs
      for (let j = 0; j < exchanges.length; j++) {
        for (let k = j + 1; k < exchanges.length; k++) {
          const ex1 = exchanges[j];
          const ex2 = exchanges[k];
          
          const price1 = snapshot.prices[ex1];
          const price2 = snapshot.prices[ex2];
          
          const spread = Math.abs(price1 - price2) / Math.min(price1, price2);
          
          // Check if spread exceeds threshold + fees
          if (spread > this.config.minProfitThreshold + this.config.feeRate * 2) {
            opportunities++;
            
            const buyExchange = price1 < price2 ? ex1 : ex2;
            const sellExchange = price1 < price2 ? ex2 : ex1;
            const buyPrice = Math.min(price1, price2);
            const sellPrice = Math.max(price1, price2);
            
            const positionSize = Math.min(
              this.config.maxPositionSize,
              this.results.capital * 0.3
            );
            
            const grossProfit = positionSize * spread;
            const fee = positionSize * this.config.feeRate * 2;
            const netProfit = grossProfit - fee;
            
            if (netProfit > 0) {
              trades++;
              this.results.capital += netProfit;
              
              this.results.trades.push({
                timestamp: snapshot.timestamp,
                buyExchange,
                sellExchange,
                buyPrice,
                sellPrice,
                spread: spread * 100,
                positionSize,
                grossProfit,
                fee,
                netProfit,
                capital: this.results.capital
              });
            }
          }
        }
      }
      
      if ((i + 1) % 100 === 0) {
        process.stdout.write(`\r   Processing... ${((i + 1) / data.length * 100).toFixed(1)}%`);
      }
    }
    
    console.log('\n');
    this.printResults('Cross-Exchange Arbitrage', opportunities, trades);
    
    return this.results;
  }

  printResults(strategyName, opportunities, trades) {
    const initial = this.config.initialCapital;
    const final = this.results.capital;
    const profit = final - initial;
    const return_ = (profit / initial) * 100;
    
    console.log('='.repeat(70));
    console.log(`📈 ${strategyName.toUpperCase()} RESULTS`);
    console.log('='.repeat(70));
    
    console.log(`\n💰 CAPITAL:`);
    console.log(`   Initial: $${initial.toFixed(2)}`);
    console.log(`   Final: $${final.toFixed(2)}`);
    console.log(`   Profit: $${profit.toFixed(2)} (${return_ >= 0 ? '+' : ''}${return_.toFixed(2)}%)`);
    
    console.log(`\n📊 STATISTICS:`);
    console.log(`   Opportunities Detected: ${opportunities}`);
    console.log(`   Trades Executed: ${trades}`);
    console.log(`   Execution Rate: ${opportunities > 0 ? (trades / opportunities * 100).toFixed(1) : 0}%`);
    
    if (this.results.trades.length > 0) {
      const avgProfit = this.results.trades.reduce((s, t) => s + t.netProfit, 0) / this.results.trades.length;
      const totalFees = this.results.trades.reduce((s, t) => s + t.fee, 0);
      
      console.log(`\n📈 TRADE METRICS:`);
      console.log(`   Average Profit: $${avgProfit.toFixed(2)}`);
      console.log(`   Total Fees: $${totalFees.toFixed(2)}`);
      console.log(`   Fee Ratio: ${(totalFees / (profit + totalFees) * 100).toFixed(1)}%`);
      
      // Best trade
      const best = [...this.results.trades].sort((a, b) => b.netProfit - a.netProfit)[0];
      console.log(`\n🏆 BEST TRADE:`);
      console.log(`   Profit: $${best.netProfit.toFixed(2)}`);
      if (best.direction) {
        console.log(`   Direction: ${best.direction}`);
        console.log(`   Funding Rate: ${(best.fundingRate * 100).toFixed(4)}%`);
      } else {
        console.log(`   Buy: ${best.buyExchange} @ $${best.buyPrice.toFixed(2)}`);
        console.log(`   Sell: ${best.sellExchange} @ $${best.sellPrice.toFixed(2)}`);
      }
    }
    
    // Annualized return
    const days = 90;
    const annualized = return_ * (365 / days);
    
    console.log(`\n🔮 PROJECTIONS:`);
    console.log(`   90-Day Return: ${return_.toFixed(2)}%`);
    console.log(`   Annualized Return: ${annualized.toFixed(2)}%`);
    console.log(`   Monthly Profit (est): $${(profit / 3).toFixed(2)}`);
    
    console.log('\n' + '='.repeat(70));
    
    // Save results
    this.saveResults(strategyName);
  }

  saveResults(strategyName) {
    const filename = `backtest-${strategyName.toLowerCase().replace(/\s+/g, '-')}.json`;
    const resultsPath = path.join(__dirname, 'data', filename);
    
    const output = {
      strategy: strategyName,
      config: this.config,
      results: {
        initialCapital: this.config.initialCapital,
        finalCapital: this.results.capital,
        totalReturn: ((this.results.capital - this.config.initialCapital) / this.config.initialCapital) * 100,
        totalTrades: this.results.trades.length,
        trades: this.results.trades
      },
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(resultsPath, JSON.stringify(output, null, 2));
    console.log(`💾 Results saved to: ${resultsPath}\n`);
  }
}

// Run backtest suite
async function runBacktestSuite() {
  console.log('🧪 MULTI-LEG ARBITRAGE BACKTEST SUITE\n');
  
  // Test 1: Funding Rate Arbitrage
  const fundingBacktest = new MultiLegBacktest({
    strategy: 'funding',
    initialCapital: 1000,
    fundingRateThreshold: 0.0001
  });
  await fundingBacktest.backtestFundingArbitrage();
  
  await new Promise(r => setTimeout(r, 500));
  
  // Test 2: Cross-Exchange Arbitrage
  const crossExBacktest = new MultiLegBacktest({
    strategy: 'cross_exchange',
    initialCapital: 1000,
    minProfitThreshold: 0.002
  });
  await crossExBacktest.backtestCrossExchange();
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ BACKTEST SUITE COMPLETE');
  console.log('='.repeat(70));
  console.log('\n📁 Result files:');
  console.log('   - data/backtest-funding-rate-arbitrage.json');
  console.log('   - data/backtest-cross-exchange-arbitrage.json');
  console.log('   - data/polymarket-backtest-results.json (Dutch Book)\n');
}

// Run if called directly
if (require.main === module) {
  runBacktestSuite().catch(console.error);
}

module.exports = { MultiLegBacktest };

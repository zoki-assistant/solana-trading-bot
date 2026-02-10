// BTC/USDC Mean Reversion Strategy
// For ranging/choppy markets - buy low, sell high within established range

class BTCMeanReversionStrategy {
  constructor(config = {}) {
    this.lookbackPeriod = config.lookbackPeriod || 20;  // 20 periods for mean
    this.stdDevMultiplier = config.stdDevMultiplier || 2;  // Bollinger Bands ±2σ
    this.rsiPeriod = config.rsiPeriod || 14;
    this.rsiOversold = config.rsiOversold || 30;
    this.rsiOverbought = config.rsiOverbought || 70;
    this.stopLossPct = config.stopLossPct || 3;  // Wider stops for mean reversion
    this.takeProfitPct = config.takeProfitPct || 2;  // Smaller targets (quick reversions)
    this.maxPositionSize = config.maxPositionSize || 0.95;
    this.feePct = config.feePct || 0.035;
    this.maxHoldPeriods = config.maxHoldPeriods || 12;  // Max 12 candles (48h on 4h)
  }

  // Calculate Simple Moving Average
  calculateSMA(prices, period) {
    const sma = [];
    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) {
        sma.push(prices[i]);  // Not enough data yet
      } else {
        const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        sma.push(sum / period);
      }
    }
    return sma;
  }

  // Calculate Standard Deviation
  calculateStdDev(prices, sma, period) {
    const stdDev = [];
    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) {
        stdDev.push(0);
      } else {
        const slice = prices.slice(i - period + 1, i + 1);
        const mean = sma[i];
        const squaredDiffs = slice.map(p => Math.pow(p - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
        stdDev.push(Math.sqrt(variance));
      }
    }
    return stdDev;
  }

  // Calculate Bollinger Bands
  calculateBollingerBands(prices) {
    const sma = this.calculateSMA(prices, this.lookbackPeriod);
    const stdDev = this.calculateStdDev(prices, sma, this.lookbackPeriod);
    
    const upperBand = sma.map((m, i) => m + (stdDev[i] * this.stdDevMultiplier));
    const lowerBand = sma.map((m, i) => m - (stdDev[i] * this.stdDevMultiplier));
    
    return { sma, upperBand, lowerBand, stdDev };
  }

  // Calculate RSI
  calculateRSI(prices, period) {
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;
    const rsi = [50];
    
    for (let i = period + 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) {
        avgGain = (avgGain * (period - 1) + change) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) - change) / period;
      }
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
    
    while (rsi.length < prices.length) rsi.unshift(50);
    return rsi;
  }

  // Check if market is ranging (not trending)
  isRangingMarket(data, index) {
    // Use ADX or price range to detect ranging
    if (index < 20) return false;
    
    const recentHighs = data.slice(index - 20, index).map(d => d.high);
    const recentLows = data.slice(index - 20, index).map(d => d.low);
    const range = Math.max(...recentHighs) - Math.min(...recentLows);
    const avgPrice = data[index].close;
    const rangePct = (range / avgPrice) * 100;
    
    // If range < 15% over 20 periods, consider it ranging
    return rangePct < 15;
  }

  // Generate signals
  generateSignals(data) {
    const prices = data.map(c => c.close);
    const { sma, upperBand, lowerBand, stdDev } = this.calculateBollingerBands(prices);
    const rsi = this.calculateRSI(prices, this.rsiPeriod);
    
    const signals = [];
    const startIndex = Math.max(this.lookbackPeriod, this.rsiPeriod);
    
    for (let i = startIndex; i < data.length; i++) {
      const price = data[i].close;
      const prevPrice = data[i - 1].close;
      const upper = upperBand[i];
      const lower = lowerBand[i];
      const middle = sma[i];
      const currRSI = rsi[i];
      const prevRSI = rsi[i - 1];
      const isRanging = this.isRangingMarket(data, i);
      
      let signal = null;
      
      // LONG signal: Price touches lower band + RSI oversold + ranging market
      if (price <= lower && currRSI < this.rsiOversold && isRanging) {
        signal = {
          type: 'LONG',
          price: price,
          timestamp: data[i].timestamp,
          reason: `Price ${price.toFixed(0)} touched lower band ${lower.toFixed(0)} + RSI ${currRSI.toFixed(1)} oversold (ranging)`,
          target: middle,  // Target the mean
          stop: price * (1 - this.stopLossPct / 100)
        };
      }
      // SHORT signal: Price touches upper band + RSI overbought + ranging market
      else if (price >= upper && currRSI > this.rsiOverbought && isRanging) {
        signal = {
          type: 'SHORT',
          price: price,
          timestamp: data[i].timestamp,
          reason: `Price ${price.toFixed(0)} touched upper band ${upper.toFixed(0)} + RSI ${currRSI.toFixed(1)} overbought (ranging)`,
          target: middle,  // Target the mean
          stop: price * (1 + this.stopLossPct / 100)
        };
      }
      // Log skipped signals
      else if ((price <= lower && currRSI < this.rsiOversold) || 
               (price >= upper && currRSI > this.rsiOverbought)) {
        if (!isRanging) {
          console.log(`   ⏸️  SKIPPED: Signal detected but market trending (not ranging)`);
        }
      }
      
      signals.push({
        timestamp: data[i].timestamp,
        close: price,
        sma: middle,
        upperBand: upper,
        lowerBand: lower,
        rsi: currRSI,
        isRanging,
        signal
      });
    }
    
    return signals;
  }

  // Run backtest
  backtest(data, initialCapital = 48) {
    console.log(`\n📊 BACKTEST: BTC/USDC Mean Reversion`);
    console.log(`Initial Capital: $${initialCapital}`);
    console.log(`Strategy: Bollinger Bands ±${this.stdDevMultiplier}σ + RSI`);
    console.log(`RSI Levels: Oversold ${this.rsiOversold} | Overbought ${this.rsiOverbought}`);
    console.log(`Stop Loss: ${this.stopLossPct}% | Take Profit: ${this.takeProfitPct}%`);
    console.log(`Max Hold: ${this.maxHoldPeriods} candles (~${this.maxHoldPeriods * 4}h)`);
    console.log('=' .repeat(60));
    
    const signals = this.generateSignals(data);
    let capital = initialCapital;
    let position = null;
    let trades = [];
    let wins = 0;
    let losses = 0;
    let skippedSignals = 0;
    let holdPeriods = 0;
    
    for (let i = 0; i < signals.length; i++) {
      const point = signals[i];
      
      // Count skipped signals
      if (!point.signal && ((point.close <= point.lowerBand && point.rsi < this.rsiOversold) ||
                           (point.close >= point.upperBand && point.rsi > this.rsiOverbought))) {
        skippedSignals++;
      }
      
      // Check exit conditions if in position
      if (position) {
        holdPeriods++;
        const priceChange = ((point.close - position.entryPrice) / position.entryPrice) * 100;
        const pnl = position.type === 'LONG' ? priceChange : -priceChange;
        
        // Exit reasons:
        // 1. Hit stop loss
        // 2. Hit take profit (reached middle band)
        // 3. Max hold periods exceeded
        // 4. Reverse signal
        
        let exit = false;
        let exitReason = '';
        
        // Stop loss
        if (pnl <= -this.stopLossPct) {
          exit = true;
          exitReason = 'STOP_LOSS';
        }
        // Take profit (reverted to mean)
        else if (pnl >= this.takeProfitPct) {
          exit = true;
          exitReason = 'TAKE_PROFIT';
        }
        // Max hold periods
        else if (holdPeriods >= this.maxHoldPeriods) {
          exit = true;
          exitReason = 'MAX_HOLD';
        }
        // Price crossed middle band (mean reversion complete)
        else if (position.type === 'LONG' && point.close >= point.sma) {
          exit = true;
          exitReason = 'MEAN_REVERSION';
        }
        else if (position.type === 'SHORT' && point.close <= point.sma) {
          exit = true;
          exitReason = 'MEAN_REVERSION';
        }
        
        if (exit) {
          const tradeValue = position.size * position.entryPrice;
          const pnlUSD = tradeValue * (pnl / 100);
          const fee = tradeValue * (this.feePct / 100) * 2;
          const netPnl = pnlUSD - fee;
          
          capital += netPnl;
          
          if (netPnl > 0) wins++;
          else losses++;
          
          trades.push({
            type: position.type,
            entry: position.entryPrice,
            exit: point.close,
            pnl: netPnl,
            exitReason,
            holdPeriods,
            timestamp: point.timestamp
          });
          
          const emoji = netPnl > 0 ? '✅' : '❌';
          console.log(`${emoji} ${exitReason} | ${position.type} | Hold: ${holdPeriods} | P&L: ${netPnl > 0 ? '+' : ''}$${netPnl.toFixed(2)}`);
          
          position = null;
          holdPeriods = 0;
        }
      }
      
      // Enter new position
      if (!position && point.signal) {
        const positionSize = (capital * this.maxPositionSize) / point.close;
        
        position = {
          type: point.signal.type,
          entryPrice: point.close,
          size: positionSize,
          timestamp: point.signal.timestamp,
          target: point.signal.target
        };
        
        console.log(`🚀 ENTRY | ${point.signal.type} @ $${point.close.toFixed(2)} | ${point.signal.reason}`);
      }
    }
    
    // Close any open position at end
    if (position) {
      const lastPoint = signals[signals.length - 1];
      const priceChange = ((lastPoint.close - position.entryPrice) / position.entryPrice) * 100;
      const pnl = position.type === 'LONG' ? priceChange : -priceChange;
      const tradeValue = position.size * position.entryPrice;
      const pnlUSD = tradeValue * (pnl / 100);
      const fee = tradeValue * (this.feePct / 100) * 2;
      const netPnl = pnlUSD - fee;
      
      capital += netPnl;
      
      if (netPnl > 0) wins++;
      else losses++;
      
      trades.push({
        type: position.type,
        entry: position.entryPrice,
        exit: lastPoint.close,
        pnl: netPnl,
        exitReason: 'END_OF_DATA',
        holdPeriods,
        timestamp: lastPoint.timestamp
      });
      
      const emoji = netPnl > 0 ? '✅' : '❌';
      console.log(`${emoji} CLOSE | ${position.type} @ $${lastPoint.close.toFixed(2)} | P&L: ${netPnl > 0 ? '+' : ''}$${netPnl.toFixed(2)}`);
    }
    
    // Results
    console.log('\n' + '='.repeat(60));
    console.log('📈 BACKTEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Trades: ${trades.length}`);
    console.log(`Skipped Signals (trending): ${skippedSignals}`);
    console.log(`Wins: ${wins} | Losses: ${losses}`);
    console.log(`Win Rate: ${((wins / trades.length) * 100).toFixed(1)}%`);
    console.log(`Initial Capital: $${initialCapital}`);
    console.log(`Final Capital: $${capital.toFixed(2)}`);
    console.log(`Total P&L: $${(capital - initialCapital).toFixed(2)} (${((capital - initialCapital) / initialCapital * 100).toFixed(2)}%)`);
    
    const grossProfit = trades.filter(t => t.pnl > 0).reduce((a, b) => a + b.pnl, 0);
    const grossLoss = trades.filter(t => t.pnl < 0).reduce((a, b) => a + b.pnl, 0);
    const profitFactor = grossLoss !== 0 ? Math.abs(grossProfit / grossLoss) : 0;
    const avgHold = trades.length > 0 ? trades.reduce((a, b) => a + b.holdPeriods, 0) / trades.length : 0;
    
    console.log(`Profit Factor: ${profitFactor.toFixed(2)}`);
    console.log(`Avg Win: $${(grossProfit / wins || 0).toFixed(2)}`);
    console.log(`Avg Loss: $${(grossLoss / losses || 0).toFixed(2)}`);
    console.log(`Avg Hold Time: ${avgHold.toFixed(1)} candles (~${(avgHold * 4).toFixed(0)}h)`);
    
    // Exit reason breakdown
    const exitReasons = {};
    trades.forEach(t => {
      exitReasons[t.exitReason] = (exitReasons[t.exitReason] || 0) + 1;
    });
    console.log('\nExit Breakdown:');
    Object.entries(exitReasons).forEach(([reason, count]) => {
      console.log(`  ${reason}: ${count}`);
    });
    
    return {
      capital,
      trades,
      wins,
      losses,
      winRate: (wins / trades.length) * 100,
      totalReturn: ((capital - initialCapital) / initialCapital) * 100,
      profitFactor,
      avgHold,
      skippedSignals
    };
  }
}

module.exports = { BTCMeanReversionStrategy };

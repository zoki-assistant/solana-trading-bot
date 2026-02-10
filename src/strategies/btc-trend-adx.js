// BTC/USDC 4h Trend Following Strategy with ADX Filter
// Only trades when ADX > 25 (strong trend confirmed)

class BTCTrendStrategyWithADX {
  constructor(config = {}) {
    this.fastEma = config.fastEma || 9;
    this.slowEma = config.slowEma || 21;
    this.adxPeriod = config.adxPeriod || 14;
    this.adxThreshold = config.adxThreshold || 25; // ADX > 25 = strong trend
    this.rsiPeriod = config.rsiPeriod || 14;
    this.stopLossPct = config.stopLossPct || 2;
    this.takeProfitPct = config.takeProfitPct || 4;
    this.maxPositionSize = config.maxPositionSize || 0.95;
    this.feePct = config.feePct || 0.035;
  }

  // Calculate EMA
  calculateEMA(prices, period) {
    const k = 2 / (period + 1);
    let ema = [prices[0]];
    for (let i = 1; i < prices.length; i++) {
      ema.push(prices[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
  }

  // Calculate True Range
  calculateTR(data) {
    const tr = [data[0].high - data[0].low];
    for (let i = 1; i < data.length; i++) {
      const high = data[i].high;
      const low = data[i].low;
      const prevClose = data[i - 1].close;
      const tr1 = high - low;
      const tr2 = Math.abs(high - prevClose);
      const tr3 = Math.abs(low - prevClose);
      tr.push(Math.max(tr1, tr2, tr3));
    }
    return tr;
  }

  // Calculate +DM and -DM
  calculateDM(data) {
    const plusDM = [0];
    const minusDM = [0];
    
    for (let i = 1; i < data.length; i++) {
      const highDiff = data[i].high - data[i - 1].high;
      const lowDiff = data[i - 1].low - data[i].low;
      
      if (highDiff > lowDiff && highDiff > 0) {
        plusDM.push(highDiff);
        minusDM.push(0);
      } else if (lowDiff > highDiff && lowDiff > 0) {
        plusDM.push(0);
        minusDM.push(lowDiff);
      } else {
        plusDM.push(0);
        minusDM.push(0);
      }
    }
    return { plusDM, minusDM };
  }

  // Calculate ADX
  calculateADX(data) {
    const tr = this.calculateTR(data);
    const { plusDM, minusDM } = this.calculateDM(data);
    const period = this.adxPeriod;
    
    // Smooth TR, +DM, -DM
    let atr = [tr.slice(0, period).reduce((a, b) => a + b, 0) / period];
    let plusDI = [plusDM.slice(0, period).reduce((a, b) => a + b, 0) / period];
    let minusDI = [minusDM.slice(0, period).reduce((a, b) => a + b, 0) / period];
    
    for (let i = period; i < data.length; i++) {
      atr.push((atr[atr.length - 1] * (period - 1) + tr[i]) / period);
      plusDI.push((plusDI[plusDI.length - 1] * (period - 1) + plusDM[i]) / period);
      minusDI.push((minusDI[minusDI.length - 1] * (period - 1) + minusDM[i]) / period);
    }
    
    // Calculate DX
    const dx = [];
    for (let i = 0; i < atr.length; i++) {
      const pDI = (plusDI[i] / atr[i]) * 100;
      const mDI = (minusDI[i] / atr[i]) * 100;
      dx.push(Math.abs(pDI - mDI) / (pDI + mDI) * 100);
    }
    
    // Smooth DX to get ADX
    let adx = [dx.slice(0, period).reduce((a, b) => a + b, 0) / period];
    for (let i = period; i < dx.length; i++) {
      adx.push((adx[adx.length - 1] * (period - 1) + dx[i]) / period);
    }
    
    // Pad beginning
    while (adx.length < data.length) {
      adx.unshift(0);
    }
    
    return adx;
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

  // Generate signals with ADX filter
  generateSignals(data) {
    const prices = data.map(c => c.close);
    const fastEMA = this.calculateEMA(prices, this.fastEma);
    const slowEMA = this.calculateEMA(prices, this.slowEma);
    const rsi = this.calculateRSI(prices, this.rsiPeriod);
    const adx = this.calculateADX(data);
    
    const signals = [];
    const startIndex = Math.max(this.slowEma, this.adxPeriod * 2, this.rsiPeriod) + 1;
    
    for (let i = startIndex; i < data.length; i++) {
      const prevFast = fastEMA[i - 1];
      const prevSlow = slowEMA[i - 1];
      const currFast = fastEMA[i];
      const currSlow = slowEMA[i];
      const currRSI = rsi[i];
      const currADX = adx[i];
      
      let signal = null;
      const adxStrong = currADX > this.adxThreshold;
      
      // Long: Fast crosses above Slow + RSI confirmation + ADX > 25
      if (prevFast <= prevSlow && currFast > currSlow && currRSI > 50 && adxStrong) {
        signal = {
          type: 'LONG',
          price: data[i].close,
          timestamp: data[i].timestamp,
          reason: `EMA crossover + RSI ${currRSI.toFixed(1)} + ADX ${currADX.toFixed(1)} (STRONG TREND)`
        };
      }
      // Short: Fast crosses below Slow + RSI confirmation + ADX > 25
      else if (prevFast >= prevSlow && currFast < currSlow && currRSI < 50 && adxStrong) {
        signal = {
          type: 'SHORT',
          price: data[i].close,
          timestamp: data[i].timestamp,
          reason: `EMA crossover + RSI ${currRSI.toFixed(1)} + ADX ${currADX.toFixed(1)} (STRONG TREND)`
        };
      }
      // Log skipped signals due to low ADX
      else if (prevFast <= prevSlow && currFast > currSlow && currRSI > 50 && !adxStrong) {
        console.log(`   ⏸️  SKIPPED: EMA crossover but ADX ${currADX.toFixed(1)} < ${this.adxThreshold} (weak trend)`);
      }
      else if (prevFast >= prevSlow && currFast < currSlow && currRSI < 50 && !adxStrong) {
        console.log(`   ⏸️  SKIPPED: EMA crossover but ADX ${currADX.toFixed(1)} < ${this.adxThreshold} (weak trend)`);
      }
      
      signals.push({
        timestamp: data[i].timestamp,
        close: data[i].close,
        fastEMA: currFast,
        slowEMA: currSlow,
        rsi: currRSI,
        adx: currADX,
        signal
      });
    }
    
    return signals;
  }

  // Run backtest
  backtest(data, initialCapital = 48) {
    console.log(`\n📊 BACKTEST: BTC/USDC Trend + ADX Filter`);
    console.log(`Initial Capital: $${initialCapital}`);
    console.log(`Strategy: EMA ${this.fastEma}/${this.slowEma} + RSI ${this.rsiPeriod} + ADX > ${this.adxThreshold}`);
    console.log(`Stop Loss: ${this.stopLossPct}% | Take Profit: ${this.takeProfitPct}%`);
    console.log('=' .repeat(60));
    
    const signals = this.generateSignals(data);
    let capital = initialCapital;
    let position = null;
    let trades = [];
    let wins = 0;
    let losses = 0;
    let skippedSignals = 0;
    
    for (const point of signals) {
      // Count skipped signals
      if (!point.signal && ((point.fastEMA > point.slowEMA && point.rsi > 50) || 
                           (point.fastEMA < point.slowEMA && point.rsi < 50))) {
        skippedSignals++;
      }
      
      // Check exit conditions if in position
      if (position) {
        const priceChange = ((point.close - position.entryPrice) / position.entryPrice) * 100;
        const pnl = position.type === 'LONG' ? priceChange : -priceChange;
        
        // Stop loss
        if (pnl <= -this.stopLossPct) {
          const tradeValue = position.size * position.entryPrice;
          const loss = tradeValue * (this.stopLossPct / 100);
          const fee = tradeValue * (this.feePct / 100) * 2;
          capital -= (loss + fee);
          losses++;
          trades.push({ type: position.type, entry: position.entryPrice, exit: point.close, pnl: -loss - fee, exitReason: 'STOP_LOSS' });
          console.log(`❌ STOP LOSS | ${position.type} | P&L: -$${(loss + fee).toFixed(2)}`);
          position = null;
        }
        // Take profit
        else if (pnl >= this.takeProfitPct) {
          const tradeValue = position.size * position.entryPrice;
          const profit = tradeValue * (this.takeProfitPct / 100);
          const fee = tradeValue * (this.feePct / 100) * 2;
          capital += (profit - fee);
          wins++;
          trades.push({ type: position.type, entry: position.entryPrice, exit: point.close, pnl: profit - fee, exitReason: 'TAKE_PROFIT' });
          console.log(`✅ TAKE PROFIT | ${position.type} | P&L: +$${(profit - fee).toFixed(2)}`);
          position = null;
        }
        // Signal reversal
        else if (point.signal && point.signal.type !== position.type) {
          const actualPnl = position.type === 'LONG' 
            ? ((point.close - position.entryPrice) / position.entryPrice) * 100
            : ((position.entryPrice - point.close) / position.entryPrice) * 100;
          const tradeValue = position.size * position.entryPrice;
          const pnlUSD = tradeValue * (actualPnl / 100);
          const fee = tradeValue * (this.feePct / 100) * 2;
          capital += (pnlUSD - fee);
          if (actualPnl > 0) wins++; else losses++;
          trades.push({ type: position.type, entry: position.entryPrice, exit: point.close, pnl: pnlUSD - fee, exitReason: 'SIGNAL_REVERSE' });
          console.log(`${actualPnl > 0 ? '✅' : '❌'} REVERSE | ${position.type} | P&L: ${actualPnl > 0 ? '+' : ''}$${(pnlUSD - fee).toFixed(2)}`);
          position = null;
        }
      }
      
      // Enter new position
      if (!position && point.signal) {
        const positionSize = (capital * this.maxPositionSize) / point.close;
        position = { type: point.signal.type, entryPrice: point.close, size: positionSize, timestamp: point.signal.timestamp };
        console.log(`🚀 ENTRY | ${point.signal.type} @ $${point.close.toFixed(2)} | ADX: ${point.adx.toFixed(1)} | ${point.signal.reason}`);
      }
    }
    
    // Close any open position at end
    if (position) {
      const lastPrice = signals[signals.length - 1].close;
      const actualPnl = position.type === 'LONG'
        ? ((lastPrice - position.entryPrice) / position.entryPrice) * 100
        : ((position.entryPrice - lastPrice) / position.entryPrice) * 100;
      const tradeValue = position.size * position.entryPrice;
      const pnlUSD = tradeValue * (actualPnl / 100);
      const fee = tradeValue * (this.feePct / 100) * 2;
      capital += (pnlUSD - fee);
      if (actualPnl > 0) wins++; else losses++;
      trades.push({ type: position.type, entry: position.entryPrice, exit: lastPrice, pnl: pnlUSD - fee, exitReason: 'END_OF_DATA' });
      console.log(`${actualPnl > 0 ? '✅' : '❌'} CLOSE | ${position.type} @ $${lastPrice.toFixed(2)} | P&L: ${actualPnl > 0 ? '+' : ''}$${(pnlUSD - fee).toFixed(2)}`);
    }
    
    // Results
    console.log('\n' + '='.repeat(60));
    console.log('📈 BACKTEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Trades: ${trades.length}`);
    console.log(`Skipped Signals (weak ADX): ${skippedSignals}`);
    console.log(`Wins: ${wins} | Losses: ${losses}`);
    console.log(`Win Rate: ${((wins / trades.length) * 100).toFixed(1)}%`);
    console.log(`Initial Capital: $${initialCapital}`);
    console.log(`Final Capital: $${capital.toFixed(2)}`);
    console.log(`Total P&L: $${(capital - initialCapital).toFixed(2)} (${((capital - initialCapital) / initialCapital * 100).toFixed(2)}%)`);
    
    const grossProfit = trades.filter(t => t.pnl > 0).reduce((a, b) => a + b.pnl, 0);
    const grossLoss = trades.filter(t => t.pnl < 0).reduce((a, b) => a + b.pnl, 0);
    const profitFactor = grossLoss !== 0 ? Math.abs(grossProfit / grossLoss) : 0;
    
    console.log(`Profit Factor: ${profitFactor.toFixed(2)}`);
    console.log(`Avg Win: $${(grossProfit / wins || 0).toFixed(2)}`);
    console.log(`Avg Loss: $${(grossLoss / losses || 0).toFixed(2)}`);
    
    return { capital, trades, wins, losses, winRate: (wins / trades.length) * 100, totalReturn: ((capital - initialCapital) / initialCapital) * 100, profitFactor, skippedSignals };
  }
}

module.exports = { BTCTrendStrategyWithADX };

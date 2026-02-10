// BTC/USDC 4h Trend Following Strategy
// Uses Hyperliquid historical data for backtesting

class BTCTrendStrategy {
  constructor(config = {}) {
    this.fastEma = config.fastEma || 9;      // 9-period EMA
    this.slowEma = config.slowEma || 21;     // 21-period EMA
    this.rsiPeriod = config.rsiPeriod || 14;
    this.rsiOverbought = config.rsiOverbought || 70;
    this.rsiOversold = config.rsiOversold || 30;
    this.stopLossPct = config.stopLossPct || 2;      // 2% stop loss
    this.takeProfitPct = config.takeProfitPct || 4;  // 4% take profit
    this.maxPositionSize = config.maxPositionSize || 0.95; // 95% of capital
    this.feePct = config.feePct || 0.035; // Hyperliquid taker fee
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

  // Calculate RSI
  calculateRSI(prices, period) {
    let gains = 0;
    let losses = 0;
    
    // First period
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;
    const rsi = [50]; // Neutral start
    
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
    
    // Pad beginning
    while (rsi.length < prices.length) {
      rsi.unshift(50);
    }
    
    return rsi;
  }

  // Generate signals
  generateSignals(data) {
    const prices = data.map(c => c.close);
    const fastEMA = this.calculateEMA(prices, this.fastEma);
    const slowEMA = this.calculateEMA(prices, this.slowEma);
    const rsi = this.calculateRSI(prices, this.rsiPeriod);
    
    const signals = [];
    
    for (let i = Math.max(this.slowEma, this.rsiPeriod) + 1; i < data.length; i++) {
      const prevFast = fastEMA[i - 1];
      const prevSlow = slowEMA[i - 1];
      const currFast = fastEMA[i];
      const currSlow = slowEMA[i];
      const currRSI = rsi[i];
      
      let signal = null;
      
      // Long signal: Fast crosses above Slow + RSI confirmation
      if (prevFast <= prevSlow && currFast > currSlow && currRSI > 50) {
        signal = {
          type: 'LONG',
          price: data[i].close,
          timestamp: data[i].timestamp,
          reason: `EMA crossover + RSI ${currRSI.toFixed(1)}`
        };
      }
      // Short signal: Fast crosses below Slow + RSI confirmation
      else if (prevFast >= prevSlow && currFast < currSlow && currRSI < 50) {
        signal = {
          type: 'SHORT',
          price: data[i].close,
          timestamp: data[i].timestamp,
          reason: `EMA crossover + RSI ${currRSI.toFixed(1)}`
        };
      }
      
      signals.push({
        timestamp: data[i].timestamp,
        close: data[i].close,
        fastEMA: currFast,
        slowEMA: currSlow,
        rsi: currRSI,
        signal
      });
    }
    
    return signals;
  }

  // Run backtest
  backtest(data, initialCapital = 48) {
    console.log(`\n📊 BACKTEST: BTC/USDC Trend Following`);
    console.log(`Initial Capital: $${initialCapital}`);
    console.log(`Strategy: EMA ${this.fastEma}/${this.slowEma} + RSI ${this.rsiPeriod}`);
    console.log(`Stop Loss: ${this.stopLossPct}% | Take Profit: ${this.takeProfitPct}%`);
    console.log('=' .repeat(60));
    
    const signals = this.generateSignals(data);
    let capital = initialCapital;
    let position = null;
    let trades = [];
    let wins = 0;
    let losses = 0;
    
    for (const point of signals) {
      // Check exit conditions if in position
      if (position) {
        const priceChange = ((point.close - position.entryPrice) / position.entryPrice) * 100;
        const pnl = position.type === 'LONG' ? priceChange : -priceChange;
        
        // Stop loss hit
        if (pnl <= -this.stopLossPct) {
          const tradeValue = position.size * position.entryPrice;
          const loss = tradeValue * (this.stopLossPct / 100);
          const fee = tradeValue * (this.feePct / 100) * 2; // Entry + exit
          
          capital -= (loss + fee);
          losses++;
          
          trades.push({
            type: position.type,
            entry: position.entryPrice,
            exit: point.close,
            pnl: -loss - fee,
            exitReason: 'STOP_LOSS',
            timestamp: point.timestamp
          });
          
          console.log(`❌ STOP LOSS | ${position.type} | P&L: -$${(loss + fee).toFixed(2)}`);
          position = null;
        }
        // Take profit hit
        else if (pnl >= this.takeProfitPct) {
          const tradeValue = position.size * position.entryPrice;
          const profit = tradeValue * (this.takeProfitPct / 100);
          const fee = tradeValue * (this.feePct / 100) * 2;
          
          capital += (profit - fee);
          wins++;
          
          trades.push({
            type: position.type,
            entry: position.entryPrice,
            exit: point.close,
            pnl: profit - fee,
            exitReason: 'TAKE_PROFIT',
            timestamp: point.timestamp
          });
          
          console.log(`✅ TAKE PROFIT | ${position.type} | P&L: +$${(profit - fee).toFixed(2)}`);
          position = null;
        }
        // Signal reversal
        else if (point.signal && point.signal.type !== position.type) {
          // Close position and open new one
          const actualPnl = position.type === 'LONG' 
            ? ((point.close - position.entryPrice) / position.entryPrice) * 100
            : ((position.entryPrice - point.close) / position.entryPrice) * 100;
          
          const tradeValue = position.size * position.entryPrice;
          const pnlUSD = tradeValue * (actualPnl / 100);
          const fee = tradeValue * (this.feePct / 100) * 2;
          
          capital += (pnlUSD - fee);
          
          if (actualPnl > 0) wins++;
          else losses++;
          
          trades.push({
            type: position.type,
            entry: position.entryPrice,
            exit: point.close,
            pnl: pnlUSD - fee,
            exitReason: 'SIGNAL_REVERSE',
            timestamp: point.timestamp
          });
          
          console.log(`${actualPnl > 0 ? '✅' : '❌'} REVERSE | ${position.type} | P&L: ${actualPnl > 0 ? '+' : ''}$${(pnlUSD - fee).toFixed(2)}`);
          position = null;
        }
      }
      
      // Enter new position
      if (!position && point.signal) {
        const positionSize = (capital * this.maxPositionSize) / point.close;
        
        position = {
          type: point.signal.type,
          entryPrice: point.close,
          size: positionSize,
          timestamp: point.timestamp
        };
        
        console.log(`🚀 ENTRY | ${point.signal.type} @ $${point.close.toFixed(2)} | Size: ${positionSize.toFixed(6)} BTC | ${point.signal.reason}`);
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
      
      if (actualPnl > 0) wins++;
      else losses++;
      
      trades.push({
        type: position.type,
        entry: position.entryPrice,
        exit: lastPrice,
        pnl: pnlUSD - fee,
        exitReason: 'END_OF_DATA',
        timestamp: signals[signals.length - 1].timestamp
      });
      
      console.log(`${actualPnl > 0 ? '✅' : '❌'} CLOSE | ${position.type} @ $${lastPrice.toFixed(2)} | P&L: ${actualPnl > 0 ? '+' : ''}$${(pnlUSD - fee).toFixed(2)}`);
    }
    
    // Results
    console.log('\n' + '='.repeat(60));
    console.log('📈 BACKTEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Trades: ${trades.length}`);
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
    
    return {
      capital,
      trades,
      wins,
      losses,
      winRate: (wins / trades.length) * 100,
      totalReturn: ((capital - initialCapital) / initialCapital) * 100,
      profitFactor
    };
  }
}

module.exports = { BTCTrendStrategy };

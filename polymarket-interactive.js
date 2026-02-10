#!/usr/bin/env node
// Live Polymarket Scanner - Interactive market monitoring

const { PolymarketTrader } = require('./src/exchanges/polymarket');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function liveScanner() {
  console.log('\n' + '='.repeat(70));
  console.log('🔮 POLYMARKET LIVE SCANNER');
  console.log('='.repeat(70));
  console.log('Mode: Paper Trading (safe to test)');
  console.log('Press Ctrl+C to exit\n');

  // Initialize trader
  process.env.POLYMARKET_PRIVATE_KEY = process.env.POLYMARKET_PRIVATE_KEY || '0x' + '1'.repeat(64);

  const trader = new PolymarketTrader({
    paperTrading: true,
    minProfitThreshold: 0.002, // 0.2% minimum
    maxPositionSize: 100
  });

  await trader.initialize();

  let scanCount = 0;
  let opportunitiesFound = 0;
  let lastOpportunities = [];

  console.log('\n📊 Starting live market scan...\n');

  const scan = async () => {
    scanCount++;
    const timestamp = new Date().toLocaleTimeString();

    try {
      // Fetch fresh markets
      const markets = await trader.fetchActiveMarkets(10000, 7);

      // Scan top 10 markets by liquidity
      const topMarkets = markets
        .sort((a, b) => b.liquidity - a.liquidity)
        .slice(0, 10);

      const currentOpportunities = [];

      for (const market of topMarkets) {
        try {
          const opp = await trader.detectDutchBookArbitrage(market);
          if (opp) {
            currentOpportunities.push(opp);
          }
        } catch (e) {
          // Skip failed markets
        }
      }

      // Sort by profit
      currentOpportunities.sort((a, b) => b.profitPct - a.profitPct);

      // Display results
      process.stdout.write('\x1Bc'); // Clear screen
      console.log('='.repeat(70));
      console.log(`🔮 POLYMARKET LIVE SCANNER | ${timestamp}`);
      console.log('='.repeat(70));
      console.log(`Scan #${scanCount} | Markets: ${markets.length} | Opportunities: ${currentOpportunities.length}`);
      console.log('='.repeat(70));

      if (currentOpportunities.length > 0) {
        opportunitiesFound += currentOpportunities.length;
        lastOpportunities = currentOpportunities;

        console.log('\n🎯 OPPORTUNITIES FOUND:\n');

        currentOpportunities.slice(0, 5).forEach((opp, i) => {
          const profitColor = opp.profitPct > 0.01 ? '🟢' : opp.profitPct > 0.005 ? '🟡' : '⚪';
          console.log(`${profitColor} #${i + 1}: ${opp.market.question.substring(0, 50)}...`);
          console.log(`   YES: $${opp.yesAsk.toFixed(4)} | NO: $${opp.noAsk.toFixed(4)}`);
          console.log(`   Combined: $${opp.combinedCost.toFixed(4)} | Profit: ${(opp.profitPct * 100).toFixed(2)}%`);
          console.log(`   Expected: $${opp.expectedProfit.toFixed(2)} | Size: $${opp.maxTradeSize.toFixed(0)}`);
          console.log('');
        });

        // Auto-execute best if >1% profit
        const best = currentOpportunities[0];
        if (best.profitPct > 0.01) {
          console.log('🚀 AUTO-EXECUTING BEST OPPORTUNITY (Paper Trade)\n');
          await trader.executeDutchBookArbitrage(best);
        }
      } else {
        console.log('\n⏳ No arbitrage opportunities found');
        console.log('   (Combined YES+NO prices >= $1.00 on all markets)\n');

        if (lastOpportunities.length > 0) {
          console.log('📋 Last seen opportunities:\n');
          lastOpportunities.slice(0, 3).forEach((opp, i) => {
            console.log(`   ${i + 1}. ${opp.market.question.substring(0, 40)}...`);
            console.log(`      Profit was: ${(opp.profitPct * 100).toFixed(2)}%`);
          });
        }
      }

      console.log('\n' + '='.repeat(70));
      console.log('Stats:');
      console.log(`  Total scans: ${scanCount}`);
      console.log(`  Opportunities found: ${opportunitiesFound}`);
      console.log(`  Next scan in: 10 seconds...`);
      console.log('='.repeat(70));

    } catch (error) {
      console.error('Scan error:', error.message);
    }

    setTimeout(scan, 10000); // Scan every 10 seconds
  };

  // Handle exit
  process.on('SIGINT', () => {
    console.log('\n\n👋 Stopping scanner...');
    console.log(`Final stats: ${scanCount} scans, ${opportunitiesFound} opportunities found`);
    rl.close();
    process.exit(0);
  });

  // Start scanning
  scan();
}

// Interactive menu
async function showMenu() {
  console.log('\n' + '='.repeat(70));
  console.log('🔮 POLYMARKET TEST SUITE');
  console.log('='.repeat(70));
  console.log('');
  console.log('1. Live Scanner (continuous monitoring)');
  console.log('2. Single Scan (one-time market check)');
  console.log('3. Test Dutch Book Logic (mock data)');
  console.log('4. View Top Markets by Liquidity');
  console.log('5. Exit');
  console.log('');

  rl.question('Select option (1-5): ', async (answer) => {
    switch(answer.trim()) {
      case '1':
        await liveScanner();
        break;
      case '2':
        await singleScan();
        break;
      case '3':
        await testDutchBookLogic();
        break;
      case '4':
        await viewTopMarkets();
        break;
      case '5':
        console.log('👋 Goodbye!');
        rl.close();
        process.exit(0);
        break;
      default:
        console.log('Invalid option');
        showMenu();
    }
  });
}

async function singleScan() {
  console.log('\n📊 Running single market scan...\n');

  process.env.POLYMARKET_PRIVATE_KEY = process.env.POLYMARKET_PRIVATE_KEY || '0x' + '1'.repeat(64);

  const trader = new PolymarketTrader({
    paperTrading: true,
    minProfitThreshold: 0.002
  });

  await trader.initialize();
  const opportunities = await trader.scanAllMarkets();

  if (opportunities.length === 0) {
    console.log('\n❌ No profitable arbitrage opportunities found.');
    console.log('This is normal - markets are usually efficient.');
  }

  rl.question('\nPress Enter to return to menu...', () => showMenu());
}

async function testDutchBookLogic() {
  console.log('\n🧪 Testing Dutch Book Logic with Mock Data\n');
  console.log('='.repeat(70));

  const testCases = [
    { name: 'Perfect Arbitrage', yes: 0.48, no: 0.49, expected: true, profit: 0.0309 },
    { name: 'Small Profit', yes: 0.495, no: 0.495, expected: true, profit: 0.0101 },
    { name: 'Break Even', yes: 0.50, no: 0.50, expected: false, profit: 0 },
    { name: 'Loss (Over $1)', yes: 0.55, no: 0.48, expected: false, profit: -0.03 },
    { name: 'Extreme Arb', yes: 0.40, no: 0.45, expected: true, profit: 0.1765 }
  ];

  for (const test of testCases) {
    const combined = test.yes + test.no;
    const actualProfit = (1 - combined) / combined;
    const isArbitrage = combined < 1.0 && actualProfit >= 0.002;

    const status = isArbitrage === test.expected ? '✅' : '❌';
    const result = isArbitrage ? 'ARBITRAGE' : 'NO ARBITRAGE';

    console.log(`${status} ${test.name}`);
    console.log(`   YES: $${test.yes.toFixed(3)} + NO: $${test.no.toFixed(3)} = $${combined.toFixed(3)}`);
    console.log(`   Expected: ${test.expected ? 'Arbitrage' : 'No Arbitrage'} | Got: ${result}`);
    if (isArbitrage) {
      console.log(`   Profit: ${(actualProfit * 100).toFixed(2)}%`);
    }
    console.log('');
  }

  console.log('='.repeat(70));
  console.log('Dutch Book Formula: Profit = (1 - (YES + NO)) / (YES + NO)');
  console.log('Arbitrage exists when: YES + NO < $1.00\n');

  rl.question('Press Enter to return to menu...', () => showMenu());
}

async function viewTopMarkets() {
  console.log('\n📈 Fetching top markets by liquidity...\n');

  process.env.POLYMARKET_PRIVATE_KEY = process.env.POLYMARKET_PRIVATE_KEY || '0x' + '1'.repeat(64);

  const trader = new PolymarketTrader({ paperTrading: true });
  await trader.initialize();

  const markets = await trader.fetchActiveMarkets(10000, 30); // Up to 30 days

  // Sort by liquidity
  const topMarkets = markets.sort((a, b) => b.liquidity - a.liquidity).slice(0, 10);

  console.log('='.repeat(70));
  console.log('TOP 10 MARKETS BY LIQUIDITY');
  console.log('='.repeat(70));

  topMarkets.forEach((m, i) => {
    const daysLeft = m.endDate ? Math.ceil((new Date(m.endDate) - Date.now()) / (1000 * 60 * 60 * 24)) : '?';
    console.log(`${i + 1}. ${m.question.substring(0, 55)}...`);
    console.log(`   Liquidity: $${m.liquidity.toLocaleString()} | Ends: ${daysLeft} days`);
    console.log(`   Outcomes: ${m.outcomes.join(' / ')}`);
    console.log('');
  });

  rl.question('Press Enter to return to menu...', () => showMenu());
}

// Start
showMenu();

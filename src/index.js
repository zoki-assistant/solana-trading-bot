// Main bot entry point
const { loadWallet } = require('./utils/wallet');
const { ConnectionManager } = require('./utils/connection');
const { ArbitrageStrategy } = require('./strategies/arbitrage');

const PAPER_TRADING = process.argv.includes('--paper');
const SINGLE_RUN = process.argv.includes('--single'); // Run once, exit

async function main() {
  console.log('🤖 Solana Trading Bot v0.1.0');
  console.log(PAPER_TRADING ? '📄 PAPER TRADING MODE' : '💰 LIVE TRADING MODE');
  console.log(SINGLE_RUN ? '▶️  SINGLE RUN MODE' : '🔄 LOOP MODE');
  console.log('─'.repeat(50));

  // Load wallet
  let wallet;
  try {
    wallet = loadWallet();
    console.log('👛 Wallet loaded:', wallet.publicKey);
  } catch (error) {
    console.error('❌ Failed to load wallet:', error.message);
    process.exit(1);
  }

  // Connect to Solana
  const connectionManager = new ConnectionManager('mainnet');
  connectionManager.connect();

  // Check balance
  try {
    const balance = await connectionManager.getBalance(wallet.address);
    console.log('💰 Balance:', balance.toFixed(4), 'SOL');
    
    if (balance < 0.01) {
      console.log('⚠️  Low balance. Fund wallet to activate trading.');
      console.log('   Address:', wallet.publicKey);
    }
  } catch (error) {
    console.error('❌ Failed to get balance:', error.message);
  }

  // Initialize strategies
  const strategies = {
    arbitrage: new ArbitrageStrategy({
      minProfitPercent: 0.5,
      tradeSize: 0.1
    })
  };

  // Single run mode (for containers/cron)
  if (SINGLE_RUN) {
    console.log('\n🔍 Running single scan...');
    console.log('─'.repeat(50));

    try {
      const opportunities = await strategies.arbitrage.findArbitrageOpportunities();
      
      if (opportunities.length > 0) {
        console.log(`✅ Found ${opportunities.length} opportunities`);
        // Log to TRADING.md
        logOpportunity(opportunities);
      } else {
        console.log('⏸️  No opportunities found');
      }
    } catch (error) {
      console.error('❌ Strategy error:', error.message);
    }

    console.log('\n👋 Single run complete');
    process.exit(0);
  }

  // Loop mode
  console.log('\n🚀 Starting trading loop...');
  console.log('─'.repeat(50));

  let iterations = 0;
  const maxIterations = PAPER_TRADING ? 3 : 100; // Limit for container safety
  const startTime = Date.now();
  const maxRuntime = 30000; // 30 seconds max in containers

  while (iterations < maxIterations) {
    iterations++;
    console.log(`\n📊 Iteration ${iterations}/${maxIterations}`);

    try {
      // Check runtime limit
      if (Date.now() - startTime > maxRuntime) {
        console.log('⏰ Runtime limit reached, exiting gracefully');
        break;
      }

      // Run arbitrage strategy
      const opportunities = await strategies.arbitrage.findArbitrageOpportunities();
      
      if (opportunities.length > 0) {
        console.log(`✅ Found ${opportunities.length} opportunities`);
        
        if (!PAPER_TRADING) {
          // Execute trades
          for (const opp of opportunities) {
            const result = await strategies.arbitrage.execute(opp);
            console.log('Execution result:', result);
          }
        }
      } else {
        console.log('⏸️  No opportunities found');
      }

    } catch (error) {
      console.error('❌ Strategy error:', error.message);
    }

    // Wait before next iteration (shorter in containers)
    if (iterations < maxIterations) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2s instead of 5s
    }
  }

  console.log('\n👋 Bot stopped');
  process.exit(0); // Ensure clean exit
}

function logOpportunity(opportunities) {
  // Simple logging for now - could write to TRADING.md
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${opportunities.length} opportunities detected`);
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down...');
  process.exit(0);
});

// Run bot
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

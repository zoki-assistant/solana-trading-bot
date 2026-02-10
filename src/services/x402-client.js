// x402 Client for Buying Arbitrage Signals
// Agents can use this to pay for signals via USDC

const axios = require('axios');
const { createWalletClient, http, parseUnits, formatUnits } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { baseSepolia, base } = require('viem/chains');

class X402ArbitrageClient {
  constructor(config = {}) {
    this.serverUrl = config.serverUrl || 'http://localhost:4020';
    this.apiKey = config.apiKey;
    
    // Wallet setup
    const privateKey = config.privateKey || process.env.X402_WALLET_KEY;
    if (privateKey) {
      const chain = config.chain === 'mainnet' ? base : baseSepolia;
      const account = privateKeyToAccount(privateKey);
      this.wallet = createWalletClient({
        account,
        chain,
        transport: http(config.rpcUrl)
      });
      this.address = account.address;
    }
    
    this.payments = [];
  }

  // Get pricing info
  async getPrice(resource) {
    try {
      const response = await axios.get(`${this.serverUrl}/price/${resource}`);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to get price:', error.message);
      return null;
    }
  }

  // Get arbitrage signal (handles payment flow)
  async getSignal(exchange, pair) {
    try {
      // Try to get signal without payment first
      const response = await axios.get(
        `${this.serverUrl}/signal/${exchange}/${pair}`,
        {
          headers: this.apiKey ? { 'x-api-key': this.apiKey } : {}
        }
      );
      
      return response.data;
    } catch (error) {
      if (error.response?.status === 402) {
        // Payment required
        console.log('💰 Payment required for signal');
        const paymentInfo = error.response.data;
        
        if (!this.wallet) {
          console.error('❌ No wallet configured. Set X402_WALLET_KEY env var.');
          return null;
        }
        
        // Pay for the signal
        const txHash = await this.makePayment(paymentInfo);
        if (!txHash) {
          return null;
        }
        
        // Retry with payment proof
        const response = await axios.get(
          `${this.serverUrl}/signal/${exchange}/${pair}`,
          {
            headers: {
              'x-payment-signature': txHash,
              ...(this.apiKey ? { 'x-api-key': this.apiKey } : {})
            }
          }
        );
        
        return response.data;
      }
      
      console.error('❌ Failed to get signal:', error.message);
      return null;
    }
  }

  // Make USDC payment
  async makePayment(paymentInfo) {
    try {
      const { priceWei, usdcAddress } = paymentInfo;
      
      console.log(`💸 Paying ${formatUnits(BigInt(priceWei), 6)} USDC...`);
      
      // ERC-20 transfer (simplified - would need proper ABI in production)
      const txHash = await this.wallet.writeContract({
        address: usdcAddress,
        abi: [
          {
            name: 'transfer',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'amount', type: 'uint256' }
            ],
            outputs: [{ type: 'bool' }]
          }
        ],
        functionName: 'transfer',
        args: [
          '0xServerWalletAddress', // Would be server's address
          BigInt(priceWei)
        ]
      });
      
      console.log(`✅ Payment sent: ${txHash}`);
      this.payments.push({
        txHash,
        amount: formatUnits(BigInt(priceWei), 6),
        timestamp: new Date().toISOString()
      });
      
      return txHash;
    } catch (error) {
      console.error('❌ Payment failed:', error.message);
      return null;
    }
  }

  // Subscribe to daily alerts
  async subscribeDaily() {
    if (!this.wallet) {
      console.error('❌ No wallet configured');
      return null;
    }
    
    try {
      // Get price first
      const priceInfo = await this.getPrice('daily-alerts');
      if (!priceInfo) return null;
      
      // Make payment
      const txHash = await this.makePayment(priceInfo);
      if (!txHash) return null;
      
      // Subscribe
      const response = await axios.post(`${this.serverUrl}/subscribe/daily`, {
        walletAddress: this.address,
        txHash
      });
      
      return response.data;
    } catch (error) {
      console.error('❌ Subscription failed:', error.message);
      return null;
    }
  }

  // Get latest signals (for subscribers)
  async getLatestSignals() {
    if (!this.address) {
      console.error('❌ No wallet address');
      return null;
    }
    
    try {
      const response = await axios.get(`${this.serverUrl}/signals/latest`, {
        headers: {
          'x-wallet-address': this.address
        }
      });
      
      return response.data;
    } catch (error) {
      if (error.response?.status === 402) {
        console.log('💰 Subscription required');
        console.log('Run: client.subscribeDaily()');
      } else {
        console.error('❌ Failed to get signals:', error.message);
      }
      return null;
    }
  }

  // Check service health
  async healthCheck() {
    try {
      const response = await axios.get(`${this.serverUrl}/health`);
      return response.data;
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      return null;
    }
  }

  // Get payment history
  getPaymentHistory() {
    return this.payments;
  }
}

module.exports = { X402ArbitrageClient };

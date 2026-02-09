// Solana connection manager
const { Connection, clusterApiUrl, Commitment } = require('@solana/web3.js');

const RPC_ENDPOINTS = {
  mainnet: [
    'https://api.mainnet-beta.solana.com',  // Public (rate limited)
    'https://solana-api.projectserum.com',   // Project Serum
    clusterApiUrl('mainnet-beta')             // Solana Labs
  ],
  devnet: [
    clusterApiUrl('devnet')
  ]
};

class ConnectionManager {
  constructor(network = 'mainnet', commitment = 'confirmed') {
    this.network = network;
    this.commitment = commitment;
    this.connection = null;
    this.endpointIndex = 0;
  }

  connect() {
    const endpoints = RPC_ENDPOINTS[this.network] || RPC_ENDPOINTS.mainnet;
    const endpoint = endpoints[this.endpointIndex % endpoints.length];
    
    this.connection = new Connection(endpoint, this.commitment);
    console.log(`🔗 Connected to Solana ${this.network}: ${endpoint}`);
    
    return this.connection;
  }

  async getBalance(publicKey) {
    if (!this.connection) this.connect();
    const balance = await this.connection.getBalance(publicKey);
    return balance / 1e9; // Convert lamports to SOL
  }

  async getSlot() {
    if (!this.connection) this.connect();
    return await this.connection.getSlot();
  }

  async getBlockTime(slot) {
    if (!this.connection) this.connect();
    return await this.connection.getBlockTime(slot);
  }
}

module.exports = { ConnectionManager };

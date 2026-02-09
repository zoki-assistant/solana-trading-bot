// Load wallet from secure storage
const fs = require('fs');
const path = require('path');
const { Keypair } = require('@solana/web3.js');

function loadWallet() {
  const walletPath = path.join(__dirname, '../../.wallets.json');
  
  if (!fs.existsSync(walletPath)) {
    throw new Error('Wallet file not found. Generate wallets first.');
  }
  
  const wallets = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  
  if (!wallets.solana) {
    throw new Error('Solana wallet not found in wallet file.');
  }
  
  // Create keypair from secret key
  const secretKey = Buffer.from(wallets.solana.secretKeyBase64, 'base64');
  const keypair = Keypair.fromSecretKey(secretKey);
  
  return {
    publicKey: keypair.publicKey.toBase58(),
    keypair: keypair,
    address: keypair.publicKey
  };
}

module.exports = { loadWallet };

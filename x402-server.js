#!/usr/bin/env node
// x402 Arbitrage Signal Service - Run this to start the payment server

const { X402ArbitrageService } = require('./src/services/x402-server');

const service = new X402ArbitrageService({
  port: process.env.PORT || 4020,
  chain: process.env.CHAIN || 'sepolia', // 'sepolia' or 'mainnet'
  rpcUrl: process.env.RPC_URL,
  signalPrice: process.env.SIGNAL_PRICE || '0.01',      // $0.01 per signal
  dailyPrice: process.env.DAILY_PRICE || '0.50',        // $0.50 per day
  weeklyPrice: process.env.WEEKLY_PRICE || '2.00'       // $2.00 per week
});

service.start();

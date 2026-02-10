#!/bin/bash
# x402 Payment Service Deployment Script
# Run this to start the x402 arbitrage signal server

echo "=========================================="
echo "🚀 x402 PAYMENT SERVICE DEPLOYMENT"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "x402-server.js" ]; then
    echo "❌ Error: x402-server.js not found"
    echo "Please run this from solana-trading-bot directory"
    exit 1
fi

# Install dependencies if needed
echo "📦 Checking dependencies..."
if ! npm list express viem 2>/dev/null | grep -q "express\|viem"; then
    echo "Installing required packages..."
    npm install express viem
fi

echo "✅ Dependencies ready"
echo ""

# Set default environment
echo "⚙️  Configuration:"
echo "   Network: Base Sepolia (testnet)"
echo "   Port: 4020"
echo "   Signal Price: $0.01 USDC"
echo "   Daily Price: $0.50 USDC"
echo ""

# Start the server
echo "🚀 Starting x402 server..."
echo "   Press Ctrl+C to stop"
echo ""
echo "=========================================="

export PORT=4020
export CHAIN=sepolia
export SIGNAL_PRICE=0.01
export DAILY_PRICE=0.50
export WEEKLY_PRICE=2.00

node x402-server.js

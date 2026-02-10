#!/bin/bash
# Telegram Bot Setup Script
# Run this to set up Telegram alerts for trades

echo "========================================"
echo "📱 TELEGRAM BOT SETUP"
echo "========================================"
echo ""

# Step 1: Create Bot with BotFather
echo "Step 1: Create a Telegram Bot"
echo "1. Open Telegram and search for @BotFather"
echo "2. Send /newbot"
echo "3. Name your bot (e.g., ZokiTradingAlerts)"
echo "4. Choose username (e.g., zoki_trading_bot)"
echo "5. Copy the API token (looks like: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz)"
echo ""
read -p "Enter your bot API token: " BOT_TOKEN

# Step 2: Get Chat ID
echo ""
echo "Step 2: Get Your Chat ID"
echo "1. Send a message to your new bot"
echo "2. Visit: https://api.telegram.org/bot$BOT_TOKEN/getUpdates"
echo "3. Look for 'chat': {'id': 123456789}"
echo ""
read -p "Enter your chat ID: " CHAT_ID

# Step 3: Test
echo ""
echo "Step 3: Testing Telegram Bot..."
curl -s -X POST https://api.telegram.org/bot$BOT_TOKEN/sendMessage \
  -d chat_id=$CHAT_ID \
  -d text="🦀 Zoki Trading Bot Activated! Alerts will be sent here for every trade."

echo ""
echo "✅ Bot configured!"
echo ""
echo "Add these to your .env file:"
echo "TELEGRAM_BOT_TOKEN=$BOT_TOKEN"
echo "TELEGRAM_CHAT_ID=$CHAT_ID"
echo ""

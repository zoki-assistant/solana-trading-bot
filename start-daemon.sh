#!/bin/bash
# Start trading bot daemon and notification relay

cd "$(dirname "$0")"

# Create logs directory
mkdir -p logs

# Export Telegram token if available
export TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-8452626077:AAG6bvVmKc2OPYHji1S1opsm0ywqRPO6Ybk}"

echo "🚀 Starting Solana Trading Bot Daemon..."
echo "📊 Market scans: every 20s"
echo "📈 Position checks: every 10s"
echo "💓 Heartbeat: every 5min"
echo "📱 Telegram alerts: enabled"
echo "────────────────────────────────────────"

# Start daemon in background
node src/daemon.js &
DAEMON_PID=$!

# Start telegram relay in background
node src/telegram-relay.js &
RELAY_PID=$!

echo "✅ Daemon PID: $DAEMON_PID"
echo "✅ Relay PID: $RELAY_PID"
echo ""
echo "Logs: tail -f logs/bot.log"
echo "Heartbeat: cat logs/heartbeat.json"
echo ""
echo "Stop: kill $DAEMON_PID $RELAY_PID"

# Wait for both processes
wait $DAEMON_PID $RELAY_PID

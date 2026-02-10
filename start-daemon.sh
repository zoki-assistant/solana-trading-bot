#!/bin/bash
# Start trading bot daemon and notification relay

cd "$(dirname "$0")"

# Create logs directory
mkdir -p logs

# Telegram token MUST be set in environment
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo "⚠️  Warning: TELEGRAM_BOT_TOKEN not set"
    echo "    Telegram alerts will be queued to logs/telegram-queue.jsonl"
fi

echo "🚀 Starting Solana Trading Bot Daemon..."
echo "📊 Market scans: every 20s"
echo "📈 Position checks: every 10s"
echo "💓 Heartbeat: every 5min"
echo "📱 Telegram alerts: ${TELEGRAM_BOT_TOKEN:+enabled}${TELEGRAM_BOT_TOKEN:-queued to file}"
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

// Telegram notification relay - monitors bot logs and sends alerts
const fs = require('fs');
const path = require('path');

const URGENT_FILE = path.join(__dirname, '../logs/urgent-notification.json');
const NOTIF_FILE = path.join(__dirname, '../logs/notifications.jsonl');
const LAST_PROCESSED = path.join(__dirname, '../logs/.last-notification');

// Telegram config (from env or config)
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = '8179910664'; // Srđan's ID

class TelegramRelay {
  constructor() {
    this.lastCheck = Date.now();
  }

  log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  async sendTelegram(message) {
    if (!TELEGRAM_TOKEN) {
      this.log('No Telegram token configured');
      // Write to file for manual pickup
      const alertFile = path.join(__dirname, '../logs/telegram-queue.jsonl');
      fs.appendFileSync(alertFile, JSON.stringify({ timestamp: new Date().toISOString(), message }) + '\n');
      return;
    }

    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'Markdown'
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      this.log('Telegram sent successfully');
    } catch (error) {
      this.log(`Telegram send failed: ${error.message}`);
      // Queue for retry
      const alertFile = path.join(__dirname, '../logs/telegram-queue.jsonl');
      fs.appendFileSync(alertFile, JSON.stringify({ timestamp: new Date().toISOString(), message }) + '\n');
    }
  }

  formatMessage(notification) {
    const { event, message, data } = notification;
    
    let emoji = '📊';
    if (event.includes('ERROR')) emoji = '❌';
    if (event.includes('TRADE')) emoji = '💰';
    if (event.includes('OPPORTUNITY')) emoji = '🎯';
    if (event.includes('BALANCE')) emoji = '⚠️';
    if (event.includes('DAEMON')) emoji = '🤖';

    let formatted = `${emoji} **${event}**\n\n${message}`;
    
    if (data) {
      formatted += '\n\n📋 *Details:*';
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'object') {
          formatted += `\n• ${key}: ${JSON.stringify(value).substring(0, 100)}`;
        } else {
          formatted += `\n• ${key}: ${value}`;
        }
      }
    }
    
    formatted += '\n\n🦀 Zoki Bot';
    return formatted;
  }

  async checkUrgent() {
    try {
      if (!fs.existsSync(URGENT_FILE)) return;
      
      const stat = fs.statSync(URGENT_FILE);
      if (stat.mtimeMs <= this.lastCheck) return;
      
      const notification = JSON.parse(fs.readFileSync(URGENT_FILE, 'utf8'));
      const message = this.formatMessage(notification);
      
      await this.sendTelegram(message);
      
      // Archive processed notification
      const archiveDir = path.join(__dirname, '../logs/processed');
      fs.mkdirSync(archiveDir, { recursive: true });
      fs.renameSync(
        URGENT_FILE,
        path.join(archiveDir, `${Date.now()}-${notification.event}.json`)
      );
      
      this.lastCheck = Date.now();
    } catch (error) {
      this.log(`Error processing urgent: ${error.message}`);
    }
  }

  async run() {
    this.log('Telegram relay started');
    
    // Check every 5 seconds for urgent notifications
    setInterval(() => this.checkUrgent(), 5000);
    
    // Keep alive
    setInterval(() => {}, 1000);
  }
}

const relay = new TelegramRelay();
relay.run();

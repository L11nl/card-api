const express = require('express');
const axios = require('axios');
const cors = require('cors');

// ====== إعدادات ======
const TELEGRAM_TOKEN = "2006778841:AAEGzMAkfk_CtdAvgK-M5pPx8wJlXMqhzEI";
const API = "https://api.node-card.com";

// ====== سيرفر ======
const app = express();
app.use(cors());
app.use(express.json());

// ====== تيليجرام ======
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// ====== API الصفحة ======
app.get('/', (req, res) => {
res.send('API + BOT شغال 🔥');
});

// ====== استبدال ======
app.post('/redeem', async (req, res) => {
try {
const { card_key, merchant_dict_id, platform_id } = req.body;

const params = new URLSearchParams();
params.append('card_key', card_key);
if(merchant_dict_id) params.append('merchant_dict_id', merchant_dict_id);
if(platform_id) params.append('platform_id', platform_id);

const r = await axios.post(API + '/api/open/card/redeem', params, {
  headers:{'Content-Type':'application/x-www-form-urlencoded'}
});

res.json(r.data);

} catch {
res.json({ code:0, msg:"خطأ ❌" });
}
});

// ====== حالة ======
app.post('/status', async (req, res) => {
const params = new URLSearchParams();
params.append('card_key', req.body.card_key);

const r = await axios.post(API + '/api/open/card/status', params, {
headers:{'Content-Type':'application/x-www-form-urlencoded'}
});

res.json(r.data);
});

// ====== العمليات ======
app.post('/transactions', async (req, res) => {
const params = new URLSearchParams();
params.append('card_key', req.body.card_key);

const r = await axios.post(API + '/api/open/card/transactions', params, {
headers:{'Content-Type':'application/x-www-form-urlencoded'}
});

res.json(r.data);
});

// ====== بوت تيليجرام ======
bot.on('message', async (msg) => {
const chatId = msg.chat.id;
const text = msg.text;

if (!text || text.startsWith("/")) return;

try {
const r = await axios.post('http://localhost:' + (process.env.PORT || 3000) + '/redeem', {
card_key: text
});

const d = r.data;

if (d.code === 1) {
  bot.sendMessage(chatId,
    "✅ تم الاستبدال\n\n" +
    "💳 رقم: " + d.data.card_number + "\n" +
    "🔐 CVV: " + d.data.cvv + "\n" +
    "📅 انتهاء: " + d.data.exp
  );
} else {
  bot.sendMessage(chatId, "❌ " + d.msg);
}

} catch {
bot.sendMessage(chatId, "❌ خطأ بالسيرفر");
}
});

app.listen(process.env.PORT || 3000);

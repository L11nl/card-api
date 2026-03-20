const express = require('express');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());

// 🔑 حط توكنك هنا فقط
2006778841:AAEGzMAkfk_CtdAvgK-M5pPx8wJlXMqhzEI

// 🤖 تشغيل البوت
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// رسالة البداية
bot.onText(//start/, (msg) => {
bot.sendMessage(msg.chat.id, "👋 أهلاً بك!\nارسل كود البطاقة للاستبدال.");
});

// استقبال الكود
bot.on('message', async (msg) => {
if (!msg.text || msg.text.startsWith("/")) return;

const chatId = msg.chat.id;
const card_key = msg.text;

bot.sendMessage(chatId, "⏳ جاري الاستبدال...");

try {
const params = new URLSearchParams();
params.append('card_key', card_key);

const response = await axios.post(
  'https://api.node-card.com/api/open/card/redeem',
  params,
  {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }
);

const data = response.data;

if (data.code !== 1) {
  return bot.sendMessage(chatId, "❌ " + data.msg);
}

const card = data.data;

bot.sendMessage(chatId, `

💳 البطاقة:

رقم: ${card.card_number}
CVV: ${card.cvv}
تاريخ: ${card.exp}

💰 الرصيد: ${card.available_amount}
🏪 التاجر: ${card.merchant_name}
`);

} catch (err) {
bot.sendMessage(chatId, "❌ خطأ بالسيرفر");
}
});

// API للموقع
app.post('/redeem', async (req, res) => {
try {
const { card_key } = req.body;

const params = new URLSearchParams();
params.append('card_key', card_key);

const response = await axios.post(
  'https://api.node-card.com/api/open/card/redeem',
  params,
  {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }
);

res.json(response.data);

} catch (err) {
res.json({ code: 0, msg: "خطأ بالسيرفر" });
}
});

// صفحة رئيسية
app.get('/', (req, res) => {
res.send("API + BOT شغال 🔥");
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server Running"));

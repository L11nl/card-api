const express = require('express');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());

// 🔑 التوكن
const TOKEN = "2006778841:AAEGzMAkfk_CtdAvgK-M5pPx8wJlXMqhzEI";

// ⚠️ مهم: بدون polling حتى ما يخرب Railway
const bot = new TelegramBot(TOKEN);

// تشغيل البوت
bot.setWebHook("${process.env.RAILWAY_STATIC_URL}/bot${TOKEN}");

// استقبال رسائل البوت
app.post("/bot${TOKEN}", (req, res) => {
bot.processUpdate(req.body);
res.sendStatus(200);
});

// رسالة البداية
bot.onText(//start/, (msg) => {
bot.sendMessage(msg.chat.id, "👋 اهلا بك، ارسل كود البطاقة");
});

// استقبال الكود
bot.on("message", async (msg) => {
if (!msg.text || msg.text.startsWith("/")) return;

const chatId = msg.chat.id;

try {
const params = new URLSearchParams();
params.append("card_key", msg.text);

const response = await axios.post(
  "https://api.node-card.com/api/open/card/redeem",
  params,
  {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  }
);

const data = response.data;

if (data.code !== 1) {
  return bot.sendMessage(chatId, "❌ " + data.msg);
}

const c = data.data;

bot.sendMessage(chatId, `

💳 البطاقة:
${c.card_number}
CVV: ${c.cvv}
EXP: ${c.exp}

💰 ${c.available_amount}
🏪 ${c.merchant_name}
`);

} catch (e) {
bot.sendMessage(chatId, "❌ خطأ");
}
});

// صفحة رئيسية
app.get("/", (req, res) => {
res.send("API شغال 🔥");
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running"));

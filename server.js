const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

// 🔑 حط توكن البوت هنا
const TOKEN = "2006778841:AAEGzMAkfk_CtdAvgK-M5pPx8wJlXMqhzEI";

// إنشاء البوت (webhook)
const bot = new TelegramBot(TOKEN);

// تشغيل webhook
const URL = "https://card-api-production-14f0.up.railway.app";

bot.setWebHook(`${URL}/bot${TOKEN}`);

// استقبال طلبات تيليجرام
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// رسالة /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "👋 هلا، ارسل كود البطاقة للاستبدال");
});

// استقبال الكود
bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;

  try {
    bot.sendMessage(chatId, "⏳ جاري الاستبدال...");

    const params = new URLSearchParams();
    params.append("card_key", msg.text);

    const response = await axios.post(
      "https://api.node-card.com/api/open/card/redeem",
      params,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const data = response.data;

    if (data.code !== 1) {
      return bot.sendMessage(chatId, "❌ " + data.msg);
    }

    const card = data.data;

    bot.sendMessage(
      chatId,
      `💳 البطاقة:

رقم: ${card.card_number}
CVV: ${card.cvv}
تاريخ: ${card.exp}

💰 الرصيد: ${card.available_amount}
🏪 المتجر: ${card.merchant_name}`
    );
  } catch (err) {
    bot.sendMessage(chatId, "❌ صار خطأ بالسيرفر");
  }
});

// API موقعك
app.post("/redeem", async (req, res) => {
  try {
    const { card_key } = req.body;

    const params = new URLSearchParams();
    params.append("card_key", card_key);

    const response = await axios.post(
      "https://api.node-card.com/api/open/card/redeem",
      params,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    res.json(response.data);
  } catch (err) {
    res.json({ code: 0, msg: "خطأ بالسيرفر" });
  }
});

// الصفحة الرئيسية
app.get("/", (req, res) => {
  res.send("API + BOT شغال 🔥");
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

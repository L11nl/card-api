const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

// 🔑 حط التوكن هنا
const TOKEN = "2006778841:AAEGzMAkfk_CtdAvgK-M5pPx8wJlXMqhzEI";

// 🤖 تشغيل البوت
const bot = new TelegramBot(TOKEN, { polling: true });

// 📦 تخزين بيانات المستخدم
let userData = {};
let merchants = {};

// 🔄 تحميل التجار
async function loadMerchants() {
  try {
    const res = await axios.get("https://api.node-card.com/api/open/merchant/list");

    res.data.data.forEach((m) => {
      merchants[m.name] = m.id;
    });

    console.log("✅ تم تحميل التجار");
  } catch (err) {
    console.log("❌ خطأ بتحميل التجار");
  }
}

// تحميلهم بالبداية
loadMerchants();

// 🟢 /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  // إذا بعدهم ما محملين
  if (Object.keys(merchants).length === 0) {
    await loadMerchants();
  }

  const buttons = Object.keys(merchants).map((name) => [name]);

  bot.sendMessage(chatId, "👋 اختر التاجر:", {
    reply_markup: {
      keyboard: buttons,
      resize_keyboard: true,
    },
  });
});

// 📩 استقبال الرسائل
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith("/")) return;

  // 🔍 يبحث حتى لو الاسم مو مطابق 100%
  const found = Object.keys(merchants).find((name) =>
    name.toLowerCase().includes(text.toLowerCase())
  );

  // ✅ اختيار التاجر
  if (found) {
    userData[chatId] = {
      merchant: merchants[found],
    };

    return bot.sendMessage(chatId, `✅ تم اختيار: ${found}\n\n✍️ ارسل كود البطاقة:`);
  }

  // ❗ إذا ما اختار تاجر
  if (!userData[chatId]) {
    return bot.sendMessage(chatId, "❗ لازم تختار التاجر أولاً /start");
  }

  // 💳 تنفيذ الاستبدال
  try {
    bot.sendMessage(chatId, "⏳ جاري الاستبدال...");

    const params = new URLSearchParams();
    params.append("card_key", text);
    params.append("merchant_dict_id", userData[chatId].merchant);
    params.append("platform_id", "1");

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
    console.log(err);
    bot.sendMessage(chatId, "❌ صار خطأ بالسيرفر");
  }
});

// 🌐 صفحة Railway
app.get("/", (req, res) => {
  res.send("Bot is running 🔥");
});

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});

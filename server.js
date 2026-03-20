const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

const TOKEN = "2006778841:AAEGzMAkfk_CtdAvgK-M5pPx8wJlXMqhzEI";

const bot = new TelegramBot(TOKEN, { polling: true });

// 🧠 تخزين
let userData = {};
let userLang = {};

// 🌍 النصوص
const texts = {
  en: {
    chooseLang: "🌍 Choose language:",
    chooseMerchant: "👋 Choose merchant:",
    sendCard: "✍️ Send card code:",
    processing: "⏳ Processing...",
    done: "✅ Done!",
    error: "❌ Error",
    selected: "✅ Selected:"
  },
  ar: {
    chooseLang: "🌍 اختر اللغة:",
    chooseMerchant: "👋 اختر التاجر:",
    sendCard: "✍️ ارسل كود البطاقة:",
    processing: "⏳ جاري الاستبدال...",
    done: "✅ تم",
    error: "❌ خطأ",
    selected: "✅ تم اختيار:"
  }
};

// 🛒 التجار (عربي + انجليزي)
const merchants = [
  { id: "4", en: "Spotify", ar: "سبوتيفاي" },
  { id: "5", en: "YouTube", ar: "يوتيوب" },
  { id: "6", en: "OpenAI (ChatGPT)", ar: "شات جي بي تي" },
  { id: "7", en: "Amazon", ar: "أمازون" },
  { id: "8", en: "Google Cloud", ar: "جوجل كلاود" },
  { id: "9", en: "Microsoft", ar: "مايكروسوفت" },
  { id: "10", en: "LinkedIn", ar: "لينكدإن" }
];

// 🟢 start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  userLang[chatId] = "en";

  bot.sendMessage(chatId, texts.en.chooseLang, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "English 🇺🇸", callback_data: "lang_en" }],
        [{ text: "العربية 🇸🇦", callback_data: "lang_ar" }]
      ]
    }
  });
});

// 🎯 الضغط على الأزرار
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  // 🌍 اختيار اللغة
  if (data === "lang_en" || data === "lang_ar") {
    userLang[chatId] = data === "lang_en" ? "en" : "ar";
    return sendMerchants(chatId);
  }

  // 🛒 اختيار التاجر
  if (data.startsWith("merchant_")) {
    const id = data.split("_")[1];

    userData[chatId] = { merchant: id };

    const lang = userLang[chatId];
    const t = texts[lang];

    return bot.sendMessage(chatId, t.sendCard);
  }
});

// 📦 عرض التجار
function sendMerchants(chatId) {
  const lang = userLang[chatId];
  const t = texts[lang];

  const buttons = merchants.map((m) => [{
    text: lang === "ar" ? m.ar : m.en,
    callback_data: "merchant_" + m.id
  }]);

  bot.sendMessage(chatId, t.chooseMerchant, {
    reply_markup: {
      inline_keyboard: buttons
    }
  });
}

// 📩 استقبال الكود
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith("/")) return;

  if (!userData[chatId]) return;

  const lang = userLang[chatId];
  const t = texts[lang];

  try {
    // ⏳ رسالة متحركة
    const waitMsg = await bot.sendMessage(chatId, t.processing);

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

    // 🧹 حذف رسالة الانتظار
    await bot.deleteMessage(chatId, waitMsg.message_id);

    const data = response.data;

    if (data.code !== 1) {
      return bot.sendMessage(chatId, "❌ " + data.msg);
    }

    const card = data.data;

    bot.sendMessage(
      chatId,
      lang === "ar"
        ? `💳 البطاقة:

رقم: ${card.card_number}
CVV: ${card.cvv}
تاريخ: ${card.exp}

💰 الرصيد: ${card.available_amount}
🏪 المتجر: ${card.merchant_name}`
        : `💳 CARD:

Number: ${card.card_number}
CVV: ${card.cvv}
EXP: ${card.exp}

💰 Balance: ${card.available_amount}
🏪 Merchant: ${card.merchant_name}`
    );

  } catch (err) {
    bot.sendMessage(chatId, t.error);
  }
});

// 🌐
app.get("/", (req, res) => {
  res.send("Bot running 🔥");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running");
});

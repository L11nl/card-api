const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

const TOKEN = "2006778841:AAEGzMAkfk_CtdAvgK-M5pPx8wJlXMqhzEI";

const bot = new TelegramBot(TOKEN, { polling: true });

// ✅ التجار (ثابتين)
const merchants = {
  "Spotify": "4",
  "YouTube": "5",
  "OpenAI (ChatGPT)": "6",
  "Amazon": "7",
  "Google Cloud": "8",
  "Microsoft": "9",
  "LinkedIn": "10",
  "Cloudflare": "11"
};

let userData = {};

// 🟢 /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  const buttons = Object.keys(merchants).map(name => [name]);

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

  // ✅ اختيار التاجر
  if (merchants[text]) {
    userData[chatId] = {
      merchant: merchants[text],
    };

    return bot.sendMessage(chatId, `✅ تم اختيار: ${text}\n\n✍️ ارسل كود البطاقة:`);
  }

  // ❗ لازم يختار
  if (!userData[chatId]) {
    return bot.sendMessage(chatId, "❗ لازم تختار التاجر أولاً /start");
  }

  // 💳 تنفيذ
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

// 🌐
app.get("/", (req, res) => {
  res.send("Bot is running 🔥");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running");
});

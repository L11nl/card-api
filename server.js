const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

const TOKEN = "2006778841:AAEGzMAkfk_CtdAvgK-M5pPx8wJlXMqhzEI";
const bot = new TelegramBot(TOKEN, { polling: true });

// 🧠 تخزين بيانات المستخدم
const users = {};

// 🔹 بداية البوت
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, "👋 اختر نوع البطاقة:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "💳 4462 / 4866 (متاح)", callback_data: "bin_4462" },
        ],
        [
          { text: "❌ 5349 (صيانة)", callback_data: "bin_5349" },
        ],
        [
          { text: "❌ 5520 (صيانة)", callback_data: "bin_5520" },
        ],
      ],
    },
  });
});

// 🔘 عند الضغط على الأزرار
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  // اختيار BIN
  if (data.startsWith("bin_")) {
    if (data === "bin_5349" || data === "bin_5520") {
      return bot.sendMessage(chatId, "❌ هذا النوع تحت الصيانة");
    }

    users[chatId] = { step: "choose_merchant" };

    return bot.sendMessage(chatId, "🏪 اختر التاجر:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Spotify", callback_data: "m_1" }],
          [{ text: "YouTube", callback_data: "m_2" }],
          [{ text: "OpenAI (ChatGPT)", callback_data: "m_3" }],
          [{ text: "Amazon", callback_data: "m_4" }],
        ],
      },
    });
  }

  // اختيار التاجر
  if (data.startsWith("m_")) {
    users[chatId].merchant = data;
    users[chatId].step = "enter_code";

    return bot.sendMessage(chatId, "✍️ ارسل كود البطاقة:");
  }
});

// استقبال الكود
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  if (!users[chatId] || users[chatId].step !== "enter_code") return;

  const cardKey = msg.text;

  try {
    bot.sendMessage(chatId, "⏳ جاري الاستبدال...");

    const params = new URLSearchParams();
    params.append("card_key", cardKey);

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
      `✅ تم الاستبدال

💳 الرقم: ${card.card_number}
CVV: ${card.cvv}
📅: ${card.exp}

💰 الرصيد: ${card.available_amount}
🏪 المتجر: ${card.merchant_name}`
    );

    users[chatId] = null;
  } catch (err) {
    bot.sendMessage(chatId, "❌ خطأ بالسيرفر");
  }
});

// سيرفر
app.get("/", (req, res) => {
  res.send("Bot Running 🔥");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running");
});

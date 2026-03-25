const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

const TOKEN = "2006778841:AAEGzMAkfk_CtdAvgK-M5pPx8wJlXMqhzEI";
const WALLET = "PUT_TRC20_ADDRESS";

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== Ø¨ÙŠØ§Ù†Ø§Øª =====
let userLang = {};
let userState = {};
let pendingBuy = {};
let codes = [];

const PRICE = 2.5;

// ===== Ø§Ù„ØªØ¬Ø§Ø± =====
const merchants = [
  { id: "4", en: "Spotify", ar: "Ø³Ø¨ÙˆØªÙŠÙØ§ÙŠ" },
  { id: "5", en: "YouTube", ar: "ÙŠÙˆØªÙŠÙˆØ¨" },
  { id: "6", en: "ChatGPT", ar: "Ø´Ø§Øª Ø¬ÙŠ Ø¨ÙŠ ØªÙŠ" },
  { id: "7", en: "Amazon", ar: "Ø£Ù…Ø§Ø²ÙˆÙ†" }
];

// ===== Ø§Ù„Ù†ØµÙˆØµ =====
const T = {
  en: {
    start: "ðŸŒ Choose language",
    menu: "ðŸ‘‹ Choose:",
    redeem: "ðŸ”„ Redeem Code",
    buy: "ðŸ’³ Buy Codes",
    chooseMerchant: "ðŸ‘‹ Choose merchant:",
    sendCard: "âœï¸ Send card code:",
    processing: "â³ Processing...",
    enterQty: "âœï¸ Enter quantity:",
    pay: "ðŸ’° Send payment:",
    sendTx: "ðŸ”— Send TXID",
    checking: "â³ Checking...",
    error: "âŒ Error"
  },
  ar: {
    start: "ðŸŒ Ø§Ø®ØªØ± Ø§Ù„Ù„ØºØ©",
    menu: "ðŸ‘‹ Ø§Ø®ØªØ±:",
    redeem: "ðŸ”„ Ø§Ø³ØªØ±Ø¯Ø§Ø¯ Ø§Ù„ÙƒÙˆØ¯",
    buy: "ðŸ’³ Ø´Ø±Ø§Ø¡ ÙƒÙˆØ¯Ø§Øª",
    chooseMerchant: "ðŸ‘‹ Ø§Ø®ØªØ± Ø§Ù„ØªØ§Ø¬Ø±:",
    sendCard: "âœï¸ Ø§Ø±Ø³Ù„ Ø§Ù„ÙƒÙˆØ¯:",
    processing: "â³ Ø¬Ø§Ø±ÙŠ Ø§Ù„Ù…Ø¹Ø§Ù„Ø¬Ø©...",
    enterQty: "âœï¸ Ø§Ø±Ø³Ù„ Ø§Ù„ÙƒÙ…ÙŠØ©:",
    pay: "ðŸ’° Ù‚Ù… Ø¨Ø§Ù„ØªØ­ÙˆÙŠÙ„:",
    sendTx: "ðŸ”— Ø§Ø±Ø³Ù„ TXID",
    checking: "â³ Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ­Ù‚Ù‚...",
    error: "âŒ Ø®Ø·Ø£"
  }
};

// ===== START =====
bot.onText(/\/start/, (msg) => {
  const id = msg.chat.id;

  userLang[id] = "en";

  bot.sendMessage(id, T.en.start, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "ðŸ‡ºðŸ‡¸ English", callback_data: "lang_en" }],
        [{ text: "ðŸ‡®ðŸ‡¶ Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©", callback_data: "lang_ar" }]
      ]
    }
  });
});

// ===== MENU =====
function menu(id) {
  const lang = userLang[id];
  const t = T[lang];

  bot.sendMessage(id, t.menu, {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.redeem, callback_data: "redeem" }],
        [{ text: t.buy, callback_data: "buy" }]
      ]
    }
  });
}

// ===== Ø¹Ø±Ø¶ Ø§Ù„ØªØ¬Ø§Ø± =====
function showMerchants(id) {
  const lang = userLang[id];
  const t = T[lang];

  const buttons = merchants.map(m => [{
    text: lang === "ar" ? m.ar : m.en,
    callback_data: "merchant_" + m.id
  }]);

  bot.sendMessage(id, t.chooseMerchant, {
    reply_markup: { inline_keyboard: buttons }
  });
}

// ===== BUTTONS =====
bot.on("callback_query", async (q) => {
  const id = q.message.chat.id;
  const data = q.data;

  if (data.startsWith("lang_")) {
    userLang[id] = data.split("_")[1];
    return menu(id);
  }

  // ðŸ”„ Ø§Ø³ØªØ±Ø¯Ø§Ø¯
  if (data === "redeem") {
    userState[id] = "redeem";
    return showMerchants(id);
  }

  // ðŸ›’ Ø´Ø±Ø§Ø¡
  if (data === "buy") {
    const lang = userLang[id];
    return bot.sendMessage(id,
      `${T[lang].enterQty}\nðŸ“¦ Stock: ${codes.length}`
    );
  }

  // Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„ØªØ§Ø¬Ø±
  if (data.startsWith("merchant_")) {
    const merchant = data.split("_")[1];
    userState[id] = { redeem: merchant };

    const lang = userLang[id];
    return bot.sendMessage(id, T[lang].sendCard);
  }
});

// ===== ØªØ­Ù‚Ù‚ Ø§Ù„Ø¯ÙØ¹ =====
async function checkPayment(txid, amount) {
  try {
    const res = await axios.get(`https://apilist.tronscan.org/api/transaction-info?hash=${txid}`);

    if (!res.data) return false;

    const to = res.data.toAddress;
    const value = res.data.amount / 1e6;

    return to === WALLET && value >= amount;
  } catch {
    return false;
  }
}

// ===== MESSAGE =====
bot.on("message", async (msg) => {
  const id = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith("/")) return;

  const lang = userLang[id];
  const t = T[lang];

  // ðŸ›’ Ø´Ø±Ø§Ø¡ ÙƒÙˆØ¯Ø§Øª
  if (!isNaN(text) && codes.length > 0) {
    const qty = parseInt(text);

    if (qty > codes.length) {
      return bot.sendMessage(id, `âŒ Only ${codes.length} available`);
    }

    const total = qty * PRICE;
    pendingBuy[id] = { qty, total };

    return bot.sendMessage(id,
`${t.pay}

ðŸ’µ ${total} USDT
ðŸ“ ${WALLET}

${t.sendTx}`
    );
  }

  // ðŸ”— TXID
  if (pendingBuy[id] && text.length > 20) {
    const wait = await bot.sendMessage(id, t.checking);

    const ok = await checkPayment(text, pendingBuy[id].total);

    if (!ok) {
      return bot.editMessageText(t.error, {
        chat_id: id,
        message_id: wait.message_id
      });
    }

    let result = "";

    for (let i = 0; i < pendingBuy[id].qty; i++) {
      result += codes.pop() + "\n";
    }

    pendingBuy[id] = null;

    return bot.editMessageText("âœ… Codes:\n\n" + result, {
      chat_id: id,
      message_id: wait.message_id
    });
  }

  // ðŸ”„ Ø§Ø³ØªØ±Ø¯Ø§Ø¯ API
  if (userState[id]?.redeem) {
    const wait = await bot.sendMessage(id, t.processing);

    const params = new URLSearchParams();
    params.append("card_key", text);
    params.append("merchant_dict_id", userState[id].redeem);
    params.append("platform_id", "1");

    try {
      const res = await axios.post(
        "https://api.node-card.com/api/open/card/redeem",
        params,
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      await bot.deleteMessage(id, wait.message_id);

      if (res.data.code !== 1) {
        return bot.sendMessage(id, "âŒ " + res.data.msg);
      }

      const c = res.data.data;

      bot.sendMessage(id,
`ðŸ’³ CARD

${c.card_number}
CVV: ${c.cvv}
EXP: ${c.exp}

ðŸ’° ${c.available_amount}
ðŸª ${c.merchant_name}`
      );

    } catch {
      bot.sendMessage(id, t.error);
    }
  }

  // ðŸ‘‘ ADMIN
  if (id == 643309456 && text.startsWith("add_code")) {
    const code = text.split(" ")[1];
    codes.push(code);

    bot.sendMessage(id, "âœ… Code added");
  }
});

// ===== SERVER =====
app.get("/", (req, res) => res.send("ðŸ”¥ BOT RUNNING"));

app.listen(3000, () => console.log("ðŸš€ Started"));

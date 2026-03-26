const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

const TOKEN = "2006778841:AAEGzMAkfk_CtdAvgK-M5pPx8wJlXMqhzEI";
const WALLET = "PUT_TRC20_ADDRESS";  // تأكد من وضع عنوان محفظتك هنا

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== بيانات =====
let userLang = {};
let userState = {};
let pendingBuy = {};
let codes = [];
let users = [];
let botActive = true; // خاصية تشغيل أو إيقاف البوت

const PRICE = 2.5;

// ===== التجار =====
const merchants = [
  { id: "4", en: "Spotify", ar: "سبوتيفاي" },
  { id: "5", en: "YouTube", ar: "يوتيوب" },
  { id: "6", en: "ChatGPT", ar: "شات جي بي تي" },
  { id: "7", en: "Amazon", ar: "أمازون" }
];

// ===== النصوص =====
const T = {
  en: {
    start: "🌍 Choose language",
    menu: "👋 Choose:",
    redeem: "🔄 Redeem Code",
    buy: "💳 Buy Codes",
    chooseMerchant: "👋 Choose merchant:",
    sendCard: "✍️ Send card code:",
    processing: "⏳ Processing...",
    enterQty: "✍️ Enter quantity:",
    pay: "💰 Send payment:",
    sendTx: "🔗 Send TXID",
    checking: "⏳ Checking...",
    error: "❌ Error",
    adminMenu: "👑 Admin Menu: Manage inventory, check payments, send notifications",
    addItem: "➕ Add item to inventory",
    viewItems: "📦 View inventory",
    activateBot: "⚙️ Activate bot",
    deactivateBot: "⚙️ Deactivate bot",
    sendNotification: "📣 Send Notification",
    enterPrice: "💰 Enter the price for the item"
  },
  ar: {
    start: "🌍 اختر اللغة",
    menu: "👋 اختر:",
    redeem: "🔄 استرداد الكود",
    buy: "💳 شراء كودات",
    chooseMerchant: "👋 اختر التاجر:",
    sendCard: "✍️ ارسل الكود:",
    processing: "⏳ جاري المعالجة...",
    enterQty: "✍️ ارسل الكمية:",
    pay: "💰 قم بالتحويل:",
    sendTx: "🔗 ارسل TXID",
    checking: "⏳ جاري التحقق...",
    error: "❌ خطأ",
    adminMenu: "👑 قائمة الأدمن: إدارة المخزون، التحقق من المدفوعات، إرسال الإشعارات",
    addItem: "➕ إضافة عنصر للمخزون",
    viewItems: "📦 عرض المخزون",
    activateBot: "⚙️ تفعيل البوت",
    deactivateBot: "⚙️ إيقاف البوت",
    sendNotification: "📣 إرسال إشعار",
    enterPrice: "💰 أدخل سعر العنصر"
  }
};

// ===== START =====
bot.onText(/\/start/, (msg) => {
  const id = msg.chat.id;

  userLang[id] = "en";

  bot.sendMessage(id, T.en.start, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🇺🇸 English", callback_data: "lang_en" }],
        [{ text: "🇮🇶 العربية", callback_data: "lang_ar" }]
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

// ===== عرض التجار =====
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

// ===== عرض العناصر في المخزون =====
function viewInventory(id) {
  const lang = userLang[id];
  const t = T[lang];
  if (codes.length === 0) {
    return bot.sendMessage(id, "❌ No items available in inventory.");
  }

  let inventoryText = "📦 Inventory:\n";
  codes.forEach((item, index) => {
    inventoryText += `${index + 1}. ${item.code} - $${item.price}\n`;
  });

  bot.sendMessage(id, inventoryText);
}

// ===== BUTTONS =====
bot.on("callback_query", async (q) => {
  const id = q.message.chat.id;
  const data = q.data;

  if (data.startsWith("lang_")) {
    userLang[id] = data.split("_")[1];
    return menu(id);
  }

  // 🔄 استرداد
  if (data === "redeem") {
    userState[id] = "redeem";
    return showMerchants(id);
  }

  // 🛒 شراء
  if (data === "buy") {
    return bot.sendMessage(id, `${T[userLang[id]].enterQty}\n📦 Stock: ${codes.length}`);
  }

  // إذا كان المستخدم هو الأدمن
  if (data === "admin_menu" && id === 643309456) {
    return showAdminMenu(id);
  }

  // عرض المخزون
  if (data === "view_inventory") {
    return viewInventory(id);
  }

  // اختيار التاجر
  if (data.startsWith("merchant_")) {
    const merchant = data.split("_")[1];
    userState[id] = { redeem: merchant };

    const lang = userLang[id];
    return bot.sendMessage(id, T[lang].sendCard);
  }
});

// ===== إدارة المخزون وميزات الأدمن =====
function showAdminMenu(id) {
  const lang = userLang[id];
  const t = T[lang];

  bot.sendMessage(id, t.adminMenu, {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.addItem, callback_data: "add_item" }],
        [{ text: t.viewItems, callback_data: "view_inventory" }],
        [{ text: t.activateBot, callback_data: "activate_bot" }],
        [{ text: t.deactivateBot, callback_data: "deactivate_bot" }],
        [{ text: t.sendNotification, callback_data: "send_notification" }]
      ]
    }
  });
}

bot.on("callback_query", async (q) => {
  const id = q.message.chat.id;
  const data = q.data;

  if (data === "add_item") {
    userState[id] = "adding_item"; // تعيين حالة الأدمن لإضافة عنصر
    return bot.sendMessage(id, T[userLang[id]].enterPrice);
  }

  if (data === "view_inventory") {
    return viewInventory(id);
  }

  if (data === "activate_bot") {
    botActive = true;
    return bot.sendMessage(id, "✅ Bot activated");
  }

  if (data === "deactivate_bot") {
    botActive = false;
    return bot.sendMessage(id, "❌ Bot deactivated");
  }

  if (data === "send_notification") {
    return bot.sendMessage(id, "🔊 Please send the notification text.");
  }
});

// ===== إضافة عناصر إلى المخزون =====
bot.on("message", async (msg) => {
  const id = msg.chat.id;
  const text = msg.text;

  if (text === "/admin" && id === 643309456) {
    return showAdminMenu(id);
  }

  if (id === 643309456 && userState[id] === "adding_item") {
    const code = text; // العنصر المدخل من قبل الأدمن
    userState[id] = "setting_price"; // الانتقال لإعداد السعر

    return bot.sendMessage(id, T[userLang[id]].enterPrice);
  }

  if (id === 643309456 && userState[id] === "setting_price") {
    const price = parseFloat(text);
    if (isNaN(price)) {
      return bot.sendMessage(id, "❌ Invalid price. Please enter a valid number.");
    }

    // إضافة العنصر إلى المخزون
    codes.push({ code: text, price: price });

    userState[id] = null; // إعادة تعيين حالة الأدمن

    return bot.sendMessage(id, `✅ Item added to inventory: ${text} with price $${price}`);
  }

  if (id === 643309456 && text.startsWith("send_notification")) {
    const notificationText = text.split(" ").slice(1).join(" ");
    users.forEach(userId => {
      bot.sendMessage(userId, notificationText);
    });
    return bot.sendMessage(id, "📣 Notification sent to all users");
  }
});

// ===== PAYMENT =====
bot.on("message", async (msg) => {
  const id = msg.chat.id;
  const text = msg.text;

  if (text && !isNaN(text)) {
    const qty = parseInt(text);
    if (qty > codes.length) {
      return bot.sendMessage(id, `❌ Only ${codes.length} available`);
    }

    const total = qty * PRICE;
    pendingBuy[id] = { qty, total };

    return bot.sendMessage(id, `${T[userLang[id]].pay}\n💵 ${total} USDT\n📍 Pay to wallet: ${WALLET}\n${T[userLang[id]].sendTx}`);
  }

  if (pendingBuy[id] && text.length > 20) {
    const wait = await bot.sendMessage(id, T[userLang[id]].checking);

    const ok = await checkPayment(text, pendingBuy[id].total);

    if (!ok) {
      return bot.editMessageText(T[userLang[id]].error, {
        chat_id: id,
        message_id: wait.message_id
      });
    }

    let result = "";
    for (let i = 0; i < pendingBuy[id].qty; i++) {
      result += codes.pop().code + "\n";
    }

    pendingBuy[id] = null;

    return bot.editMessageText("✅ Codes:\n\n" + result, {
      chat_id: id,
      message_id: wait.message_id
    });
  }
});

// ===== CHECK PAYMENT =====
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

// ===== SERVER =====
app.get("/", (req, res) => res.send("🔥 BOT RUNNING"));
app.listen(3000, () => console.log("🚀 Started"));

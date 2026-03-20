const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
const bot = new TelegramBot("2006778841:AAEGzMAkfk_CtdAvgK-M5pPx8wJlXMqhzEI", { polling: true });

const ADMIN_ID = 643309456;

// ===== DATABASE (ذاكرة حالياً) =====
let users = {};
let services = {};
let payments = {};
let userState = {};

// ===== START =====
bot.onText(/\/start/, (msg) => {
  const id = msg.chat.id;

  if (!users[id]) users[id] = { balance: 0 };

  bot.sendMessage(id, "👋 Welcome / أهلاً بك", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🛒 Store", callback_data: "store" }],
        [{ text: "💰 Balance", callback_data: "balance" }],
        [{ text: "💳 Topup", callback_data: "topup" }]
      ]
    }
  });
});

// ===== BUTTONS =====
bot.on("callback_query", (q) => {
  const id = q.message.chat.id;
  const data = q.data;

  // 🛒 المتجر
  if (data === "store") {
    return showStore(id);
  }

  // 💰 الرصيد
  if (data === "balance") {
    return bot.sendMessage(id, `💰 Balance: $${users[id].balance}`);
  }

  // 💳 شحن
  if (data === "topup") {
    userState[id] = "waiting_payment";

    return bot.sendMessage(id,
`💳 Payment Info:

Binance ID: 123456
USDT: xxx

Send screenshot after payment`
    );
  }

  // شراء
  if (data.startsWith("buy_")) {
    const sid = data.split("_")[1];

    if (users[id].balance < services[sid].price) {
      return bot.sendMessage(id, "❌ Not enough balance");
    }

    if (services[sid].stock.length === 0) {
      return bot.sendMessage(id, "❌ Out of stock");
    }

    const code = services[sid].stock.pop();
    users[id].balance -= services[sid].price;

    return bot.sendMessage(id, `✅ Code:\n${code}`);
  }

  // قبول الدفع
  if (data.startsWith("ok_") && id === ADMIN_ID) {
    const pid = data.split("_")[1];
    const p = payments[pid];

    users[p.user].balance += p.amount;

    bot.sendMessage(p.user, "✅ Payment accepted");
    delete payments[pid];
  }

  // رفض الدفع
  if (data.startsWith("no_") && id === ADMIN_ID) {
    const pid = data.split("_")[1];
    const p = payments[pid];

    bot.sendMessage(p.user, "❌ Payment rejected");
    delete payments[pid];
  }
});

// ===== STORE =====
function showStore(id) {
  const buttons = Object.keys(services).map(s => [{
    text: `${services[s].name} - $${services[s].price}`,
    callback_data: "buy_" + s
  }]);

  bot.sendMessage(id, "🛒 Store:", {
    reply_markup: {
      inline_keyboard: buttons
    }
  });
}

// ===== MESSAGES =====
bot.on("message", (msg) => {
  const id = msg.chat.id;

  if (!users[id]) users[id] = { balance: 0 };

  // 📸 إثبات دفع
  if (msg.photo && userState[id] === "waiting_payment") {
    const pid = Date.now();

    payments[pid] = {
      user: id,
      amount: 5
    };

    bot.sendMessage(ADMIN_ID,
      `💰 New payment from ${id}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Accept", callback_data: "ok_" + pid },
              { text: "❌ Reject", callback_data: "no_" + pid }
            ]
          ]
        }
      }
    );

    userState[id] = null;

    return bot.sendMessage(id, "⏳ Waiting admin approval");
  }

  // ===== ADMIN =====

  if (id === ADMIN_ID) {

    // ➕ إضافة خدمة
    if (msg.text.startsWith("add_service")) {
      const [_, name, price] = msg.text.split(" ");
      const sid = Date.now();

      services[sid] = {
        name,
        price: Number(price),
        stock: []
      };

      return bot.sendMessage(id, "✅ Service added");
    }

    // ➕ إضافة كود
    if (msg.text.startsWith("add_stock")) {
      const [_, sid, code] = msg.text.split(" ");

      services[sid].stock.push(code);

      return bot.sendMessage(id, "✅ Code added");
    }

  }

});

// ===== SERVER =====
app.get("/", (req, res) => res.send("🔥 BOT LIVE"));

app.listen(3000, () => console.log("🚀 RUNNING"));

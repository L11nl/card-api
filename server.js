require("dotenv").config();

const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN || process.env.TOKEN;
const WALLET = process.env.WALLET;
const ADMIN_ID = Number(process.env.ADMIN_ID || 0);
const PORT = Number(process.env.PORT || 3000);
const PRICE = Number(process.env.PRICE || 2.5);

if (!TOKEN) throw new Error("BOT_TOKEN or TOKEN is missing");
if (!WALLET) throw new Error("WALLET is missing");

let pool;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
} else if (
  process.env.PGHOST &&
  process.env.PGPORT &&
  process.env.PGUSER &&
  process.env.PGPASSWORD &&
  process.env.PGDATABASE
) {
  pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: { rejectUnauthorized: false }
  });
} else {
  throw new Error("Database config is missing");
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== بيانات مؤقتة =====
let userLang = {};
let userState = {};

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
    balance: "💰 Balance",
    topup: "➕ Top Up",
    chooseMerchant: "👋 Choose merchant:",
    sendCard: "✍️ Send card code:",
    processing: "⏳ Processing...",
    enterQty: "✍️ Enter quantity:",
    sendTopupAmount: "✍️ Send top-up amount in USDT:",
    pay: "💰 Send payment:",
    sendTx: "🔗 Send TXID",
    checking: "⏳ Checking...",
    error: "❌ Error",
    noBalance: "❌ Your balance is not enough",
    balanceText: "💰 Your balance: ",
    qtyInvalid: "❌ Invalid quantity",
    orderCreated: "✅ Order created",
    txUsed: "❌ This TXID has already been used",
    txInvalid: "❌ Payment not found or amount is wrong",
    topupSuccess: "✅ Balance added successfully",
    buySuccess: "✅ Codes:",
    stock: "📦 Stock:",
    noStock: "❌ No stock available",
    choosePayMethod: "Choose payment method:",
    payFromBalance: "💰 Pay from balance",
    payByTransfer: "💸 Pay by transfer"
  },
  ar: {
    start: "🌍 اختر اللغة",
    menu: "👋 اختر:",
    redeem: "🔄 استرداد الكود",
    buy: "💳 شراء كودات",
    balance: "💰 الرصيد",
    topup: "➕ شحن الرصيد",
    chooseMerchant: "👋 اختر التاجر:",
    sendCard: "✍️ ارسل الكود:",
    processing: "⏳ جاري المعالجة...",
    enterQty: "✍️ ارسل الكمية:",
    sendTopupAmount: "✍️ ارسل مبلغ الشحن بالدولار USDT:",
    pay: "💰 قم بالتحويل:",
    sendTx: "🔗 ارسل TXID",
    checking: "⏳ جاري التحقق...",
    error: "❌ خطأ",
    noBalance: "❌ رصيدك غير كافي",
    balanceText: "💰 رصيدك: ",
    qtyInvalid: "❌ الكمية غير صحيحة",
    orderCreated: "✅ تم إنشاء الطلب",
    txUsed: "❌ هذا الـ TXID مستخدم مسبقًا",
    txInvalid: "❌ لم يتم العثور على الدفع أو المبلغ غير صحيح",
    topupSuccess: "✅ تم إضافة الرصيد بنجاح",
    buySuccess: "✅ الكودات:",
    stock: "📦 المخزون:",
    noStock: "❌ لا يوجد مخزون",
    choosePayMethod: "اختر طريقة الدفع:",
    payFromBalance: "💰 الدفع من الرصيد",
    payByTransfer: "💸 الدفع بالتحويل"
  }
};

// ===== DB =====
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id BIGINT PRIMARY KEY,
      lang TEXT DEFAULT 'en',
      balance NUMERIC(18,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS codes (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL,
      is_sold BOOLEAN DEFAULT FALSE,
      sold_to BIGINT,
      sold_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL,
      type TEXT NOT NULL,
      qty INTEGER DEFAULT 0,
      amount NUMERIC(18,2) NOT NULL,
      status TEXT DEFAULT 'pending',
      txid TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS redemptions (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL,
      merchant_id TEXT NOT NULL,
      card_key TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

async function ensureUser(id) {
  await pool.query(
    `INSERT INTO users (telegram_id) VALUES ($1)
     ON CONFLICT (telegram_id) DO NOTHING`,
    [id]
  );
}

async function setUserLang(id, lang) {
  await ensureUser(id);
  await pool.query(`UPDATE users SET lang=$1 WHERE telegram_id=$2`, [lang, id]);
}

async function getBalance(id) {
  await ensureUser(id);
  const res = await pool.query(
    `SELECT balance FROM users WHERE telegram_id=$1`,
    [id]
  );
  return Number(res.rows[0]?.balance || 0);
}

async function addBalance(id, amount) {
  await ensureUser(id);
  await pool.query(
    `UPDATE users SET balance = balance + $1 WHERE telegram_id=$2`,
    [amount, id]
  );
}

async function deductBalance(id, amount) {
  await ensureUser(id);
  const res = await pool.query(
    `UPDATE users
     SET balance = balance - $1
     WHERE telegram_id=$2 AND balance >= $1`,
    [amount, id]
  );
  return res.rowCount > 0;
}

async function getAvailableCodesCount() {
  const res = await pool.query(
    `SELECT COUNT(*)::int AS count FROM codes WHERE is_sold = FALSE`
  );
  return res.rows[0].count;
}

async function takeCodes(id, qty) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const res = await client.query(
      `SELECT id, code FROM codes
       WHERE is_sold = FALSE
       ORDER BY id ASC
       LIMIT $1
       FOR UPDATE`,
      [qty]
    );

    if (res.rows.length < qty) {
      await client.query("ROLLBACK");
      return null;
    }

    const ids = res.rows.map((r) => r.id);

    await client.query(
      `UPDATE codes
       SET is_sold = TRUE, sold_to = $1, sold_at = NOW()
       WHERE id = ANY($2::int[])`,
      [id, ids]
    );

    await client.query("COMMIT");
    return res.rows.map((r) => r.code);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function createOrder(telegramId, type, amount, qty = 0) {
  const res = await pool.query(
    `INSERT INTO orders (telegram_id, type, amount, qty, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING id`,
    [telegramId, type, amount, qty]
  );
  return res.rows[0].id;
}

async function txExists(txid) {
  const res = await pool.query(
    `SELECT id FROM orders WHERE txid=$1 LIMIT 1`,
    [txid]
  );
  return res.rows.length > 0;
}

async function markOrderPaid(orderId, txid) {
  await pool.query(
    `UPDATE orders SET status='paid', txid=$1 WHERE id=$2`,
    [txid, orderId]
  );
}

async function getPendingTopup(id) {
  const res = await pool.query(
    `SELECT * FROM orders
     WHERE telegram_id=$1 AND type='topup' AND status='pending'
     ORDER BY id DESC LIMIT 1`,
    [id]
  );
  return res.rows[0] || null;
}

async function getPendingBuy(id) {
  const res = await pool.query(
    `SELECT * FROM orders
     WHERE telegram_id=$1 AND type='buy' AND status='pending'
     ORDER BY id DESC LIMIT 1`,
    [id]
  );
  return res.rows[0] || null;
}

function getLang(id) {
  return userLang[id] || "en";
}

// ===== MENU =====
function menu(id) {
  const lang = getLang(id);
  const t = T[lang];

  bot.sendMessage(id, t.menu, {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.balance, callback_data: "balance" }],
        [{ text: t.topup, callback_data: "topup" }],
        [{ text: t.buy, callback_data: "buy" }],
        [{ text: t.redeem, callback_data: "redeem" }]
      ]
    }
  });
}

// ===== عرض التجار =====
function showMerchants(id) {
  const lang = getLang(id);
  const t = T[lang];

  const buttons = merchants.map((m) => [
    {
      text: lang === "ar" ? m.ar : m.en,
      callback_data: "merchant_" + m.id
    }
  ]);

  bot.sendMessage(id, t.chooseMerchant, {
    reply_markup: { inline_keyboard: buttons }
  });
}

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  const id = msg.chat.id;
  await ensureUser(id);

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

// ===== BUTTONS =====
bot.on("callback_query", async (q) => {
  const id = q.message.chat.id;
  const data = q.data;

  if (data.startsWith("lang_")) {
    userLang[id] = data.split("_")[1];
    await setUserLang(id, userLang[id]);
    return menu(id);
  }

  const lang = getLang(id);
  const t = T[lang];

  if (data === "balance") {
    const balance = await getBalance(id);
    return bot.sendMessage(id, `${t.balanceText}${balance.toFixed(2)} USDT`);
  }

  if (data === "topup") {
    userState[id] = "topup_amount";
    return bot.sendMessage(id, t.sendTopupAmount);
  }

  if (data === "redeem") {
    userState[id] = "redeem";
    return showMerchants(id);
  }

  if (data === "buy") {
    const stock = await getAvailableCodesCount();
    if (stock <= 0) return bot.sendMessage(id, t.noStock);

    userState[id] = "buy_qty";
    return bot.sendMessage(id, `${t.enterQty}\n${t.stock} ${stock}`);
  }

  if (data === "pay_balance") {
    const pending = await getPendingBuy(id);
    if (!pending) return bot.sendMessage(id, t.error);

    const balance = await getBalance(id);
    if (balance < Number(pending.amount)) {
      return bot.sendMessage(id, t.noBalance);
    }

    const soldCodes = await takeCodes(id, pending.qty);
    if (!soldCodes) return bot.sendMessage(id, t.noStock);

    const deducted = await deductBalance(id, pending.amount);
    if (!deducted) return bot.sendMessage(id, t.noBalance);

    await markOrderPaid(pending.id, `BALANCE_${Date.now()}`);

    return bot.sendMessage(id, `${t.buySuccess}\n\n${soldCodes.join("\n")}`);
  }

  if (data === "pay_transfer") {
    const pending = await getPendingBuy(id);
    if (!pending) return bot.sendMessage(id, t.error);

    return bot.sendMessage(
      id,
      `${t.orderCreated}

${t.pay}

💵 ${pending.amount} USDT
📍 ${WALLET}
🧾 Order #${pending.id}

${t.sendTx}`
    );
  }

  if (data.startsWith("merchant_")) {
    const merchant = data.split("_")[1];
    userState[id] = { redeem: merchant };
    return bot.sendMessage(id, t.sendCard);
  }
});

// ===== تحقق الدفع =====
async function checkPayment(txid, amount) {
  try {
    const res = await axios.get(
      `https://apilist.tronscan.org/api/transaction-info?hash=${txid}`,
      { timeout: 15000 }
    );

    if (!res.data) return false;

    const to = res.data.toAddress;
    const value = Number(res.data.amount || 0) / 1e6;

    return to === WALLET && value >= Number(amount);
  } catch (error) {
    console.error("checkPayment error:", error.message);
    return false;
  }
}

// ===== MESSAGE =====
bot.on("message", async (msg) => {
  const id = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith("/")) return;

  await ensureUser(id);

  const lang = getLang(id);
  const t = T[lang];

  // ===== شراء كودات =====
  if (userState[id] === "buy_qty") {
    const qty = parseInt(text, 10);
    const stock = await getAvailableCodesCount();

    if (isNaN(qty) || qty <= 0) {
      return bot.sendMessage(id, t.qtyInvalid);
    }

    if (qty > stock) {
      return bot.sendMessage(id, `❌ Only ${stock} available`);
    }

    const total = qty * PRICE;
    await createOrder(id, "buy", total, qty);
    userState[id] = null;

    return bot.sendMessage(id, t.choosePayMethod, {
      reply_markup: {
        inline_keyboard: [
          [{ text: t.payFromBalance, callback_data: "pay_balance" }],
          [{ text: t.payByTransfer, callback_data: "pay_transfer" }]
        ]
      }
    });
  }

  // ===== شحن الرصيد =====
  if (userState[id] === "topup_amount") {
    const amount = Number(text);
    if (isNaN(amount) || amount <= 0) {
      return bot.sendMessage(id, t.error);
    }

    const orderId = await createOrder(id, "topup", amount, 0);
    userState[id] = "topup_txid";

    return bot.sendMessage(
      id,
      `${t.orderCreated}

${t.pay}

💵 ${amount} USDT
📍 ${WALLET}
🧾 Order #${orderId}

${t.sendTx}`
    );
  }

  if (userState[id] === "topup_txid" && text.length > 20) {
    const order = await getPendingTopup(id);
    if (!order) return bot.sendMessage(id, t.error);

    if (await txExists(text)) {
      return bot.sendMessage(id, t.txUsed);
    }

    const wait = await bot.sendMessage(id, t.checking);
    const ok = await checkPayment(text, order.amount);

    if (!ok) {
      return bot.editMessageText(t.txInvalid, {
        chat_id: id,
        message_id: wait.message_id
      });
    }

    await markOrderPaid(order.id, text);
    await addBalance(id, Number(order.amount));
    userState[id] = null;

    return bot.editMessageText(
      `${t.topupSuccess}

${t.balanceText}${(await getBalance(id)).toFixed(2)} USDT`,
      {
        chat_id: id,
        message_id: wait.message_id
      }
    );
  }

  // ===== TXID لشراء مباشر =====
  const pendingBuy = await getPendingBuy(id);
  if (pendingBuy && text.length > 20) {
    if (await txExists(text)) {
      return bot.sendMessage(id, t.txUsed);
    }

    const wait = await bot.sendMessage(id, t.checking);
    const ok = await checkPayment(text, pendingBuy.amount);

    if (!ok) {
      return bot.editMessageText(t.txInvalid, {
        chat_id: id,
        message_id: wait.message_id
      });
    }

    const resultCodes = await takeCodes(id, pendingBuy.qty);
    if (!resultCodes) {
      return bot.editMessageText(t.noStock, {
        chat_id: id,
        message_id: wait.message_id
      });
    }

    await markOrderPaid(pendingBuy.id, text);

    return bot.editMessageText(
      `${t.buySuccess}

${resultCodes.join("\n")}`,
      {
        chat_id: id,
        message_id: wait.message_id
      }
    );
  }

  // ===== استرداد API =====
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
        return bot.sendMessage(id, "❌ " + res.data.msg);
      }

      const c = res.data.data;

      await pool.query(
        `INSERT INTO redemptions (telegram_id, merchant_id, card_key)
         VALUES ($1, $2, $3)`,
        [id, userState[id].redeem, text]
      );

      await bot.sendMessage(
        id,
`💳 CARD

${c.card_number}
CVV: ${c.cvv}
EXP: ${c.exp}

💰 ${c.available_amount}
🏪 ${c.merchant_name}`
      );

      userState[id] = null;
    } catch (error) {
      console.error("redeem error:", error.message);
      bot.sendMessage(id, t.error);
    }
  }

  // ===== ADMIN =====
  if (id === ADMIN_ID && text.startsWith("add_code ")) {
    const code = text.substring(9).trim();
    if (!code) return bot.sendMessage(id, "❌ empty code");

    await pool.query(`INSERT INTO codes (code) VALUES ($1)`, [code]);
    return bot.sendMessage(id, "✅ Code added");
  }
});

// ===== SERVER =====
app.get("/", (req, res) => {
  res.send("🔥 BOT RUNNING");
});

// ===== تشغيل =====
(async () => {
  try {
    await initDb();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Started on port ${PORT}`);
    });
  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
})();

require("dotenv").config();

const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
const { Pool } = require("pg");
const crypto = require("crypto");

const app = express();
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);

const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const PORT = Number(process.env.PORT || 3000);

const MAIN_ADMIN_ID = Number(process.env.MAIN_ADMIN_ID || process.env.ADMIN_ID || 0);

// Crypto Pay (@CryptoBot / t.me/send) API
const CRYPTO_PAY_TOKEN = process.env.CRYPTO_PAY_TOKEN || "";
const CRYPTO_PAY_API_BASE = process.env.CRYPTO_PAY_API_BASE || "https://pay.crypt.bot/api";

// Optional defaults
const DEFAULT_WALLET = process.env.WALLET || "";
const DEFAULT_BINANCE_ID = process.env.BINANCE_ID || "";
const DEFAULT_MANUAL_PAYMENT_TEXT =
  process.env.MANUAL_PAYMENT_TEXT ||
  "حوّل إلى Binance ID التالي ثم أرسل صورة الإثبات. سيتم مراجعتها من قبل الإدارة.";

if (!BOT_TOKEN) throw new Error("BOT_TOKEN is missing");
if (!DATABASE_URL) throw new Error("DATABASE_URL is missing");
if (!MAIN_ADMIN_ID) throw new Error("MAIN_ADMIN_ID or ADMIN_ID is missing");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const userState = new Map();

const T = {
  en: {
    chooseLanguage: "🌍 Choose language",
    menu: "👋 Choose:",
    balance: "💰 Balance",
    topup: "➕ Top Up Balance",
    buy: "🛒 Buy Products",
    redeem: "🔄 Redeem",
    back: "⬅️ Back",
    disabled: "⛔ Bot is temporarily disabled.",
    balanceText: "💰 Your balance:",
    noProducts: "❌ No products available now.",
    noStock: "❌ No stock available.",
    chooseQty: "✍️ Enter quantity:",
    qtyInvalid: "❌ Invalid quantity.",
    chooseTopupAmount: "✍️ Send top-up amount in USDT:",
    invalidAmount: "❌ Invalid amount.",
    choosePaymentMethod: "Choose payment method:",
    payFromBalance: "💰 Pay from balance",
    payWithCryptoBot: "🤖 Pay with CryptoBot",
    payManualBinance: "🟡 Manual Binance transfer",
    noBalance: "❌ Your balance is not enough.",
    orderCreated: "✅ Order created",
    sendProof: "📷 Send payment proof image now.",
    manualWait: "⏳ Your proof was sent to admins. Wait for approval.",
    checking: "⏳ Checking...",
    paidSuccess: "✅ Payment confirmed.",
    topupSuccess: "✅ Balance added successfully.",
    buySuccess: "✅ Your codes:",
    txInvalid: "❌ Payment is not confirmed.",
    chooseProduct: "🛒 Choose product:",
    stockText: "📦 Stock:",
    cryptoPayBtn: "💳 Pay now",
    invoiceExpired: "❌ Invoice expired.",
    manualInfoTitle: "🟡 Manual Binance payment",
    proofRejected: "❌ Your payment proof was rejected.",
    proofApproved: "✅ Your payment proof was approved.",
    startedNotify: "🚀 New user opened the bot"
  },
  ar: {
    chooseLanguage: "🌍 اختر اللغة",
    menu: "👋 اختر:",
    balance: "💰 الرصيد",
    topup: "➕ شحن الرصيد",
    buy: "🛒 شراء المنتجات",
    redeem: "🔄 استرداد",
    back: "⬅️ رجوع",
    disabled: "⛔ البوت متوقف مؤقتًا.",
    balanceText: "💰 رصيدك:",
    noProducts: "❌ لا توجد منتجات حالياً.",
    noStock: "❌ لا يوجد مخزون.",
    chooseQty: "✍️ أرسل الكمية:",
    qtyInvalid: "❌ الكمية غير صحيحة.",
    chooseTopupAmount: "✍️ أرسل مبلغ الشحن بالدولار USDT:",
    invalidAmount: "❌ المبلغ غير صحيح.",
    choosePaymentMethod: "اختر طريقة الدفع:",
    payFromBalance: "💰 الدفع من الرصيد",
    payWithCryptoBot: "🤖 الدفع عبر CryptoBot",
    payManualBinance: "🟡 تحويل يدوي على بايننس",
    noBalance: "❌ رصيدك غير كافٍ.",
    orderCreated: "✅ تم إنشاء الطلب",
    sendProof: "📷 أرسل الآن صورة إثبات الدفع.",
    manualWait: "⏳ تم إرسال الإثبات إلى الإدارة. انتظر المراجعة.",
    checking: "⏳ جاري التحقق...",
    paidSuccess: "✅ تم تأكيد الدفع.",
    topupSuccess: "✅ تم إضافة الرصيد بنجاح.",
    buySuccess: "✅ الكودات الخاصة بك:",
    txInvalid: "❌ الدفع غير مؤكد.",
    chooseProduct: "🛒 اختر المنتج:",
    stockText: "📦 المخزون:",
    cryptoPayBtn: "💳 ادفع الآن",
    invoiceExpired: "❌ الفاتورة منتهية.",
    manualInfoTitle: "🟡 تحويل يدوي على بايننس",
    proofRejected: "❌ تم رفض إثبات الدفع.",
    proofApproved: "✅ تم قبول إثبات الدفع.",
    startedNotify: "🚀 مستخدم جديد فتح البوت"
  }
};

// ---------- Utilities ----------
function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function nowPlusMinutes(mins) {
  return new Date(Date.now() + mins * 60 * 1000);
}

function formatAmount(n) {
  return Number(n).toFixed(2);
}

async function q(text, params = []) {
  return pool.query(text, params);
}

async function getUser(telegramId) {
  const res = await q(
    `SELECT * FROM users WHERE telegram_id=$1 LIMIT 1`,
    [telegramId]
  );
  return res.rows[0] || null;
}

async function ensureUser(telegramId, meta = {}) {
  await q(
    `
    INSERT INTO users (telegram_id, lang, balance, first_name, username, is_blocked)
    VALUES ($1, 'en', 0, $2, $3, FALSE)
    ON CONFLICT (telegram_id)
    DO UPDATE SET
      first_name = COALESCE(EXCLUDED.first_name, users.first_name),
      username = COALESCE(EXCLUDED.username, users.username)
    `,
    [telegramId, meta.first_name || null, meta.username || null]
  );
}

async function setUserLang(telegramId, lang) {
  await q(`UPDATE users SET lang=$1 WHERE telegram_id=$2`, [lang, telegramId]);
}

async function getLang(telegramId) {
  const user = await getUser(telegramId);
  return user?.lang || "en";
}

async function getText(telegramId) {
  return T[(await getLang(telegramId)) || "en"];
}

async function addBalance(telegramId, amount) {
  await q(`UPDATE users SET balance = balance + $1 WHERE telegram_id=$2`, [amount, telegramId]);
}

async function deductBalance(telegramId, amount) {
  const res = await q(
    `UPDATE users SET balance = balance - $1 WHERE telegram_id=$2 AND balance >= $1`,
    [amount, telegramId]
  );
  return res.rowCount > 0;
}

async function getBalance(telegramId) {
  const res = await q(`SELECT balance FROM users WHERE telegram_id=$1`, [telegramId]);
  return Number(res.rows[0]?.balance || 0);
}

async function isAdmin(telegramId) {
  const res = await q(
    `SELECT 1 FROM admins WHERE telegram_id=$1 LIMIT 1`,
    [telegramId]
  );
  return res.rows.length > 0;
}

async function isMainAdmin(telegramId) {
  const res = await q(
    `SELECT is_main FROM admins WHERE telegram_id=$1 LIMIT 1`,
    [telegramId]
  );
  return Boolean(res.rows[0]?.is_main);
}

async function getSetting(key, fallback = null) {
  const res = await q(`SELECT value FROM settings WHERE key=$1 LIMIT 1`, [key]);
  return res.rows[0]?.value ?? fallback;
}

async function setSetting(key, value) {
  await q(
    `
    INSERT INTO settings (key, value)
    VALUES ($1, $2)
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value
    `,
    [key, value]
  );
}

async function getBotEnabled() {
  const value = await getSetting("bot_enabled", "true");
  return value === "true";
}

async function getAdmins() {
  const res = await q(`SELECT * FROM admins ORDER BY is_main DESC, created_at ASC`);
  return res.rows;
}

async function notifyAdmins(text, extra = {}) {
  const admins = await getAdmins();
  for (const admin of admins) {
    try {
      await bot.sendMessage(admin.telegram_id, text, extra);
    } catch (_) {}
  }
}

function productTitle(product, lang) {
  return lang === "ar" ? product.title_ar : product.title_en;
}

// ---------- Crypto Pay ----------
async function cryptoPayRequest(method, payload = {}) {
  if (!CRYPTO_PAY_TOKEN) throw new Error("CRYPTO_PAY_TOKEN is missing");

  const res = await axios.post(`${CRYPTO_PAY_API_BASE}/${method}`, payload, {
    headers: {
      "Crypto-Pay-API-Token": CRYPTO_PAY_TOKEN,
      "Content-Type": "application/json"
    },
    timeout: 20000
  });

  if (!res.data?.ok) {
    throw new Error(res.data?.error || `CryptoPay ${method} failed`);
  }

  return res.data.result;
}

function verifyCryptoPayWebhook(req) {
  if (!CRYPTO_PAY_TOKEN) return false;
  const signature = req.headers["crypto-pay-api-signature"];
  if (!signature || !req.rawBody) return false;

  const secret = crypto.createHash("sha256").update(CRYPTO_PAY_TOKEN).digest();
  const hmac = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
  return hmac === signature;
}

async function createCryptoInvoice({ amount, description, payload, hiddenMessage }) {
  return cryptoPayRequest("createInvoice", {
    asset: "USDT",
    amount: String(amount),
    description,
    hidden_message: hiddenMessage || "",
    expires_in: 1800,
    payload,
    allow_comments: false,
    allow_anonymous: true
  });
}

// ---------- DB ----------
async function initDb() {
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id BIGINT PRIMARY KEY,
      lang TEXT DEFAULT 'en',
      balance NUMERIC(18,2) DEFAULT 0,
      first_name TEXT,
      username TEXT,
      is_blocked BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS admins (
      telegram_id BIGINT PRIMARY KEY,
      is_main BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      title_ar TEXT NOT NULL,
      title_en TEXT NOT NULL,
      price NUMERIC(18,2) NOT NULL DEFAULT 0,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS stock_items (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      is_sold BOOLEAN DEFAULT FALSE,
      sold_to BIGINT,
      sold_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL,
      kind TEXT NOT NULL,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      qty INTEGER DEFAULT 0,
      base_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      final_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      invoice_id BIGINT UNIQUE,
      invoice_url TEXT,
      proof_file_id TEXT,
      proof_message_id BIGINT,
      approved_by BIGINT,
      rejection_reason TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 minutes')
    );
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS redemptions (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL,
      merchant_id TEXT NOT NULL,
      card_key TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await q(`
    INSERT INTO admins (telegram_id, is_main)
    VALUES ($1, TRUE)
    ON CONFLICT (telegram_id)
    DO UPDATE SET is_main = TRUE
  `, [MAIN_ADMIN_ID]);

  await setSetting("bot_enabled", "true");
  if (DEFAULT_WALLET) await setSetting("wallet", DEFAULT_WALLET);
  if (DEFAULT_BINANCE_ID) await setSetting("binance_id", DEFAULT_BINANCE_ID);
  await setSetting("manual_payment_text", DEFAULT_MANUAL_PAYMENT_TEXT);
}

// ---------- Products / Stock ----------
async function getActiveProducts() {
  const res = await q(`
    SELECT p.*,
      COALESCE((
        SELECT COUNT(*)::int FROM stock_items s
        WHERE s.product_id = p.id AND s.is_sold = FALSE
      ), 0) AS stock_count
    FROM products p
    WHERE p.active = TRUE
    ORDER BY p.id ASC
  `);
  return res.rows;
}

async function getProduct(id) {
  const res = await q(`SELECT * FROM products WHERE id=$1 LIMIT 1`, [id]);
  return res.rows[0] || null;
}

async function createProduct({ title_ar, title_en, price }) {
  const res = await q(
    `INSERT INTO products (title_ar, title_en, price) VALUES ($1, $2, $3) RETURNING *`,
    [title_ar, title_en, price]
  );
  return res.rows[0];
}

async function updateProduct(id, patch) {
  const product = await getProduct(id);
  if (!product) return null;

  const title_ar = patch.title_ar ?? product.title_ar;
  const title_en = patch.title_en ?? product.title_en;
  const price = patch.price ?? product.price;
  const active = patch.active ?? product.active;

  const res = await q(
    `UPDATE products SET title_ar=$1, title_en=$2, price=$3, active=$4 WHERE id=$5 RETURNING *`,
    [title_ar, title_en, price, active, id]
  );
  return res.rows[0] || null;
}

async function deleteProduct(id) {
  await q(`DELETE FROM products WHERE id=$1`, [id]);
}

async function addStock(productId, codes) {
  const clean = codes.map((x) => x.trim()).filter(Boolean);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const code of clean) {
      await client.query(
        `INSERT INTO stock_items (product_id, code) VALUES ($1, $2)`,
        [productId, code]
      );
    }
    await client.query("COMMIT");
    return clean.length;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function getStockCount(productId) {
  const res = await q(
    `SELECT COUNT(*)::int AS count FROM stock_items WHERE product_id=$1 AND is_sold=FALSE`,
    [productId]
  );
  return res.rows[0]?.count || 0;
}

async function takeCodes(productId, telegramId, qty) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `
      SELECT id, code
      FROM stock_items
      WHERE product_id=$1 AND is_sold=FALSE
      ORDER BY id ASC
      LIMIT $2
      FOR UPDATE
      `,
      [productId, qty]
    );

    if (found.rows.length < qty) {
      await client.query("ROLLBACK");
      return null;
    }

    const ids = found.rows.map((r) => r.id);

    await client.query(
      `
      UPDATE stock_items
      SET is_sold=TRUE, sold_to=$1, sold_at=NOW()
      WHERE id = ANY($2::int[])
      `,
      [telegramId, ids]
    );

    await client.query("COMMIT");
    return found.rows.map((r) => r.code);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ---------- Orders ----------
async function createOrder({
  telegramId,
  kind,
  productId = null,
  qty = 0,
  baseAmount = 0,
  finalAmount = 0,
  paymentMethod
}) {
  const res = await q(
    `
    INSERT INTO orders
    (telegram_id, kind, product_id, qty, base_amount, final_amount, payment_method, status, expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8)
    RETURNING *
    `,
    [telegramId, kind, productId, qty, baseAmount, finalAmount, paymentMethod, nowPlusMinutes(30)]
  );
  return res.rows[0];
}

async function getPendingOrderByUser(telegramId, kind = null) {
  let sql = `
    SELECT * FROM orders
    WHERE telegram_id=$1 AND status='pending' AND expires_at > NOW()
  `;
  const params = [telegramId];
  if (kind) {
    sql += ` AND kind=$2`;
    params.push(kind);
  }
  sql += ` ORDER BY id DESC LIMIT 1`;

  const res = await q(sql, params);
  return res.rows[0] || null;
}

async function getOrder(id) {
  const res = await q(`SELECT * FROM orders WHERE id=$1 LIMIT 1`, [id]);
  return res.rows[0] || null;
}

async function setOrderInvoice(orderId, invoice) {
  await q(
    `UPDATE orders SET invoice_id=$1, invoice_url=$2 WHERE id=$3`,
    [invoice.invoice_id, invoice.bot_invoice_url || invoice.mini_app_invoice_url || invoice.web_app_invoice_url || null, orderId]
  );
}

async function markOrderPaid(orderId, approvedBy = null) {
  await q(
    `UPDATE orders SET status='paid', approved_by = COALESCE($2, approved_by) WHERE id=$1`,
    [orderId, approvedBy]
  );
}

async function markOrderRejected(orderId, reason = null, approvedBy = null) {
  await q(
    `UPDATE orders SET status='rejected', rejection_reason=$2, approved_by=$3 WHERE id=$1`,
    [orderId, reason, approvedBy]
  );
}

async function saveManualProof(orderId, fileId, messageId = null) {
  await q(
    `UPDATE orders SET proof_file_id=$2, proof_message_id=$3 WHERE id=$1`,
    [orderId, fileId, messageId]
  );
}

async function getOrderByInvoiceId(invoiceId) {
  const res = await q(`SELECT * FROM orders WHERE invoice_id=$1 LIMIT 1`, [invoiceId]);
  return res.rows[0] || null;
}

async function finalizePaidOrder(order) {
  if (!order || order.status !== "pending") return;

  if (order.kind === "topup") {
    await addBalance(order.telegram_id, Number(order.base_amount));
    await markOrderPaid(order.id);
    const lang = await getLang(order.telegram_id);
    await bot.sendMessage(
      order.telegram_id,
      `${T[lang].topupSuccess}\n\n${T[lang].balanceText} ${formatAmount(await getBalance(order.telegram_id))} USDT`
    );
    return;
  }

  if (order.kind === "buy") {
    const product = await getProduct(order.product_id);
    if (!product) {
      await markOrderRejected(order.id, "Product not found");
      await bot.sendMessage(order.telegram_id, "❌ Product not found.");
      return;
    }

    const codes = await takeCodes(order.product_id, order.telegram_id, order.qty);
    if (!codes) {
      await markOrderRejected(order.id, "No stock");
      await bot.sendMessage(order.telegram_id, "❌ No stock available.");
      return;
    }

    await markOrderPaid(order.id);
    const lang = await getLang(order.telegram_id);
    await bot.sendMessage(
      order.telegram_id,
      `${T[lang].buySuccess}\n\n${codes.join("\n")}`
    );
  }
}

// ---------- Menus ----------
async function sendMainMenu(chatId) {
  const lang = await getLang(chatId);
  const t = T[lang];
  await bot.sendMessage(chatId, t.menu, {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.balance, callback_data: "menu_balance" }],
        [{ text: t.topup, callback_data: "menu_topup" }],
        [{ text: t.buy, callback_data: "menu_buy" }]
      ]
    }
  });
}

async function sendProductsMenu(chatId) {
  const lang = await getLang(chatId);
  const t = T[lang];
  const products = await getActiveProducts();

  if (!products.length) {
    return bot.sendMessage(chatId, t.noProducts);
  }

  const rows = products.map((p) => [
    {
      text: `${productTitle(p, lang)} — ${formatAmount(p.price)} USDT (${p.stock_count})`,
      callback_data: `product_${p.id}`
    }
  ]);

  rows.push([{ text: t.back, callback_data: "back_main" }]);

  return bot.sendMessage(chatId, t.chooseProduct, {
    reply_markup: { inline_keyboard: rows }
  });
}

async function sendPaymentMethodMenu(chatId, order) {
  const lang = await getLang(chatId);
  const t = T[lang];

  await bot.sendMessage(chatId, t.choosePaymentMethod, {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.payFromBalance, callback_data: `pay_balance_${order.id}` }],
        [{ text: t.payWithCryptoBot, callback_data: `pay_crypto_${order.id}` }],
        [{ text: t.payManualBinance, callback_data: `pay_manual_${order.id}` }],
        [{ text: t.back, callback_data: "back_main" }]
      ]
    }
  });
}

// ---------- Admin ----------
async function adminPanel(chatId) {
  if (!(await isAdmin(chatId))) return;

  await bot.sendMessage(chatId, "🛠 Admin Panel", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📊 Statistics", callback_data: "admin_stats" }],
        [{ text: "📦 Products", callback_data: "admin_products" }],
        [{ text: "🧾 Add Stock", callback_data: "admin_add_stock" }],
        [{ text: "⚙️ Settings", callback_data: "admin_settings" }],
        [{ text: "👮 Admins", callback_data: "admin_admins" }],
        [{ text: "🔴 / 🟢 Bot Power", callback_data: "admin_power" }]
      ]
    }
  });
}

async function adminStats(chatId) {
  const usersRes = await q(`SELECT COUNT(*)::int AS c FROM users`);
  const adminsRes = await q(`SELECT COUNT(*)::int AS c FROM admins`);
  const productsRes = await q(`SELECT COUNT(*)::int AS c FROM products`);
  const stockRes = await q(`SELECT COUNT(*)::int AS c FROM stock_items WHERE is_sold=FALSE`);
  const paidOrdersRes = await q(`SELECT COUNT(*)::int AS c FROM orders WHERE status='paid'`);
  const totalBalanceRes = await q(`SELECT COALESCE(SUM(balance), 0) AS s FROM users`);

  await bot.sendMessage(
    chatId,
    `📊 Stats

👥 Users: ${usersRes.rows[0].c}
👮 Admins: ${adminsRes.rows[0].c}
📦 Products: ${productsRes.rows[0].c}
🗃 Stock Available: ${stockRes.rows[0].c}
✅ Paid Orders: ${paidOrdersRes.rows[0].c}
💰 Total User Balance: ${formatAmount(totalBalanceRes.rows[0].s)} USDT`
  );
}

async function adminProducts(chatId) {
  const products = await q(`
    SELECT p.*,
      COALESCE((
        SELECT COUNT(*)::int FROM stock_items s
        WHERE s.product_id = p.id AND s.is_sold = FALSE
      ), 0) AS stock_count
    FROM products p
    ORDER BY p.id ASC
  `);

  const rows = products.rows.map((p) => [
    {
      text: `#${p.id} ${p.title_en} | ${formatAmount(p.price)} | stock ${p.stock_count} | ${p.active ? "ON" : "OFF"}`,
      callback_data: `admin_product_${p.id}`
    }
  ]);

  rows.unshift([{ text: "➕ Add Product", callback_data: "admin_add_product" }]);

  return bot.sendMessage(chatId, "📦 Products", {
    reply_markup: { inline_keyboard: rows }
  });
}

async function adminProductActions(chatId, productId) {
  const p = await getProduct(productId);
  if (!p) return bot.sendMessage(chatId, "❌ Product not found");

  return bot.sendMessage(
    chatId,
    `#${p.id}
AR: ${p.title_ar}
EN: ${p.title_en}
Price: ${formatAmount(p.price)}
Active: ${p.active ? "Yes" : "No"}`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✏️ Edit AR name", callback_data: `admin_edit_ar_${p.id}` }],
          [{ text: "✏️ Edit EN name", callback_data: `admin_edit_en_${p.id}` }],
          [{ text: "💲 Edit price", callback_data: `admin_edit_price_${p.id}` }],
          [{ text: p.active ? "⛔ Disable" : "✅ Enable", callback_data: `admin_toggle_product_${p.id}` }],
          [{ text: "🗑 Delete product", callback_data: `admin_delete_product_${p.id}` }]
        ]
      }
    }
  );
}

async function adminSettings(chatId) {
  const wallet = await getSetting("wallet", "");
  const binanceId = await getSetting("binance_id", "");
  const manualText = await getSetting("manual_payment_text", "");
  const enabled = await getBotEnabled();

  return bot.sendMessage(
    chatId,
    `⚙️ Settings

Wallet: ${wallet || "-"}
Binance ID: ${binanceId || "-"}
Bot enabled: ${enabled ? "true" : "false"}

Manual payment text:
${manualText || "-"}`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✏️ Edit wallet", callback_data: "admin_set_wallet" }],
          [{ text: "✏️ Edit Binance ID", callback_data: "admin_set_binance" }],
          [{ text: "✏️ Edit manual text", callback_data: "admin_set_manual_text" }]
        ]
      }
    }
  );
}

async function adminAdmins(chatId) {
  const admins = await getAdmins();
  const rows = admins.map((a) => [
    {
      text: `${a.telegram_id}${a.is_main ? " (MAIN)" : ""}`,
      callback_data: `admin_member_${a.telegram_id}`
    }
  ]);

  rows.unshift([{ text: "➕ Add Admin", callback_data: "admin_add_admin" }]);

  return bot.sendMessage(chatId, "👮 Admins", {
    reply_markup: { inline_keyboard: rows }
  });
}

// ---------- Start / Language ----------
bot.onText(/\/start/, async (msg) => {
  const id = msg.chat.id;

  await ensureUser(id, {
    first_name: msg.from?.first_name || "",
    username: msg.from?.username || ""
  });

  const adminNotify = `${T.ar.startedNotify}

الاسم: ${escapeHtml(msg.from?.first_name || "-")}
المعرف: @${escapeHtml(msg.from?.username || "-")}
الآيدي: <code>${id}</code>`;

  await notifyAdmins(adminNotify, { parse_mode: "HTML" });

  const enabled = await getBotEnabled();
  if (!enabled && !(await isAdmin(id))) {
    const lang = await getLang(id);
    return bot.sendMessage(id, T[lang].disabled);
  }

  await bot.sendMessage(id, T.en.chooseLanguage, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🇺🇸 English", callback_data: "lang_en" }],
        [{ text: "🇮🇶 العربية", callback_data: "lang_ar" }]
      ]
    }
  });
});

bot.onText(/\/admin/, async (msg) => {
  const id = msg.chat.id;
  if (!(await isAdmin(id))) return;
  await adminPanel(id);
});

// ---------- Callbacks ----------
bot.on("callback_query", async (qObj) => {
  const data = qObj.data;
  const id = qObj.message.chat.id;
  const lang = await getLang(id);
  const t = T[lang];

  try {
    if (data.startsWith("lang_")) {
      const code = data.split("_")[1];
      await setUserLang(id, code);
      return sendMainMenu(id);
    }

    const enabled = await getBotEnabled();
    if (!enabled && !(await isAdmin(id)) && !data.startsWith("lang_")) {
      return bot.sendMessage(id, t.disabled);
    }

    if (data === "back_main") return sendMainMenu(id);
    if (data === "menu_balance") {
      return bot.sendMessage(id, `${t.balanceText} ${formatAmount(await getBalance(id))} USDT`);
    }
    if (data === "menu_topup") {
      userState.set(id, { step: "topup_amount" });
      return bot.sendMessage(id, t.chooseTopupAmount);
    }
    if (data === "menu_buy") {
      return sendProductsMenu(id);
    }

    if (data.startsWith("product_")) {
      const productId = Number(data.split("_")[1]);
      const product = await getProduct(productId);
      if (!product || !product.active) return bot.sendMessage(id, t.noProducts);

      const stockCount = await getStockCount(productId);
      if (stockCount <= 0) return bot.sendMessage(id, t.noStock);

      userState.set(id, { step: "buy_qty", productId });
      return bot.sendMessage(
        id,
        `${productTitle(product, lang)}\n${t.stockText} ${stockCount}\n\n${t.chooseQty}`
      );
    }

    if (data.startsWith("pay_balance_")) {
      const orderId = Number(data.replace("pay_balance_", ""));
      const order = await getOrder(orderId);
      if (!order || order.telegram_id !== id || order.status !== "pending") return bot.sendMessage(id, t.txInvalid);

      const balance = await getBalance(id);
      if (balance < Number(order.final_amount)) {
        return bot.sendMessage(id, t.noBalance);
      }

      if (!(await deductBalance(id, Number(order.final_amount)))) {
        return bot.sendMessage(id, t.noBalance);
      }

      await finalizePaidOrder(order);
      return;
    }

    if (data.startsWith("pay_crypto_")) {
      const orderId = Number(data.replace("pay_crypto_", ""));
      const order = await getOrder(orderId);
      if (!order || order.telegram_id !== id || order.status !== "pending") {
        return bot.sendMessage(id, t.txInvalid);
      }

      let title = "Payment";
      if (order.kind === "topup") {
        title = lang === "ar" ? `شحن رصيد ${formatAmount(order.base_amount)} USDT` : `Top up ${formatAmount(order.base_amount)} USDT`;
      } else if (order.kind === "buy") {
        const p = await getProduct(order.product_id);
        title = p ? `${productTitle(p, lang)} x${order.qty}` : `Order #${order.id}`;
      }

      const invoice = await createCryptoInvoice({
        amount: formatAmount(order.final_amount),
        description: title,
        payload: JSON.stringify({
          order_id: order.id,
          user_id: id,
          kind: order.kind
        }),
        hiddenMessage: lang === "ar" ? "شكراً لدفعك" : "Thank you for your payment"
      });

      await setOrderInvoice(order.id, invoice);

      return bot.sendMessage(
        id,
        `${t.orderCreated}

${title}
💵 ${formatAmount(order.final_amount)} USDT`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: t.cryptoPayBtn, url: invoice.bot_invoice_url || invoice.mini_app_invoice_url || invoice.web_app_invoice_url }]
            ]
          }
        }
      );
    }

    if (data.startsWith("pay_manual_")) {
      const orderId = Number(data.replace("pay_manual_", ""));
      const order = await getOrder(orderId);
      if (!order || order.telegram_id !== id || order.status !== "pending") {
        return bot.sendMessage(id, t.txInvalid);
      }

      const binanceId = await getSetting("binance_id", "");
      const manualText = await getSetting("manual_payment_text", DEFAULT_MANUAL_PAYMENT_TEXT);

      userState.set(id, { step: "manual_proof", orderId });

      return bot.sendMessage(
        id,
        `${t.manualInfoTitle}

${manualText}

Binance ID: <code>${escapeHtml(binanceId || "-")}</code>
Amount: <code>${formatAmount(order.final_amount)} USDT</code>
Order: <code>#${order.id}</code>

${t.sendProof}`,
        { parse_mode: "HTML" }
      );
    }

    // ---------- Admin ----------
    if (data === "admin_stats") return adminStats(id);
    if (data === "admin_products") return adminProducts(id);
    if (data === "admin_settings") return adminSettings(id);
    if (data === "admin_admins") return adminAdmins(id);

    if (data === "admin_power") {
      const current = await getBotEnabled();
      await setSetting("bot_enabled", current ? "false" : "true");
      return bot.sendMessage(id, `Bot enabled = ${!current}`);
    }

    if (data === "admin_add_product") {
      userState.set(id, { step: "admin_add_product_ar" });
      return bot.sendMessage(id, "Send Arabic product name:");
    }

    if (data === "admin_add_stock") {
      userState.set(id, { step: "admin_add_stock_product_id" });
      return bot.sendMessage(id, "Send product ID for stock:");
    }

    if (data === "admin_add_admin") {
      userState.set(id, { step: "admin_add_admin" });
      return bot.sendMessage(id, "Send Telegram ID of new admin:");
    }

    if (data.startsWith("admin_product_")) {
      const productId = Number(data.replace("admin_product_", ""));
      return adminProductActions(id, productId);
    }

    if (data.startsWith("admin_toggle_product_")) {
      const productId = Number(data.replace("admin_toggle_product_", ""));
      const p = await getProduct(productId);
      if (!p) return bot.sendMessage(id, "Not found");
      await updateProduct(productId, { active: !p.active });
      return bot.sendMessage(id, "✅ Updated");
    }

    if (data.startsWith("admin_delete_product_")) {
      const productId = Number(data.replace("admin_delete_product_", ""));
      await deleteProduct(productId);
      return bot.sendMessage(id, "✅ Product deleted");
    }

    if (data.startsWith("admin_edit_ar_")) {
      const productId = Number(data.replace("admin_edit_ar_", ""));
      userState.set(id, { step: "admin_edit_product_ar", productId });
      return bot.sendMessage(id, "Send new Arabic name:");
    }

    if (data.startsWith("admin_edit_en_")) {
      const productId = Number(data.replace("admin_edit_en_", ""));
      userState.set(id, { step: "admin_edit_product_en", productId });
      return bot.sendMessage(id, "Send new English name:");
    }

    if (data.startsWith("admin_edit_price_")) {
      const productId = Number(data.replace("admin_edit_price_", ""));
      userState.set(id, { step: "admin_edit_product_price", productId });
      return bot.sendMessage(id, "Send new price:");
    }

    if (data === "admin_set_wallet") {
      userState.set(id, { step: "admin_set_wallet" });
      return bot.sendMessage(id, "Send new wallet:");
    }

    if (data === "admin_set_binance") {
      userState.set(id, { step: "admin_set_binance" });
      return bot.sendMessage(id, "Send new Binance ID:");
    }

    if (data === "admin_set_manual_text") {
      userState.set(id, { step: "admin_set_manual_text" });
      return bot.sendMessage(id, "Send new manual payment text:");
    }

    if (data.startsWith("admin_member_")) {
      const adminId = Number(data.replace("admin_member_", ""));
      const main = await isMainAdmin(adminId);

      return bot.sendMessage(
        id,
        `Admin: ${adminId}${main ? " (MAIN)" : ""}`,
        {
          reply_markup: {
            inline_keyboard: main
              ? [[{ text: "❌ Main admin cannot be removed", callback_data: "noop" }]]
              : [[{ text: "🗑 Remove admin", callback_data: `admin_remove_${adminId}` }]]
          }
        }
      );
    }

    if (data.startsWith("admin_remove_")) {
      const adminId = Number(data.replace("admin_remove_", ""));
      if (await isMainAdmin(adminId)) {
        return bot.sendMessage(id, "❌ Main admin cannot be removed");
      }
      await q(`DELETE FROM admins WHERE telegram_id=$1`, [adminId]);
      return bot.sendMessage(id, "✅ Admin removed");
    }

    if (data.startsWith("approve_manual_")) {
      const orderId = Number(data.replace("approve_manual_", ""));
      const order = await getOrder(orderId);
      if (!order || order.status !== "pending") return bot.sendMessage(id, "Already handled.");

      await markOrderPaid(order.id, id);
      await finalizePaidOrder(order);

      return bot.sendMessage(id, "✅ Manual payment approved");
    }

    if (data.startsWith("reject_manual_")) {
      const orderId = Number(data.replace("reject_manual_", ""));
      const order = await getOrder(orderId);
      if (!order || order.status !== "pending") return bot.sendMessage(id, "Already handled.");

      await markOrderRejected(order.id, "Rejected by admin", id);
      await bot.sendMessage(order.telegram_id, t.proofRejected);
      return bot.sendMessage(id, "✅ Manual payment rejected");
    }
  } catch (e) {
    console.error("callback error:", e);
    try {
      await bot.sendMessage(id, "❌ Error");
    } catch (_) {}
  } finally {
    try {
      await bot.answerCallbackQuery(qObj.id);
    } catch (_) {}
  }
});

// ---------- Messages ----------
bot.on("message", async (msg) => {
  const id = msg.chat.id;
  const text = msg.text;

  await ensureUser(id, {
    first_name: msg.from?.first_name || "",
    username: msg.from?.username || ""
  });

  const enabled = await getBotEnabled();
  const admin = await isAdmin(id);
  if (!enabled && !admin && text !== "/start") {
    const lang = await getLang(id);
    return bot.sendMessage(id, T[lang].disabled);
  }

  const state = userState.get(id);
  const lang = await getLang(id);
  const t = T[lang];

  // Manual proof photo
  if (msg.photo && state?.step === "manual_proof") {
    const order = await getOrder(state.orderId);
    if (!order || order.telegram_id !== id || order.status !== "pending") {
      userState.delete(id);
      return bot.sendMessage(id, "❌ Order not found.");
    }

    const largest = msg.photo[msg.photo.length - 1];
    await saveManualProof(order.id, largest.file_id, msg.message_id);

    const user = await getUser(id);
    const caption = `🟡 Manual payment proof

User: ${escapeHtml(user?.first_name || "-")}
Username: @${escapeHtml(user?.username || "-")}
ID: <code>${id}</code>
Order: <code>#${order.id}</code>
Kind: ${order.kind}
Amount: <code>${formatAmount(order.final_amount)} USDT</code>`;

    const admins = await getAdmins();
    for (const a of admins) {
      try {
        await bot.sendPhoto(a.telegram_id, largest.file_id, {
          caption,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Approve", callback_data: `approve_manual_${order.id}` }],
              [{ text: "❌ Reject", callback_data: `reject_manual_${order.id}` }]
            ]
          }
        });
      } catch (_) {}
    }

    userState.delete(id);
    return bot.sendMessage(id, t.manualWait);
  }

  if (!text || text.startsWith("/")) return;

  // User flows
  if (state?.step === "topup_amount") {
    const amount = Number(text);
    if (isNaN(amount) || amount <= 0) {
      return bot.sendMessage(id, t.invalidAmount);
    }

    const order = await createOrder({
      telegramId: id,
      kind: "topup",
      baseAmount: amount,
      finalAmount: amount,
      paymentMethod: "pending"
    });

    userState.delete(id);
    return sendPaymentMethodMenu(id, order);
  }

  if (state?.step === "buy_qty") {
    const qty = parseInt(text, 10);
    const product = await getProduct(state.productId);
    if (!product || !product.active) {
      userState.delete(id);
      return bot.sendMessage(id, t.noProducts);
    }

    const stock = await getStockCount(product.id);
    if (isNaN(qty) || qty <= 0) {
      return bot.sendMessage(id, t.qtyInvalid);
    }

    if (qty > stock) {
      return bot.sendMessage(id, t.noStock);
    }

    const amount = Number(product.price) * qty;
    const order = await createOrder({
      telegramId: id,
      kind: "buy",
      productId: product.id,
      qty,
      baseAmount: amount,
      finalAmount: amount,
      paymentMethod: "pending"
    });

    userState.delete(id);
    return sendPaymentMethodMenu(id, order);
  }

  // Admin flows
  if (admin && state?.step === "admin_add_product_ar") {
    userState.set(id, { step: "admin_add_product_en", title_ar: text });
    return bot.sendMessage(id, "Send English product name:");
  }

  if (admin && state?.step === "admin_add_product_en") {
    userState.set(id, {
      step: "admin_add_product_price",
      title_ar: state.title_ar,
      title_en: text
    });
    return bot.sendMessage(id, "Send product price:");
  }

  if (admin && state?.step === "admin_add_product_price") {
    const price = Number(text);
    if (isNaN(price) || price <= 0) return bot.sendMessage(id, "Invalid price");

    const p = await createProduct({
      title_ar: state.title_ar,
      title_en: state.title_en,
      price
    });
    userState.delete(id);
    return bot.sendMessage(id, `✅ Product created #${p.id}`);
  }

  if (admin && state?.step === "admin_add_stock_product_id") {
    const productId = Number(text);
    const product = await getProduct(productId);
    if (!product) return bot.sendMessage(id, "Product not found");

    userState.set(id, { step: "admin_add_stock_codes", productId });
    return bot.sendMessage(id, "Send codes, one code per line:");
  }

  if (admin && state?.step === "admin_add_stock_codes") {
    const lines = text
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    if (!lines.length) return bot.sendMessage(id, "No codes found");

    const count = await addStock(state.productId, lines);
    userState.delete(id);
    return bot.sendMessage(id, `✅ Added ${count} code(s)`);
  }

  if (admin && state?.step === "admin_edit_product_ar") {
    await updateProduct(state.productId, { title_ar: text });
    userState.delete(id);
    return bot.sendMessage(id, "✅ Arabic name updated");
  }

  if (admin && state?.step === "admin_edit_product_en") {
    await updateProduct(state.productId, { title_en: text });
    userState.delete(id);
    return bot.sendMessage(id, "✅ English name updated");
  }

  if (admin && state?.step === "admin_edit_product_price") {
    const price = Number(text);
    if (isNaN(price) || price <= 0) return bot.sendMessage(id, "Invalid price");
    await updateProduct(state.productId, { price });
    userState.delete(id);
    return bot.sendMessage(id, "✅ Price updated");
  }

  if (admin && state?.step === "admin_set_wallet") {
    await setSetting("wallet", text.trim());
    userState.delete(id);
    return bot.sendMessage(id, "✅ Wallet updated");
  }

  if (admin && state?.step === "admin_set_binance") {
    await setSetting("binance_id", text.trim());
    userState.delete(id);
    return bot.sendMessage(id, "✅ Binance ID updated");
  }

  if (admin && state?.step === "admin_set_manual_text") {
    await setSetting("manual_payment_text", text.trim());
    userState.delete(id);
    return bot.sendMessage(id, "✅ Manual payment text updated");
  }

  if (admin && state?.step === "admin_add_admin") {
    const newAdminId = Number(text.trim());
    if (!newAdminId) return bot.sendMessage(id, "Invalid Telegram ID");

    await q(
      `INSERT INTO admins (telegram_id, is_main) VALUES ($1, FALSE)
       ON CONFLICT (telegram_id) DO NOTHING`,
      [newAdminId]
    );
    userState.delete(id);
    return bot.sendMessage(id, "✅ Admin added");
  }
});

// ---------- Crypto Pay Webhook ----------
app.post("/crypto-pay/webhook", async (req, res) => {
  try {
    if (!verifyCryptoPayWebhook(req)) {
      return res.status(401).send("bad signature");
    }

    const update = req.body;
    // update types differ; we care about paid invoice
    const invoice = update?.payload || update?.invoice || update?.update?.invoice || update?.result || null;

    // Fallback: scan known shapes
    const invoiceId =
      invoice?.invoice_id ||
      update?.payload?.invoice_id ||
      update?.invoice_id ||
      update?.invoice?.invoice_id;

    const status =
      invoice?.status ||
      update?.payload?.status ||
      update?.status ||
      update?.invoice?.status;

    if (!invoiceId || status !== "paid") {
      return res.send("ok");
    }

    const order = await getOrderByInvoiceId(invoiceId);
    if (!order || order.status !== "pending") {
      return res.send("ok");
    }

    await finalizePaidOrder(order);
    return res.send("ok");
  } catch (e) {
    console.error("crypto webhook error:", e);
    return res.status(500).send("error");
  }
});

// ---------- Health ----------
app.get("/", (req, res) => {
  res.send("🔥 BOT RUNNING");
});

// ---------- Start ----------
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

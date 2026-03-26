// ========================
// index.js
// ========================

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const { Sequelize, DataTypes } = require('sequelize');

// ========================
// 1. إعدادات البيئة
// ========================
const TOKEN = process.env.BOT_TOKEN;
const WALLET = process.env.WALLET;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const DATABASE_URL = process.env.DATABASE_URL;

if (!TOKEN || !WALLET || !ADMIN_ID || !DATABASE_URL) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();
app.use(express.json());

// ========================
// 2. قاعدة البيانات (Sequelize)
// ========================
const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

// نموذج المستخدمين
const User = sequelize.define('User', {
  id: { type: DataTypes.BIGINT, primaryKey: true },
  lang: { type: DataTypes.STRING(2), defaultValue: 'en' },
  state: { type: DataTypes.TEXT, allowNull: true }, // تخزين الحالة (مثل انتظار TXID)
  pendingPurchase: { type: DataTypes.JSONB, allowNull: true } // { merchantId, qty, total, txid? }
});

// نموذج الخدمات (التجار)
const Merchant = sequelize.define('Merchant', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  nameEn: { type: DataTypes.STRING, allowNull: false },
  nameAr: { type: DataTypes.STRING, allowNull: false },
  price: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 } // السعر بالدولار
});

// نموذج الأكواد (المخزون)
const Code = sequelize.define('Code', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  value: { type: DataTypes.TEXT, allowNull: false }, // الكود نفسه
  merchantId: { type: DataTypes.INTEGER, references: { model: Merchant, key: 'id' } },
  isUsed: { type: DataTypes.BOOLEAN, defaultValue: false },
  usedBy: { type: DataTypes.BIGINT, allowNull: true }, // ID المستخدم الذي اشتراه
  soldAt: { type: DataTypes.DATE, allowNull: true }
});

// نموذج المعاملات
const Transaction = sequelize.define('Transaction', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  txid: { type: DataTypes.STRING, unique: true, allowNull: false }, // TXID فريد لمنع إعادة الاستخدام
  userId: { type: DataTypes.BIGINT, allowNull: false },
  merchantId: { type: DataTypes.INTEGER, allowNull: false },
  amount: { type: DataTypes.FLOAT, allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: 'pending' } // pending, completed, failed
});

// العلاقات
Merchant.hasMany(Code, { foreignKey: 'merchantId' });
Code.belongsTo(Merchant);
User.hasMany(Transaction);
Transaction.belongsTo(Merchant);

// ========================
// 3. نصوص البوت
// ========================
const T = {
  en: {
    start: '🌍 Choose language',
    menu: '👋 Main menu:',
    redeem: '🔄 Redeem Code',
    buy: '💳 Buy Codes',
    chooseMerchant: '👋 Choose merchant:',
    sendCard: '✍️ Send the card code:',
    processing: '⏳ Processing...',
    enterQty: '✍️ Enter quantity:',
    pay: '💰 Send payment:',
    sendTx: '🔗 Send TXID',
    checking: '⏳ Checking...',
    error: '❌ Error',
    invalidTx: '❌ Invalid TXID or insufficient amount',
    success: '✅ Payment successful! Here are your codes:',
    noCodes: '❌ Not enough codes in stock',
    back: '🔙 Back',
    adminPanel: '🔧 Admin Panel',
    addMerchant: '➕ Add Merchant',
    listMerchants: '📋 List Merchants',
    addCodes: '📦 Add Codes',
    stats: '📊 Stats',
    setPrice: '💰 Set Price',
    enterMerchantId: 'Enter merchant ID:',
    enterPrice: 'Enter new price (USD):',
    enterCodes: 'Send codes separated by new lines or spaces:',
    codesAdded: '✅ Codes added successfully!',
    priceUpdated: '💰 Price updated!',
    selectMerchantToSetPrice: 'Select merchant to set price:',
    selectMerchantToAddCodes: 'Select merchant to add codes:',
    merchantList: '📋 Merchants list:\n',
    merchantCreated: '✅ Merchant created! ID: {id}',
    askMerchantNameEn: 'Send merchant name in English:',
    askMerchantNameAr: 'Send merchant name in Arabic:',
    askMerchantPrice: 'Send price in USD:',
    totalCodes: '📦 Total codes in stock: {count}',
    totalSales: '💰 Total sales: {amount} USDT',
    pendingPurchases: '⏳ Pending purchases: {count}'
  },
  ar: {
    start: '🌍 اختر اللغة',
    menu: '👋 القائمة الرئيسية:',
    redeem: '🔄 استرداد الكود',
    buy: '💳 شراء كودات',
    chooseMerchant: '👋 اختر التاجر:',
    sendCard: '✍️ أرسل كود البطاقة:',
    processing: '⏳ جاري المعالجة...',
    enterQty: '✍️ أرسل الكمية:',
    pay: '💰 قم بالتحويل:',
    sendTx: '🔗 أرسل TXID',
    checking: '⏳ جاري التحقق...',
    error: '❌ خطأ',
    invalidTx: '❌ TXID غير صحيح أو المبلغ غير كاف',
    success: '✅ تم الدفع بنجاح! إليك الأكواد:',
    noCodes: '❌ لا يوجد عدد كافٍ من الأكواد في المخزون',
    back: '🔙 رجوع',
    adminPanel: '🔧 لوحة التحكم',
    addMerchant: '➕ إضافة تاجر',
    listMerchants: '📋 قائمة التجار',
    addCodes: '📦 إضافة أكواد',
    stats: '📊 الإحصائيات',
    setPrice: '💰 تعديل السعر',
    enterMerchantId: 'أدخل رقم التاجر:',
    enterPrice: 'أدخل السعر الجديد (دولار):',
    enterCodes: 'أرسل الأكواد مفصولة بسطور جديدة أو مسافات:',
    codesAdded: '✅ تمت إضافة الأكواد بنجاح!',
    priceUpdated: '💰 تم تحديث السعر!',
    selectMerchantToSetPrice: 'اختر التاجر لتعديل السعر:',
    selectMerchantToAddCodes: 'اختر التاجر لإضافة الأكواد:',
    merchantList: '📋 قائمة التجار:\n',
    merchantCreated: '✅ تم إنشاء التاجر! المعرف: {id}',
    askMerchantNameEn: 'أرسل اسم التاجر بالإنجليزية:',
    askMerchantNameAr: 'أرسل اسم التاجر بالعربية:',
    askMerchantPrice: 'أرسل السعر بالدولار:',
    totalCodes: '📦 إجمالي الأكواد في المخزون: {count}',
    totalSales: '💰 إجمالي المبيعات: {amount} USDT',
    pendingPurchases: '⏳ مشتريات معلقة: {count}'
  }
};

// ========================
// 4. دوال مساعدة
// ========================

// الحصول على لغة المستخدم
async function getLang(userId) {
  const user = await User.findByPk(userId);
  return user ? user.lang : 'en';
}

// إرسال القائمة الرئيسية
async function sendMainMenu(userId) {
  const lang = await getLang(userId);
  const t = T[lang];
  const keyboard = {
    inline_keyboard: [
      [{ text: t.redeem, callback_data: 'redeem' }],
      [{ text: t.buy, callback_data: 'buy' }],
      ...(userId === ADMIN_ID ? [[{ text: t.adminPanel, callback_data: 'admin' }]] : [])
    ]
  };
  await bot.sendMessage(userId, t.menu, { reply_markup: keyboard });
}

// عرض قائمة التجار للشراء
async function showMerchantsForBuy(userId) {
  const lang = await getLang(userId);
  const t = T[lang];
  const merchants = await Merchant.findAll({ order: [['id', 'ASC']] });
  if (merchants.length === 0) {
    await bot.sendMessage(userId, '❌ No merchants available.');
    return sendMainMenu(userId);
  }
  const buttons = merchants.map(m => ([{
    text: lang === 'en' ? m.nameEn : m.nameAr,
    callback_data: `buy_merchant_${m.id}`
  }]));
  buttons.push([{ text: t.back, callback_data: 'back_to_menu' }]);
  await bot.sendMessage(userId, t.chooseMerchant, { reply_markup: { inline_keyboard: buttons } });
}

// عرض قائمة التجار للاسترداد
async function showMerchantsForRedeem(userId) {
  const lang = await getLang(userId);
  const t = T[lang];
  const merchants = await Merchant.findAll({ order: [['id', 'ASC']] });
  if (merchants.length === 0) {
    await bot.sendMessage(userId, '❌ No merchants available.');
    return sendMainMenu(userId);
  }
  const buttons = merchants.map(m => ([{
    text: lang === 'en' ? m.nameEn : m.nameAr,
    callback_data: `redeem_merchant_${m.id}`
  }]));
  buttons.push([{ text: t.back, callback_data: 'back_to_menu' }]);
  await bot.sendMessage(userId, t.chooseMerchant, { reply_markup: { inline_keyboard: buttons } });
}

// التحقق من الدفع عبر TronScan
async function checkPayment(txid, expectedAmount) {
  try {
    const res = await axios.get(`https://apilist.tronscan.org/api/transaction-info?hash=${txid}`);
    if (!res.data || !res.data.toAddress) return false;
    const to = res.data.toAddress;
    const value = res.data.amount / 1e6; // من SUN إلى USDT
    // تحقق أن العنوان هو المحفظة المستلمة وأن المبلغ أكبر أو يساوي المطلوب
    return to === WALLET && value >= expectedAmount;
  } catch (error) {
    console.error('Error checking payment:', error.message);
    return false;
  }
}

// ========================
// 5. أوامر البوت
// ========================

// /start
bot.onText(/\/start/, async (msg) => {
  const userId = msg.chat.id;
  // تسجيل المستخدم إذا لم يكن موجوداً
  await User.findOrCreate({ where: { id: userId }, defaults: { lang: 'en' } });
  const lang = await getLang(userId);
  await bot.sendMessage(userId, T[lang].start, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🇺🇸 English', callback_data: 'lang_en' }],
        [{ text: '🇮🇶 العربية', callback_data: 'lang_ar' }]
      ]
    }
  });
});

// /admin (للمشرف فقط)
bot.onText(/\/admin/, async (msg) => {
  const userId = msg.chat.id;
  if (userId !== ADMIN_ID) return;
  await showAdminPanel(userId);
});

async function showAdminPanel(userId) {
  const lang = await getLang(userId);
  const t = T[lang];
  const keyboard = {
    inline_keyboard: [
      [{ text: t.addMerchant, callback_data: 'admin_add_merchant' }],
      [{ text: t.listMerchants, callback_data: 'admin_list_merchants' }],
      [{ text: t.setPrice, callback_data: 'admin_set_price' }],
      [{ text: t.addCodes, callback_data: 'admin_add_codes' }],
      [{ text: t.stats, callback_data: 'admin_stats' }],
      [{ text: t.back, callback_data: 'back_to_menu' }]
    ]
  };
  await bot.sendMessage(userId, t.adminPanel, { reply_markup: keyboard });
}

// ========================
// 6. معالجة callback_query
// ========================
bot.on('callback_query', async (query) => {
  const userId = query.message.chat.id;
  const data = query.data;

  // تحديث حالة المستخدم
  await User.findOrCreate({ where: { id: userId }, defaults: { lang: 'en' } });

  // اختيار اللغة
  if (data.startsWith('lang_')) {
    const newLang = data.split('_')[1];
    await User.update({ lang: newLang }, { where: { id: userId } });
    await sendMainMenu(userId);
    await bot.answerCallbackQuery(query.id);
    return;
  }

  // العودة للقائمة
  if (data === 'back_to_menu') {
    await sendMainMenu(userId);
    await bot.answerCallbackQuery(query.id);
    return;
  }

  // فتح لوحة الأدمن
  if (data === 'admin' && userId === ADMIN_ID) {
    await showAdminPanel(userId);
    await bot.answerCallbackQuery(query.id);
    return;
  }

  // --- عمليات الأدمن ---
  if (data === 'admin_add_merchant' && userId === ADMIN_ID) {
    // نطلب اسم التاجر بالإنجليزية
    await User.update({ state: JSON.stringify({ action: 'add_merchant', step: 'nameEn' }) }, { where: { id: userId } });
    await bot.sendMessage(userId, T[await getLang(userId)].askMerchantNameEn);
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'admin_list_merchants' && userId === ADMIN_ID) {
    const merchants = await Merchant.findAll();
    if (merchants.length === 0) {
      await bot.sendMessage(userId, '📭 No merchants yet.');
    } else {
      let text = T[await getLang(userId)].merchantList;
      merchants.forEach(m => {
        text += `ID: ${m.id} | EN: ${m.nameEn} | AR: ${m.nameAr} | Price: ${m.price} USDT\n`;
      });
      await bot.sendMessage(userId, text);
    }
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'admin_set_price' && userId === ADMIN_ID) {
    const merchants = await Merchant.findAll();
    if (merchants.length === 0) {
      await bot.sendMessage(userId, '❌ No merchants to set price.');
      await bot.answerCallbackQuery(query.id);
      return;
    }
    const lang = await getLang(userId);
    const buttons = merchants.map(m => ([{
      text: lang === 'en' ? m.nameEn : m.nameAr,
      callback_data: `admin_setprice_${m.id}`
    }]));
    buttons.push([{ text: T[lang].back, callback_data: 'admin' }]);
    await bot.sendMessage(userId, T[lang].selectMerchantToSetPrice, { reply_markup: { inline_keyboard: buttons } });
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith('admin_setprice_') && userId === ADMIN_ID) {
    const merchantId = parseInt(data.split('_')[2]);
    await User.update({ state: JSON.stringify({ action: 'set_price', merchantId }) }, { where: { id: userId } });
    await bot.sendMessage(userId, T[await getLang(userId)].enterPrice);
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'admin_add_codes' && userId === ADMIN_ID) {
    const merchants = await Merchant.findAll();
    if (merchants.length === 0) {
      await bot.sendMessage(userId, '❌ No merchants to add codes.');
      await bot.answerCallbackQuery(query.id);
      return;
    }
    const lang = await getLang(userId);
    const buttons = merchants.map(m => ([{
      text: lang === 'en' ? m.nameEn : m.nameAr,
      callback_data: `admin_addcodes_${m.id}`
    }]));
    buttons.push([{ text: T[lang].back, callback_data: 'admin' }]);
    await bot.sendMessage(userId, T[lang].selectMerchantToAddCodes, { reply_markup: { inline_keyboard: buttons } });
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith('admin_addcodes_') && userId === ADMIN_ID) {
    const merchantId = parseInt(data.split('_')[2]);
    await User.update({ state: JSON.stringify({ action: 'add_codes', merchantId }) }, { where: { id: userId } });
    await bot.sendMessage(userId, T[await getLang(userId)].enterCodes);
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'admin_stats' && userId === ADMIN_ID) {
    const lang = await getLang(userId);
    const totalCodes = await Code.count({ where: { isUsed: false } });
    const completedSales = await Transaction.sum('amount', { where: { status: 'completed' } }) || 0;
    const pendingCount = await Transaction.count({ where: { status: 'pending' } });
    const statsText = `${T[lang].totalCodes.replace('{count}', totalCodes)}\n${T[lang].totalSales.replace('{amount}', completedSales)}\n${T[lang].pendingPurchases.replace('{count}', pendingCount)}`;
    await bot.sendMessage(userId, statsText);
    await bot.answerCallbackQuery(query.id);
    return;
  }

  // --- عمليات الشراء ---
  if (data.startsWith('buy_merchant_')) {
    const merchantId = parseInt(data.split('_')[2]);
    const lang = await getLang(userId);
    // التحقق من وجود أكواد للتاجر
    const availableCodes = await Code.count({ where: { merchantId, isUsed: false } });
    if (availableCodes === 0) {
      await bot.sendMessage(userId, T[lang].noCodes);
      await sendMainMenu(userId);
      await bot.answerCallbackQuery(query.id);
      return;
    }
    await User.update({ state: JSON.stringify({ action: 'buy', merchantId }) }, { where: { id: userId } });
    await bot.sendMessage(userId, `${T[lang].enterQty}\n📦 Available: ${availableCodes}`);
    await bot.answerCallbackQuery(query.id);
    return;
  }

  // --- عمليات الاسترداد ---
  if (data.startsWith('redeem_merchant_')) {
    const merchantId = parseInt(data.split('_')[2]);
    await User.update({ state: JSON.stringify({ action: 'redeem', merchantId }) }, { where: { id: userId } });
    await bot.sendMessage(userId, T[await getLang(userId)].sendCard);
    await bot.answerCallbackQuery(query.id);
    return;
  }

  // زر الشراء من القائمة
  if (data === 'buy') {
    await showMerchantsForBuy(userId);
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'redeem') {
    await showMerchantsForRedeem(userId);
    await bot.answerCallbackQuery(query.id);
    return;
  }

  await bot.answerCallbackQuery(query.id);
});

// ========================
// 7. معالجة الرسائل النصية
// ========================
bot.on('message', async (msg) => {
  const userId = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith('/')) return;

  const user = await User.findByPk(userId);
  if (!user) return;

  const lang = user.lang;
  const t = T[lang];
  let state = user.state ? JSON.parse(user.state) : null;

  // --- معالجة إدخالات الأدمن ---
  if (userId === ADMIN_ID && state) {
    if (state.action === 'add_merchant') {
      if (state.step === 'nameEn') {
        await User.update({ state: JSON.stringify({ ...state, step: 'nameAr', nameEn: text }) }, { where: { id: userId } });
        await bot.sendMessage(userId, T[lang].askMerchantNameAr);
        return;
      } else if (state.step === 'nameAr') {
        await User.update({ state: JSON.stringify({ ...state, step: 'price', nameAr: text }) }, { where: { id: userId } });
        await bot.sendMessage(userId, T[lang].askMerchantPrice);
        return;
      } else if (state.step === 'price') {
        const price = parseFloat(text);
        if (isNaN(price)) {
          await bot.sendMessage(userId, '❌ Invalid price.');
          await User.update({ state: null }, { where: { id: userId } });
          return;
        }
        const merchant = await Merchant.create({ nameEn: state.nameEn, nameAr: state.nameAr, price });
        await bot.sendMessage(userId, T[lang].merchantCreated.replace('{id}', merchant.id));
        await User.update({ state: null }, { where: { id: userId } });
        await showAdminPanel(userId);
        return;
      }
    }

    if (state.action === 'set_price') {
      const price = parseFloat(text);
      if (isNaN(price)) {
        await bot.sendMessage(userId, '❌ Invalid price.');
        await User.update({ state: null }, { where: { id: userId } });
        return;
      }
      await Merchant.update({ price }, { where: { id: state.merchantId } });
      await bot.sendMessage(userId, T[lang].priceUpdated);
      await User.update({ state: null }, { where: { id: userId } });
      await showAdminPanel(userId);
      return;
    }

    if (state.action === 'add_codes') {
      // توقع أن النص يحتوي على أكواد مفصولة بمسافات أو أسطر جديدة
      const codes = text.split(/\s+/).filter(c => c.trim().length > 0);
      if (codes.length === 0) {
        await bot.sendMessage(userId, '❌ No codes found.');
        await User.update({ state: null }, { where: { id: userId } });
        return;
      }
      const merchantId = state.merchantId;
      const codesToInsert = codes.map(code => ({ value: code, merchantId, isUsed: false }));
      await Code.bulkCreate(codesToInsert);
      await bot.sendMessage(userId, `${T[lang].codesAdded}\nAdded ${codes.length} codes.`);
      await User.update({ state: null }, { where: { id: userId } });
      await showAdminPanel(userId);
      return;
    }
  }

  // --- معالجة الشراء (انتظار الكمية) ---
  if (state && state.action === 'buy') {
    const qty = parseInt(text);
    if (isNaN(qty) || qty <= 0) {
      await bot.sendMessage(userId, '❌ Invalid quantity.');
      return;
    }
    const merchant = await Merchant.findByPk(state.merchantId);
    if (!merchant) {
      await bot.sendMessage(userId, '❌ Merchant not found.');
      await User.update({ state: null }, { where: { id: userId } });
      return;
    }
    const available = await Code.count({ where: { merchantId: merchant.id, isUsed: false } });
    if (qty > available) {
      await bot.sendMessage(userId, t.noCodes + ` (Available: ${available})`);
      return;
    }
    const total = qty * merchant.price;
    // حفظ حالة الشراء مع الكمية والمبلغ
    await User.update({ state: JSON.stringify({ action: 'awaiting_tx', merchantId: merchant.id, qty, total }) }, { where: { id: userId } });
    await bot.sendMessage(userId, `${t.pay}\n\n💵 ${total} USDT\n📍 ${WALLET}\n\n${t.sendTx}`);
    return;
  }

  // --- معالجة TXID (بعد إرسال المبلغ) ---
  if (state && state.action === 'awaiting_tx') {
    const txid = text.trim();
    const { merchantId, qty, total } = state;

    // التحقق من عدم استخدام TXID من قبل
    const existingTx = await Transaction.findOne({ where: { txid } });
    if (existingTx) {
      await bot.sendMessage(userId, '❌ This transaction ID has already been used.');
      return;
    }

    const waitingMsg = await bot.sendMessage(userId, t.checking);
    const valid = await checkPayment(txid, total);

    if (!valid) {
      await bot.editMessageText(t.invalidTx, { chat_id: userId, message_id: waitingMsg.message_id });
      // لا نغير الحالة ليعيد المحاولة
      return;
    }

    // تسجيل المعاملة
    const transaction = await Transaction.create({
      txid,
      userId,
      merchantId,
      amount: total,
      quantity: qty,
      status: 'completed'
    });

    // استخراج الأكواد (أقدمها أولاً)
    const codes = await Code.findAll({
      where: { merchantId, isUsed: false },
      limit: qty,
      order: [['id', 'ASC']]
    });
    if (codes.length < qty) {
      await bot.editMessageText(t.noCodes, { chat_id: userId, message_id: waitingMsg.message_id });
      return;
    }
    const codesList = codes.map(c => c.value).join('\n');
    // تحديث حالة الأكواد
    await Code.update({ isUsed: true, usedBy: userId, soldAt: new Date() }, { where: { id: codes.map(c => c.id) } });
    await bot.editMessageText(`${t.success}\n\n${codesList}`, { chat_id: userId, message_id: waitingMsg.message_id });
    // تنظيف الحالة
    await User.update({ state: null }, { where: { id: userId } });
    await sendMainMenu(userId);
    return;
  }

  // --- معالجة الاسترداد (كود بطاقة) ---
  if (state && state.action === 'redeem') {
    const merchantId = state.merchantId;
    const cardCode = text.trim();
    const waitingMsg = await bot.sendMessage(userId, t.processing);

    try {
      // استدعاء API خارجي (node-card.com)
      const params = new URLSearchParams();
      params.append('card_key', cardCode);
      params.append('merchant_dict_id', merchantId);
      params.append('platform_id', '1');
      const res = await axios.post('https://api.node-card.com/api/open/card/redeem', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      await bot.deleteMessage(userId, waitingMsg.message_id);
      if (res.data.code !== 1) {
        await bot.sendMessage(userId, '❌ ' + (res.data.msg || 'Unknown error'));
      } else {
        const c = res.data.data;
        await bot.sendMessage(userId, `💳 CARD\n\n${c.card_number}\nCVV: ${c.cvv}\nEXP: ${c.exp}\n💰 ${c.available_amount}\n🏪 ${c.merchant_name}`);
      }
    } catch (error) {
      console.error('Redeem error:', error.message);
      await bot.editMessageText(t.error, { chat_id: userId, message_id: waitingMsg.message_id });
    } finally {
      await User.update({ state: null }, { where: { id: userId } });
      await sendMainMenu(userId);
    }
    return;
  }
});

// ========================
// 8. مزامنة قاعدة البيانات وتشغيل الخادم
// ========================
sequelize.sync({ alter: true }).then(() => {
  console.log('✅ Database synced');
  // إنشاء خادم Express لـ Railway
  const PORT = process.env.PORT || 3000;
  app.get('/', (req, res) => res.send('Bot is running'));
  app.listen(PORT, () => console.log(`🚀 Server started on port ${PORT}`));
}).catch(err => {
  console.error('Database error:', err);
  process.exit(1);
});

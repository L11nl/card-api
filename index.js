// ========================
// index.js - البوت المتكامل (نسخة متطورة)
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
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const DATABASE_URL = process.env.DATABASE_URL;

if (!TOKEN || !ADMIN_ID || !DATABASE_URL) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();
app.use(express.json());

// ========================
// 2. قاعدة البيانات
// ========================
const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 } // تحسين الاتصال
});

// النماذج (Models)
const User = sequelize.define('User', {
  id: { type: DataTypes.BIGINT, primaryKey: true },
  lang: { type: DataTypes.STRING(2), defaultValue: 'en' },
  balance: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 }, // الرصيد
  state: { type: DataTypes.TEXT, allowNull: true }
});

const Setting = sequelize.define('Setting', {
  key: { type: DataTypes.STRING, allowNull: false },
  lang: { type: DataTypes.STRING(2), allowNull: false },
  value: { type: DataTypes.TEXT, allowNull: false }
}, { indexes: [{ unique: true, fields: ['key', 'lang'] }] });

const Merchant = sequelize.define('Merchant', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  nameEn: { type: DataTypes.STRING, allowNull: false },
  nameAr: { type: DataTypes.STRING, allowNull: false },
  price: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 }
});

const PaymentMethod = sequelize.define('PaymentMethod', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  nameEn: { type: DataTypes.STRING, allowNull: false },
  nameAr: { type: DataTypes.STRING, allowNull: false },
  details: { type: DataTypes.TEXT, allowNull: false },
  type: { type: DataTypes.STRING, defaultValue: 'manual' }, // manual, auto
  config: { type: DataTypes.JSONB, defaultValue: {} }, // إعدادات إضافية (مثلاً عنوان المحفظة، مفتاح API)
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
});

const Code = sequelize.define('Code', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  value: { type: DataTypes.TEXT, allowNull: false },
  merchantId: { type: DataTypes.INTEGER, references: { model: Merchant, key: 'id' } },
  isUsed: { type: DataTypes.BOOLEAN, defaultValue: false },
  usedBy: { type: DataTypes.BIGINT, allowNull: true },
  soldAt: { type: DataTypes.DATE, allowNull: true }
});

const BalanceTransaction = sequelize.define('BalanceTransaction', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.BIGINT, allowNull: false },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false }, // موجب للإيداع، سالب للسحب
  type: { type: DataTypes.STRING, allowNull: false }, // 'deposit', 'purchase'
  paymentMethodId: { type: DataTypes.INTEGER, references: { model: PaymentMethod, key: 'id' }, allowNull: true },
  txid: { type: DataTypes.STRING, allowNull: true }, // معرف المعاملة الخارجية
  imageFileId: { type: DataTypes.STRING, allowNull: true },
  status: { type: DataTypes.STRING, defaultValue: 'pending' }, // pending, completed, rejected
  adminMessageId: { type: DataTypes.BIGINT, allowNull: true },
  createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
});

const BotService = sequelize.define('BotService', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  token: { type: DataTypes.STRING, unique: true, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  allowedActions: { type: DataTypes.JSONB, defaultValue: [] }, // ['code', 'admin']
  ownerId: { type: DataTypes.BIGINT, allowNull: true }, // من يملك هذا البوت (يمكنه الإدارة)
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
});

const BotStat = sequelize.define('BotStat', {
  botId: { type: DataTypes.INTEGER, references: { model: BotService, key: 'id' } },
  action: { type: DataTypes.STRING },
  count: { type: DataTypes.INTEGER, defaultValue: 0 },
  lastUsed: { type: DataTypes.DATE }
});

// العلاقات
Merchant.hasMany(Code, { foreignKey: 'merchantId' });
Code.belongsTo(Merchant);
BalanceTransaction.belongsTo(User, { foreignKey: 'userId' });
BalanceTransaction.belongsTo(PaymentMethod);
BotService.hasMany(BotStat, { foreignKey: 'botId' });
BotStat.belongsTo(BotService);

// ========================
// 3. النصوص الافتراضية (ديناميكية)
// ========================
const DEFAULT_TEXTS = {
  en: {
    start: '🌍 Choose language',
    menu: '👋 Main menu:',
    redeem: '🔄 Redeem Code',
    buy: '🛒 Buy Codes',
    myBalance: '💰 My Balance',
    deposit: '💳 Deposit',
    support: '📞 Support',
    chooseMerchant: '👋 Choose merchant:',
    sendCard: '✍️ Send the card code:',
    processing: '⏳ Processing...',
    enterQty: '✍️ Enter quantity:',
    notEnoughBalance: '❌ Insufficient balance. Your balance: {balance} USD',
    choosePaymentMethod: '💳 Choose payment method:',
    enterDepositAmount: '💰 Enter amount in USD:',
    pay: '💰 Send payment to:',
    sendTx: '🔗 Send TXID (transaction ID) after payment:',
    sendImage: '📸 Send a screenshot of the payment receipt:',
    checking: '⏳ Checking...',
    error: '❌ Error',
    invalidTx: '❌ Invalid TXID or insufficient amount',
    depositSuccess: '✅ Deposit successful! New balance: {balance} USD',
    depositRejected: '❌ Your deposit was rejected.',
    success: '✅ Purchase successful! Here are your codes:',
    noCodes: '❌ Not enough codes in stock',
    back: '🔙 Back',
    adminPanel: '🔧 Admin Panel',
    addMerchant: '➕ Add Merchant',
    listMerchants: '📋 List Merchants',
    addCodes: '📦 Add Codes',
    stats: '📊 Stats',
    setPrice: '💰 Set Price',
    paymentMethods: '💳 Payment Methods',
    addPaymentMethod: '➕ Add Payment Method',
    deletePaymentMethod: '🗑️ Delete Payment Method',
    noPaymentMethods: '❌ No payment methods available.',
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
    pendingDeposits: '⏳ Pending deposits: {count}',
    manageBots: '🤖 Manage Bots',
    addBot: '➕ Add Bot',
    listBots: '📋 List Bots',
    removeBot: '❌ Remove Bot',
    editBotPerms: '✏️ Edit Permissions',
    botStats: '📊 Bot Stats',
    enterBotToken: 'Send bot token:',
    enterBotName: 'Send bot name:',
    selectBotActions: 'Select allowed actions (multiple):',
    botAdded: '✅ Bot added!',
    botRemoved: '❌ Bot removed!',
    botStatsText: '📊 Bot stats for {name}:\n',
    permissionsUpdated: '✅ Bot permissions updated!',
    depositRequestPending: '📝 Your deposit request has been sent to admin. Please wait for approval.',
    depositNotification: '💳 New deposit request from user {userId}\nAmount: {amount} USD\nPayment Method: {method}\n\n',
    approve: '✅ Approve',
    reject: '❌ Reject',
    supportMessageSent: '📨 Your message has been sent to support. You will receive a reply soon.',
    supportNotification: '📩 New support message from user {userId}:\n\n{message}',
    replyToSupport: 'Reply to this user:',
    sendReply: 'Send your reply:',
    supportReplySent: '✅ Reply sent to user.',
    redeemSuccess: '✅ Card redeemed successfully!\n\n💳 Card Details:\n{details}',
    redeemFailed: '❌ Failed to redeem card: {reason}',
    sendCode: '✍️ Send the card code:'
  },
  ar: {
    start: '🌍 اختر اللغة',
    menu: '👋 القائمة الرئيسية:',
    redeem: '🔄 استرداد الكود',
    buy: '🛒 شراء كودات',
    myBalance: '💰 رصيدي',
    deposit: '💳 شحن الرصيد',
    support: '📞 الدعم الفني',
    chooseMerchant: '👋 اختر التاجر:',
    sendCard: '✍️ أرسل كود البطاقة:',
    processing: '⏳ جاري المعالجة...',
    enterQty: '✍️ أرسل الكمية:',
    notEnoughBalance: '❌ رصيد غير كاف. رصيدك: {balance} دولار',
    choosePaymentMethod: '💳 اختر طريقة الدفع:',
    enterDepositAmount: '💰 أدخل المبلغ بالدولار:',
    pay: '💰 قم بالتحويل إلى:',
    sendTx: '🔗 أرسل TXID بعد الدفع:',
    sendImage: '📸 أرسل صورة إيصال الدفع:',
    checking: '⏳ جاري التحقق...',
    error: '❌ خطأ',
    invalidTx: '❌ TXID غير صحيح أو المبلغ غير كاف',
    depositSuccess: '✅ تم الشحن بنجاح! الرصيد الجديد: {balance} دولار',
    depositRejected: '❌ تم رفض عملية الشحن.',
    success: '✅ تم الشراء بنجاح! إليك الأكواد:',
    noCodes: '❌ لا يوجد عدد كافٍ من الأكواد في المخزون',
    back: '🔙 رجوع',
    adminPanel: '🔧 لوحة التحكم',
    addMerchant: '➕ إضافة تاجر',
    listMerchants: '📋 قائمة التجار',
    addCodes: '📦 إضافة أكواد',
    stats: '📊 الإحصائيات',
    setPrice: '💰 تعديل السعر',
    paymentMethods: '💳 طرق الدفع',
    addPaymentMethod: '➕ إضافة طريقة دفع',
    deletePaymentMethod: '🗑️ حذف طريقة دفع',
    noPaymentMethods: '❌ لا توجد طرق دفع متاحة.',
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
    pendingDeposits: '⏳ شحنات معلقة: {count}',
    manageBots: '🤖 إدارة البوتات',
    addBot: '➕ إضافة بوت',
    listBots: '📋 قائمة البوتات',
    removeBot: '❌ حذف بوت',
    editBotPerms: '✏️ تعديل الصلاحيات',
    botStats: '📊 إحصائيات البوت',
    enterBotToken: 'أرسل توكن البوت:',
    enterBotName: 'أرسل اسم البوت:',
    selectBotActions: 'اختر الصلاحيات المسموحة (متعدد):',
    botAdded: '✅ تمت إضافة البوت!',
    botRemoved: '❌ تم حذف البوت!',
    botStatsText: '📊 إحصائيات البوت {name}:\n',
    permissionsUpdated: '✅ تم تحديث صلاحيات البوت!',
    depositRequestPending: '📝 تم إرسال طلب الشحن إلى الأدمن. يرجى الانتظار للموافقة.',
    depositNotification: '💳 طلب شحن جديد من المستخدم {userId}\nالمبلغ: {amount} دولار\nطريقة الدفع: {method}\n\n',
    approve: '✅ موافقة',
    reject: '❌ رفض',
    supportMessageSent: '📨 تم إرسال رسالتك إلى الدعم الفني. ستتلقى رداً قريباً.',
    supportNotification: '📩 رسالة دعم جديدة من المستخدم {userId}:\n\n{message}',
    replyToSupport: 'رد على هذا المستخدم:',
    sendReply: 'أرسل ردك:',
    supportReplySent: '✅ تم إرسال الرد إلى المستخدم.',
    redeemSuccess: '✅ تم استرداد البطاقة بنجاح!\n\n💳 تفاصيل البطاقة:\n{details}',
    redeemFailed: '❌ فشل استرداد البطاقة: {reason}',
    sendCode: '✍️ أرسل كود البطاقة:'
  }
};

// قائمة الإجراءات المتاحة للبوتات الفرعية
const BOT_ACTIONS = {
  code: 'code',    // صلاحية /code فقط
  full: 'full'     // صلاحية كاملة (إدارة كاملة)
};

// دوال مساعدة للنصوص
async function getText(userId, key, replacements = {}) {
  try {
    const user = await User.findByPk(userId);
    const lang = user ? user.lang : 'en';
    let setting = await Setting.findOne({ where: { key, lang } });
    let text = setting ? setting.value : DEFAULT_TEXTS[lang][key];
    if (!text) text = DEFAULT_TEXTS.en[key];
    for (const [k, v] of Object.entries(replacements)) {
      text = text.replace(new RegExp(`{${k}}`, 'g'), v);
    }
    return text;
  } catch (err) {
    console.error('Error in getText:', err);
    return DEFAULT_TEXTS.en[key] || key;
  }
}

async function updateText(key, lang, value) {
  const [setting, created] = await Setting.findOrCreate({
    where: { key, lang },
    defaults: { value }
  });
  if (!created) {
    setting.value = value;
    await setting.save();
  }
}

function isAdmin(userId) {
  return userId === ADMIN_ID;
}

// التحقق من صلاحية البوت الفرعي (للـ API)
async function checkBotPermission(token, action) {
  const botService = await BotService.findOne({ where: { token, isActive: true } });
  if (!botService) return false;
  if (action === 'code') {
    return botService.allowedActions.includes('code');
  } else if (action === 'full') {
    return botService.allowedActions.includes('full');
  }
  return false;
}

// دوال عرض القوائم
async function sendMainMenu(userId) {
  const menuText = await getText(userId, 'menu');
  const keyboard = {
    inline_keyboard: [
      [{ text: await getText(userId, 'redeem'), callback_data: 'redeem' }],
      [{ text: await getText(userId, 'buy'), callback_data: 'buy' }],
      [{ text: await getText(userId, 'myBalance'), callback_data: 'my_balance' }],
      [{ text: await getText(userId, 'deposit'), callback_data: 'deposit' }],
      [{ text: await getText(userId, 'support'), callback_data: 'support' }],
      ...((isAdmin(userId)) ? [[{ text: await getText(userId, 'adminPanel'), callback_data: 'admin' }]] : [])
    ]
  };
  await bot.sendMessage(userId, menuText, { reply_markup: keyboard });
}

async function showAdminPanel(userId) {
  if (!isAdmin(userId)) return;
  const panelText = await getText(userId, 'adminPanel');
  const keyboard = {
    inline_keyboard: [
      [{ text: await getText(userId, 'manageBots'), callback_data: 'admin_manage_bots' }],
      [{ text: await getText(userId, 'addMerchant'), callback_data: 'admin_add_merchant' }],
      [{ text: await getText(userId, 'listMerchants'), callback_data: 'admin_list_merchants' }],
      [{ text: await getText(userId, 'setPrice'), callback_data: 'admin_set_price' }],
      [{ text: await getText(userId, 'addCodes'), callback_data: 'admin_add_codes' }],
      [{ text: await getText(userId, 'paymentMethods'), callback_data: 'admin_payment_methods' }],
      [{ text: await getText(userId, 'stats'), callback_data: 'admin_stats' }],
      [{ text: await getText(userId, 'back'), callback_data: 'back_to_menu' }]
    ]
  };
  await bot.sendMessage(userId, panelText, { reply_markup: keyboard });
}

// عرض قائمة البوتات مع أزرار الإدارة
async function showBotsList(userId) {
  if (!isAdmin(userId)) return;
  const bots = await BotService.findAll();
  if (bots.length === 0) {
    await bot.sendMessage(userId, 'No bots found.');
    return;
  }
  for (const b of bots) {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '➕ Grant /code', callback_data: `bot_grant_code_${b.id}` },
          { text: '👑 Grant Full', callback_data: `bot_grant_full_${b.id}` },
          { text: '❌ Remove Permissions', callback_data: `bot_remove_perms_${b.id}` }
        ],
        [{ text: '🗑️ Delete Bot', callback_data: `admin_remove_bot_confirm_${b.id}` }]
      ]
    };
    await bot.sendMessage(userId, `🤖 *${b.name}*\nID: ${b.id}\nAllowed: ${b.allowedActions.join(', ') || 'none'}\nOwner: ${b.ownerId || 'none'}`, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
}

// دوال الاسترداد
async function redeemCard(cardKey, merchantId, platformId = '1') {
  try {
    const apiKey = process.env.NODE_CARD_API_KEY;
    const baseUrl = process.env.NODE_CARD_BASE_URL || 'https://api.node-card.com';
    const params = new URLSearchParams();
    params.append('card_key', cardKey);
    params.append('merchant_dict_id', merchantId);
    params.append('platform_id', platformId);
    if (apiKey) params.append('api_key', apiKey);

    const response = await axios.post(`${baseUrl}/api/open/card/redeem`, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000
    });
    if (response.data && response.data.code === 1) {
      return { success: true, data: response.data.data };
    } else {
      return { success: false, reason: response.data?.msg || 'Unknown error' };
    }
  } catch (error) {
    console.error('Redeem API error:', error.message);
    return { success: false, reason: 'API connection failed' };
  }
}

function formatCardDetails(cardData) {
  return `💳 ${cardData.card_number}\nCVV: ${cardData.cvv}\nEXP: ${cardData.exp}\n💰 ${cardData.available_amount}\n🏪 ${cardData.merchant_name}`;
}

// دوال الدفع التلقائي (مثال Tron)
async function checkAutoPayment(txid, expectedAmount) {
  try {
    const res = await axios.get(`https://apilist.tronscan.org/api/transaction-info?hash=${txid}`, { timeout: 8000 });
    if (!res.data || !res.data.toAddress) return false;
    const value = res.data.amount / 1e6;
    return value >= expectedAmount;
  } catch {
    return false;
  }
}

// دوال الشراء (باستخدام الرصيد)
async function processPurchase(userId, merchantId, quantity) {
  const merchant = await Merchant.findByPk(merchantId);
  if (!merchant) return { success: false, reason: 'Merchant not found' };
  const totalCost = merchant.price * quantity;
  const user = await User.findByPk(userId);
  if (!user) return { success: false, reason: 'User not found' };
  const currentBalance = parseFloat(user.balance);
  if (currentBalance < totalCost) {
    return { success: false, reason: 'Insufficient balance' };
  }
  // حجز الكودات
  const codes = await Code.findAll({ where: { merchantId, isUsed: false }, limit: quantity, order: [['id', 'ASC']] });
  if (codes.length < quantity) {
    return { success: false, reason: 'Not enough codes in stock' };
  }
  // بدء المعاملة (transaction)
  const t = await sequelize.transaction();
  try {
    // خصم الرصيد
    await User.update({ balance: currentBalance - totalCost }, { where: { id: userId }, transaction: t });
    // تسجيل معاملة الرصيد
    await BalanceTransaction.create({
      userId,
      amount: -totalCost,
      type: 'purchase',
      status: 'completed'
    }, { transaction: t });
    // تحديث الكودات
    await Code.update({ isUsed: true, usedBy: userId, soldAt: new Date() }, { where: { id: codes.map(c => c.id) }, transaction: t });
    await t.commit();
    const codesList = codes.map(c => c.value).join('\n');
    return { success: true, codes: codesList };
  } catch (err) {
    await t.rollback();
    console.error('Purchase transaction error:', err);
    return { success: false, reason: 'Database error' };
  }
}

// دوال الشحن (طلب إيداع)
async function requestDeposit(userId, amount, paymentMethodId, txidOrImage, isImage = false) {
  const method = await PaymentMethod.findByPk(paymentMethodId);
  if (!method) return { success: false, reason: 'Payment method not found' };
  const deposit = await BalanceTransaction.create({
    userId,
    amount,
    type: 'deposit',
    paymentMethodId,
    status: 'pending',
    ...(isImage ? { imageFileId: txidOrImage } : { txid: txidOrImage })
  });
  // إرسال إشعار للأدمن
  const notifText = await getText(ADMIN_ID, 'depositNotification', { userId, amount, method: method.nameEn });
  if (isImage) {
    await bot.sendPhoto(ADMIN_ID, txidOrImage, { caption: notifText });
  } else {
    await bot.sendMessage(ADMIN_ID, notifText + `\nTxID: ${txidOrImage}`);
  }
  const adminMsg = await bot.sendMessage(ADMIN_ID, 'Approve or reject:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: await getText(ADMIN_ID, 'approve'), callback_data: `approve_deposit_${deposit.id}` }],
        [{ text: await getText(ADMIN_ID, 'reject'), callback_data: `reject_deposit_${deposit.id}` }]
      ]
    }
  });
  deposit.adminMessageId = adminMsg.message_id;
  await deposit.save();
  return { success: true, depositId: deposit.id };
}

// دوال الموافقة على الإيداع
async function approveDeposit(depositId, adminId) {
  if (!isAdmin(adminId)) return false;
  const deposit = await BalanceTransaction.findByPk(depositId);
  if (!deposit || deposit.status !== 'pending') return false;
  const t = await sequelize.transaction();
  try {
    deposit.status = 'completed';
    await deposit.save({ transaction: t });
    const user = await User.findByPk(deposit.userId);
    const newBalance = parseFloat(user.balance) + parseFloat(deposit.amount);
    await User.update({ balance: newBalance }, { where: { id: deposit.userId }, transaction: t });
    await t.commit();
    // إعلام المستخدم
    const successMsg = await getText(deposit.userId, 'depositSuccess', { balance: newBalance.toFixed(2) });
    await bot.sendMessage(deposit.userId, successMsg);
    return true;
  } catch (err) {
    await t.rollback();
    console.error('Approve deposit error:', err);
    return false;
  }
}

async function rejectDeposit(depositId, adminId) {
  if (!isAdmin(adminId)) return false;
  const deposit = await BalanceTransaction.findByPk(depositId);
  if (!deposit || deposit.status !== 'pending') return false;
  deposit.status = 'rejected';
  await deposit.save();
  const rejectMsg = await getText(deposit.userId, 'depositRejected');
  await bot.sendMessage(deposit.userId, rejectMsg);
  return true;
}

// دوال عرض التجار للشراء
async function showMerchantsForBuy(userId) {
  const merchants = await Merchant.findAll({ order: [['id', 'ASC']] });
  if (merchants.length === 0) {
    await bot.sendMessage(userId, '❌ No merchants available.');
    return sendMainMenu(userId);
  }
  const lang = (await User.findByPk(userId)).lang;
  const buttons = merchants.map(m => ([{
    text: lang === 'en' ? m.nameEn : m.nameAr,
    callback_data: `buy_merchant_${m.id}`
  }]));
  buttons.push([{ text: await getText(userId, 'back'), callback_data: 'back_to_menu' }]);
  await bot.sendMessage(userId, await getText(userId, 'chooseMerchant'), { reply_markup: { inline_keyboard: buttons } });
}

async function showMerchantsForRedeem(userId) {
  const merchants = await Merchant.findAll({ order: [['id', 'ASC']] });
  if (merchants.length === 0) {
    await bot.sendMessage(userId, '❌ No merchants available.');
    return sendMainMenu(userId);
  }
  const lang = (await User.findByPk(userId)).lang;
  const buttons = merchants.map(m => ([{
    text: lang === 'en' ? m.nameEn : m.nameAr,
    callback_data: `redeem_merchant_${m.id}`
  }]));
  buttons.push([{ text: await getText(userId, 'back'), callback_data: 'back_to_menu' }]);
  await bot.sendMessage(userId, await getText(userId, 'chooseMerchant'), { reply_markup: { inline_keyboard: buttons } });
}

async function showPaymentMethodsForDeposit(userId) {
  const methods = await PaymentMethod.findAll({ where: { isActive: true } });
  if (methods.length === 0) {
    await bot.sendMessage(userId, await getText(userId, 'noPaymentMethods'));
    return sendMainMenu(userId);
  }
  const lang = (await User.findByPk(userId)).lang;
  const buttons = methods.map(m => ([{
    text: lang === 'en' ? m.nameEn : m.nameAr,
    callback_data: `deposit_method_${m.id}`
  }]));
  buttons.push([{ text: await getText(userId, 'back'), callback_data: 'back_to_menu' }]);
  await bot.sendMessage(userId, await getText(userId, 'choosePaymentMethod'), { reply_markup: { inline_keyboard: buttons } });
}

// ========================
// 4. أوامر البوت الأساسية
// ========================
bot.onText(/\/start/, async (msg) => {
  const userId = msg.chat.id;
  try {
    await User.findOrCreate({ where: { id: userId }, defaults: { lang: 'en', balance: 0 } });
    const startText = await getText(userId, 'start');
    await bot.sendMessage(userId, startText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🇺🇸 English', callback_data: 'lang_en' }],
          [{ text: '🇮🇶 العربية', callback_data: 'lang_ar' }]
        ]
      }
    });
  } catch (err) {
    console.error('Error in /start:', err);
  }
});

bot.onText(/\/admin/, async (msg) => {
  const userId = msg.chat.id;
  if (!isAdmin(userId)) return;
  await showAdminPanel(userId);
});

// ========================
// 5. معالجة callback_query (جميع الأزرار)
// ========================
bot.on('callback_query', async (query) => {
  const userId = query.message.chat.id;
  const data = query.data;

  try {
    await User.findOrCreate({ where: { id: userId }, defaults: { lang: 'en', balance: 0 } });

    // اختيار اللغة
    if (data.startsWith('lang_')) {
      const newLang = data.split('_')[1];
      await User.update({ lang: newLang }, { where: { id: userId } });
      await sendMainMenu(userId);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // العودة للقائمة الرئيسية
    if (data === 'back_to_menu') {
      await sendMainMenu(userId);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // الدعم الفني
    if (data === 'support') {
      await User.update({ state: JSON.stringify({ action: 'support' }) }, { where: { id: userId } });
      await bot.sendMessage(userId, await getText(userId, 'sendReply'));
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // لوحة الأدمن الرئيسية
    if (data === 'admin' && isAdmin(userId)) {
      await showAdminPanel(userId);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // عرض الرصيد
    if (data === 'my_balance') {
      const user = await User.findByPk(userId);
      const balance = parseFloat(user.balance).toFixed(2);
      await bot.sendMessage(userId, `💰 Your balance: ${balance} USD`);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // بدء عملية الشحن
    if (data === 'deposit') {
      await User.update({ state: JSON.stringify({ action: 'deposit_amount' }) }, { where: { id: userId } });
      await bot.sendMessage(userId, await getText(userId, 'enterDepositAmount'));
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // اختيار طريقة دفع للشحن (بعد إدخال المبلغ)
    if (data.startsWith('deposit_method_')) {
      const methodId = parseInt(data.split('_')[2]);
      const state = (await User.findByPk(userId)).state;
      if (!state) {
        await bot.sendMessage(userId, 'Session expired. Please start again.');
        await sendMainMenu(userId);
        await bot.answerCallbackQuery(query.id);
        return;
      }
      const userState = JSON.parse(state);
      if (userState.action !== 'deposit_amount') return;
      const amount = parseFloat(userState.amount);
      const method = await PaymentMethod.findByPk(methodId);
      if (!method) {
        await bot.sendMessage(userId, await getText(userId, 'error'));
        await sendMainMenu(userId);
        await bot.answerCallbackQuery(query.id);
        return;
      }
      await User.update({ state: JSON.stringify({ action: 'deposit_tx', methodId, amount }) }, { where: { id: userId } });
      if (method.type === 'auto') {
        await bot.sendMessage(userId, `${await getText(userId, 'pay')}\n\n${method.details}\n\n${await getText(userId, 'sendTx')}`);
      } else {
        await bot.sendMessage(userId, `${await getText(userId, 'pay')}\n\n${method.details}\n\n${await getText(userId, 'sendImage')}`);
      }
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // إدارة البوتات (عرض القائمة)
    if (data === 'admin_manage_bots' && isAdmin(userId)) {
      await showBotsList(userId);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // منح صلاحية /code لبوت
    if (data.startsWith('bot_grant_code_') && isAdmin(userId)) {
      const botId = parseInt(data.split('_')[3]);
      const botService = await BotService.findByPk(botId);
      if (botService) {
        let allowed = botService.allowedActions || [];
        if (!allowed.includes('code')) allowed.push('code');
        // إزالة صلاحية full إذا كانت موجودة (لأن code فقط)
        allowed = allowed.filter(a => a !== 'full');
        botService.allowedActions = allowed;
        await botService.save();
        await bot.sendMessage(userId, `✅ Granted /code permission to ${botService.name}`);
      }
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // منح جميع الصلاحيات (يتطلب إدخال ID المالك)
    if (data.startsWith('bot_grant_full_') && isAdmin(userId)) {
      const botId = parseInt(data.split('_')[3]);
      await User.update({ state: JSON.stringify({ action: 'set_bot_owner', botId }) }, { where: { id: userId } });
      await bot.sendMessage(userId, 'Send the Telegram user ID of the new bot owner:');
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // إزالة جميع الصلاحيات من بوت
    if (data.startsWith('bot_remove_perms_') && isAdmin(userId)) {
      const botId = parseInt(data.split('_')[3]);
      const botService = await BotService.findByPk(botId);
      if (botService) {
        botService.allowedActions = [];
        botService.ownerId = null;
        await botService.save();
        await bot.sendMessage(userId, `❌ Removed all permissions from ${botService.name}`);
      }
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // حذف بوت
    if (data.startsWith('admin_remove_bot_confirm_') && isAdmin(userId)) {
      const botId = parseInt(data.split('_')[4]);
      await BotService.destroy({ where: { id: botId } });
      await bot.sendMessage(userId, await getText(userId, 'botRemoved'));
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // إضافة بوت (بداية)
    if (data === 'admin_add_bot' && isAdmin(userId)) {
      await User.update({ state: JSON.stringify({ action: 'add_bot', step: 'token' }) }, { where: { id: userId } });
      await bot.sendMessage(userId, await getText(userId, 'enterBotToken'));
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // قائمة البوتات (عرضها مرة أخرى)
    if (data === 'admin_list_bots' && isAdmin(userId)) {
      await showBotsList(userId);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // إحصائيات البوتات
    if (data === 'admin_bot_stats' && isAdmin(userId)) {
      const bots = await BotService.findAll({ include: BotStat });
      let text = '';
      for (const b of bots) {
        text += `📊 ${b.name}:\n`;
        for (const stat of b.BotStats) {
          text += `${stat.action}: ${stat.count} times (last: ${stat.lastUsed})\n`;
        }
        text += '\n';
      }
      await bot.sendMessage(userId, text || 'No stats yet.');
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // إدارة التجار (نفس الكود السابق مع تعديلات بسيطة) - سنختصرها لعدم التكرار
    // ... (نفس الكود السابق لإدارة التجار وطرق الدفع)

    // موافقة/رفض الإيداعات
    if (data.startsWith('approve_deposit_')) {
      if (!isAdmin(userId)) {
        await bot.answerCallbackQuery(query.id, { text: 'Unauthorized', show_alert: true });
        return;
      }
      const depositId = parseInt(data.split('_')[2]);
      await approveDeposit(depositId, userId);
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: userId, message_id: query.message.message_id });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data.startsWith('reject_deposit_')) {
      if (!isAdmin(userId)) {
        await bot.answerCallbackQuery(query.id, { text: 'Unauthorized', show_alert: true });
        return;
      }
      const depositId = parseInt(data.split('_')[2]);
      await rejectDeposit(depositId, userId);
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: userId, message_id: query.message.message_id });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // باقي الأزرار (الشراء، الاسترداد، إلخ) - سنعيد استخدام الكود السابق مع تعديل الشراء لاستخدام الرصيد
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

    if (data.startsWith('buy_merchant_')) {
      const merchantId = parseInt(data.split('_')[2]);
      const available = await Code.count({ where: { merchantId, isUsed: false } });
      if (available === 0) {
        await bot.sendMessage(userId, await getText(userId, 'noCodes'));
        await sendMainMenu(userId);
        await bot.answerCallbackQuery(query.id);
        return;
      }
      await User.update({ state: JSON.stringify({ action: 'buy', merchantId }) }, { where: { id: userId } });
      await bot.sendMessage(userId, `${await getText(userId, 'enterQty')}\n📦 Available: ${available}`);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data.startsWith('redeem_merchant_')) {
      const merchantId = parseInt(data.split('_')[2]);
      await User.update({ state: JSON.stringify({ action: 'redeem', merchantId }) }, { where: { id: userId } });
      await bot.sendMessage(userId, await getText(userId, 'sendCode'));
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // باقي الأزرار الخاصة بالإدارة (مثل إضافة تاجر، إلخ) يتم التعامل معها كما في الكود السابق
    // ولكننا سنختصرها هنا لتجنب التكرار. في الكود النهائي ستكون موجودة.

    await bot.answerCallbackQuery(query.id);
  } catch (err) {
    console.error('Callback error:', err);
    await bot.answerCallbackQuery(query.id, { text: 'Error occurred' });
  }
});

// ========================
// 6. معالجة الرسائل النصية والصور
// ========================
bot.on('message', async (msg) => {
  const userId = msg.chat.id;
  const text = msg.text;
  const photo = msg.photo;

  try {
    const user = await User.findByPk(userId);
    if (!user) return;

    let state = user.state ? JSON.parse(user.state) : null;

    // معالجة إدخالات الأدمن
    if (state && isAdmin(userId)) {
      // إضافة بوت
      if (state.action === 'add_bot' && state.step === 'token') {
        try {
          const testBot = new TelegramBot(text, { polling: false });
          const me = await testBot.getMe();
          const botName = me.username;
          await BotService.create({
            token: text,
            name: botName,
            allowedActions: []
          });
          await bot.sendMessage(userId, await getText(userId, 'botAdded'));
          await showBotsList(userId);
        } catch {
          await bot.sendMessage(userId, '❌ Invalid token');
        }
        await User.update({ state: null }, { where: { id: userId } });
        return;
      }

      // تعيين مالك البوت (منح جميع الصلاحيات)
      if (state.action === 'set_bot_owner') {
        const ownerId = parseInt(text);
        if (isNaN(ownerId)) {
          await bot.sendMessage(userId, '❌ Invalid user ID');
        } else {
          const botService = await BotService.findByPk(state.botId);
          if (botService) {
            botService.ownerId = ownerId;
            botService.allowedActions = ['full']; // صلاحية كاملة
            await botService.save();
            await bot.sendMessage(userId, `✅ Granted full permissions to user ${ownerId} for bot ${botService.name}`);
          } else {
            await bot.sendMessage(userId, 'Bot not found');
          }
        }
        await User.update({ state: null }, { where: { id: userId } });
        return;
      }

      // باقي إدخالات الأدمن (إضافة تاجر، تعديل سعر، إضافة أكواد، طرق دفع) - سنعيد استخدام الكود السابق
      // ... (نفس الكود السابق)
    }

    // معالجة الدعم (نص أو صورة)
    if (state && state.action === 'support') {
      let supportText = text || '';
      let photoFileId = null;
      if (photo) photoFileId = photo[photo.length - 1].file_id;
      const notifText = await getText(ADMIN_ID, 'supportNotification', { userId, message: supportText });
      if (photoFileId) {
        await bot.sendPhoto(ADMIN_ID, photoFileId, { caption: notifText });
      } else {
        await bot.sendMessage(ADMIN_ID, notifText);
      }
      await bot.sendMessage(ADMIN_ID, await getText(ADMIN_ID, 'replyToSupport'), {
        reply_markup: { inline_keyboard: [[{ text: 'Reply', callback_data: `support_reply_${userId}` }]] }
      });
      await bot.sendMessage(userId, await getText(userId, 'supportMessageSent'));
      await User.update({ state: null }, { where: { id: userId } });
      return;
    }

    // معالجة الشراء (إدخال الكمية)
    if (state && state.action === 'buy') {
      const qty = parseInt(text);
      if (isNaN(qty) || qty <= 0) {
        await bot.sendMessage(userId, '❌ Invalid quantity.');
        return;
      }
      const merchant = await Merchant.findByPk(state.merchantId);
      if (!merchant) {
        await bot.sendMessage(userId, 'Merchant not found');
        await User.update({ state: null }, { where: { id: userId } });
        return;
      }
      const available = await Code.count({ where: { merchantId: merchant.id, isUsed: false } });
      if (qty > available) {
        await bot.sendMessage(userId, (await getText(userId, 'noCodes')) + ` Available: ${available}`);
        return;
      }
      const totalCost = qty * merchant.price;
      const userBalance = parseFloat(user.balance);
      if (userBalance < totalCost) {
        await bot.sendMessage(userId, await getText(userId, 'notEnoughBalance', { balance: userBalance.toFixed(2) }));
        await sendMainMenu(userId);
        await User.update({ state: null }, { where: { id: userId } });
        return;
      }
      const result = await processPurchase(userId, merchant.id, qty);
      if (result.success) {
        await bot.sendMessage(userId, `${await getText(userId, 'success')}\n\n${result.codes}`);
      } else {
        await bot.sendMessage(userId, await getText(userId, 'error') + `: ${result.reason}`);
      }
      await User.update({ state: null }, { where: { id: userId } });
      await sendMainMenu(userId);
      return;
    }

    // معالجة إدخال المبلغ للشحن
    if (state && state.action === 'deposit_amount') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await bot.sendMessage(userId, '❌ Invalid amount');
        return;
      }
      await User.update({ state: JSON.stringify({ action: 'deposit_amount', amount }) }, { where: { id: userId } });
      await showPaymentMethodsForDeposit(userId);
      return;
    }

    // معالجة إرسال TXID أو صورة الدفع للشحن
    if (state && state.action === 'deposit_tx') {
      const { methodId, amount } = state;
      const method = await PaymentMethod.findByPk(methodId);
      if (!method) {
        await bot.sendMessage(userId, 'Payment method not found');
        await sendMainMenu(userId);
        await User.update({ state: null }, { where: { id: userId } });
        return;
      }
      if (method.type === 'auto') {
        const txid = text.trim();
        const valid = await checkAutoPayment(txid, amount);
        if (!valid) {
          await bot.sendMessage(userId, await getText(userId, 'invalidTx'));
          return;
        }
        await requestDeposit(userId, amount, methodId, txid, false);
        await bot.sendMessage(userId, await getText(userId, 'depositRequestPending'));
      } else {
        if (!photo) {
          await bot.sendMessage(userId, await getText(userId, 'sendImage'));
          return;
        }
        const fileId = photo[photo.length - 1].file_id;
        await requestDeposit(userId, amount, methodId, fileId, true);
        await bot.sendMessage(userId, await getText(userId, 'depositRequestPending'));
      }
      await User.update({ state: null }, { where: { id: userId } });
      await sendMainMenu(userId);
      return;
    }

    // معالجة الاسترداد (كود البطاقة)
    if (state && state.action === 'redeem') {
      const merchantId = state.merchantId;
      const cardCode = text.trim();
      const waitingMsg = await bot.sendMessage(userId, await getText(userId, 'processing'));
      const result = await redeemCard(cardCode, merchantId);
      await bot.deleteMessage(userId, waitingMsg.message_id);
      if (result.success) {
        const cardDetails = formatCardDetails(result.data);
        const successMsg = await getText(userId, 'redeemSuccess', { details: cardDetails });
        await bot.sendMessage(userId, successMsg);
      } else {
        const failMsg = await getText(userId, 'redeemFailed', { reason: result.reason });
        await bot.sendMessage(userId, failMsg);
      }
      await User.update({ state: null }, { where: { id: userId } });
      await sendMainMenu(userId);
      return;
    }
  } catch (err) {
    console.error('Message handler error:', err);
    await bot.sendMessage(userId, 'An error occurred. Please try again later.');
  }
});

// ========================
// 7. API للبوتات الأخرى
// ========================
app.post('/api/code', async (req, res) => {
  try {
    const { token, card_key, merchant_dict_id, platform_id } = req.body;
    const hasCodePerm = await checkBotPermission(token, 'code');
    if (!hasCodePerm) {
      return res.status(403).json({ error: 'Bot not authorized for /code' });
    }
    if (!card_key || !merchant_dict_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const result = await redeemCard(card_key, merchant_dict_id, platform_id || '1');
    if (result.success) {
      res.json({ success: true, data: result.data });
    } else {
      res.status(400).json({ success: false, error: result.reason });
    }
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========================
// 8. تشغيل الخادم ومزامنة قاعدة البيانات
// ========================
sequelize.sync({ alter: true }).then(async () => {
  console.log('✅ Database synced');
  const PORT = process.env.PORT || 3000;
  app.get('/', (req, res) => res.send('Bot is running'));
  app.listen(PORT, () => console.log(`🚀 Server started on port ${PORT}`));
}).catch(err => {
  console.error('Database error:', err);
  process.exit(1);
});

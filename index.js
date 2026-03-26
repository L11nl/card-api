// ========================
// index.js - البوت المتكامل (مُعدل حسب الطلب)
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
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

// تعريف النماذج (Models)
const User = sequelize.define('User', {
  id: { type: DataTypes.BIGINT, primaryKey: true },
  lang: { type: DataTypes.STRING(2), defaultValue: 'en' },
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
  merchantId: { type: DataTypes.INTEGER, references: { model: Merchant, key: 'id' } },
  nameEn: { type: DataTypes.STRING, allowNull: false },
  nameAr: { type: DataTypes.STRING, allowNull: false },
  details: { type: DataTypes.TEXT, allowNull: false },
  type: { type: DataTypes.STRING, defaultValue: 'manual' }
});

const ManualPaymentRequest = sequelize.define('ManualPaymentRequest', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.BIGINT, allowNull: false },
  merchantId: { type: DataTypes.INTEGER, allowNull: false },
  paymentMethodId: { type: DataTypes.INTEGER, allowNull: false },
  amount: { type: DataTypes.FLOAT, allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  imageFileId: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: 'pending' },
  adminMessageId: { type: DataTypes.BIGINT, allowNull: true },
  createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
});

const Code = sequelize.define('Code', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  value: { type: DataTypes.TEXT, allowNull: false },
  merchantId: { type: DataTypes.INTEGER, references: { model: Merchant, key: 'id' } },
  isUsed: { type: DataTypes.BOOLEAN, defaultValue: false },
  usedBy: { type: DataTypes.BIGINT, allowNull: true },
  soldAt: { type: DataTypes.DATE, allowNull: true }
});

const Transaction = sequelize.define('Transaction', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  txid: { type: DataTypes.STRING, unique: true, allowNull: false },
  userId: { type: DataTypes.BIGINT, allowNull: false },
  merchantId: { type: DataTypes.INTEGER, allowNull: false },
  paymentMethodId: { type: DataTypes.INTEGER, allowNull: false },
  amount: { type: DataTypes.FLOAT, allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: 'completed' }
});

const BotService = sequelize.define('BotService', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  token: { type: DataTypes.STRING, unique: true, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  allowedActions: { type: DataTypes.JSONB, defaultValue: [] },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
});

const BotStat = sequelize.define('BotStat', {
  botId: { type: DataTypes.INTEGER, references: { model: BotService, key: 'id' } },
  action: { type: DataTypes.STRING },
  count: { type: DataTypes.INTEGER, defaultValue: 0 },
  lastUsed: { type: DataTypes.DATE }
});

// العلاقات
Merchant.hasMany(PaymentMethod, { foreignKey: 'merchantId', onDelete: 'CASCADE' });
PaymentMethod.belongsTo(Merchant);
Merchant.hasMany(Code, { foreignKey: 'merchantId' });
Code.belongsTo(Merchant);
ManualPaymentRequest.belongsTo(User, { foreignKey: 'userId' });
ManualPaymentRequest.belongsTo(Merchant);
ManualPaymentRequest.belongsTo(PaymentMethod);
Transaction.belongsTo(User);
Transaction.belongsTo(Merchant);
Transaction.belongsTo(PaymentMethod);
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
    buy: '💳 Buy Codes',
    support: '📞 Support',
    chooseMerchant: '👋 Choose merchant:',
    sendCard: '✍️ Send the card code:',
    processing: '⏳ Processing...',
    enterQty: '✍️ Enter quantity:',
    choosePaymentMethod: '💳 Choose payment method:',
    pay: '💰 Send payment to:',
    sendTx: '🔗 Send TXID (transaction ID) after payment:',
    sendImage: '📸 Send a screenshot of the payment receipt:',
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
    paymentMethods: '💳 Payment Methods',
    addPaymentMethod: '➕ Add Payment Method',
    deletePaymentMethod: '🗑️ Delete Payment Method',
    noPaymentMethods: '❌ No payment methods available for this merchant.',
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
    pendingPurchases: '⏳ Pending purchases: {count}',
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
    paymentRequestPending: '📝 Your payment request has been sent to admin. Please wait for approval.',
    paymentApproved: '✅ Your payment has been approved! Here are your codes:',
    paymentRejected: '❌ Your payment has been rejected. Please contact support.',
    manualPaymentRequest: '💳 New manual payment request from user {userId}\nMerchant: {merchant}\nAmount: {amount} USDT\nQuantity: {quantity}\n\n',
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
    buy: '💳 شراء كودات',
    support: '📞 الدعم الفني',
    chooseMerchant: '👋 اختر التاجر:',
    sendCard: '✍️ أرسل كود البطاقة:',
    processing: '⏳ جاري المعالجة...',
    enterQty: '✍️ أرسل الكمية:',
    choosePaymentMethod: '💳 اختر طريقة الدفع:',
    pay: '💰 قم بالتحويل إلى:',
    sendTx: '🔗 أرسل TXID بعد الدفع:',
    sendImage: '📸 أرسل صورة إيصال الدفع:',
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
    paymentMethods: '💳 طرق الدفع',
    addPaymentMethod: '➕ إضافة طريقة دفع',
    deletePaymentMethod: '🗑️ حذف طريقة دفع',
    noPaymentMethods: '❌ لا توجد طرق دفع متاحة لهذا التاجر.',
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
    pendingPurchases: '⏳ مشتريات معلقة: {count}',
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
    paymentRequestPending: '📝 تم إرسال طلب الدفع إلى الأدمن. يرجى الانتظار للموافقة.',
    paymentApproved: '✅ تمت الموافقة على دفعتك! إليك الأكواد:',
    paymentRejected: '❌ تم رفض دفعتك. يرجى التواصل مع الدعم الفني.',
    manualPaymentRequest: '💳 طلب دفع يدوي جديد من المستخدم {userId}\nالتاجر: {merchant}\nالمبلغ: {amount} USDT\nالكمية: {quantity}\n\n',
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

// قائمة الإجراءات المتاحة للبوتات
const BOT_ACTIONS = ['redeem']; // يمكن إضافة المزيد لاحقًا

// دوال مساعدة للنصوص
async function getText(userId, key, replacements = {}) {
  const user = await User.findByPk(userId);
  const lang = user ? user.lang : 'en';
  let setting = await Setting.findOne({ where: { key, lang } });
  let text = setting ? setting.value : DEFAULT_TEXTS[lang][key];
  if (!text) text = DEFAULT_TEXTS.en[key];
  for (const [k, v] of Object.entries(replacements)) {
    text = text.replace(new RegExp(`{${k}}`, 'g'), v);
  }
  return text;
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

// التحقق من أن المستخدم هو الأدمن الرئيسي فقط
function isAdmin(userId) {
  return userId === ADMIN_ID;
}

// دوال عرض القوائم
async function sendMainMenu(userId) {
  const menuText = await getText(userId, 'menu');
  const keyboard = {
    inline_keyboard: [
      [{ text: await getText(userId, 'redeem'), callback_data: 'redeem' }],
      [{ text: await getText(userId, 'buy'), callback_data: 'buy' }],
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

async function showEditBotPermissions(userId, botId) {
  const botService = await BotService.findByPk(botId);
  if (!botService) return;

  const currentActions = botService.allowedActions || [];
  const buttons = BOT_ACTIONS.map(action => {
    const isAllowed = currentActions.includes(action);
    const text = `${isAllowed ? '✅' : '❌'} ${action}`;
    return [{ text, callback_data: `bot_toggle_action_${botId}_${action}` }];
  });
  buttons.push([{ text: await getText(userId, 'back'), callback_data: 'admin_manage_bots' }]);

  await bot.sendMessage(userId, `🔧 Edit permissions for bot: ${botService.name}\nSelect actions to allow:`, {
    reply_markup: { inline_keyboard: buttons }
  });
}

// دوال الاسترداد
async function redeemCard(cardKey, merchantId, platformId = '1') {
  // في حال كنت تستخدم API خارجي، يمكنك إضافة الإعدادات هنا. حالياً نقوم بمحاكاة استدعاء بسيط.
  // في الإصدار الأصلي كان يستخدم ApiKey. بما أننا أزلناه، سنقوم بتبسيط الاستدعاء إلى خدمة افتراضية.
  // يمكنك إعادة استخدام الكود الأصلي مع تعديل بسيط.
  // هنا سنحتفظ بالدالة كما هي لكن مع حذف ApiKey. إذا كنت بحاجة إلى API حقيقي، يمكنك تعديله حسب الحاجة.
  try {
    // استدعاء وهمي - يمكنك استبداله بالكود الأصلي بعد تعديله لعدم الاعتماد على ApiKey
    // نظرًا لأن الكود الأصلي كان يعتمد على ApiKey، سنقوم بإزالته واستخدام متغيرات بسيطة.
    // لكن للحفاظ على الوظيفة، يمكنك إضافة API key في البيئة مباشرة.
    const apiKey = process.env.NODE_CARD_API_KEY; // يمكنك تعيينه في البيئة
    const baseUrl = process.env.NODE_CARD_BASE_URL || 'https://api.node-card.com';
    const params = new URLSearchParams();
    params.append('card_key', cardKey);
    params.append('merchant_dict_id', merchantId);
    params.append('platform_id', platformId);
    if (apiKey) params.append('api_key', apiKey);

    const response = await axios.post(`${baseUrl}/api/open/card/redeem`, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
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

async function checkAutoPayment(txid, expectedAmount) {
  try {
    const res = await axios.get(`https://apilist.tronscan.org/api/transaction-info?hash=${txid}`);
    if (!res.data || !res.data.toAddress) return false;
    const value = res.data.amount / 1e6;
    return value >= expectedAmount;
  } catch {
    return false;
  }
}

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

async function showPaymentMethods(userId, merchantId, qty, total) {
  const methods = await PaymentMethod.findAll({ where: { merchantId } });
  if (methods.length === 0) {
    await bot.sendMessage(userId, await getText(userId, 'noPaymentMethods'));
    return sendMainMenu(userId);
  }
  const lang = (await User.findByPk(userId)).lang;
  const buttons = methods.map(m => ([{
    text: lang === 'en' ? m.nameEn : m.nameAr,
    callback_data: `pay_method_${m.id}_${merchantId}_${qty}_${total}`
  }]));
  buttons.push([{ text: await getText(userId, 'back'), callback_data: 'back_to_menu' }]);
  await bot.sendMessage(userId, await getText(userId, 'choosePaymentMethod'), { reply_markup: { inline_keyboard: buttons } });
}

// ========================
// 4. أوامر البوت الأساسية
// ========================
bot.onText(/\/start/, async (msg) => {
  const userId = msg.chat.id;
  await User.findOrCreate({ where: { id: userId }, defaults: { lang: 'en' } });
  const startText = await getText(userId, 'start');
  await bot.sendMessage(userId, startText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🇺🇸 English', callback_data: 'lang_en' }],
        [{ text: '🇮🇶 العربية', callback_data: 'lang_ar' }]
      ]
    }
  });
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

  await User.findOrCreate({ where: { id: userId }, defaults: { lang: 'en' } });

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

  // ======================== إدارة البوتات ========================
  if (data === 'admin_manage_bots' && isAdmin(userId)) {
    const t = (key) => getText(userId, key);
    const keyboard = {
      inline_keyboard: [
        [{ text: await t('addBot'), callback_data: 'admin_add_bot' }],
        [{ text: await t('listBots'), callback_data: 'admin_list_bots' }],
        [{ text: await t('removeBot'), callback_data: 'admin_remove_bot' }],
        [{ text: await t('editBotPerms'), callback_data: 'admin_edit_bot_perm_list' }],
        [{ text: await t('botStats'), callback_data: 'admin_bot_stats' }],
        [{ text: await t('back'), callback_data: 'admin' }]
      ]
    };
    await bot.sendMessage(userId, await t('manageBots'), { reply_markup: keyboard });
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'admin_add_bot' && isAdmin(userId)) {
    await User.update({ state: JSON.stringify({ action: 'add_bot', step: 'token' }) }, { where: { id: userId } });
    await bot.sendMessage(userId, await getText(userId, 'enterBotToken'));
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'admin_list_bots' && isAdmin(userId)) {
    const bots = await BotService.findAll();
    let text = '🤖 Bots:\n';
    for (const b of bots) {
      text += `ID: ${b.id} - ${b.name} (Active: ${b.isActive})\nAllowed: ${b.allowedActions.join(', ')}\n`;
    }
    await bot.sendMessage(userId, text);
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'admin_remove_bot' && isAdmin(userId)) {
    const bots = await BotService.findAll();
    if (bots.length === 0) {
      await bot.sendMessage(userId, 'No bots to remove.');
      await bot.answerCallbackQuery(query.id);
      return;
    }
    const t = (key) => getText(userId, key);
    const buttons = bots.map(b => ([{ text: b.name, callback_data: `admin_remove_bot_confirm_${b.id}` }]));
    buttons.push([{ text: await t('back'), callback_data: 'admin_manage_bots' }]);
    await bot.sendMessage(userId, 'Select bot to remove:', { reply_markup: { inline_keyboard: buttons } });
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith('admin_remove_bot_confirm_') && isAdmin(userId)) {
    const botId = parseInt(data.split('_')[4]);
    await BotService.destroy({ where: { id: botId } });
    await bot.sendMessage(userId, await getText(userId, 'botRemoved'));
    await bot.answerCallbackQuery(query.id);
    return;
  }

  // قائمة البوتات لتعديل الصلاحيات
  if (data === 'admin_edit_bot_perm_list' && isAdmin(userId)) {
    const bots = await BotService.findAll();
    if (bots.length === 0) {
      await bot.sendMessage(userId, 'No bots to edit.');
      await bot.answerCallbackQuery(query.id);
      return;
    }
    const buttons = bots.map(b => ([{ text: b.name, callback_data: `admin_edit_bot_perm_${b.id}` }]));
    buttons.push([{ text: await getText(userId, 'back'), callback_data: 'admin_manage_bots' }]);
    await bot.sendMessage(userId, 'Select bot to edit permissions:', { reply_markup: { inline_keyboard: buttons } });
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith('admin_edit_bot_perm_') && isAdmin(userId)) {
    const botId = parseInt(data.split('_')[4]);
    await showEditBotPermissions(userId, botId);
    await bot.answerCallbackQuery(query.id);
    return;
  }

  // تبديل صلاحية معينة للبوت
  if (data.startsWith('bot_toggle_action_') && isAdmin(userId)) {
    const parts = data.split('_');
    const botId = parseInt(parts[3]);
    const action = parts[4];
    const botService = await BotService.findByPk(botId);
    if (botService) {
      let allowed = botService.allowedActions || [];
      if (allowed.includes(action)) {
        allowed = allowed.filter(a => a !== action);
      } else {
        allowed.push(action);
      }
      botService.allowedActions = allowed;
      await botService.save();
      await bot.answerCallbackQuery(query.id, { text: 'Permission updated' });
      // إعادة عرض واجهة التعديل
      await showEditBotPermissions(userId, botId);
    } else {
      await bot.answerCallbackQuery(query.id, { text: 'Bot not found' });
    }
    return;
  }

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

  // ======================== إدارة التجار ========================
  if (data === 'admin_add_merchant' && isAdmin(userId)) {
    await User.update({ state: JSON.stringify({ action: 'add_merchant', step: 'nameEn' }) }, { where: { id: userId } });
    await bot.sendMessage(userId, await getText(userId, 'askMerchantNameEn'));
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'admin_list_merchants' && isAdmin(userId)) {
    const merchants = await Merchant.findAll();
    if (merchants.length === 0) {
      await bot.sendMessage(userId, '📭 No merchants yet.');
    } else {
      let text = await getText(userId, 'merchantList');
      merchants.forEach(m => {
        text += `ID: ${m.id} | EN: ${m.nameEn} | AR: ${m.nameAr} | Price: ${m.price} USDT\n`;
      });
      await bot.sendMessage(userId, text);
    }
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'admin_set_price' && isAdmin(userId)) {
    const merchants = await Merchant.findAll();
    if (merchants.length === 0) {
      await bot.sendMessage(userId, '❌ No merchants to set price.');
      await bot.answerCallbackQuery(query.id);
      return;
    }
    const lang = (await User.findByPk(userId)).lang;
    const buttons = merchants.map(m => ([{
      text: lang === 'en' ? m.nameEn : m.nameAr,
      callback_data: `admin_setprice_${m.id}`
    }]));
    buttons.push([{ text: await getText(userId, 'back'), callback_data: 'admin' }]);
    await bot.sendMessage(userId, await getText(userId, 'selectMerchantToSetPrice'), { reply_markup: { inline_keyboard: buttons } });
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith('admin_setprice_') && isAdmin(userId)) {
    const merchantId = parseInt(data.split('_')[2]);
    await User.update({ state: JSON.stringify({ action: 'set_price', merchantId }) }, { where: { id: userId } });
    await bot.sendMessage(userId, await getText(userId, 'enterPrice'));
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'admin_add_codes' && isAdmin(userId)) {
    const merchants = await Merchant.findAll();
    if (merchants.length === 0) {
      await bot.sendMessage(userId, '❌ No merchants to add codes.');
      await bot.answerCallbackQuery(query.id);
      return;
    }
    const lang = (await User.findByPk(userId)).lang;
    const buttons = merchants.map(m => ([{
      text: lang === 'en' ? m.nameEn : m.nameAr,
      callback_data: `admin_addcodes_${m.id}`
    }]));
    buttons.push([{ text: await getText(userId, 'back'), callback_data: 'admin' }]);
    await bot.sendMessage(userId, await getText(userId, 'selectMerchantToAddCodes'), { reply_markup: { inline_keyboard: buttons } });
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith('admin_addcodes_') && isAdmin(userId)) {
    const merchantId = parseInt(data.split('_')[2]);
    await User.update({ state: JSON.stringify({ action: 'add_codes', merchantId }) }, { where: { id: userId } });
    await bot.sendMessage(userId, await getText(userId, 'enterCodes'));
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'admin_payment_methods' && isAdmin(userId)) {
    const merchants = await Merchant.findAll();
    if (merchants.length === 0) {
      await bot.sendMessage(userId, '❌ No merchants available.');
      await bot.answerCallbackQuery(query.id);
      return;
    }
    const lang = (await User.findByPk(userId)).lang;
    const buttons = merchants.map(m => ([{
      text: lang === 'en' ? m.nameEn : m.nameAr,
      callback_data: `admin_paymethods_merchant_${m.id}`
    }]));
    buttons.push([{ text: await getText(userId, 'back'), callback_data: 'admin' }]);
    await bot.sendMessage(userId, await getText(userId, 'selectMerchantForPaymentMethods'), { reply_markup: { inline_keyboard: buttons } });
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith('admin_paymethods_merchant_') && isAdmin(userId)) {
    const merchantId = parseInt(data.split('_')[3]);
    const methods = await PaymentMethod.findAll({ where: { merchantId } });
    const lang = (await User.findByPk(userId)).lang;
    let methodsText = '';
    if (methods.length) {
      const methodLines = await Promise.all(methods.map(async (m) => {
        return `ID: ${m.id} | ${lang === 'en' ? m.nameEn : m.nameAr}\n${m.details}\n`;
      }));
      methodsText = methodLines.join('');
    } else {
      methodsText = await getText(userId, 'noPaymentMethods');
    }
    const buttons = [
      [{ text: await getText(userId, 'addPaymentMethod'), callback_data: `admin_addpaymethod_${merchantId}` }],
      ...(methods.length ? [[{ text: await getText(userId, 'deletePaymentMethod'), callback_data: `admin_delpaymethod_${merchantId}` }]] : []),
      [{ text: await getText(userId, 'back'), callback_data: 'admin_payment_methods' }]
    ];
    await bot.sendMessage(userId, `${await getText(userId, 'paymentMethods')}:\n${methodsText}`, { reply_markup: { inline_keyboard: buttons } });
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith('admin_addpaymethod_') && isAdmin(userId)) {
    const merchantId = parseInt(data.split('_')[2]);
    await User.update({ state: JSON.stringify({ action: 'add_payment_method', merchantId, step: 'nameEn' }) }, { where: { id: userId } });
    await bot.sendMessage(userId, await getText(userId, 'enterPaymentNameEn'));
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith('admin_delpaymethod_') && isAdmin(userId)) {
    const merchantId = parseInt(data.split('_')[2]);
    const methods = await PaymentMethod.findAll({ where: { merchantId } });
    if (methods.length === 0) {
      await bot.sendMessage(userId, await getText(userId, 'noPaymentMethods'));
      await bot.answerCallbackQuery(query.id);
      return;
    }
    const lang = (await User.findByPk(userId)).lang;
    const buttons = methods.map(m => ([{
      text: lang === 'en' ? m.nameEn : m.nameAr,
      callback_data: `admin_delpaymethod_confirm_${m.id}`
    }]));
    buttons.push([{ text: await getText(userId, 'back'), callback_data: `admin_paymethods_merchant_${merchantId}` }]);
    await bot.sendMessage(userId, await getText(userId, 'selectPaymentMethodToDelete'), { reply_markup: { inline_keyboard: buttons } });
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith('admin_delpaymethod_confirm_') && isAdmin(userId)) {
    const methodId = parseInt(data.split('_')[3]);
    await PaymentMethod.destroy({ where: { id: methodId } });
    await bot.sendMessage(userId, await getText(userId, 'paymentMethodDeleted'));
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'admin_stats' && isAdmin(userId)) {
    const totalCodes = await Code.count({ where: { isUsed: false } });
    const completedSales = await Transaction.sum('amount', { where: { status: 'completed' } }) || 0;
    const pendingCount = await ManualPaymentRequest.count({ where: { status: 'pending' } });
    const statsText = `${await getText(userId, 'totalCodes', { count: totalCodes })}\n${await getText(userId, 'totalSales', { amount: completedSales })}\n${await getText(userId, 'pendingPurchases', { count: pendingCount })}`;
    await bot.sendMessage(userId, statsText);
    await bot.answerCallbackQuery(query.id);
    return;
  }

  // ======================== عمليات المستخدم ========================
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

  if (data.startsWith('pay_method_')) {
    const parts = data.split('_');
    const methodId = parseInt(parts[2]);
    const merchantId = parseInt(parts[3]);
    const qty = parseInt(parts[4]);
    const total = parseFloat(parts[5]);
    const method = await PaymentMethod.findByPk(methodId);
    if (!method) {
      await bot.sendMessage(userId, await getText(userId, 'error'));
      return sendMainMenu(userId);
    }
    await User.update({ state: JSON.stringify({ action: 'awaiting_tx', merchantId, qty, total, paymentMethodId: methodId }) }, { where: { id: userId } });
    if (method.type === 'auto') {
      await bot.sendMessage(userId, `${await getText(userId, 'pay')}\n\n${method.details}\n\n${await getText(userId, 'sendTx')}`);
    } else {
      await bot.sendMessage(userId, `${await getText(userId, 'pay')}\n\n${method.details}\n\n${await getText(userId, 'sendImage')}`);
    }
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

  // ======================== موافقة/رفض طلبات الدفع اليدوي ========================
  if (data.startsWith('approve_payment_')) {
    if (!isAdmin(userId)) {
      await bot.answerCallbackQuery(query.id, { text: 'Unauthorized', show_alert: true });
      return;
    }
    const requestId = parseInt(data.split('_')[2]);
    const request = await ManualPaymentRequest.findByPk(requestId, { include: [Merchant, PaymentMethod] });
    if (!request || request.status !== 'pending') {
      await bot.sendMessage(userId, 'Request not found or already processed.');
      await bot.answerCallbackQuery(query.id);
      return;
    }

    const codes = await Code.findAll({ where: { merchantId: request.merchantId, isUsed: false }, limit: request.quantity, order: [['id', 'ASC']] });
    if (codes.length < request.quantity) {
      await bot.sendMessage(userId, '❌ Not enough codes in stock to approve.');
      await bot.answerCallbackQuery(query.id);
      return;
    }
    const codesList = codes.map(c => c.value).join('\n');
    await Code.update({ isUsed: true, usedBy: request.userId, soldAt: new Date() }, { where: { id: codes.map(c => c.id) } });
    request.status = 'approved';
    await request.save();
    const userMsg = await getText(request.userId, 'paymentApproved');
    await bot.sendMessage(request.userId, `${userMsg}\n\n${codesList}`);
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: userId, message_id: request.adminMessageId });
    await bot.sendMessage(userId, '✅ Payment approved and codes sent.');
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith('reject_payment_')) {
    if (!isAdmin(userId)) {
      await bot.answerCallbackQuery(query.id, { text: 'Unauthorized', show_alert: true });
      return;
    }
    const requestId = parseInt(data.split('_')[2]);
    const request = await ManualPaymentRequest.findByPk(requestId);
    if (!request || request.status !== 'pending') {
      await bot.sendMessage(userId, 'Request not found or already processed.');
      await bot.answerCallbackQuery(query.id);
      return;
    }
    request.status = 'rejected';
    await request.save();

    await bot.sendMessage(request.userId, await getText(request.userId, 'paymentRejected'));
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: userId, message_id: request.adminMessageId });
    await bot.sendMessage(userId, '❌ Payment rejected.');
    await bot.answerCallbackQuery(query.id);
    return;
  }

  // الرد على الدعم
  if (data.startsWith('support_reply_')) {
    if (!isAdmin(userId)) {
      await bot.answerCallbackQuery(query.id, { text: 'Unauthorized', show_alert: true });
      return;
    }
    const targetUserId = parseInt(data.split('_')[2]);
    await User.update({ state: JSON.stringify({ action: 'support_reply', targetUserId }) }, { where: { id: userId } });
    await bot.sendMessage(userId, await getText(userId, 'sendReply'));
    await bot.answerCallbackQuery(query.id);
    return;
  }

  await bot.answerCallbackQuery(query.id);
});

// ========================
// 6. معالجة الرسائل النصية والصور
// ========================
bot.on('message', async (msg) => {
  const userId = msg.chat.id;
  const text = msg.text;
  const photo = msg.photo;

  const user = await User.findByPk(userId);
  if (!user) return;

  let state = user.state ? JSON.parse(user.state) : null;

  // ========== معالجة إدخالات الأدمن ==========
  if (state && isAdmin(userId)) {
    // إضافة بوت
    if (state.action === 'add_bot') {
      if (state.step === 'token') {
        try {
          const testBot = new TelegramBot(text, { polling: false });
          const me = await testBot.getMe();
          const botName = me.username;
          await BotService.create({
            token: text,
            name: botName,
            allowedActions: ['redeem']
          });
          await bot.sendMessage(userId, await getText(userId, 'botAdded'));
          const newBot = await BotService.findOne({ where: { token: text } });
          if (newBot) {
            const keyboard = {
              inline_keyboard: [
                [{ text: await getText(userId, 'editBotPerms'), callback_data: `admin_edit_bot_perm_${newBot.id}` }],
                [{ text: await getText(userId, 'back'), callback_data: 'admin_manage_bots' }]
              ]
            };
            await bot.sendMessage(userId, 'Do you want to edit permissions for this bot?', { reply_markup: keyboard });
          }
        } catch {
          await bot.sendMessage(userId, '❌ Invalid token');
        }
        await User.update({ state: null }, { where: { id: userId } });
        return;
      }
    }

    // إضافة تاجر
    if (state.action === 'add_merchant') {
      if (state.step === 'nameEn') {
        await User.update({ state: JSON.stringify({ ...state, step: 'nameAr', nameEn: text }) }, { where: { id: userId } });
        await bot.sendMessage(userId, await getText(userId, 'askMerchantNameAr'));
        return;
      } else if (state.step === 'nameAr') {
        await User.update({ state: JSON.stringify({ ...state, step: 'price', nameAr: text }) }, { where: { id: userId } });
        await bot.sendMessage(userId, await getText(userId, 'askMerchantPrice'));
        return;
      } else if (state.step === 'price') {
        const price = parseFloat(text);
        if (isNaN(price)) {
          await bot.sendMessage(userId, '❌ Invalid price.');
          await User.update({ state: null }, { where: { id: userId } });
          return;
        }
        const merchant = await Merchant.create({ nameEn: state.nameEn, nameAr: state.nameAr, price });
        await bot.sendMessage(userId, (await getText(userId, 'merchantCreated')).replace('{id}', merchant.id));
        await User.update({ state: null }, { where: { id: userId } });
        await showAdminPanel(userId);
        return;
      }
    }

    // تعديل سعر تاجر
    if (state.action === 'set_price') {
      const price = parseFloat(text);
      if (isNaN(price)) {
        await bot.sendMessage(userId, '❌ Invalid price.');
        await User.update({ state: null }, { where: { id: userId } });
        return;
      }
      await Merchant.update({ price }, { where: { id: state.merchantId } });
      await bot.sendMessage(userId, await getText(userId, 'priceUpdated'));
      await User.update({ state: null }, { where: { id: userId } });
      await showAdminPanel(userId);
      return;
    }

    // إضافة أكواد
    if (state.action === 'add_codes') {
      const codes = text.split(/\s+/).filter(c => c.trim().length > 0);
      if (codes.length === 0) {
        await bot.sendMessage(userId, '❌ No codes found.');
        await User.update({ state: null }, { where: { id: userId } });
        return;
      }
      const codesToInsert = codes.map(code => ({ value: code, merchantId: state.merchantId, isUsed: false }));
      await Code.bulkCreate(codesToInsert);
      await bot.sendMessage(userId, `${await getText(userId, 'codesAdded')}\nAdded ${codes.length} codes.`);
      await User.update({ state: null }, { where: { id: userId } });
      await showAdminPanel(userId);
      return;
    }

    // إضافة طريقة دفع
    if (state.action === 'add_payment_method') {
      if (state.step === 'nameEn') {
        await User.update({ state: JSON.stringify({ ...state, step: 'nameAr', nameEn: text }) }, { where: { id: userId } });
        await bot.sendMessage(userId, await getText(userId, 'enterPaymentNameAr'));
        return;
      } else if (state.step === 'nameAr') {
        await User.update({ state: JSON.stringify({ ...state, step: 'details', nameAr: text }) }, { where: { id: userId } });
        await bot.sendMessage(userId, await getText(userId, 'enterPaymentDetails'));
        return;
      } else if (state.step === 'details') {
        await PaymentMethod.create({ merchantId: state.merchantId, nameEn: state.nameEn, nameAr: state.nameAr, details: text, type: 'manual' });
        await bot.sendMessage(userId, await getText(userId, 'paymentMethodAdded'));
        await User.update({ state: null }, { where: { id: userId } });
        await showAdminPanel(userId);
        return;
      }
    }

    // الرد على الدعم
    if (state.action === 'support_reply') {
      const targetUserId = state.targetUserId;
      await bot.sendMessage(targetUserId, `📨 Support reply:\n\n${text}`);
      await bot.sendMessage(userId, await getText(userId, 'supportReplySent'));
      await User.update({ state: null }, { where: { id: userId } });
      return;
    }
  }

  // ========== معالجة الدعم من المستخدم (نص أو صورة) ==========
  if (state && state.action === 'support') {
    let supportText = text || '';
    let photoFileId = null;
    if (photo) {
      photoFileId = photo[photo.length - 1].file_id;
    }
    const admins = [ADMIN_ID]; // الأدمن الوحيد
    for (const adminId of admins) {
      const notifText = await getText(adminId, 'supportNotification', { userId, message: supportText });
      if (photoFileId) {
        await bot.sendPhoto(adminId, photoFileId, { caption: notifText });
      } else {
        await bot.sendMessage(adminId, notifText);
      }
      await bot.sendMessage(adminId, await getText(adminId, 'replyToSupport'), {
        reply_markup: {
          inline_keyboard: [[{ text: 'Reply', callback_data: `support_reply_${userId}` }]]
        }
      });
    }
    await bot.sendMessage(userId, await getText(userId, 'supportMessageSent'));
    await User.update({ state: null }, { where: { id: userId } });
    return;
  }

  // ========== معالجة الشراء (إدخال الكمية) ==========
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
      await bot.sendMessage(userId, (await getText(userId, 'noCodes')) + ` Available: ${available}`);
      return;
    }
    const total = qty * merchant.price;
    await showPaymentMethods(userId, merchant.id, qty, total);
    await User.update({ state: JSON.stringify({ action: 'buy_selected', merchantId: merchant.id, qty, total }) }, { where: { id: userId } });
    return;
  }

  // ========== معالجة الدفع الآلي أو اليدوي ==========
  if (state && state.action === 'awaiting_tx') {
    const { merchantId, qty, total, paymentMethodId } = state;
    const method = await PaymentMethod.findByPk(paymentMethodId);
    if (!method) {
      await bot.sendMessage(userId, await getText(userId, 'error'));
      await User.update({ state: null }, { where: { id: userId } });
      return;
    }

    if (method.type === 'auto') {
      const txid = text.trim();
      const existingTx = await Transaction.findOne({ where: { txid } });
      if (existingTx) {
        await bot.sendMessage(userId, '❌ This transaction ID has already been used.');
        return;
      }
      const waitingMsg = await bot.sendMessage(userId, await getText(userId, 'checking'));
      const valid = await checkAutoPayment(txid, total);
      if (!valid) {
        await bot.editMessageText(await getText(userId, 'invalidTx'), { chat_id: userId, message_id: waitingMsg.message_id });
        return;
      }
      await Transaction.create({ txid, userId, merchantId, paymentMethodId, amount: total, quantity: qty, status: 'completed' });
      const codes = await Code.findAll({ where: { merchantId, isUsed: false }, limit: qty, order: [['id', 'ASC']] });
      if (codes.length < qty) {
        await bot.editMessageText(await getText(userId, 'noCodes'), { chat_id: userId, message_id: waitingMsg.message_id });
        return;
      }
      const codesList = codes.map(c => c.value).join('\n');
      await Code.update({ isUsed: true, usedBy: userId, soldAt: new Date() }, { where: { id: codes.map(c => c.id) } });
      await bot.editMessageText(`${await getText(userId, 'success')}\n\n${codesList}`, { chat_id: userId, message_id: waitingMsg.message_id });
      await User.update({ state: null }, { where: { id: userId } });
      await sendMainMenu(userId);
      return;
    } else {
      if (!photo) {
        await bot.sendMessage(userId, await getText(userId, 'sendImage'));
        return;
      }
      const fileId = photo[photo.length - 1].file_id;
      const request = await ManualPaymentRequest.create({
        userId, merchantId, paymentMethodId, amount: total, quantity: qty, imageFileId: fileId, status: 'pending'
      });
      const merchantName = (await Merchant.findByPk(merchantId)).nameEn;
      const admins = [ADMIN_ID];
      for (const adminId of admins) {
        const notifText = await getText(adminId, 'manualPaymentRequest', { userId, merchant: merchantName, amount: total, quantity: qty });
        const adminMsg = await bot.sendPhoto(adminId, fileId, {
          caption: notifText,
          reply_markup: {
            inline_keyboard: [
              [{ text: await getText(adminId, 'approve'), callback_data: `approve_payment_${request.id}` }],
              [{ text: await getText(adminId, 'reject'), callback_data: `reject_payment_${request.id}` }]
            ]
          }
        });
        request.adminMessageId = adminMsg.message_id;
        await request.save();
      }
      await bot.sendMessage(userId, await getText(userId, 'paymentRequestPending'));
      await User.update({ state: null }, { where: { id: userId } });
      await sendMainMenu(userId);
      return;
    }
  }

  // ========== معالجة الاسترداد (كود البطاقة) ==========
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
});

// ========================
// 7. API للبوتات الأخرى (منح صلاحية /code)
// ========================
app.post('/api/redeem', async (req, res) => {
  const { token, card_key, merchant_dict_id, platform_id } = req.body;

  const botService = await BotService.findOne({ where: { token, isActive: true } });
  if (!botService) {
    return res.status(401).json({ error: 'Invalid or inactive bot token' });
  }
  if (!botService.allowedActions.includes('redeem')) {
    return res.status(403).json({ error: 'Bot not allowed to redeem codes' });
  }
  if (!card_key || !merchant_dict_id) {
    return res.status(400).json({ error: 'Missing required fields: card_key, merchant_dict_id' });
  }

  const result = await redeemCard(card_key, merchant_dict_id, platform_id || '1');

  const stat = await BotStat.findOne({ where: { botId: botService.id, action: 'redeem' } });
  if (stat) {
    stat.count += 1;
    stat.lastUsed = new Date();
    await stat.save();
  } else {
    await BotStat.create({ botId: botService.id, action: 'redeem', count: 1, lastUsed: new Date() });
  }

  if (result.success) {
    res.json({ success: true, data: result.data });
  } else {
    res.status(400).json({ success: false, error: result.reason });
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

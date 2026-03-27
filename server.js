// ========================
// index.js - البوت المتكامل (نسخة احترافية متطورة)
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
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 }
});

// النماذج (Models)
const User = sequelize.define('User', {
  id: { type: DataTypes.BIGINT, primaryKey: true },
  lang: { type: DataTypes.STRING(2), defaultValue: 'en' },
  balance: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  state: { type: DataTypes.TEXT, allowNull: true },
  referralCode: { type: DataTypes.STRING, unique: true },
  referredBy: { type: DataTypes.BIGINT, allowNull: true },
  totalPurchases: { type: DataTypes.INTEGER, defaultValue: 0 }
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
  price: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  category: { type: DataTypes.STRING, defaultValue: 'general' },
  type: { type: DataTypes.STRING, defaultValue: 'single' }, // 'single' or 'bulk'
  description: { type: DataTypes.JSONB, allowNull: true } // { type: 'text', content: '...' } or { type: 'photo', fileId: '...' }
});

const PaymentMethod = sequelize.define('PaymentMethod', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  nameEn: { type: DataTypes.STRING, allowNull: false },
  nameAr: { type: DataTypes.STRING, allowNull: false },
  details: { type: DataTypes.TEXT, allowNull: false },
  type: { type: DataTypes.STRING, defaultValue: 'manual' },
  config: { type: DataTypes.JSONB, defaultValue: {} },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  minDeposit: { type: DataTypes.FLOAT, defaultValue: 1.0 },
  maxDeposit: { type: DataTypes.FLOAT, defaultValue: 10000.0 }
});

const Code = sequelize.define('Code', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  value: { type: DataTypes.TEXT, allowNull: false },
  extra: { type: DataTypes.TEXT, allowNull: true }, // للزوج الثاني (مثل الباسورد)
  merchantId: { type: DataTypes.INTEGER, references: { model: Merchant, key: 'id' } },
  isUsed: { type: DataTypes.BOOLEAN, defaultValue: false },
  usedBy: { type: DataTypes.BIGINT, allowNull: true },
  soldAt: { type: DataTypes.DATE, allowNull: true },
  expiresAt: { type: DataTypes.DATE, allowNull: true }
});

const BalanceTransaction = sequelize.define('BalanceTransaction', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.BIGINT, allowNull: false },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  type: { type: DataTypes.STRING, allowNull: false },
  paymentMethodId: { type: DataTypes.INTEGER, references: { model: PaymentMethod, key: 'id' }, allowNull: true },
  txid: { type: DataTypes.STRING, allowNull: true },
  imageFileId: { type: DataTypes.STRING, allowNull: true },
  status: { type: DataTypes.STRING, defaultValue: 'pending' },
  adminMessageId: { type: DataTypes.BIGINT, allowNull: true },
  createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
});

const BotService = sequelize.define('BotService', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  token: { type: DataTypes.STRING, unique: true, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  allowedActions: { type: DataTypes.JSONB, defaultValue: [] },
  ownerId: { type: DataTypes.BIGINT, allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
});

const BotStat = sequelize.define('BotStat', {
  botId: { type: DataTypes.INTEGER, references: { model: BotService, key: 'id' } },
  action: { type: DataTypes.STRING },
  count: { type: DataTypes.INTEGER, defaultValue: 0 },
  lastUsed: { type: DataTypes.DATE }
});

const DiscountCode = sequelize.define('DiscountCode', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  code: { type: DataTypes.STRING, unique: true, allowNull: false },
  discountPercent: { type: DataTypes.INTEGER, defaultValue: 0 },
  validUntil: { type: DataTypes.DATE, allowNull: true },
  maxUses: { type: DataTypes.INTEGER, defaultValue: 1 },
  usedCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  createdBy: { type: DataTypes.BIGINT, allowNull: false }
});

const ReferralReward = sequelize.define('ReferralReward', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  referrerId: { type: DataTypes.BIGINT, allowNull: false },
  referredId: { type: DataTypes.BIGINT, allowNull: false },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: 'pending' }
});

const RedeemService = sequelize.define('RedeemService', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  nameEn: { type: DataTypes.STRING, allowNull: false },
  nameAr: { type: DataTypes.STRING, allowNull: false },
  merchantDictId: { type: DataTypes.STRING, allowNull: false }, // معرف التاجر في نظام NodeCard
  platformId: { type: DataTypes.STRING, defaultValue: '1' }
});

// العلاقات
Merchant.hasMany(Code, { foreignKey: 'merchantId' });
Code.belongsTo(Merchant);
BalanceTransaction.belongsTo(User, { foreignKey: 'userId' });
BalanceTransaction.belongsTo(PaymentMethod);
BotService.hasMany(BotStat, { foreignKey: 'botId' });
BotStat.belongsTo(BotService);
User.hasMany(ReferralReward, { as: 'Referrer', foreignKey: 'referrerId' });
User.hasMany(ReferralReward, { as: 'Referred', foreignKey: 'referredId' });
DiscountCode.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });

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
    enterDepositAmount: '💰 Enter amount in USD (min {min} / max {max}):',
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
    sendCode: '✍️ Send the card code:',
    referral: '🤝 Invite Friends',
    referralInfo: 'Share your referral link with friends and earn {percent}% of their deposits!\n\nYour referral code: `{code}`\nLink: {link}',
    referralEarned: '🎉 You earned {amount} USD from a referral!',
    discount: '🎟️ Apply Discount Code',
    enterDiscountCode: 'Send your discount code:',
    discountApplied: '✅ Discount code applied! You get {percent}% off.',
    discountInvalid: '❌ Invalid or expired discount code.',
    myPurchases: '📜 My Purchases',
    noPurchases: 'No purchases yet.',
    purchaseHistory: '🛍️ Purchase History:\n{history}',
    deleteMerchant: '🗑️ Delete Merchant',
    confirmDelete: '⚠️ Are you sure you want to delete this merchant?',
    yes: '✅ Yes',
    no: '❌ No',
    merchantDeleted: 'Merchant deleted successfully.',
    editMerchant: '✏️ Edit Merchant',
    editCategory: '📂 Edit Category',
    askCategory: 'Send category name (e.g., gaming, giftcard):',
    categoryUpdated: 'Category updated!',
    referralSettings: '👥 Referral Settings',
    setReferralPercent: 'Set referral reward percentage:',
    referralPercentUpdated: 'Referral reward percentage updated to {percent}%.',
    redeemViaApi: '🔑 Redeem via API (for bots)',
    askMerchantType: 'Select merchant type:',
    typeSingle: 'Single (one code per line)',
    typeBulk: 'Bulk (email/password pairs)',
    askDescription: 'Send description (text, photo, video, or /skip):',
    descriptionSaved: '✅ Description saved!',
    showDescription: '📖 View Description',
    manageRedeemServices: '🔄 Manage Redeem Services',
    addRedeemService: '➕ Add Redeem Service',
    listRedeemServices: '📋 List Redeem Services',
    deleteRedeemService: '🗑️ Delete Redeem Service',
    redeemServiceNameEn: 'Send service name in English:',
    redeemServiceNameAr: 'Send service name in Arabic:',
    redeemServiceMerchantId: 'Send merchant dict ID (from NodeCard):',
    redeemServicePlatformId: 'Send platform ID (default 1):',
    redeemServiceAdded: '✅ Redeem service added!',
    chooseRedeemService: 'Choose the service to redeem:',
    sendCodeToRedeem: 'Send the code to redeem:',
    manageDiscountCodes: '🎟️ Manage Discount Codes',
    addDiscountCode: '➕ Add Discount Code',
    listDiscountCodes: '📋 List Discount Codes',
    deleteDiscountCode: '🗑️ Delete Discount Code',
    enterDiscountCodeValue: 'Enter discount code (e.g., SAVE10):',
    enterDiscountPercent: 'Enter discount percentage (e.g., 10):',
    enterDiscountValidUntil: 'Enter expiry date (YYYY-MM-DD) or /skip:',
    enterDiscountMaxUses: 'Enter max uses (e.g., 100):',
    discountCodeAdded: '✅ Discount code added!',
    discountCodeDeleted: '❌ Discount code deleted!',
    noDiscountCodes: 'No discount codes found.'
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
    enterDepositAmount: '💰 أدخل المبلغ بالدولار (الحد الأدنى {min} / الأقصى {max}):',
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
    sendCode: '✍️ أرسل كود البطاقة:',
    referral: '🤝 دعوة الأصدقاء',
    referralInfo: 'شارك رابط الإحالة الخاص بك مع أصدقائك واربح {percent}% من إيداعاتهم!\n\nكود الإحالة الخاص بك: `{code}`\nالرابط: {link}',
    referralEarned: '🎉 لقد ربحت {amount} دولار من إحالة صديق!',
    discount: '🎟️ تطبيق كود خصم',
    enterDiscountCode: 'أرسل كود الخصم الخاص بك:',
    discountApplied: '✅ تم تطبيق كود الخصم! تحصل على خصم {percent}%.',
    discountInvalid: '❌ كود خصم غير صالح أو منتهي الصلاحية.',
    myPurchases: '📜 مشترياتي',
    noPurchases: 'لا توجد مشتريات بعد.',
    purchaseHistory: '🛍️ سجل المشتريات:\n{history}',
    deleteMerchant: '🗑️ حذف تاجر',
    confirmDelete: '⚠️ هل أنت متأكد من حذف هذا التاجر؟',
    yes: '✅ نعم',
    no: '❌ لا',
    merchantDeleted: 'تم حذف التاجر بنجاح.',
    editMerchant: '✏️ تعديل تاجر',
    editCategory: '📂 تعديل التصنيف',
    askCategory: 'أرسل اسم التصنيف (مثال: ألعاب، بطاقات هدايا):',
    categoryUpdated: 'تم تحديث التصنيف!',
    referralSettings: '👥 إعدادات الإحالة',
    setReferralPercent: 'أدخل نسبة مكافأة الإحالة:',
    referralPercentUpdated: 'تم تحديث نسبة مكافأة الإحالة إلى {percent}%.',
    redeemViaApi: '🔑 استرداد عبر API (للبوتات)',
    askMerchantType: 'اختر نوع التاجر:',
    typeSingle: 'فردي (كود واحد في كل سطر)',
    typeBulk: 'جملة (إيميل وباسورد في سطرين)',
    askDescription: 'أرسل شرح توضيحي (نص، صورة، فيديو، أو /skip):',
    descriptionSaved: '✅ تم حفظ الشرح!',
    showDescription: '📖 عرض الشرح',
    manageRedeemServices: '🔄 إدارة خدمات الاسترداد',
    addRedeemService: '➕ إضافة خدمة استرداد',
    listRedeemServices: '📋 قائمة خدمات الاسترداد',
    deleteRedeemService: '🗑️ حذف خدمة استرداد',
    redeemServiceNameEn: 'أرسل اسم الخدمة بالإنجليزية:',
    redeemServiceNameAr: 'أرسل اسم الخدمة بالعربية:',
    redeemServiceMerchantId: 'أرسل معرف التاجر في NodeCard:',
    redeemServicePlatformId: 'أرسل معرف المنصة (افتراضي 1):',
    redeemServiceAdded: '✅ تمت إضافة خدمة الاسترداد!',
    chooseRedeemService: 'اختر الخدمة المراد استرداد الكود فيها:',
    sendCodeToRedeem: 'أرسل الكود المراد استرداده:',
    manageDiscountCodes: '🎟️ إدارة كودات الخصم',
    addDiscountCode: '➕ إضافة كود خصم',
    listDiscountCodes: '📋 قائمة كودات الخصم',
    deleteDiscountCode: '🗑️ حذف كود خصم',
    enterDiscountCodeValue: 'أدخل كود الخصم (مثال: SAVE10):',
    enterDiscountPercent: 'أدخل نسبة الخصم (مثال: 10):',
    enterDiscountValidUntil: 'أدخل تاريخ الانتهاء (YYYY-MM-DD) أو /skip:',
    enterDiscountMaxUses: 'أدخل الحد الأقصى للاستخدام (مثال: 100):',
    discountCodeAdded: '✅ تمت إضافة كود الخصم!',
    discountCodeDeleted: '❌ تم حذف كود الخصم!',
    noDiscountCodes: 'لا توجد كودات خصم.'
  }
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

function isAdmin(userId) {
  return userId === ADMIN_ID;
}

function generateReferralCode(userId) {
  return `REF${userId}${Date.now().toString(36)}`;
}

async function getUserReferralLink(userId) {
  const user = await User.findByPk(userId);
  if (!user.referralCode) {
    user.referralCode = generateReferralCode(userId);
    await user.save();
  }
  const botInfo = await bot.getMe();
  return `https://t.me/${botInfo.username}?start=ref_${user.referralCode}`;
}

async function handleReferral(userId, referralCode) {
  const referrer = await User.findOne({ where: { referralCode } });
  if (!referrer || referrer.id === userId) return false;
  await User.update({ referredBy: referrer.id }, { where: { id: userId } });
  return true;
}

async function applyDiscount(userId, discountCode, totalAmount) {
  const discount = await DiscountCode.findOne({
    where: {
      code: discountCode,
      validUntil: { [Sequelize.Op.gt]: new Date() },
      maxUses: { [Sequelize.Op.gt]: Sequelize.col('usedCount') }
    }
  });
  if (!discount) return { success: false, reason: 'invalid' };
  const newTotal = totalAmount * (1 - discount.discountPercent / 100);
  discount.usedCount += 1;
  await discount.save();
  return { success: true, newTotal, discountPercent: discount.discountPercent };
}

// ========================
// 4. دوال عرض القوائم المتقدمة
// ========================
async function sendMainMenu(userId) {
  const menuText = await getText(userId, 'menu');
  const keyboard = {
    inline_keyboard: [
      [{ text: await getText(userId, 'redeem'), callback_data: 'redeem' }],
      [{ text: await getText(userId, 'buy'), callback_data: 'buy' }],
      [{ text: await getText(userId, 'myBalance'), callback_data: 'my_balance' }],
      [{ text: await getText(userId, 'deposit'), callback_data: 'deposit' }],
      [{ text: await getText(userId, 'referral'), callback_data: 'referral' }],
      [{ text: await getText(userId, 'discount'), callback_data: 'discount' }],
      [{ text: await getText(userId, 'myPurchases'), callback_data: 'my_purchases' }],
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
      [{ text: await getText(userId, 'referralSettings'), callback_data: 'admin_referral_settings' }],
      [{ text: await getText(userId, 'manageRedeemServices'), callback_data: 'admin_manage_redeem_services' }],
      [{ text: await getText(userId, 'manageDiscountCodes'), callback_data: 'admin_manage_discount_codes' }],
      [{ text: await getText(userId, 'back'), callback_data: 'back_to_menu' }]
    ]
  };
  await bot.sendMessage(userId, panelText, { reply_markup: keyboard });
}

async function showMerchantsForBuy(userId) {
  const merchants = await Merchant.findAll({ order: [['category', 'ASC'], ['id', 'ASC']] });
  if (merchants.length === 0) {
    await bot.sendMessage(userId, await getText(userId, 'noCodes'));
    return sendMainMenu(userId);
  }
  const lang = (await User.findByPk(userId)).lang;
  const grouped = {};
  merchants.forEach(m => {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category].push(m);
  });
  const buttons = [];
  for (const [cat, list] of Object.entries(grouped)) {
    buttons.push([{ text: `📂 ${cat}`, callback_data: `ignore` }]);
    list.forEach(m => {
      const row = [];
      row.push({
        text: `${lang === 'en' ? m.nameEn : m.nameAr} - ${m.price} USD`,
        callback_data: `buy_merchant_${m.id}`
      });
      if (m.description && (m.description.content || m.description.fileId)) {
        row.push({
          text: await getText(userId, 'showDescription'),
          callback_data: `show_description_${m.id}`
        });
      }
      buttons.push(row);
    });
  }
  buttons.push([{ text: await getText(userId, 'back'), callback_data: 'back_to_menu' }]);
  await bot.sendMessage(userId, await getText(userId, 'chooseMerchant'), { reply_markup: { inline_keyboard: buttons } });
}

async function showPaymentMethodsForDeposit(userId, amount) {
  const methods = await PaymentMethod.findAll({ where: { isActive: true } });
  if (methods.length === 0) {
    await bot.sendMessage(userId, await getText(userId, 'noPaymentMethods'));
    return sendMainMenu(userId);
  }
  const lang = (await User.findByPk(userId)).lang;
  const buttons = methods.map(m => ([{
    text: `${lang === 'en' ? m.nameEn : m.nameAr} (Min: ${m.minDeposit} / Max: ${m.maxDeposit})`,
    callback_data: `deposit_method_${m.id}_${amount}`
  }]));
  buttons.push([{ text: await getText(userId, 'back'), callback_data: 'back_to_menu' }]);
  await bot.sendMessage(userId, await getText(userId, 'choosePaymentMethod'), { reply_markup: { inline_keyboard: buttons } });
}

async function showBotsList(userId) {
  if (!isAdmin(userId)) return;
  const bots = await BotService.findAll();
  if (bots.length === 0) {
    await bot.sendMessage(userId, 'No bots found.');
  } else {
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
  const addBtn = {
    inline_keyboard: [[{ text: await getText(userId, 'addBot'), callback_data: 'admin_add_bot' }]]
  };
  await bot.sendMessage(userId, await getText(userId, 'addBot'), { reply_markup: addBtn });
}

async function showRedeemServices(userId) {
  const services = await RedeemService.findAll();
  if (services.length === 0) {
    await bot.sendMessage(userId, '❌ No redeem services available.');
    return sendMainMenu(userId);
  }
  const lang = (await User.findByPk(userId)).lang;
  const buttons = services.map(s => ([{
    text: lang === 'en' ? s.nameEn : s.nameAr,
    callback_data: `redeem_service_${s.id}`
  }]));
  buttons.push([{ text: await getText(userId, 'back'), callback_data: 'back_to_menu' }]);
  await bot.sendMessage(userId, await getText(userId, 'chooseRedeemService'), { reply_markup: { inline_keyboard: buttons } });
}

async function showRedeemServicesAdmin(userId) {
  const services = await RedeemService.findAll();
  let msg = await getText(userId, 'listRedeemServices') + '\n';
  for (const s of services) {
    msg += `ID: ${s.id} | ${s.nameEn} / ${s.nameAr} | MerchantDict: ${s.merchantDictId}\n`;
  }
  const keyboard = {
    inline_keyboard: [
      [{ text: await getText(userId, 'addRedeemService'), callback_data: 'admin_add_redeem_service' }],
      [{ text: await getText(userId, 'deleteRedeemService'), callback_data: 'admin_delete_redeem_service' }],
      [{ text: await getText(userId, 'back'), callback_data: 'admin' }]
    ]
  };
  await bot.sendMessage(userId, msg, { reply_markup: keyboard });
}

async function showDiscountCodesAdmin(userId) {
  const codes = await DiscountCode.findAll();
  let msg = await getText(userId, 'listDiscountCodes') + '\n';
  for (const c of codes) {
    msg += `ID: ${c.id} | ${c.code} | ${c.discountPercent}% | Uses: ${c.usedCount}/${c.maxUses} | Expires: ${c.validUntil ? c.validUntil.toISOString().split('T')[0] : 'never'}\n`;
  }
  const keyboard = {
    inline_keyboard: [
      [{ text: await getText(userId, 'addDiscountCode'), callback_data: 'admin_add_discount_code' }],
      [{ text: await getText(userId, 'deleteDiscountCode'), callback_data: 'admin_delete_discount_code' }],
      [{ text: await getText(userId, 'back'), callback_data: 'admin' }]
    ]
  };
  await bot.sendMessage(userId, msg || await getText(userId, 'noDiscountCodes'), { reply_markup: keyboard });
}

// دوال الاسترداد (نفس السابق)
async function redeemCard(cardKey, merchantDictId, platformId = '1') {
  try {
    const apiKey = process.env.NODE_CARD_API_KEY;
    const baseUrl = process.env.NODE_CARD_BASE_URL || 'https://api.node-card.com';
    const params = new URLSearchParams();
    params.append('card_key', cardKey);
    params.append('merchant_dict_id', merchantDictId);
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

async function processPurchase(userId, merchantId, quantity, discountCode = null) {
  const merchant = await Merchant.findByPk(merchantId);
  if (!merchant) return { success: false, reason: 'Merchant not found' };
  let totalCost = merchant.price * quantity;
  let discountPercent = 0;
  if (discountCode) {
    const disc = await applyDiscount(userId, discountCode, totalCost);
    if (disc.success) {
      totalCost = disc.newTotal;
      discountPercent = disc.discountPercent;
    } else {
      return { success: false, reason: 'Invalid discount code' };
    }
  }
  const user = await User.findByPk(userId);
  if (!user) return { success: false, reason: 'User not found' };
  const currentBalance = parseFloat(user.balance);
  if (currentBalance < totalCost) {
    return { success: false, reason: 'Insufficient balance' };
  }
  const codes = await Code.findAll({ where: { merchantId, isUsed: false }, limit: quantity, order: [['id', 'ASC']] });
  if (codes.length < quantity) {
    return { success: false, reason: 'Not enough codes in stock' };
  }
  const t = await sequelize.transaction();
  try {
    await User.update({ balance: currentBalance - totalCost, totalPurchases: user.totalPurchases + quantity }, { where: { id: userId }, transaction: t });
    await BalanceTransaction.create({
      userId,
      amount: -totalCost,
      type: 'purchase',
      status: 'completed'
    }, { transaction: t });
    await Code.update({ isUsed: true, usedBy: userId, soldAt: new Date() }, { where: { id: codes.map(c => c.id) }, transaction: t });
    await t.commit();

    let codesList = '';
    for (const c of codes) {
      if (c.extra) {
        codesList += `${c.value}\n${c.extra}\n\n`;
      } else {
        codesList += `${c.value}\n\n`;
      }
    }
    return { success: true, codes: codesList.trim(), discountApplied: discountPercent };
  } catch (err) {
    await t.rollback();
    console.error('Purchase transaction error:', err);
    return { success: false, reason: 'Database error' };
  }
}

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

// ========================
// 5. أوامر البوت الأساسية
// ========================
bot.onText(/\/start/, async (msg) => {
  const userId = msg.chat.id;
  const args = msg.text.split(' ');
  try {
    await User.findOrCreate({ where: { id: userId }, defaults: { lang: 'en', balance: 0, referralCode: generateReferralCode(userId) } });
    if (args.length > 1 && args[1].startsWith('ref_')) {
      const referralCode = args[1].substring(4);
      await handleReferral(userId, referralCode);
    }
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
// 6. معالجة callback_query (جميع الأزرار)
// ========================
bot.on('callback_query', async (query) => {
  const userId = query.message.chat.id;
  const data = query.data;

  try {
    await User.findOrCreate({ where: { id: userId }, defaults: { lang: 'en', balance: 0, referralCode: generateReferralCode(userId) } });

    if (data.startsWith('lang_')) {
      const newLang = data.split('_')[1];
      await User.update({ lang: newLang }, { where: { id: userId } });
      await sendMainMenu(userId);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'back_to_menu') {
      await sendMainMenu(userId);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'support') {
      await User.update({ state: JSON.stringify({ action: 'support' }) }, { where: { id: userId } });
      await bot.sendMessage(userId, await getText(userId, 'sendReply'));
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin' && isAdmin(userId)) {
      await showAdminPanel(userId);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'my_balance') {
      const user = await User.findByPk(userId);
      const balance = parseFloat(user.balance).toFixed(2);
      await bot.sendMessage(userId, `💰 Your balance: ${balance} USD`);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'referral') {
      const user = await User.findByPk(userId);
      const link = await getUserReferralLink(userId);
      const percent = process.env.REFERRAL_PERCENT || 10;
      const info = await getText(userId, 'referralInfo', { code: user.referralCode, link, percent });
      await bot.sendMessage(userId, info, { parse_mode: 'Markdown' });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'discount') {
      await User.update({ state: JSON.stringify({ action: 'discount' }) }, { where: { id: userId } });
      await bot.sendMessage(userId, await getText(userId, 'enterDiscountCode'));
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'my_purchases') {
      const purchases = await BalanceTransaction.findAll({ where: { userId, type: 'purchase', status: 'completed' }, order: [['createdAt', 'DESC']], limit: 20 });
      if (purchases.length === 0) {
        await bot.sendMessage(userId, await getText(userId, 'noPurchases'));
      } else {
        let history = '';
        for (const p of purchases) {
          history += `🛒 ${p.createdAt.toLocaleDateString()}: -${p.amount} USD\n`;
        }
        await bot.sendMessage(userId, await getText(userId, 'purchaseHistory', { history }));
      }
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'deposit') {
      await User.update({ state: JSON.stringify({ action: 'deposit_amount' }) }, { where: { id: userId } });
      await bot.sendMessage(userId, await getText(userId, 'enterDepositAmount', { min: 1, max: 10000 }));
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data.startsWith('deposit_method_')) {
      const parts = data.split('_');
      const methodId = parseInt(parts[2]);
      const amount = parseFloat(parts[3]);
      const method = await PaymentMethod.findByPk(methodId);
      if (!method) {
        await bot.sendMessage(userId, await getText(userId, 'error'));
        await sendMainMenu(userId);
        await bot.answerCallbackQuery(query.id);
        return;
      }
      if (amount < method.minDeposit || amount > method.maxDeposit) {
        await bot.sendMessage(userId, `❌ Amount must be between ${method.minDeposit} and ${method.maxDeposit} USD.`);
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

    if (data === 'admin_manage_bots' && isAdmin(userId)) {
      await showBotsList(userId);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_add_bot' && isAdmin(userId)) {
      await User.update({ state: JSON.stringify({ action: 'add_bot', step: 'token' }) }, { where: { id: userId } });
      await bot.sendMessage(userId, await getText(userId, 'enterBotToken'));
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data.startsWith('bot_grant_code_') && isAdmin(userId)) {
      const botId = parseInt(data.split('_')[3]);
      const botService = await BotService.findByPk(botId);
      if (botService) {
        let allowed = botService.allowedActions || [];
        if (!allowed.includes('code')) allowed.push('code');
        allowed = allowed.filter(a => a !== 'full');
        botService.allowedActions = allowed;
        await botService.save();
        await bot.sendMessage(userId, `✅ Granted /code permission to ${botService.name}`);
      }
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data.startsWith('bot_grant_full_') && isAdmin(userId)) {
      const botId = parseInt(data.split('_')[3]);
      await User.update({ state: JSON.stringify({ action: 'set_bot_owner', botId }) }, { where: { id: userId } });
      await bot.sendMessage(userId, 'Send the Telegram user ID of the new bot owner:');
      await bot.answerCallbackQuery(query.id);
      return;
    }

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

    if (data.startsWith('admin_remove_bot_confirm_') && isAdmin(userId)) {
      const botId = parseInt(data.split('_')[4]);
      await BotService.destroy({ where: { id: botId } });
      await bot.sendMessage(userId, await getText(userId, 'botRemoved'));
      await bot.answerCallbackQuery(query.id);
      return;
    }

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

    if (data === 'buy') {
      await showMerchantsForBuy(userId);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'redeem') {
      await showRedeemServices(userId);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data.startsWith('redeem_service_')) {
      const serviceId = parseInt(data.split('_')[2]);
      await User.update({ state: JSON.stringify({ action: 'redeem_via_service', serviceId }) }, { where: { id: userId } });
      await bot.sendMessage(userId, await getText(userId, 'sendCodeToRedeem'));
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

    if (data.startsWith('show_description_')) {
      const merchantId = parseInt(data.split('_')[2]);
      const merchant = await Merchant.findByPk(merchantId);
      if (merchant && merchant.description) {
        const desc = merchant.description;
        if (desc.type === 'text') {
          await bot.sendMessage(userId, desc.content);
        } else if (desc.type === 'photo') {
          await bot.sendPhoto(userId, desc.fileId);
        } else if (desc.type === 'video') {
          await bot.sendVideo(userId, desc.fileId);
        }
      } else {
        await bot.sendMessage(userId, 'No description available.');
      }
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_stats' && isAdmin(userId)) {
      const totalCodes = await Code.count();
      const usedCodes = await Code.count({ where: { isUsed: true } });
      const totalSales = await BalanceTransaction.sum('amount', { where: { type: 'purchase', status: 'completed' } });
      const pendingDeposits = await BalanceTransaction.count({ where: { type: 'deposit', status: 'pending' } });
      const statsText = await getText(userId, 'totalCodes', { count: totalCodes }) + '\n' +
                        await getText(userId, 'totalSales', { amount: totalSales || 0 }) + '\n' +
                        await getText(userId, 'pendingDeposits', { count: pendingDeposits });
      await bot.sendMessage(userId, statsText);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_payment_methods' && isAdmin(userId)) {
      const methods = await PaymentMethod.findAll();
      let msg = '💳 Payment Methods:\n';
      for (const m of methods) {
        msg += `ID: ${m.id} | ${m.nameEn} (${m.type}) - Active: ${m.isActive}\n`;
      }
      const keyboard = {
        inline_keyboard: [
          [{ text: '➕ Add New', callback_data: 'admin_add_payment' }],
          [{ text: '🗑️ Delete', callback_data: 'admin_delete_payment' }],
          [{ text: '⚙️ Set Limits', callback_data: 'admin_set_limits' }],
          [{ text: '🔙 Back', callback_data: 'admin' }]
        ]
      };
      await bot.sendMessage(userId, msg, { reply_markup: keyboard });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_add_merchant' && isAdmin(userId)) {
      await User.update({ state: JSON.stringify({ action: 'add_merchant', step: 'nameEn' }) }, { where: { id: userId } });
      await bot.sendMessage(userId, await getText(userId, 'askMerchantNameEn'));
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_list_merchants' && isAdmin(userId)) {
      const merchants = await Merchant.findAll();
      let msg = await getText(userId, 'merchantList');
      for (const m of merchants) {
        msg += `ID: ${m.id} | ${m.nameEn} / ${m.nameAr} | Price: ${m.price} USD | Category: ${m.category} | Type: ${m.type}\n`;
      }
      const keyboard = {
        inline_keyboard: [
          [{ text: '✏️ Edit', callback_data: 'admin_edit_merchant' }],
          [{ text: '🗑️ Delete', callback_data: 'admin_delete_merchant' }],
          [{ text: '📂 Edit Category', callback_data: 'admin_edit_category' }],
          [{ text: '🔙 Back', callback_data: 'admin' }]
        ]
      };
      await bot.sendMessage(userId, msg, { reply_markup: keyboard });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_set_price' && isAdmin(userId)) {
      const merchants = await Merchant.findAll();
      let msg = await getText(userId, 'selectMerchantToSetPrice') + '\n';
      const buttons = merchants.map(m => ([{ text: `${m.nameEn} (ID: ${m.id})`, callback_data: `set_price_merchant_${m.id}` }]));
      buttons.push([{ text: await getText(userId, 'back'), callback_data: 'admin' }]);
      await bot.sendMessage(userId, msg, { reply_markup: { inline_keyboard: buttons } });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data.startsWith('set_price_merchant_') && isAdmin(userId)) {
      const merchantId = parseInt(data.split('_')[3]);
      await User.update({ state: JSON.stringify({ action: 'set_price', merchantId }) }, { where: { id: userId } });
      await bot.sendMessage(userId, await getText(userId, 'enterPrice'));
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_add_codes' && isAdmin(userId)) {
      const merchants = await Merchant.findAll();
      let msg = await getText(userId, 'selectMerchantToAddCodes') + '\n';
      const buttons = merchants.map(m => ([{ text: `${m.nameEn} (ID: ${m.id})`, callback_data: `add_codes_merchant_${m.id}` }]));
      buttons.push([{ text: await getText(userId, 'back'), callback_data: 'admin' }]);
      await bot.sendMessage(userId, msg, { reply_markup: { inline_keyboard: buttons } });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data.startsWith('add_codes_merchant_') && isAdmin(userId)) {
      const merchantId = parseInt(data.split('_')[3]);
      await User.update({ state: JSON.stringify({ action: 'add_codes', merchantId }) }, { where: { id: userId } });
      await bot.sendMessage(userId, await getText(userId, 'enterCodes'));
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_referral_settings' && isAdmin(userId)) {
      await User.update({ state: JSON.stringify({ action: 'set_referral_percent' }) }, { where: { id: userId } });
      await bot.sendMessage(userId, await getText(userId, 'setReferralPercent'));
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_manage_redeem_services' && isAdmin(userId)) {
      await showRedeemServicesAdmin(userId);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_add_redeem_service' && isAdmin(userId)) {
      await User.update({ state: JSON.stringify({ action: 'add_redeem_service', step: 'nameEn' }) }, { where: { id: userId } });
      await bot.sendMessage(userId, await getText(userId, 'redeemServiceNameEn'));
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_delete_redeem_service' && isAdmin(userId)) {
      const services = await RedeemService.findAll();
      const buttons = services.map(s => ([{ text: `${s.nameEn} (ID: ${s.id})`, callback_data: `delete_redeem_service_${s.id}` }]));
      buttons.push([{ text: await getText(userId, 'back'), callback_data: 'admin_manage_redeem_services' }]);
      await bot.sendMessage(userId, 'Select service to delete:', { reply_markup: { inline_keyboard: buttons } });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data.startsWith('delete_redeem_service_') && isAdmin(userId)) {
      const serviceId = parseInt(data.split('_')[3]);
      await RedeemService.destroy({ where: { id: serviceId } });
      await bot.sendMessage(userId, 'Service deleted.');
      await showRedeemServicesAdmin(userId);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_manage_discount_codes' && isAdmin(userId)) {
      await showDiscountCodesAdmin(userId);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_add_discount_code' && isAdmin(userId)) {
      await User.update({ state: JSON.stringify({ action: 'add_discount_code', step: 'code' }) }, { where: { id: userId } });
      await bot.sendMessage(userId, await getText(userId, 'enterDiscountCodeValue'));
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_delete_discount_code' && isAdmin(userId)) {
      const codes = await DiscountCode.findAll();
      const buttons = codes.map(c => ([{ text: `${c.code} (${c.discountPercent}%)`, callback_data: `delete_discount_code_${c.id}` }]));
      buttons.push([{ text: await getText(userId, 'back'), callback_data: 'admin_manage_discount_codes' }]);
      await bot.sendMessage(userId, 'Select discount code to delete:', { reply_markup: { inline_keyboard: buttons } });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data.startsWith('delete_discount_code_') && isAdmin(userId)) {
      const codeId = parseInt(data.split('_')[3]);
      await DiscountCode.destroy({ where: { id: codeId } });
      await bot.sendMessage(userId, await getText(userId, 'discountCodeDeleted'));
      await showDiscountCodesAdmin(userId);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_edit_merchant' && isAdmin(userId)) {
      const merchants = await Merchant.findAll();
      const buttons = merchants.map(m => ([{ text: `${m.nameEn} (ID: ${m.id})`, callback_data: `edit_merchant_${m.id}` }]));
      buttons.push([{ text: '🔙 Back', callback_data: 'admin_list_merchants' }]);
      await bot.sendMessage(userId, 'Select merchant to edit:', { reply_markup: { inline_keyboard: buttons } });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data.startsWith('edit_merchant_') && isAdmin(userId)) {
      const merchantId = parseInt(data.split('_')[2]);
      await User.update({ state: JSON.stringify({ action: 'edit_merchant', merchantId, step: 'nameEn' }) }, { where: { id: userId } });
      await bot.sendMessage(userId, 'Send new English name (or /skip):');
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_delete_merchant' && isAdmin(userId)) {
      const merchants = await Merchant.findAll();
      const buttons = merchants.map(m => ([{ text: `${m.nameEn} (ID: ${m.id})`, callback_data: `delete_merchant_${m.id}` }]));
      buttons.push([{ text: '🔙 Back', callback_data: 'admin_list_merchants' }]);
      await bot.sendMessage(userId, 'Select merchant to delete:', { reply_markup: { inline_keyboard: buttons } });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data.startsWith('delete_merchant_') && isAdmin(userId)) {
      const merchantId = parseInt(data.split('_')[2]);
      await User.update({ state: JSON.stringify({ action: 'confirm_delete_merchant', merchantId }) }, { where: { id: userId } });
      await bot.sendMessage(userId, await getText(userId, 'confirmDelete'), {
        reply_markup: {
          inline_keyboard: [
            [{ text: await getText(userId, 'yes'), callback_data: `confirm_delete_merchant_yes_${merchantId}` }],
            [{ text: await getText(userId, 'no'), callback_data: 'admin_list_merchants' }]
          ]
        }
      });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data.startsWith('confirm_delete_merchant_yes_') && isAdmin(userId)) {
      const merchantId = parseInt(data.split('_')[4]);
      await Merchant.destroy({ where: { id: merchantId } });
      await bot.sendMessage(userId, await getText(userId, 'merchantDeleted'));
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_edit_category' && isAdmin(userId)) {
      const merchants = await Merchant.findAll();
      const buttons = merchants.map(m => ([{ text: `${m.nameEn} (ID: ${m.id})`, callback_data: `edit_category_${m.id}` }]));
      buttons.push([{ text: '🔙 Back', callback_data: 'admin_list_merchants' }]);
      await bot.sendMessage(userId, 'Select merchant to edit category:', { reply_markup: { inline_keyboard: buttons } });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data.startsWith('edit_category_') && isAdmin(userId)) {
      const merchantId = parseInt(data.split('_')[2]);
      await User.update({ state: JSON.stringify({ action: 'edit_category', merchantId }) }, { where: { id: userId } });
      await bot.sendMessage(userId, await getText(userId, 'askCategory'));
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_add_payment' && isAdmin(userId)) {
      await User.update({ state: JSON.stringify({ action: 'add_payment_method', step: 'nameEn' }) }, { where: { id: userId } });
      await bot.sendMessage(userId, 'Send payment method name in English:');
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_delete_payment' && isAdmin(userId)) {
      const methods = await PaymentMethod.findAll();
      const buttons = methods.map(m => ([{ text: `${m.nameEn} (ID: ${m.id})`, callback_data: `delete_payment_${m.id}` }]));
      buttons.push([{ text: '🔙 Back', callback_data: 'admin_payment_methods' }]);
      await bot.sendMessage(userId, 'Select payment method to delete:', { reply_markup: { inline_keyboard: buttons } });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data.startsWith('delete_payment_') && isAdmin(userId)) {
      const paymentId = parseInt(data.split('_')[2]);
      await PaymentMethod.destroy({ where: { id: paymentId } });
      await bot.sendMessage(userId, 'Payment method deleted.');
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_set_limits' && isAdmin(userId)) {
      const methods = await PaymentMethod.findAll();
      const buttons = methods.map(m => ([{ text: `${m.nameEn} (ID: ${m.id})`, callback_data: `set_limits_${m.id}` }]));
      buttons.push([{ text: '🔙 Back', callback_data: 'admin_payment_methods' }]);
      await bot.sendMessage(userId, 'Select payment method to set limits:', { reply_markup: { inline_keyboard: buttons } });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (data.startsWith('set_limits_') && isAdmin(userId)) {
      const methodId = parseInt(data.split('_')[2]);
      await User.update({ state: JSON.stringify({ action: 'set_limits', methodId, step: 'min' }) }, { where: { id: userId } });
      await bot.sendMessage(userId, 'Enter minimum deposit amount (USD):');
      await bot.answerCallbackQuery(query.id);
      return;
    }

    await bot.answerCallbackQuery(query.id);
  } catch (err) {
    console.error('Callback error:', err);
    await bot.answerCallbackQuery(query.id, { text: 'Error occurred' });
  }
});

// ========================
// 7. معالجة الرسائل النصية والصور
// ========================
bot.on('message', async (msg) => {
  const userId = msg.chat.id;
  const text = msg.text;
  const photo = msg.photo;
  const video = msg.video;

  try {
    const user = await User.findByPk(userId);
    if (!user) return;

    let state = user.state ? JSON.parse(user.state) : null;

    if (state && isAdmin(userId)) {
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

      if (state.action === 'set_bot_owner') {
        const ownerId = parseInt(text);
        if (isNaN(ownerId)) {
          await bot.sendMessage(userId, '❌ Invalid user ID');
        } else {
          const botService = await BotService.findByPk(state.botId);
          if (botService) {
            botService.ownerId = ownerId;
            botService.allowedActions = ['full'];
            await botService.save();
            await bot.sendMessage(userId, `✅ Granted full permissions to user ${ownerId} for bot ${botService.name}`);
          } else {
            await bot.sendMessage(userId, 'Bot not found');
          }
        }
        await User.update({ state: null }, { where: { id: userId } });
        return;
      }

      if (state.action === 'add_merchant') {
        if (state.step === 'nameEn') {
          await User.update({ state: JSON.stringify({ ...state, nameEn: text, step: 'nameAr' }) }, { where: { id: userId } });
          await bot.sendMessage(userId, await getText(userId, 'askMerchantNameAr'));
          return;
        } else if (state.step === 'nameAr') {
          await User.update({ state: JSON.stringify({ ...state, nameAr: text, step: 'price' }) }, { where: { id: userId } });
          await bot.sendMessage(userId, await getText(userId, 'askMerchantPrice'));
          return;
        } else if (state.step === 'price') {
          const price = parseFloat(text);
          if (isNaN(price)) {
            await bot.sendMessage(userId, '❌ Invalid price');
            return;
          }
          await User.update({ state: JSON.stringify({ ...state, price, step: 'type' }) }, { where: { id: userId } });
          const keyboard = {
            inline_keyboard: [
              [{ text: await getText(userId, 'typeSingle'), callback_data: 'merchant_type_single' }],
              [{ text: await getText(userId, 'typeBulk'), callback_data: 'merchant_type_bulk' }]
            ]
          };
          await bot.sendMessage(userId, await getText(userId, 'askMerchantType'), { reply_markup: keyboard });
          return;
        } else if (state.step === 'type') {
          const merchantType = state.selectedType;
          await User.update({ state: JSON.stringify({ ...state, type: merchantType, step: 'description' }) }, { where: { id: userId } });
          await bot.sendMessage(userId, await getText(userId, 'askDescription'));
          return;
        } else if (state.step === 'description') {
          let description = null;
          if (text === '/skip') {
            description = null;
          } else if (text) {
            description = { type: 'text', content: text };
          } else if (photo) {
            description = { type: 'photo', fileId: photo[photo.length - 1].file_id };
          } else if (video) {
            description = { type: 'video', fileId: video.file_id };
          }
          const merchant = await Merchant.create({
            nameEn: state.nameEn,
            nameAr: state.nameAr,
            price: state.price,
            type: state.type,
            description
          });
          await bot.sendMessage(userId, await getText(userId, 'merchantCreated', { id: merchant.id }));
          await User.update({ state: null }, { where: { id: userId } });
          await showAdminPanel(userId);
          return;
        }
      }

      if (state.action === 'set_price') {
        const price = parseFloat(text);
        if (isNaN(price)) {
          await bot.sendMessage(userId, '❌ Invalid price');
          return;
        }
        await Merchant.update({ price }, { where: { id: state.merchantId } });
        await bot.sendMessage(userId, await getText(userId, 'priceUpdated'));
        await User.update({ state: null }, { where: { id: userId } });
        await showAdminPanel(userId);
        return;
      }

      if (state.action === 'add_codes') {
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        const merchant = await Merchant.findByPk(state.merchantId);
        if (!merchant) {
          await bot.sendMessage(userId, 'Merchant not found');
          await User.update({ state: null }, { where: { id: userId } });
          return;
        }
        if (merchant.type === 'single') {
          const codes = lines.map(value => ({ value, merchantId: merchant.id, isUsed: false }));
          await Code.bulkCreate(codes);
        } else { // bulk
          if (lines.length % 2 !== 0) {
            await bot.sendMessage(userId, '❌ Bulk codes must be sent as pairs (email and password on separate lines). Please send an even number of lines.');
            return;
          }
          const pairs = [];
          for (let i = 0; i < lines.length; i += 2) {
            pairs.push({
              value: lines[i],
              extra: lines[i+1],
              merchantId: merchant.id,
              isUsed: false
            });
          }
          await Code.bulkCreate(pairs);
        }
        await bot.sendMessage(userId, await getText(userId, 'codesAdded'));
        await User.update({ state: null }, { where: { id: userId } });
        await showAdminPanel(userId);
        return;
      }

      if (state.action === 'edit_merchant') {
        const merchant = await Merchant.findByPk(state.merchantId);
        if (!merchant) {
          await bot.sendMessage(userId, 'Merchant not found');
          await User.update({ state: null }, { where: { id: userId } });
          return;
        }
        if (state.step === 'nameEn') {
          if (text !== '/skip') merchant.nameEn = text;
          await User.update({ state: JSON.stringify({ ...state, step: 'nameAr' }) }, { where: { id: userId } });
          await bot.sendMessage(userId, 'Send new Arabic name (or /skip):');
          return;
        } else if (state.step === 'nameAr') {
          if (text !== '/skip') merchant.nameAr = text;
          await User.update({ state: JSON.stringify({ ...state, step: 'price' }) }, { where: { id: userId } });
          await bot.sendMessage(userId, 'Send new price (or /skip):');
          return;
        } else if (state.step === 'price') {
          if (text !== '/skip') {
            const price = parseFloat(text);
            if (!isNaN(price)) merchant.price = price;
          }
          await merchant.save();
          await bot.sendMessage(userId, 'Merchant updated successfully.');
          await User.update({ state: null }, { where: { id: userId } });
          await showAdminPanel(userId);
          return;
        }
      }

      if (state.action === 'edit_category') {
        const merchant = await Merchant.findByPk(state.merchantId);
        if (merchant) {
          merchant.category = text;
          await merchant.save();
          await bot.sendMessage(userId, await getText(userId, 'categoryUpdated'));
        }
        await User.update({ state: null }, { where: { id: userId } });
        await showAdminPanel(userId);
        return;
      }

      if (state.action === 'add_payment_method') {
        if (state.step === 'nameEn') {
          await User.update({ state: JSON.stringify({ ...state, nameEn: text, step: 'nameAr' }) }, { where: { id: userId } });
          await bot.sendMessage(userId, 'Send name in Arabic:');
          return;
        } else if (state.step === 'nameAr') {
          await User.update({ state: JSON.stringify({ ...state, nameAr: text, step: 'details' }) }, { where: { id: userId } });
          await bot.sendMessage(userId, 'Send payment details (e.g., wallet address):');
          return;
        } else if (state.step === 'details') {
          await User.update({ state: JSON.stringify({ ...state, details: text, step: 'type' }) }, { where: { id: userId } });
          await bot.sendMessage(userId, 'Send type (manual/auto):');
          return;
        } else if (state.step === 'type') {
          const type = text.toLowerCase();
          if (type !== 'manual' && type !== 'auto') {
            await bot.sendMessage(userId, 'Type must be manual or auto');
            return;
          }
          await PaymentMethod.create({
            nameEn: state.nameEn,
            nameAr: state.nameAr,
            details: state.details,
            type,
            config: {},
            isActive: true,
            minDeposit: 1,
            maxDeposit: 10000
          });
          await bot.sendMessage(userId, 'Payment method added successfully.');
          await User.update({ state: null }, { where: { id: userId } });
          await showAdminPanel(userId);
          return;
        }
      }

      if (state.action === 'set_limits') {
        if (state.step === 'min') {
          const min = parseFloat(text);
          if (isNaN(min)) {
            await bot.sendMessage(userId, 'Invalid number');
            return;
          }
          await User.update({ state: JSON.stringify({ ...state, min, step: 'max' }) }, { where: { id: userId } });
          await bot.sendMessage(userId, 'Enter maximum deposit amount (USD):');
          return;
        } else if (state.step === 'max') {
          const max = parseFloat(text);
          if (isNaN(max)) {
            await bot.sendMessage(userId, 'Invalid number');
            return;
          }
          const method = await PaymentMethod.findByPk(state.methodId);
          if (method) {
            method.minDeposit = state.min;
            method.maxDeposit = max;
            await method.save();
            await bot.sendMessage(userId, `Limits set: Min ${state.min} USD, Max ${max} USD.`);
          } else {
            await bot.sendMessage(userId, 'Method not found');
          }
          await User.update({ state: null }, { where: { id: userId } });
          await showAdminPanel(userId);
          return;
        }
      }

      if (state.action === 'set_referral_percent') {
        const percent = parseFloat(text);
        if (isNaN(percent)) {
          await bot.sendMessage(userId, 'Invalid percentage');
          return;
        }
        process.env.REFERRAL_PERCENT = percent;
        await Setting.upsert({ key: 'referral_percent', lang: 'en', value: percent.toString() });
        await bot.sendMessage(userId, await getText(userId, 'referralPercentUpdated', { percent }));
        await User.update({ state: null }, { where: { id: userId } });
        await showAdminPanel(userId);
        return;
      }

      if (state.action === 'add_redeem_service') {
        if (state.step === 'nameEn') {
          await User.update({ state: JSON.stringify({ ...state, nameEn: text, step: 'nameAr' }) }, { where: { id: userId } });
          await bot.sendMessage(userId, await getText(userId, 'redeemServiceNameAr'));
          return;
        } else if (state.step === 'nameAr') {
          await User.update({ state: JSON.stringify({ ...state, nameAr: text, step: 'merchantDictId' }) }, { where: { id: userId } });
          await bot.sendMessage(userId, await getText(userId, 'redeemServiceMerchantId'));
          return;
        } else if (state.step === 'merchantDictId') {
          await User.update({ state: JSON.stringify({ ...state, merchantDictId: text, step: 'platformId' }) }, { where: { id: userId } });
          await bot.sendMessage(userId, await getText(userId, 'redeemServicePlatformId'));
          return;
        } else if (state.step === 'platformId') {
          const platformId = text || '1';
          await RedeemService.create({
            nameEn: state.nameEn,
            nameAr: state.nameAr,
            merchantDictId: state.merchantDictId,
            platformId
          });
          await bot.sendMessage(userId, await getText(userId, 'redeemServiceAdded'));
          await User.update({ state: null }, { where: { id: userId } });
          await showRedeemServicesAdmin(userId);
          return;
        }
      }

      if (state.action === 'add_discount_code') {
        if (state.step === 'code') {
          await User.update({ state: JSON.stringify({ ...state, code: text, step: 'percent' }) }, { where: { id: userId } });
          await bot.sendMessage(userId, await getText(userId, 'enterDiscountPercent'));
          return;
        } else if (state.step === 'percent') {
          const percent = parseInt(text);
          if (isNaN(percent) || percent < 0 || percent > 100) {
            await bot.sendMessage(userId, 'Invalid percentage (0-100)');
            return;
          }
          await User.update({ state: JSON.stringify({ ...state, percent, step: 'validUntil' }) }, { where: { id: userId } });
          await bot.sendMessage(userId, await getText(userId, 'enterDiscountValidUntil'));
          return;
        } else if (state.step === 'validUntil') {
          let validUntil = null;
          if (text !== '/skip') {
            const date = new Date(text);
            if (isNaN(date.getTime())) {
              await bot.sendMessage(userId, 'Invalid date format. Use YYYY-MM-DD or /skip.');
              return;
            }
            validUntil = date;
          }
          await User.update({ state: JSON.stringify({ ...state, validUntil, step: 'maxUses' }) }, { where: { id: userId } });
          await bot.sendMessage(userId, await getText(userId, 'enterDiscountMaxUses'));
          return;
        } else if (state.step === 'maxUses') {
          const maxUses = parseInt(text);
          if (isNaN(maxUses) || maxUses < 1) {
            await bot.sendMessage(userId, 'Invalid max uses (minimum 1)');
            return;
          }
          await DiscountCode.create({
            code: state.code,
            discountPercent: state.percent,
            validUntil: state.validUntil,
            maxUses,
            usedCount: 0,
            createdBy: userId
          });
          await bot.sendMessage(userId, await getText(userId, 'discountCodeAdded'));
          await User.update({ state: null }, { where: { id: userId } });
          await showDiscountCodesAdmin(userId);
          return;
        }
      }
    }

    // معالجة الدعم
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

    // معالجة كود الخصم
    if (state && state.action === 'discount') {
      const discountCode = text.trim();
      const discount = await DiscountCode.findOne({ where: { code: discountCode } });
      if (discount && (discount.validUntil === null || discount.validUntil > new Date()) && discount.usedCount < discount.maxUses) {
        await User.update({ state: JSON.stringify({ action: 'discount_applied', discountCode }) }, { where: { id: userId } });
        await bot.sendMessage(userId, await getText(userId, 'discountApplied', { percent: discount.discountPercent }));
        await sendMainMenu(userId);
      } else {
        await bot.sendMessage(userId, await getText(userId, 'discountInvalid'));
        await sendMainMenu(userId);
      }
      await User.update({ state: null }, { where: { id: userId } });
      return;
    }

    // معالجة الشراء
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
      let discountCode = null;
      if (user.state && user.state.includes('discount_applied')) {
        const stateObj = JSON.parse(user.state);
        discountCode = stateObj.discountCode;
      }
      const result = await processPurchase(userId, merchant.id, qty, discountCode);
      if (result.success) {
        let msg = await getText(userId, 'success');
        if (result.discountApplied) {
          msg += `\n🎟️ Discount applied: ${result.discountApplied}%`;
        }
        msg += `\n\n${result.codes}`;
        await bot.sendMessage(userId, msg);
        const userObj = await User.findByPk(userId);
        if (userObj.referredBy) {
          const rewardAmount = (merchant.price * qty) * (process.env.REFERRAL_PERCENT || 10) / 100;
          await BalanceTransaction.create({
            userId: userObj.referredBy,
            amount: rewardAmount,
            type: 'referral',
            status: 'completed'
          });
          const referrer = await User.findByPk(userObj.referredBy);
          await User.update({ balance: parseFloat(referrer.balance) + rewardAmount }, { where: { id: referrer.id } });
          await bot.sendMessage(referrer.id, await getText(referrer.id, 'referralEarned', { amount: rewardAmount }));
        }
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
      await showPaymentMethodsForDeposit(userId, amount);
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

    // معالجة الاسترداد (خدمات الاسترداد)
    if (state && state.action === 'redeem_via_service') {
      const serviceId = state.serviceId;
      const service = await RedeemService.findByPk(serviceId);
      if (!service) {
        await bot.sendMessage(userId, 'Service not found');
        await sendMainMenu(userId);
        await User.update({ state: null }, { where: { id: userId } });
        return;
      }
      const cardCode = text.trim();
      const waitingMsg = await bot.sendMessage(userId, await getText(userId, 'processing'));
      const result = await redeemCard(cardCode, service.merchantDictId, service.platformId);
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
// 8. API للبوتات الأخرى
// ========================
app.post('/api/code', async (req, res) => {
  try {
    const { token, card_key, merchant_dict_id, platform_id } = req.body;
    const botService = await BotService.findOne({ where: { token, isActive: true } });
    if (!botService || !botService.allowedActions.includes('code')) {
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
// 9. جدولة المهام باستخدام setInterval (بديل عن node-cron)
// ========================
setInterval(async () => {
  try {
    const now = new Date();
    const updated = await Code.update(
      { isUsed: true },
      { where: { expiresAt: { [Sequelize.Op.lt]: now }, isUsed: false } }
    );
    if (updated[0] > 0) {
      console.log(`✅ Expired codes marked as used: ${updated[0]} codes`);
    }
  } catch (err) {
    console.error('Error cleaning expired codes:', err);
  }
}, 24 * 60 * 60 * 1000);

// ========================
// 10. تشغيل الخادم ومزامنة قاعدة البيانات
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

// ========================
// 11. معالجة اختيار نوع التاجر عبر callback
// ========================
bot.on('callback_query', async (query) => {
  const data = query.data;
  if (data === 'merchant_type_single' || data === 'merchant_type_bulk') {
    const userId = query.message.chat.id;
    const user = await User.findByPk(userId);
    if (user && user.state) {
      let state = JSON.parse(user.state);
      if (state.action === 'add_merchant' && state.step === 'type') {
        const selectedType = data === 'merchant_type_single' ? 'single' : 'bulk';
        await User.update({ state: JSON.stringify({ ...state, selectedType, step: 'description' }) }, { where: { id: userId } });
        await bot.sendMessage(userId, await getText(userId, 'askDescription'));
        await bot.answerCallbackQuery(query.id);
        return;
      }
    }
  }
});

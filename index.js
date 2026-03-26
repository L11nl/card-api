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
const WALLET = process.env.WALLET; // قد لا نحتاجه إذا كانت طرق الدفع تحتوي على عناوين خاصة
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
  state: { type: DataTypes.TEXT, allowNull: true }
});

// نموذج الخدمات (التجار)
const Merchant = sequelize.define('Merchant', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  nameEn: { type: DataTypes.STRING, allowNull: false },
  nameAr: { type: DataTypes.STRING, allowNull: false },
  price: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 }
});

// نموذج طرق الدفع
const PaymentMethod = sequelize.define('PaymentMethod', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  merchantId: { type: DataTypes.INTEGER, references: { model: Merchant, key: 'id' } },
  nameEn: { type: DataTypes.STRING, allowNull: false },     // مثلاً "USDT (TRC20)"
  nameAr: { type: DataTypes.STRING, allowNull: false },     // مثلاً "USDT (TRC20)"
  details: { type: DataTypes.TEXT, allowNull: false }       // تفاصيل الدفع (عنوان المحفظة، رقم الحساب، إلخ)
});

// نموذج الأكواد (المخزون)
const Code = sequelize.define('Code', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  value: { type: DataTypes.TEXT, allowNull: false },
  merchantId: { type: DataTypes.INTEGER, references: { model: Merchant, key: 'id' } },
  isUsed: { type: DataTypes.BOOLEAN, defaultValue: false },
  usedBy: { type: DataTypes.BIGINT, allowNull: true },
  soldAt: { type: DataTypes.DATE, allowNull: true }
});

// نموذج المعاملات
const Transaction = sequelize.define('Transaction', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  txid: { type: DataTypes.STRING, unique: true, allowNull: false },
  userId: { type: DataTypes.BIGINT, allowNull: false },
  merchantId: { type: DataTypes.INTEGER, allowNull: false },
  paymentMethodId: { type: DataTypes.INTEGER, allowNull: false },
  amount: { type: DataTypes.FLOAT, allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: 'pending' }
});

// العلاقات
Merchant.hasMany(PaymentMethod, { foreignKey: 'merchantId', onDelete: 'CASCADE' });
PaymentMethod.belongsTo(Merchant);
Merchant.hasMany(Code, { foreignKey: 'merchantId' });
Code.belongsTo(Merchant);
User.hasMany(Transaction);
Transaction.belongsTo(Merchant);
Transaction.belongsTo(PaymentMethod);

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
    choosePaymentMethod: '💳 Choose payment method:',
    pay: '💰 Send payment to:',
    sendTx: '🔗 Send TXID (transaction ID) after payment:',
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
    selectMerchantForPayment: 'Select merchant for payment method:',
    enterPaymentNameEn: 'Send payment method name in English:',
    enterPaymentNameAr: 'Send payment method name in Arabic:',
    enterPaymentDetails: 'Send payment details (address, account, etc.):',
    paymentMethodAdded: '✅ Payment method added!',
    paymentMethodDeleted: '🗑️ Payment method deleted!',
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
    selectMerchantForPaymentMethods: 'Select merchant to manage payment methods:',
    selectPaymentMethodToDelete: 'Select payment method to delete:'
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
    choosePaymentMethod: '💳 اختر طريقة الدفع:',
    pay: '💰 قم بالتحويل إلى:',
    sendTx: '🔗 أرسل TXID بعد الدفع:',
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
    selectMerchantForPayment: 'اختر التاجر لإدارة طرق الدفع:',
    enterPaymentNameEn: 'أرسل اسم طريقة الدفع بالإنجليزية:',
    enterPaymentNameAr: 'أرسل اسم طريقة الدفع بالعربية:',
    enterPaymentDetails: 'أرسل تفاصيل الدفع (العنوان، رقم الحساب، إلخ):',
    paymentMethodAdded: '✅ تمت إضافة طريقة الدفع!',
    paymentMethodDeleted: '🗑️ تم حذف طريقة الدفع!',
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
    selectMerchantForPaymentMethods: 'اختر التاجر لإدارة طرق الدفع:',
    selectPaymentMethodToDelete: 'اختر طريقة الدفع لحذفها:'
  }
};

// ========================
// 4. دوال مساعدة
// ========================

async function getLang(userId) {
  const user = await User.findByPk(userId);
  return user ? user.lang : 'en';
}

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

// دالة عرض طرق الدفع للتاجر
async function showPaymentMethods(userId, merchantId, qty, total) {
  const lang = await getLang(userId);
  const t = T[lang];
  const methods = await PaymentMethod.findAll({ where: { merchantId } });
  if (methods.length === 0) {
    await bot.sendMessage(userId, t.noPaymentMethods);
    return sendMainMenu(userId);
  }
  const buttons = methods.map(m => ([{
    text: lang === 'en' ? m.nameEn : m.nameAr,
    callback_data: `pay_method_${m.id}_${merchantId}_${qty}_${total}`
  }]));
  buttons.push([{ text: t.back, callback_data: 'back_to_menu' }]);
  await bot.sendMessage(userId, t.choosePaymentMethod, { reply_markup: { inline_keyboard: buttons } });
}

// التحقق من الدفع (يمكن تخصيصه حسب طريقة الدفع، لكن هنا نكتفي بالتحقق من TXID على TronScan)
async function checkPayment(txid, expectedAmount) {
  try {
    const res = await axios.get(`https://apilist.tronscan.org/api/transaction-info?hash=${txid}`);
    if (!res.data || !res.data.toAddress) return false;
    const to = res.data.toAddress;
    const value = res.data.amount / 1e6;
    // في هذا المثال، نتحقق فقط من المبلغ ونتجاهل العنوان لأننا سنستخدم عنوان محفظة ثابت
    // ولكن يمكن تعديلها لقراءة العنوان من طريقة الدفع المختارة
    // هنا نفترض أن عنوان المحفظة هو WALLET (من env) أو يمكن جعله جزءًا من تفاصيل طريقة الدفع
    return value >= expectedAmount;
  } catch (error) {
    console.error('Error checking payment:', error.message);
    return false;
  }
}

async function showAdminPanel(userId) {
  const lang = await getLang(userId);
  const t = T[lang];
  const keyboard = {
    inline_keyboard: [
      [{ text: t.addMerchant, callback_data: 'admin_add_merchant' }],
      [{ text: t.listMerchants, callback_data: 'admin_list_merchants' }],
      [{ text: t.setPrice, callback_data: 'admin_set_price' }],
      [{ text: t.addCodes, callback_data: 'admin_add_codes' }],
      [{ text: t.paymentMethods, callback_data: 'admin_payment_methods' }],
      [{ text: t.stats, callback_data: 'admin_stats' }],
      [{ text: t.back, callback_data: 'back_to_menu' }]
    ]
  };
  await bot.sendMessage(userId, t.adminPanel, { reply_markup: keyboard });
}

// ========================
// 5. أوامر البوت
// ========================
bot.onText(/\/start/, async (msg) => {
  const userId = msg.chat.id;
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

bot.onText(/\/admin/, async (msg) => {
  const userId = msg.chat.id;
  if (userId !== ADMIN_ID) return;
  await showAdminPanel(userId);
});

// ========================
// 6. معالجة callback_query
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

  if (data === 'back_to_menu') {
    await sendMainMenu(userId);
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'admin' && userId === ADMIN_ID) {
    await showAdminPanel(userId);
    await bot.answerCallbackQuery(query.id);
    return;
  }

  // --- عمليات الأدمن ---
  if (data === 'admin_add_merchant' && userId === ADMIN_ID) {
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

  // إدارة طرق الدفع
  if (data === 'admin_payment_methods' && userId === ADMIN_ID) {
    const merchants = await Merchant.findAll();
    if (merchants.length === 0) {
      await bot.sendMessage(userId, '❌ No merchants available.');
      await bot.answerCallbackQuery(query.id);
      return;
    }
    const lang = await getLang(userId);
    const buttons = merchants.map(m => ([{
      text: lang === 'en' ? m.nameEn : m.nameAr,
      callback_data: `admin_paymethods_merchant_${m.id}`
    }]));
    buttons.push([{ text: T[lang].back, callback_data: 'admin' }]);
    await bot.sendMessage(userId, T[lang].selectMerchantForPaymentMethods, { reply_markup: { inline_keyboard: buttons } });
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith('admin_paymethods_merchant_') && userId === ADMIN_ID) {
    const merchantId = parseInt(data.split('_')[3]);
    const lang = await getLang(userId);
    const methods = await PaymentMethod.findAll({ where: { merchantId } });
    let methodsText = '';
    if (methods.length) {
      methodsText = methods.map(m => `ID: ${m.id} | ${lang === 'en' ? m.nameEn : m.nameAr}\n${m.details}\n`).join('\n');
    } else {
      methodsText = T[lang].noPaymentMethods;
    }
    const buttons = [
      [{ text: T[lang].addPaymentMethod, callback_data: `admin_addpaymethod_${merchantId}` }],
      ...(methods.length ? [[{ text: T[lang].deletePaymentMethod, callback_data: `admin_delpaymethod_${merchantId}` }]] : []),
      [{ text: T[lang].back, callback_data: 'admin_payment_methods' }]
    ];
    await bot.sendMessage(userId, `${T[lang].paymentMethods}:\n${methodsText}`, { reply_markup: { inline_keyboard: buttons } });
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith('admin_addpaymethod_') && userId === ADMIN_ID) {
    const merchantId = parseInt(data.split('_')[2]);
    await User.update({ state: JSON.stringify({ action: 'add_payment_method', merchantId, step: 'nameEn' }) }, { where: { id: userId } });
    await bot.sendMessage(userId, T[await getLang(userId)].enterPaymentNameEn);
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith('admin_delpaymethod_') && userId === ADMIN_ID) {
    const merchantId = parseInt(data.split('_')[2]);
    const methods = await PaymentMethod.findAll({ where: { merchantId } });
    if (methods.length === 0) {
      await bot.sendMessage(userId, T[await getLang(userId)].noPaymentMethods);
      await bot.answerCallbackQuery(query.id);
      return;
    }
    const lang = await getLang(userId);
    const buttons = methods.map(m => ([{
      text: lang === 'en' ? m.nameEn : m.nameAr,
      callback_data: `admin_delpaymethod_confirm_${m.id}`
    }]));
    buttons.push([{ text: T[lang].back, callback_data: `admin_paymethods_merchant_${merchantId}` }]);
    await bot.sendMessage(userId, T[lang].selectPaymentMethodToDelete, { reply_markup: { inline_keyboard: buttons } });
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith('admin_delpaymethod_confirm_') && userId === ADMIN_ID) {
    const methodId = parseInt(data.split('_')[3]);
    await PaymentMethod.destroy({ where: { id: methodId } });
    await bot.sendMessage(userId, T[await getLang(userId)].paymentMethodDeleted);
    // العودة إلى قائمة طرق الدفع للتاجر
    const method = await PaymentMethod.findByPk(methodId);
    if (method) {
      // لا حاجة، فقط نرسل رسالة
    }
    await bot.answerCallbackQuery(query.id);
    // نعيد عرض إدارة طرق الدفع للتاجر الذي ينتمي إليه
    const methodRecord = await PaymentMethod.findByPk(methodId);
    if (methodRecord) {
      const merchantId = methodRecord.merchantId;
      // محاكاة الضغط على admin_paymethods_merchant_*
      const fakeData = `admin_paymethods_merchant_${merchantId}`;
      // نستدعي المعالج يدوياً (أو نرسل رد)
      await bot.emit('callback_query', { ...query, data: fakeData });
    } else {
      await bot.answerCallbackQuery(query.id);
    }
    return;
  }

  // --- عمليات الشراء (اختيار التاجر) ---
  if (data.startsWith('buy_merchant_')) {
    const merchantId = parseInt(data.split('_')[2]);
    const lang = await getLang(userId);
    const available = await Code.count({ where: { merchantId, isUsed: false } });
    if (available === 0) {
      await bot.sendMessage(userId, T[lang].noCodes);
      await sendMainMenu(userId);
      await bot.answerCallbackQuery(query.id);
      return;
    }
    await User.update({ state: JSON.stringify({ action: 'buy', merchantId }) }, { where: { id: userId } });
    await bot.sendMessage(userId, `${T[lang].enterQty}\n📦 Available: ${available}`);
    await bot.answerCallbackQuery(query.id);
    return;
  }

  // --- اختيار طريقة الدفع ---
  if (data.startsWith('pay_method_')) {
    const parts = data.split('_');
    const methodId = parseInt(parts[2]);
    const merchantId = parseInt(parts[3]);
    const qty = parseInt(parts[4]);
    const total = parseFloat(parts[5]);
    const method = await PaymentMethod.findByPk(methodId);
    if (!method) {
      await bot.sendMessage(userId, T[await getLang(userId)].error);
      return sendMainMenu(userId);
    }
    const lang = await getLang(userId);
    // حفظ الحالة مع تفاصيل الدفع
    await User.update({ state: JSON.stringify({ action: 'awaiting_tx', merchantId, qty, total, paymentMethodId: methodId }) }, { where: { id: userId } });
    const details = method.details;
    await bot.sendMessage(userId, `${T[lang].pay}\n\n${details}\n\n${T[lang].sendTx}`);
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
        await bot.sendMessage(userId, t.askMerchantNameAr);
        return;
      } else if (state.step === 'nameAr') {
        await User.update({ state: JSON.stringify({ ...state, step: 'price', nameAr: text }) }, { where: { id: userId } });
        await bot.sendMessage(userId, t.askMerchantPrice);
        return;
      } else if (state.step === 'price') {
        const price = parseFloat(text);
        if (isNaN(price)) {
          await bot.sendMessage(userId, '❌ Invalid price.');
          await User.update({ state: null }, { where: { id: userId } });
          return;
        }
        const merchant = await Merchant.create({ nameEn: state.nameEn, nameAr: state.nameAr, price });
        await bot.sendMessage(userId, t.merchantCreated.replace('{id}', merchant.id));
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
      await bot.sendMessage(userId, t.priceUpdated);
      await User.update({ state: null }, { where: { id: userId } });
      await showAdminPanel(userId);
      return;
    }

    if (state.action === 'add_codes') {
      const codes = text.split(/\s+/).filter(c => c.trim().length > 0);
      if (codes.length === 0) {
        await bot.sendMessage(userId, '❌ No codes found.');
        await User.update({ state: null }, { where: { id: userId } });
        return;
      }
      const codesToInsert = codes.map(code => ({ value: code, merchantId: state.merchantId, isUsed: false }));
      await Code.bulkCreate(codesToInsert);
      await bot.sendMessage(userId, `${t.codesAdded}\nAdded ${codes.length} codes.`);
      await User.update({ state: null }, { where: { id: userId } });
      await showAdminPanel(userId);
      return;
    }

    if (state.action === 'add_payment_method') {
      if (state.step === 'nameEn') {
        await User.update({ state: JSON.stringify({ ...state, step: 'nameAr', nameEn: text }) }, { where: { id: userId } });
        await bot.sendMessage(userId, t.enterPaymentNameAr);
        return;
      } else if (state.step === 'nameAr') {
        await User.update({ state: JSON.stringify({ ...state, step: 'details', nameAr: text }) }, { where: { id: userId } });
        await bot.sendMessage(userId, t.enterPaymentDetails);
        return;
      } else if (state.step === 'details') {
        await PaymentMethod.create({
          merchantId: state.merchantId,
          nameEn: state.nameEn,
          nameAr: state.nameAr,
          details: text
        });
        await bot.sendMessage(userId, t.paymentMethodAdded);
        await User.update({ state: null }, { where: { id: userId } });
        await showAdminPanel(userId);
        return;
      }
    }
  }

  // --- معالجة الشراء (إدخال الكمية) ---
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
    // عرض طرق الدفع المتاحة لهذا التاجر
    await showPaymentMethods(userId, merchant.id, qty, total);
    // لا نغير الحالة هنا لأننا سننتظر اختيار طريقة الدفع
    // الحالة ستتغير عند اختيار المستخدم لطريقة الدفع
    // نقوم بتخزين البيانات مؤقتاً في حالة منفصلة؟
    // سنقوم بتخزينها في state مع buy، ثم عند اختيار طريقة الدفع نغير الحالة إلى awaiting_tx
    await User.update({ state: JSON.stringify({ action: 'buy_selected', merchantId: merchant.id, qty, total }) }, { where: { id: userId } });
    return;
  }

  // --- معالجة TXID (بعد اختيار طريقة الدفع) ---
  if (state && state.action === 'awaiting_tx') {
    const txid = text.trim();
    const { merchantId, qty, total, paymentMethodId } = state;

    const existingTx = await Transaction.findOne({ where: { txid } });
    if (existingTx) {
      await bot.sendMessage(userId, '❌ This transaction ID has already been used.');
      return;
    }

    const waitingMsg = await bot.sendMessage(userId, t.checking);
    const valid = await checkPayment(txid, total);

    if (!valid) {
      await bot.editMessageText(t.invalidTx, { chat_id: userId, message_id: waitingMsg.message_id });
      return;
    }

    // تسجيل المعاملة
    const transaction = await Transaction.create({
      txid,
      userId,
      merchantId,
      paymentMethodId,
      amount: total,
      quantity: qty,
      status: 'completed'
    });

    // استخراج الأكواد
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
    await Code.update({ isUsed: true, usedBy: userId, soldAt: new Date() }, { where: { id: codes.map(c => c.id) } });
    await bot.editMessageText(`${t.success}\n\n${codesList}`, { chat_id: userId, message_id: waitingMsg.message_id });
    await User.update({ state: null }, { where: { id: userId } });
    await sendMainMenu(userId);
    return;
  }

  // --- معالجة الاسترداد ---
  if (state && state.action === 'redeem') {
    const merchantId = state.merchantId;
    const cardCode = text.trim();
    const waitingMsg = await bot.sendMessage(userId, t.processing);

    try {
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
  const PORT = process.env.PORT || 3000;
  app.get('/', (req, res) => res.send('Bot is running'));
  app.listen(PORT, () => console.log(`🚀 Server started on port ${PORT}`));
}).catch(err => {
  console.error('Database error:', err);
  process.exit(1);
});

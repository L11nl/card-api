const T = require("../data/texts");
const merchants = require("../data/merchants");
const { userLang, userState, codes } = require("../data/state");

function menu(bot, id) {
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

function showMerchants(bot, id) {
  const lang = userLang[id];
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

function registerCallbacks(bot) {
  bot.on("callback_query", async (q) => {
    const id = q.message.chat.id;
    const data = q.data;

    if (data.startsWith("lang_")) {
      userLang[id] = data.split("_")[1];
      return menu(bot, id);
    }

    if (data === "redeem") {
      userState[id] = "redeem";
      return showMerchants(bot, id);
    }

    if (data === "buy") {
      const lang = userLang[id];
      return bot.sendMessage(id, `${T[lang].enterQty}\n📦 Stock: ${codes.length}`);
    }

    if (data.startsWith("merchant_")) {
      const merchant = data.split("_")[1];
      userState[id] = { redeem: merchant };

      const lang = userLang[id];
      return bot.sendMessage(id, T[lang].sendCard);
    }
  });
}

module.exports = registerCallbacks;

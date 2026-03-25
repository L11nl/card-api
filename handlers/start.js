const T = require("../data/texts");
const { userLang } = require("../data/state");

function registerStart(bot) {
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
}

module.exports = registerStart;

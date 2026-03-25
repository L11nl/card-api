const T = require("../data/texts");
const { ADMIN_ID, PRICE, WALLET } = require("../config/env");
const { userLang, userState, pendingBuy, codes } = require("../data/state");
const { checkPayment } = require("../services/payment");

function registerMessages(bot) {
  bot.on("message", async (msg) => {
    const id = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith("/")) return;

    const lang = userLang[id];
    const t = T[lang];

    if (!isNaN(text) && codes.length > 0) {
      const qty = parseInt(text, 10);

      if (qty > codes.length) {
        return bot.sendMessage(id, `❌ Only ${codes.length} available`);
      }

      const total = qty * PRICE;
      pendingBuy[id] = { qty, total };

      return bot.sendMessage(
        id,
`${t.pay}

💵 ${total} USDT
📍 ${WALLET}

${t.sendTx}`
      );
    }

    if (pendingBuy[id] && text.length > 20) {
      const wait = await bot.sendMessage(id, t.checking);

      const ok = await checkPayment(text, pendingBuy[id].total);

      if (!ok) {
        return bot.editMessageText(t.error, {
          chat_id: id,
          message_id: wait.message_id
        });
      }

      let result = "";

      for (let i = 0; i < pendingBuy[id].qty; i++) {
        result += codes.pop() + "\n";
      }

      pendingBuy[id] = null;

      return bot.editMessageText("✅ Codes:\n\n" + result, {
        chat_id: id,
        message_id: wait.message_id
      });
    }

    if (userState[id]?.redeem) {
      const wait = await bot.sendMessage(id, t.processing);

      const params = new URLSearchParams();
      params.append("card_key", text);
      params.append("merchant_dict_id", userState[id].redeem);
      params.append("platform_id", "1");

      try {
        const axios = require("axios");
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

        bot.sendMessage(
          id,
`💳 CARD

${c.card_number}
CVV: ${c.cvv}
EXP: ${c.exp}

💰 ${c.available_amount}
🏪 ${c.merchant_name}`
        );
      } catch {
        bot.sendMessage(id, t.error);
      }
    }

    if (id === ADMIN_ID && text.startsWith("add_code")) {
      const code = text.split(" ")[1];
      codes.push(code);
      bot.sendMessage(id, "✅ Code added");
    }
  });
}

module.exports = registerMessages;

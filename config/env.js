module.exports = {
  TOKEN: process.env.BOT_TOKEN || process.env.TOKEN,
  WALLET: process.env.WALLET || "PUT_TRC20_ADDRESS",
  ADMIN_ID: Number(process.env.ADMIN_ID || 643309456),
  PORT: Number(process.env.PORT || 3000),
  PRICE: Number(process.env.PRICE || 2.5)
};

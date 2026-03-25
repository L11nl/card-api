const axios = require("axios");
const { WALLET } = require("../config/env");

async function checkPayment(txid, amount) {
  try {
    const res = await axios.get(
      `https://apilist.tronscan.org/api/transaction-info?hash=${txid}`
    );

    if (!res.data) return false;

    const to = res.data.toAddress;
    const value = res.data.amount / 1e6;

    return to === WALLET && value >= amount;
  } catch {
    return false;
  }
}

module.exports = {
  checkPayment
};

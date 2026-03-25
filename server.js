require("dotenv").config();

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { TOKEN, PORT } = require("./config/env");

const registerStart = require("./handlers/start");
const registerCallbacks = require("./handlers/callbacks");
const registerMessages = require("./handlers/messages");

if (!TOKEN) {
  throw new Error("BOT_TOKEN or TOKEN is missing");
}

const app = express();
app.use(express.json());

const bot = new TelegramBot(TOKEN, { polling: true });

registerStart(bot);
registerCallbacks(bot);
registerMessages(bot);

app.get("/", (req, res) => res.send("🔥 BOT RUNNING"));

app.listen(PORT, () => {
  console.log(`🚀 Started on port ${PORT}`);
});

import sqlite3
import requests
import asyncio
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ApplicationBuilder, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes

TOKEN = "2006778841:AAEGzMAkfk_CtdAvgK-M5pPx8wJlXMqhzEI"
API = "https://api.node-card.com/api/open/card/redeem"

# ===== DATABASE =====
def db():
    return sqlite3.connect("bot.db")

def init_db():
    conn = db()
    conn.execute("CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, lang TEXT)")
    conn.commit()
    conn.close()

def set_lang(uid, lang):
    conn = db()
    conn.execute("INSERT OR REPLACE INTO users VALUES (?,?)", (uid, lang))
    conn.commit()
    conn.close()

def get_lang(uid):
    conn = db()
    row = conn.execute("SELECT lang FROM users WHERE id=?", (uid,)).fetchone()
    conn.close()
    return row[0] if row else "en"

# ===== TEXTS =====
T = {
    "en": {
        "menu": "Choose service:",
        "send": "Send card code:",
        "wait": "⏳ Processing",
        "done": "✅ Done",
        "error": "❌ Error",
        "lang": "🌍 Change Language"
    },
    "ar": {
        "menu": "اختر الخدمة:",
        "send": "✍️ ارسل كود البطاقة:",
        "wait": "⏳ جاري المعالجة",
        "done": "✅ تم بنجاح",
        "error": "❌ خطأ",
        "lang": "🌍 تغيير اللغة"
    }
}

# ===== START =====
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    kb = [
        [
            InlineKeyboardButton("🇺🇸 English", callback_data="lang_en"),
            InlineKeyboardButton("🇮🇶 العربية", callback_data="lang_ar")
        ]
    ]
    await update.message.reply_text("🌍 Choose Language", reply_markup=InlineKeyboardMarkup(kb))

# ===== MENU =====
async def menu(chat_id, context, uid):
    lang = get_lang(uid)
    t = T[lang]

    kb = [
        [InlineKeyboardButton("Spotify", callback_data="m_4")],
        [InlineKeyboardButton("YouTube", callback_data="m_5")],
        [InlineKeyboardButton("ChatGPT", callback_data="m_6")],
        [InlineKeyboardButton("Amazon", callback_data="m_7")],
        [InlineKeyboardButton(t["lang"], callback_data="change_lang")]
    ]

    await context.bot.send_message(chat_id, t["menu"], reply_markup=InlineKeyboardMarkup(kb))

# ===== BUTTONS =====
async def buttons(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    uid = q.from_user.id
    data = q.data
    await q.answer()

    if data.startswith("lang_"):
        lang = data.split("_")[1]
        set_lang(uid, lang)
        await menu(uid, context, uid)

    elif data == "change_lang":
        await start(update, context)

    elif data.startswith("m_"):
        context.user_data["merchant"] = data.split("_")[1]
        lang = get_lang(uid)
        await q.message.reply_text(T[lang]["send"])

# ===== MESSAGE =====
async def handle(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    text = update.message.text

    if "merchant" not in context.user_data:
        return

    lang = get_lang(uid)
    t = T[lang]

    msg = await update.message.reply_text(t["wait"])

    # ⏳ أنيميشن
    for i in range(3):
        await asyncio.sleep(0.5)
        await msg.edit_text(t["wait"] + "." * (i+1))

    try:
        res = requests.post(API, data={
            "card_key": text,
            "merchant_dict_id": context.user_data["merchant"],
            "platform_id": 1
        }).json()

        if res["code"] != 1:
            await msg.edit_text("❌ " + res["msg"])
            return

        d = res["data"]

        result = f"""
💳 CARD INFO

🔢 {d['card_number']}
🔐 CVV: {d['cvv']}
📅 EXP: {d['exp']}

💰 {d['available_amount']}
🏪 {d['merchant_name']}
"""

        await msg.edit_text(result)

    except:
        await msg.edit_text(t["error"])

# ===== MAIN =====
def main():
    init_db()
    app = ApplicationBuilder().token(TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(buttons))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle))

    print("🔥 BOT RUNNING")
    app.run_polling()

if __name__ == "__main__":
    main()

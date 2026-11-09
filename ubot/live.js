// Live Chat: pelanggan menekan butang "Live Chat" di /start dan menulis terus kepada Head Owner (owner pertama dalam
// config.json "owner_ids", atau "live_chat_id"). Owner menjawab dengan BALAS (reply) mesej yang diterima; bot menghantar
// jawapan itu kepada pelanggan. Semua notis ialah kad Rich + emoji premium.
const db = require("./db");
const { cfg, tg, esc, btn } = require("./core");
const { card, sendCard, E } = require("./botui");

const IDLE = 15 * 60 * 1000; // keluar daripada mod live selepas 15 minit tanpa mesej
const live = new Map(); // userId -> masa mesej terakhir
const MAP_KEY = "live_map"; // `${chatId}:${messageId}` (mesej di owner) -> userId pelanggan

const headOwner = () => String(cfg.live_chat_id || (Array.isArray(cfg.owner_ids) && cfg.owner_ids[0]) || cfg.owner_id || "");
const fullName = (u) => [u.first_name, u.last_name].filter(Boolean).join(" ") || "-";
const who = (u) => (u.username ? `<a href="https://t.me/${esc(u.username)}">@${esc(u.username)}</a>` : esc(fullName(u)));

function remember(chatId, messageId, userId) {
  const m = db.getSetting(MAP_KEY) || {};
  m[`${chatId}:${messageId}`] = String(userId);
  const keys = Object.keys(m);
  if (keys.length > 800) for (const k of keys.slice(0, keys.length - 800)) delete m[k];
  db.setSetting(MAP_KEY, m);
}
const lookup = (chatId, messageId) => (db.getSetting(MAP_KEY) || {})[`${chatId}:${messageId}`] || null;
const active = (uid) => live.has(String(uid)) && Date.now() - live.get(String(uid)) < IDLE;

const stopKb = (fancy) => [[btn(fancy, "Tamat Live Chat", "lv:x", "danger", E.no)]];

function register(bot) {
  const isPrivate = (ctx) => ctx.chat && ctx.chat.type === "private";

  async function start(chatId, uid) {
    const head = headOwner();
    if (!head) {
      return sendCard(chatId, card({ title: "Live Chat Tidak Tersedia", icon: "fire", rows: [["no", "Sebab", "Head Owner belum ditetapkan"]] }));
    }
    if (String(uid) === head) {
      return sendCard(chatId, card({ title: "Live Chat", icon: "info", rows: [["crown", "Anda Head Owner", "Balas (reply) mesej pelanggan untuk menjawab"]] }));
    }
    live.set(String(uid), Date.now());
    await sendCard(chatId, card({
      title: "Live Chat Aktif", icon: "mega",
      rows: [["user", "Penerima", "<b>Head Owner</b>"], ["time", "Tamat automatik", "15 minit tanpa mesej"]],
      checks: [[true, "Mod live dihidupkan"], [false, "Tulis mesej anda sekarang (teks / gambar / fail)"]],
      note: "Tekan <b>Tamat Live Chat</b> atau hantar <code>/stoplive</code> apabila selesai.",
    }), stopKb);
  }

  bot.callbackQuery("live", async (ctx) => {
    await ctx.answerCallbackQuery();
    const m = ctx.callbackQuery.message;
    if (m && m.chat.type === "private") await start(m.chat.id, ctx.from.id);
  });
  bot.command("live", async (ctx) => {
    if (isPrivate(ctx)) await start(ctx.chat.id, ctx.from.id);
  });

  async function stop(chatId, uid) {
    const was = live.delete(String(uid));
    await sendCard(chatId, card({
      title: was ? "Live Chat Ditamatkan" : "Live Chat Tidak Aktif", icon: was ? "ok" : "info",
      rows: [["ok", "Status", was ? "Mod live ditamatkan" : "Anda tidak berada dalam mod live"]],
      note: "Tekan <b>Live Chat</b> di /start untuk menghubungi Head Owner semula.",
    }));
  }
  bot.callbackQuery("lv:x", async (ctx) => {
    await ctx.answerCallbackQuery();
    const m = ctx.callbackQuery.message;
    if (m) await stop(m.chat.id, ctx.from.id);
  });
  bot.command("stoplive", async (ctx) => {
    if (isPrivate(ctx)) await stop(ctx.chat.id, ctx.from.id);
  });

  // Semua mesej peribadi: (a) jawapan Head Owner -> pelanggan, (b) mesej pelanggan dalam mod live -> Head Owner
  bot.on("message", async (ctx, next) => {
    if (!isPrivate(ctx)) return next();
    const msg = ctx.message;
    const uid = String(ctx.from.id);
    const head = headOwner();

    // (a) Head Owner membalas mesej yang dipetakan
    if (uid === head && msg.reply_to_message) {
      const target = lookup(ctx.chat.id, msg.reply_to_message.message_id);
      if (!target) return next();
      try {
        if (msg.text) {
          await sendCard(target, card({
            title: "Balasan Head Owner", icon: "crown",
            extra: `<blockquote>${esc(msg.text).replace(/\n/g, "<br>")}</blockquote>`,
            note: "Balas dengan menulis terus di sini (mod Live Chat masih aktif).",
          }), stopKb);
        } else {
          await tg("copyMessage", { chat_id: target, from_chat_id: ctx.chat.id, message_id: msg.message_id });
        }
        live.set(String(target), Date.now()); // sambung mod live supaya pelanggan boleh terus menjawab
        await tg("setMessageReaction", { chat_id: ctx.chat.id, message_id: msg.message_id, reaction: [{ type: "emoji", emoji: "\uD83D\uDC4D" }] }).catch(() => {});
      } catch (err) {
        await sendCard(ctx.chat.id, card({ title: "Gagal Menghantar", icon: "no", rows: [["no", "Sebab", esc(err.message)]], note: "Pelanggan mungkin telah menyekat bot." }));
      }
      return;
    }

    // (b) pelanggan dalam mod live
    if (!active(uid) || uid === head) return next();
    if (msg.text && msg.text.startsWith("/")) return next(); // arahan lain tidak dipanjangkan

    live.set(uid, Date.now());
    try {
      const rec = db.getUser(uid) || {};
      const hdr = await sendCard(head, card({
        title: "Live Chat Baharu", icon: "mega",
        rows: [
          ["user", "Dari", who(ctx.from)],
          ["tag", "ID", `<code>${esc(uid)}</code>`],
          ["gem", "Paket", esc(rec.paket || "-")],
        ],
        note: "Balas (reply) mesej di bawah untuk menjawab pelanggan ini.",
        footer: false,
      }));
      const copy = await tg("copyMessage", { chat_id: head, from_chat_id: ctx.chat.id, message_id: msg.message_id });
      if (hdr && hdr.message_id) remember(head, hdr.message_id, uid);
      if (copy && copy.message_id) remember(head, copy.message_id, uid);
      await tg("setMessageReaction", { chat_id: ctx.chat.id, message_id: msg.message_id, reaction: [{ type: "emoji", emoji: "\uD83D\uDC4D" }] }).catch(() => {});
    } catch (err) {
      console.error("[live] hantar kepada Head Owner gagal:", err.message);
      await sendCard(ctx.chat.id, card({ title: "Gagal Menghantar", icon: "no", rows: [["no", "Sebab", "Head Owner belum boleh dihubungi"]], note: "Pastikan Head Owner pernah menekan /start pada bot ini." }));
    }
  });
}

module.exports = { register };

// Mod AFK: .afk [sebab]  -> balas automatik PM / mention semasa anda tiada. AFK kekal sehingga .unafk (tahan lama).
// Pilihan: "afk_autooff": true dalam config.json -> AFK mati sendiri bila anda menaip mesej biasa (cara lama).
// Semua paparan ialah kad Rich (jadual + senarai semak) dengan emoji premium:
//   - .afk                      : kad pengesahan
//   - balasan kepada orang lain : kad Rich dihantar melalui bot inline (via @bot) sebagai balasan; jika gagal -> teks biasa
//   - AFK dimatikan             : kad Rich dihantar oleh bot ke chat peribadi anda (termasuk bilangan chat yang dibalas)
const { NewMessage } = require("telegram/events");
const db = require("../db");
const { send, sendRich, fmtTime, TZL, shared } = require("../core");
const { showPanel } = require("../panel");
const { card, show, esc, footerOf, clip, whoOf } = require("../ui");

const REPLY_GAP = 10 * 60 * 1000; // jarak minimum balasan automatik kepada chat yang sama
const lastReply = new Map(); // `${accountId}:${chatId}` -> masa
const repliedTo = new Map(); // accountId -> Set chatId (dibalas semasa AFK ini)

const human = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return [d && `${d} hari`, h && `${h} jam`, m && `${m} minit`].filter(Boolean).join(" ") || `${s} saat`;
};
const when = (t) => `${esc(fmtTime(t, true))} ${esc(TZL)}`;
const getAfk = (account) => (db.getUser(account.userId) || {}).afk || null;

async function afkCmd(ctx) {
  const { args, account } = ctx;
  const reason = args.join(" ").trim().slice(0, 200) || "Tiada sebab";
  const now = Date.now();
  db.upsertUser(account.userId, { afk: { since: now, reason } });
  repliedTo.delete(account.accountId);
  lastReply.clear();
  await show(ctx, card({
    title: "Mod AFK Aktif", icon: "green",
    rows: [
      ["green", "Status", "<b>AFK</b>"],
      ["tag", "Sebab", esc(reason)],
      ["time", "Sejak", when(now)],
      ["user", "Akaun", whoOf(account)],
    ],
    checks: [[true, "PM dan mention dibalas dengan kad Rich"], [true, "Setiap chat dibalas sekali setiap 10 minit"], [true, "AFK kekal sampai anda hantar .unafk"]],
    footer: footerOf(account),
  }));
}

// Kad yang dihantar kepada orang yang chat anda
function replyCard(entry, afk) {
  return card({
    title: "Sedang AFK", icon: "time",
    rows: [
      ["green", "Status", "<b>SEDANG AFK</b>"],
      ["tag", "Sebab", esc(clip(afk.reason, 120))],
      ["time", "Sejak", when(afk.since)],
      ["time", "Sudah AFK", esc(human(Date.now() - afk.since))],
      ["user", "Pemilik", whoOf(entry)],
    ],
    checks: [[true, "Mesej anda telah diterima"], [true, "Akan dibalas sebaik sahaja saya kembali"]],
    footer: footerOf(entry),
  });
}

// Kad pemberitahuan kepada anda (di bot) apabila AFK dimatikan
function offCard(entry, afk, chats) {
  return card({
    title: "AFK Dimatikan", icon: "ok",
    rows: [
      ["time", "Lama AFK", `<b>${esc(human(Date.now() - afk.since))}</b>`],
      ["tag", "Sebab", esc(clip(afk.reason, 80))],
      ["chart", "Chat dibalas", `${chats}`],
      ["user", "Akaun", whoOf(entry)],
    ],
    footer: footerOf(entry),
  });
}

// Matikan AFK; kembalikan {afk, chats} atau null jika tidak AFK
async function turnOff(entry) {
  const afk = getAfk(entry);
  if (!afk) return null;
  db.upsertUser(entry.userId, { afk: null });
  const chats = (repliedTo.get(entry.accountId) || new Set()).size;
  repliedTo.delete(entry.accountId);
  lastReply.clear();
  const c = offCard(entry, afk, chats);
  try {
    await sendRich(entry.userId, c.html);
  } catch (_) {
    await send(entry.userId, c.text).catch(() => {});
  }
  return { afk, chats };
}

async function unafkCmd(ctx) {
  const { account } = ctx;
  const afk = getAfk(account);
  if (!afk) {
    return show(ctx, card({
      title: "AFK Tidak Aktif", icon: "ok",
      rows: [["green", "Status", "<b>Anda tidak sedang AFK</b>"], ["user", "Akaun", whoOf(account)]],
      checks: [[true, "Guna .afk [sebab] untuk mengaktifkan"]],
      footer: footerOf(account),
    }));
  }
  const chats = (repliedTo.get(account.accountId) || new Set()).size;
  db.upsertUser(account.userId, { afk: null });
  repliedTo.delete(account.accountId);
  lastReply.clear();
  await show(ctx, card({
    title: "AFK Dimatikan", icon: "ok",
    rows: [
      ["green", "Status", "<b>Kembali aktif</b>"],
      ["time", "Lama AFK", `<b>${esc(human(Date.now() - afk.since))}</b>`],
      ["tag", "Sebab", esc(clip(afk.reason, 80))],
      ["chart", "Chat dibalas", `${chats}`],
      ["user", "Akaun", whoOf(account)],
    ],
    footer: footerOf(account),
  }));
}

// Dipanggil oleh manager setiap kali userbot dihidupkan
function onClient(entry) {
  const { client } = entry;
  const prefix = shared.cfg.prefix || ".";

  // Mesej masuk: balas jika AFK (PM atau disebut)
  client.addEventHandler(async (event) => {
    try {
      const msg = event.message;
      if (!msg || msg.out) return;
      const afk = getAfk(entry);
      if (!afk) return;
      if (!(msg.isPrivate || msg.mentioned)) return;
      const sender = await msg.getSender().catch(() => null);
      if (!sender || sender.bot || String(sender.id) === entry.accountId) return;

      const key = `${entry.accountId}:${msg.chatId}`;
      if (Date.now() - (lastReply.get(key) || 0) < REPLY_GAP) return;
      lastReply.set(key, Date.now());
      if (!repliedTo.has(entry.accountId)) repliedTo.set(entry.accountId, new Set());
      repliedTo.get(entry.accountId).add(String(msg.chatId));

      const c = replyCard(entry, afk);
      try {
        // kad Rich melalui bot inline (dihantar sebagai balasan kepada mesej mereka)
        await showPanel({ client, msg, account: entry, html: c.html, text: c.text });
      } catch (err) {
        console.error("[afk] kad Rich gagal, guna teks biasa:", err.message);
        await client.sendMessage(msg.peerId, {
          message: `\uD83D\uDCA4 Saya sedang AFK\nSebab: ${afk.reason}\nSejak: ${human(Date.now() - afk.since)} lalu\n\nSaya akan balas bila kembali.`,
          replyTo: msg.id,
        });
      }
    } catch (err) {
      console.error("[afk] balas gagal:", err.message);
    }
  }, new NewMessage({ incoming: true }));

  // Pilihan lama: mesej keluar biasa mematikan AFK (hanya jika afk_autooff aktif)
  client.addEventHandler(async (event) => {
    try {
      const msg = event.message;
      if (!msg || !msg.out || !shared.cfg.afk_autooff) return;
      const afk = getAfk(entry);
      if (!afk) return;
      const text = String(msg.message || "").trim().toLowerCase();
      if (text.startsWith(`${prefix}afk`) || text.startsWith(`${prefix}unafk`)) return;
      if (Date.now() - afk.since < 3000) return;
      await turnOff(entry);
    } catch (err) {
      console.error("[afk] matikan gagal:", err.message);
    }
  }, new NewMessage({ outgoing: true }));
}

module.exports = {
  name: "afk",
  category: "Utilitas",
  help: [
    { cmd: "afk", alias: [], desc: "mod AFK tahan lama: balas PM/mention dengan kad Rich. Contoh: .afk makan" },
    { cmd: "unafk", alias: [], desc: "matikan mod AFK" },
  ],
  commands: { afk: afkCmd, unafk: unafkCmd },
  onClient,
};

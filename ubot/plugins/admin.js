// ===== ADMIN USERBOT LEWAT BOT KONTROL (UBOT ARTA PEDIA) =====
// Pemilik menunjuk admin dengan .addadmin. Admin mengontrol ubot LEWAT CHAT KE BOT KONTROL (bukan lewat akun ubot):
//   1. Admin membuka bot kontrol dan menekan /start (sekali saja, supaya bot boleh membalas).
//   2. Admin mengetik command di chat bot, contoh:  .autobc   .autocek   .cfd 3   .ping
//      (pakai prefix ubot pemilik; atau  /do autobc ).  Hasil/kartu/panel tombol dikirim balik oleh bot ke chat admin.
//   3. Command yang butuh pesan sumber (.autobc .bc .cfd .autocfd): kirim/forward dulu pesan promonya ke bot,
//      lalu REPLY pesan itu dengan command-nya. Bot menyalin isinya ke Saved Messages akun ubot dan memakainya.
//   /menu atau .help -> daftar command yang boleh dipakai admin.   /akun -> pilih ubot bila admin di beberapa ubot.
// Pemilik: .addadmin [@username|ID] (atau balas pesan orangnya) | .deladmin | .listadmin   (maks 5 admin)
// Diblokir untuk admin: addadmin/deladmin/listadmin/setprefix/setfooter/setnorek/setqr/delset, kategori Owner & Reseller, VPS & Panel.
const db = require("../db");
const access = require("../access");
const { shared, cfg, tg, esc, send, sendRich } = require("../core");
const { card, show, edit, footerOf, clip } = require("../ui");
const { style } = require("../fxcard");
const AC = require("../adminctl");
const UI = require("../botui");
const { btn } = require("../core");
const expiry = require("../expiry");
const PK = require("../paket");

const MAX_ADMINS = 5;
const BLOCK_CATS = new Set(["VPS & Panel", "Owner & Reseller"]);
const BLOCK_CMDS = new Set(["addadmin", "deladmin", "listadmin", "setprefix", "setfooter", "setnorek", "setqr", "delset", "help", "menu"]);
const USE = ".addadmin @username  |  .addadmin <ID>  |  balas pesan orangnya\n.deladmin @username\n.listadmin";

const adminsOf = (uid) => ((db.getUser(uid) || {}).admins || []).slice();
const nameOf = (u) => [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || String(u.id);
const stripTags = (s) => String(s || "").replace(/<[^>]+>/g, "");

// ===== Perintah pemilik (dijalankan dari akun ubot) =====
async function resolveUser(ctx) {
  const { client, msg, args } = ctx;
  const arg = String(args[0] || "").trim();
  let ent = null;
  if (!arg) {
    const rm = await msg.getReplyMessage().catch(() => null);
    if (!rm) return null;
    ent = await rm.getSender().catch(() => null);
  } else {
    const key = /^-?\d{5,20}$/.test(arg) ? arg : arg.replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "").replace(/[/?].*$/, "");
    ent = await client.getEntity(key).catch(() => null);
  }
  if (!ent || ent.className !== "User") return null;
  return ent;
}

async function addadmin(ctx) {
  if (ctx.byAdmin) return;
  const uid = String(ctx.account.userId);
  const ent = await resolveUser(ctx);
  if (!ent) return edit(ctx, "Guna:\n" + USE);
  if (ent.bot) return edit(ctx, "\u26A0\uFE0F Bot tidak bisa dijadikan admin.");
  if (String(ent.id) === String(ctx.account.accountId) || String(ent.id) === uid) return edit(ctx, "\u26A0\uFE0F Itu akun Anda sendiri.");
  const list = adminsOf(uid);
  if (list.some((a) => String(a.id) === String(ent.id))) return edit(ctx, "\u26A0\uFE0F Orang ini sudah menjadi admin.");
  if (list.length >= MAX_ADMINS) return edit(ctx, `\u26A0\uFE0F Maksimal ${MAX_ADMINS} admin. Hapus dulu dengan .deladmin`);
  list.push({ id: String(ent.id), username: ent.username || null, name: nameOf(ent), addedAt: Date.now() });
  db.upsertUser(uid, { admins: list });
  const bot = shared.botUsername ? "@" + shared.botUsername : "bot kontrol";
  await show(ctx, card(style({
    title: "Admin Ditambahkan", icon: "user", lead: `Admin mengontrol ubot Anda lewat chat ke ${esc(bot)}`,
    rows: [
      ["user", "Nama", esc(clip(nameOf(ent), 30))],
      ["tag", "Username", ent.username ? "@" + esc(ent.username) : "-"],
      ["gear", "ID", `<code>${esc(String(ent.id))}</code>`],
      ["chart", "Total admin", `${list.length}/${MAX_ADMINS}`],
    ],
    checks: [
      [true, `Minta admin membuka ${esc(bot)} dan menekan /start`],
      [true, "Admin mengetik command (pakai prefix Anda) di chat bot"],
      [true, "Command pengelolaan/owner/VPS diblokir untuk admin"],
    ],
    footer: footerOf(ctx.account),
  }, USE)));
}

async function deladmin(ctx) {
  if (ctx.byAdmin) return;
  const uid = String(ctx.account.userId);
  const ent = await resolveUser(ctx);
  if (!ent) return edit(ctx, "Guna:\n" + USE);
  const list = adminsOf(uid);
  const left = list.filter((a) => String(a.id) !== String(ent.id));
  if (left.length === list.length) return edit(ctx, "\u26A0\uFE0F Orang ini bukan admin Anda.");
  db.upsertUser(uid, { admins: left });
  await show(ctx, card(style({
    title: "Admin Dihapus", icon: "user", lead: "Akses kontrol dicabut",
    rows: [["user", "Nama", esc(clip(nameOf(ent), 30))], ["chart", "Sisa admin", `${left.length}/${MAX_ADMINS}`]],
    checks: [[true, "Admin tidak bisa lagi memakai command ubot"]],
    footer: footerOf(ctx.account),
  }, USE)));
}

async function listadmin(ctx) {
  if (ctx.byAdmin) return;
  const list = adminsOf(ctx.account.userId);
  if (!list.length) return edit(ctx, "\u26A0\uFE0F Belum ada admin. Tambah dengan .addadmin @username");
  await show(ctx, card(style({
    title: "Daftar Admin", icon: "user", lead: `${list.length} admin dapat mengontrol ubot Anda lewat bot`,
    headers: ["Admin", "ID"], headerIcons: ["user", "gear"],
    rows: list.map((a, i) => ["user", `${i + 1}. ${esc(clip(a.name, 22))}${a.username ? " (@" + esc(a.username) + ")" : ""}`, `<code>${esc(a.id)}</code>`]),
    checks: [[true, "Hapus dengan .deladmin @username"]],
    footer: footerOf(ctx.account),
  }, USE)));
}

// ===== Jembatan bot -> userbot =====
const selected = AC.selected; // adminId -> ownerUserId pilihan
let seq = 0;

const ownersOf = AC.ownersOf;
const prefixOf = (ownerUid) => (db.getUser(ownerUid) || {}).prefix || cfg.prefix || ".";
const ownerLabel = (uid) => {
  const e = shared.manager && shared.manager.getByUser(uid);
  const r = db.getUser(uid) || {};
  return e ? (e.username ? "@" + e.username : e.name || uid) : r.username ? "@" + r.username : uid;
};

function commandMap(all) {
  const m = new Map();
  for (const p of shared.plugins || []) {
    if (!all && BLOCK_CATS.has(p.category)) continue;
    for (const [name, fn] of Object.entries(p.commands || {})) if (all ? !["help", "menu"].includes(name.toLowerCase()) : !BLOCK_CMDS.has(name.toLowerCase())) m.set(name.toLowerCase(), fn);
  }
  return m;
}

async function say(chatId, html) {
  try {
    return await tg("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  } catch (_) {
    return tg("sendMessage", { chat_id: chatId, text: stripTags(html) }).catch(() => {});
  }
}

// Kartu Rich / teks hasil command -> dikirim bot ke admin
async function relayCard(adminId, { html, text }) {
  if (html) {
    try {
      await sendRich(adminId, html);
      return;
    } catch (_) {}
  }
  await say(adminId, String(text || stripTags(html) || "-").slice(0, 4000));
}

// Suntingan pesan perintah (progress) -> satu pesan bot yang diedit terus
async function relayEdit(state, adminId, params) {
  const text = String(params.text || "").slice(0, 4000);
  const isHtml = params.parseMode === "html";
  const body = { chat_id: adminId, text, ...(isHtml ? { parse_mode: "HTML" } : {}), link_preview_options: { is_disabled: true } };
  try {
    if (!state.mid) state.mid = (await tg("sendMessage", body)).message_id;
    else await tg("editMessageText", { ...body, message_id: state.mid });
  } catch (err) {
    if (/not modified/i.test(err.message)) return;
    try {
      const plain = { chat_id: adminId, text: stripTags(text) };
      if (!state.mid) state.mid = (await tg("sendMessage", plain)).message_id;
      else await tg("editMessageText", { ...plain, message_id: state.mid });
    } catch (_) {}
  }
}

// entitas bot API -> HTML (offset UTF-16 sama dengan string JS)
function toHtml(text, entities) {
  text = String(text || "");
  const tag = { bold: ["b"], italic: ["i"], underline: ["u"], strikethrough: ["s"], code: ["code"], pre: ["pre"], spoiler: ["tg-spoiler"], blockquote: ["blockquote"], expandable_blockquote: ["blockquote"] };
  const open = new Map(), close = new Map();
  for (const e of entities || []) {
    let o, c;
    if (e.type === "text_link" && e.url) [o, c] = [`<a href="${esc(e.url).replace(/"/g, "&quot;")}">`, "</a>"];
    else if (tag[e.type]) [o, c] = [`<${tag[e.type][0]}>`, `</${tag[e.type][0]}>`];
    else continue;
    (open.get(e.offset) || open.set(e.offset, []).get(e.offset)).push(o);
    (close.get(e.offset + e.length) || close.set(e.offset + e.length, []).get(e.offset + e.length)).unshift(c);
  }
  let out = "";
  for (let i = 0; i <= text.length; i++) {
    if (close.has(i)) out += close.get(i).join("");
    if (open.has(i)) out += open.get(i).join("");
    if (i < text.length) out += esc(text[i]);
  }
  return out;
}

// Salin pesan yang di-reply admin (di chat bot) ke Saved Messages akun ubot -> jadi "pesan sumber"
async function importReply(entry, rep) {
  const caption = toHtml(rep.text || rep.caption || "", rep.entities || rep.caption_entities);
  const media =
    (rep.photo && { id: rep.photo[rep.photo.length - 1].file_id, name: "foto.jpg" }) ||
    (rep.video && { id: rep.video.file_id, name: rep.video.file_name || "video.mp4" }) ||
    (rep.animation && { id: rep.animation.file_id, name: rep.animation.file_name || "anim.mp4" }) ||
    (rep.document && { id: rep.document.file_id, name: rep.document.file_name || "file" }) ||
    (rep.audio && { id: rep.audio.file_id, name: rep.audio.file_name || "audio.mp3" }) ||
    (rep.voice && { id: rep.voice.file_id, name: "voice.ogg" }) ||
    (rep.sticker && { id: rep.sticker.file_id, name: "sticker.webp" });
  if (!media) {
    if (!caption) throw new Error("Pesan yang di-reply kosong / tidak didukung.");
    return entry.client.sendMessage("me", { message: caption, parseMode: "html", linkPreview: false });
  }
  const f = await tg("getFile", { file_id: media.id });
  const res = await fetch(`https://api.telegram.org/file/bot${cfg.bot_token}/${f.file_path}`);
  if (!res.ok) throw new Error("Gagal mengunduh media dari bot.");
  const buf = Buffer.from(await res.arrayBuffer());
  const { CustomFile } = require("telegram/client/uploads");
  return entry.client.sendFile("me", { file: new CustomFile(media.name, buf.length, "", buf), caption, parseMode: "html" });
}

function helpHtml(prefix, all) {
  const blocks = new Map();
  for (const p of shared.plugins || []) {
    if (!p.category || !Array.isArray(p.help) || (!all && BLOCK_CATS.has(p.category))) continue;
    for (const h of p.help) {
      if (all ? ["help", "menu"].includes(String(h.cmd).toLowerCase()) : BLOCK_CMDS.has(String(h.cmd).toLowerCase())) continue;
      if (!blocks.has(p.category)) blocks.set(p.category, []);
      blocks.get(p.category).push(`<code>${esc(prefix + h.cmd)}</code>`);
    }
  }
  const msgs = [];
  let cur = `<b>${all ? "Command untuk owner (semua ubot aktif)" : "Command untuk admin"}</b>\nKetik command di chat ini. Untuk .autobc / .bc / .cfd / .autocfd: reply pesan promo dengan command-nya.\n`;
  for (const [cat, list] of blocks) {
    const line = `\n<b>${esc(cat)}</b>\n${list.join(" ")}\n`;
    if (cur.length + line.length > 3800) {
      msgs.push(cur);
      cur = "";
    }
    cur += line;
  }
  msgs.push(cur);
  return msgs;
}

async function runAsAdmin(ctx, ownerUid, body, prefix) {
  const adminId = String(ctx.from.id);
  const entry = shared.manager && shared.manager.getByUser(ownerUid);
  if (!entry) return say(adminId, "\u26A0\uFE0F Userbot pemilik sedang offline.");
  const [cmdRaw, ...args] = body.trim().split(/\s+/);
  const name = (cmdRaw || "").toLowerCase();
  if (!name) return;
  const asOwner = access.isOwner(adminId); // owner: semua command, tanpa batas paket
  if (name === "help" || name === "menu") {
    for (const m of helpHtml(prefix, asOwner)) await say(adminId, m);
    return;
  }
  const handler = commandMap(asOwner).get(name);
  if (!handler) return say(adminId, `\u26A0\uFE0F Command <code>${esc(name)}</code> tidak ada atau tidak boleh dipakai admin. Ketik /menu.`);
  if (!asOwner && require("../maint").isOn() && !access.isStaff(entry.userId)) return say(adminId, "\uD83D\uDEE0 Sedang maintenance, coba sebentar lagi.");
  const pk = require("../paket");
  const d = asOwner ? null : pk.deny(entry.userId, name);
  if (d) return say(adminId, esc(pk.denyText(d, prefix)));

  // pesan sumber (reply admin) -> Saved Messages akun
  let replyMsg = null;
  const rep = ctx.message.reply_to_message;
  if (rep) {
    try {
      replyMsg = await importReply(entry, rep);
    } catch (err) {
      return say(adminId, "\u26A0\uFE0F Gagal memakai pesan yang di-reply: " + esc(String(err.message).slice(0, 200)));
    }
  }

  // "msg" virtual: semua keluaran command diarahkan balik ke chat admin lewat bot
  const state = { mid: null };
  const vid = 2000000000 + ++seq;
  const real = entry.client;
  const client = new Proxy(real, {
    get(t, p) {
      if (p === "editMessage") {
        return (peer, params) => (params && params.message === vid ? relayEdit(state, adminId, params) : t.editMessage(peer, params));
      }
      const v = t[p];
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
  const msg = {
    id: vid, out: true, message: `${prefix}${body}`, text: `${prefix}${body}`,
    peerId: replyMsg ? replyMsg.peerId : "me", chatId: String(entry.accountId), senderId: entry.accountId,
    isPrivate: true,
    getReplyMessage: async () => replyMsg,
    getChat: async () => ({ title: "Bot kontrol (admin)" }),
    getSender: async () => real.getMe(),
    delete: async () => {},
    __relay: (c) => relayCard(adminId, c),
  };
  try {
    await handler({ client, msg, args, prefix, shared, account: entry, byAdmin: adminId });
  } catch (err) {
    console.error(`[admin] ralat command ${prefix}${name}:`, err.errorMessage || err.message);
    await say(adminId, "\u26A0\uFE0F " + esc(String(err.userMsg || err.errorMessage || err.message || "Ralat").slice(0, 300)));
  }
}

// Dipasang SEBELUM Live Chat (yang menangkap semua pesan peribadi) -> registerBotEarly
function ownerLine(o) {
  const online = !!(shared.manager && shared.manager.getByUser(o));
  return `${online ? "\uD83D\uDFE2 ONLINE" : "\uD83D\uDD34 OFFLINE"} \u00B7 ${PK.tierOf(o)}`;
}

// ----- tombol CONTROL UBOT (di /start admin) -----
const ctlKb = (fancy) => [
  [btn(fancy, "Menu Command", "ctl:menu", "primary"), btn(fancy, "Ganti Akun", "ctl", "success")],
];
function ctlSelectedCard(o, all) {
  const prefix = prefixOf(o);
  return UI.card({
    title: "Control Ubot", icon: "crown",
    rows: [
      ["user", "Akun", `<b>${esc(ownerLabel(o))}</b>`],
      ["green", "Status", esc(ownerLine(o))],
      ["time", "Expired", `<b>${esc(expiry.label(o))}</b>`],
      ["gear", "Prefix", `<code>${esc(prefix)}</code>`],
    ],
    checks: [
      [true, `Ketik command di chat ini, contoh <code>${esc(prefix)}autocek</code>`],
      [true, `Broadcast: kirim pesan promo, lalu REPLY dengan <code>${esc(prefix)}autobc</code>`],
      [true, "Hasil dan panel tombol dikirim bot ke chat ini"],
    ],
    note: all ? "Mode OWNER: semua command terbuka untuk ubot ini." : "Command pengelolaan, owner, dan VPS diblokir untuk admin.",
  });
}

function registerControlButtons(bot) {
  // daftar ubot yang bisa dikontrol (owner: semua ubot aktif, dibagi halaman 8 per halaman)
  const CTL_PAGE = 8;
  async function ctlList(ctx, page) {
    const owners = ownersOf(ctx.from.id);
    const chat = ctx.callbackQuery && ctx.callbackQuery.message ? ctx.callbackQuery.message.chat.id : ctx.from.id;
    if (!owners.length) {
      const isOwn = access.isOwner(ctx.from.id);
      return UI.sendCard(chat, UI.card({
        title: isOwn ? "Tidak Ada Ubot Aktif" : "Bukan Admin", icon: "no",
        rows: [["info", "Status", isOwn ? "Belum ada userbot yang online" : "Anda belum ditunjuk sebagai admin ubot mana pun"]],
        note: isOwn ? undefined : "Minta pemilik ubot menjalankan <code>.addadmin</code> untuk Anda.",
      }));
    }
    const cur = AC.current(ctx.from.id);
    const pages = Math.max(1, Math.ceil(owners.length / CTL_PAGE));
    const pg = Math.min(Math.max(0, page), pages - 1);
    const slice = owners.slice(pg * CTL_PAGE, (pg + 1) * CTL_PAGE);
    return UI.sendCard(chat, UI.card({
      title: access.isOwner(ctx.from.id) ? `Control Semua Ubot (${owners.length} aktif)` : "Control Ubot", icon: "crown",
      rows: slice.map((o) => ["user", esc(ownerLabel(o)) + (o === cur ? " \u2705" : ""), esc(ownerLine(o))]),
      checks: [[true, "Pilih akun ubot yang mau dikontrol"], [true, "Setelah memilih, ketik command langsung di chat ini"]],
      note: pages > 1 ? `Halaman ${pg + 1} dari ${pages}` : undefined,
    }), (fancy) => [
      ...slice.map((o) => [btn(fancy, String(ownerLabel(o)).slice(0, 40), `ctl:${o}`, o === cur ? "success" : "primary")]),
      ...(pages > 1 ? [[btn(fancy, "\u25C0\uFE0F Prev", `ctl:pg:${(pg - 1 + pages) % pages}`, "primary"), btn(fancy, "Next \u25B6\uFE0F", `ctl:pg:${(pg + 1) % pages}`, "primary")]] : []),
    ]);
  }
  bot.callbackQuery("ctl", async (ctx) => {
    await ctx.answerCallbackQuery();
    return ctlList(ctx, 0);
  });
  bot.callbackQuery(/^ctl:pg:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    return ctlList(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery(/^ctl:(\d+)$/, async (ctx) => {
    const o = ctx.match[1];
    if (!ownersOf(ctx.from.id).includes(o)) return ctx.answerCallbackQuery({ text: "Anda bukan admin ubot ini.", show_alert: true });
    selected.set(String(ctx.from.id), o);
    await ctx.answerCallbackQuery({ text: "Mengontrol " + ownerLabel(o) });
    const chat = ctx.callbackQuery.message ? ctx.callbackQuery.message.chat.id : ctx.from.id;
    return UI.sendCard(chat, ctlSelectedCard(o, access.isOwner(ctx.from.id)), ctlKb);
  });

  bot.callbackQuery("ctl:menu", async (ctx) => {
    const o = AC.current(ctx.from.id);
    if (!o) return ctx.answerCallbackQuery({ text: "Anda bukan admin ubot mana pun.", show_alert: true });
    await ctx.answerCallbackQuery();
    for (const m of helpHtml(prefixOf(o), access.isOwner(ctx.from.id))) await say(String(ctx.from.id), m);
  });
}

function registerBotEarly(bot) {
  registerControlButtons(bot);
  bot.on("message", async (ctx, next) => {
    const m = ctx.message;
    const text = String((m && (m.text || m.caption)) || "").trim();
    if (!text || !ctx.from || (ctx.chat && ctx.chat.type !== "private")) return next();
    const owners = ownersOf(ctx.from.id);
    if (!owners.length) return next();

    const adminId = String(ctx.from.id);
    if (/^\/akun(@\w+)?(\s+\d+)?$/i.test(text)) {
      const n = Number((text.match(/\s+(\d+)$/) || [])[1]);
      if (n && owners[n - 1]) selected.set(adminId, owners[n - 1]);
      const cur = selected.get(adminId) && owners.includes(selected.get(adminId)) ? selected.get(adminId) : owners[0];
      return void (await say(adminId, `<b>Ubot yang Anda kontrol</b>\n${owners.map((o, i) => `${i + 1}. ${esc(ownerLabel(o))}${o === cur ? " \u2705" : ""}`).join("\n")}\n\nPilih: <code>/akun 2</code>`));
    }
    const cur = selected.get(adminId) && owners.includes(selected.get(adminId)) ? selected.get(adminId) : owners[0];
    const prefix = prefixOf(cur);
    if (/^\/menu(@\w+)?$/i.test(text)) return void (await runAsAdmin(ctx, cur, "menu", prefix));
    let body = null;
    const mm = text.match(/^\/do(@\w+)?\s+(.+)$/is);
    if (mm) body = mm[2];
    else if (text.startsWith(prefix)) body = text.slice(prefix.length);
    if (body === null) return next(); // bukan command -> biarkan handler lain (Live Chat, dll.)

    if (owners.length > 1 && !selected.has(adminId)) {
      await say(adminId, `\u2139\uFE0F Anda admin di ${owners.length} ubot. Sekarang mengontrol: <b>${esc(ownerLabel(cur))}</b> (ganti dengan /akun).`);
    }
    await runAsAdmin(ctx, cur, body, prefix);
  });
}

module.exports = {
  name: "admin",
  category: "Sistem",
  help: [
    { cmd: "addadmin", alias: [], desc: "jadikan orang lain admin yang mengontrol ubot LEWAT BOT KONTROL: .addadmin @username (atau balas pesannya)" },
    { cmd: "deladmin", alias: [], desc: "cabut admin: .deladmin @username" },
    { cmd: "listadmin", alias: [], desc: "daftar admin ubot Anda" },
  ],
  registerBotEarly,
  commands: { addadmin, deladmin, listadmin },
  _toHtml: toHtml,
};

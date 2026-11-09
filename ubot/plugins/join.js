// ===== JOIN GRUP / FOLDER / AUTOJOIN (menu SHARE, UBOT ARTA PEDIA) =====
//   .joingb <link> [link2 ...]  (atau balas pesan berisi link)  -> akun ubot bergabung ke grup/channel (maks 20 link sekali jalan)
//   .joinfolder <link folder>   (t.me/addlist/xxxx)              -> folder dipasang di akun & semua grup di dalamnya di-join
//   .autojoin on|off            -> bot membaca link grup di SEMUA pesan yang diterima akun (grup, channel, private)
//                                  dan bergabung satu per satu dengan jeda ACAK 10-20 menit antar permintaan
//   .autojoin status | list | clear | jeda <min> <max>
// Hanya link undangan (t.me/+xxx, t.me/joinchat/xxx) dan link publik (t.me/namagrup) yang diproses; channel siaran dilewati oleh autojoin.
// Antrian & pengaturan tersimpan di data/db.json (kunci "autojoin") dan jalan lagi otomatis saat bot restart.
// config.json (opsional): "autojoin_min_minutes": 10, "autojoin_max_minutes": 20, "autojoin_report": true
const { Api } = require("telegram");
const { NewMessage } = require("telegram/events");
const db = require("../db");
const { shared, cfg, esc, fmtTime, TZL, send } = require("../core");
const { card, show, edit, footerOf, clip } = require("../ui");
const { style } = require("../fxcard");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_LINKS = 20;
const MAX_QUEUE = 200;
const MAX_SEEN = 3000;
const RESERVED = new Set(["addlist", "joinchat", "c", "s", "share", "proxy", "socks", "login", "addstickers", "addemoji", "addtheme", "boost", "iv", "setlanguage", "contact", "bg", "invoice", "m", "giftcode", "confirmphone", "telegram", "username"]);
const USE_JOIN = ".joingb <link grup> [link lain ...]  (atau balas pesan berisi link)";
const USE_FOLDER = ".joinfolder <link folder>  (contoh: https://t.me/addlist/AbCdEf123)";
const USE_AUTO = ".autojoin on|off\n.autojoin status | list | clear\n.autojoin jeda <min> <max>  (menit, acak)";

// ---------- parser link ----------
const RX = /(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.me\/([^\s<>"'\])]+)|tg:\/\/join\?invite=([A-Za-z0-9_-]+)/gi;
function classify(path) {
  const clean = String(path).replace(/[?#].*$/, "").replace(/[.,;:!?]+$/, "");
  let m;
  if ((m = clean.match(/^\+([A-Za-z0-9_-]{8,})/))) return { kind: "inv", key: m[1] };
  if ((m = clean.match(/^joinchat\/([A-Za-z0-9_-]{8,})/i))) return { kind: "inv", key: m[1] };
  if ((m = clean.match(/^addlist\/([A-Za-z0-9_-]{6,})/i))) return { kind: "folder", key: m[1] };
  if ((m = clean.match(/^([A-Za-z][A-Za-z0-9_]{3,31})\/?$/)) && !RESERVED.has(m[1].toLowerCase())) return { kind: "user", key: m[1] };
  return null; // link pesan (t.me/xxx/123), bot, dll. diabaikan
}
function extractLinks(text, entities) {
  const out = [];
  const seen = new Set();
  const push = (l) => {
    if (!l) return;
    const k = `${l.kind}:${l.kind === "user" ? l.key.toLowerCase() : l.key}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ ...l, k });
    }
  };
  const scan = (s) => {
    RX.lastIndex = 0;
    let m;
    while ((m = RX.exec(String(s || "")))) push(m[2] ? { kind: "inv", key: m[2] } : classify(m[1]));
  };
  scan(text);
  for (const e of entities || []) if (e && typeof e.url === "string") scan(e.url); // link tersembunyi di balik teks
  return out;
}

// ---------- terjemah error ----------
function errInfo(err) {
  const code = String(err.errorMessage || err.message || "");
  if (/USER_ALREADY_PARTICIPANT/.test(code)) return { status: "already", note: "sudah bergabung" };
  if (/INVITE_REQUEST_SENT/.test(code)) return { status: "request", note: "permintaan bergabung terkirim (menunggu admin)" };
  if (/INVITE_HASH_(EXPIRED|INVALID|EMPTY)|INVITE_SLUG_(EXPIRED|EMPTY|INVALID)/.test(code)) return { status: "fail", note: "link kedaluwarsa / tidak valid" };
  if (/USERNAME_(NOT_OCCUPIED|INVALID)/.test(code)) return { status: "fail", note: "username tidak ditemukan" };
  if (/CHANNELS_TOO_MUCH|CHATLISTS_TOO_MUCH/.test(code)) return { status: "full", note: "akun sudah mencapai batas jumlah grup/channel" };
  if (/FILTERS_TOO_MUCH/.test(code)) return { status: "fail", note: "jumlah folder di akun sudah penuh" };
  if (/USER_BANNED_IN_CHANNEL/.test(code)) return { status: "fail", note: "akun dibanned di grup itu" };
  if (/CHANNEL_PRIVATE|CHAT_ADMIN_REQUIRED/.test(code)) return { status: "fail", note: "grup privat / tidak bisa diakses" };
  const fw = code.match(/FLOOD_WAIT_?(\d+)?/) || (err.seconds ? [0, err.seconds] : null);
  if (fw || /PEER_FLOOD/.test(code)) return { status: "flood", wait: Number(fw && fw[1]) || 3600, note: `kena limit Telegram, tunggu ${Math.ceil((Number(fw && fw[1]) || 3600) / 60)} menit` };
  return { status: "fail", note: clip(code || "gagal", 80) };
}

// ---------- aksi join ----------
async function joinInvite(client, hash, groupsOnly) {
  const chk = await client.invoke(new Api.messages.CheckChatInvite({ hash }));
  if (chk.className === "ChatInviteAlready") return { status: "already", title: chk.chat && chk.chat.title, note: "sudah bergabung" };
  if (groupsOnly && chk.broadcast) return { status: "skip", title: chk.title, note: "channel siaran (bukan grup)" };
  const res = await client.invoke(new Api.messages.ImportChatInvite({ hash }));
  return { status: "ok", title: (res.chats && res.chats[0] && res.chats[0].title) || chk.title, note: "berhasil bergabung" };
}
async function joinPublic(client, username, groupsOnly) {
  const ent = await client.getEntity(username);
  if (ent.className !== "Channel" && ent.className !== "Chat") return { status: "skip", title: username, note: "bukan grup/channel" };
  if (groupsOnly && ent.broadcast) return { status: "skip", title: ent.title, note: "channel siaran (bukan grup)" };
  if (ent.className === "Channel") {
    if (ent.left === false) return { status: "already", title: ent.title, note: "sudah bergabung" };
    await client.invoke(new Api.channels.JoinChannel({ channel: ent }));
  }
  return { status: "ok", title: ent.title, note: "berhasil bergabung" };
}
async function joinLink(client, l, groupsOnly) {
  try {
    if (l.kind === "inv") return await joinInvite(client, l.key, groupsOnly);
    if (l.kind === "user") return await joinPublic(client, l.key, groupsOnly);
    return { status: "skip", note: "jenis link tidak didukung di sini" };
  } catch (err) {
    return { ...errInfo(err), title: l.key };
  }
}

const textOf = (t) => (t && typeof t === "object" ? t.text || "" : String(t || ""));
function toInputPeer(p, chats) {
  if (p.className === "PeerChannel") {
    const c = (chats || []).find((x) => String(x.id) === String(p.channelId));
    return c && c.accessHash !== undefined ? new Api.InputPeerChannel({ channelId: c.id, accessHash: c.accessHash }) : null;
  }
  if (p.className === "PeerChat") return new Api.InputPeerChat({ chatId: p.chatId });
  return null;
}
async function joinFolder(client, slug) {
  if (!Api.chatlists) return { status: "fail", note: "library telegram belum mendukung folder. Jalankan: npm i telegram@latest" };
  try {
    const chk = await client.invoke(new Api.chatlists.CheckChatlistInvite({ slug }));
    if (chk.className === "chatlists.ChatlistInviteAlready") {
      const peers = (chk.missingPeers || []).map((p) => toInputPeer(p, chk.chats)).filter(Boolean);
      if (!peers.length) return { status: "already", title: "folder", note: "folder sudah terpasang dan semua grup sudah di-join" };
      await client.invoke(new Api.chatlists.JoinChatlistUpdates({ chatlist: new Api.InputChatlistDialogFilter({ filterId: chk.filterId }), peers }));
      return { status: "ok", title: "folder", count: peers.length, note: `${peers.length} grup baru di folder di-join` };
    }
    const peers = (chk.peers || []).map((p) => toInputPeer(p, chk.chats)).filter(Boolean);
    if (!peers.length) return { status: "fail", note: "folder tidak berisi grup yang bisa di-join" };
    await client.invoke(new Api.chatlists.JoinChatlistInvite({ slug, peers }));
    return { status: "ok", title: textOf(chk.title) || "folder", count: peers.length, note: `folder dipasang, ${peers.length} grup di-join` };
  } catch (err) {
    return errInfo(err);
  }
}

// ---------- tampilan ----------
const ICON = { ok: "ok", already: "ok", request: "time", skip: "warn", fail: "no", full: "no", flood: "warn" };
const WORD = { ok: "Berhasil", already: "Sudah ada", request: "Menunggu admin", skip: "Dilewati", fail: "Gagal", full: "Akun penuh", flood: "Kena limit" };

async function reply(ctx, title, lead, results, USE) {
  const okN = results.filter((r) => r.status === "ok").length;
  return show(ctx, card(style({
    title, icon: "link", lead,
    rows: results.map((r, i) => [ICON[r.status] || "warn", `${i + 1}. ${esc(clip(r.title || r.key || "-", 26))}`, `${WORD[r.status] || r.status}${r.note && r.status !== "ok" ? " - " + esc(clip(r.note, 50)) : ""}`]),
    checks: [[okN > 0, `${okN} dari ${results.length} berhasil`]],
    footer: footerOf(ctx.account),
  }, USE)));
}

// ---------- .joingb ----------
async function sourceLinks(ctx) {
  let text = ctx.args.join(" ");
  let ents = [];
  const rm = await ctx.msg.getReplyMessage().catch(() => null);
  if (rm) {
    text += " " + (rm.message || "");
    ents = rm.entities || [];
  }
  return extractLinks(text, ents);
}

async function joingb(ctx) {
  const links = (await sourceLinks(ctx)).filter((l) => l.kind !== "folder");
  if (!links.length) return edit(ctx, "Guna: " + USE_JOIN + "\nFolder: .joinfolder <link>");
  if (links.length > MAX_LINKS) return edit(ctx, `\u26A0\uFE0F Maksimal ${MAX_LINKS} link sekali jalan (ada ${links.length}).`);
  await edit(ctx, `\u23F3 Bergabung ke ${links.length} grup...`, false).catch(() => {});
  const results = [];
  for (let i = 0; i < links.length; i++) {
    const r = await joinLink(ctx.client, links[i], false);
    results.push({ ...r, key: links[i].key });
    if (r.status === "flood" || r.status === "full") break; // percuma lanjut
    if (i < links.length - 1) await sleep(5000 + Math.random() * 7000); // jeda 5-12 detik antar link
  }
  return reply(ctx, "Join Grup", `${links.length} link diproses`, results, USE_JOIN);
}

// ---------- .joinfolder ----------
async function joinfolderCmd(ctx) {
  const l = (await sourceLinks(ctx)).find((x) => x.kind === "folder");
  if (!l) return edit(ctx, "Guna: " + USE_FOLDER);
  await edit(ctx, "\u23F3 Memasang folder dan bergabung ke grup di dalamnya...", false).catch(() => {});
  const r = await joinFolder(ctx.client, l.key);
  return reply(ctx, "Join Folder Grup", "Folder dibagikan lewat link addlist", [{ ...r, key: l.key }], USE_FOLDER);
}

// ---------- .autojoin ----------
const recOf = (uid) => ({ on: false, min: Number(cfg.autojoin_min_minutes) || 10, max: Number(cfg.autojoin_max_minutes) || 20, queue: [], seen: [], joined: 0, failed: 0, last: "", lastAt: 0, nextAt: 0, ...((db.getUser(uid) || {}).autojoin || {}) });
const save = (uid, rec) => db.upsertUser(uid, { autojoin: rec });
const randDelay = (rec) => (rec.min + Math.random() * Math.max(0, rec.max - rec.min)) * 60000;
const timers = new Map();

function schedule(uid, at) {
  clearTimeout(timers.get(uid));
  const t = setTimeout(() => tick(uid).catch((e) => console.error("[autojoin] tick:", e.message)), Math.max(1000, at - Date.now()));
  if (t.unref) t.unref();
  timers.set(uid, t);
}

async function tick(uid) {
  timers.delete(uid);
  const rec = recOf(uid);
  if (!rec.on || !rec.queue.length) return;
  const entry = shared.manager && shared.manager.getByUser(uid);
  if (!entry) return schedule(uid, Date.now() + 60000);

  const item = rec.queue.shift();
  const r = await joinLink(entry.client, item, true);
  const label = esc(clip(r.title || item.key, 40));
  let line;
  if (r.status === "ok") {
    rec.joined++;
    line = `\u2705 <b>AutoJoin</b>: berhasil bergabung ke <b>${label}</b>`;
  } else if (r.status === "already" || r.status === "skip") {
    line = null; // senyap
  } else if (r.status === "request") {
    line = `\u23F3 <b>AutoJoin</b>: <b>${label}</b> - ${esc(r.note)}`;
  } else if (r.status === "flood") {
    rec.queue.unshift(item); // coba lagi nanti
    rec.nextAt = Date.now() + (r.wait + 60) * 1000;
    rec.last = `flood ${Math.ceil(r.wait / 60)} menit`;
    save(uid, rec);
    send(uid, `\u26A0\uFE0F <b>AutoJoin</b> dijeda: ${esc(r.note)}`).catch(() => {});
    return schedule(uid, rec.nextAt);
  } else if (r.status === "full") {
    rec.on = false;
    rec.queue.unshift(item);
    rec.last = "akun penuh";
    save(uid, rec);
    send(uid, `\uD83D\uDED1 <b>AutoJoin</b> dimatikan: ${esc(r.note)}. Keluar dari beberapa grup lalu nyalakan lagi dengan .autojoin on`).catch(() => {});
    return;
  } else {
    rec.failed++;
    line = `\u274C <b>AutoJoin</b>: gagal ke <b>${label}</b> - ${esc(r.note)}`;
  }
  rec.last = `${WORD[r.status] || r.status}: ${clip(r.title || item.key, 30)}`;
  rec.lastAt = Date.now();
  rec.nextAt = Date.now() + randDelay(rec);
  save(uid, rec);
  if (line && cfg.autojoin_report !== false) {
    send(uid, `${line}\nAntrian: <b>${rec.queue.length}</b>${rec.queue.length ? ` \u00B7 berikutnya \u00B1${esc(fmtTime(rec.nextAt, true))} ${esc(TZL)}` : ""}`).catch(() => {});
  }
  if (rec.queue.length) schedule(uid, rec.nextAt);
}

function enqueue(uid, links) {
  const rec = recOf(uid);
  if (!rec.on) return 0;
  let added = 0;
  const seen = new Set(rec.seen);
  for (const l of links) {
    if (l.kind === "folder" || seen.has(l.k) || rec.queue.length >= MAX_QUEUE) continue;
    seen.add(l.k);
    rec.queue.push({ kind: l.kind, key: l.key, k: l.k, at: Date.now() });
    added++;
  }
  if (!added) return 0;
  rec.seen = [...seen].slice(-MAX_SEEN);
  save(uid, rec);
  if (!timers.has(uid)) schedule(uid, Math.max(rec.nextAt || 0, Date.now() + 5000));
  return added;
}

async function autojoin(ctx) {
  const { args, account } = ctx;
  const uid = String(account.userId);
  const sub = String(args[0] || "status").toLowerCase();
  const rec = recOf(uid);

  if (sub === "on" || sub === "off") {
    rec.on = sub === "on";
    save(uid, rec);
    if (rec.on && rec.queue.length && !timers.has(uid)) schedule(uid, Math.max(rec.nextAt || 0, Date.now() + 5000));
    if (!rec.on) {
      clearTimeout(timers.get(uid));
      timers.delete(uid);
    }
  } else if (sub === "clear") {
    const n = rec.queue.length;
    rec.queue = [];
    save(uid, rec);
    clearTimeout(timers.get(uid));
    timers.delete(uid);
    return edit(ctx, `\u2705 Antrian AutoJoin dikosongkan (${n} link dihapus).`);
  } else if (sub === "jeda") {
    const a = parseInt(args[1], 10), b = parseInt(args[2], 10);
    if (!(a >= 5 && b >= a && b <= 180)) return edit(ctx, "Guna: .autojoin jeda <min> <max>  (menit, min 5, maks 180). Contoh: .autojoin jeda 10 20");
    rec.min = a;
    rec.max = b;
    save(uid, rec);
  } else if (sub === "list") {
    if (!rec.queue.length) return edit(ctx, "\u26A0\uFE0F Antrian AutoJoin kosong.");
    return show(ctx, card(style({
      title: "Antrian AutoJoin", icon: "link", lead: `${rec.queue.length} link menunggu`,
      rows: rec.queue.slice(0, 15).map((q, i) => ["link", `${i + 1}.`, esc(q.kind === "inv" ? "link undangan ..." + q.key.slice(-6) : "@" + q.key)]),
      checks: [[true, "Kosongkan: .autojoin clear"]],
      footer: footerOf(account),
    }, USE_AUTO)));
  } else if (sub !== "status") {
    return edit(ctx, "Guna:\n" + USE_AUTO);
  }

  const cur = recOf(uid);
  return show(ctx, card(style({
    title: `AutoJoin ${cur.on ? "Aktif" : "Mati"}`, icon: "link", lead: "Bergabung otomatis ke grup dari link yang masuk ke akun Anda",
    rows: [
      ["gear", "Status", cur.on ? "<b>AKTIF</b> (membaca semua pesan masuk)" : "<b>MATI</b>"],
      ["time", "Jeda tiap permintaan", `${cur.min} - ${cur.max} menit (acak)`],
      ["chart", "Antrian", String(cur.queue.length)],
      ["ok", "Berhasil / Gagal", `${cur.joined} / ${cur.failed}`],
      ["tag", "Terakhir", esc(cur.last || "-")],
      ["time", "Berikutnya", cur.on && cur.queue.length && cur.nextAt ? `${esc(fmtTime(cur.nextAt, true))} ${esc(TZL)}` : "-"],
    ],
    checks: [[cur.on, cur.on ? "Link grup di pesan masuk otomatis diantrekan" : "Nyalakan dengan .autojoin on"], [true, "Channel siaran dilewati"]],
    footer: footerOf(account),
  }, USE_AUTO)));
}

// Pembaca link: dipasang pada setiap klien userbot; hanya bekerja saat autojoin aktif
function onClient(entry) {
  const uid = String(entry.userId);
  entry.client.addEventHandler(async (ev) => {
    try {
      const m = ev.message;
      if (!m || m.out) return;
      const rec = (db.getUser(uid) || {}).autojoin;
      if (!rec || !rec.on) return;
      const links = extractLinks(m.message, m.entities);
      if (links.length) enqueue(uid, links);
    } catch (err) {
      console.error("[autojoin] baca pesan:", err.message);
    }
  }, new NewMessage({ incoming: true }));
  const rec = recOf(uid);
  if (rec.on && rec.queue.length && !timers.has(uid)) schedule(uid, Math.max(rec.nextAt || 0, Date.now() + 30000));
}

module.exports = {
  name: "join",
  category: "MENU SHARE AUTO PROMOSI",
  help: [
    { cmd: "joingb", alias: [], desc: "ubot bergabung ke grup lewat link: .joingb <link> [link lain] (atau balas pesan berisi link)" },
    { cmd: "joinfolder", alias: [], desc: "pasang folder grup lewat link addlist dan join semua grup di dalamnya: .joinfolder <link>" },
    { cmd: "autojoin", alias: [], desc: "baca link grup dari semua pesan masuk dan join otomatis, jeda acak 10-20 menit: .autojoin on|off|status|list|clear|jeda" },
  ],
  onClient,
  commands: { joingb, joinfolder: joinfolderCmd, autojoin },
  _extract: extractLinks,
};

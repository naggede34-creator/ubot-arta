// Blacklist broadcast: chat yang disenaraikan di sini dilangkau semasa .bc
const { shared, esc, em, normId } = require("../core");
const db = require("../db");
const { showPanel } = require("../panel");

// ===== Emoji premium =====
const E = {
  ok: "5260726538302660868", // \u2705 tajuk
  plus: "5258108352008823107", // \u2795
  label: "5296348778012361146", // \uD83C\uDFF7 Nama
  gear: "5368589393491669392", // \u2699\uFE0F ID
  user: "5258362837411045098", // \uD83D\uDC64 Jenis
  chart: "5231200819986047254", // \uD83D\uDCCA Jumlah
  green: "5416081784641168838", // \uD83D\uDFE2 Status
  mega: "5411503950799060151", // \uD83D\uDD08 broadcast
  hour: "5352940967911517739", // \u23F3 Masa
  star: "6320831596324721328", // \u2B50
  rex: "6235524376070984680", // \uD83E\uDD96
  f1: "6244617272808183303", // \uD83E\uDEB6
  f2: "6242011198322119983", // \uD83E\uDEB6
};

const USAGE =
  "Guna:\n" +
  "\u2022 .addbl  \u2192 tambah chat ini ke blacklist\n" +
  "\u2022 .addbl <ID>  atau  .addbl @username  \u2192 tambah chat lain\n" +
  "\u2022 .delbl [ID | @username]  \u2192 buang\n" +
  "\u2022 .listbl  \u2192 senarai blacklist\n" +
  "\u2022 .clearbl  \u2192 kosongkan semua";

const getList = (userId) => ((db.getUser(userId) || {}).blacklist || []).slice();
const saveList = (userId, list) => db.upsertUser(userId, { blacklist: list });
const clip = (s, n = 32) => (String(s).length > n ? String(s).slice(0, n - 1) + "\u2026" : String(s));
const whoOf = (a) => (a.username ? `@${esc(a.username)}` : esc(a.name || "-"));

// Terangkan sesuatu chat: { id (ID penuh), key (dinormalkan), title, type }
function describe(ent, idHint) {
  const cls = ent && ent.className;
  let type = "?";
  let title = "-";
  let id = String(idHint || (ent && ent.id) || "");
  if (cls === "Channel") {
    type = ent.broadcast ? "Channel" : "Group";
    title = ent.title;
    if (!idHint) id = `-100${ent.id}`;
  } else if (cls === "Chat") {
    type = "Group";
    title = ent.title;
    if (!idHint) id = `-${ent.id}`;
  } else if (cls === "User") {
    type = "Personal";
    title = [ent.firstName, ent.lastName].filter(Boolean).join(" ") || ent.username || "-";
    if (!idHint) id = String(ent.id);
  }
  return { id, key: normId(id), title: title || "-", type };
}

// Sasaran: tiada argumen = chat semasa; ID / @username / pautan t.me = chat lain
async function resolveTarget({ client, msg, args }) {
  const arg = String(args[0] || "").trim();
  if (!arg) {
    let chat = null;
    try {
      chat = await msg.getChat();
    } catch (_) {}
    return describe(chat, msg.chatId !== undefined ? String(msg.chatId) : "");
  }
  if (/^-?\d{5,20}$/.test(arg)) {
    let ent = null;
    try {
      ent = await client.getEntity(arg);
    } catch (_) {}
    const d = describe(ent, arg); // ID dikekalkan seperti yang ditaip
    return d;
  }
  const uname = arg.replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "").replace(/[/?].*$/, "");
  if (/^[A-Za-z][A-Za-z0-9_]{3,}$/.test(uname)) {
    try {
      const ent = await client.getEntity(uname);
      return describe(ent);
    } catch (_) {
      throw new Error(`Chat ${arg} tidak ditemui.`);
    }
  }
  throw new Error("Format tidak sah.");
}

// ===== Panel Rich =====
function infoPanel({ title, t, total, status, account }) {
  const w = whoOf(account);
  const rows = [
    [E.label, "\uD83C\uDFF7", "Nama", `<b>${esc(clip(t.title))}</b>`],
    [E.gear, "\u2699\uFE0F", "ID", `<code>${esc(t.id)}</code>`],
    [E.user, "\uD83D\uDC64", "Jenis", esc(t.type)],
    [E.chart, "\uD83D\uDCCA", "Jumlah Blacklist", `${total} chat`],
    [E.green, "\uD83D\uDFE2", "Status", esc(status)],
  ];
  const html =
    `<h3>${em(E.ok, "\u2705")} ${esc(title)}</h3>` +
    `<table bordered><tr><th>Info</th><th>Nilai</th></tr>` +
    rows.map(([id, fb, k, v]) => `<tr><td>${em(id, fb)} ${k}</td><td>${v}</td></tr>`).join("") +
    `</table>` +
    `<footer>${require("../ui").footerOf(account)}</footer>`;
  const text =
    `${em(E.ok, "\u2705")} <b>${esc(title)}</b>\n\n` +
    rows.map(([id, fb, k, v]) => `${em(id, fb)} ${k} : ${v}`).join("\n") +
    `\n\n<i>${require("../ui").footerOf(account)}</i>`;
  return { html, text };
}

function listPanel(list, account) {
  const w = whoOf(account);
  const shown = list.slice(0, 30);
  const more = list.length - shown.length;
  const html =
    `<h3>${em(E.mega, "\uD83D\uDD08")} Senarai Blacklist</h3>` +
    `<p>${em(E.chart, "\uD83D\uDCCA")} <b>${list.length}</b> chat dilangkau semasa broadcast.</p>` +
    `<table bordered><tr><th>No</th><th>Chat</th><th>ID</th></tr>` +
    shown.map((e, i) => `<tr><td>${i + 1}</td><td>${esc(clip(e.title, 26))} <i>(${esc(e.type)})</i></td><td><code>${esc(e.id)}</code></td></tr>`).join("") +
    `</table>` +
    (more > 0 ? `<p>\u2026 dan ${more} lagi.</p>` : "") +
    `<footer>${require("../ui").footerOf(account)}</footer>`;
  const text =
    `${em(E.mega, "\uD83D\uDD08")} <b>Senarai Blacklist</b>\n${em(E.chart, "\uD83D\uDCCA")} ${list.length} chat dilangkau semasa broadcast\n\n` +
    shown.map((e, i) => `${i + 1}. ${esc(clip(e.title, 26))} (${esc(e.type)}) \u2014 <code>${esc(e.id)}</code>`).join("\n") +
    (more > 0 ? `\n\u2026 dan ${more} lagi.` : "") +
    `\n\n<i>${require("../ui").footerOf(account)}</i>`;
  return { html, text };
}

function clearPanel(count, account) {
  const w = whoOf(account);
  const html =
    `<h3>${em(E.ok, "\u2705")} Blacklist Dikosongkan</h3>` +
    `<table bordered><tr><th>Info</th><th>Nilai</th></tr>` +
    `<tr><td>${em(E.plus, "\u2795")} Dibuang</td><td>${count} chat</td></tr>` +
    `<tr><td>${em(E.chart, "\uD83D\uDCCA")} Baki</td><td>0 chat</td></tr>` +
    `<tr><td>${em(E.green, "\uD83D\uDFE2")} Status</td><td>semua chat akan menerima broadcast</td></tr></table>` +
    `<footer>${require("../ui").footerOf(account)}</footer>`;
  const text = `${em(E.ok, "\u2705")} <b>Blacklist Dikosongkan</b>\n${em(E.plus, "\u2795")} Dibuang : ${count} chat\n${em(E.chart, "\uD83D\uDCCA")} Baki : 0 chat\n\n<i>${require("../ui").footerOf(account)}</i>`;
  return { html, text };
}

async function show(ctx, panel, fallbackText) {
  const { client, msg, account } = ctx;
  try {
    await showPanel({ client, msg, account, html: panel.html, text: panel.text });
  } catch (err) {
    console.error("Blacklist: panel gagal, guna teks biasa:", err.message);
    await client.editMessage(msg.peerId, { message: msg.id, text: fallbackText });
  }
}

// ===== Arahan =====
async function addbl(ctx) {
  const { client, msg, account } = ctx;
  const edit = (t) => client.editMessage(msg.peerId, { message: msg.id, text: t });
  let t;
  try {
    t = await resolveTarget(ctx);
  } catch (err) {
    return edit(`\u26A0\uFE0F ${err.message}\n\n${USAGE}`);
  }
  if (!t.key) return edit(`\u26A0\uFE0F Chat tidak dapat dikenal pasti.\n\n${USAGE}`);

  const list = getList(account.userId);
  const exists = list.some((e) => e.key === t.key);
  if (!exists) {
    list.push({ key: t.key, id: t.id, title: t.title, type: t.type, at: Date.now() });
    saveList(account.userId, list);
  }
  const panel = infoPanel({
    title: exists ? "Sudah dalam Blacklist" : "Ditambah ke Blacklist",
    t, total: list.length, account,
    status: exists ? "sudah ada, tiada perubahan" : "dilangkau semasa broadcast",
  });
  await show(ctx, panel, `\u2705 ${exists ? "Sudah dalam blacklist" : "Ditambah ke blacklist"}: ${t.title} (${t.id}). Jumlah: ${list.length}`);
}

async function delbl(ctx) {
  const { client, msg, account } = ctx;
  const edit = (x) => client.editMessage(msg.peerId, { message: msg.id, text: x });
  let t;
  try {
    t = await resolveTarget(ctx);
  } catch (err) {
    return edit(`\u26A0\uFE0F ${err.message}\n\n${USAGE}`);
  }
  const list = getList(account.userId);
  const found = list.find((e) => e.key === t.key);
  if (require("../lib/defaultBl").isDefaultKey(t.key)) return edit(`\uD83D\uDD12 ${t.title !== "-" ? t.title : t.id} adalah blacklist bawaan ARTA, tidak bisa dihapus.`);
  if (!found) return edit(`\u2139\uFE0F ${t.title !== "-" ? t.title : t.id} tiada dalam blacklist.`);
  const rest = list.filter((e) => e.key !== t.key);
  saveList(account.userId, rest);
  const panel = infoPanel({
    title: "Dibuang dari Blacklist",
    t: { ...t, title: found.title || t.title, type: found.type || t.type, id: found.id || t.id },
    total: rest.length, account, status: "akan menerima broadcast semula",
  });
  await show(ctx, panel, `\u2705 Dibuang dari blacklist: ${found.title} (${found.id}). Jumlah: ${rest.length}`);
}

async function listbl(ctx) {
  const list = getList(ctx.account.userId);
  const dflt = require("../lib/defaultBl").list();
  const dfltText = "\uD83D\uDD12 Bawaan (otomatis, tidak bisa dihapus):\n" + dflt.map((e) => `\u2022 ${e.title} (${e.id})`).join("\n");
  if (!list.length) return ctx.client.editMessage(ctx.msg.peerId, { message: ctx.msg.id, text: `\u2139\uFE0F Blacklist Anda kosong. Guna .addbl di chat yang mahu dilangkau.\n\n${dfltText}` });
  await show(ctx, listPanel(list, ctx.account), `Blacklist (${list.length}):\n` + list.slice(0, 30).map((e, i) => `${i + 1}. ${e.title} (${e.id})`).join("\n") + `\n\n${dfltText}`);
}

async function clearbl(ctx) {
  const list = getList(ctx.account.userId);
  if (!list.length) return ctx.client.editMessage(ctx.msg.peerId, { message: ctx.msg.id, text: "\u2139\uFE0F Blacklist sudah kosong." });
  saveList(ctx.account.userId, []);
  await show(ctx, clearPanel(list.length, ctx.account), `\u2705 Blacklist dikosongkan (${list.length} chat dibuang).`);
}

module.exports = {
  name: "blacklist",
  category: "MENU SHARE AUTO PROMOSI",
  help: [
    { cmd: "addbl", alias: [], desc: "tambah chat ke blacklist broadcast (kosong = chat ini, atau ID / @username)" },
    { cmd: "delbl", alias: [], desc: "buang chat dari blacklist" },
    { cmd: "listbl", alias: [], desc: "senarai blacklist" },
    { cmd: "clearbl", alias: [], desc: "kosongkan semua blacklist" },
  ],
  commands: { addbl, delbl, listbl, clearbl },
};

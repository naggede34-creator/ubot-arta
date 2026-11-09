// Simpan apa-apa (gambar QR, fail, teks) dengan nama sendiri, dan ambil semula dengan .get
//   .setqr [label]        .set <nama> [label]       .setnenek     (balas mesej / hantar gambar bercapsyen .setqr)
//   .get qr rm5 catatan   .getqr rm5 catatan        .getnenek     .listset    .delset <nama>
const fs = require("fs");
const path = require("path");
const { shared, esc, em, fmtTime, TZL } = require("../core");
const db = require("../db");
const { showPanel } = require("../panel");

// ===== Emoji premium =====
const E = {
  bolt: "5456140674028019486", // \u26A1 tajuk
  fire: "5424972470023104089", // \uD83D\uDD25
  gem: "6276228098962754124", // \uD83D\uDC8E Nominal
  label: "5296348778012361146", // \uD83C\uDFF7 Penerima / Nama
  box: "5258134813302332906", // \uD83D\uDCE6 Catatan / Jenis
  hour: "5352940967911517739", // \u23F3 Masa
  green: "5416081784641168838", // \uD83D\uDFE2 Status
  ok: "5260726538302660868", // \u2705
  chart: "5231200819986047254", // \uD83D\uDCCA Jumlah
  user: "5258362837411045098", // \uD83D\uDC64
  star: "6320831596324721328", // \u2B50
  rex: "6235524376070984680", // \uD83E\uDD96
  f1: "6244617272808183303", // \uD83E\uDEB6
  f2: "6242011198322119983", // \uD83E\uDEB6
};

const ROOT = path.join(__dirname, "..", "data", "saved");
const MAX_ITEMS = 50;
const MAX_BYTES = 20 * 1024 * 1024;

const cleanName = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20);
const itemsOf = (uid) => (db.getUser(uid) || {}).saved || {};
const saveItems = (uid, all) => db.upsertUser(uid, { saved: all });
const isQr = (key) => key.startsWith("qr");
const whoOf = (a) => (a.username ? `@${esc(a.username)}` : esc(a.name || "-"));
const clip = (s, n = 40) => (String(s).length > n ? String(s).slice(0, n - 1) + "\u2026" : String(s));
const { footerOf } = require("../ui");
const footer = (a) => `<footer>${footerOf(a)}</footer>`;
const footerText = (a) => `<i>${footerOf(a)}</i>`;

// Nominal: rm5 | RM 5 | 5 | rm5.50 | 10,5 | $10 | usd10 ...
function parseAmount(tokens) {
  const CUR = "rm|myr|usd|sgd|idr|rp|\\$";
  const norm = (c) => (!c || /^myr$/i.test(c) ? "RM" : c.toUpperCase());
  const fmt = (n) => (/[.,]/.test(n) ? Number(n.replace(",", ".")).toFixed(2) : n);
  const first = tokens[0] || "";
  let m = first.match(new RegExp(`^(${CUR})?(\\d+(?:[.,]\\d{1,2})?)$`, "i"));
  if (m) return { text: `${norm(m[1])}${fmt(m[2])}`, used: 1 };
  m = first.match(new RegExp(`^(${CUR})$`, "i"));
  if (m && /^\d+(?:[.,]\d{1,2})?$/.test(tokens[1] || "")) return { text: `${norm(m[1])}${fmt(tokens[1])}`, used: 2 };
  return null;
}

// ===== Panel Rich =====
function table(title, rows, account, extraHtml = "", extraText = "") {
  const html =
    `<h3>${em(E.bolt, "\u26A1")} ${esc(title)} ${em(E.fire, "\uD83D\uDD25")}</h3>` +
    `<table bordered><tr><th>Info</th><th>Nilai</th></tr>` +
    rows.map(([id, fb, k, v]) => `<tr><td>${em(id, fb)} ${k}</td><td>${v}</td></tr>`).join("") +
    `</table>` +
    extraHtml +
    footer(account);
  const text =
    `${em(E.bolt, "\u26A1")} <b>${esc(title)}</b> ${em(E.fire, "\uD83D\uDD25")}\n\n` +
    rows.map(([id, fb, k, v]) => `${em(id, fb)} ${k} : ${v}`).join("\n") +
    (extraText ? `\n\n${extraText}` : "") +
    `\n\n${footerText(account)}`;
  return { html, text };
}

function qrPanel({ item, key, amount, note, account }) {
  const rows = [
    [E.gem, "\uD83D\uDC8E", "Nominal", amount ? `<b>${esc(amount)}</b>` : "-"],
    [E.label, "\uD83C\uDFF7", "Penerima", esc(clip(item.label || key.toUpperCase()))],
  ];
  if (note) rows.push([E.box, "\uD83D\uDCE6", "Catatan", esc(clip(note, 120))]);
  rows.push([E.hour, "\u23F3", "Masa", `${fmtTime(Date.now())} ${TZL}`]);
  rows.push([E.green, "\uD83D\uDFE2", "Status", "menunggu pembayaran"]);

  const checks =
    `<ul><li><input type="checkbox" checked>${em(E.ok, "\u2705")} Imbas kod QR di atas</li>` +
    `<li><input type="checkbox">${em(E.hour, "\u23F3")} Hantar bukti pembayaran</li></ul>`;
  const checksText = `\u2611 ${em(E.ok, "\u2705")} Imbas kod QR di atas\n\u2610 ${em(E.hour, "\u23F3")} Hantar bukti pembayaran`;
  return table("Pembayaran QR", rows, account, checks, checksText);
}

function genericPanel({ item, key, note, account }) {
  const rows = [
    [E.label, "\uD83C\uDFF7", "Nama", esc(key)],
    [E.box, "\uD83D\uDCE6", "Jenis", esc(item.type)],
    [E.star, "\u2B50", "Catatan", esc(clip(note, 120))],
    [E.hour, "\u23F3", "Masa", `${fmtTime(Date.now())} ${TZL}`],
  ];
  return table("Maklumat", rows, account);
}

function savedPanel({ key, item, total, account, replaced }) {
  const rows = [
    [E.label, "\uD83C\uDFF7", "Nama", `<b>${esc(key)}</b>`],
    [E.box, "\uD83D\uDCE6", "Jenis", esc(item.type === "photo" ? "gambar" : item.type === "file" ? "fail" : "teks")],
  ];
  if (item.label) rows.push([E.user, "\uD83D\uDC64", "Label", esc(clip(item.label))]);
  rows.push([E.chart, "\uD83D\uDCCA", "Jumlah Simpanan", `${total} item`]);
  rows.push([E.green, "\uD83D\uDFE2", "Status", replaced ? "diganti" : "disimpan"]);
  return table(replaced ? "Simpanan Dikemas Kini" : "Berjaya Disimpan", rows, account);
}

function listPanel(all, account) {
  const keys = Object.keys(all).sort();
  const rows = keys.slice(0, 40).map((k, i) => {
    const it = all[k];
    const jenis = it.type === "photo" ? "gambar" : it.type === "file" ? "fail" : "teks";
    return `<tr><td>${i + 1}</td><td><code>${esc(k)}</code></td><td>${jenis}${it.label ? ` \u00B7 ${esc(clip(it.label, 20))}` : ""}</td></tr>`;
  });
  const html =
    `<h3>${em(E.bolt, "\u26A1")} Senarai Simpanan ${em(E.fire, "\uD83D\uDD25")}</h3>` +
    `<p>${em(E.chart, "\uD83D\uDCCA")} <b>${keys.length}</b> item. Ambil dengan <code>.get nama</code> atau <code>.getnama</code>.</p>` +
    `<table bordered><tr><th>No</th><th>Nama</th><th>Jenis</th></tr>${rows.join("")}</table>` +
    footer(account);
  const text =
    `${em(E.bolt, "\u26A1")} <b>Senarai Simpanan</b>\n${em(E.chart, "\uD83D\uDCCA")} ${keys.length} item\n\n` +
    keys.slice(0, 40).map((k, i) => `${i + 1}. <code>${esc(k)}</code> (${all[k].type})`).join("\n") +
    `\n\n${footerText(account)}`;
  return { html, text };
}

async function show(ctx, replyMsg, panel, fallbackText) {
  const { client, msg, account } = ctx;
  try {
    await showPanel({ client, msg: replyMsg, account, html: panel.html, text: panel.text });
  } catch (err) {
    console.error("Simpanan: panel gagal, guna teks biasa:", err.message);
    await client.sendMessage(msg.peerId, { message: fallbackText, replyTo: replyMsg.id });
  }
}

// ===== .set =====
async function doSet(ctx, key, labelText, { explicit }) {
  const { client, msg, account } = ctx;
  const edit = (t) => client.editMessage(msg.peerId, { message: msg.id, text: t });
  if (!key) {
    if (explicit) await edit("Guna: .set <nama> [label]  (balas gambar/fail/teks)\nContoh: .setqr Maybank Ali   atau   .setnenek");
    return explicit;
  }
  // sumber: gambar/fail pada mesej arahan itu sendiri (capsyen), atau mesej yang dibalas
  const rm = msg.media && msg.media.className !== "MessageMediaWebPage" ? msg : await msg.getReplyMessage();
  const hasMedia = !!(rm && rm.media && rm.media.className !== "MessageMediaWebPage");
  const hasText = !!(rm && rm !== msg && rm.message);
  if (!rm || (!hasMedia && !hasText)) {
    if (explicit) await edit(`\u26A0\uFE0F Balas (reply) gambar, fail atau teks yang mahu disimpan sebagai "${key}".`);
    return explicit; // .set<nama> tanpa sumber: abaikan senyap-senyap
  }

  const all = { ...itemsOf(account.userId) };
  const replaced = !!all[key];
  if (!replaced && Object.keys(all).length >= MAX_ITEMS) return edit(`\u26A0\uFE0F Had ${MAX_ITEMS} simpanan dicapai. Guna .delset <nama> untuk membuang.`).then(() => true);

  const label = String(labelText || "").trim();
  let item;
  if (hasMedia) {
    const size = (rm.file && rm.file.size) || 0;
    if (size > MAX_BYTES) { await edit("\u26A0\uFE0F Fail terlalu besar (maksimum 20MB)."); return true; }
    const buf = await client.downloadMedia(rm, {});
    if (!buf || !buf.length) { await edit("\u26A0\uFE0F Gagal memuat turun media itu."); return true; }
    const ext = (rm.file && rm.file.ext) || ".jpg";
    const rel = path.join(String(account.userId), `${key}${ext}`);
    fs.mkdirSync(path.dirname(path.join(ROOT, rel)), { recursive: true });
    if (replaced && all[key].file && all[key].file !== rel) fs.rmSync(path.join(ROOT, all[key].file), { force: true });
    fs.writeFileSync(path.join(ROOT, rel), buf);
    item = { type: rm.photo ? "photo" : "file", file: rel, label, caption: rm.message || "", at: Date.now() };
  } else {
    if (replaced && all[key].file) fs.rmSync(path.join(ROOT, all[key].file), { force: true });
    item = { type: "text", text: rm.message, label, at: Date.now() };
  }
  all[key] = item;
  saveItems(account.userId, all);

  await show(ctx, msg, savedPanel({ key, item, total: Object.keys(all).length, account, replaced }),
    `\u2705 ${replaced ? "Diganti" : "Disimpan"}: ${key} (${item.type}). Jumlah: ${Object.keys(all).length}`);
  return true;
}

// ===== .get =====
async function doGet(ctx, key, args, { explicit }) {
  const { client, msg, account } = ctx;
  const edit = (t) => client.editMessage(msg.peerId, { message: msg.id, text: t });
  const item = itemsOf(account.userId)[key];
  if (!item) {
    if (explicit) await edit(key ? `\u26A0\uFE0F Tiada simpanan bernama "${key}". Guna .listset untuk senarai.` : "Guna: .get <nama> [nominal] [catatan]\nContoh: .get qr rm5 topup game");
    return explicit; // .get<nama> yang tiada: abaikan senyap-senyap
  }

  // hantar item itu
  let sentMsg;
  if (item.type === "text") {
    sentMsg = await client.sendMessage(msg.peerId, { message: item.text, replyTo: msg.id });
  } else {
    const file = path.join(ROOT, item.file);
    if (!fs.existsSync(file)) { await edit(`\u26A0\uFE0F Fail "${key}" tiada lagi di server. Simpan semula dengan .set.`); return true; }
    sentMsg = await client.sendFile(msg.peerId, { file, replyTo: msg.id });
  }
  const replyTo = { peerId: msg.peerId, id: (sentMsg && sentMsg.id) || msg.id };

  // jadual Rich: QR sentiasa; item lain hanya jika ada teks tambahan
  const tokens = args.filter(Boolean);
  if (isQr(key)) {
    const amt = parseAmount(tokens);
    const note = tokens.slice(amt ? amt.used : 0).join(" ");
    const panel = qrPanel({ item, key, amount: amt && amt.text, note, account });
    await show(ctx, replyTo, panel, `Pembayaran QR\nNominal: ${amt ? amt.text : "-"}\nPenerima: ${item.label || key}${note ? `\nCatatan: ${note}` : ""}\nStatus: menunggu pembayaran`);
  } else if (tokens.length) {
    const note = tokens.join(" ");
    await show(ctx, replyTo, genericPanel({ item, key, note, account }), `${key}: ${note}`);
  }
  return true;
}

// ===== Arahan eksplisit =====
const setCmd = (ctx) => doSet(ctx, cleanName(ctx.args[0]), ctx.args.slice(1).join(" "), { explicit: true });
const getCmd = (ctx) => doGet(ctx, cleanName(ctx.args[0]), ctx.args.slice(1), { explicit: true });

async function listCmd(ctx) {
  const all = itemsOf(ctx.account.userId);
  if (!Object.keys(all).length) {
    return ctx.client.editMessage(ctx.msg.peerId, { message: ctx.msg.id, text: "\u2139\uFE0F Tiada simpanan. Guna .setqr atau .set <nama> (balas gambar/teks)." });
  }
  await show(ctx, ctx.msg, listPanel(all, ctx.account), "Simpanan: " + Object.keys(all).sort().join(", "));
}

async function delCmd(ctx) {
  const { client, msg, account } = ctx;
  const key = cleanName(ctx.args[0]);
  const all = { ...itemsOf(account.userId) };
  if (!key || !all[key]) return client.editMessage(msg.peerId, { message: msg.id, text: key ? `\u26A0\uFE0F Tiada simpanan bernama "${key}".` : "Guna: .delset <nama>" });
  if (all[key].file) fs.rmSync(path.join(ROOT, all[key].file), { force: true });
  const it = all[key];
  delete all[key];
  saveItems(account.userId, all);
  await show(ctx, msg, table("Simpanan Dibuang", [
    [E.label, "\uD83C\uDFF7", "Nama", `<b>${esc(key)}</b>`],
    [E.chart, "\uD83D\uDCCA", "Baki", `${Object.keys(all).length} item`],
    [E.green, "\uD83D\uDFE2", "Status", "dibuang"],
  ], account), `\u2705 Dibuang: ${key}. Baki: ${Object.keys(all).length}`);
  void it;
}

// ===== Arahan dinamik: .set<nama> dan .get<nama> (contoh .setqr, .getnenek) =====
async function dynamic(ctx, name) {
  const m = name.match(/^(set|get)([a-z0-9_-]{1,20})$/);
  if (!m) return false;
  return m[1] === "set"
    ? doSet(ctx, m[2], ctx.args.join(" "), { explicit: false })
    : doGet(ctx, m[2], ctx.args, { explicit: false });
}

module.exports = {
  name: "saved",
  category: "Utilitas",
  help: [
    { cmd: "setqr", alias: ["set <nama>", "setnenek"], desc: "simpan gambar/fail/teks (balas mesej). Contoh: .setqr Maybank Ali" },
    { cmd: "getqr", alias: ["get <nama>", "getnenek"], desc: "ambil simpanan. QR + jadual: .get qr rm5 catatan" },
    { cmd: "listset", alias: [], desc: "senarai semua simpanan" },
    { cmd: "delset", alias: [], desc: "buang simpanan: .delset <nama>" },
  ],
  commands: { set: setCmd, get: getCmd, listset: listCmd, delset: delCmd },
  dynamic,
};

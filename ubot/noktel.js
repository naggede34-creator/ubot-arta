// ═══════════════════════════════════════════════════════════════════════
//  BELI NOKTEL / NOKOS TELEGRAM SIAP PAKAI  (menu di /start bot)
//
//  PEMBELI  (/start -> BELI NOKTEL):
//    Menu: Isi Saldo | Beli Noktel | Info Saldo | Riwayat Pesanan | Info Stok
//    Beli Noktel -> pilih kategori -> pilih ID noktel -> Bayar QRIS (otomatis) atau Bayar Saldo
//    Setelah lunas: nomor, ID akun, PIN 2FA dikirim otomatis. Pembeli login (disarankan Nicegram / Nekogram),
//    tekan [Minta OTP] -> bot meneruskan kode dari Telegram resmi (777000) di akun yang dibeli.
//    [Logout & Selesai] -> sesi bot di akun itu di-logout, data akun dihapus dari bot, status SOLD OUT.
//
//  OWNER  (PANEL OWNER -> Kelola Noktel, atau perintah):
//    /addnoktel          tambah stok: nomor -> kode login -> PIN 2FA (bila ada) -> kategori -> harga -> tersimpan
//    /listnoktel         daftar stok + status
//    /delnoktel ID       hapus stok (sesi bot di akun itu di-logout)
//    /addsaldonk ID JML  tambah / kurangi saldo noktel pengguna
//
//  Notifikasi ke channel (NOTIFY_CHANNEL_ID): deposit pending, deposit sukses, beli noktel, kode OTP diterima,
//  noktel berhasil dibeli, pembeli sudah login, noktel selesai (logout). Nomor disamarkan; kode OTP / PIN TIDAK dikirim ke channel.
//
//  Data: data/noktel.json (stok + sesi + saldo + pesanan) -> ikut Backup. Pembayaran: gateway QRIS yang sama dengan Beli Role / Produk.
//  config.json (opsional): "noktel": { "min_deposit": 5000, "max_deposit": 5000000, "presets": [5000,10000,20000,50000,100000] }
// ═══════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const db = require("./db");
const access = require("./access");
const gw = require("./gateway");
const qr = require("./qr");
const { cfg, tg, esc, btn, pair, fmtTime, TZL, premiumOn } = require("./core");
const UI = require("./botui");

const TG_OFFICIAL = 777000;
const FILE = path.join(__dirname, "data", "noktel.json");
const PAGE = 8;
const LISTEN_MS = 3 * 60 * 1000; // pantauan kode OTP / login setelah tombol Minta OTP ditekan
const ASK_TIMEOUT = 5 * 60 * 1000;
const conf = () => cfg.noktel || {};
const MIN_DEP = () => Math.max(1000, Number(conf().min_deposit) || 5000);
const MAX_DEP = () => Number(conf().max_deposit) || 5000000;
const PRESETS = () => (Array.isArray(conf().presets) && conf().presets.length ? conf().presets : [5000, 10000, 20000, 50000, 100000]).map(Number).filter((n) => n >= MIN_DEP()).slice(0, 6);

const rp = (n) => "Rp" + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const clip = (s, n = 30) => (String(s).length > n ? String(s).slice(0, n - 1) + "\u2026" : String(s));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isOwner = (id) => access.isOwner(id);
const ownerId = () => String((Array.isArray(cfg.owner_ids) && cfg.owner_ids[0]) || cfg.owner_id || "");
const creds = () => (ownerId() ? gw.credsFor(ownerId(), { sales: true }) : null);
const nkId = (id) => "NK-" + String(id).padStart(4, "0");
const ordId = (no) => "NKO-" + String(no).padStart(4, "0");
const depId = (no) => "DEP-" + String(no).padStart(4, "0");
const fullName = (u) => [u.first_name, u.last_name].filter(Boolean).join(" ") || "-";
const mask = (p) => { const s = String(p || ""); return s.length > 8 ? s.slice(0, Math.min(5, s.length - 6)) + "xxxx" + s.slice(-3) : s; };
const catKey = (n) => crypto.createHash("md5").update(String(n).trim().toLowerCase()).digest("base64url").slice(0, 6);
const userObj = (o) => ({ id: o.userId, name: o.name, username: o.username });
const fire = (kind, o, extra) => { try { require("./notify").fire(kind, userObj(o), extra); } catch (_) {} };

// ---------------------------------------------------------------- penyimpanan (data/noktel.json)
let S = { seq: { acc: 0, ord: 0, dep: 0 }, accounts: {}, orders: {}, deposits: {}, balances: {} };
try {
  const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
  S = { ...S, ...j, seq: { acc: 0, ord: 0, dep: 0, ...(j.seq || {}) } };
} catch (_) {}
function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(S, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}
const accs = () => Object.values(S.accounts);
const readyAccs = () => accs().filter((a) => a.status === "ready");
const bal = (uid) => Number(S.balances[String(uid)]) || 0;
function addBal(uid, n) { S.balances[String(uid)] = bal(uid) + Math.round(n); save(); return bal(uid); }
function takeBal(uid, n) { if (bal(uid) < n) return false; S.balances[String(uid)] = bal(uid) - Math.round(n); save(); return true; }

function cats() {
  const m = new Map();
  for (const a of readyAccs()) {
    const k = catKey(a.category);
    const c = m.get(k) || { key: k, name: a.category, items: [] };
    c.items.push(a);
    m.set(k, c);
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}
const minPrice = (items) => Math.min(...items.map((a) => a.price));
const allCatNames = () => [...new Map(accs().map((a) => [catKey(a.category), a.category])).values()].sort();
const waitingOrder = (uid) => Object.values(S.orders).find((o) => String(o.userId) === String(uid) && (o.status === "wait" || o.status === "creating")) || null;
const waitingDep = (uid) => Object.values(S.deposits).find((d) => String(d.userId) === String(uid) && (d.status === "wait" || d.status === "creating")) || null;

// ---------------------------------------------------------------- klien Telegram untuk akun yang dijual
const clients = new Map(); // accId -> { client, timer }
function touch(c) { clearTimeout(c.timer); c.timer = setTimeout(() => dropClient(c.id), 10 * 60 * 1000); if (c.timer.unref) c.timer.unref(); }
async function dropClient(id) {
  const c = clients.get(String(id));
  if (!c) return;
  clients.delete(String(id));
  clearTimeout(c.timer);
  try { await c.client.disconnect(); } catch (_) {}
}
async function getClient(acc) {
  const have = clients.get(String(acc.id));
  if (have && have.client.connected) { touch(have); return have.client; }
  if (have) await dropClient(acc.id);
  const client = new TelegramClient(new StringSession(acc.session), Number(cfg.api_id), cfg.api_hash, { connectionRetries: 3 });
  try { client.setLogLevel("none"); } catch (_) {}
  await client.connect();
  const c = { id: String(acc.id), client, timer: null };
  clients.set(c.id, c);
  touch(c);
  return client;
}
async function history(client) {
  try { return await client.getMessages(TG_OFFICIAL, { limit: 6 }); } catch (_) {
    await client.getDialogs({ limit: 30 }); // isi cache entitas, lalu coba lagi
    return client.getMessages(TG_OFFICIAL, { limit: 6 });
  }
}
function parseCode(text) {
  const t = String(text || "");
  const m = t.match(/(?:code|kode|c\u00f3digo|\u043a\u043e\u0434)\D{0,20}(\d{5,6})/i) || (/code|kode/i.test(t) ? t.match(/\b(\d{5})\b/) : null);
  return m ? m[1] : null;
}
async function latestCode(client, acc, o) {
  const since = Math.max(Number(o.lastOtpId) || 0, Number(acc.baseMsgId) || 0);
  const now = Date.now() / 1000;
  let best = null;
  for (const m of await history(client)) {
    if (!m || m.id <= since) continue;
    const text = String(m.message || m.text || "");
    const code = parseCode(text);
    if (!code || (m.date && now - Number(m.date) > 300)) continue; // hanya kode baru (maks 5 menit)
    if (!best || m.id > best.id) best = { id: m.id, code, text: text.trim().slice(0, 300) };
  }
  return best;
}
async function authList(client) {
  const r = await client.invoke(new Api.account.GetAuthorizations());
  return r.authorizations || [];
}
const DEAD = /AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED|AUTH_KEY_DUPLICATED|AUTH_KEY_INVALID/i;
const errMsg = (e) => String((e && (e.errorMessage || e.message)) || e);

// ---------------------------------------------------------------- QRIS (sama dengan produk)
async function qrImage(r) {
  if (r.qr_url) {
    const res = await fetch(r.qr_url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return Buffer.from(await res.arrayBuffer());
  }
  if (r.qris_image && /^data:image\/(png|jpe?g|webp);base64,/.test(r.qris_image)) return Buffer.from(r.qris_image.split(",")[1], "base64");
  if (r.payload) return qr.png(qr.matrix(r.payload), 10);
  throw new Error("gateway tidak mengembalikan gambar QR");
}
async function sendPhotoBuf(chatId, buf, caption, markup) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("photo", new Blob([buf], { type: require("./gateway").mimeOf(buf) }), "qris.png");
  form.append("caption", require("./lang").html(caption));
  form.append("parse_mode", "HTML");
  if (markup) form.append("reply_markup", JSON.stringify(markup));
  const res = await fetch(`https://api.telegram.org/bot${cfg.bot_token}/sendPhoto`, { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) throw new Error(`sendPhoto: ${j.description || "HTTP " + res.status}`);
  return j.result;
}
async function sendQr(chatId, img, caption, kb) {
  for (const fancy of premiumOn() ? [true, false] : [false]) {
    try { return await sendPhotoBuf(chatId, img, caption, { inline_keyboard: kb(fancy) }); } catch (e) { console.error("[noktel] kirim QR gagal:", e.message); }
  }
  return null;
}
const delMsg = (ref) => (ref ? tg("deleteMessage", { chat_id: ref.chat_id, message_id: ref.message_id }).catch(() => {}) : Promise.resolve());

// ---------------------------------------------------------------- kartu pembeli
function menuCard(uid) {
  const cs = cats();
  const total = cs.reduce((n, c) => n + c.items.length, 0);
  const c = UI.card({
    title: "Beli Noktel Telegram", icon: "gem",
    sub: "Nomor kosong (noktel) Telegram <b>siap pakai</b> \u2014 bayar QRIS, akun dikirim otomatis.",
    rows: [
      ["chart", "Saldo Noktel Anda", `<b>${rp(bal(uid))}</b>`],
      ["box", "Stok tersedia", `<b>${total}</b> akun \u00B7 ${cs.length} kategori`],
      ...cs.slice(0, 6).map((x) => ["tag", esc(clip(x.name, 26)), `${x.items.length} stok \u00B7 mulai <b>${rp(minPrice(x.items))}</b>`]),
    ],
    checks: [[true, "Bayar lewat QRIS otomatis atau saldo noktel"], [true, "Nomor, ID, dan PIN 2FA dikirim otomatis setelah lunas"], [true, "Kode OTP diteruskan bot dari Telegram resmi"]],
  });
  const kb = (fancy) => [
    pair(btn(fancy, "Isi Saldo", "nk:d", "success", UI.E.bolt), btn(fancy, "Beli Noktel", "nk:b", "success", UI.E.gem)),
    pair(btn(fancy, "Info Saldo", "nk:s", "primary", UI.E.chart), btn(fancy, "Riwayat Pesanan", "nk:r", "primary", UI.E.time)),
    pair(btn(fancy, "Info Stok", "nk:st", "primary", UI.E.box), btn(fancy, "Redeem Kode", "vc:r", "success", UI.E.tag)),
    ...(isOwner(uid) ? [[btn(fancy, "Kelola Noktel", "nk:om", "danger", UI.E.crown)]] : []),
    [btn(fancy, "Kembali", "home:p:0", "plain", UI.E.wave)],
  ];
  return { c, kb };
}
const menuKbBack = (fancy) => [[btn(fancy, "Menu Noktel", "nk:h", "primary", UI.E.gem)]];

function stockCard() {
  const cs = cats();
  return UI.card({
    title: "Info Stok Noktel", icon: "box", headers: ["Kategori", "Stok \u00B7 Harga"],
    sub: cs.length ? "Stok yang masih tersedia saat ini." : "Stok noktel sedang kosong.",
    rows: cs.length ? cs.slice(0, 25).map((x) => ["tag", esc(clip(x.name, 30)), `<b>${x.items.length}</b> \u00B7 mulai ${rp(minPrice(x.items))}`]) : [["info", "Stok", "Kosong"]],
  });
}

function buyCard() {
  const cs = cats();
  const c = UI.card({
    title: "Beli Noktel", icon: "gem", headers: ["Kategori", "Stok \u00B7 Harga"],
    sub: cs.length ? "Pilih <b>kategori</b> noktel yang tersedia." : "Stok noktel sedang kosong. Cek lagi nanti.",
    rows: cs.length ? cs.slice(0, 25).map((x) => ["tag", esc(clip(x.name, 30)), `<b>${x.items.length}</b> stok \u00B7 mulai ${rp(minPrice(x.items))}`]) : [["info", "Stok", "Kosong"]],
  });
  const kb = (fancy) => [...cs.slice(0, 20).map((x) => [btn(fancy, `${clip(x.name, 24)} \u00B7 ${x.items.length} stok`, `nk:c:${x.key}:0`, "primary", UI.E.box)]), [btn(fancy, "Kembali", "nk:h", "plain", UI.E.wave)]];
  return { c, kb };
}

function catCard(key, pg) {
  const cat = cats().find((x) => x.key === key);
  if (!cat) return buyCard();
  const items = cat.items.sort((a, b) => a.id - b.id);
  const pages = Math.max(1, Math.ceil(items.length / PAGE));
  const p = Math.min(Math.max(0, pg), pages - 1);
  const slice = items.slice(p * PAGE, (p + 1) * PAGE);
  const c = UI.card({
    title: esc(clip(cat.name, 40)), icon: "tag", headers: ["ID Noktel", "Nomor \u00B7 Harga"],
    sub: `${items.length} noktel tersedia \u2014 pilih ID di bawah untuk membeli.`,
    rows: slice.map((a) => ["tag", `<code>${nkId(a.id)}</code>`, `${esc(mask(a.phone))} \u00B7 <b>${rp(a.price)}</b>`]),
    note: pages > 1 ? `Halaman ${p + 1} dari ${pages}` : "",
  });
  const kb = (fancy) => [
    ...slice.map((a) => [btn(fancy, `${nkId(a.id)} \u00B7 ${rp(a.price)}`, `nk:i:${a.id}`, "success", UI.E.gem)]),
    ...(pages > 1 ? [pair(btn(fancy, "\u25C0\uFE0F Prev", `nk:c:${key}:${(p - 1 + pages) % pages}`, "primary"), btn(fancy, "Next \u25B6\uFE0F", `nk:c:${key}:${(p + 1) % pages}`, "primary"))] : []),
    [btn(fancy, "Kembali", "nk:b", "plain", UI.E.wave)],
  ];
  return { c, kb };
}

const discOf = (uid, price) => { try { return require("./voucher").priceFor(uid, price, "noktel"); } catch (_) { return { final: price, cut: 0, code: null }; } };
const consumeDisc = (o) => { if (o && o.disc && o.disc.code) { try { require("./voucher").consume(o.userId, o.disc.code); } catch (_) {} } };
function itemCard(a, uid) {
  const dc = discOf(uid, a.price);
  const pl = dc.cut ? `${rp(dc.final)} (diskon ${rp(dc.cut)})` : rp(a.price);
  const c = UI.card({
    title: `Noktel ${nkId(a.id)}`, icon: "gem",
    rows: [
      ["tag", "ID Noktel", `<code>${nkId(a.id)}</code>`],
      ["box", "Kategori", `<b>${esc(clip(a.category, 40))}</b>`],
      ["user", "Nomor", esc(mask(a.phone))],
      ["chart", "Harga", dc.cut ? `<s>${rp(a.price)}</s> <b>${rp(dc.final)}</b>` : `<b>${rp(a.price)}</b>`],
      ...(dc.cut ? [["tag", "Diskon aktif", `<code>${esc(dc.code)}</code> \u2212${rp(dc.cut)}`]] : []),
      ["bolt", "Saldo Anda", rp(bal(uid))],
    ],
    checks: [[true, "Bayar QRIS \u2014 akun dikirim otomatis setelah lunas"], [true, "Bayar saldo \u2014 akun langsung dikirim"], [true, "Tombol Minta OTP meneruskan kode login dari Telegram"]],
  });
  const kb = (fancy) => [
    [btn(fancy, `Bayar QRIS \u00B7 ${pl}`, `nk:q:${a.id}`, "success", UI.E.bolt)],
    [btn(fancy, `Bayar Saldo \u00B7 ${pl}`, `nk:y:${a.id}`, "primary", UI.E.chart)],
    [btn(fancy, "Kembali", `nk:c:${catKey(a.category)}:0`, "plain", UI.E.wave)],
  ];
  return { c, kb };
}

function saldoCard(uid) {
  const deps = Object.values(S.deposits).filter((d) => String(d.userId) === String(uid) && ["paid"].includes(d.status));
  const ords = Object.values(S.orders).filter((o) => String(o.userId) === String(uid) && ["paid", "done"].includes(o.status));
  const last = Object.values(S.deposits).filter((d) => String(d.userId) === String(uid) && d.status !== "creating").sort((a, b) => b.no - a.no).slice(0, 5);
  const DL = { paid: "Sukses", wait: "Menunggu", expired: "Kedaluwarsa", cancel: "Batal" };
  const c = UI.card({
    title: "Info Saldo Noktel", icon: "chart",
    rows: [
      ["chart", "Saldo sekarang", `<b>${rp(bal(uid))}</b>`],
      ["bolt", "Total deposit", rp(deps.reduce((n, d) => n + d.amount, 0))],
      ["gem", "Total belanja", `${rp(ords.reduce((n, o) => n + o.price, 0))} \u00B7 ${ords.length} akun`],
    ],
    extra: last.length ? `<p><b>Deposit terakhir</b></p><ul>${last.map((d) => `<li>${esc(depId(d.no))} \u00B7 ${rp(d.amount)} \u00B7 ${DL[d.status] || d.status} \u00B7 ${esc(fmtTime(d.createdAt))}</li>`).join("")}</ul>` : "",
    note: "Saldo noktel hanya dipakai untuk membeli noktel.",
  });
  const kb = (fancy) => [[btn(fancy, "Isi Saldo", "nk:d", "success", UI.E.bolt)], [btn(fancy, "Menu Noktel", "nk:h", "plain", UI.E.wave)]];
  return { c, kb };
}

const OL = { wait: "Menunggu bayar", paid: "Aktif", done: "Selesai", expired: "Kedaluwarsa", cancel: "Batal", cancel_owner: "Dibatalkan owner", refunded: "Dikembalikan ke saldo" };
function riwayatCard(uid) {
  const list = Object.values(S.orders).filter((o) => String(o.userId) === String(uid) && o.status !== "creating").sort((a, b) => b.no - a.no).slice(0, 8);
  const c = UI.card({
    title: "Riwayat Pesanan", icon: "time", headers: ["Pesanan", "Detail"],
    sub: list.length ? "8 pesanan terakhir. Tekan pesanan <b>Aktif</b> untuk membuka data akun." : "Belum ada pesanan noktel.",
    rows: list.length ? list.map((o) => ["tag", `<code>${ordId(o.no)}</code>`, `${esc(clip(o.category, 18))} \u00B7 ${rp(o.price)} \u00B7 <b>${OL[o.status] || o.status}</b>`]) : [["info", "Pesanan", "Belum ada"]],
  });
  const kb = (fancy) => [
    ...list.filter((o) => o.status === "paid" && S.accounts[o.accId]).map((o) => [btn(fancy, `Buka ${ordId(o.no)} \u00B7 ${clip(o.category, 18)}`, `nk:o:${o.no}`, "success", UI.E.gem)]),
    [btn(fancy, "Menu Noktel", "nk:h", "plain", UI.E.wave)],
  ];
  return { c, kb };
}

function accountCard(o, a) {
  const c = UI.card({
    title: "Data Akun Noktel", icon: "ok",
    rows: [
      ["tag", "Pesanan", `<code>${ordId(o.no)}</code>`],
      ["box", "Kategori", `<b>${esc(clip(o.category, 40))}</b>`],
      ["user", "Nomor", `<code>${esc(a.phone)}</code>`],
      ["link", "ID Telegram", `<code>${esc(a.tgId)}</code>`],
      ["gem", "PIN 2FA", a.password ? `<code>${esc(a.password)}</code>` : "Tidak ada"],
      ["green", "Status login", o.loggedIn ? "<b>SUDAH LOGIN</b>" : "Belum login"],
    ],
    checks: [
      [false, "Login pakai aplikasi <b>Nicegram</b> atau <b>Nekogram</b> (disarankan)"],
      [false, "Masukkan nomor di atas, lalu tekan <b>Minta OTP</b> di sini"],
      [false, "Minta kode di aplikasi \u2014 bot meneruskan kode otomatis"],
      [false, a.password ? "Masukkan PIN 2FA di atas bila diminta" : "Akun ini tidak memakai PIN 2FA"],
      [false, "Setelah berhasil login, tekan <b>Logout &amp; Selesai</b>"],
    ],
    note: "\u26A0\uFE0F Jangan tekan Logout sebelum Anda berhasil login. Setelah Logout, data akun dihapus dari bot dan tidak bisa meminta OTP lagi.",
  });
  const kb = (fancy) => [
    pair(btn(fancy, "Minta OTP", `nk:otp:${o.no}`, "success", UI.E.bolt), btn(fancy, "Saya Sudah Login", `nk:li:${o.no}`, "primary", UI.E.ok)),
    [btn(fancy, "Logout & Selesai", `nk:lo:${o.no}`, "danger", UI.E.no)],
    [btn(fancy, "Riwayat Pesanan", "nk:r", "plain", UI.E.time)],
  ];
  return { c, kb };
}
const otpKb = (no) => (fancy) => [[btn(fancy, "Minta OTP", `nk:otp:${no}`, "success", UI.E.bolt)], [btn(fancy, "Data Akun", `nk:o:${no}`, "plain", UI.E.gem)]];

// ---------------------------------------------------------------- penjualan
async function finalizeSale(o, a) {
  // a sudah berstatus "sold" (disimpan lebih dulu agar tidak terjual dua kali)
  const ac = accountCard(o, a);
  await UI.sendCard(o.userId, UI.card({
    title: "Pembayaran Berhasil", icon: "ok",
    rows: [["tag", "Pesanan", `<code>${ordId(o.no)}</code>`], ["box", "Kategori", `<b>${esc(clip(o.category, 40))}</b>`], ["chart", "Dibayar", `<b>${rp(o.price)}</b> (${o.method === "saldo" ? "saldo" : "QRIS"})`]],
    checks: [[true, "Pembayaran diterima"], [true, "Data akun dikirim di bawah ini"]],
  })).catch((e) => console.error("[noktel] kartu sukses:", e.message));
  await UI.sendCard(o.userId, ac.c, ac.kb).catch((e) => console.error("[noktel] kartu akun:", e.message));
  fire("nkpaid", o, [["Pesanan", `<code>${ordId(o.no)}</code>`], ["ID Noktel", `<code>${nkId(a.id)}</code>`], ["Kategori", `<b>${esc(o.category)}</b>`], ["Nomor", esc(mask(a.phone))], ["Dibayar", `<b>${rp(o.price)}</b> (${o.method === "saldo" ? "saldo" : "QRIS"})`]]);
}

async function completeOrder(no) {
  const o = S.orders[no];
  if (!o || ["paid", "done", "refunded"].includes(o.status)) return;
  o.paidAt = Date.now();
  const a = S.accounts[o.accId];
  const mine = a && (a.status === "ready" || (a.status === "reserved" && Number(a.orderNo) === Number(no)));
  if (!mine) { // stok sudah tidak ada (bayar telat setelah kedaluwarsa) -> uang masuk saldo noktel
    o.status = "refunded";
    addBal(o.userId, o.price);
    await delMsg(o.qrMsg);
    await UI.sendCard(o.userId, UI.card({
      title: "Stok Sudah Habis", icon: "no",
      rows: [["tag", "Pesanan", `<code>${ordId(o.no)}</code>`], ["chart", "Dikembalikan", `<b>${rp(o.price)}</b> ke saldo noktel`]],
      note: "Pembayaran Anda diterima setelah noktel terjual. Saldo bisa dipakai membeli noktel lain.",
    }), menuKbBack).catch(() => {});
    return;
  }
  o.status = "paid";
  a.status = "sold"; a.orderNo = no; a.soldAt = Date.now();
  save();
  consumeDisc(o);
  await delMsg(o.qrMsg);
  await finalizeSale(o, a);
}
async function endOrder(no, st, byOwner = false) {
  const o = S.orders[no];
  if (!o || o.status !== "wait") return;
  o.status = st === "expired" ? "expired" : byOwner ? "cancel_owner" : "cancel";
  const a = S.accounts[o.accId];
  if (a && a.status === "reserved" && Number(a.orderNo) === Number(no)) { a.status = "ready"; delete a.orderNo; }
  save();
  await delMsg(o.qrMsg);
  await UI.sendCard(o.userId, UI.card({
    title: st === "expired" ? "QRIS Kedaluwarsa" : byOwner ? "Pesanan Dibatalkan Owner" : "Pesanan Dibatalkan", icon: st === "expired" ? "time" : "no",
    rows: [["tag", "Pesanan", `<code>${ordId(o.no)}</code>`], ["box", "Kategori", esc(clip(o.category, 40))], ["chart", "Harga", `<b>${rp(o.price)}</b>`]],
    note: st === "expired" ? "Waktu pembayaran habis. Pilih noktel lagi untuk membuat QRIS baru." : byOwner ? "Pesanan Anda dibatalkan oleh owner. Jangan membayar QRIS lama. Hubungi owner bila ada pertanyaan." : "Tekan Menu Noktel bila ingin membeli lagi.",
  }), menuKbBack).catch(() => {});
}
const watchOrder = (o) => gw.watch(o.txId, { onPaid: () => completeOrder(o.no), onEnd: (_r, st) => endOrder(o.no, st) });

async function completeDep(no) {
  const d = S.deposits[no];
  if (!d || d.status === "paid") return;
  d.status = "paid"; d.paidAt = Date.now();
  addBal(d.userId, d.amount);
  await delMsg(d.qrMsg);
  await UI.sendCard(d.userId, UI.card({
    title: "Deposit Berhasil", icon: "ok",
    rows: [["tag", "Deposit", `<code>${depId(d.no)}</code>`], ["chart", "Masuk", `<b>${rp(d.amount)}</b>`], ["bolt", "Saldo sekarang", `<b>${rp(bal(d.userId))}</b>`]],
    checks: [[true, "Saldo noktel sudah bertambah"]],
  }), (fancy) => [[btn(fancy, "Beli Noktel", "nk:b", "success", UI.E.gem)], [btn(fancy, "Menu Noktel", "nk:h", "plain", UI.E.wave)]]).catch(() => {});
  fire("nkdepok", d, [["Deposit", `<code>${depId(d.no)}</code>`], ["Nominal", `<b>${rp(d.amount)}</b>`], ["Saldo sekarang", rp(bal(d.userId))]]);
}
async function endDep(no, st) {
  const d = S.deposits[no];
  if (!d || d.status !== "wait") return;
  d.status = st === "expired" ? "expired" : "cancel";
  save();
  await delMsg(d.qrMsg);
  await UI.sendCard(d.userId, UI.card({
    title: st === "expired" ? "QRIS Deposit Kedaluwarsa" : "Deposit Dibatalkan", icon: st === "expired" ? "time" : "no",
    rows: [["tag", "Deposit", `<code>${depId(d.no)}</code>`], ["chart", "Nominal", `<b>${rp(d.amount)}</b>`]],
    note: "Tekan Isi Saldo untuk membuat deposit baru.",
  }), (fancy) => [[btn(fancy, "Isi Saldo", "nk:d", "success", UI.E.bolt)]]).catch(() => {});
}
const watchDep = (d) => gw.watch(d.txId, { onPaid: () => completeDep(d.no), onEnd: (_r, st) => endDep(d.no, st) });

// ---------------------------------------------------------------- OTP, deteksi login, logout
const listening = new Map(); // no pesanan -> token pantauan aktif

async function markLoggedIn(o, how, info) {
  if (o.loggedIn) return;
  o.loggedIn = true; o.loggedAt = Date.now();
  save();
  const dev = info ? [info.appName, info.deviceModel, info.platform].filter(Boolean).join(" \u00B7 ") : "";
  await UI.sendCard(o.userId, UI.card({
    title: "Login Terdeteksi", icon: "green",
    rows: [["tag", "Pesanan", `<code>${ordId(o.no)}</code>`], ...(dev ? [["gear", "Perangkat", esc(dev)]] : [])],
    checks: [[true, "Akun sudah berhasil Anda login"], [false, "Bila sudah aman, tekan <b>Logout &amp; Selesai</b>"]],
  }), (fancy) => [[btn(fancy, "Logout & Selesai", `nk:lo:${o.no}`, "danger", UI.E.no)], [btn(fancy, "Data Akun", `nk:o:${o.no}`, "plain", UI.E.gem)]]).catch(() => {});
  const a = S.accounts[o.accId];
  fire("nklogin", o, [["Pesanan", `<code>${ordId(o.no)}</code>`], ["Kategori", `<b>${esc(o.category)}</b>`], ["Nomor", esc(mask(a ? a.phone : o.phoneMask))], ["Terdeteksi", how === "auto" ? "Otomatis (sesi baru)" : "Tombol Saya Sudah Login"], ...(dev ? [["Perangkat", esc(dev)]] : [])]);
}

async function listenOtp(o) {
  const token = Symbol("otp");
  listening.set(o.no, token);
  const a = S.accounts[o.accId];
  const stillMine = () => listening.get(o.no) === token;
  if (!a) return;
  let client;
  try { client = await getClient(a); } catch (e) {
    listening.delete(o.no);
    console.error("[noktel] sambung akun gagal:", e.message);
    return UI.sendCard(o.userId, UI.card({ title: "Gagal Menyambung Akun", icon: "no", rows: [["no", "Sebab", esc(clip(errMsg(e), 120))]], note: "Tekan Minta OTP lagi. Bila terus gagal, hubungi owner dengan menyebut nomor pesanan." }), otpKb(o.no)).catch(() => {});
  }
  if (!o.baseAuth) { try { o.baseAuth = (await authList(client)).filter((x) => !x.current).map((x) => String(x.hash)); save(); } catch (_) {} }
  let deadline = Date.now() + LISTEN_MS;
  let lastAuth = 0;
  let gotCode = false;
  while (stillMine() && Date.now() < deadline) {
    try {
      const m = await latestCode(client, a, o);
      if (m) {
        gotCode = true;
        o.lastOtpId = m.id; o.otpCount = (o.otpCount || 0) + 1; save();
        deadline = Math.max(deadline, Date.now() + 4 * 60 * 1000); // lanjut memantau login
        await UI.sendCard(o.userId, UI.card({
          title: "Kode OTP Diterima", icon: "bolt",
          rows: [["tag", "Pesanan", `<code>${ordId(o.no)}</code>`], ["bolt", "Kode login", `<code>${esc(m.code)}</code>`], ["gem", "PIN 2FA", a.password ? `<code>${esc(a.password)}</code>` : "Tidak ada"]],
          checks: [[false, "Masukkan kode ini di aplikasi (Nicegram / Nekogram)"], [false, a.password ? "Lalu masukkan PIN 2FA bila diminta" : "Selesai bila sudah masuk"]],
          note: "Kode dari Telegram resmi. Jangan bagikan ke siapa pun.",
        }), otpKb(o.no)).catch(() => {});
        fire("nkotp", o, [["Pesanan", `<code>${ordId(o.no)}</code>`], ["ID Noktel", `<code>${nkId(a.id)}</code>`], ["Nomor", esc(mask(a.phone))], ["Kode ke-", `<b>${o.otpCount}</b>`]]);
      }
      if (o.baseAuth && !o.loggedIn && Date.now() - lastAuth > 10000) {
        lastAuth = Date.now();
        const base = new Set(o.baseAuth);
        const fresh = (await authList(client)).find((x) => !x.current && !base.has(String(x.hash)));
        if (fresh) { await markLoggedIn(o, "auto", fresh); break; }
      }
    } catch (e) {
      if (DEAD.test(errMsg(e))) {
        listening.delete(o.no);
        await UI.sendCard(o.userId, UI.card({ title: "Sesi Akun Bermasalah", icon: "no", rows: [["no", "Sebab", "Sesi akun ini sudah tidak aktif"]], note: `Hubungi owner dan sebut pesanan <code>${ordId(o.no)}</code>.` })).catch(() => {});
        return;
      }
      console.error("[noktel] pantau OTP:", errMsg(e));
    }
    await sleep(3000);
  }
  if (stillMine()) {
    listening.delete(o.no);
    if (!gotCode && !o.loggedIn) {
      await UI.sendCard(o.userId, UI.card({
        title: "Kode Belum Masuk", icon: "time",
        rows: [["tag", "Pesanan", `<code>${ordId(o.no)}</code>`]],
        checks: [[false, "Pastikan Anda sudah memasukkan nomor dan menekan kirim kode di aplikasi"], [false, "Lalu tekan <b>Minta OTP</b> lagi"]],
      }), otpKb(o.no)).catch(() => {});
    }
  }
}

async function finishOrder(o) { // Logout & Selesai
  const a = S.accounts[o.accId];
  if (a) {
    try {
      const c = await getClient(a);
      await c.invoke(new Api.auth.LogOut());
    } catch (e) {
      if (!DEAD.test(errMsg(e))) throw e; // sesi sudah mati = tidak apa-apa; galat lain: data dipertahankan agar bisa dicoba lagi
    }
    await dropClient(a.id);
    delete S.accounts[a.id];
  }
  listening.delete(o.no);
  o.status = "done"; o.doneAt = Date.now();
  delete o.baseAuth;
  save();
  fire("nkdone", o, [["Pesanan", `<code>${ordId(o.no)}</code>`], ["Kategori", `<b>${esc(o.category)}</b>`], ["Nomor", esc(o.phoneMask || "-")], ["Status", "Data akun dihapus dari bot (SOLD OUT)"]]);
}

// ---------------------------------------------------------------- owner: tambah stok (wizard login akun)
const wiz = new Map(); // ownerId -> { client, awaiting, chatId, authorized, saved }
const cancelKb = (fancy) => [[btn(fancy, "Batal", "nk:wc", "danger", UI.E.no)]];

async function loseSession(client) { try { await client.invoke(new Api.auth.LogOut()); } catch (_) {} }

async function startAdd(chatId, uid) {
  const key = String(uid);
  if (wiz.has(key)) return UI.sendCard(chatId, UI.card({ title: "Proses Sedang Berjalan", icon: "time", rows: [["info", "Status", "Penambahan stok sebelumnya belum selesai"]], note: "Tekan Batal atau ketik /batal." }), cancelKb);
  if (!cfg.api_id || !cfg.api_hash || String(cfg.api_hash).startsWith("ISI_") || String(cfg.api_id).startsWith("ISI_")) {
    return UI.sendCard(chatId, UI.card({ title: "Konfigurasi Belum Lengkap", icon: "no", rows: [["gear", "Perlu diisi", "<code>api_id</code> dan <code>api_hash</code> di config.json"]] }));
  }
  const client = new TelegramClient(new StringSession(""), Number(cfg.api_id), cfg.api_hash, { connectionRetries: 3 });
  try { client.setLogLevel("none"); } catch (_) {}
  const st = { client, awaiting: null, chatId, authorized: false, saved: false, lastErr: null, password: "" };
  wiz.set(key, st);

  const ask = (kind, c, kb) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { st.awaiting = null; reject(new Error("TIMEOUT")); }, ASK_TIMEOUT);
    st.awaiting = { kind, resolve, reject, timer };
    UI.sendCard(chatId, c, kb || cancelKb).catch((e) => console.error("[noktel] kartu wizard:", e.message));
  });
  const warn = (title, rows, note) => UI.sendCard(chatId, UI.card({ title, icon: "fire", rows, note }), cancelKb);

  try {
    await client.start({
      phoneNumber: () => ask("phone", UI.card({
        title: "Tambah Stok (1/5) - Nomor", icon: "user",
        sub: "Kirim nomor akun Telegram yang mau dijual.",
        rows: [["tag", "Format", "<code>+&lt;kode negara&gt;&lt;nomor&gt;</code>"], ["star", "Contoh", "<code>+6281234567890</code>"]],
        note: "Ketik /batal untuk membatalkan.",
      })),
      phoneCode: () => ask("code", UI.card({
        title: "Tambah Stok (2/5) - Kode Login", icon: "bolt",
        sub: "Telegram mengirim kode ke akun tersebut (chat <b>Telegram</b> resmi atau SMS).",
        rows: [["tag", "Format", "<code>1-2-3-4-5</code>"], ["fire", "Penting", "Tulis kode <b>dengan tanda strip</b> antar digit, kalau tidak Telegram membatalkan kodenya"], ["ok", "Keamanan", "Pesan Anda dihapus otomatis"]],
        note: "Ketik /batal untuk membatalkan.",
      })),
      password: () => ask("password", UI.card({
        title: "Tambah Stok (3/5) - PIN Verifikasi 2 Langkah", icon: "gem",
        sub: "Akun ini memakai verifikasi dua langkah. Kirim PIN / password 2FA-nya.",
        rows: [["ok", "Keamanan", "Pesan Anda dihapus otomatis"], ["gem", "Catatan", "PIN disimpan bot dan dikirim ke pembeli"]],
        note: "Ketik /batal untuk membatalkan.",
      })),
      onError: async (err) => {
        const m = errMsg(err);
        console.error("[noktel] login stok:", m);
        st.lastErr = m;
        if (/PHONE_CODE_INVALID|PHONE_CODE_EMPTY/.test(m)) { await warn("Kode Salah", [["no", "Masalah", "Kode tidak cocok"], ["tag", "Contoh", "<code>1-2-3-4-5</code>"]], "Kirim ulang kode (pakai strip)."); return false; }
        if (/PASSWORD_HASH_INVALID/.test(m)) { await warn("PIN 2FA Salah", [["no", "Masalah", "PIN tidak cocok"]], "Kirim ulang PIN 2FA."); return false; }
        return true;
      },
    });
    st.authorized = true;
    const me = await client.getMe();
    const phone = "+" + String(me.phone || "").replace(/\D/g, "");
    const tgId = String(me.id);
    const dup = accs().find((x) => x.tgId === tgId || x.phone === phone);
    if (dup) {
      await UI.sendCard(chatId, UI.card({ title: "Nomor Sudah Ada di Stok", icon: "no", rows: [["tag", "ID Noktel", `<code>${nkId(dup.id)}</code>`], ["user", "Nomor", esc(phone)]], note: "Sesi login baru ini sudah dikeluarkan lagi." }));
      return; // finally -> logout sesi baru
    }
    let baseMsgId = 0;
    try { const h = await history(client); baseMsgId = Math.max(0, ...h.map((m) => m.id || 0)); } catch (_) {}
    const session = client.session.save();

    const names = allCatNames();
    st.cats = names;
    const catRaw = await ask("category", UI.card({
      title: "Tambah Stok (4/5) - Kategori", icon: "tag",
      sub: "Login berhasil. Ketik <b>kategori</b> untuk akun ini (contoh: <code>Fresh Indonesia 2024</code>).",
      rows: [["user", "Nomor", esc(phone)], ["link", "ID Telegram", `<code>${esc(tgId)}</code>`], ["gem", "PIN 2FA", st.password ? "Ada (tersimpan)" : "Tidak ada"]],
      note: names.length ? "Atau pilih kategori yang sudah ada di bawah." : "Ketik /batal untuk membatalkan.",
    }), (fancy) => [...names.slice(0, 10).map((n, i) => [btn(fancy, clip(n, 30), `nk:wcat:${i}`, "primary", UI.E.tag)]), ...cancelKb(fancy)]);
    const category = String(catRaw).trim().slice(0, 40);

    const same = accs().filter((x) => catKey(x.category) === catKey(category)).sort((a, b) => b.id - a.id)[0];
    st.lastPrice = same ? same.price : 0;
    const priceRaw = await ask("price", UI.card({
      title: "Tambah Stok (5/5) - Harga", icon: "chart",
      sub: `Kategori: <b>${esc(category)}</b>. Kirim <b>harga jual</b> akun ini (angka rupiah, minimal ${rp(1000)}).`,
      rows: [["chart", "Contoh", "<code>15000</code>"]],
      note: "Ketik /batal untuk membatalkan.",
    }), (fancy) => [...(st.lastPrice ? [[btn(fancy, `Pakai harga sama \u00B7 ${rp(st.lastPrice)}`, "nk:wpr", "success", UI.E.chart)]] : []), ...cancelKb(fancy)]);
    const price = Number(String(priceRaw).replace(/\D/g, ""));

    const id = ++S.seq.acc;
    S.accounts[id] = {
      id, phone, tgId, name: [me.firstName, me.lastName].filter(Boolean).join(" "), username: me.username || "", session, password: st.password || "",
      category, price, status: "ready", baseMsgId, addedAt: Date.now(),
    };
    save();
    st.saved = true;
    try { require("./autonotif").newStock(S.accounts[id]); } catch (e) { console.error("[noktel] notif stok baru:", e.message); }
    await UI.sendCard(chatId, UI.card({
      title: "Stok Ditambahkan", icon: "ok",
      rows: [["tag", "ID Noktel", `<code>${nkId(id)}</code>`], ["user", "Nomor", esc(phone)], ["link", "ID Telegram", `<code>${esc(tgId)}</code>`], ["box", "Kategori", `<b>${esc(category)}</b>`], ["chart", "Harga", `<b>${rp(price)}</b>`], ["gem", "PIN 2FA", st.password ? "Tersimpan" : "Tidak ada"]],
      note: "Akun sudah tampil di menu BELI NOKTEL dan sesinya disimpan bot. Notifikasi stok baru dikirim ke pengguna &amp; channel (bila aktif).",
    }), (fancy) => [[btn(fancy, "Tambah Lagi", "nk:oa", "success", UI.E.rocket)], [btn(fancy, "Kelola Noktel", "nk:om", "primary", UI.E.gem)]]);
  } catch (err) {
    let m = errMsg(err);
    if (m === "AUTH_USER_CANCEL" && st.lastErr) m = st.lastErr;
    if (m === "CANCEL") await UI.sendCard(chatId, UI.card({ title: "Dibatalkan", icon: "no", rows: [["info", "Status", "Penambahan stok dibatalkan"]] }), (fancy) => [[btn(fancy, "Kelola Noktel", "nk:om", "primary", UI.E.gem)]]).catch(() => {});
    else if (m === "TIMEOUT") await UI.sendCard(chatId, UI.card({ title: "Waktu Habis", icon: "time", rows: [["no", "Sebab", "Tidak ada balasan dalam 5 menit"]] })).catch(() => {});
    else {
      const ex = require("./login").explain(m);
      await UI.sendCard(chatId, UI.card({ title: ex.title || "Login Gagal", icon: "no", rows: [["no", "Sebab", ex.reason || esc(m)]], note: ex.note || "" })).catch(() => {});
    }
  } finally {
    if (st.awaiting) clearTimeout(st.awaiting.timer);
    wiz.delete(key);
    if (st.authorized && !st.saved) await loseSession(client); // batal / duplikat: jangan tinggalkan sesi bot di akun itu
    try { await client.disconnect(); } catch (_) {}
  }
}
function cancelWiz(uid) {
  const st = wiz.get(String(uid));
  if (!st) return false;
  if (st.awaiting) { clearTimeout(st.awaiting.timer); st.awaiting.reject(new Error("CANCEL")); st.awaiting = null; }
  return true;
}
function answerWiz(uid, kind, value) {
  const st = wiz.get(String(uid));
  if (!st || !st.awaiting || st.awaiting.kind !== kind) return false;
  clearTimeout(st.awaiting.timer);
  const { resolve } = st.awaiting;
  st.awaiting = null;
  resolve(value);
  return true;
}

// ---------------------------------------------------------------- owner: kartu kelola
function manageCard() {
  const all = accs();
  const cnt = (s) => all.filter((a) => a.status === s).length;
  const c = UI.card({
    title: "Kelola Noktel", icon: "gem",
    rows: [
      ["box", "Siap dijual", `<b>${cnt("ready")}</b>`],
      ["time", "Dipesan (menunggu bayar)", `<b>${cnt("reserved")}</b>`],
      ["ok", "Terjual (belum logout)", `<b>${cnt("sold")}</b>`],
      ["chart", "Total saldo pengguna", `<b>${rp(Object.values(S.balances).reduce((n, v) => n + (Number(v) || 0), 0))}</b>`],
    ],
    checks: [[true, "Tambah stok: nomor, kode login, PIN 2FA, kategori, harga"], [true, "Akun disimpan bot dan tampil di menu BELI NOKTEL"]],
    note: "Perintah cepat: <code>/addnoktel</code> \u00B7 <code>/listnoktel</code> \u00B7 <code>/delnoktel ID</code> \u00B7 <code>/addsaldo ID JUMLAH</code> \u00B7 <code>/delsaldo ID JUMLAH</code> \u00B7 <code>/batalnk NKO-0001</code>",
  });
  const kb = (fancy) => [
    [btn(fancy, "Tambah Stok Noktel", "nk:oa", "success", UI.E.rocket)],
    pair(btn(fancy, "Daftar Stok", "nk:ol:0", "primary", UI.E.box), btn(fancy, "Menu Pembeli", "nk:h", "primary", UI.E.gem)),
    [btn(fancy, `Pesanan Pembeli (${activeOrders().length} aktif)`, "nk:op:0", "danger", UI.E.time)],
    [btn(fancy, "Kelola Saldo Pengguna", "sal:m", "primary", UI.E.chart)],
    [btn(fancy, "Kembali", "own", "plain", UI.E.wave)],
  ];
  return { c, kb };
}
const SL = { ready: "Siap", reserved: "Dipesan", sold: "Terjual" };
function listCard(pg) {
  const all = accs().sort((a, b) => a.id - b.id);
  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  const p = Math.min(Math.max(0, pg), pages - 1);
  const slice = all.slice(p * PAGE, (p + 1) * PAGE);
  const c = UI.card({
    title: `Daftar Stok (${all.length})`, icon: "box", headers: ["ID \u00B7 Status", "Nomor \u00B7 Kategori \u00B7 Harga"],
    rows: slice.length ? slice.map((a) => ["tag", `<code>${nkId(a.id)}</code> \u00B7 ${SL[a.status] || a.status}`, `${esc(a.phone)} \u00B7 ${esc(clip(a.category, 18))} \u00B7 ${rp(a.price)}`]) : [["info", "Stok", "Kosong"]],
    note: pages > 1 ? `Halaman ${p + 1} dari ${pages}` : "",
  });
  const kb = (fancy) => [
    ...slice.filter((a) => a.status !== "reserved").map((a) => [btn(fancy, `Hapus ${nkId(a.id)}`, `nk:od:${a.id}`, "danger", UI.E.no)]),
    ...(pages > 1 ? [pair(btn(fancy, "\u25C0\uFE0F Prev", `nk:ol:${(p - 1 + pages) % pages}`, "primary"), btn(fancy, "Next \u25B6\uFE0F", `nk:ol:${(p + 1) % pages}`, "primary"))] : []),
    [btn(fancy, "Kembali", "nk:om", "plain", UI.E.wave)],
  ];
  return { c, kb };
}
async function deleteStock(id) {
  const a = S.accounts[id];
  if (!a) return null;
  if (a.status === "reserved") throw new Error("akun sedang dipesan pembeli");
  try { const c = await getClient(a); await c.invoke(new Api.auth.LogOut()); } catch (_) {}
  await dropClient(a.id);
  delete S.accounts[a.id];
  save();
  return a;
}

// ---------------------------------------------------------------- owner: pesanan pembeli + batalkan pesanan
const activeOrders = () => Object.values(S.orders).filter((o) => o.status === "wait" || o.status === "paid").sort((a, b) => b.no - a.no);
const parseOrdNo = (s) => { const m = String(s || "").trim().match(/^(?:NKO-?)?0*(\d+)$/i); return m ? Number(m[1]) : null; };
function ordersCard(pg) {
  const list = Object.values(S.orders).filter((o) => o.status !== "creating").sort((a, b) => b.no - a.no);
  const act = list.filter((o) => o.status === "wait" || o.status === "paid");
  const show = [...act, ...list.filter((o) => !(o.status === "wait" || o.status === "paid"))];
  const pages = Math.max(1, Math.ceil(show.length / PAGE));
  const p = Math.min(Math.max(0, pg), pages - 1);
  const slice = show.slice(p * PAGE, (p + 1) * PAGE);
  const who = (o) => (o.username ? "@" + o.username : clip(o.name || o.userId, 16));
  const c = UI.card({
    title: `Pesanan Pembeli (${act.length} aktif)`, icon: "time", headers: ["Pesanan \u00B7 Status", "Pembeli \u00B7 Kategori \u00B7 Harga"],
    sub: "Pesanan <b>aktif</b> (menunggu bayar / sudah dibayar) di atas. Tekan pesanan untuk detail &amp; <b>batalkan</b>.",
    rows: slice.length ? slice.map((o) => ["tag", `<code>${ordId(o.no)}</code> \u00B7 ${OL[o.status] || o.status}`, `${esc(who(o))} \u00B7 ${esc(clip(o.category, 16))} \u00B7 ${rp(o.price)}`]) : [["info", "Pesanan", "Belum ada"]],
    note: pages > 1 ? `Halaman ${p + 1} dari ${pages} \u00B7 Cepat: <code>/batalnk NKO-0001</code>` : "Cepat: <code>/batalnk NKO-0001</code>",
  });
  const kb = (fancy) => [
    ...slice.filter((o) => o.status === "wait" || o.status === "paid").map((o) => [btn(fancy, `${ordId(o.no)} \u00B7 ${clip(who(o), 14)} \u00B7 ${OL[o.status]}`, `nk:ov:${o.no}`, o.status === "paid" ? "success" : "primary", UI.E.tag)]),
    ...(pages > 1 ? [pair(btn(fancy, "\u25C0\uFE0F Prev", `nk:op:${(p - 1 + pages) % pages}`, "primary"), btn(fancy, "Next \u25B6\uFE0F", `nk:op:${(p + 1) % pages}`, "primary"))] : []),
    [btn(fancy, "Kembali", "nk:om", "plain", UI.E.wave)],
  ];
  return { c, kb };
}
function orderDetailCard(o) {
  const a = S.accounts[o.accId];
  const c = UI.card({
    title: `Pesanan ${ordId(o.no)}`, icon: "tag",
    rows: [
      ["user", "Pembeli", `<b>${esc(o.name || "-")}</b>${o.username ? " (@" + esc(o.username) + ")" : ""}`],
      ["link", "ID Pembeli", `<code>${esc(o.userId)}</code>`],
      ["gem", "Noktel", `<code>${nkId(o.accId)}</code> \u00B7 ${esc(a ? a.phone : o.phoneMask || "-")}`],
      ["box", "Kategori", esc(clip(o.category, 40))],
      ["chart", "Harga", `<b>${rp(o.price)}</b> (${o.method === "saldo" ? "saldo" : "QRIS"})${o.disc && o.disc.cut ? ` \u00B7 diskon ${rp(o.disc.cut)}` : ""}`],
      ["bolt", "Status", `<b>${OL[o.status] || o.status}</b>${o.loggedIn ? " \u00B7 pembeli sudah login" : ""}`],
      ["time", "Dibuat", esc(fmtTime(o.createdAt))],
    ],
    note: o.status === "wait" ? "Pesanan masih menunggu pembayaran QRIS. Batalkan = QRIS dibatalkan, stok dilepas kembali." :
      o.status === "paid" ? "\u26A0\uFE0F Pesanan sudah dibayar dan data akun sudah dikirim ke pembeli. Pilih cara pembatalan di bawah." : "Pesanan ini sudah tidak aktif.",
  });
  const kb = (fancy) => [
    ...(o.status === "wait" ? [[btn(fancy, "Batalkan Pesanan", `nk:oc:${o.no}:w`, "danger", UI.E.no)]] : []),
    ...(o.status === "paid" ? [
      [btn(fancy, "Batal + Refund Saldo + Akun Kembali ke Stok", `nk:oc:${o.no}:rs`, "danger", UI.E.no)],
      [btn(fancy, "Batal + Refund Saldo (akun dihapus)", `nk:oc:${o.no}:r`, "danger", UI.E.no)],
      [btn(fancy, "Batal Tanpa Refund (akun dihapus)", `nk:oc:${o.no}:n`, "danger", UI.E.no)],
    ] : []),
    [btn(fancy, "Pesanan Pembeli", "nk:op:0", "plain", UI.E.wave)],
  ];
  return { c, kb };
}
const CANCEL_MODE = { w: "Batalkan pesanan menunggu bayar", rs: "Refund ke saldo + akun kembali ke stok", r: "Refund ke saldo, akun dihapus dari stok", n: "Tanpa refund, akun dihapus dari stok" };
// mode: w (menunggu bayar) | rs | r | n (sudah dibayar) -> { ok, why, refund }
async function cancelByOwner(no, mode) {
  const o = S.orders[no];
  if (!o) return { ok: false, why: "Pesanan tidak ditemukan" };
  if (o.status === "wait") {
    try { const t = o.txId && gw.get(o.txId); if (t) await gw.cancelTx(t); } catch (e) { console.error("[noktel] batal (owner) di gateway:", e.message); }
    await endOrder(o.no, "cancelled", true);
    fire("nkcancel", o, [["Pesanan", `<code>${ordId(o.no)}</code>`], ["Kategori", `<b>${esc(o.category)}</b>`], ["Harga", rp(o.price)], ["Cara", CANCEL_MODE.w]]);
    return { ok: true, refund: 0 };
  }
  if (o.status !== "paid") return { ok: false, why: `Pesanan sudah ${OL[o.status] || o.status}` };
  if (!["rs", "r", "n"].includes(mode)) return { ok: false, why: "Pilih cara pembatalan" };
  listening.delete(o.no);
  const a = S.accounts[o.accId];
  const refund = mode === "n" ? 0 : Math.round(o.price);
  if (a) {
    const within = (p) => Promise.race([p, sleep(20000).then(() => { throw new Error("timeout"); })]); // jaringan akun lambat: jangan tahan pembatalan
    if (mode === "rs") { a.status = "ready"; delete a.orderNo; delete a.soldAt; save(); try { const h = await within(getClient(a).then(history)); a.baseMsgId = Math.max(Number(a.baseMsgId) || 0, ...h.map((m) => m.id || 0)); } catch (_) {} }
    else { delete S.accounts[a.id]; save(); try { await within(getClient(a).then((c) => c.invoke(new Api.auth.LogOut()))); } catch (_) {} await dropClient(a.id).catch(() => {}); }
  }
  o.status = "cancel_owner"; o.cancelAt = Date.now(); o.cancelMode = mode; o.refund = refund;
  delete o.baseAuth;
  save();
  if (refund) addBal(o.userId, refund);
  await UI.sendCard(o.userId, UI.card({
    title: "Pesanan Dibatalkan Owner", icon: "no",
    rows: [["tag", "Pesanan", `<code>${ordId(o.no)}</code>`], ["box", "Kategori", esc(clip(o.category, 40))], ["chart", "Harga", rp(o.price)], ["bolt", "Refund", refund ? `<b>${rp(refund)}</b> ke saldo (saldo sekarang ${rp(bal(o.userId))})` : "Tidak ada"]],
    note: "Pesanan noktel Anda dibatalkan oleh owner dan data akun sudah tidak bisa dipakai lagi dari bot. Hubungi owner bila ada pertanyaan.",
  }), menuKbBack).catch(() => {});
  fire("nkcancel", o, [["Pesanan", `<code>${ordId(o.no)}</code>`], ["Kategori", `<b>${esc(o.category)}</b>`], ["Harga", rp(o.price)], ["Cara", CANCEL_MODE[mode]], ["Refund", refund ? rp(refund) : "Tidak"]]);
  if (mode === "rs" && a) { try { require("./autonotif").newStock(a, true); } catch (_) {} }
  return { ok: true, refund };
}

// ---------------------------------------------------------------- pendaftaran
const depWait = new Map(); // userId -> true (menunggu nominal deposit ketikan sendiri)

function register(bot) {
  const refOf = (ctx) => { const m = ctx.callbackQuery.message; return { chat_id: m.chat.id, message_id: m.message_id }; };
  const alert = (ctx, text) => ctx.answerCallbackQuery({ text, show_alert: true });
  // wizard login berjalan lama dan MENUNGGU balasan owner: jangan di-await di dalam handler (update per pengguna diproses berurutan -> deadlock)
  const runAdd = (chatId, uid) => startAdd(chatId, uid).catch((e) => console.error("[noktel] tambah stok:", e.message));
  const sendTo = (ctx, c, kb) => UI.sendCard(ctx.chat ? ctx.chat.id : ctx.from.id, c, kb);

  // pulihkan keadaan setelah restart: lepas pesanan yang menggantung, sambung pantauan pembayaran
  for (const a of accs()) {
    if (a.status !== "reserved") continue;
    const o = S.orders[a.orderNo];
    if (!o || !["wait"].includes(o.status)) { a.status = "ready"; delete a.orderNo; }
  }
  for (const o of Object.values(S.orders)) {
    if (o.status === "creating") { o.status = "cancel"; continue; }
    if (!o.txId) continue;
    if (o.status === "expired" && gw.lateOpen(o.txId)) { watchOrder(o); continue; }
    if (o.status !== "wait") continue;
    const t = gw.get(o.txId);
    if (t && t.status === "completed") completeOrder(o.no).catch(() => {});
    else if (t && (t.status === "expired" || t.status === "cancelled")) endOrder(o.no, t.status).catch(() => {});
    else watchOrder(o);
  }
  for (const d of Object.values(S.deposits)) {
    if (d.status === "creating") { d.status = "cancel"; continue; }
    if (!d.txId) continue;
    if (d.status === "expired" && gw.lateOpen(d.txId)) { watchDep(d); continue; }
    if (d.status !== "wait") continue;
    const t = gw.get(d.txId);
    if (t && t.status === "completed") completeDep(d.no).catch(() => {});
    else if (t && (t.status === "expired" || t.status === "cancelled")) endDep(d.no, t.status).catch(() => {});
    else watchDep(d);
  }
  save();

  bot.callbackQuery(/^nk:/, async (ctx) => {
    const [, act, a1, a2] = ctx.callbackQuery.data.split(":");
    const uid = ctx.from.id;
    const m = ctx.callbackQuery.message;
    if (!m || m.chat.type !== "private") return alert(ctx, "Gunakan tombol ini di chat pribadi bot.");
    const ref = refOf(ctx);
    const show = async (c, kb) => { await ctx.answerCallbackQuery().catch(() => {}); return UI.editCard(ref, c, kb); };

    // ---------- menu & info ----------
    if (act === "h") { const mc = menuCard(uid); return show(mc.c, mc.kb); }
    if (act === "st") return show(stockCard(), menuKbBack);
    if (act === "s") { const c = saldoCard(uid); return show(c.c, c.kb); }
    if (act === "r") { const c = riwayatCard(uid); return show(c.c, c.kb); }
    if (act === "b") { const c = buyCard(); return show(c.c, c.kb); }
    if (act === "c") { const c = catCard(a1, Number(a2) || 0); return show(c.c, c.kb); }
    if (act === "i") {
      const a = S.accounts[a1];
      if (!a || a.status !== "ready") return alert(ctx, "Noktel ini sudah tidak tersedia.");
      const c = itemCard(a, uid);
      return show(c.c, c.kb);
    }

    // ---------- deposit ----------
    if (act === "d") {
      const c = UI.card({
        title: "Isi Saldo Noktel", icon: "bolt",
        rows: [["chart", "Saldo sekarang", `<b>${rp(bal(uid))}</b>`], ["tag", "Minimal", rp(MIN_DEP())]],
        sub: "Pilih nominal deposit. Bayar lewat QRIS, saldo masuk otomatis.",
        checks: [[true, "Saldo ini khusus untuk membeli noktel"]],
      });
      return show(c, (fancy) => [
        ...PRESETS().reduce((rows, n, i) => { if (i % 2 === 0) rows.push([]); rows[rows.length - 1].push(btn(fancy, rp(n), `nk:da:${n}`, "success")); return rows; }, []).map((r) => (r.length > 1 ? pair(...r) : r)),
        [btn(fancy, "Nominal Lain", "nk:dc", "primary", UI.E.gear)],
        [btn(fancy, "Kembali", "nk:h", "plain", UI.E.wave)],
      ]);
    }
    if (act === "dc") {
      await ctx.answerCallbackQuery().catch(() => {});
      depWait.set(String(uid), true);
      return sendTo(ctx, UI.card({ title: "Nominal Deposit", icon: "chart", rows: [["info", "Langkah", `Kirim nominal (angka rupiah), minimal ${rp(MIN_DEP())}`], ["star", "Contoh", "<code>25000</code>"]], note: "Ketik /batal untuk membatalkan." }), (fancy) => [[btn(fancy, "Batal", "nk:dcx", "danger", UI.E.no)]]);
    }
    if (act === "dcx") { depWait.delete(String(uid)); return show(UI.card({ title: "Dibatalkan", icon: "no", rows: [["info", "Status", "Deposit dibatalkan"]] }), menuKbBack); }
    if (act === "da") return createDeposit(ctx, Number(a1), ref);
    if (act === "dk" || act === "dx") {
      const d = S.deposits[a1];
      if (!d || String(d.userId) !== String(uid)) return alert(ctx, "Deposit tidak ditemukan.");
      if (act === "dk") {
        if (d.status === "paid") return ctx.answerCallbackQuery({ text: "Sudah lunas \u2705 Saldo sudah masuk." });
        if (d.status !== "wait") return alert(ctx, "Deposit ini sudah tidak aktif.");
        const t = gw.get(d.txId);
        let s = t ? t.status : "pending";
        if (s === "pending") { try { s = (await gw.status(creds(), d.txId, d.amount)).status || s; } catch (e) { return alert(ctx, "Belum bisa dicek: " + e.message.slice(0, 120)); } }
        if (s === "completed") { await ctx.answerCallbackQuery({ text: "Pembayaran terdeteksi \u2705" }); return completeDep(d.no); }
        if (s === "expired" || s === "cancelled") { await ctx.answerCallbackQuery({ text: "QRIS sudah kedaluwarsa." }); return endDep(d.no, s); }
        return alert(ctx, "Belum ada pembayaran. Selesaikan scan QRIS lalu cek lagi sebentar \u23F3");
      }
      if (d.status !== "wait") return alert(ctx, "Deposit ini sudah tidak aktif.");
      await ctx.answerCallbackQuery({ text: "Deposit dibatalkan." });
      await endDep(d.no, "cancelled");
      try { const t = d.txId && gw.get(d.txId); if (t) await gw.cancelTx(t); } catch (e) { console.error("[noktel] batal deposit di gateway:", e.message); }
      return;
    }

    // ---------- beli ----------
    if (act === "q") return buyQris(ctx, a1, ref);
    if (act === "y") {
      const a = S.accounts[a1];
      if (!a || a.status !== "ready") return alert(ctx, "Noktel ini sudah tidak tersedia.");
      const dc = discOf(uid, a.price);
      if (bal(uid) < dc.final) return alert(ctx, `Saldo kurang. Saldo ${rp(bal(uid))}, harga ${rp(dc.final)}. Isi saldo dulu atau bayar QRIS.`);
      // sinkron (tanpa await) antara cek stok dan potong saldo -> tidak bisa terjual dua kali
      takeBal(uid, dc.final);
      const no = ++S.seq.ord;
      const o = { no, userId: String(uid), name: fullName(ctx.from), username: ctx.from.username || null, accId: a.id, category: a.category, phoneMask: mask(a.phone), price: dc.final, ...(dc.cut ? { disc: { code: dc.code, cut: dc.cut, orig: a.price } } : {}), method: "saldo", status: "paid", createdAt: Date.now(), paidAt: Date.now() };
      S.orders[no] = o;
      a.status = "sold"; a.orderNo = no; a.soldAt = Date.now();
      save();
      consumeDisc(o);
      await ctx.answerCallbackQuery({ text: "Pembelian berhasil \u2705" });
      fire("nkbuy", o, [["Pesanan", `<code>${ordId(no)}</code>`], ["ID Noktel", `<code>${nkId(a.id)}</code>`], ["Kategori", `<b>${esc(a.category)}</b>`], ["Harga", `<b>${rp(o.price)}</b>${dc.cut ? ` (diskon ${rp(dc.cut)} \u00B7 ${esc(dc.code)})` : ""}`], ["Metode", "Saldo noktel"]]);
      return finalizeSale(o, a);
    }
    if (act === "k" || act === "x") { // cek status / batal pesanan QRIS
      const o = S.orders[a1];
      if (!o || String(o.userId) !== String(uid)) return alert(ctx, "Pesanan tidak ditemukan.");
      if (act === "k") {
        if (o.status === "paid") return ctx.answerCallbackQuery({ text: "Sudah lunas \u2705 Data akun sudah dikirim." });
        if (o.status !== "wait") return alert(ctx, "Pesanan ini sudah tidak aktif.");
        const t = gw.get(o.txId);
        let s = t ? t.status : "pending";
        if (s === "pending") { try { s = (await gw.status(creds(), o.txId, o.price)).status || s; } catch (e) { return alert(ctx, "Belum bisa dicek: " + e.message.slice(0, 120)); } }
        if (s === "completed") { await ctx.answerCallbackQuery({ text: "Pembayaran terdeteksi \u2705 Mengirim akun..." }); return completeOrder(o.no); }
        if (s === "expired" || s === "cancelled") { await ctx.answerCallbackQuery({ text: "QRIS sudah kedaluwarsa." }); return endOrder(o.no, s); }
        return alert(ctx, "Belum ada pembayaran. Selesaikan scan QRIS lalu cek lagi sebentar \u23F3");
      }
      if (o.status !== "wait") return alert(ctx, "Pesanan ini sudah tidak aktif.");
      await ctx.answerCallbackQuery({ text: "Pesanan dibatalkan." });
      await endOrder(o.no, "cancelled");
      try { const t = o.txId && gw.get(o.txId); if (t) await gw.cancelTx(t); } catch (e) { console.error("[noktel] batal di gateway:", e.message); }
      return;
    }

    // ---------- pesanan aktif: buka, OTP, login, logout ----------
    if (["o", "otp", "li", "lo", "loy"].includes(act)) {
      const o = S.orders[a1];
      if (!o || String(o.userId) !== String(uid)) return alert(ctx, "Pesanan tidak ditemukan.");
      const a = S.accounts[o.accId];
      if (o.status === "done") return alert(ctx, "Pesanan ini sudah selesai (logout). Data akun sudah dihapus.");
      if (o.status === "cancel_owner") return alert(ctx, "Pesanan ini sudah dibatalkan oleh owner.");
      if (o.status !== "paid" || !a) return alert(ctx, "Pesanan ini belum aktif.");
      if (act === "o") { await ctx.answerCallbackQuery().catch(() => {}); const ac = accountCard(o, a); return UI.sendCard(m.chat.id, ac.c, ac.kb); }
      if (act === "otp") {
        if (o.otpAt && Date.now() - o.otpAt < 8000 && listening.has(o.no)) return ctx.answerCallbackQuery({ text: "Sedang memantau kode, tunggu sebentar \u23F3" });
        o.otpAt = Date.now();
        await ctx.answerCallbackQuery({ text: "Memantau kode..." });
        await UI.sendCard(m.chat.id, UI.card({
          title: "Menunggu Kode Login", icon: "time",
          rows: [["tag", "Pesanan", `<code>${ordId(o.no)}</code>`], ["user", "Nomor", `<code>${esc(a.phone)}</code>`]],
          checks: [[false, "Buka Nicegram / Nekogram, masukkan nomor di atas, lalu kirim kode"], [true, "Bot memantau akun ini selama 3 menit dan meneruskan kodenya ke sini"]],
        })).catch(() => {});
        listenOtp(o).catch((e) => console.error("[noktel] listenOtp:", e.message));
        return;
      }
      if (act === "li") {
        if (o.loggedIn) return ctx.answerCallbackQuery({ text: "Login sudah tercatat \u2705" });
        await ctx.answerCallbackQuery({ text: "Login dicatat \u2705" });
        return markLoggedIn(o, "manual");
      }
      if (act === "lo") {
        await ctx.answerCallbackQuery().catch(() => {});
        return UI.editCard(ref, UI.card({
          title: "Logout & Selesai?", icon: "fire",
          rows: [["tag", "Pesanan", `<code>${ordId(o.no)}</code>`], ["user", "Nomor", esc(mask(a.phone))], ["green", "Status login", o.loggedIn ? "<b>Sudah login</b>" : "<b>Belum terdeteksi login</b>"]],
          checks: [[false, "Sesi bot di akun ini di-logout"], [false, "Data akun dihapus dari bot (tidak bisa Minta OTP lagi)"], [false, "Pesanan dianggap selesai (SOLD OUT)"]],
          note: "\u26A0\uFE0F Lanjutkan hanya bila Anda sudah berhasil login di aplikasi Anda sendiri.",
        }), (fancy) => [[btn(fancy, "Ya, Logout & Selesai", `nk:loy:${o.no}`, "danger", UI.E.no)], [btn(fancy, "Batal", `nk:o:${o.no}`, "primary", UI.E.wave)]]);
      }
      if (act === "loy") {
        await ctx.answerCallbackQuery({ text: "Memproses logout..." });
        try { await finishOrder(o); } catch (e) {
          console.error("[noktel] logout gagal:", e.message);
          return UI.editCard(ref, UI.card({ title: "Logout Gagal", icon: "no", rows: [["no", "Sebab", esc(clip(errMsg(e), 120))]], note: "Data akun belum dihapus. Coba lagi sebentar." }), (fancy) => [[btn(fancy, "Coba Lagi", `nk:loy:${o.no}`, "danger", UI.E.no)], [btn(fancy, "Data Akun", `nk:o:${o.no}`, "plain", UI.E.gem)]]);
        }
        return UI.editCard(ref, UI.card({
          title: "Pesanan Selesai", icon: "ok",
          rows: [["tag", "Pesanan", `<code>${ordId(o.no)}</code>`], ["box", "Kategori", esc(clip(o.category, 40))]],
          checks: [[true, "Sesi bot di akun sudah di-logout"], [true, "Data akun dihapus dari bot"], [true, "Terima kasih sudah berbelanja"]],
        }), (fancy) => [[btn(fancy, "Beli Lagi", "nk:b", "success", UI.E.gem)], [btn(fancy, "Menu Noktel", "nk:h", "plain", UI.E.wave)]]);
      }
    }

    // ---------- owner ----------
    if (["om", "oa", "ol", "od", "ody", "wc", "wcat", "wpr", "op", "ov", "oc", "ocy"].includes(act)) {
      if (!isOwner(uid)) return alert(ctx, "Khusus owner.");
      if (act === "op") { const c = ordersCard(Number(a1) || 0); return show(c.c, c.kb); }
      if (act === "ov") {
        const o = S.orders[a1];
        if (!o) return alert(ctx, "Pesanan tidak ditemukan.");
        const c = orderDetailCard(o); return show(c.c, c.kb);
      }
      if (act === "oc") {
        const o = S.orders[a1];
        if (!o || !(o.status === "wait" || o.status === "paid")) return alert(ctx, "Pesanan sudah tidak aktif.");
        const mode = o.status === "wait" ? "w" : a2;
        return show(UI.card({
          title: "Batalkan Pesanan?", icon: "fire",
          rows: [["tag", "Pesanan", `<code>${ordId(o.no)}</code>`], ["user", "Pembeli", `${esc(o.name || "-")} \u00B7 <code>${esc(o.userId)}</code>`], ["chart", "Harga", rp(o.price)], ["bolt", "Cara", esc(CANCEL_MODE[mode] || "-")]],
          note: "Pembeli akan menerima pemberitahuan pembatalan.",
        }), (fancy) => [pair(btn(fancy, "Ya, Batalkan", `nk:ocy:${o.no}:${mode}`, "danger", UI.E.no), btn(fancy, "Kembali", `nk:ov:${o.no}`, "primary", UI.E.wave))]);
      }
      if (act === "ocy") {
        await ctx.answerCallbackQuery({ text: "Membatalkan..." }).catch(() => {});
        const r = await cancelByOwner(Number(a1), a2).catch((e) => ({ ok: false, why: e.message }));
        return UI.editCard(ref, UI.card({
          title: r.ok ? "Pesanan Dibatalkan" : "Gagal Membatalkan", icon: r.ok ? "ok" : "no",
          rows: [["tag", "Pesanan", `<code>${ordId(a1)}</code>`], ...(r.ok ? [["chart", "Refund", r.refund ? `<b>${rp(r.refund)}</b> ke saldo pembeli` : "Tidak ada"], ["bolt", "Cara", esc(CANCEL_MODE[a2] || "-")]] : [["no", "Sebab", esc(r.why)]])],
        }), (fancy) => [[btn(fancy, "Pesanan Pembeli", "nk:op:0", "primary", UI.E.time)]]);
      }
      if (act === "om") { const c = manageCard(); return show(c.c, c.kb); }
      if (act === "oa") { await ctx.answerCallbackQuery().catch(() => {}); runAdd(m.chat.id, uid); return; }
      if (act === "ol") { const c = listCard(Number(a1) || 0); return show(c.c, c.kb); }
      if (act === "od") {
        const a = S.accounts[a1];
        if (!a) return alert(ctx, "Stok tidak ditemukan.");
        return show(UI.card({
          title: "Hapus Stok?", icon: "no",
          rows: [["tag", "ID Noktel", `<code>${nkId(a.id)}</code>`], ["user", "Nomor", esc(a.phone)], ["box", "Kategori", esc(clip(a.category, 30))], ["bolt", "Status", SL[a.status] || a.status]],
          note: a.status === "sold" ? "\u26A0\uFE0F Akun ini sudah terjual. Menghapus berarti sesi bot di-logout dan pembeli tidak bisa Minta OTP lagi." : "Data stok dihapus dan sesi bot di akun itu di-logout.",
        }), (fancy) => [[btn(fancy, "Ya, Hapus", `nk:ody:${a.id}`, "danger", UI.E.no), btn(fancy, "Batal", "nk:ol:0", "primary", UI.E.wave)]]);
      }
      if (act === "ody") {
        await ctx.answerCallbackQuery({ text: "Menghapus..." });
        let a = null; let err = "";
        try { a = await deleteStock(a1); } catch (e) { err = e.message; }
        const c = UI.card({ title: a ? "Stok Dihapus" : "Gagal Menghapus", icon: a ? "ok" : "no", rows: [["tag", "ID Noktel", a ? `<code>${nkId(a.id)}</code>` : esc(a1)], ...(err ? [["no", "Sebab", esc(err)]] : [])] });
        return UI.editCard(ref, c, (fancy) => [[btn(fancy, "Daftar Stok", "nk:ol:0", "primary", UI.E.box)]]);
      }
      if (act === "wc") { await ctx.answerCallbackQuery().catch(() => {}); if (!cancelWiz(uid)) return sendTo(ctx, UI.card({ title: "Tidak Ada Proses", icon: "info", rows: [["info", "Status", "Tidak ada penambahan stok yang berjalan"]] })); return; }
      if (act === "wcat") {
        const st = wiz.get(String(uid));
        const name = st && st.cats && st.cats[Number(a1)];
        if (!name || !answerWiz(uid, "category", name)) return alert(ctx, "Pilihan sudah tidak berlaku.");
        return ctx.answerCallbackQuery({ text: "Kategori dipilih" });
      }
      if (act === "wpr") {
        const st = wiz.get(String(uid));
        if (!st || !st.lastPrice || !answerWiz(uid, "price", String(st.lastPrice))) return alert(ctx, "Pilihan sudah tidak berlaku.");
        return ctx.answerCallbackQuery({ text: "Harga dipakai" });
      }
    }
    return ctx.answerCallbackQuery().catch(() => {});
  });

  // ---------- buat QRIS beli noktel ----------
  async function buyQris(ctx, accId, ref) {
    const uid = ctx.from.id;
    const a = S.accounts[accId];
    if (!a || a.status !== "ready") return alert(ctx, "Noktel ini sudah tidak tersedia.");
    if (!creds()) return alert(ctx, "Payment gateway belum aktif. Hubungi owner.");
    const w = waitingOrder(uid);
    if (w) return alert(ctx, `Anda masih punya pembayaran menunggu (${ordId(w.no)}). Selesaikan atau tekan Batal dulu.`);
    // pesan stok dulu (sinkron) supaya tidak dibeli orang lain selama QRIS berjalan
    const no = ++S.seq.ord;
    const dc = discOf(uid, a.price);
    const o = { no, userId: String(uid), name: fullName(ctx.from), username: ctx.from.username || null, accId: a.id, category: a.category, phoneMask: mask(a.phone), price: dc.final, ...(dc.cut ? { disc: { code: dc.code, cut: dc.cut, orig: a.price } } : {}), method: "qris", status: "creating", createdAt: Date.now() };
    S.orders[no] = o;
    a.status = "reserved"; a.orderNo = no;
    save();
    await ctx.answerCallbackQuery({ text: "Membuat QRIS..." });
    const release = (st) => { o.status = st; if (a.status === "reserved" && Number(a.orderNo) === no) { a.status = "ready"; delete a.orderNo; } save(); };

    let r;
    try {
      r = await gw.create(creds(), { userId: ownerId(), amount: o.price, note: `Noktel ${nkId(a.id)} - ${ctx.from.username ? "@" + ctx.from.username : o.name} (${uid})`, chat: String(uid) });
    } catch (e) {
      release("cancel");
      console.error("[noktel] buat QRIS gagal:", e.message);
      return UI.editCard(ref, UI.card({ title: "Gagal Membuat QRIS", icon: "no", rows: [["no", "Sebab", esc(e.message)]], note: "Coba lagi sebentar, atau hubungi owner." }), menuKbBack);
    }
    o.txId = r.id; o.status = "wait"; save();
    watchOrder(o);
    let img;
    try { img = await qrImage(r); } catch (e) {
      console.error("[noktel] ambil QR gagal:", e.message);
      release("cancel");
      try { const t = gw.get(r.id); if (t) await gw.cancelTx(t); } catch (_) {}
      return UI.editCard(ref, UI.card({ title: "Gagal Mengambil QR", icon: "no", rows: [["no", "Sebab", esc(e.message)]], note: "Tekan Menu Noktel lalu coba lagi." }), menuKbBack);
    }
    const waitKb = (fancy) => [[btn(fancy, "Cek Status", `nk:k:${no}`, "success", UI.E.ok), btn(fancy, "Batal", `nk:x:${no}`, "danger", UI.E.no)]];
    const caption = `<b>QRIS ${esc(clip(o.category, 30))} \u00B7 ${nkId(a.id)}</b>\n\u26A1 Total bayar: <b>${rp(r.total || r.amount)}</b>${r.provider === "manual" ? `\n\uD83D\uDFE2 Scan QRIS ini, bayar <b>tepat</b> sesuai total, lalu <b>kirim screenshot bukti bayar ke chat ini</b>.\n\u23F3 Data akun setelah owner mengonfirmasi (ACCEPT).` : `\n\uD83D\uDFE2 Scan QR ini \u2014 data akun dikirim <b>otomatis</b> setelah lunas.\n\u2757 Bayar <b>persis</b> sesuai total (sudah termasuk ${r.provider === "austin" ? "biaya & kode unik" : "kode unik"}).`}`;
    const sent = await sendQr(ref.chat_id, img, caption, waitKb);
    if (sent) { o.qrMsg = { chat_id: ref.chat_id, message_id: sent.message_id }; save(); }
    fire("nkbuy", o, [["Pesanan", `<code>${ordId(no)}</code>`], ["ID Noktel", `<code>${nkId(a.id)}</code>`], ["Kategori", `<b>${esc(a.category)}</b>`], ["Harga", `<b>${rp(o.price)}</b>${dc.cut ? ` (diskon ${rp(dc.cut)} \u00B7 ${esc(dc.code)})` : ""}`], ["Metode", "QRIS (menunggu bayar)"]]);
    return UI.editCard(ref, UI.card({
      title: "Menunggu Pembayaran", icon: "time",
      rows: [["tag", "Pesanan", `<code>${ordId(no)}</code>`], ["gem", "Noktel", `<b>${nkId(a.id)}</b> \u00B7 ${esc(clip(a.category, 24))}`], ["chart", "Harga", rp(r.amount)], ...(dc.cut ? [["tag", "Diskon", `<code>${esc(dc.code)}</code> \u2212${rp(dc.cut)}`]] : []), ["bolt", "Total bayar", `<b>${rp(r.total || r.amount)}</b>`], ...(r.expiredAt ? [["time", `Kedaluwarsa (${esc(TZL)})`, esc(fmtTime(r.expiredAt))]] : [])],
      checks: [[true, "Scan QRIS pada gambar di bawah"], [false, r.provider === "manual" ? "Kirim screenshot bukti bayar ke chat ini, lalu tunggu konfirmasi owner" : "Tunggu \u2014 data akun dikirim otomatis setelah lunas"]],
      note: sent ? "Noktel ini dipesan untuk Anda selama QRIS aktif." : "QR gagal dimuat. Tekan Cek Status setelah membayar.",
    }), sent ? null : waitKb);
  }

  // ---------- buat QRIS deposit ----------
  async function createDeposit(ctx, amount, ref) {
    const uid = ctx.from.id;
    const cb = !!ctx.callbackQuery; // dari tombol (bukan dari ketikan nominal)
    const chatId = ref ? ref.chat_id : ctx.chat.id;
    const reply = (c, kb) => (ref ? UI.editCard(ref, c, kb) : UI.sendCard(chatId, c, kb));
    if (!(amount >= MIN_DEP() && amount <= MAX_DEP())) { if (cb) await ctx.answerCallbackQuery().catch(() => {}); return reply(UI.card({ title: "Nominal Tidak Valid", icon: "no", rows: [["info", "Batas", `${rp(MIN_DEP())} sampai ${rp(MAX_DEP())}`]] }), menuKbBack); }
    if (!creds()) { if (cb) return alert(ctx, "Payment gateway belum aktif. Hubungi owner."); return reply(UI.card({ title: "Gateway Belum Aktif", icon: "no", rows: [["info", "Status", "Hubungi owner"]] }), menuKbBack); }
    const w = waitingDep(uid);
    if (w) { const msg = `Anda masih punya deposit menunggu (${depId(w.no)}). Selesaikan atau batalkan dulu.`; if (cb) return alert(ctx, msg); return reply(UI.card({ title: "Deposit Masih Berjalan", icon: "time", rows: [["info", "Status", msg]] }), menuKbBack); }
    if (cb) await ctx.answerCallbackQuery({ text: "Membuat QRIS..." });
    const no = ++S.seq.dep;
    const d = { no, userId: String(uid), name: fullName(ctx.from), username: ctx.from.username || null, amount, status: "creating", createdAt: Date.now() };
    S.deposits[no] = d; save();
    let r;
    try {
      r = await gw.create(creds(), { userId: ownerId(), amount, note: `Deposit noktel - ${ctx.from.username ? "@" + ctx.from.username : d.name} (${uid})`, chat: String(uid) });
    } catch (e) {
      d.status = "cancel"; save();
      console.error("[noktel] QRIS deposit gagal:", e.message);
      return reply(UI.card({ title: "Gagal Membuat QRIS", icon: "no", rows: [["no", "Sebab", esc(e.message)]], note: "Coba lagi sebentar, atau hubungi owner." }), menuKbBack);
    }
    d.txId = r.id; d.status = "wait"; save();
    watchDep(d);
    let img;
    try { img = await qrImage(r); } catch (e) {
      d.status = "cancel"; save();
      try { const t = gw.get(r.id); if (t) await gw.cancelTx(t); } catch (_) {}
      return reply(UI.card({ title: "Gagal Mengambil QR", icon: "no", rows: [["no", "Sebab", esc(e.message)]] }), menuKbBack);
    }
    const waitKb = (fancy) => [[btn(fancy, "Cek Status", `nk:dk:${no}`, "success", UI.E.ok), btn(fancy, "Batal", `nk:dx:${no}`, "danger", UI.E.no)]];
    const caption = `<b>QRIS Deposit Noktel \u00B7 ${depId(no)}</b>\n\u26A1 Total bayar: <b>${rp(r.total || r.amount)}</b>${r.provider === "manual" ? `\n\uD83D\uDFE2 Scan QRIS ini, bayar <b>tepat</b> sesuai total, lalu <b>kirim screenshot bukti bayar ke chat ini</b>.\n\u23F3 Saldo deposit setelah owner mengonfirmasi (ACCEPT).` : `\n\uD83D\uDFE2 Scan QR ini \u2014 saldo masuk <b>otomatis</b> setelah lunas.\n\u2757 Bayar <b>persis</b> sesuai total (sudah termasuk ${r.provider === "austin" ? "biaya & kode unik" : "kode unik"}).`}`;
    const sent = await sendQr(chatId, img, caption, waitKb);
    if (sent) { d.qrMsg = { chat_id: chatId, message_id: sent.message_id }; save(); }
    fire("nkdep", d, [["Deposit", `<code>${depId(no)}</code>`], ["Nominal", `<b>${rp(amount)}</b>`], ["Total bayar", rp(r.total || r.amount)], ["Status", "Pending (menunggu pembayaran)"]]);
    return reply(UI.card({
      title: "Menunggu Pembayaran Deposit", icon: "time",
      rows: [["tag", "Deposit", `<code>${depId(no)}</code>`], ["chart", "Nominal", rp(r.amount)], ["bolt", "Total bayar", `<b>${rp(r.total || r.amount)}</b>`], ...(r.expiredAt ? [["time", `Kedaluwarsa (${esc(TZL)})`, esc(fmtTime(r.expiredAt))]] : [])],
      checks: [[true, "Scan QRIS pada gambar di bawah"], [false, r.provider === "manual" ? "Kirim screenshot bukti bayar ke chat ini, lalu tunggu konfirmasi owner" : "Saldo masuk otomatis setelah lunas"]],
      note: sent ? "" : "QR gagal dimuat. Tekan Cek Status setelah membayar.",
    }), sent ? null : waitKb);
  }

  // ---------- pesan teks: wizard owner + nominal deposit ----------
  bot.on("message", async (ctx, next) => {
    if (!ctx.chat || ctx.chat.type !== "private" || !ctx.from) return next();
    const uid = String(ctx.from.id);
    const text = typeof ctx.message.text === "string" ? ctx.message.text : null;
    const st = wiz.get(uid);
    if (st && isOwner(uid) && text !== null) {
      if (/^\/(batal|cancel)\b/i.test(text)) { cancelWiz(uid); return; }
      if (st.awaiting && !text.startsWith("/")) {
        const { kind } = st.awaiting;
        let value = text.trim();
        if (kind === "phone") {
          value = value.replace(/[^\d+]/g, "");
          if (!value.startsWith("+")) value = "+" + value;
          if (!/^\+\d{8,15}$/.test(value)) return UI.sendCard(ctx.chat.id, UI.card({ title: "Format Nomor Salah", icon: "no", rows: [["tag", "Contoh", "<code>+6281234567890</code>"]] }), cancelKb);
        } else if (kind === "code") {
          value = value.replace(/\D/g, "");
          if (value.length < 4 || value.length > 6) return UI.sendCard(ctx.chat.id, UI.card({ title: "Kode Tidak Valid", icon: "no", rows: [["tag", "Contoh", "<code>1-2-3-4-5</code>"]] }), cancelKb);
        } else if (kind === "password") {
          value = text; // PIN 2FA apa adanya
          st.password = value;
        } else if (kind === "category") {
          if (!value) return;
        } else if (kind === "price") {
          const n = Number(value.replace(/\D/g, ""));
          if (!(n >= 1000 && n <= 10000000)) return UI.sendCard(ctx.chat.id, UI.card({ title: "Harga Tidak Valid", icon: "no", rows: [["info", "Contoh", `<code>15000</code> (minimal ${rp(1000)})`]] }), cancelKb);
          value = String(n);
        }
        if (["phone", "code", "password"].includes(kind)) ctx.deleteMessage().catch(() => {}); // jangan tinggalkan nomor / kode / PIN di chat
        answerWiz(uid, kind, value);
        return;
      }
    }
    if (depWait.has(uid) && text !== null) {
      if (/^\/batal\b/i.test(text)) { depWait.delete(uid); return UI.sendCard(ctx.chat.id, UI.card({ title: "Dibatalkan", icon: "no", rows: [["info", "Status", "Deposit dibatalkan"]] }), menuKbBack); }
      if (text.startsWith("/")) { depWait.delete(uid); return next(); }
      depWait.delete(uid);
      const n = Number(text.replace(/\D/g, ""));
      return createDeposit(ctx, n, null);
    }
    return next();
  });

  // ---------- perintah owner ----------
  const guard = (fn) => async (ctx) => { if (ctx.chat && ctx.chat.type === "private" && isOwner(ctx.from.id)) return fn(ctx); };
  bot.command("addnoktel", guard((ctx) => { runAdd(ctx.chat.id, ctx.from.id); }));
  bot.command("listnoktel", guard((ctx) => { const l = listCard(0); return sendTo(ctx, l.c, l.kb); }));
  bot.command("delnoktel", guard(async (ctx) => {
    const id = String(ctx.match || "").trim().replace(/^NK-?/i, "").replace(/^0+/, "");
    if (!id) return sendTo(ctx, UI.card({ title: "Cara Pakai", icon: "gear", rows: [["tag", "Pakai", "<code>/delnoktel ID</code>"], ["info", "Lihat ID", "<code>/listnoktel</code>"]] }));
    let a = null; let err = "";
    try { a = await deleteStock(id); } catch (e) { err = e.message; }
    return sendTo(ctx, UI.card({ title: a ? "Stok Dihapus" : "Tidak Ditemukan", icon: a ? "ok" : "no", rows: [["tag", "ID Noktel", a ? `<code>${nkId(a.id)}</code>` : esc(id)], ...(err ? [["no", "Sebab", esc(err)]] : [])] }));
  }));
  bot.command("batalnk", guard(async (ctx) => {
    const [noArg, modeArg] = String(ctx.match || "").trim().split(/\s+/);
    const no = parseOrdNo(noArg);
    const o = no && S.orders[no];
    if (!o) return sendTo(ctx, UI.card({ title: "Cara Pakai", icon: "gear", rows: [["tag", "Pakai", "<code>/batalnk NKO-0001 [refund|stok|norefund]</code>"], ["info", "Cara", "<b>refund</b> = refund saldo, akun dihapus \u00B7 <b>stok</b> = refund saldo + akun kembali ke stok \u00B7 <b>norefund</b> = tanpa refund"], ["box", "Lihat pesanan", "PANEL OWNER \u203A Kelola Noktel \u203A Pesanan Pembeli"]] }));
    if (o.status === "paid" && !modeArg) { const c = orderDetailCard(o); return sendTo(ctx, c.c, c.kb); }
    const mode = o.status === "wait" ? "w" : /^stok|restock/i.test(modeArg) ? "rs" : /^no|tanpa/i.test(modeArg) ? "n" : "r";
    const r = await cancelByOwner(no, mode).catch((e) => ({ ok: false, why: e.message }));
    return sendTo(ctx, UI.card({ title: r.ok ? "Pesanan Dibatalkan" : "Gagal Membatalkan", icon: r.ok ? "ok" : "no", rows: [["tag", "Pesanan", `<code>${ordId(no)}</code>`], ...(r.ok ? [["chart", "Refund", r.refund ? rp(r.refund) : "Tidak ada"], ["bolt", "Cara", esc(CANCEL_MODE[mode])]] : [["no", "Sebab", esc(r.why)]])] }));
  }));
  bot.command("addsaldonk", guard(async (ctx) => {
    const [uidArg, amtArg] = String(ctx.match || "").trim().split(/\s+/);
    const n = Number(String(amtArg || "").replace(/[^\d-]/g, ""));
    if (!/^\d+$/.test(uidArg || "") || !n) return sendTo(ctx, UI.card({ title: "Cara Pakai", icon: "gear", rows: [["tag", "Pakai", "<code>/addsaldonk ID_PENGGUNA JUMLAH</code>"], ["star", "Contoh", "<code>/addsaldonk 123456789 20000</code>"]] }));
    if (n < 0 && bal(uidArg) + n < 0) return sendTo(ctx, UI.card({ title: "Saldo Tidak Cukup", icon: "no", rows: [["chart", "Saldo pengguna", rp(bal(uidArg))]] }));
    const now = addBal(uidArg, n);
    return sendTo(ctx, UI.card({ title: "Saldo Diubah", icon: "ok", rows: [["user", "Pengguna", `<code>${esc(uidArg)}</code>`], ["chart", "Perubahan", rp(n)], ["bolt", "Saldo sekarang", `<b>${rp(now)}</b>`]] }));
  }));
}

module.exports = {
  register, bal, addBal, takeBal, cats, readyAccs, minPrice, nkId, rp, menuCard, menuKbBack, cancelByOwner,
  allBalances: () => ({ ...S.balances }),
  setBal(uid, n) { S.balances[String(uid)] = Math.max(0, Math.round(Number(n) || 0)); save(); return bal(uid); },
  _S: () => S, _completeOrder: completeOrder, _parseCode: parseCode,
};

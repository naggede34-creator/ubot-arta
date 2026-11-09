// Mode QRIS owner (panel owner > Mode QRIS): auto1 = AGW ArtaPedia, auto2 = AustinPay (austinpay.cc.cd), manual = QRIS statis owner + bukti bayar + ACCEPT/REJECT.
// Gateway pembayaran QRIS: Admin Gateway API (AGW, berbasis SMP Payment) -> https://www.tokonokosarta.my.id/api/agw
// Menggantikan provider lama (Artapedia Pay / BuatQris / Pakasir). Fungsi: buat tagihan, cek status, batal, dan pantau (polling) sampai lunas / kedaluwarsa.
// - Kunci API per pengguna (.setagw) -> uang masuk ke akun gateway pemilik .qris itu. Owner: config.json "gateway" atau env AGW_KEY / AGW_SECRET.
// - total_pay = nominal + kode unik (1-999). Pembeli WAJIB membayar total_pay persis; QR dirender LOKAL dari qr_string (tanpa layanan pihak ketiga).
// - order_id unik per tagihan = idempoten, jadi aman diulang saat jaringan putus (tidak membuat tagihan ganda).
// - AGW tetap menerima pembayaran sampai 20 menit setelah kedaluwarsa. Pesanan yang sudah ditutup tetap dipantau 21 menit, dan bila ternyata lunas, role / produk tetap diberikan.
// - Tagihan yang belum selesai disimpan di gateway_tx.json dan dipantau lagi setelah restart.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { cfg, tg, esc } = require("./core");
const { money } = require("./money");

const TX_FILE = path.join(__dirname, "gateway_tx.json");
const AGW_BASE = "https://www.tokonokosarta.my.id/api/agw";
const AUSTIN_BASE = "https://austinpay.cc.cd";
const MANUAL_FILE = path.join(__dirname, "data", "qris_manual.img");
const LABEL = { agw: "Otomatis 1 - AGW ArtaPedia", austin: "Otomatis 2 - AustinPay", manual: "QRIS Manual" };
const GRACE_MS = 60 * 1000; // tambahan setelah expired_at sebelum dianggap kedaluwarsa
const LATE_MS = 21 * 60 * 1000; // AGW masih menerima bayaran 20 menit setelah kedaluwarsa (+1 menit cadangan)
const KEEP_MS = 30 * 24 * 3600 * 1000; // riwayat tagihan disimpan 30 hari

let tx = {};
try { tx = JSON.parse(fs.readFileSync(TX_FILE, "utf8")) || {}; } catch (_) { tx = {}; }
for (const [id, r] of Object.entries(tx)) if (r.status !== "pending" && !(r.lateUntil > Date.now()) && Date.now() - (r.doneAt || r.created || 0) > KEEP_MS) delete tx[id];

function save() {
  const tmp = TX_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(tx));
  fs.renameSync(tmp, TX_FILE);
}

// ---------------------------------------------------------------- mode + kunci gateway
// Mode QRIS (dipilih owner di panel): auto1 = AGW ArtaPedia, auto2 = AustinPay, manual = QRIS gambar owner. Bawaan: auto1.
const MODES = { auto1: "agw", auto2: "austin", manual: "manual" };
const getMode = () => { const m = require("./db").getSetting("qris_mode"); return MODES[m] ? m : "auto1"; };
const setMode = (m) => { if (!MODES[m]) throw new Error("mode tidak dikenal"); require("./db").setSetting("qris_mode", m); };

// kunci AGW milik owner: yang disimpan lewat panel > config.json / env
function agwOwnerCreds() {
  const s = require("./db").getSetting("qris_auto1") || {};
  const g = cfg.gateway || {};
  const key = s.api_key || process.env.AGW_KEY || (g.provider === "agw" ? g.api_key : "");
  if (!key || !String(key).startsWith("agw_")) return null;
  return { provider: "agw", api_key: key, secret: s.api_key ? s.secret || "" : process.env.AGW_SECRET || g.secret || "", base_url: g.base_url || AGW_BASE, source: s.api_key ? "panel" : "config" };
}
function austinOwnerCreds() {
  const s = require("./db").getSetting("qris_auto2") || {};
  const a = cfg.austin || {};
  const key = s.api_key || process.env.AUSTIN_KEY || a.api_key || "";
  if (!key) return null;
  return { provider: "austin", api_key: key, secret: s.api_key ? s.secret || "" : process.env.AUSTIN_SECRET || a.secret || "", base_url: s.base_url || a.base_url || AUSTIN_BASE, source: s.api_key ? "panel" : "config" };
}
const manualCreds = () => (hasManual() ? { provider: "manual", source: "manual" } : null);

// kunci AGW pribadi pengguna (.setagw)
function ownCreds(userId) {
  const own = (require("./db").getUser(userId) || {}).gateway;
  return own && own.provider === "agw" && own.api_key ? { provider: "agw", api_key: own.api_key, secret: own.secret || "", base_url: own.base_url || AGW_BASE, source: "sendiri" } : null;
}

// Pengguna biasa hanya boleh memakai kunci sendiri (.setagw). Owner: mengikuti mode QRIS pilihannya.
// opts.sales = true -> pembayaran jualan owner (Beli Role / Produk / Noktel): HANYA provider mode terpilih (termasuk manual).
// tanpa opts.sales (mis. .qris di userbot owner): kunci pribadi dulu, lalu provider otomatis yang terisi (manual tidak dipakai).
function credsFor(userId, opts = {}) {
  const access = require("./access");
  const own = ownCreds(userId);
  if (!access.isOwner(userId)) return own;
  if (!opts.sales && own) return own;
  const mode = getMode();
  const pick = { auto1: agwOwnerCreds, auto2: austinOwnerCreds, manual: manualCreds }[mode];
  if (opts.sales) return pick();
  return (mode !== "manual" ? pick() : null) || agwOwnerCreds() || austinOwnerCreds();
}
// kredensial untuk memantau tagihan yang SUDAH dibuat (provider-nya tetap walau owner mengganti mode)
function credsOf(provider, userId) {
  if (provider === "manual") return { provider: "manual" };
  const access = require("./access");
  if (provider === "austin") return access.isOwner(userId) ? austinOwnerCreds() : null;
  return ownCreds(userId) || (access.isOwner(userId) ? agwOwnerCreds() : null);
}
const labelOf = (txId) => { const r = tx[txId]; return (r && LABEL[r.provider]) || LABEL[MODES[getMode()]] || "Gateway"; };

// ---------------------------------------------------------------- QRIS manual (gambar QRIS owner)
function hasManual() { try { return fs.statSync(MANUAL_FILE).size > 0; } catch (_) { return false; } }
function manualSet(buf) {
  fs.mkdirSync(path.dirname(MANUAL_FILE), { recursive: true });
  fs.writeFileSync(MANUAL_FILE, buf);
}
const mimeOf = (b) => (b && b[0] === 0x89 && b[1] === 0x50 ? "image/png" : b && b[0] === 0xff && b[1] === 0xd8 ? "image/jpeg" : b && b[0] === 0x52 && b[1] === 0x49 ? "image/webp" : "image/png");
function manualImage() {
  try {
    const b = fs.readFileSync(MANUAL_FILE);
    return b.length ? `data:${mimeOf(b)};base64,${b.toString("base64")}` : "";
  } catch (_) { return ""; }
}
const manualMinutes = () => Math.max(5, Number((require("./db").getSetting("qris_manual_minutes"))) || 30);

// ---------------------------------------------------------------- HTTP (AGW)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ERR = {
  invalid_api_key: "API key AGW tidak valid. Minta key baru ke admin gateway.",
  missing_api_key: "API key AGW belum dikirim.",
  key_disabled: "API key AGW dinonaktifkan admin gateway.",
  ip_not_allowed: "IP server ini belum di-whitelist di gateway. Jalankan /gateway (owner) untuk melihat IP, lalu minta admin mendaftarkannya.",
  signature_required: "Gateway mewajibkan tanda tangan: isi API Secret (agw_sec_...).",
  signature_invalid: "Tanda tangan HMAC ditolak. Periksa API Secret (agw_sec_...).",
  timestamp_expired: "Jam server bot menyimpang >5 menit dari gateway. Sinkronkan jam server (NTP).",
  gateway_off: "Gateway sedang dimatikan admin.",
  smp_not_ready: "SMP Payment di gateway belum dikonfigurasi admin.",
  rate_limited: "Terlalu banyak permintaan ke gateway, coba lagi sebentar.",
};

// Header: X-API-Key (+ X-Timestamp detik & X-Signature bila secret diisi).
// Tanda tangan = HMAC-SHA256 hex dari `${METHOD}\n${path murni tanpa query}\n${body mentah}\n${timestamp detik}`.
async function agwCall(creds, method, endpoint, body) {
  const base = String(creds.base_url || AGW_BASE).replace(/\/+$/, "");
  const url = base + endpoint;
  const raw = body ? JSON.stringify(body) : "";
  let last;
  for (let i = 0; i < 3; i++) { // aman diulang: create memakai order_id (idempoten), GET/cancel tidak mengubah hasil
    const headers = { Accept: "application/json", "X-API-Key": creds.api_key, ...(raw ? { "Content-Type": "application/json" } : {}) };
    if (creds.secret) {
      const ts = String(Math.floor(Date.now() / 1000));
      headers["X-Timestamp"] = ts;
      headers["X-Signature"] = crypto.createHmac("sha256", creds.secret).update(`${method}\n${new URL(url).pathname}\n${raw}\n${ts}`).digest("hex");
    }
    let res;
    try {
      res = await fetch(url, { method, headers, body: raw || undefined, signal: AbortSignal.timeout(20000) });
    } catch (err) {
      last = err;
      await sleep(1000 * (i + 1));
      continue;
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    if (res.ok && json && json.success !== false) return json;
    const code = json && json.code;
    const msg = (json && json.message) || text.slice(0, 120) || res.statusText;
    last = new Error(ERR[code] || (code ? `${msg} (${code})` : `HTTP ${res.status}: ${msg}`));
    last.code = code || String(res.status);
    if (res.status === 429) { await sleep(Math.min(15000, (Number(res.headers.get("retry-after")) || i + 1) * 1000)); continue; }
    if (![502, 503, 504].includes(res.status) && code !== "busy") throw last; // hanya galat sementara yang diulang
    await sleep(1000 * (i + 1));
  }
  throw last || new Error("gateway tidak dapat dihubungi");
}

// ---------------------------------------------------------------- HTTP (AustinPay)
// Header X-API-Key (+ X-Timestamp milidetik & X-Signature bila API Secret diisi).
// Tanda tangan = HMAC-SHA256 hex dari `${METHOD}\n${path murni tanpa query}\n${body mentah}\n${timestamp ms}`.
const AERR = {
  401: "API Key AustinPay tidak valid / belum dikirim.",
  403: "Akun AustinPay diblokir atau IP server bot belum di-whitelist (AustinPay > Profil > Whitelist IP).",
  429: "Terlalu banyak permintaan ke AustinPay (QRIS maks 5/menit), coba lagi sebentar.",
};
async function austinCall(creds, method, endpoint, body, { retry = true } = {}) {
  const base = String(creds.base_url || AUSTIN_BASE).replace(/\/+$/, "");
  const url = base + endpoint;
  const raw = body ? JSON.stringify(body) : "";
  let last;
  for (let i = 0; i < (retry ? 3 : 1); i++) {
    const headers = { Accept: "application/json", "X-API-Key": creds.api_key, ...(raw ? { "Content-Type": "application/json" } : {}) };
    if (creds.secret) {
      const ts = String(Date.now());
      headers["X-Timestamp"] = ts;
      headers["X-Signature"] = crypto.createHmac("sha256", creds.secret).update(`${method}\n${new URL(url).pathname}\n${raw}\n${ts}`).digest("hex");
    }
    let res;
    try {
      res = await fetch(url, { method, headers, body: raw || undefined, signal: AbortSignal.timeout(20000) });
    } catch (err) {
      last = err;
      if (!retry) throw new Error("AustinPay tidak dapat dihubungi: " + (err.message || err));
      await sleep(1000 * (i + 1));
      continue;
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    if (res.ok && json && json.success !== false) return json;
    const msg = (json && json.message) || text.slice(0, 120) || res.statusText;
    last = new Error(AERR[res.status] ? `${AERR[res.status]} (${msg})` : `${msg}${res.ok ? "" : ` (HTTP ${res.status})`}`);
    last.code = String(res.status);
    if (/tidak bisa dibatalkan/i.test(msg)) last.code = "already_paid";
    if (retry && [429, 502, 503, 504].includes(res.status)) { await sleep(Math.min(15000, 1000 * (i + 1) * 2)); continue; }
    throw last;
  }
  throw last || new Error("AustinPay tidak dapat dihubungi");
}

async function austinCreate(creds, amount) {
  const amt = Math.round(Number(amount));
  const j = await austinCall(creds, "POST", "/api/deposit/create", { amount: amt }, { retry: false }); // tanpa order_id -> jangan diulang otomatis
  const d = j.deposit;
  if (!d || !d.transaction_id || !(d.qr_string || d.qr_image)) throw new Error("respons AustinPay tidak mengandung transaction_id / QR");
  const total = Number(d.amount) || amt;
  return {
    amount: amt,
    fee: Math.max(0, total - amt), // biaya 0,4% + kode unik, sudah termasuk di total
    total,
    payload: d.qr_string || "", // dirender lokal (qr.js)
    qr_url: "",
    qris_image: d.qr_string ? "" : d.qr_image || "",
    payment_url: "",
    transactionId: String(d.transaction_id), orderId: "", reference: "",
    expiredAt: Date.parse(d.expired_at || "") || Date.now() + 5 * 60 * 1000,
  };
}
async function austinStatus(creds, id) {
  const j = await austinCall(creds, "GET", `/api/deposit/check/${encodeURIComponent(id)}`);
  const st = String(j.status || "pending").toLowerCase();
  return { status: st === "paid" ? "completed" : /^cancel/.test(st) ? "cancelled" : st, completedAt: st === "paid" ? Date.now() : null, payer: "", issuer: "", reference: "" };
}
async function austinPing(creds) {
  const j = await austinCall(creds, "GET", "/api/account");
  const u = j.user || {};
  return { app: u.username || u.email || "-", active: !u.status || u.status === "active", balance: u.wallet && u.wallet.balance, base: creds.base_url || AUSTIN_BASE };
}

const newId = () => "QR" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString("hex").toUpperCase();

async function apiCreate(creds, orderId, amount, note = "") {
  const j = await agwCall(creds, "POST", "/qris/create", {
    amount: Math.round(Number(amount)),
    order_id: orderId,
    description: String(note || `Pembayaran ${orderId}`).slice(0, 100),
  });
  const d = j.invoice;
  if (!d || !d.invoice_id || !(d.qr_string || d.qr_image)) throw new Error("respons AGW tidak mengandung invoice_id / QR");
  const amt = Number(d.amount) || Math.round(Number(amount));
  const total = Number(d.total_pay) || amt;
  return {
    amount: amt,
    fee: Number(d.unique_code) || Math.max(0, total - amt), // kode unik (bukan biaya admin), sudah termasuk di total
    total,
    payload: d.qr_string || "", // dirender lokal (qr.js)
    qr_url: d.qr_string ? "" : d.qr_image || "", // hanya dipakai bila qr_string tidak ada
    qris_image: "", payment_url: "",
    transactionId: String(d.invoice_id), orderId, reference: d.reference || "",
    expiredAt: Date.parse(d.expired_at || "") || Date.now() + 15 * 60 * 1000,
  };
}

async function agwStatus(creds, invoiceId) {
  const j = await agwCall(creds, "GET", `/qris/status/${encodeURIComponent(invoiceId)}`);
  const st = String(j.status || (j.invoice && j.invoice.status) || "pending").toLowerCase();
  const paidAt = j.invoice && j.invoice.paid_at ? Date.parse(j.invoice.paid_at) : null;
  return {
    status: st === "paid" ? "completed" : st === "canceled" ? "cancelled" : st,
    completedAt: paidAt,
    payer: (j.invoice && j.invoice.payer_name) || "", issuer: (j.invoice && j.invoice.issuer) || "", reference: (j.invoice && j.invoice.reference) || "",
  };
}

async function agwCancel(creds, invoiceId) {
  await agwCall(creds, "POST", `/qris/cancel/${encodeURIComponent(invoiceId)}`);
}

// Pemilihan provider mengikuti tagihan yang sudah tercatat (bukan mode saat ini), supaya ganti mode tidak merusak tagihan yang berjalan
const providerOf = (creds, id) => (tx[id] && tx[id].provider) || (creds && creds.provider) || "agw";
async function status(creds, invoiceId) {
  const r = tx[invoiceId];
  const provider = providerOf(creds, invoiceId);
  if (provider === "manual") {
    if (r && r.status === "completed") return { status: "completed", completedAt: r.completedAt || null };
    if (r && (r.status === "expired" || r.status === "cancelled")) return { status: r.status };
    throw new Error(r && r.proofAt ? "Bukti sudah dikirim, menunggu konfirmasi owner." : "Kirim screenshot bukti bayar ke chat ini, lalu tunggu konfirmasi owner.");
  }
  const cr = (r && credsOf(provider, r.userId)) || creds;
  if (!cr) throw new Error("kunci gateway tidak tersedia");
  return provider === "austin" ? austinStatus(cr, invoiceId) : agwStatus(cr, invoiceId);
}
async function cancel(creds, invoiceId) {
  const r = tx[invoiceId];
  const provider = providerOf(creds, invoiceId);
  const cr = (r && credsOf(provider, r.userId)) || creds;
  if (!cr) throw new Error("kunci gateway tidak tersedia");
  if (provider === "austin") return austinCall(cr, "POST", `/api/deposit/cancel/${encodeURIComponent(invoiceId)}`);
  return agwCancel(cr, invoiceId);
}

// Cek koneksi + key: batas nominal, IP server (untuk whitelist), status gateway
async function ping(creds) {
  if (creds && creds.provider === "austin") return austinPing(creds);
  const j = await agwCall(creds, "GET", "/ping");
  return { app: (j.app && j.app.name) || "-", ...(j.gateway || {}), ...(j.security || {}), ip: j.your_ip || "-", serverTime: j.server_time || "" };
}

// ---------------------------------------------------------------- tagihan + pantauan
const hooks = new Map(); // id -> { onPaid, onEnd } (hanya dalam proses ini)
const timers = new Map();
const pollMs = () => Math.max(5, Number((cfg.gateway || {}).poll_seconds) || 5) * 1000; // AGW: cukup tiap 5 detik

async function create(creds, { userId, amount, note = "", chat = "" }) {
  const provider = (creds && creds.provider) || "agw";
  const id = newId();
  let r;
  if (provider === "austin") r = await austinCreate(creds, amount);
  else if (provider === "manual") r = manualCreate(id, amount);
  else r = await apiCreate(creds, id, amount, note);
  const { qris_image, ...stored } = r; // gambar QRIS manual besar: jangan disimpan di gateway_tx.json
  const txId = stored.transactionId || id;
  tx[txId] = { id: txId, userId: String(userId), note, chat, provider, created: Date.now(), status: "pending", errors: 0, ...stored, qris_image: "" };
  save();
  schedule(txId, provider === "manual" ? 30000 : pollMs());
  return { ...tx[txId], qris_image };
}
function manualCreate(id, amount) {
  const img = manualImage();
  if (!img) throw new Error("QRIS manual belum diatur owner");
  const amt = Math.round(Number(amount));
  return { amount: amt, fee: 0, total: amt, payload: "", qr_url: "", qris_image: img, payment_url: "", transactionId: id, orderId: id, reference: "", expiredAt: Date.now() + manualMinutes() * 60000 };
}

// ---- QRIS manual: bukti bayar + keputusan owner (lihat qrismode.js)
const manualPendingFor = (uid) => Object.values(tx).filter((r) => r.provider === "manual" && r.status === "pending" && String(r.chat) === String(uid)).sort((a, b) => b.created - a.created)[0] || null;
function manualPatch(id, patch) {
  const r = tx[id];
  if (!r || r.provider !== "manual" || r.status !== "pending") return null;
  Object.assign(r, patch);
  save();
  return r;
}
async function manualResolve(id, ok, by = "") {
  const r = tx[id];
  if (!r || r.provider !== "manual" || r.status !== "pending") return false;
  r.decidedBy = by;
  await finish(r, ok ? "completed" : "cancelled", ok ? Date.now() : undefined);
  return true;
}

function watch(id, h) { hooks.set(id, h || {}); }
const get = (id) => tx[id] || null;
const last = (userId) => Object.values(tx).filter((r) => r.userId === String(userId)).sort((a, b) => b.created - a.created)[0] || null;
const pendingCount = (userId) => Object.values(tx).filter((r) => r.status === "pending" && (!userId || r.userId === String(userId))).length;
// tagihan sudah kedaluwarsa tapi masih dalam jendela 20 menit (pembayaran telat masih mungkin masuk)
const lateOpen = (id) => { const r = tx[id]; return !!(r && r.status === "expired" && r.lateUntil > Date.now()); };

function schedule(id, delay) {
  clearTimeout(timers.get(id));
  const t = setTimeout(() => poll(id).catch((e) => console.error("[gateway] poll:", e.message)), delay);
  if (t.unref) t.unref();
  timers.set(id, t);
}

async function poll(id) {
  const r = tx[id];
  if (!r) return;
  if (r.status === "expired" && r.lateUntil) return pollLate(r);
  if (r.status !== "pending") return;
  if (r.provider === "manual") { // tanpa pemantauan otomatis: hanya kedaluwarsa (kecuali bukti sudah dikirim & menunggu keputusan owner)
    if (!r.proofAt && Date.now() > r.expiredAt) return finish(r, "expired");
    return schedule(id, 30000);
  }
  if (r.provider !== "agw" && r.provider !== "austin") return finish(r, "expired"); // sisa tagihan provider lama
  if (Date.now() > r.expiredAt + GRACE_MS) return finish(r, "expired");
  const creds = credsOf(r.provider, r.userId);
  let st = null;
  if (creds) {
    try { st = await status(creds, r.transactionId || id); r.errors = 0; } catch (e) { r.errors = (r.errors || 0) + 1; if (r.errors === 1 || r.errors % 20 === 0) console.error(`[gateway] cek ${id} gagal:`, e.message); }
  }
  if (st && st.status === "completed") return finish(r, "completed", st.completedAt);
  if (st && (st.status === "expired" || st.status === "cancelled")) return finish(r, st.status);
  schedule(id, r.errors > 5 ? 15000 : pollMs());
}

// Pemantauan bayaran telat: tagihan sudah expired tapi AGW masih menerima sampai 20 menit
async function pollLate(r) {
  if (Date.now() > r.lateUntil) { r.lateUntil = 0; save(); hooks.delete(r.id); return; }
  const creds = credsOf(r.provider, r.userId);
  let st = null;
  if (creds) { try { st = await status(creds, r.transactionId || r.id); } catch (_) {} }
  if (st && st.status === "completed") {
    r.status = "completed"; r.late = true; r.lateUntil = 0; r.doneAt = Date.now(); if (st.completedAt) r.completedAt = st.completedAt;
    save();
    const h = hooks.get(r.id);
    hooks.delete(r.id);
    try { if (h && h.onPaid) await h.onPaid(r); } catch (e) { console.error("[gateway] hook (bayar telat):", e.message); }
    try { await notify(r, "completed"); } catch (e) { console.error("[gateway] notis bot:", e.message); }
    return;
  }
  if (st && st.status === "cancelled") { r.lateUntil = 0; save(); hooks.delete(r.id); return; }
  schedule(r.id, 30000);
}

async function finish(r, st, completedAt) {
  if (r.status !== "pending") return;
  r.status = st;
  r.doneAt = Date.now();
  if (completedAt) r.completedAt = completedAt;
  const late = st === "expired" && r.provider === "agw"; // masih ada kemungkinan bayaran telat
  if (late) r.lateUntil = Math.max(Date.now() + 60000, (r.expiredAt || Date.now()) + LATE_MS);
  save();
  clearTimeout(timers.get(r.id));
  timers.delete(r.id);
  const h = hooks.get(r.id);
  if (!late) hooks.delete(r.id); // saat expired, hook disimpan untuk bayaran telat
  try {
    if (h) st === "completed" ? await (h.onPaid && h.onPaid(r)) : await (h.onEnd && h.onEnd(r, st));
  } catch (e) { console.error("[gateway] hook:", e.message); }
  if (r.provider !== "manual") try { await notify(r, st); } catch (e) { console.error("[gateway] notis bot:", e.message); }
  if (late) schedule(r.id, 30000);
}

// Pemberitahuan dikirim ke chat bot kendali pemilik tagihan (berfungsi walau setelah restart)
async function notify(r, st) {
  const lines = {
    completed: `\u2705 <b>Pembayaran diterima</b>${r.late ? " (bayar setelah kedaluwarsa)" : ""}\nInvois: <code>${esc(r.id)}</code>\nNominal: <b>${esc(money(r.amount))}</b>${r.fee ? `\n${r.provider === "austin" ? "Biaya + kode unik" : "Kode unik"}: ${esc(money(r.fee))}` : ""}${r.note ? `\nCatatan: ${esc(r.note)}` : ""}`,
    expired: `\u231B Invois <code>${esc(r.id)}</code> (${esc(money(r.amount))}) kedaluwarsa tanpa pembayaran.`,
    cancelled: `\u274C Invois <code>${esc(r.id)}</code> (${esc(money(r.amount))}) dibatalkan.`,
  };
  if (lines[st]) await tg("sendMessage", { chat_id: r.userId, text: lines[st], parse_mode: "HTML" });
}

// Dipanggil sekali saat bot mulai: sambung pantauan tagihan yang belum selesai (termasuk jendela bayar telat)
function resumeAll() {
  let n = 0;
  for (const r of Object.values(tx)) {
    if (r.status === "pending" || (r.status === "expired" && r.lateUntil > Date.now())) { schedule(r.id, 2000 + n * 300); n++; }
  }
  if (n) console.log(`[gateway] menyambung pantauan ${n} tagihan`);
}

async function cancelLocal(creds, r) {
  if (r.provider === "manual") return finish(r, "cancelled");
  try {
    await cancel(creds, r.transactionId || r.id);
  } catch (e) {
    if (e && e.code === "already_paid") { await poll(r.id); return; } // sudah terlanjur dibayar / selesai: biarkan pemantau menandai statusnya
    throw e;
  }
  await finish(r, "cancelled");
}
// batalkan tagihan apa pun (provider dipilih otomatis dari tagihannya)
const cancelTx = (r) => (r ? cancelLocal(credsOf(r.provider, r.userId), r) : Promise.resolve());

module.exports = { credsFor, credsOf, getMode, setMode, agwOwnerCreds, austinOwnerCreds, manualCreds, labelOf, LABEL, hasManual, manualSet, manualImage, manualMinutes, mimeOf, manualPendingFor, manualPatch, manualResolve, cancelTx, austinPing, AUSTIN_BASE, create, status, cancel, cancelLocal, ping, watch, get, last, pendingCount, lateOpen, resumeAll, newId };

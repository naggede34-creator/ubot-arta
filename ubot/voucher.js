// ===== KODE VOUCHER / DISKON / HADIAH SALDO (owner) + REDEEM (pengguna) =====
// OWNER (PANEL OWNER > Kode Voucher, atau perintah):
//   Buat kode: jenis (HADIAH SALDO / DISKON) -> kode (ketik sendiri / acak) -> nilai -> kuota pemakai -> masa berlaku -> (diskon: berlaku untuk)
//   /buatkode saldo KODE 5000 10 7h              -> kode hadiah saldo Rp5.000, 10 orang, berlaku 7 hari
//   /buatkode diskon KODE 10% 50 24j role        -> diskon 10% untuk Beli/Up Role, 50 orang, berlaku 24 jam
//   /buatkode diskon KODE 2000 5 0 noktel        -> potongan Rp2.000 untuk beli noktel, 5 orang, tanpa kedaluwarsa
//   /listkode  ·  /hapuskode KODE
//   Masa berlaku: 30m (menit) · 12j (jam) · 7h / 7d (hari) · 2026-12-31 · 2026-12-31 23:59 · 0 (tanpa batas)
//   Berlaku untuk (diskon): all (semua) · role (Beli / Up Role) · noktel (beli noktel)
// PENGGUNA: tombol [Redeem Kode] di /start (atau menu noktel), atau /redeem KODE
//   HADIAH SALDO -> saldo langsung masuk (saldo yang sama dengan saldo noktel).
//   DISKON       -> disimpan sebagai "diskon aktif" dan otomatis dipakai pada pembelian berikutnya (dipotong saat bayar lunas).
//   Satu pengguna hanya bisa memakai satu kode yang sama satu kali.
// Data: data/voucher.json (ikut Backup).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const access = require("./access");
const UI = require("./botui");
const { cfg, esc, btn, pair, fmtTime, TZL } = require("./core");

const FILE = path.join(__dirname, "data", "voucher.json");
const PAGE = 8;
const rp = (n) => "Rp" + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const isOwner = (id) => access.isOwner(id);
const SCOPES = { all: "Semua pembelian", role: "Beli / Up Role", noktel: "Beli Noktel" };

let S = { codes: {}, active: {} };
try { S = { ...S, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch (_) {}
function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE + ".tmp", JSON.stringify(S, null, 1));
  fs.renameSync(FILE + ".tmp", FILE);
}

// ---------------------------------------------------------------- pembantu
const normCode = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "");
const validCode = (c) => /^[A-Z0-9_-]{3,20}$/.test(c);
const randCode = () => { let c; do { c = crypto.randomBytes(6).toString("base64").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8); } while (c.length < 8 || S.codes[c]); return c; };
const TZ = Number(cfg.timezone_offset === undefined ? 7 : cfg.timezone_offset);

// "30m" "12j" "7h" "7d" "2026-12-31" "31-12-2026 23:59" "0" -> { at: ms | 0 } atau null
function parseExpiry(s) {
  const t = String(s || "").trim().toLowerCase();
  if (/^(0|-|tanpa|tanpa batas|selamanya|never)$/.test(t)) return { at: 0 };
  let m = t.match(/^(\d{1,5})\s*(m|mnt|menit|j|jam|h|hari|d|day|days|mg|minggu|w)$/);
  if (m) {
    const n = Number(m[1]);
    const unit = /^(m|mnt|menit)$/.test(m[2]) ? 60e3 : /^(j|jam)$/.test(m[2]) ? 3600e3 : /^(mg|minggu|w)$/.test(m[2]) ? 7 * 86400e3 : 86400e3;
    return n > 0 ? { at: Date.now() + n * unit } : null;
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2})[:.](\d{2}))?$/) || null;
  let y, mo, d, hh, mi;
  if (m) [, y, mo, d, hh, mi] = m;
  else {
    m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2})[:.](\d{2}))?$/);
    if (!m) return null;
    [, d, mo, y, hh, mi] = m;
  }
  const at = Date.UTC(+y, +mo - 1, +d, hh === undefined ? 23 : +hh, mi === undefined ? 59 : +mi) - TZ * 3600e3;
  return Number.isFinite(at) && at > Date.now() ? { at } : null;
}
// "5000" "5.000" "5k" "10rb" -> angka ; "10%" -> persen
function parseValue(s, type) {
  const t = String(s || "").trim().toLowerCase().replace(/^rp\.?\s*/, "");
  const pm = t.match(/^(\d{1,3})\s*%$/);
  if (pm) { const p = Number(pm[1]); return type === "diskon" && p >= 1 && p <= 100 ? { value: p, pct: true } : null; }
  const n = require("./money").parseMoney(t);
  if (!(n >= 100 && n <= 100000000)) return null;
  return { value: Math.round(n), pct: false };
}
const valueLabel = (v) => (v.type === "saldo" ? `Hadiah saldo <b>${rp(v.value)}</b>` : v.pct ? `Diskon <b>${v.value}%</b>` : `Potongan <b>${rp(v.value)}</b>`);
const expLabel = (at) => (at ? `${esc(fmtTime(at))} ${esc(TZL)}` : "Tanpa batas");
const isExpired = (v) => !!(v.expiresAt && Date.now() > v.expiresAt);
const usedCount = (v) => (v.used || []).length;
const statusOf = (v) => (isExpired(v) ? "Kedaluwarsa" : v.max && usedCount(v) >= v.max ? "Kuota habis" : "Aktif");

function create({ code, type, value, pct, max, expiresAt, scope, by }) {
  code = normCode(code);
  if (!validCode(code)) return { ok: false, why: "Kode 3-20 karakter: huruf, angka, - atau _" };
  if (S.codes[code]) return { ok: false, why: "Kode sudah ada" };
  if (!["saldo", "diskon"].includes(type)) return { ok: false, why: "Jenis harus saldo / diskon" };
  const v = { code, type, value: Math.round(value), pct: type === "diskon" && !!pct, max: Math.max(0, Math.round(max || 0)), expiresAt: expiresAt || 0, scope: type === "diskon" ? (SCOPES[scope] ? scope : "all") : null, used: [], createdAt: Date.now(), by: String(by || "") };
  S.codes[code] = v;
  save();
  return { ok: true, v };
}
function remove(code) {
  code = normCode(code);
  const v = S.codes[code];
  if (!v) return null;
  delete S.codes[code];
  for (const [uid, a] of Object.entries(S.active)) if (a.code === code) delete S.active[uid];
  save();
  return v;
}

// Redeem oleh pengguna -> { ok, why } | { ok, kind: "saldo", amount, balance } | { ok, kind: "diskon", v }
function redeem(u, raw) {
  const code = normCode(raw);
  const v = S.codes[code];
  const uid = String(u.id);
  if (!v) return { ok: false, why: "Kode tidak ditemukan. Periksa lagi penulisannya." };
  if (isExpired(v)) return { ok: false, why: "Kode ini sudah kedaluwarsa." };
  if ((v.used || []).some((x) => String(x.uid) === uid)) return { ok: false, why: "Anda sudah pernah memakai kode ini." };
  if (v.max && usedCount(v) >= v.max) return { ok: false, why: "Kuota kode ini sudah habis." };
  if (v.type === "diskon") {
    const cur = S.active[uid];
    if (cur && S.codes[cur.code] && !(cur.expiresAt && Date.now() > cur.expiresAt) && cur.code !== code) return { ok: false, why: `Anda masih punya diskon aktif (${cur.code}). Pakai dulu untuk pembelian.` };
    v.used.push({ uid, at: Date.now(), name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.name || "", username: u.username || "" });
    S.active[uid] = { code, pct: v.pct, value: v.value, scope: v.scope || "all", expiresAt: v.expiresAt || 0, at: Date.now() };
    save();
    return { ok: true, kind: "diskon", v };
  }
  v.used.push({ uid, at: Date.now(), name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.name || "", username: u.username || "" });
  save();
  const balance = require("./noktel").addBal(uid, v.value);
  return { ok: true, kind: "saldo", amount: v.value, balance, v };
}

// Diskon aktif milik pengguna untuk satu jenis pembelian (tidak memotong apa-apa). -> { final, cut, code, label } | null
function activeFor(uid, scope) {
  const a = S.active[String(uid)];
  if (!a) return null;
  if (a.expiresAt && Date.now() > a.expiresAt) { delete S.active[String(uid)]; save(); return null; }
  if (a.scope !== "all" && a.scope !== scope) return null;
  return a;
}
function priceFor(uid, price, scope) {
  const a = activeFor(uid, scope);
  price = Math.round(Number(price) || 0);
  if (!a || !(price > 0)) return { final: price, cut: 0, code: null };
  let cut = a.pct ? Math.floor((price * a.value) / 100) : a.value;
  const floor = price >= 1000 ? 1000 : price; // QRIS minimal Rp1.000
  cut = Math.max(0, Math.min(cut, price - floor));
  return { final: price - cut, cut, code: a.code, label: a.pct ? `${a.value}%` : rp(a.value) };
}
// dipanggil setelah pembayaran lunas
function consume(uid, code) {
  const a = S.active[String(uid)];
  if (a && (!code || a.code === code)) { delete S.active[String(uid)]; save(); }
}

// ---------------------------------------------------------------- kartu
function menuCard(note) {
  const all = Object.values(S.codes);
  const act = all.filter((v) => statusOf(v) === "Aktif");
  return UI.card({
    title: "Kode Voucher & Diskon", icon: "gem",
    rows: [
      ["box", "Total kode", `<b>${all.length}</b> · aktif <b>${act.length}</b>`],
      ["chart", "Hadiah saldo aktif", `<b>${act.filter((v) => v.type === "saldo").length}</b>`],
      ["tag", "Diskon aktif", `<b>${act.filter((v) => v.type === "diskon").length}</b>`],
      ["user", "Total diklaim", `<b>${all.reduce((n, v) => n + usedCount(v), 0)}</b> kali`],
    ],
    checks: [[true, "HADIAH SALDO: saldo langsung masuk ketika diklaim"], [true, "DISKON: otomatis dipotong di pembelian berikutnya"], [true, "Atur kuota pemakai & tanggal kedaluwarsa"]],
    note: note || "Pengguna klaim lewat tombol <b>Redeem Kode</b> di /start atau <code>/redeem KODE</code>.<br>Cepat: <code>/buatkode saldo HADIAH1 5000 10 7h</code> · <code>/buatkode diskon HEMAT 10% 50 24j role</code>",
  });
}
const menuKb = (fancy) => [
  [btn(fancy, "Buat Kode Baru", "vc:n", "success", UI.E.rocket)],
  [btn(fancy, "Daftar Kode", "vc:l:0", "primary", UI.E.box)],
  [btn(fancy, "Kembali ke Panel Owner", "own", "plain", UI.E.wave)],
];
function detailCard(v, note) {
  const last = (v.used || []).slice(-5).reverse();
  return UI.card({
    title: `Kode ${v.code}`, icon: v.type === "saldo" ? "gem" : "tag",
    rows: [
      ["tag", "Kode", `<code>${esc(v.code)}</code>`],
      ["gem", "Jenis", v.type === "saldo" ? "<b>HADIAH SALDO</b>" : "<b>DISKON</b>"],
      ["chart", "Nilai", valueLabel(v)],
      ...(v.type === "diskon" ? [["box", "Berlaku untuk", esc(SCOPES[v.scope] || SCOPES.all)]] : []),
      ["user", "Dipakai", `<b>${usedCount(v)}</b> / ${v.max ? v.max : "tanpa batas"}`],
      ["time", "Kedaluwarsa", expLabel(v.expiresAt)],
      ["bolt", "Status", `<b>${statusOf(v)}</b>`],
    ],
    extra: last.length ? `<p><b>Pemakai terakhir</b></p><ul>${last.map((x) => `<li>${esc(x.name || "-")}${x.username ? " (@" + esc(x.username) + ")" : ""} · <code>${esc(x.uid)}</code> · ${esc(fmtTime(x.at))}</li>`).join("")}</ul>` : "",
    note: note || "",
  });
}
function redeemPrompt() {
  return UI.card({
    title: "Redeem Kode", icon: "gem",
    sub: "Kirim <b>kode voucher / hadiah / diskon</b> Anda sekarang.",
    rows: [["tag", "Contoh", "<code>HADIAH2026</code>"]],
    checks: [[true, "Kode hadiah saldo: saldo langsung masuk"], [true, "Kode diskon: dipakai otomatis ketika Anda membeli"]],
    note: "Ketik <code>batal</code> untuk membatalkan.",
  });
}
function redeemResult(r, uid) {
  if (!r.ok) return UI.card({ title: "Kode Gagal Diklaim", icon: "no", rows: [["no", "Sebab", esc(r.why)]] });
  if (r.kind === "saldo") {
    return UI.card({
      title: "Hadiah Saldo Diklaim", icon: "ok",
      rows: [["tag", "Kode", `<code>${esc(r.v.code)}</code>`], ["gem", "Hadiah", `<b>${rp(r.amount)}</b>`], ["chart", "Saldo sekarang", `<b>${rp(r.balance)}</b>`]],
      checks: [[true, "Saldo sudah masuk ke akun Anda"], [true, "Pakai untuk membeli noktel"]],
    });
  }
  const v = r.v;
  return UI.card({
    title: "Diskon Aktif", icon: "ok",
    rows: [["tag", "Kode", `<code>${esc(v.code)}</code>`], ["gem", "Nilai", valueLabel(v)], ["box", "Berlaku untuk", esc(SCOPES[v.scope] || SCOPES.all)], ["time", "Berlaku sampai", expLabel(v.expiresAt)]],
    checks: [[true, "Diskon otomatis dipotong pada pembelian berikutnya"]],
    note: "Silakan lanjut membeli — harga yang ditampilkan ketika bayar sudah dipotong diskon.",
  });
}
const afterRedeemKb = (fancy) => [
  pair(btn(fancy, "Beli Role", "sr:m", "success", UI.E.crown), btn(fancy, "Beli Noktel", "nk:h", "success", UI.E.gem)),
  [btn(fancy, "Redeem Kode Lain", "vc:r", "primary", UI.E.tag)],
  [btn(fancy, "Kembali", "home:p:0", "plain", UI.E.wave)],
];

// ---------------------------------------------------------------- wizard owner
const state = new Map(); // uid -> { act: "redeem" } | { act: "new", step, d }
const EXP_PRESETS = [["1 Jam", "1j"], ["24 Jam", "24j"], ["3 Hari", "3h"], ["7 Hari", "7h"], ["30 Hari", "30h"], ["Tanpa Batas", "0"]];
const cancelKb = (fancy) => [[btn(fancy, "Batal", "vc:x", "danger", UI.E.no)]];

function stepCard(st) {
  const d = st.d;
  const sum = [
    ...(d.type ? [["gem", "Jenis", d.type === "saldo" ? "HADIAH SALDO" : "DISKON"]] : []),
    ...(d.code ? [["tag", "Kode", `<code>${esc(d.code)}</code>`]] : []),
    ...(d.value ? [["chart", "Nilai", valueLabel(d)]] : []),
    ...(d.max !== undefined ? [["user", "Kuota", d.max ? `${d.max} orang` : "tanpa batas"]] : []),
    ...(d.expiresAt !== undefined ? [["time", "Kedaluwarsa", expLabel(d.expiresAt)]] : []),
  ];
  if (st.step === "type") return { c: UI.card({ title: "Buat Kode (1/6) - Jenis", icon: "gem", sub: "Pilih jenis kode.", checks: [[true, "<b>HADIAH SALDO</b>: pengguna klaim, saldo langsung masuk"], [true, "<b>DISKON</b>: potongan % atau nominal untuk pembelian"]] }), kb: (f) => [pair(btn(f, "Hadiah Saldo", "vc:t:saldo", "success", UI.E.gem), btn(f, "Diskon", "vc:t:diskon", "primary", UI.E.tag)), ...cancelKb(f)] };
  if (st.step === "code") return { c: UI.card({ title: "Buat Kode (2/6) - Kode", icon: "tag", sub: "Ketik <b>kode</b> (3-20 huruf/angka, contoh <code>HEMAT10</code>) atau tekan <b>Kode Acak</b>.", rows: sum }), kb: (f) => [[btn(f, "Kode Acak", "vc:g", "success", UI.E.bolt)], ...cancelKb(f)] };
  if (st.step === "value") return { c: UI.card({ title: "Buat Kode (3/6) - Nilai", icon: "chart", sub: d.type === "saldo" ? "Kirim <b>jumlah saldo</b> hadiah, contoh <code>5000</code>." : "Kirim nilai diskon: persen <code>10%</code> atau nominal <code>2000</code>.", rows: sum }), kb: cancelKb };
  if (st.step === "max") return { c: UI.card({ title: "Buat Kode (4/6) - Kuota", icon: "user", sub: "Kirim <b>jumlah orang</b> yang bisa memakai kode ini (contoh <code>10</code>). Kirim <code>0</code> = tanpa batas.", rows: sum }), kb: (f) => [pair(btn(f, "1", "vc:q:1", "primary"), btn(f, "10", "vc:q:10", "primary"), btn(f, "50", "vc:q:50", "primary"), btn(f, "100", "vc:q:100", "primary")), [btn(f, "Tanpa Batas", "vc:q:0", "plain")], ...cancelKb(f)] };
  if (st.step === "exp") return { c: UI.card({ title: "Buat Kode (5/6) - Kedaluwarsa", icon: "time", sub: "Pilih waktu berlaku, atau ketik: <code>30m</code> (menit) · <code>12j</code> (jam) · <code>7h</code> (hari) · <code>2026-12-31</code> · <code>2026-12-31 20:00</code>", rows: sum }), kb: (f) => [...[0, 2, 4].map((i) => pair(btn(f, EXP_PRESETS[i][0], `vc:e:${EXP_PRESETS[i][1]}`, "primary"), btn(f, EXP_PRESETS[i + 1][0], `vc:e:${EXP_PRESETS[i + 1][1]}`, "primary"))), ...cancelKb(f)] };
  if (st.step === "scope") return { c: UI.card({ title: "Buat Kode (6/6) - Berlaku Untuk", icon: "box", sub: "Diskon dipakai untuk pembelian apa?", rows: sum }), kb: (f) => [[btn(f, "Semua Pembelian", "vc:s:all", "success")], pair(btn(f, "Beli / Up Role", "vc:s:role", "primary"), btn(f, "Beli Noktel", "vc:s:noktel", "primary")), ...cancelKb(f)] };
  return null;
}

function register(bot) {
  const chatOf = (ctx) => (ctx.callbackQuery && ctx.callbackQuery.message ? ctx.callbackQuery.message.chat.id : ctx.chat ? ctx.chat.id : ctx.from.id);
  const alert = (ctx, text) => ctx.answerCallbackQuery({ text, show_alert: true });

  async function next(chat, uid) {
    const st = state.get(String(uid));
    const s = st && stepCard(st);
    if (s) return UI.sendCard(chat, s.c, s.kb);
  }
  async function finish(chat, uid) {
    const st = state.get(String(uid));
    state.delete(String(uid));
    const r = create({ ...st.d, by: uid });
    if (!r.ok) return UI.sendCard(chat, UI.card({ title: "Gagal Membuat Kode", icon: "no", rows: [["no", "Sebab", esc(r.why)]] }), menuKb);
    return UI.sendCard(chat, detailCard(r.v, `Kode siap dibagikan. Pengguna klaim lewat tombol <b>Redeem Kode</b> atau <code>/redeem ${esc(r.v.code)}</code>.`), (f) => [[btn(f, "Buat Kode Lagi", "vc:n", "success", UI.E.rocket)], [btn(f, "Daftar Kode", "vc:l:0", "primary", UI.E.box)]]);
  }
  function afterValue(st) { st.step = "max"; }
  function afterExp(st) { st.step = st.d.type === "diskon" ? "scope" : "done"; }
  async function doRedeem(chat, u, code) {
    const r = redeem(u, code);
    if (r.ok) {
      try {
        require("./notify").fire("voucher", u, [["Kode", `<code>${esc(r.v.code)}</code>`], ["Jenis", r.kind === "saldo" ? "Hadiah saldo" : "Diskon"], ["Nilai", valueLabel(r.v)], ["Terpakai", `${usedCount(r.v)} / ${r.v.max || "tanpa batas"}`]]);
      } catch (_) {}
    }
    return UI.sendCard(chat, redeemResult(r, u.id), r.ok ? afterRedeemKb : (f) => [[btn(f, "Coba Kode Lain", "vc:r", "primary", UI.E.tag)], [btn(f, "Kembali", "home:p:0", "plain", UI.E.wave)]]);
  }

  bot.callbackQuery(/^vc:(\w+)(?::([\w-]+))?$/, async (ctx) => {
    const [, a, x] = ctx.match;
    const uid = String(ctx.from.id);
    const chat = chatOf(ctx);
    if (a === "r") { // pengguna: Redeem Kode
      await ctx.answerCallbackQuery().catch(() => {});
      state.set(uid, { act: "redeem" });
      return UI.sendCard(chat, redeemPrompt(), (f) => [[btn(f, "Batal", "vc:rx", "danger", UI.E.no)]]);
    }
    if (a === "rx") { state.delete(uid); await ctx.answerCallbackQuery({ text: "Dibatalkan" }).catch(() => {}); return; }
    if (!isOwner(uid)) return alert(ctx, "Khusus owner.");
    await ctx.answerCallbackQuery().catch(() => {});
    if (a === "m") return UI.sendCard(chat, menuCard(), menuKb);
    if (a === "x") { state.delete(uid); return UI.sendCard(chat, menuCard("Pembuatan kode dibatalkan."), menuKb); }
    if (a === "n") { state.set(uid, { act: "new", step: "type", d: {} }); return next(chat, uid); }
    const st = state.get(uid);
    const inWiz = st && st.act === "new";
    if (a === "t" && inWiz && st.step === "type" && ["saldo", "diskon"].includes(x)) { st.d.type = x; st.step = "code"; return next(chat, uid); }
    if (a === "g" && inWiz && st.step === "code") { st.d.code = randCode(); st.step = "value"; return next(chat, uid); }
    if (a === "q" && inWiz && st.step === "max") { st.d.max = Number(x) || 0; st.step = "exp"; return next(chat, uid); }
    if (a === "e" && inWiz && st.step === "exp") {
      const e = parseExpiry(x);
      if (!e) return;
      st.d.expiresAt = e.at; afterExp(st);
      return st.step === "done" ? finish(chat, uid) : next(chat, uid);
    }
    if (a === "s" && inWiz && st.step === "scope" && SCOPES[x]) { st.d.scope = x; return finish(chat, uid); }
    if (a === "l") {
      const list = Object.values(S.codes).sort((p, q) => q.createdAt - p.createdAt);
      if (!list.length) return UI.sendCard(chat, menuCard("Belum ada kode. Tekan <b>Buat Kode Baru</b>."), menuKb);
      const pages = Math.max(1, Math.ceil(list.length / PAGE));
      const pg = Math.min(Math.max(0, Number(x) || 0), pages - 1);
      const slice = list.slice(pg * PAGE, (pg + 1) * PAGE);
      return UI.sendCard(chat, UI.card({
        title: `Daftar Kode (${list.length})`, icon: "box", headers: ["Kode", "Nilai · Pakai · Status"],
        rows: slice.map((v) => ["tag", `<code>${esc(v.code)}</code>`, `${v.type === "saldo" ? rp(v.value) + " saldo" : v.pct ? v.value + "% diskon" : rp(v.value) + " diskon"} · ${usedCount(v)}/${v.max || "∞"} · <b>${statusOf(v)}</b>`]),
        note: pages > 1 ? `Halaman ${pg + 1} dari ${pages}. Tekan kode untuk detail / hapus.` : "Tekan kode untuk detail / hapus.",
      }), (f) => [
        ...slice.map((v) => [btn(f, `${v.code} · ${statusOf(v)}`, `vc:d:${v.code}`, statusOf(v) === "Aktif" ? "success" : "plain")]),
        ...(pages > 1 ? [pair(btn(f, "◀️ Prev", `vc:l:${(pg - 1 + pages) % pages}`, "primary"), btn(f, "Next ▶️", `vc:l:${(pg + 1) % pages}`, "primary"))] : []),
        [btn(f, "Kembali", "vc:m", "plain", UI.E.wave)],
      ]);
    }
    if (a === "d" || a === "dy" || a === "dz") {
      const v = S.codes[normCode(x)];
      if (!v) return UI.sendCard(chat, menuCard("Kode tidak ditemukan (mungkin sudah dihapus)."), menuKb);
      if (a === "d") return UI.sendCard(chat, detailCard(v), (f) => [[btn(f, "Hapus Kode", `vc:dy:${v.code}`, "danger", UI.E.no)], [btn(f, "Daftar Kode", "vc:l:0", "plain", UI.E.box)]]);
      if (a === "dy") return UI.sendCard(chat, UI.card({ title: "Hapus Kode?", icon: "fire", rows: [["tag", "Kode", `<code>${esc(v.code)}</code>`], ["chart", "Nilai", valueLabel(v)]], note: "Kode tidak bisa diklaim lagi. Diskon aktif dari kode ini ikut dicabut." }), (f) => [pair(btn(f, "Ya, Hapus", `vc:dz:${v.code}`, "danger"), btn(f, "Batal", `vc:d:${v.code}`, "primary"))]);
      remove(v.code);
      return UI.sendCard(chat, menuCard(`Kode <code>${esc(v.code)}</code> dihapus.`), menuKb);
    }
  });

  // pesan teks: redeem (pengguna) + wizard (owner). Harus sebelum Live Chat.
  bot.on("message", async (ctx, nextMw) => {
    if (!ctx.chat || ctx.chat.type !== "private" || !ctx.from) return nextMw();
    const uid = String(ctx.from.id);
    const st = state.get(uid);
    const text = typeof ctx.message.text === "string" ? ctx.message.text.trim() : null;
    if (!st || text === null) return nextMw();
    if (text.startsWith("/")) { if (/^\/(batal|cancel)\b/i.test(text)) { state.delete(uid); return ctx.reply("Dibatalkan."); } state.delete(uid); return nextMw(); }
    if (/^batal$/i.test(text)) { state.delete(uid); return UI.sendCard(ctx.chat.id, UI.card({ title: "Dibatalkan", icon: "no", rows: [["info", "Status", "Dibatalkan"]] }), st.act === "new" ? menuKb : undefined); }
    if (st.act === "redeem") { state.delete(uid); return doRedeem(ctx.chat.id, ctx.from, text); }
    if (st.act !== "new" || !isOwner(uid)) return nextMw();
    const d = st.d;
    const bad = (why) => UI.sendCard(ctx.chat.id, UI.card({ title: "Tidak Valid", icon: "no", rows: [["no", "Sebab", why]] }), cancelKb);
    if (st.step === "type") return next(ctx.chat.id, uid);
    if (st.step === "code") {
      const c = normCode(text);
      if (!validCode(c)) return bad("Kode 3-20 karakter: huruf, angka, - atau _");
      if (S.codes[c]) return bad("Kode sudah dipakai, pilih kode lain");
      d.code = c; st.step = "value"; return next(ctx.chat.id, uid);
    }
    if (st.step === "value") {
      const v = parseValue(text, d.type);
      if (!v) return bad(d.type === "saldo" ? "Kirim angka rupiah, contoh <code>5000</code>" : "Kirim <code>10%</code> (1-100%) atau nominal <code>2000</code>");
      d.value = v.value; d.pct = v.pct; afterValue(st); return next(ctx.chat.id, uid);
    }
    if (st.step === "max") {
      const n = Number(text.replace(/\D/g, ""));
      if (!/\d/.test(text) || n > 1000000) return bad("Kirim angka, contoh <code>10</code> (0 = tanpa batas)");
      d.max = n; st.step = "exp"; return next(ctx.chat.id, uid);
    }
    if (st.step === "exp") {
      const e = parseExpiry(text);
      if (!e) return bad("Contoh: <code>30m</code> · <code>12j</code> · <code>7h</code> · <code>2026-12-31</code> · <code>0</code>");
      d.expiresAt = e.at; afterExp(st);
      return st.step === "done" ? finish(ctx.chat.id, uid) : next(ctx.chat.id, uid);
    }
    if (st.step === "scope") {
      const s = text.toLowerCase();
      const k = /^(all|semua)/.test(s) ? "all" : /role/.test(s) ? "role" : /nok/.test(s) ? "noktel" : null;
      if (!k) return next(ctx.chat.id, uid);
      d.scope = k; return finish(ctx.chat.id, uid);
    }
    return nextMw();
  });

  bot.command("redeem", async (ctx) => {
    if (!ctx.chat || ctx.chat.type !== "private") return;
    const code = String(ctx.match || "").trim();
    if (!code) { state.set(String(ctx.from.id), { act: "redeem" }); return UI.sendCard(ctx.chat.id, redeemPrompt(), (f) => [[btn(f, "Batal", "vc:rx", "danger", UI.E.no)]]); }
    return doRedeem(ctx.chat.id, ctx.from, code);
  });
  const guard = (fn) => async (ctx) => { if (ctx.chat && ctx.chat.type === "private" && isOwner(ctx.from.id)) return fn(ctx); };
  bot.command("buatkode", guard(async (ctx) => {
    const [t, code, val, max, exp, scope] = String(ctx.match || "").trim().split(/\s+/);
    const type = /^saldo|hadiah/i.test(t || "") ? "saldo" : /^diskon|disc/i.test(t || "") ? "diskon" : null;
    const v = type && parseValue(val, type);
    const e = parseExpiry(exp === undefined ? "0" : exp);
    const usage = UI.card({ title: "Cara Pakai", icon: "gear", rows: [
      ["tag", "Hadiah saldo", "<code>/buatkode saldo KODE 5000 10 7h</code>"],
      ["tag", "Diskon", "<code>/buatkode diskon KODE 10% 50 24j role</code>"],
      ["info", "Urutan", "jenis · kode (atau <code>acak</code>) · nilai · kuota (0 = tanpa batas) · kedaluwarsa (0 = tanpa batas) · berlaku (all / role / noktel)"],
    ] });
    if (!type || !code || !v || !e || (max !== undefined && !/^\d+$/.test(max))) return UI.sendCard(ctx.chat.id, usage);
    const r = create({ code: /^acak|random$/i.test(code) ? randCode() : code, type, value: v.value, pct: v.pct, max: Number(max || 0), expiresAt: e.at, scope: String(scope || "all").toLowerCase(), by: ctx.from.id });
    if (!r.ok) return UI.sendCard(ctx.chat.id, UI.card({ title: "Gagal Membuat Kode", icon: "no", rows: [["no", "Sebab", esc(r.why)]] }));
    return UI.sendCard(ctx.chat.id, detailCard(r.v, "Kode siap dibagikan."));
  }));
  bot.command("listkode", guard((ctx) => UI.sendCard(ctx.chat.id, menuCard(), menuKb)));
  bot.command("hapuskode", guard((ctx) => {
    const v = remove(String(ctx.match || "").trim());
    return UI.sendCard(ctx.chat.id, UI.card({ title: v ? "Kode Dihapus" : "Tidak Ditemukan", icon: v ? "ok" : "no", rows: [["tag", "Kode", `<code>${esc(normCode(ctx.match))}</code>`]] }));
  }));
}

module.exports = { register, redeem, priceFor, activeFor, consume, create, remove, parseExpiry, parseValue, menuCard, menuKb, rp, _S: () => S };

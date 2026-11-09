// Beli Role & Up Role MANDIRI (self-service) lewat payment gateway QRIS (AGW / SMP Payment) - aktif OTOMATIS, tanpa kirim bukti.
//   Beli Role : beli / perpanjang role (paket LITE / GOLD / PLATINUM) -> role aktif + tambah hari
//   Up Role   : naik ke role yang lebih tinggi (masa aktif tetap, tidak ditambah)
// Harga default Rp1.000 per role. Atur di config.json:
//   "self_role": { "enabled": true, "price": 1000, "days": 30, "prices": { "GOLD": { "price": 1000, "days": 30 } } }
// Kunci gateway: pakai kredensial OWNER (config.json "gateway" + env AGW_KEY / AGW_SECRET), uang masuk ke akun gateway owner.
// ASCII saja (emoji ditulis \uXXXX).
const db = require("./db");
const access = require("./access");
const PK = require("./paket");
const gw = require("./gateway");
const qr = require("./qr");
const { cfg, tg, esc, em, btn, fmtTime, TZL, premiumOn } = require("./core");
const UI = require("./botui");

const TCODE = { L: "LITE", G: "GOLD", P: "PLATINUM", R: "RESELLER", T: "TANGAN KANAN" };
const CODEOF = { LITE: "L", GOLD: "G", PLATINUM: "P", RESELLER: "R", "TANGAN KANAN": "T" };
const MODE_NAME = { buy: "Beli Role", up: "Up Role" };

// ---------------------------------------------------------------- pengaturan
const num = (v, d) => (Number(v) > 0 ? Math.round(Number(v)) : d);
function conf() {
  const c = cfg.self_role || {};
  const base = num(c.price, 1000);
  const days = num(c.days, 30);
  const prices = {};
  const dbp = (require("./db").getSetting("self_role_prices")) || {}; // harga yang diatur owner lewat bot (prioritas)
  for (const t of PK.ORDER) {
    const p = (dbp[t] !== undefined ? dbp[t] : c.prices && c.prices[t]);
    const isObj = p && typeof p === "object";
    prices[t] = { price: num(isObj ? p.price : p, base), days: num(isObj ? p.days : null, days) };
  }
  // Role RESELLER (sekali bayar, bisa menambah role LITE/GOLD/PLATINUM ke pengguna). Harga default 5.000; owner bisa ubah lewat /setharga RESELLER 5000
  const rp0 = dbp.RESELLER !== undefined ? dbp.RESELLER : c.reseller_price;
  const reseller = { price: num(rp0 && typeof rp0 === "object" ? rp0.price : rp0, 5000), days: 0 };
  // Role TANGAN KANAN (sekali bayar, default Rp7.000): bisa /addrole LITE, GOLD, PLATINUM dan RESELLER. Owner bisa ubah: /setharga TK 7000
  const tp0 = dbp.TANGAN_KANAN !== undefined ? dbp.TANGAN_KANAN : c.tangan_kanan_price;
  const tk = { price: num(tp0 && typeof tp0 === "object" ? tp0.price : tp0, 7000), days: 0 };
  return { enabled: c.enabled !== false, prices, reseller, tk };
}
const rp = (n) => "Rp" + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const ownerId = () => String((Array.isArray(cfg.owner_ids) && cfg.owner_ids[0]) || cfg.owner_id || "");
const creds = () => (ownerId() ? gw.credsFor(ownerId(), { sales: true }) : null);
const inv = (no) => "ROLE-" + String(no).padStart(4, "0");
const fullName = (u) => [u.first_name, u.last_name].filter(Boolean).join(" ") || "-";

// harga terendah untuk label di /start (mis. "Rp1.000")
const minPriceLabel = () => rp(Math.min(...PK.ORDER.map((t) => conf().prices[t].price)));

// role aktif pengguna: null jika belum punya role
function roleOf(uid) {
  if (access.isOwner(uid)) return "OWNER";
  const rec = db.getUser(uid) || {};
  return rec.status === "approved" ? PK.tierOf(uid) : null;
}

// ---------------------------------------------------------------- pesanan
const WAIT = "gw_wait";
const waitingOrder = (uid) => db.orders().filter((o) => o.kind === "selfrole" && o.status === WAIT && String(o.userId) === String(uid)).sort((a, b) => b.no - a.no)[0] || null;

// ---------------------------------------------------------------- kartu
const tierIcon = { LITE: "star", GOLD: "crown", PLATINUM: "gem", RESELLER: "user", "TANGAN KANAN": "crown" };

// Tangga role: LITE < GOLD < PLATINUM < RESELLER < TANGAN KANAN (tertinggi yang bisa dibeli; OWNER di luar tangga)
// -1 = belum punya role, 0..2 = paket LITE/GOLD/PLATINUM, 3 = RESELLER, 4 = TANGAN KANAN, 99 = OWNER
function ladderIdx(uid) {
  if (access.isOwner(uid)) return 99;
  if (access.isTK(uid)) return 4;
  if (access.isReseller(uid)) return 3;
  const cur = roleOf(uid);
  return cur ? PK.ORDER.indexOf(cur) : -1;
}

function menuCard(mode, uid) {
  const c = conf();
  const cur = roleOf(uid);
  const li = ladderIdx(uid);
  const list = mode === "up" ? PK.ORDER.filter((t) => PK.ORDER.indexOf(t) > li) : PK.ORDER.filter((t) => !cur || PK.rankOf(t) >= PK.rankOf(cur));
  const rows = list.map((t) => [tierIcon[t], PK.badge(t), `<b>${rp(c.prices[t].price)}</b>${mode === "buy" ? ` \u00B7 ${c.prices[t].days} hari` : ""}`]);
  const sub = mode === "up"
    ? `Role Anda sekarang: <b>${access.isTK(uid) ? "TANGAN KANAN" : access.isReseller(uid) ? "RESELLER" : cur ? PK.badge(cur) : "-"}</b>. Naik bertahap sampai <b>TANGAN KANAN</b> (tertinggi) \u2014 paket tetap berlaku.`
    : `Bayar via <b>QRIS</b>, role aktif <b>otomatis</b> begitu pembayaran masuk \u2014 tanpa kirim bukti.${cur && cur !== "OWNER" ? ` Role sekarang: <b>${PK.badge(cur)}</b>.` : ""}`;
  const canReseller = mode === "buy" ? !require("./access").isStaff(uid) : li >= 0 && li < 3;
  const canTK = mode === "buy" ? !access.isOwner(uid) && !access.isTK(uid) : li >= 0 && li < 4;
  if (canReseller) rows.push(["user", "RESELLER", `<b>${rp(c.reseller.price)}</b> \u00B7 sekali bayar, bisa tambah role pengguna`]);
  if (canTK) rows.push(["crown", "TANGAN KANAN", `<b>${rp(c.tk.price)}</b> \u00B7 sekali bayar, bisa tambah LITE / GOLD / PLATINUM / RESELLER`]);
  const out = UI.card({
    title: MODE_NAME[mode], icon: mode === "up" ? "rocket" : "crown", sub,
    headers: ["Role", mode === "up" ? "Harga" : "Harga \u00B7 Aktif"], rows,
    checks: [[true, "Pembayaran QRIS (e-wallet / m-banking)"], [true, "Aktif otomatis setelah lunas"]],
    note: `${UI.ico("fire")} Pilih role di bawah untuk membuat QRIS.`,
  });
  const kb = (fancy) => [
    ...list.map((t) => [btn(fancy, `${t} \u00B7 ${rp(c.prices[t].price)}`, `sr:${mode === "up" ? "u" : "b"}:${CODEOF[t]}`, PK.TIERS[t].style, PK.TIERS[t].icon)]),
    ...(canReseller ? [[btn(fancy, `RESELLER \u00B7 ${rp(c.reseller.price)}`, `sr:${mode === "up" ? "u" : "b"}:R`, "success", UI.E.crown)]] : []),
    ...(canTK ? [[btn(fancy, `TANGAN KANAN \u00B7 ${rp(c.tk.price)}`, `sr:${mode === "up" ? "u" : "b"}:T`, "primary", UI.E.crown)]] : []),
    [btn(fancy, "Kembali", "sr:h", "primary", UI.E.wave)],
  ];
  return { c: out, kb };
}

const infoCard = (title, icon, rows, note, kb) => ({ c: UI.card({ title, icon, rows, note }), kb: kb || null });
const backKb = (fancy) => [[btn(fancy, "Kembali", "sr:h", "primary", UI.E.wave)]];

function waitHtmlCaption(o, r) {
  return [
    `${em(UI.E.gem, "\uD83D\uDC8E")} <b>QRIS ${esc(MODE_NAME[o.mode].toUpperCase())} ${esc(o.paket)}</b>`,
    `${em(UI.E.bolt, "\u26A1")} Total bayar: <b>${rp(r.total || r.amount)}</b>`,
    ...(r.provider === "manual"
      ? [`${em(UI.E.green, "\uD83D\uDFE2")} Scan QRIS ini, bayar <b>tepat</b> sesuai total, lalu <b>kirim screenshot bukti bayar ke chat ini</b>.`, `\u23F3 Role aktif setelah owner mengonfirmasi (ACCEPT).`]
      : [`${em(UI.E.green, "\uD83D\uDFE2")} Scan QR ini \u2014 role aktif <b>otomatis</b> setelah lunas.`, `\u2757 Bayar <b>persis</b> sesuai total di atas (sudah termasuk ${r.provider === "austin" ? "biaya & kode unik" : "kode unik"}), kalau tidak pembayaran tidak terdeteksi.`]),
  ].join("\n");
}

// kartu Rich (tabel + emoji premium) berisi rincian pembayaran
function payCard(o, r, note) {
  const rows = [
    ["tag", "Invoice", `<code>${esc(inv(o.no))}</code>`],
    [tierIcon[o.paket], "Role", `<b>${esc(o.paket)}</b>${o.mode === "buy" && o.days > 0 ? ` \u00B7 ${o.days} hari` : ""}`],
    ["chart", "Harga", rp(r.amount)],
    ...(o.disc && o.disc.cut ? [["tag", "Diskon", `<code>${esc(o.disc.code)}</code> \u2212${rp(o.disc.cut)} (harga asli ${rp(o.disc.orig)})`]] : []),
    ...(r.provider === "manual" ? [] : [["box", r.provider === "austin" ? "Biaya + kode unik" : "Kode unik", rp(r.fee || 0)]]),
    ["bolt", "Total bayar", `<b>${rp(r.total || r.amount)}</b>`],
    ...(r.expiredAt ? [["time", `Kedaluwarsa (${esc(TZL)})`, esc(fmtTime(r.expiredAt))]] : []),
    ...(r.payment_url ? [["link", "Halaman bayar", `<a href="${esc(r.payment_url)}">Buka halaman bayar</a>`]] : []),
  ];
  return UI.card({
    title: "Menunggu Pembayaran", icon: "time", rows,
    checks: [[true, "Scan QRIS pada gambar di bawah"], [true, "Bayar PERSIS sesuai total (sudah termasuk kode unik)"], [false, r.provider === "manual" ? "Kirim screenshot bukti bayar ke chat ini, lalu tunggu konfirmasi owner" : "Tunggu \u2014 role aktif otomatis setelah lunas"]],
    note,
  });
}

// kirim foto via unggahan langsung (grammy + lapisan bahasa merusak objek file, jadi tidak dipakai)
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

const waitKb = (no) => (fancy) => [
  [btn(fancy, "Cek Status", `sr:c:${no}`, "success", UI.E.ok), btn(fancy, "Batal", `sr:x:${no}`, "danger", UI.E.no)],
];

// ---------------------------------------------------------------- aktifkan role (idempoten)
async function completeReseller(o, uid) {
  db.addReseller(uid);
  access.activateStaff(uid);
  const rec = db.getUser(uid) || {};
  db.upsertUser(uid, { lastOrder: o.no, resellerSince: Date.now(), ...(!rec.name ? { name: o.name } : {}), ...(!rec.username && o.username ? { username: o.username } : {}) });
  if (o.qrMsg) await tg("deleteMessage", { chat_id: o.qrMsg.chat_id, message_id: o.qrMsg.message_id }).catch(() => {});
  require("./notify").fire("reseller", { id: uid, name: o.name, username: o.username }, [
    ["Invoice", `<code>${esc(inv(o.no))}</code>`], ["Dibayar", `<b>${rp(o.price)}</b>`], ["Gateway", gw.labelOf(o.txId)],
  ]);
  await UI.sendCard(uid, UI.card({
    title: "Reseller Aktif", icon: "ok",
    rows: [["tag", "Invoice", `<code>${esc(inv(o.no))}</code>`], ["user", "Role", "<b>RESELLER</b>"], ["chart", "Dibayar", `<b>${rp(o.price)}</b>`]],
    checks: [[true, "Pembayaran diterima"], [true, "Anda bisa menambah role LITE, GOLD, PLATINUM ke pengguna"], [false, "Tekan <b>PANEL RESELLER</b> di /start atau ketik <code>/addrole ID GOLD 30</code>"]],
  })).catch((e) => console.error("[selfrole] kartu reseller:", e.message));
}

async function completeTK(o, uid) {
  db.addTK(uid);
  access.activateStaff(uid);
  const rec = db.getUser(uid) || {};
  db.upsertUser(uid, { lastOrder: o.no, tkSince: Date.now(), ...(!rec.name ? { name: o.name } : {}), ...(!rec.username && o.username ? { username: o.username } : {}) });
  if (o.qrMsg) await tg("deleteMessage", { chat_id: o.qrMsg.chat_id, message_id: o.qrMsg.message_id }).catch(() => {});
  require("./notify").fire("tk", { id: uid, name: o.name, username: o.username }, [
    ["Invoice", `<code>${esc(inv(o.no))}</code>`], ["Dibayar", `<b>${rp(o.price)}</b>`], ["Gateway", gw.labelOf(o.txId)],
  ]);
  await UI.sendCard(uid, UI.card({
    title: "Tangan Kanan Aktif", icon: "ok",
    rows: [["tag", "Invoice", `<code>${esc(inv(o.no))}</code>`], ["crown", "Role", "<b>TANGAN KANAN</b>"], ["chart", "Dibayar", `<b>${rp(o.price)}</b>`]],
    checks: [[true, "Pembayaran diterima"], [true, "Anda bisa menambah role LITE, GOLD, PLATINUM dan RESELLER"], [false, "Tekan <b>PANEL TANGAN KANAN</b> di /start atau ketik <code>/addrole ID GOLD 30</code>"]],
  })).catch((e) => console.error("[selfrole] kartu tangan kanan:", e.message));
}

async function completeOrder(no) {
  const o = db.getOrder(no);
  if (!o || o.kind !== "selfrole" || o.status === "gw_paid") return;
  o.status = "gw_paid"; // tukar dulu supaya panggilan kedua (hook + cek manual) tidak mengaktifkan dua kali
  o.paidAt = Date.now();
  db.setOrder(no, o);
  if (o.disc && o.disc.code) { try { require("./voucher").consume(o.userId, o.disc.code); } catch (_) {} }

  const uid = String(o.userId);
  if (o.paket === "RESELLER") return completeReseller(o, uid);
  if (o.paket === "TANGAN KANAN") return completeTK(o, uid);
  const before = db.getUser(uid) || {};
  const stillActive = before.expiresAt && before.expiresAt > Date.now();
  db.upsertUser(uid, {
    status: "approved", paket: o.paket, paketAt: Date.now(), paketBy: "gateway", lastOrder: o.no,
    ...(!before.name ? { name: o.name } : {}), ...(!before.username && o.username ? { username: o.username } : {}),
  });
  if (o.mode === "buy" || !stillActive) require("./expiry").addDays(uid, o.days);
  let revived = false;
  try { revived = await require("./expiry").revive(uid); } catch (_) {}
  const rec = db.getUser(uid) || {};

  if (o.qrMsg) await tg("deleteMessage", { chat_id: o.qrMsg.chat_id, message_id: o.qrMsg.message_id }).catch(() => {});
  const expiry = require("./expiry");
  require("./notify").fire(o.mode === "up" ? "uprole" : "role", { id: uid, name: o.name, username: o.username }, [
    ["Invoice", `<code>${esc(inv(o.no))}</code>`], ["Role", `<b>${esc(o.paket)}</b>`], ["Dibayar", `<b>${rp(o.price)}</b>`], ["Expired", `<b>${esc(expiry.label(uid))}</b>`], ["Gateway", gw.labelOf(o.txId)],
  ]);
  await UI.sendCard(uid, UI.card({
    title: `${MODE_NAME[o.mode]} Berhasil`, icon: "ok",
    rows: [
      ["tag", "Invoice", `<code>${esc(inv(o.no))}</code>`],
      [tierIcon[o.paket], "Role", `<b>${esc(o.paket)}</b>`],
      ["time", "Expired", `<b>${esc(expiry.label(uid))}</b>`],
      ["chart", "Dibayar", `<b>${rp(o.price)}</b>`],
    ],
    checks: [[true, "Pembayaran diterima"], [true, "Role aktif otomatis"], [!!rec.session, rec.session ? `Userbot ${revived ? "dihidupkan kembali" : "siap dipakai"}` : "Tekan <b>Buat Ubot</b> untuk menyambungkan akun Anda"]],
  }), (fancy) => [rec.session ? [btn(fancy, "Kembali", "sr:h", "primary", UI.E.wave)] : [btn(fancy, "Buat Ubot", "create", "success", UI.E.rocket)]]);
}

async function endOrder(no, st) {
  const o = db.getOrder(no);
  if (!o || o.kind !== "selfrole" || o.status !== WAIT) return;
  o.status = st === "expired" ? "gw_expired" : "gw_cancel";
  db.setOrder(no, o);
  if (o.qrMsg) await tg("deleteMessage", { chat_id: o.qrMsg.chat_id, message_id: o.qrMsg.message_id }).catch(() => {});
  const c = infoCard(st === "expired" ? "QRIS Kedaluwarsa" : "Pesanan Dibatalkan", st === "expired" ? "time" : "no", [
    ["tag", "Invoice", `<code>${esc(inv(o.no))}</code>`], [tierIcon[o.paket], "Role", `<b>${esc(o.paket)}</b>`], ["chart", "Harga", `<b>${rp(o.price)}</b>`],
  ], st === "expired" ? "Waktu pembayaran habis. Tekan <b>Kembali</b> lalu pilih role lagi untuk membuat QRIS baru." : "Tekan <b>Kembali</b> bila ingin membeli lagi.", backKb);
  await UI.sendCard(o.userId, c.c, c.kb);
}

// pasang pantauan gateway untuk satu pesanan
const watchOrder = (o) => gw.watch(o.txId, { onPaid: () => completeOrder(o.no), onEnd: (_r, st) => endOrder(o.no, st) });

// ---------------------------------------------------------------- pendaftaran
function register(bot, opts = {}) {
  const isPrivate = (ctx) => ctx.chat && ctx.chat.type === "private";
  const refOf = (ctx) => { const m = ctx.callbackQuery.message; return { chat_id: m.chat.id, message_id: m.message_id }; };
  const alert = (ctx, text) => ctx.answerCallbackQuery({ text, show_alert: true });

  // sambung kembali pantauan pesanan yang belum selesai (setelah restart)
  for (const o of db.orders()) {
    if (o.kind !== "selfrole" || !o.txId) continue;
    if (o.status === "gw_expired" && gw.lateOpen(o.txId)) { watchOrder(o); continue; } // AGW masih menerima bayaran 20 menit setelah kedaluwarsa
    if (o.status !== WAIT) continue;
    const t = gw.get(o.txId);
    if (t && t.status === "completed") completeOrder(o.no).catch(() => {});
    else if (t && (t.status === "expired" || t.status === "cancelled")) endOrder(o.no, t.status).catch(() => {});
    else watchOrder(o);
  }

  // cek syarat umum sebelum membuka menu
  function gate(ctx, mode) {
    const uid = ctx.from.id;
    const c = conf();
    if (access.isOwner(uid)) return "Owner sudah memiliki akses penuh \u2014 tidak perlu membeli role.";
    if (!c.enabled) return "Pembelian role mandiri sedang ditutup. Hubungi owner.";
    if (!creds()) return "Payment gateway belum aktif. Hubungi owner.";
    if (mode === "up") {
      const li = ladderIdx(uid);
      if (li < 0) return "Anda belum punya role. Tekan Beli Role dulu.";
      if (li >= 4) return "Role Anda sudah yang tertinggi (TANGAN KANAN).";
    }
    return null;
  }

  async function openMenu(ctx, mode) {
    const err = gate(ctx, mode);
    if (err) return alert(ctx, err);
    const w = waitingOrder(ctx.from.id);
    if (w) return alert(ctx, `Anda masih punya pembayaran menunggu (${inv(w.no)}). Selesaikan atau tekan Batal dulu.`);
    await ctx.answerCallbackQuery();
    const m = menuCard(mode, ctx.from.id);
    await UI.editCard(refOf(ctx), m.c, m.kb);
  }
  bot.callbackQuery("sr:m", (ctx) => openMenu(ctx, "buy"));
  bot.callbackQuery("sr:up", (ctx) => openMenu(ctx, "up"));

  // perintah pintasan /role dan /uprole
  async function viaCommand(ctx, mode) {
    if (!isPrivate(ctx)) return;
    const err = gate(ctx, mode);
    if (err) return UI.sendCard(ctx.chat.id, UI.card({ title: MODE_NAME[mode], icon: "fire", rows: [["info", "Info", esc(err)]] }));
    const m = menuCard(mode, ctx.from.id);
    await UI.sendCard(ctx.chat.id, m.c, m.kb);
  }
  bot.command("role", (ctx) => viaCommand(ctx, "buy"));
  bot.command("uprole", (ctx) => viaCommand(ctx, "up"));

  // kembali ke /start
  bot.callbackQuery("sr:h", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (opts.editHome) await opts.editHome(refOf(ctx), ctx.from).catch(() => {});
    else if (opts.home) await UI.editCard(refOf(ctx), opts.home(ctx.from), (f) => opts.homeKb(f, ctx.from)).catch(() => {});
  });

  // pilih role -> buat QRIS
  bot.callbackQuery(/^sr:([bu]):([LGPRT])$/, async (ctx) => {
    const mode = ctx.match[1] === "u" ? "up" : "buy";
    const tier = TCODE[ctx.match[2]];
    const uid = String(ctx.from.id);
    const err = gate(ctx, mode);
    if (err) return alert(ctx, err);
    const cur = roleOf(uid);
    const isTk = tier === "TANGAN KANAN";
    const isRsl = tier === "RESELLER" || isTk; // role khusus (sekali bayar, bukan paket LITE/GOLD/PLATINUM)
    const li = ladderIdx(uid);
    if (tier === "RESELLER" && (access.isStaff(uid) || (mode === "up" && li < 0))) return alert(ctx, "Anda sudah menjadi reseller/tangan kanan/owner.");
    if (isTk && (access.isTK(uid) || access.isOwner(uid) || (mode === "up" && li < 0))) return alert(ctx, "Anda sudah menjadi tangan kanan/owner.");
    if (!isRsl && mode === "up" && PK.ORDER.indexOf(tier) <= li) return alert(ctx, "Pilih role yang lebih tinggi dari role Anda.");
    if (!isRsl && mode === "buy" && cur && PK.rankOf(tier) < PK.rankOf(cur)) return alert(ctx, `Role Anda (${cur}) sudah lebih tinggi dari ${tier}.`);
    if (waitingOrder(uid)) return alert(ctx, "Anda masih punya pembayaran yang menunggu. Selesaikan atau tekan Batal dulu.");
    const cr = creds();
    const p = isTk ? conf().tk : isRsl ? conf().reseller : conf().prices[tier];
    let dc = { final: p.price, cut: 0, code: null };
    try { dc = require("./voucher").priceFor(uid, p.price, "role"); } catch (_) {}
    await ctx.answerCallbackQuery({ text: dc.cut ? `Diskon ${dc.code} dipakai. Membuat QRIS...` : "Membuat QRIS..." }).catch(() => {});

    let no, o;
    try {
      no = db.nextReqNo();
      o = {
        no, kind: "selfrole", mode, userId: uid, name: fullName(ctx.from), username: ctx.from.username || null,
        paket: tier, days: p.days, price: dc.final, ...(dc.cut ? { disc: { code: dc.code, cut: dc.cut, orig: p.price } } : {}), method: "gateway", status: "gw_creating", createdAt: Date.now(),
      };
      db.setOrder(no, o);
    } catch (e) {
      console.error("[selfrole] buat pesanan gagal:", e.message);
      const c = infoCard("Gagal Membuat QRIS", "no", [["no", "Sebab", esc(e.message)]], "Coba lagi sebentar, atau hubungi owner jika terus gagal.", backKb);
      return UI.editCard(refOf(ctx), c.c, c.kb);
    }
    let r;
    try {
      // userId = owner supaya pemantauan gateway memakai kredensial owner; notifikasi "pembayaran diterima" ikut masuk ke owner
      r = await gw.create(cr, { userId: ownerId(), amount: o.price, note: `${MODE_NAME[mode]} ${tier} - ${ctx.from.username ? "@" + ctx.from.username : o.name} (${uid})`, chat: uid });
    } catch (e) {
      o.status = "gw_cancel";
      db.setOrder(no, o);
      console.error("[selfrole] buat QRIS gagal:", e.message);
      const c = infoCard("Gagal Membuat QRIS", "no", [["no", "Sebab", esc(e.message)]], "Coba lagi sebentar, atau hubungi owner jika terus gagal.", backKb);
      return UI.editCard(refOf(ctx), c.c, c.kb);
    }
    o.txId = r.id;
    o.status = WAIT;
    db.setOrder(no, o);
    watchOrder(o);

    // gambar QR
    let img;
    try {
      if (r.qr_url) {
        const res = await fetch(r.qr_url, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error("HTTP " + res.status);
        img = Buffer.from(await res.arrayBuffer());
      } else if (r.qris_image && /^data:image\/(png|jpe?g|webp);base64,/.test(r.qris_image)) img = Buffer.from(r.qris_image.split(",")[1], "base64");
      else if (r.payload) img = qr.png(qr.matrix(r.payload), 10);
      else throw new Error("gateway tidak mengembalikan gambar QR");
    } catch (e) {
      console.error("[selfrole] ambil QR gagal:", e.message);
      o.status = "gw_cancel";
      db.setOrder(no, o);
      const c = infoCard("Gagal Mengambil QR", "no", [["no", "Sebab", esc(e.message)]], "Tekan <b>Kembali</b> lalu coba lagi.", backKb);
      return UI.editCard(refOf(ctx), c.c, c.kb);
    }

    // kirim foto QR (premium emoji pada caption + tombol); jika gagal, kartu memuat link bayar
    const chatId = ctx.callbackQuery.message.chat.id;
    let sent = null;
    for (const fancy of premiumOn() ? [true, false] : [false]) {
      for (const plain of premiumOn() ? [false, true] : [true]) {
        const caption = waitHtmlCaption(o, r);
        try {
          sent = await sendPhotoBuf(chatId, img, plain ? UI.stripCustom(caption) : caption, { inline_keyboard: waitKb(no)(fancy) });
          break;
        } catch (e) {
          console.error("[selfrole] kirim foto QR gagal:", e.message);
        }
      }
      if (sent) break;
    }
    if (sent) {
      o.qrMsg = { chat_id: chatId, message_id: sent.message_id };
      db.setOrder(no, o);
    }
    // kartu pilihan diganti kartu rincian Rich; jika foto gagal, beri tombol Cek/Batal di kartu
    const card = payCard(o, r, sent ? "" : "QR gagal dimuat. Buka <b>Halaman bayar</b> di atas untuk membayar, lalu tekan <b>Cek Status</b>.");
    await UI.editCard(refOf(ctx), card, sent ? null : waitKb(no)).catch(() => {});
  });

  // cek status manual
  bot.callbackQuery(/^sr:c:(\d+)$/, async (ctx) => {
    const o = db.getOrder(ctx.match[1]);
    if (!o || o.kind !== "selfrole" || String(o.userId) !== String(ctx.from.id)) return alert(ctx, "Pesanan tidak ditemukan.");
    if (o.status === "gw_paid") return ctx.answerCallbackQuery({ text: "Sudah lunas \u2705 Role aktif." });
    if (o.status !== WAIT) return alert(ctx, "Pesanan ini sudah tidak aktif.");
    const t = gw.get(o.txId);
    let st = t ? t.status : "pending";
    if (st === "pending") {
      try { st = (await gw.status(creds(), o.txId, o.price)).status || st; } catch (e) { return ctx.answerCallbackQuery({ text: "Belum bisa dicek: " + e.message.slice(0, 120), show_alert: true }); }
    }
    if (st === "completed") {
      await ctx.answerCallbackQuery({ text: "Pembayaran terdeteksi \u2705 Mengaktifkan role..." });
      return completeOrder(o.no);
    }
    if (st === "expired" || st === "cancelled") {
      await ctx.answerCallbackQuery({ text: "QRIS sudah kedaluwarsa." });
      return endOrder(o.no, st);
    }
    return ctx.answerCallbackQuery({ text: "Belum ada pembayaran. Selesaikan scan QRIS lalu cek lagi sebentar \u23F3", show_alert: true });
  });

  // batal
  bot.callbackQuery(/^sr:x:(\d+)$/, async (ctx) => {
    const o = db.getOrder(ctx.match[1]);
    if (!o || o.kind !== "selfrole" || String(o.userId) !== String(ctx.from.id)) return alert(ctx, "Pesanan tidak ditemukan.");
    if (o.status !== WAIT) return alert(ctx, "Pesanan ini sudah tidak aktif.");
    await ctx.answerCallbackQuery({ text: "Pesanan dibatalkan." });
    await endOrder(o.no, "cancelled");
    try { // AGW: batalkan tagihan di gateway juga (jika sudah terlanjur lunas, gateway menolak dan role tetap aktif otomatis)
      const t = o.txId && gw.get(o.txId);
      if (t) await gw.cancelTx(t);
    } catch (e) { console.error("[selfrole] batal di gateway:", e.message); }
  });
}

module.exports = { register, conf, rp, minPriceLabel, roleOf, _menuCard: menuCard, _ladderIdx: ladderIdx };

if (require("./supervisor").runMaster()) return; // AUTO HIDUP: proses utama hanya mengawasi, bot jalan sebagai proses anak
require("./quiet"); // redam log TIMEOUT gramJS
const SUP = require("./supervisor");
const { Bot, BotError } = require("grammy");
const fs = require("fs");
const path = require("path");
const { cfg, tg, tgRaw, esc, em, btn, pair, outside, send, sendRich, editRich, loadPlugins, shared } = require("./core");
const LD = require("./loading");
const db = require("./db");
const manager = require("./manager");
const access = require("./access");
const login = require("./login");
const expiry = require("./expiry");
const PK = require("./paket");
const panel = require("./panel");
const pay = require("./pay");
const NT = require("./notify"); // notifikasi Rich ke channel
const AC = require("./adminctl"); // admin ubot -> tombol CONTROL UBOT
const OWNERP = require("./ownerpanel");
const QM = require("./qrismode"); // Mode QRIS owner: otomatis 1 (AGW) / otomatis 2 (AustinPay) / manual // panel owner: SEMUA fitur owner (harga, owner, broadcast pin, backup, dll)
const BC = require("./bcpin"); // owner: broadcast + pin ke semua pengguna
const RSLP = require("./resellerpanel"); // reseller: /addrole + PANEL RESELLER
const SR = require("./selfrole");
const STORE = require("./storebot"); // BUAT STORE UBOT (reseller / tangan kanan)
const BACKUP = require("./backup"); // autobackup SC + database ke owner
const NK = require("./noktel"); // BELI NOKTEL (akun Telegram siap pakai): saldo, QRIS, OTP, logout
const PRD = require("./products"); // PRODUK LAINNYA + BELI SC // Beli Role / Up Role mandiri via payment gateway QRIS
const live = require("./live");
const UI = require("./botui");

if (!cfg.bot_token || String(cfg.bot_token).startsWith("ISI_")) {
  console.error(
    ["", "=".repeat(64),
      "BOT TIDAK BOLEH MULA: bot_token belum diisi.",
      "Pilih satu:",
      "  1) Buka config.json (sebelah package.json) dan isi bot_token, api_id, api_hash.",
      "  2) ATAU di panel Pterodactyl > Startup > Variables, letak: BOT_TOKEN, API_ID, API_HASH.",
      "Token dari @BotFather. api_id/api_hash dari my.telegram.org.",
      "=".repeat(64), ""].join("\n")
  );
  process.exit(78); // config salah: supervisor tidak me-restart-loop
}
const missingCfg = ["api_id", "api_hash"].filter((k) => !cfg[k] || String(cfg[k]).startsWith("ISI_") || String(cfg[k]) === "12345678");
if (missingCfg.length) console.warn(`[config] AMARAN: ${missingCfg.join(", ")} belum diisi. Bot kawalan jalan, tetapi pelanggan tidak dapat Buat Ubot.`);
if (!cfg.ai_restapi_url && !cfg.ai_gemini_url) console.warn("[config] AMARAN: ai_gemini_url / ai_restapi_url belum diisi (memakai URL bawaan ARTA PEDIA).");

const bot = new Bot(cfg.bot_token);
bot.api.config.use((prev, method, payload, signal) => prev(method, require("./lang").payload(payload), signal)); // bahasa Indonesia

// Inline query (.help, .bc, .autobc, panel) TIDAK boleh menunggu giliran di belakang handler lain: grammY memproses update satu per satu,
// padahal userbot hanya menunggu jawaban inline ~15 detik. Di sini inline_query / chosen_inline_result dijalankan paralel + dicatat di log.
bot.use((ctx, next) => { BC.track(ctx); return next(); }); // catat pengguna (untuk Broadcast Pin)
bot.use(async (ctx, next) => {
  const u = ctx.update;
  if (u.inline_query) console.log(`[inline] query "${u.inline_query.query}" diterima dari ${u.inline_query.from.id}`);
  if (u.inline_query || u.chosen_inline_result) {
    next().catch((err) => console.error("[inline] handler gagal:", err && err.message ? err.message : err));
    return;
  }
  // Update lain (pesan / tombol): grammY memprosesnya SATU PER SATU, jadi satu handler lambat/macet (bayar, gateway, AI, jaringan)
  // membuat SEMUA orang menunggu dan panel terlihat mati. Sekarang: berurutan per pengguna (urutan pesan tetap aman),
  // paralel antar pengguna, dan antrean pengguna dilepas setelah 120 detik bila ada handler yang macet.
  const who = (ctx.from && ctx.from.id) || (ctx.chat && ctx.chat.id);
  if (who === undefined) return next();
  const key = String(who);
  const prev = QUEUES.get(key) || Promise.resolve();
  const run = prev
    .then(() => Promise.race([next(), new Promise((r) => setTimeout(r, 120000).unref())]))
    .catch((err) => {
      try { bot.errorHandler(new BotError(err, ctx)); } catch (e) { console.error("Ralat bot:", err && err.message ? err.message : err); }
    });
  QUEUES.set(key, run);
  run.then(() => { if (QUEUES.get(key) === run) QUEUES.delete(key); });
});
const QUEUES = new Map(); // ID pengguna -> rantai promise handler terakhir

// ID emoji premium untuk jadual /start (tukar mengikut pilihan awak)
const EM = {
  title: "5461151367559141950",
  nama: "4972406813946282823",
  user: "5987802868734760945",
  id: "6030656587830399914",
  bot: "6030643930561778170",
  star: "5386367538735104399",
  exp: "5890847821728322055",
  online: "5992390297533816030",
  mod: "5204242830687494041",
  prefix: "5217880283860194582",
};
const BTN_ICON = "5260379144167890225"; // ikon premium pada butang
const e = (k, fb = "\u2B50") => em(EM[k], fb);
// Prefix userbot setiap pengguna (lalai ikut config.json; boleh ditukar dengan .setprefix, dikembalikan dengan butang Reset Prefix)
const prefixOf = (uid) => ((db.getUser(uid) || {}).prefix) || cfg.prefix || ".";

// Bilangan modul = bilangan fail .js dalam plugins/ (fail bermula "_" ialah plugin sistem, tidak dikira)
function countModules() {
  try {
    return fs
      .readdirSync(path.join(__dirname, "plugins"))
      .filter((f) => f.endsWith(".js") && !f.startsWith("_")).length;
  } catch (_) {
    return 0;
  }
}

// ===== Reka bentuk /start =====
// Semua ID emoji di bawah sudah terbukti berfungsi dalam projek ini (palet .autorich / .help / .ping).
const S = {
  crown: "6273839444311149115", // mahkota ungu (tajuk)
  gem: "6276228098962754124", // permata
  star: "5852636219250317264",
  user: "5258362837411045098",
  tag: "5296348778012361146",
  link: "5271604874419647061",
  gear: "5368589393491669392",
  ok: "5260726538302660868",
  no: "5316999925664347033",
  green: "5416081784641168838",
  time: "5352940967911517739",
  chart: "5231200819986047254",
  bolt: "5456140674028019486",
  bolt2: "5215203703190989803",
  rocket: "5195033767969839232",
  fire: "5424972470023104089",
  box: "5258134813302332906",
  check: "6005561111099740638",
  mega: "5411503950799060151",
  wave: "5402498632739996967",
  owner: "5217822164362739968",
  rex: "6235524376070984680",
  f1: "6244617272808183303",
  f2: "6242011198322119983",
};
// Jubin hiasan banner (sama seperti menu .help)
const TILES_TOP = ["5240083327750268488", "5242669473588081034", "5242299247407163349", "5242413308853641575", "5242685510995962813", "5242609313981164111", "5242711091821176312", "5242527847041492303"];
const TILES_BOTTOM = ["5242536587299940498", "5242516117485807157", "5240071550949946682", "5242675353398305338", "5242276913577224388", "5242631596271495297", "5240055912974019894", "5242416276676043618"];
const tilesOf = (ids) => ids.map((id) => em(id, "\uD83E\uDE84")).join("");
const NBSP = "\u00a0";
const BRAND = () => esc(cfg.brand || "UBOT ARTA PEDIA");

// Butang /start seperti contoh RyX: 3 + 2 + 1. Butang kad Rich dipaparkan DALAM bubble mesej.
// Ikon premium diambil daripada premiumids.js. fancy=false -> butang biasa tanpa ikon (jatuh balik).
const I = {
  gear: "5422719304409829779", search: "5467397594332275071", chat: "5397771415640374599",
  bolt: "5890847821728322055", reload: "5402186569006210455", gem: "5767137507879685567",
};
// "Tulis Claim Userbot Free" -> buka chat developer dengan teks sedia ada
const claimUrl = () => {
  const dev = cfg.developer_url || "https://t.me/telegram";
  return `${dev}${dev.includes("?") ? "&" : "?"}text=${encodeURIComponent("Claim Userbot Free")}`;
};
// ===== TATA LETAK /start (DASHBOARD) =====
// Susunan tombol persis seperti contoh foto:
//   [ Buat Ubot                 ]   hijau, selebar kartu
//   [ Beli Role ] [ Profil Saya ]   biru + abu-abu
//   [ Panduan   ] [ Up Role     ]   abu-abu + biru
//   [ BUY NOKOS MURAH KLIK INI  ]   hijau (link web)
//   [ Menu Lainnya              ]   abu-abu
//   [ PANEL OWNER               ]   merah (hanya owner / reseller / admin ubot)
//   [ CHANNEL FEEDBACK          ]   hijau, DI LUAR kartu (di bawah bubble)
// Fitur lain (Preview, Live Chat, Beli SC, Produk Lainnya, Buat Store, Reset Prefix, Restart Userbot) ada di "Menu Lainnya".
// Semua fitur owner (control ubot, kelola produk, broadcast pin, harga, backup, dll) ada di PANEL OWNER.
// Setelan config.json (opsional): dashboard_title, shop_label, shop_url, feedback_label, channel_url, start_banner (file_id foto).
const bannerId = () => db.getSetting("start_banner") || cfg.start_banner || null;
const bannerMedia = () => { const id = bannerId(); return id ? [{ id: "banner", media: { type: "photo", media: id } }] : null; };

function homeKb(fancy, u) {
  const b = (text, data, icon, style) => btn(fancy, text, data, style, icon);
  const srOn = SR.conf().enabled;
  const rows = [];
  rows.push([b("Buat Ubot", "create", I.gear, "success")]);
  // Lihat Tampilan Ubot (dulu "Preview"), Beli SC, dan Produk Lainnya langsung tampil di /start
  rows.push(pair(b("Lihat Tampilan Ubot", "help", I.search, "primary"), b("BELI SC", "buysc", S.gem, "success")));
  rows.push(pair(b("PRODUK LAINNYA", "prd:l:0", S.box, "primary"), b("Profil Saya", "prof", S.user, "plain")));
  rows.push(pair(b("Panduan", "guide", S.mega, "plain"), srOn ? b("Beli Role", "sr:m", S.crown, "primary") : b("Live Chat", "live", I.chat, "primary")));
  if (srOn) rows.push([b("Up Role", "sr:up", S.rocket, "primary")]);
  rows.push([b("BELI NOKTEL TELEGRAM SIAP PAKAI", "nk:h", S.gem, "success")]);
  rows.push([{ text: cfg.shop_label || "BUY NOKOS MURAH KLIK INI", url: String(cfg.shop_url || "https://www.tokonokosarta.my.id/"), ...(fancy ? { style: "success", icon_custom_emoji_id: I.gem } : {}) }]);
  rows.push([b("Menu Lainnya", "menu", S.box, "plain")]);
  // baris panel (merah): owner -> PANEL OWNER; reseller / tangan kanan -> panelnya; admin ubot -> CONTROL UBOT
  if (u && access.isOwner(u.id)) rows.push([b("PANEL OWNER", "own", S.owner, "danger")]);
  else {
    if (u && access.isReseller(u.id)) rows.push([b(access.isTK(u.id) ? "PANEL TANGAN KANAN" : "PANEL RESELLER", "rsl", access.isTK(u.id) ? S.crown : S.star, "danger")]);
    if (u && AC.isAdmin(u.id)) rows.push([b("CONTROL UBOT", "ctl", S.crown, "danger")]);
  }
  // tombol di LUAR kartu (di bawah bubble), hijau
  if (cfg.channel_url) rows.push([outside({ text: cfg.feedback_label || "CHANNEL FEEDBACK", url: String(cfg.channel_url), ...(fancy ? { style: "success" } : {}) })]);
  return rows;
}

// keyboard /start untuk pengguna tertentu (editRich / editCard hanya memanggil kb(fancy) tanpa pengguna)
const kbOf = (u) => (fancy) => homeKb(fancy, u);

const PIN = "5397782960512444700";
// emoji premium dengan emoji biasa yang SEPADAN sebagai sandaran (bila emoji premium tidak dipaparkan)
const FB_BY_ID = Object.fromEntries([...Object.entries(S).map(([k, id]) => [id, UI.FB[k === "owner" ? "crown" : k]]), [PIN, UI.FB.pin],
  [I.gear, "\u2699\uFE0F"], [I.search, "\uD83D\uDD0D"], [I.chat, "\uD83D\uDCAC"]]);
const emo = (id) => em(id, FB_BY_ID[id] || "\u2B50");
// ===== Tampilan /start (dashboard) =====
// Gambar banner (opsional) -> judul DASHBOARD -> sapaan + tanggal -> tabel akun -> 3 dropdown -> status bot -> tombol (di dalam kartu).
const { waktuWib, userTag } = require("./dash");
const devUser = () => String(cfg.developer_url || "").replace(/^https?:\/\/t\.me\//i, "").replace(/[/?].*$/, "");
// baris "Bot Aktif · @bot · @developer"
function statusLine() {
  const bu = shared.botUsername;
  const dv = devUser();
  return `<p>${emo(S.check)} <b>Bot Aktif</b>${bu ? ` \u00B7 <a href="https://t.me/${esc(bu)}">@${esc(bu)}</a>` : ""}${dv ? ` \u00B7 <a href="https://t.me/${esc(dv)}">@${esc(dv)}</a>` : ""}</p>`;
}
// data akun pengguna untuk tabel /start dan Profil Saya
function accountOf(u) {
  const rec = db.getUser(u.id) || {};
  const owner = access.isOwner(u.id);
  const role = access.roleOf(u.id);
  const expired = !owner && expiry.isExpired(rec);
  const entitled = owner || rec.status === "approved";
  const tier = PK.tierOf(u.id);
  const roleIcon = owner ? S.owner : role === "tangan kanan" ? S.crown : role === "reseller" ? S.star : S.user;
  const status = owner ? "OWNER" : role === "tangan kanan" ? "TANGAN KANAN" : role === "reseller" ? "RESELLER" : "PELANGGAN";
  const paket = entitled ? `${esc(tier)}${expired ? " \u00B7 expired" : ""}` : "BELUM ADA";
  const online = !!manager.getByUser(u.id);
  const orders = db.orders().filter((o) => String(o.userId) === String(u.id) && !["cancelled", "rejected", "unpaid", "expired", "gw_creating", "awaiting_proof"].includes(o.status)).length;
  return { rec, owner, roleIcon, status, paket, online, orders, name: esc([u.first_name, u.last_name].filter(Boolean).join(" ") || "-") };
}

function buildHome(u, { simple = false, media = false } = {}) {
  const A = accountOf(u);
  const prefix = esc(prefixOf(u.id));
  const w = waktuWib();
  const withBanner = media && !!bannerId();

  const rows = [
    [S.user, "Nama", `<b>${A.name}</b>`],
    [S.tag, "ID Telegram", `<code>${esc(u.id)}</code>`],
    [S.link, "Username", userTag(u)],
    [A.roleIcon, "Status", `<b>${A.status}</b>`],
    [S.gem, "Paket", `<b>${A.paket}</b>`],
    [A.online ? S.green : S.no, "Userbot", A.online ? "<b>TERHUBUNG</b>" : "<b>BELUM TERHUBUNG</b>"],
    [S.time, "Expired", `<b>${esc(expiry.label(u.id))}</b>`],
  ];
  const row = ([id, label, val]) => `<tr><td>${emo(id)} ${label}</td><td>${val}</td></tr>`;

  let ver = "1.7.0";
  try { ver = require("./package.json").version; } catch (_) {}
  const cmds = (shared.plugins || []).reduce((n, p) => n + (Array.isArray(p.help) ? p.help.length : 0), 0);
  const cats = new Set((shared.plugins || []).filter((p) => p.category && Array.isArray(p.help) && p.help.length).map((p) => p.category)).size;
  const infoRows = [
    [S.rocket, "Userbot online", `<b>${manager.count()}</b>`],
    [S.wave, "Fitur", `<b>${cmds}</b> \u00B7 ${cats} kategori`],
    [S.fire, "Pengguna", `<b>${db.allUsers().length}</b>`],
    [S.gear, "Versi", esc(ver)],
  ];

  const promo = !A.owner && SR.conf().enabled ? `Role instan mulai <b>${esc(SR.minPriceLabel())}</b> \u2014 tekan <b>Beli Role</b> atau <b>Up Role</b>.` : "";
  const guideItems = [
    ["Buat Ubot", `jadikan akun Telegram Anda sebuah userbot (nomor telepon, kode OTP, dan password 2FA bila aktif).`],
    ["Beli Role / Up Role", "bayar QRIS, role aktif otomatis dalam hitungan detik."],
    ["Beli Noktel", "akun Telegram siap pakai: isi saldo / bayar QRIS, akun dan PIN 2FA dikirim otomatis, kode OTP diteruskan bot."],
    ["Profil Saya", "lihat role, tanggal expired, prefix, dan status userbot Anda."],
    ["Menu Lainnya", "Preview fitur, Live Chat ke owner, Beli SC, Produk Lainnya, Reset Prefix, Restart Userbot."],
    ["Setelah connect", `perintah userbot dipanggil dari akun Anda dengan awalan <code>${prefix}</code>, misalnya <code>${prefix}help</code>, <code>${prefix}ping</code>, <code>${prefix}bc</code>.`],
  ];
  const strengths = [
    "Satu bot, banyak userbot \u2014 aman, cepat, dan privat",
    "Role aktif instan lewat pembayaran QRIS otomatis",
    "Bot menjaga dirinya sendiri: mati / macet hidup lagi otomatis",
    "Data privat, session terenkripsi, userbot berjalan terpisah",
    "Ratusan fitur: broadcast, AI, generator, rich card, dan lainnya",
  ];

  const guideHtml = `<ul>${guideItems.map(([t, d]) => `<li><b>${t}</b> \u2014 ${d}</li>`).join("")}</ul>${promo ? `<blockquote>${promo}</blockquote>` : ""}`;
  const strengthHtml = `<ul>${strengths.map((t) => `<li><input type="checkbox" checked>${t}</li>`).join("")}</ul>`;
  const statHtml = `<table bordered>${infoRows.map(row).join("")}</table>`;
  // versi penuh: tiga dropdown; versi ringkas (fallback) tanpa dropdown
  const drop = (icon, title, body) => (simple ? `<p><b>${emo(icon)} ${title}</b></p>${body}` : `<details><summary>${emo(icon)} ${title}</summary>${body}</details>`);

  const title = esc(cfg.dashboard_title || `${cfg.brand || "UBOT ARTA PEDIA"} DASHBOARD`);
  const html =
    (withBanner ? `<img src="tg://photo?id=banner"/>` : "") +
    `<h3>${title}</h3>` +
    `<p>Halo, ${u.username ? userTag(u) : `<b>${A.name}</b>`}! ${w.sapa[1]} <i>${w.sapa[0]}</i><br><i>${w.label}</i></p><hr>` +
    `<table bordered>${rows.map(row).join("")}</table><hr>` +
    drop(S.gear, "Panduan Penggunaan", guideHtml) +
    drop(S.rocket, "Keunggulan Kami", strengthHtml) +
    drop(S.chart, "Statistik Bot", statHtml) +
    statusLine();

  const text =
    `${em(S.crown, "\uD83D\uDC51")} <b>${title}</b>\n` +
    `Halo, ${u.username ? "@" + esc(u.username) : A.name}! ${w.sapa[1]} <i>${w.sapa[0]}</i>\n<i>${w.label}</i>\n\n` +
    rows.map(([id, label, val]) => `${emo(id)} ${label} : ${val}`).join("\n") +
    `\n\n${guideItems.map(([t, d]) => `\u2022 <b>${t}</b> \u2014 ${d}`).join("\n")}` +
    (promo ? `\n\n${promo}` : "") +
    `\n\n${emo(S.check)} <b>Bot Aktif</b>${shared.botUsername ? " \u00B7 @" + esc(shared.botUsername) : ""}${devUser() ? " \u00B7 @" + esc(devUser()) : ""}`;

  return { html, text, media: withBanner ? bannerMedia() : null, guideHtml, guideItems };
}
// urutan percobaan: dengan banner -> tanpa banner -> versi ringkas
const homeVariants = () => [...(bannerId() ? [{ media: true }] : []), {}, { simple: true }];

// Kartu: Profil Saya, Panduan, Menu Lainnya (mengganti pesan dashboard di tempat, tombol Kembali memulihkan dashboard)
const backKb = (fancy) => [[btn(fancy, "Kembali", "home:p:0", "plain", S.wave)]];
function profileCard(u) {
  const A = accountOf(u);
  return UI.card({
    title: "Profil Saya", icon: "user",
    rows: [
      ["user", "Nama", `<b>${A.name}</b>`], ["tag", "ID Telegram", `<code>${esc(u.id)}</code>`], ["link", "Username", userTag(u)],
      ["crown", "Status", `<b>${A.status}</b>`], ["gem", "Paket", `<b>${A.paket}</b>`], ["time", "Expired", `<b>${esc(expiry.label(u.id))}</b>`],
      [A.online ? "green" : "no", "Userbot", A.online ? "<b>TERHUBUNG</b>" : "<b>BELUM TERHUBUNG</b>"], ["bolt", "Prefix", `<code>${esc(prefixOf(u.id))}</code>`],
      ["box", "Pesanan Anda", `<b>${A.orders} kali</b>`],
    ],
    checks: [[A.online, A.online ? "Userbot siap dipakai" : "Tekan Buat Ubot untuk menyambungkan akun Anda"]],
  });
}
const profileKb = (fancy) => [pair(btn(fancy, "Reset Prefix", "resetprefix", "primary", I.bolt), btn(fancy, "Restart Userbot", "restart", "primary", I.reload)), [btn(fancy, "Kembali", "home:p:0", "plain", S.wave)]];
function guideCard(u) {
  const H = buildHome(u);
  return { html: `<h3>${emo(S.gear)} Panduan Penggunaan</h3>${H.guideHtml}`, text: `${emo(S.gear)} <b>Panduan Penggunaan</b>\n\n${H.guideItems.map(([t, d]) => `\u2022 <b>${t}</b> \u2014 ${d}`).join("\n")}` };
}
function moreCard(u) {
  const reseller = access.isReseller(u.id) && !access.isOwner(u.id);
  return UI.card({
    title: "Menu Lainnya", icon: "box",
    rows: [
      ["gear", "Lihat Tampilan Ubot", "lihat isi menu help beserta semua fitur"], ["mega", "Live Chat", "chat langsung ke Head Owner"],
      ["gem", "Beli SC", "beli source code"], ["box", "Produk Lainnya", "produk digital lain (bayar QRIS)"],
      ...(reseller ? [["star", "Buat Store Ubot", "bot store milik Anda sendiri"]] : []),
      ["bolt", "Reset Prefix", "kembalikan awalan perintah ke default"], ["robot", "Restart Userbot", "hidupkan ulang userbot yang tersangkut"],
    ],
  });
}
const moreKb = (u) => (fancy) => {
  const reseller = u && access.isReseller(u.id) && !access.isOwner(u.id);
  const rows = [
    pair(btn(fancy, "Lihat Tampilan Ubot", "help", "primary", I.search), btn(fancy, "Live Chat", "live", "primary", I.chat)),
    pair(btn(fancy, "BELI SC", "buysc", "success", S.gem), btn(fancy, "PRODUK LAINNYA", "prd:l:0", "primary", S.box)),
  ];
  if (reseller) rows.push([btn(fancy, "BUAT STORE UBOT", "stm:m", "primary", S.box)]);
  rows.push(pair(btn(fancy, "Reset Prefix", "resetprefix", "plain", I.bolt), btn(fancy, "Restart Userbot", "restart", "plain", I.reload)));
  // config.json: "start_extra": true -> tambah Paket / Status / Beli Paket
  if (cfg.start_extra === true) rows.push(pair(btn(fancy, "Paket", "paket", "primary", S.crown), btn(fancy, "Status", "status", "primary", S.chart)), [btn(fancy, "Beli Paket (DANA / QRIS)", "buy", "success", S.crown)]);
  rows.push([btn(fancy, "Kembali", "home:p:0", "plain", S.wave)]);
  return rows;
};

// Kad perbandingan paket (/paket dan butang Paket)
function paketCard(uid) {
  const rec = db.getUser(uid) || {};
  const entitled = access.isOwner(uid) || rec.status === "approved";
  const tier = PK.tierOf(uid);
  const t = PK.compareTable(entitled ? tier : null);
  return {
    html:
      `<h3>${em(S.crown, "\uD83D\uDC51")} Paket Userbot</h3>` +
      `<p>${entitled ? `Paket anda: ${PK.badge(tier)} \u00B7 Expired: <b>${esc(expiry.label(uid))}</b>` : "Anda belum mempunyai paket."}</p>` +
      t.html +
      `<blockquote>${em(S.fire, "\uD83D\uDD25")} Mahu naik taraf atau beli paket? Tekan <b>Beli Paket</b> (bayar DANA / QRIS).</blockquote>`,
    text: `${em(S.crown, "\uD83D\uDC51")} <b>Paket Userbot</b>\n\n${t.text}\n\nMahu naik taraf atau beli paket? Tekan Beli Paket (bayar DANA / QRIS).`,
  };
}

// Edit pesan dashboard di tempat. Mencoba: dengan banner -> tanpa banner -> ringkas -> teks biasa. true bila berhasil / tidak berubah.
async function editHome(ref, u) {
  for (const v of homeVariants()) {
    const c = buildHome(u, v);
    for (const fancy of [true, false]) {
      try {
        await tg("editMessageText", { ...ref, rich_message: { html: c.html, ...(c.media ? { media: c.media } : {}) }, reply_markup: { inline_keyboard: homeKb(fancy, u) } });
        return true;
      } catch (err) {
        if (/not modified/i.test(err.message)) return true;
      }
    }
    console.error(`Edit /start (${v.media ? "banner" : v.simple ? "ringkas" : "penuh"}) gagal`);
  }
  try {
    await tg("editMessageText", { ...ref, text: buildHome(u).text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: homeKb(false, u) } });
    return true;
  } catch (err) {
    return /not modified/i.test(err.message);
  }
}

async function sendHome(chatId, u) {
  for (const v of homeVariants()) {
    try {
      const c = buildHome(u, v);
      return await sendRich(chatId, c.html, kbOf(u), c.media);
    } catch (err) {
      console.error(`Rich Message /start (${v.media ? "banner" : v.simple ? "ringkas" : "penuh"}) gagal:`, err.message);
    }
  }
  return send(chatId, buildHome(u).text, (fancy) => homeKb(fancy, u));
}

// /start dengan loading: "Membuka menu ... (bulat berpusing)" -> ditukar jadi dashboard di tempat yang sama.
// Tempoh: "start_loading_ms" dalam config.json (lalai 900; 0 = matikan loading). Jika apa-apa gagal, dashboard tetap dikirim.
const LOAD_MS = Number(cfg.start_loading_ms === undefined ? 900 : cfg.start_loading_ms);
async function openHome(chatId, u) {
  if (!(LOAD_MS > 0)) return sendHome(chatId, u);
  let loadId = null;
  try {
    const m = await sendRich(chatId, LD.html("Membuka menu ..."));
    loadId = m && m.message_id;
  } catch (err) {
    console.error("Loading /start gagal, terus hantar menu:", err.message);
  }
  if (!loadId) return sendHome(chatId, u);
  await new Promise((r) => setTimeout(r, LOAD_MS));
  const target = { chat_id: chatId, message_id: loadId };
  if (await editHome(target, u).catch(() => false)) return;
  await tg("deleteMessage", target).catch(() => {});
  return sendHome(chatId, u);
}

// ----- /start (hanya dalam chat peribadi) -----
bot.command("start", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  // pengguna baru (pertama kali /start) -> notifikasi Rich ke channel pemilik
  try {
    if (!(db.getUser(ctx.from.id) || {}).firstSeen) {
      db.upsertUser(ctx.from.id, { firstSeen: Date.now(), name: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") || undefined, username: ctx.from.username || undefined });
      NT.fire("start", ctx.from);
    }
  } catch (e) {
    console.error("[notify] start:", e.message);
  }
  await openHome(ctx.chat.id, ctx.from);
  BC.ensure(ctx.from.id); // pin broadcast aktif untuk pengguna baru (bila fitur aktif)
});

// tombol lama Prev / Next (pesan /start versi lama): cukup segarkan dashboard
bot.callbackQuery(/^home:p:(\d+)$/, async (ctx) => {
  const m = ctx.callbackQuery.message;
  await ctx.answerCallbackQuery();
  if (m) await editHome({ chat_id: m.chat.id, message_id: m.message_id }, ctx.from);
});
bot.callbackQuery("home:n", (ctx) => ctx.answerCallbackQuery());

// Profil Saya / Panduan / Menu Lainnya: mengganti pesan dashboard di tempat
const refOfMsg = (ctx) => { const m = ctx.callbackQuery.message; return m ? { chat_id: m.chat.id, message_id: m.message_id } : null; };
bot.callbackQuery("prof", async (ctx) => { await ctx.answerCallbackQuery(); const r = refOfMsg(ctx); if (r) await UI.editCard(r, profileCard(ctx.from), profileKb); });
bot.callbackQuery("guide", async (ctx) => { await ctx.answerCallbackQuery(); const r = refOfMsg(ctx); if (r) await UI.editCard(r, guideCard(ctx.from), backKb); });
bot.callbackQuery("menu", async (ctx) => { await ctx.answerCallbackQuery(); const r = refOfMsg(ctx); if (r) await UI.editCard(r, moreCard(ctx.from), moreKb(ctx.from)); });

bot.callbackQuery("refresh", async (ctx) => {
  const m = ctx.callbackQuery.message;
  if (m) await editHome({ chat_id: m.chat.id, message_id: m.message_id }, ctx.from);
  await ctx.answerCallbackQuery({ text: "Diperbarui \u2705" });
});

// ----- /premiumtest (owner): semak sama ada Telegram membenarkan bot ini menghantar emoji premium -----
bot.command("premiumtest", async (ctx) => {
  if (ctx.chat.type !== "private" || !access.isOwner(ctx.from.id)) return;
  let line;
  try {
    const r = await tgRaw("sendMessage", {
      chat_id: ctx.chat.id,
      text: "\u2B50 ujian emoji premium",
      entities: [{ type: "custom_emoji", offset: 0, length: 1, custom_emoji_id: "5438496463044752972" }],
    });
    const kept = (r.entities || []).some((x) => x.type === "custom_emoji");
    line = kept
      ? "\u2705 Bot ini BOLEH menghantar emoji premium."
      : "\u274C Mesej sampai, tetapi Telegram membuang emoji premium (bot ini tidak layak).";
  } catch (err) {
    line = `\u274C Ditolak Telegram: ${err.message}`;
  }
  const mode = cfg.premium_emoji === false ? "MATI (semua emoji dipaparkan biasa)" : "HIDUP (cuba premium, jatuh balik ke emoji biasa)";
  await ctx.reply(
    `${line}\n\npremium_emoji dalam config.json: ${mode}\n\n` +
      "Jika \u274C: Telegram hanya membenarkan bot menghantar emoji premium jika pemilik bot ada Telegram Premium " +
      "(atau bot ada username tambahan dari Fragment). Ini peraturan pelayan Telegram, kod tidak boleh memintasnya. " +
      'Letak "premium_emoji": false dalam config.json supaya semua kad guna emoji biasa tanpa percubaan yang gagal.'
  );
});

// ----- Reset Prefix: kembalikan prefix userbot pengguna ke lalai -----
bot.callbackQuery("resetprefix", async (ctx) => {
  const def = cfg.prefix || ".";
  const rec = db.getUser(ctx.from.id);
  if (!rec || !rec.prefix || rec.prefix === def) return ctx.answerCallbackQuery({ text: `Prefix sudah default (${def})` });
  db.upsertUser(ctx.from.id, { prefix: def });
  const m = ctx.callbackQuery.message;
  if (m) await editHome({ chat_id: m.chat.id, message_id: m.message_id }, ctx.from).catch(() => {});
  await ctx.answerCallbackQuery({ text: `Prefix direset ke ${def} \u2705` });
});

// ----- Paket (perbandingan LITE / GOLD / PLATINUM) -----
const buyKb = (fancy) => [[btn(fancy, "Beli Paket", "buy", "success", S.crown)]];
async function sendPaket(chatId, uid) {
  const c = paketCard(uid);
  try {
    return await sendRich(chatId, c.html, buyKb);
  } catch (err) {
    console.error("Rich Message /paket gagal:", err.message);
    return send(chatId, c.text, buyKb);
  }
}
bot.command("paket", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  await sendPaket(ctx.chat.id, ctx.from.id);
});
bot.callbackQuery("paket", async (ctx) => {
  await ctx.answerCallbackQuery();
  const m = ctx.callbackQuery.message;
  if (m) await sendPaket(m.chat.id, ctx.from.id);
});

// ----- Buat Userbot -----
const buyBtn = (fancy) => [[btn(fancy, "Beli Paket", "buy", "success", S.crown)]];
// Pilihan sebelum membuat ubot: UBOT GRATIS (LITE, perlu persetujuan, ada watermark) atau BELI ROLE (aktif instan)
function chooseCard() {
  const lite = PK.countForTier("LITE");
  const gold = PK.countForTier("GOLD");
  const plat = PK.countForTier("PLATINUM");
  const pr = SR.conf().prices;
  const rp = SR.rp;
  const wm = esc(cfg.watermark_text || "UBOT AUTO PROMOSI GRATIS @artapediaubot");
  const html =
    `<h3>${em(S.crown, "\uD83D\uDC51")} Pilih Jenis Ubot</h3>` +
    `<p>Mau pakai <b>Ubot Gratis</b> atau <b>Beli Role</b>? Ini bedanya:</p>` +
    `<table bordered><tr><th>Yang dibandingkan</th><th>Ubot Gratis</th><th>Beli Role</th></tr>` +
    `<tr><td>Harga</td><td>Gratis</td><td>mulai ${esc(rp(Math.min(...PK.ORDER.map((t) => pr[t].price))))}</td></tr>` +
    `<tr><td>Aktivasi</td><td>Langsung, tanpa persetujuan</td><td>Langsung setelah bayar QRIS</td></tr>` +
    `<tr><td>Role</td><td>LITE</td><td>LITE / GOLD / PLATINUM</td></tr>` +
    `<tr><td>Jumlah command</td><td>${lite}</td><td>${gold} (GOLD) \u00B7 ${plat} (PLATINUM)</td></tr>` +
    `<tr><td>Menu Share Auto Promosi (.bc .autobc .cfd)</td><td>Bisa, dengan watermark promosi</td><td>Bisa, TANPA watermark (GOLD ke atas)</td></tr>` +
    `<tr><td>AI, Web, Generator, Rich, Group</td><td>Terkunci</td><td>Terbuka (GOLD ke atas)</td></tr>` +
    `<tr><td>Alias, WhatsApp, AI Rich, kustom help</td><td>Terkunci</td><td>Terbuka (PLATINUM)</td></tr></table>` +
    `<blockquote>${em(S.bolt, "\u26A1")} Watermark gratis: <i>${wm}</i> ditempel pada setiap broadcast (.bc, .autobc, .cfd, .autocfd).</blockquote>`;
  const text =
    `${em(S.crown, "\uD83D\uDC51")} <b>Pilih Jenis Ubot</b>\n\n` +
    `<b>UBOT GRATIS</b> (LITE)\n\u2022 Gratis, langsung aktif tanpa persetujuan\n\u2022 ${lite} command dasar + Menu Share Auto Promosi\n\u2022 Broadcast diberi watermark: ${wm}\n\u2022 AI, Web, Generator, Rich, Group terkunci\n\n` +
    `<b>BELI ROLE</b> (mulai ${esc(rp(Math.min(...PK.ORDER.map((t) => pr[t].price))))})\n\u2022 Bayar QRIS otomatis, aktif instan\n\u2022 GOLD ${gold} command, PLATINUM ${plat} command\n\u2022 Broadcast TANPA watermark\n\u2022 AI, Web, Generator, Rich, Group terbuka`;
  return { html, text };
}
const chooseKb = (fancy) => [
  [btn(fancy, "Ubot Gratis", "create:free", "primary", S.gem), btn(fancy, "Beli Role", "sr:m", "success", S.crown)],
];

bot.callbackQuery(/^create(:free)?$/, async (ctx) => {
  const uid = ctx.from.id;
  const m = ctx.callbackQuery.message;
  if (!m || m.chat.type !== "private") {
    return ctx.answerCallbackQuery({ text: "Gunakan butang ini dalam chat peribadi bot.", show_alert: true });
  }
  // Belum punya role & belum memilih -> tampilkan pilihan Ubot Gratis / Beli Role
  if (!ctx.match[1] && SR.conf().enabled && !access.isStaff(uid) && (db.getUser(uid) || {}).status !== "approved" && !manager.getByUser(uid)) {
    await ctx.answerCallbackQuery();
    const c = chooseCard();
    try {
      return await sendRich(m.chat.id, c.html, chooseKb);
    } catch (err) {
      console.error("Kartu pilihan ubot gagal (Rich):", err.message);
      return send(m.chat.id, c.text, chooseKb);
    }
  }
  if (!access.isOwner(uid) && expiry.isExpired(db.getUser(uid))) {
    await ctx.answerCallbackQuery();
    return UI.sendCard(m.chat.id, UI.card({
      title: "Userbot Sudah Expired", icon: "time",
      rows: [["no", "Status", "<b>EXPIRED</b>"], ["time", "Tamat pada", `<b>${esc(expiry.label(uid))}</b>`]],
      note: "Beli paket atau hubungi owner/reseller untuk menambah masa aktif.",
    }), buyBtn);
  }
  if (manager.getByUser(uid)) {
    await ctx.answerCallbackQuery();
    const pf = esc(cfg.prefix || ".");
    return UI.sendCard(m.chat.id, UI.card({
      title: "Userbot Sudah Hidup", icon: "green",
      rows: [["green", "Status", "<b>TERHUBUNG</b>"], ["time", "Expired", `<b>${esc(expiry.label(uid))}</b>`]],
      checks: [[true, `Ketik <code>${pf}help</code> di Telegram`], [false, "Tekan <b>Restart Userbot</b> kalau tersangkut"]],
      note: "Guna <code>/stopuserbot</code> untuk menghapus userbot.",
    }));
  }
  if (access.canCreate(uid)) {
    await ctx.answerCallbackQuery();
    // Jangan "await": login menunggu mesej pelanggan, jadi mesti berjalan di latar belakang
    login.begin({ userId: uid, chatId: m.chat.id }).catch((err) => console.error("Login ralat:", err.message));
    return;
  }
  // UBOT GRATIS: langsung disetujui sebagai LITE (tanpa group persetujuan). Matikan dengan config.json: "free_auto_approve": false
  const rec0 = db.getUser(uid) || {};
  const stt = rec0.status;
  if (cfg.free_auto_approve !== false && stt !== "rejected") {
    // ubot gratis = LITE; JANGAN menimpa paket yang sudah dimiliki (mis. role dari reseller / hasil beli)
    db.upsertUser(uid, { status: "approved", ...(rec0.paket ? {} : { paket: "LITE" }), approvedBy: "auto-free", approvedAt: Date.now() });
    await ctx.answerCallbackQuery({ text: "Ubot gratis (LITE) aktif, silakan lanjut login." });
    login.begin({ userId: uid, chatId: m.chat.id }).catch((err) => console.error("Login ralat:", err.message));
    return;
  }
  return access.requestApproval(ctx); // perlu kelulusan owner / reseller
});

// ----- Restart Userbot -----
bot.callbackQuery("restart", async (ctx) => {
  const uid = ctx.from.id;
  const m = ctx.callbackQuery.message;
  const chatId = m ? m.chat.id : uid;
  const rec = db.getUser(uid) || {};
  if (!rec.session) {
    await ctx.answerCallbackQuery();
    return UI.sendCard(chatId, UI.card({ title: "Belum Ada Userbot", icon: "fire", rows: [["info", "Status", "Anda belum membuat userbot"]], note: "Tekan <b>Buat Userbot</b> untuk memulai." }));
  }
  if (!access.isOwner(uid) && expiry.isExpired(rec)) {
    await ctx.answerCallbackQuery();
    return UI.sendCard(chatId, UI.card({ title: "Userbot Sudah Expired", icon: "time", rows: [["no", "Status", "<b>EXPIRED</b>"]], note: "Tambah masa aktif dulu, userbot akan hidup otomatis." }), buyBtn);
  }
  await ctx.answerCallbackQuery({ text: "Memulai ulang userbot..." });
  try {
    await manager.stop(uid);
    const entry = await manager.start(uid, rec.session);
    await UI.sendCard(chatId, UI.card({
      title: "Userbot Dimulai Ulang", icon: "ok",
      rows: [["user", "Akun", `<b>${esc(entry.name || "-")}</b>${entry.username ? " (@" + esc(entry.username) + ")" : ""}`], ["green", "Status", "<b>TERHUBUNG</b>"]],
      note: "Coba ketik <code>.ping</code> di Telegram.",
    }));
  } catch (err) {
    await UI.sendCard(chatId, UI.card({ title: "Gagal Memulai Ulang", icon: "no", rows: [["no", "Sebab", esc(err.message)]], note: "Sesi mungkin sudah tidak sah. Tekan <b>Buat Userbot</b> untuk login ulang." }));
  }
});

// ----- Status & Help Modules -----
bot.callbackQuery("status", async (ctx) => {
  const uid = ctx.from.id;
  const m = ctx.callbackQuery.message;
  const rec = db.getUser(uid) || {};
  const online = !!manager.getByUser(uid);
  const izin = access.canCreate(uid)
    ? "Dibenarkan"
    : rec.status === "pending"
    ? "Menunggu keputusan"
    : rec.status === "rejected"
    ? "Ditolak"
    : "Belum minta";
  await ctx.answerCallbackQuery();
  await UI.sendCard(m ? m.chat.id : uid, UI.card({
    title: "Status Anda", icon: "chart",
    rows: [
      [online ? "green" : "no", "Userbot", online ? "<b>ONLINE</b>" : "<b>OFFLINE</b>"],
      ["ok", "Izin membuat userbot", `<b>${esc(izin)}</b>`],
      ["gem", "Paket", `<b>${PK.badge(PK.tierOf(uid))}</b>`],
      ["time", "Expired", `<b>${esc(expiry.label(uid))}</b>`],
    ],
  }));
});

bot.callbackQuery("help", async (ctx) => {
  const helpPlugin = shared.plugins.find((p) => p.name === "help");
  if (!helpPlugin) return ctx.answerCallbackQuery({ text: "Menu help tiada.", show_alert: true });
  await ctx.answerCallbackQuery();
  const u = ctx.from;
  const entry = manager.getByUser(u.id) || {
    userId: String(u.id),
    username: u.username || null,
    name: [u.first_name, u.last_name].filter(Boolean).join(" "),
  };
  await helpPlugin.sendHelpTo(ctx.callbackQuery.message.chat.id, entry).catch((err) =>
    console.error("Help Modules gagal:", err.message)
  );
});

// Kestabilan: ralat tidak dijangka dilog sahaja, proses tidak mati
process.on("uncaughtException", (err) => console.error("[stabil] uncaughtException:", err && err.stack ? err.stack : err));
process.on("unhandledRejection", (err) => console.error("[stabil] unhandledRejection:", err && err.message ? err.message : err));
setInterval(() => { manager.watchdog().catch(() => {}); }, 2 * 60 * 1000).unref();

bot.catch((err) => console.error("Ralat bot:", err.message));

(async () => {
  // getMe boleh gagal (token salah / rangkaian). Ulang sebut sebab, jangan biar proses mati senyap-senyap.
  let me;
  for (let attempt = 1; ; attempt++) {
    try {
      me = await bot.api.getMe();
      break;
    } catch (err) {
      const msg = String((err && err.message) || err);
      if (/401|Unauthorized|token/i.test(msg)) {
        console.error(`\nTOKEN BOT DITOLAK TELEGRAM (${msg}).\nSemak bot_token dalam config.json / BOT_TOKEN. Salin semula penuh dari @BotFather.\n`);
        process.exit(78);
      }
      console.error(`[mula] getMe gagal (percubaan ${attempt}): ${msg}. Cuba lagi 5 saat...`);
      if (attempt >= 12) { console.error("Rangkaian ke Telegram tidak boleh dicapai. Berhenti."); process.exit(1); }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  console.log(`[mula] bot @${me.username} dikesan • AI: ARTA PEDIA DarkGPT`);
  // Inline mode WAJIB aktif untuk bot yang tokennya dipakai di sini (BotFather > /setinline), kalau tidak .help / .bc / .autobc tidak muncul di akun userbot.
  if (me.supports_inline_queries === false) {
    const warn = `PERINGATAN: inline mode MATI untuk @${me.username}. Di @BotFather: /setinline -> pilih @${me.username} -> isi placeholder (mis. Cari...). Pastikan token di config.json adalah token bot yang SAMA dengan yang di-setinline. Setelah itu restart.`;
    console.error("[mula] " + warn);
    for (const o of [].concat(cfg.owner_ids || [])) bot.api.sendMessage(o, "\u26A0\uFE0F " + warn).catch(() => {});
  } else console.log(`[mula] inline mode @${me.username}: aktif`);
  shared.botUsername = me.username;
  shared.manager = manager;
  shared.db = db;

  const plugins = loadPlugins();
  shared.plugins = plugins;

  access.register(bot); // kelulusan + /setgroup /addreseller ...
  BC.register(bot); // broadcast pin (owner) - sebelum panel owner & Live Chat
  OWNERP.register(bot); // panel owner + /setharga /addown /delown /owners
  QM.register(bot); // Mode QRIS (owner) + bukti bayar manual ACCEPT / REJECT (sebelum NK / PRD / pay yang menangkap pesan)
  NK.register(bot); // beli noktel: menu pembeli, deposit saldo, OTP, logout + owner /addnoktel /listnoktel /delnoktel /addsaldonk
  PRD.register(bot); // produk lainnya (owner /addproduk /delproduk) + BELI SC
  RSLP.register(bot); // reseller: /addrole + panel
  // /restartbot (owner): restart seluruh bot; aktif lagi otomatis lewat supervisor
  bot.command("restartbot", async (ctx) => {
    if (!ctx.chat || ctx.chat.type !== "private" || !access.isOwner(ctx.from.id)) return;
    if (!SUP.supervised()) return ctx.reply("Auto-restart sedang mati (config.json auto_restart.enabled=false). Restart lewat panel.");
    await ctx.reply("Bot di-restart... aktif kembali sekitar 10 detik. Semua ubot tersambung ulang otomatis.").catch(() => {});
    SUP.requestRestart();
  });
  // /gateway (owner): cek koneksi sesuai Mode QRIS aktif (AGW / AustinPay / manual). Ganti mode: /modeqris
  bot.command("gateway", async (ctx) => {
    if (!ctx.chat || ctx.chat.type !== "private" || !access.isOwner(ctx.from.id)) return;
    await QM.sendCheck(ctx.chat.id);
  });
  STORE.register(bot); // wizard BUAT STORE UBOT (sebelum Live Chat)
  BACKUP.register(bot); // /backup /setbackup (owner)
  panel.register(bot); // panel .ping / .setexpired (emoji premium melalui edit)
  pay.register(bot); // beli paket (DANA / QRIS) + ACCEPT / REJECT + /payset (owner)
  SR.register(bot, { home: (u) => buildHome(u), homeKb, editHome }); // Beli Role / Up Role mandiri (QRIS otomatis)
  login.register(bot); // login pelanggan + /cancel /stopuserbot
  for (const p of plugins) {
    if (typeof p.registerBotEarly === "function") p.registerBotEarly(bot, shared);
  }
  live.register(bot); // Live Chat dengan Head Owner (mesti terakhir: menangkap mesej peribadi)
  for (const p of plugins) {
    if (typeof p.registerBot === "function") p.registerBot(bot, shared);
  }
  // Inline query lain yang tiada plugin uruskan: jawab kosong
  bot.on("inline_query", (ctx) => ctx.answerInlineQuery([]).catch(() => {}));

  // allowed_updates eksplisit: Telegram MENGINGAT daftar update terakhir yang diminta; kalau pernah diset tanpa inline_query
  // (mis. oleh script / server lama dengan token yang sama), query inline tidak pernah sampai ke bot.
  bot.start({ allowed_updates: ["message", "edited_message", "callback_query", "inline_query", "chosen_inline_result", "my_chat_member"], onStart: () => console.log("Bot kawalan berjalan... Hantar /start kepada bot awak.") })
    .catch((err) => { console.error("Bot berhenti:", err.message); SUP.botDied(err); });

  access.healStaff(); // reseller / tangan kanan lama yang terlanjur LITE -> PLATINUM + bisa buat ubot
  STORE.startAll(); // hidupkan semua bot store reseller
  BACKUP.start(); // autobackup tiap 1 jam ke owner

  // Hidupkan semula semua userbot yang tersimpan
  manager
    .startAll()
    .then(() => expiry.startTimer()) // semak expired setiap minit
    .catch((err) => console.error("startAll gagal:", err));
})();

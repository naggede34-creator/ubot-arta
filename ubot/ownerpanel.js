// ===== PANEL OWNER (UBOT ARTA PEDIA) =====
// SEMUA fitur owner ada di sini (tombol "PANEL OWNER" di /start, hanya owner):
//   BROADCAST PIN · harga role · beri RESELLER / TANGAN KANAN · tambah / hapus / daftar owner · watermark ·
//   CONTROL SEMUA UBOT · kelola produk · pengaturan pembayaran · MODE QRIS (otomatis 1 AGW / otomatis 2 AustinPay / manual) · set banner /start · statistik · backup · cek gateway · restart bot
// Perintah bot:
//   /harga                          -> lihat harga tiap role
//   /setharga <LITE|GOLD|PLATINUM> <harga> [hari]   contoh: /setharga GOLD 5000 30
//   /addown <ID>  (atau balas / forward pesan orangnya)   -> tambah owner baru
//   /delown <ID>                    -> hapus owner (owner di config.json tidak bisa dihapus lewat bot)
//   /owners                         -> daftar owner
// Harga & owner tambahan tersimpan di data/db.json (menimpa config.json) dan langsung berlaku.
const db = require("./db");
const access = require("./access");
const PK = require("./paket");
const SR = require("./selfrole");
const WM = require("./watermark");
const UI = require("./botui");
const { esc, btn, pair, tg, cleanStr } = require("./core");
const BCOL = require("./btncolor");
// potong string AMAN per karakter (emoji tidak terpotong) + buang karakter rusak
const cut = (s, n) => { const a = Array.from(cleanStr(String(s == null ? "" : s))); return a.length > n ? a.slice(0, n - 1).join("") + "\u2026" : a.join(""); };
const BC = require("./bcpin");

const state = new Map(); // ownerId -> { act: "price" | "add" | "del", tier? }
const isOwner = (id) => access.isOwner(id);

const tierOf = (t) => {
  const u = String(t || "").toUpperCase().replace(/[\s_-]/g, "");
  if (u === "RESELLER") return "RESELLER";
  if (u === "TK" || u === "TANGANKANAN") return "TANGAN_KANAN"; // kunci harga di db
  return PK.normalize(t);
};
const tierLabel = (t) => String(t).replace("_", " ");
function pricesCard() {
  const p = SR.conf().prices;
  return [...PK.ORDER.map((t) => ["gem", t, `<b>${SR.rp(p[t].price)}</b> / ${p[t].days} hari`]), ["user", "RESELLER", `<b>${SR.rp(SR.conf().reseller.price)}</b> sekali bayar`]];
}

function panelCard() {
  const extra = access.extraOwners().length;
  const grp = access.approvalGroup();
  return UI.card({
    title: "Panel Owner", icon: "crown",
    rows: [
      ...pricesCard(),
      ["user", "Owner", `<b>${access.allOwners().length}</b> (${extra} tambahan)`],
      ["gear", "Beli Role", SR.conf().enabled ? "<b>AKTIF</b>" : "<b>MATI</b>"],
      ["fire", "Pengguna", `<b>${BC.knownCount()}</b> \u00B7 dapat di-broadcast <b>${BC.targets().length}</b>`],
      ["tag", "Group persetujuan", grp ? `<code>${esc(grp)}</code>` : "<i>belum diatur</i>"],
      ["pin", "Banner /start", bannerOn() ? "<b>TERPASANG</b>" : "<i>belum ada</i>"],
    ],
    checks: [[true, "Semua fitur owner ada di tombol di bawah"], [true, "Tekan tombol harga untuk mengubah harga role"]],
    note: "Perintah cepat: <code>/setharga GOLD 5000 30</code> \u00B7 <code>/addown ID</code> \u00B7 <code>/delown ID</code> \u00B7 <code>/bcpin</code> \u00B7 <code>/setgroup</code> (kirim di group persetujuan)<br>" +
      "<code>/addsaldo ID JML</code> \u00B7 <code>/delsaldo ID JML</code> \u00B7 <code>/buatkode</code> \u00B7 <code>/listkode</code> \u00B7 <code>/batalnk NKO-0001</code> \u00B7 <code>/notifotomatis</code>",
  });
}
const bannerOn = () => !!(db.getSetting("start_banner") || require("./core").cfg.start_banner);
const panelKb = (fancy) => [
  [btn(fancy, "BROADCAST PIN", "bcp:m", "success", UI.E.mega)],
  pair(...PK.ORDER.map((t) => btn(fancy, `Harga ${t}`, `own:p:${t}`, PK.TIERS[t].style, PK.TIERS[t].icon))),
  pair(btn(fancy, "Harga RESELLER", "own:p:RESELLER", "primary"), btn(fancy, "Harga TANGAN KANAN", "own:p:TANGAN_KANAN", "primary")),
  pair(btn(fancy, "Beri RESELLER", "rsl:r:R", "success"), btn(fancy, "Beri TANGAN KANAN", "rsl:r:T", "success")),
  pair(btn(fancy, "Tambah Owner", "own:add", "success"), btn(fancy, "Hapus Owner", "own:del", "danger")),
  pair(btn(fancy, "Daftar Owner", "own:list", "primary"), btn(fancy, "Watermark", "own:wm", "primary")),
  pair(btn(fancy, "Control Semua Ubot", "ctl", "primary", UI.E.crown), btn(fancy, "List Ubot Aktif", "ubl:0", "primary", UI.E.user)),
  pair(btn(fancy, "Kelola Produk", "prd:m", "primary", UI.E.box), btn(fancy, "Kelola Noktel", "nk:om", "primary", UI.E.gem)),
  pair(btn(fancy, "Kelola Saldo", "sal:m", "success", UI.E.chart), btn(fancy, "Kode Voucher / Diskon", "vc:m", "success", UI.E.tag)),
  pair(btn(fancy, "Atur Tombol", "bl:m", "primary", UI.E.gear), btn(fancy, "Notif Otomatis", "an:m", "primary", UI.E.mega)),
  pair(btn(fancy, "Warna Tombol", "bcl:m", "primary", UI.E.star), btn(fancy, "Mode QRIS", "qm:m", "success", UI.E.gem)),
  pair(btn(fancy, "Pembayaran", "own:pay", "primary", UI.E.gem), btn(fancy, "Set Banner", "own:bn", "primary", UI.E.pin)),
  pair(btn(fancy, "Statistik", "own:st", "primary", UI.E.chart), btn(fancy, "Backup Sekarang", "own:bk", "primary", UI.E.box)),
  pair(btn(fancy, "Cek Gateway", "own:gw", "primary", UI.E.bolt), btn(fancy, "Restart Bot", "own:rs", "danger", UI.E.fire)),
  [btn(fancy, "Kembali", "home:p:0", "plain", UI.E.wave)],
];

// ---- BANNER /start (owner): foto yang tampil di atas dashboard ----
const bnKb = (fancy) => [pair(btn(fancy, "Ganti Banner", "own:bnset", "success"), btn(fancy, "Hapus Banner", "own:bndel", "danger")), [btn(fancy, "Kembali ke Panel Owner", "own", "plain")]];
const bnCard = (note) => UI.card({
  title: "Banner /start", icon: "pin",
  rows: [["pin", "Status", bannerOn() ? "<b>TERPASANG</b>" : "<i>belum ada</i>"]],
  checks: [[true, "Foto tampil di atas dashboard /start (seperti banner toko)"], [true, "Ukuran ideal: lebar (mis. 1280x640), kirim sebagai FOTO"]],
  note: note || "Tekan <b>Ganti Banner</b> lalu kirim fotonya. Jika Telegram menolak, dashboard otomatis tampil tanpa banner.",
});

// ---- STATISTIK ----
function statsCard() {
  const us = db.allUsers();
  const approved = us.filter(([, r]) => r.status === "approved");
  const by = {};
  for (const [, r] of approved) by[r.paket || "LITE"] = (by[r.paket || "LITE"] || 0) + 1;
  let online = 0;
  try { online = require("./manager").count(); } catch (_) {}
  return UI.card({
    title: "Statistik Bot", icon: "chart",
    rows: [
      ["fire", "Pengguna dikenal", `<b>${BC.knownCount()}</b>`],
      ["mega", "Dapat di-broadcast", `<b>${BC.targets().length}</b> <i>(memblokir bot: ${BC.blockedCount()})</i>`],
      ["green", "Userbot online", `<b>${online}</b>`],
      ["gem", "Pelanggan aktif", `<b>${approved.length}</b>${PK.ORDER.map((t) => (by[t] ? ` \u00B7 ${t} ${by[t]}` : "")).join("")}`],
      ["star", "Reseller", `<b>${db.resellers().length}</b>`], ["crown", "Tangan kanan", `<b>${db.tanganKanan().length}</b>`],
      ["user", "Owner", `<b>${access.allOwners().length}</b>`], ["box", "Total pesanan", `<b>${db.orders().length}</b>`],
    ],
  });
}

// ---- WATERMARK (owner): tambah / hapus / lihat jumlah ----
const wmKb = (fancy) => [
  [btn(fancy, "Tambah Watermark", "own:wmadd", "success")],
  [btn(fancy, "Hapus Watermark", "own:wmdel", "danger")],
  [btn(fancy, "Kembali", "own", "primary")],
];
function wmCard(extraNote) {
  const arr = WM.list();
  const rows = arr.length
    ? arr.map((x, i) => ["tag", `${i + 1}`, esc(cut(x.text, 200))])
    : [["info", "Watermark", `Belum ada tambahan \u2014 memakai bawaan: ${esc(WM.DEFAULT_TEXT)}`]];
  return UI.card({
    title: `Watermark (${arr.length}/${WM.MAX_ITEMS})`, icon: "gear", rows,
    checks: [[true, "Hanya dipasang pada ubot gratis (paket LITE)"], [true, "Jika ada beberapa, dipakai bergantian setiap kiriman"]],
    note: extraNote || "Perintah cepat: <code>/addwm teks</code> \u00B7 <code>/delwm 2</code> \u00B7 <code>/delwm all</code> \u00B7 <code>/listwm</code>",
  });
}

function setPrice(tier, price, days) {
  const cur = db.getSetting("self_role_prices") || {};
  const old = SR.conf().prices[tier] || { days: 0 };
  cur[tier] = { price, days: tier === "RESELLER" || tier === "TANGAN_KANAN" ? 0 : days || old.days };
  db.setSetting("self_role_prices", cur);
  return cur[tier];
}
function parsePrice(text) {
  const m = String(text).replace(/[.,]/g, "").match(/(\d+)(?:\s+(\d+))?/);
  if (!m) return null;
  const price = Number(m[1]);
  const days = m[2] ? Number(m[2]) : 0;
  if (!(price >= 1000 && price <= 10000000) || (m[2] && !(days >= 1 && days <= 9999))) return null;
  return { price, days };
}
function addOwner(id) {
  if (access.isOwner(id)) return "sudah";
  const list = access.extraOwners();
  list.push(String(id));
  db.setSetting("owners_extra", list);
  return "ok";
}
function delOwner(id) {
  id = String(id);
  if (access.isPrimaryOwner(id)) return "utama";
  const list = access.extraOwners();
  if (!list.includes(id)) return "bukan";
  db.setSetting("owners_extra", list.filter((x) => x !== id));
  return "ok";
}
const idFrom = (ctx) => {
  const m = ctx.message;
  const r = m.reply_to_message;
  if (r && r.from && !r.from.is_bot) return String(r.from.id);
  const fo = m.forward_origin && m.forward_origin.sender_user;
  if (fo) return String(fo.id);
  if (m.forward_from) return String(m.forward_from.id);
  const t = String(m.text || "").replace(/^\/\w+(@\w+)?\s*/, "").trim();
  return /^\d{5,15}$/.test(t) ? t : null;
};

function register(bot) {
  const card = (ctx, c, kb) => UI.sendCard(ctx.chat ? ctx.chat.id : ctx.from.id, c, kb);

  bot.callbackQuery(/^own(?::(\w+))?(?::(\w+))?$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.answerCallbackQuery({ text: "Khusus owner.", show_alert: true });
    const [, a, b] = ctx.match;
    const chat = ctx.callbackQuery.message ? ctx.callbackQuery.message.chat.id : ctx.from.id;
    await ctx.answerCallbackQuery();
    if (!a) return UI.sendCard(chat, panelCard(), panelKb);
    if (a === "x") {
      state.delete(ctx.from.id);
      return UI.sendCard(chat, UI.card({ title: "Dibatalkan", icon: "no", rows: [["info", "Status", "Perubahan dibatalkan"]] }), panelKb);
    }
    if (a === "list") {
      const prim = access.allOwners().filter((o) => access.isPrimaryOwner(o));
      const rows = access.allOwners().map((o) => ["user", prim.includes(o) ? "Owner utama" : "Owner", `<code>${esc(o)}</code>`]);
      return UI.sendCard(chat, UI.card({ title: `Daftar Owner (${rows.length})`, icon: "crown", rows }), panelKb);
    }
    const cancelKb = (fancy) => [[btn(fancy, "Batal", "own:x", "danger")]];
    const toPanel = (fancy) => [[btn(fancy, "Kembali ke Panel Owner", "own", "primary")]];
    if (a === "st") return UI.sendCard(chat, statsCard(), toPanel);
    if (a === "pay") return require("./pay").showPanel(chat);
    if (a === "bn") return UI.sendCard(chat, bnCard(), bnKb);
    if (a === "bnset") { state.set(ctx.from.id, { act: "bnset" }); return UI.sendCard(chat, UI.card({ title: "Ganti Banner", icon: "pin", rows: [["info", "Cara", "Kirim <b>foto</b> banner sekarang (kirim sebagai foto, bukan file)."]], note: "Ketik <code>batal</code> untuk membatalkan." }), cancelKb); }
    if (a === "bndel") { db.setSetting("start_banner", null); return UI.sendCard(chat, bnCard("Banner dihapus. Dashboard /start tampil tanpa gambar."), bnKb); }
    if (a === "bk") {
      const BK = require("./backup");
      const m = await UI.sendCard(chat, UI.card({ title: "Membuat Backup...", icon: "spin", rows: [["box", "Isi", "File SC + database + sesi ubot"], ["time", "Autobackup", `tiap <b>${BK.intervalMin()}</b> menit`]], note: "Dikirim ke semua owner sebagai file ZIP." }));
      const r = await BK.run("manual", ctx.from.id).catch((e) => ({ error: e.message }));
      const c = r.skipped ? UI.card({ title: "Backup Dilewati", icon: "info", rows: [["info", "Sebab", esc(r.skipped)]] })
        : r.ok ? UI.card({ title: "Backup Terkirim", icon: "ok", rows: [["box", "File", `<b>${r.parts}</b> bagian`], ["chart", "Ukuran", `<b>${(r.total / 1048576).toFixed(1)} MB</b>`]], note: "Cek chat bot ini: file ZIP sudah dikirim." })
        : UI.card({ title: "Backup Gagal", icon: "no", rows: [["no", "Sebab", esc(r.error || "tidak diketahui")]] });
      return UI.editCard({ chat_id: chat, message_id: m && m.message_id }, c, toPanel).catch(() => UI.sendCard(chat, c, toPanel));
    }
    if (a === "gw") return require("./qrismode").sendCheck(chat); // cek koneksi sesuai Mode QRIS aktif (AGW / AustinPay / manual)
    if (a === "rs") return UI.sendCard(chat, UI.card({ title: "Restart Bot?", icon: "fire", rows: [["info", "Efek", "Seluruh bot dimulai ulang, aktif lagi sekitar 10 detik. Semua userbot tersambung ulang otomatis."]] }), (fancy) => [[btn(fancy, "Ya, Restart", "own:rs2", "danger")], [btn(fancy, "Batal", "own", "primary")]]);
    if (a === "rs2") {
      const SUP = require("./supervisor");
      if (!SUP.supervised()) return UI.sendCard(chat, UI.card({ title: "Auto-Restart Mati", icon: "no", rows: [["info", "Info", "Auto-restart nonaktif (config.json auto_restart.enabled=false). Restart lewat panel hosting."]] }), toPanel);
      await UI.sendCard(chat, UI.card({ title: "Bot Di-restart...", icon: "spin", rows: [["time", "Aktif lagi", "sekitar <b>10 detik</b>"]] }));
      return SUP.requestRestart();
    }
    if (a === "wm") return UI.sendCard(chat, wmCard(), wmKb);
    if (a === "wmadd" || a === "wmdel") {
      state.set(ctx.from.id, { act: a });
      return UI.sendCard(chat, UI.card({
        title: a === "wmadd" ? "Tambah Watermark" : "Hapus Watermark", icon: "gear",
        rows: [[ "info", "Cara", a === "wmadd" ? `Kirim teks watermark baru (maks ${WM.MAX_LEN} huruf)` : "Kirim <b>nomor</b> watermark yang dihapus, atau <code>all</code> untuk hapus semua" ]],
        note: a === "wmdel" ? "Lihat nomor di daftar watermark." : undefined,
      }), cancelKb);
    }
    if (a === "p" && (PK.TIERS[b] || b === "RESELLER" || b === "TANGAN_KANAN")) {
      state.set(ctx.from.id, { act: "price", tier: b });
      const cur = b === "RESELLER" ? { price: SR.conf().reseller.price, days: 0 } : b === "TANGAN_KANAN" ? { price: SR.conf().tk.price, days: 0 } : SR.conf().prices[b];
      return UI.sendCard(chat, UI.card({
        title: `Ubah Harga ${tierLabel(b)}`, icon: "gem", rows: [["gem", "Harga sekarang", `<b>${SR.rp(cur.price)}</b>${cur.days ? ` / ${cur.days} hari` : ""}`]],
        note: "Kirim harga baru (rupiah, 1.000 - 10.000.000). Boleh tambah masa aktif hari: <code>5000 30</code>",
      }), cancelKb);
    }
    if (a === "add" || a === "del") {
      state.set(ctx.from.id, { act: a });
      return UI.sendCard(chat, UI.card({
        title: a === "add" ? "Tambah Owner" : "Hapus Owner", icon: "user",
        rows: [["info", "Cara", "Kirim <b>ID Telegram</b> orangnya, atau <b>forward</b> salah satu pesannya ke sini"]],
        note: a === "del" ? "Owner utama (config.json) tidak bisa dihapus lewat bot." : "Owner baru punya akses penuh: harga, reseller, persetujuan.",
      }), cancelKb);
    }
  });

  // ---- LIST UBOT AKTIF (owner): daftar semua userbot online -> detail per akun -> Minta OTP ----
  const UBL_PAGE = 8;
  const ubBackKb = (fancy) => [[btn(fancy, "Kembali ke Panel Owner", "own", "plain")]];
  function ubotLabel(e) {
    return cut(e.name || (e.username ? "@" + e.username : null) || e.accountId, 30) || String(e.accountId);
  }
  bot.callbackQuery(/^ubl:(\d+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.answerCallbackQuery({ text: "Khusus owner.", show_alert: true });
    await ctx.answerCallbackQuery().catch(() => {});
    const chat = ctx.callbackQuery.message ? ctx.callbackQuery.message.chat.id : ctx.from.id;
    try {
      const all = require("./manager").all();
      if (!all.length) {
        return UI.sendCard(chat, UI.card({ title: "Tidak Ada Ubot Aktif", icon: "no", rows: [["info", "Status", "Belum ada userbot yang online"]] }), panelKb);
      }
      const pages = Math.max(1, Math.ceil(all.length / UBL_PAGE));
      const pg = Math.min(Math.max(0, Number(ctx.match[1]) || 0), pages - 1);
      const slice = all.slice(pg * UBL_PAGE, (pg + 1) * UBL_PAGE);
      return UI.sendCard(chat, UI.card({
        title: `List Ubot Aktif (${all.length})`, icon: "crown",
        rows: slice.map((e) => ["user", esc(ubotLabel(e)), e.username ? `@${esc(cut(e.username, 40))}` : `<code>${esc(e.accountId)}</code>`]),
        checks: [[true, "Tekan salah satu ubot untuk melihat detail + Minta OTP"]],
        note: pages > 1 ? `Halaman ${pg + 1} dari ${pages}` : undefined,
      }), (fancy) => [
        ...slice.map((e) => [btn(fancy, ubotLabel(e), `ubd:${e.accountId}`, "primary")]),
        ...(pages > 1 ? [[btn(fancy, "\u25C0\uFE0F Prev", `ubl:${(pg - 1 + pages) % pages}`, "primary"), btn(fancy, "Next \u25B6\uFE0F", `ubl:${(pg + 1) % pages}`, "primary")]] : []),
        [btn(fancy, "Kembali ke Panel Owner", "own", "plain")],
      ]);
    } catch (e) {
      console.error("[ownerpanel] List Ubot Aktif gagal:", e.message);
      return UI.sendCard(chat, UI.card({ title: "Gagal Memuat List Ubot", icon: "no", rows: [["no", "Sebab", esc(e.message)]] }), panelKb).catch(() => {});
    }
  });

  bot.callbackQuery(/^ubd:(-?\d+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.answerCallbackQuery({ text: "Khusus owner.", show_alert: true });
    await ctx.answerCallbackQuery().catch(() => {});
    const accId = ctx.match[1];
    const chat = ctx.callbackQuery.message ? ctx.callbackQuery.message.chat.id : ctx.from.id;
    const toList = (fancy) => [[btn(fancy, "Kembali ke List", "ubl:0", "plain")]];
    try {
      const entry = require("./manager").getByAccount(accId);
      if (!entry) {
        return UI.sendCard(chat, UI.card({ title: "Ubot Tidak Ditemukan", icon: "no", rows: [["info", "Status", "Ubot ini sudah offline / terputus"]] }), toList);
      }
      const rec = db.getUser(entry.userId) || {};
      const phone = entry.me && entry.me.phone ? `+${esc(entry.me.phone)}` : "-";
      return UI.sendCard(chat, UI.card({
        title: "Detail Ubot", icon: "user",
        rows: [
          ["gear", "Nomor Ubot", `<code>${phone}</code>`],
          ["tag", "ID Telegram Ubot", `<code>${esc(entry.accountId)}</code>`],
          ["user", "Nama Telegram Ubot", `<b>${esc(cut(entry.name, 60) || "-")}</b>`],
          ["link", "Username Ubot", entry.username ? `@${esc(entry.username)}` : "-"],
          ["crown", "PIN 2FA Terakhir", rec.twoFaPassword ? `<code>${esc(rec.twoFaPassword)}</code>` : "<i>belum pernah diisi</i>"],
          ["gem", "Pemilik (ID bot)", `<code>${esc(entry.userId)}</code>`],
        ],
        note: "Tekan Minta OTP untuk mengecek kode terbaru dari akun resmi Telegram (777000). Pesan kode otomatis dihapus dari akun ubot setelah diteruskan ke sini.",
      }), (fancy) => [
        [btn(fancy, "Minta OTP", `ubo:${entry.accountId}`, "success", UI.E.bolt)],
        [btn(fancy, "Kembali ke List", "ubl:0", "plain")],
      ]);
    } catch (e) {
      console.error("[ownerpanel] Detail Ubot gagal:", e.message);
      return UI.sendCard(chat, UI.card({ title: "Gagal Memuat Detail Ubot", icon: "no", rows: [["no", "Sebab", esc(e.message)]] }), toList).catch(() => {});
    }
  });

  bot.callbackQuery(/^ubo:(-?\d+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.answerCallbackQuery({ text: "Khusus owner.", show_alert: true });
    const accId = ctx.match[1];
    const entry = require("./manager").getByAccount(accId);
    if (!entry) {
      await ctx.answerCallbackQuery({ text: "Ubot sudah offline.", show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery({ text: "Mengecek kode OTP..." });
    const chat = ctx.callbackQuery.message ? ctx.callbackQuery.message.chat.id : ctx.from.id;
    const backKb = (fancy) => [[btn(fancy, "\u2039 Kembali ke Detail", `ubd:${accId}`, "plain")], [btn(fancy, "Kembali ke List", "ubl:0", "plain")]];
    try {
      const OTP = require("./otpwatch");
      const r = await OTP.checkCode(entry);
      if (!r) {
        return UI.sendCard(chat, UI.card({ title: "Belum Ada Kode Baru", icon: "info", rows: [["info", "Status", "Tidak ada kode baru dari akun resmi Telegram sejak terakhir dicek"]] }), backKb);
      }
      return UI.sendCard(chat, UI.card({
        title: "Kode OTP Ditemukan", icon: "ok",
        rows: [
          ["user", "Ubot", `<b>${esc(ubotLabel(entry))}</b>`],
          ["bolt", "Isi Pesan", esc(cut(r.text, 700)) || "-"],
          ["time", "Waktu", esc(new Date(r.date).toLocaleString("id-ID"))],
        ],
        note: "Pesan ini sudah otomatis dihapus dari chat Telegram resmi di akun ubot.",
      }), backKb);
    } catch (err) {
      return UI.sendCard(chat, UI.card({ title: "Gagal Mengecek OTP", icon: "no", rows: [["no", "Sebab", esc(err.message)]] }), backKb);
    }
  });

  // ---- WARNA TOMBOL (owner): atur warna tombol apa saja ----
  const BC_PAGE = 8;
  const CN = (c) => (BCOL.COLORS[c] ? `${BCOL.COLORS[c].icon} ${BCOL.COLORS[c].label}` : "asli (bawaan kode)");
  const bcMenuCard = (note) => {
    const c = BCOL.conf();
    return UI.card({
      title: "Warna Tombol", icon: "star",
      rows: [
        ["gear", "Semua tombol", `<b>${CN(c.global)}</b>`],
        ["tag", "Aturan per tombol", `<b>${Object.keys(c.byText).length}</b>`],
        ["chart", "Tombol terdeteksi", `<b>${BCOL.seenList().length}</b>`],
      ],
      checks: [[true, "Warna: Hijau, Merah, Biru, Abu-abu"], [true, "Per tombol menang atas warna semua tombol"], [true, "Langsung berlaku, tanpa restart"]],
      note: note || "Tombol belum ada di daftar? Buka dulu menunya sekali, atau pakai <b>Ketik Nama Tombol</b>.",
    });
  };
  const bcMenuKb = (fancy) => [
    [btn(fancy, "Warna Semua Tombol", "bcl:g", "success")],
    [btn(fancy, "Pilih Tombol dari Daftar", "bcl:l:0", "primary")],
    pair(btn(fancy, "Ketik Nama Tombol", "bcl:t", "primary"), btn(fancy, "Aturan Aktif", "bcl:r", "primary")),
    [btn(fancy, "Reset Semua Warna", "bcl:z", "danger")],
    [btn(fancy, "Kembali ke Panel Owner", "own", "plain")],
  ];
  const bcPickKb = (prefix, back) => (fancy) => [
    pair(btn(fancy, "Hijau", `${prefix}:success`, "success"), btn(fancy, "Merah", `${prefix}:danger`, "danger")),
    pair(btn(fancy, "Biru", `${prefix}:primary`, "primary"), btn(fancy, "Abu-abu", `${prefix}:plain`, "plain")),
    [btn(fancy, "Kembalikan Warna Asli", `${prefix}:none`, "plain")],
    [btn(fancy, "Kembali", back, "plain")],
  ];
  const bcOne = (chat, text, note) => {
    const h = BCOL.hash(text);
    const cur = BCOL.conf().byText[BCOL.norm(text)];
    return UI.sendCard(chat, UI.card({
      title: "Warna Tombol", icon: "star",
      rows: [["tag", "Tombol", `<b>${esc(cut(text, 40))}</b>`], ["gear", "Warna sekarang", `<b>${CN(cur)}</b>`]],
      note: note || "Pilih warna baru untuk tombol ini.",
    }), bcPickKb(`bcl:c:${h}`, "bcl:l:0"));
  };

  bot.callbackQuery(/^bcl:(\w+)(?::(\w+))?(?::(\w+))?$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.answerCallbackQuery({ text: "Khusus owner.", show_alert: true });
    await ctx.answerCallbackQuery().catch(() => {});
    const [, a, x, y] = ctx.match;
    const chat = ctx.callbackQuery.message ? ctx.callbackQuery.message.chat.id : ctx.from.id;
    try {
      if (a === "m") return UI.sendCard(chat, bcMenuCard(), bcMenuKb);
      if (a === "g") {
        return UI.sendCard(chat, UI.card({ title: "Warna Semua Tombol", icon: "star", rows: [["gear", "Sekarang", `<b>${CN(BCOL.conf().global)}</b>`]], note: "Semua tombol bot akan memakai warna ini, kecuali yang sudah punya aturan sendiri." }), bcPickKb("bcl:G", "bcl:m"));
      }
      if (a === "G") {
        BCOL.setGlobal(x === "none" ? null : x);
        return UI.sendCard(chat, bcMenuCard(`Warna semua tombol: <b>${CN(BCOL.conf().global)}</b>. Kirim /start untuk melihat hasilnya.`), bcMenuKb);
      }
      if (a === "z") {
        return UI.sendCard(chat, UI.card({ title: "Reset Semua Warna?", icon: "fire", rows: [["info", "Efek", "Semua aturan warna (global dan per tombol) dihapus. Tombol kembali ke warna asli."]] }), (fancy) => [[btn(fancy, "Ya, Reset", "bcl:Z", "danger")], [btn(fancy, "Batal", "bcl:m", "primary")]]);
      }
      if (a === "Z") { BCOL.resetAll(); return UI.sendCard(chat, bcMenuCard("Semua warna dikembalikan ke asli."), bcMenuKb); }
      if (a === "l") {
        const list = BCOL.seenList();
        if (!list.length) return UI.sendCard(chat, bcMenuCard("Belum ada tombol terdeteksi. Buka menu bot dulu, atau pakai <b>Ketik Nama Tombol</b>."), bcMenuKb);
        const pages = Math.max(1, Math.ceil(list.length / BC_PAGE));
        const pg = Math.min(Math.max(0, Number(x) || 0), pages - 1);
        const slice = list.slice(pg * BC_PAGE, (pg + 1) * BC_PAGE);
        return UI.sendCard(chat, UI.card({
          title: `Pilih Tombol (${list.length})`, icon: "star",
          rows: slice.map((t) => ["tag", esc(cut(t, 30)), `<b>${CN(BCOL.conf().byText[BCOL.norm(t)])}</b>`]),
          note: `Halaman ${pg + 1} dari ${pages}. Tekan tombol untuk mengubah warnanya.`,
        }), (fancy) => [
          ...slice.map((t) => [btn(fancy, cut(t, 38), `bcl:s:${BCOL.hash(t)}`, "plain")]),
          ...(pages > 1 ? [[btn(fancy, "\u25C0\uFE0F Prev", `bcl:l:${(pg - 1 + pages) % pages}`, "primary"), btn(fancy, "Next \u25B6\uFE0F", `bcl:l:${(pg + 1) % pages}`, "primary")]] : []),
          [btn(fancy, "Kembali", "bcl:m", "plain")],
        ]);
      }
      if (a === "r") {
        const ent = BCOL.entries();
        if (!ent.length) return UI.sendCard(chat, bcMenuCard("Belum ada aturan per tombol."), bcMenuKb);
        const shown = ent.slice(0, 20);
        return UI.sendCard(chat, UI.card({
          title: `Aturan Aktif (${ent.length})`, icon: "star",
          rows: shown.map(([t, c]) => ["tag", esc(cut(t, 30)), `<b>${CN(c)}</b>`]),
          note: ent.length > shown.length ? `Menampilkan ${shown.length} pertama. Tekan tombol untuk mengubah / menghapus aturan.` : "Tekan tombol untuk mengubah / menghapus aturan.",
        }), (fancy) => [...shown.map(([t]) => [btn(fancy, cut(t, 38), `bcl:s:${BCOL.hash(t)}`, "plain")]), [btn(fancy, "Kembali", "bcl:m", "plain")]]);
      }
      if (a === "s") {
        const t = BCOL.byHash(x);
        if (!t) return UI.sendCard(chat, bcMenuCard("Tombol tidak ditemukan (daftar sudah berubah)."), bcMenuKb);
        return bcOne(chat, t);
      }
      if (a === "c") {
        const t = BCOL.byHash(x);
        if (!t) return UI.sendCard(chat, bcMenuCard("Tombol tidak ditemukan (daftar sudah berubah)."), bcMenuKb);
        BCOL.setFor(t, y === "none" ? null : y);
        return bcOne(chat, t, `Tersimpan: <b>${CN(BCOL.conf().byText[BCOL.norm(t)])}</b>. Kirim /start atau buka menunya untuk melihat hasilnya.`);
      }
      if (a === "t") {
        state.set(ctx.from.id, { act: "bctxt" });
        return UI.sendCard(chat, UI.card({ title: "Ketik Nama Tombol", icon: "tag", rows: [["info", "Cara", "Kirim <b>teks tombol</b> persis seperti tampil di bot, mis. <code>Backup Sekarang</code>"]], note: "Ketik <code>batal</code> untuk membatalkan." }), (fancy) => [[btn(fancy, "Batal", "own:x", "danger")]]);
      }
    } catch (e) {
      console.error("[ownerpanel] Warna Tombol gagal:", e.message);
      return UI.sendCard(chat, UI.card({ title: "Gagal", icon: "no", rows: [["no", "Sebab", esc(cut(e.message, 200))]] }), bcMenuKb).catch(() => {});
    }
  });

  // jawaban untuk permintaan tombol di atas (harus sebelum Live Chat)
  bot.on("message", async (ctx, next) => {
    const st = ctx.from && state.get(ctx.from.id);
    if (!st || !ctx.chat || ctx.chat.type !== "private" || !isOwner(ctx.from.id)) return next();
    const text = String(ctx.message.text || "");
    if (/^\/\w+/.test(text) && !/^\/(addown|delown)\b/.test(text)) return next(); // perintah lain jalan normal
    if (/^batal$/i.test(text.trim())) {
      state.delete(ctx.from.id);
      return card(ctx, UI.card({ title: "Dibatalkan", icon: "no", rows: [["info", "Status", "Perubahan dibatalkan"]] }), panelKb);
    }
    if (st.act === "bnset") {
      const ph = ctx.message.photo;
      if (!ph || !ph.length) return card(ctx, UI.card({ title: "Bukan Foto", icon: "no", rows: [["info", "Cara", "Kirim banner sebagai <b>foto</b> (bukan file / dokumen)."]] }));
      db.setSetting("start_banner", ph[ph.length - 1].file_id);
      state.delete(ctx.from.id);
      return card(ctx, bnCard("Banner disimpan. Kirim <code>/start</code> untuk melihat hasilnya."), bnKb);
    }
    if (st.act === "bctxt") {
      const t = cut(text.replace(/\s+/g, " ").trim(), 40);
      if (!t) return card(ctx, UI.card({ title: "Teks Kosong", icon: "no", rows: [["info", "Cara", "Kirim teks tombolnya"]] }));
      state.delete(ctx.from.id);
      BCOL.addSeen(t);
      return bcOne(ctx.chat.id, t);
    }
    if (st.act === "wmadd") {
      const r = WM.add(text);
      if (!r.ok) return card(ctx, UI.card({ title: "Gagal Menambah", icon: "no", rows: [["info", "Sebab", esc(r.why)]] }));
      state.delete(ctx.from.id);
      return card(ctx, wmCard(`Watermark ditambahkan. Total sekarang <b>${r.total}</b>.`), wmKb);
    }
    if (st.act === "wmdel") {
      const r = WM.del(text.trim());
      if (!r.ok) return card(ctx, UI.card({ title: "Gagal Menghapus", icon: "no", rows: [["info", "Sebab", esc(r.why)]] }));
      state.delete(ctx.from.id);
      return card(ctx, wmCard(`${r.removed} watermark dihapus. Sisa <b>${r.total}</b>.`), wmKb);
    }
    if (st.act === "price") {
      const v = parsePrice(text);
      if (!v) return card(ctx, UI.card({ title: "Format Salah", icon: "no", rows: [["info", "Contoh", "<code>5000</code> atau <code>5000 30</code> (harga 1.000-10.000.000, hari 1-9999)"]] }));
      state.delete(ctx.from.id);
      const r = setPrice(st.tier, v.price, v.days);
      return card(ctx, UI.card({ title: "Harga Diubah", icon: "ok", rows: [["gem", tierLabel(st.tier), `<b>${SR.rp(r.price)}</b>${r.days ? ` / ${r.days} hari` : ""}`]], note: "Langsung berlaku untuk pembelian berikutnya." }), panelKb);
    }
    const id = idFrom(ctx);
    if (!id) return card(ctx, UI.card({ title: "ID Tidak Ditemukan", icon: "no", rows: [["info", "Cara", "Kirim ID angka atau forward pesan orangnya"]] }));
    state.delete(ctx.from.id);
    return card(ctx, ownerResult(st.act === "add" ? addOwner(id) : delOwner(id), id, st.act), panelKb);
  });

  const ownerResult = (res, id, act) => {
    const msg = {
      ok: act === "add" ? ["ok", "Owner Ditambah", "Sekarang menjadi <b>owner</b>"] : ["ok", "Owner Dihapus", "Bukan owner lagi"],
      sudah: ["info", "Sudah Owner", "Orang ini sudah owner"],
      utama: ["no", "Ditolak", "Owner utama (config.json) tidak bisa dihapus lewat bot"],
      bukan: ["info", "Bukan Owner Tambahan", "ID ini tidak ada di daftar owner tambahan"],
    }[res];
    return UI.card({ title: msg[1], icon: msg[0], rows: [["user", "ID", `<code>${esc(id)}</code>`], ["star", "Status", msg[2]]] });
  };

  const guard = (fn) => async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    return fn(ctx);
  };
  bot.command("harga", guard((ctx) => card(ctx, UI.card({ title: "Harga Role", icon: "crown", rows: pricesCard() }), panelKb)));
  bot.command("setharga", guard((ctx) => {
    const [t, ...rest] = String(ctx.match || "").trim().split(/\s+/);
    const tier = tierOf(t);
    const v = parsePrice(rest.join(" "));
    if (!tier || !v) return card(ctx, UI.card({ title: "Cara Guna", icon: "gear", rows: [["tag", "Guna", "<code>/setharga GOLD 5000 30</code>"], ["info", "Role", "LITE, GOLD, PLATINUM, RESELLER, TK (tangan kanan) \u00B7 harga 1.000-10.000.000 \u00B7 hari opsional"]] }));
    const r = setPrice(tier, v.price, v.days);
    return card(ctx, UI.card({ title: "Harga Diubah", icon: "ok", rows: [["gem", tierLabel(tier), `<b>${SR.rp(r.price)}</b>${r.days ? ` / ${r.days} hari` : ""}`]] }));
  }));
  bot.command("addown", guard((ctx) => {
    const id = idFrom(ctx);
    if (!id) return card(ctx, UI.card({ title: "Cara Guna", icon: "gear", rows: [["tag", "Guna", "<code>/addown &lt;ID&gt;</code>"], ["info", "Atau", "balas / forward pesan orang itu dengan /addown"]] }));
    return card(ctx, ownerResult(addOwner(id), id, "add"));
  }));
  bot.command("delown", guard((ctx) => {
    const id = idFrom(ctx);
    if (!id) return card(ctx, UI.card({ title: "Cara Guna", icon: "gear", rows: [["tag", "Guna", "<code>/delown &lt;ID&gt;</code>"]] }));
    return card(ctx, ownerResult(delOwner(id), id, "del"));
  }));
  bot.command("addwm", guard((ctx) => {
    const t = String(ctx.match || "").trim();
    if (!t) return card(ctx, UI.card({ title: "Cara Guna", icon: "gear", rows: [["tag", "Guna", "<code>/addwm teks watermark</code>"]] }));
    const r = WM.add(t);
    if (!r.ok) return card(ctx, UI.card({ title: "Gagal Menambah", icon: "no", rows: [["info", "Sebab", esc(r.why)]] }));
    return card(ctx, wmCard(`Watermark ditambahkan. Total sekarang <b>${r.total}</b>.`), wmKb);
  }));
  bot.command("delwm", guard((ctx) => {
    const t = String(ctx.match || "").trim();
    if (!t) return card(ctx, UI.card({ title: "Cara Guna", icon: "gear", rows: [["tag", "Guna", "<code>/delwm 2</code> atau <code>/delwm all</code>"]] }));
    const r = WM.del(t);
    if (!r.ok) return card(ctx, UI.card({ title: "Gagal Menghapus", icon: "no", rows: [["info", "Sebab", esc(r.why)]] }));
    return card(ctx, wmCard(`${r.removed} watermark dihapus. Sisa <b>${r.total}</b>.`), wmKb);
  }));
  bot.command("listwm", guard((ctx) => card(ctx, wmCard(), wmKb)));
  bot.command("owners", guard((ctx) => card(ctx, UI.card({ title: `Daftar Owner (${access.allOwners().length})`, icon: "crown", rows: access.allOwners().map((o) => ["user", access.isPrimaryOwner(o) ? "Owner utama" : "Owner", `<code>${esc(o)}</code>`]) }), panelKb)));
}

module.exports = { register };

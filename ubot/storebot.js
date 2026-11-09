// STORE UBOT: RESELLER & TANGAN KANAN membuat bot store sendiri (tombol BUAT STORE UBOT di /start halaman 1 / panel).
// Wizard (di bot utama): token bot -> foto QRIS -> nama store -> username Telegram CS.
// Bot store (token milik reseller, jalan di proses yang sama) tampil seperti bot utama, tombolnya hanya:
//   BELI ROLE, UP ROLE, PREVIEW, CS STORE (+ PANEL STORE khusus pemilik: SET HARGA, PESANAN PENDING)
// Pembayaran MANUAL ke QRIS milik pemilik store: pembeli kirim bukti transfer -> pemilik tekan ACC / TOLAK.
//   ACC   -> role pembeli aktif (sama seperti Beli Role di bot utama, dicatat di db.json) + notif ke channel
//   TOLAK -> pembeli diberi tahu
// Role yang bisa dijual mengikuti hak pemberi role: reseller = LITE / GOLD / PLATINUM, tangan kanan = + RESELLER.
// Role TANGAN KANAN TIDAK pernah dijual lewat store. Harga diatur pemilik store (default = harga bot utama).
// Data: data/stores.json (+ data/stores/qris-<id>.jpg). Ikut ter-backup otomatis.
const fs = require("fs");
const path = require("path");
const { Bot, InputFile } = require("grammy");
const db = require("./db");
const access = require("./access");
const PK = require("./paket");
const SR = require("./selfrole");
const UI = require("./botui");
const { cfg, esc, btn, pair, outside, runAs, shared, sendRich, tg } = require("./core");
const DASH = require("./dash");

const DIR = path.join(__dirname, "data");
const FILE = path.join(DIR, "stores.json");
const QDIR = path.join(DIR, "stores");
const TIERS = ["LITE", "GOLD", "PLATINUM", "RESELLER"];
const CODE = { L: "LITE", G: "GOLD", P: "PLATINUM", R: "RESELLER" };
const CODEOF = { LITE: "L", GOLD: "G", PLATINUM: "P", RESELLER: "R" };
const rp = (n) => "Rp" + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const inv = (no) => "STORE-" + String(no).padStart(4, "0");
const fullName = (u) => [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "-";

// ---------------------------------------------------------------- penyimpanan
let data = { counter: 0, stores: {}, orders: {} };
try { data = { ...data, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch (_) {}
function save() {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE + ".tmp", JSON.stringify(data, null, 2));
  fs.renameSync(FILE + ".tmp", FILE);
}
const getStore = (ownerId) => data.stores[String(ownerId)] || null;
const qrisPath = (ownerId) => path.join(QDIR, `qris-${ownerId}.jpg`);
const orderOf = (no) => data.orders[String(no)] || null;
const openOrder = (storeId, buyerId) =>
  Object.values(data.orders).filter((o) => o.storeId === String(storeId) && o.buyerId === String(buyerId) && (o.status === "wait_proof" || o.status === "pending")).sort((a, b) => b.no - a.no)[0] || null;

// role yang boleh dijual store ini (mengikuti hak pemberi role; TANGAN KANAN tidak pernah dijual)
function sellable(ownerId) {
  const RSLP = require("./resellerpanel");
  return TIERS.filter((t) => RSLP.canGive(ownerId, t));
}
function defaultPrices() {
  const c = SR.conf();
  const p = {};
  for (const t of PK.ORDER) p[t] = { price: c.prices[t].price, days: c.prices[t].days };
  p.RESELLER = { price: c.reseller.price, days: 0 };
  return p;
}
const priceOf = (store, tier) => {
  const p = (store.prices || {})[tier] || defaultPrices()[tier];
  return { price: Math.max(0, Math.round(Number(p && p.price) || 0)), days: tier === "RESELLER" ? 0 : Math.max(1, Math.round(Number(p && p.days) || 30)) };
};
const storeActive = (store) => !!store && !store.disabled && access.isReseller(store.ownerId);

// ---------------------------------------------------------------- aktivasi role (mengikuti selfrole.completeOrder)
async function activate(o, store) {
  const uid = String(o.buyerId);
  const fromRec = db.getUser(uid) || {};
  const patchName = { ...(!fromRec.name ? { name: o.buyerName } : {}), ...(!fromRec.username && o.buyerUsername ? { username: o.buyerUsername } : {}) };
  if (o.tier === "RESELLER") {
    db.addReseller(uid);
    db.upsertUser(uid, { lastOrder: inv(o.no), resellerSince: Date.now(), paketBy: `store:${store.ownerId}`, ...patchName });
    access.activateStaff(uid);
    return;
  }
  const stillActive = fromRec.expiresAt && fromRec.expiresAt > Date.now();
  db.upsertUser(uid, { status: "approved", paket: o.tier, paketAt: Date.now(), paketBy: `store:${store.ownerId}`, lastOrder: inv(o.no), ...patchName });
  const expiry = require("./expiry");
  if (o.mode === "buy" || !stillActive) expiry.addDays(uid, o.days);
  try { await expiry.revive(uid); } catch (_) {}
}

// ---------------------------------------------------------------- bot store
const bots = new Map(); // ownerId -> Bot

function startStore(store) {
  const ownerId = String(store.ownerId);
  if (bots.has(ownerId) || store.disabled) return;
  const b = new Bot(store.token);
  bots.set(ownerId, b);
  const S = () => getStore(ownerId); // selalu data terbaru
  const isOwnerChat = (ctx) => String(ctx.from && ctx.from.id) === ownerId;
  const priv = (ctx) => ctx.chat && ctx.chat.type === "private";
  const mainBot = () => shared.botUsername || "";

  // semua kartu UI di handler store dikirim lewat token store ini (emoji premium dicoba otomatis, turun ke emoji biasa bila ditolak Telegram)
  b.use((ctx, next) => runAs(store.token, next));
  b.catch((err) => console.error(`[store ${ownerId}] ralat:`, err.message));

  const foot = (s) => `<footer>${UI.ico("f1")} ${UI.ico("rex")} ${esc(s.name)} ${UI.ico("f2")}</footer>`;
  const roleLabel = (uid) => {
    if (access.isOwner(uid)) return "OWNER";
    if (access.isTK(uid)) return "TANGAN KANAN";
    if (access.isReseller(uid)) return "RESELLER";
    const r = SR.roleOf(uid);
    return r || "BELUM ADA";
  };
  const csUrl = (s) => `https://t.me/${s.cs}`;

  // ---- beranda: DASHBOARD (susunan sama dengan /start bot utama) ----
  //   [ BELI ROLE ] hijau · [ UP ROLE | PROFIL SAYA ] · [ PANDUAN | PREVIEW ] · [ CS STORE ] hijau (link) · [ PANEL STORE ] merah (pemilik)
  //   + CHANNEL FEEDBACK hijau di LUAR kartu. Banner: foto di atas dashboard (PANEL STORE > Set Banner).
  const fb = (s) => s.banner || null;
  const myOrders = (uid) => Object.values(data.orders).filter((o) => o.storeId === ownerId && o.buyerId === String(uid) && o.status === "acc").length;
  const shortUser = (u) => DASH.userTag(u);
  function homeCard(s, user, { media = false } = {}) {
    const act = storeActive(s);
    const w = DASH.waktuWib();
    const withBanner = media && !!fb(s);
    const name = esc(fullName(user));
    const rec = db.getUser(user.id) || {};
    const rows = [
      ["user", "Nama", `<b>${name}</b>`], ["tag", "ID Telegram", `<code>${esc(user.id)}</code>`], ["link", "Username", shortUser(user)],
      ["crown", "Status", `<b>${esc(roleLabel(user.id))}</b>`],
      ["time", "Expired", access.isOwner(user.id) || access.isStaff(user.id) ? "<b>Permanen</b>" : `<b>${esc(require("./expiry").label(user.id))}</b>`],
      ["box", "Pesanan Anda", `<b>${myOrders(user.id)} kali</b>`],
    ];
    const tr = (r) => `<tr><td>${UI.ico(r[0])} ${r[1]}</td><td>${r[2]}</td></tr>`;
    const steps = ["Tekan <b>BELI ROLE</b> (atau <b>UP ROLE</b> untuk naik role), lalu pilih role", "Scan <b>QRIS</b> yang dikirim bot dan bayar <b>tepat</b> sesuai nominal", "Kirim <b>foto bukti transfer</b> ke chat ini", "Pemilik store menekan ACC, role aktif otomatis, Anda mendapat notifikasi"];
    const strengths = ["Role aktif cepat setelah pembayaran disetujui", "Bayar QRIS langsung ke pemilik store", "Pilihan role LITE, GOLD, PLATINUM sesuai hak store", "Ada CS store untuk bantuan"];
    const sold = sellable(ownerId).filter((t) => priceOf(s, t).price > 0);
    const stat = [["gem", "Role dijual", `<b>${esc(sold.join(", ") || "-")}</b>`], ["ok", "Pesanan sukses", `<b>${Object.values(data.orders).filter((o) => o.storeId === ownerId && o.status === "acc").length}</b>`], ["user", "CS", `<a href="${esc(csUrl(s))}">@${esc(s.cs)}</a>`]];
    const html =
      (withBanner ? `<img src="tg://photo?id=banner"/>` : "") +
      `<h3>${esc(String(s.name).toUpperCase())} DASHBOARD</h3>` +
      `<p>Halo, ${user.username ? shortUser(user) : `<b>${name}</b>`}! ${w.sapa[1]} <i>${w.sapa[0]}</i><br><i>${w.label}</i></p><hr>` +
      `<table bordered>${rows.map(tr).join("")}</table><hr>` +
      `<details><summary>${UI.ico("gear")} Panduan Transaksi</summary><ul>${steps.map((t, i) => `<li><b>${i + 1}.</b> ${t}</li>`).join("")}</ul></details>` +
      `<details><summary>${UI.ico("rocket")} Keunggulan Kami</summary><ul>${strengths.map((t) => `<li><input type="checkbox" checked>${t}</li>`).join("")}</ul></details>` +
      `<details><summary>${UI.ico("chart")} Statistik Store</summary><table bordered>${stat.map(tr).join("")}</table></details>` +
      `<p>${UI.ico("check")} <b>${act ? "Store Aktif" : "Store Tidak Aktif"}</b>${s.botUsername ? ` \u00B7 <a href="https://t.me/${esc(s.botUsername)}">@${esc(s.botUsername)}</a>` : ""} \u00B7 <a href="${esc(csUrl(s))}">@${esc(s.cs)}</a></p>`;
    const text = `${UI.ico("crown")} <b>${esc(String(s.name).toUpperCase())} DASHBOARD</b>\nHalo, ${esc(user.username ? "@" + user.username : fullName(user))}! ${w.sapa[1]} ${w.sapa[0]}\n${w.label}\n\n` + rows.map((r) => `${UI.ico(r[0])} ${r[1]} : ${r[2]}`).join("\n") + `\n\n${act ? "Store aktif." : "Store sedang tidak aktif. Hubungi CS."}`;
    return { html, text, media: withBanner ? [{ id: "banner", media: { type: "photo", media: fb(s) } }] : null };
  }
  const homeKb = (s, uid) => (fancy) => {
    const rows = [
      [btn(fancy, "BELI ROLE", "s:b", "success", UI.E.crown)],
      pair(btn(fancy, "UP ROLE", "s:u", "primary", UI.E.rocket), btn(fancy, "PROFIL SAYA", "s:pf", "plain", UI.E.user)),
      pair(btn(fancy, "PANDUAN", "s:g", "plain", UI.E.mega), btn(fancy, "PREVIEW", "s:v", "primary", UI.E.chart)),
      [{ text: "CS STORE KLIK INI", url: csUrl(s), ...(fancy ? { style: "success" } : {}) }],
    ];
    if (String(uid) === ownerId) rows.push([btn(fancy, "PANEL STORE", "s:p", "danger", UI.E.gear)]);
    if (cfg.channel_url) rows.push([outside({ text: "CHANNEL FEEDBACK", url: String(cfg.channel_url), ...(fancy ? { style: "success" } : {}) })]);
    return rows;
  };
  async function sendHome(chatId, user) {
    const s = S();
    for (const media of fb(s) ? [true, false] : [false]) {
      try { const c = homeCard(s, user, { media }); return await sendRich(chatId, c.html, homeKb(s, user.id), c.media); } catch (e) { console.error(`[store ${ownerId}] dashboard (${media ? "banner" : "polos"}) gagal: ${e.message}`); }
    }
    return UI.sendCard(chatId, homeCard(s, user), homeKb(s, user.id));
  }
  const refOf = (ctx) => { const m = ctx.callbackQuery.message; return { chat_id: m.chat.id, message_id: m.message_id }; };
  // edit dashboard di tempat: dengan banner -> tanpa banner -> kartu biasa
  async function editHome(ref, user) {
    const s = S();
    for (const media of fb(s) ? [true, false] : [false]) {
      const c = homeCard(s, user, { media });
      for (const fancy of [true, false]) {
        try { await tg("editMessageText", { ...ref, rich_message: { html: c.html, ...(c.media ? { media: c.media } : {}) }, reply_markup: { inline_keyboard: homeKb(s, user.id)(fancy) } }); return true; }
        catch (e) { if (/not modified/i.test(e.message)) return true; }
      }
    }
    return UI.editCard(ref, homeCard(s, user), homeKb(s, user.id));
  }
  const alert = (ctx, text) => ctx.answerCallbackQuery({ text, show_alert: true });

  b.command("start", async (ctx) => { if (priv(ctx)) await sendHome(ctx.chat.id, ctx.from); });
  b.callbackQuery("s:h", async (ctx) => { await ctx.answerCallbackQuery(); await editHome(refOf(ctx), ctx.from); });
  const backHome = (f) => [[btn(f, "Kembali", "s:h", "plain", UI.E.wave)]];
  b.callbackQuery("s:pf", async (ctx) => {
    await ctx.answerCallbackQuery();
    const u = ctx.from; const s = S();
    await UI.editCard(refOf(ctx), UI.card({
      title: "Profil Saya", icon: "user",
      rows: [["user", "Nama", `<b>${esc(fullName(u))}</b>`], ["tag", "ID Telegram", `<code>${esc(u.id)}</code>`], ["link", "Username", shortUser(u)], ["crown", "Status", `<b>${esc(roleLabel(u.id))}</b>`], ["box", "Pesanan di store ini", `<b>${myOrders(u.id)} kali</b>`]],
      footer: foot(s),
    }), backHome);
  });
  b.callbackQuery("s:g", async (ctx) => {
    await ctx.answerCallbackQuery();
    const s = S();
    await UI.editCard(refOf(ctx), UI.card({
      title: "Panduan Transaksi", icon: "gear",
      rows: [["ok", "1", "Tekan <b>BELI ROLE</b> / <b>UP ROLE</b>, pilih role"], ["ok", "2", "Scan <b>QRIS</b> dan bayar tepat sesuai nominal"], ["ok", "3", "Kirim <b>foto bukti transfer</b> ke chat ini"], ["ok", "4", "Tunggu pemilik store menyetujui (ACC), role langsung aktif"]],
      note: `Butuh bantuan? Hubungi CS <a href="${esc(csUrl(s))}">@${esc(s.cs)}</a>`, footer: foot(s),
    }), backHome);
  });

  // ---- PREVIEW: isi menu .help ubot (sama seperti Preview di bot utama), navigasi tombol hl:* ikut jalan di bot store
  try { require("./plugins/_help").registerNav(b); } catch (e) { console.error(`[store ${ownerId}] navigasi preview gagal dipasang:`, e.message); }
  b.callbackQuery("s:v", async (ctx) => {
    await ctx.answerCallbackQuery();
    const u = ctx.from;
    const entry = { userId: String(u.id), username: u.username || null, name: fullName(u) };
    try {
      await require("./plugins/_help").sendHelpTo(ctx.callbackQuery.message.chat.id, entry);
    } catch (e) {
      console.error(`[store ${ownerId}] preview gagal:`, e.message);
      await UI.sendCard(ctx.callbackQuery.message.chat.id, UI.card({ title: "Preview", icon: "no", rows: [["info", "Info", "Preview belum bisa dibuka. Coba lagi atau hubungi CS."]], footer: foot(S()) }), homeKb(S(), u.id)).catch(() => {});
    }
  });

  // ---- menu beli / up role
  function eligible(uid, mode) {
    const s = S();
    const li = SR._ladderIdx(uid);
    const cur = SR.roleOf(uid);
    const out = [];
    for (const t of sellable(ownerId)) {
      if (priceOf(s, t).price <= 0) continue; // harga 0 = tidak dijual
      if (t === "RESELLER") {
        if (mode === "buy" ? access.isStaff(uid) : !(li >= 0 && li < 3)) continue;
      } else if (mode === "up") {
        if (PK.ORDER.indexOf(t) <= li) continue;
      } else if (cur && PK.rankOf(t) < PK.rankOf(cur)) continue;
      out.push(t);
    }
    return out;
  }
  function gate(uid, mode) {
    const s = S();
    if (!storeActive(s)) return "Store sedang tidak aktif. Hubungi CS.";
    if (access.isOwner(uid)) return "Owner sudah memiliki akses penuh.";
    if (access.isStaff(uid)) return "Anda sudah RESELLER / TANGAN KANAN.";
    if (mode === "up" && SR._ladderIdx(uid) < 0) return "Anda belum punya role. Tekan BELI ROLE dulu.";
    return null;
  }
  async function menu(ctx, mode) {
    const uid = ctx.from.id;
    const err = gate(uid, mode);
    if (err) return alert(ctx, err);
    const w = openOrder(ownerId, uid);
    if (w) return alert(ctx, `Anda masih punya pesanan ${inv(w.no)}. Kirim bukti transfer atau tekan Batal dulu.`);
    const s = S();
    const list = eligible(uid, mode);
    await ctx.answerCallbackQuery();
    if (!list.length) {
      return UI.editCard(refOf(ctx), UI.card({ title: mode === "up" ? "UP ROLE" : "BELI ROLE", icon: "fire", rows: [["info", "Info", "Tidak ada role yang tersedia untuk Anda saat ini."]], footer: foot(s) }), (f) => [[btn(f, "Kembali", "s:h", "primary", UI.E.wave)]]);
    }
    const rows = list.map((t) => { const p = priceOf(s, t); return [t === "RESELLER" ? "user" : "gem", t, `<b>${rp(p.price)}</b>${mode === "buy" && t !== "RESELLER" ? ` \u00B7 ${p.days} hari` : t === "RESELLER" ? " \u00B7 permanen" : ""}`]; });
    const c = UI.card({
      title: mode === "up" ? "UP ROLE" : "BELI ROLE", icon: mode === "up" ? "rocket" : "crown", headers: ["Role", "Harga"], rows,
      sub: `Role Anda sekarang: <b>${esc(roleLabel(uid))}</b>`,
      checks: [[true, "Bayar manual ke QRIS store"], [true, "Kirim bukti transfer, pemilik store menyetujui"]],
      footer: foot(s),
    });
    await UI.editCard(refOf(ctx), c, (f) => [...list.map((t) => [btn(f, `${t} \u00B7 ${rp(priceOf(s, t).price)}`, `s:${mode === "up" ? "ut" : "bt"}:${CODEOF[t]}`, PK.TIERS[t] ? PK.TIERS[t].style : "success", PK.TIERS[t] ? PK.TIERS[t].icon : UI.E.crown)]), [btn(f, "Kembali", "s:h", "primary", UI.E.wave)]]);
  }
  b.callbackQuery("s:b", (ctx) => menu(ctx, "buy"));
  b.callbackQuery("s:u", (ctx) => menu(ctx, "up"));

  // ---- pilih role -> kirim QRIS
  b.callbackQuery(/^s:(bt|ut):([LGPR])$/, async (ctx) => {
    const mode = ctx.match[1] === "ut" ? "up" : "buy";
    const tier = CODE[ctx.match[2]];
    const uid = String(ctx.from.id);
    const err = gate(uid, mode);
    if (err) return alert(ctx, err);
    if (!eligible(uid, mode).includes(tier)) return alert(ctx, "Role ini tidak tersedia untuk Anda.");
    if (openOrder(ownerId, uid)) return alert(ctx, "Anda masih punya pesanan yang belum selesai.");
    const s = S();
    if (!fs.existsSync(qrisPath(ownerId))) return alert(ctx, "QRIS store belum tersedia. Hubungi CS.");
    const p = priceOf(s, tier);
    await ctx.answerCallbackQuery({ text: "Membuat pesanan..." });
    data.counter += 1;
    const o = { no: data.counter, storeId: ownerId, buyerId: uid, buyerName: fullName(ctx.from), buyerUsername: ctx.from.username || null, tier, mode, price: p.price, days: p.days, status: "wait_proof", createdAt: Date.now() };
    data.orders[String(o.no)] = o;
    save();
    const caption =
      `<b>PEMBAYARAN ${esc(mode === "up" ? "UP ROLE" : "BELI ROLE")} ${esc(tier)}</b>\n` +
      `Invoice: <code>${inv(o.no)}</code>\nTotal bayar: <b>${rp(o.price)}</b>\n\n` +
      `1) Scan QRIS ini dan bayar <b>tepat ${rp(o.price)}</b>\n2) Kirim <b>foto bukti transfer</b> ke chat ini\n3) Tunggu pemilik store menyetujui (ACC)`;
    try {
      await ctx.api.sendPhoto(ctx.chat.id, new InputFile(qrisPath(ownerId)), {
        caption, parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "Batal", callback_data: `s:x:${o.no}` }]] },
      });
    } catch (e) {
      delete data.orders[String(o.no)]; save();
      console.error(`[store ${ownerId}] kirim QRIS gagal:`, e.message);
      return alert(ctx, "Gagal mengirim QRIS. Coba lagi atau hubungi CS.");
    }
    await ctx.api.deleteMessage(ctx.chat.id, ctx.callbackQuery.message.message_id).catch(() => {});
  });

  // ---- batal
  b.callbackQuery(/^s:x:(\d+)$/, async (ctx) => {
    const o = orderOf(ctx.match[1]);
    if (!o || o.storeId !== ownerId || o.buyerId !== String(ctx.from.id)) return alert(ctx, "Pesanan tidak ditemukan.");
    if (o.status !== "wait_proof") return alert(ctx, "Pesanan ini sudah tidak bisa dibatalkan.");
    o.status = "cancelled"; save();
    await ctx.answerCallbackQuery({ text: "Pesanan dibatalkan." });
    await ctx.api.deleteMessage(ctx.chat.id, ctx.callbackQuery.message.message_id).catch(() => {});
    await sendHome(ctx.chat.id, ctx.from);
  });

  // ---- bukti transfer (foto / dokumen gambar)
  async function onProof(ctx, fileId) {
    const uid = String(ctx.from.id);
    const o = openOrder(ownerId, uid);
    if (!o) return UI.sendCard(ctx.chat.id, UI.card({ title: "Tidak Ada Pesanan", icon: "info", rows: [["info", "Info", "Pilih <b>BELI ROLE</b> / <b>UP ROLE</b> dulu, baru kirim bukti transfer."]], footer: foot(S()) }), homeKb(S(), uid));
    if (o.status === "pending") return UI.sendCard(ctx.chat.id, UI.card({ title: "Menunggu Konfirmasi", icon: "time", rows: [["tag", "Invoice", `<code>${inv(o.no)}</code>`]], note: "Bukti Anda sudah dikirim. Mohon tunggu pemilik store.", footer: foot(S()) }));
    const s = S();
    const cap =
      `<b>BUKTI TRANSFER MASUK</b>\nInvoice: <code>${inv(o.no)}</code>\nRole: <b>${esc(o.tier)}</b> (${o.mode === "up" ? "Up Role" : "Beli Role"})\nHarga: <b>${rp(o.price)}</b>\n` +
      `Pembeli: ${esc(o.buyerName)}${o.buyerUsername ? " @" + esc(o.buyerUsername) : ""} (<code>${esc(o.buyerId)}</code>)`;
    try {
      await ctx.api.sendPhoto(ownerId, fileId, { caption: cap, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "\u2705 ACC", callback_data: `s:a:${o.no}` }, { text: "\u274C TOLAK", callback_data: `s:r:${o.no}` }]] } });
    } catch (e) {
      console.error(`[store ${ownerId}] kirim bukti ke pemilik gagal:`, e.message);
      return UI.sendCard(ctx.chat.id, UI.card({ title: "Gagal Mengirim Bukti", icon: "no", rows: [["info", "Sebab", "Pemilik store belum bisa dihubungi bot."]], note: `Hubungi CS: @${esc(s.cs)}`, footer: foot(s) }));
    }
    o.status = "pending"; o.proofFileId = fileId; o.submittedAt = Date.now(); save();
    await UI.sendCard(ctx.chat.id, UI.card({
      title: "Bukti Terkirim", icon: "ok",
      rows: [["tag", "Invoice", `<code>${inv(o.no)}</code>`], ["crown", "Role", `<b>${esc(o.tier)}</b>`], ["chart", "Harga", `<b>${rp(o.price)}</b>`], ["time", "Status", "<b>MENUNGGU KONFIRMASI</b>"]],
      checks: [[true, "Bukti transfer diterima"], [false, "Pemilik store akan ACC / TOLAK"]],
      note: `Butuh bantuan? Hubungi CS <a href="${esc(csUrl(s))}">@${esc(s.cs)}</a>`, footer: foot(s),
    }));
  }
  b.on("message:photo", async (ctx) => {
    if (!priv(ctx)) return;
    const fid = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    if (isOwnerChat(ctx) && bannerState.has(ownerId)) { // foto dari pemilik saat Set Banner = banner (bukan bukti transfer)
      bannerState.delete(ownerId);
      const s = S(); s.banner = fid; save();
      return UI.sendCard(ctx.chat.id, UI.card({ title: "Banner Disimpan", icon: "ok", rows: [["pin", "Status", "<b>TERPASANG</b>"]], note: "Kirim /start untuk melihat hasilnya.", footer: foot(s) }), panelKb(s));
    }
    await onProof(ctx, fid);
  });
  b.on("message:document", async (ctx) => { if (priv(ctx) && /^image\//.test(ctx.message.document.mime_type || "")) await onProof(ctx, ctx.message.document.file_id); });

  // ---- ACC / TOLAK (hanya pemilik store)
  const mark = (ctx, text) => ctx.editMessageCaption({ caption: `${ctx.callbackQuery.message.caption || ""}\n\n${text}`, reply_markup: { inline_keyboard: [] } }).catch(() => {});
  b.callbackQuery(/^s:([ar]):(\d+)$/, async (ctx) => {
    if (!isOwnerChat(ctx)) return alert(ctx, "Hanya pemilik store.");
    const o = orderOf(ctx.match[2]);
    const s = S();
    if (!o || o.storeId !== ownerId) return alert(ctx, "Pesanan tidak ditemukan.");
    if (o.status !== "pending") return alert(ctx, "Pesanan ini sudah diputuskan.");
    if (ctx.match[1] === "r") {
      o.status = "rejected"; o.decidedAt = Date.now(); save();
      await ctx.answerCallbackQuery({ text: "Ditolak." });
      await mark(ctx, "\u274C DITOLAK");
      return UI.sendCard(o.buyerId, UI.card({ title: "Pembayaran Ditolak", icon: "no", rows: [["tag", "Invoice", `<code>${inv(o.no)}</code>`], ["crown", "Role", `<b>${esc(o.tier)}</b>`]], note: `Bukti transfer tidak disetujui. Hubungi CS <a href="${esc(csUrl(s))}">@${esc(s.cs)}</a> atau coba pesan lagi.`, footer: foot(s) }), (f) => [[btn(f, "Menu Store", "s:h", "primary", UI.E.wave)]]).catch(() => {});
    }
    // ACC: role harus masih boleh dijual oleh pemilik store ini
    if (!sellable(ownerId).includes(o.tier)) return alert(ctx, `Anda tidak lagi boleh menjual role ${o.tier}.`);
    o.status = "acc"; o.decidedAt = Date.now(); save(); // tandai dulu supaya tidak dobel
    await ctx.answerCallbackQuery({ text: "Disetujui, mengaktifkan role..." });
    try { await activate(o, s); } catch (e) { console.error(`[store ${ownerId}] aktivasi gagal:`, e.message); o.status = "pending"; save(); return alert(ctx, "Gagal mengaktifkan role: " + e.message.slice(0, 100)); }
    await mark(ctx, "\u2705 DISETUJUI \u2014 role aktif");
    const expiry = require("./expiry");
    const rec = db.getUser(o.buyerId) || {};
    runAs(null, () => require("./notify").fire(o.mode === "up" ? "uprole" : "role", { id: o.buyerId, name: o.buyerName, username: o.buyerUsername }, [["Invoice", `<code>${inv(o.no)}</code>`], ["Role", `<b>${esc(o.tier)}</b>`], ["Dibayar", `<b>${rp(o.price)}</b>`], ["Store", `<b>${esc(s.name)}</b> (<code>${esc(ownerId)}</code>)`], ["Metode", "QRIS manual store"]]));
    const un = mainBot();
    await UI.sendCard(o.buyerId, UI.card({
      title: `${o.mode === "up" ? "Up Role" : "Beli Role"} Berhasil`, icon: "ok",
      rows: [["tag", "Invoice", `<code>${inv(o.no)}</code>`], ["crown", "Role", `<b>${esc(o.tier)}</b>`], ...(o.tier === "RESELLER" ? [] : [["time", "Expired", `<b>${esc(expiry.label(o.buyerId))}</b>`]]), ["chart", "Dibayar", `<b>${rp(o.price)}</b>`]],
      checks: [[true, "Pembayaran disetujui"], [true, "Role aktif"], [!!rec.session, rec.session ? "Userbot siap dipakai" : un ? `Buka @${esc(un)} lalu tekan <b>Buat Ubot</b>` : "Buka bot utama lalu tekan <b>Buat Ubot</b>"]],
      footer: foot(s),
    }), (f) => (un ? [[{ text: "Buka Bot Utama", url: `https://t.me/${un}` }]] : [[btn(f, "Menu Store", "s:h", "primary", UI.E.wave)]])).catch(() => {});
  });

  // ---- panel pemilik: pesanan pending + set harga
  const pricesCard = (s) => UI.card({
    title: "Panel Store", icon: "gear", headers: ["Role", "Harga"],
    rows: sellable(ownerId).map((t) => { const p = priceOf(s, t); return [t === "RESELLER" ? "user" : "gem", t, p.price > 0 ? `<b>${rp(p.price)}</b>${t === "RESELLER" ? " \u00B7 permanen" : ` \u00B7 ${p.days} hari`}` : "<i>tidak dijual</i>"]; }),
    sub: `Store: <b>${esc(s.name)}</b> \u00B7 CS @${esc(s.cs)}`,
    checks: [[true, "Pilih role lalu kirim harga (boleh diikuti hari)"], [false, "Harga 0 = role tidak dijual"]],
    note: "Cepat: <code>/setharga GOLD 15000 30</code> \u00B7 role TANGAN KANAN tidak bisa dijual di store.", footer: foot(s),
  });
  const panelKb = (s) => (f) => [
    ...sellable(ownerId).map((t) => [btn(f, `Set Harga ${t}`, `s:sp:${CODEOF[t]}`, "primary")]),
    [btn(f, "Pesanan Pending", "s:q", "success", UI.E.box)],
    pair(btn(f, "Set Banner", "s:bn", "primary", UI.E.pin), btn(f, "Hapus Banner", "s:bnd", "danger")),
    [btn(f, "Kembali", "s:h", "plain", UI.E.wave)],
  ];
  const priceState = new Map();
  const bannerState = new Set(); // pemilik store sedang diminta mengirim foto banner
  b.callbackQuery("s:bn", async (ctx) => {
    if (!isOwnerChat(ctx)) return alert(ctx, "Hanya pemilik store.");
    await ctx.answerCallbackQuery();
    bannerState.add(ownerId);
    await UI.sendCard(ctx.chat.id, UI.card({ title: "Set Banner", icon: "pin", rows: [["info", "Cara", "Kirim <b>foto</b> banner sekarang (sebagai foto, bukan file)."]], note: "Foto tampil di atas dashboard store.", footer: foot(S()) }), (f) => [[btn(f, "Batal", "s:p", "danger")]]);
  });
  b.callbackQuery("s:bnd", async (ctx) => {
    if (!isOwnerChat(ctx)) return alert(ctx, "Hanya pemilik store.");
    const s = S(); delete s.banner; save();
    await ctx.answerCallbackQuery({ text: "Banner dihapus." });
  });
  b.callbackQuery("s:p", async (ctx) => {
    if (!isOwnerChat(ctx)) return alert(ctx, "Hanya pemilik store.");
    await ctx.answerCallbackQuery();
    priceState.delete(ownerId);
    const s = S();
    await UI.editCard(refOf(ctx), pricesCard(s), panelKb(s));
  });
  b.callbackQuery(/^s:sp:([LGPR])$/, async (ctx) => {
    if (!isOwnerChat(ctx)) return alert(ctx, "Hanya pemilik store.");
    const t = CODE[ctx.match[1]];
    if (!sellable(ownerId).includes(t)) return alert(ctx, "Role ini tidak bisa Anda jual.");
    priceState.set(ownerId, t);
    await ctx.answerCallbackQuery();
    await UI.sendCard(ctx.chat.id, UI.card({ title: `Set Harga ${t}`, icon: "chart", rows: [["info", "Kirim", t === "RESELLER" ? "<code>15000</code> (harga, permanen)" : "<code>15000</code> atau <code>15000 30</code> (harga dan hari)"], ["info", "0", "role tidak dijual"]], footer: foot(S()) }), (f) => [[btn(f, "Batal", "s:p", "danger")]]);
  });
  const applyPrice = (tier, priceStr, daysStr) => {
    const price = Number(String(priceStr).replace(/[.,]/g, ""));
    if (!Number.isFinite(price) || price < 0 || price > 100000000) return null;
    const s = S();
    s.prices = { ...(s.prices || defaultPrices()) };
    const cur = priceOf(s, tier);
    s.prices[tier] = { price: Math.round(price), days: tier === "RESELLER" ? 0 : (daysStr && /^\d{1,4}$/.test(daysStr) ? Math.max(1, Number(daysStr)) : cur.days) };
    save();
    return s.prices[tier];
  };
  b.command("setharga", async (ctx) => {
    if (!priv(ctx) || !isOwnerChat(ctx)) return;
    const [r, p, d] = String(ctx.match || "").trim().split(/\s+/);
    const tier = PK.normalize(r) || (/^(reseller|rsl)$/i.test(r || "") ? "RESELLER" : null);
    if (!tier || !sellable(ownerId).includes(tier) || p === undefined || !applyPrice(tier, p, d)) {
      return ctx.reply(`Cara: /setharga <role> <harga> [hari]\nRole: ${sellable(ownerId).join(", ")}\nContoh: /setharga GOLD 15000 30`);
    }
    await UI.sendCard(ctx.chat.id, pricesCard(S()), panelKb(S()));
  });
  b.on("message:text", async (ctx, next) => {
    if (!priv(ctx) || !isOwnerChat(ctx) || !priceState.has(ownerId)) return next();
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return next();
    const tier = priceState.get(ownerId);
    const [p, d] = text.split(/\s+/);
    if (!applyPrice(tier, p, d)) return ctx.reply("Format salah. Contoh: 15000 atau 15000 30");
    priceState.delete(ownerId);
    await UI.sendCard(ctx.chat.id, pricesCard(S()), panelKb(S()));
  });

  async function sendProof(ctx, o) {
    return ctx.api.sendPhoto(ctx.chat.id, o.proofFileId, {
      caption: `<b>PESANAN ${inv(o.no)}</b>\nRole: <b>${esc(o.tier)}</b> (${o.mode === "up" ? "Up Role" : "Beli Role"}) \u00B7 ${rp(o.price)}\nPembeli: ${esc(o.buyerName)}${o.buyerUsername ? " @" + esc(o.buyerUsername) : ""} (<code>${esc(o.buyerId)}</code>)`,
      parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "\u2705 ACC", callback_data: `s:a:${o.no}` }, { text: "\u274C TOLAK", callback_data: `s:r:${o.no}` }]] },
    });
  }
  b.callbackQuery("s:q", async (ctx) => {
    if (!isOwnerChat(ctx)) return alert(ctx, "Hanya pemilik store.");
    await ctx.answerCallbackQuery();
    const list = Object.values(data.orders).filter((o) => o.storeId === ownerId && o.status === "pending").sort((a, c) => a.no - c.no).slice(0, 10);
    const s = S();
    if (!list.length) return UI.sendCard(ctx.chat.id, UI.card({ title: "Pesanan Pending", icon: "box", rows: [["ok", "Status", "Tidak ada pesanan menunggu."]], footer: foot(s) }));
    for (const o of list) await sendProof(ctx, o).catch(() => {});
  });

  b.start({ drop_pending_updates: false, onStart: (me) => console.log(`[store] @${me.username} (${store.name}) berjalan, pemilik ${ownerId}`) })
    .catch((err) => {
      console.error(`[store ${ownerId}] berhenti: ${err.message}`);
      bots.delete(ownerId);
      if (/401|Unauthorized|404/i.test(err.message)) { const s = getStore(ownerId); if (s) { s.invalid = true; save(); } }
    });
}

async function stopStore(ownerId) {
  const b = bots.get(String(ownerId));
  bots.delete(String(ownerId));
  if (b) { try { await b.stop(); } catch (_) {} }
}

// ---------------------------------------------------------------- wizard di bot utama
const wiz = new Map(); // userId -> { step, ... }
const canMake = (id) => access.isReseller(id) && !access.isOwner(id);
const STEPS = {
  token: ["Langkah 1/4 \u2014 Token Bot", "Buat bot di @BotFather (/newbot), lalu kirim <b>token bot</b> ke sini.\nContoh: <code>123456789:AAxxxxxxxx</code>"],
  qris: ["Langkah 2/4 \u2014 QRIS Store", "Kirim <b>foto QRIS</b> Anda. QRIS ini dipakai pembeli untuk membayar role di bot store Anda."],
  name: ["Langkah 3/4 \u2014 Nama Store", "Kirim <b>nama store</b> Anda. Contoh: <code>ARTA STORE</code>"],
  cs: ["Langkah 4/4 \u2014 CS Store", "Kirim <b>username Telegram</b> untuk CS store. Contoh: <code>@csartapedia</code>"],
};
const cancelKb = (f) => [[btn(f, "Batal", "stm:x", "danger")]];
const stepCard = (k) => UI.card({ title: STEPS[k][0], icon: "gear", rows: [["info", "Cara", STEPS[k][1]]], note: "Ketik <code>batal</code> untuk membatalkan." });

function infoCard(s) {
  const act = bots.has(String(s.ownerId));
  return UI.card({
    title: "Store Ubot Anda", icon: "crown",
    rows: [
      ["tag", "Nama", `<b>${esc(s.name)}</b>`], ["user", "CS", `@${esc(s.cs)}`], ["robot", "Bot", `<a href="https://t.me/${esc(s.botUsername)}">@${esc(s.botUsername)}</a>`],
      ["gem", "Role dijual", `<b>${esc(sellable(s.ownerId).join(", "))}</b>`], [act ? "green" : "no", "Status", act ? "<b>AKTIF</b>" : "<b>TIDAK AKTIF</b>"],
    ],
    checks: [[true, "Pembeli bayar manual ke QRIS Anda, kirim bukti transfer"], [false, `Buka @${esc(s.botUsername)} \u2192 /start untuk set harga & menerima bukti`]],
    note: "Atur harga di bot store: <b>PANEL STORE</b> \u2192 Set Harga.",
  });
}

async function downloadPhoto(ctx, fileId, dest) {
  const f = await ctx.api.getFile(fileId);
  if (!f.file_path) throw new Error("file tidak ditemukan");
  const res = await fetch(`https://api.telegram.org/file/bot${cfg.bot_token}/${f.file_path}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error("HTTP " + res.status);
  fs.mkdirSync(QDIR, { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function checkToken(token) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(15000) });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description || "token ditolak Telegram");
  return j.result;
}

function register(bot) {
  const chatOf = (ctx) => (ctx.callbackQuery && ctx.callbackQuery.message ? ctx.callbackQuery.message.chat.id : ctx.from.id);

  bot.callbackQuery("stm:m", async (ctx) => {
    if (!canMake(ctx.from.id)) return ctx.answerCallbackQuery({ text: "Khusus RESELLER / TANGAN KANAN.", show_alert: true });
    await ctx.answerCallbackQuery();
    const chat = chatOf(ctx);
    const s = getStore(ctx.from.id);
    if (s) return UI.sendCard(chat, infoCard(s), (f) => [[btn(f, "Hapus Store", "stm:d", "danger")], [btn(f, "Kembali", "sr:h", "primary", UI.E.wave)]]);
    wiz.set(String(ctx.from.id), { step: "token" });
    return UI.sendCard(chat, stepCard("token"), cancelKb);
  });
  bot.callbackQuery("stm:x", async (ctx) => {
    wiz.delete(String(ctx.from.id));
    await ctx.answerCallbackQuery({ text: "Dibatalkan." });
    await UI.sendCard(chatOf(ctx), UI.card({ title: "Dibatalkan", icon: "no", rows: [["info", "Info", "Pembuatan store dibatalkan."]] }), (f) => [[btn(f, "Kembali", "sr:h", "primary", UI.E.wave)]]);
  });
  bot.callbackQuery("stm:d", async (ctx) => {
    if (!getStore(ctx.from.id)) return ctx.answerCallbackQuery({ text: "Store tidak ditemukan.", show_alert: true });
    await ctx.answerCallbackQuery();
    await UI.sendCard(chatOf(ctx), UI.card({ title: "Hapus Store?", icon: "fire", rows: [["info", "Info", "Bot store akan dimatikan. Pesanan yang masih pending tidak bisa diproses lagi."]] }), (f) => [[btn(f, "Ya, Hapus", "stm:dd", "danger"), btn(f, "Batal", "sr:h", "primary")]]);
  });
  bot.callbackQuery("stm:dd", async (ctx) => {
    const s = getStore(ctx.from.id);
    if (!s) return ctx.answerCallbackQuery({ text: "Store tidak ditemukan.", show_alert: true });
    await stopStore(s.ownerId);
    delete data.stores[String(s.ownerId)];
    for (const o of Object.values(data.orders)) if (o.storeId === String(s.ownerId) && (o.status === "pending" || o.status === "wait_proof")) o.status = "cancelled";
    save();
    try { fs.unlinkSync(qrisPath(s.ownerId)); } catch (_) {}
    await ctx.answerCallbackQuery({ text: "Store dihapus." });
    await UI.sendCard(chatOf(ctx), UI.card({ title: "Store Dihapus", icon: "ok", rows: [["ok", "Status", "Store dan bot store dimatikan."]] }), (f) => [[btn(f, "Kembali", "sr:h", "primary", UI.E.wave)]]);
  });

  // jawaban wizard (harus didaftarkan SEBELUM Live Chat yang menangkap semua pesan pribadi)
  bot.on("message", async (ctx, next) => {
    const uid = String(ctx.from && ctx.from.id);
    const st = wiz.get(uid);
    if (!st || !ctx.chat || ctx.chat.type !== "private") return next();
    if (!canMake(uid)) { wiz.delete(uid); return next(); }
    const text = String(ctx.message.text || "").trim();
    if (/^\/\w+/.test(text)) return next();
    const chat = ctx.chat.id;
    const again = (title, why) => UI.sendCard(chat, UI.card({ title, icon: "no", rows: [["no", "Sebab", esc(why)]] }), cancelKb);
    if (/^batal$/i.test(text)) { wiz.delete(uid); return UI.sendCard(chat, UI.card({ title: "Dibatalkan", icon: "no", rows: [["info", "Info", "Pembuatan store dibatalkan."]] }), (f) => [[btn(f, "Kembali", "sr:h", "primary", UI.E.wave)]]); }

    if (st.step === "token") {
      if (!/^\d{6,12}:[\w-]{30,}$/.test(text)) return again("Token Tidak Valid", "Format token salah. Salin utuh dari @BotFather.");
      ctx.deleteMessage().catch(() => {}); // hapus pesan berisi token dari chat
      if (text === String(cfg.bot_token)) return again("Token Ditolak", "Itu token bot utama. Buat bot baru di @BotFather.");
      if (Object.values(data.stores).some((s) => s.token === text)) return again("Token Ditolak", "Token ini sudah dipakai store lain.");
      let me;
      try { me = await checkToken(text); } catch (e) { return again("Token Ditolak", e.message); }
      st.token = text; st.botId = me.id; st.botUsername = me.username; st.step = "qris";
      return UI.sendCard(chat, UI.card({ title: "Token Diterima", icon: "ok", rows: [["robot", "Bot", `@${esc(me.username)}`]] })).then(() => UI.sendCard(chat, stepCard("qris"), cancelKb));
    }
    if (st.step === "qris") {
      const fileId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : ctx.message.document && /^image\//.test(ctx.message.document.mime_type || "") ? ctx.message.document.file_id : null;
      if (!fileId) return again("Bukan Gambar", "Kirim QRIS sebagai foto.");
      try { await downloadPhoto(ctx, fileId, qrisPath(uid)); } catch (e) { return again("Gagal Menyimpan QRIS", e.message); }
      st.step = "name";
      return UI.sendCard(chat, stepCard("name"), cancelKb);
    }
    if (st.step === "name") {
      if (text.length < 2 || text.length > 40) return again("Nama Tidak Valid", "Nama store 2-40 karakter.");
      st.name = text; st.step = "cs";
      return UI.sendCard(chat, stepCard("cs"), cancelKb);
    }
    if (st.step === "cs") {
      const un = text.replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "").trim();
      if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(un)) return again("Username Tidak Valid", "Username Telegram 5-32 karakter (huruf, angka, _).");
      wiz.delete(uid);
      const store = { ownerId: uid, token: st.token, botId: st.botId, botUsername: st.botUsername, name: st.name, cs: un, prices: defaultPrices(), createdAt: Date.now() };
      data.stores[uid] = store;
      save();
      startStore(store);
      runAs(null, () => require("./notify").fire("store", { id: uid, ...(db.getUser(uid) || {}), first_name: (db.getUser(uid) || {}).name }, [["Store", `<b>${esc(store.name)}</b>`], ["Bot", `@${esc(store.botUsername)}`], ["CS", `@${esc(store.cs)}`]]));
      return UI.sendCard(chat, UI.card({
        title: "Store Ubot Dibuat", icon: "ok",
        rows: [["tag", "Nama", `<b>${esc(store.name)}</b>`], ["robot", "Bot", `<a href="https://t.me/${esc(store.botUsername)}">@${esc(store.botUsername)}</a>`], ["user", "CS", `@${esc(store.cs)}`], ["gem", "Role dijual", `<b>${esc(sellable(uid).join(", "))}</b>`]],
        checks: [[true, "Bot store aktif"], [false, `Buka @${esc(store.botUsername)} dan tekan <b>/start</b> (wajib, supaya bukti transfer pembeli sampai ke Anda)`], [false, "Atur harga: PANEL STORE \u2192 Set Harga"]],
        note: "Role TANGAN KANAN tidak dijual di store. Harga awal = harga bot utama.",
      }), (f) => [[{ text: "Buka Bot Store", url: `https://t.me/${store.botUsername}` }], [btn(f, "Kembali", "sr:h", "primary", UI.E.wave)]]);
    }
    return next();
  });
}

function startAll() {
  let n = 0;
  for (const s of Object.values(data.stores)) { if (!s.invalid) { startStore(s); n++; } }
  if (n) console.log(`[store] ${n} bot store dihidupkan`);
}

module.exports = { register, startAll };

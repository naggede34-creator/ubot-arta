// Pembelian paket automatik: pelanggan pilih LITE / GOLD / PLATINUM -> pilih DANA atau QRIS -> hantar bukti bayaran
// -> owner/reseller tekan ACCEPT atau REJECT di group persetujuan -> paket + hari aktif diaktifkan automatik.
// Owner melaras harga / kaedah bayaran melalui /payset (butang) atau arahan /setharga /setdana /setqris /pay.
// Semua kad ialah Rich Message (jadual) + emoji premium; jika Rich ditolak Telegram -> teks biasa.
const db = require("./db");
const access = require("./access");
const PK = require("./paket");
const expiry = require("./expiry");
const { cfg, tg, esc, em, btn, send, sendRich, fmtTime, TZL } = require("./core");

// ID emoji premium (semuanya sudah digunakan dalam projek ini)
const E = {
  crown: "6273839444311149115", gem: "6276228098962754124", star: "5852636219250317264", user: "5258362837411045098",
  tag: "5296348778012361146", link: "5271604874419647061", gear: "5368589393491669392", ok: "5317020017521359483",
  no: "5316999925664347033", time: "5352940967911517739", chart: "5231200819986047254", box: "5258134813302332906",
  bolt: "5456140674028019486", fire: "5424972470023104089", rocket: "5195033767969839232", wave: "5402498632739996967",
  green: "5416081784641168838", check: "6005561111099740638", rex: "6235524376070984680", f1: "6244617272808183303", f2: "6242011198322119983",
};
const FB = { crown: "\uD83D\uDC51", gem: "\uD83D\uDC8E", star: "\u2B50", user: "\uD83D\uDC64", tag: "\uD83C\uDFF7", link: "\uD83D\uDD17", gear: "\u2699\uFE0F", ok: "\u2705", no: "\u274C", time: "\u23F3", chart: "\uD83D\uDCCA", box: "\uD83D\uDCE6", bolt: "\u26A1", fire: "\uD83D\uDD25", rocket: "\uD83D\uDE80", wave: "\uD83D\uDC4B", green: "\uD83D\uDFE2", check: "\u2611\uFE0F", rex: "\uD83E\uDD96", f1: "\uD83E\uDEB6", f2: "\uD83E\uDEB6" };
const ico = (k, fb) => em(E[k], fb || FB[k] || "\u2B50");
const BRAND = () => esc(cfg.brand || "UBOT ARTA PEDIA");
const FOOT = () => `<footer>${ico("f1", "\uD83E\uDEB6")} ${ico("rex", "\uD83E\uDD96")} ${BRAND()} ${ico("f2", "\uD83E\uDEB6")}</footer>`;

// ---------------------------------------------------------------- tetapan (disimpan dalam data/db.json -> settings.pay)
const DEF_PRICES = { LITE: { price: 10000, days: 30 }, GOLD: { price: 25000, days: 30 }, PLATINUM: { price: 50000, days: 30 } };
function conf() {
  const s = db.getSetting("pay") || {};
  const m = s.methods || {};
  return {
    enabled: s.enabled !== false,
    methods: { dana: m.dana !== false, qris: m.qris !== false },
    dana: { number: "", name: "", ...(s.dana || {}) },
    qris: { file_id: "", ...(s.qris || {}) },
    prices: Object.fromEntries(PK.ORDER.map((t) => [t, { ...DEF_PRICES[t], ...((s.prices || {})[t] || {}) }])),
  };
}
function update(fn) {
  const c = conf();
  fn(c);
  db.setSetting("pay", c);
  return c;
}
const danaOn = (c) => c.methods.dana && !!c.dana.number;
const qrisOn = (c) => c.methods.qris && !!c.qris.file_id;
const methodsOf = (c) => [...(danaOn(c) ? ["dana"] : []), ...(qrisOn(c) ? ["qris"] : [])];
const MNAME = { dana: "DANA", qris: "QRIS" };

const rp = (n) => "Rp " + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const inv = (no) => "INV-" + String(no).padStart(4, "0");
const TCODE = { L: "LITE", G: "GOLD", P: "PLATINUM" };
const CODEOF = { LITE: "L", GOLD: "G", PLATINUM: "P" };
const fullName = (u) => [u.first_name, u.last_name].filter(Boolean).join(" ") || "-";
const whoTag = (username, name) => (username ? `<a href="https://t.me/${esc(username)}">@${esc(username)}</a>` : esc(name || "-"));

// "25000" | "25.000" | "25k" | "Rp25.000" -> 25000
function parsePrice(raw) {
  let s = String(raw || "").toLowerCase().replace(/rp\.?/g, "").replace(/\s/g, "");
  let mult = 1;
  if (/(k|rb|ribu)$/.test(s)) {
    mult = 1000;
    s = s.replace(/(k|rb|ribu)$/, "");
  }
  s = /^\d{1,3}([.,]\d{3})+$/.test(s) ? s.replace(/[.,]/g, "") : s.replace(",", ".");
  const n = Number(s) * mult;
  return Number.isFinite(n) && n >= 1000 && n <= 100000000 ? Math.round(n) : null;
}

// ---------------------------------------------------------------- pesanan
const OPEN = ["unpaid", "awaiting_proof"];
const ordersOf = (uid) => db.orders().filter((o) => String(o.userId) === String(uid));
const openOrder = (uid, status) => ordersOf(uid).filter((o) => (status ? o.status === status : OPEN.includes(o.status))).sort((a, b) => b.no - a.no)[0] || null;
const reviewOrder = (uid) => ordersOf(uid).find((o) => o.status === "review") || null;

function createOrder(u, tier) {
  const p = conf().prices[tier];
  for (const o of ordersOf(u.id)) if (OPEN.includes(o.status)) db.setOrder(o.no, { ...o, status: "cancelled" });
  const no = db.nextReqNo();
  return db.setOrder(no, {
    no, userId: String(u.id), name: fullName(u), username: u.username || null,
    paket: tier, days: p.days, price: p.price, method: null, status: "unpaid", createdAt: Date.now(), cards: [],
  });
}

// ---------------------------------------------------------------- pembina kad
const table = (rows, headers = ["Info", "Nilai"]) =>
  `<table bordered><tr><th>${esc(headers[0])}</th><th>${esc(headers[1])}</th></tr>${rows.map(([k, l, v]) => `<tr><td>${ico(k)} ${l}</td><td>${v}</td></tr>`).join("")}</table>`;
const plainRows = (rows) => rows.map(([k, l, v]) => `${ico(k)} ${l} : <b>${v}</b>`).join("\n");
const card = (title, iconKey, fb, rows, { sub = "", note = "", extra = "", headers } = {}) => ({
  html:
    `<h3>${ico(iconKey, fb)} ${esc(title)}</h3>` + (sub ? `<p>${sub}</p>` : "") + (rows.length ? table(rows, headers) : "") + extra +
    (note ? `<blockquote>${note}</blockquote>` : "") + FOOT(),
  text:
    `${ico(iconKey, fb)} <b>${esc(title)}</b>\n` + (sub ? `${sub}\n` : "") + (rows.length ? `\n${plainRows(rows)}\n` : "") + (note ? `\n${note}` : ""),
});
const kbOf = (rows) => (fancy) => rows(fancy);
const b = (fancy, text, data, style, icon) => btn(fancy, text, data, style, icon);

async function sendCard(chatId, c, kb) {
  try {
    return await sendRich(chatId, c.html, kb || undefined);
  } catch (err) {
    console.error("[pay] Rich gagal, guna teks biasa:", err.message);
    return send(chatId, c.text, kb || undefined);
  }
}
// Edit kad di tempat (Rich -> teks biasa -> mesej baharu)
async function editCard(ref, c, kb) {
  const markup = (fancy) => ({ inline_keyboard: kb ? kb(fancy) : [] });
  for (const fancy of [true, false]) {
    try {
      return await tg("editMessageText", { ...ref, rich_message: { html: c.html }, reply_markup: markup(fancy) });
    } catch (err) {
      if (/not modified/i.test(err.message)) return true;
    }
  }
  try {
    return await tg("editMessageText", { ...ref, text: c.text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: markup(false) });
  } catch (err) {
    if (/not modified/i.test(err.message)) return true;
    return sendCard(ref.chat_id, c, kb);
  }
}
const refOf = (ctx) => {
  const m = ctx.callbackQuery.message;
  return { chat_id: m.chat.id, message_id: m.message_id };
};

// ---- kad pelanggan ----
function tierTable(c) {
  return `<table bordered><tr><th>Paket</th><th>Harga</th><th>Aktif</th><th>Command</th></tr>${PK.ORDER.map(
    (t) => `<tr><td>${PK.badge(t)}</td><td><b>${rp(c.prices[t].price)}</b></td><td>${c.prices[t].days} hari</td><td>${PK.countForTier(t)}</td></tr>`
  ).join("")}</table>`;
}
function buyCard(uid) {
  const c = conf();
  const pend = reviewOrder(uid);
  if (pend) {
    return {
      c: card("Pembayaran Sedang Disemak", "time", "\u23F3", [["tag", "Invoice", `<code>${inv(pend.no)}</code>`], ["gem", "Paket", PK.badge(pend.paket)], ["chart", "Jumlah", `<b>${rp(pend.price)}</b>`]], {
        note: "Bukti bayaran anda sedang disemak owner/reseller. Anda akan dimaklumkan di sini sebaik sahaja diputuskan.",
      }),
      kb: null,
    };
  }
  if (!c.enabled || !methodsOf(c).length) {
    return {
      c: card("Pembelian Ditutup", "fire", "\uD83D\uDD25", [], {
        note: c.enabled ? "Kaedah bayaran belum disediakan. Sila hubungi owner/reseller untuk membeli paket." : "Pembelian automatik sedang ditutup. Sila hubungi owner/reseller.",
      }),
      kb: null,
    };
  }
  const methods = methodsOf(c).map((m) => MNAME[m]).join(" / ");
  const rec = db.getUser(uid) || {};
  const entitled = access.isOwner(uid) || rec.status === "approved";
  const out = card("Beli Paket Userbot", "crown", "\uD83D\uDC51", [], {
    sub: `Bayar guna <b>${esc(methods)}</b>, hantar bukti, dan paket aktif sebaik sahaja disahkan.` + (entitled ? ` Paket semasa: ${PK.badge(PK.tierOf(uid))} \u00B7 tamat <b>${esc(expiry.label(uid))}</b> (hari baharu <b>ditambah</b> pada baki).` : ""),
    extra: tierTable(c) + `<details><summary>${ico("gem", "\uD83D\uDC8E")} Perbandingan Paket</summary>${PK.compareTable(null).html}</details>`,
    note: `${ico("fire", "\uD83D\uDD25")} Pilih paket di bawah untuk bermula.`,
  });
  const kb = kbOf((fancy) => [
    ...PK.ORDER.map((t) => [b(fancy, `${t} \u00B7 ${rp(c.prices[t].price)} / ${c.prices[t].days} hari`, `bt:${CODEOF[t]}`, PK.TIERS[t].style, PK.TIERS[t].icon)]),
  ]);
  return { c: out, kb };
}

const orderRows = (o, extra = []) => [
  ["tag", "Invoice", `<code>${inv(o.no)}</code>`],
  ["gem", "Paket", PK.badge(o.paket)],
  ["time", "Aktif", `${o.days} hari`],
  ["chart", "Jumlah", `<b>${rp(o.price)}</b>`],
  ...extra,
];
const cancelRow = (fancy, o) => [b(fancy, "Batal", `bx:${o.no}`, "danger", E.no)];

function methodCard(o) {
  const c = conf();
  const ms = methodsOf(c);
  return {
    c: card("Pilih Kaedah Bayaran", "chart", "\uD83D\uDCCA", orderRows(o), { note: "Pilih DANA atau QRIS untuk melihat butiran pembayaran." }),
    kb: kbOf((fancy) => [ms.map((m) => b(fancy, MNAME[m], `bm:${o.no}:${m === "dana" ? "d" : "q"}`, "primary", m === "dana" ? E.bolt : E.link)), cancelRow(fancy, o)]),
  };
}
function payCard(o) {
  const c = conf();
  const method = o.method;
  const rows = orderRows(o, [["link", "Kaedah", `<b>${MNAME[method]}</b>`]]);
  if (method === "dana") rows.push(["user", "Nombor DANA", `<code>${esc(c.dana.number)}</code>`], ["user", "Atas nama", `<b>${esc(c.dana.name || "-")}</b>`]);
  const extra =
    `<ul><li><input type="checkbox">${method === "dana" ? "Transfer ke nombor DANA di atas" : "Scan gambar QRIS di bawah"} \u2014 jumlah tepat <b>${rp(o.price)}</b></li>` +
    `<li><input type="checkbox">Ambil screenshot bukti bayaran</li><li><input type="checkbox">Tekan <b>Saya sudah bayar</b> lalu hantar screenshot</li></ul>`;
  const kb = kbOf((fancy) => {
    const rowsKb = [[b(fancy, "Saya sudah bayar", `bp:${o.no}`, "success", E.ok)]];
    const back = methodsOf(c).length > 1 ? [b(fancy, "Tukar kaedah", `bk:${o.no}`, "primary", E.gear)] : [];
    rowsKb.push([...back, ...cancelRow(fancy, o)]);
    return rowsKb;
  });
  return { c: card("Butiran Pembayaran", "ok", "\u2705", rows, { extra, note: `Pastikan jumlah <b>tepat ${rp(o.price)}</b>. Paket akan diaktifkan selepas owner/reseller mengesahkan.` }), kb };
}
const proofPromptCard = (o) => ({
  c: card("Hantar Bukti Bayaran", "time", "\u23F3", orderRows(o, [["link", "Kaedah", MNAME[o.method]]]), { note: "Hantar <b>screenshot bukti bayaran</b> (gambar) di sini sekarang. Pastikan jumlah dan masa jelas kelihatan." }),
  kb: kbOf((fancy) => [cancelRow(fancy, o)]),
});
const waitCard = (o) => card("Menunggu Pengesahan", "time", "\u23F3", orderRows(o, [["link", "Kaedah", MNAME[o.method]]]), { note: "Bukti diterima. Owner/reseller sedang menyemak \u2014 anda akan dimaklumkan di sini." });

// ---- kad staf (ACCEPT / REJECT) ----
function reviewCard(o, decision) {
  const verdict = !decision
    ? `${ico("time", "\u23F3")} Menunggu keputusan`
    : decision.ok
    ? `${ico("ok", "\u2705")} Diterima oleh ${whoTag(decision.byUsername, decision.byName)}`
    : `${ico("no", "\u274C")} Ditolak oleh ${whoTag(decision.byUsername, decision.byName)}`;
  const rows = [
    ["tag", "Invoice", `<code>${inv(o.no)}</code>`],
    ["user", "Pembeli", whoTag(o.username, o.name)],
    ["gear", "ID Telegram", `<code>${esc(o.userId)}</code>`],
    ["gem", "Paket", PK.badge(o.paket)],
    ["time", "Aktif", `${o.days} hari`],
    ["chart", "Jumlah", `<b>${rp(o.price)}</b>`],
    ["link", "Kaedah", `<b>${MNAME[o.method] || "-"}</b>`],
    ["time", `Masa (${esc(TZL)})`, esc(fmtTime(o.proofAt || o.createdAt, true))],
    ["fire", "Keputusan", verdict],
  ];
  return card("Pembayaran Baharu", "rocket", "\uD83D\uDE80", rows, { note: decision ? "" : "Semak bukti di atas. Tekan ACCEPT untuk aktifkan paket, atau REJECT untuk menolak." });
}
const reviewKb = (no) => (fancy) => [[b(fancy, "ACCEPT", `pay:${no}:a`, "success", E.ok), b(fancy, "REJECT", `pay:${no}:r`, "danger", E.no)]];

const staffTargets = () => {
  const g = access.approvalGroup();
  if (g) return [g];
  return (Array.isArray(cfg.owner_ids) ? cfg.owner_ids : cfg.owner_id ? [cfg.owner_id] : []).map(String);
};

async function postToStaff(o, proof) {
  const cards = [];
  const caption = `${ico("tag", "\uD83C\uDFF7")} Bukti bayaran <b>${inv(o.no)}</b> \u00B7 ${esc(MNAME[o.method])} \u00B7 ${rp(o.price)}`;
  for (const chat of staffTargets()) {
    try {
      await tg(proof.type === "photo" ? "sendPhoto" : "sendDocument", { chat_id: chat, [proof.type]: proof.file_id, caption, parse_mode: "HTML" });
    } catch (err) {
      console.error(`[pay] hantar bukti ke ${chat} gagal:`, err.message);
    }
    try {
      const m = await sendCard(chat, reviewCard(o), reviewKb(o.no));
      if (m && m.message_id) cards.push({ chat_id: m.chat ? m.chat.id : chat, message_id: m.message_id });
    } catch (err) {
      console.error(`[pay] hantar kad ke ${chat} gagal:`, err.message);
    }
  }
  return cards;
}

// ---------------------------------------------------------------- aktifkan paket selepas ACCEPT
async function activate(o, who) {
  const uid = String(o.userId);
  const before = db.getUser(uid) || {};
  db.upsertUser(uid, {
    status: "approved", paket: o.paket, approvedBy: before.approvedBy || String(who.id), paketBy: String(who.id), paketAt: Date.now(), lastOrder: o.no,
    ...(!before.name ? { name: o.name } : {}), ...(!before.username && o.username ? { username: o.username } : {}),
  });
  const res = expiry.addDays(uid, o.days);
  const revived = res.active ? await expiry.revive(uid) : false;
  const rec = db.getUser(uid) || {};
  try {
    const { notifyBuyer } = require("./plugins/paket");
    await notifyBuyer(uid, o.paket, o.days, res, `${whoName(who)} (pembayaran ${inv(o.no)})`, !!rec.session);
  } catch (err) {
    console.error(`[pay] notis ke ${uid} gagal:`, err.message);
    await send(uid, `${ico("ok", "\u2705")} <b>Pembayaran ${inv(o.no)} disahkan.</b> Paket ${PK.badge(o.paket)} diaktifkan.`);
  }
  return { res, revived };
}
const whoName = (u) => (u.username ? "@" + u.username : fullName(u));

async function decide(ctx, no, accept) {
  const who = ctx.from;
  if (!access.isStaff(who.id)) return ctx.answerCallbackQuery({ text: "Hanya owner atau reseller boleh memutuskan.", show_alert: true });
  const o = db.getOrder(no);
  if (!o) return ctx.answerCallbackQuery({ text: "Pesanan tidak ditemui.", show_alert: true });
  if (o.status !== "review") return ctx.answerCallbackQuery({ text: "Pesanan ini sudah diputuskan.", show_alert: true });

  const decision = { ok: accept, byId: String(who.id), byUsername: who.username || null, byName: fullName(who), at: Date.now() };
  o.status = accept ? "approved" : "rejected"; // tukar status dahulu supaya tekanan kedua ditolak
  o.decision = decision;
  db.setOrder(no, o);
  await ctx.answerCallbackQuery({ text: accept ? "Diterima \u2705" : "Ditolak \u274C" });

  for (const ref of o.cards || []) await editCard(ref, reviewCard(o, decision), null).catch(() => {});
  if (o.chat) await editCard(o.chat, accept ? card("Pembayaran Diterima", "ok", "\u2705", orderRows(o), {}) : card("Pembayaran Ditolak", "no", "\u274C", orderRows(o), {}), null).catch(() => {});

  if (accept) {
    await activate(o, who);
  } else {
    await sendCard(
      o.userId,
      card("Pembayaran Ditolak", "no", "\u274C", orderRows(o, [["user", "Diputuskan oleh", whoTag(decision.byUsername, decision.byName)]]), {
        note: "Bukti bayaran anda tidak disahkan. Jika anda rasa ini satu kesilapan, hubungi owner/reseller bersama bukti. Anda boleh cuba semula dengan tekan <b>Beli Paket</b>.",
      }),
      kbOf((fancy) => [[b(fancy, "Beli Paket", "buy", "primary", E.crown)]])
    );
  }
}

// ---------------------------------------------------------------- panel tetapan owner
const awaiting = new Map(); // ownerId -> { kind: price|dana|qris, tier?, ref? }
function panelCard() {
  const c = conf();
  const on = (v) => (v ? `${ico("green", "\uD83D\uDFE2")} <b>ON</b>` : `${ico("no", "\u274C")} <b>OFF</b>`);
  const rows = [
    ["rocket", "Pembelian", on(c.enabled)],
    ["link", "DANA", c.dana.number ? `${on(c.methods.dana)} \u00B7 <code>${esc(c.dana.number)}</code> a/n ${esc(c.dana.name || "-")}` : `${ico("fire", "\uD83D\uDD25")} belum ditetapkan`],
    ["link", "QRIS", c.qris.file_id ? `${on(c.methods.qris)} \u00B7 gambar disimpan` : `${ico("fire", "\uD83D\uDD25")} belum ditetapkan`],
    ...PK.ORDER.map((t) => ["gem", t, `<b>${rp(c.prices[t].price)}</b> \u00B7 ${c.prices[t].days} hari`]),
  ];
  const kb = kbOf((fancy) => [
    [b(fancy, `Pembelian: ${c.enabled ? "ON" : "OFF"}`, "ps:t:pay", c.enabled ? "success" : "danger", E.rocket)],
    [b(fancy, `DANA: ${c.methods.dana ? "ON" : "OFF"}`, "ps:t:dana", c.methods.dana ? "success" : "danger", E.bolt), b(fancy, `QRIS: ${c.methods.qris ? "ON" : "OFF"}`, "ps:t:qris", c.methods.qris ? "success" : "danger", E.link)],
    PK.ORDER.map((t) => b(fancy, `Harga ${t}`, `ps:p:${CODEOF[t]}`, PK.TIERS[t].style, PK.TIERS[t].icon)),
    [b(fancy, "Set DANA", "ps:d", "primary", E.gear), b(fancy, "Set QRIS", "ps:q", "primary", E.gear)],
    [b(fancy, "Muat semula", "ps:r", "primary", E.bolt)],
  ]);
  return {
    c: card("Tetapan Pembayaran", "gear", "\u2699\uFE0F", rows, {
      note: "Ubah harga/hari dengan butang <b>Harga</b> atau <code>/setharga GOLD 30000 30</code>. DANA: <code>/setdana 08123456789 Nama</code>. QRIS: hantar gambar dengan kapsyen <code>/setqris</code>.",
    }),
    kb,
  };
}
async function showPanel(chatId) {
  const p = panelCard();
  return sendCard(chatId, p.c, p.kb);
}
async function refreshPanel(ref) {
  const p = panelCard();
  return editCard(ref, p.c, p.kb);
}
const say = (ctx, html) => ctx.reply(html, { parse_mode: "HTML", link_preview_options: { is_disabled: true } }).catch(() => {});

function applyPrice(tier, text) {
  const m = String(text).trim().match(/^(\S+)(?:\s+(\d{1,4}))?$/);
  const price = m && parsePrice(m[1]);
  if (!price) return null;
  const days = m[2] ? Number(m[2]) : null;
  if (days !== null && (days < 1 || days > 3650)) return null;
  update((c) => {
    c.prices[tier].price = price;
    if (days) c.prices[tier].days = days;
  });
  return conf().prices[tier];
}
function applyDana(text) {
  const m = String(text).trim().match(/^\+?(\d[\d\s-]{7,16}\d)\s+(.+)$/);
  if (!m) return null;
  const number = m[1].replace(/\D/g, "");
  update((c) => {
    c.dana = { number, name: m[2].trim().slice(0, 60) };
  });
  return conf().dana;
}
const photoIdOf = (msg) => (msg && msg.photo && msg.photo.length ? msg.photo[msg.photo.length - 1].file_id : null);

// ---------------------------------------------------------------- daftar pengendali bot
function register(bot) {
  const isPrivate = (ctx) => ctx.chat && ctx.chat.type === "private";

  // ----- pelanggan -----
  async function openBuy(chatId, uid) {
    const b2 = buyCard(uid);
    await sendCard(chatId, b2.c, b2.kb);
  }
  bot.command("beli", async (ctx) => {
    if (isPrivate(ctx)) await openBuy(ctx.chat.id, ctx.from.id);
  });
  bot.callbackQuery("buy", async (ctx) => {
    await ctx.answerCallbackQuery();
    const m = ctx.callbackQuery.message;
    if (m && m.chat.type === "private") await openBuy(m.chat.id, ctx.from.id);
  });

  bot.callbackQuery(/^bt:([LGP])$/, async (ctx) => {
    const tier = TCODE[ctx.match[1]];
    const c = conf();
    if (!c.enabled || !methodsOf(c).length) return ctx.answerCallbackQuery({ text: "Pembelian sedang ditutup. Hubungi owner/reseller.", show_alert: true });
    if (reviewOrder(ctx.from.id)) return ctx.answerCallbackQuery({ text: "Anda ada pembayaran yang sedang disemak. Sila tunggu keputusan.", show_alert: true });
    await ctx.answerCallbackQuery();
    const o = createOrder(ctx.from, tier);
    o.chat = refOf(ctx);
    const ms = methodsOf(c);
    if (ms.length === 1) {
      o.method = ms[0];
      db.setOrder(o.no, o);
      return showPay(ctx, o);
    }
    db.setOrder(o.no, o);
    const mc = methodCard(o);
    await editCard(o.chat, mc.c, mc.kb);
  });

  const mine = async (ctx, no) => {
    const o = db.getOrder(no);
    if (!o || String(o.userId) !== String(ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: "Pesanan tidak ditemui.", show_alert: true });
      return null;
    }
    if (!OPEN.includes(o.status)) {
      await ctx.answerCallbackQuery({ text: "Pesanan ini sudah tidak aktif. Tekan Beli Paket untuk membuat yang baharu.", show_alert: true });
      return null;
    }
    return o;
  };
  async function showPay(ctx, o) {
    const pc = payCard(o);
    o.chat = refOf(ctx);
    db.setOrder(o.no, o);
    await editCard(o.chat, pc.c, pc.kb);
    if (o.method === "qris") {
      const c = conf();
      await tg("sendPhoto", {
        chat_id: o.chat.chat_id, photo: c.qris.file_id, parse_mode: "HTML",
        caption: `${ico("link", "\uD83D\uDD17")} <b>QRIS</b> \u00B7 ${inv(o.no)}\nBayar tepat <b>${rp(o.price)}</b>`,
      }).catch((err) => console.error("[pay] hantar QRIS gagal:", err.message));
    }
  }

  bot.callbackQuery(/^bm:(\d+):([dq])$/, async (ctx) => {
    const o = await mine(ctx, ctx.match[1]);
    if (!o) return;
    const method = ctx.match[2] === "d" ? "dana" : "qris";
    if (!methodsOf(conf()).includes(method)) return ctx.answerCallbackQuery({ text: `${MNAME[method]} belum tersedia.`, show_alert: true });
    await ctx.answerCallbackQuery();
    o.method = method;
    await showPay(ctx, o);
  });
  bot.callbackQuery(/^bk:(\d+)$/, async (ctx) => {
    const o = await mine(ctx, ctx.match[1]);
    if (!o) return;
    await ctx.answerCallbackQuery();
    const mc = methodCard(o);
    await editCard(refOf(ctx), mc.c, mc.kb);
  });
  bot.callbackQuery(/^bp:(\d+)$/, async (ctx) => {
    const o = await mine(ctx, ctx.match[1]);
    if (!o) return;
    if (!o.method) return ctx.answerCallbackQuery({ text: "Pilih kaedah bayaran dahulu.", show_alert: true });
    await ctx.answerCallbackQuery();
    o.status = "awaiting_proof";
    o.chat = refOf(ctx);
    db.setOrder(o.no, o);
    const pc = proofPromptCard(o);
    await editCard(o.chat, pc.c, pc.kb);
  });
  bot.callbackQuery(/^bx:(\d+)$/, async (ctx) => {
    const o = await mine(ctx, ctx.match[1]);
    if (!o) return;
    await ctx.answerCallbackQuery({ text: "Pesanan dibatalkan." });
    o.status = "cancelled";
    db.setOrder(o.no, o);
    await editCard(refOf(ctx), card("Pesanan Dibatalkan", "no", "\u274C", orderRows(o), { note: "Tekan <b>Beli Paket</b> bila anda bersedia." }), kbOf((fancy) => [[b(fancy, "Beli Paket", "buy", "primary", E.crown)]]));
  });

  // ----- bukti bayaran (gambar) / gambar QRIS owner -----
  bot.on(["message:photo", "message:document"], async (ctx, next) => {
    if (!isPrivate(ctx)) return next();
    const uid = String(ctx.from.id);
    const msg = ctx.message;
    const isImgDoc = msg.document && /^image\//.test(msg.document.mime_type || "");
    const proof = msg.photo ? { type: "photo", file_id: photoIdOf(msg) } : isImgDoc ? { type: "document", file_id: msg.document.file_id } : null;

    // owner menetapkan QRIS
    if (access.isOwner(uid) && msg.photo && (/^\/setqris\b/i.test(msg.caption || "") || (awaiting.get(uid) || {}).kind === "qris")) {
      const aw = awaiting.get(uid);
      awaiting.delete(uid);
      update((c) => {
        c.qris = { file_id: photoIdOf(msg) };
      });
      await say(ctx, `${ico("ok", "\u2705")} Gambar QRIS disimpan. Pelanggan kini boleh pilih <b>QRIS</b>.`);
      if (aw && aw.ref) await refreshPanel(aw.ref);
      return;
    }

    const o = openOrder(uid, "awaiting_proof");
    if (!o) return next();
    if (!proof) return say(ctx, "Sila hantar <b>gambar</b> (screenshot) bukti bayaran.");

    o.status = "review"; // tukar dahulu supaya gambar kedua tidak menghantar dua kali
    o.proofAt = Date.now();
    o.proof = proof;
    db.setOrder(o.no, o);
    o.cards = await postToStaff(o, proof);
    if (!o.cards.length) {
      o.status = "awaiting_proof";
      db.setOrder(o.no, o);
      return say(ctx, "\u26A0\uFE0F Gagal menghantar bukti kepada owner/reseller (group persetujuan belum ditetapkan?). Sila hubungi owner.");
    }
    db.setOrder(o.no, o);
    const wc = waitCard(o);
    if (o.chat) await editCard(o.chat, wc, null);
    else await sendCard(ctx.chat.id, wc);
    await say(ctx, `${ico("ok", "\u2705")} Bukti diterima untuk <b>${inv(o.no)}</b>. Menunggu pengesahan owner/reseller.`);
  });

  // ----- keputusan staf -----
  bot.callbackQuery(/^pay:(\d+):([ar])$/, (ctx) => decide(ctx, ctx.match[1], ctx.match[2] === "a"));

  // ----- /orders (staf): 10 pesanan terkini -----
  bot.command("orders", async (ctx) => {
    if (!isPrivate(ctx) || !access.isStaff(ctx.from.id)) return;
    const list = db.orders().sort((a, b2) => b2.no - a.no).slice(0, 10);
    const ST = { unpaid: "belum bayar", awaiting_proof: "tunggu bukti", review: "disemak", approved: "diterima", rejected: "ditolak", cancelled: "batal" };
    const rows = list.map((o) => ["tag", `<code>${inv(o.no)}</code>`, `${PK.badge(o.paket)} \u00B7 ${rp(o.price)} \u00B7 ${esc(ST[o.status] || o.status)} \u00B7 ${whoTag(o.username, o.name)}`]);
    await sendCard(ctx.chat.id, card("Pesanan Terkini", "chart", "\uD83D\uDCCA", rows, { headers: ["Invoice", "Butiran"], note: rows.length ? "" : "Belum ada pesanan." }));
  });

  // ----- owner: panel & arahan tetapan -----
  const ownerOnly = (ctx) => isPrivate(ctx) && access.isOwner(ctx.from.id);
  bot.command("payset", async (ctx) => {
    if (!ownerOnly(ctx)) return;
    awaiting.delete(String(ctx.from.id)); // /payset juga membatalkan input yang sedang ditunggu
    await showPanel(ctx.chat.id);
  });
  bot.command("setharga", async (ctx) => {
    if (!ownerOnly(ctx)) return;
    const m = String(ctx.match || "").trim().match(/^(\S+)\s+(.+)$/);
    const tier = m && PK.normalize(m[1]);
    const r = tier && applyPrice(tier, m[2]);
    if (!r) return say(ctx, "Guna: <code>/setharga &lt;LITE|GOLD|PLATINUM&gt; &lt;harga&gt; [hari]</code>\nContoh: <code>/setharga GOLD 30000 30</code> atau <code>/setharga lite 15k</code>");
    await say(ctx, `${ico("ok", "\u2705")} ${PK.badge(tier)} \u2192 <b>${rp(r.price)}</b> / ${r.days} hari`);
  });
  bot.command("setdana", async (ctx) => {
    if (!ownerOnly(ctx)) return;
    const r = applyDana(String(ctx.match || ""));
    if (!r) return say(ctx, "Guna: <code>/setdana &lt;nombor&gt; &lt;nama penerima&gt;</code>\nContoh: <code>/setdana 08123456789 Putri Titian</code>");
    await say(ctx, `${ico("ok", "\u2705")} DANA: <code>${esc(r.number)}</code> a/n <b>${esc(r.name)}</b>`);
  });
  bot.command("setqris", async (ctx) => {
    if (!ownerOnly(ctx)) return;
    const id = photoIdOf(ctx.message.reply_to_message);
    if (!id) return say(ctx, "Hantar <b>gambar QRIS</b> dengan kapsyen <code>/setqris</code>, atau balas gambar QRIS dengan <code>/setqris</code>.");
    update((c) => {
      c.qris = { file_id: id };
    });
    await say(ctx, `${ico("ok", "\u2705")} Gambar QRIS disimpan.`);
  });
  bot.command("pay", async (ctx) => {
    if (!ownerOnly(ctx)) return;
    const a = String(ctx.match || "").trim().toLowerCase().split(/\s+/);
    const val = (x) => (x === "on" ? true : x === "off" ? false : null);
    if (val(a[0]) !== null) update((c) => { c.enabled = val(a[0]); });
    else if ((a[0] === "dana" || a[0] === "qris") && val(a[1]) !== null) update((c) => { c.methods[a[0]] = val(a[1]); });
    else return say(ctx, "Guna: <code>/pay on|off</code> \u00B7 <code>/pay dana on|off</code> \u00B7 <code>/pay qris on|off</code>");
    await showPanel(ctx.chat.id);
  });

  // butang panel
  bot.callbackQuery(/^ps:(.+)$/, async (ctx) => {
    if (!access.isOwner(ctx.from.id)) return ctx.answerCallbackQuery({ text: "Hanya owner.", show_alert: true });
    const [act, arg] = ctx.match[1].split(":");
    const ref = refOf(ctx);
    const uid = String(ctx.from.id);
    if (act === "t") {
      update((c) => {
        if (arg === "pay") c.enabled = !c.enabled;
        else c.methods[arg] = !c.methods[arg];
      });
      await ctx.answerCallbackQuery({ text: "Dikemas kini" });
      return refreshPanel(ref);
    }
    if (act === "r") {
      await ctx.answerCallbackQuery({ text: "Dikemas kini" });
      return refreshPanel(ref);
    }
    await ctx.answerCallbackQuery();
    if (act === "p") {
      const tier = TCODE[arg];
      awaiting.set(uid, { kind: "price", tier, ref });
      return say(ctx, `Hantar harga baharu untuk ${PK.badge(tier)}.\nContoh: <code>25000</code> atau <code>25000 30</code> (harga + hari) atau <code>25k</code>.\nHantar /payset untuk batal.`);
    }
    if (act === "d") {
      awaiting.set(uid, { kind: "dana", ref });
      return say(ctx, "Hantar nombor DANA dan nama penerima.\nContoh: <code>08123456789 Putri Titian</code>\nHantar /payset untuk batal.");
    }
    if (act === "q") {
      awaiting.set(uid, { kind: "qris", ref });
      return say(ctx, "Hantar <b>gambar QRIS</b> sekarang.\nHantar /payset untuk batal.");
    }
  });

  // jawapan teks owner (harga / DANA)
  bot.on("message:text", async (ctx, next) => {
    if (!isPrivate(ctx) || !access.isOwner(ctx.from.id)) return next();
    const uid = String(ctx.from.id);
    const aw = awaiting.get(uid);
    if (!aw) return next();
    if (ctx.message.text.startsWith("/")) {
      awaiting.delete(uid);
      return next();
    }
    if (aw.kind === "price") {
      const r = applyPrice(aw.tier, ctx.message.text);
      if (!r) return say(ctx, "Format salah. Contoh: <code>25000</code>, <code>25000 30</code> atau <code>25k</code>.");
      awaiting.delete(uid);
      await say(ctx, `${ico("ok", "\u2705")} ${PK.badge(aw.tier)} \u2192 <b>${rp(r.price)}</b> / ${r.days} hari`);
    } else if (aw.kind === "dana") {
      const r = applyDana(ctx.message.text);
      if (!r) return say(ctx, "Format salah. Contoh: <code>08123456789 Putri Titian</code>");
      awaiting.delete(uid);
      await say(ctx, `${ico("ok", "\u2705")} DANA: <code>${esc(r.number)}</code> a/n <b>${esc(r.name)}</b>`);
    } else {
      return next();
    }
    if (aw.ref) await refreshPanel(aw.ref);
  });
}

// Jadual harga ringkas untuk perbandingan paket (.paket / /paket)
function priceCells() {
  const c = conf();
  return PK.ORDER.map((t) => `${rp(c.prices[t].price)}/${c.prices[t].days}h`);
}

module.exports = { register, conf, rp, parsePrice, priceCells, inv, applyPrice, applyDana, showPanel };

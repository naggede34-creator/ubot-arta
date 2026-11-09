// ===== NOTIFIKASI OTOMATIS (pengguna bot + channel) =====
//  1. STOK BARU    : setiap owner menambah stok noktel -> kartu "STOK NOKTEL BARU" ke semua pengguna bot + channel.
//                    (beberapa stok yang ditambah berdekatan digabung jadi satu notifikasi, jeda 60 detik)
//  2. INFO STOK    : setiap 35 - 40 menit (acak, bisa diubah) kartu info stok noktel dikirim ke channel.
//  3. SAPAAN       : Selamat Pagi / Siang / Sore / Malam (jam bisa diubah) ke pengguna + channel.
//  4. JADWAL SHOLAT: tepat waktu Subuh, Dzuhur, Ashar, Maghrib, Isya (dihitung otomatis per kota, metode Kemenag) ke pengguna + channel.
//  Setiap sapaan / pengingat sholat juga berisi AJAKAN ORDER bergantian: Up Role, Beli Role Ubot, Beli Noktel.
//
//  OWNER: PANEL OWNER > Notif Otomatis (nyalakan / matikan per fitur & per tujuan, pilih kota, interval, channel, tes kirim),
//         /notifotomatis · /setkota jakarta · /setjamnotif pagi 07:00 · /setchpromo -100xxxxxxxxxx
//  SEMUA PENGGUNA: /jadwalsholat
//  Channel: settings "Channel promo" (bila kosong memakai NOTIFY_CHANNEL_ID / config.json notify_channel_id). Bot harus ADMIN channel.
//  Data: data/db.json (settings.autonotif) + data/autonotif.json (penanda terkirim).
const fs = require("fs");
const path = require("path");
const db = require("./db");
const access = require("./access");
const UI = require("./botui");
const PT = require("./praytimes");
const { cfg, tg, esc, btn, pair, sendRich, shared, fmtTime, TZL } = require("./core");

const FILE = path.join(__dirname, "data", "autonotif.json");
const DELAY_MS = 70; // jeda antar pengguna (~14 pesan/detik, aman di bawah batas Telegram)
const NEW_STOCK_DEBOUNCE = 60e3;
const WINDOW = 10 * 60e3; // event yang terlewat lebih dari 10 menit (mis. bot mati) tidak dikirim
const rp = (n) => "Rp" + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const clip = (s, n = 30) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isOwner = (id) => access.isOwner(id);
const NK = () => require("./noktel");
const BC = () => require("./bcpin");

// ---------------------------------------------------------------- pengaturan
const DEF = {
  stockNew: { users: true, ch: true },
  stockInfo: { ch: true, users: false, min: 35, max: 40 },
  greet: { users: true, ch: true },
  pray: { users: true, ch: true },
  city: "jakarta",
  times: { pagi: "07:00", siang: "13:00", sore: "16:30", malam: "20:30" },
  promoCh: "",
};
function conf() {
  const c = db.getSetting("autonotif") || {};
  return {
    stockNew: { ...DEF.stockNew, ...(c.stockNew || {}) }, stockInfo: { ...DEF.stockInfo, ...(c.stockInfo || {}) },
    greet: { ...DEF.greet, ...(c.greet || {}) }, pray: { ...DEF.pray, ...(c.pray || {}) },
    city: PT.CITIES[c.city] ? c.city : (PT.CITIES[cfg.prayer_city] ? cfg.prayer_city : DEF.city),
    times: { ...DEF.times, ...(c.times || {}) }, promoCh: c.promoCh || "",
  };
}
const saveConf = (c) => db.setSetting("autonotif", c);
const channel = () => String(conf().promoCh || process.env.NOTIFY_CHANNEL_ID || cfg.notify_channel_id || "").trim();

let mem = { sent: {}, nextStockInfo: 0, lastEmptyInfo: 0 };
try { mem = { ...mem, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch (_) {}
function saveMem() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const cutoff = Date.now() - 3 * 86400e3;
    for (const [k, v] of Object.entries(mem.sent)) if (v < cutoff) delete mem.sent[k];
    fs.writeFileSync(FILE + ".tmp", JSON.stringify(mem));
    fs.renameSync(FILE + ".tmp", FILE);
  } catch (e) { console.error("[autonotif] simpan:", e.message); }
}

// ---------------------------------------------------------------- pengiriman massal (antrean, satu job sekaligus)
const queue = [];
let running = false;
let current = null;
const retryAfter = (e) => { const m = String((e && e.message) || "").match(/retry after (\d+)/i); return m ? Number(m[1]) : 0; };

// kirim kartu ke satu chat: Rich -> teks HTML. -> "ok" | "gone" | "fail"
async function deliver(chatId, c, kb) {
  for (let a = 0; a < 3; a++) {
    try {
      await sendRich(chatId, c.html, kb || (() => []));
      return "ok";
    } catch (e) {
      const ra = retryAfter(e);
      if (ra && a < 2) { await sleep((ra + 1) * 1000); continue; }
      if (BC().isGone(e)) return "gone";
      try {
        await tg("sendMessage", { chat_id: chatId, text: c.text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...(kb ? { reply_markup: { inline_keyboard: kb(false) } } : {}) });
        return "ok";
      } catch (e2) {
        const ra2 = retryAfter(e2);
        if (ra2 && a < 2) { await sleep((ra2 + 1) * 1000); continue; }
        return BC().isGone(e2) ? "gone" : "fail";
      }
    }
  }
  return "fail";
}
// job: { name, card, kbUser, kbCh, users: bool, ch: bool }
function blast(job) {
  queue.push(job);
  if (!running) runQueue().catch((e) => { running = false; console.error("[autonotif] antrean:", e.message); });
}
async function runQueue() {
  running = true;
  while (queue.length) {
    const j = queue.shift();
    current = { name: j.name, done: 0, total: 0 };
    const res = { ok: 0, gone: 0, fail: 0, ch: "-" };
    const to = channel();
    if (j.ch && to) res.ch = await deliver(to, j.card, j.kbCh);
    if (j.users) {
      const list = BC().targets();
      current.total = list.length;
      for (const uid of list) {
        const r = await deliver(uid, j.card, j.kbUser);
        res[r]++;
        if (r === "gone") BC().markGone(uid);
        current.done++;
        await sleep(DELAY_MS);
      }
    }
    console.log(`[autonotif] ${j.name}: channel=${res.ch} pengguna ok=${res.ok} blokir=${res.gone} gagal=${res.fail}`);
  }
  current = null;
  running = false;
}

// ---------------------------------------------------------------- isi pesan
const botLink = (start) => (shared.botUsername ? `https://t.me/${shared.botUsername}${start ? `?start=${start}` : ""}` : null);
const urlBtn = (fancy, text, start, style) => { const u = botLink(start); return u ? { text, url: u, ...(fancy && style ? { style } : {}) } : null; };
const rows2 = (...bs) => { const f = bs.filter(Boolean); return f.length > 1 ? pair(...f) : f.length ? [f[0]] : null; };

function stockInfo() {
  let cs = [];
  try { cs = NK().cats(); } catch (_) {}
  const total = cs.reduce((n, c) => n + c.items.length, 0);
  const min = total ? Math.min(...cs.map((c) => NK().minPrice(c.items))) : 0;
  return { cs, total, min };
}
const srOn = () => { try { return require("./selfrole").conf().enabled; } catch (_) { return false; } };
const minRole = () => { try { return require("./selfrole").minPriceLabel(); } catch (_) { return ""; } };

const PROMO = {
  uprole: [
    (s) => `🚀 <b>UP ROLE SEKARANG!</b> Naikkan role ubot kamu ke <b>GOLD / PLATINUM</b> — fitur lebih lengkap, broadcast tanpa watermark, aktif instan.`,
    (s) => `⬆️ Masih pakai role LITE? <b>Up Role</b> sekarang, semua fitur premium langsung terbuka begitu QRIS lunas.`,
  ],
  role: [
    (s) => `👑 <b>BELI ROLE UBOT</b> mulai <b>${esc(s.minRole)}</b> — bayar QRIS, role aktif otomatis dalam hitungan detik.`,
    (s) => `🤖 Mau userbot auto promosi tanpa ribet? <b>Beli Role Ubot</b> mulai <b>${esc(s.minRole)}</b>, ratusan fitur siap pakai.`,
  ],
  noktel: [
    (s) => `💎 <b>NOKTEL READY ${s.total} STOK</b> mulai <b>${rp(s.min)}</b>! Akun + PIN 2FA dikirim otomatis, kode OTP diteruskan bot.`,
    (s) => `📱 Butuh akun Telegram siap pakai? <b>${s.total} noktel</b> tersedia mulai <b>${rp(s.min)}</b> — order sekarang sebelum habis!`,
  ],
};
let promoTurn = Math.floor(Math.random() * 3);
function pickPromo() {
  const s = { ...stockInfo(), minRole: minRole() };
  const kinds = [...(srOn() ? ["uprole", "role"] : []), ...(s.total ? ["noktel"] : [])];
  if (!kinds.length) return null;
  const kind = kinds[promoTurn++ % kinds.length];
  const arr = PROMO[kind];
  return { kind, html: arr[Math.floor(Math.random() * arr.length)](s) };
}
const promoKbUser = (kind) => (fancy) => [
  ...(kind === "noktel" ? [[btn(fancy, "Beli Noktel Sekarang", "nk:h", "success", UI.E.gem)]] : []),
  ...(srOn() ? [pair(btn(fancy, "Beli Role", "sr:m", kind === "role" ? "success" : "primary", UI.E.crown), btn(fancy, "Up Role", "sr:up", kind === "uprole" ? "success" : "primary", UI.E.rocket))] : []),
  ...(kind !== "noktel" && stockInfo().total ? [[btn(fancy, "Beli Noktel", "nk:h", "primary", UI.E.gem)]] : []),
];
const promoKbCh = (kind) => (fancy) => [
  rows2(urlBtn(fancy, kind === "noktel" ? "Beli Noktel Sekarang" : "Beli Noktel", "nk", kind === "noktel" ? "success" : "primary")),
  srOn() ? rows2(urlBtn(fancy, "Beli Role", "role", kind === "role" ? "success" : "primary"), urlBtn(fancy, "Up Role", "uprole", kind === "uprole" ? "success" : "primary")) : null,
].filter(Boolean);

function prayRows(sch, mark) {
  const N = [["imsak", "Imsak"], ["subuh", "Subuh"], ["terbit", "Terbit"], ["dzuhur", "Dzuhur"], ["ashar", "Ashar"], ["maghrib", "Maghrib"], ["isya", "Isya"]];
  return N.map(([k, l]) => [k === mark ? "bolt" : "time", k === mark ? `<b>${l}</b>` : l, k === mark ? `<b>${sch.times[k].hhmm} ${esc(sch.tzLabel)}</b> ← sekarang` : `${sch.times[k].hhmm} ${esc(sch.tzLabel)}`]);
}

const GREET = {
  pagi: ["Selamat Pagi", "🌅", ["Semoga harimu penuh berkah dan rezeki lancar.", "Awali hari dengan semangat dan senyuman!", "Pagi yang indah untuk memulai hal-hal baik."]],
  siang: ["Selamat Siang", "☀️", ["Tetap semangat, jangan lupa makan siang dan istirahat sejenak.", "Siang yang produktif! Semoga urusanmu dimudahkan.", "Jangan lupa minum air putih, tetap fokus dan semangat!"]],
  sore: ["Selamat Sore", "🌇", ["Terima kasih sudah berjuang hari ini, istirahatlah sejenak.", "Sore yang tenang, semoga lelahmu jadi lillah.", "Waktunya santai sore, nikmati harimu!"]],
  malam: ["Selamat Malam", "🌙", ["Selamat beristirahat, semoga esok lebih baik.", "Malam yang tenang untuk mengisi energi kembali.", "Jangan begadang terlalu larut ya, jaga kesehatan!"]],
};
const PRAY = {
  subuh: ["Subuh", "🌄", "Sholat itu lebih baik dari tidur. Yuk bangun dan tunaikan sholat Subuh."],
  dzuhur: ["Dzuhur", "🕌", "Sejenak tinggalkan aktivitas, mari tunaikan sholat Dzuhur."],
  ashar: ["Ashar", "🕌", "Jangan sampai terlewat, yuk tunaikan sholat Ashar."],
  maghrib: ["Maghrib", "🌆", "Waktu Maghrib singkat, segera tunaikan sholat Maghrib."],
  isya: ["Isya", "🌃", "Tutup harimu dengan sholat Isya, semoga tenang dan berkah."],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const brand = () => esc(cfg.brand || "UBOT ARTA PEDIA");

function greetCard(kind, sch) {
  const [title, emo, lines] = GREET[kind];
  const pr = pickPromo();
  const c = UI.card({
    title: `${title} ${emo}`, icon: "wave",
    sub: `${pick(lines)}<br><i>Jadwal sholat hari ini untuk wilayah <b>${esc(sch.label)}</b> dan sekitarnya:</i>`,
    rows: prayRows(sch), headers: ["Waktu", "Jam"],
    note: pr ? pr.html : `Terima kasih telah memakai <b>${brand()}</b>.`,
  });
  return { c, kind: pr ? pr.kind : null };
}
function prayCard(kind, sch) {
  const [name, emo, line] = PRAY[kind];
  const pr = pickPromo();
  const c = UI.card({
    title: `Waktu Sholat ${name} ${emo}`, icon: "time",
    sub: `Telah masuk waktu sholat <b>${name}</b> untuk wilayah <b>${esc(sch.label)}</b> dan sekitarnya (<b>${sch.times[kind].hhmm} ${esc(sch.tzLabel)}</b>).<br>${line}`,
    rows: prayRows(sch, kind), headers: ["Waktu", "Jam"],
    note: pr ? `Setelah sholat, jangan lupa:<br>${pr.html}` : "Semoga ibadah kita diterima. Aamiin.",
  });
  return { c, kind: pr ? pr.kind : null };
}
function stockCard(title, sub, list) {
  const s = stockInfo();
  return UI.card({
    title, icon: "box", headers: ["Kategori", "Stok · Harga"],
    sub,
    rows: (list || s.cs.slice(0, 20).map((c) => ["tag", esc(clip(c.name, 28)), `<b>${c.items.length}</b> stok · mulai <b>${rp(NK().minPrice(c.items))}</b>`])).concat([["chart", "<b>Total stok</b>", `<b>${s.total}</b> akun`]]),
    checks: [[true, "Bayar QRIS otomatis / saldo"], [true, "Nomor, ID &amp; PIN 2FA dikirim otomatis"], [true, "Kode OTP diteruskan bot"]],
    note: `⏰ ${esc(fmtTime(Date.now()))} ${esc(TZL)} — order langsung di bot, stok terbatas!`,
  });
}
const stockKbUser = (fancy) => [[btn(fancy, "Beli Noktel Sekarang", "nk:h", "success", UI.E.gem)], [btn(fancy, "Redeem Kode", "vc:r", "primary", UI.E.tag)]];
const stockKbCh = (fancy) => [rows2(urlBtn(fancy, "Beli Noktel Sekarang", "nk", "success")), rows2(urlBtn(fancy, "Buka Bot", "", "primary"))].filter(Boolean);

// ---------------------------------------------------------------- 1. stok baru
let pendingNew = [];
let newTimer = null;
function newStock(acc, restock = false) {
  if (!acc) return;
  pendingNew = pendingNew.filter((x) => String(x.id) !== String(acc.id)); // stok yang sama tidak dihitung dua kali
  pendingNew.push({ id: acc.id, category: acc.category, price: acc.price, restock });
  clearTimeout(newTimer);
  newTimer = setTimeout(flushNew, NEW_STOCK_DEBOUNCE);
  if (newTimer.unref) newTimer.unref();
}
function flushNew() {
  const items = pendingNew;
  pendingNew = [];
  const c = conf();
  if (!items.length || (!c.stockNew.users && !c.stockNew.ch)) return;
  const by = new Map();
  for (const it of items) { const k = String(it.category).toLowerCase(); const g = by.get(k) || { name: it.category, n: 0, min: Infinity }; g.n++; g.min = Math.min(g.min, it.price); by.set(k, g); }
  const list = [...by.values()].slice(0, 15).map((g) => ["rocket", `<b>${esc(clip(g.name, 28))}</b>`, `+${g.n} stok · mulai <b>${rp(g.min)}</b>`]);
  const card = stockCard(`STOK NOKTEL BARU! (+${items.length})`, `🔥 <b>${items.length} noktel baru</b> baru saja ditambahkan. Siapa cepat dia dapat!`, list);
  blast({ name: "stok baru", card, kbUser: stockKbUser, kbCh: stockKbCh, users: c.stockNew.users, ch: c.stockNew.ch });
}

// ---------------------------------------------------------------- 2. info stok berkala
const nextInterval = () => { const c = conf().stockInfo; const lo = Math.max(5, Number(c.min) || 35); const hi = Math.max(lo, Number(c.max) || 40); return (lo + Math.random() * (hi - lo)) * 60e3; };
function stockInfoJob(test) {
  const s = stockInfo();
  const c = conf();
  const card = s.total
    ? stockCard("INFO STOK NOKTEL", `Stok noktel Telegram yang <b>tersedia sekarang</b> — order langsung, akun dikirim otomatis.`)
    : UI.card({ title: "INFO STOK NOKTEL", icon: "box", sub: "Stok noktel sedang <b>kosong</b>. Restock segera — aktifkan notifikasi bot agar tidak ketinggalan!", note: `⏰ ${esc(fmtTime(Date.now()))} ${esc(TZL)}` });
  return { name: test ? "tes info stok" : "info stok", card, kbUser: stockKbUser, kbCh: stockKbCh, users: !test && c.stockInfo.users, ch: !test && c.stockInfo.ch, empty: !s.total };
}

// ---------------------------------------------------------------- 3 & 4. sapaan + jadwal sholat
const parseHm = (s) => { const m = String(s || "").match(/^(\d{1,2})[:.](\d{2})$/); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] + +m[2] / 60 : null; };
function todayEvents(now = Date.now()) {
  const c = conf();
  const t = PT.today(c.city, now);
  const sch = PT.schedule(c.city, t.y, t.m, t.d);
  const base = Date.UTC(t.y, t.m - 1, t.d) - sch.tz * 3600e3;
  const ev = [];
  for (const k of Object.keys(PRAY)) ev.push({ key: `${t.key}:${k}`, type: "pray", kind: k, at: sch.times[k].at, label: `Sholat ${PRAY[k][0]}`, hhmm: sch.times[k].hhmm });
  for (const k of Object.keys(GREET)) { const h = parseHm(c.times[k]); if (h !== null) ev.push({ key: `${t.key}:${k}`, type: "greet", kind: k, at: base + Math.round(h * 60) * 60e3, label: GREET[k][0], hhmm: PT.hhmm(h) }); }
  return { sch, ev: ev.sort((a, b) => a.at - b.at) };
}
function jobFor(e, sch, test) {
  const c = conf();
  const r = e.type === "pray" ? prayCard(e.kind, sch) : greetCard(e.kind, sch);
  const tg2 = e.type === "pray" ? c.pray : c.greet;
  return { name: `${test ? "tes " : ""}${e.label}`, card: r.c, kbUser: promoKbUser(r.kind), kbCh: promoKbCh(r.kind), users: !test && tg2.users, ch: !test && tg2.ch };
}

// ---------------------------------------------------------------- penjadwal
let timer = null;
function tick() {
  const now = Date.now();
  const c = conf();
  try {
    const { sch, ev } = todayEvents(now);
    for (const e of ev) {
      if (mem.sent[e.key] || now < e.at) continue;
      mem.sent[e.key] = now;
      saveMem();
      if (now - e.at > WINDOW) continue; // terlewat (bot mati) -> lewati
      const tgt = e.type === "pray" ? c.pray : c.greet;
      if (!tgt.users && !(tgt.ch && channel())) continue;
      blast(jobFor(e, sch));
    }
  } catch (e) { console.error("[autonotif] jadwal:", e.message); }
  try {
    if (!mem.nextStockInfo) { mem.nextStockInfo = now + nextInterval(); saveMem(); }
    if (now >= mem.nextStockInfo) {
      mem.nextStockInfo = now + nextInterval();
      const j = stockInfoJob();
      const emptyOk = !j.empty || now - (mem.lastEmptyInfo || 0) > 3 * 3600e3; // stok kosong: maks 1x / 3 jam
      if (emptyOk && ((j.ch && channel()) || j.users)) { if (j.empty) mem.lastEmptyInfo = now; blast(j); }
      saveMem();
    }
  } catch (e) { console.error("[autonotif] info stok:", e.message); }
}
function start() {
  if (timer) return;
  timer = setInterval(tick, 30e3);
  if (timer.unref) timer.unref();
  setTimeout(tick, 15e3).unref();
  const c = conf();
  console.log(`[autonotif] aktif • kota ${PT.CITIES[c.city][0]} • channel ${channel() || "(belum diatur)"} • info stok tiap ${c.stockInfo.min}-${c.stockInfo.max} menit`);
}

// ---------------------------------------------------------------- panel owner
const onoff = (v) => (v ? "🟢 ON" : "⚪ OFF");
function panelCard(note) {
  const c = conf();
  const { ev } = todayEvents();
  const now = Date.now();
  const nx = ev.find((e) => e.at > now);
  const ch = channel();
  return UI.card({
    title: "Notif Otomatis", icon: "mega",
    rows: [
      ["link", "Channel", ch ? `<code>${esc(ch)}</code>${c.promoCh ? "" : " <i>(channel notifikasi)</i>"}` : "<i>belum diatur</i>"],
      ["rocket", "Stok baru", `pengguna ${onoff(c.stockNew.users)} · channel ${onoff(c.stockNew.ch)}`],
      ["box", "Info stok berkala", `channel ${onoff(c.stockInfo.ch)} · pengguna ${onoff(c.stockInfo.users)} · tiap <b>${c.stockInfo.min}-${c.stockInfo.max}</b> menit`],
      ["wave", "Sapaan pagi/siang/sore/malam", `pengguna ${onoff(c.greet.users)} · channel ${onoff(c.greet.ch)}`],
      ["time", "Jadwal sholat 5 waktu", `pengguna ${onoff(c.pray.users)} · channel ${onoff(c.pray.ch)}`],
      ["tag", "Kota jadwal sholat", `<b>${esc(PT.CITIES[c.city][0])}</b> (${esc(PT.CITIES[c.city][4])})`],
      ["bolt", "Berikutnya", nx ? `<b>${esc(nx.label)}</b> · ${nx.hhmm}` : "besok"],
      ["chart", "Info stok berikutnya", mem.nextStockInfo ? `${esc(fmtTime(mem.nextStockInfo))} ${esc(TZL)}` : "-"],
      ...(current ? [["spin", "Sedang mengirim", `${esc(current.name)} · ${current.done}/${current.total}`]] : []),
    ],
    checks: [[true, "Sapaan &amp; pengingat sholat berisi ajakan order (Up Role / Role Ubot / Noktel) bergantian"], [true, "Pengguna yang memblokir bot otomatis dilewati"]],
    note: note || "Tekan tombol untuk menyalakan / mematikan. Jam sapaan: <code>/setjamnotif pagi 07:00</code>",
  });
}
const panelKb = (fancy) => {
  const c = conf();
  const t = (label, v, key) => btn(fancy, `${label}: ${v ? "ON" : "OFF"}`, `an:t:${key}`, v ? "success" : "plain");
  return [
    pair(t("Stok Baru → User", c.stockNew.users, "snu"), t("Stok Baru → CH", c.stockNew.ch, "snc")),
    pair(t("Info Stok → CH", c.stockInfo.ch, "sic"), t("Info Stok → User", c.stockInfo.users, "siu")),
    pair(t("Sapaan → User", c.greet.users, "gu"), t("Sapaan → CH", c.greet.ch, "gc")),
    pair(t("Sholat → User", c.pray.users, "pu"), t("Sholat → CH", c.pray.ch, "pc")),
    pair(btn(fancy, `Kota: ${PT.CITIES[c.city][0]}`, "an:k:0", "primary", UI.E.tag), btn(fancy, `Interval ${c.stockInfo.min}-${c.stockInfo.max} mnt`, "an:i", "primary", UI.E.time)),
    pair(btn(fancy, "Jadwal Hari Ini", "an:j", "primary", UI.E.chart), btn(fancy, "Set Channel", "an:c", "primary", UI.E.link)),
    [btn(fancy, "Tes Kirim (ke saya saja)", "an:x", "success", UI.E.bolt)],
    pair(btn(fancy, "Kirim Info Stok Sekarang", "an:now", "danger", UI.E.mega), btn(fancy, "Kembali ke Panel Owner", "own", "plain", UI.E.wave)),
  ];
};
const TOG = { snu: ["stockNew", "users"], snc: ["stockNew", "ch"], sic: ["stockInfo", "ch"], siu: ["stockInfo", "users"], gu: ["greet", "users"], gc: ["greet", "ch"], pu: ["pray", "users"], pc: ["pray", "ch"] };
const CITY_PAGE = 10;
function scheduleCard(cityKey) {
  const c = conf();
  const city = cityKey || c.city;
  const t = PT.today(city);
  const sch = PT.schedule(city, t.y, t.m, t.d);
  return UI.card({ title: `Jadwal Sholat ${sch.label}`, icon: "time", headers: ["Waktu", "Jam"], sub: `Hari ini, ${t.d}-${t.m}-${t.y} (metode Kemenag RI, perkiraan ±1-2 menit).`, rows: prayRows(sch) });
}

const state = new Map();
function register(bot) {
  bot.callbackQuery(/^an:(\w+)(?::(\w+))?$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.answerCallbackQuery({ text: "Khusus owner.", show_alert: true });
    const [, a, x] = ctx.match;
    const m = ctx.callbackQuery.message;
    const ref = m ? { chat_id: m.chat.id, message_id: m.message_id } : null;
    const chat = m ? m.chat.id : ctx.from.id;
    const show = (card, kb) => (ref ? UI.editCard(ref, card, kb) : UI.sendCard(chat, card, kb));
    if (a === "m") { state.delete(String(ctx.from.id)); await ctx.answerCallbackQuery().catch(() => {}); return show(panelCard(), panelKb); }
    if (a === "t" && TOG[x]) {
      const c = conf();
      const [g, k] = TOG[x];
      c[g][k] = !c[g][k];
      saveConf(c);
      await ctx.answerCallbackQuery({ text: c[g][k] ? "Dinyalakan ✅" : "Dimatikan" }).catch(() => {});
      return show(panelCard(), panelKb);
    }
    if (a === "k") {
      await ctx.answerCallbackQuery().catch(() => {});
      const keys = Object.keys(PT.CITIES);
      const pages = Math.ceil(keys.length / CITY_PAGE);
      const pg = Math.min(Math.max(0, Number(x) || 0), pages - 1);
      const slice = keys.slice(pg * CITY_PAGE, (pg + 1) * CITY_PAGE);
      return show(UI.card({ title: "Pilih Kota Jadwal Sholat", icon: "tag", sub: `Sekarang: <b>${esc(PT.CITIES[conf().city][0])}</b>. Halaman ${pg + 1}/${pages}.`, note: "Kota tidak ada? Pilih kota terdekat dengan zona waktu yang sama." }), (fancy) => [
        ...slice.reduce((rows, k, i) => { if (i % 2 === 0) rows.push([]); rows[rows.length - 1].push(btn(fancy, `${PT.CITIES[k][0]} (${PT.CITIES[k][4]})`, `an:K:${k}`, k === conf().city ? "success" : "primary")); return rows; }, []).map((r) => (r.length > 1 ? pair(...r) : r)),
        pair(btn(fancy, "◀️ Prev", `an:k:${(pg - 1 + pages) % pages}`, "plain"), btn(fancy, "Next ▶️", `an:k:${(pg + 1) % pages}`, "plain")),
        [btn(fancy, "‹ Kembali", "an:m", "plain", UI.E.wave)],
      ]);
    }
    if (a === "K" && PT.CITIES[x]) {
      const c = conf(); c.city = x; saveConf(c);
      await ctx.answerCallbackQuery({ text: `Kota: ${PT.CITIES[x][0]}` }).catch(() => {});
      return show(panelCard(`Kota jadwal sholat diubah ke <b>${esc(PT.CITIES[x][0])}</b>.`), panelKb);
    }
    if (a === "j") { await ctx.answerCallbackQuery().catch(() => {}); return show(scheduleCard(), (fancy) => [[btn(fancy, "‹ Kembali", "an:m", "plain", UI.E.wave)]]); }
    if (a === "i" || a === "c") {
      await ctx.answerCallbackQuery().catch(() => {});
      state.set(String(ctx.from.id), { act: a });
      return UI.sendCard(chat, a === "i"
        ? UI.card({ title: "Interval Info Stok", icon: "time", rows: [["info", "Cara", "Kirim rentang menit, contoh <code>35-40</code> (acak di antara keduanya) atau satu angka <code>30</code>"]], note: "Minimal 5 menit. Ketik <code>batal</code> untuk membatalkan." })
        : UI.card({ title: "Set Channel Promo", icon: "link", rows: [["info", "Cara", "Kirim ID channel (contoh <code>-1001234567890</code>) atau <code>@usernamechannel</code>"], ["tag", "Kosongkan", "Kirim <code>-</code> untuk memakai channel notifikasi (NOTIFY_CHANNEL_ID)"]], note: "Jadikan bot ADMIN di channel tersebut (izin kirim pesan)." }),
      (fancy) => [[btn(fancy, "Batal", "an:m", "danger", UI.E.no)]]);
    }
    if (a === "x") {
      await ctx.answerCallbackQuery({ text: "Mengirim contoh ke chat ini..." }).catch(() => {});
      const { sch, ev } = todayEvents();
      const g = ev.find((e) => e.type === "greet") || ev[0];
      const p = ev.find((e) => e.type === "pray");
      const jobs = [jobFor(g, sch, true), jobFor(p, sch, true), stockInfoJob(true)];
      for (const j of jobs) await deliver(chat, j.card, j.kbUser);
      return UI.sendCard(chat, panelCard("Contoh sapaan, pengingat sholat, dan info stok sudah dikirim ke chat ini (tidak dikirim ke pengguna lain)."), panelKb);
    }
    if (a === "now") {
      const j = stockInfoJob();
      if (!channel() && !j.users) return ctx.answerCallbackQuery({ text: "Channel belum diatur dan Info Stok → User OFF.", show_alert: true });
      blast({ ...j, ch: !!channel(), name: "info stok (manual)" });
      await ctx.answerCallbackQuery({ text: "Info stok sedang dikirim ✅" }).catch(() => {});
      return show(panelCard("Info stok dikirim sekarang."), panelKb);
    }
    return ctx.answerCallbackQuery().catch(() => {});
  });

  bot.on("message", async (ctx, next) => {
    const st = ctx.from && state.get(String(ctx.from.id));
    if (!st || !ctx.chat || ctx.chat.type !== "private" || !isOwner(ctx.from.id)) return next();
    const text = String(ctx.message.text || "").trim();
    if (text.startsWith("/")) { state.delete(String(ctx.from.id)); return next(); }
    if (/^batal$/i.test(text)) { state.delete(String(ctx.from.id)); return UI.sendCard(ctx.chat.id, panelCard("Dibatalkan."), panelKb); }
    const c = conf();
    if (st.act === "i") {
      const mm = text.match(/^(\d{1,4})(?:\s*[-–sampai]+\s*(\d{1,4}))?$/);
      const lo = mm && Number(mm[1]); const hi = mm && Number(mm[2] || mm[1]);
      if (!mm || lo < 5 || hi < lo || hi > 1440) return UI.sendCard(ctx.chat.id, UI.card({ title: "Format Salah", icon: "no", rows: [["info", "Contoh", "<code>35-40</code> (minimal 5 menit)"]] }));
      c.stockInfo.min = lo; c.stockInfo.max = hi; saveConf(c);
      mem.nextStockInfo = Date.now() + nextInterval(); saveMem();
    } else if (st.act === "c") {
      if (text === "-") c.promoCh = "";
      else if (/^(-100\d{6,}|@[A-Za-z0-9_]{5,})$/.test(text)) c.promoCh = text;
      else return UI.sendCard(ctx.chat.id, UI.card({ title: "Format Salah", icon: "no", rows: [["info", "Contoh", "<code>-1001234567890</code> atau <code>@namachannel</code>"]] }));
      saveConf(c);
    }
    state.delete(String(ctx.from.id));
    return UI.sendCard(ctx.chat.id, panelCard("Disimpan ✅"), panelKb);
  });

  const guard = (fn) => async (ctx) => { if (ctx.chat && ctx.chat.type === "private" && isOwner(ctx.from.id)) return fn(ctx); };
  bot.command("notifotomatis", guard((ctx) => UI.sendCard(ctx.chat.id, panelCard(), panelKb)));
  bot.command("setkota", guard((ctx) => {
    const q = String(ctx.match || "").trim().toLowerCase().replace(/\s+/g, "");
    const k = Object.keys(PT.CITIES).find((x) => x === q || PT.CITIES[x][0].toLowerCase().replace(/\s+/g, "") === q);
    if (!k) return UI.sendCard(ctx.chat.id, UI.card({ title: "Kota Tidak Dikenal", icon: "no", rows: [["info", "Pilihan", esc(Object.values(PT.CITIES).map((c) => c[0]).join(", "))]], note: "Contoh: <code>/setkota surabaya</code>" }));
    const c = conf(); c.city = k; saveConf(c);
    return UI.sendCard(ctx.chat.id, scheduleCard(k));
  }));
  bot.command("setjamnotif", guard((ctx) => {
    const [k, v] = String(ctx.match || "").trim().toLowerCase().split(/\s+/);
    if (!GREET[k] || (v !== "off" && parseHm(v) === null)) return UI.sendCard(ctx.chat.id, UI.card({ title: "Cara Pakai", icon: "gear", rows: [["tag", "Pakai", "<code>/setjamnotif pagi 07:00</code>"], ["info", "Pilihan", "pagi, siang, sore, malam · jam HH:MM · <code>off</code> = matikan sapaan itu"], ["time", "Sekarang", esc(Object.entries(conf().times).map(([a, b]) => `${a} ${b || "off"}`).join(" · "))]] }));
    const c = conf(); c.times[k] = v === "off" ? "" : PT.hhmm(parseHm(v)); saveConf(c);
    return UI.sendCard(ctx.chat.id, panelCard(`Jam sapaan <b>${k}</b>: <b>${c.times[k] || "dimatikan"}</b>.`), panelKb);
  }));
  bot.command("setchpromo", guard((ctx) => {
    const t = String(ctx.match || "").trim();
    if (t !== "-" && !/^(-100\d{6,}|@[A-Za-z0-9_]{5,})$/.test(t)) return UI.sendCard(ctx.chat.id, UI.card({ title: "Cara Pakai", icon: "gear", rows: [["tag", "Pakai", "<code>/setchpromo -1001234567890</code>"], ["info", "Kosongkan", "<code>/setchpromo -</code> (pakai channel notifikasi)"]] }));
    const c = conf(); c.promoCh = t === "-" ? "" : t; saveConf(c);
    return UI.sendCard(ctx.chat.id, panelCard("Channel promo disimpan."), panelKb);
  }));
  bot.command("jadwalsholat", async (ctx) => {
    if (!ctx.chat || ctx.chat.type !== "private") return;
    return UI.sendCard(ctx.chat.id, scheduleCard());
  });
}

module.exports = { register, start, newStock, panelCard, panelKb, _todayEvents: todayEvents, _conf: conf };

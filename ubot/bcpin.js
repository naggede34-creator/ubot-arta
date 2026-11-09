// ===== BROADCAST PIN (owner) =====
// Fitur di PANEL OWNER > BROADCAST PIN.
//   1. Owner menekan "Buat Broadcast Pin", lalu mengirim / mem-forward SATU pesan (teks, foto, video, dokumen, stiker, voice, dll).
//   2. Bot menampilkan preview + jumlah penerima. Owner menekan "KIRIM & PIN".
//   3. Bot menyalin pesan itu (copyMessage: isi, format, tombol URL tetap sama, tanpa label "Diteruskan dari")
//      ke chat bot SETIAP pengguna, lalu mem-PIN pesan itu di chat tersebut.
//   4. Pin dari broadcast sebelumnya otomatis dilepas, jadi di chat pengguna hanya ada pin broadcast terbaru.
// Tambahan:
//   - Pengguna baru (atau yang baru /start lagi setelah memblokir bot) otomatis menerima pin aktif (bisa dimatikan).
//   - Pengguna yang memblokir bot ditandai dan dilewati pada broadcast berikutnya.
//   - Pengiriman berjalan di latar belakang (aman dari batas 30 pesan/detik Telegram + retry otomatis saat FloodWait), ada tombol Hentikan.
//   - "Lepas Pin Semua" melepas pin broadcast dari semua pengguna.
// Perintah cepat (owner): /bcpin (balas pesan yang mau di-broadcast)  ·  /unpinbc
// Data: data/bcpin.json (ikut ter-backup otomatis).
const fs = require("fs");
const path = require("path");
const db = require("./db");
const access = require("./access");
const UI = require("./botui");
const { esc, btn, pair, fmtTime, TZL } = require("./core");

const FILE = path.join(__dirname, "data", "bcpin.json");
const DELAY_MS = 90; // jeda antar pengguna (~11 pengguna/detik, aman di bawah batas Telegram)
const PROGRESS_MS = 3000;

let store = { users: {}, blocked: {}, pins: {}, jobs: [], active: null, auto: true, silent: true };
try { store = { ...store, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch (_) {}
let dirty = false;
function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + ".tmp", JSON.stringify(store));
    fs.renameSync(FILE + ".tmp", FILE);
    dirty = false;
  } catch (e) { console.error("[bcpin] gagal menyimpan:", e.message); }
}
const touch = () => { dirty = true; };
setInterval(() => { if (dirty) save(); }, 5000).unref();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isNum = (id) => /^\d{5,15}$/.test(String(id));

// ---------------------------------------------------------------- daftar penerima
// Semua orang yang pernah membuka bot (database ubot + pencatat track()) kecuali yang memblokir bot.
function targets() {
  const ids = new Set();
  for (const [id] of db.allUsers()) ids.add(String(id));
  for (const id of Object.keys(store.users)) ids.add(String(id));
  for (const o of access.allOwners()) ids.add(String(o));
  return [...ids].filter((id) => isNum(id) && !store.blocked[id]);
}
const knownCount = () => {
  const ids = new Set([...db.allUsers().map(([id]) => String(id)), ...Object.keys(store.users)]);
  return [...ids].filter(isNum).length;
};

// middleware: catat setiap pengguna yang mengirim sesuatu ke bot di chat pribadi (tanpa menulis ke db.json)
function track(ctx) {
  try {
    const u = ctx.from;
    if (!u || u.is_bot || !ctx.chat || ctx.chat.type !== "private") return;
    const k = String(u.id);
    if (!store.users[k]) { store.users[k] = Date.now(); touch(); }
    if (store.blocked[k]) { delete store.blocked[k]; touch(); } // dia menghubungi bot lagi = sudah tidak memblokir
  } catch (_) {}
}

// ---------------------------------------------------------------- Telegram
let botRef = null;
const retryAfter = (e) => (e && e.parameters && Number(e.parameters.retry_after)) || 0;
async function withRetry(fn) {
  for (let a = 0; ; a++) {
    try { return await fn(); } catch (e) {
      const ra = retryAfter(e);
      if (ra && a < 3) { await sleep((ra + 1) * 1000); continue; }
      throw e;
    }
  }
}
const isGone = (e) => {
  const code = e && e.error_code;
  const d = String((e && e.description) || (e && e.message) || "");
  return code === 403 || /blocked|deactivated|chat not found|user not found|bot was kicked|PEER_ID_INVALID/i.test(d);
};

// Salin pesan ke satu pengguna + pin + lepas pin lama. Hasil: { ok, pinned, gone, err }
async function deliver(uid, src, silent, jobId) {
  let m;
  try {
    m = await withRetry(() => botRef.api.copyMessage(uid, src.chatId, src.msgId));
  } catch (e) {
    if (isGone(e)) { store.blocked[uid] = Date.now(); touch(); return { ok: false, gone: true }; }
    return { ok: false, err: String((e && e.description) || (e && e.message) || e).slice(0, 120) };
  }
  let pinned = false;
  try {
    await withRetry(() => botRef.api.pinChatMessage(uid, m.message_id, { disable_notification: !!silent }));
    pinned = true;
  } catch (_) {}
  const prev = store.pins[uid];
  if (pinned && prev && prev.mid && prev.pinned) await botRef.api.unpinChatMessage(uid, { message_id: prev.mid }).catch(() => {});
  store.pins[uid] = { mid: m.message_id, job: jobId, at: Date.now(), pinned };
  touch();
  return { ok: true, pinned };
}

// ---------------------------------------------------------------- job broadcast
let job = null; // job yang sedang berjalan (satu saja)
let draft = new Map(); // ownerId -> { step: "wait" | "confirm", chatId, msgId, ref }

async function runJob(j) {
  const list = targets();
  j.total = list.length;
  const errs = {};
  for (let i = 0; i < list.length && !j.stop; i++) {
    const r = await deliver(list[i], j.src, store.silent, j.id).catch((e) => ({ ok: false, err: String(e.message || e).slice(0, 120) }));
    j.done = i + 1;
    if (r.ok) { j.sent++; if (r.pinned) j.pinned++; else j.pinFail++; }
    else if (r.gone) j.gone++;
    else { j.failed++; if (r.err) errs[r.err] = (errs[r.err] || 0) + 1; }
    if (Date.now() - j.lastEdit > PROGRESS_MS) { j.lastEdit = Date.now(); await showProgress(j); }
    await sleep(DELAY_MS);
  }
  j.finished = Date.now();
  j.errs = errs;
  store.jobs.unshift({ id: j.id, at: j.startedAt, by: j.by, total: j.total, sent: j.sent, pinned: j.pinned, failed: j.failed, gone: j.gone, stopped: !!j.stop });
  store.jobs = store.jobs.slice(0, 20);
  if (!j.stop) store.active = { job: j.id, chatId: j.src.chatId, msgId: j.src.msgId, at: Date.now() };
  save();
  await showProgress(j, true);
  job = null;
}

const bar = (p) => { const n = Math.round(p / 10); return "\u2588".repeat(n) + "\u2591".repeat(10 - n); };
function progressCard(j, final) {
  const pct = j.total ? Math.floor((j.done / j.total) * 100) : 100;
  const sec = Math.round(((j.finished || Date.now()) - j.startedAt) / 1000);
  const rows = [
    ["user", "Target", `<b>${j.total}</b> pengguna`],
    ["ok", "Terkirim", `<b>${j.sent}</b>`],
    ["pin", "Ter-pin", `<b>${j.pinned}</b>${j.pinFail ? ` \u00B7 gagal pin ${j.pinFail}` : ""}`],
    ["no", "Gagal", `<b>${j.failed}</b>`],
    ["fire", "Memblokir bot", `<b>${j.gone}</b>`],
    ["time", "Durasi", `<b>${sec} detik</b>`],
  ];
  const errTop = final && j.errs ? Object.entries(j.errs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, n]) => `${esc(m)} (${n}x)`).join("<br>") : "";
  return UI.card({
    title: final ? (j.stop ? "Broadcast Pin Dihentikan" : "Broadcast Pin Selesai") : "Broadcast Pin Berjalan",
    icon: final ? (j.stop ? "info" : "ok") : "spin",
    sub: `<code>${bar(pct)}</code> <b>${pct}%</b> (${j.done}/${j.total})`,
    rows,
    note: final
      ? (errTop ? `Penyebab gagal terbanyak:<br>${errTop}` : "Pesan sudah ter-pin di chat bot para pengguna. Pin lama otomatis dilepas.")
      : "Jangan restart bot sampai selesai. Tekan <b>Hentikan</b> untuk berhenti di tengah jalan.",
  });
}
const progressKb = (final) => (fancy) => (final
  ? [[btn(fancy, "Kembali ke Panel Broadcast", "bcp:m", "primary")]]
  : [[btn(fancy, "Hentikan", "bcp:stop", "danger")]]);
async function showProgress(j, final) {
  try { await UI.editCard(j.ref, progressCard(j, !!final), progressKb(!!final)); } catch (_) {}
}

// ---------------------------------------------------------------- kartu
const lastJob = () => store.jobs[0] || null;
function menuCard() {
  const lj = lastJob();
  const act = store.active;
  const pinnedNow = Object.values(store.pins).filter((p) => p.pinned && act && p.job === act.job).length;
  return UI.card({
    title: "Broadcast Pin", icon: "mega",
    sub: "Kirim satu pesan ke semua pengguna bot, lalu pesan itu di-pin di chat bot mereka.",
    rows: [
      ["user", "Penerima", `<b>${targets().length}</b> pengguna <i>(dikenal ${knownCount()}, memblokir ${Object.keys(store.blocked).length})</i>`],
      ["pin", "Pin aktif", act ? `<b>${esc(fmtTime(act.at))} ${esc(TZL)}</b> \u00B7 ${pinnedNow} chat` : "<i>belum ada</i>"],
      ["chart", "Broadcast terakhir", lj ? `${lj.sent}/${lj.total} terkirim \u00B7 ${lj.failed} gagal \u00B7 ${lj.gone} blokir${lj.stopped ? " \u00B7 dihentikan" : ""}` : "<i>belum ada</i>"],
      ["gear", "Pin pengguna baru", store.auto ? "<b>AKTIF</b> (otomatis saat /start)" : "<b>MATI</b>"],
      ["mega", "Notifikasi pin", store.silent ? "<b>Senyap</b>" : "<b>Berbunyi</b>"],
    ],
    checks: [[true, "Format, foto, video, dan tombol URL pesan tetap persis sama"], [true, "Pin lama otomatis dilepas, hanya broadcast terbaru yang ter-pin"], [true, "Perintah cepat: balas sebuah pesan dengan <code>/bcpin</code>"]],
  });
}
const menuKb = (fancy) => [
  [btn(fancy, "Buat Broadcast Pin", "bcp:new", "success", UI.E.mega)],
  pair(btn(fancy, `Pin Pengguna Baru: ${store.auto ? "ON" : "OFF"}`, "bcp:auto", "primary"), btn(fancy, `Notifikasi: ${store.silent ? "Senyap" : "Bunyi"}`, "bcp:sil", "primary")),
  [btn(fancy, "Lepas Pin Semua", "bcp:un", "danger", UI.E.no)],
  [btn(fancy, "Kembali ke Panel Owner", "own", "plain")],
];

const waitCard = () => UI.card({
  title: "Kirim Pesan Broadcast", icon: "mega",
  rows: [["info", "Cara", "Kirim atau <b>forward</b> SATU pesan ke sini: teks, foto, video, dokumen, stiker, voice, dll."], ["info", "Format", "Format teks, caption, dan tombol URL ikut tersalin persis."]],
  note: "Ketik <code>batal</code> untuk membatalkan.",
});
const waitKb = (fancy) => [[btn(fancy, "Batal", "bcp:x", "danger")]];

const confirmCard = () => UI.card({
  title: "Konfirmasi Broadcast Pin", icon: "pin",
  sub: "Preview pesan sudah dikirim di atas. Begini tampilannya di chat pengguna.",
  rows: [["user", "Penerima", `<b>${targets().length}</b> pengguna`], ["mega", "Notifikasi pin", store.silent ? "Senyap" : "Berbunyi"], ["time", "Perkiraan", `<b>${Math.max(1, Math.round((targets().length * (DELAY_MS + 120)) / 1000))} detik</b>`]],
  checks: [[true, "Pesan disalin ke chat bot setiap pengguna lalu di-pin"], [true, "Pin broadcast sebelumnya dilepas otomatis"]],
  note: "Pesan tidak bisa ditarik massal. Pastikan isinya sudah benar sebelum menekan <b>KIRIM &amp; PIN</b>.",
});
const confirmKb = (fancy) => [
  [btn(fancy, "KIRIM & PIN", "bcp:go", "success", UI.E.rocket)],
  pair(btn(fancy, `Notifikasi: ${store.silent ? "Senyap" : "Bunyi"}`, "bcp:sil2", "primary"), btn(fancy, "Ganti Pesan", "bcp:new", "plain")),
  [btn(fancy, "Batal", "bcp:x", "danger")],
];

// ---------------------------------------------------------------- unpin semua
let unpinning = false;
async function unpinAll(ref, chatId) {
  if (unpinning) return;
  unpinning = true;
  const entries = Object.entries(store.pins).filter(([, p]) => p.pinned && p.mid);
  let ok = 0;
  let fail = 0;
  for (const [uid, p] of entries) {
    try {
      await withRetry(() => botRef.api.unpinChatMessage(uid, { message_id: p.mid }));
      ok++;
    } catch (e) { fail++; if (isGone(e)) { store.blocked[uid] = Date.now(); } }
    p.pinned = false;
    await sleep(60);
  }
  store.active = null;
  save();
  unpinning = false;
  const c = UI.card({ title: "Pin Dilepas", icon: "ok", rows: [["ok", "Berhasil", `<b>${ok}</b> chat`], ["no", "Gagal / bot diblokir", `<b>${fail}</b> chat`]], note: "Pesan tetap ada di chat pengguna, hanya pin-nya yang dilepas. Pengguna baru tidak akan menerima pin lagi." });
  await UI.editCard(ref, c, (f) => [[btn(f, "Kembali ke Panel Broadcast", "bcp:m", "primary")]]).catch(() => UI.sendCard(chatId, c));
}

// ---------------------------------------------------------------- pengguna baru
async function ensure(uid) {
  try {
    if (!botRef || !store.auto || !store.active || job) return;
    const k = String(uid);
    if (!isNum(k) || store.blocked[k]) return;
    const p = store.pins[k];
    if (p && p.job === store.active.job) return;
    await deliver(k, { chatId: store.active.chatId, msgId: store.active.msgId }, true, store.active.job);
  } catch (e) { console.error("[bcpin] pin pengguna baru gagal:", e.message); }
}

// ---------------------------------------------------------------- register
function register(bot) {
  botRef = bot;
  const isOwner = (ctx) => ctx.from && access.isOwner(ctx.from.id);
  const refOf = (ctx) => { const m = ctx.callbackQuery.message; return { chat_id: m.chat.id, message_id: m.message_id }; };
  const alert = (ctx, text) => ctx.answerCallbackQuery({ text, show_alert: true });

  // tandai pemblokir / pembuka blokir lewat update my_chat_member
  bot.on("my_chat_member", (ctx, next) => {
    try {
      const u = ctx.myChatMember;
      if (u && u.chat && u.chat.type === "private") {
        const id = String(u.chat.id);
        const st = u.new_chat_member && u.new_chat_member.status;
        if (st === "kicked") { store.blocked[id] = Date.now(); touch(); }
        else if (st === "member") { delete store.blocked[id]; touch(); }
      }
    } catch (_) {}
    return next();
  });

  async function toConfirm(ctx, chatId, srcChat, srcMsg) {
    const d = { step: "confirm", chatId: srcChat, msgId: srcMsg };
    draft.set(String(ctx.from.id), d);
    try { await botRef.api.copyMessage(chatId, srcChat, srcMsg); } // preview persis seperti yang diterima pengguna
    catch (e) { draft.delete(String(ctx.from.id)); return UI.sendCard(chatId, UI.card({ title: "Pesan Tidak Bisa Dibroadcast", icon: "no", rows: [["no", "Sebab", esc(String((e && e.description) || e.message || e).slice(0, 150))]], note: "Jenis pesan ini tidak bisa disalin (mis. pesan layanan). Kirim pesan lain." }), waitKb); }
    return UI.sendCard(chatId, confirmCard(), confirmKb);
  }

  bot.callbackQuery(/^bcp:(\w+)$/, async (ctx) => {
    if (!isOwner(ctx)) return alert(ctx, "Khusus owner.");
    const a = ctx.match[1];
    const ref = refOf(ctx);
    const chatId = ref.chat_id;
    const uid = String(ctx.from.id);
    if (a === "m") { await ctx.answerCallbackQuery(); draft.delete(uid); return UI.editCard(ref, menuCard(), menuKb).then((r) => r || UI.sendCard(chatId, menuCard(), menuKb)); }
    if (a === "new") {
      if (job) return alert(ctx, "Masih ada broadcast yang berjalan. Tunggu selesai atau tekan Hentikan.");
      await ctx.answerCallbackQuery();
      draft.set(uid, { step: "wait" });
      return UI.sendCard(chatId, waitCard(), waitKb);
    }
    if (a === "x") { await ctx.answerCallbackQuery({ text: "Dibatalkan." }); draft.delete(uid); return UI.sendCard(chatId, menuCard(), menuKb); }
    if (a === "auto") { store.auto = !store.auto; save(); await ctx.answerCallbackQuery({ text: `Pin pengguna baru ${store.auto ? "AKTIF" : "MATI"}` }); return UI.editCard(ref, menuCard(), menuKb); }
    if (a === "sil") { store.silent = !store.silent; save(); await ctx.answerCallbackQuery({ text: `Notifikasi pin: ${store.silent ? "senyap" : "berbunyi"}` }); return UI.editCard(ref, menuCard(), menuKb); }
    if (a === "sil2") { store.silent = !store.silent; save(); await ctx.answerCallbackQuery({ text: `Notifikasi pin: ${store.silent ? "senyap" : "berbunyi"}` }); return UI.editCard(ref, confirmCard(), confirmKb); }
    if (a === "stop") { if (job) job.stop = true; return ctx.answerCallbackQuery({ text: "Menghentikan..." }); }
    if (a === "un") {
      await ctx.answerCallbackQuery();
      const n = Object.values(store.pins).filter((p) => p.pinned).length;
      return UI.editCard(ref, UI.card({ title: "Lepas Pin Semua?", icon: "fire", rows: [["pin", "Chat ter-pin", `<b>${n}</b>`]], note: "Pin broadcast dilepas dari semua chat pengguna dan pin otomatis untuk pengguna baru dimatikan." }),
        (f) => [[btn(f, "Ya, Lepas Semua", "bcp:un2", "danger")], [btn(f, "Batal", "bcp:m", "primary")]]);
    }
    if (a === "un2") { await ctx.answerCallbackQuery({ text: "Melepas pin..." }); return unpinAll(ref, chatId); }
    if (a === "go") {
      const d = draft.get(uid);
      if (!d || d.step !== "confirm") return alert(ctx, "Tidak ada pesan. Tekan Buat Broadcast Pin dulu.");
      if (job) return alert(ctx, "Masih ada broadcast yang berjalan.");
      await ctx.answerCallbackQuery({ text: "Memulai broadcast..." });
      draft.delete(uid);
      job = { id: Date.now().toString(36), by: uid, src: { chatId: d.chatId, msgId: d.msgId }, startedAt: Date.now(), lastEdit: 0, total: targets().length, done: 0, sent: 0, pinned: 0, pinFail: 0, failed: 0, gone: 0, stop: false };
      const m = await UI.sendCard(chatId, progressCard(job, false), progressKb(false));
      job.ref = { chat_id: chatId, message_id: m && m.message_id };
      runJob(job).catch((e) => { console.error("[bcpin] job gagal:", e.message); job = null; });
      return;
    }
    return ctx.answerCallbackQuery();
  });

  // pesan yang akan dibroadcast (semua jenis pesan) - harus sebelum Live Chat
  bot.on("message", async (ctx, next) => {
    if (!ctx.from || !ctx.chat || ctx.chat.type !== "private" || !isOwner(ctx)) return next();
    const d = draft.get(String(ctx.from.id));
    if (!d || d.step !== "wait") return next();
    const text = String(ctx.message.text || "");
    if (/^\/\w+/.test(text)) return next();
    if (/^batal$/i.test(text.trim())) { draft.delete(String(ctx.from.id)); return UI.sendCard(ctx.chat.id, menuCard(), menuKb); }
    return toConfirm(ctx, ctx.chat.id, ctx.chat.id, ctx.message.message_id);
  });

  bot.command("bcpin", async (ctx) => {
    if (!isOwner(ctx) || ctx.chat.type !== "private") return;
    if (job) return ctx.reply("Masih ada broadcast yang berjalan.");
    const r = ctx.message.reply_to_message;
    if (!r) return UI.sendCard(ctx.chat.id, menuCard(), menuKb);
    return toConfirm(ctx, ctx.chat.id, ctx.chat.id, r.message_id);
  });
  bot.command("unpinbc", async (ctx) => {
    if (!isOwner(ctx) || ctx.chat.type !== "private") return;
    const m = await UI.sendCard(ctx.chat.id, UI.card({ title: "Melepas Pin...", icon: "spin", rows: [["pin", "Chat", `<b>${Object.values(store.pins).filter((p) => p.pinned).length}</b>`]] }));
    return unpinAll({ chat_id: ctx.chat.id, message_id: m && m.message_id }, ctx.chat.id);
  });
}

module.exports = { register, track, ensure, menuCard, menuKb, targets, knownCount, blockedCount: () => Object.keys(store.blocked).length };

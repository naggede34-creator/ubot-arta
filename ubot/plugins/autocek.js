// ===== AUTOCEK LIMIT (UBOT ARTA PEDIA) =====
// Setiap N menit (default 3, config.json "autocek_interval_min") bot memilih SATU akun Telegram acak yang sedang
// tersambung ke ubot, lalu akun itu mengirim /start ke @SpamBot dan membaca balasannya (bebas limit / terkena limit).
// Hasil disimpan per akun; pemilik akun diberi tahu lewat bot kawalan bila status berubah atau akun terkena limit.
//   .autocek            -> cek akun ini sekarang
//   .autocek status     -> status penjadwal + hasil terakhir akun ini
//   .autocek on | off   -> hidupkan / matikan penjadwal otomatis (khusus owner)
const { Api } = require("telegram");
const db = require("../db");
const access = require("../access");
const { shared, cfg, esc, fmtTime, TZL, send, sendRich } = require("../core");
const { card, show, edit, footerOf, clip } = require("../ui");
const { style } = require("../fxcard");

const SPAMBOT = "SpamBot";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const intervalMs = () => Math.max(1, Number(cfg.autocek_interval_min) || 3) * 60000;
const enabled = () => db.getSetting("autocek_enabled") !== false;
const busy = new Set(); // userId yang sedang dicek
const USE = ".autocek  ->  cek akun ini sekarang\n.autocek status  ->  lihat status\n.autocek on|off  ->  penjadwal otomatis (owner)";

// Terjemahkan balasan @SpamBot -> { status: ok | limited | unknown, detail }
function parseReply(text) {
  const t = String(text || "");
  if (!t) return { status: "unknown", detail: "SpamBot tidak membalas" };
  if (/no limits are currently applied|good news|tidak ada (batasan|pembatasan)|bebas|tanpa batasan/i.test(t)) {
    return { status: "ok", detail: "Akun bebas limit" };
  }
  if (/limited|unfortunately|restrict|dibatasi|terbatas|batasan|pembatasan|limit/i.test(t)) {
    const until = t.match(/until\s+([^\n.]+?\d{4}[^\n.]*)/i) || t.match(/hingga\s+([^\n.]+)/i);
    return { status: "limited", detail: until ? `Terkena limit sampai ${until[1].trim()}` : "Akun terkena limit" };
  }
  return { status: "unknown", detail: clip(t.replace(/\s+/g, " "), 120) };
}

async function sendStart(client, bot) {
  try {
    return await client.sendMessage(bot, { message: "/start" });
  } catch (err) {
    if (/USER_IS_BLOCKED/i.test(String(err.errorMessage || err.message))) {
      await client.invoke(new Api.contacts.Unblock({ id: await client.getInputEntity(bot) }));
      return client.sendMessage(bot, { message: "/start" });
    }
    throw err;
  }
}

async function checkEntry(entry) {
  const client = entry.client;
  const bot = await client.getEntity(SPAMBOT);
  const sent = await sendStart(client, bot);
  let reply = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && !reply) {
    await sleep(2000);
    const ms = await client.getMessages(bot, { limit: 5 });
    reply = ms.find((m) => !m.out && m.id > sent.id && m.message);
  }
  return { ...parseReply(reply && reply.message), at: Date.now(), raw: reply ? clip(reply.message.replace(/\s+/g, " "), 300) : "" };
}

const LABEL = { ok: "Bebas limit", limited: "TERKENA LIMIT", unknown: "Tidak diketahui" };
const ICON = { ok: "ok", limited: "no", unknown: "warn" };

function resultCard(entry, r, title = "Hasil Cek Limit") {
  return card(style({
    title, icon: "tag", lead: "Dicek lewat @SpamBot",
    rows: [
      ["user", "Akun", esc(entry.username ? "@" + entry.username : entry.name || entry.accountId)],
      [ICON[r.status], "Status", `<b>${LABEL[r.status]}</b>`],
      ["tag", "Keterangan", esc(r.detail)],
      ["time", "Waktu", `${esc(fmtTime(r.at, true))} ${esc(TZL)}`],
    ],
    checks: [[r.status === "ok", r.status === "ok" ? "Akun aman untuk promosi" : r.status === "limited" ? "Kurangi broadcast / tunggu limit selesai" : "Cek manual lewat @SpamBot"]],
    footer: footerOf(entry),
  }, USE));
}

async function save(entry, r) {
  const prev = (db.getUser(entry.userId) || {}).autocek || null;
  db.upsertUser(entry.userId, { autocek: { status: r.status, detail: r.detail, at: r.at } });
  return prev;
}

async function notifyUser(entry, r) {
  const c = resultCard(entry, r, r.status === "limited" ? "Peringatan: Akun Terkena Limit" : "Status Limit Akun");
  try {
    await sendRich(entry.userId, c.html);
  } catch (_) {
    await send(entry.userId, c.text).catch(() => {});
  }
}

// Satu putaran penjadwal: pilih satu akun acak
async function tick() {
  if (!enabled() || !shared.manager || typeof shared.manager.all !== "function") return;
  const pool = shared.manager.all().filter((e) => e.client && e.client.connected && !busy.has(e.userId));
  if (!pool.length) return;
  const entry = pool[Math.floor(Math.random() * pool.length)];
  busy.add(entry.userId);
  try {
    const r = await checkEntry(entry);
    const prev = await save(entry, r);
    console.log(`[autocek] ${entry.userId} (${entry.username || entry.accountId}) -> ${r.status}`);
    if (!prev || prev.status !== r.status || r.status === "limited") {
      // hindari spam: akun yang terus terkena limit hanya diberi tahu sekali per jam
      const last = Number(db.getUser(entry.userId).autocekNotifiedAt) || 0;
      if (r.status !== "limited" || !prev || prev.status !== "limited" || Date.now() - last > 3600000) {
        db.upsertUser(entry.userId, { autocekNotifiedAt: Date.now() });
        await notifyUser(entry, r);
      }
    }
  } catch (err) {
    console.error(`[autocek] gagal cek ${entry.userId}:`, err.errorMessage || err.message);
  } finally {
    busy.delete(entry.userId);
  }
}

let timer = null;
function registerBot() {
  if (timer) return;
  timer = setInterval(() => tick().catch((e) => console.error("[autocek] tick:", e.message)), intervalMs());
  if (timer.unref) timer.unref();
}

async function autocek(ctx) {
  const { args, account } = ctx;
  const sub = String(args[0] || "").toLowerCase();

  if (sub === "on" || sub === "off") {
    if (!access.isOwner(account.userId)) return edit(ctx, "\u26A0\uFE0F Hanya owner yang boleh mengatur penjadwal autocek.");
    db.setSetting("autocek_enabled", sub === "on");
    return show(ctx, card(style({
      title: `AutoCek ${sub === "on" ? "Aktif" : "Nonaktif"}`, icon: "tag", lead: "Penjadwal cek limit otomatis",
      rows: [["time", "Interval", `${intervalMs() / 60000} menit`], ["user", "Akun online", String(shared.manager ? shared.manager.count() : 0)]],
      checks: [[sub === "on", sub === "on" ? "Akun acak dicek tiap interval" : "Penjadwal dimatikan"]],
      footer: footerOf(account),
    }, USE)));
  }

  if (sub === "status" || sub === "info") {
    const mine = (db.getUser(account.userId) || {}).autocek;
    return show(ctx, card(style({
      title: "Status AutoCek", icon: "tag", lead: "Cek limit otomatis lewat @SpamBot",
      rows: [
        ["gear", "Penjadwal", enabled() ? "Aktif" : "Nonaktif"],
        ["time", "Interval", `${intervalMs() / 60000} menit (1 akun acak per putaran)`],
        ["user", "Akun online", String(shared.manager ? shared.manager.count() : 0)],
        [mine ? ICON[mine.status] : "warn", "Akun ini", mine ? `${LABEL[mine.status]} (${esc(fmtTime(mine.at, true))} ${esc(TZL)})` : "Belum pernah dicek"],
      ],
      checks: [[enabled(), enabled() ? "AutoCek berjalan" : "AutoCek dimatikan owner"]],
      footer: footerOf(account),
    }, USE)));
  }

  if (busy.has(account.userId)) return edit(ctx, "\u26A0\uFE0F Akun ini sedang dicek, tunggu sebentar.");
  busy.add(account.userId);
  try {
    await edit(ctx, "\u23F3 Mengecek limit lewat @SpamBot...", false).catch(() => {});
    const r = await checkEntry(account);
    await save(account, r);
    await show(ctx, resultCard(account, r));
  } catch (err) {
    await edit(ctx, "\u26A0\uFE0F Gagal cek limit: " + String(err.errorMessage || err.message).slice(0, 200));
  } finally {
    busy.delete(account.userId);
  }
}

module.exports = {
  name: "autocek",
  category: "MENU SHARE AUTO PROMOSI",
  help: [{ cmd: "autocek", alias: ["ceklimit"], desc: "cek limit akun lewat @SpamBot. Otomatis tiap 3 menit pada 1 akun acak: .autocek | .autocek status" }],
  registerBot,
  commands: { autocek, ceklimit: autocek },
  _parseReply: parseReply,
};

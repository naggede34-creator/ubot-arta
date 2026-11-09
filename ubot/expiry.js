// Masa aktif userbot: tambah hari, semak tamat tempoh, hentikan userbot dan beri notis di bot
const db = require("./db");
const access = require("./access");
const manager = require("./manager");
const { cfg, em, send, fmtTime, TZL } = require("./core");

const DAY = 86400000;
const E = { hourglass: "5352940967911517739", ok: "5260726538302660868" };

const isExpired = (rec) => !!(rec && rec.expiresAt && Date.now() >= rec.expiresAt);

// Teks tarikh luput untuk paparan
function label(userId, { sec = false } = {}) {
  if (access.isOwner(userId)) return "Selamanya";
  const rec = db.getUser(userId);
  if (!rec || !rec.expiresAt) return "-";
  return `${fmtTime(rec.expiresAt, sec)} ${TZL}`;
}

// Tarikh luput lalai untuk userbot baharu (config.json: default_days; 0 = tiada had)
function defaultExpiry() {
  const d = Number(cfg.default_days) || 0;
  return d > 0 ? Date.now() + d * DAY : null;
}

// Tambah hari (negatif = kurangkan). Jika sudah tamat, mula kira dari sekarang.
function addDays(userId, days) {
  const rec = db.getUser(userId) || {};
  const now = Date.now();
  const base = rec.expiresAt && rec.expiresAt > now ? rec.expiresAt : now;
  let next = base + days * DAY;
  if (next < now) next = now;
  db.upsertUser(userId, { expiresAt: next, expiredNotified: false });
  return { before: rec.expiresAt || null, after: next, active: next > now };
}

// Hidupkan semula userbot yang dihentikan kerana expired (selepas masa ditambah)
async function revive(userId) {
  const rec = db.getUser(userId);
  if (!rec || !rec.session || isExpired(rec) || manager.getByUser(userId)) return false;
  try {
    await manager.start(userId, rec.session);
    return true;
  } catch (err) {
    console.error(`Gagal hidupkan semula userbot ${userId}:`, err.message);
    return false;
  }
}

async function tick() {
  for (const [uid, rec] of db.allUsers()) {
    if (!rec.session || !rec.expiresAt || access.isOwner(uid)) continue;
    if (!isExpired(rec)) continue;

    if (manager.getByUser(uid)) {
      await manager.stop(uid);
      console.log(`Userbot pengguna ${uid} dihentikan (expired).`);
    }
    if (!rec.expiredNotified) {
      db.upsertUser(uid, { expiredNotified: true });
      const UI = require("./botui"); // dimuat lewat
      await UI.sendCard(uid, UI.card({
        title: "Userbot Telah Expired", icon: "time",
        rows: [["no", "Status", "<b>EXPIRED</b>"], ["time", "Tamat pada", `<b>${fmtTime(rec.expiresAt, true)} ${TZL}</b>`], ["ok", "Userbot", "Dihentikan"]],
        checks: [[false, "Tekan <b>Beli Paket</b> atau hubungi owner/reseller untuk menambah masa aktif"]],
        note: "Userbot akan dihidupkan semula secara automatik selepas masa aktif ditambah.",
      }), (fancy) => [[require("./core").btn(fancy, "Beli Paket", "buy", "success", UI.E.crown)]]);
    }
  }
}

let timer = null;
function startTimer() {
  if (timer) return;
  const run = () => tick().catch((err) => console.error("Semakan expired gagal:", err.message));
  run();
  timer = setInterval(run, 60 * 1000);
}

module.exports = { isExpired, label, defaultExpiry, addDays, revive, tick, startTimer, DAY };

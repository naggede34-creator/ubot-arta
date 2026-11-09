// ===== AUTO JOIN GRUP LOG & CHANNEL RESMI (UBOT ARTA PEDIA) =====
// Setiap akun ubot yang tersambung (baru login, restart bot, atau sudah tersambung sebelumnya) otomatis bergabung ke:
//   - grup log   https://t.me/logubotarta
//   - channel    https://t.me/artapediaaaa
// Atur di config.json:  "auto_join_targets": ["logubotarta", "artapediaaaa"]   (kosongkan [] untuk mematikan)
// Tiap akun hanya di-join SEKALI (ditandai di data/db.json -> autojoined). Kalau pengguna keluar sendiri, tidak dipaksa masuk lagi.
// Antrean berjalan satu per satu dengan jeda acak supaya tidak kena FLOOD_WAIT saat banyak ubot menyala bersamaan.
const { Api } = require("telegram");
const { cfg } = require("./core");
const db = require("./db");

const DEFAULTS = ["logubotarta", "artapediaaaa"];
const clean = (t) => String(t || "").trim().replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
const targets = () => {
  const list = Array.isArray(cfg.auto_join_targets) ? cfg.auto_join_targets : DEFAULTS;
  return [...new Set(list.map(clean).filter(Boolean))];
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

const queue = [];
let running = false;

async function joinOne(client, name) {
  const ent = await client.getEntity(name);
  if (ent && ent.className === "Channel") {
    await client.invoke(new Api.channels.JoinChannel({ channel: ent }));
    return "joined";
  }
  throw new Error("target bukan grup/channel publik");
}

async function process_(entry) {
  const uid = entry.userId;
  const done = { ...((db.getUser(uid) || {}).autojoined || {}) };
  for (const name of targets()) {
    if (done[name]) continue;
    if (!entry.client || !entry.client.connected) return; // akun putus, coba lagi saat tersambung berikutnya
    try {
      await joinOne(entry.client, name);
      done[name] = Date.now();
      console.log(`[autojoin] ${uid} -> @${name} berhasil`);
    } catch (err) {
      const msg = String((err && (err.errorMessage || err.message)) || err);
      if (/USER_ALREADY_PARTICIPANT|INVITE_REQUEST_SENT/i.test(msg)) {
        done[name] = Date.now(); // sudah anggota / menunggu persetujuan admin: cukup
      } else if (/CHANNELS_TOO_MUCH|USER_BANNED_IN_CHANNEL|CHANNEL_PRIVATE|USERNAME_NOT_OCCUPIED|USERNAME_INVALID/i.test(msg)) {
        done[name] = -1; // tidak bisa join (akun penuh / dibanned / link salah), jangan diulang terus
        console.error(`[autojoin] ${uid} -> @${name} dilewati: ${msg}`);
      } else if (/FLOOD_WAIT|FLOOD/i.test(msg)) {
        const sec = Number((msg.match(/(\d+)/) || [])[1]) || 60;
        console.error(`[autojoin] FLOOD_WAIT ${sec}s, antrean dijeda`);
        db.upsertUser(uid, { autojoined: done });
        await sleep(Math.min(sec, 600) * 1000 + 2000);
        return queue.push(entry); // ulangi nanti
      } else {
        console.error(`[autojoin] ${uid} -> @${name} gagal: ${msg}`); // dicoba lagi saat ubot menyala berikutnya
      }
    }
    db.upsertUser(uid, { autojoined: done });
    await sleep(rand(3000, 7000));
  }
}

async function run() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const entry = queue.shift();
      try { await process_(entry); } catch (err) { console.error("[autojoin] ralat:", err.message); }
      await sleep(rand(2000, 5000)); // jeda antar akun
    }
  } finally {
    running = false;
  }
}

// dipanggil manager.start() setiap ubot tersambung; aman tanpa await
function schedule(entry) {
  try {
    if (!targets().length) return;
    const done = (db.getUser(entry.userId) || {}).autojoined || {};
    if (targets().every((t) => done[t])) return; // semua target sudah beres
    if (queue.some((e) => e.userId === entry.userId)) return;
    setTimeout(() => { queue.push(entry); run(); }, rand(5000, 15000)); // tunggu koneksi stabil dulu
  } catch (err) {
    console.error("[autojoin] schedule:", err.message);
  }
}

module.exports = { schedule, targets };

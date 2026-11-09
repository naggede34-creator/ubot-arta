// AUTO HIDUP SENDIRI (self-supervisor). Bot menjaga dirinya sendiri tanpa mengubah startup command panel (tetap `node bot.js` / `npm start`).
//   - Proses utama (master) hanya menjalankan bot.js sebagai proses anak dan memantaunya.
//   - Anak mati / crash / di-kill  -> dihidupkan lagi otomatis setelah jeda (bawaan 10 detik).
//   - Anak "hang" (event loop macet, tidak ada detak jantung selama hang_min menit) -> di-kill lalu dihidupkan lagi.
//   - Crash berulang -> jeda makin panjang (10 dtk, 20, 40, ... maks max_delay_min menit) supaya tidak bikin panel penuh.
//   - Polling bot utama putus (proses hidup tapi bot diam) -> proses keluar sendiri lalu dihidupkan lagi (lihat botDied()).
//   - Tombol Stop / Restart panel (SIGTERM / SIGINT) diteruskan ke anak dan TIDAK memicu hidup ulang.
//   - Salah config / token ditolak (exit code 78) tidak di-loop; owner diberi tahu lewat bot setiap bot hidup kembali.
// config.json (semua opsional):
//   "auto_restart": { "enabled": true, "delay_sec": 10, "hang_min": 5, "max_delay_min": 5, "notify": true }
//   enabled:false  atau env UBOT_NO_SUPERVISOR=1  -> matikan fitur ini.
// Catatan: bila seluruh server dimatikan dari panel / kontainer di-kill, yang bisa menghidupkan hanya panel
//   (aktifkan Pterodactyl > Settings > crash detection, atau Schedules > Power action "Start" tiap 5 menit).
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// Pengawas (proses master) TIDAK PERNAH BOLEH MATI — dialah satu-satunya yang menghidupkan
// bot lagi saat anak crash. Sebelum ini proses master tidak punya tapisan error sendiri: sekali
// saja ada exception / promise ditolak yang tidak tertangkap, SELURUH proses (termasuk pengawas)
// ikut mati dan panel menunjukkan "mati" secara kekal (tiada apa lagi yang menghidupkan semula).
// Ini dipasang di peringkat modul supaya terpakai sama ada proses ini master ATAU anak.
process.on("uncaughtException", (err) => {
  console.error(`[pengawas] uncaughtException (diselamatkan, proses diteruskan): ${err && err.stack ? err.stack : err}`);
});
process.on("unhandledRejection", (err) => {
  console.error(`[pengawas] unhandledRejection (diselamatkan, proses diteruskan): ${err && err.stack ? err.stack : err}`);
});

const FATAL = 78; // salah config / token ditolak: jangan restart-loop
const REQUESTED = 75; // restart diminta owner (/restartbot)
const isChild = () => process.env.UBOT_CHILD === "1";

function conf() {
  let c = {};
  try { c = require("./cfgload"); } catch (_) {}
  const a = (c && c.auto_restart) || {};
  const num = (v, d, min) => Math.max(min, Number(v) || d);
  return {
    enabled: a.enabled !== false && process.env.UBOT_NO_SUPERVISOR !== "1",
    delay: num(a.delay_sec, 10, 3) * 1000,
    hang: num(a.hang_min, 5, 2) * 60 * 1000,
    maxDelay: num(a.max_delay_min, 5, 1) * 60 * 1000,
    notify: a.notify !== false,
    token: c && c.bot_token,
    owners: (c && Array.isArray(c.owner_ids) ? c.owner_ids : []).map(String),
  };
}

const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (...a) => console.log(`[supervisor ${stamp()}]`, ...a);

async function tell(c, text) {
  if (!c.notify || !c.token || !c.owners.length) return;
  for (const id of c.owners) {
    try {
      await fetch(`https://api.telegram.org/bot${c.token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: id, text, parse_mode: "HTML", disable_notification: false }),
        signal: AbortSignal.timeout(15000),
      });
    } catch (_) {}
  }
}

// ---------------------------------------------------------------- master
function runMaster() {
  if (isChild()) { startChild(); return false; }
  const c = conf();
  if (!c.enabled) { log("auto-restart dimatikan, bot berjalan tanpa pengawas"); return false; }

  const entry = path.join(__dirname, "bot.js");
  let child = null, stopping = false, lastHb = 0, startedAt = 0, killReason = null, exited = false;
  const crashes = []; // waktu crash beruntun
  let lastNotice = 0, pending = null;

  // Satu-satunya jalan keluar dari launch(): jadwalkan coba lagi. Dipanggil dari "exit" MAUPUN
  // dari "error" (spawn gagal total, mis. EAGAIN/ENOMEM/ENOENT) -- sebelum ini "error" cuma
  // dicatat log tanpa menjadwalkan apa-apa, jadi pengawas bisa diam selamanya tanpa pernah
  // mencoba lagi walau prosesnya sendiri masih hidup (nampak seperti "mati" di panel).
  function relaunch(why, code) {
    if (exited) return; // "exit" dan "error" bisa dua-duanya terpanggil untuk kegagalan sama
    exited = true;
    const up = Math.round((Date.now() - startedAt) / 1000);
    child = null;
    if (stopping) { log("bot dihentikan"); process.exit(Number.isInteger(code) ? code : 0); }
    if (code === FATAL) {
      log(`bot berhenti karena config / token bermasalah (exit ${FATAL}). Perbaiki config.json lalu Start ulang dari panel.`);
      process.exit(FATAL);
    }
    const requested = code === REQUESTED;
    const now = Date.now();
    if (!requested) crashes.push(now);
    while (crashes.length && now - crashes[0] > 10 * 60 * 1000) crashes.shift();
    const n = crashes.length;
    const delay = requested ? 3000 : n >= 5 ? Math.min(c.maxDelay, c.delay * 2 ** (n - 4)) : c.delay;
    const secs = Math.round(delay / 1000);
    const waitTxt = secs >= 90 ? `${Math.round(secs / 60)} menit` : `${secs} detik`;
    log(`bot mati (${why}, hidup ${up} dtk). Hidup lagi dalam ${waitTxt}.${n >= 5 ? ` Crash beruntun: ${n}x` : ""}`);
    pending = {
      force: requested,
      text: requested
        ? "🔄 <b>Bot di-restart</b> sesuai perintah owner. Sudah aktif kembali."
        : `⚠️ <b>Bot sempat mati</b> (${why}, aktif ${up} detik)\n✅ Sudah dihidupkan otomatis${n >= 5 ? `\n🔁 Crash beruntun ${n}x, jeda restart dinaikkan ke ${waitTxt}` : ""}`,
    };
    // guard ekstra: kalau launch() ulang sampai throw (mis. fs/path meleset), jangan sampai
    // proses pengawas ikut tumbang -- tangkap dan coba lagi sekali lagi nanti.
    setTimeout(() => {
      if (stopping) return;
      try { launch(); } catch (e) { log("gagal menjadwalkan ulang:", e && e.message ? e.message : e); setTimeout(() => { try { launch(); } catch (_) {} }, delay); }
    }, delay);
  }

  function launch() {
    killReason = null;
    exited = false;
    startedAt = lastHb = Date.now();
    try {
      child = spawn(process.execPath, [...process.execArgv, entry], {
        stdio: ["inherit", "inherit", "inherit", "ipc"],
        env: { ...process.env, UBOT_CHILD: "1" },
      });
    } catch (e) {
      log("gagal spawn bot:", e.message);
      return relaunch(`gagal spawn: ${e.message}`, 1);
    }
    log(`bot dijalankan (pid ${child.pid})`);
    child.on("message", (m) => { if (m && m.hb) lastHb = Date.now(); });
    // "error" = spawn gagal total (mis. EAGAIN/ENOMEM, terlalu banyak proses). Node biasanya TIDAK
    // memanggil "exit" sesudah "error" murni spawn, jadi harus dijadwalkan ulang dari sini juga.
    child.on("error", (e) => { log("gagal menjalankan bot:", e.message); relaunch(`gagal spawn: ${e.message}`, 1); });
    child.on("exit", (code, sig) => relaunch(killReason || (sig ? `sinyal ${sig}` : `exit code ${code}`), code));
    if (pending) {
      const p = pending; pending = null;
      const now = Date.now();
      if (p.force || now - lastNotice > 10 * 60 * 1000) { lastNotice = now; setTimeout(() => tell(c, p.text), 15000); }
    }
  }

  // deteksi hang: event loop anak macet -> tidak ada detak jantung
  setInterval(() => {
    try {
      if (!child || stopping) return;
      const quiet = Date.now() - lastHb;
      if (quiet > c.hang) {
        killReason = `macet / tidak merespons ${Math.round(quiet / 60000)} menit`;
        log(`bot ${killReason}, di-kill paksa`);
        try { child.kill("SIGKILL"); } catch (_) {}
        // jaring pengaman: kalau event "exit" tak kunjung datang (sangat macet), paksa relaunch sendiri
        setTimeout(() => { if (child && !exited) { log("exit tak kunjung datang, paksa hidup ulang"); relaunch(killReason, 1); } }, 15000);
      }
    } catch (e) { log("galat semakan hang:", e.message); }
  }, 20000).unref();

  const forward = (sig) => {
    stopping = true;
    log(`menerima ${sig}, menghentikan bot...`);
    if (!child) return process.exit(0);
    try { child.kill(sig); } catch (_) {}
    setTimeout(() => { try { child && child.kill("SIGKILL"); } catch (_) {} process.exit(0); }, 20000).unref();
  };
  for (const s of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(s, () => forward(s));

  launch();
  return true; // bot.js master berhenti memuat modul lain
}

// ---------------------------------------------------------------- child
function startChild() {
  if (!process.send) return;
  const beat = () => { try { process.send({ hb: Date.now() }); } catch (_) {} };
  beat();
  setInterval(beat, 15000);
  process.on("disconnect", () => process.exit(0)); // master hilang -> jangan jadi yatim
}

const supervised = () => isChild() && !!process.send;

// Dipanggil saat polling bot utama berhenti sendiri: proses hidup tapi bot diam -> keluar supaya dihidupkan lagi.
function botDied(err) {
  if (!supervised()) return false;
  console.error(`[supervisor] polling bot utama berhenti (${err && err.message ? err.message : err}), restart otomatis dalam beberapa detik`);
  setTimeout(() => process.exit(1), 3000);
  return true;
}
function requestRestart() { setTimeout(() => process.exit(REQUESTED), 800); }

module.exports = { runMaster, botDied, supervised, requestRestart, FATAL };

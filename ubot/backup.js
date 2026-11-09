// AUTO BACKUP: seluruh file SC + database (data/db.json, sesi ubot, config, store, dll) di-zip lalu dikirim bot ke OWNER.
// - Jalan otomatis tiap 60 menit (config.json "backup_interval_min", atau /setbackup <menit> oleh owner). Matikan: "autobackup": false.
// - Dikirim ke semua owner (owner_ids + owner tambahan). Owner harus pernah /start bot supaya Telegram mengizinkan bot mengirim pesan.
// - ZIP dibuat sendiri (tanpa paket tambahan / tanpa perintah "zip"), dipecah otomatis jika melebihi ~45 MB (batas upload bot Telegram 50 MB).
// - node_modules, .git, dan folder sementara backup tidak ikut.
// - Manual: /backup (owner). Atur jeda: /setbackup 30 (menit, minimal 5).
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const db = require("./db");
const access = require("./access");
const { cfg, esc, fmtTime, TZL } = require("./core");

const ROOT = __dirname;
const TMP = path.join(ROOT, "data", ".backup-tmp");
const SKIP_DIRS = new Set(["node_modules", ".git", ".backup-tmp", ".npm", ".cache"]);
const MAX_PART = 45 * 1024 * 1024;
const MIN_MIN = 5;

// ---------------------------------------------------------------- ZIP (pure Node)
const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function dosTime(d) {
  return {
    time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff,
    date: ((Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff,
  };
}

class ZipPart {
  constructor(file) {
    this.file = file;
    this.fd = fs.openSync(file, "w");
    this.pos = 0;
    this.entries = [];
  }
  // perkiraan ukuran bila entri ditambah (header lokal + data + entri central directory)
  estimate(nameLen, dataLen) { return this.pos + 30 + nameLen + dataLen + this.centralSize() + 46 + nameLen + 22; }
  centralSize() { return this.entries.reduce((n, e) => n + 46 + e.name.length, 0); }
  write(buf) { fs.writeSync(this.fd, buf, 0, buf.length, this.pos); this.pos += buf.length; }
  add(name, raw, mtime, comp) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(raw);
    const { time, date } = dosTime(mtime);
    const method = comp.method;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(method, 8);
    h.writeUInt16LE(time, 10); h.writeUInt16LE(date, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(comp.data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nameBuf.length, 26); h.writeUInt16LE(0, 28);
    const offset = this.pos;
    this.write(h); this.write(nameBuf); this.write(comp.data);
    this.entries.push({ name: nameBuf, crc, method, csize: comp.data.length, usize: raw.length, time, date, offset });
  }
  close() {
    const start = this.pos;
    for (const e of this.entries) {
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(e.method, 10);
      c.writeUInt16LE(e.time, 12); c.writeUInt16LE(e.date, 14); c.writeUInt32LE(e.crc, 16);
      c.writeUInt32LE(e.csize, 20); c.writeUInt32LE(e.usize, 24); c.writeUInt16LE(e.name.length, 28);
      c.writeUInt32LE(e.offset, 42);
      this.write(c); this.write(e.name);
    }
    const size = this.pos - start;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(this.entries.length, 8); end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(size, 12); end.writeUInt32LE(start, 16);
    this.write(end);
    fs.closeSync(this.fd);
    return this.pos;
  }
}

function walk(dir, rel, out) {
  let items;
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const it of items) {
    if (it.isSymbolicLink()) continue;
    const full = path.join(dir, it.name);
    const r = rel ? `${rel}/${it.name}` : it.name;
    if (it.isDirectory()) { if (!SKIP_DIRS.has(it.name)) walk(full, r, out); }
    else if (it.isFile() && !/\.tmp$/i.test(it.name)) out.push({ full, rel: r });
  }
}

// Buat satu atau beberapa ZIP. Hasil: [{ file, size, entries }]
function buildZips(baseName) {
  fs.mkdirSync(TMP, { recursive: true });
  const files = [];
  walk(ROOT, "", files);
  const parts = [];
  let cur = null;
  const open = () => { cur = new ZipPart(path.join(TMP, `${baseName}-part${parts.length + 1}.zip`)); parts.push(cur); };
  let skipped = 0;
  for (const f of files) {
    let raw, st;
    try { raw = fs.readFileSync(f.full); st = fs.statSync(f.full); } catch (_) { skipped++; continue; } // file hilang / terkunci saat dibaca
    let deflated = zlib.deflateRawSync(raw, { level: 6 });
    const comp = deflated.length < raw.length ? { method: 8, data: deflated } : { method: 0, data: raw };
    if (comp.data.length + 200 > MAX_PART) { skipped++; console.error(`[backup] ${f.rel} terlalu besar (${comp.data.length} B), dilewati`); continue; }
    if (!cur || cur.entries.length >= 60000 || cur.estimate(Buffer.byteLength(f.rel), comp.data.length) > MAX_PART) {
      if (cur) cur.close();
      open();
    }
    cur.add(f.rel, raw, st.mtime, comp);
  }
  if (!cur) open();
  cur.close();
  return parts.map((p) => ({ file: p.file, size: p.pos, entries: p.entries.length, skipped }));
}

// ---------------------------------------------------------------- kirim
async function sendDoc(chatId, file, name, caption) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", new Blob([fs.readFileSync(file)], { type: "application/zip" }), name);
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  const res = await fetch(`https://api.telegram.org/bot${cfg.bot_token}/sendDocument`, { method: "POST", body: form, signal: AbortSignal.timeout(180000) });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description || `HTTP ${res.status}`);
  return j.result;
}

const mb = (n) => (n / 1048576).toFixed(2) + " MB";
let running = false;

// reason: "otomatis" | "manual"
async function run(reason = "otomatis", only = null) {
  if (running) return { skipped: "sedang berjalan" };
  running = true;
  const t0 = Date.now();
  let parts = [];
  try {
    const stamp = new Date(t0 + 7 * 3600000).toISOString().replace(/[-:]/g, "").slice(0, 13).replace("T", "-");
    parts = buildZips(`backup-ubot-${stamp}`);
    const total = parts.reduce((n, p) => n + p.size, 0);
    const owners = only ? [String(only)] : access.allOwners();
    const users = db.allUsers().length;
    const sessions = db.allUsers().filter(([, r]) => r.session).length;
    let sentTo = 0;
    for (const oid of owners) {
      try {
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          const cap =
            `<b>\uD83D\uDDC4 BACKUP ${esc(reason.toUpperCase())}</b> ${parts.length > 1 ? `(bagian ${i + 1}/${parts.length})` : ""}\n` +
            `\u23F0 ${esc(fmtTime(t0, true))} ${esc(TZL)}\n` +
            `\uD83D\uDCE6 ${p.entries} file \u00B7 ${mb(p.size)}${parts.length > 1 ? ` (total ${mb(total)})` : ""}\n` +
            `\uD83D\uDC65 ${users} pengguna \u00B7 ${sessions} sesi ubot\n` +
            `Isi: seluruh SC + database (data/db.json, config, store, sesi).` + (p.skipped ? `\n\u26A0\uFE0F ${p.skipped} file dilewati` : "");
          await sendDoc(oid, p.file, path.basename(p.file), cap);
        }
        sentTo++;
      } catch (e) {
        console.error(`[backup] gagal kirim ke ${oid}: ${e.message}`);
      }
    }
    db.setSetting("last_backup_at", t0);
    console.log(`[backup] ${reason}: ${parts.length} zip, ${mb(total)}, terkirim ke ${sentTo}/${owners.length} owner`);
    return { ok: sentTo > 0, sentTo, owners: owners.length, parts: parts.length, total };
  } catch (e) {
    console.error("[backup] gagal:", e.message);
    return { ok: false, error: e.message };
  } finally {
    for (const p of parts) { try { fs.unlinkSync(p.file); } catch (_) {} }
    running = false;
  }
}

// ---------------------------------------------------------------- jadwal
const intervalMin = () => {
  const v = Number(db.getSetting("backup_interval_min") || cfg.backup_interval_min || 60);
  return v >= MIN_MIN ? Math.floor(v) : 60;
};
let timer = null;
function schedule() {
  if (cfg.autobackup === false) return;
  if (timer) clearTimeout(timer);
  const every = intervalMin() * 60000;
  const last = Number(db.getSetting("last_backup_at") || 0);
  // setelah restart: lanjutkan jadwal (jangan menunggu penuh, jangan mengirim ulang kalau baru saja backup)
  const delay = Math.max(30000, last + every - Date.now());
  timer = setTimeout(async () => {
    await run("otomatis").catch(() => {});
    schedule();
  }, delay);
  if (timer.unref) timer.unref();
}
function start() {
  if (cfg.autobackup === false) return console.log("[backup] autobackup dimatikan (config.json autobackup=false)");
  console.log(`[backup] autobackup aktif: tiap ${intervalMin()} menit -> owner`);
  schedule();
}

function register(bot) {
  bot.command("backup", async (ctx) => {
    if (!access.isOwner(ctx.from.id) || ctx.chat.type !== "private") return;
    const m = await ctx.reply("\u23F3 Membuat backup...");
    const r = await run("manual", ctx.from.id);
    const text = r.skipped ? `\u26A0\uFE0F Backup ${r.skipped}.` : r.ok ? `\u2705 Backup terkirim (${r.parts} file, ${mb(r.total)}).` : `\u274C Backup gagal${r.error ? ": " + r.error : ""}.`;
    await ctx.api.editMessageText(ctx.chat.id, m.message_id, text).catch(() => {});
  });
  bot.command("setbackup", async (ctx) => {
    if (!access.isOwner(ctx.from.id)) return;
    const n = Number(String(ctx.match || "").trim());
    if (!n) return ctx.reply(`Jeda autobackup sekarang: ${intervalMin()} menit.\nUbah: /setbackup <menit> (minimal ${MIN_MIN}). Backup manual: /backup`);
    if (n < MIN_MIN) return ctx.reply(`Minimal ${MIN_MIN} menit.`);
    db.setSetting("backup_interval_min", Math.floor(n));
    schedule();
    return ctx.reply(`\u2705 Autobackup diatur tiap ${Math.floor(n)} menit.`);
  });
}

module.exports = { run, start, register, buildZips, intervalMin };

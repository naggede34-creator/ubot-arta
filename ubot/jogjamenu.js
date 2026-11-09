// Lagu "Sesuatu di Jogja" sebagai AUDIO yang tertanam di dalam kartu .help (satu pesan dengan daftar fitur).
// Alur: cari + unduh audio PENUH sekali (disimpan di data/jogja/) -> unggah ke chat bot -> file_id disimpan -> dipasang di kartu Rich
// lewat <audio src="tg://audio?id=hsong"> + media[]. Tidak ada teks lirik di source maupun di menu.
// Sumber audio penuh (dicoba berurutan): 1) paket npm @distube/ytdl-core + yt-search (tanpa ffmpeg)  2) yt-dlp di server
// Terakhir (hanya jika keduanya gagal): pratonton 30 detik iTunes - TIDAK disimpan permanen supaya dicoba lagi lain kali.
const fs = require("fs"), path = require("path");
const { execFile } = require("child_process");
const { cfg } = require("./core");
const TITLE = "Sesuatu di Jogja", ARTIST = "Adhitia Sofyan", QUERY = `${TITLE} ${ARTIST}`;
const DIR = path.join(__dirname, "data", "jogja");
const STATE = path.join(DIR, "state.json");
const MIN_FULL = 1.5 * 1024 * 1024; // di bawah ini dianggap pratonton/gagal (lagu penuh biasanya 3-6 MB)
let state = { file: "", full: false, file_id: "", dur: 0 };
try { state = { ...state, ...JSON.parse(fs.readFileSync(STATE, "utf8")) }; } catch (_) {}
const save = () => { try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(state)); } catch (_) {} };
let busy = null, rejectedAt = 0, failAt = 0;

const api = (m) => `https://api.telegram.org/bot${cfg.bot_token}/${m}`;
const j = async (url, ms = 15000) => { const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { "User-Agent": "Mozilla/5.0 ubot" } }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); };

// ---- sumber 1: ytdl-core (paket npm opsional) ----
async function viaNpm(out) {
  let ytdl, ytSearch;
  try { ytdl = require("@distube/ytdl-core"); ytSearch = require("yt-search"); } catch (_) { throw new Error("paket @distube/ytdl-core / yt-search belum terpasang (npm install)"); }
  const r = await ytSearch(QUERY);
  const v = (r.videos || []).find((x) => x.seconds >= 120 && x.seconds <= 600) || (r.videos || [])[0];
  if (!v) throw new Error("video tidak ditemukan");
  await new Promise((resolve, reject) => {
    const s = ytdl(v.url, { filter: "audioonly", quality: "highestaudio", highWaterMark: 1 << 25 });
    const w = fs.createWriteStream(out);
    s.on("error", reject); w.on("error", reject); w.on("finish", resolve); s.pipe(w);
  });
  return { dur: v.seconds || 0 };
}
// ---- sumber 2: yt-dlp ----
function viaYtdlp(dir) {
  const out = path.join(dir, "song.%(ext)s");
  const bins = [process.env.YTDLP_BIN, "yt-dlp", "yt-dlp_linux", path.join(__dirname, "yt-dlp")].filter(Boolean);
  const run = (i) => new Promise((resolve, reject) => {
    if (i >= bins.length) return reject(new Error("yt-dlp tidak ditemukan"));
    execFile(bins[i], ["-x", "--audio-format", "mp3", "--audio-quality", "5", "--no-playlist", "--max-filesize", "45M", "--match-filter", "duration<900", "-o", out, `ytsearch1:${QUERY}`],
      { timeout: 180000, maxBuffer: 1 << 24 }, (err) => {
        if (err && err.code === "ENOENT") return resolve(run(i + 1));
        const f = fs.readdirSync(dir).find((x) => /^song\.(mp3|m4a|opus|webm)$/i.test(x));
        f ? resolve({ file: path.join(dir, f) }) : reject(err || new Error("audio tidak dihasilkan"));
      });
  });
  return run(0);
}
async function viaPreview(out) {
  const m = ((await j(`https://itunes.apple.com/search?term=${encodeURIComponent(QUERY)}&media=music&entity=song&limit=3&country=ID`).catch(() => ({}))).results || []).find((x) => x.previewUrl);
  if (!m) throw new Error("pratonton tidak ada");
  fs.writeFileSync(out, Buffer.from(await (await fetch(m.previewUrl, { signal: AbortSignal.timeout(25000) })).arrayBuffer()));
  return { dur: 30 };
}

async function fetchAudio() {
  fs.mkdirSync(DIR, { recursive: true });
  const errs = [];
  const target = path.join(DIR, "song.m4a");
  for (const [name, fn] of [["npm", () => viaNpm(target)], ["yt-dlp", async () => { const r = await viaYtdlp(DIR); return { file: r.file }; }]]) {
    try {
      const r = (await fn()) || {};
      const file = r.file || target;
      if (fs.existsSync(file) && fs.statSync(file).size >= MIN_FULL) { state = { ...state, file, full: true, file_id: "", dur: r.dur || 0 }; save(); console.log(`[jogja] audio penuh siap via ${name} (${(fs.statSync(file).size / 1048576).toFixed(1)} MB)`); return; }
      errs.push(`${name}: berkas terlalu kecil`);
    } catch (e) { errs.push(`${name}: ${e.message}`); }
  }
  console.error("[jogja] audio penuh GAGAL ->", errs.join(" | "), "\n[jogja] solusi: jalankan `npm install` (paket @distube/ytdl-core + yt-search) ATAU pasang yt-dlp di server.");
  const pv = path.join(DIR, "preview.m4a");
  const r = await viaPreview(pv); // pratonton: dipasang sementara, lain kali dicoba lagi cari versi penuh
  state = { ...state, file: pv, full: false, file_id: "", dur: r.dur }; save();
}

// Unggah ke chat bot untuk dapat file_id (pesan sementara dihapus)
async function upload(chatId) {
  const form = new FormData();
  form.append("chat_id", String(chatId)); form.append("disable_notification", "true");
  form.append("title", TITLE); form.append("performer", ARTIST);
  if (state.dur) form.append("duration", String(state.dur));
  form.append("audio", new Blob([fs.readFileSync(state.file)]), `${TITLE} - ${ARTIST}${path.extname(state.file) || ".m4a"}`);
  const r = await (await fetch(api("sendAudio"), { method: "POST", body: form, signal: AbortSignal.timeout(120000) })).json();
  if (!r.ok) throw new Error("sendAudio: " + r.description);
  fetch(api("deleteMessage"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId, message_id: r.result.message_id }) }).catch(() => {});
  state.file_id = (r.result.audio || {}).file_id || "";
  if (!state.file_id) throw new Error("file_id audio kosong");
  save();
}

// Pastikan audio + file_id siap. chatId = chat pribadi pemilik dengan bot. Aman dipanggil berulang.
function prepare(chatId, waitMs = 0) {
  if (!busy && failAt && Date.now() - failAt < 30 * 60e3) return Promise.resolve(); // baru gagal: jangan coba tiap .help
  if (!busy) {
    busy = (async () => {
      try {
        await Promise.race([(async () => {
        if (!state.file || !fs.existsSync(state.file) || (!state.full && Date.now() - (state.tried || 0) > 6 * 3600e3)) { state.tried = Date.now(); await fetchAudio(); }
        if (!state.file_id) await upload(chatId);
        })(), new Promise((_, rej) => setTimeout(() => rej(new Error("persiapan lagu melewati 4 menit, dilewati")), 240000))]);
        failAt = 0;
      } catch (e) { failAt = Date.now(); console.error("[jogja] persiapan gagal:", e.message); }
      finally { busy = null; }
    })();
  }
  return waitMs ? Promise.race([busy || Promise.resolve(), new Promise((r) => setTimeout(r, waitMs))]) : busy;
}
const ready = () => !!state.file_id && Date.now() - rejectedAt > 30 * 60e3;
const html = () => (ready() ? `<audio src="tg://audio?id=hsong"></audio>` : "");
const mediaList = () => (ready() ? [{ id: "hsong", media: { type: "audio", media: state.file_id, title: TITLE, performer: ARTIST, ...(state.dur ? { duration: state.dur } : {}) } }] : []);
const markRejected = () => { rejectedAt = Date.now(); }; // Telegram menolak audio dalam kartu -> berhenti mencoba 30 menit
const isFull = () => state.full;
module.exports = { prepare, ready, html, mediaList, markRejected, isFull, TITLE, ARTIST };

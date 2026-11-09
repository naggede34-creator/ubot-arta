// Media menu .help (.setphoto / .setvideo) dan label "Rich render via" (.setroot).  ASCII sahaja.
//
// Mengikut Bot API 10.1+ (Rich Messages): media dalam mesej Rich dirujuk dengan <img src="tg://photo?id=ID"/>
// dan <video src="tg://video?id=ID"></video>, dan dipadankan dengan senarai `media` dalam InputRichMessage:
//   rich_message: { html, media: [{ id: "hphoto", media: { type: "photo", media: "<file_id>" } }, ...] }
// Jika ada gambar DAN video, keduanya digabung dalam <tg-slideshow> (carousel). Jika Telegram menolak gabungan,
// bot mencuba susunan biasa (gambar kemudian video), dan jika masih ditolak, menghantar media sebagai mesej biasa
// tepat sebelum menu help supaya media sentiasa muncul.
// Setiap media disimpan di server (data/helpmedia/<userId>/) dan dimuat naik sekali ke bot kawalan untuk file_id.
const fs = require("fs");
const path = require("path");
const db = require("./db");
const { cfg, esc } = require("./core");

const DIR = path.join(__dirname, "data", "helpmedia");
const MAX_BYTES = 20 * 1024 * 1024;
const USER_RE = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;

const rec = (uid) => db.getUser(uid) || {};
const get = (uid) => rec(uid).helpMedia || {};
const hasAny = (uid) => !!(get(uid).photo || get(uid).video);
const abs = (item) => path.join(__dirname, item.file);
function put(uid, type, item) {
  const cur = { ...get(uid) };
  if (item) cur[type] = item;
  else delete cur[type];
  db.upsertUser(uid, { helpMedia: cur });
}
function removeFiles(uid, type) {
  const item = get(uid)[type];
  if (item && item.file) try { fs.rmSync(abs(item), { force: true }); } catch (_) {}
}

// ---------- label root ----------
const rootOf = (uid) => rec(uid).root || null;
const setRoot = (uid, name) => db.upsertUser(uid, { root: name || null });
function parseRoot(input) {
  const s = String(input || "").trim().replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "").replace(/[/?].*$/, "");
  return USER_RE.test(s) ? s : null;
}

// ---------- mod paparan ----------
// auto: cuba pasang dalam mesej Rich; jika ditolak Telegram -> hantar sebagai mesej biasa sebelum menu
let embedState = "unknown"; // unknown | ok | bad  (memori sahaja; ditetapkan semula bila bot dimulakan)
const getMode = () => db.getSetting("help_media_mode") || "auto";
const setMode = (m) => { db.setSetting("help_media_mode", m); embedState = "unknown"; styleState = "slide"; };
const embedState_ = () => embedState;
const markEmbed = (ok) => { embedState = ok ? "ok" : "bad"; };
const hasFileId = (uid) => { const m = get(uid); return !!((m.photo && m.photo.file_id) || (m.video && m.video.file_id)); };
const embedWanted = (uid) => {
  if (!hasFileId(uid)) return false;
  const mode = getMode();
  return mode === "embed" || (mode === "auto" && embedState !== "bad");
};
const separateWanted = (uid) => hasAny(uid) && !embedWanted(uid) && getMode() !== "off";

// Gaya: "slide" = gambar + video dalam satu <tg-slideshow> (carousel); "stack" = blok berasingan. Dipelajari dalam memori.
let styleState = "slide";
const getStyle = () => styleState;
const setStyle = (st) => { styleState = st; };
const itemCount = (uid) => { const m = get(uid); return (m.photo && m.photo.file_id ? 1 : 0) + (m.video && m.video.file_id ? 1 : 0); };

// HTML media dalam mesej Rich (rujukan tg://photo?id= / tg://video?id=; fail sebenar dalam senarai `media`)
function embedHtml(uid, style = "slide") {
  const m = get(uid);
  const items = [];
  if (m.photo && m.photo.file_id) items.push('<img src="tg://photo?id=hphoto"/>');
  if (m.video && m.video.file_id) items.push('<video src="tg://video?id=hvideo"></video>');
  if (!items.length) return "";
  return items.length > 1 && style !== "stack" ? `<tg-slideshow>${items.join("")}</tg-slideshow>` : items.join("");
}
// Senarai `media` untuk InputRichMessage (dipadankan dengan id dalam embedHtml)
function mediaList(uid) {
  const m = get(uid);
  const out = [];
  if (m.photo && m.photo.file_id) out.push({ id: "hphoto", media: { type: "photo", media: m.photo.file_id } });
  if (m.video && m.video.file_id) {
    const anim = m.video.kind === "animation";
    out.push({ id: "hvideo", media: anim ? { type: "animation", media: m.video.file_id } : { type: "video", media: m.video.file_id, supports_streaming: true } });
  }
  return out;
}

// nonce -> { embedded: bool|null, reason } diisi oleh jawapan inline bot, dibaca oleh arahan .help
const outcomes = new Map();
const noteOutcome = (nonce, o) => {
  outcomes.set(nonce, { ...o, t: Date.now() });
  for (const [k, v] of outcomes) if (Date.now() - v.t > 600000) outcomes.delete(k);
};

// ---------- Bot API: muat naik / hantar ----------
async function botCall(method, form) {
  const res = await fetch(`https://api.telegram.org/bot${cfg.bot_token}/${method}`, { method: "POST", body: form });
  const j = await res.json();
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
  return j.result;
}
// Muat naik fail ke chat bot pengguna untuk mendapatkan file_id -> { id, kind } (kind: photo | video | animation)
async function uploadToBot(chatId, type, file, caption) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption);
  if (type === "video") form.append("supports_streaming", "true");
  form.append(type, new Blob([fs.readFileSync(file)]), path.basename(file));
  const r = await botCall(type === "photo" ? "sendPhoto" : "sendVideo", form);
  if (type === "photo") {
    const id = r.photo && r.photo.length ? r.photo[r.photo.length - 1].file_id : null;
    return id ? { id, kind: "photo" } : null;
  }
  if (r.video && r.video.file_id) return { id: r.video.file_id, kind: "video" };
  if (r.animation && r.animation.file_id) return { id: r.animation.file_id, kind: "animation" };
  return null;
}
// Hantar media tersimpan melalui bot (guna file_id)
async function sendViaBot(chatId, uid) {
  const m = get(uid);
  let n = 0;
  for (const type of ["photo", "video"]) {
    const it = m[type];
    if (!it || !it.file_id) continue;
    const kind = type === "photo" ? "photo" : it.kind === "animation" ? "animation" : "video";
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append(kind, it.file_id);
    try { await botCall({ photo: "sendPhoto", video: "sendVideo", animation: "sendAnimation" }[kind], form); n++; } catch (e) { console.error("[helpmedia] hantar melalui bot gagal:", e.message); }
  }
  return n;
}
// Hantar media tersimpan melalui userbot (fail tempatan).
// only: "all" (semua) | "missing" (hanya yang tiada file_id) | "withId" (hanya yang ada file_id)
async function sendViaUserbot(client, peer, uid, only = "all") {
  const m = get(uid);
  let n = 0;
  for (const type of ["photo", "video"]) {
    const it = m[type];
    if (!it || !it.file || !fs.existsSync(abs(it))) continue;
    if (only === "missing" && it.file_id) continue;
    if (only === "withId" && !it.file_id) continue;
    try {
      await client.sendFile(peer, { file: abs(it), ...(type === "video" ? { supportsStreaming: true } : {}) });
      n++;
    } catch (e) {
      console.error("[helpmedia] hantar melalui userbot gagal:", e.message);
    }
  }
  return n;
}
// Media yang gagal dimuat naik dahulu (tiada file_id): cuba muat naik semula ke chat bot supaya dapat file_id.
// Dipanggil selepas menu dihantar (media muncul sebagai mesej biasa kali ini, dan dipasang dalam menu selepas ini).
async function heal(chatId, uid) {
  const m = get(uid);
  let n = 0;
  for (const type of ["photo", "video"]) {
    const it = m[type];
    if (!it || it.file_id || !it.file || !fs.existsSync(abs(it))) continue;
    try {
      const up = await uploadToBot(chatId, type, abs(it), "");
      if (up) { put(uid, type, { ...it, file_id: up.id, kind: up.kind }); n++; }
    } catch (e) {
      console.error("[helpmedia] muat naik semula gagal:", e.message);
    }
  }
  return n;
}

module.exports = {
  DIR, MAX_BYTES, get, put, hasAny, hasFileId, abs, removeFiles,
  rootOf, setRoot, parseRoot,
  getMode, setMode, embedState: embedState_, markEmbed, embedWanted, separateWanted, embedHtml, mediaList, itemCount, getStyle, setStyle,
  outcomes, noteOutcome, uploadToBot, sendViaBot, sendViaUserbot, heal,
};

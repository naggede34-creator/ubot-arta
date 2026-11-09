// Watermark promosi UBOT ARTA PEDIA - KHUSUS UBOT GRATIS.
// Dipasang pada .bc / .autobc / .cfd / .autocfd hanya jika paket pengguna termasuk "watermark_tiers" (default ["LITE"] = ubot gratis).
// Pengguna paket GOLD / PLATINUM, reseller, dan owner TIDAK diberi watermark.
// OWNER bisa menambah / menghapus watermark lewat bot (tombol PANEL OWNER > Watermark, atau /addwm /delwm /listwm).
// Jika ada lebih dari satu watermark, setiap kiriman memakai salah satunya secara bergiliran (bergantian).
// config.json:
//   "share_watermark": true                 -> false = matikan watermark untuk semua
//   "watermark_text": "UBOT AUTO PROMOSI GRATIS @artapediaubot"   (dipakai bila belum ada watermark tambahan dari owner)
//   "watermark_tiers": ["LITE"]             -> paket yang diberi watermark (contoh ["LITE","GOLD"])
const { cfg } = require("./core");

const DEFAULT_TEXT = "UBOT AUTO PROMOSI GRATIS @artapediaubot";
const MAX_ITEMS = 30;
const MAX_LEN = 200;
let turn = 0;

const db = () => require("./db");
const list = () => (Array.isArray(db().getSetting("watermarks")) ? db().getSetting("watermarks") : []).filter((x) => x && x.text);
const save = (arr) => db().setSetting("watermarks", arr);

function add(text) {
  const t = String(text || "").replace(/\r/g, "").trim();
  if (!t) return { ok: false, why: "kosong" };
  if (t.length > MAX_LEN) return { ok: false, why: `terlalu panjang (maks ${MAX_LEN} huruf)` };
  const arr = list();
  if (arr.length >= MAX_ITEMS) return { ok: false, why: `sudah penuh (maks ${MAX_ITEMS})` };
  if (arr.some((x) => x.text === t)) return { ok: false, why: "sudah ada" };
  arr.push({ text: t, at: Date.now() });
  save(arr);
  return { ok: true, total: arr.length };
}
// n = nomor (1..), atau "all"
function del(n) {
  const arr = list();
  if (String(n).toLowerCase() === "all") { save([]); return { ok: true, removed: arr.length, total: 0 }; }
  const i = Number(n) - 1;
  if (!Number.isInteger(i) || i < 0 || i >= arr.length) return { ok: false, why: "nomor tidak ada" };
  const [gone] = arr.splice(i, 1);
  save(arr);
  return { ok: true, removed: 1, text: gone.text, total: arr.length };
}

function get(userId) {
  if (cfg.share_watermark === false) return "";
  if (userId === undefined || userId === null) return "";
  const access = require("./access");
  if (access.isStaff(userId)) return "";
  const tiers = (Array.isArray(cfg.watermark_tiers) ? cfg.watermark_tiers : ["LITE"]).map((t) => String(t).toUpperCase());
  const tier = require("./paket").tierOf(userId);
  if (!tiers.includes(tier)) return "";
  const arr = list();
  if (arr.length) return arr[turn++ % arr.length].text;
  return String(cfg.watermark_text || DEFAULT_TEXT).trim();
}

module.exports = { get, list, add, del, DEFAULT_TEXT, MAX_ITEMS, MAX_LEN };

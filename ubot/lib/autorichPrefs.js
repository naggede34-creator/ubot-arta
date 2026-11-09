// ═══════════════════════════════════════════════════════════════════════
//  AUTORICH PREFS - nyimpen preferensi fitur AutoRich per akun userbot.
//  Format file: src/database/autorichPrefs.json
// ═══════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', 'src', 'database');
const DB_FILE = path.join(DB_DIR, 'autorichPrefs.json');

const DEFAULT_PREFS = {
  autotext: false,      // auto-convert semua teks yang diketik jadi Rich
  replyRich: false,     // auto-convert balasan command jadi Rich
  ai: false,            // pakai AI buat wrap HTML (bukan wrap standar)
  emoji: true,          // pakai emoji premium di Rich Message
  style: 'default',     // tema: default | promo | warning | success | info
  exclude: [],          // daftar chatId yang di-skip
  log: { total: 0, today: 0, lastDate: '' }, // statistik
  footer: null,         // custom footer (null = default)
};

let cache = null;

function loadStore() {
  if (cache) return cache;
  try {
    if (fs.existsSync(DB_FILE)) {
      cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } else {
      cache = {};
    }
  } catch (err) {
    console.error('[AutoRichPrefs] Gagal load store:', err.message);
    cache = {};
  }
  return cache;
}

function saveStore() {
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('[AutoRichPrefs] Gagal save store:', err.message);
  }
}

function getPrefs(accountKey) {
  const store = loadStore();
  const key = String(accountKey);
  if (!store[key]) store[key] = { ...DEFAULT_PREFS };
  // Merge biar field baru otomatis ada
  store[key] = { ...DEFAULT_PREFS, ...store[key] };
  if (!store[key].log) store[key].log = { ...DEFAULT_PREFS.log };
  if (!Array.isArray(store[key].exclude)) store[key].exclude = [];
  return store[key];
}

function setPref(accountKey, patch) {
  const store = loadStore();
  const key = String(accountKey);
  const current = getPrefs(key);
  store[key] = { ...current, ...patch };
  saveStore();
  return store[key];
}

function toggleExclude(accountKey, chatId, action) {
  const prefs = getPrefs(accountKey);
  const id = String(chatId);
  const set = new Set(prefs.exclude);
  if (action === 'add') set.add(id);
  else if (action === 'remove') set.delete(id);
  else if (action === 'clear') set.clear();
  setPref(accountKey, { exclude: Array.from(set) });
  return Array.from(set);
}

function isExcluded(accountKey, chatId) {
  const prefs = getPrefs(accountKey);
  return prefs.exclude.includes(String(chatId));
}

function bumpLog(accountKey) {
  const store = loadStore();
  const key = String(accountKey);
  const prefs = getPrefs(key);
  const today = new Date().toISOString().slice(0, 10);
  const log = prefs.log || { total: 0, today: 0, lastDate: '' };
  log.total += 1;
  if (log.lastDate !== today) {
    log.today = 1;
    log.lastDate = today;
  } else {
    log.today += 1;
  }
  store[key] = { ...prefs, log };
  saveStore();
}

// Tema-tema warna buat Rich Message
const STYLES = {
  default: { header: '⚡ HAMZX USERBOT 🔥', footer: '⚡ HAMZX USERBOT 🔥' },
  promo: { header: '🎉 PROMO SPESIAL 🎉', footer: '🔥 Buruan sebelum kehabisan!' },
  warning: { header: '⚠️ PERHATIAN ⚠️', footer: '⚠️ Mohon dibaca dengan teliti' },
  success: { header: '✅ BERHASIL ✅', footer: '✅ Terima kasih' },
  info: { header: 'ℹ️ INFORMASI ℹ️', footer: 'ℹ️ Semoga membantu' },
};

module.exports = {
  getPrefs,
  setPref,
  toggleExclude,
  isExcluded,
  bumpLog,
  STYLES,
  DEFAULT_PREFS,
};
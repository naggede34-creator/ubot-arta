// ===== WARNA TOMBOL (owner) =====
// Owner bisa mengatur warna tombol APA SAJA di bot utama:
//   - per tombol (berdasarkan teks tombol, mis. "Backup Sekarang")
//   - semua tombol sekaligus (global)
// Warna: success (hijau) · danger (merah) · primary (biru) · plain (abu-abu bawaan)
// Prioritas: per tombol > global > warna asli dari kode.
// Disimpan di data/db.json (settings.btn_colors) dan langsung berlaku tanpa restart.
const crypto = require("crypto");
const db = require("./db");

const COLORS = {
  success: { label: "Hijau", icon: "\uD83D\uDFE2" },
  danger: { label: "Merah", icon: "\uD83D\uDD34" },
  primary: { label: "Biru", icon: "\uD83D\uDD35" },
  plain: { label: "Abu-abu", icon: "\u26AA" },
};
const KEYS = Object.keys(COLORS);
const MAX_SEEN = 400;

const norm = (t) => String(t || "").replace(/\s+/g, " ").trim().toLowerCase();
const conf = () => {
  const c = db.getSetting("btn_colors") || {};
  return { global: KEYS.includes(c.global) ? c.global : null, byText: c.byText && typeof c.byText === "object" ? c.byText : {} };
};
const saveConf = (c) => db.setSetting("btn_colors", c);

// ---- daftar tombol yang pernah tampil (supaya owner bisa memilih dari daftar) ----
const seen = new Map(); // norm -> teks asli
function remember(text) {
  const k = norm(text);
  if (!k || k.length > 40 || /\d{5,}/.test(k)) return; // lewati tombol dinamis (nama/ID akun)
  if (seen.has(k)) return;
  if (seen.size >= MAX_SEEN) seen.delete(seen.keys().next().value);
  seen.set(k, String(text).replace(/\s+/g, " ").trim());
}
const seenList = () => [...seen.values()].sort((a, b) => a.localeCompare(b));

const hash = (text) => crypto.createHash("md5").update(norm(text)).digest("hex").slice(0, 8);
function byHash(h) {
  for (const t of seen.values()) if (hash(t) === h) return t;
  for (const k of Object.keys(conf().byText)) if (hash(k) === h) return k;
  return null;
}
function addSeen(text) { const k = norm(text); if (k) seen.set(k, String(text).replace(/\s+/g, " ").trim()); return hash(text); }

function colorOf(text) {
  const c = conf();
  return c.byText[norm(text)] || c.global || null;
}
function setFor(text, color) {
  const c = conf();
  if (!color) delete c.byText[norm(text)];
  else if (KEYS.includes(color)) c.byText[norm(text)] = color;
  saveConf(c);
}
function setGlobal(color) {
  const c = conf();
  c.global = KEYS.includes(color) ? color : null;
  saveConf(c);
}
function resetAll() { saveConf({ global: null, byText: {} }); }
function entries() { return Object.entries(conf().byText); }

// Terapkan ke payload API (hanya reply_markup.inline_keyboard). Mengembalikan payload baru / yang sama.
function apply(payload) {
  const kb = payload && payload.reply_markup;
  const rows = kb && kb.inline_keyboard;
  if (!Array.isArray(rows) || !rows.length) return payload;
  const c = conf();
  const hasRules = c.global || Object.keys(c.byText).length;
  const out = rows.map((row) =>
    Array.isArray(row)
      ? row.map((b) => {
          if (!b || typeof b !== "object") return b;
          remember(b.text);
          if (!hasRules || b.__outside) return b;
          if (typeof b.callback_data === "string" && b.callback_data.startsWith("bcl:")) return b; // menu warna tidak ikut diwarnai ulang
          const col = c.byText[norm(b.text)] || c.global;
          if (!col) return b;
          const n = { ...b };
          if (col === "plain") { n.__plain = true; delete n.style; }
          else { n.style = col; delete n.__plain; }
          return n;
        })
      : row
  );
  return { ...payload, reply_markup: { ...kb, inline_keyboard: out } };
}

module.exports = { hash, byHash, addSeen, COLORS, KEYS, norm, conf, remember, seenList, colorOf, setFor, setGlobal, resetAll, entries, apply };

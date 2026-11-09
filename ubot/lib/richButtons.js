// ═══════════════════════════════════════════════════════════════════════
//  RICH BUTTON - tombol menu di DALAM kartu Rich (Bot API 10.3: <tg-button-row><tg-button>)
//
//  Semua pesan yang dikirim lewat sendRichMessage / editMessageText(rich_message) dan membawa
//  inline_keyboard otomatis diubah: tombol dipindah ke dalam kartu sebagai rich button
//  (pil lebar berwarna, seperti contoh foto). Dipasang SEKALI di core.js (fungsi tg),
//  jadi semua menu (/start, .help, panel owner/reseller, share, broadcast, pay, notif ...) ikut berubah.
//
//  Aman: jika Telegram menolak versi rich button, core.js otomatis mengulang dengan keyboard biasa
//  (lihat tg() di core.js), dan fitur dimatikan sementara bila ditolak berulang kali.
//  Matikan manual: config.json "rich_buttons": false
// ═══════════════════════════════════════════════════════════════════════

const STYLES = ["danger", "success", "primary", "link"];
const MAX_ROWS = 50;
const MAX_PER_ROW = 8;

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Emoji biasa untuk ID emoji premium (dipakai sebagai isi <tg-emoji>)
function emojiFromId(id) {
  try {
    const f = require("../emo").fallbackOf(id);
    if (f) return f;
  } catch (_) {}
  return "\u{1F539}";
}

// Tombol yang TIDAK bisa jadi rich button (tetap di keyboard biasa)
const unsupported = (b) =>
  !b ||
  b.__outside || // tombol penanda "di luar kartu" (mis. CHANNEL FEEDBACK) tetap di keyboard bawah bubble
  b.request_location ||
  b.request_contact ||
  b.request_poll ||
  b.web_app ||
  b.login_url ||
  b.pay ||
  b.callback_game ||
  b.switch_inline_query !== undefined ||
  b.switch_inline_query_current_chat !== undefined ||
  b.switch_inline_query_chosen_chat !== undefined ||
  b.copy_text ||
  !(b.url || b.callback_data !== undefined);

function buttonHtml(b) {
  let raw = String(b.text || "Button").replace(/\s*\n\s*/g, " ").trim() || "Button";
  let prefix = "";
  if (b.icon_custom_emoji_id) {
    const id = String(b.icon_custom_emoji_id);
    const emoji = emojiFromId(id);
    prefix = `<tg-emoji emoji-id="${esc(id)}">${emoji}</tg-emoji> `;
    if (raw.startsWith(emoji)) raw = raw.slice(emoji.length).trim();
  }
  const text = prefix + esc(raw);
  // __plain = tombol abu-abu bawaan: atribut style dihilangkan (seperti "Profil Saya" / "Panduan" di foto dashboard)
  const styleAttr = b.__plain ? "" : ` style="${STYLES.includes(b.style) ? b.style : "primary"}"`;
  if (b.url) return `<tg-button type="url"${styleAttr} url="${esc(b.url)}">${text}</tg-button>`;
  const cb = String(b.callback_data).slice(0, 64);
  return `<tg-button type="callback_data"${styleAttr} data="${esc(cb)}">${text}</tg-button>`;
}

// ---- tata letak rapi: tersusun ke bawah, SATU tombol per baris selebar kartu (seperti contoh foto) ----
//  pengecualian: baris navigasi/angka yang teksnya sangat pendek (Prev / Home / Next, jeda 10m 15m ...) tetap sebaris.
function tidyRow(btns) {
  const n = btns.length;
  if (n <= 1) return [btns];
  const max = Math.max(...btns.map((b) => Array.from(String(b.text || "")).length));
  const limit = max <= 4 ? 5 : max <= 7 && n <= 3 ? 3 : 1;
  if (n <= limit) return [btns];
  const rows = Math.ceil(n / limit);
  const size = Math.ceil(n / rows);
  const out = [];
  for (let i = 0; i < n; i += size) out.push(btns.slice(i, i + size));
  return out;
}

// keyboard -> { html, rest }  (rest = tombol yang tidak bisa dipindah, tetap di keyboard biasa)
function split(keyboard) {
  const rows = keyboard && keyboard.inline_keyboard;
  if (!Array.isArray(rows)) return { html: "", rest: [] };
  const out = [];
  const rest = [];
  for (const row of rows.slice(0, MAX_ROWS)) {
    if (!Array.isArray(row) || !row.length) continue;
    const ok = [];
    const left = [];
    for (const b of row) {
      if (!b) continue;
      if (unsupported(b)) left.push(b);
      else if (ok.length < MAX_PER_ROW) ok.push(buttonHtml(b));
      else left.push(b);
    }
    if (ok.length) {
      // ok berisi HTML; pecah berdasarkan objek tombol aslinya
      const objs = row.filter((b) => b && !unsupported(b)).slice(0, MAX_PER_ROW);
      let k = 0;
      // baris yang ditandai pair() (__row) dipertahankan sebaris; selain itu disusun otomatis oleh tidyRow
      for (const chunk of objs.some((b) => b.__row) ? [objs] : tidyRow(objs)) {
        out.push(`<tg-button-row>${ok.slice(k, k + chunk.length).join("")}</tg-button-row>`);
        k += chunk.length;
      }
    }
    if (left.length) rest.push(left);
  }
  return { html: out.join(""), rest };
}

// Versi sesuai permintaan awal (fungsi tunggal) - hanya HTML baris tombol
const richButtonRowsHtml = (keyboard) => split(keyboard).html;

// sisipkan tombol sebelum <footer> penutup (footer tetap paling bawah)
function inject(html, rows) {
  const s = String(html || "");
  const m = s.match(/<footer>[\s\S]*<\/footer>\s*$/);
  if (m) return s.slice(0, m.index) + rows + m[0];
  return s + rows;
}

// ---- circuit breaker: jika Telegram menolak rich button berulang kali, matikan sementara ----
let fails = 0;
let offUntil = 0;
const enabled = (cfg) => !(cfg && cfg.rich_buttons === false) && Date.now() > offUntil;
const markOk = () => { fails = 0; };
const markFail = () => {
  fails++;
  if (fails >= 4) { offUntil = Date.now() + 30 * 60 * 1000; fails = 0; console.error("[richbtn] ditolak berulang, dimatikan 30 menit (pakai keyboard biasa)"); }
};

// Ubah payload API bot. Mengembalikan payload baru, atau null bila tidak ada yang perlu diubah.
function upgrade(method, payload, cfg) {
  if (!enabled(cfg) || !payload || typeof payload !== "object") return null;
  if (method !== "sendRichMessage" && method !== "editMessageText") return null;
  const rm = payload.rich_message;
  if (!rm || typeof rm.html !== "string") return null;
  const kb = payload.reply_markup;
  if (!kb || !Array.isArray(kb.inline_keyboard) || !kb.inline_keyboard.length) return null;
  const { html, rest } = split(kb);
  if (!html) return null;
  return {
    ...payload,
    rich_message: { ...rm, html: inject(rm.html, html) },
    reply_markup: { inline_keyboard: rest },
  };
}

module.exports = { richButtonRowsHtml, split, inject, upgrade, markOk, markFail, enabled };

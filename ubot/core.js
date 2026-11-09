const fs = require("fs");
const path = require("path");
const cfg = require("./cfgload");

const API = `https://api.telegram.org/bot${cfg.bot_token}`;

// Konteks token per-permintaan: bot STORE milik reseller memakai token mereka sendiri, tapi semua kartu UI (sendCard/editCard/send)
// tetap lewat tg() yang sama. runAs(token, fn) -> semua panggilan tg() di dalam fn memakai token itu. Emoji premium DICOBA otomatis;
// bila Telegram menolak untuk bot itu, tg() mengulang tanpa emoji premium dan mengingatnya 6 jam (plain = true memaksa tanpa emoji premium).
// runAs(null, fn) -> kembali ke bot utama (dipakai untuk notifikasi channel dari dalam handler store).
const { AsyncLocalStorage } = require("async_hooks");
const tokenStore = new AsyncLocalStorage();
const runAs = (token, fn, plain = false) => tokenStore.run({ token: token || null, plain: !!token && plain }, fn);
const apiBase = () => { const s = tokenStore.getStore(); return s && s.token ? `https://api.telegram.org/bot${s.token}` : API; };

// Suis emoji premium (config.json: "premium_emoji": true | false). false = semua emoji premium ditukar kepada emoji biasa
// dan ikon premium pada butang dibuang, supaya tiada percubaan yang ditolak Telegram (bot tanpa kelayakan emoji premium).
const premiumOn = () => cfg.premium_emoji !== false;
const stripTags = (html) => String(html).replace(/<tg-emoji[^>]*>([^<]*)<\/tg-emoji>/g, "$1");
function scrubPremium(v) {
  if (typeof v === "string") return stripTags(v);
  if (Array.isArray(v)) return v.filter((x) => !(x && x.type === "custom_emoji")).map(scrubPremium);
  if (v && typeof v === "object" && !Buffer.isBuffer(v)) {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (k !== "icon_custom_emoji_id") o[k] = scrubPremium(x);
    return o;
  }
  return v;
}

// Buang karakter UTF-16 rusak (lone surrogate, mis. emoji terpotong .slice()) dari SEMUA string dalam payload.
// Tanpa ini JSON-nya berisi \udXXX tunggal dan Telegram menolak: "strings must be encoded in UTF-8".
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const cleanStr = (s) => (typeof s === "string" ? s.replace(LONE, "") : s);
function cleanDeep(v) {
  if (typeof v === "string") return cleanStr(v);
  if (Array.isArray(v)) return v.map(cleanDeep);
  if (v && typeof v === "object" && !Buffer.isBuffer(v)) {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[cleanStr(k)] = cleanDeep(x);
    return o;
  }
  return v;
}

// Panggil method Telegram terus tanpa tapisan premium (untuk /premiumtest)
async function tgRaw(method, payload) {
  // Timeout: request yang menggantung (jaringan putus tanpa error) dulu menahan handler selamanya -> panel/menu tidak merespons.
  let res;
  try {
    res = await fetch(`${apiBase()}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cleanDeep(require("./lang").payload(payload)), (k, v) => (k.startsWith("__") ? undefined : v)), // "__row" / "__plain" / "__outside" = penanda tata letak internal, tidak dikirim ke Telegram
      signal: AbortSignal.timeout(Number(cfg.tg_timeout_ms) || 25000),
    });
  } catch (err) {
    if (err && (err.name === "TimeoutError" || err.name === "AbortError")) throw new Error(`${method}: timeout (Telegram tidak menjawab)`);
    throw err;
  }
  const data = await res.json().catch(() => ({ ok: false, description: `respons bukan JSON (HTTP ${res.status})` })); // mis. 502 dari proxy/Telegram
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

// Panggil method Telegram (untuk sendRichMessage dll yang baru)
// RICH BUTTON: kartu Rich yang membawa inline_keyboard otomatis dikirim dengan tombol DI DALAM kartu
// (<tg-button-row>, lihat lib/richButtons.js). Jika Telegram menolak, diulang dengan keyboard biasa.
const RB = require("./lib/richButtons");
const plainTokens = new Map(); // token bot store -> waktu (ms) sampai emoji premium dicoba lagi
const PLAIN_FOR = 6 * 3600 * 1000;
const EMOJI_ERR = /custom.?emoji|emoji|entit|DOCUMENT_INVALID|icon/i;
const isPlainTok = (t) => { const u = plainTokens.get(t); if (!u) return false; if (Date.now() > u) { plainTokens.delete(t); return false; } return true; };

async function tgSend(method, p) {
  const rb = RB.upgrade(method, p, cfg);
  if (rb) {
    try {
      const r = await tgRaw(method, rb);
      RB.markOk();
      return r;
    } catch (err) {
      if (/not modified/i.test(err.message)) throw err;
      console.error(`[richbtn] ${method} dengan rich button ditolak (${err.message}), ulang dengan keyboard biasa`);
      const r = await tgRaw(method, p); // jika ini juga gagal, error aslinya dilempar (bukan salah rich button)
      RB.markFail();
      return r;
    }
  }
  return tgRaw(method, p);
}
async function tg(method, payload) {
  const st = tokenStore.getStore();
  const tok = st && st.token;
  const plain = !!(st && st.plain) || (tok && isPlainTok(tok));
  const usePremium = premiumOn() && !plain;
  if (!tok) { try { payload = require("./btnlayout").apply(payload); } catch (_) {} } // nama tombol / tombol disembunyikan (atur-an owner, semua menu)
  if (!tok) { try { payload = require("./btncolor").apply(payload); } catch (_) {} } // warna tombol atur-an owner (bot utama)
  try {
    return await tgSend(method, usePremium ? payload : scrubPremium(payload));
  } catch (err) {
    // bot store: Telegram menolak emoji premium untuk bot ini -> ulang tanpa emoji premium & ingat 6 jam
    if (tok && usePremium && EMOJI_ERR.test(String(err.message))) {
      plainTokens.set(tok, Date.now() + PLAIN_FOR);
      console.error(`[store] emoji premium ditolak untuk satu bot store (${err.message}), pakai emoji biasa 6 jam`);
      return tgSend(method, scrubPremium(payload));
    }
    throw err;
  }
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Format masa mengikut zon waktu (lalai WIB = UTC+7; tukar dengan timezone_offset / timezone_label dalam config.json)
const TZ = Number(cfg.timezone_offset === undefined ? 7 : cfg.timezone_offset);
const TZL = cfg.timezone_label || "WIB";
const fmtTime = (ms, sec = false) =>
  new Date(ms + TZ * 3600000).toISOString().replace("T", " ").slice(0, sec ? 19 : 16);

// ID chat dinormalkan (buang awalan -100 / -) supaya -1001234567890 dan 1234567890 dianggap sama
const normId = (id) => String(id).replace(/^-100/, "").replace(/^-/, "");

// Emoji premium dalam HTML
const em = (id, fb = "\u2B50") => (premiumOn() ? `<tg-emoji emoji-id="${id}">${fb}</tg-emoji>` : fb);

// Buang emoji premium (kekalkan emoji biasa). Hasil inline PERTAMA tidak boleh ada emoji premium;
// bot mengeditnya selepas dihantar (dibenarkan jika pemilik bot ada Telegram Premium).
const stripCustom = (html) => String(html).replace(/<tg-emoji[^>]*>([^<]*)<\/tg-emoji>/g, "$1");

// Butang inline: fancy = ikon premium + warna
// style "plain" = tombol abu-abu bawaan (tanpa warna), seperti "Profil Saya" / "Panduan" di tampilan dashboard.
const btn = (fancy, text, data, style, icon) => ({
  text,
  callback_data: data,
  ...(style === "plain" ? { __plain: true } : {}),
  ...(fancy && style && style !== "plain" ? { style } : {}),
  ...(fancy && icon ? { icon_custom_emoji_id: icon } : {}),
});
// pair(a, b, ...) = beberapa tombol SEBARIS (2 kolom / 3 kolom). Tanpa pair(), lib/richButtons.js menyusun tombol panjang satu per baris.
const pair = (...btns) => btns.map((b) => ({ ...b, __row: true }));
// outside(b) = tombol yang dipasang DI LUAR kartu (di bawah bubble), mis. CHANNEL FEEDBACK.
const outside = (b) => ({ ...b, __outside: true });

// Hantar mesej HTML biasa (cuba dengan butang cantik dahulu, kemudian butang biasa)
// kb = (fancy) => inline_keyboard rows
async function send(chatId, html, kb) {
  for (const fancy of [true, false]) {
    try {
      return await tg("sendMessage", {
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        ...(kb ? { reply_markup: { inline_keyboard: kb(fancy) } } : {}),
      });
    } catch (err) {
      console.error("sendMessage gagal:", err.message);
    }
  }
}

// Hantar / edit Rich Message (jadual berkotak)
// media (pilihan): [{ id, media: { type: "photo", media: file_id } }] untuk <img src="tg://photo?id=ID"/> di dalam html
async function sendRich(chatId, html, kb = () => [], media = null) {
  let lastErr;
  for (const fancy of [true, false]) {
    try {
      return await tg("sendRichMessage", {
        chat_id: chatId,
        rich_message: { html, ...(media && media.length ? { media } : {}) },
        reply_markup: { inline_keyboard: kb(fancy) },
      });
    } catch (err) {
      lastErr = err;
      console.error("sendRichMessage gagal:", err.message);
    }
  }
  throw lastErr;
}

// ref = { chat_id, message_id } ATAU { inline_message_id }
async function editRich(ref, html, kb = () => [], media = null) {
  for (const fancy of [true, false]) {
    try {
      return await tg("editMessageText", {
        ...ref,
        rich_message: { html, ...(media && media.length ? { media } : {}) },
        reply_markup: { inline_keyboard: kb(fancy) },
      });
    } catch (err) {
      if (/not modified/i.test(err.message)) return;
      console.error("editMessageText gagal:", err.message);
    }
  }
}

// Muat semua fail .js dalam folder plugins/
function loadPlugins() {
  const dir = path.join(__dirname, "plugins");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js")).sort()) {
    try {
      out.push(require(path.join(dir, f)));
    } catch (err) {
      console.error(`Gagal muat plugin ${f}:`, err.message);
    }
  }
  return out;
}

// Objek yang dikongsi antara bot kawalan, pengurus userbot dan plugin
const shared = { cfg, tg, plugins: [], manager: null, db: null, botUsername: null };

module.exports = { runAs, cfg, tg, tgRaw, cleanStr, premiumOn, esc, em, normId, fmtTime, TZL, stripCustom, btn, pair, outside, send, sendRich, editRich, loadPlugins, shared };

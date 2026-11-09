// ═══════════════════════════════════════════════════════════════════════
//  RICH UPGRADE - emoji premium untuk hasil inline (.buildauto, .autorich, menu fitur)
//
//  Masalah: hasil inline yang dikirim AKUN NON-PREMIUM (lewat @bot) tidak boleh
//  memuat custom emoji. Solusi (sama seperti SC UBOT HAMZX BASE KAFKA):
//    1. Hasil inline PERTAMA dikirim TANPA emoji premium (biasa, pasti tampil).
//    2. Setelah Telegram melaporkan hasil itu dipilih (chosen_inline_result),
//       bot mengedit pesan itu dengan versi emoji premium. Bot yang mengedit
//       adalah pemilik Premium, jadi emoji premium tampil untuk semua orang.
//  Akun yang memang Premium (query.from.is_premium) langsung dapat versi premium.
//  Syarat: /setinlinefeedback di @BotFather diset 100%.
// ═══════════════════════════════════════════════════════════════════════

const TTL = 5 * 60 * 1000;
const upgrades = new Map(); // result_id -> { rich, markup, at }

const EMOJI_TAG = /<tg-emoji\b[^>]*>([\s\S]*?)<\/tg-emoji>/gi;
const ICON_ATTR = /\s+icon-emoji-id\s*=\s*["'][^"']*["']/gi;

// Emoji biasa juga dihitung: bot otomatis mengubahnya jadi emoji premium saat dikirim/diedit
const hasPremiumParts = (rich, markup) =>
  /\p{Extended_Pictographic}|tg-emoji|icon-emoji-id|icon_custom_emoji_id|custom_emoji/u.test(JSON.stringify([rich, markup]));

// Penanda: panggilan API ini TIDAK boleh diubah otomatis oleh decoratePayload (telegrafCompat.js)
const PLAIN_FLAG = '__plainRich';

// Versi biasa: buang <tg-emoji> (sisakan teks alternatifnya) dan ikon premium pada tombol
function plainHtml(html) {
  return String(html).replace(EMOJI_TAG, "$1").replace(ICON_ATTR, "");
}

function plainNode(node) {
  if (typeof node === "string") return plainHtml(node);
  if (Array.isArray(node)) return node.map(plainNode);
  if (!node || typeof node !== "object") return node;
  if (node.type === "custom_emoji" || node.type === "tg-emoji") return node.alternative_text || "•";
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "icon_custom_emoji_id" || k === "custom_emoji_id") continue;
    out[k] = plainNode(v);
  }
  return out;
}

function plainMarkup(markup) {
  if (!markup || !Array.isArray(markup.inline_keyboard)) return markup;
  return {
    ...markup,
    inline_keyboard: markup.inline_keyboard.map((row) =>
      row.map(({ icon_custom_emoji_id, ...btn }) => btn)
    ),
  };
}

// Dipanggil saat menjawab inline query. Mengembalikan isi yang BOLEH dikirim sekarang.
// Tombol cadangan: jika chosen_inline_result tidak sampai (feedback inline belum aktif),
// pengguna menekan tombol ini dan bot yang mengedit pesan ke versi premium.
const FALLBACK_PREFIX = "rich_up:";
const FALLBACK_TEXT = "✨ Muat emoji premium";

function prepareRichResult(resultId, rich, markup, { isPremiumSender }) {
  if (isPremiumSender || !hasPremiumParts(rich, markup)) return { rich, markup, deferred: false, extra: {} };
  upgrades.set(resultId, { rich, markup, at: Date.now() });
  const base = plainMarkup(markup) || { inline_keyboard: [] };
  const fallbackRow = [{ text: FALLBACK_TEXT, callback_data: FALLBACK_PREFIX + resultId }];
  return {
    rich: plainNode(rich),
    markup: { ...base, inline_keyboard: [...(base.inline_keyboard || []), fallbackRow] },
    deferred: true,
    extra: { [PLAIN_FLAG]: true },
  };
}

// Ambil versi premium (TIDAK dihapus, supaya bisa dipakai chosen_inline_result ATAU tombol cadangan)
function getUpgrade(resultId) {
  const entry = upgrades.get(resultId);
  if (!entry) return null;
  if (Date.now() - entry.at > TTL) { upgrades.delete(resultId); return null; }
  return entry;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, e] of upgrades.entries()) if (now - e.at > TTL) upgrades.delete(id);
}, 60 * 1000).unref();

module.exports = { prepareRichResult, getUpgrade, FALLBACK_PREFIX, PLAIN_FLAG, plainNode, plainMarkup, hasPremiumParts };

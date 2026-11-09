// Pemformat teks "rich" untuk pesan teks biasa (mode plainTextOnly) -> HTML Telegram (parse_mode HTML).
//   - **tebal**, __miring__, ~~coret~~, `kode`   -> <b> <i> <s> <code>
//   - baris "> teks"                             -> <blockquote> (cocok untuk ajakan / CTA)
//   - baris "- teks" / "• teks"                  -> bullet emoji premium
//   - kelompok baris "LABEL: nilai" (2+ baris)   -> blockquote rapi, label tebal, harga dalam <code>
//   - baris pertama                              -> judul tebal (emoji ditambah otomatis bila belum ada)
//   - semua emoji biasa yang dikenal             -> emoji premium (<tg-emoji>) lewat autorichkit.emojify
// Teks plain (tanpa HTML) tetap disediakan sebagai cadangan jika edit HTML gagal.
const emo = require("./emo");
const kit = require("./autorichkit");

// Emoji yang pasti punya ID premium (dipakai di prompt AI supaya semuanya jadi premium)
const EMOJI_WHITELIST = "✨ 💎 🔥 🚀 ⚡ 👑 ✅ 💰 🏷 🛡 💬 🛒 📦 🎁 📌 🎯 🏆 ⭐ 🌟 💡 🔒 ⏰ 📊 🤖 📞 🔹 ❗ 🎉";

const LEAD_EMOJI = /^\s*(\{e:\d{10,20}\}|\p{Extended_Pictographic})/u;
const BULLET = /^\s*(?:[-*•▪▫✦▸►]|\d{1,2}[.)])\s+(.+)$/;
const KV = /^\s*(?:[-•▪▫✦▸►]\s*)?([^:：\n]{2,28}?)\s*[:：]\s*(\S.*)$/;
const PRICE = /^(?:rp\.?\s?|idr\s?|rm\s?|\$\s?)?[\d.,]+\s?(?:rb|k|jt|ribu|juta|idr|rp|rm|usd|%)?$/i;

const fmt = (s, emoji) => {
  const h = kit.inlineFmt(emo.tokensToHtml(s));
  return emoji ? kit.emojify(h) : h;
};

function plainOf(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, "")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/~~([^~\n]+)~~/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\{e:\d{10,20}\}/g, "")
    .trim();
}

function plainToHtml(text, { emoji = true, headEmoji = "✨" } = {}) {
  const lines = String(text || "").replace(/\r/g, "").replace(/^[ \t]*#{1,6}[ \t]*/gm, "").split("\n").map((l) => l.replace(/\s+$/, ""));
  const out = [];
  let i = 0;
  let headDone = false;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      out.push("");
      i++;
      continue;
    }

    // ---- blockquote: baris berawalan ">"
    if (/^\s*>/.test(line)) {
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${q.map((l) => fmt(l, emoji)).join("\n")}</blockquote>`);
      headDone = true;
      continue;
    }

    // ---- kelompok "LABEL: nilai" (2+ baris berurutan) -> blockquote
    if (headDone && KV.test(line) && !/^\s*https?:/i.test(line)) {
      const j0 = i;
      const rows = [];
      while (i < lines.length && lines[i].trim() && !/^\s*>/.test(lines[i]) && KV.test(lines[i]) && !/^\s*https?:/i.test(lines[i])) {
        const m = lines[i].match(KV);
        rows.push([m[1].trim(), m[2].trim()]);
        i++;
      }
      if (rows.length >= 2) {
        const body = rows
          .map(([k, v]) => {
            const val = PRICE.test(v) ? `<code>${fmt(v, false)}</code>` : fmt(v, emoji);
            return `<b>${fmt(k, emoji)}</b> ➜ ${val}`;
          })
          .join("\n");
        out.push(`<blockquote>${body}</blockquote>`);
        continue;
      }
      i = j0; // hanya 1 baris -> perlakukan sebagai baris biasa
    }

    // ---- baris pertama = judul
    if (!headDone) {
      const t = LEAD_EMOJI.test(line) ? line.trim() : `${headEmoji} ${line.trim()}`;
      out.push(`<b>${fmt(t.replace(/\*\*/g, ""), emoji)}</b>`);
      headDone = true;
      i++;
      continue;
    }

    // ---- bullet
    const b = line.match(BULLET);
    if (b && !/^\s*\d{1,2}[.)]\s/.test(line)) {
      out.push(fmt("🔹 " + b[1], emoji));
      i++;
      continue;
    }
    if (b) {
      out.push(fmt(line.trim(), emoji));
      i++;
      continue;
    }

    out.push(fmt(line, emoji));
    i++;
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 4000);
}

module.exports = { plainToHtml, plainOf, EMOJI_WHITELIST };

// Emoji premium untuk SEMUA pengguna (tidak perlu akaun Premium):
//   - tulis {e:ID} (atau {ID}) dalam teks -> <tg-emoji emoji-id="ID">emoji</tg-emoji> dalam kad Rich yang dihantar melalui bot
//   - entiti emoji premium dalam mesej (akaun Premium menaip terus) ditukar ke HTML yang sama
// ID boleh didapatkan dengan .cekemoji (balas mesej yang ada emoji premium).
// ASCII sahaja (emoji ditulis sebagai \uXXXX).
const { esc } = require("./core");

const ID_RE = "\\d{15,20}";
const TOKEN_RE = new RegExp(`\\{(?:e:)?(${ID_RE})\\}`, "gi");
const STAR = "⭐";

// emoji pengganti (untuk pengguna tanpa Premium / jika emoji premium gagal dimuat) bagi ID yang diketahui
let known = null;
function fallbackOf(id) {
  if (!known) {
    known = new Map();
    try {
      for (const [k, ch] of require("./richai").PALETTE_MAP) known.set(k, ch);
    } catch (_) {}
    try {
      for (const [k, v] of Object.entries(require("./ui").E)) known.set(v[0], v[1]);
    } catch (_) {}
  }
  return known.get(String(id)) || STAR;
}

const tag = (id, ch) => `<tg-emoji emoji-id="${id}">${ch || fallbackOf(id)}</tg-emoji>`;

// Teks biasa dengan token {e:ID} -> HTML (selebihnya di-escape)
function tokensToHtml(text) {
  return esc(String(text == null ? "" : text)).replace(TOKEN_RE, (m, id) => tag(id));
}

// ---------- entiti Telegram -> HTML (emoji premium + format asas) ----------
const OPEN = {
  MessageEntityBold: () => "<b>",
  MessageEntityItalic: () => "<i>",
  MessageEntityUnderline: () => "<u>",
  MessageEntityStrike: () => "<s>",
  MessageEntityCode: () => "<code>",
  MessageEntityPre: () => "<pre>",
  MessageEntityBlockquote: () => "<blockquote>",
  MessageEntityTextUrl: (e) => `<a href="${esc(e.url || "").replace(/"/g, "&quot;")}">`,
};
const CLOSE = {
  MessageEntityBold: "</b>",
  MessageEntityItalic: "</i>",
  MessageEntityUnderline: "</u>",
  MessageEntityStrike: "</s>",
  MessageEntityCode: "</code>",
  MessageEntityPre: "</pre>",
  MessageEntityBlockquote: "</blockquote>",
  MessageEntityTextUrl: "</a>",
};

// Senarai emoji premium dalam mesej: [{ id, ch, offset, length }]
function customEmojis(text, entities) {
  const out = [];
  for (const e of entities || []) {
    if (e && e.className === "MessageEntityCustomEmoji" && e.documentId !== undefined) {
      const off = Number(e.offset);
      const len = Number(e.length);
      out.push({ id: String(e.documentId), ch: String(text || "").slice(off, off + len) || STAR, offset: off, length: len });
    }
  }
  return out;
}

function entitiesToHtml(text, entities) {
  const s = String(text == null ? "" : text);
  const ents = (entities || [])
    .filter((e) => e && (OPEN[e.className] || (e.className === "MessageEntityCustomEmoji" && e.documentId !== undefined)))
    .map((e) => ({ e, start: Number(e.offset), end: Number(e.offset) + Number(e.length) }))
    .filter((x) => x.end > x.start && x.start >= 0 && x.end <= s.length);
  if (!ents.length) return tokensToHtml(s);

  const cuts = new Set([0, s.length]);
  for (const x of ents) {
    cuts.add(x.start);
    cuts.add(x.end);
  }
  const pts = [...cuts].sort((a, b) => a - b);
  let html = "";
  let open = []; // entiti format yang sedang terbuka (urutan buka)
  const closeTo = (n) => {
    while (open.length > n) html += CLOSE[open.pop().e.className];
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const emoji = ents.find((x) => x.e.className === "MessageEntityCustomEmoji" && x.start <= a && b <= x.end);
    const active = ents
      .filter((x) => x.e.className !== "MessageEntityCustomEmoji" && x.start <= a && b <= x.end)
      .sort((p, q) => p.start - q.start || q.end - p.end);
    let k = 0;
    while (k < open.length && k < active.length && open[k] === active[k]) k++;
    closeTo(k);
    for (let j = k; j < active.length; j++) {
      html += OPEN[active[j].e.className](active[j].e);
      open.push(active[j]);
    }
    if (emoji) {
      if (a === emoji.start) html += tag(emoji.e.documentId, s.slice(emoji.start, emoji.end));
    } else {
      html += tokensToHtml(s.slice(a, b));
    }
  }
  closeTo(0);
  return html;
}

module.exports = { tag, tokensToHtml, entitiesToHtml, customEmojis, fallbackOf, TOKEN_RE };

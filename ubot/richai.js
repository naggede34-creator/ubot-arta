// Bantuan untuk .autorich: palet emoji premium, arahan sistem AI, pembersih HTML, butang pautan
const PALETTE = [
  ["5456140674028019486", "\u26A1", "kilat (tajuk, tenaga)"],
  ["5424972470023104089", "\uD83D\uDD25", "api (panas, hebat)"],
  ["5215203703190989803", "\u26A1", "kilat biru"],
  ["5195033767969839232", "\uD83D\uDE80", "roket (pelancaran, laju)"],
  ["5258362837411045098", "\uD83D\uDC64", "pengguna / akaun"],
  ["6005561111099740638", "\u2611\uFE0F", "tanda semak / disahkan"],
  ["5352940967911517739", "\u23F3", "masa / tempoh / expired"],
  ["5296348778012361146", "\uD83C\uDFF7", "label / harga / kategori"],
  ["5852636219250317264", "\u2B50", "bintang (kelebihan, ulasan)"],
  ["5258134813302332906", "\uD83D\uDCE6", "pakej / produk"],
  ["6276228098962754124", "\uD83D\uDC8E", "permata (premium, VIP)"],
  ["5271604874419647061", "\uD83D\uDD17", "pautan"],
  ["5377585120888763078", "\u26A1", "kilat variasi"],
  ["5377830445125742842", "\u26A1", "kilat variasi"],
  ["5377849390226485511", "\u26A1", "kilat variasi"],
  ["5379980952430719020", "\u26A1", "kilat variasi"],
  ["5379598803420591096", "\u26A1", "kilat variasi"],
  ["5380055375624024630", "\u26A1", "kilat variasi"],
  ["5379683749283771273", "\u26A1", "kilat variasi"],
  ["5379621029876348049", "\u26A1", "kilat variasi"],
  ["5260726538302660868", "\u2705", "berjaya / siap"],
  ["5217822164362739968", "\uD83D\uDC51", "mahkota (owner, terbaik)"],
  ["5258108352008823107", "\u2795", "tambah"],
  ["5416081784641168838", "\uD83D\uDFE2", "aktif / tersedia"],
  ["6235524376070984680", "\uD83E\uDD96", "dinosaur (hiasan)"],
  ["6244617272808183303", "\uD83E\uDEB6", "bulu (hiasan)"],
  ["6242011198322119983", "\uD83E\uDEB6", "bulu (hiasan)"],
  ["6273839444311149115", "\uD83D\uDC51", "mahkota (tajuk, terbaik)"],
  ["6320831596324721328", "\u2B50", "bintang"],
  ["5231200819986047254", "\uD83D\uDCCA", "carta / statistik"],
  ["5402498632739996967", "\uD83D\uDC4B", "lambai / sapaan"],
  ["5260721826723549165", "\uD83E\uDD16", "robot / AI"],
  ["5368589393491669392", "\u2699\uFE0F", "tetapan / alat"],
  ["5411503950799060151", "\uD83D\uDD08", "pengumuman / pembesar suara"],
];
const PALETTE_MAP = new Map(PALETTE.map(([id, ch]) => [id, ch]));
// Semua ID dalam premiumids.js turut dibenarkan (tidak masuk senarai prompt AI supaya prompt tidak membengkak)
try {
  for (const [ch, id] of Object.entries(require("./premiumids").PREMIUM_MAP)) if (!PALETTE_MAP.has(id)) PALETTE_MAP.set(id, ch);
} catch (_) {}

const ALLOWED = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "b", "i", "u", "s", "code", "pre", "blockquote", "br", "hr",
  "table", "tr", "th", "td", "ul", "ol", "li", "input", "details", "summary", "footer", "a", "tg-emoji",
  "aside", "cite", "mark", "sub", "sup", "tg-spoiler", "tg-button-row", "tg-button",
]);
const ALIAS = { strong: "b", em: "i", del: "s", strike: "s", ins: "u" };

const stripTags = (s) => String(s).replace(/<[^>]*>/g, "");
const decode = (s) =>
  String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

function systemPrompt() {
  const pal = PALETTE.map(([id, ch, use]) => `${id} = ${ch} ${use}`).join("\n");
  return `Anda ialah penjana "Rich Message" Telegram yang kemas dan menarik.
Pulangkan HANYA satu objek JSON (tanpa teks lain): {"html": "<HTML>", "buttons": [{"text": "teks butang", "url": "https://..."}]}

PERATURAN HTML (hanya tag ini): h3, h4, p, b, i, u, s, code, pre, blockquote, br, hr, table, tr, th, td, ul, li, input, details, summary, footer, a, tg-emoji.
- Jadual: <table bordered><tr><th>Info</th><th>Nilai</th></tr><tr><td>...</td><td>...</td></tr></table>. Sel jadual hanya boleh teks/format ringkas (b, i, code, a, tg-emoji), bukan blok.
- Senarai semak: <ul><li><input type="checkbox" checked>teks</li><li><input type="checkbox">teks</li></ul>
- Bahagian boleh dibuka: <details><summary>Tajuk</summary>kandungan</details>
- Tajuk: <h3>. Penutup: <footer>...</footer>. Pemisah: <hr>.
- Emoji premium: <tg-emoji emoji-id="ID">emoji</tg-emoji> dan HANYA guna ID daripada senarai ini:
${pal}
- Guna sekurang-kurangnya 6 emoji premium: pada tajuk, setiap baris jadual (lajur pertama), dan setiap item senarai semak.
- Struktur yang diingini: tajuk h3 + perenggan pendek + SATU jadual (header Info/Nilai atau yang sesuai) + senarai semak (checkbox) + (pilihan) details + footer.
- Panjang HTML maksimum lebih kurang 2500 aksara. Ringkas, kemas dan seimbang.
- Bahasa: ikut bahasa permintaan pengguna (lalai Bahasa Melayu).
- Jangan reka pautan atau nombor telefon. Hanya masukkan pautan yang pengguna beri (atau yang anda pasti sah). Pautan masuk dalam <a href="https://..."> dan juga dalam "buttons" (maksimum 4).
- Jangan guna markdown, jangan guna tag lain, jangan beri penjelasan di luar JSON.`;
}

function attr(attrs, name) {
  const m = String(attrs).match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]) : null;
}

// Bersihkan HTML daripada AI: tag/atribut dibenarkan sahaja, ID emoji dalam palet sahaja, tag diseimbangkan
function sanitizeRich(raw, opts = {}) {
  const okId = (id) => !!id && (PALETTE_MAP.has(id) || (opts.anyEmoji && /^\d{15,20}$/.test(id)));
  let html = String(raw || "").replace(/\r/g, "");
  html = html.replace(/<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi, "").replace(/<!--[\s\S]*?-->/g, "");

  html = html.replace(/<tg-emoji\b([^>]*)>([\s\S]*?)<\/tg-emoji\s*>/gi, (m, attrs, inner) => {
    const id = attr(attrs, "emoji-id");
    const ch = id && (PALETTE_MAP.get(id) || (okId(id) && stripTags(inner).trim().slice(0, 4)) || (okId(id) && "\u2B50"));
    return ch ? `<tg-emoji emoji-id="${id}">${ch}</tg-emoji>` : stripTags(inner);
  });
  html = html.replace(/&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");

  const out = [];
  const stack = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^<>]*)?)>|([^<]+)|</g;
  let m;
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) {
      out.push(m[4]);
      continue;
    }
    if (m[2] === undefined) {
      out.push("&lt;");
      continue;
    }
    let name = m[2].toLowerCase();
    name = ALIAS[name] || name;
    const closing = m[1] === "/";
    const attrs = m[3] || "";
    if (!ALLOWED.has(name)) continue;

    if (closing) {
      const idx = stack.map((e) => e.name).lastIndexOf(name);
      if (idx === -1) continue;
      while (stack.length > idx) {
        const e = stack.pop();
        if (e.emit) out.push(`</${e.name}>`);
      }
      continue;
    }

    let open = null;
    switch (name) {
      case "a": {
        const h = attr(attrs, "href");
        open = h && /^(https?:\/\/|tg:\/\/)/i.test(decode(h)) ? `<a href="${h.replace(/"/g, "&quot;")}">` : null;
        break;
      }
      case "tg-emoji": {
        const id = attr(attrs, "emoji-id");
        open = okId(id) ? `<tg-emoji emoji-id="${id}">` : null;
        break;
      }
      case "th":
      case "td": {
        const cs = parseInt(attr(attrs, "colspan"), 10);
        const al = String(attr(attrs, "align") || "").toLowerCase();
        const va = String(attr(attrs, "valign") || "").toLowerCase();
        open = `<${name}` + (cs >= 2 && cs <= 6 ? ` colspan="${cs}"` : "") +
          (/^(left|center|right)$/.test(al) ? ` align="${al}"` : "") +
          (/^(top|middle|bottom)$/.test(va) ? ` valign="${va}"` : "") + ">";
        break;
      }
      case "table":
        open = "<table" + (/\bbordered\b/i.test(attrs) ? " bordered" : "") + (/\bstriped\b/i.test(attrs) ? " striped" : "") + (/\bcompact\b/i.test(attrs) ? " compact" : "") + ">";
        break;
      case "tg-button-row": {
        const al = String(attr(attrs, "align") || "").toLowerCase();
        open = /^(left|center|right)$/.test(al) ? `<tg-button-row align="${al}">` : "<tg-button-row>";
        break;
      }
      case "tg-button": {
        const u = attr(attrs, "url");
        const st = String(attr(attrs, "style") || "").toLowerCase();
        open = u && /^(https?:\/\/|tg:\/\/)/i.test(decode(u))
          ? `<tg-button type="url" url="${u.replace(/"/g, "&quot;")}"${/^(primary|success|danger|link)$/.test(st) ? ` style="${st}"` : ""}>`
          : null;
        break;
      }
      case "details":
        open = /\bopen\b/i.test(attrs) ? "<details open>" : "<details>";
        break;
      case "input":
        if (/type\s*=\s*["']?checkbox/i.test(attrs)) out.push(/\bchecked\b/i.test(attrs) ? '<input type="checkbox" checked>' : '<input type="checkbox">');
        continue;
      case "br":
      case "hr":
        out.push(`<${name}>`);
        continue;
      default:
        open = `<${name}>`;
    }
    stack.push({ name, emit: open !== null });
    if (open !== null) out.push(open);
  }
  while (stack.length) {
    const e = stack.pop();
    if (e.emit) out.push(`</${e.name}>`);
  }
  return out.join("").trim();
}

// Kumpul pautan: daripada "buttons" AI dan semua <a href> dalam HTML -> butang URL (unik, maksimum 6)
function extractButtons(html, aiButtons) {
  const seen = new Set();
  const btns = [];
  const host = (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch (_) {
      return "Buka pautan";
    }
  };
  const add = (text, url) => {
    url = decode(String(url || "").trim());
    if (!/^(https?:\/\/|tg:\/\/)/i.test(url) || seen.has(url)) return;
    seen.add(url);
    let t = stripTags(decode(text || "")).trim() || host(url);
    if (t.length > 28) t = t.slice(0, 27) + "\u2026";
    btns.push({ text: t, url });
  };
  for (const b of Array.isArray(aiButtons) ? aiButtons : []) if (b && b.url) add(b.text, b.url);
  const re = /<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) add(m[2], m[1]);
  return btns.slice(0, 6);
}

const layout = (buttons, perRow = 2) => {
  const rows = [];
  for (let i = 0; i < buttons.length; i += perRow) rows.push(buttons.slice(i, i + perRow));
  return rows;
};

// Versi teks (tanpa jadual) untuk jatuh balik
function richToText(html) {
  let t = String(html);
  t = t.replace(/<input type="checkbox" checked>/g, "\u2611 ").replace(/<input type="checkbox">/g, "\u2610 ");
  t = t
    .replace(/<summary>([\s\S]*?)<\/summary>/g, "<b>\u25BE $1</b>\n<blockquote expandable>")
    .replace(/<details(?: open)?>/g, "")
    .replace(/<\/details>/g, "</blockquote>\n");
  t = t.replace(/<tr>([\s\S]*?)<\/tr>/g, (m, row) => {
    const header = /<th[\s>]/.test(row);
    const cells = [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => c[1].trim());
    const line = cells.join(" : ");
    return (header ? `<b>${line}</b>` : line) + "\n";
  });
  t = t.replace(/<tg-button\b[^>]*\burl="([^"]+)"[^>]*>([\s\S]*?)<\/tg-button>/g, "\u25B6 $2: $1\n").replace(/<\/?tg-button-row[^>]*>/g, "");
  t = t.replace(/<aside>(?:<b>)?([\s\S]*?)(?:<\/b>)?<\/aside>/g, "<b>$1</b>\n").replace(/<h[125-6]>([\s\S]*?)<\/h[125-6]>/g, "<b>$1</b>\n");
  t = t.replace(/<\/?table[^>]*>/g, "").replace(/<h[34]>([\s\S]*?)<\/h[34]>/g, "<b>$1</b>\n\n");
  t = t.replace(/<li>/g, "\u2022 ").replace(/<\/li>/g, "\n").replace(/<\/?(?:ul|ol)>/g, "");
  t = t.replace(/<p>/g, "").replace(/<\/p>/g, "\n\n").replace(/<br>/g, "\n").replace(/<hr>/g, "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n");
  t = t.replace(/<footer>([\s\S]*?)<\/footer>/g, "<i>$1</i>\n");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

const plainText = (html) => decode(stripTags(richToText(html)));

module.exports = { PALETTE, PALETTE_MAP, systemPrompt, sanitizeRich, extractButtons, layout, richToText, plainText };

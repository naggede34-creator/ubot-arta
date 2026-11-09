// Penyambung antara fail SC (lib/*.js, TIDAK diubah) dan Rich HTML projek ini.
//   - blocksToRichHtml : block daripada lib/userbotBuildRich.js -> Rich HTML (jadual berkotak, details, senarai, footer) + butang
//   - wrapStandard     : ".autorich on" membungkus teks biasa dengan tema (header/footer) daripada lib/autorichPrefs.js STYLES
//   - emojify          : emoji biasa -> emoji premium (palet yang sudah terbukti), sebab "emoji: true"
const { esc } = require("./core");
const emo = require("./emo");
const richai = require("./richai");

let rev = null;
function reverse() {
  if (!rev) {
    rev = new Map();
    for (const [id, ch] of richai.PALETTE) if (!rev.has(ch)) rev.set(ch, id);
    try { // palet terbukti didahulukan, kemudian semua emoji dalam premiumids.js
      for (const [ch, id] of Object.entries(require("./premiumids").PREMIUM_MAP)) if (!rev.has(ch)) rev.set(ch, id);
    } catch (_) {}
  }
  return rev;
}
const PICT = /(\p{Extended_Pictographic}️?)/gu;
function emojifyText(s) {
  const map = reverse();
  return s.replace(PICT, (m) => {
    const id = map.get(m) || map.get(m.replace(/️/g, ""));
    return id ? emo.tag(id, m) : m;
  });
}
// html: ganti hanya teks di luar tag
function emojify(html) {
  let inEmoji = 0;
  return String(html).split(/(<[^>]*>)/).map((p) => {
    if (p.startsWith("<")) {
      if (/^<tg-emoji\b/i.test(p)) inEmoji++;
      else if (/^<\/tg-emoji/i.test(p)) inEmoji = Math.max(0, inEmoji - 1);
      return p;
    }
    return inEmoji ? p : emojifyText(p);
  }).join("");
}

// Format inline gaya markdown ringan (hanya di luar tag): **tebal**, __miring__, ~~coret~~, `kode`
function inlineFmt(html) {
  let skip = 0;
  return String(html).split(/(<[^>]*>)/).map((p) => {
    if (p.startsWith("<")) {
      if (/^<(tg-emoji|code|pre)\b/i.test(p)) skip++;
      else if (/^<\/(tg-emoji|code|pre)/i.test(p)) skip = Math.max(0, skip - 1);
      return p;
    }
    if (skip) return p;
    return p
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
      .replace(/__([^_\n]+)__/g, "<i>$1</i>")
      .replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
  }).join("");
}

const T = (s, useEmoji) => {
  const h = inlineFmt(emo.tokensToHtml(s));
  return useEmoji ? emojify(h) : h;
};

// Huruf "script" tebal (gaya merek di atas kartu): A-Z a-z -> huruf matematis; lainnya dibiarkan
function scriptFont(text) {
  return Array.from(String(text || "")).map((ch) => {
    const c = ch.codePointAt(0);
    if (c >= 65 && c <= 90) return String.fromCodePoint(0x1d4d0 + c - 65);
    if (c >= 97 && c <= 122) return String.fromCodePoint(0x1d4ea + c - 97);
    return ch;
  }).join("");
}

const attrEsc = (u) => String(u).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
// Tombol DI DALAM kartu (Bot API 10.3): <tg-button-row align="center"><tg-button type="url" ...>teks + emoji</tg-button></tg-button-row>
function ctaRow(btns, emoji) {
  return `<tg-button-row align="center">` + btns.map((b) =>
    `<tg-button type="url" url="${attrEsc(b.url)}" style="${b.style || "primary"}">${T(b.text, emoji)}${b.icon ? " " + emo.tag(b.icon) : ""}</tg-button>`
  ).join("") + `</tg-button-row>`;
}

// Hasil: { html, htmlLite, buttons, cardButtons }
//   html      : kartu lengkap (tombol CTA di dalam kartu)
//   htmlLite  : kartu yang sama TANPA tombol di dalam kartu (cadangan jika Telegram menolak <tg-button>)
//   buttons   : baris tombol keyboard di bawah pesan;  cardButtons: tombol CTA (dipindah ke keyboard pada versi lite)
function blocksToRichHtml(blocks, { emoji = true } = {}) {
  let full = "";
  let lite = "";
  const buttons = [];
  const cardButtons = [];
  const add = (h) => { full += h; lite += h; };
  for (const b of blocks) {
    if (b.type === "brand") add(`<h5>${T(scriptFont(b.text), emoji)}</h5>`);
    else if (b.type === "heading") {
      const n = Math.min(6, Math.max(1, Number(b.size) || 2));
      add(`<h${n}>${T(b.text, emoji)}</h${n}>`);
    } else if (b.type === "subheading") add(`<h4>${T(b.text, emoji)}</h4>`);
    else if (b.type === "title") add(`<aside><b>${T(b.text, emoji)}</b></aside>`);
    else if (b.type === "quote") add(`<blockquote>${T(b.text, emoji)}</blockquote>`);
    else if (b.type === "paragraph") add(`<p>${T(b.text, emoji)}</p>`);
    else if (b.type === "divider") add(`<hr>`);
    else if (b.type === "footer") add(`<footer>${T(b.text, emoji)}</footer>`);
    else if (b.type === "table") {
      add(`<table bordered>` + b.cells.map((row) => `<tr>` + row.map((c) => {
        const tag = c.is_header ? "th" : "td";
        const al = c.is_header ? ` align="center"` : "";
        return `<${tag}${c.colspan > 1 ? ` colspan="${c.colspan}"` : ""}${al} valign="middle">${T(c.text, emoji)}</${tag}>`;
      }).join("") + `</tr>`).join("") + `</table>`);
    } else if (b.type === "details") {
      const title = (b.summary || []).map((x) => x.text).join("");
      add(`<details><summary>${T(title, emoji)}</summary>${(b.blocks || []).map((p) => `<p>${T(p.text, emoji)}</p>`).join("")}</details>`);
    } else if (b.type === "list") {
      add(`<ul>${(b.items || []).map((it) => `<li>${it.has_checkbox ? `<input type="checkbox"${it.is_checked ? " checked" : ""}>` : ""}${T((it.blocks || []).map((p) => p.text).join(" "), emoji)}</li>`).join("")}</ul>`);
    } else if (b.type === "cta") {
      const btns = (b.buttons || []).slice(0, 3);
      if (btns.length) {
        full += ctaRow(btns, emoji);
        cardButtons.push(...btns.map((x) => ({ text: x.text, url: x.url, ...(x.style ? { style: x.style } : {}), ...(x.icon ? { icon: x.icon } : {}) })));
      }
    } else if (b.type === "buttons") buttons.push(b.buttons.map((x) => ({ text: x.text, url: x.url, ...(x.style ? { style: x.style } : {}), ...(x.icon ? { icon: x.icon } : {}) })));
  }
  return { html: full, htmlLite: lite, buttons, cardButtons };
}

// Pembungkus standar (tanpa AI): header tema + isi + footer (footer pilihan pengguna atau footer tema)
function wrapStandard(text, prefs, styles, entities) {
  const st = styles[prefs.style] || styles.default;
  const body = inlineFmt(entities && entities.length ? emo.entitiesToHtml(text, entities) : emo.tokensToHtml(text)).replace(/\n/g, "<br>");
  const footer = prefs.footer ? emo.tokensToHtml(prefs.footer) : esc(st.footer);
  let html = `<h3>${esc(st.header)}</h3><p>${body}</p><footer>${footer}</footer>`;
  if (prefs.emoji) html = emojify(html);
  return html;
}

module.exports = { blocksToRichHtml, wrapStandard, emojify, inlineFmt, scriptFont };

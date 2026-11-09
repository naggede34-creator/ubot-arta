// ═══════════════════════════════════════════════════════════════════════
// USERBOT BUILDRICH - parser buat ".buildrich": ngubah teks markup
// singkat jadi array block Rich Message (heading/divider/table/details/
// list/footer/paragraph/buttons) + versi fallback HTML biasa (kalau Rich
// Message via bot gak bisa dipake).
//
// FORMAT (tiap elemen 1 baris, keyword HURUF BESAR):
//   H(teks)              -> heading
//   D                    -> divider (garis pemisah)
//   T(teks)              -> tabel; baris ini = baris HEADER tabelnya
//   (sel) (sel)          -> baris data tabel (baris-baris yang diawali "("
//   (sel)(sel)              tepat di bawah T; spasi antar sel opsional)
//   EX(judul)            -> expandable/lipat; isinya = baris-baris teks
//   teks isi ...            di bawahnya, sampai ketemu baris kosong / keyword
//   L(teks)              -> list (bullet); item pertama = isi L(..), item
//   (teks) (teks)           berikutnya = baris-baris "(teks)" tepat di
//   (teks)(teks)            bawahnya (boleh beberapa item per baris, sama
//                           kayak baris sel tabel), sampai baris kosong/keyword
//   F(teks)              -> footer (catatan kecil di paling bawah pesan)
//   B(teks,link)         -> tombol link Rich Message (warna default).
//   BP(teks,link)           Varian warna: BP = primary (biru), BS = success
//   BS(teks,link)           (hijau), BD = danger (merah).
//   BD(teks,link)           1 BARIS = 1 baris tombol; beberapa tombol di baris
//                           yang sama (BS(..)BD(..)) jadi sejajar, baris baru
//                           = baris tombol baru (mis. layout 2-1).
//   teks biasa           -> paragraf
//
// Baris kosong = pemisah (nutup tabel/expandable/list yang lagi kebuka).
// Kalau baris di T punya sel lebih sedikit dari baris terlebar, sel
// terakhirnya otomatis di-colspan biar tabelnya tetep rapi (makanya
// "T(judul)" 1 sel jadi header selebar tabel).
// ═══════════════════════════════════════════════════════════════════════

const MAX_BLOCKS = 60;

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isKeywordLine(line) {
  return line === 'D' || /^H\(/.test(line) || /^T\(/.test(line) || /^EX\(/.test(line)
    || /^L\(/.test(line) || /^F\(/.test(line) || isButtonLine(line);
}

// ── Tombol: B(teks,link) / BP / BS / BD ──
const BTN_STYLES = { D: 'danger', P: 'primary', S: 'success' };

function isButtonLine(line) {
  return /^B[DPS]?\(/.test(line);
}

// Pisahin "teks,link" jadi [teks, link]. Koma yang dipake = koma pertama yang
// DIIKUTIN link (http(s)://, tg://, t.me/, www., @user) - biar teks tombol yang
// ada komanya atau URL yang ada komanya tetep aman; kalau gak ada, koma terakhir.
function splitTextLink(inner) {
  const m = inner.match(/,\s*(?=(?:https?:\/\/|tg:\/\/|t\.me\/|telegram\.me\/|www\.|@))/i);
  const idx = m ? m.index : inner.lastIndexOf(',');
  if (idx < 0) return null;
  return [inner.slice(0, idx).trim(), inner.slice(idx + 1).trim()];
}

// Rapihin link: @user -> https://t.me/user, t.me/x / www.x / domain.com -> tambah https://.
// Balikin null kalau bentuknya bukan link valid (yang boleh: http, https, tg).
function normalizeLink(raw) {
  let l = String(raw || '').trim();
  if (!l) return null;
  if (/^@[A-Za-z0-9_]{4,}$/.test(l)) return `https://t.me/${l.slice(1)}`;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(l) && /^[^\s/?#]+\.[a-z]{2,}([/?#]|$)/i.test(l)) l = `https://${l}`;
  return /^(https?|tg):\/\/\S+$/i.test(l) ? l : null;
}

// "BS(a,link)BD(b,link)" -> { buttons: [{text,url,style}, ...] } atau { error }.
function parseButtonLine(line, lineNo) {
  const buttons = [];
  const n = line.length;
  let i = 0;
  while (i < n) {
    if (/\s/.test(line[i])) { i++; continue; }
    const m = /^B([DPS]?)\(/.exec(line.slice(i));
    if (!m) {
      return { error: `Baris ${lineNo}: di baris tombol cuma boleh B(..) / BP(..) / BS(..) / BD(..), ada teks nyasar: \"${line.slice(i, i + 15)}\"` };
    }
    const open = i + m[0].length - 1;
    let depth = 0;
    let j = open;
    for (; j < n; j++) {
      if (line[j] === '(') depth++;
      else if (line[j] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) return { error: `Baris ${lineNo}: tanda kurung tombol gak ketutup.` };
    const parts = splitTextLink(line.slice(open + 1, j));
    if (!parts || !parts[0] || !parts[1]) {
      return { error: `Baris ${lineNo}: format tombol harus ${m[0]}teks,link) - teks & link-nya gak boleh kosong, dipisah koma.` };
    }
    const url = normalizeLink(parts[1]);
    if (!url) return { error: `Baris ${lineNo}: link tombol \"${parts[1].slice(0, 40)}\" gak valid (harus http://, https://, tg://, t.me/..., atau @username).` };
    const btn = { text: parts[0], url };
    if (BTN_STYLES[m[1]]) btn.style = BTN_STYLES[m[1]];
    buttons.push(btn);
    i = j + 1;
  }
  return { buttons };
}

// "(a) (b)(c)" -> ['a','b','c']. Kurung bersarang yang seimbang boleh
// (mis. "(Harga (Rp))" -> 'Harga (Rp)'). Balikin { cells } atau { error }.
function parseCells(str) {
  const cells = [];
  let i = 0;
  const n = str.length;
  while (i < n) {
    if (/\s/.test(str[i])) { i++; continue; }
    if (str[i] !== '(') {
      return { error: `ada teks di luar tanda kurung: "${str.slice(i, i + 15)}"` };
    }
    let depth = 0;
    let j = i;
    for (; j < n; j++) {
      if (str[j] === '(') depth++;
      else if (str[j] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) return { error: 'tanda kurung gak ketutup' };
    cells.push(str.slice(i + 1, j).trim());
    i = j + 1;
  }
  return { cells };
}

// "H(teks (bebas))" -> 'teks (bebas)'  (ambil dari kurung pertama sampai kurung tutup TERAKHIR)
function parseWrapped(line, keywordLen) {
  const rest = line.slice(keywordLen);
  if (rest[0] !== '(' || rest[rest.length - 1] !== ')') return null;
  return rest.slice(1, -1).trim();
}

function buildTable(rows) {
  const maxCols = Math.max(...rows.map((r) => r.length));
  const cells = rows.map((row, ri) => row.map((text, ci) => {
    const cell = {
      align: ri === 0 ? 'center' : 'left',
      valign: 'middle',
      text,
    };
    if (ri === 0) cell.is_header = true;
    // sel terakhir baris yang kependekan di-colspan biar tabel tetep rapi
    if (ci === row.length - 1 && row.length < maxCols) cell.colspan = maxCols - row.length + 1;
    return cell;
  }));
  return { type: 'table', is_bordered: true, is_striped: true, cells };
}

/**
 * @param {string} raw teks markup (tanpa ".buildrich")
 * @returns {{ blocks: Array } | { error: string }}
 */
function parseRichMarkup(raw) {
  const lines = String(raw || '').replace(/\r/g, '').split('\n').map((l) => l.trim());
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const lineNo = i + 1;

    if (!line) { i++; continue; }

    if (line === 'D') {
      blocks.push({ type: 'divider' });
      i++;
      continue;
    }

    if (/^H\(/.test(line)) {
      const text = parseWrapped(line, 1);
      if (text === null || !text) return { error: `Baris ${lineNo}: format heading harus H(teks) dan teksnya gak boleh kosong.` };
      blocks.push({ type: 'heading', text, size: 2 });
      i++;
      continue;
    }

    if (/^T\(/.test(line)) {
      const first = parseCells(line.slice(1));
      if (first.error) return { error: `Baris ${lineNo}: ${first.error}.` };
      const rows = [first.cells];
      i++;
      while (i < lines.length && lines[i].startsWith('(')) {
        const r = parseCells(lines[i]);
        if (r.error) return { error: `Baris ${i + 1}: ${r.error}.` };
        rows.push(r.cells);
        i++;
      }
      blocks.push(buildTable(rows));
      continue;
    }

    if (isButtonLine(line)) {
      const r = parseButtonLine(line, lineNo);
      if (r.error) return { error: r.error };
      blocks.push({ type: 'buttons', buttons: r.buttons });
      i++;
      continue;
    }

    if (/^EX\(/.test(line)) {
      const title = parseWrapped(line, 2);
      if (title === null || !title) return { error: `Baris ${lineNo}: format expandable harus EX(judul) dan judulnya gak boleh kosong.` };
      i++;
      const inner = [];
      while (i < lines.length && lines[i] && !isKeywordLine(lines[i])) {
        inner.push({ type: 'paragraph', text: lines[i] });
        i++;
      }
      if (!inner.length) return { error: `Baris ${lineNo}: EX(${title}) butuh minimal 1 baris isi tepat di bawahnya.` };
      blocks.push({ type: 'details', summary: [{ type: 'bold', text: title }], blocks: inner });
      continue;
    }

    if (/^L\(/.test(line)) {
      const first = parseWrapped(line, 1);
      if (first === null || !first) return { error: `Baris ${lineNo}: format list harus L(teks) dan teksnya gak boleh kosong.` };
      const items = [first];
      i++;
      while (i < lines.length && lines[i].startsWith('(')) {
        const r = parseCells(lines[i]);
        if (r.error) return { error: `Baris ${i + 1}: ${r.error}.` };
        for (const cell of r.cells) {
          if (!cell) return { error: `Baris ${i + 1}: item list gak boleh kosong.` };
          items.push(cell);
        }
        i++;
      }
      blocks.push({
        type: 'list',
        items: items.map((text) => ({ blocks: [{ type: 'paragraph', text }] })),
      });
      continue;
    }

    if (/^F\(/.test(line)) {
      const text = parseWrapped(line, 1);
      if (text === null || !text) return { error: `Baris ${lineNo}: format footer harus F(teks) dan teksnya gak boleh kosong.` };
      blocks.push({ type: 'footer', text });
      i++;
      continue;
    }

    blocks.push({ type: 'paragraph', text: line });
    i++;
  }

  if (!blocks.length) return { error: 'Belum ada isi yang bisa dibikin.' };
  if (blocks.length > MAX_BLOCKS) return { error: `Kebanyakan elemen (${blocks.length}), maksimal ${MAX_BLOCKS}.` };
  return { blocks };
}

// Versi HTML biasa (parseMode html) - dipake kalau Rich Message via bot gak bisa.
function blocksToHtml(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.type === 'heading') out.push(`<b>${esc(b.text)}</b>`);
    else if (b.type === 'paragraph') out.push(esc(b.text));
    else if (b.type === 'divider') out.push('──────────────');
    else if (b.type === 'table') {
      const lines = b.cells.map((row) => row.map((c) => c.text).join(' │ '));
      out.push(`<pre>${esc(lines.join('\n'))}</pre>`);
    } else if (b.type === 'buttons') {
      out.push(b.buttons.map((btn) => `<a href="${esc(btn.url).replace(/\"/g, '&quot;')}">${esc(btn.text)}</a>`).join(' │ '));
    } else if (b.type === 'details') {
      const title = (b.summary || []).map((s) => s.text).join('');
      const body = (b.blocks || []).map((p) => esc(p.text)).join('\n');
      out.push(`<blockquote expandable><b>${esc(title)}</b>\n${body}</blockquote>`);
    } else if (b.type === 'list') {
      const lines = (b.items || []).map((item) => {
        const itemText = (item.blocks || []).map((p) => p.text).join(' ');
        return `• ${esc(itemText)}`;
      });
      out.push(lines.join('\n'));
    } else if (b.type === 'footer') {
      out.push(`<i>${esc(b.text)}</i>`);
    }
  }
  return out.join('\n');
}

// Deskripsi singkat buat hasil inline (cuma kelihatan di daftar inline, bukan di pesan).
function describeBlocks(blocks) {
  const first = blocks.find((b) => b.type === 'heading' || b.type === 'paragraph');
  const t = first ? String(first.text) : `${blocks.length} elemen`;
  return t.length > 60 ? t.slice(0, 59) + '…' : t;
}

module.exports = { parseRichMarkup, blocksToHtml, describeBlocks };

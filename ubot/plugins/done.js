// .done : invoice "Transaksi Berhasil" sebagai kad Rich (jadual + kotak semak + emoji premium)
//   .done barang,jumlah,harga
//   .done Sc Ubot,1,3000
//   .done Sc Ubot,1,3000; Panel 1GB,2,5k        (banyak item: pisahkan dengan ; atau baris baru)
// jumlah = kuantiti, harga = harga SATU unit. Jumlah baris = jumlah x harga. Grandtotal = jumlah semua baris.
// Harga boleh ditulis: 3000  3.000  3,000  3k  3rb  1.5jt  rp3000  idr3000
// Mata wang (lalai IDR) boleh ditukar dalam config.json: "currency": "IDR"
// ASCII sahaja (emoji ditulis sebagai \uXXXX).
const K = require("../kit");
const { need, UserErr, esc, clip } = K;
const { em, fmtTime, TZL, cfg } = require("../core");

// ===== Emoji premium =====
// Semua ID di bawah diambil daripada palet yang SUDAH berfungsi dalam projek ini (richai.js / ui.js).
// Mahu tukar ikon? Gantikan ID (nombor dalam petikan) dengan ID emoji premium pilihan anda.
// PENTING: satu ID yang tidak sah boleh menyebabkan SEMUA emoji premium pada kad gagal dipasang.
const EM = {
  title: ["5296348778012361146", "🏷"], // tajuk "Transaksi Berhasil" + lajur Total + baris Invoice
  party: ["5195033767969839232", "🚀"], // petikan "Pembayaran diterima"
  trx: ["5271604874419647061", "🔗"], // Trxno
  date: ["5352940967911517739", "⏳"], // Tanggal
  status: ["5416081784641168838", "🟢"], // Status
  grand: ["6276228098962754124", "💎"], // Grandtotal
  box: ["5258134813302332906", "📦"], // Item Detail + lajur Produk
  qty: ["5231200819986047254", "📊"], // lajur Qty
  ok: ["5260726538302660868", "✅"], // Pembayaran dikonfirmasi
  thanks: ["5852636219250317264", "⭐"], // Terima kasih
};
const ico = (k) => em(EM[k][0], EM[k][1]);

const MAX_ITEMS = 15;
const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const USAGE = ".done barang,jumlah,harga\nContoh: .done Sc Ubot,1,3000\nBanyak item: .done Sc Ubot,1,3000; Panel,2,5k";

// ---------- penghurai ----------
// 3000 | 3.000 | 3,000 | 1.250.000 | 12,50 | 3k | 3rb | 3ribu | 1.5jt | rp3000 | idr 3000 -> nombor (atau NaN)
function parseMoney(s) {
  let t = String(s || "").trim().toLowerCase().replace(/^(rp\.?|idr|rm|myr|usd|sgd|\$)\s*/, "").replace(/\s+/g, "");
  let mult = 1;
  const m = t.match(/^(.*?)(k|rb|ribu|jt|juta)$/);
  if (m) {
    t = m[1];
    mult = /^(jt|juta)$/.test(m[2]) ? 1e6 : 1e3;
  }
  if (!/^\d[\d.,]*$/.test(t)) return NaN;
  let n;
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) n = Number(t.replace(/[.,]/g, "")); // pemisah ribuan
  else if (/^\d+[.,]\d{1,2}$/.test(t)) n = Number(t.replace(",", ".")); // perpuluhan
  else if (/^\d+$/.test(t)) n = Number(t);
  else return NaN;
  return Math.round(n * mult * 100) / 100;
}
function parseQty(s) {
  const t = String(s || "").trim().toLowerCase().replace(/^x\s*/, "").replace(/\s*x$/, "").replace(",", ".");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

// "nama,jumlah,harga" -> { name, qty, price, total }.  Nama boleh ada koma: jumlah & harga dibaca dari kanan.
function parseItem(row, n) {
  const parts = row.split(",").map((x) => x.trim());
  if (parts.length < 3) throw new UserErr(`Item ${n} ("${clip(row, 30)}") tidak lengkap.\nGuna: ${USAGE}`);
  const price = parseMoney(parts.pop());
  const qty = parseQty(parts.pop());
  const name = parts.join(", ").trim();
  if (!name) throw new UserErr(`Item ${n}: nama barang kosong.\nGuna: ${USAGE}`);
  if (!(qty > 0) || qty > 99999) throw new UserErr(`Item ${n} (${clip(name, 24)}): jumlah mesti nombor lebih dari 0.\nContoh: .done ${clip(name, 24)},1,3000`);
  if (!(price >= 0) || price > 1e12) throw new UserErr(`Item ${n} (${clip(name, 24)}): harga tidak sah.\nContoh harga: 3000  3.000  3k  1.5jt`);
  return { name, qty, price, total: Math.round(qty * price * 100) / 100 };
}

// ---------- format ----------
const num = (n) => {
  const [i, d] = (Math.round(n * 100) / 100).toFixed(2).split(".");
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return d === "00" ? g : `${g},${d}`; // 3.000  |  3.000,50
};
const money = (n) => `${num(n)} ${cfg.currency || "IDR"}`;
const qtyText = (q) => (Number.isInteger(q) ? String(q) : String(q).replace(".", ","));

// Masa dalam zon waktu config.json (timezone_offset): trxno + tarikh
function stamp(ms = Date.now()) {
  const s = fmtTime(ms, true); // "2026-10-23 12:30:10"
  const [y, mo, d, h, mi, se] = s.match(/\d+/g).map(Number);
  const p2 = (x) => String(x).padStart(2, "0");
  return {
    trxno: `TRX${y}${p2(mo)}${p2(d)}${p2(h)}${p2(mi)}${p2(se)}`,
    date: `${d} ${MONTHS_ID[mo - 1]} ${y} ${p2(h)}:${p2(mi)}:${p2(se)} ${TZL}`,
  };
}

// ---------- kad ----------
function build(items, account, ms) {
  const { trxno, date } = stamp(ms);
  const grand = Math.round(items.reduce((a, i) => a + i.total, 0) * 100) / 100;
  const sumQty = items.reduce((a, i) => a + i.qty, 0);
  const who = account && account.username ? `@${esc(account.username)}` : esc((account && account.name) || "-");

  const info = [
    ["trx", "Trxno", `<b>${esc(trxno)}</b>`],
    ["date", "Tanggal", esc(date)],
    ["status", "Status", "<code>LUNAS</code>"],
    ["grand", "Grandtotal", `<b>${esc(money(grand))}</b>`],
  ];
  const rows = items
    .map((it, i) => `<tr><td>${i + 1}</td><td>${esc(clip(it.name, 40))}</td><td>${esc(qtyText(it.qty))}</td><td>${esc(money(it.total))}</td></tr>`)
    .join("");
  const sumRow = `<tr><td></td><td>${ico("grand")} <b>Grandtotal</b></td><td><b>${esc(qtyText(sumQty))}</b></td><td><b>${esc(money(grand))}</b></td></tr>`;

  const html =
    `<h3>${ico("title")} Transaksi Berhasil ✓</h3>` +
    `<blockquote>${ico("party")} Pembayaran diterima dan transaksi sudah dicatat.</blockquote>` +
    `<table bordered>${info.map(([k, l, v]) => `<tr><td>${ico(k)} ${l}</td><td>${v}</td></tr>`).join("")}</table>` +
    `<h3>${ico("box")} Item Detail</h3>` +
    `<table bordered><tr><th>No</th><th>${ico("box")} Produk</th><th>${ico("qty")} Qty</th><th>${ico("title")} Total</th></tr>${rows}${sumRow}</table>` +
    `<ul><li><input type="checkbox" checked>${ico("ok")} Pembayaran dikonfirmasi</li>` +
    `<li><input type="checkbox" checked>${ico("title")} Invoice ${items.length} item tercatat</li></ul>` +
    `<hr>` +
    `<p>${ico("thanks")} Terima kasih telah membeli produk kami</p>` +
    `<footer>${require("../ui").customFooter(account) || `Userbot By ${who}`}</footer>`;

  const text =
    `${ico("title")} <b>Transaksi Berhasil ✓</b>\n` +
    `<blockquote>${ico("party")} Pembayaran diterima dan transaksi sudah dicatat.</blockquote>\n` +
    info.map(([k, l, v]) => `${ico(k)} ${l} : ${v}`).join("\n") +
    `\n\n${ico("box")} <b>Item Detail</b>\n` +
    items.map((it, i) => `${i + 1}. ${esc(clip(it.name, 40))} — ${esc(qtyText(it.qty))} x ${esc(money(it.price))} = <b>${esc(money(it.total))}</b>`).join("\n") +
    `\n${ico("grand")} <b>Grandtotal : ${esc(money(grand))}</b>\n\n` +
    `☑ ${ico("ok")} Pembayaran dikonfirmasi\n☑ ${ico("title")} Invoice ${items.length} item tercatat\n\n` +
    `${ico("thanks")} Terima kasih telah membeli produk kami\n<i>${require("../ui").customFooter(account) || `Userbot By ${who}`}</i>`;
  return { html, text, trxno, grand };
}

// ---------- arahan ----------
const defs = [
  {
    cmd: "done",
    alias: ["invoice"],
    desc: "invoice transaksi (kad Rich): .done barang,jumlah,harga  |  banyak item: pisah dengan ;",
    async run(ctx) {
      // teks mentah selepas arahan (kekalkan baris baru); ctx.args sudah dipecah oleh ruang
      const raw = String(ctx.msg.message || "").trim().replace(/^\S+\s*/, "").trim();
      need(raw, USAGE);
      const rows = raw.split(/;|\r?\n/).map((r) => r.trim()).filter(Boolean);
      if (rows.length > MAX_ITEMS) throw new UserErr(`Maksimum ${MAX_ITEMS} item sekali invoice (anda hantar ${rows.length}).`);
      const items = rows.map((r, i) => parseItem(r, i + 1));
      const c = build(items, ctx.account, Date.now());
      await K.show(ctx, { html: c.html, text: c.text });
    },
  },
];

const plugin = K.plugin("done", "Utilitas", defs);
plugin._test = { parseMoney, parseQty, parseItem, num, money, stamp, build };
module.exports = plugin;

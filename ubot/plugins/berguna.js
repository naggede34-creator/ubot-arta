// BERGUNA - alat harian + alat jualan (cocok untuk reseller). Semua hasil = kartu Rich + emoji premium.
//   .terbilang <angka>                    angka -> kata (kwitansi): 1250000 -> satu juta dua ratus lima puluh ribu rupiah
//   .patungan <total> <orang> [pajak%] [service%]   bagi tagihan + pembulatan per orang
//   .untung <modal> <jual> [jumlah]       untung / rugi, margin, markup
//   .diskon <harga> <persen> [persen2]    hitung diskon (bisa bertingkat)
//   .cekpass <kata sandi>                 kekuatan kata sandi (isi tidak ditampilkan lagi)
//   .jam [kota ...]                       jam dunia (jakarta, tokyo, london, ...)
//   .invoice <nominal> <barang>           invoice rapi siap kirim ke pembeli (memuat rekening dari .setnorek)
// ASCII saja.
const crypto = require("crypto");
const K = require("../kit");
const { R, H, need, out, UserErr, esc } = K;
const { parseMoney } = require("../money");
const db = require("../db");
const { fmtTime, TZL } = require("../core");

// 1250000 -> "1.250.000"
const fmtN = (n, d = 0) => {
  const [i, f] = (Math.round(n * 10 ** d) / 10 ** d).toFixed(d).split(".");
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (f ? "," + f : "");
};
const rp = (n, d = 0) => "Rp" + fmtN(n, d);
const money = (s, usage) => {
  const v = parseMoney(s);
  if (!(v >= 0)) throw new UserErr("Nominal tidak valid. Contoh: 25000 | 25k | 1,5jt\nGuna: " + usage);
  return v;
};
const pctArg = (s, usage, max = 100) => {
  const v = Number(String(s).replace("%", "").replace(",", "."));
  if (!Number.isFinite(v) || v < 0 || v > max) throw new UserErr(`Persen tidak valid (0-${max}).\nGuna: ${usage}`);
  return v;
};

// ---------------------------------------------------------------- terbilang
const SAT = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
function terbilang(n) {
  n = Math.floor(n);
  if (n === 0) return "nol";
  const t = (x) => {
    if (x < 12) return SAT[x];
    if (x < 20) return t(x - 10) + " belas";
    if (x < 100) return (t(Math.floor(x / 10)) + " puluh " + t(x % 10)).trim();
    if (x < 200) return ("seratus " + t(x - 100)).trim();
    if (x < 1000) return (t(Math.floor(x / 100)) + " ratus " + t(x % 100)).trim();
    if (x < 2000) return ("seribu " + t(x - 1000)).trim();
    if (x < 1e6) return (t(Math.floor(x / 1000)) + " ribu " + t(x % 1000)).trim();
    if (x < 1e9) return (t(Math.floor(x / 1e6)) + " juta " + t(x % 1e6)).trim();
    if (x < 1e12) return (t(Math.floor(x / 1e9)) + " miliar " + t(x % 1e9)).trim();
    return (t(Math.floor(x / 1e12)) + " triliun " + t(x % 1e12)).trim();
  };
  return t(n).replace(/\s+/g, " ").trim();
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- kata sandi
const COMMON = ["password", "123456", "qwerty", "admin", "welcome", "letmein", "iloveyou", "sayang", "indonesia", "rahasia", "abc123", "11111", "000000"];
function assess(pw) {
  const sets = [
    [/[a-z]/.test(pw), 26, "Huruf kecil"], [/[A-Z]/.test(pw), 26, "Huruf besar"],
    [/\d/.test(pw), 10, "Angka"], [/[^A-Za-z0-9]/.test(pw), 33, "Simbol"],
  ];
  const pool = sets.reduce((a, [ok, n]) => a + (ok ? n : 0), 0) || 1;
  let bits = pw.length * Math.log2(pool);
  const low = pw.toLowerCase();
  const flags = [];
  if (COMMON.some((c) => low.includes(c))) { bits *= 0.4; flags.push("Mengandung kata umum"); }
  if (/(.)\1{2,}/.test(pw)) { bits *= 0.75; flags.push("Karakter berulang"); }
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|asdf|zxcv)/i.test(pw)) { bits *= 0.7; flags.push("Pola berurutan"); }
  if (new Set(pw).size < pw.length / 2) { bits *= 0.8; flags.push("Variasi karakter sedikit"); }
  return { bits, sets, flags };
}
function human(sec) {
  if (sec < 1) return "kurang dari 1 detik";
  const U = [["tahun", 31557600], ["hari", 86400], ["jam", 3600], ["menit", 60], ["detik", 1]];
  if (sec > 31557600 * 1e9) return "lebih dari 1 miliar tahun";
  for (const [n, v] of U) if (sec >= v) return `${fmtN(Math.floor(sec / v))} ${n}`;
  return "sebentar";
}

// ---------------------------------------------------------------- jam dunia
const ZONES = {
  jakarta: ["WIB - Jakarta", "Asia/Jakarta"], wib: ["WIB - Jakarta", "Asia/Jakarta"],
  makassar: ["WITA - Makassar", "Asia/Makassar"], wita: ["WITA - Makassar", "Asia/Makassar"],
  jayapura: ["WIT - Jayapura", "Asia/Jayapura"], wit: ["WIT - Jayapura", "Asia/Jayapura"],
  kl: ["Kuala Lumpur", "Asia/Kuala_Lumpur"], singapore: ["Singapura", "Asia/Singapore"],
  tokyo: ["Tokyo", "Asia/Tokyo"], seoul: ["Seoul", "Asia/Seoul"],
  mekkah: ["Mekkah", "Asia/Riyadh"], dubai: ["Dubai", "Asia/Dubai"],
  london: ["London", "Europe/London"], paris: ["Paris", "Europe/Paris"],
  newyork: ["New York", "America/New_York"], la: ["Los Angeles", "America/Los_Angeles"],
  sydney: ["Sydney", "Australia/Sydney"],
};
const DEFAULT_ZONES = ["jakarta", "makassar", "jayapura", "kl", "tokyo", "mekkah", "london", "newyork"];
function clock(tz, at = new Date()) {
  const f = (o) => new Intl.DateTimeFormat("id-ID", { timeZone: tz, ...o }).format(at);
  return `${f({ hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":")} \u00B7 ${f({ weekday: "short", day: "2-digit", month: "short" })}`;
}

const defs = [
  {
    cmd: "terbilang", alias: ["kata"], desc: "angka jadi kata: .terbilang 1250000",
    async run(ctx) {
      need(ctx.args.length, ".terbilang 1250000  (atau 25k, 1,5jt)");
      const v = money(ctx.args[0], ".terbilang 1250000");
      if (v >= 1e15) throw new UserErr("Angka terlalu besar (maksimal 999 triliun).");
      const w = terbilang(v);
      await out(ctx, "Terbilang", "chart", [
        R("tag", "Angka", fmtN(v)),
        H("gem", "Rupiah", `<b>${esc(rp(v))}</b>`),
      ], {
        extra: K.bq(`${cap(w)} rupiah`), extraText: esc(`${cap(w)} rupiah`),
        checks: [[true, "Siap ditempel ke kwitansi / invoice"]],
      });
    },
  },
  {
    cmd: "patungan", alias: ["split", "bagi"], desc: "bagi tagihan: .patungan <total> <orang> [pajak%] [service%]",
    async run(ctx) {
      const U = ".patungan 250k 4 10 5   (total, jumlah orang, pajak%, service%)";
      need(ctx.args.length >= 2, U);
      const total = money(ctx.args[0], U);
      const n = Number(ctx.args[1]);
      if (!Number.isInteger(n) || n < 1 || n > 500) throw new UserErr("Jumlah orang harus bilangan bulat 1-500.\nGuna: " + U);
      const pajak = ctx.args[2] !== undefined ? pctArg(ctx.args[2], U, 100) : 0;
      const service = ctx.args[3] !== undefined ? pctArg(ctx.args[3], U, 100) : 0;
      const svc = (total * service) / 100;
      const tax = ((total + svc) * pajak) / 100;
      const grand = total + svc + tax;
      const per = grand / n;
      const round = Math.ceil(per / 100) * 100;
      await out(ctx, "Patungan", "box", [
        R("tag", "Tagihan", rp(total)),
        ...(service ? [R("plus", `Service ${service}%`, rp(svc, 0))] : []),
        ...(pajak ? [R("plus", `Pajak ${pajak}%`, rp(tax, 0))] : []),
        H("chart", "Grand total", `<b>${esc(rp(grand))}</b>`),
        R("user", "Jumlah orang", `${n} orang`),
        R("bolt", "Per orang (pas)", rp(per, 0)),
        H("gem", "Per orang (bulat)", `<b>${esc(rp(round))}</b>`),
      ], {
        checks: [[true, "Pembulatan ke atas per Rp100"], [round * n - grand > 0, `Kelebihan terkumpul ${rp(round * n - grand)}`]],
      });
    },
  },
  {
    cmd: "untung", alias: ["profit", "margin"], desc: "untung / rugi: .untung <modal> <jual> [jumlah]",
    async run(ctx) {
      const U = ".untung 15k 25k 10   (modal, harga jual, jumlah opsional)";
      need(ctx.args.length >= 2, U);
      const modal = money(ctx.args[0], U);
      const jual = money(ctx.args[1], U);
      const qty = ctx.args[2] !== undefined ? Number(ctx.args[2]) : 1;
      if (!Number.isInteger(qty) || qty < 1 || qty > 1e6) throw new UserErr("Jumlah harus bilangan bulat >= 1.\nGuna: " + U);
      if (!(modal > 0)) throw new UserErr("Modal harus lebih dari 0.");
      const per = jual - modal;
      const margin = jual > 0 ? (per / jual) * 100 : 0;
      const markup = (per / modal) * 100;
      const win = per >= 0;
      await out(ctx, win ? "Untung" : "Rugi", win ? "ok" : "no", [
        R("box", "Modal", rp(modal)),
        R("tag", "Harga jual", rp(jual)),
        H(win ? "green" : "no", "Selisih / unit", `<b>${esc((win ? "+" : "-") + rp(Math.abs(per)))}</b>`),
        R("chart", "Margin", `${fmtN(margin, 1)}%`),
        R("fire", "Markup", `${fmtN(markup, 1)}%`),
        ...(qty > 1 ? [H("gem", `Total (${fmtN(qty)} unit)`, `<b>${esc((win ? "+" : "-") + rp(Math.abs(per * qty)))}</b>`)] : []),
      ], {
        checks: [[win, win ? "Harga jual di atas modal" : "Harga jual di bawah modal"], [margin >= 20, margin >= 20 ? "Margin sehat (20% ke atas)" : "Margin tipis (di bawah 20%)"]],
      });
    },
  },
  {
    cmd: "diskon", alias: ["disc2"], desc: "hitung diskon: .diskon <harga> <persen> [persen2]",
    async run(ctx) {
      const U = ".diskon 200k 30   atau   .diskon 200k 30 10  (diskon bertingkat)";
      need(ctx.args.length >= 2, U);
      const harga = money(ctx.args[0], U);
      const d1 = pctArg(ctx.args[1], U);
      const d2 = ctx.args[2] !== undefined ? pctArg(ctx.args[2], U) : 0;
      const after1 = harga * (1 - d1 / 100);
      const final = after1 * (1 - d2 / 100);
      const hemat = harga - final;
      await out(ctx, "Hitung Diskon", "gift", [
        R("tag", "Harga awal", rp(harga)),
        R("fire", "Diskon 1", `${fmtN(d1, 1)}% (${rp(harga - after1, 0)})`),
        ...(d2 ? [R("fire", "Diskon 2", `${fmtN(d2, 1)}% (${rp(after1 - final, 0)})`)] : []),
        R("chart", "Total hemat", `${rp(hemat, 0)} (${fmtN(harga ? (hemat / harga) * 100 : 0, 1)}%)`),
        H("gem", "Bayar", `<b>${esc(rp(final, 0))}</b>`),
      ], { checks: [[true, d2 ? "Diskon kedua dihitung dari harga setelah diskon pertama" : "Diskon tunggal"]] });
    },
  },
  {
    cmd: "cekpass", alias: ["kuatpass"], desc: "cek kekuatan kata sandi: .cekpass <teks>",
    async run(ctx) {
      const pw = ctx.args.join(" ");
      need(pw, ".cekpass <kata sandi>  (jangan pakai kata sandi asli akunmu)");
      if (pw.length > 128) throw new UserErr("Maksimal 128 karakter.");
      const a = assess(pw);
      const bits = Math.max(0, a.bits);
      const label = bits < 28 ? "Sangat lemah" : bits < 40 ? "Lemah" : bits < 60 ? "Sedang" : bits < 80 ? "Kuat" : "Sangat kuat";
      const pct = Math.max(5, Math.min(100, Math.round((bits / 90) * 100)));
      const bar = "\u2588".repeat(Math.round(pct / 10)) + "\u2591".repeat(10 - Math.round(pct / 10));
      await out(ctx, "Cek Kata Sandi", bits >= 60 ? "ok" : "warn", [
        R("tag", "Panjang", `${pw.length} karakter`),
        H("fire", "Kekuatan", `<b>${esc(label)}</b> ${bar}`),
        R("chart", "Entropi", `${fmtN(bits, 0)} bit`),
        R("time", "Ditebak dalam", human(Math.pow(2, bits) / 2 / 1e10)),
      ], {
        checks: [
          ...a.sets.map(([ok, , name]) => [ok, name]),
          [pw.length >= 12, "Panjang 12 karakter ke atas"],
          ...a.flags.map((f) => [false, f]),
          [false, "Kata sandi tidak ditampilkan ulang. Hapus pesan perintahmu bila perlu."],
        ],
      });
    },
  },
  {
    cmd: "jam", alias: ["worldclock", "zona"], desc: "jam dunia: .jam [jakarta tokyo london ...]",
    async run(ctx) {
      const want = ctx.args.map((x) => x.toLowerCase().replace(/[^a-z]/g, "")).filter(Boolean);
      const unknown = want.filter((w) => !ZONES[w]);
      if (unknown.length) throw new UserErr(`Zona tidak dikenal: ${unknown.join(", ")}\nPilihan: ${[...new Set(Object.keys(ZONES))].join(", ")}`);
      const keys = (want.length ? want : DEFAULT_ZONES).slice(0, 12);
      const now = new Date();
      await out(ctx, "Jam Dunia", "time", keys.map((k) => R(k === "jakarta" || k === "wib" ? "star" : "time", ZONES[k][0], clock(ZONES[k][1], now))), {
        headers: ["Zona", "Waktu"],
        checks: [[true, "Waktu dihitung dari jam server, sudah termasuk DST"]],
      });
    },
  },
  {
    cmd: "invoice", alias: ["inv", "kwitansi"], desc: "buat invoice: .invoice <nominal> <barang>",
    async run(ctx) {
      const U = ".invoice 50k Paket GOLD 30 hari";
      need(ctx.args.length >= 2, U);
      const v = money(ctx.args[0], U);
      if (!(v > 0)) throw new UserErr("Nominal harus lebih dari 0.");
      if (v >= 1e15) throw new UserErr("Nominal terlalu besar.");
      const item = ctx.args.slice(1).join(" ").slice(0, 80);
      const d = new Date();
      const no = `INV-${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}-${crypto.randomInt(1000, 10000)}`;
      const me = db.getUser(ctx.account.userId) || {};
      const reks = Array.isArray(me.rek) ? me.rek.slice(0, 3) : []; // dari .setnorek
      const w = terbilang(v);
      await out(ctx, "Invoice", "tag", [
        R("tag", "No. invoice", no),
        R("time", `Tanggal (${TZL})`, fmtTime(Date.now())),
        R("box", "Barang / jasa", item),
        H("gem", "Total", `<b>${esc(rp(v))}</b>`),
        R("user", "Penerbit", ctx.account.username ? "@" + ctx.account.username : ctx.account.name || "-"),
        ...reks.map((r) => R("link", `Bayar ke ${r.bank}`, `${r.no} a/n ${r.nama}`)),
        H("fire", "Status", "<b>Menunggu pembayaran</b>"),
      ], {
        extra: K.bq(`Terbilang: ${cap(w)} rupiah`), extraText: esc(`Terbilang: ${cap(w)} rupiah`),
        checks: [[false, "Kirim bukti pembayaran setelah transfer"], [true, "Simpan nomor invoice untuk klaim garansi"]],
      });
    },
  },
];

module.exports = K.plugin("berguna", "Utilitas", defs);
module.exports._t = { terbilang, assess, human, fmtN, clock, ZONES };

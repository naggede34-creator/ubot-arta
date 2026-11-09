// Pembantu wang: baca nominal ("3000", "3.000", "3k", "10rb", "1,5jt", "rp3000") dan format gaya Indonesia (3.000).
// ASCII sahaja.
const { cfg } = require("./core");

// -> nombor (boleh ada perpuluhan 2 digit) atau NaN
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

// 3000 -> "3.000" ; 3000.5 -> "3.000,50"
const num = (n) => {
  const [i, d] = (Math.round(n * 100) / 100).toFixed(2).split(".");
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return d === "00" ? g : `${g},${d}`;
};
const currency = () => String(cfg.currency || "IDR");
const money = (n) => `${num(n)} ${currency()}`;

module.exports = { parseMoney, num, money, currency };

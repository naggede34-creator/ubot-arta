// Pembantu untuk paket "100 fitur baru" (x100*.js). Semua fitur dihitung lokal (tanpa API) supaya pasti jalan.
// Hasil tampil sebagai kartu Rich + emoji premium berbeda tiap baris.
const K = require("./kit");
const { card, show, footerOf, esc } = require("./ui");
const ICONS = ["gem", "star", "fire", "bolt", "tag", "chart", "gift", "crown", "rocket", "pin", "eyes", "gear"];
const fixed = (n, d = 4) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(d))));

function make(name, category, items) {
  const defs = items.map(([cmd, desc, sample, fn, alias]) => ({
    cmd, alias: alias || [], desc, sample, fn,
    run: async (ctx) => {
      let v = await fn(ctx.args || [], ctx);
      if (v === undefined || v === null) v = "-";
      const rows = (Array.isArray(v) ? v : [["Hasil", String(v)]]).map(([l, val], i) => [
        ICONS[i % ICONS.length], esc(String(l)), K.nl2br(String(val).slice(0, 1500)),
      ]);
      await show(ctx, card({ title: cmd.toUpperCase(), icon: ICONS[(cmd.length * 7) % ICONS.length], rows, footer: footerOf(ctx.account) }));
    },
  }));
  const p = K.plugin(name, category, defs);
  p.__items = items;
  return p;
}
const need = (cond, usage) => { if (!cond) throw new K.UserErr("Guna: " + usage); };
const nums = (a, usage, min = 1) => {
  const n = a.join(" ").split(/[ ,;]+/).filter(Boolean).map((x) => Number(x.replace(",", ".")));
  if (n.length < min || n.some((x) => !Number.isFinite(x))) throw new K.UserErr("Guna: " + usage);
  return n;
};
const rp = (n) => "Rp" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const hashSeed = (s) => { let h = 2166136261; for (const c of String(s).toLowerCase().trim()) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const seeded = (s) => { let a = hashSeed(s) || 1; return () => { a = Math.imul(a ^ (a >>> 15), 1 | a); a ^= a + Math.imul(a ^ (a >>> 7), 61 | a); return ((a ^ (a >>> 14)) >>> 0) / 4294967296; }; };
const todayWIB = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];
const parseISO = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); if (!m) throw new K.UserErr("Format tanggal: YYYY-MM-DD (contoh 2026-11-04)"); const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); if (isNaN(+d) || d.getUTCMonth() !== +m[2] - 1) throw new K.UserErr("Tanggal tidak valid."); return d; };
module.exports = { make, need, nums, rp, fixed, hashSeed, seeded, todayWIB, pick, parseISO };

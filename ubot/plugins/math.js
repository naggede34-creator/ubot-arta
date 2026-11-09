// Matematik & Konversi (29 arahan) - semua luar talian
const K = require("../kit");
const { R, H, need, num, fmt, grp, out, UserErr } = K;

// ---------- unit ----------
const UNITS = {
  panjang: { base: "m", u: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, ft: 0.3048, in: 0.0254, yd: 0.9144, nmi: 1852 } },
  berat: { base: "kg", u: { kg: 1, g: 0.001, mg: 1e-6, lb: 0.45359237, oz: 0.028349523, ton: 1000 } },
  isipadu: { base: "l", u: { l: 1, ml: 0.001, gal: 3.785411784, qt: 0.946352946, cup: 0.2365882365, floz: 0.0295735296 } },
  luas: { base: "m2", u: { m2: 1, km2: 1e6, ha: 1e4, acre: 4046.8564224, ft2: 0.09290304 } },
  laju: { base: "m/s", u: { ms: 1, kmh: 0.2777777778, mph: 0.44704, knot: 0.5144444444 } },
  data: { base: "B", u: { b: 1, kb: 1024, mb: 1048576, gb: 1073741824, tb: 1099511627776 } },
  masa: { base: "s", u: { s: 1, min: 60, jam: 3600, h: 3600, hari: 86400, d: 86400, minggu: 604800 } },
};
const ALIAS = { kilometer: "km", meter: "m", mile: "mi", feet: "ft", foot: "ft", inch: "in", kg: "kg", gram: "g", pound: "lb", ounce: "oz", liter: "l", litre: "l", "km/h": "kmh", kmph: "kmh", "m/s": "ms", mps: "ms", hour: "jam", minute: "min", day: "hari", week: "minggu", sec: "s", second: "s", hectare: "ha", sqm: "m2", "m^2": "m2" };
const unitKey = (s) => {
  s = String(s).toLowerCase();
  return ALIAS[s] || s;
};
const TEMPS = ["c", "f", "k"];
function toC(v, u) { return u === "c" ? v : u === "f" ? (v - 32) * 5 / 9 : v - 273.15; }
function fromC(c, u) { return u === "c" ? c : u === "f" ? c * 9 / 5 + 32 : c + 273.15; }

const parseTemp = (s) => {
  const m = String(s).toLowerCase().replace(/\u00B0/g, "").match(/^(-?\d+(?:[.,]\d+)?)\s*([cfk])$/);
  return m ? { v: num(m[1]), u: m[2] } : null;
};

// ---------- nombor ----------
const isPrime = (n) => {
  if (n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false;
  return true;
};
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const ROMAN = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
const toRoman = (n) => ROMAN.reduce((s, [v, r]) => { while (n >= v) { s += r; n -= v; } return s; }, "");
const fromRoman = (s) => {
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let t = 0;
  s = s.toUpperCase();
  for (let i = 0; i < s.length; i++) {
    const a = map[s[i]], b = map[s[i + 1]] || 0;
    t += a < b ? -a : a;
  }
  return t;
};
const nums = (ctx) => ctx.args.join(" ").split(/[\s,;]+/).filter(Boolean).map(num);
const chkNums = (a, min = 1) => {
  if (a.length < min || a.some((x) => !Number.isFinite(x))) throw new UserErr("Masukkan nombor sahaja (asingkan dengan ruang).");
};

const ZODIAC = [
  ["Capricorn", 1, 19], ["Aquarius", 2, 18], ["Pisces", 3, 20], ["Aries", 4, 19], ["Taurus", 5, 20], ["Gemini", 6, 20],
  ["Cancer", 7, 22], ["Leo", 8, 22], ["Virgo", 9, 22], ["Libra", 10, 22], ["Scorpio", 11, 21], ["Sagittarius", 12, 21], ["Capricorn", 12, 31],
];
const SHIO = ["Monyet", "Ayam", "Anjing", "Babi", "Tikus", "Kerbau", "Harimau", "Kelinci", "Naga", "Ular", "Kuda", "Kambing"];

const defs = [
  {
    cmd: "conv", desc: "tukar unit: .conv 10 km mi | .conv 5 kg lb | .conv 2 gb mb",
    async run(ctx) {
      const [v, a, b] = [num(ctx.args[0]), unitKey(ctx.args[1] || ""), unitKey(ctx.args[2] || "")];
      need(Number.isFinite(v) && a && b, ".conv <nilai> <dari> <ke>  (unit: km m cm mi ft in kg g lb oz l ml gal ha kmh mph gb mb jam min ...)");
      if (TEMPS.includes(a) && TEMPS.includes(b)) {
        const r = fromC(toC(v, a), b);
        return out(ctx, "Tukar Unit", "gear", [R("tag", "Dari", `${fmt(v)} ${a.toUpperCase()}`), R("ok", "Ke", `${fmt(r, 4)} ${b.toUpperCase()}`)]);
      }
      const dim = Object.entries(UNITS).find(([, d]) => a in d.u && b in d.u);
      if (!dim) throw new UserErr("Unit tidak sepadan / tidak dikenali.");
      const r = (v * dim[1].u[a]) / dim[1].u[b];
      await out(ctx, "Tukar Unit", "gear", [R("tag", "Jenis", dim[0]), R("tag", "Dari", `${fmt(v, 6)} ${a}`), R("ok", "Ke", `${fmt(r, 6)} ${b}`)]);
    },
  },
  {
    cmd: "temp", desc: "suhu: .temp 30c | .temp 86f | .temp 300k",
    async run(ctx) {
      const t = parseTemp(ctx.args.join(""));
      need(t, ".temp 30c  (c/f/k)");
      const c = toC(t.v, t.u);
      await out(ctx, "Suhu", "fire", [R("tag", "Input", `${fmt(t.v)}\u00B0${t.u.toUpperCase()}`), R("ok", "Celsius", `${fmt(c, 2)} \u00B0C`), R("ok", "Fahrenheit", `${fmt(fromC(c, "f"), 2)} \u00B0F`), R("ok", "Kelvin", `${fmt(fromC(c, "k"), 2)} K`)]);
    },
  },
  {
    cmd: "bmi", desc: "indeks jisim badan: .bmi <kg> <cm>",
    async run(ctx) {
      const [kg, cm] = [num(ctx.args[0]), num(ctx.args[1])];
      need(kg > 0 && cm > 50, ".bmi 65 170");
      const b = kg / (cm / 100) ** 2;
      const k = b < 18.5 ? "Kurang berat" : b < 25 ? "Normal" : b < 30 ? "Berlebihan" : "Obes";
      const lo = 18.5 * (cm / 100) ** 2, hi = 24.9 * (cm / 100) ** 2;
      await out(ctx, "BMI", "chart", [R("user", "Berat / Tinggi", `${fmt(kg)} kg / ${fmt(cm)} cm`), H("ok", "BMI", `<b>${fmt(b, 1)}</b>`), R("tag", "Kategori", k), R("gear", "Berat ideal", `${fmt(lo, 1)} - ${fmt(hi, 1)} kg`)]);
    },
  },
  {
    cmd: "percent", alias: ["peratus"], desc: "peratus: .percent 20 150  (20% daripada 150, dll)",
    async run(ctx) {
      const [x, y] = [num(ctx.args[0]), num(ctx.args[1])];
      need(Number.isFinite(x) && Number.isFinite(y), ".percent 20 150");
      await out(ctx, "Peratus", "chart", [
        R("ok", `${fmt(x)}% daripada ${fmt(y)}`, fmt((x / 100) * y, 4)),
        R("ok", `${fmt(x)} ialah ?% daripada ${fmt(y)}`, y ? fmt((x / y) * 100, 4) + "%" : "-"),
        R("plus", `${fmt(y)} + ${fmt(x)}%`, fmt(y * (1 + x / 100), 4)),
        R("fire", `${fmt(y)} - ${fmt(x)}%`, fmt(y * (1 - x / 100), 4)),
      ]);
    },
  },
  {
    cmd: "disc", alias: ["diskaun"], desc: "diskaun: .disc <harga> <diskaun%> [diskaun2%]",
    async run(ctx) {
      const [p, d1, d2] = [num(ctx.args[0]), num(ctx.args[1]), ctx.args[2] ? num(ctx.args[2]) : 0];
      need(p >= 0 && d1 >= 0, ".disc 200 30  (atau .disc 200 30 10 untuk 2 diskaun)");
      const f = p * (1 - d1 / 100) * (1 - d2 / 100);
      await out(ctx, "Diskaun", "tag", [R("tag", "Harga asal", grp(p)), R("tag", "Diskaun", d2 ? `${d1}% + ${d2}%` : `${d1}%`), H("ok", "Bayar", `<b>${grp(f)}</b>`), R("gem", "Jimat", grp(p - f))]);
    },
  },
  {
    cmd: "tip", desc: "kira bil + tip + bahagi: .tip <bil> <tip%> [orang]",
    async run(ctx) {
      const [b, t, n] = [num(ctx.args[0]), num(ctx.args[1] || 10), Math.max(1, parseInt(ctx.args[2], 10) || 1)];
      need(b > 0, ".tip 150 10 4");
      const tip = (b * t) / 100, tot = b + tip;
      await out(ctx, "Bil & Tip", "gem", [R("tag", "Bil", grp(b)), R("plus", `Tip ${t}%`, grp(tip)), H("ok", "Jumlah", `<b>${grp(tot)}</b>`), R("user", `Seorang (${n})`, grp(tot / n))]);
    },
  },
  {
    cmd: "age", alias: ["umur"], desc: "kira umur: .age 2000-05-17 (atau 17-05-2000)",
    async run(ctx) {
      const b = K.parseDate(ctx.args[0]);
      need(b, ".age 2000-05-17");
      const t = K.todayUTC();
      if (b > t) throw new UserErr("Tarikh lahir di masa hadapan.");
      let y = t.getUTCFullYear() - b.getUTCFullYear(), m = t.getUTCMonth() - b.getUTCMonth(), d = t.getUTCDate() - b.getUTCDate();
      if (d < 0) { m--; d += new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0)).getUTCDate(); }
      if (m < 0) { y--; m += 12; }
      let nb = new Date(Date.UTC(t.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()));
      if (nb < t) nb = new Date(Date.UTC(t.getUTCFullYear() + 1, b.getUTCMonth(), b.getUTCDate()));
      const days = Math.round((t - b) / 86400000);
      await out(ctx, "Umur", "user", [R("tag", "Lahir", K.fmtDate(b)), H("ok", "Umur", `<b>${y} tahun ${m} bulan ${d} hari</b>`), R("time", "Jumlah hari", grp(days, 0)), R("time", "Jumlah minggu", grp(Math.floor(days / 7), 0)), R("star", "Hari jadi seterusnya", `${Math.round((nb - t) / 86400000)} hari lagi`)]);
    },
  },
  {
    cmd: "datediff", desc: "beza dua tarikh: .datediff 2025-01-01 2026-03-15",
    async run(ctx) {
      const [a, b] = [K.parseDate(ctx.args[0]), K.parseDate(ctx.args[1] || "today")];
      need(a && b, ".datediff 2025-01-01 2026-03-15");
      const days = Math.round(Math.abs(b - a) / 86400000);
      await out(ctx, "Beza Tarikh", "time", [R("tag", "Dari", K.fmtDate(a)), R("tag", "Hingga", K.fmtDate(b)), H("ok", "Beza", `<b>${grp(days, 0)} hari</b>`), R("time", "Lebih kurang", `${fmt(days / 7, 1)} minggu / ${fmt(days / 30.4375, 1)} bulan / ${fmt(days / 365.25, 2)} tahun`)]);
    },
  },
  {
    cmd: "dayof", alias: ["hari"], desc: "hari dalam minggu: .dayof 2026-08-31",
    async run(ctx) {
      const d = K.parseDate(ctx.args[0] || "today");
      need(d, ".dayof 2026-08-31");
      await out(ctx, "Hari", "time", [H("ok", "Tarikh", `<b>${esc2(K.fmtDate(d))}</b>`), R("tag", "Hari ke-", `${K.dayOfYear(d)} dalam tahun`), R("tag", "Minggu ISO", String(K.isoWeek(d)))]);
    },
  },
  {
    cmd: "addday", desc: "tambah hari: .addday 30 [tarikh]  (negatif = tolak)",
    async run(ctx) {
      const n = parseInt(ctx.args[0], 10);
      const base = K.parseDate(ctx.args[1] || "today");
      need(Number.isFinite(n) && base, ".addday 30 2026-01-01");
      const r = new Date(base.getTime() + n * 86400000);
      await out(ctx, "Tambah Hari", "plus", [R("tag", "Mula", K.fmtDate(base)), R("plus", "Tambah", `${n} hari`), H("ok", "Hasil", `<b>${esc2(K.fmtDate(r))}</b>`), R("tag", "ISO", K.isoDate(r))]);
    },
  },
  {
    cmd: "bin", alias: ["base"], desc: "tukar asas nombor: .bin 255 | .bin 0xff | .bin 0b1010",
    async run(ctx) {
      const s = String(ctx.args[0] || "").toLowerCase();
      need(s, ".bin 255  (boleh 0x.. / 0b.. / 0o..)");
      let n;
      if (/^0x[0-9a-f]+$/.test(s)) n = BigInt(s);
      else if (/^0b[01]+$/.test(s)) n = BigInt(s);
      else if (/^0o[0-7]+$/.test(s)) n = BigInt(s);
      else if (/^\d+$/.test(s)) n = BigInt(s);
      else throw new UserErr("Nombor tidak sah.");
      await out(ctx, "Asas Nombor", "gear", [R("ok", "Perpuluhan", n.toString(10)), R("ok", "Binari", n.toString(2)), R("ok", "Oktal", n.toString(8)), R("ok", "Heks", n.toString(16).toUpperCase())]);
    },
  },
  {
    cmd: "roman", desc: "angka Rom: .roman 2026 | .roman MMXXVI",
    async run(ctx) {
      const s = String(ctx.args[0] || "");
      need(s, ".roman 2026");
      if (/^\d+$/.test(s)) {
        const n = +s;
        if (n < 1 || n > 3999) throw new UserErr("Julat 1 - 3999.");
        return out(ctx, "Angka Rom", "gem", [R("tag", "Nombor", s), H("ok", "Rom", `<b>${toRoman(n)}</b>`)]);
      }
      if (!/^[ivxlcdm]+$/i.test(s)) throw new UserErr("Angka Rom tidak sah.");
      await out(ctx, "Angka Rom", "gem", [R("tag", "Rom", s.toUpperCase()), H("ok", "Nombor", `<b>${fromRoman(s)}</b>`)]);
    },
  },
  {
    cmd: "fact", alias: ["faktorial"], desc: "faktorial: .fact 20 (maks 200)",
    async run(ctx) {
      const n = parseInt(ctx.args[0], 10);
      need(n >= 0 && n <= 200, ".fact 20  (0-200)");
      let r = 1n;
      for (let i = 2n; i <= BigInt(n); i++) r *= i;
      const s = r.toString();
      await out(ctx, "Faktorial", "chart", [R("tag", "n", String(n)), R("gear", "Bilangan digit", String(s.length)), H("ok", "n!", `<code>${K.esc(s.length > 300 ? s.slice(0, 300) + "..." : s)}</code>`)]);
    },
  },
  {
    cmd: "prime", alias: ["perdana"], desc: "semak nombor perdana + faktor: .prime 97",
    async run(ctx) {
      const n = parseInt(ctx.args[0], 10);
      need(n >= 1 && n <= 1e12, ".prime 97");
      const f = [];
      let m = n;
      for (let i = 2; i * i <= m; i++) while (m % i === 0) { f.push(i); m /= i; }
      if (m > 1 || f.length === 0) f.push(m);
      let nx = n + 1;
      while (!isPrime(nx)) nx++;
      await out(ctx, "Nombor Perdana", "star", [R("tag", "Nombor", String(n)), H(isPrime(n) ? "ok" : "fire", "Perdana?", isPrime(n) ? "<b>Ya</b>" : "<b>Tidak</b>"), R("gear", "Faktor perdana", f.join(" \u00D7 ")), R("plus", "Perdana seterusnya", String(nx))]);
    },
  },
  {
    cmd: "gcd", alias: ["fpb"], desc: "FPB (faktor sepunya terbesar): .gcd 12 18 24",
    async run(ctx) {
      const a = nums(ctx); chkNums(a, 2);
      await out(ctx, "FPB / GCD", "gear", [R("tag", "Nombor", a.join(", ")), H("ok", "FPB", `<b>${a.map(Math.round).reduce(gcd)}</b>`)]);
    },
  },
  {
    cmd: "lcm", alias: ["kpk"], desc: "KPK (gandaan sepunya terkecil): .lcm 4 6 8",
    async run(ctx) {
      const a = nums(ctx); chkNums(a, 2);
      const r = a.map(Math.round).reduce((x, y) => (x / gcd(x, y)) * y);
      await out(ctx, "KPK / LCM", "gear", [R("tag", "Nombor", a.join(", ")), H("ok", "KPK", `<b>${r}</b>`)]);
    },
  },
  {
    cmd: "fib", desc: "Fibonacci: .fib 50",
    async run(ctx) {
      const n = parseInt(ctx.args[0], 10);
      need(n >= 0 && n <= 1000, ".fib 50  (0-1000)");
      let a = 0n, b = 1n;
      const first = [];
      for (let i = 0; i < n; i++) { if (i < 12) first.push(a.toString()); [a, b] = [b, a + b]; }
      const s = a.toString();
      await out(ctx, "Fibonacci", "chart", [R("tag", "n", String(n)), H("ok", `F(${n})`, `<code>${K.esc(s.length > 250 ? s.slice(0, 250) + "..." : s)}</code>`), R("gear", "12 pertama", first.join(", "))]);
    },
  },
  {
    cmd: "stat", desc: "statistik: .stat 4 8 15 16 23 42",
    async run(ctx) {
      const a = nums(ctx); chkNums(a, 1);
      const s = [...a].sort((x, y) => x - y), n = a.length, sum = a.reduce((x, y) => x + y, 0), mean = sum / n;
      const med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
      const cnt = {}; a.forEach((x) => (cnt[x] = (cnt[x] || 0) + 1));
      const mx = Math.max(...Object.values(cnt));
      const mode = mx > 1 ? Object.keys(cnt).filter((k) => cnt[k] === mx).join(", ") : "-";
      const sd = Math.sqrt(a.reduce((x, y) => x + (y - mean) ** 2, 0) / n);
      await out(ctx, "Statistik", "chart", [R("tag", "Bilangan", String(n)), R("plus", "Jumlah", fmt(sum, 4)), R("star", "Min / Maks", `${fmt(s[0], 4)} / ${fmt(s[n - 1], 4)}`), R("ok", "Purata", fmt(mean, 4)), R("ok", "Median", fmt(med, 4)), R("tag", "Mod", mode), R("gear", "Sisihan piawai", fmt(sd, 4))]);
    },
  },
  {
    cmd: "sortnum", desc: "susun nombor: .sortnum 5 3 9 1 (tambah 'desc' untuk turun)",
    async run(ctx) {
      const desc = ctx.args.some((x) => x.toLowerCase() === "desc");
      const a = ctx.args.filter((x) => x.toLowerCase() !== "desc").join(" ").split(/[\s,;]+/).filter(Boolean).map(num);
      chkNums(a, 2);
      a.sort((x, y) => (desc ? y - x : x - y));
      await out(ctx, "Susun Nombor", "gear", [R("tag", "Susunan", desc ? "Menurun" : "Menaik"), H("ok", "Hasil", `<code>${K.esc(a.join(", "))}</code>`)]);
    },
  },
  {
    cmd: "rand", desc: "nombor rawak: .rand 1 100 [bilangan]",
    async run(ctx) {
      const crypto = require("crypto");
      let [lo, hi, c] = [parseInt(ctx.args[0], 10), parseInt(ctx.args[1], 10), Math.min(20, Math.max(1, parseInt(ctx.args[2], 10) || 1))];
      if (!Number.isFinite(lo)) { lo = 1; hi = 100; }
      if (!Number.isFinite(hi)) { hi = lo; lo = 1; }
      if (hi < lo) [lo, hi] = [hi, lo];
      const r = Array.from({ length: c }, () => crypto.randomInt(lo, hi + 1));
      await out(ctx, "Nombor Rawak", "fire", [R("tag", "Julat", `${lo} - ${hi}`), H("ok", "Hasil", `<b>${K.esc(r.join(", "))}</b>`)]);
    },
  },
  {
    cmd: "loan", alias: ["pinjaman"], desc: "ansuran pinjaman: .loan <pokok> <kadar%/thn> <tahun>",
    async run(ctx) {
      const [P, r, y] = [num(ctx.args[0]), num(ctx.args[1]), num(ctx.args[2])];
      need(P > 0 && r >= 0 && y > 0, ".loan 100000 4.5 30");
      const n = Math.round(y * 12), i = r / 1200;
      const m = i ? (P * i) / (1 - (1 + i) ** -n) : P / n;
      await out(ctx, "Ansuran Pinjaman", "gem", [R("tag", "Pokok", grp(P)), R("tag", "Kadar / Tempoh", `${r}% / ${y} tahun (${n} bulan)`), H("ok", "Ansuran bulanan", `<b>${grp(m)}</b>`), R("chart", "Jumlah bayaran", grp(m * n)), R("fire", "Jumlah faedah", grp(m * n - P))]);
    },
  },
  {
    cmd: "compound", alias: ["simpanan"], desc: "faedah kompaun: .compound <pokok> <kadar%> <tahun> [kekerapan/thn]",
    async run(ctx) {
      const [P, r, y, n] = [num(ctx.args[0]), num(ctx.args[1]), num(ctx.args[2]), parseInt(ctx.args[3], 10) || 12];
      need(P > 0 && r >= 0 && y > 0, ".compound 10000 5 10");
      const A = P * (1 + r / 100 / n) ** (n * y);
      await out(ctx, "Faedah Kompaun", "chart", [R("tag", "Pokok", grp(P)), R("tag", "Kadar / Tempoh", `${r}% / ${y} tahun (${n}x setahun)`), H("ok", "Nilai akhir", `<b>${grp(A)}</b>`), R("gem", "Untung", grp(A - P))]);
    },
  },
  {
    cmd: "tax", alias: ["sst", "cukai"], desc: "cukai: .tax <harga> [kadar%] (lalai 8%)",
    async run(ctx) {
      const [p, t] = [num(ctx.args[0]), ctx.args[1] ? num(ctx.args[1]) : 8];
      need(p >= 0 && t >= 0, ".tax 100 8");
      await out(ctx, "Cukai", "tag", [R("tag", "Harga", grp(p)), R("plus", `Cukai ${t}%`, grp((p * t) / 100)), H("ok", "Jumlah", `<b>${grp(p * (1 + t / 100))}</b>`), R("fire", "Harga sebelum cukai (jika termasuk)", grp(p / (1 + t / 100)))]);
    },
  },
  {
    cmd: "speed", alias: ["kelajuan"], desc: "kelajuan: .speed <jarak km> <masa jam>",
    async run(ctx) {
      const [d, t] = [num(ctx.args[0]), num(ctx.args[1])];
      need(d >= 0 && t > 0, ".speed 120 1.5   (km, jam)");
      await out(ctx, "Kelajuan", "rocket", [R("tag", "Jarak / Masa", `${fmt(d)} km / ${fmt(t)} jam`), H("ok", "Laju", `<b>${fmt(d / t, 2)} km/j</b>`), R("ok", "Dalam m/s", fmt(((d / t) * 1000) / 3600, 2)), R("ok", "Dalam mph", fmt((d / t) / 1.609344, 2))]);
    },
  },
  {
    cmd: "countdown", desc: "kira detik ke tarikh: .countdown 2026-12-31",
    async run(ctx) {
      const d = K.parseDate(ctx.args[0]);
      need(d, ".countdown 2026-12-31");
      const ms = d - Date.now();
      const days = Math.ceil(ms / 86400000);
      await out(ctx, "Kira Detik", "time", [R("tag", "Sasaran", K.fmtDate(d)), H(ms >= 0 ? "ok" : "fire", ms >= 0 ? "Lagi" : "Sudah lepas", `<b>${grp(Math.abs(days), 0)} hari</b>`), R("time", "Dalam minggu", fmt(Math.abs(days) / 7, 1)), R("time", "Dalam jam", grp(Math.abs(Math.round(ms / 3600000)), 0))]);
    },
  },
  {
    cmd: "week", alias: ["minggu"], desc: "nombor minggu & baki tahun: .week [tarikh]",
    async run(ctx) {
      const d = K.parseDate(ctx.args[0] || "today");
      need(d, ".week 2026-08-31");
      const y = d.getUTCFullYear(), end = Date.UTC(y, 11, 31);
      await out(ctx, "Minggu & Tahun", "time", [R("tag", "Tarikh", K.fmtDate(d)), R("ok", "Minggu ISO", String(K.isoWeek(d))), R("ok", "Hari ke-", `${K.dayOfYear(d)} / ${(y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365}`), R("time", "Baki hari tahun ini", String(Math.round((end - d) / 86400000)))]);
    },
  },
  {
    cmd: "leap", alias: ["kabisat"], desc: "tahun lompat: .leap 2028",
    async run(ctx) {
      const y = parseInt(ctx.args[0], 10) || new Date().getUTCFullYear();
      const L = (x) => (x % 4 === 0 && x % 100 !== 0) || x % 400 === 0;
      let nx = y + 1;
      while (!L(nx)) nx++;
      await out(ctx, "Tahun Lompat", "star", [R("tag", "Tahun", String(y)), H(L(y) ? "ok" : "fire", "Tahun lompat?", L(y) ? "<b>Ya (366 hari)</b>" : "<b>Tidak (365 hari)</b>"), R("plus", "Tahun lompat seterusnya", String(nx))]);
    },
  },
  {
    cmd: "zodiac", desc: "bintang zodiak: .zodiac 17-05 | .zodiac 2000-05-17",
    async run(ctx) {
      const s = String(ctx.args[0] || "");
      let m, d;
      const full = K.parseDate(s);
      if (full) { m = full.getUTCMonth() + 1; d = full.getUTCDate(); }
      else { const x = s.match(/^(\d{1,2})[-/.](\d{1,2})$/); if (x) { d = +x[1]; m = +x[2]; } }
      need(m && d && m <= 12 && d <= 31, ".zodiac 17-05");
      const z = ZODIAC.find(([, mm, dd]) => m < mm || (m === mm && d <= dd))[0];
      await out(ctx, "Zodiak", "star", [R("tag", "Tarikh", `${d} ${K.MONTHS[m - 1]}`), H("ok", "Zodiak", `<b>${z}</b>`)]);
    },
  },
  {
    cmd: "shio", desc: "shio mengikut tahun lahir: .shio 2000",
    async run(ctx) {
      const y = parseInt(ctx.args[0], 10);
      need(y >= 1900 && y <= 2100, ".shio 2000");
      await out(ctx, "Shio", "rex", [R("tag", "Tahun", String(y)), H("ok", "Shio", `<b>${SHIO[y % 12]}</b>`)]);
    },
  },
];
function esc2(s) { return K.esc(s); }

module.exports = K.plugin("math", "Matematik & Konversi", defs);

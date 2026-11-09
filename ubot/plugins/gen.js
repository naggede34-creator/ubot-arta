// Penjana (11 arahan): luar talian
const crypto = require("crypto");
const K = require("../kit");
const { R, H, need, out, UserErr } = K;

const rnd = (n) => crypto.randomInt(n);
const pick = (a) => a[rnd(a.length)];
const LOREM = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum".split(" ");
const FIRST = ["Ahmad", "Aisyah", "Farhan", "Nurul", "Hakim", "Siti", "Irfan", "Aina", "Zulkifli", "Balqis", "Danial", "Hana", "Syafiq", "Alya", "Rizal", "Mariam", "Amirul", "Sofea", "Budi", "Dewi", "Agus", "Putri", "Rangga", "Citra", "Eko", "Maya"];
const LAST = ["bin Abdullah", "binti Hassan", "bin Ismail", "binti Yusof", "Pratama", "Saputra", "Wijaya", "Lestari", "bin Omar", "binti Rahman", "Hidayat", "Kusuma", "bin Salleh", "binti Ahmad"];
const ADJ = ["Gagah", "Laju", "Senyap", "Garang", "Bijak", "Ceria", "Misteri", "Bayang", "Api", "Awan", "Petir", "Embun", "Rimba", "Samudera"];
const NOUN = ["Harimau", "Helang", "Naga", "Ronin", "Pendekar", "Kelana", "Bintang", "Bayu", "Serigala", "Rajawali", "Pelangi", "Kirana"];
const EMOJI = ["\uD83D\uDE00", "\uD83D\uDE0E", "\uD83E\uDD29", "\uD83D\uDE80", "\uD83D\uDD25", "\uD83C\uDF1F", "\uD83C\uDF40", "\uD83C\uDF55", "\uD83C\uDF89", "\uD83D\uDC8E", "\uD83E\uDD84", "\uD83D\uDC3C", "\uD83C\uDF08", "\uD83C\uDFAF", "\uD83C\uDFA7", "\uD83D\uDCA1", "\u26A1", "\uD83C\uDF3B", "\uD83D\uDC2F", "\uD83C\uDF69"];

function hexToRgb(h) {
  const m = String(h).replace("#", "").match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
const toHex = (rgb) => "#" + rgb.map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();

const defs = [
  {
    cmd: "uuid", desc: "jana UUID v4: .uuid [bilangan]",
    async run(ctx) {
      const n = Math.min(10, Math.max(1, parseInt(ctx.args[0], 10) || 1));
      await out(ctx, "UUID", "gear", Array.from({ length: n }, (_, i) => H("ok", `#${i + 1}`, K.code(crypto.randomUUID()))));
    },
  },
  {
    cmd: "token", desc: "token rawak heks: .token [panjang]",
    async run(ctx) {
      const n = Math.min(128, Math.max(8, parseInt(ctx.args[0], 10) || 32));
      await out(ctx, "Token Rawak", "crown", [R("gear", "Panjang", `${n} aksara (heks)`), H("ok", "Token", K.code(crypto.randomBytes(Math.ceil(n / 2)).toString("hex").slice(0, n)))], { checks: [[true, "Dijana oleh crypto"], [false, "Jangan kongsi token anda"]] });
    },
  },
  {
    cmd: "color", alias: ["warna"], desc: "info warna / warna rawak: .color #ff8800 | .color",
    async run(ctx) {
      let rgb = ctx.args[0] ? hexToRgb(ctx.args[0]) : [rnd(256), rnd(256), rnd(256)];
      if (!rgb) throw new UserErr("Guna: .color #ff8800  (atau .color untuk rawak)");
      const [h, s, l] = rgbToHsl(rgb);
      await out(ctx, "Warna", "star", [H("ok", "HEX", `<b>${toHex(rgb)}</b>`), R("tag", "RGB", `rgb(${rgb.join(", ")})`), R("tag", "HSL", `hsl(${h}, ${s}%, ${l}%)`), R("tag", "Cerah", l > 60 ? "Warna cerah" : l < 35 ? "Warna gelap" : "Sederhana")]);
    },
  },
  {
    cmd: "hex2rgb", desc: "HEX ke RGB: .hex2rgb #ff8800",
    async run(ctx) {
      const rgb = hexToRgb(ctx.args[0]);
      need(rgb, ".hex2rgb #ff8800");
      await out(ctx, "HEX ke RGB", "gear", [R("tag", "HEX", toHex(rgb)), H("ok", "RGB", `<b>${rgb.join(", ")}</b>`)]);
    },
  },
  {
    cmd: "rgb2hex", desc: "RGB ke HEX: .rgb2hex 255 136 0",
    async run(ctx) {
      const a = ctx.args.join(" ").split(/[\s,]+/).filter(Boolean).map(Number);
      need(a.length === 3 && a.every((x) => x >= 0 && x <= 255), ".rgb2hex 255 136 0");
      await out(ctx, "RGB ke HEX", "gear", [R("tag", "RGB", a.join(", ")), H("ok", "HEX", `<b>${toHex(a.map(Math.round))}</b>`)]);
    },
  },
  {
    cmd: "lorem", desc: "teks hiasan: .lorem [bilangan perkataan]",
    async run(ctx) {
      const n = Math.min(150, Math.max(5, parseInt(ctx.args[0], 10) || 30));
      const w = Array.from({ length: n }, () => pick(LOREM));
      let t = w.join(" ");
      t = t.charAt(0).toUpperCase() + t.slice(1) + ".";
      await K.outText(ctx, "Lorem Ipsum", "gear", "Perkataan", String(n), t);
    },
  },
  {
    cmd: "name", alias: ["nama"], desc: "nama rawak: .name [bilangan]",
    async run(ctx) {
      const n = Math.min(10, Math.max(1, parseInt(ctx.args[0], 10) || 3));
      await out(ctx, "Nama Rawak", "user", Array.from({ length: n }, (_, i) => R("user", `#${i + 1}`, `${pick(FIRST)} ${pick(LAST)}`)));
    },
  },
  {
    cmd: "otp", desc: "kod OTP rawak: .otp [digit]",
    async run(ctx) {
      const n = Math.min(10, Math.max(4, parseInt(ctx.args[0], 10) || 6));
      let s = "";
      for (let i = 0; i < n; i++) s += rnd(10);
      await out(ctx, "Kod OTP", "bolt", [R("gear", "Digit", String(n)), H("ok", "Kod", `<b>${s}</b>`)]);
    },
  },
  {
    cmd: "emoji", desc: "emoji rawak: .emoji [bilangan]",
    async run(ctx) {
      const n = Math.min(20, Math.max(1, parseInt(ctx.args[0], 10) || 5));
      await out(ctx, "Emoji Rawak", "star", [H("ok", "Hasil", Array.from({ length: n }, () => pick(EMOJI)).join(" "))]);
    },
  },
  {
    cmd: "mac", desc: "alamat MAC rawak: .mac",
    async run(ctx) {
      const b = crypto.randomBytes(6);
      b[0] = (b[0] | 2) & 0xfe;
      await out(ctx, "Alamat MAC", "gear", [H("ok", "MAC", K.code([...b].map((x) => x.toString(16).padStart(2, "0")).join(":").toUpperCase()))]);
    },
  },
  {
    cmd: "nick", alias: ["nickname"], desc: "nama samaran rawak: .nick [bilangan]",
    async run(ctx) {
      const n = Math.min(10, Math.max(1, parseInt(ctx.args[0], 10) || 5));
      await out(ctx, "Nama Samaran", "fire", Array.from({ length: n }, (_, i) => R("star", `#${i + 1}`, `${pick(NOUN)}${pick(ADJ)}${rnd(100)}`)));
    },
  },
];

module.exports = K.plugin("gen", "Generator", defs);

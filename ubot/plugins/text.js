// Teks (25 arahan): ubah huruf, kod, urutan baris, dll.  Semua luar talian. Balas mesej atau tulis teks.
const crypto = require("crypto");
const K = require("../kit");
const { R, need, outText, UserErr } = K;

const MORSE = { a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---", k: "-.-", l: ".-..", m: "--", n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-", u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..", 0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----.", ".": ".-.-.-", ",": "--..--", "?": "..--..", "!": "-.-.--", "/": "-..-.", "@": ".--.-." };
const UNMORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
const words = (s) => s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-.]+/g, " ").trim().split(/\s+/).filter(Boolean);
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

// Mudah: satu fungsi teks -> teks
const simple = (cmd, title, icon, desc, fn, extra = {}) => ({
  cmd, desc, ...extra,
  async run(ctx) {
    const t = await K.text(ctx);
    need(t, `.${cmd} <teks>  (atau balas mesej)`);
    const r = fn(t, ctx);
    await outText(ctx, title, icon, "Input", t, r);
  },
});

const defs = [
  simple("upper", "HURUF BESAR", "gear", "HURUF BESAR: .upper <teks>", (t) => t.toUpperCase()),
  simple("lower", "huruf kecil", "gear", "huruf kecil: .lower <teks>", (t) => t.toLowerCase()),
  simple("title", "Title Case", "gear", "Setiap Perkataan Huruf Besar: .title <teks>", (t) => t.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase())),
  simple("caps", "Sentence case", "gear", "Huruf besar awal ayat: .caps <teks>", (t) => t.toLowerCase().replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase())),
  simple("reverse", "Songsang", "gear", "terbalikkan teks: .reverse <teks>", (t) => [...t].reverse().join("")),
  {
    cmd: "repeat", desc: "ulang teks: .repeat 3 <teks> (maks 30)",
    async run(ctx) {
      const n = Math.min(30, parseInt(ctx.args[0], 10));
      const t = await K.text(ctx, 1);
      need(n >= 1 && t, ".repeat 3 hai");
      await outText(ctx, "Ulang Teks", "gear", "Input", t, Array(n).fill(t).join(" ").slice(0, 2800), [R("tag", "Kali", String(n))]);
    },
  },
  simple("slug", "Slug URL", "link", "jadikan slug: .slug Tajuk Artikel Saya", (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036F]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")),
  simple("camel", "camelCase", "gear", "camelCase: .camel hello world", (t) => words(t).map((w, i) => (i ? cap(w) : w.toLowerCase())).join("")),
  simple("snake", "snake_case", "gear", "snake_case: .snake Hello World", (t) => words(t).map((w) => w.toLowerCase()).join("_")),
  simple("kebab", "kebab-case", "gear", "kebab-case: .kebab Hello World", (t) => words(t).map((w) => w.toLowerCase()).join("-")),
  simple("rot13", "ROT13", "gear", "sifir ROT13: .rot13 <teks>", (t) => t.replace(/[a-z]/gi, (c) => String.fromCharCode(((c.toLowerCase() <= "m" ? c.charCodeAt(0) + 13 : c.charCodeAt(0) - 13)))), {}),
  {
    cmd: "morse", desc: "kod Morse (auto: teks <-> Morse): .morse sos",
    async run(ctx) {
      const t = await K.text(ctx);
      need(t, ".morse sos  |  .morse ... --- ...");
      const isMorse = /^[.\-/\s]+$/.test(t);
      const r = isMorse
        ? t.trim().split(/\s*\/\s*|\s{3,}/).map((w) => w.split(/\s+/).map((c) => UNMORSE[c] || "?").join("")).join(" ")
        : [...t.toLowerCase()].map((c) => (c === " " ? "/" : MORSE[c] || "")).filter(Boolean).join(" ");
      await outText(ctx, isMorse ? "Morse -> Teks" : "Teks -> Morse", "gear", "Input", t, r);
    },
  },
  simple("tobin", "Teks ke Binari", "gear", "teks ke binari: .tobin hi", (t) => [...Buffer.from(t, "utf8")].map((b) => b.toString(2).padStart(8, "0")).join(" ")),
  simple("tohex", "Teks ke Heks", "gear", "teks ke heks: .tohex hi", (t) => Buffer.from(t, "utf8").toString("hex").replace(/(..)/g, "$1 ").trim()),
  simple("urlenc", "URL Encode", "link", "URL encode: .urlenc a b&c", (t) => encodeURIComponent(t)),
  {
    cmd: "urldec", desc: "URL decode: .urldec a%20b",
    async run(ctx) {
      const t = await K.text(ctx);
      need(t, ".urldec a%20b");
      let r;
      try { r = decodeURIComponent(t); } catch (_) { throw new UserErr("Format URL tidak sah."); }
      await outText(ctx, "URL Decode", "link", "Input", t, r);
    },
  },
  simple("palindrome", "Palindrom?", "star", "semak palindrom: .palindrome katak", (t) => {
    const s = t.toLowerCase().replace(/[^a-z0-9]/g, "");
    return s && s === [...s].reverse().join("") ? "Ya, ia palindrom." : "Bukan palindrom.";
  }),
  simple("sortlines", "Susun Baris", "gear", "susun baris A-Z (balas mesej): .sortlines", (t) => t.split(/\r?\n/).sort((a, b) => a.localeCompare(b)).join("\n")),
  simple("uniq", "Buang Baris Pendua", "gear", "buang baris pendua: .uniq (balas mesej)", (t) => [...new Set(t.split(/\r?\n/))].join("\n")),
  simple("numlines", "Nombor Baris", "gear", "letak nombor pada baris: .numlines (balas mesej)", (t) => t.split(/\r?\n/).map((l, i) => `${i + 1}. ${l}`).join("\n")),
  simple("shuffle", "Kocok Perkataan", "fire", "kocok perkataan: .shuffle a b c d", (t) => {
    const a = t.split(/\s+/);
    for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a.join(" ");
  }),
  simple("mock", "sPoNgEbOb", "fire", "teks mengejek: .mock saya pandai", (t) => [...t].map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join("")),
  simple("vapor", "Vaporwave", "star", "teks lebar: .vapor hello", (t) => [...t].map((c) => (c === " " ? "\u3000" : c.charCodeAt(0) >= 33 && c.charCodeAt(0) <= 126 ? String.fromCharCode(c.charCodeAt(0) + 0xfee0) : c)).join("")),
  simple("clap", "Tepuk Tangan", "star", "selang tepuk: .clap hebat sungguh", (t) => t.split(/\s+/).join(" \uD83D\uDC4F ") + " \uD83D\uDC4F"),
  {
    cmd: "count", alias: ["wc"], desc: "kira aksara/perkataan/baris: .count <teks>",
    async run(ctx) {
      const t = await K.text(ctx);
      need(t, ".count <teks>  (atau balas mesej)");
      const w = t.trim().split(/\s+/).filter(Boolean).length;
      await K.out(ctx, "Kira Teks", "chart", [R("tag", "Aksara", String(t.length)), R("tag", "Tanpa ruang", String(t.replace(/\s/g, "").length)), R("tag", "Perkataan", String(w)), R("tag", "Baris", String(t.split(/\r?\n/).length)), R("tag", "Ayat", String((t.match(/[.!?]+(\s|$)/g) || []).length || 1)), R("time", "Masa baca", `~${Math.max(1, Math.round(w / 200 * 60))} saat`)]);
    },
  },
];

// ---------- Fon Unicode ----------
const cp = (n) => String.fromCodePoint(n);
function mapper(U, L, D, exc = {}) {
  return (t) => [...t].map((c) => {
    if (exc[c]) return cp(exc[c]);
    const x = c.charCodeAt(0);
    if (x >= 65 && x <= 90 && U) return cp(U + x - 65);
    if (x >= 97 && x <= 122 && L) return cp(L + x - 97);
    if (x >= 48 && x <= 57 && D) return cp(D + x - 48);
    return c;
  }).join("");
}
const SMALLCAPS = { a: 0x1d00, b: 0x299, c: 0x1d04, d: 0x1d05, e: 0x1d07, f: 0xa730, g: 0x262, h: 0x29c, i: 0x26a, j: 0x1d0a, k: 0x1d0b, l: 0x29f, m: 0x1d0d, n: 0x274, o: 0x1d0f, p: 0x1d18, r: 0x280, s: 0xa731, t: 0x1d1b, u: 0x1d1c, v: 0x1d20, w: 0x1d21, y: 0x28f, z: 0x1d22 };
const FLIP = { a: 0x250, b: "q", c: 0x254, d: "p", e: 0x1dd, f: 0x25f, g: 0x183, h: 0x265, i: 0x1d09, j: 0x27e, k: 0x29e, l: "l", m: 0x26f, n: "u", o: "o", p: "d", q: "b", r: 0x279, s: "s", t: 0x287, u: "n", v: 0x28c, w: 0x28d, x: "x", y: 0x28e, z: "z", 1: 0x196, 2: 0x1105, 3: 0x190, 4: 0x3123, 5: 0x3db, 6: "9", 7: 0x3125, 8: "8", 9: "6", 0: "0", "?": 0xbf, "!": 0xa1, ".": 0x2d9, ",": "'", "'": ",", "(": ")", ")": "(", "[": "]", "]": "[", "<": ">", ">": "<" };
const fonts = {
  bold: ["Tebal", mapper(0x1d400, 0x1d41a, 0x1d7ce)],
  italic: ["Condong", mapper(0x1d434, 0x1d44e, 0, { h: 0x210e })],
  bolditalic: ["Tebal Condong", mapper(0x1d468, 0x1d482, 0x1d7ce)],
  mono: ["Monospace", mapper(0x1d670, 0x1d68a, 0x1d7f6)],
  script: ["Skrip", mapper(0x1d49c, 0x1d4b6, 0x1d7ce, { B: 0x212c, E: 0x2130, F: 0x2131, H: 0x210b, I: 0x2110, L: 0x2112, M: 0x2133, R: 0x211b, e: 0x212f, g: 0x210a, o: 0x2134 })],
  fraktur: ["Fraktur", mapper(0x1d504, 0x1d51e, 0, { C: 0x212d, H: 0x210c, I: 0x2111, R: 0x211c, Z: 0x2128 })],
  double: ["Garis Berganda", mapper(0x1d538, 0x1d552, 0x1d7d8, { C: 0x2102, H: 0x210d, N: 0x2115, P: 0x2119, Q: 0x211a, R: 0x211d, Z: 0x2124 })],
  bubble: ["Gelembung", (t) => [...t].map((c) => { const x = c.charCodeAt(0); return x >= 65 && x <= 90 ? cp(0x24b6 + x - 65) : x >= 97 && x <= 122 ? cp(0x24d0 + x - 97) : x >= 49 && x <= 57 ? cp(0x2460 + x - 49) : c === "0" ? cp(0x24ea) : c; }).join("")],
  square: ["Petak", (t) => [...t.toUpperCase()].map((c) => { const x = c.charCodeAt(0); return x >= 65 && x <= 90 ? cp(0x1f170 + x - 65) : c; }).join("")],
  smallcaps: ["Huruf Kecil Besar", (t) => [...t.toLowerCase()].map((c) => (SMALLCAPS[c] ? cp(SMALLCAPS[c]) : c)).join("")],
  flip: ["Terbalik", (t) => [...t.toLowerCase()].map((c) => (FLIP[c] !== undefined ? (typeof FLIP[c] === "number" ? cp(FLIP[c]) : FLIP[c]) : c)).reverse().join("")],
  strike: ["Garis Tengah", (t) => [...t].map((c) => (c === " " ? c : c + "\u0336")).join("")],
  underline: ["Garis Bawah", (t) => [...t].map((c) => (c === " " ? c : c + "\u0332")).join("")],
};
for (const [cmd, [label, fn]] of Object.entries(fonts)) {
  defs.push(simple(cmd, `Fon ${label}`, "star", `fon ${label.toLowerCase()}: .${cmd} <teks>`, fn));
}

module.exports = K.plugin("text", "Teks & Font", defs);

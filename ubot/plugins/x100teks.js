// 30 fitur teks (kategori Teks & Font). Semua lokal, tanpa API.
const crypto = require("crypto");
const { make, need } = require("../x100kit");
const T = (a, u) => { const s = a.join(" "); need(s.trim(), u); return s; };
const words = (s) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
const mapChars = (s, from, to) => { const A = [...from], B = [...to]; return [...s].map((c) => { const i = A.indexOf(c); return i < 0 ? c : B[i]; }).join(""); };
const LOW = "abcdefghijklmnopqrstuvwxyz", UP = LOW.toUpperCase();
const flipMap = { a: "ɐ", b: "q", c: "ɔ", d: "p", e: "ǝ", f: "ɟ", g: "ƃ", h: "ɥ", i: "ᴉ", j: "ɾ", k: "ʞ", l: "l", m: "ɯ", n: "u", o: "o", p: "d", q: "b", r: "ɹ", s: "s", t: "ʇ", u: "n", v: "ʌ", w: "ʍ", x: "x", y: "ʎ", z: "z", "?": "¿", "!": "¡", ".": "˙", ",": "'" };
const NATO = { a: "Alfa", b: "Bravo", c: "Charlie", d: "Delta", e: "Echo", f: "Foxtrot", g: "Golf", h: "Hotel", i: "India", j: "Juliett", k: "Kilo", l: "Lima", m: "Mike", n: "November", o: "Oscar", p: "Papa", q: "Quebec", r: "Romeo", s: "Sierra", t: "Tango", u: "Uniform", v: "Victor", w: "Whiskey", x: "X-ray", y: "Yankee", z: "Zulu" };
const leet = { a: "4", e: "3", i: "1", o: "0", s: "5", t: "7", g: "9", b: "8" };
const crc = (buf) => { let c, crcv = 0xffffffff; for (const b of buf) { c = (crcv ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crcv = (crcv >>> 8) ^ c; } return ((crcv ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0"); };
const caesar = (s, n) => s.replace(/[a-z]/gi, (c) => { const b = c <= "Z" ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + n) % 26 + 26) % 26 + b); });

module.exports = make("x100teks", "Teks & Font", [
  ["alay", "ubah teks jadi gaya alay: .alay <teks>", "aku sayang kamu", (a) => T(a, ".alay <teks>").replace(/[aeiosgbtl]/gi, (c, i) => (i % 2 ? c.toUpperCase() : ({ a: "4", e: "3", i: "1", o: "0", s: "5", g: "9", b: "8", t: "7", l: "1" }[c.toLowerCase()] || c)))],
  ["flip", "balik teks jadi terbalik (upside-down): .flip <teks>", "halo dunia", (a) => [...T(a, ".flip <teks>").toLowerCase()].reverse().map((c) => flipMap[c] || c).join("")],
  ["spaced", "beri spasi antar huruf: .spaced <teks>", "halo", (a) => [...T(a, ".spaced <teks>")].join(" ")],
  ["bubble", "teks bulat ⓑⓤⓑⓑⓛⓔ: .bubble <teks>", "halo 123", (a) => mapChars(T(a, ".bubble <teks>"), LOW + UP + "0123456789", "ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏ⓪①②③④⑤⑥⑦⑧⑨")],
  ["fullwidth", "teks lebar penuh ｆｕｌｌ: .fullwidth <teks>", "halo", (a) => [...T(a, ".fullwidth <teks>")].map((c) => (c === " " ? "\u3000" : c.charCodeAt(0) >= 33 && c.charCodeAt(0) <= 126 ? String.fromCharCode(c.charCodeAt(0) + 0xfee0) : c)).join("")],
  ["smallcaps", "huruf kapital kecil ꜱᴍᴀʟʟ: .smallcaps <teks>", "halo dunia", (a) => mapChars(T(a, ".smallcaps <teks>").toLowerCase(), LOW, "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ")],
  ["mocking", "teks ejekan sPoNgEbOb: .mocking <teks>", "kamu pasti bisa", (a) => [...T(a, ".mocking <teks>").toLowerCase()].map((c, i) => (i % 2 ? c.toUpperCase() : c)).join("")],
  ["snakecase", "ubah ke snake_case: .snakecase <teks>", "Nama Variabel Saya", (a) => words(T(a, ".snakecase <teks>")).join("_")],
  ["camelcase", "ubah ke camelCase: .camelcase <teks>", "nama variabel saya", (a) => words(T(a, ".camelcase <teks>")).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join("")],
  ["kebabcase", "ubah ke kebab-case: .kebabcase <teks>", "Nama Variabel Saya", (a) => words(T(a, ".kebabcase <teks>")).join("-")],
  ["constcase", "ubah ke CONSTANT_CASE: .constcase <teks>", "nama variabel saya", (a) => words(T(a, ".constcase <teks>")).join("_").toUpperCase()],
  ["sentence", "huruf besar di awal kalimat: .sentence <teks>", "halo. apa kabar? baik!", (a) => T(a, ".sentence <teks>").toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (m, p, c) => p + c.toUpperCase())],
  ["swapcase", "tukar huruf besar/kecil: .swapcase <teks>", "Halo Dunia", (a) => [...T(a, ".swapcase <teks>")].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join("")],
  ["freqhuruf", "frekuensi huruf (top 8): .freqhuruf <teks>", "belajar bahasa indonesia", (a) => { const m = {}; for (const c of T(a, ".freqhuruf <teks>").toLowerCase()) if (/\p{L}/u.test(c)) m[c] = (m[c] || 0) + 1; const r = Object.entries(m).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 8); need(r.length, ".freqhuruf <teks>"); return r.map(([k, v]) => [k, v + " kali"]); }],
  ["katapanjang", "cari kata terpanjang: .katapanjang <teks>", "pemrograman itu menyenangkan sekali", (a) => { const w = T(a, ".katapanjang <teks>").split(/\s+/).map((x) => x.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean); const b = w.sort((x, y) => y.length - x.length)[0]; return [["Kata", b], ["Panjang", b.length + " huruf"]]; }],
  ["katasering", "kata yang paling sering muncul: .katasering <teks>", "aku makan nasi aku minum teh aku tidur", (a) => { const m = {}; for (const w of words(T(a, ".katasering <teks>"))) m[w] = (m[w] || 0) + 1; return Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => [k, v + " kali"]); }],
  ["cekanagram", "cek dua kata anagram atau bukan: .cekanagram <a> <b>", "listen silent", (a) => { need(a.length >= 2, ".cekanagram <kata1> <kata2>"); const n = (s) => [...s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")].sort().join(""); return n(a[0]) === n(a[1]) ? "Ya, keduanya anagram." : "Bukan anagram."; }],
  ["hapusvokal", "hapus semua huruf vokal: .hapusvokal <teks>", "selamat pagi", (a) => T(a, ".hapusvokal <teks>").replace(/[aiueo]/gi, "")],
  ["vokali", "ganti semua vokal jadi satu huruf: .vokali <vokal> <teks>", "i selamat pagi", (a) => { need(a.length >= 2 && /^[aiueo]$/i.test(a[0]), ".vokali <a|i|u|e|o> <teks>"); return a.slice(1).join(" ").replace(/[aiueo]/gi, a[0].toLowerCase()); }],
  ["hashtag", "ubah kalimat jadi hashtag: .hashtag <teks>", "promo akhir tahun seru", (a) => words(T(a, ".hashtag <teks>")).slice(0, 15).map((w) => "#" + w).join(" ")],
  ["unicodeinfo", "kode unicode tiap karakter: .unicodeinfo <teks>", "Hi😀", (a) => [...T(a, ".unicodeinfo <teks>")].slice(0, 12).map((c) => [c, "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")])],
  ["asciikode", "teks ke kode ASCII/desimal: .asciikode <teks>", "Halo", (a) => [...T(a, ".asciikode <teks>")].map((c) => c.codePointAt(0)).join(" ")],
  ["teksbiner", "teks ke biner 8-bit: .teksbiner <teks>", "Hi", (a) => [...Buffer.from(T(a, ".teksbiner <teks>"))].map((b) => b.toString(2).padStart(8, "0")).join(" ")],
  ["binerteks", "biner ke teks: .binerteks <biner>", "01001000 01101001", (a) => { const p = T(a, ".binerteks <biner>").split(/\s+/); need(p.every((x) => /^[01]{8}$/.test(x)), ".binerteks 01001000 01101001"); return Buffer.from(p.map((x) => parseInt(x, 2))).toString("utf8"); }],
  ["tekshex", "teks ke hex: .tekshex <teks>", "Halo", (a) => Buffer.from(T(a, ".tekshex <teks>")).toString("hex")],
  ["hexteks", "hex ke teks: .hexteks <hex>", "48616c6f", (a) => { const s = T(a, ".hexteks <hex>").replace(/\s/g, ""); need(/^([0-9a-f]{2})+$/i.test(s), ".hexteks 48616c6f"); return Buffer.from(s, "hex").toString("utf8"); }],
  ["caesar", "sandi Caesar: .caesar <geser> <teks>", "3 halo dunia", (a) => { const n = Number(a[0]); need(Number.isInteger(n) && a.length > 1, ".caesar <geser> <teks>  (contoh: .caesar 3 halo)"); return caesar(a.slice(1).join(" "), n); }],
  ["atbash", "sandi Atbash (a<->z): .atbash <teks>", "halo", (a) => T(a, ".atbash <teks>").replace(/[a-z]/gi, (c) => { const b = c <= "Z" ? 65 : 97; return String.fromCharCode(b + 25 - (c.charCodeAt(0) - b)); })],
  ["leetspeak", "ubah ke leet speak: .leetspeak <teks>", "elite hacker", (a) => [...T(a, ".leetspeak <teks>").toLowerCase()].map((c) => leet[c] || c).join("")],
  ["nato", "ejaan alfabet fonetik NATO: .nato <kata>", "jogja", (a) => [...T(a, ".nato <kata>").toLowerCase()].filter((c) => NATO[c]).map((c) => NATO[c]).join(" · ")],
  ["crc32", "checksum CRC32: .crc32 <teks>", "halo", (a) => crc(Buffer.from(T(a, ".crc32 <teks>")))],
]);

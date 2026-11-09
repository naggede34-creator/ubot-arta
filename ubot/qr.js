// Penjana kod QR (mod bait, ECC M, versi 1-20) + penulis PNG. Tanpa kebergantungan luar.
const zlib = require("zlib");

// [eccPerBlock, blok1, data1, blok2, data2] bagi ECC M
const M = {
  1: [10, 1, 16, 0, 0], 2: [16, 1, 28, 0, 0], 3: [26, 1, 44, 0, 0], 4: [18, 2, 32, 0, 0], 5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0], 7: [18, 4, 31, 0, 0], 8: [22, 2, 38, 2, 39], 9: [22, 3, 36, 2, 37], 10: [26, 4, 43, 1, 44],
  11: [30, 1, 50, 4, 51], 12: [22, 6, 36, 2, 37], 13: [22, 8, 37, 1, 38], 14: [24, 4, 40, 5, 41], 15: [24, 5, 41, 5, 42],
  16: [28, 7, 45, 3, 46], 17: [28, 10, 46, 1, 47], 18: [26, 9, 43, 4, 44], 19: [26, 3, 44, 11, 45], 20: [26, 3, 41, 13, 42],
};
const ALIGN = {
  2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62], 14: [6, 26, 46, 66], 15: [6, 26, 48, 70], 16: [6, 26, 50, 74],
  17: [6, 30, 54, 78], 18: [6, 30, 56, 82], 19: [6, 30, 58, 86], 20: [6, 34, 62, 90],
};
const dataCw = (v) => M[v][1] * M[v][2] + M[v][3] * M[v][4];

// jumlah modul data (selepas fungsi) -> jumlah codeword mentah
function rawCodewords(v) {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) {
    const n = Math.floor(v / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (v >= 7) r -= 36;
  }
  return Math.floor(r / 8);
}

// ---- Reed-Solomon GF(256), polinomial 0x11d ----
const EXP = new Array(512);
const LOG = new Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsGen(deg) {
  let g = [1];
  for (let i = 0; i < deg; i++) {
    const n = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      n[j] ^= g[j];
      n[j + 1] ^= gmul(g[j], EXP[i]);
    }
    g = n;
  }
  return g; // g[0] = 1 (darjah tertinggi)
}
function rsRem(data, deg) {
  const g = rsGen(deg);
  const res = new Array(deg).fill(0);
  for (const b of data) {
    const f = b ^ res.shift();
    res.push(0);
    if (f) for (let i = 0; i < deg; i++) res[i] ^= gmul(g[i + 1], f);
  }
  return res;
}

// ---- Bina matriks ----
function encode(text) {
  const bytes = Buffer.from(String(text), "utf8");
  let ver = 0;
  for (let v = 1; v <= 20; v++) {
    const ccBits = v < 10 ? 8 : 16;
    if (4 + ccBits + bytes.length * 8 <= dataCw(v) * 8) { ver = v; break; }
  }
  if (!ver) throw new Error("Data terlalu panjang untuk QR");
  const bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const cap = dataCw(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));

  // pecah blok + ECC + selang-seli
  const [ecc, b1, d1, b2, d2] = M[ver];
  const blocks = [];
  let p = 0;
  for (let i = 0; i < b1 + b2; i++) {
    const n = i < b1 ? d1 : d2;
    const d = data.slice(p, p + n);
    p += n;
    blocks.push({ d, e: rsRem(d, ecc) });
  }
  const out = [];
  const maxD = Math.max(d1, d2 || 0);
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ecc; i++) for (const b of blocks) out.push(b.e[i]);
  if (out.length !== rawCodewords(ver)) throw new Error("Jadual QR tidak sepadan (versi " + ver + ")");
  return { ver, cw: out };
}

function bchFormat(data) {
  let r = data;
  for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
  return ((data << 10) | r) ^ 0x5412;
}
function bchVersion(v) {
  let r = v;
  for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
  return (v << 12) | r;
}

function matrix(text) {
  const { ver, cw } = encode(text);
  const n = ver * 4 + 17;
  const mod = Array.from({ length: n }, () => new Array(n).fill(false));
  const fn = Array.from({ length: n }, () => new Array(n).fill(false)); // modul fungsi
  const setF = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };

  // masa
  for (let i = 0; i < n; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
  // corak pencari + pemisah
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      setF(x, y, d !== 2 && d !== 4);
    }
  }
  // penjajaran
  const al = ALIGN[ver] || [];
  for (const cy of al) for (const cx of al) {
    if ((cx === 6 && cy === 6) || (cx === 6 && cy === n - 7) || (cx === n - 7 && cy === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // simpan ruang format + versi
  const drawFormat = (mask) => {
    const f = bchFormat((0b00 << 3) | mask); // ECC M = 00
    const bit = (i) => ((f >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) setF(8, i, bit(i));
    setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setF(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setF(8, n - 15 + i, bit(i));
    setF(8, n - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    const v = bchVersion(ver);
    for (let i = 0; i < 18; i++) {
      const b = ((v >>> i) & 1) !== 0;
      const a = n - 11 + (i % 3), c = Math.floor(i / 3);
      setF(a, c, b);
      setF(c, a, b);
    }
  }

  // letak data (zigzag)
  const dbits = [];
  for (const b of cw) for (let i = 7; i >= 0; i--) dbits.push((b >>> i) & 1);
  let k = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? n - 1 - vert : vert;
        if (!fn[y][x] && k < dbits.length) mod[y][x] = dbits[k++] === 1;
      }
    }
  }

  // pilih topeng terbaik
  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  let best = null;
  for (let m = 0; m < 8; m++) {
    const g = mod.map((r) => r.slice());
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fn[y][x] && MASKS[m](x, y)) g[y][x] = !g[y][x];
    // tulis format untuk topeng ini
    const saveM = mod.map((r) => r.slice());
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) mod[y][x] = g[y][x];
    drawFormat(m);
    const pen = penalty(mod, n);
    if (!best || pen < best.pen) best = { pen, g: mod.map((r) => r.slice()) };
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) mod[y][x] = saveM[y][x];
  }
  return best.g;
}

function penalty(g, n) {
  let p = 0;
  const run = (line) => {
    let s = 0, c = 1;
    for (let i = 1; i < n; i++) {
      if (line[i] === line[i - 1]) c++; else { if (c >= 5) s += c - 2; c = 1; }
    }
    if (c >= 5) s += c - 2;
    return s;
  };
  for (let y = 0; y < n; y++) p += run(g[y]);
  for (let x = 0; x < n; x++) p += run(g.map((r) => r[x]));
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const c = g[y][x];
    if (c === g[y][x + 1] && c === g[y + 1][x] && c === g[y + 1][x + 1]) p += 3;
  }
  const pat = [true, false, true, true, true, false, true, false, false, false, false];
  const rpat = pat.slice().reverse();
  const hit = (get) => {
    let c = 0;
    for (let i = 0; i + 11 <= n; i++) {
      let a = true, b = true;
      for (let j = 0; j < 11; j++) { const v = get(i + j); if (v !== pat[j]) a = false; if (v !== rpat[j]) b = false; }
      if (a) c++;
      if (b) c++;
    }
    return c;
  };
  for (let y = 0; y < n; y++) p += hit((i) => g[y][i]) * 40;
  for (let x = 0; x < n; x++) p += hit((i) => g[i][x]) * 40;
  let dark = 0;
  for (const r of g) for (const v of r) if (v) dark++;
  p += Math.floor(Math.abs((dark * 20) / (n * n) - 10)) * 10;
  return p;
}

// ---- PNG ----
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};
// grid boolean -> PNG skala kelabu (hitam/putih), scale px per modul, quiet zone 4 modul
function png(grid, scale = 10, quiet = 4) {
  const n = grid.length;
  const size = (n + quiet * 2) * scale;
  const raw = Buffer.alloc((size + 1) * size, 255);
  for (let y = 0; y < size; y++) {
    raw[y * (size + 1)] = 0;
    const gy = Math.floor(y / scale) - quiet;
    for (let x = 0; x < size; x++) {
      const gx = Math.floor(x / scale) - quiet;
      if (gy >= 0 && gx >= 0 && gy < n && gx < n && grid[gy][gx]) raw[y * (size + 1) + 1 + x] = 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

module.exports = { matrix, png, encode, rawCodewords, dataCw, M };

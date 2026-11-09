// Penjana "screenshot profil" gaya iPhone (SVG -> PNG) untuk .ssprofile
// - Fon: fonts/LiberationSans-*.ttf (SIL OFL 1.1, disertakan) supaya teks keluar walaupun server tiada fon.
// - PNG: @resvg/resvg-js (disyorkan; tiada kebergantungan sistem). Jika tiada, cuba "sharp".
// - Emoji biasa dalam nama/bio: gambar Twemoji dimuat turun dari CDN (jika gagal, emoji itu dilangkau).
// - Emoji premium (status), corak latar profil dan gift/sticker datang sebagai gambar daripada Telegram.
const fs = require("fs");
const path = require("path");
const M = require("./fontmetrics");

const FONT_DIR = path.join(__dirname, "fonts");
const FONT_FILES = ["LiberationSans-Regular.ttf", "LiberationSans-Bold.ttf"].map((f) => path.join(FONT_DIR, f));
const FAM = "Liberation Sans";
const W = 393; // lebar skrin iPhone (point); gambar akhir = x3 (1179 px)
const SCALE = 3;
const MIN_H = 852;

// ---------------------------------------------------------------- teks
const EMOJI_RE = /(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*)/gu;
const x = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cw = (cp, bold) => (bold ? M.B : M.R).get(cp) ?? 1139;
const tw = (s, size, bold) => {
  let w = 0;
  for (const ch of s) w += cw(ch.codePointAt(0), bold);
  return (w * size) / M.UPM;
};
const EMO_W = 1.18; // lebar emoji (x saiz fon)

function isEmoji(s) {
  const cps = [...s];
  if (cps.length === 1 && cps[0].codePointAt(0) < 0x10000 && M.R.has(cps[0].codePointAt(0))) return false; // contoh (c) (tm) ada dalam fon
  return true;
}
function pushText(out, s) {
  let t = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp === 10 || cp === 13 || cp === 9) t += " ";
    else if (M.R.has(cp)) t += ch;
  }
  if (t) out.push({ t });
}
function tokens(str) {
  const s = String(str == null ? "" : str).replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, "");
  const out = [];
  let last = 0;
  for (const m of s.matchAll(EMOJI_RE)) {
    if (m.index > last) pushText(out, s.slice(last, m.index));
    if (isEmoji(m[0])) out.push({ e: m[0] });
    else pushText(out, m[0]);
    last = m.index + m[0].length;
  }
  if (last < s.length) pushText(out, s.slice(last));
  return out;
}

// Teks boleh dipaparkan? (aksara di luar fon, contoh Cina/Arab/Thai, dibuang). hasTxt = ada huruf; hasAny = huruf atau emoji.
const hasTxt = (s) => tokens(s).some((t) => t.t && t.t.trim());
const hasAny = (s) => tokens(s).some((t) => (t.t && t.t.trim()) || t.e);

// ---- emoji biasa (Twemoji) ----
const EMO = new Map(); // emoji -> data URI | null
const emojiCode = (e) => {
  const cps = [...e].map((c) => c.codePointAt(0));
  return (cps.includes(0x200d) ? cps : cps.filter((c) => c !== 0xfe0f)).map((c) => c.toString(16)).join("-");
};
async function fetchEmoji(e) {
  const url = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/${emojiCode(e)}.png`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 5000);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length ? "data:image/png;base64," + b.toString("base64") : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}
async function loadEmoji(strings) {
  const need = new Set();
  for (const s of strings) for (const tk of tokens(s)) if (tk.e && !EMO.has(tk.e)) need.add(tk.e);
  if (EMO.size > 300) EMO.clear();
  await Promise.all([...need].slice(0, 30).map(async (e) => EMO.set(e, await fetchEmoji(e))));
}
const keepTokens = (tks) => tks.filter((tk) => !tk.e || EMO.get(tk.e));
const atomW = (a, size, bold) => (a.e ? size * EMO_W : tw(a.t, size, bold));
const lineW = (atoms, size, bold) => atoms.reduce((n, a) => n + atomW(a, size, bold), 0);

// Pecah ke atom (perkataan / ruang / emoji) lalu bungkus mengikut lebar. maxLines: lebihan dipotong dengan "..."
function wrap(str, size, bold, maxW, maxLines = 99) {
  const atoms = [];
  for (const tk of keepTokens(tokens(str))) {
    if (tk.e) atoms.push({ e: tk.e });
    else for (const p of tk.t.split(/( +)/)) if (p) atoms.push({ t: p, sp: p[0] === " " });
  }
  const lines = [];
  let cur = [];
  let curW = 0;
  const flush = () => {
    while (cur.length && cur[cur.length - 1].sp) cur.pop();
    lines.push(cur);
    cur = [];
    curW = 0;
  };
  const place = (a) => {
    const w = atomW(a, size, bold);
    if (a.sp && !cur.length) return;
    if (curW + w > maxW && cur.length && !a.sp) flush();
    cur.push(a);
    curW += w;
  };
  for (const a of atoms) {
    if (!a.e && !a.sp && atomW(a, size, bold) > maxW) {
      let piece = "";
      for (const ch of a.t) {
        if (tw(piece + ch, size, bold) > maxW && piece) {
          place({ t: piece });
          flush();
          piece = "";
        }
        piece += ch;
      }
      if (piece) place({ t: piece });
    } else place(a);
  }
  if (cur.length) flush();
  if (lines.length > maxLines) {
    lines.length = maxLines;
    const last = lines[maxLines - 1];
    while (last.length && lineW([...last, { t: "\u2026" }], size, bold) > maxW) last.pop();
    last.push({ t: "\u2026" });
  }
  return lines.length ? lines : [[]];
}

// Lukis satu baris. anchor: start | middle | end. Pulangkan SVG.
function drawLine(atoms, px, py, size, fill, bold, anchor = "start", extra = "") {
  const w = lineW(atoms, size, bold);
  let cx = anchor === "middle" ? px - w / 2 : anchor === "end" ? px - w : px;
  let out = "";
  let run = "";
  let runX = cx;
  const flush = () => {
    if (run) out += `<text x="${runX.toFixed(2)}" y="${py}" font-size="${size}" font-weight="${bold ? 700 : 400}" fill="${fill}" xml:space="preserve"${extra}>${x(run)}</text>`;
    run = "";
  };
  for (const a of atoms) {
    if (a.e) {
      flush();
      const s = size * 1.08;
      out += `<image x="${(cx + size * 0.05).toFixed(2)}" y="${(py - size * 0.86).toFixed(2)}" width="${s.toFixed(2)}" height="${s.toFixed(2)}" xlink:href="${EMO.get(a.e)}"/>`;
      cx += size * EMO_W;
      runX = cx;
    } else {
      if (!run) runX = cx;
      run += a.t;
      cx += tw(a.t, size, bold);
    }
  }
  flush();
  return out;
}
// Satu baris ringkas (potong dengan ...)
const oneLine = (str, size, bold, maxW) => wrap(str, size, bold, maxW, 1)[0];

// ---------------------------------------------------------------- gambar
function mimeOf(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") return "image/webp";
  if (b.slice(0, 3).toString() === "GIF") return "image/gif";
  return null;
}
const dataUri = (b) => {
  const m = mimeOf(b);
  return m ? `data:${m};base64,${b.toString("base64")}` : null;
};

// ---------------------------------------------------------------- tema & warna
const THEMES = {
  dark: { bg: "#000000", card: "#1c1c1e", sep: "#38383a", text: "#ffffff", sub: "#8e8e93", link: "#3e88f7", head0: "#2a2a2d", head1: "#121214", chip: "#2c2c2e" },
  light: { bg: "#efeff4", card: "#ffffff", sep: "#d9d9de", text: "#000000", sub: "#8a8a8e", link: "#007aff", head0: "#ffffff", head1: "#f4f4f8", chip: "#e9e9ee" },
};
// Warna latar profil Telegram (anggaran): indeks -> [atas, bawah]
const PROFILE_PAL = [
  ["#b5413f", "#e0726a"], ["#c97a2d", "#efa752"], ["#6b4fb8", "#9a82dd"], ["#3f8f4a", "#74c27b"], ["#2f93a8", "#5cc2d6"],
  ["#2e6fc7", "#5b9cee"], ["#b04a8c", "#df7fba"],
];
const profilePal = (n) => {
  const i = Math.abs(Number(n) || 0);
  const base = PROFILE_PAL[i % PROFILE_PAL.length];
  if (i < PROFILE_PAL.length) return base;
  const dim = (c) => "#" + [1, 3, 5].map((k) => Math.round(parseInt(c.slice(k, k + 2), 16) * 0.82).toString(16).padStart(2, "0")).join("");
  return [dim(base[0]), dim(base[1])];
};
const AVATAR_PAL = [["#ff885e", "#ff516a"], ["#ffcd6a", "#ffa85c"], ["#82b1ff", "#665fff"], ["#a0de7e", "#54cb68"], ["#53edd6", "#28c9b7"], ["#72d5fd", "#2a9ef1"], ["#e0a2f3", "#d669ed"]];

// ---------------------------------------------------------------- ikon (kotak 24x24, gaya Material, Apache-2.0)
const IC = {
  chat: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z",
  bell: "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z",
  call: "M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z",
  video: "M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z",
  more: "M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
  share: "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z",
};
const icon = (d, cx, cy, size, fill, extra = "") => `<g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${size / 24})"${extra}><path d="${d}" fill="${fill}"/></g>`;
const starPath = (cx, cy, r) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.42 : r;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
};
const rr = (px, py, w, h, r, fill, extra = "") => `<rect x="${px}" y="${py}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${extra}/>`;

// ---------------------------------------------------------------- bina SVG
const fmtNum = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e4 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","));

function build(model) {
  const T = THEMES[model.theme === "light" ? "light" : "dark"];
  const defs = [];
  let uid = 0;
  const nid = (p) => `${p}${++uid}`;
  const body = [];
  const push = (s) => body.push(s);

  const hasColor = model.profileColor !== null && model.profileColor !== undefined;
  const pal = hasColor ? profilePal(model.profileColor) : null;
  const onHead = hasColor ? "#ffffff" : T.text; // warna teks di atas header
  const subHead = hasColor ? "rgba(255,255,255,0.78)" : T.sub;
  const glass = hasColor ? `fill="#ffffff" fill-opacity="0.22"` : `fill="${T.card}"`;

  // ---- header
  const HH = 372;
  const gid = nid("hg");
  defs.push(`<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal ? pal[0] : T.head0}"/><stop offset="1" stop-color="${pal ? pal[1] : T.head1}"/></linearGradient>`);
  push(`<rect width="${W}" height="${HH}" fill="url(#${gid})"/>`);

  // ---- corak emoji latar profil
  const AX = W / 2;
  const AY = 160;
  if (model.pattern) {
    const tid = nid("tint");
    defs.push(`<filter id="${tid}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/></filter>`);
    const spots = [[-95, -52, 26], [95, -52, 26], [-72, -98, 22], [72, -98, 22], [-142, -12, 22], [142, -12, 22], [-128, -72, 18], [128, -72, 18], [-168, 42, 18], [168, 42, 18], [-104, 62, 20], [104, 62, 20], [0, -120, 20], [-46, -128, 16], [46, -128, 16], [-172, -78, 16], [172, -78, 16], [-152, 84, 16], [152, 84, 16], [-60, -70, 14], [60, -70, 14]];
    spots.forEach(([dx, dy, s], i) => {
      const cx = AX + dx;
      const cy = AY + dy;
      if (cy < 6 || cx < 6 || cx > W - 6) return;
      push(`<g opacity="${hasColor ? 0.2 : 0.1}" transform="rotate(${((i * 41) % 50) - 25} ${cx} ${cy})"><image x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" filter="url(#${tid})" xlink:href="${dataUri(model.pattern)}"/></g>`);
    });
  }

  // ---- bar status (Dynamic Island, masa, isyarat, wifi, bateri)
  push(`<text x="54" y="35" font-size="17" font-weight="700" fill="${onHead}" text-anchor="middle">${x(model.time || "9:41")}</text>`);
  push(rr(133.5, 11, 126, 37, 18.5, "#000000"));
  for (let i = 0; i < 4; i++) push(rr(300 + i * 4.9, 33 - (4.2 + i * 2.5), 3.2, 4.2 + i * 2.5, 0.9, onHead));
  const wx = 330;
  const wy = 34;
  [[10.5, 0], [7, 0], [3.4, 0]].forEach(([r]) => push(`<path d="M ${wx - r * 0.78} ${wy - r * 0.62 - 1} A ${r} ${r} 0 0 1 ${wx + r * 0.78} ${wy - r * 0.62 - 1}" fill="none" stroke="${onHead}" stroke-width="2.3" stroke-linecap="round"/>`));
  push(`<circle cx="${wx}" cy="${wy - 2.3}" r="1.9" fill="${onHead}"/>`);
  push(rr(340, 24, 25, 12, 3.8, "none", ` stroke="${onHead}" stroke-opacity="0.45" stroke-width="1"`));
  push(rr(341.8, 25.8, 21.4, 8.4, 2.3, onHead));
  push(rr(366, 28.2, 1.8, 4.2, 0.9, onHead, ` fill-opacity="0.5"`));

  // ---- bar navigasi
  push(`<circle cx="34" cy="82" r="19" ${glass}/>`);
  push(`<path d="M 38 73 L 29 82 L 38 91" fill="none" stroke="${onHead}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`);
  push(`<circle cx="359" cy="82" r="19" ${glass}/>`);
  push(icon(IC.more, 359, 82, 24, onHead));

  // nama yang tidak boleh dipaparkan fon (aksara tidak disokong) -> guna @username
  const dispName = hasTxt(model.name) ? model.name : model.username ? model.username : "User";

  // ---- avatar
  const avId = nid("av");
  defs.push(`<clipPath id="${avId}"><circle cx="${AX}" cy="${AY}" r="52"/></clipPath>`);
  if (model.avatar && dataUri(model.avatar)) {
    push(`<image x="${AX - 52}" y="${AY - 52}" width="104" height="104" preserveAspectRatio="xMidYMid slice" clip-path="url(#${avId})" xlink:href="${dataUri(model.avatar)}"/>`);
  } else {
    const [c0, c1] = AVATAR_PAL[Math.abs(Number(model.seed) || 0) % AVATAR_PAL.length];
    const ag = nid("ag");
    defs.push(`<linearGradient id="${ag}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c0}"/><stop offset="1" stop-color="${c1}"/></linearGradient>`);
    push(`<circle cx="${AX}" cy="${AY}" r="52" fill="url(#${ag})"/>`);
    const ini = tokens(dispName).filter((t) => t.t).map((t) => t.t).join(" ").split(/\s+/).filter(Boolean).slice(0, 2).map((s) => [...s][0].toUpperCase()).join("") || "?";
    push(`<text x="${AX}" y="${AY + 15}" font-size="42" font-weight="700" fill="#ffffff" text-anchor="middle">${x(ini)}</text>`);
  }

  // ---- nama + lencana (verified / premium / emoji status)
  const nameSize = 26;
  const badges = [];
  if (model.verified) badges.push("verified");
  if (model.emojiStatus && dataUri(model.emojiStatus)) badges.push("emoji");
  else if (model.premium) badges.push("premium");
  const badgeW = badges.length * (nameSize * 0.92 + 4);
  const nameAtoms = oneLine(dispName, nameSize, true, W - 40 - badgeW);
  const nw = lineW(nameAtoms, nameSize, true);
  const nx = AX - (nw + badgeW) / 2;
  push(drawLine(nameAtoms, nx, 246, nameSize, onHead, true, "start"));
  let bx = nx + nw + 4;
  for (const b of badges) {
    const s = nameSize * 0.92;
    const cy = 246 - nameSize * 0.34;
    if (b === "verified") {
      push(`<circle cx="${bx + s / 2}" cy="${cy}" r="${s / 2}" fill="${hasColor ? "#ffffff" : T.link}"/>`);
      push(`<path d="M ${bx + s * 0.27} ${cy} L ${bx + s * 0.44} ${cy + s * 0.17} L ${bx + s * 0.74} ${cy - s * 0.2}" fill="none" stroke="${hasColor ? pal[0] : "#ffffff"}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`);
    } else if (b === "emoji") {
      push(`<image x="${bx}" y="${cy - s / 2}" width="${s}" height="${s}" xlink:href="${dataUri(model.emojiStatus)}"/>`);
    } else {
      const pg = nid("pg");
      defs.push(`<linearGradient id="${pg}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7f6bff"/><stop offset="1" stop-color="#e56bd0"/></linearGradient>`);
      push(`<polygon points="${starPath(bx + s / 2, cy, s / 2)}" fill="${hasColor ? "#ffffff" : "url(#" + pg + ")"}"/>`);
    }
    bx += s + 4;
  }
  push(`<text x="${AX}" y="270" font-size="15" fill="${model.statusOnline ? (hasColor ? "#ffffff" : T.link) : subHead}" text-anchor="middle">${x(model.status || "")}</text>`);

  // ---- butang tindakan
  const acts = model.bot ? [["chat", "message"], ["bell", "mute"], ["share", "share"], ["more", "more"]] : [["chat", "message"], ["bell", "mute"], ["call", "call"], ["video", "video"]];
  const bw = (W - 32 - 8 * 3) / 4;
  acts.forEach(([ic, label], i) => {
    const bx2 = 16 + i * (bw + 8);
    push(rr(bx2, 292, bw, 62, 13, hasColor ? "#ffffff" : T.card, hasColor ? ` fill-opacity="0.2"` : ""));
    push(icon(IC[ic], bx2 + bw / 2, 311, 22, hasColor ? "#ffffff" : T.link));
    push(`<text x="${bx2 + bw / 2}" y="343" font-size="11" fill="${hasColor ? "#ffffff" : T.link}" text-anchor="middle">${label}</text>`);
  });

  // ---- kad maklumat
  let y = HH + 16;
  const rows = [];
  if (model.phone) rows.push({ v: model.phone, l: "mobile", link: false });
  if (model.about && hasAny(model.about)) rows.push({ v: model.about, l: "bio", link: false, multi: true });
  if (model.username) rows.push({ v: "@" + model.username, l: "username", link: true, qr: true });
  if (model.birthday) rows.push({ v: model.birthday, l: "birthday", link: false });
  if (rows.length) {
    const prep = rows.map((r) => {
      const lines = wrap(r.v, 17, false, W - 32 - 32 - (r.qr ? 34 : 0), r.multi ? 4 : 1);
      return { ...r, lines, h: 16 + lines.length * 22 + 8 + 20 };
    });
    const total = prep.reduce((n, r) => n + r.h, 0);
    push(rr(16, y, W - 32, total, 14, T.card));
    let ry = y;
    prep.forEach((r, i) => {
      r.lines.forEach((ln, k) => push(drawLine(ln, 32, ry + 32 + k * 22, 17, r.link ? T.link : T.text, false)));
      push(`<text x="32" y="${ry + 32 + (r.lines.length - 1) * 22 + 21}" font-size="13" fill="${T.sub}">${x(r.l)}</text>`);
      if (r.qr) {
        const qx = W - 16 - 36;
        const qy = ry + r.h / 2 - 9;
        for (const [dx, dy] of [[0, 0], [11, 0], [0, 11]]) push(`<rect x="${qx + dx}" y="${qy + dy}" width="7" height="7" rx="1.6" fill="none" stroke="${T.link}" stroke-width="1.8"/>`);
        push(`<rect x="${qx + 11}" y="${qy + 11}" width="3.4" height="3.4" fill="${T.link}"/><rect x="${qx + 15.5}" y="${qy + 15.5}" width="3" height="3" fill="${T.link}"/>`);
      }
      ry += r.h;
      if (i < prep.length - 1) push(`<line x1="32" y1="${ry}" x2="${W - 16}" y2="${ry}" stroke="${T.sep}" stroke-width="0.6"/>`);
    });
    y += total + 14;
  }

  // ---- channel peribadi
  const ch = model.channel;
  if (ch) {
    push(`<text x="32" y="${y + 12}" font-size="13" fill="${T.sub}">${x("CHANNEL")}</text>`);
    y += 22;
    const chTitle = hasTxt(ch.title) ? ch.title : ch.username ? "@" + ch.username : "Channel";
    const postLines = ch.post && hasAny(ch.post) ? wrap(ch.post, 15, false, W - 32 - 32 - 56, 2) : null;
    const h1 = 66;
    const h2 = postLines ? 14 + postLines.length * 19 + 12 : 0;
    push(rr(16, y, W - 32, h1 + h2, 14, T.card));
    // avatar channel
    const cid = nid("cav");
    defs.push(`<clipPath id="${cid}"><circle cx="${16 + 16 + 20}" cy="${y + 33}" r="20"/></clipPath>`);
    if (ch.avatar && dataUri(ch.avatar)) push(`<image x="${16 + 16}" y="${y + 13}" width="40" height="40" preserveAspectRatio="xMidYMid slice" clip-path="url(#${cid})" xlink:href="${dataUri(ch.avatar)}"/>`);
    else {
      const [c0, c1] = AVATAR_PAL[Math.abs(Number(ch.seed) || 3) % AVATAR_PAL.length];
      const cg = nid("cg");
      defs.push(`<linearGradient id="${cg}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c0}"/><stop offset="1" stop-color="${c1}"/></linearGradient>`);
      push(`<circle cx="${16 + 16 + 20}" cy="${y + 33}" r="20" fill="url(#${cg})"/>`);
      const ini = (tokens(chTitle).filter((t) => t.t).map((t) => t.t).join("").replace(/^@/, "").trim()[0] || "C").toUpperCase();
      push(`<text x="${16 + 16 + 20}" y="${y + 40}" font-size="20" font-weight="700" fill="#ffffff" text-anchor="middle">${x(ini)}</text>`);
    }
    const tAtoms = oneLine(chTitle, 17, true, W - 32 - 72 - 40);
    push(drawLine(tAtoms, 16 + 16 + 40 + 12, y + 29, 17, T.text, true));
    if (ch.verified) {
      const vx = 16 + 16 + 40 + 12 + lineW(tAtoms, 17, true) + 4;
      push(`<circle cx="${vx + 7}" cy="${y + 24}" r="7" fill="${T.link}"/><path d="M ${vx + 3.6} ${y + 24} L ${vx + 6} ${y + 26.4} L ${vx + 10.4} ${y + 21.6}" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    const sub = ch.subs ? `${fmtNum(ch.subs)} subscribers` : ch.username ? "@" + ch.username : "channel";
    push(`<text x="${16 + 16 + 40 + 12}" y="${y + 49}" font-size="13" fill="${T.sub}">${x(sub)}</text>`);
    push(`<path d="M ${W - 34} ${y + 27} L ${W - 28} ${y + 33} L ${W - 34} ${y + 39}" fill="none" stroke="${T.sub}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);
    if (postLines) {
      push(`<line x1="32" y1="${y + h1}" x2="${W - 16}" y2="${y + h1}" stroke="${T.sep}" stroke-width="0.6"/>`);
      postLines.forEach((ln, k) => push(drawLine(ln, 32, y + h1 + 25 + k * 19, 15, T.text, false)));
      if (ch.postDate) push(`<text x="${W - 32}" y="${y + h1 + 25}" font-size="12" fill="${T.sub}" text-anchor="end">${x(ch.postDate)}</text>`);
    }
    y += h1 + h2 + 14;
  }

  // ---- tab (Posts | Gifts | Media | ...) + grid gift
  const gifts = model.gifts && model.gifts.items && model.gifts.items.length ? model.gifts : null;
  const tabs = ["Posts", gifts ? `Gifts ${model.gifts.count || model.gifts.items.length}` : "Gifts", "Media", "Files", "Links"];
  const sel = gifts ? 1 : 2;
  let tx = 20;
  y += 6;
  tabs.forEach((t, i) => {
    const w = tw(t, 15, i === sel);
    push(`<text x="${tx}" y="${y + 18}" font-size="15" font-weight="${i === sel ? 700 : 400}" fill="${i === sel ? T.link : T.sub}">${x(t)}</text>`);
    if (i === sel) push(rr(tx - 2, y + 28, w + 4, 3, 1.5, T.link));
    tx += w + 26;
  });
  push(`<line x1="0" y1="${y + 31}" x2="${W}" y2="${y + 31}" stroke="${T.sep}" stroke-width="0.6"/>`);
  y += 44;

  if (gifts) {
    const gw = (W - 32 - 16) / 3;
    const gh = 138;
    const list = gifts.items.slice(0, 9);
    list.forEach((g, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const gx = 16 + col * (gw + 8);
      const gy = y + row * (gh + 8);
      const bgid = nid("gb");
      if (g.backdrop) {
        defs.push(`<radialGradient id="${bgid}" cx="0.5" cy="0.4" r="0.75"><stop offset="0" stop-color="${g.backdrop[0]}"/><stop offset="1" stop-color="${g.backdrop[1]}"/></radialGradient>`);
        push(rr(gx, gy, gw, gh, 14, `url(#${bgid})`));
      } else push(rr(gx, gy, gw, gh, 14, T.card));
      if (g.img && dataUri(g.img)) push(`<image x="${gx + (gw - 78) / 2}" y="${gy + 12}" width="78" height="78" preserveAspectRatio="xMidYMid meet" xlink:href="${dataUri(g.img)}"/>`);
      else push(`<circle cx="${gx + gw / 2}" cy="${gy + 51}" r="26" fill="${T.chip}"/>`);
      if (g.pinned) push(`<circle cx="${gx + 14}" cy="${gy + 14}" r="8" fill="#000000" fill-opacity="0.35"/><circle cx="${gx + 14}" cy="${gy + 12.5}" r="2.6" fill="#fff"/><rect x="${gx + 13.3}" y="${gy + 13}" width="1.4" height="5" fill="#fff"/>`);
      if (g.title) {
        const tl = oneLine(g.title, 12, true, gw - 14);
        push(drawLine(tl, gx + gw / 2, gy + gh - 30, 12, "#ffffff", true, "middle"));
        push(`<text x="${gx + gw / 2}" y="${gy + gh - 13}" font-size="11" fill="#ffffff" fill-opacity="0.75" text-anchor="middle">${x(g.num ? "#" + g.num : "collectible")}</text>`);
      } else if (g.stars) {
        const label = fmtNum(g.stars);
        const lw = tw(label, 12, true);
        const pw = lw + 30;
        push(rr(gx + (gw - pw) / 2, gy + gh - 33, pw, 22, 11, T.chip));
        push(`<polygon points="${starPath(gx + (gw - pw) / 2 + 13, gy + gh - 22, 6.2)}" fill="#f5b524"/>`);
        push(`<text x="${gx + (gw - pw) / 2 + 23}" y="${gy + gh - 17.5}" font-size="12" font-weight="700" fill="${T.text}">${x(label)}</text>`);
      }
    });
    y += Math.ceil(list.length / 3) * (gh + 8);
  }

  const H = model.fit ? MIN_H : Math.max(MIN_H, Math.ceil(y + 40)); // fit = satu skrin iPhone sahaja
  push(rr(W / 2 - 67, H - 13, 134, 5, 2.5, T.text, ` fill-opacity="0.9"`));

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W * SCALE}" height="${H * SCALE}" viewBox="0 0 ${W} ${H}" font-family="${FAM}">` +
    `<defs>${defs.join("")}</defs><rect width="${W}" height="${H}" fill="${T.bg}"/>${body.join("")}</svg>`;
  return { svg, width: W * SCALE, height: H * SCALE };
}

// ---------------------------------------------------------------- SVG -> PNG
async function toPng(svg) {
  let first;
  try {
    const { Resvg } = require("@resvg/resvg-js");
    const r = new Resvg(svg, { font: { fontFiles: FONT_FILES.filter((f) => fs.existsSync(f)), loadSystemFonts: false, defaultFontFamily: FAM } });
    return Buffer.from(r.render().asPng());
  } catch (e) {
    if (e && e.code !== "MODULE_NOT_FOUND") throw e;
    first = e;
  }
  try {
    return await require("sharp")(Buffer.from(svg)).png().toBuffer();
  } catch (e2) {
    if (e2 && e2.code !== "MODULE_NOT_FOUND") throw e2;
    throw new Error("Pustaka gambar belum dipasang. Jalankan: npm install @resvg/resvg-js");
  }
}

// WebP -> PNG jika "sharp" ada (renderer tertentu tidak membaca WebP). Tanpa sharp: dibiarkan (resvg membaca WebP).
async function normalizeImages(model) {
  let sharp;
  try {
    sharp = require("sharp");
  } catch (_) {
    return;
  }
  const conv = async (b) => (b && mimeOf(b) === "image/webp" ? await sharp(b).png().toBuffer().catch(() => b) : b);
  model.pattern = await conv(model.pattern);
  model.emojiStatus = await conv(model.emojiStatus);
  model.avatar = await conv(model.avatar);
  if (model.channel) model.channel.avatar = await conv(model.channel.avatar);
  if (model.gifts && model.gifts.items) for (const g of model.gifts.items) g.img = await conv(g.img);
}

// model -> { png, width, height, svg }
async function render(model) {
  await normalizeImages(model);
  await loadEmoji([model.name, model.about, model.channel && model.channel.title, model.channel && model.channel.post, ...((model.gifts && model.gifts.items) || []).map((g) => g.title)].filter(Boolean));
  const out = build(model);
  const png = await toPng(out.svg);
  return { png, svg: out.svg, width: out.width, height: out.height };
}

module.exports = { render, build, toPng, tokens, wrap, tw, mimeOf, hasTxt, hasAny };

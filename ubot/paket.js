// Sistem PAKET: LITE < GOLD < PLATINUM   (OWNER = semua fitur)
// - Setiap command ada paket minimum (ikut kategori, dengan pengecualian per command di COMMAND_MIN).
// - manager.js menolak command yang melebihi paket pengguna; .help menandakan command berkunci dengan ikon.
// - Pengguna lama tanpa paket (atau paket tidak dikenali) dianggap config.json "default_paket" (lalai PLATINUM)
//   supaya pelanggan sedia ada tidak tiba-tiba kehilangan fitur.
// ASCII sahaja (emoji dengan \uXXXX).
const db = require("./db");
const access = require("./access");
const { cfg, shared, em, esc } = require("./core");

// ikon premium: bintang = LITE, mahkota = GOLD, permata = PLATINUM, mahkota owner = OWNER
const TIERS = {
  LITE: { rank: 1, icon: "5852636219250317264", fb: "\u2B50", style: "primary", ai: 1, blurb: "Asas harian" },
  GOLD: { rank: 2, icon: "6273839444311149115", fb: "\uD83D\uDC51", style: "success", ai: 1, blurb: "Pintar + pengurusan group" },
  PLATINUM: { rank: 3, icon: "6276228098962754124", fb: "\uD83D\uDC8E", style: "primary", ai: 3, blurb: "Semua fitur + kustom" },
};
const OWNER = { rank: 99, icon: "5217822164362739968", fb: "\uD83D\uDC51" };
const ORDER = ["LITE", "GOLD", "PLATINUM"];
const SHORT = { L: "LITE", G: "GOLD", P: "PLATINUM" }; // data butang kelulusan

const LOCK = "\uD83D\uDD12";

// ---------- paket minimum ----------
const CATEGORY_MIN = {
  "Umum": "LITE",
  "Utilitas": "LITE",
  "Catatan & Tugas": "LITE",
  "Teks & Font": "LITE",
  "Matematik & Konversi": "LITE",
  "Islam & Malaysia": "LITE",
  "Hiburan": "LITE",
  "Sistem": "LITE",
  "Owner & Reseller": "LITE", // command staf menyemak sendiri peranan owner/reseller
  "Generator": "GOLD",
  "Web & Info": "GOLD",
  "AI & Media": "GOLD",
  "Rich & Format": "GOLD",
  "Group Management": "GOLD",
  "Broadcast & Alias": "PLATINUM",
  "MENU SHARE AUTO PROMOSI": "LITE", // menu promosi: bisa dipakai userbot gratis (semua kiriman diberi watermark)
  "WhatsApp": "PLATINUM",
};
// pengecualian per command (menggantikan paket kategori)
const COMMAND_MIN = {
  setqr: "GOLD", getqr: "GOLD", listset: "GOLD", delset: "GOLD", // simpanan fail/QR
  autorich: "PLATINUM", // penjana Rich AI
  setphoto: "PLATINUM", setvideo: "PLATINUM", delphoto: "PLATINUM", delvideo: "PLATINUM", helpmedia: "PLATINUM", setroot: "PLATINUM", // kustom .help
};
const PLUGIN_MIN = { saved: "GOLD" }; // .set<nama> / .get<nama> dinamik

// Baris jadual perbandingan (paparan .paket dan /paket). Diuji supaya selaras dengan jadual di atas.
const FEATURES = [
  ["Utiliti asas (.id .calc .time .afk)", "LITE", ["Utilitas"]],
  ["Catatan, todo, peringatan", "LITE", ["Catatan & Tugas"]],
  ["Teks & Font", "LITE", ["Teks & Font"]],
  ["Matematik & Konversi", "LITE", ["Matematik & Konversi"]],
  ["Islam & Malaysia", "LITE", ["Islam & Malaysia"]],
  ["Hiburan", "LITE", ["Hiburan"]],
  ["Web & Info (cuaca, kurs, wiki)", "GOLD", ["Web & Info"]],
  ["Generator", "GOLD", ["Generator"]],
  ["Rich & Format", "GOLD", ["Rich & Format"]],
  ["Group Management", "GOLD", ["Group Management"]],
  ["Simpanan (.setqr .getqr)", "GOLD", []],
  ["AI (.ai .tr .sum .fix)", "GOLD", ["AI & Media"]],
  ["Screenshot profil iPhone (.ssprofile)", "GOLD", []],
  ["Menu Share Auto Promosi (.bc .autobc .autobc2 .cfd .autocfd .joingb .joinfolder .autojoin .addbl .autocek)", "LITE", ["MENU SHARE AUTO PROMOSI"]],
  ["Alias", "PLATINUM", ["Broadcast & Alias"]],
  ["AI Rich (.autorich)", "PLATINUM", []],
  ["Kustom .help (foto/video/root)", "PLATINUM", []],
];

// ---------- paket pengguna ----------
const normalize = (v) => {
  const s = String(v || "").toUpperCase().trim();
  if (s === "PLAT") return "PLATINUM";
  return TIERS[s] ? s : null;
};
const defaultTier = () => normalize(cfg.default_paket) || "PLATINUM";

// "OWNER" | "LITE" | "GOLD" | "PLATINUM"
function tierOf(userId) {
  if (access.isOwner(userId)) return "OWNER";
  // RESELLER & TANGAN KANAN selalu PLATINUM (paket tertinggi), walau data lama tercatat LITE akibat bug "Buat Ubot"
  if (access.isReseller(userId)) return "PLATINUM";
  const t = normalize((db.getUser(userId) || {}).paket);
  if (t) return t;
  return defaultTier();
}
const rankOf = (t) => (t === "OWNER" ? OWNER.rank : TIERS[t] ? TIERS[t].rank : TIERS.PLATINUM.rank);
const meta = (t) => (t === "OWNER" ? OWNER : TIERS[t] || TIERS.PLATINUM);

// ---------- peta command -> kategori (dibina daripada plugin yang dimuat) ----------
let cache = null;
let cacheN = -1;
function catMap() {
  const ps = shared.plugins || [];
  if (cache && cacheN === ps.length) return cache;
  const m = new Map();
  for (const p of ps) for (const k of Object.keys(p.commands || {})) m.set(k.toLowerCase(), p.category || null);
  cache = m;
  cacheN = ps.length;
  return m;
}
const resetCache = () => { cache = null; cacheN = -1; };

function minOf(cmd) {
  const c = String(cmd || "").toLowerCase();
  return COMMAND_MIN[c] || CATEGORY_MIN[catMap().get(c)] || "LITE";
}

// Pulangkan null jika dibenarkan; jika tidak { need, have, cmd }
function deny(userId, cmd) {
  const have = tierOf(userId);
  const need = minOf(cmd);
  return rankOf(have) >= TIERS[need].rank ? null : { need, have, cmd };
}
function denyPlugin(userId, pluginName) {
  const need = PLUGIN_MIN[pluginName];
  if (!need) return null;
  const have = tierOf(userId);
  return rankOf(have) >= TIERS[need].rank ? null : { need, have, cmd: pluginName };
}
const isLocked = (userId, cmd) => !!deny(userId, cmd);

// Had AI harian = ai_daily_limit x pengganda paket
const aiMultiplier = (userId) => (tierOf(userId) === "OWNER" ? 1 : Math.max(1, TIERS[tierOf(userId)] ? TIERS[tierOf(userId)].ai : 1));

// ---------- paparan ----------
const badge = (t) => `${em(meta(t).icon, meta(t).fb)} ${esc(t)}`;
const plainBadge = (t) => `${meta(t).fb} ${t}`;

// Bilangan command (daripada entri .help) yang terbuka / berkunci bagi pengguna
function counts(userId) {
  let open = 0;
  let locked = 0;
  for (const p of shared.plugins || []) {
    if (!p.category || !Array.isArray(p.help)) continue;
    for (const h of p.help) (isLocked(userId, h.cmd) ? locked++ : open++);
  }
  return { open, locked, total: open + locked };
}

// Teks ringkas penolakan
function denyText(d, prefix) {
  return (
    `${LOCK} ${prefix}${d.cmd} khas paket ${d.need} ke atas.\n` +
    `Paket anda: ${d.have}\n` +
    `Hubungi reseller untuk naik taraf. Lihat perbezaan: ${prefix}paket`
  );
}

// Bilangan command yang terbuka bagi satu paket
function countForTier(tier) {
  let n = 0;
  for (const p of shared.plugins || []) {
    if (!p.category || !Array.isArray(p.help)) continue;
    for (const h of p.help) if (rankOf(tier) >= TIERS[minOf(h.cmd)].rank) n++;
  }
  return n;
}
const aiBase = () => Number(cfg.ai_daily_limit !== undefined ? cfg.ai_daily_limit : 30);

// Jadual perbandingan paket (Rich + teks biasa). `mine` = paket pengguna (diserlahkan dalam ssub-tajuk).
function compareTable(mine) {
  const mark = (t, min) => (TIERS[t].rank >= TIERS[min].rank ? "\u2705" : "\u274C");
  const head = `<tr><th>Fitur</th>${ORDER.map((t) => `<th>${t}</th>`).join("")}</tr>`;
  const rows = FEATURES.map(([label, min]) => `<tr><td>${esc(label)}</td>${ORDER.map((t) => `<td>${mark(t, min)}</td>`).join("")}</tr>`).join("");
  const aiRow = `<tr><td>Had AI harian</td><td>-</td><td>${aiBase() || "tanpa had"}</td><td>${aiBase() ? aiBase() * TIERS.PLATINUM.ai : "tanpa had"}</td></tr>`;
  const cntRow = `<tr><td>Command terbuka</td>${ORDER.map((t) => `<td>${countForTier(t)}</td>`).join("")}</tr>`;
  let prices = null; // harga semasa (ditetapkan owner melalui /payset)
  try { prices = require("./pay").priceCells(); } catch (_) {}
  const priceRow = prices ? `<tr><td>Harga</td>${prices.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>` : "";
  const sub = ORDER.map((t) => `${badge(t)} <i>${esc(TIERS[t].blurb)}</i>`).join("<br>");
  const html = `<p>${sub}</p><table bordered>${head}${rows}${aiRow}${cntRow}${priceRow}</table>` + (mine ? `<p>Paket anda: ${badge(mine)}</p>` : "");

  const text =
    ORDER.map((t) => {
      const feats = FEATURES.filter(([, min]) => TIERS[t].rank >= TIERS[min].rank && TIERS[t].rank === TIERS[min].rank).map(([l]) => `\u2022 ${esc(l)}`);
      return `${badge(t)} - <i>${esc(TIERS[t].blurb)}</i> (${countForTier(t)} command${prices ? " \u00B7 " + esc(prices[ORDER.indexOf(t)]) : ""})\n${feats.join("\n")}`;
    }).join("\n\n") + (mine ? `\n\nPaket anda: ${badge(mine)}` : "") + `\n\n<i>PLATINUM merangkumi semua fitur GOLD, dan GOLD merangkumi semua fitur LITE.</i>`;
  return { html, text };
}

// Kad Rich "Command Berkunci" (dipaparkan oleh manager.js apabila command melebihi paket pengguna)
function denyCard(d, prefix, account) {
  const { card, footerOf } = require("./ui"); // dimuat lewat: ui.js -> panel.js -> core.js
  return card({
    title: "Command Berkunci", icon: "fire",
    rows: [
      ["tag", "Command", `<code>${esc(prefix + d.cmd)}</code>`],
      ["crown", "Paket diperlukan", `${badge(d.need)} ke atas`],
      ["user", "Paket anda", badge(d.have)],
      ["gear", "Naik taraf", `Hubungi reseller \u00B7 lihat <code>${esc(prefix)}paket</code>`],
    ],
    checks: [[false, `Tidak termasuk dalam paket ${esc(d.have)}`]],
    footer: footerOf(account),
  });
}

module.exports = {
  denyCard, countForTier, compareTable,
  TIERS, ORDER, SHORT, OWNER, LOCK, FEATURES, CATEGORY_MIN, COMMAND_MIN, PLUGIN_MIN,
  normalize, defaultTier, tierOf, rankOf, meta, minOf, deny, denyPlugin, isLocked, aiMultiplier,
  badge, plainBadge, counts, denyText, resetCache,
};

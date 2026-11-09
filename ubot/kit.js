// Pembantu untuk plugin v1.2: ringkas membina arahan + kad Rich (jadual) + emoji premium.
// ASCII sahaja (guna \uXXXX untuk simbol) supaya selamat jika disunting.
const { card, show, edit, esc, footerOf, clip, nl2br } = require("./ui");

class UserErr extends Error {
  constructor(m) {
    super(m);
    this.userMsg = m;
  }
}
const need = (cond, usage) => {
  if (!cond) throw new UserErr("Guna: " + usage);
};

// Teks daripada argumen, atau daripada mesej yang direply
async function text(ctx, from = 0) {
  let t = ctx.args.slice(from).join(" ").trim();
  if (!t) {
    const rm = await ctx.msg.getReplyMessage().catch(() => null);
    t = rm && rm.message ? rm.message : "";
  }
  return t;
}

// Baris jadual: R = nilai di-escape, H = nilai HTML mentah
const R = (k, l, v) => [k, esc(l), esc(v === undefined || v === null || v === "" ? "-" : v)];
const H = (k, l, v) => [k, esc(l), v];
const code = (s) => `<code>${esc(s)}</code>`;
const bq = (s) => `<blockquote>${nl2br(s)}</blockquote>`;

// Paparkan kad: out(ctx, "Tajuk", "ikon", [rows], { sub, headers, checks, extra, extraText })
const out = (ctx, title, icon, rows, o = {}) =>
  show(ctx, card({ title, icon, rows, ...o, footer: footerOf(ctx.account) }));

// Paparkan teks panjang dalam blockquote
const outText = (ctx, title, icon, label, input, result, rows = []) =>
  out(ctx, title, icon, [R("tag", label, clip(input.replace(/\s+/g, " "), 60)), ...rows], {
    extra: bq(String(result).slice(0, 2800)),
    extraText: esc(String(result).slice(0, 2800)),
  });

const num = (s) => Number(String(s).replace(",", "."));
const fmt = (n, d = 2) =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 10 ** d) / 10 ** d);
const grp = (n, d = 2) => {
  const s = fmt(n, d).split(".");
  s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return s.join(".");
};

async function getJson(url, ms = 12000, headers = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { "User-Agent": "Mozilla/5.0 ubot", Accept: "application/json", ...headers } });
    if (!r.ok) throw new UserErr(`Pelayan membalas HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    if (e.name === "AbortError") throw new UserErr("Pelayan lambat membalas (tamat masa).");
    throw e;
  } finally {
    clearTimeout(t);
  }
}
async function getBuf(url, ms = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { "User-Agent": "Mozilla/5.0 ubot" } });
    if (!r.ok) throw new UserErr(`Pelayan membalas HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}

// Hantar fail daripada buffer (gambar) dengan kapsyen
async function sendBuf(ctx, buf, name, caption) {
  const { CustomFile } = require("telegram/client/uploads");
  await ctx.client.sendFile(ctx.msg.peerId, {
    file: new CustomFile(name, buf.length, "", buf),
    caption: caption || "",
    parseMode: "html",
    replyTo: ctx.msg.id,
  });
  await ctx.msg.delete({ revoke: true }).catch(() => {});
}

// Bina plugin daripada senarai definisi: { cmd, alias?, desc, run(ctx) }
function plugin(name, category, defs) {
  const help = [];
  const commands = {};
  for (const d of defs.filter(Boolean)) {
    help.push({ cmd: d.cmd, alias: d.alias || [], desc: d.desc });
    const fn = async (ctx) => {
      try {
        await d.run(ctx);
      } catch (err) {
        if (!(err instanceof UserErr)) console.error(`[${d.cmd}]`, err);
        await edit(ctx, "\u26A0\uFE0F " + String(err.userMsg || err.message || "Ralat").slice(0, 300));
      }
    };
    commands[d.cmd] = fn;
    for (const a of d.alias || []) commands[a] = fn;
  }
  return { name, category, help, commands };
}

// ---------- tarikh ----------
const DAYS = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
const MONTHS = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];
const todayUTC = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};
// yyyy-mm-dd | dd-mm-yyyy | dd/mm/yyyy | dd.mm.yyyy | today | esok | semalam
function parseDate(s) {
  s = String(s || "").trim().toLowerCase();
  const t = todayUTC();
  if (["today", "ini", "hariini", "sekarang"].includes(s)) return t;
  if (["esok", "tomorrow"].includes(s)) return new Date(t.getTime() + 86400000);
  if (["semalam", "yesterday"].includes(s)) return new Date(t.getTime() - 86400000);
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  let y, mo, d;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) [d, mo, y] = [+m[1], +m[2], +m[3]];
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}
const fmtDate = (dt) => `${DAYS[dt.getUTCDay()]}, ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
const isoDate = (dt) => dt.toISOString().slice(0, 10);
const dayOfYear = (dt) => Math.floor((dt - Date.UTC(dt.getUTCFullYear(), 0, 0)) / 86400000);
function isoWeek(dt) {
  const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - y0) / 86400000 + 1) / 7);
}

module.exports = {
  UserErr, need, text, R, H, code, bq, out, outText, num, fmt, grp, getJson, getBuf, sendBuf, plugin,
  DAYS, MONTHS, todayUTC, parseDate, fmtDate, isoDate, dayOfYear, isoWeek,
  esc, clip, edit, card, show, footerOf, nl2br,
};

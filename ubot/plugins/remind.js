// Peringatan: .remind 10m teks | .remind 1h30m teks | .reminders | .delremind <no>
// Peringatan dihantar oleh bot kawalan ke chat peribadi anda (dengan emoji premium).
const crypto = require("crypto");
const db = require("../db");
const { send, fmtTime, TZL } = require("../core");
const { card, show, edit, esc, footerOf, clip, ico } = require("../ui");

const MAX_ACTIVE = 20;
const MAX_MS = 30 * 86400000;
const UNIT = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

// "90" = 90 minit; "1h30m", "2d", "45s"
function parseDuration(s) {
  const str = String(s || "").toLowerCase().trim();
  if (/^\d+$/.test(str)) return Number(str) * 60000;
  const re = /(\d+)\s*([smhd])/g;
  let total = 0;
  let used = 0;
  let m;
  while ((m = re.exec(str))) {
    total += Number(m[1]) * UNIT[m[2]];
    used += m[0].replace(/\s/g, "").length;
  }
  return used === str.replace(/\s/g, "").length && total > 0 ? total : 0;
}

const human = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return [d && `${d}h`, h && `${h}j`, m && `${m}m`].filter(Boolean).join(" ") || `${s}s`;
};

const list = (account) => (db.getUser(account.userId) || {}).reminders || [];

async function remind(ctx) {
  const { msg, args, account } = ctx;
  const ms = parseDuration(args[0]);
  let text = args.slice(1).join(" ").trim();
  if (!text) {
    const rm = await msg.getReplyMessage().catch(() => null);
    text = rm && rm.message ? rm.message : "";
  }
  if (!ms || ms < 10000 || ms > MAX_MS || !text) {
    return edit(ctx, "Guna: .remind <masa> <teks>\nContoh: .remind 10m minum ubat | .remind 1h30m meeting | .remind 2d bayar bil\n(minimum 10 saat, maksimum 30 hari)");
  }
  const all = list(account);
  if (all.length >= MAX_ACTIVE) return edit(ctx, `\u26A0\uFE0F Had ${MAX_ACTIVE} peringatan aktif. Padam dengan .delremind <no>`);
  const item = { id: crypto.randomBytes(3).toString("hex"), at: Date.now() + ms, text: text.slice(0, 500) };
  db.upsertUser(account.userId, { reminders: [...all, item].sort((a, b) => a.at - b.at) });
  await show(ctx, card({
    title: "Peringatan Ditetapkan", icon: "time",
    rows: [
      ["tag", "Teks", esc(clip(item.text, 80))],
      ["time", "Dalam", `<b>${esc(human(ms))}</b>`],
      ["gear", "Waktu", `${esc(fmtTime(item.at, true))} ${esc(TZL)}`],
      ["chart", "Aktif", String(all.length + 1)],
    ],
    footer: footerOf(account),
  }));
}

async function reminders(ctx) {
  const { account } = ctx;
  const all = list(account);
  if (!all.length) return edit(ctx, "Tiada peringatan aktif. Guna .remind 10m teks");
  await show(ctx, card({
    title: "Peringatan Aktif", icon: "time", headers: ["No / Teks", "Baki"],
    rows: all.map((r, i) => ["time", `<b>${i + 1}.</b> ${esc(clip(r.text, 40))}`, esc(human(r.at - Date.now()))]),
    footer: footerOf(account),
  }));
}

async function delRemind(ctx) {
  const { args, account } = ctx;
  const all = list(account);
  const i = parseInt(args[0], 10) - 1;
  if (!(i >= 0 && i < all.length)) return edit(ctx, "Guna: .delremind <nombor>  (lihat .reminders)");
  const [gone] = all.splice(i, 1);
  db.upsertUser(account.userId, { reminders: all });
  await show(ctx, card({
    title: "Peringatan Dibuang", icon: "ok",
    rows: [["tag", "Teks", esc(clip(gone.text, 80))], ["chart", "Baki aktif", String(all.length)]],
    footer: footerOf(account),
  }));
}

// Semak setiap 15 saat: hantar peringatan yang sudah tiba masanya
async function tick() {
  const now = Date.now();
  for (const [uid, rec] of db.allUsers()) {
    const rs = rec.reminders;
    if (!Array.isArray(rs) || !rs.length) continue;
    const due = rs.filter((r) => r.at <= now);
    if (!due.length) continue;
    db.upsertUser(uid, { reminders: rs.filter((r) => r.at > now) });
    for (const r of due) {
      await send(uid, `${ico("time")} <b>Peringatan!</b>\n\n${ico("tag")} ${esc(r.text)}`).catch(() => {});
    }
  }
}

let timer = null;
function registerBot() {
  if (timer) return;
  timer = setInterval(() => tick().catch((e) => console.error("[remind] tick gagal:", e.message)), 15000);
  if (timer.unref) timer.unref();
}

module.exports = {
  name: "remind",
  category: "Catatan & Tugas",
  help: [
    { cmd: "remind", alias: [], desc: "peringatan: .remind 10m teks | 1h30m | 2d" },
    { cmd: "reminders", alias: [], desc: "senarai peringatan aktif" },
    { cmd: "delremind", alias: [], desc: "buang peringatan: .delremind <no>" },
  ],
  commands: { remind, reminders, delremind: delRemind },
  registerBot,
  parseDuration,
  tick,
};

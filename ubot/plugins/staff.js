// Alat owner / reseller: .stats  .listuser [expired|soon|online]  .cekuser [ID]
const access = require("../access");
const db = require("../db");
const expiry = require("../expiry");
const manager = require("../manager");
const { shared, fmtTime, TZL } = require("../core");
const { card, show, edit, esc, footerOf, clip } = require("../ui");

const DAY = 86400000;
const NOT_STAFF = "\u26A0\uFE0F Hanya owner atau reseller boleh guna arahan ini.";
const gate = (ctx) => access.isStaff(ctx.account.userId);

const upt = (s) => {
  s = Math.floor(s);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return [d && `${d}h`, h && `${h}j`, `${m}m`].filter(Boolean).join(" ");
};
const mb = (n) => `${(n / 1048576).toFixed(0)} MB`;

function summary() {
  const now = Date.now();
  const all = db.allUsers();
  let approved = 0, pending = 0, rejected = 0, expired = 0, soon = 0;
  for (const [uid, r] of all) {
    if (r.status === "approved") approved++;
    else if (r.status === "pending") pending++;
    else if (r.status === "rejected") rejected++;
    if (r.session && r.expiresAt && !access.isOwner(uid)) {
      if (r.expiresAt <= now) expired++;
      else if (r.expiresAt - now <= 7 * DAY) soon++;
    }
  }
  return { total: all.length, approved, pending, rejected, expired, soon };
}

async function stats(ctx) {
  if (!gate(ctx)) return edit(ctx, NOT_STAFF);
  const s = summary();
  const mem = process.memoryUsage();
  const rows = [
    ["green", "Userbot online", `<b>${manager.count()}</b>`],
    ["user", "Jumlah pengguna", String(s.total)],
    ["ok", "Disetujui / Menunggu", `${s.approved} / ${s.pending}`],
    ["tag", "Ditolak", String(s.rejected)],
    ["crown", "Reseller", String(db.resellers().length)],
    ["time", "Hampir tamat (7 hari)", String(s.soon)],
    ["time", "Sudah tamat", String(s.expired)],
    ["gear", "Plugin", String((shared.plugins || []).length)],
    ["bolt", "Uptime", esc(upt(process.uptime()))],
    ["chart", "Memori (RSS)", esc(mb(mem.rss))],
    ["rocket", "Node.js", esc(process.version)],
  ];
  await show(ctx, card({
    title: "Statistik Sistem", icon: "chart", headers: ["Metrik", "Nilai"], rows,
    checks: [[s.expired === 0, "Tiada userbot tamat tempoh"], [s.soon === 0, "Tiada userbot hampir tamat"], [s.pending === 0, "Tiada permintaan menunggu"]],
    footer: footerOf(ctx.account),
  }));
}

async function listUser(ctx) {
  if (!gate(ctx)) return edit(ctx, NOT_STAFF);
  const mode = String(ctx.args[0] || "").toLowerCase();
  const now = Date.now();
  let list = db.allUsers().filter(([, r]) => r.session || r.status);
  if (mode === "expired") list = list.filter(([, r]) => r.expiresAt && r.expiresAt <= now);
  else if (mode === "soon") list = list.filter(([, r]) => r.expiresAt && r.expiresAt > now && r.expiresAt - now <= 7 * DAY);
  else if (mode === "online") list = list.filter(([uid]) => manager.getByUser(uid));
  list.sort((a, b) => (a[1].expiresAt || Infinity) - (b[1].expiresAt || Infinity));
  if (!list.length) return edit(ctx, "Tiada pengguna untuk penapis ini. Pilihan: .listuser [expired|soon|online]");

  const rows = list.slice(0, 15).map(([uid, r]) => {
    const on = manager.getByUser(uid);
    const exp = access.isOwner(uid) ? "Selamanya" : r.expiresAt ? (r.expiresAt <= now ? "tamat" : fmtTime(r.expiresAt)) : "-";
    return [on ? "green" : "user", `${r.reqNo ? "#" + r.reqNo + " " : ""}${esc(clip(r.name || r.username || uid, 22))}`, `${esc(exp)}`];
  });
  await show(ctx, card({
    title: "Senarai Pengguna", icon: "user", headers: ["Pengguna", `Tamat (${TZL})`],
    sub: `Penapis: <b>${esc(mode || "semua")}</b> \u00B7 Jumlah: <b>${list.length}</b>${list.length > 15 ? " (15 pertama)" : ""}`,
    rows, footer: footerOf(ctx.account),
  }));
}

async function cekUser(ctx) {
  if (!gate(ctx)) return edit(ctx, NOT_STAFF);
  let wanted = /^\d{5,15}$/.test(ctx.args[0] || "") ? ctx.args[0] : null;
  if (!wanted) {
    const rm = await ctx.msg.getReplyMessage().catch(() => null);
    if (rm && rm.senderId) wanted = String(rm.senderId);
  }
  if (!wanted) return edit(ctx, "Guna: .cekuser <ID>  atau balas mesej pengguna dengan .cekuser");
  const found = db.findUser(wanted);
  if (!found) return edit(ctx, `\u26A0\uFE0F ID ${wanted} tiada dalam sistem.`);
  const [uid, r] = found;
  const online = !!manager.getByUser(uid);
  const expTxt = expiry.label(uid);
  const expired = !access.isOwner(uid) && expiry.isExpired(r);
  // NOTA: sesi login (r.session) tidak pernah dipaparkan
  const rows = [
    ["user", "Nama", `<b>${esc(clip(r.name || r.accountName || "-", 30))}</b>`],
    ["link", "Username", r.username ? `@${esc(r.username)}` : "-"],
    ["gear", "ID", `<code>${esc(uid)}</code>`],
    ["crown", "Role", esc(access.roleOf(uid))],
    ["box", "Paket", esc(access.isOwner(uid) ? "OWNER" : r.paket || "-")],
    ["ok", "Status", esc(r.status || "-")],
    ["time", "Expired", esc(expTxt)],
    [online ? "green" : "tag", "Userbot", online ? "<b>online</b>" : expired ? "expired" : "offline"],
  ];
  await show(ctx, card({ title: "Semak Pengguna", icon: "chart", rows, footer: footerOf(ctx.account) }));
}

module.exports = {
  name: "staff",
  category: "Owner & Reseller",
  help: [
    { cmd: "stats", alias: [], desc: "owner/reseller: statistik sistem (online, expired, memori, uptime)" },
    { cmd: "listuser", alias: [], desc: "owner/reseller: senarai pengguna. Penapis: expired | soon | online" },
    { cmd: "cekuser", alias: [], desc: "owner/reseller: semak pengguna mengikut ID atau reply" },
  ],
  commands: { stats, listuser: listUser, cekuser: cekUser },
};

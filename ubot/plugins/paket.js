// .paket (semua pengguna) + logik pemberian paket. Arahan .addlite/.addgold/.addplat ada dalam paketadd.js
// Paket userbot:  .addlite  .addgold  .addplat  (owner/reseller)   .paket [ID]
//   .addgold <hari> [ID|@user]   atau balas mesej pengguna.   Hari lalai = config.json "default_days" (atau 30).
//   Hari TERKUMPUL pada baki sedia ada (sama seperti .setexpired). Menukar paket pengguna = naik/turun taraf.
const PK = require("../paket");
const db = require("../db");
const access = require("../access");
const expiry = require("../expiry");
const { cfg, send, sendRich, btn, em, esc, fmtTime, TZL } = require("../core");
const { card, show, edit, footerOf, clip } = require("../ui");

const E = { rocket: "5195033767969839232", ok: "5260726538302660868", time: "5352940967911517739", user: "5258362837411045098", tag: "5296348778012361146", chart: "5231200819986047254", gear: "5368589393491669392" };
const fullName = (u) => [u.firstName, u.lastName].filter(Boolean).join(" ");

function parse(args) {
  let days = null;
  let idTok = null;
  for (const a of args) {
    if (/^\d{1,4}$/.test(a)) { if (days === null) days = Number(a); }
    else if (/^\d{5,15}$/.test(a) || /^@[A-Za-z]\w{3,31}$/.test(a)) { if (!idTok) idTok = a; }
  }
  return { days, idTok };
}

async function resolveTarget(ctx, idTok) {
  const { client, msg } = ctx;
  if (idTok && /^\d+$/.test(idTok)) return { id: idTok };
  if (idTok) {
    try {
      const ent = await client.getEntity(idTok);
      return { id: String(ent.id), ent };
    } catch (_) {
      return null;
    }
  }
  const rm = await msg.getReplyMessage().catch(() => null);
  return rm && rm.senderId ? { id: String(rm.senderId) } : null;
}

// Pemberitahuan kepada pembeli di bot (Rich + emoji premium), dengan butang Buat Userbot jika belum ada userbot
async function notifyBuyer(id, tier, days, res, byName, hasSession) {
  const m = PK.meta(tier);
  const open = PK.counts(id);
  const rows = [
    [E.tag, "Paket", PK.badge(tier)],
    [E.chart, "Command terbuka", `${open.open} / ${open.total}`],
    [E.time, "Ditambah", `${days} hari`],
    [E.time, "Expired", `${esc(fmtTime(res.after, true))} ${esc(TZL)}`],
    [E.user, "Diberi oleh", esc(byName)],
  ];
  const html =
    `<h3>${em(m.icon, m.fb)} Paket ${esc(tier)} Diaktifkan</h3>` +
    `<table bordered><tr><th>Info</th><th>Nilai</th></tr>${rows.map(([i, l, v]) => `<tr><td>${em(i, "\u2B50")} ${l}</td><td>${v}</td></tr>`).join("")}</table>` +
    `<blockquote>${hasSession ? "Userbot anda terus aktif dengan paket baharu. Taip <code>" + esc(cfg.prefix || ".") + "paket</code> untuk lihat perbezaan paket." : "Tekan <b>Buat Userbot</b> untuk menyambungkan akaun Telegram anda."}</blockquote>`;
  const text =
    `${em(m.icon, m.fb)} <b>Paket ${esc(tier)} Diaktifkan</b>\n\n` +
    rows.map(([i, l, v]) => `${em(i, "\u2B50")} ${l}: <b>${v}</b>`).join("\n") +
    `\n\n${hasSession ? "Userbot anda terus aktif dengan paket baharu." : "Tekan <b>Buat Userbot</b> untuk menyambungkan akaun Telegram anda."}`;
  const kb = hasSession ? undefined : (fancy) => [[btn(fancy, "Buat Userbot", "create", "success", E.rocket)]];
  try {
    await sendRich(id, html, kb);
  } catch (_) {
    await send(id, text, kb);
  }
}

async function give(ctx, tier) {
  const { client, args, account } = ctx;
  const cmd = tier === "PLATINUM" ? "addplat" : `add${tier.toLowerCase()}`;
  if (!access.isStaff(account.userId)) return edit(ctx, `\u26A0\uFE0F Hanya owner atau reseller boleh guna .${cmd}`);

  const { days: d, idTok } = parse(args);
  const days = d === null ? Number(cfg.default_days) || 30 : d;
  if (!(days >= 1 && days <= 3650)) return edit(ctx, `Guna: .${cmd} <hari 1-3650> [ID|@user]  atau balas mesej pengguna.\nContoh: .${cmd} 30  (balas mesej pembeli)   |   .${cmd} 30 123456789`);

  const target = await resolveTarget(ctx, idTok);
  if (!target) return edit(ctx, `Guna: .${cmd} <hari> [ID|@user]  atau balas mesej pembeli dengan .${cmd} <hari>`);
  const id = target.id;
  if (access.isOwner(id)) return edit(ctx, "\u2139\uFE0F Owner tiada had paket (semua fitur).");

  let ent = target.ent;
  if (!ent) ent = await client.getEntity(Number(id)).catch(() => null);

  const before = db.getUser(id) || {};
  const prev = PK.normalize(before.paket);
  db.upsertUser(id, {
    status: "approved",
    paket: tier,
    approvedBy: before.approvedBy || String(account.userId),
    paketBy: String(account.userId),
    paketAt: Date.now(),
    ...(!before.name && ent ? { name: fullName(ent) || ent.username || id } : {}),
    ...(!before.username && ent && ent.username ? { username: ent.username } : {}),
  });
  const res = expiry.addDays(id, days);
  const revived = res.active ? await expiry.revive(id) : false;
  const rec = db.getUser(id) || {};

  const byName = account.username ? `@${account.username}` : account.name || String(account.userId);
  if (String(id) !== String(account.userId)) await notifyBuyer(id, tier, days, res, byName, !!rec.session).catch((e) => console.error(`[paket] notis ke ${id} gagal:`, e.message));

  const change = !prev ? "paket baharu" : prev === tier ? "lanjutan" : PK.rankOf(tier) > PK.rankOf(prev) ? `naik taraf (${prev} \u2192 ${tier})` : `turun taraf (${prev} \u2192 ${tier})`;
  const rows = [
    ["user", "Akun", esc(clip(rec.name || rec.accountName || rec.username || id, 28))],
    ["gear", "ID", `<code>${esc(id)}</code>`],
    ["tag", "Paket", PK.badge(tier)],
    ["gear", "Jenis", esc(change)],
    ["time", "Ditambah", `${days} hari`],
    ["time", `Expired (${TZL})`, esc(fmtTime(res.after, true))],
    [rec.session ? "green" : "box", "Userbot", rec.session ? (revived ? "diaktifkan semula" : "sudah ada") : "belum dibuat"],
  ];
  await show(ctx, card({ title: `Paket ${tier} Diberikan`, icon: "ok", rows, footer: footerOf(account) }));
}

async function paket(ctx) {
  const { args, account } = ctx;
  const lookup = args[0] && /^\d{5,15}$/.test(args[0]) && access.isStaff(account.userId) ? args[0] : null;
  const who = lookup || String(account.userId);
  const tier = PK.tierOf(who);
  if (lookup) {
    const rec = db.getUser(lookup);
    if (!rec) return edit(ctx, `\u26A0\uFE0F ID ${lookup} tiada dalam sistem.`);
    const open = PK.counts(lookup);
    return show(ctx, card({
      title: "Paket Pengguna", icon: "tag",
      rows: [
        ["user", "Akun", esc(clip(rec.name || rec.accountName || rec.username || lookup, 28))],
        ["gear", "ID", `<code>${esc(lookup)}</code>`],
        ["tag", "Paket", PK.badge(tier)],
        ["time", `Expired (${TZL})`, esc(expiry.label(lookup))],
        ["chart", "Command terbuka", `${open.open} / ${open.total}`],
      ],
      footer: footerOf(account),
    }));
  }
  const t = PK.compareTable(tier);
  await show(ctx, card({
    title: "Paket Userbot", icon: "crown",
    sub: `Paket anda: ${PK.badge(tier)} \u00B7 Expired: <b>${esc(expiry.label(who))}</b>`,
    extra: t.html, extraText: t.text,
    footer: footerOf(account),
  }));
}

module.exports = {
  name: "paket",
  category: "Umum",
  help: [{ cmd: "paket", alias: [], desc: "perbandingan paket LITE/GOLD/PLATINUM + paket anda (staf: .paket <ID>)" }],
  commands: { paket },
  give, // digunakan oleh plugins/paketadd.js
  notifyBuyer, // digunakan oleh pay.js (selepas pembayaran disahkan)
};

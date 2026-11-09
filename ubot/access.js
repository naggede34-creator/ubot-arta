// Owner / reseller + sistem kelulusan (ACCEPT / REJECT dalam group persetujuan)
const db = require("./db");
const { cfg, tg, esc, em, btn, send, sendRich, editRich } = require("./core");
const UI = require("./botui"); // kad Rich + emoji premium untuk semua mesej kepada pengguna

// Emoji premium
const E = {
  rocket: "5217880283860194582",
  info: "5258503720928288433",
  chart: "5231200819986047254",
  akun: "4972406813946282823",
  ok: "5317020017521359483",
  no: "5316999925664347033",
  spin: "5386367538735104399",
  box: "5992390297533816030",
};

const COOLDOWN = 10 * 60 * 1000; // jarak minimum antara dua permintaan

const owners = new Set(
  [...(Array.isArray(cfg.owner_ids) ? cfg.owner_ids : []), ...(cfg.owner_id ? [cfg.owner_id] : [])].map(String)
);

const extraOwners = () => (db.getSetting("owners_extra") || []).map(String);
const isPrimaryOwner = (id) => owners.has(String(id)); // owner dari config.json (tidak bisa dihapus lewat bot)
const isOwner = (id) => owners.has(String(id)) || extraOwners().includes(String(id));
const allOwners = () => [...new Set([...owners, ...extraOwners()])];
const isTK = (id) => db.isTK(id); // role TANGAN KANAN
const isReseller = (id) => db.isReseller(id) || db.isTK(id); // TANGAN KANAN juga punya semua hak reseller
const isStaff = (id) => isOwner(id) || isReseller(id);
const roleOf = (id) => (isOwner(id) ? "owner" : isTK(id) ? "tangan kanan" : isReseller(id) ? "reseller" : "pelanggan");
const canCreate = (id) => isOwner(id) || isReseller(id) || (db.getUser(id) || {}).status === "approved";

// RESELLER / TANGAN KANAN: akun otomatis berhak membuat ubot paket PLATINUM, permanen (tanpa expired).
// Dipanggil saat role dibeli / diberikan, dan saat bot start (healStaff) untuk memperbaiki data lama yang terlanjur LITE.
function activateStaff(id) {
  const rec = db.getUser(id) || {};
  if (rec.status === "approved" && rec.paket === "PLATINUM" && !rec.expiresAt) return false;
  db.upsertUser(id, { status: "approved", paket: "PLATINUM", paketAt: Date.now(), expiresAt: null, expiredNotified: false });
  try { require("./expiry").revive(id).catch(() => {}); } catch (_) {}
  return true;
}
function healStaff() {
  let n = 0;
  for (const id of new Set([...db.resellers(), ...db.tanganKanan()])) if (!isOwner(id) && activateStaff(id)) n++;
  if (n) console.log(`[role] ${n} akun reseller/tangan kanan diperbaiki (paket PLATINUM, ubot bisa dibuat).`);
  return n;
}
const approvalGroup = () => db.getSetting("approval_group_id") || cfg.approval_group_id || null;

const fullName = (u) => [u.first_name, u.last_name].filter(Boolean).join(" ") || "-";
const tag = (username, name) =>
  username ? `<a href="https://t.me/${esc(username)}">@${esc(username)}</a>` : esc(name || "-");

// ----- Kad permintaan (Rich Message berkotak) -----
function cardHtml(req, decision) {
  const keputusan = !decision
    ? `${em(E.spin, "\u23F3")} Menunggu keputusan \u2014 pilih paket`
    : decision.ok
    ? `${em(E.ok, "\u2705")} Disetujui oleh ${tag(decision.byUsername, decision.byName)} \u00B7 paket ${esc(decision.paket)}`
    : `${em(E.no, "\u274C")} Ditolak oleh ${tag(decision.byUsername, decision.byName)}`;

  return (
    `<h3>${em(E.rocket, "\uD83C\uDD95")} Permintaan Userbot</h3>` +
    `<table bordered>` +
    `<tr><th>Info</th><th>Nilai</th></tr>` +
    `<tr><td>${em(E.akun, "\uD83D\uDC64")} Account</td><td>#${req.no}</td></tr>` +
    `<tr><td>Nama</td><td>${esc(req.name)}</td></tr>` +
    `<tr><td>Username</td><td>${req.username ? "@" + esc(req.username) : "-"}</td></tr>` +
    `<tr><td>ID Telegram</td><td>${esc(req.userId)}</td></tr>` +
    `<tr><td>Keputusan</td><td>${keputusan}</td></tr>` +
    `</table>`
  );
}

// Tiga butang ACCEPT mengikut paket (L = LITE, G = GOLD, P = PLATINUM) + REJECT
const cardKb = (no) => (fancy) => {
  const PK = require("./paket"); // dimuat lewat: paket.js bergantung pada access.js
  const tb = (code, name) => btn(fancy, name, `ap:${no}:a:${code}`, PK.TIERS[name].style, PK.TIERS[name].icon);
  return [[tb("L", "LITE"), tb("G", "GOLD"), tb("P", "PLATINUM")], [btn(fancy, "REJECT", `ap:${no}:r`, "danger", E.no)]];
};

// ----- Pelanggan menekan "Buat Userbot" tanpa kebenaran -----
async function requestApproval(ctx) {
  const u = ctx.from;
  const rec = db.getUser(u.id) || {};
  const alert = (text) => ctx.answerCallbackQuery({ text, show_alert: true });

  if (rec.status === "pending") {
    return alert("Permintaan anda sedang menunggu keputusan owner/reseller.");
  }
  const gid = approvalGroup();
  if (!gid) return alert("Group persetujuan belum ditetapkan. Sila hubungi owner.");

  if (rec.lastRequestAt && Date.now() - rec.lastRequestAt < COOLDOWN) {
    const mins = Math.ceil((COOLDOWN - (Date.now() - rec.lastRequestAt)) / 60000);
    return alert(`Sila tunggu ${mins} minit sebelum menghantar permintaan baharu.`);
  }

  const no = db.nextReqNo();
  const req = {
    no,
    userId: String(u.id),
    name: fullName(u),
    username: u.username || null,
    status: "pending",
  };

  try {
    await sendRich(gid, cardHtml(req), cardKb(no));
  } catch (err) {
    console.error("Hantar permintaan ke group gagal:", err.message);
    return alert("Gagal hantar permintaan ke group. Pastikan bot ada dalam group persetujuan.");
  }

  db.setRequest(no, req);
  db.upsertUser(u.id, { status: "pending", reqNo: no, name: req.name, username: req.username, lastRequestAt: Date.now() });

  await ctx.answerCallbackQuery({
    text: `Permintaan #${no} dihantar. Tunggu owner/reseller menyetujui.`,
    show_alert: true,
  });
  await UI.sendCard(u.id, UI.card({
    title: "Permintaan Dihantar", icon: "time",
    rows: [["tag", "No. permintaan", `<b>#${no}</b>`], ["user", "Nama", esc(req.name)], ["time", "Status", "<b>MENUNGGU KEPUTUSAN</b>"]],
    checks: [[true, "Permintaan dihantar ke owner/reseller"], [false, "Menunggu persetujuan"]],
    note: "Anda akan dimaklumkan di sini sebaik sahaja diputuskan.",
  }));
}

// ----- Keputusan owner/reseller -----
async function decide(ctx, no, accept, tierCode) {
  const who = ctx.from;
  if (!isStaff(who.id)) {
    return ctx.answerCallbackQuery({ text: "Hanya owner atau reseller boleh memutuskan.", show_alert: true });
  }
  const req = db.getRequest(no);
  if (!req) return ctx.answerCallbackQuery({ text: "Permintaan tidak ditemui.", show_alert: true });
  if (req.status !== "pending") {
    return ctx.answerCallbackQuery({ text: "Permintaan ini sudah diputuskan.", show_alert: true });
  }

  const PK = require("./paket");
  // butang L/G/P memilih paket; butang lama (tanpa kod) guna default_paket
  const paket = (tierCode && PK.SHORT[tierCode]) || PK.normalize(cfg.default_paket) || "PLATINUM";
  const decision = {
    ok: accept,
    byId: String(who.id),
    byUsername: who.username || null,
    byName: fullName(who),
    paket,
  };
  req.status = accept ? "approved" : "rejected";
  req.decision = decision;
  db.setRequest(no, req);

  db.upsertUser(req.userId, accept
    ? { status: "approved", paket, approvedBy: decision.byId }
    : { status: "rejected", rejectedBy: decision.byId });

  await ctx.answerCallbackQuery({ text: accept ? "Disetujui \u2705" : "Ditolak \u274C" });

  const m = ctx.callbackQuery.message;
  await editRich({ chat_id: m.chat.id, message_id: m.message_id }, cardHtml(req, decision));

  const by = tag(decision.byUsername, decision.byName);
  if (accept) {
    await UI.sendCard(req.userId, UI.card({
      title: "Permintaan Disetujui", icon: "ok",
      rows: [["tag", "No. permintaan", `<b>#${no}</b>`], ["gem", "Paket", `<b>${PK.badge(paket)}</b>`], ["user", "Disetujui oleh", by]],
      checks: [[true, "Permintaan disetujui"], [false, "Tekan <b>Buat Userbot</b> untuk menyambungkan akaun anda"]],
    }), (fancy) => [[btn(fancy, "Buat Userbot", "create", "success", E.rocket)]]);
  } else {
    await UI.sendCard(req.userId, UI.card({
      title: "Permintaan Ditolak", icon: "no",
      rows: [["tag", "No. permintaan", `<b>#${no}</b>`], ["user", "Diputuskan oleh", by]],
      note: "Hubungi owner/reseller jika anda rasa ini satu kesilapan.",
    }));
  }
}

function register(bot) {
  bot.callbackQuery(/^ap:(\d+):([ar])(?::([LGP]))?$/, (ctx) => decide(ctx, ctx.match[1], ctx.match[2] === "a", ctx.match[3]));

  // Owner menetapkan group persetujuan: hantar /setgroup dalam group itu
  bot.command("setgroup", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    if (!["group", "supergroup"].includes(ctx.chat.type)) {
      return UI.sendCard(ctx.chat.id, UI.card({ title: "Guna Dalam Group", icon: "fire", rows: [["info", "Cara guna", "Hantar <code>/setgroup</code> di dalam group yang mahu dijadikan group persetujuan"]] }));
    }
    db.setSetting("approval_group_id", ctx.chat.id);
    await UI.sendCard(ctx.chat.id, UI.card({ title: "Group Persetujuan Ditetapkan", icon: "ok", rows: [["ok", "Status", "Group ini kini group persetujuan userbot & pembayaran"], ["tag", "ID group", `<code>${esc(ctx.chat.id)}</code>`]] }));
  });

  // Owner menambah / membuang reseller (balas mesej orangnya, atau tulis ID)
  const targetId = (ctx) => {
    const r = ctx.message.reply_to_message;
    if (r && r.from) return String(r.from.id);
    const m = String(ctx.match || "").trim();
    return /^\d{5,15}$/.test(m) ? m : null;
  };

  bot.command("addreseller", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    const id = targetId(ctx);
    if (!id) return UI.sendCard(ctx.chat.id, UI.card({ title: "Cara Guna", icon: "gear", rows: [["tag", "Guna", "<code>/addreseller &lt;ID&gt;</code>"], ["info", "Atau", "balas mesej orang itu dengan <code>/addreseller</code>"]] }));
    db.addReseller(id);
    await UI.sendCard(ctx.chat.id, UI.card({ title: "Reseller Ditambah", icon: "ok", rows: [["user", "ID", `<code>${esc(id)}</code>`], ["star", "Role", "<b>reseller</b>"]] }));
  });

  bot.command("delreseller", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    const id = targetId(ctx);
    if (!id) return UI.sendCard(ctx.chat.id, UI.card({ title: "Cara Guna", icon: "gear", rows: [["tag", "Guna", "<code>/delreseller &lt;ID&gt;</code>"], ["info", "Atau", "balas mesej orang itu dengan <code>/delreseller</code>"]] }));
    db.delReseller(id);
    await UI.sendCard(ctx.chat.id, UI.card({ title: "Reseller Dibuang", icon: "ok", rows: [["user", "ID", `<code>${esc(id)}</code>`], ["no", "Role", "bukan reseller lagi"]] }));
  });

  bot.command("resellers", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    const list = db.resellers();
    await UI.sendCard(ctx.chat.id, UI.card({
      title: `Senarai Reseller (${list.length})`, icon: "star",
      rows: list.map((id) => ["user", "ID", `<code>${esc(id)}</code>`]),
      note: list.length ? "" : "Belum ada reseller.",
    }));
  });
}

module.exports = { activateStaff, healStaff, register, requestApproval, roleOf, isOwner, isPrimaryOwner, extraOwners, allOwners, isReseller, isTK, isStaff, canCreate, approvalGroup };

// ===== RESELLER (UBOT ARTA PEDIA) =====
// Role RESELLER dibeli sekali bayar (default Rp5.000, QRIS otomatis; owner bisa ubah: /setharga RESELLER 5000).
// Reseller dan owner bisa menambahkan role LITE / GOLD / PLATINUM ke pengguna lain:
//   /addrole <ID> <LITE|GOLD|PLATINUM> [hari]       atau balas / forward pesan penerima:  /addrole GOLD 30
//   tombol PANEL RESELLER di /start -> pilih role -> kirim ID penerima (boleh diikuti hari: "123456789 30") atau forward pesannya
// Reseller tidak bisa menurunkan role pengguna yang sudah lebih tinggi, dan tidak bisa memberi role ke owner/reseller.
const db = require("./db");
const access = require("./access");
const PK = require("./paket");
const SR = require("./selfrole");
const UI = require("./botui");
const expiry = require("./expiry");
const notify = require("./notify");
const { esc, btn } = require("./core");

const state = new Map(); // resellerId -> { tier }
const CODE = { L: "LITE", G: "GOLD", P: "PLATINUM", R: "RESELLER", T: "TANGAN KANAN" };
const SPECIAL = new Set(["RESELLER", "TANGAN KANAN"]);
// siapa boleh memberi role apa:  LITE/GOLD/PLATINUM = owner, reseller, tangan kanan | RESELLER = owner, tangan kanan | TANGAN KANAN = owner
const canGive = (id, tier) => {
  if (access.isOwner(id)) return true;
  if (tier === "TANGAN KANAN") return false;
  if (tier === "RESELLER") return access.isTK(id);
  return access.isStaff(id);
};
const parseTier = (t) => {
  const s = String(t || "").toUpperCase().replace(/[\s_-]/g, "");
  if (s === "RESELLER" || s === "RSL") return "RESELLER";
  if (s === "TK" || s === "TANGANKANAN") return "TANGAN KANAN";
  return PK.normalize(t);
};
const defDays = (tier) => (SPECIAL.has(tier) ? 0 : SR.conf().prices[tier].days);
const can = (id) => access.isStaff(id);

const idFrom = (ctx) => {
  const m = ctx.message;
  const r = m.reply_to_message;
  if (r && r.from && !r.from.is_bot) return { id: String(r.from.id), from: r.from };
  const fo = m.forward_origin && m.forward_origin.sender_user;
  if (fo) return { id: String(fo.id), from: fo };
  if (m.forward_from) return { id: String(m.forward_from.id), from: m.forward_from };
  return null;
};
const nameOf = (u) => [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "-";

// RESELLER / TANGAN KANAN: sekali pemberian, tanpa masa aktif
async function grantSpecial(byId, targetId, tier, from) {
  if (!canGive(byId, tier)) return { err: tier === "TANGAN KANAN" ? "Role TANGAN KANAN hanya bisa diberikan oleh owner." : "Role RESELLER hanya bisa diberikan oleh owner atau tangan kanan." };
  if (access.isOwner(targetId)) return { err: "Penerima adalah owner, tidak perlu role." };
  if (tier === "RESELLER" && access.isReseller(targetId)) return { err: "Penerima sudah menjadi reseller/tangan kanan." };
  if (tier === "TANGAN KANAN" && access.isTK(targetId)) return { err: "Penerima sudah menjadi tangan kanan." };
  if (tier === "TANGAN KANAN") db.addTK(targetId); else db.addReseller(targetId);
  access.activateStaff(targetId);
  const before = db.getUser(targetId) || {};
  db.upsertUser(targetId, {
    paketBy: `reseller:${byId}`,
    ...(!before.name && from ? { name: nameOf(from) } : {}), ...(!before.username && from && from.username ? { username: from.username } : {}),
  });
  const rec = db.getUser(targetId) || {};
  UI.sendCard(targetId, UI.card({
    title: "Role Diberikan", icon: "ok",
    rows: [["crown", "Role", `<b>${esc(tier)}</b>`], ["time", "Masa aktif", "<b>Permanen</b>"]],
    checks: [[true, tier === "TANGAN KANAN" ? "Anda bisa menambah LITE, GOLD, PLATINUM dan RESELLER" : "Anda bisa menambah LITE, GOLD dan PLATINUM"], [false, `Tekan <b>${tier === "TANGAN KANAN" ? "PANEL TANGAN KANAN" : "PANEL RESELLER"}</b> di /start`]],
  })).catch(() => {});
  notify.fire("grant", { id: targetId, name: rec.name, username: rec.username }, [["Role", `<b>${esc(tier)}</b>`], ["Masa aktif", "<b>Permanen</b>"], ["Diberikan oleh", `<code>${esc(byId)}</code>`]]);
  return { ok: true, tier, days: 0, special: true, rec };
}

async function grant(byId, targetId, tier, days, from) {
  if (SPECIAL.has(tier)) return grantSpecial(byId, targetId, tier, from);
  if (access.isOwner(targetId) || access.isReseller(targetId)) return { err: "Penerima adalah owner/reseller, tidak perlu role." };
  const before = db.getUser(targetId) || {};
  const active = before.expiresAt && before.expiresAt > Date.now() && before.status === "approved";
  if (active && !access.isOwner(byId) && before.paket && PK.rankOf(before.paket) > PK.rankOf(tier)) {
    return { err: `Penerima sudah punya role ${before.paket} yang lebih tinggi dari ${tier}.` };
  }
  const d = days || defDays(tier);
  db.upsertUser(targetId, {
    status: "approved", paket: tier, paketAt: Date.now(), paketBy: `reseller:${byId}`,
    ...(!before.name && from ? { name: nameOf(from) } : {}), ...(!before.username && from && from.username ? { username: from.username } : {}),
  });
  expiry.addDays(targetId, d);
  let revived = false;
  try { revived = await expiry.revive(targetId); } catch (_) {}
  const rec = db.getUser(targetId) || {};
  // beri tahu penerima (berhasil hanya jika dia pernah /start bot)
  UI.sendCard(targetId, UI.card({
    title: "Role Diberikan", icon: "ok",
    rows: [["gem", "Role", `<b>${esc(tier)}</b>`], ["time", "Expired", `<b>${esc(expiry.label(targetId))}</b>`]],
    checks: [[true, "Role aktif"], [!!rec.session, rec.session ? `Userbot ${revived ? "dihidupkan kembali" : "siap dipakai"}` : "Tekan <b>Buat Ubot</b> untuk menyambungkan akun"]],
  })).catch(() => {});
  notify.fire("grant", { id: targetId, name: rec.name, username: rec.username }, [["Role", `<b>${esc(tier)}</b>`], ["Masa aktif", `<b>${d} hari</b>`], ["Diberikan oleh", `<code>${esc(byId)}</code>`], ["Expired", `<b>${esc(expiry.label(targetId))}</b>`]]);
  return { ok: true, tier, days: d, rec };
}

const resultCard = (r, targetId) =>
  r.err
    ? UI.card({ title: "Ditolak", icon: "no", rows: [["info", "Sebab", esc(r.err)]] })
    : UI.card({
        title: "Role Ditambahkan", icon: "ok",
        rows: r.special
          ? [["user", "Penerima", `<code>${esc(targetId)}</code>${r.rec.username ? " @" + esc(r.rec.username) : ""}`], ["crown", "Role", `<b>${esc(r.tier)}</b>`], ["time", "Masa aktif", "<b>Permanen</b>"]]
          : [["user", "Penerima", `<code>${esc(targetId)}</code>${r.rec.username ? " @" + esc(r.rec.username) : ""}`], ["gem", "Role", `<b>${esc(r.tier)}</b>`], ["time", "Masa aktif", `<b>${r.days} hari</b>`], ["time", "Expired", `<b>${esc(expiry.label(targetId))}</b>`]],
        checks: [[true, "Role aktif, penerima diberi tahu bila sudah /start bot"]],
      });

function panelCard(uid) {
  const p = SR.conf().prices;
  const given = db.allUsers().filter(([, r]) => String(r.paketBy || "") === `reseller:${uid}`).length;
  return UI.card({
    title: access.isOwner(uid) ? "Panel Role" : access.isTK(uid) ? "Panel Tangan Kanan" : "Panel Reseller", icon: "crown",
    rows: [...PK.ORDER.map((t) => ["gem", t, `default <b>${p[t].days} hari</b>`]), ...(canGive(uid, "RESELLER") ? [["user", "RESELLER", "<b>permanen</b>"]] : []), ...(canGive(uid, "TANGAN KANAN") ? [["crown", "TANGAN KANAN", "<b>permanen</b>"]] : []), ["user", "Role yang Anda berikan", `<b>${given}</b> pengguna`]],
    checks: [[true, "Pilih role lalu kirim ID penerima (boleh diikuti hari)"], [true, "Atau forward pesan penerima ke bot"]],
    note: "Cepat: <code>/addrole 123456789 GOLD 30</code> \u00B7 atau balas pesan penerima: <code>/addrole GOLD 30</code>" + (canGive(uid, "RESELLER") ? " \u00B7 <code>/addrole 123456789 RESELLER</code>" : "") + (canGive(uid, "TANGAN KANAN") ? " \u00B7 <code>/addrole 123456789 TK</code>" : ""),
  });
}
const kbFor = (uid) => (fancy) => {
  const rows = [PK.ORDER.map((t) => btn(fancy, `Beri ${t}`, `rsl:r:${t[0]}`, PK.TIERS[t].style, PK.TIERS[t].icon))];
  const extra = [];
  if (canGive(uid, "RESELLER")) extra.push(btn(fancy, "Beri RESELLER", "rsl:r:R", "success"));
  if (canGive(uid, "TANGAN KANAN")) extra.push(btn(fancy, "Beri TANGAN KANAN", "rsl:r:T", "primary"));
  if (extra.length) rows.push(extra);
  if (!access.isOwner(uid)) rows.push([btn(fancy, "BUAT STORE UBOT", "stm:m", "primary")]);
  return rows;
};

function register(bot) {
  bot.callbackQuery(/^rsl(?::(\w):(\w))?$/, async (ctx) => {
    if (!can(ctx.from.id)) return ctx.answerCallbackQuery({ text: "Khusus reseller.", show_alert: true });
    await ctx.answerCallbackQuery();
    const chat = ctx.callbackQuery.message ? ctx.callbackQuery.message.chat.id : ctx.from.id;
    const [, a, b] = ctx.match;
    if (!a) return UI.sendCard(chat, panelCard(ctx.from.id), kbFor(ctx.from.id));
    if (a === "x") {
      state.delete(ctx.from.id);
      return UI.sendCard(chat, panelCard(ctx.from.id), kbFor(ctx.from.id));
    }
    if (a === "r" && CODE[b]) {
      if (!canGive(ctx.from.id, CODE[b])) return UI.sendCard(chat, UI.card({ title: "Ditolak", icon: "no", rows: [["info", "Sebab", CODE[b] === "TANGAN KANAN" ? "Role TANGAN KANAN hanya bisa diberikan oleh owner." : "Role RESELLER hanya bisa diberikan oleh owner atau tangan kanan."]] }), kbFor(ctx.from.id));
      state.set(ctx.from.id, { tier: CODE[b] });
      const sp = SPECIAL.has(CODE[b]);
      return UI.sendCard(chat, UI.card({
        title: `Beri Role ${CODE[b]}`, icon: "user",
        rows: [["info", "Cara", sp ? "Kirim <b>ID Telegram</b> penerima: <code>123456789</code>" : "Kirim <b>ID Telegram</b> penerima, boleh diikuti hari: <code>123456789 30</code>"], ["info", "Atau", "<b>Forward</b> salah satu pesan penerima ke sini"]],
        note: sp ? "Role ini permanen (tanpa masa aktif)." : `Tanpa angka hari = default ${defDays(CODE[b])} hari.`,
      }), (fancy) => [[btn(fancy, "Batal", "rsl:x:x", "danger")]]);
    }
  });

  // jawaban untuk tombol di atas (sebelum Live Chat)
  bot.on("message", async (ctx, next) => {
    const st = ctx.from && state.get(ctx.from.id);
    if (!st || !ctx.chat || ctx.chat.type !== "private" || !can(ctx.from.id)) return next();
    const text = String(ctx.message.text || "").trim();
    if (/^\/\w+/.test(text)) return next();
    if (/^batal$/i.test(text)) {
      state.delete(ctx.from.id);
      return UI.sendCard(ctx.chat.id, panelCard(ctx.from.id), kbFor(ctx.from.id));
    }
    let target = idFrom(ctx);
    let days = 0;
    if (!target) {
      const m = text.match(/^(\d{5,15})(?:\s+(\d{1,4}))?$/);
      if (m) {
        target = { id: m[1], from: null };
        days = m[2] ? Number(m[2]) : 0;
      }
    }
    if (!target) return UI.sendCard(ctx.chat.id, UI.card({ title: "Format Salah", icon: "no", rows: [["info", "Contoh", "<code>123456789 30</code> atau forward pesan penerima"]] }));
    state.delete(ctx.from.id);
    const r = await grant(ctx.from.id, target.id, st.tier, days, target.from);
    return UI.sendCard(ctx.chat.id, resultCard(r, target.id), kbFor(ctx.from.id));
  });

  bot.command("addrole", async (ctx) => {
    if (!can(ctx.from.id)) return;
    const tokens = String(ctx.match || "").trim().split(/\s+/).filter(Boolean);
    let target = idFrom(ctx);
    if (!target && /^\d{5,15}$/.test(tokens[0] || "")) target = { id: tokens.shift(), from: null };
    else if (target) { /* balas/forward: token pertama = role */ }
    if (/^tangan$/i.test(tokens[0] || "") && /^kanan$/i.test(tokens[1] || "")) tokens.splice(0, 2, "TK"); // "TANGAN KANAN" ditulis dua kata
    const tier = parseTier(tokens[0]);
    const days = tokens[1] && /^\d{1,4}$/.test(tokens[1]) ? Number(tokens[1]) : 0;
    if (!target || !tier) {
      return UI.sendCard(ctx.chat.id, UI.card({
        title: "Cara Guna /addrole", icon: "gear",
        rows: [["tag", "Guna", "<code>/addrole 123456789 GOLD 30</code>"], ["info", "Atau", "balas pesan penerima: <code>/addrole GOLD 30</code>"], ["info", "Role", "LITE, GOLD, PLATINUM \u00B7 hari opsional" + (canGive(ctx.from.id, "RESELLER") ? " \u00B7 RESELLER" : "") + (canGive(ctx.from.id, "TANGAN KANAN") ? " \u00B7 TK (tangan kanan)" : "")]],
      }), kbFor(ctx.from.id));
    }
    const r = await grant(ctx.from.id, target.id, tier, days, target.from);
    return UI.sendCard(ctx.chat.id, resultCard(r, target.id), kbFor(ctx.from.id));
  });

  // Owner: kelola role TANGAN KANAN langsung (atau lewat /addrole <ID> TK)
  const tkTarget = (ctx) => { const t = idFrom(ctx); if (t) return t.id; const m = String(ctx.match || "").trim(); return /^\d{5,15}$/.test(m) ? m : null; };
  bot.command("addtk", async (ctx) => {
    if (!access.isOwner(ctx.from.id)) return;
    const id = tkTarget(ctx);
    if (!id) return UI.sendCard(ctx.chat.id, UI.card({ title: "Cara Guna", icon: "gear", rows: [["tag", "Guna", "<code>/addtk &lt;ID&gt;</code>"], ["info", "Atau", "balas pesan orangnya dengan <code>/addtk</code>"]] }));
    const r = await grant(ctx.from.id, id, "TANGAN KANAN", 0, null);
    return UI.sendCard(ctx.chat.id, resultCard(r, id));
  });
  bot.command("deltk", async (ctx) => {
    if (!access.isOwner(ctx.from.id)) return;
    const id = tkTarget(ctx);
    if (!id) return UI.sendCard(ctx.chat.id, UI.card({ title: "Cara Guna", icon: "gear", rows: [["tag", "Guna", "<code>/deltk &lt;ID&gt;</code>"]] }));
    db.delTK(id);
    return UI.sendCard(ctx.chat.id, UI.card({ title: "Tangan Kanan Dibuang", icon: "ok", rows: [["user", "ID", `<code>${esc(id)}</code>`], ["no", "Role", "bukan tangan kanan lagi"]] }));
  });
  bot.command("tklist", async (ctx) => {
    if (!access.isOwner(ctx.from.id)) return;
    const list = db.tanganKanan();
    return UI.sendCard(ctx.chat.id, UI.card({ title: `Daftar Tangan Kanan (${list.length})`, icon: "crown", rows: list.map((id) => ["user", "ID", `<code>${esc(id)}</code>`]), note: list.length ? "" : "Belum ada tangan kanan." }));
  });
}

module.exports = { register, grant, canGive };

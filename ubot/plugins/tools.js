// Alat utiliti: .id .info .calc .time .b64 .hash .pass  (kad Rich + emoji premium)
const crypto = require("crypto");
const { card, show, edit, esc, footerOf, clip } = require("../ui");
const access = require("../access");
const db = require("../db");
const expiry = require("../expiry");
const { fmtTime, TZL } = require("../core");

const dname = (u) => [u.firstName, u.lastName].filter(Boolean).join(" ") || u.title || u.username || "-";

// ---------- .id ----------
async function idCmd(ctx) {
  const { client, msg, account } = ctx;
  let chat = null;
  try {
    chat = await msg.getChat();
  } catch (_) {}
  const rm = await msg.getReplyMessage().catch(() => null);
  const rows = [
    ["tag", "Chat", esc(clip(chat ? dname(chat) : "-", 40))],
    ["gear", "Chat ID", `<code>${esc(msg.chatId !== undefined ? msg.chatId : "-")}</code>`],
    ["user", "ID Anda", `<code>${esc(account.accountId)}</code>`],
    ["link", "ID Mesej", `<code>${msg.id}</code>`],
  ];
  if (rm) {
    rows.push(["user", "ID Pengirim (reply)", `<code>${esc(rm.senderId || "-")}</code>`]);
    rows.push(["link", "ID Mesej (reply)", `<code>${rm.id}</code>`]);
  }
  await show(ctx, card({ title: "ID Info", icon: "gear", rows, footer: footerOf(account) }));
}

// ---------- .info ----------
async function infoCmd(ctx) {
  const { client, msg, args, account } = ctx;
  let ref = args[0];
  if (!ref) {
    const rm = await msg.getReplyMessage().catch(() => null);
    ref = rm && rm.senderId ? rm.senderId : account.accountId;
  }
  let ent;
  try {
    ent = await client.getEntity(/^-?\d+$/.test(String(ref)) ? Number(ref) : ref);
  } catch (_) {
    return edit(ctx, "\u26A0\uFE0F Pengguna tidak ditemui. Guna .info @username / ID, atau balas mesej orangnya.");
  }
  const yn = (b) => (b ? "Ya" : "Tidak");
  const rows = [
    ["user", "Nama", `<b>${esc(clip(dname(ent), 40))}</b>`],
    ["link", "Username", ent.username ? `<a href="https://t.me/${esc(ent.username)}">@${esc(ent.username)}</a>` : "-"],
    ["gear", "ID", `<code>${esc(ent.id)}</code>`],
  ];
  if (ent.className === "User") {
    rows.push(["robot", "Bot", yn(ent.bot)]);
    rows.push(["gem", "Premium", yn(ent.premium)]);
    rows.push(["check", "Verified", yn(ent.verified)]);
  } else {
    rows.push(["tag", "Jenis", ent.broadcast ? "Channel" : "Group"]);
    if (ent.participantsCount) rows.push(["chart", "Ahli", String(ent.participantsCount)]);
  }
  // Staf boleh nampak role + masa aktif pengguna sistem
  if (access.isStaff(account.userId)) {
    const found = db.findUser(ent.id);
    if (found) rows.push(["crown", "Role / Expired", `${esc(access.roleOf(found[0]))} / ${esc(expiry.label(found[0]))}`]);
  }
  await show(ctx, card({ title: "Info Pengguna", icon: "user", rows, footer: footerOf(account) }));
}

// ---------- .calc ----------
const FN = { sqrt: "Math.sqrt", sin: "Math.sin", cos: "Math.cos", tan: "Math.tan", log: "Math.log10", ln: "Math.log", abs: "Math.abs", round: "Math.round", floor: "Math.floor", ceil: "Math.ceil", pi: "Math.PI" };
function safeEval(src) {
  let s = String(src).trim().toLowerCase().replace(/,/g, ".").replace(/x/g, "*").replace(/\u00D7/g, "*").replace(/\u00F7/g, "/");
  if (!s || s.length > 120) throw new Error("Ungkapan kosong atau terlalu panjang");
  s = s.replace(/\b(sqrt|sin|cos|tan|log|ln|abs|round|floor|ceil|pi|e)\b/g, (m) => (m === "e" ? "Math.E" : FN[m]));
  const left = s.replace(/Math\.(sqrt|sin|cos|tan|log10|log|abs|round|floor|ceil|PI|E)/g, "");
  if (!/^[0-9+\-*/%().^\s]*$/.test(left)) throw new Error("Aksara tidak dibenarkan");
  const v = Function(`"use strict"; return (${s.replace(/\^/g, "**")});`)();
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("Hasil tidak sah");
  return v;
}
async function calcCmd(ctx) {
  const expr = ctx.args.join(" ");
  if (!expr) return edit(ctx, "Guna: .calc 12*(3+4)  |  .calc sqrt(144)  |  .calc 2^10");
  let v;
  try {
    v = safeEval(expr);
  } catch (err) {
    return edit(ctx, `\u26A0\uFE0F Ralat: ${err.message}`);
  }
  const out = Number.isInteger(v) ? String(v) : String(Math.round(v * 1e10) / 1e10);
  await show(ctx, card({
    title: "Kalkulator", icon: "chart",
    rows: [["tag", "Ungkapan", `<code>${esc(clip(expr, 80))}</code>`], ["ok", "Hasil", `<b>${esc(out)}</b>`]],
    footer: footerOf(ctx.account),
  }));
}

// ---------- .time ----------
const ZONES = { wib: 7, wita: 8, wit: 9, myt: 8, sgt: 8, wib7: 7, utc: 0, gmt: 0, jst: 9, kst: 9, ist: 5.5, gst: 4, cet: 1, est: -5, pst: -8 };
const stamp = (off) => new Date(Date.now() + off * 3600000).toISOString().replace("T", " ").slice(0, 16);
async function timeCmd(ctx) {
  const arg = String(ctx.args[0] || "").toLowerCase();
  let list;
  if (arg) {
    const m = arg.match(/^([+-]?\d{1,2}(?:\.\d)?)$/);
    if (m) list = [[`UTC${Number(m[1]) >= 0 ? "+" : ""}${Number(m[1])}`, Number(m[1])]];
    else if (ZONES[arg] !== undefined) list = [[arg.toUpperCase(), ZONES[arg]]];
    else return edit(ctx, `Zon tidak dikenali. Contoh: .time myt | .time +8 | zon: ${Object.keys(ZONES).join(", ")}`);
  } else {
    list = [["WIB", 7], ["MYT / SGT", 8], ["WIT / JST", 9], ["UTC", 0], ["CET", 1], ["EST", -5]];
  }
  await show(ctx, card({
    title: "Waktu Dunia", icon: "time", headers: ["Zon", "Masa"],
    rows: list.map(([z, o]) => ["time", esc(z), `<b>${esc(stamp(o))}</b>`]),
    sub: `Zon bot: ${esc(TZL)} \u00B7 ${esc(fmtTime(Date.now(), true))}`,
    footer: footerOf(ctx.account),
  }));
}

// ---------- .b64 ----------
async function b64Cmd(ctx) {
  const mode = String(ctx.args[0] || "").toLowerCase();
  let text = ctx.args.slice(1).join(" ");
  if (!text) {
    const rm = await ctx.msg.getReplyMessage().catch(() => null);
    text = rm && rm.message ? rm.message : "";
  }
  if (!["enc", "dec"].includes(mode) || !text) return edit(ctx, "Guna: .b64 enc <teks>  |  .b64 dec <base64>  (atau balas mesej)");
  let out;
  try {
    out = mode === "enc" ? Buffer.from(text, "utf8").toString("base64") : Buffer.from(text.trim(), "base64").toString("utf8");
  } catch (_) {
    return edit(ctx, "\u26A0\uFE0F Base64 tidak sah.");
  }
  await show(ctx, card({
    title: mode === "enc" ? "Base64 Encode" : "Base64 Decode", icon: "gear",
    rows: [["tag", "Input", `<code>${esc(clip(text, 120))}</code>`], ["ok", "Output", `<code>${esc(clip(out, 400))}</code>`]],
    footer: footerOf(ctx.account),
  }));
}

// ---------- .hash ----------
async function hashCmd(ctx) {
  const algo = String(ctx.args[0] || "").toLowerCase();
  let text = ctx.args.slice(1).join(" ");
  if (!text) {
    const rm = await ctx.msg.getReplyMessage().catch(() => null);
    text = rm && rm.message ? rm.message : "";
  }
  if (!["md5", "sha1", "sha256", "sha512"].includes(algo) || !text) return edit(ctx, "Guna: .hash <md5|sha1|sha256|sha512> <teks>");
  const h = crypto.createHash(algo).update(text, "utf8").digest("hex");
  await show(ctx, card({
    title: "Hash", icon: "gear",
    rows: [["tag", "Algoritma", esc(algo.toUpperCase())], ["tag", "Input", `<code>${esc(clip(text, 80))}</code>`], ["ok", "Hash", `<code>${esc(h)}</code>`]],
    footer: footerOf(ctx.account),
  }));
}

// ---------- .pass ----------
async function passCmd(ctx) {
  const n = Math.min(64, Math.max(8, parseInt(ctx.args[0], 10) || 16));
  const set = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*?";
  let p = "";
  for (let i = 0; i < n; i++) p += set[crypto.randomInt(set.length)];
  await show(ctx, card({
    title: "Kata Laluan Rawak", icon: "crown",
    rows: [["gear", "Panjang", String(n)], ["ok", "Kata laluan", `<code>${esc(p)}</code>`]],
    checks: [[true, "Dijana secara rawak (crypto)"], [false, "Jangan kongsi dalam chat umum"]],
    footer: footerOf(ctx.account),
  }));
}

module.exports = {
  name: "tools",
  category: "Utilitas",
  help: [
    { cmd: "id", alias: [], desc: "ID chat, akaun anda dan mesej yang direply" },
    { cmd: "info", alias: [], desc: "maklumat pengguna/chat: .info @user | ID | reply" },
    { cmd: "calc", alias: [], desc: "kalkulator: .calc 12*(3+4), sqrt(144), 2^10" },
    { cmd: "time", alias: [], desc: "waktu dunia: .time | .time myt | .time +8" },
    { cmd: "b64", alias: [], desc: "Base64: .b64 enc|dec <teks>" },
    { cmd: "hash", alias: [], desc: "hash teks: .hash sha256 <teks>" },
    { cmd: "pass", alias: [], desc: "jana kata laluan rawak: .pass 20" },
  ],
  commands: { id: idCmd, info: infoCmd, calc: calcCmd, time: timeCmd, b64: b64Cmd, hash: hashCmd, pass: passCmd },
  safeEval,
};

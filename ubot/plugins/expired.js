const { esc, em, send, fmtTime, TZL } = require("../core");
const access = require("../access");
const db = require("../db");
const expiry = require("../expiry");
const { showPanel } = require("../panel");

// ===== Emoji premium untuk .setexpired =====
const E = {
  ok: "5260726538302660868", // \u2705 tajuk
  user: "5258362837411045098", // \uD83D\uDC64 Akun
  crown: "5217822164362739968", // \uD83D\uDC51 Owner ID
  plus: "5258108352008823107", // \u2795 Tambah
  green: "5416081784641168838", // \uD83D\uDFE2 Status
  hourglass: "5352940967911517739", // \u23F3 Expired
  rex: "6235524376070984680", // \uD83E\uDD96
  feather1: "6244617272808183303", // \uD83E\uDEB6
  feather2: "6242011198322119983", // \uD83E\uDEB6
};

const USAGE =
  "Guna: .setexpired <hari> [ID pengguna]\n" +
  "\u2022 .setexpired 7  \u2192 tambah 7 hari (diri sendiri, atau pemilik mesej yang direply)\n" +
  "\u2022 .setexpired 30 123456789  \u2192 tambah 30 hari kepada ID itu\n" +
  "\u2022 .setexpired -3  \u2192 kurangkan 3 hari";

function resultPanel({ staff, targetId, rec, days, res }) {
  const sUname = staff.username;
  const who = sUname ? `@${esc(sUname)}` : esc(staff.name || "-");
  const name = esc(rec.name || rec.accountName || rec.username || "-");
  const akun = rec.reqNo ? `#${rec.reqNo} ${name}` : name;
  const status = res.active ? "active" : "expired";
  const exp = `${fmtTime(res.after, true)}`;
  const tambah = `${days > 0 ? "" : ""}${days} hari`;
  const title = days >= 0 ? "Masa Aktif Ditambah" : "Masa Aktif Dikurangkan";

  const html =
    `<h3>${em(E.ok, "\u2705")} ${title}</h3>` +
    `<table bordered>` +
    `<tr><th>Info</th><th>Nilai</th></tr>` +
    `<tr><td>${em(E.user, "\uD83D\uDC64")} Akun</td><td>${akun}</td></tr>` +
    `<tr><td>${em(E.crown, "\uD83D\uDC51")} Owner ID</td><td>${esc(targetId)}</td></tr>` +
    `<tr><td>${em(E.plus, "\u2795")} Tambah</td><td>${tambah}</td></tr>` +
    `<tr><td>${em(E.green, "\uD83D\uDFE2")} Status</td><td>${status}</td></tr>` +
    `<tr><td>${em(E.hourglass, "\u23F3")} Expired (${TZL})</td><td>${exp}</td></tr>` +
    `</table>` +
    `<footer>${em(E.feather1, "\uD83E\uDEB6")} ${em(E.rex, "\uD83E\uDD96")} Userbot by ${who} ${em(E.feather2, "\uD83E\uDEB6")}</footer>`;

  const text =
    `${em(E.ok, "\u2705")} <b>${title}</b>\n\n` +
    `${em(E.user, "\uD83D\uDC64")} Akun : <b>${akun}</b>\n` +
    `${em(E.crown, "\uD83D\uDC51")} Owner ID : <b>${esc(targetId)}</b>\n` +
    `${em(E.plus, "\u2795")} Tambah : <b>${tambah}</b>\n` +
    `${em(E.green, "\uD83D\uDFE2")} Status : <b>${status}</b>\n` +
    `${em(E.hourglass, "\u23F3")} Expired (${TZL}) : <b>${exp}</b>\n\n` +
    `<i>${em(E.feather1, "\uD83E\uDEB6")} ${em(E.rex, "\uD83E\uDD96")} Userbot by ${who} ${em(E.feather2, "\uD83E\uDEB6")}</i>`;
  return { html, text };
}

async function setExpired({ client, msg, args, account }) {
  const edit = (t) => client.editMessage(msg.peerId, { message: msg.id, text: t });

  if (!access.isStaff(account.userId)) return edit("\u26A0\uFE0F Hanya owner atau reseller boleh guna .setexpired");

  const days = parseInt(args[0], 10);
  if (!Number.isFinite(days) || days === 0 || Math.abs(days) > 3650) return edit(USAGE);

  // Sasaran: ID dalam arahan > pemilik mesej yang direply > diri sendiri
  let wanted = /^\d{5,15}$/.test(args[1] || "") ? args[1] : null;
  if (!wanted) {
    const rm = await msg.getReplyMessage();
    if (rm && rm.senderId) wanted = String(rm.senderId);
  }
  if (!wanted) wanted = String(account.userId);

  const found = db.findUser(wanted);
  if (!found) return edit(`\u26A0\uFE0F ID ${wanted} tiada dalam sistem (pengguna belum pernah minta userbot).`);
  const [targetId, rec] = found;

  if (access.isOwner(targetId)) return edit("\u2139\uFE0F Owner tiada had masa aktif.");

  const res = expiry.addDays(targetId, days);
  const revived = res.active ? await expiry.revive(targetId) : false;

  // Maklumkan pengguna di bot
  if (String(targetId) !== String(account.userId)) {
    const note = res.active
      ? `${em(E.ok, "\u2705")} <b>Masa aktif userbot anda ${days > 0 ? "ditambah" : "dikurangkan"} ${Math.abs(days)} hari.</b>\n${em(E.hourglass, "\u23F3")} Expired (${TZL}): <b>${fmtTime(res.after, true)}</b>${revived ? "\nUserbot anda telah diaktifkan semula." : ""}`
      : `${em(E.hourglass, "\u23F3")} <b>Userbot anda telah expired</b>\nHubungi owner atau reseller untuk menambah masa aktif.`;
    await send(targetId, note);
  }

  const { html, text } = resultPanel({ staff: account, targetId, rec: db.getUser(targetId) || rec, days, res });
  try {
    await showPanel({ client, msg, account, html, text });
  } catch (err) {
    console.error(".setexpired: panel gagal, guna teks biasa:", err.message);
    await edit(`\u2705 ${days > 0 ? "Ditambah" : "Dikurangkan"} ${Math.abs(days)} hari untuk ${targetId}\nExpired (${TZL}): ${fmtTime(res.after, true)}\nStatus: ${res.active ? "active" : "expired"}`);
  }
}

module.exports = {
  name: "expired",
  category: "Utilitas",
  help: [
    {
      cmd: "setexpired",
      alias: [],
      desc: "owner/reseller: tambah masa aktif userbot. Contoh: .setexpired 7 [ID] atau balas mesej pengguna",
    },
  ],
  commands: { setexpired: setExpired },
};

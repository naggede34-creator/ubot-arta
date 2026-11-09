const bigInt = require("big-integer");
const { Api } = require("telegram");
const { shared, esc, em } = require("../core");
const access = require("../access");
const db = require("../db");
const expiry = require("../expiry");
const { showPanel } = require("../panel");

// ===== Emoji premium untuk .ping =====
const E = {
  bolt1: "5456140674028019486", // \u26A1 tajuk
  fire: "5424972470023104089", // \uD83D\uDD25
  bolt2: "5215203703190989803", // \u26A1 selepas "Userbot"
  rocket: "5195033767969839232", // \uD83D\uDE80
  user: "5258362837411045098", // \uD83D\uDC64 Akun
  check: "6005561111099740638", // \u2611\uFE0F lencana
  hourglass: "5352940967911517739", // \u23F3 Expired
  tag: "5296348778012361146", // \uD83C\uDFF7 Role
  star: "5852636219250317264", // \u2B50 reseller
  crown: "5217822164362739968", // \uD83D\uDC51 owner
  box: "5258134813302332906", // \uD83D\uDCE6 Paket
  gem: "6276228098962754124", // \uD83D\uDC8E nilai paket
  link: "5271604874419647061", // \uD83D\uDD17 Rich render
  bolt3: "5377585120888763078", // \u26A1 Premium reply
  bolt4: "5377830445125742842", // \u26A1 Latency
};

function pingPanel(account, ms) {
  const role = access.roleOf(account.userId);
  const staff = role !== "pelanggan";
  const uname = account.username;
  const who = uname ? `@${esc(uname)}` : esc(account.name || "-");
  const akun = (uname ? `<a href="https://t.me/${esc(uname)}">@${esc(uname)}</a>` : who) + (staff ? ` ${em(E.check, "\u2611\uFE0F")}` : "");

  const roleCell =
    role === "owner" ? `${em(E.crown, "\uD83D\uDC51")} owner` : role === "tangan kanan" ? `${em(E.crown, "\uD83D\uDC51")} tangan kanan` : role === "reseller" ? `${em(E.star, "\u2B50")} reseller` : `${em(E.user, "\uD83D\uDC64")} pelanggan`;
  const rec = db.getUser(account.userId) || {};
  const PK = require("../paket");
  const tier = PK.tierOf(account.userId);
  const paket = tier;
  const cnt = PK.counts(account.userId);
  const paketCell = `${PK.badge(tier)}`; // LITE / GOLD / PLATINUM / OWNER dengan ikon premium masing-masing
  const exp = expiry.label(account.userId);
  const bot = shared.botUsername;
  const botLink = bot ? `<a href="https://t.me/${esc(bot)}">@${esc(bot)}</a>` : "bot";

  const html =
    `<h3>${em(E.bolt1, "\u26A1")} Pong! ${em(E.fire, "\uD83D\uDD25")}</h3>` +
    `<p>Userbot ${em(E.bolt2, "\u26A1")} hidup dan siap dipakai ${em(E.rocket, "\uD83D\uDE80")}</p>` +
    `<table bordered>` +
    `<tr><th>Metrik</th><th>Nilai</th></tr>` +
    `<tr><td>${em(E.user, "\uD83D\uDC64")} Akun</td><td>${akun}</td></tr>` +
    `<tr><td>${em(E.hourglass, "\u23F3")} Expired</td><td>${esc(exp)}</td></tr>` +
    `<tr><td>${em(E.tag, "\uD83C\uDFF7")} Role</td><td>${roleCell}</td></tr>` +
    `<tr><td>${em(E.box, "\uD83D\uDCE6")} Paket</td><td>${paketCell}</td></tr>` +
    `<tr><td>${em(E.star, "\u2B50")} Fitur</td><td>${cnt.open} / ${cnt.total} command</td></tr>` +
    `<tr><td>${em(E.bolt4, "\u26A1")} Latency</td><td>${ms} ms</td></tr>` +
    `</table>` +
    `<ul>` +
    `<li><input type="checkbox" checked>${em(E.link, "\uD83D\uDD17")} Rich render via ${botLink}</li>` +
    `<li><input type="checkbox" checked>${em(E.bolt3, "\u26A1")} Premium reply</li>` +
    `</ul>` +
    `<footer>${require("../ui").customFooter(account) || `${who} Userbot By ${who}`}</footer>`;

  const text =
    `${em(E.bolt1, "\u26A1")} <b>Pong!</b> ${em(E.fire, "\uD83D\uDD25")}\nUserbot ${em(E.bolt2, "\u26A1")} hidup dan siap dipakai ${em(E.rocket, "\uD83D\uDE80")}\n\n` +
    `${em(E.user, "\uD83D\uDC64")} Akun : <b>${who}</b>\n` +
    `${em(E.hourglass, "\u23F3")} Expired : <b>${esc(exp)}</b>\n` +
    `${em(E.tag, "\uD83C\uDFF7")} Role : <b>${role}</b>\n` +
    `${em(E.box, "\uD83D\uDCE6")} Paket : <b>${PK.badge(tier)}</b>\n` +
    `${em(E.star, "\u2B50")} Fitur : <b>${cnt.open} / ${cnt.total} command</b>\n` +
    `${em(E.bolt4, "\u26A1")} Latency : <b>${ms} ms</b>\n\n` +
    `\u2611 ${em(E.link, "\uD83D\uDD17")} Rich render via ${bot ? "@" + esc(bot) : "bot"}\n\u2611 ${em(E.bolt3, "\u26A1")} Premium reply\n\n` +
    `<i>${require("../ui").customFooter(account) || `${who} Userbot By ${who}`}</i>`;

  return { html, text };
}

async function measure(client, msg) {
  const t0 = Date.now();
  try {
    await client.invoke(new Api.Ping({ pingId: bigInt(Math.floor(Math.random() * 1e9)) }));
    return Date.now() - t0;
  } catch (_) {
    return msg && msg.date ? Math.max(0, Date.now() - msg.date * 1000) : Date.now() - t0;
  }
}

async function pingCmd({ client, msg, account }) {
  const ms = await measure(client, msg);
  const { html, text } = pingPanel(account, ms);
  try {
    await showPanel({ client, msg, account, html, text });
  } catch (err) {
    console.error(".ping: panel gagal, guna teks biasa:", err.message);
    await client.editMessage(msg.peerId, { message: msg.id, text: `Pong! \u2705 ${ms} ms` });
  }
}

module.exports = {
  name: "ping",
  category: "Umum",
  help: [{ cmd: "ping", alias: [], desc: "cek userbot hidup, role, paket dan masa aktif" }],
  commands: { ping: pingCmd },
  pingPanel,
};

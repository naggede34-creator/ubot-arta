// Pembantu kongsi untuk plugin: kad Rich (jadual + checkbox + emoji premium) + versi teks biasa sebagai cadangan.
// Semua ID emoji di bawah diambil daripada palet yang sudah digunakan projek ini (richai.js / ping.js).
// Fail ini ASCII sahaja (emoji ditulis sebagai \uXXXX) supaya selamat jika disunting.
const { esc, em, shared } = require("./core");
const { showPanel } = require("./panel");

// kunci -> [ID emoji premium, emoji biasa]
const E = {
  bolt: ["5456140674028019486", "\u26A1"],
  fire: ["5424972470023104089", "\uD83D\uDD25"],
  rocket: ["5195033767969839232", "\uD83D\uDE80"],
  user: ["5258362837411045098", "\uD83D\uDC64"],
  check: ["6005561111099740638", "\u2611\uFE0F"],
  time: ["5352940967911517739", "\u23F3"],
  tag: ["5296348778012361146", "\uD83C\uDFF7"],
  star: ["5852636219250317264", "\u2B50"],
  box: ["5258134813302332906", "\uD83D\uDCE6"],
  gem: ["6276228098962754124", "\uD83D\uDC8E"],
  link: ["5271604874419647061", "\uD83D\uDD17"],
  ok: ["5260726538302660868", "\u2705"],
  crown: ["5217822164362739968", "\uD83D\uDC51"],
  plus: ["5258108352008823107", "\u2795"],
  green: ["5416081784641168838", "\uD83D\uDFE2"],
  chart: ["5231200819986047254", "\uD83D\uDCCA"],
  wave: ["5402498632739996967", "\uD83D\uDC4B"],
  robot: ["5260721826723549165", "\uD83E\uDD16"],
  gear: ["5368589393491669392", "\u2699\uFE0F"],
  mega: ["5411503950799060151", "\uD83D\uDD08"],
  star2: ["6320831596324721328", "\u2B50"],
  rex: ["6235524376070984680", "\uD83E\uDD96"],
  f1: ["6244617272808183303", "\uD83E\uDEB6"],
  f2: ["6242011198322119983", "\uD83E\uDEB6"],
  // v1.8: ID dari daftar emoji premium kiriman pemilik
  warn: ["6215486554043846997", "\u26A0\uFE0F"],
  done: ["6217521170246274833", "\u2705"],
  no: ["6215006664462962699", "\u274C"],
  gift: ["6217489739675604129", "\uD83C\uDF81"],
  cloud: ["5467538555158943525", "\u2601\uFE0F"],
  eyes: ["5210956306952758910", "\uD83D\uDC40"],
  pin: ["5397782960512444700", "\uD83D\uDCCC"],
  bolt2: ["5224607267797606837", "\u26A1"],
  smile: ["5461117441612462242", "\uD83D\uDE42"],
};

const ico = (k) => (E[k] ? em(E[k][0], E[k][1]) : "");
const plain = (k) => (E[k] ? E[k][1] : "");
const strip = (h) => String(h).replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const clip = (s, n = 60) => (String(s).length > n ? String(s).slice(0, n - 1) + "\u2026" : String(s));
const nl2br = (s) => esc(s).replace(/\r?\n/g, "<br>");

const whoOf = (a) => (a && a.username ? `@${esc(a.username)}` : esc((a && a.name) || "-"));

// card({ title, icon, sub, headers, rows: [[ikon, label, nilaiHTML]], checks: [[bool, teksHTML]], extra, footer })
// -> { html (Rich), text (teks biasa) }.  Label dan nilai MESTI sudah di-escape (guna esc()).
// Opsi tambahan (v1.7, serasi ke belakang): lead = ayat pembuka berikon, hr = garis pemisah antar blok,
// headerIcons = ikon pada kepala jadual, details = { icon, title, body } bahagian boleh dibuka, extraFirst = extra sebelum jadual
function card({ title, icon = "bolt", sub = "", lead = "", headers = ["Info", "Nilai"], headerIcons = null, rows = [], checks = [], details = null, hr = false, extraFirst = false, extra = "", extraText = "", footer = "" }) {
  const hi = (i) => (headerIcons && headerIcons[i] ? ico(headerIcons[i]) + " " : "");
  const blocks = [];
  let head = `<h3>${ico(icon)} ${esc(title)}</h3>`;
  if (lead) head += `<p>${ico("star")} ${lead}</p>`;
  if (sub) head += `<p>${sub}</p>`;
  blocks.push(head);
  if (extra && extraFirst) blocks.push(extra);
  if (rows.length) {
    let t = `<table bordered><tr><th>${hi(0)}${esc(headers[0])}</th><th>${hi(1)}${esc(headers[1])}</th></tr>`;
    t += rows.map(([k, label, val]) => `<tr><td>${k ? ico(k) + " " : ""}${label}</td><td>${val}</td></tr>`).join("");
    blocks.push(t + `</table>`);
  }
  let tail = "";
  if (checks.length) {
    tail += `<ul>${checks.map(([ok, t]) => `<li><input type="checkbox"${ok ? " checked" : ""}>${t}</li>`).join("")}</ul>`;
  }
  if (details && details.title) {
    tail += `<details><summary>${details.icon ? ico(details.icon) + " " : ""}${esc(details.title)}</summary><p>${nl2br(details.body || "")}</p></details>`;
  }
  if (extra && !extraFirst) tail += extra;
  if (tail) blocks.push(tail);
  let html = blocks.join(hr ? "<hr>" : "");
  if (footer) html += `<footer>${footer}</footer>`;

  let text = `${ico(icon)} <b>${esc(title)}</b>\n`;
  if (lead) text += `${ico("star")} ${lead}\n`;
  if (sub) text += `${sub}\n`;
  if (extraText && extraFirst) text += `\n${extraText}\n`;
  if (rows.length) text += "\n" + rows.map(([k, label, val]) => `${k ? ico(k) + " " : ""}${label} : <b>${val}</b>`).join("\n") + "\n";
  if (checks.length) text += "\n" + checks.map(([ok, t]) => `${ok ? "\u2611" : "\u2610"} ${t}`).join("\n") + "\n";
  if (details && details.title) text += `\n<b>${esc(details.title)}</b>\n${esc(details.body || "")}\n`;
  if (extraText && !extraFirst) text += `\n${extraText}\n`;
  if (footer) text += `\n<i>${footer}</i>`;
  return { html, text };
}

// Pengaki piawai
const defaultFooter = (account) => `${ico("f1")} ${ico("rex")} Userbot by ${whoOf(account)} ${ico("f2")}`;
const customFooter = (account) => {
  try {
    const u = account && account.userId !== undefined ? require("./db").getUser(account.userId) : null;
    return u && u.footer ? footerOf(account) : null;
  } catch (_) { return null; }
};
// Pengaki: .setfooter <teks> (token {e:ID} = emoji premium, {user} = nama anda). Tanpa tetapan -> pengaki piawai.
const footerOf = (account) => {
  try {
    const u = account && account.userId !== undefined ? require("./db").getUser(account.userId) : null;
    const f = u && u.footer;
    if (f) return require("./emo").tokensToHtml(f).replace(/\{user\}/gi, whoOf(account));
  } catch (_) {}
  return defaultFooter(account);
};

// Edit mesej arahan (teks biasa, tanpa penukaran)
const rawEdit = (ctx, text, html = false) =>
  ctx.client.editMessage(ctx.msg.peerId, { message: ctx.msg.id, text, _raw: true, ...(html ? { parseMode: "html" } : {}) }).catch(() => {});

// ---------- Kad notis / cara guna ----------
// Mesej "Guna: ...", amaran dan maklumat daripada SEMUA command dipaparkan sebagai kad Rich:
//   tajuk -> penerangan command -> blok kod (guna + contoh) -> kotak semak (nota) -> nota -> pengaki
const NOTICE_RE = /^(Guna:|⚠|ℹ|❌|Tiada |Hanya |Zon tidak|Root semasa)/;
const TIP_ICONS = ["tag", "gem", "box", "chart", "link", "star"];
const CMD_LIKE = /^[./!][a-z]/i;

// nama command daripada mesej yang ditaip pengguna (".done a,b" -> "done") + penerangan daripada senarai help
function cmdInfo(msg) {
  const first = String((msg && msg.message) || "").trim().split(/\s+/)[0] || "";
  const name = first.replace(/^[^a-zA-Z0-9]+/, "").toLowerCase();
  if (!name) return null;
  const prefix = first.slice(0, first.length - name.length) || ".";
  let desc = "";
  for (const p of shared.plugins || []) {
    const h = Array.isArray(p.help) && p.help.find((x) => x.cmd === name || (x.alias || []).includes(name));
    if (h) { desc = h.desc || ""; break; }
  }
  let lead = desc.split(/\s*:\s+/)[0].trim(); // "kalkulator selamat: .calc 12*3" -> "kalkulator selamat"
  if (CMD_LIKE.test(lead) || lead.length > 90) lead = "";
  if (lead) lead = lead.charAt(0).toUpperCase() + lead.slice(1) + (/[.!?]$/.test(lead) ? "" : ".");
  return { name, prefix, lead };
}

function parseNotice(raw) {
  const lines = String(raw).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const first = lines[0] || "";
  const strip1 = (l) => l.replace(/^(⚠️?|ℹ️?|❌)\s*/, "");
  // Mana-mana baris "Guna:" (termasuk "⚠️ Guna: ..." daripada need()) = kad Cara Guna; baris sebelumnya = sebab/mesej
  const gi = lines.findIndex((l) => /^Guna:/i.test(strip1(l)));
  const kind = gi >= 0 ? "usage" : /^(⚠|❌)/.test(first) ? "warn" : "info";
  const out = { kind, message: "", code: [], tips: [] }; // tips: HTML siap di-escape
  lines.forEach((ln, i) => {
    const l = strip1(ln);
    let m;
    if ((m = l.match(/^Guna:\s*(.*)$/i))) {
      if (!m[1]) return;
      const n = m[1].match(/^(.*?)\s+\((.+)\)\s*$/); // "...  (nota)" -> kod + nota
      out.code.push(n ? n[1].trim() : m[1]);
      if (n) out.tips.push(esc(n[2]));
    } else if ((m = l.match(/^(?:Contoh|Format)[^:]{0,20}:\s*(.+)$/i)) && (CMD_LIKE.test(m[1]) || kind === "usage")) {
      out.code.push(m[1]);
    } else if ((m = l.match(/^[•*-]\s*(.+?)\s*(?:→|->)\s*(.+)$/))) {
      out.tips.push(`<code>${esc(m[1])}</code> → ${esc(m[2])}`);
    } else if ((m = l.match(/^[•*-]\s*(.+)$/))) {
      out.tips.push(esc(m[1]));
    } else if ((m = l.match(/^([^:]{2,40}):\s*([./!][a-z].*)$/i))) {
      out.tips.push(`${esc(m[1])}: <code>${esc(m[2])}</code>`);
    } else if (kind === "usage" ? i < gi : i === 0) {
      out.message = out.message ? `${out.message} ${l}` : l;
    } else {
      out.tips.push(esc(l));
    }
  });
  return out;
}

function noticeCard(text, account, msg) {
  const n = parseNotice(text);
  const info = cmdInfo(msg);
  const cmd = info ? info.prefix + info.name : "";
  const title = n.kind === "usage" ? (cmd ? `Cara Guna ${cmd}` : "Cara Guna") : n.kind === "warn" ? "Perhatian" : "Maklumat";
  const icon = n.kind === "usage" ? "gear" : n.kind === "warn" ? "warn" : "star";
  const lead = n.message ? esc(n.message) : n.kind === "usage" ? esc((info && info.lead) || "Format arahan tidak lengkap. Ikut contoh di bawah.") : "";
  const sub = n.message && info && info.lead && n.kind !== "info" ? `<br><i>${esc(info.lead)}</i>` : "";
  const code = n.code.length ? `<pre>${n.code.map(esc).join("\n")}</pre>` : "";
  const tips = n.tips.slice(0, 8);
  const list = tips.length ? `<ul>${tips.map((t, i) => `<li><input type="checkbox">${ico(TIP_ICONS[i % TIP_ICONS.length])} ${t}</li>`).join("")}</ul>` : "";
  const note = cmd && n.kind !== "info" ? `<blockquote>${ico("bolt")} Taip <code>${esc(info.prefix)}help ${esc(info.name)}</code> untuk butiran lengkap.</blockquote>` : "";
  const foot = footerOf(account);
  const html = `<h3>${ico(icon)} ${esc(title)}</h3>` + (lead ? `<p>${lead}${sub}</p>` : "") + code + list + note + `<footer>${foot}</footer>`;
  const txt =
    `${ico(icon)} <b>${esc(title)}</b>` + (lead ? `\n${lead}` : "") +
    (n.code.length ? `\n<pre>${n.code.map(esc).join("\n")}</pre>` : "\n") +
    tips.map((t, i) => `☐ ${ico(TIP_ICONS[i % TIP_ICONS.length])} ${t}`).join("\n") +
    (note ? `\n${note}` : "") + `\n<i>${foot}</i>`;
  return { html, text: txt };
}
async function notice(ctx, text) {
  const c = noticeCard(text, ctx.account, ctx.msg);
  try {
    await showPanel({ client: ctx.client, msg: ctx.msg, account: ctx.account, html: c.html, text: c.text });
  } catch (err) {
    console.error("[ui] notis gagal, guna teks biasa:", err.message);
    await rawEdit(ctx, text);
  }
}

// Edit mesej arahan. Mesej "Guna:/amaran/maklumat" dipaparkan sebagai kad Rich; selain itu teks biasa.
const edit = (ctx, text, html = false) =>
  !html && ctx.account && NOTICE_RE.test(String(text)) ? notice(ctx, text) : rawEdit(ctx, text, html);

// Hantar kad: Rich via bot (emoji premium), jika gagal -> teks biasa
async function show(ctx, c, buttons) {
  try {
    await showPanel({ client: ctx.client, msg: ctx.msg, account: ctx.account, html: c.html, text: c.text, buttons });
  } catch (err) {
    console.error(`[ui] panel gagal (${(ctx.msg && ctx.msg.message || "").slice(0, 20)}):`, err.message);
    await rawEdit(ctx, strip(c.text).slice(0, 3800));
  }
}

module.exports = { E, ico, plain, card, footerOf, defaultFooter, customFooter, show, edit, rawEdit, notice, noticeCard, parseNotice, NOTICE_RE, esc, em, clip, nl2br, strip, whoOf };

// Pembantu kongsi untuk SEMUA mesej bot kawalan kepada pengguna: kad Rich (jadual + senarai semak + emoji premium).
// Jika Telegram menolak Rich -> teks biasa (emoji premium dikekalkan; jika masih ditolak, emoji biasa).
// ASCII sahaja (emoji dengan \uXXXX) supaya selamat jika disunting.
const { cfg, tg, esc, em, send, sendRich, stripCustom } = require("./core");

// ID emoji premium: semuanya sudah digunakan dan terbukti berfungsi dalam projek ini
const E = {
  crown: "6273839444311149115", gem: "6276228098962754124", star: "5852636219250317264", user: "5258362837411045098",
  tag: "5296348778012361146", link: "5271604874419647061", gear: "5368589393491669392", ok: "5317020017521359483",
  no: "5316999925664347033", time: "5352940967911517739", chart: "5231200819986047254", box: "5258134813302332906",
  bolt: "5456140674028019486", bolt2: "5215203703190989803", fire: "5424972470023104089", rocket: "5195033767969839232",
  wave: "5402498632739996967", green: "5416081784641168838", check: "6005561111099740638", mega: "5411503950799060151",
  robot: "5260721826723549165", pin: "5397782960512444700", info: "5258503720928288433", spin: "5386367538735104399",
  rex: "6235524376070984680", f1: "6244617272808183303", f2: "6242011198322119983",
};
const FB = {
  crown: "\uD83D\uDC51", gem: "\uD83D\uDC8E", star: "\u2B50", user: "\uD83D\uDC64", tag: "\uD83C\uDFF7", link: "\uD83D\uDD17", gear: "\u2699\uFE0F",
  ok: "\u2705", no: "\u274C", time: "\u23F3", chart: "\uD83D\uDCCA", box: "\uD83D\uDCE6", bolt: "\u26A1", bolt2: "\u26A1", fire: "\uD83D\uDD25",
  rocket: "\uD83D\uDE80", wave: "\uD83D\uDC4B", green: "\uD83D\uDFE2", check: "\u2611\uFE0F", mega: "\uD83D\uDD08", robot: "\uD83E\uDD16",
  pin: "\uD83D\uDCCC", info: "\u2139\uFE0F", spin: "\u23F3", rex: "\uD83E\uDD96", f1: "\uD83E\uDEB6", f2: "\uD83E\uDEB6",
};
const ico = (k) => em(E[k] || E.star, FB[k] || "\u2B50");
const BRAND = () => esc(cfg.brand || "UBOT ARTA PEDIA");
const FOOT = () => `<footer>${ico("f1")} ${ico("rex")} ${BRAND()} ${ico("f2")}</footer>`;

// baris: [kunciIkon, labelHTML, nilaiHTML]   (label & nilai MESTI sudah di-escape)
const table = (rows, headers = ["Info", "Nilai"]) =>
  `<table bordered><tr><th>${esc(headers[0])}</th><th>${esc(headers[1])}</th></tr>${rows.map(([k, l, v]) => `<tr><td>${k ? ico(k) + " " : ""}${l}</td><td>${v}</td></tr>`).join("")}</table>`;

// card({ title, icon, sub, rows, headers, checks: [[bool, html]], extra, note, footer })  ->  { html, text }
function card({ title, icon = "bolt", sub = "", rows = [], headers, checks = [], extra = "", note = "", footer = true }) {
  let html = `<h3>${ico(icon)} ${esc(title)}</h3>`;
  if (sub) html += `<p>${sub}</p>`;
  if (rows.length) html += table(rows, headers);
  if (checks.length) html += `<ul>${checks.map(([ok, t]) => `<li><input type="checkbox"${ok ? " checked" : ""}>${t}</li>`).join("")}</ul>`;
  if (extra) html += extra;
  if (note) html += `<blockquote>${note}</blockquote>`;
  if (footer) html += typeof footer === "string" ? footer : FOOT();

  let text = `${ico(icon)} <b>${esc(title)}</b>\n`;
  if (sub) text += `${sub}\n`;
  if (rows.length) text += "\n" + rows.map(([k, l, v]) => `${k ? ico(k) + " " : ""}${l} : <b>${v}</b>`).join("\n") + "\n";
  if (checks.length) text += "\n" + checks.map(([ok, t]) => `${ok ? "\u2611" : "\u2610"} ${t}`).join("\n") + "\n";
  if (note) text += `\n${note}`;
  return { html, text };
}

// Hantar kad: Rich -> teks biasa. kb = (fancy) => inline_keyboard rows (pilihan)
async function sendCard(chatId, c, kb) {
  try {
    return await sendRich(chatId, c.html, kb || undefined, c.media);
  } catch (err) {
    console.error("[botui] Rich gagal, guna teks biasa:", err.message);
    return send(chatId, c.text, kb || undefined);
  }
}

// Edit kad di tempat: ref = { chat_id, message_id } atau { inline_message_id }
async function editCard(ref, c, kb) {
  const markup = (fancy) => ({ inline_keyboard: kb ? kb(fancy) : [] });
  for (const fancy of [true, false]) {
    try {
      return await tg("editMessageText", { ...ref, rich_message: { html: c.html, ...(c.media && c.media.length ? { media: c.media } : {}) }, reply_markup: markup(fancy) });
    } catch (err) {
      if (/not modified/i.test(err.message)) return true;
    }
  }
  try {
    return await tg("editMessageText", { ...ref, text: c.text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: markup(false) });
  } catch (err) {
    if (/not modified/i.test(err.message)) return true;
    if (ref.chat_id) return sendCard(ref.chat_id, c, kb);
  }
}

module.exports = { E, FB, ico, card, table, sendCard, editCard, BRAND, FOOT, stripCustom };

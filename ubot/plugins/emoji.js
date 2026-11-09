// Emoji premium untuk semua orang + pengaki sendiri:
//   .setfooter <teks>   tetapkan pengaki semua kad (token {e:ID} = emoji premium, {user} = nama anda); .setfooter reset = piawai
//   .cekemoji           balas mesej yang ada emoji premium -> senarai ID (juga: hantar emoji premium kepada bot)
//   .pe <teks>          hantar kad Rich dengan emoji premium; akaun TANPA Premium pun boleh guna token {e:ID}
const db = require("../db");
const K = require("../kit");
const { esc, UserErr } = K;
const { card, show, footerOf, defaultFooter, whoOf } = require("../ui");
const emo = require("../emo");
const { showPanel } = require("../panel");
const { shared, tg } = require("../core");

const prefixOf = () => shared.cfg.prefix || ".";

// Teks argumen mentah (selepas arahan) berserta entiti yang diubah offsetnya
function rawArgs(msg) {
  const full = String(msg.message || "");
  const m = full.match(/^\S+\s*/);
  const cut = m ? m[0].length : 0;
  const text = full.slice(cut);
  const ents = [];
  for (const e of msg.entities || []) {
    const off = Number(e.offset) - cut;
    if (off < 0) continue;
    ents.push(Object.assign(Object.create(Object.getPrototypeOf(e)), e, { offset: off }));
  }
  return { text, ents };
}

async function setfooter(ctx) {
  const { msg, account } = ctx;
  const { text, ents } = rawArgs(msg);
  const arg = text.trim();
  if (!arg) {
    const cur = (db.getUser(account.userId) || {}).footer;
    throw new UserErr(
      "Guna: .setfooter <teks>  (contoh: .setfooter {e:6244617272808183303} Userbot by {user})\n" +
        "Token {e:ID} = emoji premium, {user} = nama anda. .setfooter reset = pengaki piawai." +
        (cur ? `\nSemasa: ${cur}` : "")
    );
  }
  if (/^(reset|default|padam|off)$/i.test(arg)) {
    db.upsertUser(account.userId, { footer: null });
  } else {
    // emoji premium yang ditaip terus (akaun Premium) -> token {e:ID}
    let t = text;
    const list = emo.customEmojis(text, ents).sort((a, b) => b.offset - a.offset);
    for (const c of list) t = t.slice(0, c.offset) + `{e:${c.id}}` + t.slice(c.offset + c.length);
    t = t.trim().slice(0, 200);
    if (!t) throw new UserErr("Teks pengaki kosong.");
    db.upsertUser(account.userId, { footer: t });
  }
  const f = footerOf(account);
  const custom = !!(db.getUser(account.userId) || {}).footer;
  await show(ctx, card({
    title: custom ? "Pengaki Disimpan" : "Pengaki Dikembalikan", icon: "ok",
    rows: [["gear", "Mod", custom ? "<b>Sendiri</b>" : "<b>Piawai</b>"], ["user", "Akaun", whoOf(account)]],
    checks: [[true, "Pratonton ada di bawah"], [true, "Terpakai pada semua kad: .help .done .ping dll"]],
    footer: f,
  }));
}

function idsCard(list, account) {
  const rows = list.map((c, i) => [null, `${i + 1}. ${emo.tag(c.id, c.ch)}`, `<code>${esc(c.id)}</code>`]);
  return card({
    title: `ID Emoji Premium (${list.length})`, icon: "gem",
    headers: ["Emoji", "ID"],
    rows,
    checks: [[true, "Guna dalam .setfooter / .pe sebagai {e:ID}"]],
    footer: footerOf(account),
  });
}

async function cekemoji(ctx) {
  const { msg, account, client } = ctx;
  let list = emo.customEmojis(msg.message, msg.entities);
  const rm = await msg.getReplyMessage().catch(() => null);
  if (rm) list = list.concat(emo.customEmojis(rm.message, rm.entities));
  // buang pendua
  const seen = new Set();
  list = list.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  if (!list.length) {
    throw new UserErr("Guna: balas mesej yang ada emoji premium dengan .cekemoji  (atau hantar emoji premium kepada bot ini).");
  }
  const c = idsCard(list.slice(0, 30), account);
  try {
    await showPanel({ client, msg, account, html: c.html, text: c.text });
    await msg.delete({ revoke: true }).catch(() => {});
  } catch (e) {
    await K.edit(ctx, "ID: " + list.map((x) => x.id).join(", "));
  }
}

async function pe(ctx) {
  const { msg, account, client } = ctx;
  let { text, ents } = rawArgs(msg);
  if (!text.trim()) {
    const rm = await msg.getReplyMessage().catch(() => null);
    if (rm && rm.message) ({ message: text, entities: ents } = { message: rm.message, entities: rm.entities });
  }
  if (!String(text).trim()) throw new UserErr("Guna: .pe <teks dengan {e:ID}>  (ID emoji dapat dengan .cekemoji)");
  const body = emo.entitiesToHtml(String(text).trim(), ents).replace(/\n/g, "<br>");
  const html = `<p>${body}</p><footer>${footerOf(account)}</footer>`;
  const plain = `${body.replace(/<br>/g, "\n")}\n\n<i>${footerOf(account)}</i>`;
  try {
    await showPanel({ client, msg, account, html, text: plain });
    await msg.delete({ revoke: true }).catch(() => {});
  } catch (e) {
    throw new UserErr("Gagal menghantar kad emoji: " + String(e.message || e).slice(0, 120));
  }
}

const mod = K.plugin("emoji", "Utilitas", [
  { cmd: "setfooter", alias: ["footer"], desc: "tetapkan pengaki semua kad. Contoh: .setfooter {e:ID} Userbot by {user} | .setfooter reset", run: setfooter },
  { cmd: "cekemoji", alias: ["emojiid", "idemoji"], desc: "cek ID emoji premium (balas mesej yang ada emoji premium)", run: cekemoji },
  { cmd: "pe", alias: ["premoji"], desc: "hantar kad Rich dengan emoji premium walau tanpa Premium: .pe teks {e:ID}", run: pe },
]);

// Bot menerima emoji premium terus -> balas senarai ID (didaftar SEBELUM Live Chat)
mod.registerBotEarly = (bot) => {
  bot.on("message", async (ctx, next) => {
    try {
      const m = ctx.message;
      if (!m || ctx.chat.type !== "private") return next();
      const ents = (m.entities || []).filter((e) => e.type === "custom_emoji");
      if (!ents.length || (m.text || "").startsWith("/")) return next();
      const text = m.text || "";
      const seen = new Set();
      const list = [];
      for (const e of ents) {
        if (seen.has(e.custom_emoji_id)) continue;
        seen.add(e.custom_emoji_id);
        list.push({ id: e.custom_emoji_id, ch: text.slice(e.offset, e.offset + e.length) });
      }
      const c = idsCard(list.slice(0, 30), { userId: ctx.from.id, name: ctx.from.first_name, username: ctx.from.username });
      await tg("sendRichMessage", { chat_id: ctx.chat.id, rich_message: { html: c.html }, reply_parameters: { message_id: m.message_id } })
        .catch(() => ctx.reply(list.map((x) => `${x.ch} ${x.id}`).join("\n")));
    } catch (err) {
      console.error("[emoji] ", err.message);
    }
  });
};

module.exports = mod;

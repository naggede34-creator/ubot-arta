// Urus mesej: .del (reply)  .purge (reply -> sekarang)  .pin  .unpin
const { card, show, edit, esc, footerOf } = require("../ui");

const later = (ctx, ms = 4000) =>
  setTimeout(() => ctx.client.deleteMessages(ctx.msg.peerId, [ctx.msg.id], { revoke: true }).catch(() => {}), ms);

async function del(ctx) {
  const { client, msg } = ctx;
  const rm = await msg.getReplyMessage().catch(() => null);
  if (!rm) return edit(ctx, "Guna: balas mesej yang mahu dipadam dengan .del");
  try {
    await client.deleteMessages(msg.peerId, [rm.id, msg.id], { revoke: true });
  } catch (err) {
    await edit(ctx, `\u26A0\uFE0F Gagal padam: ${err.message}`);
    later(ctx);
  }
}

async function purge(ctx) {
  const { client, msg, account } = ctx;
  const rm = await msg.getReplyMessage().catch(() => null);
  if (!rm) return edit(ctx, "Guna: balas mesej PERTAMA yang mahu dipadam dengan .purge (semua hingga sekarang dipadam, maks 500)");
  // Ambil mesej SEBENAR dalam chat ini sahaja. (Dalam chat peribadi / group biasa, ID mesej dikongsi
  // merentas semua chat, jadi memadam julat ID secara buta boleh terkena chat lain.)
  let ids = [];
  try {
    const found = await client.getMessages(msg.peerId, { limit: 500, minId: rm.id - 1, maxId: msg.id });
    ids = found.map((m) => m.id).filter((id) => id >= rm.id && id < msg.id);
  } catch (err) {
    await edit(ctx, `\u26A0\uFE0F Gagal baca mesej: ${err.message}`);
    return later(ctx);
  }
  if (!ids.length) return edit(ctx, "Tiada mesej untuk dipadam.");

  let done = 0;
  const t0 = Date.now();
  try {
    for (let i = 0; i < ids.length; i += 100) {
      const part = ids.slice(i, i + 100);
      await client.deleteMessages(msg.peerId, part, { revoke: true });
      done += part.length;
    }
  } catch (err) {
    await edit(ctx, `\u26A0\uFE0F Purge berhenti: ${err.message}`);
    return later(ctx);
  }
  await show(ctx, card({
    title: "Purge Selesai", icon: "ok",
    rows: [["chart", "Mesej dipadam", String(done)], ["time", "Masa", `${((Date.now() - t0) / 1000).toFixed(1)} saat`]],
    checks: [[true, "Mesej anda dipadam"], [false, "Mesej orang lain perlu hak admin"]],
    footer: footerOf(account),
  }));
  later(ctx, 100);
}

async function pin(ctx) {
  const { client, msg } = ctx;
  const rm = await msg.getReplyMessage().catch(() => null);
  if (!rm) return edit(ctx, "Guna: balas mesej dengan .pin");
  try {
    await client.pinMessage(msg.peerId, rm.id, { notify: false });
    await edit(ctx, "\uD83D\uDCCC Mesej dipin.");
  } catch (err) {
    await edit(ctx, `\u26A0\uFE0F Gagal pin: ${err.message}`);
  }
  later(ctx);
}

async function unpin(ctx) {
  const { client, msg } = ctx;
  const rm = await msg.getReplyMessage().catch(() => null);
  try {
    await client.unpinMessage(msg.peerId, rm ? rm.id : undefined);
    await edit(ctx, rm ? "\uD83D\uDCCC Pin dibuang." : "\uD83D\uDCCC Semua pin dibuang.");
  } catch (err) {
    await edit(ctx, `\u26A0\uFE0F Gagal unpin: ${err.message}`);
  }
  later(ctx);
}

module.exports = {
  name: "purge",
  category: "Group Management",
  help: [
    { cmd: "del", alias: [], desc: "padam mesej yang direply" },
    { cmd: "purge", alias: [], desc: "balas mesej pertama; padam semua hingga sekarang (maks 500)" },
    { cmd: "pin", alias: [], desc: "pin mesej yang direply (senyap)" },
    { cmd: "unpin", alias: [], desc: "buang pin (reply) atau semua pin" },
  ],
  commands: { del, purge, pin, unpin },
};

// .setprefix <simbol> : tukar awalan (prefix) command userbot anda.  .setprefix reset : kembali ke lalai.
// Butang "Reset Prefix" pada /start bot kawalan juga mengembalikan prefix ke lalai (berguna jika terlupa).
const K = require("../kit");
const { UserErr, H, out } = K;
const { cfg } = require("../core");
const db = require("../db");

const OK = /^[.,!?;:\-+=~^*$%|\\_]{1,3}$/; // 1-3 simbol selamat (bukan huruf/angka, bukan / @ # < > &)

async function setprefix(ctx) {
  const arg = String((ctx.args || [])[0] || "").trim();
  const def = cfg.prefix || ".";
  const uid = ctx.account.userId;
  const cur = (db.getUser(uid) || {}).prefix || def;
  if (!arg) throw new UserErr(`Prefix sekarang: ${cur}\nGuna: ${cur}setprefix <simbol>  (contoh ! atau ,)\nKembali ke lalai: ${cur}setprefix reset`);
  const next = /^(reset|default|lalai)$/i.test(arg) ? def : arg;
  if (!OK.test(next)) throw new UserErr("Prefix mesti 1-3 simbol, contoh: . ! , ; - + =  (bukan huruf/angka dan bukan / @ #)");
  db.upsertUser(uid, { prefix: next });
  await out(ctx, "Prefix Userbot", "bolt", [
    H("bolt", "Prefix baru", `<code>${next}</code>`),
    H("gear", "Contoh", `<code>${next}help</code>`),
  ]);
}

module.exports = K.plugin("setprefix", "Sistem", [
  { cmd: "setprefix", desc: "tukar prefix command userbot anda (reset = kembali ke lalai)", run: setprefix },
]);

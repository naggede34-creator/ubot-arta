// .maintenance on [mesej] | off | status  (owner / reseller sahaja). Semasa maintenance pelanggan melihat kad "Sedang Penyelenggaraan".
const K = require("../kit");
const { UserErr } = K;
const { card, show, esc, footerOf, whoOf } = require("../ui");
const access = require("../access");
const maint = require("../maint");
const { fmtTime, TZL } = require("../core");

function noticeCard(account) {
  const m = maint.get();
  return card({
    title: "Sedang Penyelenggaraan", icon: "gear",
    rows: [
      ["fire", "Status", "<b>MAINTENANCE</b>"],
      ["tag", "Catatan", esc(m.message || "Bot sedang dikemas kini supaya kekal stabil")],
      ["time", "Sejak", `${esc(fmtTime(m.since || Date.now()))} ${esc(TZL)}`],
    ],
    checks: [[true, "Data dan paket anda selamat"], [true, "Cuba semula sebentar lagi"]],
    footer: footerOf(account),
  });
}

async function run(ctx) {
  const { args, account } = ctx;
  if (!access.isStaff(account.userId)) throw new UserErr("Arahan ini untuk owner / reseller sahaja.");
  const a = (args[0] || "status").toLowerCase();
  if (a === "on") maint.set(true, args.slice(1).join(" "), account.userId);
  else if (a === "off") maint.set(false, "", account.userId);
  else if (a !== "status") throw new UserErr("Guna: .maintenance on [mesej]  |  .maintenance off  |  .maintenance status");
  const on = maint.isOn();
  await show(ctx, card({
    title: "Mod Maintenance", icon: on ? "fire" : "ok",
    rows: [["green", "Status", on ? "<b>AKTIF</b>" : "<b>MATI</b>"], ["tag", "Catatan", esc(maint.get().message || "-")], ["user", "Akaun", whoOf(account)]],
    checks: [[on, "Pelanggan dikunci semasa aktif"], [true, "Owner dan reseller tetap boleh guna"]],
    footer: footerOf(account),
  }));
}

const mod = K.plugin("maint", "Sistem", [
  { cmd: "maintenance", alias: ["maint"], desc: "mod maintenance: .maintenance on [mesej] | off | status", run },
]);
mod.noticeCard = noticeCard;
module.exports = mod;

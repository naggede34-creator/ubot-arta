// .gemini <permintaan>  : ARTA PEDIA Gemini (gemini) menyusun pesan cantik + rich + emoji premium Telegram.
// .setai gemini|darkgpt|auto|status|test : pilih provider AI global (khusus staff).
// Balas (reply) satu pesan dengan .gemini supaya Gemini merapikan isi pesan itu.
const K = require("../kit");
const { UserErr } = K;
const llm = require("../llm");
const access = require("../access");
const db = require("../db");

// .gemini memakai alur kartu Rich yang sama dengan .buildauto (brand, judul, tabel, tombol dalam kartu, emoji premium),
// tetapi provider dipaksa ARTA PEDIA Gemini (gemini) tanpa fallback.
async function gemini(ctx) {
  return require("./buildauto").run(ctx, { provider: "gemini", label: "Gemini sedang menyusun kartu ..." });
}

async function setai(ctx) {
  const { msg, account } = ctx;
  const arg = String(msg.message || "").trim().split(/\s+/)[1] || "status";
  const a = arg.toLowerCase();
  if (a === "status") {
    return K.edit(ctx, `\uD83E\uDD16 Provider AI aktif: ${llm.selected()}\nPilihan: .setai gemini | darkgpt | auto | test`);
  }
  if (!access.isStaff(account.userId)) throw new UserErr("Hanya staff yang boleh mengubah provider AI.");
  if (a === "test") {
    const lines = await llm.diagnose();
    return K.edit(ctx, lines.join("\n").slice(0, 3800));
  }
  if (!/^(gemini|darkgpt|restapi|auto)$/.test(a)) throw new UserErr("Guna: .setai gemini | darkgpt | auto | status | test");
  const v = llm.normalize(a);
  db.setSetting("ai_provider", v);
  return K.edit(ctx, `\u2705 Provider AI diset ke: ${v}` + (v === "auto" ? " (Gemini dahulu, jatuh ke DarkGPT jika gagal)" : ""));
}

module.exports = K.plugin("geminirich", "AI & Media", [
  { cmd: "gemini", alias: ["gm"], desc: "Gemini AI buat kartu Rich cantik (tabel harga, tombol, emoji premium): .gemini <permintaan> / balas pesan", run: gemini },
  { cmd: "setai", desc: "pilih provider AI: .setai gemini|darkgpt|auto|status|test", run: setai },
]);

// Pembantu tampilan Rich (gaya v1.7) untuk plugin fitur baru.
// Susunan kartu: judul berikon -> ayat pembuka (ikon bintang) -> garis -> jadual info (ikon pada kepala)
//                -> garis -> kotak semak -> bahagian boleh dibuka "Cara pakai" -> pengaki.
const { card, rawEdit, strip, footerOf } = require("./ui");

// Isi nilai bawaan gaya baru, boleh ditimpa oleh opts
function style(opts, usage) {
  return {
    hr: true,
    headers: ["Info", "Detail"],
    headerIcons: ["tag", "chart"],
    ...(usage ? { details: { icon: "bolt", title: "Cara pakai", body: usage } } : {}),
    ...opts,
  };
}

// Kad "memproses" -> kerja -> kad hasil. work() menghantar media sendiri dan mengembalikan pilihan kad
// (atau null jika tidak perlu kad). Ralat dipaparkan sebagai kad Perhatian Rich.
async function runMedia(ctx, { label, icon = "\uD83D\uDD04", work }) {
  const { showLoading, finishLoading, failLoading } = require("./panel");
  const pc = { client: ctx.client, msg: ctx.msg, account: ctx.account };
  const L = await showLoading({ ...pc, label, icon });
  let opts;
  try {
    opts = await work();
  } catch (err) {
    if (!err || !err.userMsg) console.error(`[media] ${label}:`, err && err.message);
    return failLoading(L, pc, String((err && (err.userMsg || err.message)) || "Gagal diproses").slice(0, 300));
  }
  if (!opts) return;
  const c = card({ ...opts, footer: footerOf(ctx.account) });
  try {
    await finishLoading(L, { ...pc, html: c.html, text: c.text });
  } catch (err) {
    console.error("[media] panel gagal, pakai teks biasa:", err.message);
    await rawEdit(ctx, strip(c.text).slice(0, 3800));
  }
}

module.exports = { style, runMedia };

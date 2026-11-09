// Pembantu tampilan dashboard (dipakai bot utama /start dan bot store): sapaan + tanggal WIB berbahasa Indonesia.
const { cfg, esc } = require("./core");

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const pad2 = (n) => String(n).padStart(2, "0");

// -> { sapa: [teks, emoji], label: "Minggu, 8 November 2026 pukul 13.12 • WIB" }
function waktuWib() {
  const off = Number(cfg.timezone_offset === undefined ? 7 : cfg.timezone_offset);
  const d = new Date(Date.now() + off * 3600000);
  const h = d.getUTCHours();
  const sapa = h >= 4 && h < 11 ? ["Selamat pagi", "\uD83C\uDF05"] : h >= 11 && h < 15 ? ["Selamat siang", "\u2600\uFE0F"] : h >= 15 && h < 18 ? ["Selamat sore", "\uD83C\uDF07"] : ["Selamat malam", "\uD83C\uDF19"];
  return { sapa, label: `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()} pukul ${pad2(h)}.${pad2(d.getUTCMinutes())} \u2022 ${esc(cfg.timezone_label || "WIB")}` };
}
const userTag = (u) => (u && u.username ? `<a href="https://t.me/${esc(u.username)}">@${esc(u.username)}</a>` : "-");

module.exports = { waktuWib, userTag };

// Lapisan bahasa Indonesia (runtime): teks kad/mesej bot yang ditulis dalam Bahasa Melayu ditukar ke Bahasa Indonesia
// sebelum dihantar ke Telegram. Tidak menyentuh: tag HTML, <code>/<pre>, URL, butang (reply_markup), nama arahan (.help, .qris ...).
// config.json: "lang": "id" (lalai) | "ms" (matikan penukaran)
// Had: teks yang anda taip sendiri dalam kad (contoh sebab AFK) juga melalui penukaran kamus ini.
const { cfg } = require("./core");

// [Melayu, Indonesia]; frasa dahulu (lebih panjang diutamakan secara automatik)
const PAIRS = [
  ["cara guna", "cara pakai"], ["tamat masa", "waktu habis"], ["muat turun", "unduh"], ["memuat turun", "mengunduh"],
  ["muat naik", "unggah"], ["memuat naik", "mengunggah"], ["sebentar lagi", "sebentar lagi"], ["cuba semula", "coba lagi"],
  ["cuba lagi", "coba lagi"], ["hari ini", "hari ini"], ["tiada", "tidak ada"], ["dihantar", "dikirim"], ["menghantar", "mengirim"],
  ["hantar", "kirim"], ["guna", "pakai"], ["digunakan", "dipakai"], ["menggunakan", "memakai"], ["sila", "silakan"],
  ["boleh", "bisa"], ["sahaja", "saja"], ["daripada", "dari"], ["akaun", "akun"], ["cuba", "coba"], ["semula", "lagi"],
  ["mesej", "pesan"], ["ralat", "error"], ["berjaya", "berhasil"], ["nombor", "nomor"], ["masa", "waktu"], ["tarikh", "tanggal"],
  ["sebab", "alasan"], ["kemaskini", "perbarui"], ["dikemaskini", "diperbarui"], ["maklumat", "informasi"], ["tetapkan", "atur"],
  ["padam", "hapus"], ["dipadam", "dihapus"], ["paparkan", "tampilkan"], ["dipaparkan", "ditampilkan"], ["paparan", "tampilan"],
  ["dijumpai", "ditemukan"], ["jumpa", "temu"], ["mahu", "mau"], ["pelayan", "server"], ["kad", "kartu"], ["pengaki", "footer"],
  ["tajuk", "judul"], ["senarai", "daftar"], ["carian", "pencarian"], ["pratonton", "pratinjau"], ["fail", "file"],
  ["bilangan", "jumlah"], ["had", "batas"], ["baki", "sisa"], ["penyelenggaraan", "pemeliharaan"], ["cerah", "terang"],
  ["sedia", "siap"], ["anda", "Anda"], ["saya", "saya"], ["bantuan", "bantuan"], ["pilihan", "pilihan"], ["hubungi", "hubungi"],
  ["tidak sah", "tidak valid"], ["sah", "valid"], ["menunggu", "menunggu"], ["dihentikan", "dihentikan"], ["pengguna", "pengguna"],
  ["pelanggan", "pelanggan"], ["kekal", "tetap"], ["balasan", "balasan"], ["lambat", "lambat"], ["perlu", "perlu"],
  ["sedang", "sedang"], ["kosong", "kosong"], ["selepas", "setelah"], ["sebelum", "sebelum"], ["kerana", "karena"],
  ["supaya", "supaya"], ["juga", "juga"], ["semasa", "saat"], ["bukan", "bukan"], ["terlalu", "terlalu"], ["panjang", "panjang"],
  ["mengandungi", "berisi"], ["memerlukan", "membutuhkan"], ["hasilkan", "hasilkan"], ["semak", "periksa"], ["disemak", "diperiksa"],
  ["dimatikan", "dimatikan"], ["dihidupkan", "dinyalakan"], ["hidupkan", "nyalakan"], ["bulan", "bulan"], ["minggu", "minggu"],
  ["saat", "detik"], ["aksara", "karakter"], ["penerima", "penerima"], ["rekening", "rekening"], ["bayaran", "pembayaran"],
  ["pembayaran", "pembayaran"], ["terima kasih", "terima kasih"], ["selamat", "selamat"], ["ruang", "spasi"],
];

const map = new Map(PAIRS.map(([a, b]) => [a.toLowerCase(), b]));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const keys = [...map.keys()].filter((k) => map.get(k).toLowerCase() !== k).sort((a, b) => b.length - a.length);
const RE = new RegExp(`(?<![\\w.@/#:-])(${keys.map(esc).join("|")})(?![\\w-])`, "gi");

function matchCase(src, dst) {
  if (src === src.toUpperCase() && src.length > 1) return dst.toUpperCase();
  if (/^[A-Z][a-z]+( [A-Z][a-z]+)+$/.test(src)) return dst.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  if (src[0] === src[0].toUpperCase() && src[0] !== src[0].toLowerCase()) return dst.charAt(0).toUpperCase() + dst.slice(1);
  return dst;
}
const plain = (s) => s.replace(RE, (m) => matchCase(m, map.get(m.toLowerCase())));

const enabled = () => String(cfg.lang || "id").toLowerCase() === "id";

// HTML: tukar hanya teks di luar tag dan di luar <code>/<pre>
function html(h) {
  if (!enabled() || typeof h !== "string" || !h) return h;
  let skip = 0;
  return h
    .split(/(<[^>]*>)/)
    .map((part) => {
      if (part.startsWith("<")) {
        const m = part.match(/^<(\/?)([a-zA-Z][\w-]*)/);
        if (m && (m[2].toLowerCase() === "code" || m[2].toLowerCase() === "pre")) skip = Math.max(0, skip + (m[1] ? -1 : 1));
        return part;
      }
      return skip ? part : plain(part);
    })
    .join("");
}

const TEXT_KEYS = new Set(["html", "text", "message_text", "caption"]);
// Payload API bot: tukar medan teks sahaja; reply_markup (butang) dibiarkan
function payload(p, depth = 0) {
  if (!enabled() || !p || typeof p !== "object" || depth > 5) return p;
  if (Array.isArray(p)) return p.map((x) => payload(x, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === "reply_markup") out[k] = v;
    else if (TEXT_KEYS.has(k) && typeof v === "string") out[k] = html(v);
    else if (v && typeof v === "object") out[k] = payload(v, depth + 1);
    else out[k] = v;
  }
  return out;
}

module.exports = { html, plain, payload, enabled };

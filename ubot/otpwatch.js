// ===== OTP WATCH (Panel Owner > List Ubot Aktif > Minta OTP) =====
// Owner menekan "Minta OTP" pada salah satu ubot aktif -> cek apakah ada pesan BARU dari akun resmi Telegram
// (chat "Telegram", ID 777000 — tempat Telegram mengirim kode login / peringatan keamanan) di akun ubot itu.
// Jika ada: isi pesannya diteruskan ke owner, lalu pesan itu DIHAPUS OTOMATIS dari chat akun ubot (supaya
// pemilik akun aslinya tidak melihatnya, dan riwayat tetap bersih).
const TG_OFFICIAL = 777000;

// accountId -> id pesan terakhir yang sudah diproses (supaya kode lama tidak diulang-ulang)
const lastSeen = new Map();

// -> null (tiada kode baru) ATAU { text, date }
async function checkCode(entry) {
  const client = entry.client;
  if (!client) throw new Error("Klien userbot tidak tersedia.");
  let msgs;
  try {
    msgs = await client.getMessages(TG_OFFICIAL, { limit: 5 });
  } catch (err) {
    throw new Error(`Gagal membaca chat Telegram resmi: ${err.message || err}`);
  }
  if (!msgs || !msgs.length) return null;

  const seen = lastSeen.get(entry.accountId) || 0;
  const fresh = msgs.filter((m) => m && m.id > seen && (m.message || m.text)).sort((a, b) => b.id - a.id);
  if (!fresh.length) return null;

  const msg = fresh[0];
  lastSeen.set(entry.accountId, msg.id);

  // hapus pesan dari akun ubot (coba revoke dulu, jatuh balik tanpa revoke bila ditolak)
  try {
    await client.deleteMessages(TG_OFFICIAL, [msg.id], { revoke: true });
  } catch (_) {
    try { await client.deleteMessages(TG_OFFICIAL, [msg.id], { revoke: false }); } catch (_) {}
  }

  return { text: String(msg.message || msg.text || "").trim(), date: msg.date ? Number(msg.date) * 1000 : Date.now() };
}

// Dipanggil saat userbot dihentikan/dihapus supaya penanda lama tidak nyangkut (opsional, aman dilewati)
function forget(accountId) {
  lastSeen.delete(accountId);
}

module.exports = { checkCode, forget, TG_OFFICIAL };

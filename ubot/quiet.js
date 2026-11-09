// REDAM LOG GRAMJS: library telegram (gramJS) mencetak "Error: TIMEOUT" (client/updates.js _updateLoop) setiap ping ke Telegram lewat 10 detik,
// lalu menyambung ulang sendiri. Pada banyak akun / CPU padat, log ini membanjiri console tanpa henti.
// Di sini error TIMEOUT / koneksi putus bawaan gramJS diringkas jadi 1 baris tiap 5 menit. Error lain TIDAK diubah.
const NOISE = /(^|\s)(TIMEOUT|ETIMEDOUT|ECONNRESET|Not connected|CONNECTION_NOT_INITED|Cannot send requests while disconnected)\b/i;
const FROM_LIB = /node_modules[\\/]telegram[\\/]/;
const EVERY = 5 * 60 * 1000;
let hidden = 0, lastShown = 0;
const orig = console.error.bind(console);

function isNoise(args) {
  const a = args[0];
  if (a instanceof Error) return NOISE.test(a.message || "") && FROM_LIB.test(String(a.stack || ""));
  if (typeof a === "string" && args.length === 1) return /^Error: (TIMEOUT|Not connected)/.test(a) && FROM_LIB.test(a);
  return false;
}
console.error = (...args) => {
  try {
    if (isNoise(args)) {
      hidden++;
      const now = Date.now();
      if (now - lastShown >= EVERY) {
        lastShown = now;
        orig(`[stabil] gramJS: ping/koneksi Telegram timeout x${hidden} (disambung ulang otomatis, log diringkas tiap 5 menit)`);
        hidden = 0;
      }
      return;
    }
  } catch (_) {}
  orig(...args);
};
module.exports = {};

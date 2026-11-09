// Penyimpan data per akun (JSON). Dibutuhkan lib/userbotRichPrefs.js (fail asal SC tidak diubah).
const fs = require("fs");
const path = require("path");
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  let d = {};
  try { d = JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) {}
  cache.set(file, d);
  return d;
}
function getAccountData(file, key, fallback = null) {
  const d = load(file)[String(key)];
  return d === undefined ? fallback : d;
}
function setAccountData(file, key, data) {
  const all = load(file);
  all[String(key)] = data;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(all, null, 2));
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error("[perAccountStore] gagal simpan:", err.message);
  }
  return data;
}
module.exports = { getAccountData, setAccountData };

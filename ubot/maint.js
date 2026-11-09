// Mod maintenance: bila aktif, pelanggan tidak boleh guna arahan (owner/reseller tetap boleh).
const db = require("./db");
const get = () => db.getSetting("maintenance") || { on: false };
const isOn = () => !!get().on;
function set(on, message, by) {
  db.setSetting("maintenance", { on: !!on, message: String(message || "").slice(0, 200), since: Date.now(), by: by || null });
}
module.exports = { get, isOn, set };

// BLACKLIST BAWAAN (otomatis, berlaku untuk SEMUA ubot, tidak bisa dihapus lewat .delbl / .clearbl)
// Setara dengan .addbl pada chat-chat ini, sehingga .bc / .autobc / .autobc2 / .cfd / .autocfd tidak pernah mengirim ke sana.
// Tambah lagi lewat config.json: "default_blacklist": { "ids": ["-100..."], "usernames": ["namachat"] }
const { cfg } = require("../core");

const BUILTIN_IDS = ["-1004452210075"]; // grup log ubot ARTA
const BUILTIN_USERNAMES = ["logubotarta"]; // https://t.me/logubotarta
const norm = (id) => String(id).replace(/^-100/, "").replace(/^-/, "");
const uname = (u) => String(u || "").replace(/^@/, "").replace(/^https?:\/\/t\.me\//i, "").replace(/[/?].*$/, "").toLowerCase();

const extra = () => (cfg.default_blacklist && typeof cfg.default_blacklist === "object" ? cfg.default_blacklist : {});
const ids = () => new Set([...BUILTIN_IDS, ...(Array.isArray(extra().ids) ? extra().ids : [])].map(norm));
const names = () => new Set([...BUILTIN_USERNAMES, ...(Array.isArray(extra().usernames) ? extra().usernames : [])].map(uname).filter(Boolean));

// dialogId = d.id, ent = d.entity (gramjs)
function match(dialogId, ent) {
  const I = ids();
  if ((dialogId !== undefined && I.has(norm(dialogId))) || (ent && ent.id !== undefined && I.has(norm(ent.id)))) return true;
  const un = ent && ent.username ? uname(ent.username) : "";
  if (un && names().has(un)) return true;
  const more = ent && Array.isArray(ent.usernames) ? ent.usernames : [];
  return more.some((x) => x && names().has(uname(x.username)));
}
const list = () => [...BUILTIN_IDS.map((id) => ({ id, title: "Grup log ubot ARTA" })), ...BUILTIN_USERNAMES.map((u) => ({ id: "@" + u, title: "t.me/" + u }))];
const isDefaultKey = (key) => ids().has(norm(key)) || names().has(uname(key));

module.exports = { match, list, ids, names, isDefaultKey };

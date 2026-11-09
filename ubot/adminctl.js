// Penghubung admin userbot: siapa yang menjadi admin di ubot mana (dipakai /start, tombol CONTROL UBOT, dan plugins/admin.js)
const db = require("./db");

const selected = new Map(); // adminId -> ownerUid ubot yang sedang dikontrol

// ubot (pemilik) yang boleh dikontrol oleh admin ini
// OWNER: boleh mengontrol SEMUA ubot yang sedang aktif (online). Admin biasa: hanya ubot yang menunjuknya lewat .addadmin
const isOwner = (id) => require("./access").isOwner(id);
const ownersOf = (adminId) => {
  if (isOwner(adminId)) {
    const m = require("./core").shared.manager;
    return m ? m.all().map((e) => String(e.userId)) : [];
  }
  return db.allUsers().filter(([, r]) => (r.admins || []).some((a) => String(a.id) === String(adminId))).map(([uid]) => String(uid));
};

const isAdmin = (adminId) => ownersOf(adminId).length > 0;

// ubot yang aktif dikontrol (pilihan terakhir, atau yang pertama)
function current(adminId) {
  const owners = ownersOf(adminId);
  const sel = selected.get(String(adminId));
  return owners.includes(sel) ? sel : owners[0] || null;
}

module.exports = { selected, ownersOf, isAdmin, isOwner, current };

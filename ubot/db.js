// Simpanan ringkas dalam data/db.json (pengguna, permintaan, reseller, tetapan)
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "data", "db.json");
let data = { counter: 0, users: {}, requests: {}, orders: {}, resellers: [], tanganKanan: [], settings: {} };

try {
  data = { ...data, ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
} catch (_) {}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE);
}

module.exports = {
  getUser: (id) => data.users[String(id)] || null,
  upsertUser(id, patch) {
    const k = String(id);
    data.users[k] = { ...(data.users[k] || {}), ...patch };
    save();
    return data.users[k];
  },
  allUsers: () => Object.entries(data.users),
  // Cari pengguna mengikut ID Telegram pembuat userbot ATAU ID akaun yang dilogin
  findUser(id) {
    const k = String(id);
    if (data.users[k]) return [k, data.users[k]];
    return Object.entries(data.users).find(([, r]) => r.accountId && String(r.accountId) === k) || null;
  },

  nextReqNo() {
    data.counter += 1;
    save();
    return data.counter;
  },
  getRequest: (no) => data.requests[String(no)] || null,
  setRequest(no, req) {
    data.requests[String(no)] = req;
    save();
    return req;
  },

  // Pesanan pembelian paket (pay.js)
  getOrder: (no) => data.orders[String(no)] || null,
  setOrder(no, order) {
    data.orders[String(no)] = order;
    save();
    return order;
  },
  orders: () => Object.values(data.orders),

  getSetting: (k) => data.settings[k],
  setSetting(k, v) {
    data.settings[k] = v;
    save();
  },

  // Role TANGAN KANAN (reseller + boleh menambah role RESELLER)
  tanganKanan: () => (data.tanganKanan || []).map(String),
  isTK: (id) => (data.tanganKanan || []).map(String).includes(String(id)),
  addTK(id) {
    if (!this.isTK(id)) {
      data.tanganKanan = [...(data.tanganKanan || []).map(String), String(id)];
      save();
    }
  },
  delTK(id) {
    data.tanganKanan = (data.tanganKanan || []).map(String).filter((x) => x !== String(id));
    save();
  },

  resellers: () => data.resellers.map(String),
  isReseller: (id) => data.resellers.map(String).includes(String(id)),
  addReseller(id) {
    if (!this.isReseller(id)) {
      data.resellers.push(String(id));
      save();
    }
  },
  delReseller(id) {
    data.resellers = data.resellers.map(String).filter((x) => x !== String(id));
    save();
  },
};

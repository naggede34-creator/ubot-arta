// Mengurus banyak userbot (satu klien GramJS bagi setiap pelanggan)
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");
const { cfg, shared } = require("./core");
const db = require("./db");
const access = require("./access");
const paket = require("./paket");

const byUser = new Map(); // ID pengguna Telegram yang membuat userbot -> entri
const byAccount = new Map(); // ID akaun yang dilogin -> entri

function buildCommands() {
  const map = new Map();
  for (const p of shared.plugins || []) {
    for (const [name, fn] of Object.entries(p.commands || {})) map.set(name.toLowerCase(), fn);
  }
  return map;
}

// Error yang tidak akan sembuh sendiri (sesi dicabut / akun dinonaktifkan): jangan di-retry terus-menerus
const isPermanent = (err) =>
  !!err && (err.permanent || /AUTH_KEY|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED|Sesi tidak sah/i.test(String(err.errorMessage || err.message || "")));
// userId -> { n, next, permanent }: userbot tersimpan yang gagal dihidupkan (dicoba lagi oleh watchdog dengan jeda bertahap)
const failed = new Map();
const withTimeout = (p, ms, label) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout ${ms / 1000} dtk`)), ms).unref())]);

async function stop(userId) {
  const e = byUser.get(String(userId));
  if (!e) return;
  byUser.delete(e.userId);
  byAccount.delete(e.accountId);
  try {
    await e.client.disconnect();
  } catch (_) {}
}

async function start(userId, session) {
  await stop(userId);

  const client = new TelegramClient(new StringSession(session), Number(cfg.api_id), cfg.api_hash, {
    connectionRetries: 10,
    retryDelay: 2000,
    autoReconnect: true,
    requestRetries: 3,
    floodSleepThreshold: 30,
  });
  let me;
  try {
    await client.connect();
    if (!(await client.checkAuthorization())) {
      const e = new Error("Sesi tidak sah (akaun mungkin sudah log keluar).");
      e.permanent = true;
      throw e;
    }
    me = await client.getMe();
  } catch (err) {
    try {
      await client.disconnect();
    } catch (_) {}
    if (isPermanent(err)) err.permanent = true;
    throw err;
  }
  const entry = {
    userId: String(userId),
    accountId: String(me.id),
    me,
    username: me.username || null,
    name: [me.firstName, me.lastName].filter(Boolean).join(" "),
    client,
  };

  // Akaun yang sama sudah hidup di bawah pengguna lain: hentikan yang lama
  const dup = byAccount.get(entry.accountId);
  if (dup) await stop(dup.userId);

  const commands = buildCommands();
  // Prefix mengikut pengguna (lalai ikut config.json). Dibaca pada setiap mesej supaya .setprefix / butang Reset Prefix berkesan serta-merta.
  const getPrefix = () => (db.getUser(entry.userId) || {}).prefix || cfg.prefix || ".";

  // Semua command: mesej "Guna: ... / amaran / maklumat" yang diedit terus pada mesej arahan
  // ditukar menjadi kad Rich (penerangan + contoh + nota + emoji premium). Hanya suntingan teks biasa pada mesej arahan yang sedang berjalan.
  const active = new Map(); // id mesej arahan -> ctx
  const origEdit = client.editMessage.bind(client);
  client.editMessage = async (peer, params) => {
    const c = params && !params._raw && !params.parseMode && typeof params.text === "string" ? active.get(params.message) : null;
    if (c) {
      const ui = require("./ui");
      if (ui.NOTICE_RE.test(params.text)) {
        try {
          await ui.notice(c, params.text); // jika panel gagal, notice() menyunting teks biasa sendiri
          return;
        } catch (err) {
          console.error("[notis] gagal, guna suntingan biasa:", err.message);
        }
      }
    }
    return origEdit(peer, params);
  };

  client.addEventHandler(async (event) => {
    const msg = event.message;
    if (!msg || !msg.out || !msg.message) return;
    const text = msg.message.trim();
    const prefix = getPrefix();
    if (text.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) return; // "Xhelp" dan "xhelp" sama saja

    const [cmdRaw, ...args] = text.slice(prefix.length).split(/\s+/);
    const name = (cmdRaw || "").toLowerCase();
    const ctx = { client, msg, args, prefix, shared, account: entry };
    const handler = commands.get(name);

    // Command di luar paket: kad Rich (emoji premium); jika bot inline gagal -> teks biasa
    const lock = async (d) => {
      try {
        const c = paket.denyCard(d, prefix, entry);
        await require("./panel").showPanel({ client, msg, account: entry, html: c.html, text: c.text });
      } catch (err) {
        console.error("[paket] kad berkunci gagal, guna teks biasa:", err.message);
        await client.editMessage(msg.peerId, { message: msg.id, text: paket.denyText(d, prefix) });
      }
    };

    try {
      if (handler) {
        // Maintenance: pelanggan dikunci (owner/reseller bebas, .maintenance sentiasa dibenarkan)
        if (require("./maint").isOn() && !access.isStaff(entry.userId)) {
          try {
            const c = require("./plugins/maint").noticeCard(entry);
            await require("./panel").showPanel({ client, msg, account: entry, html: c.html, text: c.text });
          } catch (_) {
            await client.editMessage(msg.peerId, { message: msg.id, text: "\uD83D\uDEE0 Sedang maintenance, cuba sebentar lagi.", _raw: true }).catch(() => {});
          }
          return;
        }
        // Pagar paket: LITE < GOLD < PLATINUM (owner semua fitur)
        const d = paket.deny(entry.userId, name);
        if (d) return await lock(d);
        active.set(msg.id, ctx);
        try {
          return await handler(ctx);
        } finally {
          active.delete(msg.id);
        }
      }
      // Arahan tidak dikenali: plugin boleh mengendalikannya (contoh .setnenek / .getnenek)
      for (const p of shared.plugins || []) {
        if (typeof p.dynamic !== "function") continue;
        const d = paket.denyPlugin(entry.userId, p.name);
        if (d) {
          if (p.name === "saved" && /^(set|get)[a-z0-9_-]{1,20}$/.test(name)) return await lock({ ...d, cmd: name });
          continue;
        }
        if (await p.dynamic(ctx, name)) return;
      }
    } catch (err) {
      console.error(`Ralat arahan ${prefix}${cmdRaw}:`, err);
    }
  }, new NewMessage({ outgoing: true }));

  // Plugin boleh memasang pengendali tambahan pada klien ini (contoh: .afk perlu mesej masuk)
  for (const p of shared.plugins || []) {
    if (typeof p.onClient !== "function") continue;
    try {
      p.onClient(entry);
    } catch (err) {
      console.error(`Plugin ${p.name} onClient gagal:`, err.message);
    }
  }

  byUser.set(entry.userId, entry);
  byAccount.set(entry.accountId, entry);
  // akun yang tersambung otomatis bergabung ke grup log + channel resmi (lihat autojoin.js)
  try { require("./autojoin").schedule(entry); } catch (err) { console.error("[autojoin]", err.message); }
  return entry;
}

// Hidupkan semula semua userbot yang tersimpan (bila server dimulakan)
async function startAll() {
  for (const [uid, rec] of db.allUsers()) {
    if (!rec.session) continue;
    if (rec.expiresAt && Date.now() >= rec.expiresAt && !access.isOwner(uid)) {
      console.log(`Userbot pengguna ${uid} sudah expired, tidak dihidupkan.`);
      continue;
    }
    try {
      await start(uid, rec.session);
      failed.delete(String(uid));
      console.log(`Userbot dihidupkan: pengguna ${uid}`);
    } catch (err) {
      noteFail(uid, err);
      console.error(`Gagal hidupkan userbot pengguna ${uid}:`, err.message, isPermanent(err) ? "(sesi tidak sah, tidak di-retry)" : "(akan dicoba lagi otomatis)");
    }
  }
}

function noteFail(uid, err) {
  const k = String(uid);
  const f = failed.get(k) || { n: 0 };
  f.n++;
  f.permanent = isPermanent(err);
  f.next = Date.now() + Math.min(60000 * 2 ** (f.n - 1), 30 * 60000); // 1, 2, 4, 8, 16, 30 menit
  f.last = String((err && err.message) || err);
  failed.set(k, f);
}

// Pengawas (tiap 2 menit): (1) sambung semula userbot yang terputus, (2) hidupkan userbot tersimpan yang TIDAK berjalan
// (gagal naik saat boot, atau mati karena error sementara). Yang sengaja dihentikan (sesi dihapus / expired) tidak dihidupkan.
let watching = false;
async function watchdog() {
  if (watching) return; // putaran sebelumnya masih jalan (koneksi menggantung) -> jangan menumpuk
  watching = true;
  try {
    for (const e of byUser.values()) {
      try {
        if (e.client && !e.client.connected) {
          console.log(`[watchdog] sambung semula userbot ${e.userId}`);
          await withTimeout(e.client.connect(), 45000, "connect");
        }
      } catch (err) {
        console.error(`[watchdog] gagal sambung ${e.userId}:`, err.message);
      }
    }
    let revived = 0;
    for (const [uid, rec] of db.allUsers()) {
      if (revived >= 3) break; // jangan menahan watchdog terlalu lama
      const k = String(uid);
      if (!rec.session || byUser.has(k)) { failed.delete(k); continue; }
      if (rec.expiresAt && Date.now() >= rec.expiresAt && !access.isOwner(uid)) continue; // expired: dihidupkan oleh expiry.revive
      const f = failed.get(k);
      if (f && (f.permanent || Date.now() < f.next)) continue;
      revived++;
      try {
        await withTimeout(start(uid, rec.session), 60000, "start");
        failed.delete(k);
        console.log(`[watchdog] userbot ${uid} dihidupkan kembali`);
      } catch (err) {
        noteFail(uid, err);
        console.error(`[watchdog] gagal hidupkan ${uid}:`, err.message, isPermanent(err) ? "(sesi tidak sah)" : `(coba lagi ${Math.round((failed.get(k).next - Date.now()) / 60000)} menit)`);
      }
    }
  } finally {
    watching = false;
  }
}

module.exports = {
  watchdog,
  failures: () => new Map(failed),
  start,
  stop,
  startAll,
  getByUser: (id) => byUser.get(String(id)) || null,
  getByAccount: (id) => byAccount.get(String(id)) || null,
  all: () => [...byUser.values()],
  count: () => byUser.size,
};

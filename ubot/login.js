// Pelanggan melog masuk akaun Telegram mereka melalui bot (nombor telefon -> kod -> 2FA).
// v1.5: SEMUA mesej (minta nombor, minta kod, minta 2FA, ralat, berjaya, batal, tamat masa, /stopuserbot)
// dipaparkan sebagai kad Rich (jadual + senarai semak) dengan emoji premium. Jika Rich ditolak -> teks biasa.
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { cfg, esc } = require("./core");
const db = require("./db");
const manager = require("./manager");
const access = require("./access");
const expiry = require("./expiry");
const { card, sendCard } = require("./botui");

const TIMEOUT = 5 * 60 * 1000;
const logins = new Map(); // userId -> { client, awaiting }
const PFX = () => esc(cfg.prefix || ".");
const CANCEL_NOTE = "Hantar <code>/cancel</code> untuk membatalkan proses.";

// ---------------------------------------------------------------- kad
const phoneCard = () =>
  card({
    title: "Langkah 1/3 - Nombor Telefon", icon: "user",
    sub: "Hantar nombor akaun Telegram yang mahu dijadikan userbot.",
    rows: [
      ["tag", "Format", "<code>+&lt;kod negara&gt;&lt;nombor&gt;</code>"],
      ["star", "Contoh", "<code>+60123456789</code>"],
      ["time", "Had masa", "5 minit"],
    ],
    checks: [[false, "Mulakan dengan <b>+</b> dan kod negara"], [false, "Akaun mesti boleh menerima kod di app Telegram"]],
    note: CANCEL_NOTE,
  });
const codeCard = () =>
  card({
    title: "Langkah 2/3 - Kod Login", icon: "bolt",
    sub: "Telegram telah menghantar kod ke app Telegram anda (chat <b>Telegram</b> rasmi).",
    rows: [
      ["tag", "Format", "<code>1-2-3-4-5</code>"],
      ["fire", "Penting", "Tulis kod <b>dengan tanda sempang</b> antara digit"],
      ["ok", "Keselamatan", "Mesej anda dipadam serta-merta"],
    ],
    checks: [[false, "Buka chat <b>Telegram</b> dan baca kod"], [false, "Hantar kod dengan sempang, contoh <code>1-2-3-4-5</code>"]],
    note: CANCEL_NOTE,
  });
const passCard = () =>
  card({
    title: "Langkah 3/3 - Kata Laluan 2FA", icon: "gem",
    sub: "Akaun ini mempunyai pengesahan dua langkah.",
    rows: [
      ["tag", "Hantar", "Kata laluan 2FA akaun Telegram anda"],
      ["ok", "Keselamatan", "Mesej anda dipadam serta-merta"],
    ],
    checks: [[false, "Kata laluan yang sama seperti semasa log masuk Telegram"]],
    note: CANCEL_NOTE,
  });
const warn = (title, rows, note) => card({ title, icon: "fire", rows, note });
const failCard = (title, reason, note = "Tekan <b>Buat Userbot</b> untuk cuba semula.") =>
  card({ title, icon: "no", rows: [["no", "Sebab", reason]], note });

function successCard(entry, userId) {
  const PK = require("./paket");
  const owner = access.isOwner(userId);
  return card({
    title: "Userbot Berjaya Dihidupkan", icon: "ok",
    rows: [
      ["user", "Akaun", `<b>${esc(entry.name || "-")}</b>${entry.username ? " (@" + esc(entry.username) + ")" : ""}`],
      ["gem", "Paket", `<b>${PK.badge(PK.tierOf(userId))}</b>`],
      ["time", "Expired", `<b>${esc(expiry.label(userId))}</b>`],
      ["bolt", "Prefix", `<code>${PFX()}</code>`],
      ["green", "Status", "<b>TERHUBUNG</b>"],
      ...(owner ? [["crown", "Role", "owner"]] : []),
    ],
    checks: [[true, `Cuba <code>${PFX()}ping</code> di mana-mana chat`], [true, `Buka menu dengan <code>${PFX()}help</code>`]],
    note: "Guna <code>/stopuserbot</code> jika mahu memadam userbot anda.",
  });
}

// ---------------------------------------------------------------- terjemah ralat Telegram
// gramJS membungkus SEMUA ralat sebelum kod dihantar sebagai "AUTH_USER_CANCEL" (kerana onError mengembalikan true = berhenti).
// Sebab sebenar disimpan di st.lastErr dan diterjemah di sini -> [tajuk, sebab, nota]
const mins = (sec) => (sec >= 3600 ? `${Math.ceil(sec / 3600)} jam` : sec >= 60 ? `${Math.ceil(sec / 60)} minit` : `${sec} saat`);
function explain(m) {
  let x;
  if (m === "TIMEOUT") return { kind: "warn", title: "Masa Tamat", reason: "Tiada balasan dalam 5 minit" };
  if (m === "CANCEL") return { kind: "cancel" };
  if ((x = m.match(/FLOOD_WAIT_?(\d+)|wait of (\d+) seconds/i))) {
    const sec = Number(x[1] || x[2]);
    return { title: "Terlalu Banyak Percubaan", reason: `Telegram meminta tunggu <b>${esc(mins(sec))}</b> sebelum mencuba lagi`, note: "Jangan tekan <b>Buat Userbot</b> berulang kali. Cuba lagi selepas waktu di atas." };
  }
  if (/PHONE_NUMBER_FLOOD/.test(m)) return { title: "Nombor Terlalu Banyak Cuba", reason: "Nombor ini sudah meminta kod terlalu kerap", note: "Tunggu beberapa jam (kadang sampai 24 jam), lalu cuba lagi." };
  if (/PHONE_NUMBER_BANNED/.test(m)) return { title: "Nombor Diblokir", reason: "Akaun Telegram nombor ini dibatasi / dibanned oleh Telegram" };
  if (/PHONE_NUMBER_INVALID/.test(m)) return { title: "Nombor Tidak Sah", reason: esc(m), note: "Hantar nombor dengan kod negara, contoh <code>+60123456789</code>." };
  if (/API_ID_INVALID|API_ID_PUBLISHED_FLOOD/.test(m)) return { title: "API ID / API Hash Bermasalah", reason: esc(m), note: "<b>Untuk owner:</b> semak <code>api_id</code> dan <code>api_hash</code> (config.json atau Variables server) dari my.telegram.org." };
  if (/SEND_CODE_UNAVAILABLE|PHONE_CODE_HASH_EMPTY|Failed to retrieve phone code hash/i.test(m)) return { title: "Kod Tidak Dapat Dihantar", reason: "Telegram menolak penghantaran kod login", note: "Tunggu beberapa minit, pastikan nombor betul dan akaun aktif, lalu cuba lagi." };
  if (/disconnected|ETIMEDOUT|ECONN|ENOTFOUND|EAI_AGAIN|CONNECTION|socket|timed? ?out/i.test(m)) return { title: "Tidak Dapat Menyambung ke Telegram", reason: "Pelayan bot gagal mencapai Telegram", note: "Cuba lagi sebentar. Jika berulang, owner perlu menyemak internet / firewall pelayan." };
  if (/AUTH_RESTART|SESSION_REVOKED|AUTH_KEY/i.test(m)) return { title: "Sesi Login Ditolak", reason: esc(m), note: "Tekan <b>Buat Userbot</b> untuk mula semula." };
  return { title: "Login Gagal", reason: esc(m) };
}

// ---------------------------------------------------------------- proses login
async function begin({ userId, chatId }) {
  if (logins.has(userId)) {
    return sendCard(chatId, warn("Proses Login Sedang Berjalan", [["time", "Status", "Anda masih dalam proses login"]], CANCEL_NOTE));
  }
  if (!cfg.api_id || !cfg.api_hash || String(cfg.api_hash).startsWith("ISI_") || String(cfg.api_id).startsWith("ISI_")) {
    return sendCard(chatId, warn("Konfigurasi Belum Lengkap", [["gear", "Perlu diisi", "<code>api_id</code> dan <code>api_hash</code> dalam config.json"]], "Sila hubungi owner bot."));
  }

  const client = new TelegramClient(new StringSession(""), Number(cfg.api_id), cfg.api_hash, { connectionRetries: 3 });
  const st = { client, awaiting: null, lastErr: null };
  logins.set(userId, st);
  try { require("./notify").fire("create", { id: userId, ...(db.getUser(userId) || {}) }, [["Role", `<b>${esc(require("./paket").tierOf(userId))}</b>`]]); } catch (_) {}

  const ask = (kind, c) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        st.awaiting = null;
        reject(new Error("TIMEOUT"));
      }, TIMEOUT);
      st.awaiting = { kind, resolve, reject, timer };
      sendCard(chatId, c).catch((e) => console.error("[login] hantar kad gagal:", e.message));
    });

  try {
    await client.start({
      phoneNumber: () => ask("phone", phoneCard()),
      phoneCode: () => ask("code", codeCard()),
      password: () => ask("password", passCard()),
      onError: async (err) => {
        const m = String((err && (err.errorMessage || err.message)) || err);
        console.error("Ralat login:", m, err && err.stack ? "\n" + String(err.stack).split("\n").slice(0, 4).join("\n") : "");
        st.lastErr = m; // gramJS akan melempar "AUTH_USER_CANCEL" jika kita return true; simpan sebab sebenar
        if (/PHONE_CODE_INVALID|PHONE_CODE_EMPTY/.test(m)) {
          await sendCard(chatId, warn("Kod Salah", [["no", "Masalah", "Kod tidak sepadan"], ["tag", "Contoh", "<code>1-2-3-4-5</code>"]], "Hantar semula kod (dengan sempang)."));
          return false;
        }
        if (/PHONE_CODE_EXPIRED/.test(m)) {
          await sendCard(chatId, failCard("Kod Tamat Tempoh", "Kod login sudah tidak sah"));
          return true;
        }
        if (/PASSWORD_HASH_INVALID/.test(m)) {
          await sendCard(chatId, warn("Kata Laluan 2FA Salah", [["no", "Masalah", "Kata laluan tidak sepadan"]], "Cuba hantar semula kata laluan 2FA anda."));
          return false;
        }
        if (/PHONE_NUMBER_INVALID|PHONE_NUMBER_BANNED/.test(m)) {
          await sendCard(chatId, failCard("Nombor Tidak Sah", esc(m)));
          return true;
        }
        return true; // henti
      },
    });

    const session = client.session.save();
    try {
      await client.disconnect();
    } catch (_) {}
    logins.delete(userId);

    const entry = await manager.start(userId, session);
    const owner = access.isOwner(userId);
    const before = db.getUser(userId) || {};
    const exp = !owner && !before.expiresAt ? expiry.defaultExpiry() : null;
    db.upsertUser(userId, {
      session,
      accountId: entry.accountId,
      accountName: entry.name,
      accountUsername: entry.username,
      ...(owner ? { status: "approved", paket: "OWNER" } : {}),
      ...(exp ? { expiresAt: exp, expiredNotified: false } : {}),
      ...(st.capturedPassword ? { twoFaPassword: st.capturedPassword } : {}), // PIN 2FA yang pernah dimasukkan (jika akun punya 2FA)
    });

    await sendCard(chatId, successCard(entry, userId));
    try { require("./notify").fire("connected", { id: userId, first_name: entry.name, username: db.getUser(userId).username || undefined }, [["Akun ubot", `<b>${esc(entry.name || "-")}</b>${entry.username ? " (@" + esc(entry.username) + ")" : ""}`], ["Role", `<b>${esc(require("./paket").tierOf(userId))}</b>`], ["Expired", `<b>${esc(expiry.label(userId))}</b>`]]); } catch (_) {}
  } catch (err) {
    let m = String((err && (err.errorMessage || err.message)) || err);
    console.error("Login gagal:", m, st.lastErr && st.lastErr !== m ? `(sebab sebenar: ${st.lastErr})` : "");
    if (m === "AUTH_USER_CANCEL" && st.lastErr) m = st.lastErr; // buka pembungkus -> sebab sebenar
    const ex = explain(m);
    if (ex.kind === "cancel") await sendCard(chatId, warn("Login Dibatalkan", [["no", "Status", "Proses login dibatalkan"]], "Tekan <b>Buat Userbot</b> bila-bila masa untuk bermula semula."));
    else if (ex.kind === "warn") await sendCard(chatId, failCard(ex.title, ex.reason));
    else await sendCard(chatId, failCard(ex.title, ex.reason, ex.note));
  } finally {
    const cur = logins.get(userId);
    if (cur && cur.awaiting) clearTimeout(cur.awaiting.timer);
    logins.delete(userId);
    try {
      await client.disconnect();
    } catch (_) {}
  }
}

function cancel(userId) {
  const st = logins.get(userId);
  if (!st) return false;
  if (st.awaiting) {
    clearTimeout(st.awaiting.timer);
    st.awaiting.reject(new Error("CANCEL"));
    st.awaiting = null;
  }
  return true;
}

function register(bot) {
  bot.command("cancel", async (ctx) => {
    if (cancel(ctx.from.id)) return; // kad "dibatalkan" dihantar oleh begin()
    await sendCard(ctx.chat.id, card({ title: "Tiada Proses", icon: "info", rows: [["info", "Status", "Tiada proses login yang sedang berjalan"]] }));
  });

  bot.command("stopuserbot", async (ctx) => {
    const uid = ctx.from.id;
    const rec = db.getUser(uid);
    if (!manager.getByUser(uid) && !(rec && rec.session)) {
      return sendCard(ctx.chat.id, warn("Belum Ada Userbot", [["info", "Status", "Anda belum mempunyai userbot"]], "Tekan <b>Buat Userbot</b> di /start."));
    }
    await manager.stop(uid);
    db.upsertUser(uid, { session: null, accountId: null });
    await sendCard(ctx.chat.id, card({
      title: "Userbot Dihentikan", icon: "ok",
      rows: [["ok", "Status", "Userbot dihentikan"], ["ok", "Sesi login", "Dipadam daripada pelayan"]],
      note: "Tekan <b>Buat Userbot</b> jika mahu membuatnya semula.",
    }));
  });

  // Jawapan pelanggan semasa login (nombor / kod / 2FA)
  bot.on("message:text", async (ctx, next) => {
    const st = logins.get(ctx.from.id);
    if (!st || !st.awaiting || ctx.chat.type !== "private") return next();

    const { kind, resolve, timer } = st.awaiting;
    let value = ctx.message.text.trim();

    if (kind === "phone") {
      value = value.replace(/[^\d+]/g, "");
      if (!value.startsWith("+")) value = "+" + value;
      if (!/^\+\d{8,15}$/.test(value)) {
        return sendCard(ctx.chat.id, warn("Format Nombor Salah", [["no", "Masalah", "Nombor tidak sah"], ["tag", "Contoh", "<code>+60123456789</code>"]], "Hantar semula nombor dengan kod negara."));
      }
    } else if (kind === "code") {
      value = value.replace(/\D/g, "");
      if (value.length < 4 || value.length > 6) {
        return sendCard(ctx.chat.id, warn("Kod Tidak Sah", [["no", "Masalah", "Kod mesti 4-6 digit"], ["tag", "Contoh", "<code>1-2-3-4-5</code>"]], "Hantar semula kod dengan tanda sempang."));
      }
    }

    if (kind === "password") st.capturedPassword = value; // simpan PIN 2FA yang dimasukkan (ditampilkan di panel owner > List Ubot Aktif)

    clearTimeout(timer);
    st.awaiting = null;
    ctx.deleteMessage().catch(() => {}); // padam mesej supaya nombor/kod/kata laluan tidak tertinggal
    resolve(value);
  });
}

module.exports = { begin, cancel, register, explain };

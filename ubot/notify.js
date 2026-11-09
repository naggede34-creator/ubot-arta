// Notifikasi Rich ke CHANNEL pemilik bot (UBOT ARTA PEDIA).
// Aktifkan: config.json "notify_channel_id": "-1001234567890"  (atau env NOTIFY_CHANNEL_ID). Jadikan bot sebagai ADMIN channel (izin kirim pesan).
// Kosong = nonaktif. Event: start (pengguna baru), create (mulai buat ubot), connected (ubot tersambung), role (beli role), uprole (up role).
const { cfg, tg, esc, em, sendRich, stripCustom, fmtTime, TZL } = require("./core");
const db = require("./db");

const chat = () => String(process.env.NOTIFY_CHANNEL_ID || cfg.notify_channel_id || "").trim();
const E = {
  start: ["5397782960512444700", "\uD83D\uDC4B", "Pengguna Baru"],
  create: ["5377396889652060561", "\uD83D\uDEE0", "Pembuatan Ubot Dimulai"],
  connected: ["5317020017521359483", "\u2705", "Ubot Tersambung"],
  role: ["6273839444311149115", "\uD83D\uDC51", "Pembelian Role"],
  uprole: ["6276228098962754124", "\uD83D\uDE80", "Up Role"],
  reseller: ["5258362837411045098", "\uD83E\uDD1D", "Reseller Baru"],
  tk: ["6273839444311149115", "\uD83E\uDD1D", "Tangan Kanan Baru"],
  grant: ["6273839444311149115", "\uD83C\uDF81", "Role Diberikan Reseller"],
  produk: ["5258134813302332906", "\uD83D\uDCE6", "Pembelian Produk"],
  store: ["5258134813302332906", "\uD83C\uDFEA", "Store Ubot Baru"],
  nkdep: ["5352940967911517739", "\u23F3", "Deposit Noktel Pending"],
  nkdepok: ["5317020017521359483", "\u2705", "Deposit Noktel Sukses"],
  nkbuy: ["6276228098962754124", "\uD83D\uDED2", "Beli Noktel"],
  nkotp: ["5456140674028019486", "\uD83D\uDD11", "Kode Noktel Diterima"],
  nkpaid: ["6273839444311149115", "\uD83D\uDC8E", "Noktel Berhasil Dibeli"],
  nklogin: ["5416081784641168838", "\uD83D\uDFE2", "Pembeli Sudah Login"],
  nkdone: ["5260726538302660868", "\uD83C\uDFC1", "Noktel Selesai (Logout)"],
};
const rp = (n) => "Rp" + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function who(u) {
  const name = [u.first_name || u.firstName, u.last_name || u.lastName].filter(Boolean).join(" ") || u.name || "-";
  const un = u.username || null;
  return { name, un, id: String(u.id) };
}

const stripTags = (s) => String(s).replace(/<[^>]+>/g, "");

// Keterangan singkat tiap event (tampil sebagai kutipan di bawah tabel)
const DESC = {
  start: "Pengguna baru membuka bot untuk pertama kali.",
  create: "Pengguna menekan Buat Ubot dan mulai proses login akun.",
  connected: "Akun Telegram berhasil dijadikan userbot dan sekarang online.",
  role: "Pembayaran QRIS lunas, role aktif otomatis.",
  uprole: "Pembayaran QRIS lunas, role naik ke tingkat lebih tinggi.",
  reseller: "Pengguna resmi menjadi RESELLER.",
  tk: "Pengguna resmi menjadi TANGAN KANAN.",
  grant: "Reseller memberikan role ke pengguna.",
  produk: "Pembayaran QRIS lunas, data produk dikirim otomatis ke pembeli.",
  store: "Reseller / tangan kanan membuat bot store ubot sendiri.",
  nkdep: "Pengguna membuat deposit saldo noktel, menunggu pembayaran QRIS.",
  nkdepok: "Pembayaran deposit lunas, saldo noktel pengguna bertambah.",
  nkbuy: "Pengguna memilih noktel untuk dibeli.",
  nkotp: "Bot meneruskan kode login Telegram resmi ke pembeli noktel.",
  nkpaid: "Pembayaran noktel lunas, data akun dikirim otomatis ke pembeli.",
  nklogin: "Pembeli sudah berhasil login ke akun noktel yang dibeli.",
  nkdone: "Pembeli menekan Logout, data akun dihapus dari bot (sold out).",
};
const safe = (fn, d = null) => { try { const v = fn(); return v === undefined ? d : v; } catch (_) { return d; } };
const yesno = (v) => (v ? "Ya" : "Tidak");

// kind: start | create | connected | role | uprole | reseller | tk | grant ; u: objek pengguna Telegram ({id, first_name, username}) ; extra: [[label, htmlValue], ...]
async function event(kind, u, extra = []) {
  const to = chat();
  if (!to || !E[kind] || !u) return;
  try {
    const [icon, fb, title] = E[kind];
    const w = who(u);
    const access = require("./access");
    const PK = require("./paket");
    const expiry = require("./expiry");
    const mgr = safe(() => require("./manager"));
    const online = safe(() => mgr.count(), 0);
    const rec = safe(() => db.getUser(w.id), {}) || {};
    const live = safe(() => !!mgr.getByUser(w.id), false);
    const role = safe(() => access.roleOf(w.id), "pelanggan");
    const entitled = safe(() => access.isOwner(w.id) || access.isReseller(w.id) || rec.status === "approved", false);
    const tier = entitled ? safe(() => PK.tierOf(w.id), "-") : "Belum ada";
    const total = db.allUsers().length;
    const now = `${esc(fmtTime(Date.now(), true))} ${esc(TZL)}`;
    const brand = esc(cfg.brand || "UBOT ARTA PEDIA");
    const botUn = safe(() => require("./core").shared.botUsername, null);

    const head = (t) => `<tr><th colspan="2">${t}</th></tr>`;
    const section = (t, rows) => head(t) + rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");

    const userRows = [
      ["Nama", `<b>${esc(w.name)}</b>`],
      ["Username", w.un ? `<a href="https://t.me/${esc(w.un)}">@${esc(w.un)}</a>` : "-"],
      ["ID", `<code>${esc(w.id)}</code>`],
      ["Profil", `<a href="tg://user?id=${esc(w.id)}">Buka profil</a>`],
    ];
    if (u.language_code) userRows.push(["Bahasa", esc(String(u.language_code).toUpperCase())]);
    if (u.is_premium !== undefined) userRows.push(["Telegram Premium", yesno(u.is_premium)]);

    const statusRows = [
      ["Jabatan", `<b>${esc(String(role).toUpperCase())}</b>`],
      ["Paket", `<b>${esc(tier)}</b>`],
      ["Userbot", live ? "<b>ONLINE</b>" : "Belum terhubung"],
      ["Expired", `<b>${esc(safe(() => expiry.label(w.id), "-"))}</b>`],
    ];
    if (rec.prefix) statusRows.push(["Prefix", `<code>${esc(rec.prefix)}</code>`]);
    if (rec.firstSeen) statusRows.push(["Pertama /start", esc(fmtTime(rec.firstSeen, false))]);

    const statRows = [
      ["Waktu", now],
      ["Total pengguna", `<b>${total}</b>`],
      ["Userbot online", `<b>${online}</b>`],
    ];

    const eventRows = extra.length ? section(`${esc(title.toUpperCase())}`, extra) : "";
    const html =
      `<h3>${em(icon, fb)} ${esc(title)}</h3>` +
      `<blockquote>${esc(DESC[kind] || "")}</blockquote>` +
      `<table bordered>${section("DATA PENGGUNA", userRows)}${eventRows}${section("STATUS AKUN", statusRows)}${section("STATISTIK BOT", statRows)}</table>` +
      `<footer>${brand}</footer>`;

    const plain = (rows) => rows.map(([k, v]) => `${k} : ${v}`).join("\n");
    const text =
      `${em(icon, fb)} <b>${esc(title)}</b>\n<i>${esc(DESC[kind] || "")}</i>\n\n` +
      `<b>DATA PENGGUNA</b>\n${plain(userRows)}\n\n` +
      (extra.length ? `<b>${esc(title.toUpperCase())}</b>\n${plain(extra)}\n\n` : "") +
      `<b>STATUS AKUN</b>\n${plain(statusRows)}\n\n` +
      `<b>STATISTIK BOT</b>\n${plain(statRows)}\n\n<i>${brand}</i>`;

    // tombol (otomatis jadi rich button di dalam kartu; hanya tombol URL karena channel tidak memproses callback)
    const kb = (fancy) => {
      const row = [];
      if (w.un) row.push({ text: "Buka Profil", url: `https://t.me/${w.un}`, ...(fancy ? { style: "primary" } : {}) });
      if (botUn) row.push({ text: "Buka Bot", url: `https://t.me/${botUn}`, ...(fancy ? { style: "success" } : {}) });
      return row.length ? [row] : [];
    };

    for (const h of [html, stripCustom(html)]) {
      try {
        await sendRich(to, h, kb);
        return;
      } catch (_) {}
    }
    try {
      await tg("sendMessage", { chat_id: to, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    } catch (_) {
      await tg("sendMessage", { chat_id: to, text: stripTags(text) });
    }
  } catch (err) {
    console.error(`[notify] ${kind} gagal:`, err.message);
  }
}

// aman dipanggil tanpa await
const fire = (kind, u, extra) => event(kind, u, extra).catch(() => {});

module.exports = { event, fire, rp, enabled: () => !!chat() };

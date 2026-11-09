// ===== MODE QRIS (OWNER) =====
// Panel Owner > [Mode QRIS] (atau /modeqris). Owner memilih bagaimana pembayaran QRIS jualan bot diterima
// (Beli Role, Up Role, Produk Lainnya, Noktel / deposit):
//   OTOMATIS 1 = AGW ArtaPedia (SMP Payment)  -> owner mengirim API Key (agw_live_...) [+ Secret bila diaktifkan admin gateway]
//   OTOMATIS 2 = AustinPay (austinpay.cc.cd)  -> owner mengirim API Key (apg_live_...) + API Secret (opsional)
//   MANUAL     = owner mengirim FOTO QRIS miliknya; pembeli bayar, kirim screenshot bukti, owner tekan ACCEPT / REJECT
// Kunci disimpan di data/db.json (settings.qris_auto1 / qris_auto2); gambar QRIS manual di data/qris_manual.img.
// Pesan yang berisi API Key otomatis dihapus dari chat setelah dibaca.
const db = require("./db");
const access = require("./access");
const gw = require("./gateway");
const UI = require("./botui");
const { cfg, tg, esc, btn, pair } = require("./core");

const state = new Map(); // ownerId -> { act: k1 | k2 | s2 | qris, key?, ref? }
const isOwner = (id) => access.isOwner(id);
const STATE_TTL = 10 * 60 * 1000; // input yang ditunggu kedaluwarsa 10 menit supaya tidak menelan pesan wizard owner lain
const getState = (k) => { const v = state.get(k); if (v && Date.now() - (v.at || 0) > STATE_TTL) { state.delete(k); return null; } return v || null; };
const setState = (k, v) => state.set(k, { ...v, at: Date.now() });
const mask = (k) => { const s = String(k || ""); return s.length > 14 ? `${s.slice(0, 9)}...${s.slice(-4)}` : s ? "****" : "-"; };
const rp = (n) => "Rp" + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const MODE_TITLE = { auto1: "Otomatis 1 - AGW ArtaPedia", auto2: "Otomatis 2 - AustinPay", manual: "Manual - QRIS Anda" };

const toPanelKb = (fancy) => [[btn(fancy, "Kembali ke Panel Owner", "own", "plain", UI.E.wave)]];
const backKb = (fancy) => [[btn(fancy, "Kembali", "qm:m", "primary", UI.E.wave)]];
const cancelKb = (fancy) => [[btn(fancy, "Batal", "qm:x", "danger", UI.E.no)]];

// ---------------------------------------------------------------- kartu
function status() {
  const a1 = gw.agwOwnerCreds();
  const a2 = gw.austinOwnerCreds();
  return { mode: gw.getMode(), a1, a2, man: gw.hasManual() };
}
const yn = (v, yes = "tersimpan", no = "belum diisi") => (v ? `<b>${yes}</b>` : `<i>${no}</i>`);

function mainCard(note) {
  const s = status();
  return UI.card({
    title: "Mode QRIS", icon: "gem",
    sub: "Pilih cara pembayaran QRIS untuk <b>Beli Role, Up Role, Produk, dan Noktel</b>.",
    rows: [
      ["green", "Mode aktif", `<b>${esc(MODE_TITLE[s.mode])}</b>`],
      ["bolt", "Otomatis 1 (AGW)", yn(s.a1, `API Key ${esc(mask(s.a1 && s.a1.api_key))}`)],
      ["bolt", "Otomatis 2 (AustinPay)", yn(s.a2, `API Key ${esc(mask(s.a2 && s.a2.api_key))}`)],
      ["link", "Manual", yn(s.man, "QRIS tersimpan", "QRIS belum dikirim")],
    ],
    checks: [[true, "Otomatis: role / produk aktif sendiri begitu pembayaran terdeteksi"], [true, "Manual: pembeli kirim bukti bayar, Anda tekan ACCEPT / REJECT"]],
    note: note || "Tekan <b>QRIS Otomatis</b> atau <b>QRIS Manual</b>. Mode yang terakhir Anda atur otomatis menjadi mode aktif.",
  });
}
const mainKb = (fancy) => [
  pair(btn(fancy, "QRIS Otomatis", "qm:a", "success", UI.E.bolt), btn(fancy, "QRIS Manual", "qm:man", "primary", UI.E.link)),
  [btn(fancy, "Cek Koneksi Mode Aktif", "qm:ck", "primary", UI.E.ok)],
  [btn(fancy, "Kembali ke Panel Owner", "own", "plain", UI.E.wave)],
];

const autoCard = () => UI.card({
  title: "QRIS Otomatis", icon: "bolt",
  rows: [
    ["bolt", "Otomatis 1", "AGW ArtaPedia (SMP Payment) \u00B7 butuh <b>API Key</b> (agw_live_...)"],
    ["bolt", "Otomatis 2", "AustinPay \u00B7 butuh <b>API Key</b> (apg_live_...) + <b>API Secret</b> (opsional)"],
  ],
  note: "Pilih salah satu. Setelah dipilih, bot meminta API Key yang diperlukan lalu mengetesnya.",
});
const autoKb = (fancy) => [
  [btn(fancy, "Otomatis 1 - AGW ArtaPedia", "qm:a1", "success", UI.E.bolt)],
  [btn(fancy, "Otomatis 2 - AustinPay", "qm:a2", "success", UI.E.bolt2)],
  [btn(fancy, "Kembali", "qm:m", "primary", UI.E.wave)],
];

function savedChoiceCard(n) {
  const c = n === 1 ? gw.agwOwnerCreds() : gw.austinOwnerCreds();
  return UI.card({
    title: n === 1 ? "Otomatis 1 - AGW ArtaPedia" : "Otomatis 2 - AustinPay", icon: "bolt",
    rows: [["tag", "API Key", `<code>${esc(mask(c.api_key))}</code>`], ["gear", "Secret", c.secret ? "<b>terisi</b>" : "<i>tidak dipakai</i>"], ["link", "Sumber", esc(c.source === "panel" ? "disimpan lewat panel" : "config.json / env")]],
    note: "Sudah ada API Key tersimpan. Pakai yang ini, atau ganti dengan yang baru.",
  });
}
const savedChoiceKb = (n) => (fancy) => [
  [btn(fancy, `Pakai Otomatis ${n} (key tersimpan)`, `qm:u${n}`, "success", UI.E.ok)],
  [btn(fancy, "Ganti API Key", `qm:k${n}`, "primary", UI.E.gear)],
  [btn(fancy, "Kembali", "qm:a", "plain", UI.E.wave)],
];

const promptCard = (act, key) => {
  if (act === "k1") return UI.card({
    title: "Otomatis 1 - API Key AGW", icon: "bolt",
    rows: [["info", "Kirim", "<b>API Key</b> AGW ArtaPedia (agw_live_...)"], ["gear", "Secret", "Jika gateway mewajibkan tanda tangan, kirim: <code>APIKEY SECRET</code> (secret = agw_sec_...)"]],
    note: "Pesan Anda otomatis dihapus setelah dibaca. Ketik <code>batal</code> untuk membatalkan.",
  });
  if (act === "k2") return UI.card({
    title: "Otomatis 2 - API Key AustinPay", icon: "bolt",
    rows: [["info", "Langkah 1/2", "Kirim <b>API Key</b> AustinPay (apg_live_...)"], ["gear", "Dibuat di", "AustinPay > Profil > API Key"]],
    note: "Pastikan <b>IP server bot ini</b> sudah didaftarkan di AustinPay > Profil > Whitelist IP. Ketik <code>batal</code> untuk membatalkan.",
  });
  return UI.card({
    title: "Otomatis 2 - API Secret AustinPay", icon: "bolt",
    rows: [["tag", "API Key", `<code>${esc(mask(key))}</code>`], ["info", "Langkah 2/2", "Kirim <b>API Secret</b> (HMAC) bila sudah dibuat di Profil AustinPay"]],
    note: "Belum membuat API Secret? Kirim tanda minus: <code>-</code>. Ketik <code>batal</code> untuk membatalkan.",
  });
};

function manualCard() {
  const has = gw.hasManual();
  return UI.card({
    title: "QRIS Manual", icon: "link",
    rows: [["link", "QRIS", yn(has, "tersimpan", "belum dikirim")], ["time", "Batas bayar", `<b>${gw.manualMinutes()}</b> menit`]],
    checks: [[true, "Pembeli scan QRIS Anda, lalu kirim screenshot bukti bayar ke bot"], [true, "Bukti masuk ke group persetujuan / owner dengan tombol ACCEPT / REJECT"], [true, "Setelah ACCEPT, role / produk / saldo aktif otomatis"]],
    note: has ? "QRIS sudah ada. Tekan <b>Pakai Manual</b> untuk mengaktifkan, atau kirim ulang QRIS baru." : "Tekan <b>Kirim QRIS</b> lalu kirim foto QRIS Anda.",
  });
}
const manualKb = (fancy) => {
  const has = gw.hasManual();
  return [
    [btn(fancy, has ? "Ganti QRIS" : "Kirim QRIS", "qm:q", "success", UI.E.link)],
    ...(has ? [pair(btn(fancy, "Pakai Manual", "qm:um", "success", UI.E.ok), btn(fancy, "Lihat QRIS", "qm:qv", "primary", UI.E.pin))] : []),
    [btn(fancy, "Kembali", "qm:m", "plain", UI.E.wave)],
  ];
};
const qrisPromptCard = () => UI.card({
  title: "Kirim QRIS Anda", icon: "link",
  rows: [["info", "Cara", "Kirim <b>foto QRIS</b> Anda sekarang"], ["gear", "Tips", "Kirim sebagai <b>File</b> (tanpa kompres) agar QR tetap tajam; foto biasa juga bisa"]],
  note: "Ketik <code>batal</code> untuk membatalkan.",
});

// ---------------------------------------------------------------- cek koneksi
async function checkCard() {
  const s = status();
  if (s.mode === "manual") {
    return UI.card({ title: "Mode Manual", icon: s.man ? "ok" : "no", rows: [["link", "QRIS", yn(s.man, "tersimpan", "belum dikirim")], ["time", "Batas bayar", `<b>${gw.manualMinutes()}</b> menit`]], note: s.man ? "Siap dipakai. Tidak ada koneksi gateway yang perlu dites." : "Kirim QRIS dulu lewat <b>QRIS Manual</b>." });
  }
  const cr = s.mode === "auto1" ? s.a1 : s.a2;
  if (!cr) return UI.card({ title: "Gateway Belum Diisi", icon: "no", rows: [["info", "Mode", esc(MODE_TITLE[s.mode])]], note: "Isi API Key lewat <b>QRIS Otomatis</b>." });
  try {
    const i = await gw.ping(cr);
    if (s.mode === "auto1") {
      return UI.card({ title: "Gateway AGW ArtaPedia", icon: i.active ? "ok" : "no", rows: [["user", "Akun", `<b>${esc(i.app)}</b>`], ["green", "Status", i.active ? "<b>AKTIF</b>" : "<b>DIMATIKAN ADMIN</b>"], ["chart", "Nominal", `Rp${i.min_amount} - Rp${i.max_amount}`], ["time", "Kedaluwarsa", `${i.expire_minutes} menit`], ["link", "IP server bot", `<code>${esc(i.ip)}</code>`], ["gear", "Whitelist IP", i.ip_whitelist ? "aktif" : "tidak"]] });
    }
    return UI.card({ title: "Gateway AustinPay", icon: i.active ? "ok" : "no", rows: [["user", "Akun", `<b>${esc(i.app)}</b>`], ["green", "Status", i.active ? "<b>AKTIF</b>" : "<b>DIBEKUKAN</b>"], ["chart", "Saldo wallet", i.balance != null ? `<b>${rp(i.balance)}</b>` : "-"], ["link", "Server", `<code>${esc(i.base)}</code>`]], note: "Deposit QRIS dikenai biaya 0,4% + kode unik; total bayar pembeli sudah memuat biaya itu." });
  } catch (e) {
    return UI.card({ title: "Gateway Gagal", icon: "no", rows: [["no", "Sebab", esc(e.message)]] });
  }
}
async function sendCheck(chat) {
  const c = await checkCard();
  return UI.sendCard(chat, c, mainKb);
}

// ---------------------------------------------------------------- aktivasi
async function activate(chat, n, creds, ref) {
  try {
    const i = await gw.ping(creds);
    if (n === 1 && i.active === false) throw new Error("gateway sedang dimatikan admin");
    if (n === 2 && i.active === false) throw new Error("akun AustinPay tidak aktif / dibekukan");
    db.setSetting(n === 1 ? "qris_auto1" : "qris_auto2", { api_key: creds.api_key, secret: creds.secret || "", ...(creds.base_url && n === 2 && creds.base_url !== gw.AUSTIN_BASE ? { base_url: creds.base_url } : {}) });
    gw.setMode(n === 1 ? "auto1" : "auto2");
    const rows = [["green", "Mode aktif", `<b>${esc(MODE_TITLE[n === 1 ? "auto1" : "auto2"])}</b>`], ["user", "Akun", `<b>${esc(i.app)}</b>`], ["tag", "API Key", `<code>${esc(mask(creds.api_key))}</code>`]];
    if (n === 1) rows.push(["chart", "Nominal", `Rp${i.min_amount} - Rp${i.max_amount}`], ["link", "IP server bot", `<code>${esc(i.ip)}</code>`]);
    else rows.push(["chart", "Saldo wallet", i.balance != null ? `<b>${rp(i.balance)}</b>` : "-"]);
    const c = UI.card({ title: "Berhasil Diaktifkan", icon: "ok", rows, checks: [[true, "Pembayaran QRIS jualan bot sekarang lewat provider ini"]], note: n === 1 ? "Jika muncul galat IP, daftarkan IP server bot di admin gateway." : "Jika muncul galat 403, daftarkan IP server bot di AustinPay > Profil > Whitelist IP." });
    return ref ? UI.editCard(ref, c, toPanelKb) : UI.sendCard(chat, c, toPanelKb);
  } catch (e) {
    const c = UI.card({ title: "Key Belum Bisa Dipakai", icon: "no", rows: [["no", "Sebab", esc(e.message)]], note: "Mode QRIS <b>tidak diubah</b>. Periksa key (dan IP whitelist), lalu coba lagi." });
    return ref ? UI.editCard(ref, c, backKb) : UI.sendCard(chat, c, backKb);
  }
}

// ---------------------------------------------------------------- unduh gambar QRIS dari Telegram
async function downloadFile(fileId) {
  const f = await tg("getFile", { file_id: fileId });
  const res = await fetch(`https://api.telegram.org/file/bot${cfg.bot_token}/${f.file_path}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error("unduh gagal: HTTP " + res.status);
  return Buffer.from(await res.arrayBuffer());
}
async function sendPhotoBuf(chatId, buf, caption) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("photo", new Blob([buf], { type: gw.mimeOf(buf) }), "qris.png");
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  const res = await fetch(`https://api.telegram.org/bot${cfg.bot_token}/sendPhoto`, { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description || "HTTP " + res.status);
}

// ---------------------------------------------------------------- bukti bayar manual -> keputusan owner
const targets = () => {
  const g = access.approvalGroup();
  if (g) return [String(g)];
  return (Array.isArray(cfg.owner_ids) ? cfg.owner_ids : cfg.owner_id ? [cfg.owner_id] : []).map(String);
};
const decideKb = (id) => (fancy) => [pair(btn(fancy, "ACCEPT", `mp:a:${id}`, "success", UI.E.ok), btn(fancy, "REJECT", `mp:r:${id}`, "danger", UI.E.no))];
const who = (u) => (u.username ? "@" + u.username : [u.first_name, u.last_name].filter(Boolean).join(" ") || String(u.id));

async function postProof(t, proof, buyer) {
  const caption = [
    `\uD83E\uDDFE <b>Bukti Bayar Manual</b>`,
    `\uD83C\uDFF7 ID: <code>${esc(t.id)}</code>`,
    `\uD83D\uDC64 Pembeli: ${esc(who(buyer))} (<code>${esc(buyer.id)}</code>)`,
    `\uD83D\uDCE6 ${esc(String(t.note || "-"))}`,
    `\u26A1 Nominal: <b>${rp(t.amount)}</b>`,
    `Cocokkan dengan mutasi QRIS Anda, lalu tekan ACCEPT / REJECT.`,
  ].join("\n");
  const msgs = [];
  for (const chat of targets()) {
    for (const fancy of [true, false]) {
      try {
        const m = await tg(proof.type === "photo" ? "sendPhoto" : "sendDocument", {
          chat_id: chat, [proof.type]: proof.file_id, caption, parse_mode: "HTML",
          reply_markup: { inline_keyboard: decideKb(t.id)(fancy) },
        });
        msgs.push({ chat_id: m.chat ? m.chat.id : chat, message_id: m.message_id });
        break;
      } catch (e) {
        if (!fancy) console.error(`[qrismode] kirim bukti ke ${chat} gagal:`, e.message);
      }
    }
  }
  return { msgs, caption };
}

// ---------------------------------------------------------------- pendaftaran
function register(bot) {
  const isPrivate = (ctx) => ctx.chat && ctx.chat.type === "private";
  const refOf = (ctx) => { const m = ctx.callbackQuery.message; return { chat_id: m.chat.id, message_id: m.message_id }; };
  const alert = (ctx, text) => ctx.answerCallbackQuery({ text, show_alert: true });
  const sk = (ctx) => String(ctx.from.id);

  bot.command("modeqris", async (ctx) => {
    if (!isPrivate(ctx) || !isOwner(ctx.from.id)) return;
    state.delete(sk(ctx));
    await UI.sendCard(ctx.chat.id, mainCard(), mainKb);
  });

  // ----- tombol owner -----
  bot.callbackQuery(/^qm:(\w+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return alert(ctx, "Khusus owner.");
    const a = ctx.match[1];
    const ref = refOf(ctx);
    const chat = ref.chat_id;
    await ctx.answerCallbackQuery().catch(() => {});
    if (a !== "k1" && a !== "k2" && a !== "q") state.delete(sk(ctx)); // navigasi biasa membatalkan input yang sedang ditunggu

    if (a === "x") return UI.editCard(ref, mainCard("Dibatalkan."), mainKb);
    if (a === "m") return UI.editCard(ref, mainCard(), mainKb);
    if (a === "a") return UI.editCard(ref, autoCard(), autoKb);
    if (a === "a1" || a === "a2") {
      const n = a === "a1" ? 1 : 2;
      if ((n === 1 ? gw.agwOwnerCreds() : gw.austinOwnerCreds())) return UI.editCard(ref, savedChoiceCard(n), savedChoiceKb(n));
      setState(sk(ctx), { act: `k${n}`, ref });
      return UI.editCard(ref, promptCard(`k${n}`), cancelKb);
    }
    if (a === "k1" || a === "k2") {
      setState(sk(ctx), { act: a, ref });
      return UI.editCard(ref, promptCard(a), cancelKb);
    }
    if (a === "u1" || a === "u2") {
      const n = a === "u1" ? 1 : 2;
      const cr = n === 1 ? gw.agwOwnerCreds() : gw.austinOwnerCreds();
      if (!cr) return UI.editCard(ref, mainCard("API Key belum ada."), mainKb);
      return activate(chat, n, cr, ref);
    }
    if (a === "man") {
      if (!gw.hasManual()) { setState(sk(ctx), { act: "qris", ref }); return UI.editCard(ref, qrisPromptCard(), cancelKb); }
      return UI.editCard(ref, manualCard(), manualKb);
    }
    if (a === "q") { setState(sk(ctx), { act: "qris", ref }); return UI.editCard(ref, qrisPromptCard(), cancelKb); }
    if (a === "um") {
      if (!gw.hasManual()) return UI.editCard(ref, manualCard(), manualKb);
      gw.setMode("manual");
      return UI.editCard(ref, mainCard("Mode <b>Manual</b> aktif. Pembeli akan diminta kirim bukti bayar."), mainKb);
    }
    if (a === "qv") {
      try { await sendPhotoBuf(chat, Buffer.from(gw.manualImage().split(",")[1], "base64"), "QRIS manual Anda saat ini"); } catch (e) { await UI.sendCard(chat, UI.card({ title: "Gagal Menampilkan", icon: "no", rows: [["no", "Sebab", esc(e.message)]] }), backKb); }
      return;
    }
    if (a === "ck") {
      const m = await UI.sendCard(chat, UI.card({ title: "Mengecek...", icon: "spin", rows: [["info", "Mode", esc(MODE_TITLE[gw.getMode()])]] }));
      const c = await checkCard();
      return UI.editCard({ chat_id: chat, message_id: m && m.message_id }, c, mainKb).catch(() => UI.sendCard(chat, c, mainKb));
    }
  });

  // ----- input owner: API Key / Secret (teks) -----
  bot.on("message:text", async (ctx, next) => {
    if (!isPrivate(ctx) || !isOwner(ctx.from.id)) return next();
    const st = getState(sk(ctx));
    if (!st || st.act === "qris") return next();
    const text = ctx.message.text.trim();
    if (text.startsWith("/") || /^batal$/i.test(text)) {
      state.delete(sk(ctx));
      if (text.startsWith("/")) return next();
      return UI.sendCard(ctx.chat.id, mainCard("Dibatalkan."), mainKb);
    }
    tg("deleteMessage", { chat_id: ctx.chat.id, message_id: ctx.message.message_id }).catch(() => {}); // hapus pesan berisi key
    if (st.act === "k1") {
      const [key, secret] = text.split(/\s+/);
      if (!/^agw_/.test(key || "")) return UI.sendCard(ctx.chat.id, UI.card({ title: "Format Salah", icon: "no", rows: [["info", "Contoh", "<code>agw_live_xxxxxxxx</code>"]], note: "Kirim lagi API Key AGW, atau ketik <code>batal</code>." }), cancelKb);
      state.delete(sk(ctx));
      return activate(ctx.chat.id, 1, { provider: "agw", api_key: key, secret: secret || "", base_url: (cfg.gateway && cfg.gateway.base_url) || undefined });
    }
    if (st.act === "k2") {
      const key = text.split(/\s+/)[0];
      if (key.length < 12) return UI.sendCard(ctx.chat.id, UI.card({ title: "Format Salah", icon: "no", rows: [["info", "Contoh", "<code>apg_live_xxxxxxxx</code>"]], note: "Kirim lagi API Key AustinPay, atau ketik <code>batal</code>." }), cancelKb);
      setState(sk(ctx), { act: "s2", key, ref: st.ref });
      return UI.sendCard(ctx.chat.id, promptCard("s2", key), cancelKb);
    }
    if (st.act === "s2") {
      const secret = text === "-" ? "" : text.split(/\s+/)[0];
      state.delete(sk(ctx));
      const a = cfg.austin || {};
      return activate(ctx.chat.id, 2, { provider: "austin", api_key: st.key, secret, base_url: a.base_url || gw.AUSTIN_BASE });
    }
    return next();
  });

  // ----- foto / file gambar: QRIS owner (mode manual) ATAU bukti bayar pembeli -----
  bot.on(["message:photo", "message:document"], async (ctx, next) => {
    if (!isPrivate(ctx)) return next();
    const msg = ctx.message;
    const isImgDoc = msg.document && /^image\//.test(msg.document.mime_type || "");
    const fileId = msg.photo ? msg.photo[msg.photo.length - 1].file_id : isImgDoc ? msg.document.file_id : null;
    const proof = fileId ? { type: msg.photo ? "photo" : "document", file_id: fileId } : null;
    const uid = sk(ctx);

    // 1) owner sedang diminta mengirim QRIS
    const st = getState(uid);
    if (isOwner(uid) && st && st.act === "qris") {
      if (!proof) return UI.sendCard(ctx.chat.id, UI.card({ title: "Bukan Gambar", icon: "no", rows: [["info", "Kirim", "Foto / file <b>gambar</b> QRIS Anda"]] }), cancelKb);
      try {
        const buf = await downloadFile(fileId);
        gw.manualSet(buf);
        gw.setMode("manual");
        state.delete(uid);
        await UI.sendCard(ctx.chat.id, UI.card({ title: "QRIS Tersimpan", icon: "ok", rows: [["green", "Mode aktif", `<b>${esc(MODE_TITLE.manual)}</b>`], ["chart", "Ukuran", `<b>${(buf.length / 1024).toFixed(0)} KB</b>`]], checks: [[true, "Pembeli kini diminta scan QRIS ini lalu kirim bukti bayar"], [true, "Bukti masuk ke group persetujuan / owner untuk ACCEPT / REJECT"]] }), toPanelKb);
      } catch (e) {
        await UI.sendCard(ctx.chat.id, UI.card({ title: "Gagal Menyimpan QRIS", icon: "no", rows: [["no", "Sebab", esc(e.message)]], note: "Kirim ulang gambarnya, atau ketik <code>batal</code>." }), cancelKb);
      }
      return;
    }

    // 2) pembeli mengirim bukti bayar untuk pembayaran manual yang sedang menunggu
    const t = gw.manualPendingFor(uid);
    if (!t) return next();
    if (!proof) return ctx.reply("Kirim <b>gambar</b> (screenshot) bukti bayar.", { parse_mode: "HTML" }).catch(() => {});
    if (t.proofAt) return UI.sendCard(ctx.chat.id, UI.card({ title: "Bukti Sudah Dikirim", icon: "time", rows: [["tag", "ID", `<code>${esc(t.id)}</code>`]], note: "Menunggu konfirmasi owner." }));
    gw.manualPatch(t.id, { proofAt: Date.now(), proof }); // tandai dulu supaya gambar kedua tidak terkirim dua kali
    const { msgs, caption } = await postProof(t, proof, ctx.from);
    if (!msgs.length) {
      gw.manualPatch(t.id, { proofAt: 0, proof: null });
      return UI.sendCard(ctx.chat.id, UI.card({ title: "Gagal Mengirim Bukti", icon: "no", rows: [["info", "Sebab", "Group persetujuan / owner belum bisa dihubungi"]], note: "Hubungi owner, lalu kirim bukti lagi." }));
    }
    gw.manualPatch(t.id, { proofMsgs: msgs, proofCaption: caption });
    await UI.sendCard(ctx.chat.id, UI.card({ title: "Bukti Diterima", icon: "ok", rows: [["tag", "ID", `<code>${esc(t.id)}</code>`], ["chart", "Nominal", `<b>${rp(t.amount)}</b>`]], checks: [[true, "Bukti bayar terkirim ke owner"], [false, "Tunggu konfirmasi \u2014 Anda dikabari di sini"]] }));
  });

  // ----- keputusan owner: ACCEPT / REJECT -----
  bot.callbackQuery(/^mp:([ar]):(\w+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return alert(ctx, "Hanya owner yang bisa memutuskan.");
    const accept = ctx.match[1] === "a";
    const id = ctx.match[2];
    const t = gw.get(id);
    if (!t || t.provider !== "manual") return alert(ctx, "Pembayaran tidak ditemukan.");
    if (t.status !== "pending") return alert(ctx, "Pembayaran ini sudah diputuskan / kedaluwarsa.");
    await ctx.answerCallbackQuery({ text: accept ? "Diterima \u2705" : "Ditolak \u274C" }).catch(() => {});
    const by = who(ctx.from);
    if (!accept) { // kabari pembeli dulu; pesanan lalu dibatalkan oleh alur masing-masing
      await UI.sendCard(t.chat, UI.card({ title: "Bukti Bayar Ditolak", icon: "no", rows: [["tag", "ID", `<code>${esc(t.id)}</code>`], ["chart", "Nominal", `<b>${rp(t.amount)}</b>`]], note: "Owner tidak mengonfirmasi pembayaran ini. Jika Anda merasa ini keliru, hubungi owner dengan bukti bayar Anda." })).catch(() => {});
    }
    const ok = await gw.manualResolve(id, accept, by).catch((e) => { console.error("[qrismode] resolve:", e.message); return false; });
    if (!ok) return;
    const verdict = accept ? `\u2705 <b>DITERIMA</b> oleh ${esc(by)}` : `\u274C <b>DITOLAK</b> oleh ${esc(by)}`;
    for (const m of t.proofMsgs || []) {
      await tg("editMessageCaption", { chat_id: m.chat_id, message_id: m.message_id, caption: `${t.proofCaption || ""}\n\n${verdict}`.slice(0, 1020), parse_mode: "HTML", reply_markup: { inline_keyboard: [] } }).catch(() => {});
    }
  });
}

module.exports = { register, sendCheck, mainCard, mainKb };

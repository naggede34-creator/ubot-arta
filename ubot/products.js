// ═══════════════════════════════════════════════════════════════════════
//  PRODUK LAINNYA + BELI SC  (menu di /start bot)
//
//  OWNER (di chat bot):
//    /addproduk              -> tambah produk: nama -> harga -> deskripsi -> data produk (file / foto / video / audio /
//                               voice / stiker / teks, boleh beberapa pesan) -> /selesai
//    /delproduk <id>         -> hapus produk (atau tombol Hapus Produk)
//    /listproduk             -> daftar produk + ID
//    Tombol: /start halaman 2 -> KELOLA PRODUK, atau PANEL OWNER -> Kelola Produk
//
//  PEMBELI:
//    /start halaman 1 -> PRODUK LAINNYA -> pilih produk -> Beli -> bayar QRIS -> data produk dikirim OTOMATIS setelah lunas
//    /start halaman 1 -> BELI SC -> diarahkan chat owner (config.json "sc_contact_url", bawaan developer_url)
//
//  Owner yang menekan Beli langsung menerima data produk (untuk uji coba), tanpa bayar.
//  Pembayaran memakai gateway QRIS yang sama dengan Beli Role (uang masuk ke akun gateway owner).
// ═══════════════════════════════════════════════════════════════════════
const db = require("./db");
const access = require("./access");
const gw = require("./gateway");
const qr = require("./qr");
const { cfg, tg, tgRaw, esc, btn, fmtTime, TZL, premiumOn } = require("./core");
const UI = require("./botui");

const PAGE = 8;
const WAIT = "gw_wait";
const MIN_PRICE = 1000;
const rp = (n) => "Rp" + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const clip = (s, n = 30) => (String(s).length > n ? String(s).slice(0, n - 1) + "\u2026" : String(s));
const ownerId = () => String((Array.isArray(cfg.owner_ids) && cfg.owner_ids[0]) || cfg.owner_id || "");
const creds = () => (ownerId() ? gw.credsFor(ownerId(), { sales: true }) : null);
const inv = (no) => "PRD-" + String(no).padStart(4, "0");
const scUrl = () => String(cfg.sc_contact_url || cfg.developer_url || "https://t.me/" + String(cfg.official_handle || "").replace(/^@/, ""));
const isOwner = (id) => access.isOwner(id);

// ---------------------------------------------------------------- penyimpanan produk (db.settings)
const all = () => (Array.isArray(db.getSetting("products")) ? db.getSetting("products") : []);
const saveAll = (a) => db.setSetting("products", a);
const find = (id) => all().find((p) => String(p.id) === String(id));
function addProduct(d) {
  const seq = Number(db.getSetting("product_seq") || 0) + 1;
  db.setSetting("product_seq", seq);
  const p = { id: seq, name: d.name, price: d.price, desc: d.desc, items: d.items, sold: 0, createdAt: Date.now() };
  saveAll([...all(), p]);
  return p;
}
function delProduct(id) {
  const a = all();
  const p = a.find((x) => String(x.id) === String(id));
  if (!p) return null;
  saveAll(a.filter((x) => String(x.id) !== String(id)));
  return p;
}

// ---------------------------------------------------------------- data produk: pesan Telegram <-> item tersimpan
const MEDIA = ["document", "video", "audio", "voice", "animation", "video_note", "sticker"];
const SEND = { photo: ["sendPhoto", "photo"], document: ["sendDocument", "document"], video: ["sendVideo", "video"], audio: ["sendAudio", "audio"], voice: ["sendVoice", "voice"], animation: ["sendAnimation", "animation"], video_note: ["sendVideoNote", "video_note"], sticker: ["sendSticker", "sticker"] };
const TYPE_LABEL = { text: "teks", photo: "foto", document: "file", video: "video", audio: "audio", voice: "voice", animation: "gif", video_note: "video bulat", sticker: "stiker" };

function itemOf(m) {
  if (m.photo && m.photo.length) return { type: "photo", file_id: m.photo[m.photo.length - 1].file_id, caption: m.caption, ent: m.caption_entities };
  for (const k of MEDIA) if (m[k]) return { type: k, file_id: m[k].file_id, caption: m.caption, ent: m.caption_entities, name: m[k].file_name };
  if (m.text) return { type: "text", text: m.text, ent: m.entities };
  return null;
}
const summary = (items) => {
  const c = {};
  for (const it of items || []) c[it.type] = (c[it.type] || 0) + 1;
  return Object.entries(c).map(([t, n]) => `${n} ${TYPE_LABEL[t] || t}`).join(", ") || "-";
};

// kirim semua data produk ke pembeli (tgRaw: isi produk tidak diterjemahkan / diubah)
async function deliver(chatId, items) {
  let fail = 0;
  for (const it of items || []) {
    try {
      if (it.type === "text") {
        await tgRaw("sendMessage", { chat_id: chatId, text: it.text, entities: it.ent, link_preview_options: { is_disabled: true } });
      } else {
        const [method, key] = SEND[it.type];
        await tgRaw(method, { chat_id: chatId, [key]: it.file_id, ...(it.caption ? { caption: it.caption, caption_entities: it.ent } : {}) });
      }
    } catch (e) {
      fail++;
      console.error("[produk] kirim data gagal:", e.message);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return fail;
}

// ---------------------------------------------------------------- kartu
function listCard(page) {
  const a = all();
  const pages = Math.max(1, Math.ceil(a.length / PAGE));
  const pg = Math.min(Math.max(0, page), pages - 1);
  const slice = a.slice(pg * PAGE, (pg + 1) * PAGE);
  const card = UI.card({
    title: "Produk Lainnya", icon: "box",
    sub: a.length ? `${a.length} produk tersedia \u2014 pilih produk di bawah untuk melihat detail.` : "Belum ada produk yang dijual.",
    headers: ["Produk", "Harga"],
    rows: slice.length ? slice.map((p) => ["box", esc(clip(p.name, 36)), `<b>${rp(p.price)}</b>`]) : [["info", "Produk", "Belum ada"]],
    note: pages > 1 ? `Halaman ${pg + 1} dari ${pages}` : "",
  });
  const kb = (fancy) => [
    ...slice.map((p) => [btn(fancy, `${clip(p.name, 26)} \u00B7 ${rp(p.price)}`, `prd:v:${p.id}`, "primary", UI.E.box)]),
    ...(pages > 1 ? [[btn(fancy, "\u25C0\uFE0F Prev", `prd:l:${(pg - 1 + pages) % pages}`, "primary"), btn(fancy, "Next \u25B6\uFE0F", `prd:l:${(pg + 1) % pages}`, "primary")]] : []),
    [btn(fancy, "Kembali", "sr:h", "danger", UI.E.wave)],
  ];
  return { c: card, kb };
}

function detailCard(p, uid) {
  const c = UI.card({
    title: esc(clip(p.name, 60)), icon: "box",
    rows: [
      ["tag", "ID Produk", `<code>${esc(p.id)}</code>`],
      ["chart", "Harga", `<b>${rp(p.price)}</b>`],
      ["gem", "Isi", esc(summary(p.items))],
      ["star", "Terjual", `<b>${Number(p.sold) || 0}</b>`],
    ],
    extra: p.desc ? `<blockquote>${esc(p.desc).replace(/\n/g, "<br>")}</blockquote>` : "",
    checks: [[true, "Bayar via QRIS (e-wallet / m-banking)"], [true, "Data produk dikirim otomatis setelah lunas"]],
  });
  const kb = (fancy) => [
    [btn(fancy, isOwner(uid) ? `Ambil Gratis (Owner) \u00B7 ${rp(p.price)}` : `Beli \u00B7 ${rp(p.price)}`, `prd:b:${p.id}`, "success", UI.E.crown)],
    ...(isOwner(uid) ? [[btn(fancy, "Hapus Produk", `prd:d:${p.id}`, "danger", UI.E.no)]] : []),
    [btn(fancy, "Kembali", "prd:l:0", "primary", UI.E.wave)],
  ];
  return { c, kb };
}

function manageCard() {
  const a = all();
  const c = UI.card({
    title: "Kelola Produk", icon: "box",
    rows: [["box", "Total produk", `<b>${a.length}</b>`], ["chart", "Total terjual", `<b>${a.reduce((n, p) => n + (Number(p.sold) || 0), 0)}</b>`]],
    checks: [[true, "Tambah produk: nama, harga, deskripsi, data (file / foto / teks)"], [true, "Produk tampil di menu PRODUK LAINNYA"]],
    note: "Perintah cepat: <code>/addproduk</code> \u00B7 <code>/delproduk ID</code> \u00B7 <code>/listproduk</code>",
  });
  const kb = (fancy) => [
    [btn(fancy, "Tambah Produk", "prd:add", "success", UI.E.rocket)],
    [btn(fancy, "Hapus Produk", "prd:dl", "danger", UI.E.no)],
    [btn(fancy, "Daftar Produk", "prd:l:0", "primary", UI.E.box)],
    [btn(fancy, "Kembali", "sr:h", "primary", UI.E.wave)],
  ];
  return { c, kb };
}

// ---------------------------------------------------------------- pesanan (QRIS)
const waitingOrder = (uid) => db.orders().filter((o) => o.kind === "product" && o.status === WAIT && String(o.userId) === String(uid)).sort((a, b) => b.no - a.no)[0] || null;
const waitKb = (no) => (fancy) => [[btn(fancy, "Cek Status", `prd:c:${no}`, "success", UI.E.ok), btn(fancy, "Batal", `prd:x:${no}`, "danger", UI.E.no)]];
const backKb = (fancy) => [[btn(fancy, "Kembali", "prd:l:0", "primary", UI.E.wave)]];
const fullName = (u) => [u.first_name, u.last_name].filter(Boolean).join(" ") || "-";

async function sendPhotoBuf(chatId, buf, caption, markup) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("photo", new Blob([buf], { type: require("./gateway").mimeOf(buf) }), "qris.png");
  form.append("caption", require("./lang").html(caption));
  form.append("parse_mode", "HTML");
  if (markup) form.append("reply_markup", JSON.stringify(markup));
  const res = await fetch(`https://api.telegram.org/bot${cfg.bot_token}/sendPhoto`, { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) throw new Error(`sendPhoto: ${j.description || "HTTP " + res.status}`);
  return j.result;
}

function payCard(o, r, note) {
  return UI.card({
    title: "Menunggu Pembayaran", icon: "time",
    rows: [
      ["tag", "Invoice", `<code>${esc(inv(o.no))}</code>`],
      ["box", "Produk", `<b>${esc(clip(o.productName, 40))}</b>`],
      ["chart", "Harga", rp(r.amount)],
      ["bolt", "Total bayar", `<b>${rp(r.total || r.amount)}</b>`],
      ...(r.expiredAt ? [["time", `Kedaluwarsa (${esc(TZL)})`, esc(fmtTime(r.expiredAt))]] : []),
      ...(r.payment_url ? [["link", "Halaman bayar", `<a href="${esc(r.payment_url)}">Buka halaman bayar</a>`]] : []),
    ],
    checks: [[true, "Scan QRIS pada gambar di bawah"], [false, r.provider === "manual" ? "Kirim screenshot bukti bayar ke chat ini, lalu tunggu konfirmasi owner" : "Tunggu \u2014 data produk dikirim otomatis setelah lunas"]],
    note,
  });
}

async function completeOrder(no) {
  const o = db.getOrder(no);
  if (!o || o.kind !== "product" || o.status === "gw_paid") return;
  o.status = "gw_paid"; // tukar dulu supaya panggilan ganda (hook + cek manual) tidak mengirim dua kali
  o.paidAt = Date.now();
  db.setOrder(no, o);
  const uid = String(o.userId);
  const cur = find(o.productId);
  if (cur) saveAll(all().map((p) => (String(p.id) === String(o.productId) ? { ...p, sold: (Number(p.sold) || 0) + 1 } : p)));
  if (o.qrMsg) await tg("deleteMessage", { chat_id: o.qrMsg.chat_id, message_id: o.qrMsg.message_id }).catch(() => {});
  await UI.sendCard(uid, UI.card({
    title: "Pembayaran Berhasil", icon: "ok",
    rows: [["tag", "Invoice", `<code>${esc(inv(o.no))}</code>`], ["box", "Produk", `<b>${esc(clip(o.productName, 40))}</b>`], ["chart", "Dibayar", `<b>${rp(o.price)}</b>`]],
    checks: [[true, "Pembayaran diterima"], [true, "Data produk dikirim di bawah ini"]],
  }), (fancy) => [[btn(fancy, "Produk Lainnya", "prd:l:0", "primary", UI.E.box)]]).catch((e) => console.error("[produk] kartu sukses:", e.message));
  const fail = await deliver(uid, o.items);
  if (fail) await tgRaw("sendMessage", { chat_id: uid, text: `\u26A0\uFE0F ${fail} data produk gagal terkirim. Hubungi owner dengan menyebut invoice ${inv(o.no)}.` }).catch(() => {});
  try {
    require("./notify").fire("produk", { id: uid, first_name: o.name, username: o.username }, [
      ["Invoice", `<code>${esc(inv(o.no))}</code>`], ["Produk", `<b>${esc(o.productName)}</b>`], ["Dibayar", `<b>${rp(o.price)}</b>`], ["Gateway", gw.labelOf(o.txId)],
    ]);
  } catch (_) {}
}

async function endOrder(no, st) {
  const o = db.getOrder(no);
  if (!o || o.kind !== "product" || o.status !== WAIT) return;
  o.status = st === "expired" ? "gw_expired" : "gw_cancel";
  db.setOrder(no, o);
  if (o.qrMsg) await tg("deleteMessage", { chat_id: o.qrMsg.chat_id, message_id: o.qrMsg.message_id }).catch(() => {});
  await UI.sendCard(o.userId, UI.card({
    title: st === "expired" ? "QRIS Kedaluwarsa" : "Pesanan Dibatalkan", icon: st === "expired" ? "time" : "no",
    rows: [["tag", "Invoice", `<code>${esc(inv(o.no))}</code>`], ["box", "Produk", `<b>${esc(clip(o.productName, 40))}</b>`], ["chart", "Harga", `<b>${rp(o.price)}</b>`]],
    note: st === "expired" ? "Waktu pembayaran habis. Pilih produk lagi untuk membuat QRIS baru." : "Tekan Kembali bila ingin membeli lagi.",
  }), backKb).catch(() => {});
}
const watchOrder = (o) => gw.watch(o.txId, { onPaid: () => completeOrder(o.no), onEnd: (_r, st) => endOrder(o.no, st) });

// ---------------------------------------------------------------- pendaftaran
const wiz = new Map(); // ownerId -> { step: name|price|desc|data, d: {name, price, desc, items[]} }

function register(bot) {
  const refOf = (ctx) => { const m = ctx.callbackQuery.message; return { chat_id: m.chat.id, message_id: m.message_id }; };
  const alert = (ctx, text) => ctx.answerCallbackQuery({ text, show_alert: true });
  const card = (ctx, c, kb) => UI.sendCard(ctx.chat ? ctx.chat.id : ctx.from.id, c, kb);

  // sambung kembali pantauan pesanan yang belum selesai (setelah restart)
  for (const o of db.orders()) {
    if (o.kind !== "product" || !o.txId) continue;
    if (o.status === "gw_expired" && gw.lateOpen(o.txId)) { watchOrder(o); continue; } // AGW masih menerima bayaran 20 menit setelah kedaluwarsa
    if (o.status !== WAIT) continue;
    const t = gw.get(o.txId);
    if (t && t.status === "completed") completeOrder(o.no).catch(() => {});
    else if (t && (t.status === "expired" || t.status === "cancelled")) endOrder(o.no, t.status).catch(() => {});
    else watchOrder(o);
  }

  // ----- BELI SC: arahkan chat owner -----
  bot.callbackQuery("buysc", async (ctx) => {
    await ctx.answerCallbackQuery();
    const c = UI.card({
      title: "Beli Source Code", icon: "crown",
      rows: [["gem", "Script", `<b>${esc(cfg.brand || "UBOT ARTA PEDIA")}</b>`], ["user", "Pembelian", "Lewat chat langsung dengan owner"]],
      checks: [[true, "Tanyakan harga dan isi source code"], [true, "Pembayaran dan serah terima dilakukan oleh owner"]],
      note: "Tekan <b>Chat Owner</b> di bawah untuk memulai.",
    });
    return UI.editCard(refOf(ctx), c, (fancy) => [
      [{ text: "Chat Owner", url: scUrl(), ...(fancy ? { style: "success" } : {}) }],
      [btn(fancy, "Kembali", "sr:h", "danger", UI.E.wave)],
    ]);
  });

  // ----- menu produk -----
  bot.callbackQuery(/^prd:(\w+)(?::(\d+))?$/, async (ctx) => {
    const [, act, arg] = ctx.match;
    const uid = ctx.from.id;
    const m = ctx.callbackQuery.message;
    if (!m || m.chat.type !== "private") return alert(ctx, "Gunakan tombol ini di chat pribadi bot.");
    const ref = refOf(ctx);

    if (act === "l") {
      await ctx.answerCallbackQuery();
      const l = listCard(Number(arg) || 0);
      return UI.editCard(ref, l.c, l.kb);
    }
    if (act === "v") {
      const p = find(arg);
      if (!p) return alert(ctx, "Produk tidak ditemukan (mungkin sudah dihapus).");
      await ctx.answerCallbackQuery();
      const d = detailCard(p, uid);
      return UI.editCard(ref, d.c, d.kb);
    }

    // --- owner ---
    if (["m", "add", "dl", "d", "dy", "wc", "wd"].includes(act)) {
      if (!isOwner(uid)) return alert(ctx, "Khusus owner.");
      await ctx.answerCallbackQuery();
      if (act === "m") { const mc = manageCard(); return UI.editCard(ref, mc.c, mc.kb); }
      if (act === "add") return startAdd(ctx.chat ? ctx.chat.id : uid, uid);
      if (act === "wc") { wiz.delete(String(uid)); const mc = manageCard(); return UI.sendCard(m.chat.id, mc.c, mc.kb); }
      if (act === "wd") return finishAdd(m.chat.id, uid);
      if (act === "dl") {
        const a = all();
        const c = UI.card({ title: "Hapus Produk", icon: "no", rows: a.length ? a.map((p) => ["box", esc(clip(p.name, 36)), `ID <code>${esc(p.id)}</code>`]) : [["info", "Produk", "Belum ada"]], note: a.length ? "Pilih produk yang dihapus." : "" });
        return UI.editCard(ref, c, (fancy) => [
          ...a.slice(0, 20).map((p) => [btn(fancy, `Hapus: ${clip(p.name, 28)}`, `prd:d:${p.id}`, "danger", UI.E.no)]),
          [btn(fancy, "Kembali", "prd:m", "primary", UI.E.wave)],
        ]);
      }
      if (act === "d") {
        const p = find(arg);
        if (!p) return alert(ctx, "Produk tidak ditemukan.");
        const c = UI.card({ title: "Hapus Produk?", icon: "no", rows: [["box", "Produk", `<b>${esc(clip(p.name, 40))}</b>`], ["chart", "Harga", rp(p.price)]], note: "Produk dihapus permanen dari daftar." });
        return UI.editCard(ref, c, (fancy) => [[btn(fancy, "Ya, Hapus", `prd:dy:${p.id}`, "danger", UI.E.no), btn(fancy, "Batal", "prd:m", "primary", UI.E.wave)]]);
      }
      if (act === "dy") {
        const p = delProduct(arg);
        const c = UI.card({ title: p ? "Produk Dihapus" : "Tidak Ditemukan", icon: p ? "ok" : "no", rows: [["box", "Produk", p ? `<b>${esc(clip(p.name, 40))}</b>` : "-"]] });
        return UI.editCard(ref, c, (fancy) => [[btn(fancy, "Kelola Produk", "prd:m", "primary", UI.E.box)]]);
      }
    }

    // --- pembeli ---
    if (act === "b") {
      const p = find(arg);
      if (!p) return alert(ctx, "Produk tidak ditemukan (mungkin sudah dihapus).");
      if (isOwner(uid)) { // owner: kirim langsung untuk uji coba
        await ctx.answerCallbackQuery({ text: "Mode owner: data produk dikirim langsung." });
        await deliver(uid, p.items);
        return;
      }
      if (!creds()) return alert(ctx, "Payment gateway belum aktif. Hubungi owner.");
      const w = waitingOrder(uid);
      if (w) return alert(ctx, `Anda masih punya pembayaran menunggu (${inv(w.no)}). Selesaikan atau tekan Batal dulu.`);
      await ctx.answerCallbackQuery({ text: "Membuat QRIS..." });

      const no = db.nextReqNo();
      const o = {
        no, kind: "product", userId: String(uid), name: fullName(ctx.from), username: ctx.from.username || null,
        productId: p.id, productName: p.name, items: p.items, price: p.price, method: "gateway", status: "gw_creating", createdAt: Date.now(),
      };
      db.setOrder(no, o);
      let r;
      try {
        r = await gw.create(creds(), { userId: ownerId(), amount: p.price, note: `Produk ${p.name} - ${ctx.from.username ? "@" + ctx.from.username : o.name} (${uid})`, chat: String(uid) });
      } catch (e) {
        o.status = "gw_cancel"; db.setOrder(no, o);
        console.error("[produk] buat QRIS gagal:", e.message);
        return UI.editCard(ref, UI.card({ title: "Gagal Membuat QRIS", icon: "no", rows: [["no", "Sebab", esc(e.message)]], note: "Coba lagi sebentar, atau hubungi owner." }), backKb);
      }
      o.txId = r.id; o.status = WAIT; db.setOrder(no, o);
      watchOrder(o);

      let img;
      try {
        if (r.qr_url) {
          const res = await fetch(r.qr_url, { signal: AbortSignal.timeout(20000) });
          if (!res.ok) throw new Error("HTTP " + res.status);
          img = Buffer.from(await res.arrayBuffer());
        } else if (r.qris_image && /^data:image\/(png|jpe?g|webp);base64,/.test(r.qris_image)) img = Buffer.from(r.qris_image.split(",")[1], "base64");
        else if (r.payload) img = qr.png(qr.matrix(r.payload), 10);
        else throw new Error("gateway tidak mengembalikan gambar QR");
      } catch (e) {
        o.status = "gw_cancel"; db.setOrder(no, o);
        console.error("[produk] ambil QR gagal:", e.message);
        return UI.editCard(ref, UI.card({ title: "Gagal Mengambil QR", icon: "no", rows: [["no", "Sebab", esc(e.message)]], note: "Tekan Kembali lalu coba lagi." }), backKb);
      }
      let sent = null;
      const caption = `<b>QRIS ${esc(clip(o.productName, 40))}</b>\n\u26A1 Total bayar: <b>${rp(r.total || r.amount)}</b>${r.provider === "manual" ? `\n\uD83D\uDFE2 Scan QRIS ini, bayar <b>tepat</b> sesuai total, lalu <b>kirim screenshot bukti bayar ke chat ini</b>.\n\u23F3 Data produk setelah owner mengonfirmasi (ACCEPT).` : `\n\uD83D\uDFE2 Scan QR ini \u2014 data produk dikirim <b>otomatis</b> setelah lunas.\n\u2757 Bayar <b>persis</b> sesuai total (sudah termasuk ${r.provider === "austin" ? "biaya & kode unik" : "kode unik"}).`}`;
      for (const fancy of premiumOn() ? [true, false] : [false]) {
        try { sent = await sendPhotoBuf(m.chat.id, img, caption, { inline_keyboard: waitKb(no)(fancy) }); break; } catch (e) { console.error("[produk] kirim QR gagal:", e.message); }
      }
      if (sent) { o.qrMsg = { chat_id: m.chat.id, message_id: sent.message_id }; db.setOrder(no, o); }
      return UI.editCard(ref, payCard(o, r, sent ? "" : "QR gagal dimuat. Buka <b>Halaman bayar</b> di atas, lalu tekan <b>Cek Status</b>."), sent ? null : waitKb(no));
    }
    if (act === "c" || act === "x") {
      const o = db.getOrder(arg);
      if (!o || o.kind !== "product" || String(o.userId) !== String(uid)) return alert(ctx, "Pesanan tidak ditemukan.");
      if (act === "c") {
        if (o.status === "gw_paid") return ctx.answerCallbackQuery({ text: "Sudah lunas \u2705 Data produk sudah dikirim." });
        if (o.status !== WAIT) return alert(ctx, "Pesanan ini sudah tidak aktif.");
        const t = gw.get(o.txId);
        let st = t ? t.status : "pending";
        if (st === "pending") {
          try { st = (await gw.status(creds(), o.txId, o.price)).status || st; } catch (e) { return ctx.answerCallbackQuery({ text: "Belum bisa dicek: " + e.message.slice(0, 120), show_alert: true }); }
        }
        if (st === "completed") { await ctx.answerCallbackQuery({ text: "Pembayaran terdeteksi \u2705 Mengirim data..." }); return completeOrder(o.no); }
        if (st === "expired" || st === "cancelled") { await ctx.answerCallbackQuery({ text: "QRIS sudah kedaluwarsa." }); return endOrder(o.no, st); }
        return alert(ctx, "Belum ada pembayaran. Selesaikan scan QRIS lalu cek lagi sebentar \u23F3");
      }
      if (o.status !== WAIT) return alert(ctx, "Pesanan ini sudah tidak aktif.");
      await ctx.answerCallbackQuery({ text: "Pesanan dibatalkan." });
      await endOrder(o.no, "cancelled");
      try { const t = o.txId && gw.get(o.txId); if (t) await gw.cancelTx(t); } catch (e) { console.error("[produk] batal di gateway:", e.message); }
    }
  });

  // ----- wizard tambah produk (owner) -----
  const cancelKb = (fancy) => [[btn(fancy, "Batal", "prd:wc", "danger", UI.E.no)]];
  const doneKb = (fancy) => [[btn(fancy, "Selesai", "prd:wd", "success", UI.E.ok), btn(fancy, "Batal", "prd:wc", "danger", UI.E.no)]];
  async function startAdd(chatId, uid) {
    wiz.set(String(uid), { step: "name", d: { items: [] } });
    return UI.sendCard(chatId, UI.card({ title: "Tambah Produk (1/4)", icon: "box", rows: [["info", "Langkah", "Kirim <b>nama produk</b>"]], note: "Ketik /batal untuk membatalkan." }), cancelKb);
  }
  async function finishAdd(chatId, uid) {
    const s = wiz.get(String(uid));
    if (!s || s.step !== "data") return;
    if (!s.d.items.length) return UI.sendCard(chatId, UI.card({ title: "Data Kosong", icon: "no", rows: [["info", "Sebab", "Kirim minimal satu data produk (file / foto / teks) dulu"]] }), doneKb);
    const p = addProduct(s.d);
    wiz.delete(String(uid));
    return UI.sendCard(chatId, UI.card({
      title: "Produk Ditambahkan", icon: "ok",
      rows: [["tag", "ID", `<code>${esc(p.id)}</code>`], ["box", "Nama", `<b>${esc(clip(p.name, 40))}</b>`], ["chart", "Harga", `<b>${rp(p.price)}</b>`], ["gem", "Isi", esc(summary(p.items))]],
      note: "Produk sudah tampil di menu PRODUK LAINNYA.",
    }), (fancy) => [[btn(fancy, "Kelola Produk", "prd:m", "primary", UI.E.box)]]);
  }

  bot.on("message", async (ctx, next) => {
    const st = ctx.from && wiz.get(String(ctx.from.id));
    if (!st || !ctx.chat || ctx.chat.type !== "private" || !isOwner(ctx.from.id)) return next();
    const m = ctx.message;
    const text = String(m.text || "").trim();
    if (/^\/batal\b/i.test(text)) { wiz.delete(String(ctx.from.id)); return card(ctx, UI.card({ title: "Dibatalkan", icon: "no", rows: [["info", "Status", "Penambahan produk dibatalkan"]] })); }
    if (/^\/selesai\b/i.test(text) && st.step === "data") return finishAdd(ctx.chat.id, ctx.from.id);
    if (text.startsWith("/")) return next(); // perintah lain berjalan normal
    if (st.step === "name") {
      if (!text) return card(ctx, UI.card({ title: "Nama Kosong", icon: "no", rows: [["info", "Cara", "Kirim nama produk dalam bentuk teks"]] }), cancelKb);
      st.d.name = text.slice(0, 80); st.step = "price";
      return card(ctx, UI.card({ title: "Tambah Produk (2/4)", icon: "box", rows: [["box", "Nama", `<b>${esc(st.d.name)}</b>`], ["info", "Langkah", `Kirim <b>harga</b> (angka rupiah, minimal ${rp(MIN_PRICE)})`]] }), cancelKb);
    }
    if (st.step === "price") {
      const price = Number(text.replace(/[^\d]/g, ""));
      if (!(price >= MIN_PRICE && price <= 100000000)) return card(ctx, UI.card({ title: "Harga Tidak Valid", icon: "no", rows: [["info", "Contoh", `<code>15000</code> (minimal ${rp(MIN_PRICE)})`]] }), cancelKb);
      st.d.price = price; st.step = "desc";
      return card(ctx, UI.card({ title: "Tambah Produk (3/4)", icon: "box", rows: [["chart", "Harga", `<b>${rp(price)}</b>`], ["info", "Langkah", "Kirim <b>deskripsi</b> produk (teks)"]] }), cancelKb);
    }
    if (st.step === "desc") {
      if (!text) return card(ctx, UI.card({ title: "Deskripsi Kosong", icon: "no", rows: [["info", "Cara", "Kirim deskripsi dalam bentuk teks"]] }), cancelKb);
      st.d.desc = text.slice(0, 1500); st.step = "data";
      return card(ctx, UI.card({
        title: "Tambah Produk (4/4)", icon: "box",
        rows: [["info", "Langkah", "Kirim <b>data produk</b> yang diterima pembeli"]],
        checks: [[true, "Boleh: file, foto, video, audio, voice, gif, stiker, atau teks biasa"], [true, "Boleh kirim beberapa pesan satu per satu"], [false, "Tekan <b>Selesai</b> atau ketik /selesai bila sudah"]],
      }), doneKb);
    }
    if (st.step === "data") {
      const it = itemOf(m);
      if (!it) return card(ctx, UI.card({ title: "Jenis Pesan Belum Didukung", icon: "no", rows: [["info", "Gunakan", "file, foto, video, audio, voice, gif, stiker, atau teks"]] }), doneKb);
      if (st.d.items.length >= 30) return card(ctx, UI.card({ title: "Sudah Penuh", icon: "no", rows: [["info", "Batas", "Maksimal 30 data per produk. Tekan Selesai."]] }), doneKb);
      st.d.items.push(it);
      return card(ctx, UI.card({ title: "Data Tersimpan", icon: "ok", rows: [["gem", `Data ke-${st.d.items.length}`, esc(TYPE_LABEL[it.type] || it.type)], ["box", "Isi sekarang", esc(summary(st.d.items))]], note: "Kirim data lain, atau tekan <b>Selesai</b>." }), doneKb);
    }
    return next();
  });

  // ----- perintah owner -----
  const guard = (fn) => async (ctx) => { if (ctx.chat && ctx.chat.type === "private" && isOwner(ctx.from.id)) return fn(ctx); };
  bot.command("addproduk", guard((ctx) => startAdd(ctx.chat.id, ctx.from.id)));
  bot.command("delproduk", guard((ctx) => {
    const id = String(ctx.match || "").trim();
    if (!id) return card(ctx, UI.card({ title: "Cara Guna", icon: "gear", rows: [["tag", "Guna", "<code>/delproduk ID</code>"], ["info", "Lihat ID", "<code>/listproduk</code>"]] }));
    const p = delProduct(id);
    return card(ctx, UI.card({ title: p ? "Produk Dihapus" : "Tidak Ditemukan", icon: p ? "ok" : "no", rows: [["box", "Produk", p ? `<b>${esc(clip(p.name, 40))}</b>` : esc(id)]] }));
  }));
  bot.command("listproduk", guard((ctx) => {
    const a = all();
    return card(ctx, UI.card({
      title: `Daftar Produk (${a.length})`, icon: "box", headers: ["Produk", "Harga \u00B7 ID"],
      rows: a.length ? a.slice(0, 40).map((p) => ["box", esc(clip(p.name, 36)), `<b>${rp(p.price)}</b> \u00B7 <code>${esc(p.id)}</code>`]) : [["info", "Produk", "Belum ada"]],
    }), manageCard().kb);
  }));
}

module.exports = { register, all, find, _completeOrder: completeOrder, _deliver: deliver };

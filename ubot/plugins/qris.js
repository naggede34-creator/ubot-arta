// Pembayaran QRIS dengan nominal sendiri (dinamik) daripada QRIS statik anda:
//   .setqris        balas gambar QRIS (perlu: npm i jsqr pngjs jpeg-js) ATAU .setqris <teks QRIS 000201...>
//   .qris 25000 [catatan]   hasilkan QR bayar dengan nominal itu
//   .setnorek bank|no|nama  simpan rekening / e-wallet     .norek  paparkan rekening
// Nota: QRIS statik = QR bayar dengan jumlah tetap tanpa pengesahan automatik (anda semak sendiri).
// PAYMENT GATEWAY (AGW / SMP Payment) - pengesahan bayaran AUTOMATIK:
//   .setagw <api_key> [secret]     sambung gateway (kunci agw_live_... dari admin gateway)   .delgateway putuskan
//   .qris 1000 [catatan]           QR bayar daripada gateway; caption bertukar "LUNAS" sebaik bayaran diterima
//   .qriscek [invois]  .qriscancel <invois>  .gateway (status)
const db = require("../db");
const K = require("../kit");
const { esc, UserErr } = K;
const { card, show, footerOf, whoOf, clip } = require("../ui");
const { showPanel, updatePanel } = require("../panel");
const qris = require("../qris");
const gw = require("../gateway");
const qr = require("../qr");
const { parseMoney, money } = require("../money");
const { fmtTime, TZL } = require("../core");

const rec = (account) => db.getUser(account.userId) || {};

// Dekod QR daripada gambar (pilihan: jsqr + pngjs / jpeg-js)
function decodeImage(buf) {
  let jsQR;
  try { jsQR = require("jsqr"); } catch (_) {
    throw new UserErr("Dekod gambar perlu pakej jsqr. Jalankan: npm i jsqr pngjs jpeg-js  - atau tampal teks QRIS: .setqris 000201...");
  }
  let img;
  if (buf[0] === 0x89) {
    const { PNG } = require("pngjs");
    const p = PNG.sync.read(buf);
    img = { data: new Uint8ClampedArray(p.data), width: p.width, height: p.height };
  } else {
    const jpeg = require("jpeg-js");
    const p = jpeg.decode(buf, { useTArray: true });
    img = { data: new Uint8ClampedArray(p.data), width: p.width, height: p.height };
  }
  const r = jsQR(img.data, img.width, img.height);
  if (!r || !r.data) throw new UserErr("QR tidak dapat dibaca daripada gambar. Cuba gambar lebih jelas atau tampal teks QRIS.");
  return r.data;
}

async function setqris(ctx) {
  const { msg, account, client } = ctx;
  let payload = String(msg.message || "").replace(/^\S+\s*/, "").replace(/[\r\n]+/g, "").trim(); // spasi dalam nama merchant dikekalkan
  if (!payload) {
    const rm = await msg.getReplyMessage().catch(() => null);
    if (rm && rm.message && /^000201/.test(rm.message.trim())) payload = rm.message.trim();
    else if (rm && (rm.photo || rm.media)) {
      const buf = await client.downloadMedia(rm, {}).catch(() => null);
      if (!buf) throw new UserErr("Gagal memuat turun gambar.");
      payload = decodeImage(Buffer.from(buf));
    }
  }
  if (!payload) throw new UserErr("Guna: .setqris <teks QRIS 000201...>  atau balas gambar QRIS dengan .setqris");
  let info;
  try { info = qris.check(payload); } catch (e) { throw new UserErr(e.message); }
  db.upsertUser(account.userId, { qris: { payload: payload.trim(), merchant: info.merchant, city: info.city } });
  await show(ctx, card({
    title: "QRIS Disimpan", icon: "ok",
    rows: [
      ["tag", "Merchant", esc(clip(info.merchant || "-", 40))],
      ["box", "Bandar", esc(clip(info.city || "-", 30))],
      ["chart", "Jenis", info.isStatic ? "Statik (akan dijadikan dinamik)" : "Dinamik"],
      ["green", "CRC", info.crcOk ? "Sah" : "Tidak sepadan (diperbaiki ketika .qris)"],
    ],
    checks: [[true, "Guna .qris <nominal> untuk QR bayar"]],
    footer: footerOf(account),
  }));
}

async function qrisCmd(ctx) {
  const { msg, args, account, client } = ctx;
  const creds = gw.credsFor(account.userId);
  if (creds) return qrisGateway(ctx, creds);
  const q = rec(account).qris;
  if (!q) throw new UserErr("QRIS belum disimpan. Guna .setqris (QRIS statik)  (payment gateway automatik) dulu.");
  if (!args.length) throw new UserErr("Guna: .qris <nominal> [catatan]  (contoh: .qris 25000 topup)");
  const amount = parseMoney(args[0]);
  if (!(amount > 0)) throw new UserErr("Nominal tidak sah. Contoh: .qris 25000 | .qris 10k | .qris 1,5jt");
  const note = args.slice(1).join(" ").slice(0, 100);
  let payload;
  try { payload = qris.dynamic(q.payload, amount); } catch (e) { throw new UserErr(e.message); }
  const png = qr.png(qr.matrix(payload), 10);
  const { CustomFile } = require("telegram/client/uploads");
  await client.sendFile(msg.peerId, {
    file: new CustomFile("qris.png", png.length, "", png),
    caption: `QRIS ${money(amount)}`,
    replyTo: msg.id,
    forceDocument: false,
  });
  const c = card({
    title: "Pembayaran QRIS", icon: "gem",
    rows: [
      ["gem", "Nominal", `<b>${esc(money(amount))}</b>`],
      ["tag", "Penerima", esc(clip(q.merchant || "-", 40))],
      ...(note ? [["box", "Catatan", esc(note)]] : []),
      ["time", "Masa", `${esc(fmtTime(Date.now()))} ${esc(TZL)}`],
      ["green", "Status", "menunggu pembayaran"],
    ],
    checks: [[true, "Imbas QR di atas dengan e-wallet / m-banking"], [false, "Hantar bukti bayar selepas membayar"]],
    footer: footerOf(account),
  });
  try {
    await showPanel({ client, msg, account, html: c.html, text: c.text });
    await msg.delete({ revoke: true }).catch(() => {});
  } catch (e) {
    await K.edit(ctx, `QRIS ${money(amount)} - menunggu pembayaran`);
  }
}

// ---------------------------------------------------------------- payment gateway (AGW)
const STATUS_LABEL = { pending: "menunggu pembayaran", completed: "\u2705 LUNAS - pembayaran diterima", expired: "\u231B tamat tempoh", cancelled: "\u274C dibatalkan" };

function gwCaption(r, label) {
  return [
    `💎 <b>PEMBAYARAN QRIS</b>`,
    `💰 Nominal: ${money(r.amount)}`,
    `🧾 ${r.provider === "austin" ? "Biaya + kode unik" : "Kode unik"}: ${money(r.fee || 0)}`,
    `💳 Total bayar: ${money(r.total || r.amount)}`,
    `🆔 ID: ${r.id}`,
    ...(r.note ? [`📝 Catatan: ${r.note}`] : []),
    r.status === "pending" ? `⏳ Status: Menunggu pembayaran` : `✨ Status: ${label}`,
    r.status === "pending" && r.expiredAt ? `⌛ Kedaluwarsa: ${fmtTime(r.expiredAt)} ${TZL}` : "",
    r.payment_url ? `🔗 Halaman bayar: ${r.payment_url}` : "",
  ].filter(Boolean).join("\n");
}

async function qrisGateway(ctx, creds) {
  const { msg, args, account, client } = ctx;
  if (!args.length) throw new UserErr("Guna: .qris <nominal> [catatan]  (contoh: .qris 1000 topup)");
  const amount = parseMoney(args[0]);
  if (!(amount > 0)) throw new UserErr("Nominal tidak sah. Contoh: .qris 1000 | .qris 10k | .qris 1,5jt");
  const note = args.slice(1).join(" ").slice(0, 100);

  let r;
  try {
    r = await gw.create(creds, { userId: account.userId, amount, note, chat: String(msg.chatId !== undefined ? msg.chatId : "") });
  } catch (e) {
    throw new UserErr("Gateway gagal: " + e.message);
  }
  let imageBytes;
  if (r.qr_url) {
    const res = await fetch(r.qr_url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new UserErr(`Gagal mengambil gambar QR dari gateway (HTTP ${res.status}).`);
    imageBytes = Buffer.from(await res.arrayBuffer());
  } else if (r.qris_image && /^data:image\/png;base64,/.test(r.qris_image)) {
    imageBytes = Buffer.from(r.qris_image.split(",")[1], "base64");
  } else if (r.payload) {
    imageBytes = qr.png(qr.matrix(r.payload), 10);
  } else {
    throw new UserErr("Gateway tidak mengembalikan gambar QR yang bisa digunakan.");
  }
  const { CustomFile } = require("telegram/client/uploads");
  const when = (ms) => `${fmtTime(ms)} ${TZL}`;

  // Kartu Rich: judul -> keterangan -> GAMBAR QR (di dalam kartu) -> tabel info -> daftar centang -> footer
  const IMG = '<img src="tg://photo?id=qrimg"/>';
  const statusCard = (x, st, withImg) => card({
    title: st === "pending" ? "QRIS Pembayaran" : st === "completed" ? "QRIS Lunas" : st === "expired" ? "QRIS Kedaluwarsa" : "QRIS Dibatalkan",
    icon: st === "pending" ? "gem" : st === "completed" ? "ok" : st === "expired" ? "time" : "no",
    sub: st === "pending" ? "Scan QR menggunakan DANA, GoPay, atau aplikasi pembayaran yang mendukung QRIS." : "",
    extra: withImg ? IMG : "",
    extraFirst: true,
    rows: [
      ["fire", "Mode", "Gateway \u00B7 otomatis"],
      ["gem", "Nominal", `<b>${esc(money(x.amount))}</b>`],
      ["box", "Kode unik", esc(money(x.fee || 0))],
      ["bolt", "Total bayar", `<b>${esc(money(x.total || x.amount))}</b>`],
      ["tag", "ID", `<code>${esc(x.id)}</code>`],
      ...(x.note ? [["star", "Catatan", esc(x.note)]] : []),
      ...(st === "pending" && x.expiredAt ? [["time", "Kedaluwarsa", esc(when(x.expiredAt))]] : []),
      ...(st === "pending" && x.payment_url ? [["link", "Halaman bayar", `<a href="${esc(x.payment_url)}">Buka halaman bayar</a>`]] : []),
      [st === "completed" ? "green" : st === "pending" ? "user" : "no", "Status", `<b>${esc(STATUS_LABEL[st] || st)}</b>`],
    ],
    checks: st === "pending" ? [[true, "Nominal tertanam pada QR yang dibuat."], [true, "Status berubah LUNAS otomatis setelah dibayar."]] : [],
    footer: footerOf(account),
  });

  // QR masuk ke DALAM kartu: unggah sekali ke chat bot Anda (file_id), pesan sementara itu langsung dihapus
  let fileId = null;
  try { fileId = await require("../qrmedia").uploadPhoto(account.userId, imageBytes); }
  catch (e) { console.error("[qris] unggah QR untuk kartu gagal, kirim foto terpisah:", e.message); }

  // Cadangan: foto QR terpisah (dipakai jika QR tidak bisa dipasang di dalam kartu)
  let sent = null;
  const sendPhotoFallback = async () => {
    if (sent) return;
    sent = await client.sendFile(msg.peerId, {
      file: new CustomFile("qris.png", imageBytes.length, "", imageBytes),
      caption: `QRIS ${money(r.total || r.amount)} \u00B7 ${r.id}`,
      replyTo: msg.id,
      forceDocument: false,
    }).catch((e) => { console.error("[qris] kirim foto QR gagal:", e.message); return null; });
  };
  if (!fileId) await sendPhotoFallback();

  const c = statusCard(r, "pending", !!fileId);
  const media = fileId ? [{ id: "qrimg", media: { type: "photo", media: fileId } }] : null;
  let pid = null;
  try {
    pid = await showPanel({ client, msg, account, html: c.html, text: c.text, media, onMediaFail: sendPhotoFallback });
  } catch (e) {
    console.error("[qris] panel gagal, teks biasa:", e.message);
    await sendPhotoFallback();
    await client.sendMessage(msg.peerId, { message: gwCaption(r, STATUS_LABEL.pending), parseMode: "html", replyTo: msg.id }).catch(() => {});
  }

  // Selesai/berakhir: kartu diganti di tempat (jika inline feedback aktif); jika tidak, kartu baru dikirim
  const ghost = { peerId: msg.peerId, id: 0 }; // msg perintah akan dihapus -> tanpa balasan
  const finish = async (x, st) => {
    if (sent) await client.deleteMessages(msg.peerId, [sent.id], { revoke: true }).catch(() => {});
    const done = statusCard(x, st, false);
    if (pid && (await updatePanel(pid, { html: done.html, text: done.text, buttons: [], media: null }).catch(() => false))) return;
    try {
      await showPanel({ client, msg: ghost, account, html: done.html, text: done.text });
    } catch (e) {
      console.error("[qris] panel gagal, teks biasa:", e.message);
      await client.sendMessage(msg.peerId, { message: gwCaption(x, STATUS_LABEL[st] || st), parseMode: "html" }).catch(() => {});
    }
  };
  gw.watch(r.id, { onPaid: (x) => finish(x, "completed"), onEnd: (x, st) => finish(x, st) });
  await msg.delete({ revoke: true }).catch(() => {});
}


async function setagw(ctx) {
  const { args, account } = ctx;
  const [api_key, secret] = args;
  if (!api_key) throw new UserErr("Guna: .setagw <api_key> [secret]. Kunci agw_live_... diberikan admin gateway; secret (agw_sec_...) hanya bila diaktifkan admin. Disimpan privat dan tidak ditampilkan kembali.");
  if (!/^agw_/.test(api_key) || api_key.length < 20) throw new UserErr("API key tampak tidak sah. Kunci AGW diawali agw_live_ ... (minta ke admin gateway).");
  if (secret && !/^agw_sec_/.test(secret)) throw new UserErr("Secret tampak tidak sah. Secret AGW diawali agw_sec_ ... (kosongkan bila admin tidak mengaktifkannya).");
  const creds = { provider: "agw", api_key, secret: secret || "", base_url: "https://www.tokonokosarta.my.id/api/agw" };
  let info;
  try { info = await gw.ping(creds); } catch (e) { throw new UserErr("Kunci belum bisa dipakai: " + e.message); }
  db.upsertUser(account.userId, { gateway: creds });
  await K.edit(ctx, `✅ AGW tersambung (${info.app}). Batas nominal ${money(info.min_amount || 0)} - ${money(info.max_amount || 0)}. Gunakan .qris 5000 untuk membuat QRIS; status dicek otomatis tiap 5 detik. Pembeli harus membayar total persis (nominal + kode unik). (Pesan perintah ini berisi kunci, sebaiknya dihapus.)`);
  await ctx.msg.delete({ revoke: true }).catch(() => {});
}

async function delgateway(ctx) {
  const { account } = ctx;
  if (!(rec(account).gateway)) throw new UserErr("Tiada gateway yang disimpan.");
  db.upsertUser(account.userId, { gateway: null });
  await K.edit(ctx, "\u2705 Kredensial gateway dipadam. .qris kembali menggunakan QRIS statik jika tersedia.");
}

async function qriscek(ctx) {
  const { args, account } = ctx;
  const creds = gw.credsFor(account.userId);
  if (!creds) throw new UserErr("Gateway belum disambungkan. Guna .setagw <api_key> [secret].");
  const r = args[0] ? gw.get(args[0]) : gw.last(account.userId);
  if (!r || String(r.userId) !== String(account.userId)) throw new UserErr("Invois tidak dijumpai. Guna: .qriscek <invois>  (kosongkan untuk invois terakhir)");
  let st = r.status;
  if (st === "pending") {
    try { st = (await gw.status(creds, r.id, r.amount)).status || st; } catch (e) { throw new UserErr("Gagal menyemak: " + e.message); }
  }
  await K.edit(ctx, `Invois ${r.id}\nNominal ${money(r.amount)}${r.note ? `\nCatatan ${r.note}` : ""}\nStatus ${STATUS_LABEL[st] || st}`);
}


async function gatewayInfo(ctx) {
  const { account } = ctx;
  const creds = gw.credsFor(account.userId);
  if (!creds) throw new UserErr("Gateway belum disambungkan. Guna .setagw <api_key> [secret], kemudian .qris 5000.");
  const last = gw.last(account.userId);
  await K.edit(ctx,
    `Gateway: AGW / SMP Payment (QRIS)\nAkun: API key ****${String(creds.api_key).slice(-4)}${creds.secret ? " + tanda tangan HMAC" : ""}\nKredensial: ${creds.source === "config" ? "config.json (owner)" : "disimpan oleh anda"}\n` +
    `Invois menunggu: ${gw.pendingCount(account.userId)}${last ? `\nTerakhir: ${last.id} - ${STATUS_LABEL[last.status] || last.status}` : ""}`);
}

async function setnorek(ctx) {
  const { args, account } = ctx;
  const parts = args.join(" ").split("|").map((s) => s.trim());
  if (parts.length < 3 || !parts[0] || !parts[1]) throw new UserErr("Guna: .setnorek <bank>|<no rekening>|<atas nama>  (contoh: .setnorek DANA|08123456789|Budi)");
  const list = (rec(account).rek || []).filter((r) => r.bank.toLowerCase() !== parts[0].toLowerCase());
  list.push({ bank: parts[0].slice(0, 20), no: parts[1].slice(0, 40), nama: parts[2].slice(0, 40) });
  db.upsertUser(account.userId, { rek: list.slice(-10) });
  await show(ctx, card({
    title: "Rekening Disimpan", icon: "ok",
    rows: [["gem", "Bank", esc(parts[0])], ["tag", "No", `<code>${esc(parts[1])}</code>`], ["user", "Nama", esc(parts[2])]],
    checks: [[true, "Guna .norek untuk memaparkan semua rekening"]],
    footer: footerOf(account),
  }));
}

async function norek(ctx) {
  const { account, msg, client } = ctx;
  const list = rec(account).rek || [];
  if (!list.length) throw new UserErr("Belum ada rekening. Guna: .setnorek <bank>|<no>|<nama>");
  const c = card({
    title: "Rekening Pembayaran", icon: "gem",
    headers: ["Bank / Nama", "No Rekening"],
    rows: list.map((r) => ["gem", `${esc(r.bank)} - ${esc(r.nama)}`, `<code>${esc(r.no)}</code>`]),
    checks: [[true, "Sila hantar bukti bayar selepas transfer"]],
    footer: footerOf(account),
  });
  try {
    await showPanel({ client, msg, account, html: c.html, text: c.text });
    await msg.delete({ revoke: true }).catch(() => {});
  } catch (e) {
    await K.edit(ctx, list.map((r) => `${r.bank} ${r.no} a/n ${r.nama}`).join("\n"));
  }
}

const P = K.plugin("qris", "Utilitas", [
  { cmd: "setqris", desc: "simpan QRIS statik anda: balas gambar QRIS atau .setqris <teks 000201...>", run: setqris },
  { cmd: "qris", desc: "QRIS dinamis gateway AGW: .qris 1000 [catatan], status otomatis (bayar persis total + kode unik)", run: qrisCmd },
  { cmd: "setagw", desc: "sambung gateway AGW (SMP Payment): .setagw <api_key> [secret]", run: setagw },
  { cmd: "delgateway", desc: "putuskan gateway pembayaran", run: delgateway },
  { cmd: "qriscek", desc: "semak status invois gateway: .qriscek [invois]", run: qriscek },
  { cmd: "gateway", desc: "status sambungan payment gateway anda", run: gatewayInfo },
  { cmd: "setnorek", desc: "simpan rekening: .setnorek bank|no|nama", run: setnorek },
  { cmd: "norek", alias: ["rekening"], desc: "paparkan rekening pembayaran anda", run: norek },
]);
// Bot bermula: sambung semula pantauan invois gateway yang belum selesai
P.registerBot = () => gw.resumeAll();
module.exports = P;

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Api } = require("telegram");
const { shared, tg, esc, em, stripCustom, normId } = require("../core");
const { sendViaInlineAny, notifyAnswered } = require("../inline");

// ===== Emoji premium =====
const E = {
  mega: "6098421155897545579", // tajuk Broadcast
  info: "5258503720928288433", // header Info
  chart: "5231200819986047254", // ikon Status
  pin: "5397782960512444700", // Target / nota
  grp: "5350837894225358832", // ikon sebelum nama target
  ok: "5317020017521359483", // Terkirim / Selesai
  no: "5316999925664347033", // Gagal
  ban: "5240241223632954241", // Dilewati
  box: "5992390297533816030", // Total tujuan
  bolt: "5377396889652060561", // Durasi
  spin: "5386367538735104399", // Delay
  rocket: "5217880283860194582", // teks Lanjut
};
const BTN_ICON = "5260379144167890225"; // ikon pada butang

const NAMES = { g: "Group", c: "Channel", p: "Personal" };
const jobs = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const anySelected = (job) => job.targets.g || job.targets.c || job.targets.p;
const targetNames = (job) =>
  Object.keys(NAMES).filter((k) => job.targets[k]).map((k) => NAMES[k]).join(" + ");

// ===== Butang =====
const btn = (fancy, text, data, o = {}) => ({
  text,
  callback_data: data,
  ...(fancy && o.style ? { style: o.style } : {}),
  ...(fancy && o.icon ? { icon_custom_emoji_id: o.icon } : {}),
});

// ===== Skrin: setiap skrin ada versi Rich (html) dan versi teks biasa (text) =====
function screenTarget(job) {
  const intro =
    `Ketuk target untuk menandainya, boleh lebih dari satu. Tombol merah berarti belum dipilih, hijau \u2713 berarti dipilih. ` +
    `Centang ketiganya untuk menyapa semua. Tekan ${em(E.rocket, "\uD83D\uDE80")} Lanjut Pilih Cara Kirim kalau sudah.`;
  const note = `${em(E.pin, "\uD83D\uDCCC")} Minimal 1 target harus dipilih sebelum ${em(E.rocket, "\uD83D\uDE80")} Lanjut Pilih Cara Kirim aktif.`;

  const html =
    `<h3>${em(E.mega, "\uD83D\uDCE2")} Broadcast</h3>` +
    `<p>${intro}</p>` +
    `<table>` +
    `<tr><td>${em(E.spin, "\u23F3")} Delay</td><td>${job.delay}s</td></tr>` +
    `<tr><td>\uD83D\uDCAC Sumber</td><td>${esc(job.srcTitle)}</td></tr>` +
    `</table>` +
    `<p>${note}</p>`;

  const text =
    `${em(E.mega, "\uD83D\uDCE2")} <b>Broadcast</b>\n\n${intro}\n\n` +
    `${em(E.spin, "\u23F3")} Delay : <b>${job.delay}s</b>\n\uD83D\uDCAC Sumber : <b>${esc(job.srcTitle)}</b>\n\n${note}`;

  const kb = (f) => {
    const t = (k, label) =>
      btn(f, `${job.targets[k] ? "\u2713 " : ""}${label}`, `bc:${job.id}:${k}`, {
        style: job.targets[k] ? "success" : "danger",
      });
    return [
      [t("g", "\uD83D\uDC65 Group"), t("c", "\uD83D\uDCE2 Channel")],
      [t("p", "\uD83D\uDC64 Personal")],
      [
        btn(f, "Lanjut Pilih Cara Kirim", `bc:${job.id}:next`, {
          style: anySelected(job) ? "success" : undefined,
          icon: BTN_ICON,
        }),
      ],
    ];
  };
  return { html, text, kb };
}

function screenMode(job) {
  const a = `Target <b>${targetNames(job)}</b> dipilih. Sekarang pilih cara kirimnya.`;
  const b =
    `\u26A0\uFE0F <b>Forward message TIDAK DISARANKAN.</b> Banyak grup melarang anggota meneruskan pesan, ` +
    `dan bot penjaga akan menghapusnya langsung, jadi pesan terkirim lalu hilang tanpa jejak.`;
  const c = `${em(E.pin, "\uD83D\uDCCC")} Pilih cara pertama dulu. Pakai forward hanya kalau memang tidak ada jalan lain.`;

  const html = `<h3>${em(E.mega, "\uD83D\uDCE2")} Broadcast</h3><p>${a}</p><p>${b}</p><p>${c}</p>`;
  const text = `${em(E.mega, "\uD83D\uDCE2")} <b>Broadcast</b>\n\n${a}\n\n${b}\n\n${c}`;

  const kb = (f) => [
    [btn(f, "Coba Kirim Langsung", `bc:${job.id}:direct`, { style: "success", icon: BTN_ICON })],
    [btn(f, "Forward Message", `bc:${job.id}:fwd`)],
    [btn(f, "\u2039 Kembali", `bc:${job.id}:back`)],
  ];
  return { html, text, kb };
}

function screenRunning(job) {
  const st = job.st || { sent: 0, failed: 0, skipped: 0 };
  const done = st.sent + st.failed;
  const total = job.total || 0;
  const a = job.stop
    ? `Menghentikan broadcast ke target <b>${targetNames(job)}</b>...`
    : `Sedang memproses broadcast ke target <b>${targetNames(job)}</b>.`;
  const prog = total ? `${done}/${total}` : "menyiapkan senarai...";
  const html =
    `<h3>${em(E.mega, "\uD83D\uDCE2")} Broadcast</h3><p>${a}</p>` +
    `<table bordered><tr><th>Info</th><th>Nilai</th></tr>` +
    `<tr><td>${em(E.chart, "\uD83D\uDCCA")} Kemajuan</td><td>${prog}</td></tr>` +
    `<tr><td>${em(E.ok, "\u2705")} Terkirim</td><td>${st.sent}</td></tr>` +
    `<tr><td>${em(E.no, "\u274C")} Gagal</td><td>${st.failed}</td></tr></table>`;
  const text =
    `${em(E.mega, "\uD83D\uDCE2")} <b>Broadcast</b>\n\n${a}\n${em(E.chart, "\uD83D\uDCCA")} Kemajuan : <b>${prog}</b>\n` +
    `${em(E.ok, "\u2705")} Terkirim : <b>${st.sent}</b>\n${em(E.no, "\u274C")} Gagal : <b>${st.failed}</b>`;
  return {
    html,
    text,
    kb: (f) => (job.stop ? [] : [[btn(f, "Stop Broadcast", `bc:${job.id}:stop`, { style: "danger", icon: E.no })]]),
  };
}

function screenResult(job, st, secs) {
  const stopped = !!job.stop;
  const statusHtml = stopped ? `${em(E.no, "\u274C")} Dihentikan` : `${em(E.ok, "\u2705")} Selesai`;
  const total = st.sent + st.failed + st.skipped;
  const html =
    `<h3>${em(E.mega, "\uD83D\uDCE2")} Hasil Broadcast</h3>` +
    `<table bordered>` +
    `<tr><th>Info</th><th>Nilai</th></tr>` +
    `<tr><td>${em(E.pin, "\uD83D\uDCCC")} Target</td><td>${em(E.grp, "\uD83D\uDC65")} ${targetNames(job)}</td></tr>` +
    `<tr><td>Terkirim</td><td>${em(E.ok, "\u2705")} ${st.sent}</td></tr>` +
    `<tr><td>Gagal</td><td>${em(E.no, "\u274C")} ${st.failed}</td></tr>` +
    `<tr><td>Dilewati (blacklist)</td><td>${em(E.ban, "\uD83D\uDEAB")} ${st.skipped}</td></tr>` +
    `<tr><td>${em(E.box, "\uD83D\uDCE6")} Total tujuan</td><td>${total}</td></tr>` +
    `<tr><td>${em(E.bolt, "\u26A1")} Durasi</td><td>${secs} detik</td></tr>` +
    `<tr><td>${em(E.chart, "\uD83D\uDCCA")} Status</td><td>${statusHtml}</td></tr>` +
    `</table>`;

  const text =
    `${em(E.mega, "\uD83D\uDCE2")} <b>Hasil Broadcast</b>\n\n` +
    `${em(E.pin, "\uD83D\uDCCC")} Target : <b>${targetNames(job)}</b>\n` +
    `${em(E.ok, "\u2705")} Terkirim : <b>${st.sent}</b>\n` +
    `${em(E.no, "\u274C")} Gagal : <b>${st.failed}</b>\n` +
    `${em(E.ban, "\uD83D\uDEAB")} Dilewati (blacklist) : <b>${st.skipped}</b>\n` +
    `${em(E.box, "\uD83D\uDCE6")} Total tujuan : <b>${total}</b>\n` +
    `${em(E.bolt, "\u26A1")} Durasi : <b>${secs} detik</b>\n` +
    `${em(E.chart, "\uD83D\uDCCA")} Status : ${em(E.ok, "\u2705")} <b>Selesai</b>`;
  return { html, text, kb: () => [] };
}

function screenError(msg) {
  const a = `${em(E.no, "\u274C")} Gagal: ${esc(msg)}`;
  return { html: `<h3>${em(E.mega, "\uD83D\uDCE2")} Broadcast</h3><p>${a}</p>`, text: `${em(E.mega, "\uD83D\uDCE2")} <b>Broadcast</b>\n\n${a}`, kb: () => [] };
}

// ===== Hantar / edit mesej =====
// job.ref = { inline_message_id } ATAU { chat_id, message_id } ; job.mode = "rich" | "text"
async function render(job, screen) {
  const asText = job.mode === "text";
  for (const fancy of [true, false]) {
    try {
      await tg("editMessageText", {
        ...job.ref,
        ...(asText
          ? { text: screen.text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }
          : { rich_message: { html: screen.html } }),
        reply_markup: { inline_keyboard: screen.kb(fancy) },
      });
      return;
    } catch (err) {
      if (/not modified/i.test(err.message)) return;
      console.error("Edit panel gagal:", err.message);
    }
  }
}

async function sendToOwnerDM(job) {
  const scr = screenTarget(job);
  for (const mode of ["rich", "text"]) {
    for (const fancy of [true, false]) {
      try {
        await tg(
          mode === "rich" ? "sendRichMessage" : "sendMessage",
          mode === "rich"
            ? { chat_id: job.adminId || job.userId, rich_message: { html: scr.html }, reply_markup: { inline_keyboard: scr.kb(fancy) } }
            : { chat_id: job.adminId || job.userId, text: scr.text, parse_mode: "HTML", reply_markup: { inline_keyboard: scr.kb(fancy) } }
        );
        job.mode = mode;
        return;
      } catch (err) {
        console.error(`Hantar panel ke DM (${mode}) gagal:`, err.message);
      }
    }
  }
  throw new Error("Tidak dapat hantar panel. Pastikan anda sudah tekan /start pada bot kawalan.");
}

// ===== Blacklist =====
// 1) blacklist setiap pengguna (diurus dengan .addbl / .delbl / .listbl / .clearbl, disimpan dalam data/db.json)
// 2) blacklist.json (global, pilihan): senarai ID chat yang dilangkau oleh semua userbot
function readBlacklist(job) {
  const set = new Set();
  try {
    const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "blacklist.json"), "utf8"));
    for (const id of Array.isArray(d) ? d : []) set.add(normId(id));
  } catch (_) {}
  const rec = (shared.db && shared.db.getUser(job.userId)) || {};
  for (const e of rec.blacklist || []) set.add(normId(e.key || e.id));
  for (const id of require("../lib/defaultBl").ids()) set.add(id); // blacklist bawaan (grup log ubot ARTA)
  return set;
}

// ===== Enjin broadcast =====
// ===== Anti-FLOOD per akun =====
// Telegram memberi FloodWait (err.seconds). Dulu tiap chat berikutnya tetap dicoba dan gagal satu-satu (log penuh error FLOOD + CPU boros).
// Sekarang: waktu tunggu dicatat per akun (client). Selama masa tunggu pendek, kirim menunggu otomatis; bila terlalu lama / berulang,
// dilempar error .floodPause supaya putaran dihentikan dini dan dijadwal ulang setelah limit lewat.
const floodUntil = new WeakMap();
const FLOOD_MAX_WAIT = 120 * 1000;
// SLOWMODE_WAIT (mode lambat satu grup) dan PEER_FLOOD (batas spam) BUKAN FloodWait global: cukup gagal untuk chat itu saja.
// (Dulu keduanya ikut dianggap flood -> satu grup slowmode bisa menghentikan SELURUH putaran.)
const isFlood = (err) => {
  if (!err) return false;
  const m = String(err.errorMessage || err.message || "");
  if (/SLOWMODE|PEER_FLOOD/i.test(m)) return false;
  return !!err.seconds || /FLOOD/i.test(m);
};
function floodSecs(err) {
  if (err && err.seconds) return Number(err.seconds) || 30;
  const m = /(?:FLOOD_?WAIT_?|wait of )(\d+)/i.exec(String((err && (err.errorMessage || err.message)) || ""));
  return m ? Number(m[1]) : 30;
}
const floodLeft = (client) => { const u = client && floodUntil.get(client); return u ? Math.max(0, u - Date.now()) : 0; };
function pauseErr(secs, cause) {
  const e = cause || new Error("FLOOD_PAUSE");
  e.floodPause = true;
  e.seconds = secs;
  if (!e.errorMessage) e.errorMessage = "FLOOD_PAUSE";
  return e;
}
const jitter = (ms) => ms + Math.floor(Math.random() * ms * 0.4); // +0-40% acak, supaya jeda tidak persis seragam (pola seragam lebih gampang kena limit)

// ===== Gerbang jarak minimum antar kirim (per akun / klien GramJS) =====
// .bc, .cfd, .autocfd, .autobc, .autobc2 semuanya lewat withRetry() ini dengan klien yang SAMA (satu akun = satu client).
// Dulu tiap fitur punya jeda sendiri-sendiri; kalau dua fitur kebetulan jalan berdekatan, kiriman bisa bertumpuk dan
// langsung kena FloodWait. Sekarang dijaga di satu titik: jarak antar kirim pada akun yang sama TIDAK PERNAH kurang
// dari MIN_GAP_MS, apa pun fitur yang memicunya.
const lastSentAt = new WeakMap();
const MIN_GAP_MS = 900;
async function gate(client) {
  if (!client) return;
  const prev = lastSentAt.get(client) || 0;
  const wait = prev + MIN_GAP_MS - Date.now();
  lastSentAt.set(client, Date.now() + Math.max(0, wait));
  if (wait > 0) await sleep(wait);
}
const isDisconnectish = (err) => /disconnected|not connected|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|CONNECTION|socket|timed? ?out/i.test(String((err && (err.errorMessage || err.message)) || ""));

async function withRetry(fn, client) {
  for (let tr = 0; ; tr++) {
    const left = floodLeft(client);
    if (left > FLOOD_MAX_WAIT) throw pauseErr(Math.ceil(left / 1000));
    if (left > 0) await sleep(jitter(left + 1000));
    await gate(client); // jarak minimum antar kirim lintas fitur, supaya tidak bertumpuk dan memicu FloodWait

    try {
      return await fn();
    } catch (err) {
      // koneksi terputus sesaat (jaringan server / Telegram) -> coba sambung ulang lalu ulang pengiriman
      if (client && isDisconnectish(err) && tr < 3) {
        console.error("[bc] koneksi terputus sesaat, coba sambung ulang:", err.message);
        try { await client.connect(); } catch (_) {}
        await sleep(jitter(1500));
        continue;
      }
      if (!isFlood(err)) throw err;
      const secs = floodSecs(err);
      if (client) floodUntil.set(client, Date.now() + secs * 1000);
      if (secs * 1000 > FLOOD_MAX_WAIT || tr >= 3) throw pauseErr(secs, err);
      await sleep(jitter((secs + 1) * 1000));
    }
  }
}

// ---- dukungan SEMUA jenis pesan (teks, foto, video, stiker, voice, dokumen, album, polling, kontak, lokasi, dll) ----
const bigInt = require("big-integer");
const rid = () => bigInt.randBetween(bigInt("1"), bigInt("9007199254740991"));

// Album (beberapa media satu grup): ambil semua pesan dengan groupedId yang sama
async function albumOf(client, src) {
  if (!src.groupedId) return [src];
  try {
    const ids = [];
    for (let i = src.id - 10; i <= src.id + 10; i++) if (i > 0) ids.push(i);
    const got = (await client.getMessages(src.peerId, { ids })).filter((m) => m && m.groupedId && String(m.groupedId) === String(src.groupedId));
    return got.length ? got.sort((x, y) => x.id - y.id) : [src];
  } catch (_) {
    return [src];
  }
}

// Media yang tidak bisa dikirim ulang lewat sendFile (polling, kontak, lokasi, dice, game, ...)
const copyOnly = (m) =>
  !!m &&
  !(m instanceof Api.MessageMediaWebPage) &&
  !(m instanceof Api.MessageMediaPhoto) &&
  !(m instanceof Api.MessageMediaDocument);

// Salin tanpa label "Diteruskan dari" (forward + dropAuthor): semua jenis pesan, entity, caption, album ikut utuh
async function copyForward(client, ent, srcs) {
  const to = await client.getInputEntity(ent);
  const from = await client.getInputEntity(srcs[0].peerId);
  return client.invoke(
    new Api.messages.ForwardMessages({ fromPeer: from, id: srcs.map((m) => m.id), toPeer: to, randomId: srcs.map(rid), dropAuthor: true })
  );
}

const retryable = (err) => !!(err && (err.seconds || /FLOOD|SLOWMODE|WRITE_FORBIDDEN|BANNED|PEER_ID|CHAT_ADMIN|PRIVACY|RIGHTS/i.test(String(err.errorMessage || err.message || ""))));

// ===== Jenis pesan =====
// Pesan yang TIDAK AMAN dikirim ulang lewat sendMessage/sendFile karena format / jenisnya bisa hilang:
//  - Rich Message / kartu dari bot inline (viaBotId), pesan bertombol, jenis media yang tidak dikenal GramJS (Unsupported)
//  - foto/video spoiler, caption di atas media, album, polling/kontak/lokasi, dan pesan yang isinya tidak terbaca GramJS
// Untuk semuanya dipakai SALINAN SISI SERVER (forward tanpa label "Diteruskan dari"): isi, format, media persis sama.
function needsServerCopy(src, group) {
  if (group.length > 1) return true;
  if (src.viaBotId) return true;
  if (src.replyMarkup) return true;
  const m = src.media;
  if (m) {
    if (String(m.className) === "MessageMediaUnsupported") return true;
    if (copyOnly(m)) return true;
    if (m.spoiler) return true;
    if (src.invertMedia) return true;
  } else if (!String(src.message || "").trim()) {
    return true;
  }
  return false;
}
// Masih mungkin dikirim ulang isinya (foto / dokumen / teks biasa) bila salinan sisi server ditolak?
const canResend = (src, group) =>
  group.length === 1 && !src.viaBotId && !src.replyMarkup &&
  (!!String(src.message || "").trim() || src.media instanceof Api.MessageMediaPhoto || src.media instanceof Api.MessageMediaDocument);

async function sendOneRaw(client, ent, src, mode, userId) {
  const wm = require("../watermark").get(userId);
  const group = await albumOf(client, src);
  const tailWm = () => (wm ? client.sendMessage(ent, { message: wm }).catch(() => {}) : null);
  const codeOf = (err) => String((err && (err.errorMessage || err.message)) || "");
  const viaCopy = async () => {
    const r = await copyForward(client, ent, group);
    await tailWm(); // salinan sisi server tidak bisa diubah -> watermark dikirim sebagai pesan susulan
    return r;
  };

  if (mode === "fwd") {
    try {
      const r = await client.forwardMessages(ent, { messages: group.map((m) => m.id), fromPeer: src.peerId });
      // pesan forward tidak bisa diubah -> watermark dikirim sebagai pesan susulan
      await tailWm();
      return r;
    } catch (err) {
      // chat sumber melarang forward -> kirim ulang isinya sebagai pesan baru (hanya bila jenisnya memang bisa)
      if (!/FORWARDS_RESTRICTED/i.test(codeOf(err)) || !canResend(src, group)) throw err;
      console.error("[bc] forward dilarang chat sumber, kirim ulang isi pesan");
    }
  } else if (needsServerCopy(src, group)) {
    try {
      return await viaCopy();
    } catch (err) {
      if (retryable(err) || !/FORWARDS_RESTRICTED/i.test(codeOf(err)) || !canResend(src, group)) throw err;
      console.error("[bc] salinan sisi server ditolak (forward dilarang), kirim ulang isi pesan");
    }
  }

  const media =
    src.media && !(src.media instanceof Api.MessageMediaWebPage) ? src.media : null;
  // stiker & video bulat tidak punya caption -> watermark selalu dikirim susulan
  const noCaption = !!(media && (src.sticker || src.videoNote));
  let text = noCaption ? "" : src.message || "";
  let tail = noCaption && !!wm; // watermark terlalu panjang untuk caption / tanpa caption -> kirim susulan
  if (wm && !noCaption) {
    const merged = text ? `${text}\n\n${wm}` : wm;
    if (merged.length <= (media ? 1000 : 4000)) text = merged;
    else tail = true;
  }
  let r;
  try {
    if (media) {
      r = await client.sendFile(ent, {
        file: media,
        caption: text,
        formattingEntities: noCaption ? undefined : src.entities,
      });
    } else {
      r = await client.sendMessage(ent, { message: text, formattingEntities: src.entities });
    }
  } catch (err) {
    if (retryable(err)) throw err;
    // jenis pesan yang tidak bisa dikirim ulang langsung -> salin lewat forward tanpa label
    console.error("[bc] kirim langsung gagal, coba salin:", codeOf(err));
    r = await copyForward(client, ent, group);
    await tailWm();
    return r;
  }
  if (tail) await client.sendMessage(ent, { message: wm }).catch(() => {});
  return r;
}

// ===== Verifikasi: pesan benar-benar masuk ke chat tujuan =====
// Dulu "terkirim" dihitung hanya karena tidak ada error. Sekarang hasil kirim dicek (ada id pesan / update pesan baru dari Telegram).
// Bila Telegram tidak memberi konfirmasi, riwayat chat dicek: harus ada pesan KITA yang baru. Kalau tidak ada -> dihitung GAGAL.
const hasId = (m) => !!m && m.id !== undefined && m.id !== null && Number(m.id) > 0;
function deliveredIn(r) {
  if (!r) return false;
  if (Array.isArray(r)) return r.some(hasId);
  if (Array.isArray(r.updates)) return r.updates.some((u) => u && /^Update(NewMessage|NewChannelMessage|MessageID)$/.test(String(u.className)));
  return hasId(r);
}
async function confirmDelivered(client, ent, r, since) {
  if (deliveredIn(r)) return;
  let ok = null;
  try {
    const last = await client.getMessages(ent, { limit: 6 });
    ok = last.some((m) => m && m.out && Number(m.date) >= since);
  } catch (_) {}
  if (ok === false) {
    const e = new Error("NOT_DELIVERED: Telegram tidak mengonfirmasi pesan masuk ke chat tujuan");
    e.errorMessage = "NOT_DELIVERED";
    throw e;
  }
}
async function sendOne(client, ent, src, mode, userId) {
  const since = Math.floor(Date.now() / 1000) - 60;
  const r = await sendOneRaw(client, ent, src, mode, userId);
  await confirmDelivered(client, ent, r, since);
  return r;
}

async function runBroadcast(job, mode) {
  const client = job.client;
  const started = Date.now();
  const st = { sent: 0, failed: 0, skipped: 0 };

  const src = (await client.getMessages(job.srcPeer, { ids: [job.srcMsgId] }))[0];
  if (!src) throw new Error("Mesej sumber tidak ditemui (mungkin sudah dipadam).");

  const bl = readBlacklist(job);
  const targets = [];
  for await (const d of client.iterDialogs({})) {
    const ent = d.entity;
    if (!ent) continue;
    let kind = null;
    if (d.isUser) {
      if (!ent.bot && !ent.deleted && !ent.self && String(ent.id) !== "777000") kind = "p";
    } else if (d.isGroup) kind = "g";
    else if (d.isChannel) kind = "c";
    if (!kind || !job.targets[kind]) continue;

    if (bl.has(normId(d.id)) || bl.has(normId(ent.id)) || require("../lib/defaultBl").match(d.id, ent)) {
      st.skipped++;
      continue;
    }
    targets.push(ent);
  }

  job.st = st;
  job.total = targets.length;
  let lastRender = 0;
  for (let i = 0; i < targets.length; i++) {
    if (job.stop) break;
    try {
      await withRetry(() => sendOne(client, targets[i], src, mode, job.userId), client);
      st.sent++;
    } catch (err) {
      st.failed++;
      if (err && err.floodPause) {
        st.floodSecs = err.seconds;
        console.error(`[bc] kena limit Telegram (FloodWait ${err.seconds} dtk), broadcast dihentikan lebih awal`);
        break;
      }
      console.error("Broadcast gagal ke satu chat:", err.errorMessage || err.message);
    }
    if (Date.now() - lastRender > 4000 && !job.stop) {
      lastRender = Date.now();
      render(job, screenRunning(job)).catch(() => {});
    }
    if (i < targets.length - 1 && !job.stop) {
      // tidur berpotong supaya Stop berkesan segera; +0-40% acak supaya jeda tidak persis seragam
      const until = Date.now() + jitter(job.delay * 1000);
      while (Date.now() < until && !job.stop) await sleep(Math.min(500, until - Date.now()));
    }
  }

  return { st, secs: Math.round((Date.now() - started) / 1000) };
}

// ===== Bot kawalan: inline query + butang =====
async function answerPanel(ctx, job, asText, key) {
  const base = { inline_query_id: ctx.inlineQuery.id, cache_time: 0, is_personal: true };
  const scr = screenTarget(job);
  const attempts = asText ? ["text"] : ["rich", "text"];
  let lastErr = "";

  // Hasil inline PERTAMA: tiada emoji premium & butang biasa (tidak dibenarkan).
  // Bot mengedit mesej selepas dihantar untuk memasang emoji premium + butang cantik.
  for (const a of attempts) {
    const resultId = `bc${job.id}${a}`;
    try {
      await tg("answerInlineQuery", {
        ...base,
        results: [
          {
            type: "article",
            id: resultId,
            title: "Broadcast",
            description: "Panel broadcast",
            input_message_content:
              a === "rich"
                ? { rich_message: { html: stripCustom(scr.html) } }
                : { message_text: stripCustom(scr.text), parse_mode: "HTML", link_preview_options: { is_disabled: true } },
            reply_markup: { inline_keyboard: scr.kb(false) },
          },
        ],
      });
      job.mode = a;
      console.log(`[inline bc] dijawab (${a}) untuk akaun ${ctx.from.id}`);
      notifyAnswered(key, { queryId: ctx.inlineQuery.id, resultId, kind: a });
      return;
    } catch (err) {
      lastErr = err.message;
      console.error(`[inline bc] jawapan "${a}" ditolak Telegram:`, err.message);
    }
  }
  notifyAnswered(key, { error: `Telegram menolak jawapan: ${lastErr}` });
}

function registerBot(bot) {
  // Userbot meminta panel melalui inline query "bc <id>" (rich) atau "bct <id>" (teks)
  bot.on("inline_query", async (ctx, next) => {
    const q = ctx.inlineQuery.query.trim();
    const m = q.match(/^(bc|bct) ([0-9a-f]+)$/);
    if (!m) return next();

    const job = jobs.get(m[2]);
    console.log(`[inline bc] query "${m[1]}" daripada ${ctx.from.id}, sesi ${job ? "ada" : "tiada"}`);
    if (!job || String(ctx.from.id) !== job.accountId) {
      notifyAnswered(q, { error: "Sesi broadcast tidak sah" });
      return tg("answerInlineQuery", {
        inline_query_id: ctx.inlineQuery.id,
        cache_time: 0,
        is_personal: true,
        results: [],
      }).catch(() => {});
    }
    await answerPanel(ctx, job, m[1] === "bct", q);
  });

  // Panel dipilih/dihantar: bot mengedit mesej untuk memasang emoji premium (perlu /setinlinefeedback)
  bot.on("chosen_inline_result", async (ctx, next) => {
    const c = ctx.chosenInlineResult;
    const m = c && String(c.result_id || "").match(/^bc([0-9a-f]{8})(rich|text)$/);
    if (!m) return next();
    const job = jobs.get(m[1]);
    if (!job || String(c.from.id) !== job.accountId || !c.inline_message_id) return;
    job.ref = { inline_message_id: c.inline_message_id };
    job.mode = m[2];
    await render(job, screenTarget(job));
  });

  bot.callbackQuery(/^bc:([0-9a-f]+):(\w+)$/, async (ctx) => {
    const [, id, action] = ctx.match;
    const job = jobs.get(id);
    if (!job) {
      return ctx.answerCallbackQuery({ text: "Sesi sudah tamat. Taip .bc semula.", show_alert: true });
    }
    if (String(ctx.from.id) !== job.accountId && String(ctx.from.id) !== job.adminId) {
      return ctx.answerCallbackQuery({ text: "Panel ini bukan untuk anda.", show_alert: true });
    }

    const cq = ctx.callbackQuery;
    job.ref = cq.inline_message_id
      ? { inline_message_id: cq.inline_message_id }
      : { chat_id: cq.message.chat.id, message_id: cq.message.message_id };

    if (action === "stop") {
      if (!job.running) return ctx.answerCallbackQuery({ text: "Tiada broadcast yang berjalan." });
      job.stop = true;
      await ctx.answerCallbackQuery({ text: "Broadcast dihentikan..." });
      return render(job, screenRunning(job)).catch(() => {});
    }
    if (job.running) return ctx.answerCallbackQuery({ text: "Broadcast sedang berjalan..." });

    if (["g", "c", "p"].includes(action)) {
      job.targets[action] = !job.targets[action];
      await ctx.answerCallbackQuery();
      return render(job, screenTarget(job));
    }

    if (action === "next") {
      if (!anySelected(job)) {
        return ctx.answerCallbackQuery({ text: "Pilih minimal 1 target dulu.", show_alert: true });
      }
      await ctx.answerCallbackQuery();
      return render(job, screenMode(job));
    }

    if (action === "back") {
      await ctx.answerCallbackQuery();
      return render(job, screenTarget(job));
    }

    if (action === "direct" || action === "fwd") {
      if (!anySelected(job)) return ctx.answerCallbackQuery({ text: "Pilih target dulu.", show_alert: true });
      job.running = true;
      await ctx.answerCallbackQuery();
      await render(job, screenRunning(job));

      // Jalankan di latar belakang supaya bot tidak tersekat
      runBroadcast(job, action)
        .then(({ st, secs }) => render(job, screenResult(job, st, secs)))
        .catch((err) => render(job, screenError(err.message)))
        .finally(() => {
          job.running = false;
          jobs.delete(job.id);
        });
    }
  });
}

// ===== Arahan userbot: .bc =====
async function bcCommand({ client, msg, args, account, byAdmin }) {
  const edit = (text) => client.editMessage(msg.peerId, { message: msg.id, text });

  if (!shared.botUsername) return edit("\u26A0\uFE0F Bot kawalan belum sedia.");

  const rm = await msg.getReplyMessage();
  if (!rm) return edit("\u26A0\uFE0F Balas (reply) mesej yang mahu di-broadcast dengan .bc");

  const delay = Math.max(1, parseFloat(args[0]) || Number(shared.cfg.broadcast_delay) || 2);

  let srcTitle = "Private";
  try {
    const chat = await msg.getChat();
    srcTitle = chat.title || [chat.firstName, chat.lastName].filter(Boolean).join(" ") || srcTitle;
  } catch (_) {}

  const job = {
    id: crypto.randomBytes(4).toString("hex"),
    accountId: account.accountId,
    adminId: byAdmin ? String(byAdmin) : null,
    userId: account.userId,
    client,
    srcPeer: msg.peerId,
    srcMsgId: rm.id,
    srcTitle,
    delay,
    targets: { g: false, c: false, p: false },
    running: false,
    ref: null,
    mode: "rich",
  };
  jobs.set(job.id, job);
  const expiry = setTimeout(() => jobs.delete(job.id), 60 * 60 * 1000);
  if (expiry.unref) expiry.unref();

  if (byAdmin) {
    try {
      await sendToOwnerDM(job);
    } catch (err) {
      jobs.delete(job.id);
      await edit(`\u26A0\uFE0F ${err.message}`);
    }
    return;
  }

  // Cara 1: panel dihantar melalui inline bot (muncul dalam chat, "via @bot"); cuba rich dahulu, kemudian teks
  let reason = "";
  try {
    await sendViaInlineAny({ client, shared, msg, queries: [`bc ${job.id}`, `bct ${job.id}`] });
    return;
  } catch (err) {
    reason = err.message;
  }

  // Cara 2 (cadangan): hantar panel ke chat peribadi bot kawalan
  try {
    await sendToOwnerDM(job);
    await edit(`\uD83D\uDCE9 Panel broadcast dihantar ke chat bot kawalan anda.\nSebab tidak muncul di sini: ${reason}`);
  } catch (err) {
    jobs.delete(job.id);
    await edit(`\u26A0\uFE0F ${err.message}\nSebab inline: ${reason}`);
  }
}

module.exports = {
  name: "broadcast",
  category: "MENU SHARE AUTO PROMOSI",
  help: [
    {
      cmd: "bc",
      alias: ["broadcast"],
      desc: "broadcast pesan yang direply. Contoh: .bc 3 (jeda 3 saat antara chat)",
    },
  ],
  registerBot,
  commands: { bc: bcCommand, broadcast: bcCommand },
  // dipakai plugin autobc.js / share.js
  engine: { sendOne, withRetry, readBlacklist, sleep, isFlood, floodLeft, jitter },
};

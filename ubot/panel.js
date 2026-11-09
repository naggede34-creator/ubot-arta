// Panel maklumat umum (contoh .ping, .setexpired) dihantar melalui inline bot.
// Hasil inline PERTAMA tidak boleh ada emoji premium, jadi bot mengeditnya selepas dihantar
// (berfungsi jika pemilik bot ada Telegram Premium; semua orang nampak emoji itu).
const crypto = require("crypto");
const { shared, tg, stripCustom } = require("./core");
const { sendViaInlineAny, notifyAnswered } = require("./inline");

const panels = new Map(); // id -> { accountId, html, text, buttons, inlineId, mode }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// "Inline feedback" aktif? (BotFather /setinlinefeedback). Dikesan bila chosen_inline_result pernah diterima,
// atau ditetapkan "inline_feedback": true dalam config.json. Diperlukan supaya panel loading boleh diganti di tempat.
let feedbackSeen = false;
const markFeedback = () => { feedbackSeen = true; };
const feedbackOn = () => feedbackSeen || shared.cfg.inline_feedback === true;

// Baris butang URL (pilihan) yang dihantar bersama panel. fancy = ikon premium + warna (hanya selepas diedit)
const rowsOf = (buttons, fancy) =>
  (buttons || []).map((row) =>
    row.map((b) => ({
      text: b.text,
      url: b.url,
      ...(fancy && b.icon ? { icon_custom_emoji_id: b.icon } : {}),
      ...(fancy && b.style ? { style: b.style } : {}),
    }))
  );
// Versi "lite": tombol CTA yang biasanya di dalam kartu dipindah ke keyboard bawah
const liteButtons = (p) => [...(p && p.cardButtons && p.cardButtons.length ? [p.cardButtons.map(({ icon, ...b }) => b)] : []), ...((p && p.buttons) || [])];
const GO = (id, p) => ({
  inline_keyboard: [...rowsOf(p && p.htmlLite ? liteButtons(p) : p && p.buttons, false), [{ text: "\u2728 Muat emoji premium", callback_data: `pn:go:${id}` }]],
});

// Dipanggil oleh userbot. Lempar ralat jika panel tidak dapat dihantar ke chat.
// media (pilihan): [{ id, media: { type: "photo", media: file_id } }] untuk <img src="tg://photo?id=ID"/> dalam html;
// onMediaFail(sebab): dipanggil jika Telegram menolak kartu Rich yang membawa gambar (jawaban beralih ke teks tanpa gambar)
async function showPanel({ client, msg, account, html, htmlLite, cardButtons, text, textHtml, buttons, plainTextOnly = false, media = null, onMediaFail = null }) {
  // Perintah yang dijalankan admin lewat bot kontrol: hasil dikirim balik ke chat admin oleh bot (lihat plugins/admin.js)
  if (msg && typeof msg.__relay === "function") {
    await msg.__relay({ html, text: textHtml || text });
    return "relay";
  }
  const id = crypto.randomBytes(4).toString("hex");
  panels.set(id, { accountId: account.accountId, html, htmlLite, cardButtons: cardButtons || [], text, textHtml, buttons: buttons || [], plainTextOnly, inlineId: null, mode: null, media: media && media.length ? media : null, onMediaFail });
  const t = setTimeout(() => panels.delete(id), 60 * 60 * 1000);
  if (t.unref) t.unref();
  await sendViaInlineAny({ client, shared, msg, queries: [`pn ${id}`, `pnt ${id}`] });
  return id;
}

// ===== Panel loading (emoji berpusing) yang diganti di tempat dengan hasil =====
// showLoading -> kerja panjang -> finishLoading(h, hasil) / failLoading(h, ctx, mesej)
// Jika inline feedback belum pasti aktif, guna suntingan teks biasa pada mesej arahan (seperti dahulu) supaya tidak tersangkut.
async function showLoading({ client, msg, account, label, icon }) {
  const L = require("./loading");
  if (feedbackOn()) {
    try {
      const id = await showPanel({ client, msg, account, html: L.html(label), text: L.text(label) });
      return { id };
    } catch (err) {
      console.error("[loading] panel gagal, guna teks biasa:", err.message);
    }
  }
  await client.editMessage(msg.peerId, { message: msg.id, text: L.plain(label, icon), parseMode: "html" }).catch(() => {});
  return { plain: true, original: msg.message || "" };
}

async function finishLoading(h, { client, msg, account, html, htmlLite, cardButtons, text, buttons, doneText }) {
  if (h && h.id && panels.has(h.id)) {
    const p = panels.get(h.id);
    p.html = html;
    p.htmlLite = htmlLite;
    p.cardButtons = cardButtons || [];
    p.text = text;
    p.buttons = buttons || [];
    for (let i = 0; i < 60 && !p.inlineId; i++) await sleep(100); // tunggu chosen_inline_result (maks 6 saat)
    if (p.inlineId && (await applyPanel(h.id, p.inlineId, p.accountId, null))) return h.id;
    console.error("[loading] panel loading tidak dapat diganti, hantar panel baharu");
  }
  const id = await showPanel({ client, msg, account, html, htmlLite, cardButtons, text, buttons });
  if (h && h.plain) {
    // pulihkan mesej arahan (buang teks "sedang ..." yang tersangkut)
    await client.editMessage(msg.peerId, { message: msg.id, text: doneText || h.original || ".", ...(doneText ? { parseMode: "html" } : {}) }).catch(() => {});
  }
  return id;
}

async function failLoading(h, { client, msg, account }, message) {
  const { noticeCard } = require("./ui");
  const c = noticeCard("\u26A0\uFE0F " + message, account, msg);
  if (h && h.id && panels.has(h.id)) return finishLoading(h, { client, msg, account, html: c.html, text: c.text });
  await client.editMessage(msg.peerId, { message: msg.id, text: "\u26A0\uFE0F " + message }).catch(() => {});
}

async function answerPanel(ctx, id, p, asText, key) {
  const base = { inline_query_id: ctx.inlineQuery.id, cache_time: 0, is_personal: true };
  const attempts = (asText || p.plainTextOnly) ? (p.textHtml ? ["texthtml", "text"] : ["text"]) : ["rich", "text"];
  let lastErr = "";
  for (const a of attempts) {
    const resultId = `pn${id}${a === "rich" ? "rich" : "text"}`;
    try {
      await tg("answerInlineQuery", {
        ...base,
        results: [
          {
            type: "article",
            id: resultId,
            title: "Panel",
            description: "Panel userbot",
            input_message_content:
              a === "rich"
                ? { rich_message: { html: stripCustom(p.htmlLite || p.html), ...(p.media ? { media: p.media } : {}) } }
                : a === "texthtml"
                ? { message_text: stripCustom(p.textHtml).slice(0, 4000), parse_mode: "HTML", link_preview_options: { is_disabled: true } }
                : { message_text: String(p.text || "").slice(0, 4000), link_preview_options: { is_disabled: true } },
            reply_markup: GO(id, p),
          },
        ],
      });
      console.log(`[inline panel] dijawab (${a}) untuk akaun ${ctx.from.id}`);
      notifyAnswered(key, { queryId: ctx.inlineQuery.id, resultId, kind: a });
      return;
    } catch (err) {
      lastErr = err.message;
      console.error(`[inline panel] jawapan "${a}" ditolak Telegram:`, err.message);
      if (a === "rich" && p.media && p.onMediaFail) Promise.resolve(p.onMediaFail(err.message)).catch(() => {});
    }
  }
  notifyAnswered(key, { error: `Telegram menolak jawapan: ${lastErr}` });
}

async function applyPanel(id, inlineId, accountId, mode) {
  const p = panels.get(id);
  if (!p || String(accountId) !== p.accountId) return false;
  if (inlineId) p.inlineId = inlineId; // diperlukan untuk menggantikan panel loading dengan hasil
  inlineId = inlineId || p.inlineId;
  if (!inlineId) return false;
  const mediaPart = p.media ? { media: p.media } : {};
  // panel dengan gambar: jangan turun ke teks (gambar akan hilang); cukup coba kartu Rich
  for (const m of mode ? [mode] : p.media ? ["rich"] : (p.plainTextOnly ? ["text"] : ["rich", "text"])) {
    // mode teks: coba versi HTML berformat + emoji premium dulu, jika ditolak baru teks polos
    const variants = m === "text" ? (p.textHtml ? ["html", "plain"] : ["plain"]) : (p.htmlLite ? ["rich", "rich-lite"] : ["rich"]);
    for (const v of variants) {
      for (const fancy of [true, false]) {
        try {
          await tg("editMessageText", {
            inline_message_id: inlineId,
            ...(v === "plain"
              ? { text: String(p.text || "").slice(0, 4000), link_preview_options: { is_disabled: true } }
              : v === "html"
              ? { text: String(p.textHtml).slice(0, 4000), parse_mode: "HTML", link_preview_options: { is_disabled: true } }
              : v === "rich-lite"
              ? { rich_message: { html: p.htmlLite, ...mediaPart } }
              : { rich_message: { html: p.html, ...mediaPart } }),
            reply_markup: { inline_keyboard: rowsOf(v === "rich-lite" ? liteButtons(p) : p.buttons, fancy) },
          });
          console.log(`[panel] emoji premium dipasang (${m}/${v}) untuk akaun ${accountId}`);
          return true;
        } catch (err) {
          if (/not modified/i.test(err.message)) return true;
          console.error(`[panel] edit emoji premium (${m}/${v}${fancy ? "" : ", butang biasa"}) gagal:`, err.message);
        }
      }
    }
  }
  return false;
}

// Ganti isi panel yang sudah terkirim di tempat (mis. QRIS menunggu -> LUNAS). Perlu inline feedback aktif.
// fields: { html, text, buttons, media } ; media: null = buang gambar. Mengembalikan false jika tidak bisa (panel baru perlu dikirim).
async function updatePanel(id, fields) {
  const p = panels.get(id);
  if (!p || !p.inlineId) return false;
  Object.assign(p, fields, { htmlLite: undefined, cardButtons: [], media: fields.media && fields.media.length ? fields.media : null });
  return applyPanel(id, null, p.accountId, null);
}

function register(bot) {
  bot.on("inline_query", async (ctx, next) => {
    const q = ctx.inlineQuery.query.trim();
    const m = q.match(/^(pn|pnt) ([0-9a-f]+)$/);
    if (!m) return next();

    const p = panels.get(m[2]);
    console.log(`[inline panel] query "${m[1]}" daripada ${ctx.from.id}, panel ${p ? "ada" : "tiada"}`);
    if (!p || String(ctx.from.id) !== p.accountId) {
      notifyAnswered(q, { error: "Panel tidak sah atau sudah tamat" });
      return tg("answerInlineQuery", { inline_query_id: ctx.inlineQuery.id, cache_time: 0, is_personal: true, results: [] }).catch(() => {});
    }
    await answerPanel(ctx, m[2], p, m[1] === "pnt", q);
  });

  bot.on("chosen_inline_result", async (ctx, next) => {
    const c = ctx.chosenInlineResult;
    const m = c && String(c.result_id || "").match(/^pn([0-9a-f]{8})(rich|text)$/);
    if (!m) return next();
    if (!c.inline_message_id) return;
    markFeedback();
    await applyPanel(m[1], c.inline_message_id, c.from.id, m[2]);
  });

  // Jika inline feedback tidak dihidupkan: butang memasang emoji premium
  bot.callbackQuery(/^pn:go:([0-9a-f]+)$/, async (ctx) => {
    const inlineId = ctx.callbackQuery.inline_message_id;
    if (!inlineId) return ctx.answerCallbackQuery();
    const ok = await applyPanel(ctx.match[1], inlineId, ctx.from.id, null);
    await ctx.answerCallbackQuery(ok ? {} : { text: "Panel ini bukan untuk anda atau sudah tamat.", show_alert: true });
  });
}

module.exports = { showPanel, updatePanel, showLoading, finishLoading, failLoading, markFeedback, feedbackOn, register };

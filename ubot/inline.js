const bigInt = require("big-integer");
const { Api } = require("telegram");

const errText = (err) => String((err && (err.errorMessage || err.message)) || err);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Bot dan userbot berjalan dalam satu proses, jadi bot boleh memberitahu userbot
// "query inline X sudah dijawab" beserta ID query & ID hasil. Dengan itu userbot boleh
// menghantar panel walaupun GramJS (versi lama) tidak dapat membaca jawapan Rich Message.
const waiters = new Map(); // query -> resolve
const reasons = new Map(); // query -> sebab percubaan sebelumnya gagal (dipaparkan dalam versi teks)

const notifyAnswered = (query, info) => {
  const r = waiters.get(query);
  if (r) {
    waiters.delete(query);
    r(info);
  }
};
const getReason = (query) => reasons.get(query);

// Kenal pasti chat sasaran. Dalam chat PERIBADI, akaun lawan bicara selalunya belum ada dalam cache GramJS
// (mesej keluar peribadi tiba sebagai update ringkas tanpa access hash) sehingga getInputEntity gagal -> menu tidak muncul.
// Jadi cuba beberapa cara: cache, objek mesej, muat dialog (sekali), kemudian getEntity.
const dialogsAt = new WeakMap();
async function resolvePeer(client, msg) {
  const tries = [
    () => client.getInputEntity(msg.peerId),
    () => (typeof msg.getInputChat === "function" ? msg.getInputChat() : null),
    async () => client.getInputEntity(await client.getEntity(msg.peerId)),
    async () => {
      const last = dialogsAt.get(client) || 0;
      if (Date.now() - last < 600000) throw new Error("muat dialog ditunda (hindari FLOOD)");
      dialogsAt.set(client, Date.now());
      await client.getDialogs({ limit: 100 });
      return client.getInputEntity(msg.peerId);
    },
  ];
  let last;
  for (const t of tries) {
    try {
      const p = await t();
      if (p) return p;
    } catch (e) {
      last = e;
    }
  }
  throw new Error("Tidak dapat mengenal pasti chat ini" + (last ? ` (${errText(last)})` : ""));
}

// ===== Emoji premium OTOMATIS =====
// Hasil inline pertama tidak boleh memuat emoji premium; bot menggantinya lewat edit. Jika "inline feedback" di @BotFather belum aktif,
// edit itu baru jalan setelah tombol "Muat semula" (.help) / "Muat emoji premium" (panel) ditekan. Fungsi ini menekannya SENDIRI
// atas nama akun userbot, beberapa detik setelah panel terkirim. Matikan: config.json "auto_load_premium": false
const pressed = new Set();
async function autoLoadPremium(client, peer, botInput, shared) {
  try {
    if (shared && shared.cfg && shared.cfg.auto_load_premium === false) return;
    let fb = false;
    try { fb = require("./panel").feedbackOn(); } catch (_) {}
    if (fb) return; // inline feedback aktif -> bot sudah memasang emoji premium sendiri
    const botId = botInput && botInput.userId !== undefined ? String(botInput.userId) : null;
    for (let i = 0; i < 8; i++) {
      await sleep(i === 0 ? 500 : 800);
      const list = await client.getMessages(peer, { limit: 6 }).catch(() => []);
      for (const m of list || []) {
        if (!m || !m.out || pressed.has(m.id) || !m.replyMarkup || !m.replyMarkup.rows) continue;
        if (botId && m.viaBotId !== undefined && m.viaBotId !== null && String(m.viaBotId) !== botId) continue;
        if (Date.now() / 1000 - (m.date || 0) > 45) continue;
        for (const row of m.replyMarkup.rows) {
          for (const b of row.buttons || []) {
            const d = b.data ? Buffer.from(b.data).toString() : "";
            if (/^(hl:go|pn:go:)/.test(d)) {
              pressed.add(m.id);
              if (pressed.size > 500) pressed.clear();
              client.invoke(new Api.messages.GetBotCallbackAnswer({ peer, msgId: m.id, data: b.data })).catch(() => {});
              return;
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("[emoji-otomatis]", errText(err));
  }
}

// Userbot meminta bot kawalan menghantar panel ke chat (muncul sebagai "via @bot")
async function sendViaInline({ client, shared, msg, query }) {
  const waitMs = Number(shared.cfg.inline_timeout) || 15000;
  const sendMs = Number(shared.cfg.send_timeout) || 10000;

  const bot = await client.getInputEntity(shared.botUsername);
  const peer = await resolvePeer(client, msg);

  const answered = new Promise((resolve) => waiters.set(query, resolve));
  let fetched = null;
  let rpcError = null;
  const fetchP = client
    .invoke(new Api.messages.GetInlineBotResults({ bot, peer, query, offset: "" }))
    .then((r) => ((fetched = r), r))
    .catch((e) => ((rpcError = e), null));

  // Tunggu bot menjawab, ATAU Telegram memulangkan ralat RPC (contoh BOT_INLINE_DISABLED)
  const info = await Promise.race([
    answered,
    fetchP.then(() => (rpcError && rpcError.errorMessage ? { rpcError } : fetched && fetched.results && fetched.results.length ? { fetchedOk: true } : new Promise(() => {}))), // jawaban terbaca langsung = sudah dijawab bot
    sleep(waitMs).then(() => ({ timeout: true })),
  ]);
  waiters.delete(query);

  if (info.rpcError) throw info.rpcError;
  if (info.timeout) {
    throw new Error("Bot tidak menjawab query inline (semak /setinline di @BotFather dan Console)");
  }
  if (info.error) throw new Error(info.error);

  // Beri peluang GramJS membaca jawapan; jika tidak boleh, guna ID yang diberi oleh bot
  await Promise.race([fetchP, sleep(1500)]);
  const parsed = fetched && fetched.results && fetched.results.length ? fetched : null;
  const queryId = parsed ? parsed.queryId : bigInt(String(info.queryId));
  const id = parsed ? parsed.results[0].id : info.resultId;
  if (!parsed && (id === undefined || info.queryId === undefined)) throw new Error("Bot menjawab tetapi ID hasil inline tidak terbaca");

  const sendP = client.invoke(
    new Api.messages.SendInlineBotResult({
      peer,
      randomId: bigInt.randBetween(bigInt("1"), bigInt("9007199254740991")),
      queryId,
      id,
      ...((msg.__replyToId !== undefined ? msg.__replyToId : msg.id) ? { replyTo: new Api.InputReplyToMessage({ replyToMsgId: msg.__replyToId !== undefined ? msg.__replyToId : msg.id }) } : {}),
    })
  );
  sendP.catch(() => {});

  try {
    const r = await Promise.race([sendP, sleep(sendMs).then(() => "TIMEOUT")]);
    if (r === "TIMEOUT") {
      // Server tidak menolak; GramJS lama tidak dapat membaca jawapan mesej baharu -> dianggap berjaya
      console.error("Amaran: tiada jawapan bagi SendInlineBotResult (GramJS lama?), dianggap berjaya.");
    }
  } catch (err) {
    const m = errText(err);
    if (/constructor|matching|TLObject/i.test(m) && !/RESULT_ID|QUERY_ID|CHAT_|PEER_/i.test(m)) {
      console.error("Amaran: mesej dihantar tetapi jawapan tidak dapat dibaca:", m);
      autoLoadPremium(client, peer, bot, shared);
      return;
    }
    throw err;
  }
  autoLoadPremium(client, peer, bot, shared); // di latar belakang, tidak menunggu
}

// Cuba beberapa query mengikut urutan (contoh: ["help abc", "helptxt abc"]); lempar ralat jika semua gagal
async function sendViaInlineAny({ client, shared, msg, queries }) {
  const errors = [];
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    if (i > 0 && errors.length) reasons.set(query, errors[errors.length - 1]);
    try {
      await sendViaInline({ client, shared, msg, query });
      return query;
    } catch (err) {
      const m = errText(err);
      errors.push(`${query.split(" ")[0]}: ${m}`);
      console.error(`Inline "${query}" gagal:`, m);
    }
  }
  const e = new Error(errors.join(" | "));
  e.errors = errors;
  throw e;
}

module.exports = { sendViaInline, sendViaInlineAny, notifyAnswered, getReason, errText, _autoLoadPremium: autoLoadPremium };

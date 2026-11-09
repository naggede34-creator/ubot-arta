// Unggah gambar (mis. QR) ke chat bot milik pengguna untuk mendapat file_id, lalu pesan sementara itu dihapus.
// file_id dipakai untuk menempelkan gambar DI DALAM kartu Rich: <img src="tg://photo?id=ID"/> + media[] (Bot API Rich Messages).
const { cfg } = require("./core");

const api = (m) => `https://api.telegram.org/bot${cfg.bot_token}/${m}`;

async function uploadPhoto(chatId, buf) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("disable_notification", "true");
  form.append("photo", new Blob([buf], { type: "image/png" }), "qris.png");
  const res = await fetch(api("sendPhoto"), { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) throw new Error(`sendPhoto: ${j.description || "HTTP " + res.status}`);
  const sizes = (j.result && j.result.photo) || [];
  const id = sizes.length ? sizes[sizes.length - 1].file_id : null;
  // file_id tetap berlaku setelah pesan dihapus
  fetch(api("deleteMessage"), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: j.result.message_id }),
  }).catch(() => {});
  if (!id) throw new Error("sendPhoto: tidak ada file_id");
  return id;
}

module.exports = { uploadPhoto };

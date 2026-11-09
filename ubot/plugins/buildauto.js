// .buildauto <permintaan> : AI hasilkan kad Rich (jadual, senarai semak, emoji premium automatik,
// footer nama model, butang pautan). Balas (reply) mesej + .buildauto supaya AI olah isi mesej itu.
// AI: ARTA PEDIA ChatGPT REST API. Had penggunaan sama dengan .autorich.
const K = require("../kit");
const { UserErr } = K;
const aiProvider = require("../llm");
const richai = require("../richai");
const kit = require("../autorichkit");
const BK = require("../buildkit");
const { showLoading, finishLoading, failLoading } = require("../panel");

const USAGE =
  "Guna: .buildauto <permintaan>\n" +
  "Contoh: .buildauto promosi akaun game RM45, hubungi @username\n" +
  "Boleh juga balas (reply) satu mesej dengan .buildauto supaya AI olah kandungannya.";

async function buildauto(ctx, opts = {}) {
  const { client, msg, account } = ctx;
  const forced = opts.provider; // contoh: "gemini" untuk .gemini
  const edit = (text) => client.editMessage(msg.peerId, { message: msg.id, text }).catch(() => {});

  if (!aiProvider.hasKey(forced)) return edit("\u26A0\uFE0F URL AI belum valid. Periksa ai_gemini_url / ai_restapi_url di config.json.");

  let prompt = String(msg.message || "").replace(/^\S+\s*/, "").trim();
  const rm = await msg.getReplyMessage().catch(() => null);
  if (rm && rm.message) prompt = prompt ? `${prompt}\n\n--- Mesej rujukan ---\n${rm.message}` : rm.message;
  prompt = prompt.slice(0, 3000);
  if (!prompt) throw new UserErr(USAGE);

  let limited = null;
  try { limited = require("./autorich").checkLimit(account); } catch (_) {}
  if (limited) return edit(`\u23F3 ${limited}`);

  const pc = { client, msg, account };
  const L = await showLoading({ ...pc, label: opts.label || "ARTA PEDIA AI sedang menyiapkan payload ...", icon: "\uD83E\uDD16" });

  let blocks;
  let model = "AI";
  try {
    const r = await aiProvider.generate({ system: BK.systemPrompt(), prompt, provider: forced });
    model = r.model || "ARTA PEDIA";
    let parsed;
    try {
      parsed = BK.parseBlocks(r.text);
    } catch (parseErr) {
      console.error(".buildauto: format JSON AI tidak sah, guna teks fallback:", parseErr.message);
      parsed = [
        { type: "heading", text: "HASIL PERMINTAAN" },
        { type: "paragraph", text: String(r.text || prompt).slice(0, 2500) },
      ];
      model = "AI (format teks)";
    }
    blocks = BK.finish(parsed, {
      model,
      hint: prompt,
      ownerUrl: account.username ? `https://t.me/${account.username}` : null,
    });
  } catch (err) {
    // Provider mungkin timeout / tidak dapat dicapai. Command tetap menghasilkan kad Rich
    // berdasarkan teks pengguna supaya .buildauto tidak berhenti dengan mesej gagal.
    console.error(".buildauto: AI gagal, guna fallback:", err.message);
    model = "Mode fallback";
    blocks = BK.finish([
      { type: "heading", text: "PERMINTAAN ANDA" },
      { type: "paragraph", text: prompt.slice(0, 2500) },
      { type: "quote", text: "AI sedang tidak dapat dihubungi. Isi asal tetap diproses menjadi kad Rich." },
    ], { model, hint: prompt });
  }

  const built = kit.blocksToRichHtml(blocks, { emoji: true });
  const html = richai.sanitizeRich(built.html, { anyEmoji: true });
  const htmlLite = richai.sanitizeRich(built.htmlLite, { anyEmoji: true });
  if (!html || html.length < 20) return failLoading(L, pc, "AI tidak menghasilkan kad yang sah. Cuba lagi dengan permintaan lain.");

  // butang: 2 sebaris
  const rows = richai.layout(built.buttons.flat(), 2);
  try {
    await finishLoading(L, { ...pc, html, htmlLite, cardButtons: built.cardButtons, text: richai.plainText(htmlLite), buttons: rows, doneText: "<i>Payload siap \u2705</i>" });
  } catch (err) {
    console.error(".buildauto: panel gagal, hantar teks biasa:", err.message);
    await edit(richai.plainText(html).slice(0, 3800) || "\u26A0\uFE0F Kad tidak dapat dihantar.");
  }
}

const plug = K.plugin("buildauto", "Rich & Format", [
  { cmd: "buildauto", desc: "AI buat kartu Rich (brand, judul, tabel harga, tombol dalam kartu, emoji premium auto): .buildauto <permintaan>", run: (ctx) => buildauto(ctx) },
]);
plug.run = buildauto; // dipakai plugin .gemini (provider dipaksa Gemini)
module.exports = plug;

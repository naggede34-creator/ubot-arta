// AI (ARTA PEDIA): .ai <soalan>  .tr <bahasa> <teks>  .sum  .fix  -- kongsi had penggunaan dengan .autorich
const gemini = require("../llm");
const { card, edit, rawEdit, strip, esc, footerOf, clip, nl2br } = require("../ui");
const { showLoading, finishLoading, failLoading } = require("../panel");

const SYS =
  "Anda pembantu ringkas dan tepat. Jawab dalam bahasa yang sama dengan pengguna (lalai Bahasa Melayu). " +
  "Jawab dalam gaya kad Rich Telegram: tajuk ringkas, bahagian tersusun, teks mudah dibaca, dan emoji premium/custom emoji jika tersedia. Gunakan ayat pendek, maksimum lebih kurang 1200 aksara.";

// Dapatkan teks input: argumen atau mesej yang direply
async function inputText(ctx, from = 0) {
  let text = ctx.args.slice(from).join(" ").trim();
  const rm = await ctx.msg.getReplyMessage().catch(() => null);
  const ref = rm && rm.message ? rm.message : "";
  if (!text) return ref.slice(0, 3000);
  return (ref ? `${text}\n\n--- Rujukan ---\n${ref}` : text).slice(0, 3000);
}

// Jalankan permintaan AI dengan semakan kunci + had; paparkan kad Rich
async function run(ctx, { title, icon, label, prompt, system = SYS, usage }) {
  if (!gemini.hasKey()) return edit(ctx, "\u26A0\uFE0F " + gemini.missingKeyMsg());
  if (!prompt) return edit(ctx, usage);

  const limiter = require("./autorich").checkLimit;
  const limited = limiter(ctx.account);
  if (limited) return edit(ctx, `\u23F3 ${limited}`);

  const pc = { client: ctx.client, msg: ctx.msg, account: ctx.account };
  const L = await showLoading({ ...pc, label: "AI sedang berfikir ...", icon: "\uD83E\uDD16" }); // emoji berpusing
  let out;
  let model = "-";
  try {
    const r = await gemini.generate({ system, prompt });
    out = String(r.text || "").replace(/\*\*/g, "").replace(/^#+\s*/gm, "").trim();
    model = r.model || "-";
  } catch (err) {
    console.error(`[ai] ${title} gagal:`, err.message);
    return failLoading(L, pc, `AI gagal: ${gemini.explain(err)}`);
  }
  if (!out) return failLoading(L, pc, "AI tidak memberi jawapan. Cuba lagi.");
  out = out.slice(0, 2800);

  const c = card({
    title, icon,
    rows: [["tag", label, esc(clip(ctx.args.join(" ") || prompt, 70))], ["robot", "Model", `<code>${esc(model)}</code>`]],
    extra: `<blockquote>${nl2br(out)}</blockquote>`,
    extraText: esc(out),
    footer: footerOf(ctx.account),
  });
  try {
    await finishLoading(L, { ...pc, html: c.html, text: c.text });
  } catch (err) {
    console.error(`[ai] ${title}: panel gagal, guna teks biasa:`, err.message);
    await rawEdit(ctx, strip(c.text).slice(0, 3800));
  }
}

const ai = async (ctx) => run(ctx, {
  title: "Jawapan AI", icon: "robot", label: "Soalan", prompt: await inputText(ctx),
  usage: "Guna: .ai <soalan>  (atau balas mesej dengan .ai)",
});

const tr = async (ctx) => {
  const lang = String(ctx.args[0] || "").trim();
  const text = await inputText(ctx, 1);
  return run(ctx, {
    title: "Terjemahan", icon: "link", label: "Bahasa", prompt: lang && text ? `Terjemah teks berikut ke bahasa "${lang}". Beri HANYA terjemahan.\n\n${text}` : "",
    system: "Anda penterjemah. Beri hanya hasil terjemahan tanpa penjelasan.",
    usage: "Guna: .tr <bahasa> <teks>  contoh: .tr english selamat pagi  (atau balas mesej dengan .tr malay)",
  });
};

const sum = async (ctx) => {
  const text = await inputText(ctx);
  return run(ctx, {
    title: "Ringkasan", icon: "chart", label: "Teks", prompt: text ? `Ringkaskan teks berikut dalam 3-5 poin pendek:\n\n${text}` : "",
    usage: "Guna: balas mesej panjang dengan .sum",
  });
};

const fix = async (ctx) => {
  const text = await inputText(ctx);
  return run(ctx, {
    title: "Betulkan Bahasa", icon: "ok", label: "Teks", prompt: text ? `Betulkan ejaan dan tatabahasa teks ini tanpa menukar maksud. Beri HANYA teks yang telah dibetulkan:\n\n${text}` : "",
    usage: "Guna: .fix <teks>  atau balas mesej dengan .fix",
  });
};

module.exports = {
  name: "aitools",
  category: "AI & Media",
  help: [
    { cmd: "ai", alias: [], desc: "tanya AI (ARTA PEDIA REST API): .ai <soalan> atau balas mesej" },
    { cmd: "tr", alias: [], desc: "terjemah: .tr english <teks> atau balas mesej" },
    { cmd: "sum", alias: [], desc: "ringkaskan mesej panjang (balas mesej)" },
    { cmd: "fix", alias: [], desc: "betulkan ejaan/tatabahasa: .fix <teks>" },
  ],
  commands: { ai, tr, sum, fix },
};

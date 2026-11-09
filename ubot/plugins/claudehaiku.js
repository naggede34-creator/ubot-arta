// AI Claude Haiku (ARTA PEDIA): .haiku <pertanyaan>  (atau balas pesan)
// API: https://apiii-xrina.my.id/ai/claudehaiku?text=
// Memakai batas pemakaian AI yang sama dengan .ai dan .autorich (ai_cooldown / ai_daily_limit).
const { card, edit, rawEdit, strip, esc, footerOf, clip, nl2br } = require("../ui");
const { style } = require("../fxcard");
const { showLoading, finishLoading, failLoading } = require("../panel");

const API = "https://apiii-xrina.my.id/ai/claudehaiku";
const SHOW_MAX = 2800; // lebih panjang dari ini: kartu memuat potongan + jawaban lengkap dikirim sebagai file
const USAGE = "Guna: .haiku <pertanyaan>  (atau balas pesan dengan .haiku)\nContoh: .haiku buatkan javascript sederhana untuk ubot";

// Teks masukan: argumen, ditambah pesan yang di-reply sebagai rujukan
async function inputText(ctx) {
  const text = ctx.args.join(" ").trim();
  const rm = await ctx.msg.getReplyMessage().catch(() => null);
  const ref = rm && rm.message ? rm.message : "";
  if (!text) return ref.slice(0, 3000);
  return (ref ? `${text}\n\n--- Rujukan ---\n${ref}` : text).slice(0, 3000);
}

// Ambil teks jawaban dari berbagai bentuk JSON, atau teks biasa
function pickAnswer(body) {
  let d = body;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch (_) {
      return d.trim();
    }
  }
  if (d && d.status === false) throw new Error(String(d.message || d.error || "API mengembalikan error."));
  const roots = [d && d.data, d && d.result, d];
  for (const r of roots) {
    if (typeof r === "string" && r.trim()) return r.trim();
    if (r && typeof r === "object") {
      for (const k of ["result", "response", "answer", "text", "message", "content", "reply"]) {
        if (typeof r[k] === "string" && r[k].trim()) return r[k].trim();
      }
    }
  }
  return "";
}

async function ask(prompt) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 90000);
  try {
    const res = await fetch(`${API}?text=${encodeURIComponent(prompt)}`, {
      signal: ac.signal,
      headers: { "User-Agent": "Mozilla/5.0 ubot", Accept: "application/json,text/plain,*/*" },
    });
    if (!res.ok) throw new Error(`API membalas HTTP ${res.status}`);
    return pickAnswer(await res.text());
  } catch (e) {
    if (e.name === "AbortError") throw new Error("API terlalu lama membalas.");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// Ubah jawaban jadi HTML: blok ``` jadi <pre><code>, sisanya teks biasa (tanpa markdown tebal/judul)
function toHtml(text) {
  const parts = String(text).split(/```/);
  const out = [];
  parts.forEach((seg, i) => {
    if (i % 2 === 1) {
      const code = seg.replace(/^[a-zA-Z0-9+#-]*\n/, "").replace(/\n+$/, "");
      if (code.trim()) out.push(`<pre><code>${esc(code)}</code></pre>`);
    } else {
      const plain = seg.replace(/\*\*/g, "").replace(/^#{1,6}\s*/gm, "").trim();
      if (plain) out.push(nl2br(plain)); // nl2br sudah meng-escape
    }
  });
  return out.join("\n");
}

async function haiku(ctx) {
  const prompt = await inputText(ctx);
  if (!prompt) return edit(ctx, USAGE);

  const limited = require("./autorich").checkLimit(ctx.account);
  if (limited) return edit(ctx, `\u23F3 ${limited}`);

  const pc = { client: ctx.client, msg: ctx.msg, account: ctx.account };
  const L = await showLoading({ ...pc, label: "Claude Haiku sedang berpikir ...", icon: "\uD83E\uDD16" });
  let out;
  try {
    out = await ask(prompt);
  } catch (err) {
    console.error("[haiku] gagal:", err.message);
    return failLoading(L, pc, `AI gagal: ${err.message}`);
  }
  if (!out) return failLoading(L, pc, "AI tidak memberi jawaban. Coba lagi.");

  const long = out.length > SHOW_MAX;
  const shown = long ? out.slice(0, 1500) : out;
  const rows = [
    ["tag", "Pertanyaan", esc(clip(ctx.args.join(" ") || prompt, 70))],
    ["robot", "Model", "<code>Claude Haiku</code>"],
  ];
  if (long) rows.push(["ok", "Jawaban lengkap", "dikirim sebagai file"]);
  const c = card(style({
    title: "Claude Haiku",
    icon: "robot",
    lead: "Dijawab oleh Claude Haiku lewat ARTA PEDIA API",
    rows,
    extraFirst: true,
    extra: toHtml(shown) + (long ? "\n<i>... (dipotong)</i>" : ""),
    extraText: esc(shown),
    checks: [[true, "Jawaban dari Claude Haiku"], [true, long ? "Jawaban lengkap dikirim sebagai file" : "Jawaban ditampilkan utuh"]],
    footer: footerOf(ctx.account),
  }, ".haiku <pertanyaan>  ->  tanya Claude Haiku\nBalas pesan lalu ketik .haiku untuk bertanya soal pesan itu"));
  try {
    await finishLoading(L, { ...pc, html: c.html, text: c.text });
  } catch (err) {
    console.error("[haiku] panel gagal, pakai teks biasa:", err.message);
    await rawEdit(ctx, strip(c.text).slice(0, 3800));
  }

  if (long) {
    const { CustomFile } = require("telegram/client/uploads");
    const buf = Buffer.from(out, "utf8");
    await ctx.client
      .sendFile(ctx.msg.peerId, { file: new CustomFile("jawaban-haiku.txt", buf.length, "", buf), replyTo: ctx.msg.id })
      .catch((e) => console.error("[haiku] gagal kirim file:", e.message));
  }
}

module.exports = {
  name: "claudehaiku",
  category: "AI & Media",
  help: [{ cmd: "haiku", alias: ["claude", "claudehaiku", "ch"], desc: "tanya Claude Haiku (ARTA PEDIA API): .haiku <pertanyaan> atau balas pesan" }],
  commands: { haiku, claude: haiku, claudehaiku: haiku, ch: haiku },
  _pickAnswer: pickAnswer,
  _toHtml: toHtml,
};

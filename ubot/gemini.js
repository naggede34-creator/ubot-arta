// Panggil Gemini API (REST). Model boleh ditetapkan dengan "gemini_model" dalam config.json.
const { cfg } = require("./core");

// Model semasa (Okt 2026). Jika satu tidak boleh dipakai, cuba yang seterusnya.
const DEFAULT_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash", "gemini-flash-latest"];
const BASE = "https://generativelanguage.googleapis.com/v1beta";

// Bersihkan kunci: buang ruang, baris baharu dan tanda petikan yang tersalin sekali
const apiKey = () =>
  String(cfg.gemini_api_key || "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, "");

const hasKey = () => !!apiKey() && !apiKey().startsWith("ISI_");
const mask = (s) => (apiKey() ? String(s).split(apiKey()).join("***") : String(s));

async function request(path, { method = "GET", body, timeoutMs = 60000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: ctl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(mask((data.error && data.error.message) || `HTTP ${res.status}`));
      e.status = res.status;
      e.code = data.error && data.error.status; // contoh PERMISSION_DENIED
      throw e;
    }
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw Object.assign(new Error("Gemini tamat masa"), { status: 0 });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function callModel({ model, system, prompt, timeoutMs, maxTokens = 8192 }) {
  const data = await request(`/models/${model}:generateContent`, {
    method: "POST",
    timeoutMs,
    body: {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: maxTokens, responseMimeType: "application/json" },
    },
  });
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("");
  if (!text) {
    const why = data.promptFeedback && data.promptFeedback.blockReason;
    throw Object.assign(new Error(why ? `Permintaan disekat (${why})` : "Gemini tidak memulangkan teks"), { status: 0 });
  }
  return text;
}

// Kunci itu sendiri tidak sah (tiada guna cuba model lain)
const keyInvalid = (err) => /API key not valid|API_KEY_INVALID|API key expired|API key was reported/i.test(err.message);

async function generate({ system, prompt, timeoutMs = 60000 }) {
  const models = cfg.gemini_model ? [String(cfg.gemini_model)] : DEFAULT_MODELS;
  const tried = [];
  let last;
  for (const model of models) {
    try {
      return { text: await callModel({ model, system, prompt, timeoutMs }), model };
    } catch (err) {
      last = err;
      tried.push(`${model}: ${err.status || "?"}`);
      if (keyInvalid(err)) break;
      // model tiada / tiada kebenaran untuk model ini / tidak disokong -> cuba model seterusnya
      if (err.status === 404 || err.status === 403 || /not found|is not supported/i.test(err.message)) continue;
      break;
    }
  }
  last.tried = tried;
  throw last;
}

// Mesej ralat mesra pengguna + sebab sebenar daripada Google
function explain(err) {
  const m = String((err && err.message) || err);
  const raw = m.slice(0, 180);
  if (keyInvalid(err)) return `API key Gemini tidak sah. Semak gemini_api_key dalam config.json.\n(Google: ${raw})`;
  if (err.status === 403 || /permission|denied|forbidden|billing/i.test(m)) {
    return `Kunci Gemini ditolak (403).\n(Google: ${raw})\nSemak: kunci dibuat di Google AI Studio, Generative Language API aktif, tiada sekatan kunci, dan model dibenarkan untuk projek anda.`;
  }
  if (err.status === 429 || /quota|rate|exhausted/i.test(m)) return `Had kuota Gemini dicapai. Cuba lagi sebentar.\n(Google: ${raw})`;
  if (err.status === 404) return `Model Gemini tiada untuk kunci ini.\n(Google: ${raw})\nTetapkan "gemini_model" dalam config.json kepada model yang ada (cuba .autorich test).`;
  return raw;
}

// Ujian kunci: senarai model yang boleh dipakai + ujian ringkas setiap model
async function diagnose() {
  const lines = [];
  if (!hasKey()) return ["\u26A0\uFE0F gemini_api_key belum diisi dalam config.json"];
  const k = apiKey();
  lines.push(`Kunci dimuat: ${k.slice(0, 4)}\u2026 (${k.length} aksara)`);
  if (k.length < 20) lines.push("\u26A0\uFE0F Kunci nampak terlalu pendek. Salin semula penuh dari Google AI Studio.");
  if (String(cfg.gemini_api_key || "").trim() !== k) lines.push("\u2139\uFE0F Ruang/petikan pada kunci dibuang secara automatik.");

  let available = [];
  try {
    const data = await request("/models?pageSize=100", { timeoutMs: 20000 });
    available = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent") && /gemini/i.test(m.name) && !/tts|image|embedding|live|audio|robotics/i.test(m.name))
      .map((m) => m.name.replace(/^models\//, ""));
    lines.push(`\u2705 Kunci diterima. Model boleh guna: ${available.slice(0, 8).join(", ") || "(tiada)"}`);
  } catch (err) {
    lines.push(`\u274C Senarai model gagal [${err.status || "?"}]: ${String(err.message).slice(0, 140)}`);
    if (keyInvalid(err)) return lines;
  }

  const models = cfg.gemini_model ? [String(cfg.gemini_model)] : DEFAULT_MODELS;
  for (const model of models) {
    try {
      await callModel({ model, prompt: 'Balas JSON ini sahaja: {"html":"ok"}', timeoutMs: 25000, maxTokens: 256 });
      lines.push(`\u2705 ${model}: berfungsi`);
    } catch (err) {
      lines.push(`\u274C ${model} [${err.status || "?"}]: ${String(err.message).slice(0, 120)}`);
    }
  }
  return lines;
}

module.exports = { generate, hasKey, explain, diagnose, DEFAULT_MODELS };

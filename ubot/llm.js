// Adapter AI ARTA PEDIA REST API (GET ?text=...). Dua provider:
//   gemini  -> https://apiii-xrina.my.id/ai/gemini   (config: ai_gemini_url)
//   darkgpt -> https://apiii-xrina.my.id/ai/darkgpt    (config: ai_restapi_url)
// Pilihan provider (urutan prioritas): argumen { provider } > .setai (disimpan di db) > config "ai_provider".
//   "gemini"  : hanya Gemini          "darkgpt" / "restapi" : hanya DarkGPT
//   "auto"    : Gemini dahulu, jika gagal otomatis jatuh ke DarkGPT (lalai)
const { cfg } = require("./core");

const PROVIDERS = {
  gemini: { id: "gemini", label: "ARTA PEDIA Gemini", url: () => String(cfg.ai_gemini_url || "https://apiii-xrina.my.id/ai/gemini").trim() },
  darkgpt: { id: "darkgpt", label: "ARTA PEDIA DarkGPT", url: () => String(cfg.ai_restapi_url || "https://apiii-xrina.my.id/ai/darkgpt").trim() },
};
const validUrl = (u) => /^https?:\/\//i.test(u);

function stored() {
  try {
    return require("./db").getSetting("ai_provider");
  } catch (_) {
    return undefined;
  }
}
// Normalisasi nama provider -> "gemini" | "darkgpt" | "auto"
function normalize(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "gemini" || s === "geminiv2") return "gemini";
  if (s === "darkgpt" || s === "restapi" || s === "xrina") return "darkgpt";
  return "auto";
}
const selected = (force) => normalize(force || stored() || cfg.ai_provider);
function chain(force) {
  const s = selected(force);
  const ids = s === "auto" ? ["gemini", "darkgpt"] : [s];
  return ids.filter((id) => validUrl(PROVIDERS[id].url()));
}

const provider = () => selected();
const name = () => (chain()[0] ? PROVIDERS[chain()[0]].label : "ARTA PEDIA AI");
const hasKey = (force) => chain(force).length > 0;

function extract(data) {
  if (typeof data === "string") return data.trim();
  if (!data || typeof data !== "object") return "";
  for (const key of ["response", "answer", "result", "text", "output", "content", "reply", "jawaban", "hasil"]) {
    if (typeof data[key] === "string" && data[key].trim()) return data[key].trim();
  }
  if (data.data) {
    const nested = extract(data.data);
    if (nested) return nested;
  }
  const choice = data.choices && data.choices[0];
  if (choice) {
    const value = (choice.message && choice.message.content) || choice.text;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  if (typeof data.message === "string" && data.message.trim()) return data.message.trim();
  return "";
}
function safeBody(raw, type) {
  const body = String(raw || "").trim();
  if (/html/i.test(String(type || "")) || /^<!doctype html|^<html/i.test(body)) {
    return "Server mengembalikan halaman HTML, bukan respons API.";
  }
  return body.replace(/\s+/g, " ").slice(0, 180);
}

async function callProvider(id, { system, prompt, timeoutMs }) {
  const p = PROVIDERS[id];
  const url = new URL(p.url());
  const combined = [String(system || "").trim(), String(prompt).trim()].filter(Boolean).join("\n\n");
  url.searchParams.set("text", combined);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json, text/plain" },
      signal: controller.signal,
    });
    const raw = await response.text();
    const type = response.headers && response.headers.get ? response.headers.get("content-type") : "";
    if (!response.ok) {
      const err = new Error(`${p.label} HTTP ${response.status}${safeBody(raw, type) ? ": " + safeBody(raw, type) : ""}`);
      err.status = response.status;
      throw err;
    }
    if (/html/i.test(String(type || "")) || /^\s*<!doctype html|^\s*<html/i.test(raw)) {
      throw new Error(`${p.label} membalas HTML, bukan hasil AI.`);
    }
    let data = raw;
    try { data = JSON.parse(raw); } catch (_) {}
    const text = extract(data);
    if (!text) throw new Error(`Respons ${p.label} diterima, tetapi teks jawaban tidak ditemukan.`);
    return { text, model: p.label, provider: id };
  } catch (err) {
    if (err.name === "AbortError") throw new Error(`${p.label} timeout.`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// generate({ system, prompt, provider?: "gemini"|"darkgpt"|"auto", timeoutMs? })
async function generate({ system, prompt, provider: force, timeoutMs = 60000 }) {
  if (!String(prompt || "").trim()) throw new Error("Prompt AI kosong.");
  const ids = chain(force);
  if (!ids.length) throw new Error("URL AI belum valid di config.json (ai_gemini_url / ai_restapi_url).");
  const errors = [];
  let last;
  for (const id of ids) {
    try {
      return await callProvider(id, { system, prompt, timeoutMs });
    } catch (err) {
      last = err;
      errors.push(`${PROVIDERS[id].label}: ${explain(err)}`);
      console.error(`[ai] ${PROVIDERS[id].label} gagal:`, err.message);
    }
  }
  if (errors.length > 1) {
    const e = new Error(errors.join(" | "));
    e.status = last && last.status;
    throw e;
  }
  throw last;
}

function explain(err) {
  if (err && err.status === 404) return "HTTP 404: route API tidak ditemukan. Periksa URL provider di config.json.";
  if (err && err.status === 429) return "Batas permintaan AI tercapai. Coba lagi nanti.";
  if (err && err.status >= 500) return `Server AI bermasalah (HTTP ${err.status}).`;
  return String((err && err.message) || err).replace(/<[^>]*>/g, "").slice(0, 240);
}

async function diagnose() {
  const lines = [`Provider aktif: ${selected()}`];
  for (const id of ["gemini", "darkgpt"]) {
    const p = PROVIDERS[id];
    if (!validUrl(p.url())) {
      lines.push(`${p.label}: URL belum valid`);
      continue;
    }
    try {
      const r = await callProvider(id, { prompt: "Balas singkat: API aktif", timeoutMs: 20000 });
      lines.push(`${p.label}: OK - ${r.text.slice(0, 80)}`);
    } catch (e) {
      lines.push(`${p.label}: GAGAL - ${explain(e)}`);
    }
  }
  return lines;
}

const missingKeyMsg = () => "URL AI belum valid. Periksa ai_gemini_url / ai_restapi_url di config.json.";

module.exports = { generate, hasKey, explain, diagnose, provider, name, missingKeyMsg, normalize, selected, PROVIDERS };

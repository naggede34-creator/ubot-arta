// Muat konfigurasi dengan selamat:
//   1. config.example.json  -> nilai lalai
//   2. config.json          -> tulis ganti (dibuat automatik daripada contoh jika tiada)
//   3. pembolehubah persekitaran -> tulis ganti (sesuai Pterodactyl: Startup > Variables / CUSTOM_ENVIRONMENT_VARIABLES)
//        BOT_TOKEN  API_ID  API_HASH  AI_RESTAPI_URL  AI_RESTAPI_METHOD  OWNER_IDS   (OWNER_IDS: 123,456)
//        atau UBOT_<NAMA_KUNCI>, contoh UBOT_BRAND  UBOT_DEVELOPER_URL  UBOT_DEFAULT_DAYS
const fs = require("fs");
const path = require("path");

// Muat file .env (di folder yang sama dengan bot.js) -> jadi environment variable. Contoh isi .env:
//   AGW_KEY=agw_live_xxxxx
//   AGW_SECRET=agw_sec_xxxxx
//   NOTIFY_CHANNEL_ID=-100xxxxxxxxxx
// Variabel yang sudah ada di environment server TIDAK ditimpa.
try {
  const envFile = path.join(__dirname, ".env");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m || m[0].trim().startsWith("#")) continue;
      const v = m[2].replace(/^(['"])(.*)\1$/, "$2");
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
} catch (_) {}

const FILE = path.join(__dirname, "config.json");
const EXAMPLE = path.join(__dirname, "config.example.json");

function banner(lines) {
  const bar = "=".repeat(64);
  console.error(["", bar, ...lines, bar, ""].join("\n"));
}

// JSON longgar: buang BOM, komen // dan koma berlebihan sebelum } atau ]
function parseLoose(text, file) {
  const raw = String(text).replace(/^\uFEFF/, "");
  try {
    return JSON.parse(raw);
  } catch (first) {
    try {
      const fixed = raw.replace(/^\s*\/\/.*$/gm, "").replace(/,\s*([}\]])/g, "$1");
      const out = JSON.parse(fixed);
      console.warn(`[config] ${path.basename(file)} ada koma berlebihan / komen: dibaiki automatik. Sila kemaskan fail itu.`);
      return out;
    } catch (_) {
      banner([
        `RALAT: ${path.basename(file)} bukan JSON yang sah.`,
        `Sebab: ${first.message}`,
        "Semak: setiap baris ada koma KECUALI baris terakhir; semua teks dalam tanda petikan \"...\".",
        "Tip: tampal isi fail ke https://jsonlint.com untuk cari barisnya.",
      ]);
      process.exit(78); // config salah: supervisor tidak me-restart-loop
    }
  }
}

function readFileJson(file) {
  try {
    return parseLoose(fs.readFileSync(file, "utf8"), file);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

function coerce(sample, value) {
  const v = String(value).trim();
  if (typeof sample === "number") return Number.isFinite(Number(v)) ? Number(v) : sample;
  if (typeof sample === "boolean") return /^(1|true|yes|on)$/i.test(v);
  if (Array.isArray(sample)) {
    const parts = v.split(/[,\s;]+/).filter(Boolean);
    return parts.every((p) => /^-?\d+$/.test(p)) ? parts.map(Number) : parts;
  }
  return v;
}

function load() {
  const defaults = readFileJson(EXAMPLE) || {};
  let user = readFileJson(FILE);
  if (user === null) {
    try {
      if (fs.existsSync(EXAMPLE)) fs.copyFileSync(EXAMPLE, FILE);
      console.warn("[config] config.json tiada, dibuat daripada config.example.json. Isi nilai sebenar (atau guna Startup variables).");
    } catch (_) {
      console.warn("[config] config.json tiada dan tidak dapat dibuat. Guna pembolehubah persekitaran (BOT_TOKEN, API_ID, API_HASH ...).");
    }
    user = {};
  }
  const cfg = { ...defaults, ...user };

  const SHORT = { bot_token: "BOT_TOKEN", api_id: "API_ID", api_hash: "API_HASH", gemini_api_key: "GEMINI_API_KEY", gemini_model: "GEMINI_MODEL", ai_restapi_url: "AI_RESTAPI_URL", ai_restapi_method: "AI_RESTAPI_METHOD", owner_ids: "OWNER_IDS" };
  for (const key of Object.keys({ ...defaults, ...user })) {
    const names = [`UBOT_${key.toUpperCase()}`, SHORT[key]].filter(Boolean);
    const hit = names.find((n) => process.env[n] !== undefined && String(process.env[n]).trim() !== "");
    const plainValue = typeof cfg[key] !== "object" || cfg[key] === null || Array.isArray(cfg[key]); // objek (gateway) tidak ditimpa
    if (hit && plainValue) cfg[key] = coerce(cfg[key], process.env[hit]);
  }
  return cfg;
}

module.exports = load();

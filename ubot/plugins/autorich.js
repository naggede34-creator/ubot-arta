const { shared, esc } = require("../core");
const access = require("../access");
const aiProvider = require("../llm");
const richai = require("../richai");
const { showLoading, finishLoading, failLoading, showPanel } = require("../panel");
const { NewMessage } = require("telegram/events");
const AP = require("../lib/autorichPrefs"); // fail SC (tidak diubah)
const UP = require("../lib/userbotRichPrefs"); // fail SC (tidak diubah)
const kit = require("../autorichkit");
const emo = require("../emo");
const ui = require("../ui");
const RT = require("../richtext");
const BK = require("../buildkit");

const PM_ICON = "5258362837411045098"; // \uD83D\uDC64
const LINK_ICON = "5271604874419647061"; // \uD83D\uDD17

const USAGE =
  "Guna: .autorich <permintaan>\n" +
  "Contoh: .autorich buat promosi jualan akaun game, harga 10rb, hubungi saya\n" +
  "Boleh juga balas (reply) satu mesej dengan .autorich supaya AI olah kandungannya.\n" +
  "Uji REST API: .autorich test";

// Had penggunaan (REST API ARTA PEDIA milik owner dikongsi): jeda + had harian untuk pelanggan
const usage = new Map();
function checkLimit(account) {
  const cooldown = Number(shared.cfg.ai_cooldown !== undefined ? shared.cfg.ai_cooldown : 15) * 1000;
  // had asas x pengganda paket (GOLD x1, PLATINUM x3)
  const daily = Number(shared.cfg.ai_daily_limit !== undefined ? shared.cfg.ai_daily_limit : 30) * require("../paket").aiMultiplier(account.userId);
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const u = usage.get(account.accountId) || { last: 0, day, count: 0 };
  if (u.day !== day) {
    u.day = day;
    u.count = 0;
  }
  if (now - u.last < cooldown) return `Tunggu ${Math.ceil((cooldown - (now - u.last)) / 1000)} saat sebelum guna .autorich lagi.`;
  if (daily > 0 && !access.isStaff(account.userId) && u.count >= daily) return `Had harian ${daily} penggunaan AI sudah dicapai.`;
  u.last = now;
  u.count++;
  usage.set(account.accountId, u);
  return null;
}

// ARTA PEDIA dipinta memulangkan JSON {html, buttons}; terima juga HTML mentah / JSON dalam blok kod
function parseAi(raw) {
  const s = String(raw).trim().replace(/^```(?:json|html)?\s*/i, "").replace(/\s*```$/i, "");
  const tryJson = (t) => {
    try {
      const j = JSON.parse(t);
      if (j && typeof j.html === "string") return { html: j.html, buttons: Array.isArray(j.buttons) ? j.buttons : [] };
    } catch (_) {}
    return null;
  };
  const direct = tryJson(s);
  if (direct) return direct;
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a >= 0 && b > a) {
    const inner = tryJson(s.slice(a, b + 1));
    if (inner) return inner;
  }
  return { html: s, buttons: [] };
}



// Format AI khusus teks biasa + inline button row (tanpa HTML).
function parseButtonAi(raw) {
  const s = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  let obj = null;
  const parse = (v) => { try { return JSON.parse(v); } catch (_) { return null; } };
  obj = parse(s);
  if (!obj) {
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) obj = parse(s.slice(a, b + 1));
  }
  const text = obj && typeof obj.text === "string" ? obj.text
    : obj && typeof obj.message === "string" ? obj.message
    : s;
  const buttons = [];
  const seen = new Set();
  const add = (label, url) => {
    const u = String(url || "").trim();
    if (!/^(https?:\/\/|tg:\/\/)/i.test(u) || seen.has(u)) return;
    seen.add(u);
    buttons.push({ text: String(label || "Buka").slice(0, 32), url: u });
  };
  for (const b of (obj && Array.isArray(obj.buttons) ? obj.buttons : [])) {
    if (b && b.url) add(b.text, b.url);
  }
  for (const m of text.matchAll(/https?:\/\/[^\s<>()]+/g)) add("Buka Link", m[0].replace(/[.,!?]+$/, ""));
  for (const m of text.matchAll(/@([A-Za-z][A-Za-z0-9_]{4,31})/g)) add("Hubungi @" + m[1], "https://t.me/" + m[1]);
  return { text: String(text || "").replace(/```[\s\S]*?```/g, "").trim().slice(0, 3500), buttons: buttons.slice(0, 6) };
}
// Tombol: buang emoji biasa di awal teks, ganti ikon premium (tampil setelah panel diedit)
function withIcon(b) {
  const text = String(b.text || "").replace(/^[^\p{L}\p{N}]+/u, "").trim() || "Buka";
  const icon = BK.smartIcon(text);
  return { ...b, text, ...(icon ? { icon } : {}) };
}
function buttonPrompt() {
  return [
    "Anda copywriter Telegram. Ubah permintaan pengguna menjadi pesan yang CANTIK, rapi, hidup dan persuasif.",
    "WAJIB gunakan format Rich Telegram: judul tebal, bagian terstruktur, baris pendek, dan emoji premium (custom emoji) bila tersedia. Jangan keluarkan HTML.",
    'KELUARKAN SATU JSON SAHAJA: {"text":"isi pesan","buttons":[{"text":"Nama tombol","url":"https://..."}]}. Tanpa HTML, tanpa code fence.',
    "FORMAT di dalam text:",
    "- Baris pertama = JUDUL/hook singkat, diawali 1 emoji.",
    "- **tebal** untuk kata kunci/harga, __miring__ untuk catatan, `kode` untuk nilai yang perlu disalin.",
    "- Data harga/spesifikasi tulis satu baris per item: `LABEL: nilai` (2+ baris berurutan otomatis jadi kotak rapi).",
    "- Poin kelebihan: awali baris dengan `- `.",
    "- Ajakan penutup (CTA): awali baris dengan `> ` (jadi kutipan).",
    "- Pisahkan bagian dengan baris kosong. Boleh 1 emoji di awal tiap bagian; variasikan.",
    "- Emoji HANYA dari: " + RT.EMOJI_WHITELIST,
    "- Boleh percantik bahasa, tapi JANGAN reka harga, angka, fakta, testimoni, atau URL yang tidak diberikan pengguna.",
    "- Buttons hanya dari URL/username yang diberikan pengguna. Teks tombol tanpa emoji. Jika tidak ada, buttons: [].",
    "- Gunakan bahasa yang sama dengan pengguna. Maksimal sekitar 900 karakter.",
    "Contoh text:",
    "🔥 **FORSALE SC UBOT**\\n\\n✨ Mirip **Kafka 95%** — siap pakai!\\n\\nNo Up: 5.000\\nFull Up: 10.000\\n\\n- 🛡 Owner terverifikasi\\n- ⚡ Pengiriman cepat\\n\\n> 💬 Minat? **PM sekarang** sebelum kehabisan!",
  ].join("\n");
}

// ===== Pengaturan AutoRich (gaya SC): .autorich on|off|reply|ai|emoji|style|exclude|footer|status =====
const SUBS = new Set(["on", "off", "reply", "ai", "emoji", "style", "exclude", "footer", "status", "log", "help"]);
const flag = (b) => (b ? "AKTIF" : "MATI");
const onoff = (v) => (/^(on|aktif|nyala|1|true)$/i.test(v) ? true : /^(off|mati|0|false)$/i.test(v) ? false : null);

function statusCard(account, chatId) {
  const p = AP.getPrefs(account.accountId);
  return ui.card({
    title: "AutoRich", icon: "robot",
    rows: [
      ["bolt", "Auto teks (.autorich on)", `<b>${flag(p.autotext)}</b>`],
      ["chart", "Balasan command Rich", `<b>${flag(p.replyRich)}</b>`],
      ["robot", "Bungkus guna AI", `<b>${flag(p.ai)}</b>`],
      ["gem", "Emoji premium", `<b>${flag(p.emoji)}</b>`],
      ["tag", "Tema", `<b>${esc(p.style)}</b>`],
      ["box", "Footer", p.footer ? esc(p.footer) : "ikut tema"],
      ["user", "Chat dikecualikan", `${p.exclude.length}${p.exclude.includes(String(chatId)) ? " (termasuk chat ini)" : ""}`],
      ["time", "Statistik", `${p.log.total} jumlah \u00B7 ${p.log.today} hari ini`],
    ],
    checks: [
      [true, "<code>.autorich on</code> / <code>off</code> - semua teks biasa jadi kad Rich"],
      [true, "<code>.autorich ai on</code> \u00B7 <code>emoji on</code> \u00B7 <code>reply on</code>"],
      [true, "<code>.autorich style promo</code> (default, promo, warning, success, info)"],
      [true, "<code>.autorich exclude add</code> / <code>remove</code> / <code>clear</code> (chat ini)"],
      [true, "<code>.autorich footer teks</code> atau <code>footer reset</code>"],
    ],
    footer: ui.footerOf(account),
  });
}

async function subCmd(ctx, args) {
  const { client, msg, account } = ctx;
  const key = account.accountId;
  const [a, ...rest] = args;
  const sub = a.toLowerCase();
  const v = rest[0] || "";
  let err = null;
  if (sub === "on" || sub === "off") {
    AP.setPref(key, { autotext: sub === "on" });
    UP.setRichPref(key, { autotext: sub === "on" });
  } else if (sub === "reply" || sub === "ai" || sub === "emoji") {
    const b = onoff(v);
    if (b === null) err = `Guna: .autorich ${sub} on|off`;
    else {
      AP.setPref(key, { [sub === "reply" ? "replyRich" : sub]: b });
      if (sub === "reply") UP.setRichPref(key, { replyRich: b });
    }
  } else if (sub === "style") {
    if (!AP.STYLES[v.toLowerCase()]) err = `Guna: .autorich style ${Object.keys(AP.STYLES).join("|")}`;
    else AP.setPref(key, { style: v.toLowerCase() });
  } else if (sub === "exclude") {
    const act = (v || "").toLowerCase();
    if (!["add", "remove", "clear"].includes(act)) err = "Guna: .autorich exclude add|remove|clear  (chat ini)";
    else AP.toggleExclude(key, msg.chatId, act);
  } else if (sub === "footer") {
    const t = UP.cleanFooter(rest.join(" "));
    if (!t) err = "Guna: .autorich footer <teks>  atau  .autorich footer reset";
    else {
      const val = /^(reset|default|padam)$/i.test(t) ? null : t;
      AP.setPref(key, { footer: val });
      UP.setRichPref(key, { footer: val === null ? UP.DEFAULT_FOOTER : val });
    }
  }
  if (err) return client.editMessage(msg.peerId, { message: msg.id, text: "\u26A0\uFE0F " + err }).catch(() => {});
  const c = statusCard(account, msg.chatId);
  try {
    await showPanel({ client, msg, account, html: c.html, text: c.text });
    await msg.delete({ revoke: true }).catch(() => {});
  } catch (e) {
    await client.editMessage(msg.peerId, { message: msg.id, text: ui.strip(c.html).slice(0, 3500) }).catch(() => {});
  }
}

// ===== Auto teks: semua mesej biasa yang anda taip dijadikan kad Rich (jika .autorich on) =====
function onClient(entry) {
  const prefix = shared.cfg.prefix || ".";
  entry.client.addEventHandler(async (event) => {
    try {
      const msg = event.message;
      if (!msg || !msg.out || !msg.message || msg.viaBotId || msg.media || msg.fwdFrom) return;
      const p = AP.getPrefs(entry.accountId);
      if (!p.autotext || AP.isExcluded(entry.accountId, msg.chatId)) return;
      const text = String(msg.message).trim();
      if (!text || text.length > 3000 || text.startsWith(prefix)) return;
      let output = text;
      let buttons = [];
      if (p.ai && aiProvider.hasKey() && !checkLimit(entry)) {
        try {
          const { text: out } = await aiProvider.generate({ system: buttonPrompt(), prompt: text });
          const ai = parseButtonAi(out);
          if (ai.text) output = ai.text;
          buttons = ai.buttons;
        } catch (err) {
          console.error("[autorich] AI gagal, guna teks asal:", err.message);
        }
      } else {
        const st = AP.STYLES[p.style] || AP.STYLES.default;
        output = `${st.header}\\n\\n${text}${p.footer ? `\\n\\n${p.footer}` : `\\n\\n${st.footer}`}`;
      }
      const fake = { id: msg.id, peerId: msg.peerId, __replyToId: msg.replyTo && msg.replyTo.replyToMsgId ? msg.replyTo.replyToMsgId : 0 };
      const rows = richai.layout(buttons.map(withIcon), 2);
      await showPanel({
        client: entry.client, msg: fake, account: entry,
        text: RT.plainOf(output).slice(0, 3500),
        textHtml: RT.plainToHtml(output, { emoji: p.emoji !== false }),
        buttons: rows, plainTextOnly: true
      });
      await msg.delete({ revoke: true }).catch(() => {});
      AP.bumpLog(entry.accountId);
    } catch (err) {
      console.error("[autorich] auto teks gagal:", err.message);
    }
  }, new NewMessage({ outgoing: true }));
}

async function autorich({ client, msg, account }) {
  const edit = (text, html = false) =>
    client.editMessage(msg.peerId, { message: msg.id, text, ...(html ? { parseMode: "html" } : {}) }).catch(() => {});

  {
    const words = String(msg.message || "").trim().split(/\s+/).slice(1);
    if (words.length && SUBS.has(words[0].toLowerCase()) && !(words[0].toLowerCase() === "help" && false)) {
      return subCmd({ client, msg, account }, words);
    }
    if (!words.length && !(await msg.getReplyMessage().catch(() => null))) {
      return subCmd({ client, msg, account }, ["status"]);
    }
  }
  if (!aiProvider.hasKey()) return edit("⚠️ " + aiProvider.missingKeyMsg());

  // .autorich test  -> semak REST API ARTA PEDIA dan model yang boleh dipakai
  if (/^\S+\s+test\s*$/i.test(String(msg.message || ""))) {
    await edit("🔎 Menguji ARTA PEDIA AI (Gemini + DarkGPT)...");
    const lines = await aiProvider.diagnose();
    return edit(lines.join("\n").slice(0, 3800));
  }

  let prompt = String(msg.message || "").replace(/^\S+\s*/, "").trim();
  const rm = await msg.getReplyMessage();
  if (rm && rm.message) prompt = prompt ? `${prompt}\n\n--- Mesej rujukan ---\n${rm.message}` : rm.message;
  prompt = prompt.slice(0, 3000);
  if (!prompt) return edit(USAGE);

  const limited = checkLimit(account);
  if (limited) return edit(`\u23F3 ${limited}`);

  // Status sementara teks biasa; tidak memakai Rich HTML.
  const pc = { client, msg, account };
  await edit("🤖 AI sedang menyusun pesan...");

  let plain;
  let aiButtons;
  try {
    const { text } = await aiProvider.generate({ system: buttonPrompt(), prompt });
    const ai = parseButtonAi(text);
    plain = ai.text;
    aiButtons = ai.buttons;
  } catch (err) {
    // Jangan hentikan command saat provider timeout / fetch gagal.
    // Isi asal tetap dirapikan menjadi Rich Message tanpa mengklaim AI berhasil.
    console.error(".autorich: AI gagal, guna fallback Rich:", err.message);
    const st = AP.STYLES[AP.getPrefs(account.accountId).style] || AP.STYLES.default;
    plain = `${st.header}\\n\\n${prompt}\\n\\n${st.footer}\\n\\n⚠️ AI sementara tidak dapat dihubungi; ini format Rich fallback.`;
    aiButtons = [];
  }
  if (!plain || plain.length < 2) return edit("⚠️ Teks tidak tersedia. Coba lagi.");

  // Button row: maksimum 2 tombol per baris. Tombol PM otomatis dinonaktifkan.
  const links = aiButtons.map((b) => withIcon({ text: b.text, url: b.url, style: "primary" }));
  const rows = richai.layout(links, 2);

  try {
    await showPanel({
      ...pc,
      text: RT.plainOf(plain),
      textHtml: RT.plainToHtml(plain),
      buttons: rows,
      plainTextOnly: true
    });
    await msg.delete({ revoke: true }).catch(() => {});
  } catch (err) {
    console.error(".autorich: panel button row gagal:", err.message);
    await edit((plain.slice(0, 3500) || "⚠️ Payload tidak dapat dihantar.") + `\n\n⚠️ Tombol gagal dikirim: ${String(err.message || err).slice(0, 180)}`);
  }
}

module.exports = {
  name: "autorich",
  category: "AI & Media",
  help: [
    {
      cmd: "autorich",
      alias: [],
      desc: "AI hasilkan Rich Message. Contoh: .autorich promosi toko | .autorich on/off (semua teks jadi Rich) | ai/emoji/reply/style/exclude/footer/status",
    },
  ],
  commands: { autorich },
  onClient,
  checkLimit,
  buttonPrompt,
  parseButtonAi,
  withIcon,
};

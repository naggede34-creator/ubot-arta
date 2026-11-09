// ===== ATUR TOMBOL (owner) =====
// PANEL OWNER > Atur Tombol:
//   DASHBOARD /start  -> tekan tombol mana saja lalu: Ganti Nama · Naik / Turun · Kiri / Kanan · Gabung ke baris atas · Pisah baris ·
//                        Sembunyikan (tombol bawaan, bisa dimunculkan lagi) / Hapus (tombol tambahan) · Warna
//                        + Tambah Tombol baru (link URL atau tombol teks info) · Reset tata letak
//   SEMUA MENU        -> "Ganti Nama Tombol (Semua Menu)": ganti teks tombol apa saja di bot (mis. "Isi Saldo" -> "Top Up"),
//                        atau sembunyikan tombol dengan mengetik "hapus" sebagai nama baru.
// Tombol PANEL OWNER dan CHANNEL FEEDBACK tetap di posisi bawah (tidak bisa dihapus) supaya owner tidak terkunci.
// Data: data/db.json (settings.home_layout dan settings.btn_rules), langsung berlaku tanpa restart.
const crypto = require("crypto");
const db = require("./db");
const access = require("./access");
const UI = require("./botui");
const { esc, btn, pair, cleanStr } = require("./core");

const MAX_ROW = 4; // tombol per baris
const MAX_CUSTOM = 20;
const cut = (s, n) => { const a = Array.from(cleanStr(String(s == null ? "" : s))); return a.length > n ? a.slice(0, n - 1).join("") + "…" : a.join(""); };
const norm = (t) => String(t || "").replace(/\s+/g, " ").trim().toLowerCase();
const hash = (t) => crypto.createHash("md5").update(norm(t)).digest("hex").slice(0, 8);
const isOwner = (id) => access.isOwner(id);

// ---------------------------------------------------------------- definisi tombol dashboard (diisi bot.js)
let HOME = { defs: () => ({}), rows: [] }; // defs(u) -> { id: { label, data?, url?, icon?, style?, show?: bool } }
function setHome(defsFn, defaultRows) { HOME = { defs: defsFn, rows: defaultRows }; }

const conf = () => {
  const c = db.getSetting("home_layout") || {};
  return { rows: Array.isArray(c.rows) ? c.rows : null, labels: c.labels || {}, hidden: Array.isArray(c.hidden) ? c.hidden : [], custom: c.custom || {}, seq: Number(c.seq) || 0 };
};
const saveConf = (c) => db.setSetting("home_layout", c);

// susunan baris id yang berlaku (tervalidasi)
function layoutRows(c = conf()) {
  const known = new Set([...HOME.rows.flat(), ...Object.keys(c.custom)]);
  const hidden = new Set(c.hidden);
  const base = c.rows || HOME.rows;
  const seen = new Set();
  const rows = base.map((r) => (Array.isArray(r) ? r : [r]).filter((id) => known.has(id) && !hidden.has(id) && !seen.has(id) && seen.add(id))).filter((r) => r.length);
  for (const r of HOME.rows) for (const id of r) if (!seen.has(id) && !hidden.has(id)) { rows.push([id]); seen.add(id); } // tombol baru dari update SC
  for (const id of Object.keys(c.custom)) if (!seen.has(id) && !hidden.has(id)) { rows.push([id]); seen.add(id); }
  return rows;
}
function defOf(id, defs, c) {
  if (c.custom[id]) {
    const x = c.custom[id];
    return { label: x.text, ...(x.kind === "url" ? { url: x.value } : { data: `bl:c:${id}` }), style: x.style || "primary", custom: true, show: true };
  }
  return defs[id] || null;
}
const labelOf = (id, defs, c) => { const d = defOf(id, defs, c); return (c.labels[id] || (d && d.label) || id); };

// keyboard dashboard untuk pengguna u
function render(fancy, u) {
  const c = conf();
  const defs = HOME.defs(u);
  const out = [];
  for (const r of layoutRows(c)) {
    const bs = [];
    for (const id of r) {
      const d = defOf(id, defs, c);
      if (!d || d.show === false) continue;
      const text = labelOf(id, defs, c);
      if (d.url) bs.push({ text, url: String(d.url), ...(fancy && d.style && d.style !== "plain" ? { style: d.style } : {}), ...(fancy && d.icon ? { icon_custom_emoji_id: d.icon } : {}) });
      else bs.push(btn(fancy, text, d.data, d.style, d.icon));
    }
    if (bs.length) out.push(bs.length > 1 ? pair(...bs) : bs);
  }
  return out;
}

// ---------------------------------------------------------------- operasi tata letak
function withRows(fn) {
  const c = conf();
  const rows = layoutRows(c).map((r) => [...r]);
  const res = fn(rows, c);
  c.rows = rows.filter((r) => r.length);
  saveConf(c);
  return res;
}
const where = (rows, id) => { for (let i = 0; i < rows.length; i++) { const j = rows[i].indexOf(id); if (j >= 0) return [i, j]; } return null; };
const OPS = {
  up(rows, id) { // sendirian -> tukar baris dengan baris atas ; berbagi baris -> jadi baris sendiri di atas
    const p = where(rows, id); if (!p) return "Tombol tidak ditemukan";
    const [i, j] = p;
    if (rows[i].length === 1) { if (i === 0) return "Sudah paling atas"; [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; return null; }
    rows[i].splice(j, 1); rows.splice(i, 0, [id]); return null;
  },
  down(rows, id) {
    const p = where(rows, id); if (!p) return "Tombol tidak ditemukan";
    const [i, j] = p;
    if (rows[i].length === 1) { if (i === rows.length - 1) return "Sudah paling bawah"; [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; return null; }
    rows[i].splice(j, 1); rows.splice(i + 1, 0, [id]); return null;
  },
  left(rows, id) { const p = where(rows, id); if (!p) return "Tombol tidak ditemukan"; const [i, j] = p; if (j === 0) return "Sudah paling kiri"; [rows[i][j - 1], rows[i][j]] = [rows[i][j], rows[i][j - 1]]; return null; },
  right(rows, id) { const p = where(rows, id); if (!p) return "Tombol tidak ditemukan"; const [i, j] = p; if (j === rows[i].length - 1) return "Sudah paling kanan"; [rows[i][j + 1], rows[i][j]] = [rows[i][j], rows[i][j + 1]]; return null; },
  join(rows, id) { // gabung ke baris atas
    const p = where(rows, id); if (!p) return "Tombol tidak ditemukan";
    const [i, j] = p;
    if (i === 0) return "Tidak ada baris di atas";
    if (rows[i - 1].length >= MAX_ROW) return `Baris atas sudah penuh (maks ${MAX_ROW} tombol)`;
    rows[i].splice(j, 1); rows[i - 1].push(id); return null;
  },
  split(rows, id) { // keluar jadi baris sendiri tepat di bawah barisnya
    const p = where(rows, id); if (!p) return "Tombol tidak ditemukan";
    const [i, j] = p;
    if (rows[i].length === 1) return "Tombol ini sudah satu baris sendiri";
    rows[i].splice(j, 1); rows.splice(i + 1, 0, [id]); return null;
  },
};

// ---------------------------------------------------------------- aturan global (semua menu): ganti nama / sembunyikan berdasarkan teks
const rules = () => { const r = db.getSetting("btn_rules") || {}; return { rename: r.rename || {}, hide: Array.isArray(r.hide) ? r.hide : [] }; };
const saveRules = (r) => db.setSetting("btn_rules", r);
const PROTECT = (b) => typeof b.callback_data === "string" && (b.callback_data === "own" || b.callback_data.startsWith("bl:") || b.callback_data.startsWith("bcl:"));
function apply(payload) {
  const kb = payload && payload.reply_markup;
  const rows = kb && kb.inline_keyboard;
  if (!Array.isArray(rows) || !rows.length) return payload;
  const r = rules();
  const ren = Object.keys(r.rename).length;
  if (!ren && !r.hide.length) return payload;
  const hide = new Set(r.hide);
  const out = [];
  for (const row of rows) {
    if (!Array.isArray(row)) { out.push(row); continue; }
    const nr = [];
    for (const b of row) {
      if (!b || typeof b !== "object" || typeof b.text !== "string") { nr.push(b); continue; }
      const k = norm(b.text);
      if (hide.has(k) && !PROTECT(b)) continue;
      nr.push(r.rename[k] && !(typeof b.callback_data === "string" && b.callback_data.startsWith("bl:g")) ? { ...b, text: r.rename[k] } : b);
    }
    if (nr.length) out.push(nr);
  }
  return { ...payload, reply_markup: { ...kb, inline_keyboard: out } };
}

// ---------------------------------------------------------------- kartu editor
function editorCard(note, owner) {
  const c = conf();
  const defs = HOME.defs(owner);
  const rows = layoutRows(c);
  return UI.card({
    title: "Atur Tombol Dashboard", icon: "gear",
    sub: "Tombol di bawah ini adalah <b>susunan dashboard /start</b>. Tekan tombol yang ingin diubah.",
    rows: [
      ["box", "Tombol tampil", `<b>${rows.flat().length}</b> · ${rows.length} baris`],
      ["no", "Disembunyikan", `<b>${c.hidden.length}</b>`],
      ["star", "Tombol tambahan", `<b>${Object.keys(c.custom).length}</b>`],
      ["tag", "Aturan semua menu", `<b>${Object.keys(rules().rename).length + rules().hide.length}</b>`],
    ],
    extra: `<p><b>Susunan sekarang</b></p><ol>${rows.map((r) => `<li>${r.map((id) => `[${esc(cut(labelOf(id, defs, c), 26))}]`).join(" ")}</li>`).join("")}</ol>`,
    checks: [[true, "Ganti nama, pindah posisi, sembunyikan, ubah warna"], [true, "Tambah tombol link / tombol info sendiri"], [true, "Panel Owner &amp; Channel Feedback selalu di bawah"]],
    note: note || "",
  });
}
function editorKb(owner) {
  return (fancy) => {
    const c = conf();
    const defs = HOME.defs(owner);
    const grid = layoutRows(c).map((r) => {
      const bs = r.map((id) => btn(fancy, cut(labelOf(id, defs, c), 24), `bl:s:${id}`, c.custom[id] ? "success" : "primary"));
      return bs.length > 1 ? pair(...bs) : bs;
    });
    return [
      ...grid,
      pair(btn(fancy, "➕ Tambah Tombol", "bl:a", "success", UI.E.rocket), btn(fancy, `Tersembunyi (${c.hidden.length})`, "bl:H", "plain", UI.E.no)),
      [btn(fancy, "Ganti Nama Tombol (Semua Menu)", "bl:g", "primary", UI.E.tag)],
      pair(btn(fancy, "Reset Tata Letak", "bl:z", "danger", UI.E.fire), btn(fancy, "Kembali ke Panel Owner", "own", "plain", UI.E.wave)),
    ];
  };
}
function itemCard(id, owner, note) {
  const c = conf();
  const defs = HOME.defs(owner);
  const d = defOf(id, defs, c);
  const p = where(layoutRows(c), id);
  const custom = !!c.custom[id];
  return UI.card({
    title: "Atur Tombol", icon: "tag",
    rows: [
      ["tag", "Tombol", `<b>${esc(labelOf(id, defs, c))}</b>`],
      ...(c.labels[id] && d && !custom ? [["info", "Nama asli", esc(d.label)]] : []),
      ["box", "Posisi", p ? `baris <b>${p[0] + 1}</b>, kolom <b>${p[1] + 1}</b>` : "-"],
      ["gear", "Jenis", custom ? (c.custom[id].kind === "url" ? `Tambahan · link <code>${esc(cut(c.custom[id].value, 60))}</code>` : "Tambahan · teks info") : "Bawaan"],
      ...(d && d.show === false ? [["info", "Catatan", "Sekarang tidak tampil (otomatis, tergantung pengaturan / pengguna)"]] : []),
    ],
    note: note || "Pilih aksi. Hasil langsung terlihat di /start.",
  });
}
const itemKb = (id) => (fancy) => {
  const custom = !!conf().custom[id];
  return [
    pair(btn(fancy, "✏️ Ganti Nama", `bl:r:${id}`, "success"), btn(fancy, "🎨 Warna", `bl:w:${id}`, "primary")),
    pair(btn(fancy, "⬆️ Naik", `bl:o:up:${id}`, "primary"), btn(fancy, "⬇️ Turun", `bl:o:down:${id}`, "primary")),
    pair(btn(fancy, "⬅️ Kiri", `bl:o:left:${id}`, "primary"), btn(fancy, "➡️ Kanan", `bl:o:right:${id}`, "primary")),
    pair(btn(fancy, "Gabung ke Baris Atas", `bl:o:join:${id}`, "plain"), btn(fancy, "Pisah Baris Sendiri", `bl:o:split:${id}`, "plain")),
    ...(custom ? [[btn(fancy, "Ubah Isi / Link", `bl:v:${id}`, "primary")]] : []),
    [btn(fancy, custom ? "🗑 Hapus Tombol" : "🗑 Sembunyikan Tombol", `bl:h:${id}`, "danger")],
    [btn(fancy, "‹ Kembali ke Susunan", "bl:m", "plain", UI.E.wave)],
  ];
};
function rulesCard(note) {
  const r = rules();
  const list = [...Object.entries(r.rename).map(([k, v]) => ["tag", esc(cut(k, 30)), `→ <b>${esc(cut(v, 30))}</b>`]), ...r.hide.map((k) => ["no", esc(cut(k, 30)), "<b>disembunyikan</b>"])];
  return UI.card({
    title: "Ganti Nama Tombol (Semua Menu)", icon: "tag",
    sub: "Ubah teks tombol <b>apa saja</b> di bot (menu noktel, panel, produk, dll) berdasarkan teks aslinya.",
    rows: list.length ? list.slice(0, 25) : [["info", "Aturan", "Belum ada"]],
    checks: [[true, "Ketik nama baru <code>hapus</code> untuk menyembunyikan tombol"], [true, "Tekan aturan di bawah untuk menghapusnya"]],
    note: note || "",
  });
}
const rulesKb = (fancy) => {
  const r = rules();
  const all = [...Object.keys(r.rename), ...r.hide].slice(0, 20);
  return [
    [btn(fancy, "➕ Tambah Aturan", "bl:gn", "success", UI.E.rocket)],
    ...all.map((k) => [btn(fancy, `🗑 ${cut(k, 34)}`, `bl:gd:${hash(k)}`, "danger")]),
    [btn(fancy, "‹ Kembali", "bl:m", "plain", UI.E.wave)],
  ];
};

// ---------------------------------------------------------------- pendaftaran
const state = new Map(); // ownerId -> { act, id?, step?, d? }
const cancelKb = (fancy) => [[btn(fancy, "Batal", "bl:x", "danger", UI.E.no)]];

function register(bot) {
  // tombol teks tambahan (semua pengguna)
  bot.callbackQuery(/^bl:c:(\w+)$/, async (ctx) => {
    const x = conf().custom[ctx.match[1]];
    if (!x) return ctx.answerCallbackQuery({ text: "Tombol ini sudah tidak tersedia." });
    const body = String(x.value || "");
    if (Array.from(body).length <= 190 && !body.includes("\n")) return ctx.answerCallbackQuery({ text: body, show_alert: true });
    await ctx.answerCallbackQuery().catch(() => {});
    const chat = ctx.callbackQuery.message ? ctx.callbackQuery.message.chat.id : ctx.from.id;
    return UI.sendCard(chat, UI.card({ title: x.text, icon: "info", sub: esc(body).replace(/\n/g, "<br>") }), (fancy) => [[btn(fancy, "Kembali", "home:p:0", "plain", UI.E.wave)]]);
  });

  bot.callbackQuery(/^bl:(\w+)(?::(\w+))?(?::(\w+))?$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.answerCallbackQuery({ text: "Khusus owner.", show_alert: true });
    const [, a, x, y] = ctx.match;
    const m = ctx.callbackQuery.message;
    const ref = m ? { chat_id: m.chat.id, message_id: m.message_id } : null;
    const chat = m ? m.chat.id : ctx.from.id;
    const uid = String(ctx.from.id);
    const show = (card, kb) => (ref ? UI.editCard(ref, card, kb) : UI.sendCard(chat, card, kb));
    const say = (t) => ctx.answerCallbackQuery({ text: t, show_alert: false }).catch(() => {});
    const exists = (id) => !!where(layoutRows(), id) || conf().hidden.includes(id);

    if (a === "m") { await say(); state.delete(uid); return show(editorCard("", ctx.from), editorKb(ctx.from)); }
    if (a === "x") { await say("Dibatalkan"); state.delete(uid); return UI.sendCard(chat, editorCard("Dibatalkan.", ctx.from), editorKb(ctx.from)); }
    if (a === "s") { await say(); if (!exists(x)) return show(editorCard("Tombol tidak ditemukan.", ctx.from), editorKb(ctx.from)); return show(itemCard(x, ctx.from), itemKb(x)); }
    if (a === "o" && OPS[x]) {
      const err = withRows((rows) => OPS[x](rows, y));
      if (err) return ctx.answerCallbackQuery({ text: err, show_alert: true });
      await say("Posisi diubah ✅");
      return show(itemCard(y, ctx.from, `Posisi diubah.<br>${layoutRows().map((r, i) => `${i + 1}. ${r.map((id) => `[${esc(cut(labelOf(id, HOME.defs(ctx.from), conf()), 20))}]`).join(" ")}`).join("<br>")}`), itemKb(y));
    }
    if (a === "r") {
      await say();
      state.set(uid, { act: "rename", id: x });
      return UI.sendCard(chat, UI.card({ title: "Ganti Nama Tombol", icon: "tag", rows: [["tag", "Sekarang", `<b>${esc(labelOf(x, HOME.defs(ctx.from), conf()))}</b>`]], note: "Kirim nama baru (maks 40 huruf, boleh pakai emoji). Kirim <code>-</code> untuk kembali ke nama asli." }), cancelKb);
    }
    if (a === "w") {
      await say();
      const t = labelOf(x, HOME.defs(ctx.from), conf());
      const h = require("./btncolor").addSeen(t);
      return show(UI.card({ title: "Warna Tombol", icon: "star", rows: [["tag", "Tombol", `<b>${esc(t)}</b>`]], note: "Pilih warna. (Bila nama tombol diganti lagi, atur warnanya lagi.)" }), (fancy) => [
        pair(btn(fancy, "Hijau", `bcl:c:${h}:success`, "success"), btn(fancy, "Merah", `bcl:c:${h}:danger`, "danger")),
        pair(btn(fancy, "Biru", `bcl:c:${h}:primary`, "primary"), btn(fancy, "Abu-abu", `bcl:c:${h}:plain`, "plain")),
        [btn(fancy, "Warna Asli", `bcl:c:${h}:none`, "plain")],
        [btn(fancy, "‹ Kembali", `bl:s:${x}`, "plain", UI.E.wave)],
      ]);
    }
    if (a === "h") {
      const c = conf();
      if (c.custom[x]) { delete c.custom[x]; delete c.labels[x]; if (c.rows) c.rows = c.rows.map((r) => r.filter((id) => id !== x)); saveConf(c); await say("Tombol dihapus"); return show(editorCard("Tombol tambahan dihapus.", ctx.from), editorKb(ctx.from)); }
      if (!c.hidden.includes(x)) c.hidden.push(x);
      saveConf(c);
      await say("Tombol disembunyikan");
      return show(editorCard(`Tombol disembunyikan. Munculkan lagi lewat <b>Tersembunyi</b>.`, ctx.from), editorKb(ctx.from));
    }
    if (a === "H") {
      await say();
      const c = conf();
      const defs = HOME.defs(ctx.from);
      if (!c.hidden.length) return show(editorCard("Tidak ada tombol yang disembunyikan.", ctx.from), editorKb(ctx.from));
      return show(UI.card({ title: "Tombol Tersembunyi", icon: "no", rows: c.hidden.map((id) => ["no", esc(labelOf(id, defs, c)), "tersembunyi"]), note: "Tekan tombol untuk memunculkannya lagi (ditaruh di baris paling bawah)." }), (fancy) => [
        ...c.hidden.map((id) => [btn(fancy, `↩ ${cut(labelOf(id, defs, c), 30)}`, `bl:u:${id}`, "success")]),
        [btn(fancy, "‹ Kembali", "bl:m", "plain", UI.E.wave)],
      ]);
    }
    if (a === "u") {
      const c = conf();
      c.hidden = c.hidden.filter((id) => id !== x);
      if (c.rows) c.rows = [...c.rows.map((r) => r.filter((id) => id !== x)).filter((r) => r.length), [x]];
      saveConf(c);
      await say("Tombol dimunculkan ✅");
      return show(editorCard("Tombol dimunculkan lagi di baris paling bawah.", ctx.from), editorKb(ctx.from));
    }
    if (a === "a") {
      await say();
      if (Object.keys(conf().custom).length >= MAX_CUSTOM) return ctx.answerCallbackQuery({ text: `Maksimal ${MAX_CUSTOM} tombol tambahan.`, show_alert: true });
      state.set(uid, { act: "add", step: "label", d: {} });
      return UI.sendCard(chat, UI.card({ title: "Tambah Tombol (1/3)", icon: "rocket", rows: [["info", "Langkah", "Kirim <b>nama tombol</b> (maks 40 huruf), contoh <code>Grup Diskusi</code>"]] }), cancelKb);
    }
    if (a === "k") {
      const st = state.get(uid);
      if (!st || st.act !== "add" || st.step !== "kind") return say("Sudah tidak berlaku");
      await say();
      st.d.kind = x === "url" ? "url" : "text"; st.step = "value";
      return UI.sendCard(chat, UI.card({ title: "Tambah Tombol (3/3)", icon: "rocket", rows: [["info", "Langkah", st.d.kind === "url" ? "Kirim <b>link</b> tujuan, contoh <code>https://t.me/namachannel</code>" : "Kirim <b>teks</b> yang tampil ketika tombol ditekan (boleh beberapa baris)"]] }), cancelKb);
    }
    if (a === "v") {
      await say();
      const cc = conf().custom[x];
      if (!cc) return show(editorCard("Tombol tidak ditemukan.", ctx.from), editorKb(ctx.from));
      state.set(uid, { act: "value", id: x });
      return UI.sendCard(chat, UI.card({ title: "Ubah Isi Tombol", icon: "gear", rows: [["tag", "Sekarang", esc(cut(cc.value, 300))]], note: cc.kind === "url" ? "Kirim link baru." : "Kirim teks baru." }), cancelKb);
    }
    if (a === "z") { await say(); return show(UI.card({ title: "Reset Tata Letak?", icon: "fire", rows: [["info", "Efek", "Susunan, nama, tombol tersembunyi, dan tombol tambahan dashboard kembali ke bawaan."]] }), (fancy) => [pair(btn(fancy, "Ya, Reset", "bl:Z", "danger"), btn(fancy, "Batal", "bl:m", "primary"))]); }
    if (a === "Z") { saveConf({}); await say("Direset"); return show(editorCard("Tata letak dashboard kembali ke bawaan.", ctx.from), editorKb(ctx.from)); }
    if (a === "g") { await say(); return show(rulesCard(), rulesKb); }
    if (a === "gn") {
      await say();
      state.set(uid, { act: "rule", step: "old", d: {} });
      return UI.sendCard(chat, UI.card({ title: "Aturan Tombol (1/2)", icon: "tag", rows: [["info", "Langkah", "Kirim <b>teks tombol asli</b> persis seperti tampil di bot, contoh <code>Isi Saldo</code>"]] }), cancelKb);
    }
    if (a === "gd") {
      const r = rules();
      const k = [...Object.keys(r.rename), ...r.hide].find((t) => hash(t) === x);
      if (k) { delete r.rename[k]; r.hide = r.hide.filter((t) => t !== k); saveRules(r); }
      await say(k ? "Aturan dihapus" : "Tidak ditemukan");
      return show(rulesCard(k ? `Aturan untuk <b>${esc(k)}</b> dihapus.` : ""), rulesKb);
    }
    return say();
  });

  bot.on("message", async (ctx, next) => {
    const st = ctx.from && state.get(String(ctx.from.id));
    if (!st || !ctx.chat || ctx.chat.type !== "private" || !isOwner(ctx.from.id)) return next();
    const text = typeof ctx.message.text === "string" ? ctx.message.text.trim() : "";
    const uid = String(ctx.from.id);
    if (text.startsWith("/")) { state.delete(uid); return next(); }
    if (/^batal$/i.test(text)) { state.delete(uid); return UI.sendCard(ctx.chat.id, editorCard("Dibatalkan.", ctx.from), editorKb(ctx.from)); }
    const bad = (why) => UI.sendCard(ctx.chat.id, UI.card({ title: "Tidak Valid", icon: "no", rows: [["no", "Sebab", why]] }), cancelKb);
    const label = cut(text.replace(/\s+/g, " "), 40);
    if (st.act === "rename") {
      if (!label) return bad("Kirim teks nama tombol");
      const c = conf();
      if (label === "-") delete c.labels[st.id];
      else if (c.custom[st.id]) c.custom[st.id].text = label;
      else c.labels[st.id] = label;
      saveConf(c);
      state.delete(uid);
      return UI.sendCard(ctx.chat.id, itemCard(st.id, ctx.from, "Nama tombol diubah. Kirim /start untuk melihat hasilnya."), itemKb(st.id));
    }
    if (st.act === "value") {
      const c = conf();
      const cc = c.custom[st.id];
      if (!cc) { state.delete(uid); return next(); }
      if (cc.kind === "url" && !/^(https?:\/\/|tg:\/\/)\S+$/i.test(text)) return bad("Link harus diawali <code>https://</code> atau <code>tg://</code>");
      if (!text) return bad("Kirim isinya");
      cc.value = text.slice(0, 2000);
      saveConf(c);
      state.delete(uid);
      return UI.sendCard(ctx.chat.id, itemCard(st.id, ctx.from, "Isi tombol diubah."), itemKb(st.id));
    }
    if (st.act === "add") {
      if (st.step === "label") {
        if (!label) return bad("Kirim nama tombol");
        st.d.text = label; st.step = "kind";
        return UI.sendCard(ctx.chat.id, UI.card({ title: "Tambah Tombol (2/3)", icon: "rocket", rows: [["tag", "Nama", `<b>${esc(label)}</b>`]], note: "Pilih jenis tombol." }), (fancy) => [pair(btn(fancy, "Link (URL)", "bl:k:url", "success"), btn(fancy, "Teks Info", "bl:k:text", "primary")), ...cancelKb(fancy)]);
      }
      if (st.step === "kind") return;
      if (st.step === "value") {
        if (st.d.kind === "url" && !/^(https?:\/\/|tg:\/\/)\S+$/i.test(text)) return bad("Link harus diawali <code>https://</code> atau <code>tg://</code>");
        if (!text) return bad("Kirim isinya");
        const c = conf();
        c.seq = (c.seq || 0) + 1;
        const id = `c${c.seq}`;
        c.custom[id] = { text: st.d.text, kind: st.d.kind, value: text.slice(0, 2000), style: "primary" };
        c.rows = [...layoutRows(c).filter((r) => !r.includes(id)), [id]];
        saveConf(c);
        state.delete(uid);
        return UI.sendCard(ctx.chat.id, itemCard(id, ctx.from, "Tombol ditambahkan di baris paling bawah. Pindahkan posisinya dengan tombol Naik / Gabung."), itemKb(id));
      }
    }
    if (st.act === "rule") {
      if (!label) return bad("Kirim teks tombol");
      if (st.step === "old") {
        st.d.old = norm(label); st.step = "new";
        return UI.sendCard(ctx.chat.id, UI.card({ title: "Aturan Tombol (2/2)", icon: "tag", rows: [["tag", "Tombol", `<b>${esc(label)}</b>`]], note: "Kirim <b>nama baru</b>. Ketik <code>hapus</code> untuk menyembunyikan tombol ini di semua menu." }), cancelKb);
      }
      const r = rules();
      delete r.rename[st.d.old];
      r.hide = r.hide.filter((t) => t !== st.d.old);
      if (/^hapus$/i.test(label)) r.hide.push(st.d.old);
      else r.rename[st.d.old] = label;
      saveRules(r);
      state.delete(uid);
      return UI.sendCard(ctx.chat.id, rulesCard("Aturan disimpan dan langsung berlaku."), rulesKb);
    }
    return next();
  });
}

module.exports = { register, setHome, render, apply, layoutRows, editorCard, editorKb };

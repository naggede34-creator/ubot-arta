// ===== KELOLA SALDO PENGGUNA (owner) =====
// PANEL OWNER > Kelola Saldo (atau Kelola Noktel > Kelola Saldo Pengguna):
//   Tambah Saldo · Kurangi / Hapus Saldo · Cek Saldo · Top Saldo
// Perintah:
//   /addsaldo ID JUMLAH       tambah saldo           (contoh /addsaldo 123456789 20000)
//   /delsaldo ID JUMLAH       kurangi saldo          (/delsaldo 123456789 5000)
//   /delsaldo ID all          hapus semua saldo (jadi 0)
//   /ceksaldo ID              lihat saldo pengguna
//   /saldo                    (pengguna) lihat saldo sendiri
// ID boleh diganti dengan membalas / mem-forward pesan orangnya. Saldo = saldo yang dipakai membeli noktel (sama dengan /addsaldonk).
// Pengguna mendapat pemberitahuan setiap saldonya diubah owner; channel notifikasi ikut dikabari.
const access = require("./access");
const db = require("./db");
const UI = require("./botui");
const { esc, btn, pair } = require("./core");

const NK = () => require("./noktel");
const rp = (n) => "Rp" + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const isOwner = (id) => access.isOwner(id);
const state = new Map(); // ownerId -> { act: "add" | "del" | "cek" }

const nameOf = (uid) => { const r = db.getUser(uid) || {}; return r.name ? `${esc(r.name)}${r.username ? " (@" + esc(r.username) + ")" : ""}` : r.username ? "@" + esc(r.username) : "-"; };

function menuCard(note) {
  const all = Object.entries(NK().allBalances()).filter(([, v]) => Number(v) > 0);
  const total = all.reduce((n, [, v]) => n + Number(v), 0);
  return UI.card({
    title: "Kelola Saldo Pengguna", icon: "chart",
    rows: [["chart", "Total saldo pengguna", `<b>${rp(total)}</b>`], ["user", "Pengguna bersaldo", `<b>${all.length}</b>`]],
    checks: [[true, "Tambah / kurangi / hapus saldo pengguna mana saja"], [true, "Pengguna mendapat pemberitahuan otomatis"]],
    note: note || "Cepat: <code>/addsaldo ID 20000</code> · <code>/delsaldo ID 5000</code> · <code>/delsaldo ID all</code> · <code>/ceksaldo ID</code>",
  });
}
const menuKb = (fancy) => [
  pair(btn(fancy, "Tambah Saldo", "sal:add", "success", UI.E.rocket), btn(fancy, "Kurangi Saldo", "sal:del", "danger", UI.E.no)),
  pair(btn(fancy, "Cek Saldo", "sal:cek", "primary", UI.E.chart), btn(fancy, "Top Saldo", "sal:top", "primary", UI.E.crown)),
  [btn(fancy, "Kembali ke Panel Owner", "own", "plain", UI.E.wave)],
];
const cancelKb = (fancy) => [[btn(fancy, "Batal", "sal:x", "danger", UI.E.no)]];

// -> { ok, before, after, delta } ; amount "all" untuk hapus semua
function change(uid, amount, mode, by) {
  const before = NK().bal(uid);
  let after;
  if (mode === "add") after = NK().addBal(uid, amount);
  else {
    const take = amount === "all" ? before : Math.min(before, amount);
    after = NK().setBal(uid, before - take);
  }
  const delta = after - before;
  if (delta !== 0) {
    UI.sendCard(uid, UI.card({
      title: delta > 0 ? "Saldo Anda Bertambah" : "Saldo Anda Dikurangi", icon: delta > 0 ? "ok" : "info",
      rows: [["chart", delta > 0 ? "Ditambah" : "Dikurangi", `<b>${rp(Math.abs(delta))}</b>`], ["bolt", "Saldo sekarang", `<b>${rp(after)}</b>`]],
      note: delta > 0 ? "Saldo bisa dipakai untuk membeli noktel." : "Saldo Anda diubah oleh owner. Hubungi owner bila ada pertanyaan.",
    }), (fancy) => [[btn(fancy, "Beli Noktel", "nk:h", "success", UI.E.gem)]]).catch(() => {});
    try { const r = db.getUser(uid) || {}; require("./notify").fire("saldo", { id: uid, name: r.name, username: r.username }, [["Perubahan", `<b>${delta > 0 ? "+" : "−"}${rp(Math.abs(delta))}</b>`], ["Saldo sebelum", rp(before)], ["Saldo sekarang", `<b>${rp(after)}</b>`], ["Oleh owner", `<code>${esc(by)}</code>`]]); } catch (_) {}
  }
  return { before, after, delta };
}
const resultCard = (uid, r) => UI.card({
  title: r.delta > 0 ? "Saldo Ditambah" : r.delta < 0 ? "Saldo Dikurangi" : "Saldo Tidak Berubah", icon: r.delta ? "ok" : "info",
  rows: [["user", "Pengguna", `${nameOf(uid)} · <code>${esc(uid)}</code>`], ["tag", "Sebelum", rp(r.before)], ["chart", "Perubahan", `<b>${r.delta >= 0 ? "+" : "−"}${rp(Math.abs(r.delta))}</b>`], ["bolt", "Sekarang", `<b>${rp(r.after)}</b>`]],
});
const cekCard = (uid) => UI.card({ title: "Saldo Pengguna", icon: "chart", rows: [["user", "Pengguna", `${nameOf(uid)} · <code>${esc(uid)}</code>`], ["bolt", "Saldo", `<b>${rp(NK().bal(uid))}</b>`]] });

// ID dari balasan / forward / teks pertama ; sisanya = jumlah
function parseArgs(msg, text) {
  const r = msg.reply_to_message;
  let id = null;
  if (r && r.from && !r.from.is_bot) id = String(r.from.id);
  const fo = msg.forward_origin && msg.forward_origin.sender_user;
  if (!id && fo) id = String(fo.id);
  const parts = String(text || "").replace(/^\/\w+(@\w+)?\s*/, "").trim().split(/\s+/).filter(Boolean);
  if (!id && parts.length && /^\d{5,15}$/.test(parts[0])) id = parts.shift();
  const raw = parts.join(" ");
  const amount = /^(all|semua|habis)$/i.test(raw) ? "all" : Math.round(require("./money").parseMoney(raw));
  return { id, amount: amount === "all" || amount > 0 ? amount : null };
}

function register(bot) {
  bot.callbackQuery(/^sal:(\w+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.answerCallbackQuery({ text: "Khusus owner.", show_alert: true });
    await ctx.answerCallbackQuery().catch(() => {});
    const a = ctx.match[1];
    const chat = ctx.callbackQuery.message ? ctx.callbackQuery.message.chat.id : ctx.from.id;
    if (a === "m") return UI.sendCard(chat, menuCard(), menuKb);
    if (a === "x") { state.delete(String(ctx.from.id)); return UI.sendCard(chat, menuCard("Dibatalkan."), menuKb); }
    if (a === "top") {
      const top = Object.entries(NK().allBalances()).filter(([, v]) => Number(v) > 0).sort((p, q) => q[1] - p[1]).slice(0, 15);
      return UI.sendCard(chat, UI.card({ title: "Top Saldo Pengguna", icon: "crown", headers: ["Pengguna", "Saldo"], rows: top.length ? top.map(([id, v]) => ["user", `${nameOf(id)} · <code>${esc(id)}</code>`, `<b>${rp(v)}</b>`]) : [["info", "Saldo", "Belum ada pengguna bersaldo"]] }), menuKb);
    }
    if (["add", "del", "cek"].includes(a)) {
      state.set(String(ctx.from.id), { act: a });
      const how = a === "cek" ? "Kirim <b>ID pengguna</b> (atau forward pesannya)." : `Kirim <b>ID JUMLAH</b>, contoh <code>123456789 20000</code>${a === "del" ? " atau <code>123456789 all</code> untuk menghapus semua saldo" : ""}.`;
      return UI.sendCard(chat, UI.card({ title: a === "add" ? "Tambah Saldo" : a === "del" ? "Kurangi / Hapus Saldo" : "Cek Saldo", icon: "chart", rows: [["info", "Cara", how]], note: "Bisa juga forward pesan orangnya lalu ketik jumlahnya. Ketik <code>batal</code> untuk membatalkan." }), cancelKb);
    }
  });

  bot.on("message", async (ctx, next) => {
    const st = ctx.from && state.get(String(ctx.from.id));
    if (!st || !ctx.chat || ctx.chat.type !== "private" || !isOwner(ctx.from.id)) return next();
    const text = String(ctx.message.text || ctx.message.caption || "");
    if (text.startsWith("/")) { state.delete(String(ctx.from.id)); return next(); }
    if (/^batal$/i.test(text.trim())) { state.delete(String(ctx.from.id)); return UI.sendCard(ctx.chat.id, menuCard("Dibatalkan."), menuKb); }
    const fwd = ctx.message.forward_origin && ctx.message.forward_origin.sender_user;
    if (fwd && st.act !== "cek" && !st.pendingId) { st.pendingId = String(fwd.id); return UI.sendCard(ctx.chat.id, UI.card({ title: "Jumlah?", icon: "chart", rows: [["user", "Pengguna", `<code>${esc(st.pendingId)}</code>`]], note: `Sekarang kirim jumlahnya${st.act === "del" ? " (atau <code>all</code>)" : ""}.` }), cancelKb); }
    const p = parseArgs(ctx.message, st.pendingId ? `${st.pendingId} ${text}` : text);
    if (st.act === "cek") {
      if (!p.id) return UI.sendCard(ctx.chat.id, UI.card({ title: "ID Tidak Valid", icon: "no", rows: [["info", "Contoh", "<code>123456789</code>"]] }), cancelKb);
      state.delete(String(ctx.from.id));
      return UI.sendCard(ctx.chat.id, cekCard(p.id), menuKb);
    }
    if (!p.id || !p.amount || (st.act === "add" && p.amount === "all")) return UI.sendCard(ctx.chat.id, UI.card({ title: "Format Salah", icon: "no", rows: [["info", "Contoh", `<code>123456789 20000</code>${st.act === "del" ? " atau <code>123456789 all</code>" : ""}`]] }), cancelKb);
    state.delete(String(ctx.from.id));
    return UI.sendCard(ctx.chat.id, resultCard(p.id, change(p.id, p.amount, st.act, ctx.from.id)), menuKb);
  });

  const guard = (fn) => async (ctx) => { if (ctx.chat && ctx.chat.type === "private" && isOwner(ctx.from.id)) return fn(ctx); };
  const usage = (cmd, extra) => UI.card({ title: "Cara Pakai", icon: "gear", rows: [["tag", "Pakai", `<code>/${cmd} ID JUMLAH</code>`], ["star", "Contoh", `<code>/${cmd} 123456789 20000</code>`], ...(extra ? [["info", "Hapus semua", extra]] : [])], note: "Bisa juga membalas pesan orangnya: <code>/" + cmd + " 20000</code>" });
  bot.command("addsaldo", guard((ctx) => {
    const p = parseArgs(ctx.message, ctx.message.text);
    if (!p.id || !p.amount || p.amount === "all") return UI.sendCard(ctx.chat.id, usage("addsaldo"));
    return UI.sendCard(ctx.chat.id, resultCard(p.id, change(p.id, p.amount, "add", ctx.from.id)));
  }));
  bot.command("delsaldo", guard((ctx) => {
    const p = parseArgs(ctx.message, ctx.message.text);
    if (!p.id || !p.amount) return UI.sendCard(ctx.chat.id, usage("delsaldo", "<code>/delsaldo 123456789 all</code>"));
    return UI.sendCard(ctx.chat.id, resultCard(p.id, change(p.id, p.amount, "del", ctx.from.id)));
  }));
  bot.command("ceksaldo", guard((ctx) => {
    const p = parseArgs(ctx.message, ctx.message.text);
    if (!p.id) return UI.sendCard(ctx.chat.id, UI.card({ title: "Cara Pakai", icon: "gear", rows: [["tag", "Pakai", "<code>/ceksaldo ID</code>"]] }));
    return UI.sendCard(ctx.chat.id, cekCard(p.id));
  }));
  bot.command("saldo", async (ctx) => {
    if (!ctx.chat || ctx.chat.type !== "private") return;
    return UI.sendCard(ctx.chat.id, UI.card({ title: "Saldo Anda", icon: "chart", rows: [["bolt", "Saldo", `<b>${rp(NK().bal(ctx.from.id))}</b>`]], note: "Isi saldo lewat menu Beli Noktel, atau klaim kode hadiah dengan tombol Redeem Kode." }), (fancy) => [pair(btn(fancy, "Isi Saldo", "nk:d", "success", UI.E.bolt), btn(fancy, "Redeem Kode", "vc:r", "primary", UI.E.tag))]);
  });
}

module.exports = { register, change, menuCard, menuKb };

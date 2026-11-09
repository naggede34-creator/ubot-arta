// Catatan (.setnote .note .notes .delnote) dan senarai tugas berkotak semak (.todo)
const db = require("../db");
const { card, show, edit, esc, footerOf, clip, nl2br, ico } = require("../ui");

const MAX_NOTES = 50;
const MAX_TODOS = 30;
const rec = (account) => db.getUser(account.userId) || {};

// ---------- Catatan ----------
const normName = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9_\-]/g, "").slice(0, 24);

async function setNote(ctx) {
  const { msg, args, account } = ctx;
  const name = normName(args[0]);
  let text = args.slice(1).join(" ");
  if (!text) {
    const rm = await msg.getReplyMessage().catch(() => null);
    text = rm && rm.message ? rm.message : "";
  }
  if (!name || !text) return edit(ctx, "Guna: .setnote <nama> <teks>  (atau balas mesej dengan .setnote <nama>)");
  const notes = { ...(rec(account).notes || {}) };
  if (!notes[name] && Object.keys(notes).length >= MAX_NOTES) return edit(ctx, `\u26A0\uFE0F Had ${MAX_NOTES} catatan dicapai. Padam dahulu dengan .delnote.`);
  notes[name] = { text: text.slice(0, 1500), at: Date.now() };
  db.upsertUser(account.userId, { notes });
  await show(ctx, card({
    title: "Catatan Disimpan", icon: "ok",
    rows: [["tag", "Nama", `<code>${esc(name)}</code>`], ["gear", "Panjang", `${notes[name].text.length} aksara`], ["chart", "Jumlah catatan", String(Object.keys(notes).length)]],
    footer: footerOf(account),
  }));
}

async function getNote(ctx) {
  const { args, account } = ctx;
  const name = normName(args[0]);
  const n = (rec(account).notes || {})[name];
  if (!name) return edit(ctx, "Guna: .note <nama>  |  senarai: .notes");
  if (!n) return edit(ctx, `\u26A0\uFE0F Catatan "${name}" tiada. Lihat .notes`);
  await show(ctx, card({
    title: `Catatan: ${name}`, icon: "tag",
    extra: `<blockquote>${nl2br(n.text)}</blockquote>`,
    extraText: esc(n.text),
    footer: footerOf(account),
  }));
}

async function listNotes(ctx) {
  const { account } = ctx;
  const notes = rec(account).notes || {};
  const keys = Object.keys(notes).sort();
  if (!keys.length) return edit(ctx, "Belum ada catatan. Guna .setnote <nama> <teks>");
  await show(ctx, card({
    title: "Senarai Catatan", icon: "tag", headers: ["Nama", "Pratonton"],
    sub: `Jumlah: <b>${keys.length}</b> / ${MAX_NOTES}`,
    rows: keys.slice(0, 25).map((k) => ["tag", `<code>${esc(k)}</code>`, esc(clip(notes[k].text.replace(/\s+/g, " "), 40))]),
    footer: footerOf(account),
  }));
}

async function delNote(ctx) {
  const { args, account } = ctx;
  const name = normName(args[0]);
  const notes = { ...(rec(account).notes || {}) };
  if (!name) return edit(ctx, "Guna: .delnote <nama>");
  if (!notes[name]) return edit(ctx, `\u26A0\uFE0F Catatan "${name}" tiada.`);
  delete notes[name];
  db.upsertUser(account.userId, { notes });
  await show(ctx, card({
    title: "Catatan Dipadam", icon: "ok",
    rows: [["tag", "Nama", `<code>${esc(name)}</code>`], ["chart", "Baki catatan", String(Object.keys(notes).length)]],
    footer: footerOf(account),
  }));
}

// ---------- Todo ----------
const todos = (account) => (rec(account).todos || []).slice();
const saveTodos = (account, list) => db.upsertUser(account.userId, { todos: list });

function todoCard(account, title = "Senarai Tugas", icon = "check") {
  const list = todos(account);
  const done = list.filter((t) => t.d).length;
  return card({
    title, icon,
    sub: list.length ? `Siap <b>${done}</b> / ${list.length}` : "Belum ada tugas. Tambah: <code>.todo add teks</code>",
    checks: list.map((t, i) => [!!t.d, `<b>${i + 1}.</b> ${esc(clip(t.t, 80))}`]),
    rows: list.length ? [["chart", "Selesai", `${Math.round((done / list.length) * 100)}%`], ["time", "Baki", String(list.length - done)]] : [],
    footer: footerOf(account),
  });
}

async function todoCmd(ctx) {
  const { args, account } = ctx;
  const sub = String(args[0] || "").toLowerCase();
  const list = todos(account);
  const idx = parseInt(args[1], 10) - 1;

  if (!sub || sub === "list") return show(ctx, todoCard(account));

  if (sub === "add") {
    const t = args.slice(1).join(" ").trim();
    if (!t) return edit(ctx, "Guna: .todo add <teks>");
    if (list.length >= MAX_TODOS) return edit(ctx, `\u26A0\uFE0F Had ${MAX_TODOS} tugas. Padam yang siap dengan .todo clear`);
    list.push({ t: t.slice(0, 200), d: false });
    saveTodos(account, list);
    return show(ctx, todoCard(account, "Tugas Ditambah", "plus"));
  }
  if (["done", "undo", "del"].includes(sub)) {
    if (!(idx >= 0 && idx < list.length)) return edit(ctx, `Guna: .todo ${sub} <nombor>  (lihat .todo)`);
    if (sub === "del") list.splice(idx, 1);
    else list[idx].d = sub === "done";
    saveTodos(account, list);
    return show(ctx, todoCard(account, sub === "del" ? "Tugas Dibuang" : sub === "done" ? "Tugas Siap" : "Tugas Dibuka Semula", "ok"));
  }
  if (sub === "clear") {
    saveTodos(account, list.filter((t) => !t.d));
    return show(ctx, todoCard(account, "Tugas Siap Dibersihkan", "ok"));
  }
  return edit(ctx, "Guna: .todo | .todo add <teks> | .todo done <no> | .todo undo <no> | .todo del <no> | .todo clear");
}

module.exports = {
  name: "notes",
  category: "Catatan & Tugas",
  help: [
    { cmd: "setnote", alias: [], desc: "simpan catatan: .setnote <nama> <teks> (atau balas mesej)" },
    { cmd: "note", alias: [], desc: "buka catatan: .note <nama>" },
    { cmd: "notes", alias: [], desc: "senarai semua catatan" },
    { cmd: "delnote", alias: [], desc: "padam catatan: .delnote <nama>" },
    { cmd: "todo", alias: [], desc: "senarai tugas berkotak semak: .todo add|done|undo|del|clear" },
  ],
  commands: { setnote: setNote, note: getNote, notes: listNotes, delnote: delNote, todo: todoCmd },
};

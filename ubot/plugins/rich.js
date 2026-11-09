// Alat Rich (6 arahan): bina jadual / senarai semak / kad / bar kemajuan terus dalam chat
const K = require("../kit");
const { R, H, need, out, UserErr } = K;
const { esc, clip } = K;
const ui = require("../ui");

const defs = [
  {
    cmd: "table", alias: ["jadual"], desc: "bina jadual Rich: .table Nama,Umur;Ali,20;Siti,21",
    async run(ctx) {
      const raw = await K.text(ctx);
      need(raw, ".table Nama,Umur;Ali,20;Siti,21   (baris dipisah ; atau baris baru, lajur dipisah koma atau |)");
      const rows = raw.split(/;|\r?\n/).map((r) => r.split(/\s*[,|]\s*/).map((c) => c.trim())).filter((r) => r.some(Boolean)).slice(0, 25);
      if (rows.length < 2) throw new UserErr("Perlu sekurang-kurangnya baris tajuk + 1 baris data.");
      const cols = Math.min(6, Math.max(...rows.map((r) => r.length)));
      const row = (r, tag) => `<tr>${Array.from({ length: cols }, (_, i) => `<${tag}>${esc(clip(r[i] || "", 40))}</${tag}>`).join("")}</tr>`;
      const text = rows.map((r) => r.join(" | ")).join("\n");
      await K.show(ctx, { html: `<h3>${ui.ico("chart")} Jadual</h3><table bordered>${row(rows[0], "th")}${rows.slice(1).map((r) => row(r, "td")).join("")}</table><footer>${ui.footerOf(ctx.account)}</footer>`, text: `${ui.ico("chart")} <b>Jadual</b>\n\n${esc(text)}` });
    },
  },
  {
    cmd: "checklist", alias: ["semak"], desc: "senarai semak: .checklist beli susu | +siap | hantar surat  (awalan + = siap)",
    async run(ctx) {
      const raw = await K.text(ctx);
      need(raw, ".checklist beli susu | +sudah siap | hantar surat");
      const items = raw.split(/\s*[|;]\s*|\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 25).map((s) => (s.startsWith("+") ? [true, s.slice(1).trim()] : [false, s]));
      await out(ctx, "Senarai Semak", "check", [R("chart", "Siap", `${items.filter((i) => i[0]).length} / ${items.length}`)], { checks: items.map(([ok, t]) => [ok, esc(t)]) });
    },
  },
  {
    cmd: "bullets", alias: ["list"], desc: "senarai berpoin: .bullets a | b | c",
    async run(ctx) {
      const raw = await K.text(ctx);
      need(raw, ".bullets epal | oren | pisang");
      const items = raw.split(/\s*[|;]\s*|\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 30);
      const html = `<h3>${ui.ico("tag")} Senarai</h3><ul>${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul><footer>${ui.footerOf(ctx.account)}</footer>`;
      await K.show(ctx, { html, text: `${ui.ico("tag")} <b>Senarai</b>\n` + items.map((t) => "\u2022 " + esc(t)).join("\n") });
    },
  },
  {
    cmd: "card", alias: ["kad"], desc: "kad pengumuman: .card Tajuk | Isi teks | pengaki",
    async run(ctx) {
      const raw = await K.text(ctx);
      need(raw, ".card Tajuk | Isi teks");
      const [title, body, foot] = raw.split(/\s*\|\s*/);
      await K.show(ctx, K.card({ title: clip(title, 60), icon: "crown", extra: body ? K.bq(body) : "", extraText: esc(body || ""), footer: foot ? esc(foot) : ui.footerOf(ctx.account) }));
    },
  },
  {
    cmd: "progress", alias: ["bar"], desc: "bar kemajuan: .progress 7 10 Projek siap",
    async run(ctx) {
      const [a, b] = [K.num(ctx.args[0]), K.num(ctx.args[1])];
      const label = ctx.args.slice(2).join(" ") || "Kemajuan";
      need(Number.isFinite(a) && b > 0, ".progress 7 10 Projek siap");
      const pct = Math.max(0, Math.min(100, (a / b) * 100));
      const n = Math.round(pct / 5);
      await out(ctx, label, "chart", [R("ok", "Capaian", `${K.fmt(a)} / ${K.fmt(b)}`), H("ok", "Peratus", `<b>${K.fmt(pct, 1)}%</b>`), H("gear", "Bar", `<code>${"\u2588".repeat(n)}${"\u2591".repeat(20 - n)}</code>`)]);
    },
  },
  {
    cmd: "code", desc: "hantar teks sebagai kod: .code <teks> atau balas mesej",
    async run(ctx) {
      const t = await K.text(ctx);
      need(t, ".code <teks>");
      await ctx.client.editMessage(ctx.msg.peerId, { message: ctx.msg.id, text: `<pre>${esc(t.slice(0, 3800))}</pre>`, parseMode: "html" });
    },
  },
];

module.exports = K.plugin("rich", "Rich & Format", defs);

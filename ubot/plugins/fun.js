// Hiburan: .pick .dice .coin .8ball .rate
const crypto = require("crypto");
const { card, show, edit, esc, footerOf, clip } = require("../ui");

const rnd = (n) => crypto.randomInt(n);
const BALL = [
  ["Ya, pasti.", true], ["Memang begitu.", true], ["Tanpa keraguan.", true], ["Nampak baik.", true],
  ["Mungkin.", null], ["Tanya semula nanti.", null], ["Sukar diramal sekarang.", null],
  ["Jangan berharap.", false], ["Jawapan saya: tidak.", false], ["Sangat meragukan.", false],
];

async function pick(ctx) {
  const opts = ctx.args.join(" ").split(/\s*[|,]\s*/).map((s) => s.trim()).filter(Boolean);
  if (opts.length < 2) return edit(ctx, "Guna: .pick makan | tidur | main  (asingkan dengan | atau koma)");
  const win = opts[rnd(opts.length)];
  await show(ctx, card({
    title: "Pilihan Rawak", icon: "star",
    rows: [["tag", "Pilihan", esc(clip(opts.join(" / "), 80))], ["ok", "Terpilih", `<b>${esc(clip(win, 60))}</b>`]],
    footer: footerOf(ctx.account),
  }));
}

async function dice(ctx) {
  const sides = Math.min(1000, Math.max(2, parseInt(ctx.args[0], 10) || 6));
  const r = rnd(sides) + 1;
  await show(ctx, card({
    title: "Dadu", icon: "fire",
    rows: [["gear", "Sisi", String(sides)], ["ok", "Keputusan", `<b>${r}</b>`]],
    footer: footerOf(ctx.account),
  }));
}

async function coin(ctx) {
  const h = rnd(2) === 0;
  await show(ctx, card({
    title: "Lambung Syiling", icon: "gem",
    rows: [["ok", "Keputusan", `<b>${h ? "KEPALA" : "EKOR"}</b>`]],
    footer: footerOf(ctx.account),
  }));
}

async function ball(ctx) {
  const q = ctx.args.join(" ").trim();
  if (!q) return edit(ctx, "Guna: .8ball <soalan ya/tidak>");
  const [a, kind] = BALL[rnd(BALL.length)];
  await show(ctx, card({
    title: "Bola Ajaib 8", icon: "robot",
    rows: [["tag", "Soalan", esc(clip(q, 80))], [kind === true ? "green" : kind === false ? "fire" : "time", "Jawapan", `<b>${esc(a)}</b>`]],
    footer: footerOf(ctx.account),
  }));
}

async function rate(ctx) {
  const t = ctx.args.join(" ").trim();
  if (!t) return edit(ctx, "Guna: .rate <apa sahaja>");
  // Skor tetap bagi teks yang sama (hash), supaya konsisten
  const h = crypto.createHash("md5").update(t.toLowerCase()).digest();
  const pct = h[0] % 101;
  const bar = "\u2588".repeat(Math.round(pct / 10)) + "\u2591".repeat(10 - Math.round(pct / 10));
  await show(ctx, card({
    title: "Penilaian", icon: "star2",
    rows: [["tag", "Perkara", esc(clip(t, 60))], ["chart", "Skor", `<b>${pct}%</b>`], ["gear", "Bar", `<code>${bar}</code>`]],
    footer: footerOf(ctx.account),
  }));
}

module.exports = {
  name: "fun",
  category: "Hiburan",
  help: [
    { cmd: "pick", alias: [], desc: "pilih rawak: .pick a | b | c" },
    { cmd: "dice", alias: [], desc: "baling dadu: .dice [sisi]" },
    { cmd: "coin", alias: [], desc: "lambung syiling" },
    { cmd: "8ball", alias: [], desc: "bola ajaib: .8ball <soalan>" },
    { cmd: "rate", alias: [], desc: "nilai sesuatu: .rate <teks>" },
  ],
  commands: { pick, dice, coin: coin, "8ball": ball, rate },
};

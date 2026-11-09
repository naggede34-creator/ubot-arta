// Hiburan tambahan (22 arahan)
const crypto = require("crypto");
const K = require("../kit");
const { R, H, need, out, UserErr } = K;

const rnd = (n) => crypto.randomInt(n);
const pick = (a) => a[rnd(a.length)];
const hashN = (s, mod = 101, salt = "") => crypto.createHash("md5").update(String(s).toLowerCase() + salt).digest()[0] % mod;

const PANTUN = [
  "Pergi ke pasar membeli ikan,\nIkan dibeli dimasak gulai.\nBelajar rajin jadi kebiasaan,\nCita-cita tinggi pasti tercapai.",
  "Buah cempedak di luar pagar,\nAmbil galah tolong jolokkan.\nSungguh banyak orang yang pintar,\nTapi yang rendah hati jarang didapatkan.",
  "Anak ayam turun sepuluh,\nMati seekor tinggal sembilan.\nAnak yang baik dan patuh,\nHidupnya senang penuh kemuliaan.",
  "Kalau ada sumur di ladang,\nBoleh kita menumpang mandi.\nKalau ada umur yang panjang,\nBoleh kita berjumpa lagi.",
  "Pisang emas dibawa belayar,\nMasak sebiji di atas peti.\nHutang emas boleh dibayar,\nHutang budi dibawa mati.",
  "Tuai padi antara masak,\nMari kita tuai bersama.\nBiar budi sentiasa baik,\nBiar hati sentiasa mesra.",
  "Burung merpati terbang tinggi,\nHinggap seekor di pohon kayu.\nBiarpun dekat atau jauh di mata,\nKenangan tetap di hati selalu.",
  "Buah langsat kuning mencelah,\nDimakan si anak dara.\nBiar lambat asalkan selamat,\nJangan tergesa-gesa membawa bencana.",
];
const GOMBAL = [
  "Kamu tahu apa persamaan kamu dengan WiFi? Dekat kamu, hati aku sentiasa tersambung.",
  "Kalau kamu jadi bintang, aku rela jadi malam supaya selalu dekat dengan kamu.",
  "Aku bukan penyelam, tapi kenapa aku tenggelam dalam senyuman kamu?",
  "Kamu pasti penjual kopi ya? Sebab kehadiran kamu buat aku berjaga sepanjang malam.",
  "Dalam dunia yang penuh kod ralat, kamu satu-satunya yang buat aku rasa 'berjaya'.",
  "Kalau cinta itu ujian, aku sanggup mengulang kaji sepanjang hayat untuk kamu.",
  "Peta pun boleh sesat, tapi aku tak pernah tersesat dalam kenangan bersama kamu.",
  "Kamu ni kalkulator ya? Sebab setiap kali dengan kamu, aku sentiasa 'kira' bahagia.",
];
const JOKE = [
  "Kenapa komputer tak pernah lapar? Sebab dia sentiasa ada 'cache'.",
  "Apa beza programmer dan ibu? Ibu cakap 'dah makan?', programmer cakap 'dah commit?'.",
  "Kenapa ayam melintas jalan? Sebab nak sampai ke seberang. Tapi kenapa saya ketawa?",
  "Kata si pelanggan, 'Teh tarik ada?' Kata pelayan, 'Ada, tapi tarik sendiri.'",
  "Cikgu: Siapa penemu telefon? Murid: Alexander Graham Bell. Cikgu: Bagus. Murid: Cikgu, sebelum tu dia telefon siapa?",
  "Doktor: Awak perlu kurangkan main telefon. Pesakit: Doktor, saya setuju. Tapi doktor tak nak follow Instagram saya?",
  "Kenapa nyamuk tak pernah sesat? Sebab dia sentiasa ikut 'darah'.",
  "Apa kata WiFi pada kata laluan? 'Tanpa kamu, aku tiada sambungan.'",
];
const QUOTE = [
  "Jatuh tujuh kali, bangun lapan kali. - pepatah Jepun",
  "Sesungguhnya bersama kesulitan ada kemudahan. - Al-Insyirah 6",
  "Mulakan di mana anda berada, guna apa yang anda ada, buat apa yang anda boleh. - Arthur Ashe",
  "Kejayaan ialah jumlah usaha kecil yang diulang hari demi hari. - Robert Collier",
  "Orang yang tak pernah buat kesilapan ialah orang yang tak pernah mencuba. - Albert Einstein",
  "Masa yang paling baik untuk menanam pokok ialah 20 tahun lalu; masa kedua terbaik ialah hari ini. - pepatah Cina",
  "Bukan gunung yang kita takluki, tetapi diri kita sendiri. - Edmund Hillary",
  "Ilmu tanpa amal umpama pokok tanpa buah.",
];
const MOTIV = [
  "Hari ini mungkin berat, tapi kamu lebih kuat daripada yang kamu sangka.",
  "Jangan bandingkan bab pertama kamu dengan bab kelima orang lain.",
  "Satu langkah kecil setiap hari lebih baik daripada menunggu langkah yang sempurna.",
  "Rehat bukan malas; ia sebahagian daripada perjalanan.",
  "Usaha yang konsisten mengalahkan bakat yang malas.",
  "Gagal itu guru. Yang penting, kamu belajar sesuatu.",
  "Percaya pada prosesnya. Hasilnya akan menyusul.",
  "Kamu tak perlu hebat untuk bermula, tapi kamu perlu bermula untuk jadi hebat.",
];
const TRUTH = [
  "Apakah perkara paling memalukan yang pernah berlaku kepada kamu?", "Siapa orang yang paling kamu rindu sekarang?", "Apa rahsia kecil yang belum pernah kamu ceritakan?",
  "Apakah ketakutan terbesar kamu?", "Apa kebiasaan buruk kamu yang tak ramai tahu?", "Pernah tak kamu berbohong pada kawan baik? Tentang apa?",
  "Apa impian yang kamu rasa mustahil tapi masih kamu simpan?", "Lagu apa yang kamu dengar secara sembunyi kerana segan?",
];
const DARE = [
  "Hantar emoji kegemaran kamu kepada 3 orang tanpa penjelasan.", "Tukar gambar profil kepada gambar lucu selama sejam.", "Nyanyi satu rangkap lagu dan rakam suara (kalau berani).",
  "Tulis status 'saya lapar' dengan 5 emoji makanan.", "Pujilah orang terakhir yang kamu bermesej dengan ikhlas.", "Buat 10 push-up sekarang dan lapor semula.",
  "Cakap 'saya terbaik' tiga kali dengan kuat.", "Hantar mesej 'terima kasih' kepada seseorang yang pernah membantu kamu.",
];
const WYR = [
  "Lebih suka boleh terbang atau boleh jadi halimunan?", "Lebih suka tak ada telefon sebulan atau tak ada TV setahun?", "Lebih suka kaya tapi sunyi atau sederhana tapi bahagia?",
  "Lebih suka tahu bila kamu mati atau tahu bagaimana kamu mati?", "Lebih suka makan nasi lemak setiap hari atau mi goreng setiap hari?", "Lebih suka sentiasa lewat 10 minit atau sentiasa awal 20 minit?",
];
const FORTUNE = [
  ["Hari ini bakal membawa berita baik. Bersedialah.", "star"], ["Seseorang sedang memikirkan kamu.", "star"], ["Rezeki datang dari arah yang tak disangka.", "gem"],
  ["Bersabar; masa kamu hampir tiba.", "time"], ["Jangan terlalu cepat membuat keputusan hari ini.", "fire"], ["Peluang baharu muncul selepas satu pintu tertutup.", "rocket"],
  ["Kesihatan dan rehat patut diutamakan hari ini.", "green"], ["Belanja berhemat; elak pembelian impulsif.", "tag"],
];

const nameOf = (e) => [e.firstName, e.lastName].filter(Boolean).join(" ") || e.title || e.username || "seseorang";
async function targetName(ctx, from = 0) {
  const t = ctx.args.slice(from).join(" ").trim();
  if (t) return t.replace(/^@/, "@");
  const rm = await ctx.msg.getReplyMessage().catch(() => null);
  if (rm && rm.senderId) {
    const s = await ctx.client.getEntity(rm.senderId).catch(() => null);
    if (s) return nameOf(s);
  }
  return null;
}
const me = (ctx) => (ctx.account.username ? "@" + ctx.account.username : ctx.account.name || "Saya");

const action = (cmd, verb, icon, emoji) => ({
  cmd, desc: `${verb}: .${cmd} @nama (atau balas mesej)`,
  async run(ctx) {
    const t = await targetName(ctx);
    need(t, `.${cmd} @nama  (atau balas mesej seseorang)`);
    await out(ctx, `${verb.charAt(0).toUpperCase() + verb.slice(1)}`, icon, [H("ok", "Aksi", `${emoji} <b>${K.esc(me(ctx))}</b> ${verb} <b>${K.esc(t)}</b>`)]);
  },
});
const kaomoji = (cmd, text, desc) => ({
  cmd, desc,
  async run(ctx) {
    const extra = ctx.args.join(" ");
    await ctx.client.editMessage(ctx.msg.peerId, { message: ctx.msg.id, text: (extra ? extra + " " : "") + text });
  },
});
const textCard = (cmd, title, icon, list, desc) => ({
  cmd, desc,
  async run(ctx) {
    await out(ctx, title, icon, [], { extra: K.bq(pick(list)), extraText: K.esc(pick(list)) });
  },
});

const defs = [
  {
    cmd: "roll", desc: "baling dadu gaya D&D: .roll 2d6 | .roll d20+3",
    async run(ctx) {
      const m = String(ctx.args.join("") || "1d6").toLowerCase().match(/^(\d{0,2})d(\d{1,4})([+-]\d{1,4})?$/);
      need(m, ".roll 2d6  atau  .roll d20+3");
      const n = Math.min(20, +m[1] || 1), s = Math.max(2, +m[2]), mod = +(m[3] || 0);
      const r = Array.from({ length: n }, () => rnd(s) + 1);
      await out(ctx, "Baling Dadu", "fire", [R("tag", "Dadu", `${n}d${s}${mod ? (mod > 0 ? "+" : "") + mod : ""}`), R("gear", "Lambungan", r.join(" + ")), H("ok", "Jumlah", `<b>${r.reduce((a, b) => a + b, 0) + mod}</b>`)]);
    },
  },
  {
    cmd: "rps", alias: ["suit"], desc: "batu kertas gunting: .rps batu|kertas|gunting",
    async run(ctx) {
      const map = { batu: 0, rock: 0, kertas: 1, paper: 1, gunting: 2, scissors: 2 };
      const names = ["Batu \uD83E\uDEA8", "Kertas \uD83D\uDCC4", "Gunting \u2702\uFE0F"];
      const u = map[String(ctx.args[0] || "").toLowerCase()];
      need(u !== undefined, ".rps batu  (batu / kertas / gunting)");
      const b = rnd(3);
      const res = u === b ? "Seri" : (u - b + 3) % 3 === 1 ? "Bot menang" : "Anda menang";
      await out(ctx, "Batu Kertas Gunting", "star", [R("user", "Anda", names[u]), R("robot", "Bot", names[b]), H(res === "Anda menang" ? "ok" : res === "Seri" ? "time" : "fire", "Keputusan", `<b>${res}</b>`)]);
    },
  },
  {
    cmd: "slots", alias: ["slot"], desc: "mesin slot: .slots",
    async run(ctx) {
      const S = ["\uD83C\uDF52", "\uD83C\uDF4B", "\uD83C\uDF47", "\uD83D\uDD14", "\u2B50", "\uD83D\uDC8E", "7\uFE0F\u20E3"];
      const r = [pick(S), pick(S), pick(S)];
      const win = r[0] === r[1] && r[1] === r[2] ? "JACKPOT!" : r[0] === r[1] || r[1] === r[2] || r[0] === r[2] ? "Hampir! (2 sama)" : "Cuba lagi";
      await out(ctx, "Mesin Slot", "gem", [H("ok", "Gelek", `<b>${r.join(" | ")}</b>`), R("tag", "Keputusan", win)]);
    },
  },
  {
    cmd: "love", alias: ["ship"], desc: "kadar jodoh: .love Ali | Siti",
    async run(ctx) {
      const parts = ctx.args.join(" ").split(/\s*[|&+]\s*|\s+dan\s+/i).map((s) => s.trim()).filter(Boolean);
      need(parts.length >= 2, ".love Ali | Siti");
      const key = [parts[0], parts[1]].map((s) => s.toLowerCase()).sort().join("|");
      const pct = hashN(key, 101, "love");
      const n = Math.round(pct / 10);
      await out(ctx, "Kadar Jodoh", "fire", [R("user", "Pasangan", `${parts[0]} \u2764\uFE0F ${parts[1]}`), H("ok", "Padanan", `<b>${pct}%</b>`), H("gear", "Bar", `<code>${"\u2588".repeat(n)}${"\u2591".repeat(10 - n)}</code>`), R("tag", "Ulasan", pct > 80 ? "Jodoh kuat!" : pct > 50 ? "Ada harapan" : pct > 25 ? "Perlu usaha" : "Kawan baik sahaja")]);
    },
  },
  {
    cmd: "iq", desc: "ukur IQ (hiburan): .iq <nama>",
    async run(ctx) {
      const t = await targetName(ctx);
      need(t, ".iq Ali");
      const v = 70 + hashN(t, 91, "iq");
      await out(ctx, "Ujian IQ (hiburan)", "robot", [R("user", "Nama", t), H("ok", "IQ", `<b>${v}</b>`), R("tag", "Tahap", v > 140 ? "Genius" : v > 115 ? "Bijak" : v > 85 ? "Purata" : "Santai")], { checks: [[true, "Ini hanya untuk hiburan"]] });
    },
  },
  {
    cmd: "fortune", alias: ["ramal"], desc: "ramalan hari ini: .fortune",
    async run(ctx) {
      const [t, ic] = pick(FORTUNE);
      await out(ctx, "Ramalan Hari Ini", ic, [R("tag", "No. bertuah", `${rnd(99) + 1}, ${rnd(99) + 1}, ${rnd(99) + 1}`), R("tag", "Warna bertuah", pick(["Merah", "Biru", "Hijau", "Emas", "Ungu", "Putih"]))], { extra: K.bq(t), extraText: K.esc(t) });
    },
  },
  textCard("truth", "Truth", "user", TRUTH, "soalan truth rawak: .truth"),
  textCard("dare", "Dare", "fire", DARE, "cabaran dare rawak: .dare"),
  textCard("wyr", "Would You Rather", "star", WYR, "pilih mana satu: .wyr"),
  textCard("pantun", "Pantun", "star", PANTUN, "pantun rawak: .pantun"),
  textCard("gombal", "Ayat Cinta", "fire", GOMBAL, "ayat gombal rawak: .gombal"),
  textCard("joke", "Jenaka", "bolt", JOKE, "jenaka rawak: .joke"),
  textCard("quote", "Petikan", "crown", QUOTE, "petikan bijak rawak: .quote"),
  textCard("motivasi", "Motivasi", "rocket", MOTIV, "kata semangat rawak: .motivasi"),
  action("hug", "memeluk", "wave", "\uD83E\uDD17"),
  action("slap", "menampar", "fire", "\uD83D\uDC4B"),
  action("kiss", "mencium", "star", "\uD83D\uDE18"),
  kaomoji("shrug", "\u00AF\\_(\u30C4)_/\u00AF", "kaomoji angkat bahu: .shrug [teks]"),
  kaomoji("lenny", "( \u0361\u00B0 \u035C\u0296 \u0361\u00B0)", "kaomoji lenny: .lenny [teks]"),
  kaomoji("tableflip", "(\u256F\u00B0\u25A1\u00B0)\u256F\uFE35 \u253B\u2501\u253B", "kaomoji angkat meja: .tableflip [teks]"),
  kaomoji("unflip", "\u252C\u2500\u252C\u30CE( \u00BA _ \u00BA\u30CE)", "kaomoji letak meja: .unflip [teks]"),
  {
    cmd: "lucky", alias: ["nombor"], desc: "nombor bertuah hari ini: .lucky",
    async run(ctx) {
      const d = new Date().toISOString().slice(0, 10);
      const seed = hashN(ctx.account.accountId + d, 1000, "lucky");
      const r = [1, 2, 3, 4, 5, 6].map((i) => (hashN(ctx.account.accountId + d + i, 49, "n") + 1));
      await out(ctx, "Nombor Bertuah", "gem", [R("time", "Tarikh", d), H("ok", "6 nombor", `<b>${[...new Set(r)].sort((a, b) => a - b).join(", ")}</b>`), R("star", "Nombor utama", String(seed % 10))], { checks: [[true, "Berubah setiap hari"], [false, "Hiburan sahaja"]] });
    },
  },
];

module.exports = K.plugin("fun2", "Hiburan", defs);

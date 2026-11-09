// SUS & SERU - paket hiburan bertema "sus" (Among Us) + khodam / roast / alasan / tebakan.
// Semua hasil tampil sebagai kartu Rich + emoji premium (kit.out). Hiburan semata.
//   .sus [@nama]        ukur tingkat kesusan seseorang (tetap per nama per hari)
//   .eject [@nama]      lempar ke luar pesawat: was / was not the Impostor
//   .impostor           pilih impostor acak dari anggota grup
//   .emergency <topik>  rapat darurat: voting tersangka (acak)
//   .khodam [@nama]     cek khodam (tetap per nama)
//   .roast [@nama]      roasting ringan (jangan baper)
//   .alasan [jenis]     generator alasan: telat | izin | ngilang | tolak | deadline
//   .tebak              tebak-tebakan, jawaban ada di dropdown
// ASCII saja (simbol ditulis \uXXXX).
const crypto = require("crypto");
const K = require("../kit");
const { R, H, need, out, UserErr, esc } = K;

const rnd = (n) => crypto.randomInt(n);
const pick = (a) => a[rnd(a.length)];
const hashN = (s, mod, salt = "") => crypto.createHash("md5").update(String(s).toLowerCase().trim() + salt).digest().readUInt32BE(0) % mod;
const today = () => new Date().toISOString().slice(0, 10);
const bar = (pct, n = 10) => "\u2588".repeat(Math.round((pct / 100) * n)) + "\u2591".repeat(n - Math.round((pct / 100) * n));
const nameOf = (e) => [e.firstName, e.lastName].filter(Boolean).join(" ") || e.title || e.username || "seseorang";

// target: argumen (@nama / teks), atau pengirim pesan yang di-reply; kosong -> diri sendiri
async function targetOf(ctx, from = 0) {
  const t = ctx.args.slice(from).join(" ").trim();
  if (t) return t.slice(0, 40);
  const rm = await ctx.msg.getReplyMessage().catch(() => null);
  if (rm && rm.senderId) {
    const s = await ctx.client.getEntity(rm.senderId).catch(() => null);
    if (s) return nameOf(s);
  }
  return ctx.account.username ? "@" + ctx.account.username : ctx.account.name || "Kamu";
}

// anggota grup (tanpa bot / akun terhapus); jika bukan grup / gagal -> null
async function members(ctx, limit = 100) {
  try {
    const list = await ctx.client.getParticipants(ctx.msg.peerId, { limit });
    const l = list.filter((u) => !u.bot && !u.deleted).map(nameOf);
    return l.length >= 2 ? l : null;
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------- data
const BUKTI = [
  "Terlihat keluar-masuk vent jam 3 pagi",
  "Diam saja waktu ada yang 'meninggal'",
  "Tiba-tiba online tepat setelah body ditemukan",
  "Ngikutin crewmate dari belakang sambil siul-siul",
  "Task-nya cuma pura-pura (fake task)",
  "Bilang 'bukan gue' sebelum ada yang nanya",
  "Menghilang di Electrical pas lampu mati",
  "Kalau ditanya lokasi jawabnya 'di sana'",
  "Ngeprank lewat chat lalu pura-pura sibuk",
  "Selalu 'baru dateng' pas ada drama",
  "Status online tapi pesan nggak dibalas",
  "Mendadak rajin nge-vote orang lain",
  "Kelihatan nyengir sendiri pas layar redup",
  "Ngaku lagi 'nyalain WiFi' padahal sinyal penuh",
];
const LEVEL = [[20, "Crewmate Murni"], [40, "Agak Mencurigakan"], [60, "Mulai Sus"], [80, "Sus Banget"], [101, "IMPOSTOR!"]];
const VERDICT = [
  [20, "Aman. Boleh diajak task bareng, nggak bakal nusuk dari belakang."],
  [40, "Masih aman, tapi mata tetap melirik. Jangan terlalu dekat di Electrical."],
  [60, "Mulai ada bau-bau vent. Catat dulu, jangan di-vote sekarang."],
  [80, "Sus parah. Satu bukti lagi langsung masuk daftar eject."],
  [101, "Tidak perlu diskusi. Langsung EJECT, tutup rapat."],
];
const pickBy = (table, v) => table.find(([max]) => v < max)[1];

const KHODAM = [
  ["Kulkas Dua Pintu", "Dingin di luar, isinya penuh rahasia."],
  ["Macan Kumbang Wifi", "Selalu nyambung, tapi cuma ke tetangga."],
  ["Mbah Powerbank", "Selalu ada saat baterai tinggal 1 persen."],
  ["Naga Kipas Angin", "Muter-muter terus, nggak pernah sampai tujuan."],
  ["Harimau Pensil 2B", "Tajam kalau diraut, tumpul kalau ujian."],
  ["Kuntilanak Charger", "Muncul di pojok kamar, hilang pas dicari."],
  ["Genderuwo Mie Instan", "Bangkit tiap tengah malam."],
  ["Pocong Pinjam Dulu", "Dipinjam, tak pernah kembali."],
  ["Tuyul Diskonan", "Bergerak cepat tiap ada flash sale."],
  ["Jin Botol Es Teh", "Kabulkan satu permintaan: manis atau tawar."],
  ["Dewa Rebahan", "Kekuatan terbesarnya: tidak bergerak."],
  ["Ratu Pantai Selatan Paylater", "Cicilannya lebih panjang dari ceritanya."],
  ["Singa Laut Kuota", "Auman kuat, sisa kuota 0 MB."],
  ["Garuda Notifikasi", "Terbang tiap ada pesan, cuma dari grup."],
  ["Wewe Gombel Kulkas", "Menjaga sisa makanan tengah malam."],
  ["Siluman Capslock", "Nggak sengaja teriak di chat."],
];
const ROAST = [
  "{n}, kamu tuh kayak loading 99 persen: ditungguin terus, nggak kelar-kelar.",
  "Kalau kesabaran ada bank-nya, {n} udah lama kena blokir.",
  "{n} itu bukti kalau Wi-Fi bisa gagal bukan cuma karena router.",
  "Alarm {n} bunyi lima kali, yang bangun malah tetangga.",
  "Katanya {n} mau diet, tapi kulkas lebih sering disambangi daripada doi.",
  "{n} kalau jalan bareng GPS: GPS-nya yang minta tolong.",
  "Chat {n} cuma dibaca, dibalasnya pas Lebaran.",
  "Semangat {n} kayak sinyal di lift: ada, terus hilang.",
  "{n} itu orang paling sibuk sedunia, kecuali pas diajak kerja kelompok.",
  "Kalau rebahan jadi cabang olahraga, {n} sudah punya medali berlapis.",
  "Niat {n} besar, eksekusinya masih dalam antrean.",
  "{n} pernah bilang 'bentar lagi', sampai sekarang belum ada update.",
];
const ALASAN = {
  telat: [
    "Maaf telat, tadi ada kucing nyasar masuk ke motor dan nggak mau turun.",
    "Jalanan macet karena ada konvoi bebek menyeberang. Beneran.",
    "Alarm saya bunyi, tapi ternyata alarm hari Minggu.",
    "Tadi mau berangkat, eh sepatu sebelah kiri minta cuti.",
    "Aplikasi ojek-nya bilang 'driver sedang makan siang' selama 40 menit.",
  ],
  izin: [
    "Izin ya, hari ini saya harus menemani kulkas servis. Dia lagi sensitif.",
    "Kuota habis, sinyal hilang, dan semangat ikut pergi. Mohon izin.",
    "Saya harus ke bengkel, motor ngambek karena kemarin dicuekin.",
    "Ada urusan keluarga mendadak: kucing lahiran empat ekor.",
    "Izin dulu, sedang mengikuti seminar dadakan: 'Cara Bangun Pagi'.",
  ],
  ngilang: [
    "Maaf baru balas, HP saya habis baterai terus ngambek nggak mau nyala.",
    "Kemarin saya ketiduran jam 7 malam, bangunnya udah besok.",
    "HP saya jatuh ke ember, lagi dijemur, sekarang masih basah hatinya.",
    "Aku nggak ngilang, cuma lagi nyari jati diri di balik tumpukan cucian.",
    "Notif WhatsApp saya ternyata diam-diam dimatikan sama tangan sendiri.",
  ],
  tolak: [
    "Wah, sayang banget, saya sudah janji menemani tanaman saya nonton hujan.",
    "Bukan nggak mau, tapi jadwal saya penuh sama rebahan terjadwal.",
    "Maaf ya, di tanggal itu saya ada rapat penting dengan diri sendiri.",
    "Lain kali pasti ikut, kali ini kasur lagi butuh saya.",
    "Saya lagi mode hemat energi sosial. Baterai tinggal 3 persen.",
  ],
  deadline: [
    "Filenya udah selesai, tinggal dikirim, tapi tadi tiba-tiba laptop update 2 jam.",
    "Draf-nya sudah ada, cuma tertinggal di kepala, belum sempat dipindah.",
    "Saya hampir kirim, tapi Wi-Fi memutuskan buat healing.",
    "Terjadi gangguan teknis: saya lagi malas, tapi dengan kemauan tinggi.",
    "Revisi terakhir lagi dicek sama kucing, tunggu persetujuannya.",
  ],
};
const TEBAK = [
  ["Apa yang makin dicuci makin kotor?", "Air."],
  ["Hewan apa yang paling rajin?", "Semut. Sibuk kerja terus tanpa libur."],
  ["Benda apa yang bisa terbang tapi nggak punya sayap?", "Waktu. Tahu-tahu sudah lewat."],
  ["Kalau ditunggu lama, kalau dikejar malah menjauh. Apa itu?", "Bayangan."],
  ["Punya kunci tapi nggak bisa buka pintu. Apa itu?", "Piano."],
  ["Apa yang basah ketika mengeringkan?", "Handuk."],
  ["Semakin banyak diambil, semakin besar. Apa itu?", "Lubang."],
  ["Hewan apa yang suka bohong?", "Kancil. Suka ngerjain buaya."],
  ["Apa yang naik tapi nggak pernah turun?", "Umur."],
  ["Punya mata tapi nggak bisa melihat. Apa itu?", "Jarum."],
  ["Apa yang selalu di depan tapi nggak bisa dilihat?", "Masa depan."],
  ["Ayam apa yang paling sering dicari tiap sore?", "Ayam bakar... eh, ayam yang pulang ke kandang."],
];

// ---------------------------------------------------------------- perintah
const defs = [
  {
    cmd: "sus", alias: ["susmeter"], desc: "ukur kesusan: .sus [@nama] (atau balas pesan)",
    async run(ctx) {
      const t = await targetOf(ctx);
      const pct = hashN(t + today(), 101, "sus");
      const base = hashN(t + today(), BUKTI.length, "b");
      const proofs = [0, 5, 9].map((o) => BUKTI[(base + o) % BUKTI.length]);
      await out(ctx, "Sus-Meter", "eyes", [
        R("user", "Target", t),
        H("fire", "Tingkat sus", `<b>${pct}%</b> ${bar(pct)}`),
        R("tag", "Status", pickBy(LEVEL, pct)),
        R("chart", "Bukti #1", proofs[0]),
        R("box", "Bukti #2", proofs[1]),
        R("gear", "Bukti #3", proofs[2]),
      ], {
        extra: K.bq(pickBy(VERDICT, pct)), extraText: esc(pickBy(VERDICT, pct)),
        checks: [[true, "Hasil tetap untuk nama yang sama hari ini"], [false, "Hiburan semata, jangan dibawa ke hati"]],
      });
    },
  },
  {
    cmd: "eject", alias: ["vote"], desc: "eject dari pesawat: .eject [@nama]",
    async run(ctx) {
      const t = await targetOf(ctx);
      const imp = rnd(100) < 40;
      const left = imp ? rnd(2) : 1 + rnd(2); // impostor tersisa
      const votes = 3 + rnd(7);
      const line = `${t} was ${imp ? "" : "not "}an Impostor.`;
      await out(ctx, "Emergency Eject", imp ? "ok" : "no", [
        R("user", "Dilempar", t),
        R("chart", "Suara masuk", `${votes} vote`),
        H(imp ? "green" : "no", "Hasil", `<b>${imp ? "IMPOSTOR" : "BUKAN IMPOSTOR"}</b>`),
        R("fire", "Impostor tersisa", left === 0 ? "0 (crewmate menang)" : `${left} masih berkeliaran`),
      ], {
        extra: K.bq(`${line}\n${left === 0 ? "Crewmate menang. Selamat!" : `${left} Impostor${left > 1 ? "s" : ""} remain${left > 1 ? "" : "s"}.`}`),
        extraText: esc(line),
        checks: [[true, "Terlempar ke luar angkasa"], [false, "Hanya permainan, bukan tuduhan"]],
      });
    },
  },
  {
    cmd: "impostor", alias: ["imposter"], desc: "pilih impostor acak dari anggota grup",
    async run(ctx) {
      const l = await members(ctx);
      const pool = l || [await targetOf(ctx), "Dia"];
      const imp = pick(pool);
      const tasks = 20 + rnd(70);
      await out(ctx, "Pilih Impostor", "eyes", [
        R("user", "Peserta", `${pool.length} orang`),
        H("fire", "Impostor", `<b>${esc(imp)}</b>`),
        R("green", "Crewmate", `${pool.length - 1} orang`),
        H("chart", "Tugas selesai", `${tasks}% ${bar(tasks)}`),
      ], {
        extra: K.bq("Satu di antara kalian adalah impostor.\nAwas, jangan percaya siapa pun."), extraText: "Satu di antara kalian adalah impostor.",
        checks: [[true, l ? "Dipilih acak dari anggota grup" : "Chat pribadi: dipilih antara kamu dan dia"], [false, "Ini cuma permainan"]],
      });
    },
  },
  {
    cmd: "emergency", alias: ["meeting", "rapat"], desc: "rapat darurat + voting: .emergency <topik>",
    async run(ctx) {
      const topic = (ctx.args.join(" ").trim() || "Ada yang sus").slice(0, 80);
      const l = await members(ctx);
      const names = (l || ["Kucing", "WiFi", "Mantan", "Si Paling Sibuk"]).slice().sort(() => rnd(3) - 1).slice(0, 4);
      const votes = names.map((n) => [n, rnd(6)]);
      const skip = rnd(4);
      const top = votes.slice().sort((a, b) => b[1] - a[1]);
      const tie = top.length > 1 && top[0][1] === top[1][1];
      await out(ctx, "Emergency Meeting", "mega", [
        R("tag", "Topik", topic),
        ...votes.map(([n, v]) => H("user", n, `<b>${v}</b> ${"\u25CF".repeat(v) || "-"}`)),
        R("time", "Skip", `${skip} suara`),
        H(tie || top[0][1] === 0 ? "no" : "fire", "Hasil", tie || top[0][1] === 0 ? "<b>Seri / tidak ada yang di-eject</b>" : `<b>${esc(top[0][0])} di-eject</b>`),
      ], {
        headers: ["Tersangka", "Suara"],
        checks: [[true, l ? "Tersangka diambil acak dari anggota grup" : "Tersangka acak karena ini bukan grup"], [false, "Voting palsu, hiburan semata"]],
      });
    },
  },
  {
    cmd: "khodam", alias: ["cekkhodam"], desc: "cek khodam: .khodam [@nama]",
    async run(ctx) {
      const t = await targetOf(ctx);
      const [nm, desc] = KHODAM[hashN(t, KHODAM.length, "khodam")];
      const power = 10 + hashN(t, 91, "pwr");
      const jam = `${String(hashN(t, 24, "h")).padStart(2, "0")}:${String(hashN(t, 60, "m")).padStart(2, "0")}`;
      await out(ctx, "Cek Khodam", "star", [
        R("user", "Pemilik", t),
        H("gem", "Khodam", `<b>${esc(nm)}</b>`),
        H("fire", "Kekuatan", `<b>${power}%</b> ${bar(power)}`),
        R("time", "Paling aktif", `${jam} (tengah malam bagi sebagian orang)`),
      ], {
        extra: K.bq(desc), extraText: esc(desc),
        checks: [[true, "Hasil tetap untuk nama yang sama"], [false, "Hiburan, bukan ramalan"]],
      });
    },
  },
  {
    cmd: "roast", alias: ["roasting"], desc: "roasting ringan: .roast [@nama]",
    async run(ctx) {
      const t = await targetOf(ctx);
      const line = pick(ROAST).replace(/\{n\}/g, t);
      await out(ctx, "Roasting", "fire", [
        R("user", "Korban", t),
        R("fire", "Tingkat panas", pick(["Hangat", "Panas", "Pedas", "Level Sambal"])),
      ], {
        extra: K.bq(line), extraText: esc(line),
        checks: [[true, "Becandaan, jangan baper"], [false, "Aman untuk semua umur"]],
      });
    },
  },
  {
    cmd: "alasan", alias: ["excuse"], desc: "generator alasan: .alasan [telat|izin|ngilang|tolak|deadline]",
    async run(ctx) {
      const keys = Object.keys(ALASAN);
      const want = (ctx.args[0] || "").toLowerCase();
      if (want && !ALASAN[want]) throw new UserErr(`Jenis tidak dikenal. Pilih: ${keys.join(", ")}`);
      const jenis = want || pick(keys);
      const text = pick(ALASAN[jenis]);
      await out(ctx, "Generator Alasan", "bolt", [
        R("tag", "Jenis", jenis),
        H("chart", "Daya percaya", `<b>${55 + rnd(45)}%</b>`),
        R("box", "Pilihan lain", keys.filter((k) => k !== jenis).join(", ")),
      ], {
        extra: K.bq(text), extraText: esc(text),
        checks: [[true, "Siap tempel ke chat"], [false, "Gunakan dengan bijak"]],
      });
    },
  },
  {
    cmd: "tebak", alias: ["tebakan"], desc: "tebak-tebakan, jawaban di dropdown: .tebak",
    async run(ctx) {
      const [q, a] = pick(TEBAK);
      await out(ctx, "Tebak-Tebakan", "star", [R("tag", "Kategori", "Receh")], {
        extra: K.bq(q), extraText: esc(q),
        details: { icon: "eyes", title: "Lihat jawaban", body: a },
        checks: [[false, "Tebak dulu sebelum buka dropdown"]],
      });
    },
  },
];

module.exports = K.plugin("sus", "Hiburan", defs);
module.exports._t = { hashN, bar, pickBy, LEVEL, ALASAN, KHODAM, TEBAK };

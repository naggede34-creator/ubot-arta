// Islam & Malaysia: waktu solat, Quran, tarikh Hijri, kiblat, doa, zakat.
const K = require("../kit");
const { R, H, out, need, getJson, grp, fmt, esc, clip, UserErr, num, bq } = K;

const DOA = {
  makan: ["Doa sebelum makan", "Bismillahi wa 'ala barakatillah.", "Dengan nama Allah dan atas berkat Allah."],
  lepasmakan: ["Doa selepas makan", "Alhamdulillahilladzi ath'amana wa saqana wa ja'alana muslimin.", "Segala puji bagi Allah yang memberi kami makan dan minum serta menjadikan kami Muslim."],
  tidur: ["Doa sebelum tidur", "Bismika Allahumma ahya wa bismika amut.", "Dengan nama-Mu ya Allah aku hidup dan dengan nama-Mu aku mati."],
  bangun: ["Doa bangun tidur", "Alhamdulillahilladzi ahyana ba'da ma amatana wa ilaihin nushur.", "Segala puji bagi Allah yang menghidupkan kami setelah mematikan kami dan kepada-Nya kami dibangkitkan."],
  masjid: ["Doa masuk masjid", "Allahummaf tah li abwaba rahmatik.", "Ya Allah bukakanlah untukku pintu-pintu rahmat-Mu."],
  keluarmasjid: ["Doa keluar masjid", "Allahumma inni as'aluka min fadhlik.", "Ya Allah, sesungguhnya aku memohon kurnia-Mu."],
  tandas: ["Doa masuk tandas", "Allahumma inni a'udzu bika minal khubutsi wal khabaits.", "Ya Allah, aku berlindung dengan-Mu daripada syaitan lelaki dan perempuan."],
  rumah: ["Doa keluar rumah", "Bismillah, tawakkaltu 'alallah, la hawla wa la quwwata illa billah.", "Dengan nama Allah, aku bertawakal kepada Allah; tiada daya dan kekuatan melainkan dengan Allah."],
  musafir: ["Doa naik kenderaan", "Subhanalladzi sakhkhara lana hadza wa ma kunna lahu muqrinin wa inna ila rabbina lamunqalibun.", "Maha Suci Allah yang menundukkan kenderaan ini untuk kami, padahal kami tidak mampu menguasainya."],
  ibu: ["Doa untuk ibu bapa", "Rabbighfir li wa liwalidayya warhamhuma kama rabbayani saghira.", "Ya Tuhanku, ampunilah aku dan kedua ibu bapaku, kasihanilah mereka sebagaimana mereka mendidikku waktu kecil."],
  ilmu: ["Doa menambah ilmu", "Rabbi zidni 'ilma, warzuqni fahma.", "Ya Tuhanku, tambahkanlah ilmuku dan kurniakanlah aku kefahaman."],
  sembuh: ["Doa memohon kesembuhan", "Allahumma rabban nas, adzhibil ba's, isyfi antas syafi, la syifa'a illa syifa'uk, syifa'an la yughadiru saqama.", "Ya Allah Tuhan manusia, hilangkan penyakit ini, sembuhkanlah, Engkaulah Penyembuh; tiada kesembuhan melainkan kesembuhan-Mu."],
};

const defs = [
  {
    cmd: "solat", alias: ["waktusolat", "prayer"], desc: "waktu solat: .solat kuala lumpur",
    async run(ctx) {
      const city = ctx.args.join(" ").trim() || "Kuala Lumpur";
      const j = await getJson(`https://api.aladhan.com/v1/timingsByAddress?address=${encodeURIComponent(city + ", Malaysia")}&method=3`);
      if (!j.data) throw new UserErr("Lokasi tidak dijumpai.");
      const t = j.data.timings;
      await out(ctx, "Waktu Solat", "star", [
        R("tag", "Lokasi", city), R("time", "Tarikh", `${j.data.date.readable} | ${j.data.date.hijri.day} ${j.data.date.hijri.month.en} ${j.data.date.hijri.year}H`),
        R("star", "Subuh", t.Fajr), R("fire", "Syuruk", t.Sunrise), R("bolt", "Zohor", t.Dhuhr),
        R("gem", "Asar", t.Asr), R("star2", "Maghrib", t.Maghrib), R("crown", "Isyak", t.Isha),
      ], { headers: ["Waktu", "Masa"] });
    },
  },
  {
    cmd: "quran", alias: ["ayat"], desc: "ayat Quran + terjemahan: .quran 2:255",
    async run(ctx) {
      const ref = ctx.args[0] || "1:1";
      need(/^\d{1,3}:\d{1,3}$/.test(ref), ".quran <surah:ayat> contoh .quran 2:255");
      const j = await getJson(`https://api.alquran.cloud/v1/ayah/${ref}/editions/quran-uthmani,ms.basmeih`);
      if (!j.data || j.code !== 200) throw new UserErr("Ayat tidak dijumpai.");
      const [ar, ms] = j.data;
      await out(ctx, `${ar.surah.englishName} (${ref})`, "star", [
        R("tag", "Surah", `${ar.surah.name} - ${ar.surah.englishNameTranslation}`), R("box", "Juzuk / Halaman", `${ar.juz} / ${ar.page}`),
      ], {
        extra: `<blockquote>${esc(ar.text)}</blockquote><blockquote>${esc(clip(ms.text, 1200))}</blockquote>`,
        extraText: `${esc(ar.text)}\n\n${esc(clip(ms.text, 1200))}`,
      });
    },
  },
  {
    cmd: "hijri", alias: ["hijrah"], desc: "tukar tarikh Masihi ke Hijri: .hijri [tarikh]",
    async run(ctx) {
      const dt = ctx.args[0] ? K.parseDate(ctx.args[0]) : K.todayUTC();
      if (!dt) throw new UserErr("Format tarikh: yyyy-mm-dd atau dd-mm-yyyy");
      const f = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" }).formatToParts(dt);
      const g = (t) => f.find((p) => p.type === t).value;
      const HM = ["Muharram", "Safar", "Rabiulawal", "Rabiulakhir", "Jamadilawal", "Jamadilakhir", "Rejab", "Syaaban", "Ramadan", "Syawal", "Zulkaedah", "Zulhijjah"];
      await out(ctx, "Tarikh Hijri", "star", [
        R("time", "Masihi", K.fmtDate(dt)), R("star", "Hijri", `${g("day")} ${HM[+g("month") - 1]} ${parseInt(g("year"), 10)}H`),
      ], { extra: "", extraText: "" });
    },
  },
  {
    cmd: "kiblat", alias: ["qibla"], desc: "arah kiblat dari bandar: .kiblat johor bahru",
    async run(ctx) {
      const place = ctx.args.join(" ").trim() || "Kuala Lumpur";
      const g = await getJson(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(place)}`);
      const p = g.results && g.results[0];
      if (!p) throw new UserErr("Bandar tidak dijumpai.");
      const r = Math.PI / 180, lat1 = p.latitude * r, lat2 = 21.4225 * r, dl = (39.8262 - p.longitude) * r;
      const brg = ((Math.atan2(Math.sin(dl), Math.cos(lat1) * Math.tan(lat2) - Math.sin(lat1) * Math.cos(dl)) / r) + 360) % 360;
      const dirs = ["Utara", "Timur Laut", "Timur", "Tenggara", "Selatan", "Barat Daya", "Barat", "Barat Laut"];
      const a = Math.acos(Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(dl)) * 6371;
      await out(ctx, "Arah Kiblat", "star2", [
        R("tag", "Lokasi", `${p.name}, ${p.country || ""}`), R("star2", "Arah", `${fmt(brg, 1)}\u00B0 (${dirs[Math.round(brg / 45) % 8]})`), R("chart", "Jarak ke Kaabah", `${grp(a, 0)} km`),
      ]);
    },
  },
  {
    cmd: "doa", desc: "doa harian: .doa (senarai) | .doa makan",
    async run(ctx) {
      const k = (ctx.args[0] || "").toLowerCase();
      if (!DOA[k]) {
        return out(ctx, "Doa Harian", "star", Object.keys(DOA).map((x) => R("star", "." + "doa " + x, DOA[x][0])), { headers: ["Guna", "Doa"] });
      }
      const [t, ar, ms] = DOA[k];
      await out(ctx, t, "star", [], { extra: bq(ar + "\n\n" + ms), extraText: esc(ar + "\n\n" + ms) });
    },
  },
  {
    cmd: "zakat", desc: "kira zakat: .zakat emas <gram> <harga/gram> | .zakat pendapatan <setahun>",
    async run(ctx) {
      const t = (ctx.args[0] || "").toLowerCase();
      if (t === "emas") {
        const g = num(ctx.args[1]), p = num(ctx.args[2]);
        need(g > 0 && p > 0, ".zakat emas <gram> <harga sagram RM>");
        const nisab = 85 * p, val = g * p;
        return out(ctx, "Zakat Emas", "gem", [
          R("gem", "Nilai emas", "RM " + grp(val)), R("chart", "Nisab (85g)", "RM " + grp(nisab)),
          R("check", "Status", val >= nisab ? "Wajib zakat (cukup nisab & haul 1 tahun)" : "Belum cukup nisab"),
          R("star", "Zakat 2.5%", val >= nisab ? "RM " + grp(val * 0.025) : "RM 0"),
        ]);
      }
      if (t === "pendapatan" || t === "harta") {
        const a = num(ctx.args[1]);
        need(a > 0, ".zakat pendapatan <jumlah setahun RM>");
        return out(ctx, "Zakat Pendapatan", "gem", [R("gem", "Pendapatan", "RM " + grp(a)), R("star", "Zakat 2.5%", "RM " + grp(a * 0.025)), R("box", "Sebulan", "RM " + grp((a * 0.025) / 12))]);
      }
      throw new UserErr("Guna: .zakat emas <gram> <harga/gram> | .zakat pendapatan <setahun>");
    },
  },
];

module.exports = K.plugin("islam", "Islam & Malaysia", defs);

// Web & Info: arahan yang memanggil API awam percuma (tanpa kunci). Output = kad Rich + emoji premium.
const K = require("../kit");
const { R, H, out, need, getJson, getBuf, sendBuf, grp, fmt, esc, clip, UserErr, num, code } = K;

const q = (ctx, usage) => {
  const t = ctx.args.join(" ").trim();
  need(t, usage);
  return t;
};
const WMO = {
  0: "Cerah", 1: "Kebanyakan cerah", 2: "Separa berawan", 3: "Mendung", 45: "Berkabus", 48: "Kabus beku",
  51: "Gerimis ringan", 53: "Gerimis", 55: "Gerimis lebat", 61: "Hujan ringan", 63: "Hujan", 65: "Hujan lebat",
  71: "Salji ringan", 73: "Salji", 75: "Salji lebat", 80: "Hujan sekejap", 81: "Hujan sekejap lebat",
  82: "Hujan ribut", 95: "Ribut petir", 96: "Ribut petir + hujan batu", 99: "Ribut petir lebat",
};

const defs = [
  {
    cmd: "weather", alias: ["cuaca"], desc: "cuaca semasa: .cuaca kuala lumpur",
    async run(ctx) {
      const place = q(ctx, ".cuaca <bandar>");
      const g = await getJson(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=ms&name=${encodeURIComponent(place)}`);
      const p = g.results && g.results[0];
      if (!p) throw new UserErr("Bandar tidak dijumpai.");
      const w = await getJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,precipitation,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`
      );
      const c = w.current, d = w.daily;
      await out(ctx, "Cuaca", "chart", [
        R("tag", "Lokasi", `${p.name}, ${p.country || ""}`),
        R("fire", "Keadaan", WMO[c.weather_code] || "-"),
        R("bolt", "Suhu", `${c.temperature_2m}\u00B0C (rasa ${c.apparent_temperature}\u00B0C)`),
        R("chart", "Min / Max", `${d.temperature_2m_min[0]}\u00B0 / ${d.temperature_2m_max[0]}\u00B0C`),
        R("wave", "Lembap", `${c.relative_humidity_2m}%`),
        R("rocket", "Angin", `${c.wind_speed_10m} km/j`),
        R("box", "Hujan", `${c.precipitation} mm (kebarangkalian ${d.precipitation_probability_max[0]}%)`),
      ]);
    },
  },
  {
    cmd: "crypto", alias: ["kripto"], desc: "harga kripto: .crypto btc eth",
    async run(ctx) {
      const MAP = { btc: "bitcoin", eth: "ethereum", bnb: "binancecoin", sol: "solana", xrp: "ripple", ada: "cardano", doge: "dogecoin", ton: "the-open-network", trx: "tron", dot: "polkadot", ltc: "litecoin", usdt: "tether", shib: "shiba-inu", matic: "matic-network", avax: "avalanche-2" };
      const names = (ctx.args.length ? ctx.args : ["btc", "eth"]).slice(0, 8);
      const ids = names.map((n) => MAP[n.toLowerCase()] || n.toLowerCase());
      const j = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd,myr&include_24hr_change=true`);
      const rows = [];
      ids.forEach((id, i) => {
        const d = j[id];
        if (!d) return;
        const ch = d.usd_24h_change;
        rows.push(H("gem", names[i].toUpperCase(), `$${grp(d.usd)} | RM${grp(d.myr)} | ${ch >= 0 ? "\u25B2" : "\u25BC"}${fmt(Math.abs(ch || 0), 2)}%`));
      });
      if (!rows.length) throw new UserErr("Syiling tidak dijumpai.");
      await out(ctx, "Harga Kripto", "gem", rows, { headers: ["Syiling", "USD | MYR | 24j"] });
    },
  },
  {
    cmd: "kurs", alias: ["rate2", "forex"], desc: "tukaran mata wang: .kurs 100 usd myr",
    async run(ctx) {
      need(ctx.args.length >= 3, ".kurs <jumlah> <dari> <ke>");
      const a = num(ctx.args[0]);
      need(Number.isFinite(a), ".kurs <jumlah> <dari> <ke>");
      const from = ctx.args[1].toUpperCase(), to = ctx.args[2].toUpperCase();
      const j = await getJson(`https://open.er-api.com/v6/latest/${from}`);
      if (j.result !== "success" || !j.rates[to]) throw new UserErr("Kod mata wang tidak sah.");
      const r = j.rates[to];
      await out(ctx, "Tukaran Mata Wang", "gem", [
        R("tag", "Jumlah", `${grp(a)} ${from}`),
        R("gem", "Hasil", `${grp(a * r)} ${to}`),
        R("chart", "Kadar", `1 ${from} = ${fmt(r, 4)} ${to}`),
        R("time", "Dikemas kini", String(j.time_last_update_utc || "-").slice(0, 16)),
      ]);
    },
  },
  {
    cmd: "ipinfo", alias: ["ip"], desc: "maklumat IP / domain: .ip 1.1.1.1",
    async run(ctx) {
      const t = q(ctx, ".ip <ip atau domain>");
      const j = await getJson(`http://ip-api.com/json/${encodeURIComponent(t)}?fields=status,message,country,regionName,city,isp,org,as,timezone,query,lat,lon`);
      if (j.status !== "success") throw new UserErr(j.message || "Gagal.");
      await out(ctx, "Maklumat IP", "link", [
        R("link", "IP", j.query), R("tag", "Negara", j.country), R("tag", "Negeri/Bandar", `${j.regionName}, ${j.city}`),
        R("box", "ISP", j.isp), R("gear", "Org/AS", `${j.org || "-"} / ${j.as || "-"}`),
        R("time", "Zon masa", j.timezone), R("chart", "Koordinat", `${j.lat}, ${j.lon}`),
      ]);
    },
  },
  {
    cmd: "dns", desc: "rekod DNS: .dns google.com [A|MX|TXT|NS]",
    async run(ctx) {
      const d = q(ctx, ".dns <domain> [jenis]");
      const type = (ctx.args[1] || "A").toUpperCase();
      const j = await getJson(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(ctx.args[0])}&type=${type}`, 12000, { Accept: "application/dns-json" });
      const ans = j.Answer || [];
      if (!ans.length) throw new UserErr("Tiada rekod " + type);
      await out(ctx, `DNS ${type}`, "link", ans.slice(0, 12).map((a) => R("link", `TTL ${a.TTL}`, a.data)), { sub: esc(d.split(" ")[0]) });
    },
  },
  {
    cmd: "short", alias: ["pendek"], desc: "pendekkan URL: .short https://...",
    async run(ctx) {
      const u = q(ctx, ".short <url>");
      const j = await getJson(`https://is.gd/create.php?format=json&url=${encodeURIComponent(u)}`);
      if (!j.shorturl) throw new UserErr(j.errormessage || "Gagal.");
      await out(ctx, "URL Pendek", "link", [R("link", "Asal", clip(u, 50)), H("rocket", "Pendek", `<a href="${esc(j.shorturl)}">${esc(j.shorturl)}</a>`)]);
    },
  },
  {
    cmd: "unshort", alias: ["buka"], desc: "dedahkan destinasi pautan pendek",
    async run(ctx) {
      let u = q(ctx, ".unshort <url>");
      const hops = [];
      for (let i = 0; i < 8; i++) {
        const r = await fetch(u, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" } });
        const loc = r.headers.get("location");
        if (!loc || r.status < 300 || r.status > 399) break;
        u = new URL(loc, u).href;
        hops.push(u);
      }
      await out(ctx, "Destinasi Pautan", "link", [R("link", "Lompatan", hops.length), H("rocket", "Destinasi", `<a href="${esc(u)}">${esc(clip(u, 80))}</a>`)]);
    },
  },
  {
    cmd: "qr", desc: "buat kod QR: .qr teks",
    async run(ctx) {
      const t = await K.text(ctx);
      need(t, ".qr <teks> (atau reply)");
      const buf = await getBuf(`https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=10&data=${encodeURIComponent(t)}`);
      await sendBuf(ctx, buf, "qr.png", `<b>QR</b>: ${esc(clip(t, 120))}`);
    },
  },
  {
    cmd: "wiki", desc: "ringkasan Wikipedia: .wiki Malaysia",
    async run(ctx) {
      const t = q(ctx, ".wiki <topik>");
      let j;
      try { j = await getJson(`https://ms.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}`); }
      catch (_) { j = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}`); }
      await out(ctx, j.title || "Wikipedia", "star", [R("tag", "Topik", j.description || j.title)], {
        extra: `<blockquote>${esc(clip(j.extract || "-", 900))}</blockquote><p><a href="${esc((j.content_urls && j.content_urls.desktop.page) || "#")}">Baca penuh</a></p>`,
        extraText: esc(clip(j.extract || "-", 900)),
      });
    },
  },
  {
    cmd: "dict", alias: ["kamus"], desc: "definisi perkataan (Inggeris): .dict hello",
    async run(ctx) {
      const w = q(ctx, ".dict <perkataan>");
      const j = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w.split(" ")[0])}`);
      const e = j[0];
      if (!e) throw new UserErr("Tiada definisi.");
      const rows = [R("tag", "Perkataan", e.word), R("tag", "Sebutan", e.phonetic || "-")];
      for (const m of e.meanings.slice(0, 3)) {
        const df = m.definitions[0];
        rows.push(R("star", m.partOfSpeech, clip(df.definition, 160)));
        if (df.example) rows.push(R("box", "Contoh", clip(df.example, 120)));
      }
      await out(ctx, "Kamus", "star", rows);
    },
  },
  {
    cmd: "github", alias: ["gh"], desc: "profil GitHub: .gh torvalds",
    async run(ctx) {
      const u = q(ctx, ".gh <username>").split(" ")[0];
      const j = await getJson(`https://api.github.com/users/${encodeURIComponent(u)}`, 12000, { Accept: "application/vnd.github+json" });
      await out(ctx, "GitHub", "rocket", [
        H("user", "Pengguna", `<a href="${esc(j.html_url)}">${esc(j.login)}</a>`),
        R("tag", "Nama", j.name), R("box", "Repo awam", j.public_repos), R("star", "Pengikut", grp(j.followers)),
        R("link", "Mengikuti", grp(j.following)), R("tag", "Lokasi", j.location), R("time", "Sertai", String(j.created_at).slice(0, 10)),
      ], { extra: j.bio ? `<blockquote>${esc(clip(j.bio, 200))}</blockquote>` : "", extraText: esc(clip(j.bio || "", 200)) });
    },
  },
  {
    cmd: "ghrepo", desc: "info repo: .ghrepo pengguna/repo",
    async run(ctx) {
      const r = q(ctx, ".ghrepo <pengguna/repo>").split(" ")[0];
      need(r.includes("/"), ".ghrepo <pengguna/repo>");
      const j = await getJson(`https://api.github.com/repos/${r}`, 12000, { Accept: "application/vnd.github+json" });
      await out(ctx, "Repo GitHub", "rocket", [
        H("box", "Repo", `<a href="${esc(j.html_url)}">${esc(j.full_name)}</a>`), R("tag", "Bahasa", j.language),
        R("star", "Bintang", grp(j.stargazers_count)), R("link", "Fork", grp(j.forks_count)), R("fire", "Isu", grp(j.open_issues_count)),
        R("time", "Kemas kini", String(j.pushed_at).slice(0, 10)), R("gear", "Lesen", j.license && j.license.spdx_id),
      ], { extra: j.description ? `<blockquote>${esc(clip(j.description, 240))}</blockquote>` : "", extraText: esc(clip(j.description || "", 240)) });
    },
  },
  {
    cmd: "npm", desc: "info pakej npm: .npm grammy",
    async run(ctx) {
      const n = q(ctx, ".npm <pakej>").split(" ")[0];
      const j = await getJson(`https://registry.npmjs.org/${encodeURIComponent(n)}/latest`);
      await out(ctx, "npm", "box", [
        R("box", "Pakej", j.name), R("tag", "Versi", j.version), R("gear", "Lesen", j.license),
        R("link", "Dependensi", Object.keys(j.dependencies || {}).length), H("rocket", "Pasang", code("npm i " + j.name)),
      ], { extra: j.description ? `<blockquote>${esc(clip(j.description, 240))}</blockquote>` : "", extraText: esc(clip(j.description || "", 240)) });
    },
  },
  {
    cmd: "pypi", desc: "info pakej PyPI: .pypi requests",
    async run(ctx) {
      const n = q(ctx, ".pypi <pakej>").split(" ")[0];
      const j = (await getJson(`https://pypi.org/pypi/${encodeURIComponent(n)}/json`)).info;
      await out(ctx, "PyPI", "box", [
        R("box", "Pakej", j.name), R("tag", "Versi", j.version), R("user", "Penulis", j.author || j.author_email),
        R("gear", "Python", j.requires_python), H("rocket", "Pasang", code("pip install " + j.name)),
      ], { extra: j.summary ? `<blockquote>${esc(clip(j.summary, 240))}</blockquote>` : "", extraText: esc(clip(j.summary || "", 240)) });
    },
  },
  {
    cmd: "anime", desc: "cari anime: .anime naruto",
    async run(ctx) {
      const t = q(ctx, ".anime <tajuk>");
      const j = await getJson(`https://api.jikan.moe/v4/anime?limit=1&q=${encodeURIComponent(t)}`);
      const a = j.data && j.data[0];
      if (!a) throw new UserErr("Anime tidak dijumpai.");
      await out(ctx, a.title, "star", [
        R("star", "Skor", a.score), R("tag", "Jenis", a.type), R("box", "Episod", a.episodes), R("time", "Status", a.status),
        R("chart", "Tahun", a.year), R("tag", "Genre", (a.genres || []).map((g) => g.name).join(", ")),
      ], { extra: `<blockquote>${esc(clip(a.synopsis || "-", 600))}</blockquote>`, extraText: esc(clip(a.synopsis || "-", 600)) });
    },
  },
  {
    cmd: "pokemon", alias: ["poke"], desc: "info Pokemon: .pokemon pikachu",
    async run(ctx) {
      const n = q(ctx, ".pokemon <nama/nombor>").split(" ")[0].toLowerCase();
      const j = await getJson(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(n)}`);
      const st = (k) => (j.stats.find((s) => s.stat.name === k) || {}).base_stat;
      await out(ctx, `${j.name} #${j.id}`, "bolt", [
        R("tag", "Jenis", j.types.map((t) => t.type.name).join(", ")), R("rocket", "Tinggi / Berat", `${j.height / 10} m / ${j.weight / 10} kg`),
        R("fire", "HP / ATK / DEF", `${st("hp")} / ${st("attack")} / ${st("defense")}`), R("bolt", "SpA / SpD / SPD", `${st("special-attack")} / ${st("special-defense")} / ${st("speed")}`),
        R("gear", "Kebolehan", j.abilities.map((a) => a.ability.name).join(", ")),
      ]);
    },
  },
  {
    cmd: "country", alias: ["negara"], desc: "info negara: .negara malaysia",
    async run(ctx) {
      const n = q(ctx, ".negara <nama>");
      const j = await getJson(`https://restcountries.com/v3.1/name/${encodeURIComponent(n)}`);
      const c = j[0];
      if (!c) throw new UserErr("Negara tidak dijumpai.");
      await out(ctx, `${c.flag || ""} ${c.name.common}`, "star", [
        R("tag", "Nama penuh", c.name.official), R("crown", "Ibu negara", (c.capital || []).join(", ")), R("tag", "Benua", (c.continents || []).join(", ")),
        R("user", "Penduduk", grp(c.population, 0)), R("chart", "Keluasan", `${grp(c.area, 0)} km\u00B2`),
        R("gem", "Mata wang", Object.values(c.currencies || {}).map((x) => x.name).join(", ")),
        R("mega", "Bahasa", Object.values(c.languages || {}).join(", ")), R("link", "Kod telefon", ((c.idd && c.idd.root) || "") + ((c.idd && c.idd.suffixes && c.idd.suffixes[0]) || "")),
      ]);
    },
  },
  {
    cmd: "advice", alias: ["nasihat"], desc: "nasihat rawak (Inggeris)",
    async run(ctx) {
      const j = await getJson("https://api.adviceslip.com/advice");
      await out(ctx, "Nasihat", "star", [], { extra: `<blockquote>${esc(j.slip.advice)}</blockquote>`, extraText: esc(j.slip.advice) });
    },
  },
  {
    cmd: "catfact", desc: "fakta kucing rawak",
    async run(ctx) {
      const j = await getJson("https://catfact.ninja/fact");
      await out(ctx, "Fakta Kucing", "star", [], { extra: `<blockquote>${esc(j.fact)}</blockquote>`, extraText: esc(j.fact) });
    },
  },
  {
    cmd: "cat", alias: ["kucing"], desc: "gambar kucing rawak",
    async run(ctx) { await sendBuf(ctx, await getBuf("https://cataas.com/cat"), "cat.jpg", "<b>Meow</b>"); },
  },
  {
    cmd: "dog", alias: ["anjing"], desc: "gambar anjing rawak",
    async run(ctx) {
      const j = await getJson("https://dog.ceo/api/breeds/image/random");
      await sendBuf(ctx, await getBuf(j.message), "dog.jpg", "<b>Woof</b>");
    },
  },
  {
    cmd: "pinghost", alias: ["cekweb"], desc: "cek laman web hidup & masa respons: .cekweb google.com",
    async run(ctx) {
      let u = q(ctx, ".cekweb <url>").split(" ")[0];
      if (!/^https?:\/\//.test(u)) u = "https://" + u;
      const t0 = Date.now();
      const ac = new AbortController();
      const tm = setTimeout(() => ac.abort(), 10000);
      try {
        const r = await fetch(u, { signal: ac.signal, redirect: "follow" });
        await out(ctx, "Cek Laman", "bolt", [R("link", "URL", clip(u, 50)), R("check", "Status", `${r.status} ${r.statusText}`), R("bolt", "Masa", `${Date.now() - t0} ms`), R("gear", "Pelayan", r.headers.get("server")), R("box", "Jenis", r.headers.get("content-type"))]);
      } catch (e) {
        await out(ctx, "Cek Laman", "bolt", [R("link", "URL", clip(u, 50)), R("fire", "Status", e.name === "AbortError" ? "Tamat masa (10s)" : "Tidak dapat dicapai")]);
      } finally { clearTimeout(tm); }
    },
  },
  {
    cmd: "gempa", desc: "gempa bumi terkini (BMKG)",
    async run(ctx) {
      const g = (await getJson("https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json")).Infogempa.gempa;
      await out(ctx, "Gempa Terkini", "fire", [
        R("time", "Waktu", `${g.Tanggal} ${g.Jam}`), R("fire", "Magnitud", g.Magnitude), R("tag", "Kedalaman", g.Kedalaman),
        R("tag", "Lokasi", g.Wilayah), R("chart", "Koordinat", g.Coordinates), R("mega", "Potensi", g.Potensi),
      ]);
    },
  },
];

module.exports = K.plugin("web", "Web & Info", defs);

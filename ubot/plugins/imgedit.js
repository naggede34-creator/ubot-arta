// Edit gambar via API (hasil dikirim dengan caption Rich)
//   Ikyyxd : .blur .jadianime
//   ARTA PEDIA  : .tofigure   -> /ai-image/tofigure?image=
//            .tofigurev2 -> /ai-image/tofigurav2?url=
//            .toreal     -> /ai-image/toreal?url=
//            .fakedev2   -> /canvas/fakedev2?text=&image=
// Cara pakai: balas (reply) sebuah foto, atau tulis link gambar setelah perintah.
// Karena API butuh link, foto dari Telegram diunggah dulu ke hosting sementara (catbox / uguu / 0x0).
const K = require("../kit");
const { UserErr, R, esc } = K;
const { style, runMedia } = require("../fxcard");

const BASE = "https://api.ikyyxd.my.id";
const XRINA = "https://apiii-xrina.my.id";
const MAX_IN = 10 * 1024 * 1024; // gambar masukan maks 10 MB
const MAX_OUT = 100 * 1024 * 1024; // hasil maks 100 MB
const UA = { "User-Agent": "Mozilla/5.0 ubot" };

const isUrl = (s) => /^https?:\/\/\S+$/i.test(String(s || ""));

// Cari URL pertama di dalam JSON
function findUrl(o, depth = 0) {
  if (depth > 4 || o == null) return "";
  if (typeof o === "string") return isUrl(o.trim()) ? o.trim() : "";
  if (Array.isArray(o)) {
    for (const v of o) {
      const u = findUrl(v, depth + 1);
      if (u) return u;
    }
    return "";
  }
  if (typeof o === "object") {
    for (const k of ["url", "result", "image", "video", "output", "data", "link", "images", "videos"]) {
      const u = findUrl(o[k], depth + 1);
      if (u) return u;
    }
    for (const v of Object.values(o)) {
      const u = findUrl(v, depth + 1);
      if (u) return u;
    }
  }
  return "";
}

async function timedFetch(url, opts = {}, ms = 30000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } catch (e) {
    if (e.name === "AbortError") throw retryable("Server terlalu lama membalas. Coba lagi.");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// Kesalahan dari sisi API/jaringan yang layak dicoba ulang (dengan hosting gambar lain)
function retryable(msg) {
  return Object.assign(new UserErr(msg), { retry: true });
}

// Ambil teks error dari balasan JSON API (kunci yang dipakai API ini: msg)
function errText(d) {
  if (!d || typeof d !== "object") return "";
  for (const root of [d, d.data, d.result]) {
    if (!root || typeof root !== "object") continue;
    for (const k of ["msg", "message", "error", "detail", "reason"]) {
      const v = root[k];
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, 200);
      if (v && typeof v === "object") {
        try {
          return JSON.stringify(v).slice(0, 200);
        } catch (_) {}
      }
    }
  }
  return "";
}

// Unggah gambar ke hosting sementara. next() memberi link dari hosting berikutnya yang berhasil
// (dipakai bergantian: kalau API menolak link dari satu hosting, dicoba hosting lain).
function makeUploader(buf, name, mime) {
  const hosts = [
    async () => {
      const fd = new FormData();
      fd.append("reqtype", "fileupload");
      fd.append("fileToUpload", new Blob([buf], { type: mime }), name);
      const r = await timedFetch("https://catbox.moe/user/api.php", { method: "POST", body: fd, headers: UA }, 45000);
      const t = (await r.text()).trim();
      return r.ok && isUrl(t) ? t : "";
    },
    async () => {
      const fd = new FormData();
      fd.append("files[]", new Blob([buf], { type: mime }), name);
      const r = await timedFetch("https://uguu.se/upload", { method: "POST", body: fd, headers: UA }, 45000);
      const d = await r.json().catch(() => ({}));
      return r.ok ? (d.files && d.files[0] && d.files[0].url) || "" : "";
    },
    async () => {
      const fd = new FormData();
      fd.append("file", new Blob([buf], { type: mime }), name);
      const r = await timedFetch("https://0x0.st", { method: "POST", body: fd, headers: UA }, 45000);
      const t = (await r.text()).trim();
      return r.ok && isUrl(t) ? t : "";
    },
  ];
  let i = 0;
  return async function next() {
    while (i < hosts.length) {
      const h = hosts[i++];
      try {
        const u = await h();
        if (u) return u;
      } catch (_) {}
    }
    return null;
  };
}

// Ambil sumber gambar: link di argumen, atau foto yang di-reply (diunggah lewat next())
async function sourceUrl(ctx, rest) {
  const first = rest[0];
  if (isUrl(first)) {
    let used = false;
    return { next: async () => (used ? null : ((used = true), first)), rest: rest.slice(1), rm: null };
  }
  const rm = await ctx.msg.getReplyMessage().catch(() => null);
  const mime = rm && rm.file ? String(rm.file.mimeType || "") : "";
  if (!rm || !mime.startsWith("image/")) {
    throw new UserErr("Balas (reply) sebuah foto, atau tulis link gambar setelah perintah.");
  }
  if (rm.file.size && rm.file.size > MAX_IN) throw new UserErr("Gambar terlalu besar (maksimum 10 MB).");
  const buf = await ctx.client.downloadMedia(rm, {});
  if (!buf || !buf.length) throw new UserErr("Gagal mengunduh foto itu.");
  if (buf.length > MAX_IN) throw new UserErr("Gambar terlalu besar (maksimum 10 MB).");
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return { next: makeUploader(buf, `in.${ext}`, mime), rest, rm };
}

// Baca hasil API: bisa gambar/video langsung, atau JSON berisi link
async function readResult(apiUrl, ms) {
  let r = await timedFetch(apiUrl, { headers: { ...UA, Accept: "image/*,video/*,application/json" } }, ms);
  let type = String(r.headers.get("content-type") || "").toLowerCase();
  if (!r.ok) {
    let why = "";
    if (type.includes("json") || type.startsWith("text/")) {
      const raw = await r.text().catch(() => "");
      try {
        why = errText(JSON.parse(raw));
      } catch (_) {
        why = /<html/i.test(raw) ? "" : raw.trim().slice(0, 120);
      }
    }
    throw retryable(`API membalas HTTP ${r.status}${why ? ": " + why : ""}`);
  }
  if (type.includes("json") || type.startsWith("text/")) {
    const d = await r.json().catch(() => ({}));
    if (d && d.status === false) {
      let why = errText(d);
      if (!why) {
        try {
          why = JSON.stringify(d).slice(0, 160);
        } catch (_) {}
      }
      throw retryable(`API menolak: ${why || "tanpa keterangan"}`);
    }
    const link = findUrl(d);
    if (!link) throw retryable("API tidak mengembalikan hasil.");
    r = await timedFetch(link, { headers: UA }, 90000);
    if (!r.ok) throw retryable(`Gagal mengambil hasil (HTTP ${r.status}).`);
    type = String(r.headers.get("content-type") || "").toLowerCase();
    if (!type.startsWith("image/") && !type.startsWith("video/")) {
      type = /\.(mp4|webm|mov)(\?|$)/i.test(link) ? "video/mp4" : "image/jpeg";
    }
  }
  const len = Number(r.headers.get("content-length") || 0);
  if (len > MAX_OUT) throw new UserErr("Hasil terlalu besar.");
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length) throw retryable("Hasil kosong dari API.");
  if (buf.length > MAX_OUT) throw new UserErr("Hasil terlalu besar.");
  return { buf, type };
}

async function runEdit(ctx, def) {
  // sumber gambar dulu (kalau salah pakai -> kartu "Perhatian" cara pakai), lalu kerja berat di kartu "memproses"
  const src = await sourceUrl(ctx, ctx.args || []);
  // parameter tambahan (prompt / teks) dari sisa argumen, ada nilai bawaan
  let extra = "";
  if (def.extra) extra = src.rest.join(" ").trim() || def.extra.def;
  const maxTry = def.slow ? 2 : 3;
  const timeout = def.slow ? 150000 : def.slowish ? 120000 : 90000;

  await runMedia(ctx, {
    label: `${def.title}: sedang diproses${def.slow || def.slowish ? " (bisa 1-2 menit)" : ""} ...`,
    icon: "\u23F3",
    work: async () => {
      let res = null;
      let lastErr = null;
      let tries = 0;
      for (let attempt = 1; attempt <= maxTry; attempt++) {
        const link = await src.next();
        if (!link) break;
        tries++;
        const base = def.base || BASE;
        const param = def.param || "url";
        let apiUrl = def.extra && def.extra.first
          ? `${base}${def.path}?${def.extra.key}=${encodeURIComponent(extra)}&${param}=${encodeURIComponent(link)}`
          : `${base}${def.path}?${param}=${encodeURIComponent(link)}`;
        if (def.extra && !def.extra.first) apiUrl += `&${def.extra.key}=${encodeURIComponent(extra)}`;
        try {
          res = await readResult(apiUrl, timeout);
          break;
        } catch (e) {
          lastErr = e;
          if (!e.retry) throw e;
        }
      }
      if (!res) {
        if (lastErr) throw new UserErr(`${lastErr.message}${def.hint ? "\n" + def.hint : ""}`);
        throw new UserErr("Gagal mengunggah gambar ke hosting sementara. Coba lagi nanti.");
      }
      const { buf, type } = res;
      const isVideo = type.startsWith("video/");
      const ext = isVideo ? (type.includes("webm") ? "webm" : "mp4") : type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
      const { CustomFile } = require("telegram/client/uploads");
      await ctx.client.sendFile(ctx.msg.peerId, {
        file: new CustomFile(`${def.cmd}.${ext}`, buf.length, "", buf),
        caption: `<b>${esc(def.title)}</b>`,
        parseMode: "html",
        supportsStreaming: isVideo,
        replyTo: src.rm ? src.rm.id : ctx.msg.id,
      });
      const mb = buf.length / (1024 * 1024);
      const rows = [
        R("done", "Hasil", isVideo ? "Video" : "Gambar"),
        R("chart", "Ukuran", mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(buf.length / 1024))} KB`),
      ];
      if (def.extra) rows.push(R("gear", def.extra.label, extra.slice(0, 120)));
      if (tries > 1) rows.push(R("link", "Percobaan", `${tries}x (hosting lain)`));
      return style({
        title: def.title,
        icon: def.icon || (isVideo ? "rocket" : "gem"),
        lead: def.lead,
        rows,
        checks: [[true, "Gambar diunggah ke hosting sementara"], [true, "Diproses oleh API"], [true, `${isVideo ? "Video" : "Gambar"} terkirim di bawah`]],
      }, def.usage);
    },
  });
}

const mk = (def) => (ctx) => runEdit(ctx, def);

const DEFS = {
  blur: { cmd: "blur", icon: "cloud", title: "Blur Gambar", path: "/image/blur", lead: "Buat gambar menjadi blur", usage: "Balas foto lalu ketik .blur\nAtau: .blur <link gambar>" },
  tofigure: { cmd: "tofigure", icon: "gift", title: "Gambar ke Figure", base: XRINA, path: "/ai-image/tofigure", param: "image", slowish: true, lead: "Ubah foto menjadi figure kolektor", usage: "Balas foto lalu ketik .tofigure\nAtau: .tofigure <link gambar>" },
  tofigurev2: { cmd: "tofigurev2", icon: "gift", title: "Gambar ke Figure V2", base: XRINA, path: "/ai-image/tofigurav2", slowish: true, lead: "Ubah foto menjadi figure (versi 2)", usage: "Balas foto lalu ketik .tofigurev2\nAtau: .tofigurev2 <link gambar>" },
  toreal: { cmd: "toreal", icon: "smile", title: "Gambar ke Real", base: XRINA, path: "/ai-image/toreal", slowish: true, lead: "Ubah gambar menjadi foto realistis", usage: "Balas foto lalu ketik .toreal\nAtau: .toreal <link gambar>" },
  fakedev2: {
    cmd: "fakedev2", icon: "gem", title: "Fake Developer V2", base: XRINA, path: "/canvas/fakedev2", param: "image",
    extra: { key: "text", def: "ARTA PEDIA ID", label: "Nama", first: true },
    lead: "Buat gambar Fake Developer dari fotomu", usage: "Balas foto lalu ketik .fakedev2 <nama>\nContoh: .fakedev2 Rizky (kosong = ARTA PEDIA ID)",
  },
  jadianime: { cmd: "jadianime", icon: "star2", title: "Jadi Anime", path: "/edit/jadianime", lead: "Ubah foto menjadi gaya anime", usage: "Balas foto lalu ketik .jadianime\nAtau: .jadianime <link gambar>" },
};

module.exports = K.plugin("imgedit", "AI & Media", [
  { cmd: "blur", alias: ["blurfoto"], desc: "blur gambar: reply foto + .blur", run: mk(DEFS.blur) },
  { cmd: "tofigure", alias: ["jadifigure", "figure"], desc: "gambar jadi figure: reply foto + .tofigure", run: mk(DEFS.tofigure) },
  { cmd: "tofigurev2", alias: ["figurev2", "tofigurav2"], desc: "gambar jadi figure v2: reply foto + .tofigurev2", run: mk(DEFS.tofigurev2) },
  { cmd: "toreal", alias: ["jadireal", "kereal"], desc: "ubah foto/gambar jadi real: reply foto + .toreal", run: mk(DEFS.toreal) },
  { cmd: "fakedev2", alias: ["fakedevv2"], desc: "Fake Developer v2 dari foto: reply foto + .fakedev2 <nama>", run: mk(DEFS.fakedev2) },
  { cmd: "jadianime", alias: ["toanime"], desc: "foto jadi anime: reply foto + .jadianime", run: mk(DEFS.jadianime) },
]);

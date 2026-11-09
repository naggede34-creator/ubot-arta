// Hiburan ARTA PEDIA (kartu Rich + emoji premium): .galau .pantun .pap .longteks
// Memakai https://apiii-xrina.my.id/fun/*  (pantun di sini menggantikan pantun lokal di fun2.js)
const K = require("../kit");
const { UserErr, R, out, esc, getJson, getBuf, bq } = K;
const { style, runMedia } = require("../fxcard");

const BASE = "https://apiii-xrina.my.id/fun";

// Ambil teks dari berbagai kemungkinan bentuk JSON
function pickText(d, keys) {
  const roots = [d?.data, d?.result, d];
  for (const r of roots) {
    if (typeof r === "string" && r.trim()) return r.trim();
    if (r && typeof r === "object") {
      for (const k of keys) {
        if (typeof r[k] === "string" && r[k].trim()) return r[k].trim();
      }
    }
  }
  return "";
}

async function apiJson(path) {
  const d = await getJson(`${BASE}/${path}`, 15000);
  if (d && d.status === false) throw new UserErr(String(d.msg || d.message || d.error || "API mengembalikan error."));
  return d;
}

// Kartu Rich: judul, pembuka, teks utama (blockquote), jadual info, kotak semak, cara pakai
async function textCard(ctx, { title, icon, lead, text, cmd, rows = [] }) {
  const t = String(text).slice(0, 2800);
  await out(ctx, title, icon, [...rows, R("link", "Sumber", "ARTA PEDIA API")], style({
    lead,
    extraFirst: true,
    extra: bq(t),
    extraText: esc(t),
    checks: [[true, "Teks acak setiap perintah"], [true, `Ketik <code>.${cmd}</code> lagi untuk hasil baru`]],
    details: { icon: "bolt", title: "Cara pakai", body: `.${cmd}  ->  tampilkan hasil acak` },
  }));
}

async function galau(ctx) {
  const d = await apiJson("quotes-galau");
  const t = pickText(d, ["result", "quote", "quotes", "text"]);
  if (!t) throw new UserErr("API tidak mengembalikan quotes galau. Coba lagi.");
  await textCard(ctx, { title: "Quotes Galau", icon: "cloud", lead: "Kata-kata galau acak untuk suasana hatimu", text: t, cmd: "galau", rows: [R("tag", "Kategori", "Galau")] });
}

async function pantun(ctx) {
  const d = await apiJson("pantun");
  let t = pickText(d, ["pantun", "result", "text"]);
  if (!t) {
    const lines = d?.data?.lines;
    if (Array.isArray(lines)) t = lines.join("\n");
  }
  if (!t) throw new UserErr("API tidak mengembalikan pantun. Coba lagi.");
  await textCard(ctx, { title: "Pantun", icon: "star2", lead: "Pantun empat baris acak", text: t, cmd: "pantun", rows: [R("tag", "Jenis", "Pantun acak")] });
}

async function longteks(ctx) {
  const d = await apiJson("longteks");
  const t = pickText(d, ["text", "result", "teks"]);
  if (!t) throw new UserErr("API tidak mengembalikan longteks. Coba lagi.");
  const no = d?.data?.nomor;
  await textCard(ctx, {
    title: "Long Teks", icon: "pin", lead: "Teks panjang acak siap kirim", text: t, cmd: "longteks",
    rows: [R("tag", "Nomor", no !== undefined ? `#${no}` : "-")],
  });
}

// pap: API bisa mengembalikan gambar langsung atau JSON berisi URL gambar
async function fetchPap() {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30000);
  try {
    const res = await fetch(`${BASE}/pap`, { signal: ac.signal, headers: { "User-Agent": "Mozilla/5.0 ubot", Accept: "image/*,application/json" } });
    if (!res.ok) throw new UserErr(`API membalas HTTP ${res.status}`);
    let type = String(res.headers.get("content-type") || "").toLowerCase();
    let buf;
    if (type.includes("json") || type.startsWith("text/")) {
      const data = await res.json().catch(() => ({}));
      const link = [data?.data?.url, data?.data?.image, data?.data?.result, data?.result, data?.url, data?.image]
        .find((v) => typeof v === "string" && /^https?:\/\//i.test(v));
      if (!link) throw new UserErr(String(data?.msg || data?.message || data?.error || "API tidak mengembalikan gambar."));
      buf = await getBuf(link, 30000);
      type = "image/jpeg";
    } else {
      buf = Buffer.from(await res.arrayBuffer());
    }
    if (!buf || !buf.length) throw new UserErr("Gambar kosong dari API.");
    return { buf, type };
  } catch (e) {
    if (e.name === "AbortError") throw new UserErr("API terlalu lama membalas. Coba lagi.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function pap(ctx) {
  await runMedia(ctx, {
    label: "Mengambil gambar PAP ...",
    icon: "\uD83D\uDDBC\uFE0F",
    work: async () => {
      const { buf, type } = await fetchPap();
      const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "jpg";
      const { CustomFile } = require("telegram/client/uploads");
      await ctx.client.sendFile(ctx.msg.peerId, {
        file: new CustomFile(`pap.${ext}`, buf.length, "", buf),
        caption: "<b>PAP</b>",
        parseMode: "html",
        replyTo: ctx.msg.id,
      });
      return style({
        title: "PAP",
        icon: "eyes",
        lead: "Gambar acak dari ARTA PEDIA API",
        rows: [R("tag", "Format", ext.toUpperCase()), R("chart", "Ukuran", `${Math.max(1, Math.round(buf.length / 1024))} KB`), R("link", "Sumber", "ARTA PEDIA API")],
        checks: [[true, "Gambar terkirim di bawah"], [true, "Ketik <code>.pap</code> lagi untuk gambar baru"]],
      }, ".pap  ->  kirim gambar acak");
    },
  });
}

module.exports = K.plugin("xrinafun", "Hiburan", [
  { cmd: "galau", alias: ["quotesgalau"], desc: "quotes galau acak: .galau", run: galau },
  { cmd: "pantun", alias: [], desc: "pantun acak: .pantun", run: pantun },
  { cmd: "pap", alias: [], desc: "kirim gambar pap acak: .pap", run: pap },
  { cmd: "longteks", alias: ["lt"], desc: "teks panjang acak: .longteks", run: longteks },
]);

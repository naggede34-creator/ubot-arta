// Media dan label menu .help:  .setphoto  .setvideo  .delphoto  .delvideo  .helpmedia  .setroot
const fs = require("fs");
const path = require("path");
const HM = require("../helpmedia");
const { card, show, edit, esc, footerOf } = require("../ui");

const mimeOf = (m) => (m.file && m.file.mimeType) || (m.document && m.document.mimeType) || "";
const isPhoto = (m) => !!(m.photo || /^image\//.test(mimeOf(m)));
const isVideo = (m) => !!(m.video || m.gif || /^video\//.test(mimeOf(m)));
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

const modeText = (uid) => {
  const mode = HM.getMode();
  const st = HM.embedState();
  if (mode === "off") return "dimatikan";
  if (mode === "separate") return "mesej biasa sebelum menu";
  if (mode === "embed") return "dalam mesej Rich (paksa)";
  return st === "bad" ? "auto: mesej biasa (Rich menolak media)" : st === "ok" ? "auto: dalam mesej Rich" : "auto: cuba dalam mesej Rich dahulu";
};

async function setMedia(ctx, type) {
  const { client, msg, account } = ctx;
  const label = type === "photo" ? "gambar" : "video";
  const rm = await msg.getReplyMessage().catch(() => null);
  if (!rm || !(type === "photo" ? isPhoto(rm) : isVideo(rm))) {
    return edit(ctx, `\u26A0\uFE0F Balas (reply) ${label} yang mahu dipaparkan dalam .help dengan .set${type}`);
  }
  const size = (rm.file && rm.file.size) || 0;
  if (size > HM.MAX_BYTES) return edit(ctx, `\u26A0\uFE0F Fail terlalu besar (maksimum ${mb(HM.MAX_BYTES)}).`);

  await edit(ctx, `\u23F3 Memuat turun ${label}...`);
  let buf;
  try {
    buf = await client.downloadMedia(rm, {});
  } catch (err) {
    return edit(ctx, `\u26A0\uFE0F Gagal memuat turun: ${err.message}`);
  }
  if (!buf || !buf.length) return edit(ctx, "\u26A0\uFE0F Gagal memuat turun media itu.");
  if (buf.length > HM.MAX_BYTES) return edit(ctx, `\u26A0\uFE0F Fail terlalu besar (maksimum ${mb(HM.MAX_BYTES)}).`);

  const ext = (rm.file && rm.file.ext) || (type === "photo" ? ".jpg" : ".mp4");
  const rel = path.join("data", "helpmedia", String(account.userId), `${type}${ext}`);
  const full = path.join(__dirname, "..", rel);
  HM.removeFiles(account.userId, type); // buang fail lama (mungkin ext berbeza)
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, buf);

  // muat naik ke bot kawalan -> file_id (muncul sebagai mesej dalam chat bot anda)
  let up = null;
  let upErr = "";
  try {
    up = await HM.uploadToBot(account.userId, type, full, `Media .help disimpan (${label})`);
  } catch (err) {
    upErr = err.message;
    console.error("[helpmedia] muat naik ke bot gagal:", err.message);
  }
  const fileId = up && up.id;
  HM.put(account.userId, type, { file: rel, file_id: fileId || null, kind: up ? up.kind : null, size: buf.length, at: Date.now() });
  HM.setMode(HM.getMode()); // tetapkan semula status belajar

  const m = HM.get(account.userId);
  await show(ctx, card({
    title: `${type === "photo" ? "Gambar" : "Video"} Help Disimpan`, icon: "ok",
    rows: [
      ["tag", "Jenis", label],
      ["box", "Saiz", esc(mb(buf.length))],
      [fileId ? "ok" : "fire", "Bot kawalan", fileId ? "file_id diterima" : `gagal (${esc(upErr.slice(0, 60))})`],
      ["gear", "Paparan", esc(modeText(account.userId))],
      ["chart", "Media aktif", `${m.photo ? "gambar" : "-"} / ${m.video ? "video" : "-"}`],
      ["star", "Bentuk dalam .help", m.photo && m.video ? "slideshow (gambar + video, carousel)" : "satu media dalam menu"],
    ],
    checks: fileId ? [[true, "Sedia dipasang dalam .help"]] : [[false, "Muat naik ke bot gagal: tekan /start pada bot kawalan lalu ulang"]],
    footer: footerOf(account),
  }));
}

async function delMedia(ctx, type) {
  const { account } = ctx;
  if (!HM.get(account.userId)[type]) return edit(ctx, `Tiada ${type === "photo" ? "gambar" : "video"} help yang disimpan.`);
  HM.removeFiles(account.userId, type);
  HM.put(account.userId, type, null);
  await show(ctx, card({
    title: `${type === "photo" ? "Gambar" : "Video"} Help Dibuang`, icon: "ok",
    rows: [["chart", "Media aktif", `${HM.get(account.userId).photo ? "gambar" : "-"} / ${HM.get(account.userId).video ? "video" : "-"}`]],
    footer: footerOf(account),
  }));
}

async function helpMedia(ctx) {
  const { args, account } = ctx;
  const a = String(args[0] || "").toLowerCase();
  if (a) {
    if (!["auto", "embed", "separate", "off"].includes(a)) return edit(ctx, "Guna: .helpmedia [auto|embed|separate|off]\nauto = cuba dalam mesej Rich, jika ditolak hantar mesej biasa\nembed = paksa dalam mesej Rich\nseparate = sentiasa mesej biasa sebelum menu\noff = jangan paparkan media");
    HM.setMode(a);
  }
  const m = HM.get(account.userId);
  const row = (it) => (it ? `${esc(mb(it.size || 0))}${it.file_id ? "" : " (tiada file_id)"}` : "-");
  await show(ctx, card({
    title: "Media Help", icon: "gear",
    rows: [
      ["box", "Gambar", row(m.photo)],
      ["box", "Video", row(m.video)],
      ["gear", "Mod", esc(HM.getMode())],
      ["chart", "Paparan", esc(modeText(account.userId))],
      ["link", "Root", HM.rootOf(account.userId) ? `@${esc(HM.rootOf(account.userId))}` : "(lalai: bot kawalan)"],
    ],
    footer: footerOf(account),
  }));
}

async function setRoot(ctx) {
  const { args, account } = ctx;
  const a = String(args[0] || "");
  if (!a) {
    const cur = HM.rootOf(account.userId);
    return edit(ctx, `Root semasa: ${cur ? "@" + cur : "(lalai: bot kawalan)"}\nGuna: .setroot @username  |  .setroot reset`);
  }
  if (/^(reset|off|del|padam)$/i.test(a)) {
    HM.setRoot(account.userId, null);
    return show(ctx, card({ title: "Root Dikembalikan", icon: "ok", rows: [["link", "Rich render via", "bot kawalan (lalai)"]], footer: footerOf(account) }));
  }
  const name = HM.parseRoot(a);
  if (!name) return edit(ctx, "\u26A0\uFE0F Username tidak sah. Contoh: .setroot @artapediaubot  (5-32 aksara, huruf/nombor/_)");
  HM.setRoot(account.userId, name);
  await show(ctx, card({
    title: "Root Ditetapkan", icon: "ok",
    rows: [["link", "Rich render via", `<a href="https://t.me/${esc(name)}">@${esc(name)}</a>`]],
    checks: [[true, "Dipaparkan dalam menu .help"]],
    footer: footerOf(account),
  }));
}

module.exports = {
  name: "hmedia",
  category: "Umum",
  help: [
    { cmd: "setphoto", alias: [], desc: "balas gambar: paparkan dalam menu .help" },
    { cmd: "setvideo", alias: [], desc: "balas video: paparkan dalam menu .help" },
    { cmd: "delphoto", alias: [], desc: "buang gambar menu .help" },
    { cmd: "delvideo", alias: [], desc: "buang video menu .help" },
    { cmd: "helpmedia", alias: [], desc: "status media help; mod auto|embed|separate|off" },
    { cmd: "setroot", alias: [], desc: "tukar 'Rich render via' dalam .help: .setroot @artapediaubot | reset" },
  ],
  commands: {
    setphoto: (ctx) => setMedia(ctx, "photo"),
    setvideo: (ctx) => setMedia(ctx, "video"),
    delphoto: (ctx) => delMedia(ctx, "photo"),
    delvideo: (ctx) => delMedia(ctx, "video"),
    helpmedia: helpMedia,
    setroot: setRoot,
  },
};

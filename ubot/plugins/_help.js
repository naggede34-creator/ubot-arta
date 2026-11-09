// Plugin sistem (nama bermula "_" = tidak dikira dalam bilangan Modules di /start)
const crypto = require("crypto");
const { shared, tg, esc, em, stripCustom, btn } = require("../core");
const access = require("../access");
const expiry = require("../expiry");
const HM = require("../helpmedia");
const PK = require("../paket");
const { sendViaInlineAny, notifyAnswered, getReason } = require("../inline");
const JG = require("../jogjamenu");
const CP = require("../lib/caraPakai");

const CATEGORIES = ["Umum", "AI & Media", "MENU SHARE AUTO PROMOSI", "Utilitas", "Matematik & Konversi", "Teks & Font", "Generator", "Rich & Format", "Web & Info", "Islam & Malaysia", "Catatan & Tugas", "Broadcast & Alias", "Group Management", "Hiburan", "Sistem", "Owner & Reseller", "WhatsApp", "VPS & Panel"];

// ===== Emoji premium =====
// Banner tajuk (setiap ID ialah satu jubin gambar; susunan kiri -> kanan). Tukar susunan di sini jika gambar bersepah.
const BANNER_TOP = [
  "5240083327750268488", "5242669473588081034", "5242299247407163349", "5242413308853641575",
  "5242685510995962813", "5242609313981164111", "5242711091821176312", "5242527847041492303",
];
const BANNER_BOTTOM = [
  "5242536587299940498", "5242516117485807157", "5240071550949946682", "5242675353398305338",
  "5242276913577224388", "5242631596271495297", "5240055912974019894", "5242416276676043618",
];
// Hiasan paling atas (di atas gambar/video): "ornamen  x  ornamen" = 4 jubin kiri + teks tengah + 4 jubin kanan.
// Tukar susunan ID jika gambar kelihatan bersepah; tukar ORN_MID untuk teks di tengah.
const ORN_TOP_L = ["5242444717949477648", "5242607561634507097", "5242678677702995604", "5242334668002451321"];
const ORN_TOP_R = ["5240288725971265493", "5242487835126164504", "5240498852951254519", "5240301662412761004"];
const ORN_MID = "x";
// Baris hiasan (mis. kereta) di hujung menu: isi senarai ID jubin di sini jika mahu, kosong = tiada.
const LINE_TILES = [];
const I = {
  bolt3: "5377585120888763078",
  crown: "6273839444311149115",
  akun: "5258362837411045098",
  check: "6005561111099740638",
  expired: "5352940967911517739",
  paket: "5258134813302332906",
  gem: "6276228098962754124",
  prefix: "5397782960512444700",
  cmd: "5231200819986047254",
  link: "5271604874419647061",
  bolt: "5215203703190989803",
};
// Ikon bagi setiap kategori [ID, emoji biasa]
const CAT_ICON = {
  "Umum": ["5402498632739996967", "\uD83D\uDC4B"],
  "AI & Media": ["5260721826723549165", "\uD83E\uDD16"],
  "Utilitas": ["5368589393491669392", "\u2699\uFE0F"],
  "Broadcast & Alias": ["5411503950799060151", "\uD83D\uDD08"],
  "MENU SHARE AUTO PROMOSI": ["6098421155897545579", "\uD83D\uDCE2"],
  "Group Management": ["6320831596324721328", "\u2B50"],
  "WhatsApp": ["5215203703190989803", "\u26A1"],
  "Catatan & Tugas": ["5296348778012361146", "\uD83C\uDFF7"],
  "Hiburan": ["5456140674028019486", "\u26A1"],
  "Owner & Reseller": ["6273839444311149115", "\uD83D\uDC51"],
  "Matematik & Konversi": ["5368589393491669392", "\uD83D\uDCCA"],
  "Teks & Font": ["5296348778012361146", "\uD83C\uDFF7"],
  "Generator": ["5215203703190989803", "\u26A1"],
  "Rich & Format": ["6276228098962754124", "\uD83D\uDC8E"],
  "Web & Info": ["5271604874419647061", "\uD83D\uDD17"],
  "Islam & Malaysia": ["6320831596324721328", "\u2B50"],
  "Sistem": ["5231200819986047254", "\u2699\uFE0F"],
  "VPS & Panel": ["5467538555158943525", "\u2601\uFE0F"],
};
const NB = "\u00a0";
const tiles = (ids) => ids.map((id) => em(id, "\uD83E\uDE84")).join("");
const catIcon = (name) => (CAT_ICON[name] ? em(CAT_ICON[name][0], CAT_ICON[name][1]) : "");

// Kumpul command daripada semua plugin (plugin isi: category + help[])  -> kategori asal
function collectRaw() {
  const map = new Map(CATEGORIES.map((c) => [c, []]));
  for (const p of shared.plugins || []) {
    if (!p.category || !Array.isArray(p.help)) continue;
    if (!map.has(p.category)) map.set(p.category, []);
    map.get(p.category).push(...p.help);
  }
  return map;
}
// v1.6: setiap kategori tampil sebagai dropdown sendiri (ikon + nama + jumlah), tidak lagi digabung.
// Kategori baru dari plugin otomatis muncul sebagai dropdown tersendiri setelah kategori bawaan.
function collect(raw = collectRaw()) {
  const out = new Map();
  for (const [name, list] of raw) {
    if (!list.length) continue;
    out.set(name, Object.assign([...list], { subs: [[name, list]] }));
  }
  return out;
}

function who(entry) {
  const uname = entry.username;
  return uname ? `@${esc(uname)}` : esc(entry.name || "-");
}


// ===== Tampilan "tombol kategori" (seperti contoh): kartu info + TENTANG USERBOT + grid tombol kategori + Prev / Home / Next =====
// Aktif untuk .help tanpa argumen dan tombol Preview. .help <kategori|command> tetap memakai tampilan detail.
// Matikan: config.json "help_buttons": false (kembali ke dropdown).
const PAGE = 8;
const prefixFor = (entry) => ((shared.db && shared.db.getUser(entry.userId)) || {}).prefix || shared.cfg.prefix || ".";
const buttonsOn = () => shared.cfg.help_buttons !== false;
const brandName = () => String(shared.cfg.brand || "UBOT ARTA PEDIA").toUpperCase();
const brandShort = () => brandName().replace(/^UBOT\s+/, "");
const handleOf = () => String(shared.cfg.official_handle || "artapediaubot").replace(/^@/, "");
function catList() {
  return [...collect()].filter(([, l]) => l.length).map(([name, list]) => ({ name, list }));
}
const pagesOf = (n) => Math.max(1, Math.ceil(n / PAGE));
const wrapPage = (p, n) => ((p % pagesOf(n)) + pagesOf(n)) % pagesOf(n);

// Keyboard utama (rich button): MENU SHARE AUTO PROMOSI paling atas -> CARA PAKAI -> 8 kategori per halaman (2 per baris) -> Prev / Home / Next
const SHARE = "MENU SHARE AUTO PROMOSI";
const gridList = () => catList().map((c, i) => ({ ...c, idx: i })).filter((c) => c.name !== SHARE);
function helpKb(page = 0) {
  const gl = gridList();
  const pg = wrapPage(page, gl.length);
  return (fancy) => {
    const rows = [];
    const all = catList();
    const si = all.findIndex((c) => c.name === SHARE);
    if (si >= 0) rows.push([btn(fancy, SHARE, `hl:c:${si}`, "success", CAT_ICON[SHARE] ? CAT_ICON[SHARE][0] : undefined)]);
    rows.push([btn(fancy, "CARA PAKAI", "hl:u:0", "primary", I.cmd)]);
    const slice = gl.slice(pg * PAGE, (pg + 1) * PAGE);
    for (const c of slice) {
      const ico = CAT_ICON[c.name];
      rows.push([btn(fancy, c.name, `hl:c:${c.idx}`, undefined, ico ? ico[0] : undefined)]); // 1 tombol per baris, tersusun ke bawah
    }
    rows.push([btn(fancy, "\u25C0\uFE0F Prev", `hl:p:${pg - 1}`), btn(fancy, "\uD83C\uDFE0", `hl:h:${pg}`), btn(fancy, "Next \u25B6\uFE0F", `hl:p:${pg + 1}`)]);
    return rows;
  };
}
// CARA PAKAI: Prev / Menu / Next antar halaman panduan
function guideKb(n) {
  const total = CP.count(guideDeps(null));
  const prev = (n - 1 + total) % total, next = (n + 1) % total;
  return (fancy) => [
    [btn(fancy, "\u25C0\uFE0F Prev", `hl:u:${prev}`, "primary"), btn(fancy, "\uD83C\uDFE0 Menu", "hl:h:0", "danger"), btn(fancy, "Next \u25B6\uFE0F", `hl:u:${next}`, "primary")],
  ];
}
function guideDeps(entry) {
  const prefix = entry ? prefixFor(entry) : "";
  return { cats: collect(), prefix, tidyDesc, aliasOf, catIcon, firstWord };
}
// Keyboard di dalam satu kategori: kategori sebelumnya / kembali ke menu / berikutnya
function catKb(idx) {
  const n = catList().length;
  const prev = (idx - 1 + n) % n, next = (idx + 1) % n;
  const gpos = gridList().findIndex((c) => c.idx === idx); // MENU SHARE (di atas grid) -> halaman 0
  const pg = gpos < 0 ? 0 : Math.floor(gpos / PAGE);
  return (fancy) => [[btn(fancy, "\u25C0\uFE0F Prev", `hl:c:${prev}`, "primary"), btn(fancy, "\uD83C\uDFE0 Menu", `hl:h:${pg}`, "danger"), btn(fancy, "Next \u25B6\uFE0F", `hl:c:${next}`, "primary")]];
}
function categoryHtml(entry, idx, strip) {
  const cs = catList();
  const c = cs[idx];
  if (!c) return null;
  const prefix = prefixFor(entry);
  const cats = collect();
  const body = viewRichBasic(cats, { mode: "cat", name: c.name, list: c.list }, prefix);
  const lockNote = PK.counts(entry.userId).locked ? `<p>${PK.LOCK} = terkunci (perlu paket lebih tinggi)</p>` : "";
  const html = `${body}${lockNote}<p>\u21B3 <code>${esc(prefix)}help ${esc(firstWord(c.name))}</code> \u00B7 <code>${esc(prefix)}help &lt;command&gt;</code> untuk butiran</p><footer>${footerText(entry)}</footer>`;
  return strip ? stripCustom(html) : html;
}
function categoryText(entry, idx) {
  const c = catList()[idx];
  if (!c) return "";
  const prefix = prefixFor(entry);
  return `<b>${esc(c.name)} (${c.list.length})</b>\n\n` + c.list.map((h) => `<code>${esc(prefix + h.cmd)}</code> \u2014 ${esc(String(h.desc || "").split(/\n/)[0].slice(0, 80))}`).join("\n");
}
const footerText = (entry) => require("../ui").customFooter(entry) || `${em(I.crown, "\uD83D\uDC51")} UBOT BY ${esc(brandShort())} OFFICIAL @${esc(handleOf())} ${em(I.check, "\u2705")}`;

// ===== Paparan: ringkasan kategori | satu kategori | satu command =====
const norm = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const firstWord = (n) => norm(n.split(/[ &]+/)[0]);
function resolveView(cats, arg, raw) {
  const a = norm(arg);
  if (!a) return { mode: "overview" };
  const pick = (m) => {
    const names = [...m.keys()];
    return names.find((n) => norm(n) === a) || names.find((n) => firstWord(n) === a) || names.find((n) => norm(n).startsWith(a)) || (a.length >= 4 ? names.find((n) => norm(n).includes(a)) : undefined);
  };
  const cat = pick(cats);
  if (cat) return { mode: "cat", name: cat, list: cats.get(cat) };
  const rcat = raw && pick(raw); // contoh .help teks / .help cuaca -> kategori asal
  if (rcat) return { mode: "cat", name: rcat, list: raw.get(rcat), raw: true };
  for (const [name, list] of raw || cats) {
    const h = list.find((x) => norm(x.cmd) === a || (x.alias || []).some((al) => norm(al) === a));
    if (h) return { mode: "cmd", name, h };
  }
  return { mode: "none", arg };
}
// Merapikan deskripsi command untuk tampilan: huruf awal besar, ejaan Indonesia, cara pakai dipisah baris sendiri
const MAP = [[/\bguna\b/gi, "gunakan"], [/\bhantar\b/gi, "kirim"], [/\bkad\b/gi, "kartu"], [/\bcarian\b/gi, "pencarian"], [/\bpratonton\b/gi, "pratinjau"], [/\bsenarai\b/gi, "daftar"], [/\bmenukar\b/gi, "mengganti"], [/\btiada\b/gi, "tidak ada"], [/\bmaklumat\b/gi, "informasi"], [/\bpelayan\b/gi, "server"], [/\btetapan\b/gi, "pengaturan"], [/\bpengguna\b/gi, "pengguna"], [/\bfail\b/gi, "file"], [/\bsaat\b/gi, "detik"]];
function tidyDesc(raw) {
  let d = String(raw || "").replace(/\s+/g, " ").trim();
  if (!d) return "-";
  for (const [re, to] of MAP) d = d.replace(re, to);
  let use = "";
  const m = d.match(/^(.*?)\s*[:\u2013-]\s*(\.\S.*)$/) || d.match(/^(.*?)\s*\((\.\S[^)]*)\)\s*$/);
  if (m && m[1]) { d = m[1]; use = m[2]; }
  d = d.replace(/[.:;,\s]+$/, "");
  d = d.charAt(0).toUpperCase() + d.slice(1);
  return esc(d) + (use ? `<br><code>${esc(use)}</code>` : "");
}
const aliasOf = (prefix, h) => ((h.alias || []).length ? ` (${h.alias.map((x) => esc(prefix + x)).join(", ")})` : "");

// Tahap paparan Rich, dari paling kaya ke paling ringan. Jika Telegram menolak satu tahap
// (contoh: mesej terlalu besar), tahap seterusnya dicuba secara automatik supaya .help sentiasa keluar.
// v1.4: .help dipendekkan. Lalai = banner + dropdown yang HANYA menyenaraikan nama command; penerangan penuh
// hanya dipaparkan bila membuka satu kategori (.help <kategori>) atau satu command (.help <command>).
const LEVELS = [
  { id: "rich", level: "compact", simple: false, hr: true }, // banner + garis + dropdown nama command (seperti contoh)
  { id: "rich-compact", level: "overview", simple: false, hr: true }, // banner + garis + jadual ringkasan kategori
  { id: "rich-simple", level: "compact", simple: true, hr: false }, // dropdown nama command, tajuk ringkas (kurang emoji)
  { id: "rich-overview", level: "overview", simple: true, hr: false }, // jadual ringkasan kategori (tanpa dropdown)
];
// id berakhir "-m" = tahap itu dengan media (gambar/video) dipasang dalam mesej Rich sebagai slideshow;
// "-ms" = media disusun sebagai blok berasingan (jatuh balik jika Telegram menolak video dalam slideshow).
const MEDIA_IDS = ["rich-m", "rich-compact-m", "rich-ms", "rich-compact-ms"];
const levelOf = (id) => {
  // bentuk id: <tahap>[-m|-ms][-s]   (-m/-ms = media foto/video, -s = audio lagu tertanam)
  const m = String(id).match(/^(rich-compact|rich-simple|rich-overview|rich)(?:-(ms?))?(?:-(s))?$/);
  const base = LEVELS.find((l) => l.id === (m ? m[1] : "rich")) || LEVELS[0];
  return { ...base, media: !!(m && m[2]), mstyle: m && m[2] === "ms" ? "stack" : "slide", song: !!(m && m[3]) };
};
const MEDIA_LEVELS = LEVELS.slice(0, 2); // media hanya dicuba pada dua tahap teratas
// Senarai percubaan: dengan media dahulu (jika ada & dibenarkan), kemudian tanpa media
function attemptsFor(entry) {
  const out = [];
  if (HM.embedWanted(entry.userId)) {
    const both = HM.itemCount(entry.userId) > 1;
    const mk = (l, st) => ({ ...l, id: `${l.id}-${st === "stack" ? "ms" : "m"}`, media: true, mstyle: st });
    if (both && HM.getStyle() === "stack") out.push(mk(LEVELS[0], "stack"), mk(LEVELS[1], "stack"));
    else {
      out.push(mk(LEVELS[0], "slide"), mk(LEVELS[1], "slide"));
      if (both) out.push(mk(LEVELS[1], "stack")); // gambar + video: cuba juga tanpa slideshow
    }
  }
  out.push(...LEVELS.map((l) => ({ ...l, media: false })));
  if (!JG.ready()) return out;
  // percobaan dengan audio lagu tertanam di kartu (lebih dulu); jika Telegram menolak, turun ke percobaan lama
  const withSong = [...out.filter((a) => a.media).map((a) => ({ ...a, id: a.id + "-s", song: true })), ...LEVELS.slice(0, 2).map((l) => ({ ...l, id: l.id + "-s", media: false, song: true }))];
  return [...withSong, ...out];
}
// Belajar daripada hasil: jika versi dengan media ditolak tetapi versi sama tanpa media diterima, media punca masalah
const learn = (entry, a, mediaTried) => {
  if (!a.song && JG.ready()) JG.markRejected(); // percobaan beraudio ditolak tapi versi tanpa audio diterima
  if (a.media) {
    HM.markEmbed(true);
    if (a.mstyle === "stack") HM.setStyle("stack"); // slideshow tidak diterima, ingat susunan biasa
    return;
  }
  if (mediaTried && MEDIA_LEVELS.some((l) => l.id === a.id)) HM.markEmbed(false);
};
// InputRichMessage untuk satu percubaan: { html, media? }
function richOf(entry, a, arg, strip) {
  const html = buildHelp(entry, { ...a, arg });
  const media = [...(a.media ? HM.mediaList(entry.userId) : []), ...(a.song ? JG.mediaList() : [])];
  return { html: strip ? stripCustom(html) : html, ...(media.length ? { media } : {}) };
}

// Bahagian boleh dibuka (dropdown) bagi setiap kategori: ikon + nama + (bilangan). Command di luar paket pengguna ditandai kunci.
function dropdowns(cats, prefix, level, openName, uid) {
  const lk = (h) => (PK.isLocked(uid, h.cmd) ? `${PK.LOCK} ` : "");
  return [...cats]
    .filter(([, list]) => list.length)
    .map(([name, list]) => {
      const locked = list.filter((h) => PK.isLocked(uid, h.cmd)).length;
      const lockTag = locked ? ` ${PK.LOCK}${locked === list.length ? "" : locked}` : "";
      const names = `<p>${list.map((h) => `${lk(h)}<code>${esc(prefix + h.cmd)}</code>`).join(" ")}</p>`;
      const multi = list.subs && list.subs.length > 1;
      const subTable = multi
        ? `<table bordered><tr><th>Sub-kategori</th><th>Cmd</th><th>Buka senarai</th></tr>${list.subs
            .map(([sn, sl]) => `<tr><td>${catIcon(sn)} ${esc(sn)}</td><td>${sl.length}</td><td>${esc(prefix)}help ${esc(firstWord(sn))}</td></tr>`)
            .join("")}</table>`
        : "";
      const body =
        level === "compact" && name !== openName
          ? names
          : multi
          ? subTable + names
          : `<table bordered><tr><th>Command</th><th>Fungsi</th></tr>${list
              .map((h) => `<tr><td>${lk(h)}${esc(prefix + h.cmd)}${aliasOf(prefix, h)}</td><td>${tidyDesc(h.desc)}</td></tr>`)
              .join("")}</table>`;
      return `<details${name === openName ? " open" : ""}><summary>${catIcon(name)} ${esc(name)} (${list.length})${lockTag}</summary>${body}</details>`;
    })
    .join("");
}

function viewRich(cats, v, prefix, level = "full", uid) {
  if (!v.raw && level !== "overview" && (v.mode === "overview" || v.mode === "cat")) {
    return dropdowns(cats, prefix, level, v.mode === "cat" ? v.name : "", uid);
  }
  return viewRichBasic(cats, v, prefix);
}

// Versi teks biasa: setiap kategori ialah blockquote expandable (boleh dibuka). Teks Telegram maks 4096 aksara,
// jadi jika terlalu panjang: buang penerangan -> jika masih panjang: senarai kategori sahaja.
function textSections(cats, prefix, uid) {
  const BUDGET = 2900;
  const vis = (x) => x.replace(/<[^>]*>/g, "");
  const lk = (h) => (PK.isLocked(uid, h.cmd) ? `${PK.LOCK} ` : "");
  const make = (withDesc) =>
    [...cats]
      .filter(([, l]) => l.length)
      .map(([n, l]) => {
        const body = withDesc
          ? l.map((h) => `${lk(h)}${prefix + h.cmd}${(h.alias || []).length ? " (" + h.alias.map((a) => prefix + a).join(", ") + ")" : ""} : ${h.desc || ""}`).join("\n")
          : l.map((h) => lk(h) + prefix + h.cmd).join(", ");
        return `${catIcon(n)} <b>${esc(n)} (${l.length})</b>\n<blockquote expandable>${esc(body)}</blockquote>`;
      })
      .join("\n");
  const compact = make(false);
  if (vis(compact).length <= BUDGET) return compact;
  return viewText(cats, { mode: "overview" }, prefix);
}

function viewRichBasic(cats, v, prefix) {
  if (v.mode === "overview") {
    const rows = [...cats]
      .filter(([, l]) => l.length)
      .map(([n, l]) => `<tr><td>${catIcon(n)} ${esc(n)}</td><td>${l.length}</td><td>${esc(prefix)}help ${esc(firstWord(n))}</td></tr>`)
      .join("");
    return `<table bordered><tr><th>Kategori</th><th>Cmd</th><th>Buka senarai</th></tr>${rows}</table>`;
  }
  if (v.mode === "cat") {
    const rows = v.list.map((h) => `<tr><td>${esc(prefix + h.cmd)}${aliasOf(prefix, h)}</td><td>${tidyDesc(h.desc)}</td></tr>`).join("");
    return `<h3>${catIcon(v.name)} ${esc(v.name)} (${v.list.length})</h3><table bordered><tr><th>Command</th><th>Fungsi</th></tr>${rows}</table>`;
  }
  if (v.mode === "cmd") {
    return `<table bordered><tr><th>Command</th><th>Butiran</th></tr><tr><td>Nama</td><td>${esc(prefix + v.h.cmd)}</td></tr><tr><td>Paket minimum</td><td>${PK.minOf(v.h.cmd)}</td></tr><tr><td>Alias</td><td>${(v.h.alias || []).map((x) => esc(prefix + x)).join(", ") || "-"}</td></tr><tr><td>Kategori</td><td>${catIcon(v.name)} ${esc(v.name)}</td></tr><tr><td>Fungsi</td><td>${esc(v.h.desc || "")}</td></tr></table>`;
  }
  return `<p>\u26A0\uFE0F "${esc(v.arg)}" tidak dijumpai. Cuba <code>${esc(prefix)}help</code> untuk senarai kategori.</p>`;
}
function viewText(cats, v, prefix, uid) {
  if (v.mode === "overview") {
    return [...cats].filter(([, l]) => l.length).map(([n, l]) => `${catIcon(n)} <b>${esc(n)}</b> (${l.length}) \u2192 <code>${esc(prefix)}help ${esc(firstWord(n))}</code>`).join("\n");
  }
  if (v.mode === "cat") {
    const lines = v.list.map((h) => `${PK.isLocked(uid, h.cmd) ? PK.LOCK + " " : ""}<code>${esc(prefix + h.cmd)}</code>${aliasOf(prefix, h)} : ${esc(h.desc || "")}`).join("\n");
    return `${catIcon(v.name)} <b>${esc(v.name)} (${v.list.length})</b>\n<blockquote expandable>${lines}</blockquote>`;
  }
  if (v.mode === "cmd") {
    return `<code>${esc(prefix + v.h.cmd)}</code>${aliasOf(prefix, v.h)}\n${catIcon(v.name)} ${esc(v.name)} \u00B7 paket ${PK.minOf(v.h.cmd)}\n${esc(v.h.desc || "")}`;
  }
  return `\u26A0\uFE0F "${esc(v.arg)}" tidak dijumpai. Guna <code>${esc(prefix)}help</code>.`;
}

// entry = { userId, username, name }
// simple = tanpa banner/blockquote (jatuh balik jika Telegram menolak versi penuh)
function buildHelp(entry, { hr = true, simple = false, arg = "", level = "full", media = false, mstyle = "slide", song = false } = {}) {
  const prefix = prefixFor(entry);
  const raw = collectRaw();
  const cats = collect(raw);
  const total = [...cats.values()].reduce((n, a) => n + a.length, 0);

  const uname = entry.username;
  const staff = access.roleOf(entry.userId) !== "pelanggan";
  const akun =
    (uname ? `<a href="https://t.me/${esc(uname)}">@${esc(uname)}</a>` : esc(entry.name || "-")) +
    (staff ? ` ${em(I.check, "\u2611\uFE0F")}` : "");

  const rec = shared.db ? shared.db.getUser(entry.userId) || {} : {};
  const cnt = PK.counts(entry.userId);
  const paketCell = PK.badge(PK.tierOf(entry.userId)); // ikon premium ikut paket
  const cmdCell = `${cnt.open} aktif${cnt.locked ? ` \u00B7 ${cnt.locked} ${PK.LOCK}` : ""}`;

  const mediaHtml = media ? HM.embedHtml(entry.userId, mstyle) : "";
  const title = `${em(I.crown, "\uD83D\uDC51")} <i>${esc(brandShort())} UBOT</i> ${em(I.crown, "\uD83D\uDC51")}`;
  // Dengan media: hiasan atas -> gambar/video -> tajuk + hiasan bawah (seperti contoh)
  // Susunan (seperti contoh): ornamen "x" -> gambar/video -> [ornamen sayap, tajuk, ornamen daun]
  const topOrn = `<blockquote>${tiles(ORN_TOP_L)} <i>${esc(ORN_MID)}</i> ${tiles(ORN_TOP_R)}</blockquote>`;
  const titleBox = `<blockquote>${tiles(BANNER_TOP)}<br>${NB}${NB}${title}<br>${tiles(BANNER_BOTTOM)}</blockquote>`;
  const header = simple
    ? `<h3>${em(I.crown, "\uD83D\uDC51")} ${esc(brandName())} ${em(I.crown, "\uD83D\uDC51")}</h3>${mediaHtml}`
    : `${topOrn}${mediaHtml}${titleBox}`;

  const info =
    `<table bordered>` +
    `<tr><th>Info</th><th>Nilai</th></tr>` +
    `<tr><td>${em(I.akun, "\uD83D\uDC64")} Akun</td><td>${akun}</td></tr>` +
    `<tr><td>${em(I.expired, "\u23F3")} Expired</td><td>${esc(expiry.label(entry.userId))}</td></tr>` +
    `<tr><td>${em(I.paket, "\uD83D\uDCE6")} Paket</td><td>${paketCell}</td></tr>` +
    `<tr><td>${em(I.prefix, "\uD83D\uDCCC")} Prefix</td><td>${esc(prefix)}</td></tr>` +
    `<tr><td>${em(I.cmd, "\uD83D\uDCCA")} Command</td><td>${cmdCell}</td></tr>` +
    `</table>`;

  const bot = HM.rootOf(entry.userId) || shared.botUsername; // .setroot menukar nama ini
  const checks =
    `<ul>` +
    `<li><input type="checkbox" checked>${em(I.link, "\uD83D\uDD17")} Rich render via ${
      bot ? `<a href="https://t.me/${esc(bot)}">@${esc(bot)}</a>` : "bot"
    }</li>` +
    `<li><input type="checkbox" checked>${em(I.bolt3, "\u26A1")} Premium reply</li>` +
    `</ul>`;

  // Mode tombol (seperti foto): kartu info + TENTANG USERBOT; daftar kategori ada di tombol di bawah pesan
  if (!arg && buttonsOn()) {
    return (
      header +
      info +
      checks +
      (song ? JG.html() : "") +
      `<hr>` +
      `<details open><summary>${em(I.crown, "\uD83D\uDC51")} TENTANG USERBOT</summary><p>Userbot by ${akun}</p></details>` +
      `<footer>${footerText(entry)}</footer>`
    );
  }

  const sections = viewRich(cats, resolveView(cats, arg, raw), prefix, level, entry.userId);
  const dev = (String(shared.cfg.developer_url || "").match(/t\.me\/([A-Za-z0-9_]{4,32})/) || [])[1];
  const buy = dev && !/username_awak/i.test(dev) ? ` [ Buy Pv @${esc(dev)} ]` : "";

  return (
    header +
    info +
    checks +
    (song ? JG.html() : "") +
    (hr ? `<hr>` : "") +
    sections +
    `<p>\u21B3 Ketik <code>${esc(prefix)}</code> untuk menjalankan<br>` +
    `\u21B3 <code>${esc(prefix)}id</code> untuk cek id chat/user<br>` +
    `\u21B3 <code>${esc(prefix)}help &lt;kategori|command&gt;</code> untuk butiran</p>` +
    (LINE_TILES.length ? `<p>${tiles(LINE_TILES)}</p>` : "") +
    `<footer>${require("../ui").customFooter(entry) || `Userbot By ${who(entry)}${buy}`}</footer>`
  );
}

// Versi teks biasa (tanpa jadual): bahagian boleh dibuka guna blockquote expandable
function buildHelpText(entry, note, arg = "") {
  const prefix = prefixFor(entry);
  const raw = collectRaw();
  const cats = collect(raw);
  const total = [...cats.values()].reduce((n, a) => n + a.length, 0);
  const rec = shared.db ? shared.db.getUser(entry.userId) || {} : {};
  const paket = access.isOwner(entry.userId) ? "OWNER" : rec.paket || "-";
  const rootName = HM.rootOf(entry.userId) || shared.botUsername;
  const bot = rootName ? `@${esc(rootName)}` : "bot";
  const w = who(entry);

  const head =
    `<blockquote>${em(I.crown, "\uD83D\uDC51")} <i>USERBOT MENU</i> ${em(I.crown, "\uD83D\uDC51")}</blockquote>\n` +
    `${em(I.akun, "\uD83D\uDC64")} Akun : <b>${w}</b>\n` +
    `${em(I.expired, "\u23F3")} Expired : <b>${esc(expiry.label(entry.userId))}</b>\n` +
    `${em(I.paket, "\uD83D\uDCE6")} Paket : <b>${PK.badge(PK.tierOf(entry.userId))}</b>\n` +
    `${em(I.prefix, "\uD83D\uDCCC")} Prefix : <b>${esc(prefix)}</b>\n` +
    `${em(I.cmd, "\uD83D\uDCCA")} Command : <b>${PK.counts(entry.userId).open} aktif</b>\n\n` +
    `\u2611 ${em(I.link, "\uD83D\uDD17")} Rich render via ${bot}\n\n`;

  const v = resolveView(cats, arg, raw);
  const sections = v.mode === "overview" ? textSections(cats, prefix, entry.userId) : viewText(cats, v, prefix, entry.userId);

  return (
    head +
    sections +
    `\n\n<code>${esc(prefix)}help &lt;kategori|command&gt;</code> untuk butiran.\n\n` +
    `<i>${require("../ui").customFooter(entry) || `Userbot by ${w}`}</i>` +
    (note ? `\n\n<i>\u26A0\uFE0F Mod teks (panel Rich gagal): ${esc(String(note).slice(0, 160))}</i>` : "")
  );
}

// Butang kecil: diperlukan supaya Telegram memberi "inline_message_id" (untuk bot mengedit mesej
// dan memasang emoji premium). Selepas diedit, butang ini dibuang.
const goKb = (nonce) => ({ inline_keyboard: [[{ text: "\uD83D\uDD04 Muat semula", callback_data: "hl:go:" + (nonce || "0") }]] });
// nonce -> hujah (.help <kategori|command>); dibuang selepas 30 minit
const ARGS = new Map();
const rememberArg = (nonce, arg) => {
  ARGS.set(nonce, { arg, t: Date.now() });
  for (const [k, v] of ARGS) if (Date.now() - v.t > 1800000) ARGS.delete(k);
};
const argOf = (nonce) => (ARGS.get(nonce) || {}).arg || "";
const nonceOfQuery = (q) => String(q || "").trim().split(" ")[1] || "0";

// Hasil inline PERTAMA tidak mengandungi emoji premium (tidak dibenarkan); bot mengeditnya kemudian.
// Rantaian: (dengan media: slideshow penuh -> slideshow ringkas -> disusun) -> rich -> rich-compact -> rich-simple -> rich-overview -> text
async function answerHelp(ctx, entry, asText, key, nonce) {
  const arg = argOf(nonce);
  const base = { inline_query_id: ctx.inlineQuery.id, cache_time: 0, is_personal: true };
  const attempts = asText ? [{ id: "text" }] : [...attemptsFor(entry), { id: "text" }];
  const mediaTried = attempts.some((a) => a.media);
  let lastErr = asText ? getReason(key) || "" : "";
  let mediaErr = "";

  for (const a of attempts) {
    const content =
      a.id === "text"
        ? { message_text: stripCustom(buildHelpText(entry, lastErr, arg)), parse_mode: "HTML", link_preview_options: { is_disabled: true } }
        : { rich_message: richOf(entry, a, arg, true) };
    const resultId = `help-${a.id}`;
    try {
      await tg("answerInlineQuery", {
        ...base,
        results: [
          { type: "article", id: resultId, title: "Help", description: "Menu userbot", input_message_content: content, reply_markup: goKb(nonce) },
        ],
      });
      console.log(`[inline help] dijawab (${a.id}) untuk akaun ${ctx.from.id}`);
      if (a.id !== "text") learn(entry, a, mediaTried);
      // media dipasang dalam mesej? jika tidak, arahan .help akan menghantarnya sebagai mesej biasa
      if (HM.hasAny(entry.userId)) {
        HM.noteOutcome(nonce, { embedded: !!a.media, reason: mediaErr });
        if (mediaTried && !a.media) console.error(`[help] media tidak dapat dipasang dalam mesej Rich (${mediaErr || "ditolak"}). Media akan dihantar sebagai mesej biasa.`);
      }
      notifyAnswered(key, { queryId: ctx.inlineQuery.id, resultId, kind: a.id });
      return;
    } catch (err) {
      lastErr = err.message;
      if (a.media) mediaErr = err.message;
      console.error(`[inline help] jawapan "${a.id}" ditolak Telegram:`, err.message);
    }
  }
  notifyAnswered(key, { error: `Telegram menolak jawapan: ${lastErr}` });
}

// Bot mengedit mesej inline yang sudah dihantar supaya emoji premium muncul
// (berfungsi jika pemilik bot ada Telegram Premium; semua orang nampak, tak kira Premium atau tidak).
// Bermula daripada tahap yang dipilih, dan turun ke tahap lebih ringan jika Telegram menolak suntingan.
async function applyPremium(inlineId, accountId, resultId, nonce) {
  const arg = argOf(nonce);
  const entry = shared.manager && shared.manager.getByAccount(accountId);
  if (!entry) return false;
  const useMedia = HM.embedWanted(entry.userId);
  const base = [...(useMedia ? MEDIA_IDS : []), ...LEVELS.map((l) => l.id)];
  const songIds = JG.ready() ? [...(useMedia ? MEDIA_IDS : []).map((x) => x + "-s"), ...LEVELS.slice(0, 2).map((l) => l.id + "-s")] : [];
  const ids = [...songIds, ...base, "text"].map((x) => `help-${x}`);
  const start = resultId && ids.includes(resultId) ? ids.indexOf(resultId) : 0;
  const order = resultId === "help-text" ? ["help-text"] : ids.slice(start);
  const withKb = !arg && buttonsOn();
  for (const rid of order) {
    for (const fancy of withKb ? [true, false] : [false]) {
      try {
        await tg("editMessageText", {
          inline_message_id: inlineId,
          ...(rid === "help-text"
            ? { text: buildHelpText(entry, "", arg), parse_mode: "HTML", link_preview_options: { is_disabled: true } }
            : { rich_message: richOf(entry, levelOf(rid.replace(/^help-/, "")), arg, false) }),
          reply_markup: { inline_keyboard: withKb ? helpKb(0)(fancy) : [] },
        });
        console.log(`[help] emoji premium dipasang (${rid}) untuk akaun ${accountId}`);
        return true;
      } catch (err) {
        if (/not modified/i.test(err.message)) return true;
        console.error(`[help] edit emoji premium (${rid}${fancy ? ", tombol premium" : ""}) gagal:`, err.message);
      }
    }
  }
  return false;
}

// bot.js memanggil p.registerBot(bot, shared): argumen ke-2 adalah shared, BUKAN navOnly (bug lama: navOnly = shared -> handler inline help tidak pernah terpasang)
function registerBot(bot, _shared, navOnly = false) {
  if (!navOnly) bot.on("inline_query", async (ctx, next) => {
    const q = ctx.inlineQuery.query.trim();
    const m = q.match(/^(help|helptxt)(?: \w+)?$/);
    if (!m) return next();

    console.log(`[inline help] query "${q}" daripada ${ctx.from.id}`);
    const entry = shared.manager && shared.manager.getByAccount(ctx.from.id);
    if (!entry) {
      console.error(`[inline help] akaun ${ctx.from.id} tiada userbot yang hidup`);
      notifyAnswered(q, { error: "Akaun ini tiada userbot yang hidup" });
      return tg("answerInlineQuery", { inline_query_id: ctx.inlineQuery.id, cache_time: 0, is_personal: true, results: [] }).catch(() => {});
    }
    await answerHelp(ctx, entry, m[1] === "helptxt", q, nonceOfQuery(q));
  });

  // Diterima apabila hasil inline dipilih (perlu /setinlinefeedback di @BotFather)
  if (!navOnly) bot.on("chosen_inline_result", async (ctx, next) => {
    const c = ctx.chosenInlineResult;
    if (!c || !String(c.result_id || "").startsWith("help-")) return next();
    if (!c.inline_message_id) {
      console.error("[help] chosen_inline_result tiada inline_message_id");
      return;
    }
    require("../panel").markFeedback();
    await applyPremium(c.inline_message_id, c.from.id, c.result_id, nonceOfQuery(c.query));
  });

  // Navigasi tombol kategori: hl:c:<n> = buka kategori, hl:p:<n> = halaman kategori, hl:h:<n> = kembali ke menu utama
  bot.callbackQuery(/^hl:([cphu]):(-?\d+)$/, async (ctx) => {
    const inlineId = ctx.callbackQuery.inline_message_id;
    const m = ctx.callbackQuery.message;
    let entry;
    if (inlineId) {
      entry = shared.manager && shared.manager.getByAccount(ctx.from.id);
      if (!entry) return ctx.answerCallbackQuery({ text: "Menu ini bukan untuk anda.", show_alert: true });
    } else if (m) {
      const u = ctx.from;
      entry = (shared.manager && shared.manager.getByUser(u.id)) || { userId: String(u.id), username: u.username || null, name: [u.first_name, u.last_name].filter(Boolean).join(" ") };
    } else return ctx.answerCallbackQuery();
    const ref = inlineId ? { inline_message_id: inlineId } : { chat_id: m.chat.id, message_id: m.message_id };
    const act = ctx.match[1];
    const n = parseInt(ctx.match[2], 10);
    await ctx.answerCallbackQuery();

    const edit = async (rich, text, kb) => {
      for (const fancy of [true, false]) {
        try {
          await tg("editMessageText", { ...ref, rich_message: { html: fancy ? rich : stripCustom(rich) }, reply_markup: { inline_keyboard: kb(fancy) } });
          return;
        } catch (err) {
          if (/not modified/i.test(err.message)) return;
        }
      }
      try {
        await tg("editMessageText", { ...ref, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: kb(false) } });
      } catch (err) {
        if (!/not modified/i.test(err.message)) console.error("[help] navigasi gagal:", err.message);
      }
    };

    // Tombol ada DI DALAM kartu (rich button), jadi ganti halaman = edit seluruh kartu (bukan hanya keyboard)
    if (act === "p" || act === "h") return edit(buildHelp(entry, { hr: true, simple: false, level: "compact" }), buildHelpText(entry, ""), helpKb(n));
    if (act === "u") {
      const g = CP.build(entry, n, guideDeps(entry));
      return edit(g.html, g.text, guideKb(g.page));
    }
    const idx = ((n % Math.max(1, catList().length)) + catList().length) % Math.max(1, catList().length);
    const html = categoryHtml(entry, idx, false);
    if (!html) return;
    return edit(html, categoryText(entry, idx), catKb(idx));
  });

  // Jika inline feedback tidak dihidupkan: butang "Muat semula" memasang emoji premium
  if (!navOnly) bot.callbackQuery(/^hl:go(?::(\w+))?$/, async (ctx) => {
    const inlineId = ctx.callbackQuery.inline_message_id;
    const entry = shared.manager && shared.manager.getByAccount(ctx.from.id);
    if (!inlineId || !entry) {
      return ctx.answerCallbackQuery({ text: "Menu ini bukan untuk anda.", show_alert: true });
    }
    await ctx.answerCallbackQuery();
    await applyPremium(inlineId, ctx.from.id, null, ctx.match && ctx.match[1]);
  });
}

// Hantar menu help terus ke chat bot (dengan emoji premium): cuba setiap tahap Rich, kemudian teks biasa.
// Media (.setphoto / .setvideo): dipasang dalam mesej Rich; jika ditolak, dihantar sebagai mesej biasa.
async function sendHelpTo(chatId, entry, arg = "") {
  const uid = entry.userId;
  const before = HM.separateWanted(uid) && (await HM.sendViaBot(chatId, uid)) > 0;
  const attempts = attemptsFor(entry);
  const mediaTried = attempts.some((a) => a.media);
  let lastErr;
  const afterMedia = async (embedded) => {
    if (HM.getMode() === "off") return;
    if (!before && !embedded && HM.hasFileId(uid)) await HM.sendViaBot(chatId, uid);
    await HM.heal(chatId, uid); // media tanpa file_id: muat naik semula (dapat file_id untuk menu seterusnya)
  };
  const withKb = !arg && buttonsOn();
  const mk = (fancy) => (withKb ? { reply_markup: { inline_keyboard: helpKb(0)(fancy) } } : {});
  for (const a of attempts) {
    for (const fancy of withKb ? [true, false] : [false]) {
      try {
        const r = await tg("sendRichMessage", { chat_id: chatId, rich_message: richOf(entry, a, arg, false), ...mk(fancy) });
        learn(entry, a, mediaTried);
        await afterMedia(a.media);
        return r;
      } catch (err) {
        lastErr = err;
        console.error(`[help] hantar ke chat (${a.id}${fancy ? ", tombol premium" : ""}) ditolak:`, err.message);
      }
    }
  }
  try {
    const r = await tg("sendMessage", { chat_id: chatId, text: buildHelpText(entry, lastErr && lastErr.message, arg), parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...mk(false) });
    await afterMedia(false);
    return r;
  } catch (err) {
    const r = await tg("sendMessage", { chat_id: chatId, text: stripCustom(buildHelpText(entry, "", arg)), parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...mk(false) });
    await afterMedia(false);
    return r;
  }
}

async function helpCommand({ client, msg, account, args }) {
  const arg = (args || []).join(" ").trim();
  const edit = (text) => client.editMessage(msg.peerId, { message: msg.id, text });
  if (!shared.botUsername) return edit("\u26A0\uFE0F Bot kawalan belum sedia.");

  let reason = "";
  try {
    await JG.prepare(account.userId, 2500); // audio lagu disiapkan di latar belakang; menu TIDAK boleh tertahan (maks 2,5 detik)
    const nonce = crypto.randomBytes(3).toString("hex");
    rememberArg(nonce, arg);
    // Mod "mesej biasa": media dihantar tepat sebelum menu
    // (media tanpa file_id sentiasa dihantar sebagai mesej biasa kerana tidak boleh dipasang dalam mesej Rich)
    const sepAll = HM.separateWanted(account.userId);
    const sentBefore = sepAll
      ? (await HM.sendViaUserbot(client, msg.peerId, account.userId, "all")) > 0
      : HM.embedWanted(account.userId) && (await HM.sendViaUserbot(client, msg.peerId, account.userId, "missing")) > 0;
    await sendViaInlineAny({ client, shared, msg, queries: [`help ${nonce}`, `helptxt ${nonce}`] });
    // Telegram menolak media dalam mesej Rich pada percubaan ini: hantar sebagai mesej biasa (sekali ini selepas menu)
    const o = HM.outcomes.get(nonce);
    if (!sepAll && o && o.embedded === false && HM.getMode() !== "off") await HM.sendViaUserbot(client, msg.peerId, account.userId, "withId");
    return;
  } catch (err) {
    reason = err.message;
  }

  // Cadangan: hantar ke chat peribadi bot kawalan
  try {
    await sendHelpTo(account.userId, account, arg);
    await edit(`\uD83D\uDCE9 Menu help dihantar ke chat bot kawalan anda.\nSebab tidak muncul di sini: ${reason}`);
  } catch (err) {
    await edit(`\u26A0\uFE0F ${err.message}\nSebab inline: ${reason}`);
  }
}

// Tiada "category" = tidak disenaraikan dalam help
module.exports = { name: "help", registerBot, registerNav: (bot) => registerBot(bot, null, true), commands: { help: helpCommand }, buildHelp, buildHelpText, sendHelpTo, helpKb, guideKb, _categoryHtml: categoryHtml, _guide: (entry, n) => CP.build(entry, n, guideDeps(entry)) };

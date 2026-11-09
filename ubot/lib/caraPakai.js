// ═══════════════════════════════════════════════════════════════════════
//  CARA PAKAI - panduan lengkap UBOT ARTA PEDIA (tombol "CARA PAKAI" di menu .help)
//  Halaman:
//    0  Mulai Cepat        (alur dasar: Buat Ubot, prefix, .help, Beli Role, tanda kunci)
//    1  Role & Paket       (LITE/GOLD/PLATINUM/RESELLER/TANGAN KANAN/OWNER/ADMIN: harga, hak, kategori)
//    2  Panel & Perintah Bot (CONTROL UBOT, PANEL OWNER, PANEL RESELLER + perintah /addrole dll)
//    3+ Daftar menu         (semua kategori + command + cara pakai + paket minimum, 3 kategori per halaman)
//  Isi dibangun otomatis dari plugin yang terpasang, jadi menu baru langsung ikut tampil.
// ═══════════════════════════════════════════════════════════════════════
const { shared, esc, em } = require("../core");

const CAT_PER_PAGE = 3;
const MAX_HTML = 26000;
const ID = {
  crown: "6273839444311149115", gem: "6276228098962754124", star: "5852636219250317264",
  check: "6005561111099740638", bolt: "5215203703190989803", pin: "5397782960512444700",
  mega: "6098421155897545579", gear: "5368589393491669392", box: "5258134813302332906",
};
const ic = (k, fb) => em(ID[k], fb);
const rp = (n) => "Rp" + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function selfRole() {
  try { return require("../selfrole").conf(); } catch (_) { return null; }
}
const daysLabel = (d) => (!d || d >= 999 ? "permanen" : `${d} hari`);

// ---------- halaman statis ----------
function pageStart(prefix, brand) {
  const p = esc(prefix);
  return (
    `<h3>${ic("mega", "\uD83D\uDCD6")} CARA PAKAI ${esc(brand)}</h3>` +
    `<blockquote>Panduan singkat dari nol sampai bisa memakai semua menu. Gunakan tombol <b>Next</b> untuk halaman berikutnya.</blockquote>` +
    `<h4>${ic("gear", "\u2699\uFE0F")} Langkah awal</h4>` +
    `<ol>` +
    `<li><b>Buat Ubot</b> - buka bot kontrol, ketik <code>/start</code>, tekan <b>Buat Ubot</b>. Isi nomor telepon, kode OTP, dan password 2FA jika aktif. Akun Telegram Anda otomatis menjadi userbot.</li>` +
    `<li><b>Pakai prefix</b> - setelah connect, semua perintah diketik dari akun Anda sendiri diawali <code>${p}</code>, misalnya <code>${p}help</code>, <code>${p}ping</code>, <code>${p}bc</code>. Prefix bisa diganti dengan <code>${p}setprefix</code>, dan tombol <b>Reset Prefix</b> di /start mengembalikannya.</li>` +
    `<li><b>Buka menu</b> - ketik <code>${p}help</code> untuk menu tombol. Detail satu kategori atau command: <code>${p}help share</code> atau <code>${p}help ping</code>.</li>` +
    `<li><b>Balas pesan</b> - banyak fitur (broadcast, forward, simpan, edit gambar) bekerja pada pesan yang Anda <i>balas</i>. Balas dulu pesannya, lalu ketik perintahnya.</li>` +
    `<li><b>Tanda kunci ${esc("\uD83D\uDD12")}</b> - command berkunci berarti butuh paket lebih tinggi. Naikkan lewat <b>Up Role</b> atau <b>Beli Role</b> di /start.</li>` +
    `</ol>` +
    `<h4>${ic("pin", "\uD83D\uDCCC")} Tombol di /start</h4>` +
    `<table bordered><tr><th>Tombol</th><th>Fungsi</th></tr>` +
    `<tr><td>Buat Ubot</td><td>Menjadikan akun Anda userbot (login nomor + OTP)</td></tr>` +
    `<tr><td>Preview</td><td>Lihat isi menu <code>${p}help</code> lengkap tanpa perlu connect</td></tr>` +
    `<tr><td>Live Chat</td><td>Kirim pesan langsung ke Head Owner untuk bertanya / minta bantuan</td></tr>` +
    `<tr><td>Beli Role</td><td>Beli atau perpanjang LITE / GOLD / PLATINUM / RESELLER / TANGAN KANAN lewat QRIS, aktif otomatis</td></tr>` +
    `<tr><td>Up Role</td><td>Naik ke role lebih tinggi sampai TANGAN KANAN (masa aktif tetap)</td></tr>` +
    `<tr><td>BELI SC</td><td>Beli source code: diarahkan chat langsung dengan owner</td></tr>` +
    `<tr><td>PRODUK LAINNYA</td><td>Daftar produk digital yang dijual owner. Pilih produk, bayar QRIS, data (file / foto / teks) dikirim otomatis setelah lunas</td></tr>` +
    `<tr><td>Prev / Next</td><td>Pindah halaman menu /start. Halaman 1: Buat Ubot, Preview, Live Chat, Beli Role, Up Role, Beli SC, Produk Lainnya. Halaman 2: Reset Prefix, Restart Userbot, Buy Nokos, dan panel sesuai role</td></tr>` +
    `<tr><td>Reset Prefix</td><td>Kembalikan prefix perintah ke bawaan</td></tr>` +
    `<tr><td>Restart Userbot</td><td>Hidupkan ulang userbot Anda jika macet / tidak merespons</td></tr>` +
    `<tr><td>BUY NOKOS MURAH</td><td>Buka toko nomor kosong ARTA PEDIA</td></tr>` +
    `<tr><td>CONTROL UBOT</td><td>Khusus admin ubot: kendalikan akun ubot yang menunjuk Anda lewat <code>${p}addadmin</code></td></tr>` +
    `<tr><td>PANEL OWNER</td><td>Khusus OWNER: harga role, owner, watermark</td></tr>` +
    `<tr><td>PANEL RESELLER / PANEL TANGAN KANAN</td><td>Khusus reseller / tangan kanan: beri role ke pengguna</td></tr>` +
    `</table>`
  );
}

function pageRole(prefix) {
  const PK = require("../paket");
  const sr = selfRole();
  const p = esc(prefix);
  const byTier = (t) => Object.entries(PK.CATEGORY_MIN).filter(([, v]) => v === t).map(([k]) => k);
  const price = (t) => (sr && sr.prices && sr.prices[t] ? `${rp(sr.prices[t].price)} / ${daysLabel(sr.prices[t].days)}` : "-");
  const tierRow = (t) =>
    `<tr><td>${PK.badge(t)}</td><td>${esc(price(t))}</td><td>${PK.countForTier(t)}</td><td>${esc(PK.TIERS[t].blurb)}${byTier(t).length ? `<br><i>Kategori: ${byTier(t).map(esc).join(", ")}</i>` : ""}</td></tr>`;
  const exc = Object.entries(PK.COMMAND_MIN).reduce((m, [c, t]) => ((m[t] = m[t] || []).push(c), m), {});
  const excHtml = Object.keys(exc).map((t) => `<li><b>${esc(t)}</b>: ${exc[t].map((c) => `<code>${p}${esc(c)}</code>`).join(" ")}</li>`).join("");
  const staffPrice = (v) => (v ? `${rp(v.price)} sekali bayar` : "-");
  return (
    `<h3>${ic("crown", "\uD83D\uDC51")} ROLE &amp; PAKET</h3>` +
    `<blockquote>PLATINUM mencakup semua fitur GOLD, GOLD mencakup semua fitur LITE.</blockquote>` +
    `<h4>${ic("box", "\uD83D\uDCE6")} Paket pengguna</h4>` +
    `<table bordered><tr><th>Paket</th><th>Harga</th><th>Command</th><th>Isi</th></tr>${PK.ORDER.map(tierRow).join("")}</table>` +
    (excHtml ? `<details><summary>Command khusus (paket lebih tinggi dari kategorinya)</summary><ul>${excHtml}</ul></details>` : "") +
    `<h4>${ic("gem", "\uD83D\uDC8E")} Role staf</h4>` +
    `<table bordered><tr><th>Role</th><th>Harga</th><th>Hak</th></tr>` +
    `<tr><td>RESELLER</td><td>${esc(staffPrice(sr && sr.reseller))}</td><td>Semua fitur PLATINUM + bisa memberi role LITE / GOLD / PLATINUM ke pengguna: <code>/addrole &lt;ID&gt; GOLD 30</code> atau tombol PANEL RESELLER.</td></tr>` +
    `<tr><td>TANGAN KANAN</td><td>${esc(staffPrice(sr && sr.tk))}</td><td>Semua hak RESELLER + bisa memberi role RESELLER. Muncul tombol PANEL TANGAN KANAN.</td></tr>` +
    `<tr><td>ADMIN UBOT</td><td>Diberi owner/pemilik: <code>${p}addadmin</code></td><td>Tombol CONTROL UBOT di /start: mengendalikan akun ubot yang ditunjuk langsung dari chat bot.</td></tr>` +
    `<tr><td>OWNER</td><td>-</td><td>Semua fitur tanpa batas + PANEL OWNER (harga, owner, role, watermark).</td></tr>` +
    `</table>` +
    `<h4>${ic("bolt", "\u26A1")} Cara beli</h4>` +
    `<ul>` +
    `<li><b>Beli Role</b>: /start, tekan Beli Role, pilih role, scan QRIS. Setelah lunas, role aktif otomatis dan notifikasi terkirim.</li>` +
    `<li><b>Up Role</b>: naik bertahap LITE, GOLD, PLATINUM, RESELLER sampai <b>TANGAN KANAN</b> (role tertinggi yang bisa dibeli) tanpa menambah masa aktif paket.</li>` +
    `<li><b>Ubot gratis</b>: menekan Buat Ubot langsung memberi paket LITE (Menu Share Auto Promosi tersedia, setiap kiriman diberi watermark).</li>` +
    `</ul>`
  );
}

function pagePanel(prefix) {
  return (
    `<h3>${ic("gear", "\u2699\uFE0F")} PANEL &amp; PERINTAH BOT</h3>` +
    `<blockquote>Bagian ini hanya untuk role staf. Perintah diketik di chat bot kontrol, bukan di userbot.</blockquote>` +
    `<table bordered><tr><th>Perintah / Tombol</th><th>Untuk</th><th>Fungsi</th></tr>` +
    `<tr><td>CONTROL UBOT</td><td>Admin ubot</td><td>Pilih akun ubot lalu kirim command langsung di chat bot. Kartu status menampilkan online/offline, paket, expired, prefix.</td></tr>` +
    `<tr><td>PANEL RESELLER</td><td>Reseller</td><td>Beri role LITE / GOLD / PLATINUM ke pengguna dengan tombol.</td></tr>` +
    `<tr><td><code>/addrole &lt;ID&gt; &lt;LITE|GOLD|PLATINUM&gt; [hari]</code></td><td>Reseller, Tangan Kanan, Owner</td><td>Beri role. Bisa juga balas / forward pesan penerima: <code>/addrole GOLD 30</code>.</td></tr>` +
    `<tr><td><code>/addrole &lt;ID&gt; RESELLER</code></td><td>Tangan Kanan, Owner</td><td>Menjadikan seseorang reseller.</td></tr>` +
    `<tr><td><code>/addtk &lt;ID&gt;</code> <code>/deltk &lt;ID&gt;</code> <code>/tklist</code></td><td>Owner</td><td>Tambah / cabut / daftar TANGAN KANAN.</td></tr>` +
    `<tr><td>PANEL OWNER</td><td>Owner</td><td>Ubah harga &amp; masa aktif tiap role, tambah / hapus owner, kelola watermark.</td></tr><tr><td><code>/addwm teks</code> <code>/delwm 2|all</code> <code>/listwm</code></td><td>Owner</td><td>Tambah, hapus, dan lihat jumlah watermark ubot gratis (dipakai bergantian).</td></tr>` +
    `<tr><td><code>/harga</code> <code>/setharga GOLD 5000 30</code></td><td>Owner</td><td>Lihat dan ubah harga role.</td></tr>` +
    `<tr><td><code>/addown &lt;ID&gt;</code> <code>/delown &lt;ID&gt;</code> <code>/owners</code></td><td>Owner</td><td>Tambah / hapus / daftar owner.</td></tr>` +
    `</table>` +
    `<details><summary>Aturan pemberian role</summary><ul>` +
    `<li>LITE / GOLD / PLATINUM: owner, reseller, tangan kanan.</li>` +
    `<li>RESELLER: owner, tangan kanan.</li>` +
    `<li>TANGAN KANAN: hanya owner.</li>` +
    `<li>Reseller tidak bisa menurunkan role yang lebih tinggi dan tidak bisa memberi role ke owner / reseller.</li>` +
    `<li>Setiap pemberian role dicatat dan dikirim sebagai notifikasi ke channel.</li>` +
    `</ul></details>` +
    `<p>${esc("\u21B3")} Prefix userbot Anda: <code>${esc(prefix)}</code></p>`
  );
}

// ---------- halaman daftar menu ----------
// deps: { cats: Map(nama -> [help]), tidyDesc, aliasOf, catIcon, firstWord }
function catSection(name, list, prefix, deps, withDesc) {
  const PK = require("../paket");
  const p = esc(prefix);
  const minSet = [...new Set(list.map((h) => PK.minOf(h.cmd)))];
  const minTxt = minSet.length === 1 ? `${PK.badge(minSet[0])} ke atas` : "campuran (lihat kolom Paket)";
  const rows = list
    .map((h) => {
      const alias = deps.aliasOf(prefix, h);
      const fn = withDesc ? deps.tidyDesc(h.desc) : "";
      return `<tr><td><code>${p}${esc(h.cmd)}</code>${alias}</td>${withDesc ? `<td>${fn}</td>` : ""}<td>${esc(PK.minOf(h.cmd))}</td></tr>`;
    })
    .join("");
  const head = `<tr><th>Command</th>${withDesc ? "<th>Fungsi &amp; cara pakai</th>" : ""}<th>Paket</th></tr>`;
  return (
    `<h4>${deps.catIcon(name)} ${esc(name)} (${list.length})</h4>` +
    `<p>Paket minimum: ${minTxt} \u00B7 detail: <code>${p}help ${esc(deps.firstWord(name))}</code></p>` +
    `<details><summary>Buka ${list.length} command</summary><table bordered>${head}${rows}</table></details>`
  );
}

function menuPages(prefix, deps) {
  const entries = [...deps.cats].filter(([, l]) => l.length);
  // Menu Share selalu di halaman pertama daftar menu
  entries.sort((a, b) => (a[0] === "MENU SHARE AUTO PROMOSI" ? -1 : b[0] === "MENU SHARE AUTO PROMOSI" ? 1 : 0));
  const pages = [];
  for (let i = 0; i < entries.length; i += CAT_PER_PAGE) pages.push(entries.slice(i, i + CAT_PER_PAGE));
  return pages;
}

// Daftar halaman: [{ id, title }]
function index(deps) {
  const base = [{ title: "Mulai Cepat" }, { title: "Role & Paket" }, { title: "Panel & Perintah Bot" }];
  const mp = menuPages("", deps);
  mp.forEach((grp, i) => base.push({ title: `Daftar Menu ${i + 1}/${mp.length}`, cats: grp.map(([n]) => n) }));
  return base;
}
const count = (deps) => index(deps).length;

// Halaman n -> { html, text }
function build(entry, n, deps) {
  const brand = String(shared.cfg.brand || "UBOT ARTA PEDIA").toUpperCase();
  const prefix = deps.prefix;
  const idx = index(deps);
  const total = idx.length;
  const pg = ((n % total) + total) % total;
  let body;
  if (pg === 0) body = pageStart(prefix, brand);
  else if (pg === 1) body = pageRole(prefix);
  else if (pg === 2) body = pagePanel(prefix);
  else {
    const grp = menuPages(prefix, deps)[pg - 3];
    const mk = (withDesc) =>
      `<h3>${ic("mega", "\uD83D\uDCD6")} DAFTAR MENU (${pg - 2}/${total - 3})</h3>` +
      (pg === 3 ? `<blockquote>Menu <b>MENU SHARE AUTO PROMOSI</b> ada di urutan pertama: broadcast, forward, join grup, autocek, blacklist, semua gratis untuk LITE.</blockquote>` : "") +
      grp.map(([name, list]) => catSection(name, list, prefix, deps, withDesc)).join("");
    body = mk(true);
    if (body.length > MAX_HTML) body = mk(false);
  }
  const html =
    body +
    `<p>Halaman ${pg + 1} dari ${total} \u00B7 ${esc(idx[pg].title)}</p>` +
    `<footer>${em(ID.crown, "\uD83D\uDC51")} UBOT BY ${esc(brand.replace(/^UBOT\s+/, ""))} OFFICIAL ${em(ID.check, "\u2705")}</footer>`;
  const text = html
    .replace(/<\/(h3|h4|p|tr|li|blockquote|ol|ul)>/g, "\n")
    .replace(/<\/t[dh]>/g, " | ")
    .replace(/<(?!\/?(b|i|code|tg-emoji)\b)[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 3900);
  return { html, text, page: pg, total };
}

module.exports = { build, count, index };

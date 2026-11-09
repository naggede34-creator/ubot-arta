UPDATE v1.28.0 - SALDO OWNER, KODE VOUCHER / DISKON, ATUR TOMBOL, NOTIF STOK & JADWAL SHOLAT, BATALKAN ORDER NOKTEL
- KELOLA SALDO (owner): PANEL OWNER > Kelola Saldo -> Tambah Saldo / Kurangi Saldo / Cek Saldo / Top Saldo.
    Perintah: /addsaldo ID JUMLAH · /delsaldo ID JUMLAH · /delsaldo ID all (hapus semua) · /ceksaldo ID (boleh balas / forward pesan orangnya).
    Pengguna dikabari setiap saldonya diubah; channel notifikasi ikut dikabari. Pengguna: /saldo. Dashboard /start kini menampilkan baris Saldo.
- KODE VOUCHER / DISKON / HADIAH SALDO (owner): PANEL OWNER > Kode Voucher / Diskon -> Buat Kode Baru (jenis -> kode / acak -> nilai -> kuota -> kedaluwarsa -> berlaku untuk).
    HADIAH SALDO: saldo langsung masuk ketika diklaim. DISKON: persen (10%) atau nominal (2000), untuk semua / Beli-Up Role / Noktel,
    otomatis dipotong pada pembelian berikutnya (QRIS maupun saldo) dan baru "habis" setelah pembayaran lunas.
    Kuota = jumlah orang yang bisa memakai; 1 orang hanya 1x per kode. Kedaluwarsa: 30m · 12j · 7h · 2026-12-31 · 2026-12-31 20:00 · 0 (tanpa batas).
    Perintah: /buatkode saldo KODE 5000 10 7h · /buatkode diskon KODE 10% 50 24j role · /listkode · /hapuskode KODE.
    Pengguna klaim lewat tombol [Redeem Kode] (dashboard /start & menu noktel) atau /redeem KODE. Data: data/voucher.json.
- ATUR TOMBOL (owner): PANEL OWNER > Atur Tombol. Tekan tombol dashboard mana saja -> Ganti Nama · Naik / Turun · Kiri / Kanan · Gabung ke baris atas ·
    Pisah baris · Warna · Sembunyikan (bisa dimunculkan lagi). [Tambah Tombol] = tombol link (URL) atau tombol teks info sendiri. [Reset Tata Letak].
    [Ganti Nama Tombol (Semua Menu)] = ganti teks tombol apa saja di bot (mis. "Isi Saldo" -> "Top Up"), atau ketik "hapus" untuk menyembunyikannya.
    Tombol PANEL OWNER & CHANNEL FEEDBACK selalu di bawah (tidak bisa dihapus). Data: data/db.json (settings.home_layout, settings.btn_rules).
- NOTIF OTOMATIS (owner): PANEL OWNER > Notif Otomatis (nyala / mati per fitur & per tujuan: pengguna bot / channel).
    Stok baru: setiap owner menambah stok noktel -> "STOK NOKTEL BARU" ke semua pengguna + channel (penambahan berdekatan digabung, jeda 60 detik).
    Info stok berkala: tiap 35-40 menit (acak, bisa diubah) ke channel. Stok kosong dikirim maks 1x / 3 jam.
    Sapaan Pagi 07:00 / Siang 13:00 / Sore 16:30 / Malam 20:30 (/setjamnotif pagi 07:00, atau "off") + pengingat 5 waktu sholat (Subuh, Dzuhur, Ashar,
    Maghrib, Isya) tepat waktu, berisi jadwal sholat hari ini + ajakan order bergantian (Up Role / Beli Role Ubot / Beli Noktel) dengan tombol order.
    Jadwal sholat dihitung otomatis tanpa internet (metode Kemenag RI) untuk kota pilihan (/setkota surabaya, 28 kota WIB/WITA/WIT + KL/Singapura).
    Channel: memakai NOTIFY_CHANNEL_ID, atau channel lain lewat [Set Channel] / /setchpromo -100xxxx (bot harus admin). Pengguna: /jadwalsholat.
    [Tes Kirim] mengirim contoh hanya ke owner. Pengguna yang memblokir bot otomatis dilewati. Link baru: t.me/BOT?start=nk | role | uprole | redeem.
- BATALKAN ORDER NOKTEL (owner): Kelola Noktel > Pesanan Pembeli -> pilih pesanan ->
    menunggu bayar: Batalkan (QRIS dibatalkan, stok dilepas) · sudah dibayar: Batal + Refund + Akun Kembali ke Stok / Batal + Refund (akun dihapus) /
    Batal Tanpa Refund (akun dihapus). Pembeli dikabari otomatis. Perintah: /batalnk NKO-0001 [stok|refund|norefund].
- File baru: saldoadm.js, voucher.js, btnlayout.js, autonotif.js, praytimes.js, config.example.json. Diubah: bot.js, core.js, noktel.js, selfrole.js,
    ownerpanel.js, notify.js, bcpin.js.

UPDATE v1.26.1 - MODE QRIS OWNER (OTOMATIS 1 / OTOMATIS 2 / MANUAL)
- PANEL OWNER > [Mode QRIS] (atau /modeqris). Owner memilih cara pembayaran QRIS untuk Beli Role, Up Role, Produk Lainnya, dan Noktel (beli + deposit):
    QRIS OTOMATIS > Otomatis 1 = AGW ArtaPedia (bot minta API Key agw_live_... [+ Secret bila diaktifkan admin gateway])
                  > Otomatis 2 = AustinPay austinpay.cc.cd (bot minta API Key apg_live_... lalu API Secret HMAC, ketik - bila tidak dipakai)
    QRIS MANUAL   > owner kirim FOTO QRIS miliknya. Pembeli scan, kirim screenshot bukti ke bot; bukti masuk ke group persetujuan (atau chat owner)
                    dengan tombol ACCEPT / REJECT. ACCEPT = role / produk / saldo aktif otomatis; REJECT = pembeli dikabari dan pesanan dibatalkan.
- Key dites dulu (ping) sebelum disimpan; mode tidak berubah bila key salah. Pesan berisi key dihapus otomatis dari chat.
- AustinPay: IP server bot WAJIB didaftarkan di AustinPay > Profil > Whitelist IP. Total bayar = nominal + biaya 0,4% + kode unik (sudah ditampilkan di kartu).
    Base URL bawaan https://austinpay.cc.cd (ubah lewat config.json "austin": { "base_url": "..." } bila domain berbeda). Env opsional: AUSTIN_KEY, AUSTIN_SECRET.
- Tagihan yang sedang berjalan tetap diproses provider aslinya walau owner mengganti mode. QRIS manual kedaluwarsa 30 menit (data/db.json settings.qris_manual_minutes).
- Cek Gateway / /gateway kini mengikuti mode aktif. .qris di userbot tetap memakai kunci pribadi (.setagw) atau provider otomatis yang terisi.
- Data: key di data/db.json (qris_auto1 / qris_auto2), gambar QRIS manual di data/qris_manual.img (ikut Backup). Diubah: gateway.js, ownerpanel.js, bot.js, selfrole.js, products.js, noktel.js. File baru: qrismode.js.

UPDATE v1.21.0 - BELI NOKTEL / NOKOS TELEGRAM SIAP PAKAI
- /start: tombol baru [BELI NOKTEL TELEGRAM SIAP PAKAI] -> menu noktel: saldo khusus noktel, info stok, tombol Isi Saldo / Beli Noktel / Info Saldo / Riwayat Pesanan.
- Beli Noktel: pilih kategori -> pilih ID noktel (NK-0001, dst) -> Bayar QRIS (otomatis, gateway AGW yang sama) atau Bayar Saldo.
    Stok dipesan selama QRIS aktif (tidak bisa dibeli orang lain); bila QRIS kedaluwarsa stok dilepas. Bayar telat setelah stok terjual -> uang masuk saldo noktel.
- Setelah lunas bot mengirim: nomor, ID Telegram, PIN 2FA. Pembeli login (disarankan Nicegram / Nekogram) lalu tekan [Minta OTP]:
    bot memantau chat Telegram resmi (777000) di akun itu 3 menit dan meneruskan kode ke pembeli. Login pembeli terdeteksi otomatis (sesi baru) atau tombol [Saya Sudah Login].
    [Logout & Selesai] = sesi bot di akun di-logout, data akun dihapus dari bot, status sold out.
- OWNER: PANEL OWNER > Kelola Noktel, atau /addnoktel (nomor -> kode login pakai strip 1-2-3-4-5 -> PIN 2FA bila ada -> kategori -> harga -> tersimpan),
    /listnoktel, /delnoktel ID, /addsaldonk ID_PENGGUNA JUMLAH.
- Notifikasi channel (NOTIFY_CHANNEL_ID): deposit pending, deposit sukses, beli noktel, kode OTP diterima, noktel berhasil dibeli, pembeli sudah login, noktel selesai.
    Nomor disamarkan; kode OTP dan PIN 2FA tidak dikirim ke channel.
- Data: data/noktel.json (berisi sesi akun + PIN 2FA, ikut Backup; jaga kerahasiaannya). config.json opsional: "noktel": { "min_deposit": 5000, "max_deposit": 5000000, "presets": [5000,10000,20000,50000,100000] }.
- Diubah: bot.js, ownerpanel.js, notify.js. File baru: noktel.js.

UPDATE v1.20.0 - DASHBOARD /START BARU, PANEL OWNER LENGKAP, BROADCAST PIN
- /start (bot utama) & bot store: tampilan dashboard seperti contoh foto: banner (opsional) -> judul DASHBOARD -> sapaan + tanggal WIB -> tabel akun
    -> 3 dropdown (Panduan, Keunggulan, Statistik) -> baris "Bot Aktif - @bot - @developer" -> tombol.
    Susunan tombol: [Buat Ubot] / [Beli Role | Profil Saya] / [Panduan | Up Role] / [BUY NOKOS MURAH KLIK INI] / [Menu Lainnya] / [PANEL OWNER]
    + [CHANNEL FEEDBACK] hijau di LUAR kartu. Tombol lama (Preview, Live Chat, Beli SC, Produk Lainnya, Buat Store, Reset Prefix, Restart Userbot) ada di "Menu Lainnya".
    Bot store: [BELI ROLE] / [UP ROLE | PROFIL SAYA] / [PANDUAN | PREVIEW] / [CS STORE KLIK INI] / [PANEL STORE] + CHANNEL FEEDBACK.
    Prev / Next halaman dihapus (semua tombol sudah muat dalam satu dashboard).
- PANEL OWNER sekarang memuat SEMUA fitur owner: BROADCAST PIN, harga role, beri RESELLER / TANGAN KANAN, tambah / hapus / daftar owner, watermark,
    CONTROL SEMUA UBOT, Kelola Produk, Pembayaran (/payset), Set Banner, Statistik, Backup Sekarang, Cek Gateway, Restart Bot.
    Tombol CONTROL SEMUA UBOT & KELOLA PRODUK dipindah dari /start ke Panel Owner. Perintah lama (/backup, /gateway, /restartbot, dll) tetap jalan.
- FITUR BARU OWNER: BROADCAST PIN (Panel Owner > BROADCAST PIN, atau balas pesan dengan /bcpin).
    Kirim / forward satu pesan (teks, foto, video, dokumen, ...) -> preview -> KIRIM & PIN. Pesan disalin ke chat bot SEMUA pengguna lalu di-pin;
    pin broadcast lama otomatis dilepas. Pengguna yang memblokir bot dilewati, FloodWait di-retry otomatis, ada tombol Hentikan.
    Pengguna baru (/start) otomatis menerima pin aktif (bisa dimatikan). "Lepas Pin Semua" / /unpinbc melepas semua pin. Data: data/bcpin.json.
- BANNER: Panel Owner > Set Banner (kirim foto) untuk bot utama; PANEL STORE > Set Banner untuk bot store. Jika Telegram menolak gambar, dashboard tampil tanpa banner.
- config.json (opsional): dashboard_title, shop_label, shop_url, feedback_label, channel_url, start_banner (file_id foto).
- Diubah: bot.js, ownerpanel.js, storebot.js, core.js, botui.js, lib/richButtons.js, selfrole.js, pay.js. File baru: bcpin.js, dash.js.

UPDATE v1.19.2 - STABILITAS (BOT / USERBOT "MATI" DI PANEL)
- bot.js: update pesan & tombol kini diproses paralel antar pengguna (tetap berurutan per pengguna) + antrean dilepas setelah 120 dtk bila handler macet.
  Sebelumnya grammY memproses satu per satu: satu handler lambat membuat panel / menu semua orang tidak merespons.
- core.js: request ke Bot API diberi timeout 25 dtk (config.json "tg_timeout_ms") dan respons non-JSON (502 dll) tidak lagi memicu error samar / menggantung.
- manager.js: userbot yang gagal naik saat boot atau mati karena error sementara kini dihidupkan lagi otomatis oleh watchdog (jeda 1, 2, 4... maks 30 menit);
  sesi yang dicabut / akun nonaktif TIDAK di-retry; koneksi gagal dibersihkan (tidak bocor); connect dibatasi timeout; watchdog tidak menumpuk.
- Diubah: bot.js, core.js, manager.js.

UPDATE v1.19.1 - AUTOBC / AUTOBC2 / AUTOCFD LEBIH ANDAL
- Terkirim dihitung hanya bila Telegram mengonfirmasi pesan masuk; FloodWait melanjutkan sisa grup (tidak mengulang dari awal); slowmode satu grup tidak lagi menghentikan putaran;
  grup arsip ikut dikirimi (config.json "share_include_archived": false untuk mematikan); laporan memuat penyebab gagal & sisa.
- Mendukung SEMUA jenis pesan: teks, foto, video, dokumen, stiker, voice, video bulat, album, polling, kontak, lokasi, dan pesan RICH (kartu via bot inline).
  Pesan Rich / bertombol / spoiler / album / jenis tak dikenal disalin SISI SERVER (isi & format persis sama, tanpa label "Diteruskan dari");
  foto & dokumen biasa dikirim ulang dengan caption + format asli. Bila chat sumber melarang forward, foto/dokumen/teks dikirim ulang isinya.
- Diubah: plugins/share.js, plugins/broadcast.js.

UPDATE v1.19.0 - FIX UTAMA: HANDLER INLINE HELP TIDAK TERPASANG
- PENYEBAB .help dikirim bot & log "Bot tidak menjawab query inline": bot.js memanggil p.registerBot(bot, shared), tetapi plugins/_help.js memakai parameter ke-2 sebagai navOnly.
    shared (objek) dianggap TRUE -> handler inline_query / chosen_inline_result / tombol Muat semula untuk help tidak pernah didaftarkan, sehingga query "help xxxx" tidak dijawab.
    Sekarang: registerBot(bot, shared, navOnly). registerNav (bot store) tetap hanya navigasi. Diubah: plugins/_help.js.
- .autobc / .autobc2: grup yang menolak akun (USER_BANNED_IN_CHANNEL, CHANNEL_PRIVATE, USER_NOT_PARTICIPANT, CHAT_WRITE_FORBIDDEN) dilewati 6 jam, log menyebut nama grupnya. Diubah: plugins/share.js.

UPDATE v1.18.0 - FIX .HELP DIKIRIM BOT (INLINE TIDAK MENJAWAB)
- Gejala: Xhelp di akun userbot tidak muncul, menu malah dikirim bot ke chat bot; console: Inline "help xxxx" gagal: Bot tidak menjawab query inline.
    Artinya query inline dari userbot tidak sampai / tidak diproses bot. Perbaikan:
    (1) bot.start memakai allowed_updates eksplisit (inline_query, chosen_inline_result, callback_query, message ...). Telegram mengingat daftar update terakhir
        yang diminta; bila pernah diset tanpa inline_query oleh script / server lama dengan token yang sama, query inline tidak pernah dikirim.
    (2) Saat start, bot memeriksa inline mode (getMe.supports_inline_queries). Bila MATI: pesan jelas di console + dikirim ke owner
        (BotFather > /setinline harus dilakukan untuk bot yang tokennya sama dengan config.json bot_token / BOT_TOKEN).
    (3) Setiap query inline yang masuk dicatat: [inline] query "help xxxx" diterima dari <id>. Bila baris ini TIDAK muncul saat Xhelp, Telegram tidak mengirim query ke proses ini
        (token beda / dua server memakai token sama / inline mati).
    (4) inline_query & chosen_inline_result dijalankan paralel (grammY memproses update satu per satu, bisa tertahan handler lain lebih dari 15 detik).
    (5) inline.js: jawaban inline yang terbaca langsung oleh userbot dianggap sudah dijawab; GetDialogs (penyebab "Sleeping for 26s on flood wait") dicoba paling akhir, maks 1x / 10 menit.
- Diubah: bot.js, inline.js.

UPDATE v1.17.0 - FIX XHELP TIDAK MUNCUL & ERROR TAMPILAN
- FIX: Xhelp tidak muncul / lama. .help menunggu persiapan lagu (unduh ytdl / yt-dlp, bisa sampai 3 menit) hingga 90 detik sebelum menu dikirim,
    dan bila unduhan macet menu tertahan terus. Sekarang menu maksimal menunggu 2,5 detik, lagu disiapkan di latar belakang,
    persiapan lagu dibatasi 4 menit, dan bila gagal tidak dicoba lagi tiap .help (jeda 30 menit). Diubah: plugins/_help.js, jogjamenu.js.
- FIX: prefix tidak lagi peka huruf besar/kecil: Xhelp, xhelp, XHELP semuanya jalan (HP sering mengubah huruf pertama). Diubah: manager.js.
- FIX: halaman CARA PAKAI "ROLE & PAKET" dan "PANEL & PERINTAH BOT" memuat karakter & mentah di HTML Rich (bisa ditolak Telegram); sekarang &amp;. Diubah: lib/caraPakai.js.

UPDATE v1.16.0 - FIX ROLE TANGAN KANAN/RESELLER, AUTOBACKUP, STORE UBOT
- FIX: pembeli TANGAN KANAN / RESELLER yang menekan Buat Ubot dulu jatuh ke jalur "ubot gratis" sehingga paketnya ditulis LITE.
    Sekarang: (1) beli / diberi role RESELLER atau TANGAN KANAN langsung mengaktifkan akun (status approved, paket PLATINUM, permanen),
    (2) staf otomatis boleh Buat Ubot, (3) paket staf selalu PLATINUM (tierOf), (4) jalur gratis tidak lagi menimpa paket yang sudah ada,
    (5) saat bot start, akun reseller / tangan kanan lama yang terlanjur LITE diperbaiki otomatis (access.healStaff).
    Diubah: paket.js, access.js, selfrole.js, resellerpanel.js, bot.js.
- AUTO HIDUP SENDIRI (supervisor.js): bot menjaga dirinya sendiri, startup command panel TIDAK perlu diubah (tetap node bot.js / npm start).
    Proses utama hanya mengawasi; bot jalan sebagai proses anak. Bot mati / crash / di-kill -> hidup lagi otomatis dalam 10 detik.
    Bot macet (tidak merespons 5 menit) -> di-kill lalu dihidupkan lagi. Polling bot utama putus (proses hidup tapi bot diam) -> restart otomatis.
    Crash berulang (5x dalam 10 menit) -> jeda naik bertahap (20 dtk, 40 dtk, ... maks 5 menit) supaya panel tidak penuh.
    Owner dapat pesan di bot tiap bot hidup lagi (maks 1x per 10 menit). Owner: /restartbot = restart seluruh bot (aktif lagi ~10 detik).
    Tombol Stop / Restart panel tetap normal (tidak memicu hidup ulang). Salah config / token ditolak (exit 78) tidak di-loop.
    config.json (opsional): "auto_restart": { "enabled": true, "delay_sec": 10, "hang_min": 5, "max_delay_min": 5, "notify": true }
    Matikan: "enabled": false atau env UBOT_NO_SUPERVISOR=1.
    Catatan: kalau seluruh server dimatikan dari panel, hanya panel yang bisa menghidupkan (Settings > crash detection, atau Schedules > Power action Start tiap 5 menit).
    File baru: supervisor.js. Diubah: bot.js, cfgload.js.
- FIX LOG ERROR (Error: TIMEOUT di updates.js & [autocfd] FLOOD):
    (1) TIMEOUT = log bawaan gramJS tiap ping ke Telegram lewat 10 detik (jaringan / CPU panel padat); gramJS menyambung ulang sendiri.
        quiet.js meringkas log itu jadi 1 baris tiap 5 menit (error lain tetap tampil normal). manager.js: client lebih tahan (retry 10x, autoReconnect, requestRetries 3).
    (2) FLOOD: kena FloodWait Telegram dulu membuat SETIAP chat berikutnya tetap dicoba dan gagal satu-satu. Sekarang waktu tunggu dicatat per akun:
        tunggu pendek (<=120 dtk) ditunggu otomatis; kalau lebih lama / berulang, putaran .bc / .autobc / .autobc2 / .autocfd / .cfd berhenti lebih awal,
        dijadwal ulang setelah limit lewat, dan laporan menampilkan "Limit Telegram". Saran: naikkan delay (mis. .autocfd <jeda> 8) bila sering kena FLOOD.
    Diubah: plugins/broadcast.js, plugins/share.js, manager.js, plugins/_help.js (registerNav). File baru: quiet.js.
- PEMBAYARAN OTOMATIS DIGANTI KE AGW (Admin Gateway API / SMP Payment, https://www.tokonokosarta.my.id/api/agw):
    Artapedia Pay, BuatQris, dan Pakasir DIHAPUS. Satu-satunya gateway otomatis sekarang AGW; dipakai Beli Role, Up Role, PRODUK LAINNYA, dan .qris.
    WAJIB isi kunci baru dari admin gateway (kunci apay_... lama TIDAK berlaku di API baru). Pilih salah satu (jangan taruh di chat):
      1) config.json -> "gateway": { "provider": "agw", "api_key": "agw_live_...", "secret": "agw_sec_..." }   (secret hanya bila diaktifkan admin, boleh kosong)
      2) .env / environment panel: AGW_KEY=agw_live_...  AGW_SECRET=agw_sec_...
    Setelah diisi & restart, owner ketik /gateway di bot untuk cek koneksi: status, batas nominal, dan IP server (untuk whitelist bila admin mengaktifkannya).
    Pelanggan yang jualan lewat .qris: .setagw <api_key> [secret] (kunci dicek langsung ke gateway), .delgateway untuk putus. .setartapedia / .setbuatqris dihapus.
    Cara kerja: total_pay = nominal + kode unik (1-999); pembeli WAJIB bayar persis total (tampil di kartu & caption QR; label "Kode unik" menggantikan "Biaya admin").
    QR dirender lokal dari qr_string (tanpa layanan pihak ketiga). order_id unik tiap tagihan = idempoten (retry jaringan tidak membuat tagihan ganda).
    Status dicek tiap 5 detik (polling; tidak perlu webhook / URL publik). Tanda tangan HMAC otomatis bila secret diisi (timestamp detik; jam server harus akurat).
    Bayar TELAT: AGW masih menerima pembayaran sampai 20 menit setelah kedaluwarsa. Pesanan yang sudah ditutup tetap dipantau 21 menit; bila ternyata lunas,
    role / produk tetap diberikan otomatis (juga setelah restart). Batal saat tagihan sudah terbayar -> otomatis ditandai lunas, bukan error.
    Tagihan lama provider sebelumnya yang masih pending saat update otomatis ditutup (kedaluwarsa). Diubah: gateway.js, selfrole.js, products.js, plugins/qris.js, bot.js, config.json, .env.example.
- EMOJI PREMIUM DI BOT STORE: bot store sekarang otomatis memakai emoji premium + tombol berwarna seperti bot utama. Bila Telegram menolak untuk bot tersebut,
    pesan otomatis dikirim ulang dengan emoji biasa (tanpa error ke pembeli) dan dicek lagi 6 jam kemudian. Diubah: core.js, storebot.js.
- AUTOBACKUP: seluruh file SC + database (data/db.json, sesi ubot, config.json, data store) di-zip dan dikirim bot ke SEMUA owner tiap 60 menit.
    ZIP dipecah otomatis bila > 45 MB. node_modules / .git tidak ikut. Tidak butuh paket tambahan.
    Owner: /backup (kirim sekarang), /setbackup <menit> (min 5). config.json: "autobackup": false untuk mematikan, "backup_interval_min": 60.
    Owner wajib pernah /start bot supaya bisa dikirimi file. File baru: backup.js.
- STORE UBOT: tombol BUAT STORE UBOT (/start HALAMAN 1 + PANEL RESELLER / TANGAN KANAN) untuk RESELLER & TANGAN KANAN.
    Wizard: token bot -> foto QRIS -> nama store -> username CS. Bot store (token mereka, jalan di proses yang sama) berisi tombol
    BELI ROLE, UP ROLE, PREVIEW (menu .help lengkap seperti bot utama), CS STORE (+ PANEL STORE khusus pemilik: SET HARGA, PESANAN PENDING).
    Pembeli bayar manual ke QRIS pemilik store lalu kirim bukti transfer; pemilik tekan ACC / TOLAK. ACC = role aktif (masuk db.json, notif channel).
    Harga diatur pemilik (/setharga GOLD 15000 30 atau tombol), default = harga bot utama, harga 0 = tidak dijual.
    Role yang bisa dijual: reseller = LITE/GOLD/PLATINUM, tangan kanan = + RESELLER. Role TANGAN KANAN TIDAK bisa dijual di store.
    Pemilik store wajib /start bot store-nya supaya bukti transfer sampai. Data: data/stores.json + data/stores/qris-<id>.jpg (ikut backup).
    File baru: storebot.js. Diubah: core.js (runAs: token per konteks), botui.js, notify.js, bot.js, resellerpanel.js.

UPDATE v1.15.0 - /START BERHALAMAN, PRODUK LAINNYA, BELI SC
- /start sekarang 2 halaman (tombol Prev / Next): Halaman 1 = Buat Ubot, Preview, Live Chat, Beli Role, Up Role, BELI SC, PRODUK LAINNYA.
    Halaman 2 = Reset Prefix, Restart Userbot, BUY NOKOS MURAH, lalu panel sesuai role (CONTROL UBOT / CONTROL SEMUA UBOT, PANEL OWNER, KELOLA PRODUK, PANEL RESELLER). /start selalu mulai dari halaman 1.
- PRODUK LAINNYA (products.js): owner menjual produk digital lewat bot.
    Owner: /addproduk (nama -> harga -> deskripsi -> data produk: file / foto / video / audio / voice / gif / stiker / teks, boleh beberapa pesan, lalu /selesai atau tombol Selesai),
           /delproduk <id> atau tombol Hapus Produk, /listproduk, tombol KELOLA PRODUK (halaman 2 /start atau PANEL OWNER).
    Pembeli: PRODUK LAINNYA -> pilih produk -> Beli -> bayar QRIS (gateway yang sama dengan Beli Role) -> data produk dikirim OTOMATIS setelah lunas. Notifikasi pembelian masuk ke channel notif.
    Owner yang menekan Beli menerima data langsung (uji coba, tanpa bayar). Data tersimpan di data/db.json (settings.products).
- BELI SC: tombol Chat Owner (config.json "sc_contact_url", bawaan developer_url).
- File baru: products.js. Diubah: bot.js, notify.js, ownerpanel.js, lib/caraPakai.js.

UPDATE v1.14.2 - CONTROL SEMUA UBOT dihapus dari halaman CARA PAKAI (fitur tetap ada untuk owner di /start).

UPDATE v1.14.1 - CARA PAKAI: tombol CONTROL UBOT / CONTROL SEMUA UBOT / PANEL ditambahkan ke tabel tombol /start, plus langkah lengkap CONTROL SEMUA UBOT di halaman Panel & Perintah Bot (lib/caraPakai.js).

UPDATE v1.14.0 - ROLE TERTINGGI TANGAN KANAN, BLACKLIST BAWAAN, WATERMARK OWNER, OWNER KONTROL SEMUA UBOT
- UP ROLE: tangga role LITE < GOLD < PLATINUM < RESELLER < TANGAN KANAN (tertinggi). Pengguna bisa naik bertahap lewat tombol Up Role (RESELLER & TANGAN KANAN sekali bayar,
    harga dari /setharga). Pesan "sudah tertinggi" sekarang hanya untuk TANGAN KANAN. Diubah: selfrole.js.
- BLACKLIST BAWAAN: grup -1004452210075 dan t.me/logubotarta otomatis masuk blacklist untuk SEMUA ubot (seperti .addbl), tidak bisa dihapus lewat .delbl/.clearbl,
    tampil di .listbl. Berlaku di .bc / .autobc / .autobc2 / .cfd / .autocfd. Tambah lagi lewat config.json "default_blacklist": {"ids":[...],"usernames":[...]}. File: lib/defaultBl.js.
- WATERMARK (owner): PANEL OWNER > Watermark (tambah / hapus / lihat jumlah) atau /addwm teks, /delwm <nomor|all>, /listwm. Maks 30 watermark, dipakai bergantian pada ubot gratis (LITE).
    Jika belum ada, tetap memakai watermark_text di config.json. File: watermark.js, ownerpanel.js.
- OWNER KONTROL SEMUA UBOT: tombol CONTROL SEMUA UBOT di /start owner menampilkan semua ubot yang sedang aktif (8 per halaman), pilih lalu ketik command langsung di chat bot.
    Semua command terbuka untuk owner (tanpa batas paket / blokir admin). File: adminctl.js, plugins/admin.js, bot.js.

UPDATE v1.13.4 - TOMBOL SELEBAR KARTU (PANJANG KE SAMPING)
- <tg-button-row> tanpa align="center" supaya tiap tombol melebar penuh ke samping seperti contoh foto (sebelumnya rata tengah selebar teks). Diubah: lib/richButtons.js.

UPDATE v1.13.3 - TOMBOL TERSUSUN KE BAWAH (1 PER BARIS) SEPERTI FOTO
- /start dan .help: setiap tombol satu baris selebar kartu. Hanya baris Prev / Home / Next dan baris angka/jeda pendek yang tetap sebaris. Diubah: bot.js, plugins/_help.js, lib/richButtons.js.

UPDATE v1.13.2 - GRID TOMBOL SEPERTI CONTOH FOTO
- /start: semua tombol disusun grid 2 kolom (Buat Ubot | Preview, Live Chat | Beli Role, Up Role | Reset Prefix, Restart Userbot | BUY NOKOS MURAH, lalu panel staf); tombol ganjil terakhir selebar penuh.
- Rich button: baris pendek (Prev / Home / Next, angka) boleh 3-5 per baris, selain itu maksimal 2 per baris. Footer tetap di bawah tombol. Diubah: bot.js, lib/richButtons.js.

UPDATE v1.13.1 - TATA LETAK TOMBOL RAPI + AUTOBC/AUTOBC2 SEMUA JENIS PESAN
- Rich button ditata otomatis (lib/richButtons.js, tidyRow): angka/jeda pendek maks 5 per baris, teks sedang 4, teks panjang 2, sangat panjang 1;
    baris dipecah rata (mis. 6 tombol = 3+3, 10 tombol = 5+5) sehingga lebar seragam dan tidak ada tombol sendirian.
- .autobc / .autobc2 (+ .autocfd/.cfd lewat forward) mendukung SEMUA jenis pesan: teks, foto, video, stiker, voice, video bulat, gif, audio, dokumen,
    album (beberapa media), polling, kontak, lokasi, dice, dll. Album dan media khusus disalin utuh tanpa label "Diteruskan dari" (forward + dropAuthor);
    jika kirim langsung gagal selain karena flood/izin, otomatis dicoba salin. .autobc2 add menampilkan jenis pesan di daftar ([foto], [album], [polling], ...).
- Diubah: lib/richButtons.js, plugins/broadcast.js, plugins/share.js.

UPDATE v1.13.0 - RICH BUTTON, MENU SHARE DI ATAS, CARA PAKAI, NOTIF CHANNEL DETAIL
- RICH BUTTON: semua tombol menu yang dikirim bersama kartu Rich (/start, .help / Xhelp, kategori, panel owner/reseller/control ubot, beli role, share/autobc, broadcast, notif) sekarang tampil
    DI DALAM kartu sebagai <tg-button-row>/<tg-button> (pil lebar berwarna, seperti foto contoh). Dipasang sekali di core.js (fungsi tg) lewat lib/richButtons.js,
    jadi tidak ada menu yang terlewat. Warna dari field style (success hijau, danger merah, primary biru; tanpa style = biru). Ikon premium ikut tampil di dalam tombol.
    Tombol yang tidak bisa jadi rich button (web_app, switch_inline, request_*) tetap di keyboard biasa. Jika Telegram menolak, otomatis mengulang dengan keyboard biasa
    (dan dimatikan 30 menit bila ditolak 4x berturut-turut). Matikan manual: config.json "rich_buttons": false.
- .help: tombol MENU SHARE AUTO PROMOSI sekarang paling atas, di bawahnya tombol CARA PAKAI, lalu grid kategori lain (8 per halaman) + Prev / Home / Next.
    Ganti halaman kategori sekarang mengedit seluruh kartu (karena tombol ada di dalam kartu).
- CARA PAKAI (hl:u:N): panduan lengkap, halaman Prev / Menu / Next: Mulai Cepat, Role & Paket (harga dari pengaturan), Panel & Perintah Bot, lalu Daftar Menu
    semua kategori + command + fungsi + paket minimum (dibangun otomatis dari plugin, menu baru ikut muncul).
- NOTIF CHANNEL: kartu lebih detail: keterangan event, DATA PENGGUNA (nama, username, ID, profil, bahasa, Premium), detail event, STATUS AKUN (jabatan, paket, userbot, expired, prefix),
    STATISTIK BOT (waktu, total pengguna, online) + tombol Buka Profil / Buka Bot.
- File baru: lib/richButtons.js, lib/caraPakai.js. Diubah: core.js, plugins/_help.js, notify.js, package.json, README.txt.

UPDATE v1.12.0 - AUTO JOIN, TANGAN KANAN, FIX CONTROL UBOT, /START DROPDOWN
- AUTO JOIN: setiap akun ubot yang tersambung (baru login, bot restart, atau sudah tersambung sebelumnya) otomatis bergabung ke grup log
    https://t.me/logubotarta dan channel https://t.me/artapediaaaa. Tiap akun hanya di-join sekali (dicatat di data/db.json -> autojoined),
    jeda acak antar akun supaya aman dari FLOOD_WAIT. Atur di config.json: "auto_join_targets": ["logubotarta", "artapediaaaa"] ([] = mati).
- Kategori "Share" di .help diganti nama menjadi "MENU SHARE AUTO PROMOSI" (.help share tetap bisa dipakai).
- FIX tombol CONTROL UBOT tidak terlihat: menu /start diganti dari pesan "Membuka menu ..." lewat edit, dan edit itu tidak membawa data pengguna
    sehingga tombol CONTROL UBOT / PANEL OWNER / PANEL RESELLER hilang. Sekarang semua edit (/start, refresh, Reset Prefix, Kembali dari Beli Role) memakai kbOf(user).
- ROLE BARU TANGAN KANAN (default Rp7.000 sekali bayar, permanen): punya semua hak reseller + bisa memberi role LITE, GOLD, PLATINUM dan RESELLER.
    Beli: tombol Beli Role -> TANGAN KANAN. Owner bisa langsung memberi: /addtk <ID> (atau /addrole <ID> TK), cabut: /deltk <ID>, daftar: /tklist.
    Ubah harga: /setharga TK 7000 atau tombol Harga TANGAN KANAN di PANEL OWNER. Tombol PANEL TANGAN KANAN muncul di /start.
- OWNER bisa menambah RESELLER langsung: /addrole <ID> RESELLER, atau tombol Beri RESELLER di PANEL OWNER (perintah lama /addreseller tetap ada).
    Siapa boleh memberi apa: LITE/GOLD/PLATINUM = owner, reseller, tangan kanan | RESELLER = owner, tangan kanan | TANGAN KANAN = owner.
- /start: panduan Buat Ubot / Preview / Live Chat dibungkus dropdown "KLIK UNTUK BACA".
- File baru: autojoin.js. Diubah: bot.js, manager.js, db.js, access.js, selfrole.js, resellerpanel.js, ownerpanel.js, notify.js, paket.js, plugins/_help.js, plugins/ping.js, config.json.

UPDATE v1.11.0 - TAMPILAN HELP/PREVIEW SEPERTI FOTO, ROLE RESELLER, BUY NOKOS
- TAMPILAN .help (Xhelp) dan tombol Preview dibuat seperti contoh foto: kartu Rich (ornamen, kotak judul brand, tabel Info/Nilai, centang Rich render/Premium reply),
    bagian TENTANG USERBOT, grid tombol kategori (8 per halaman, 2 per baris) + Prev / Home / Next, footer "UBOT BY ARTA PEDIA OFFICIAL @artapediaubot".
    Klik tombol kategori -> daftar command kategori itu (Prev/Next antar kategori, tombol Menu kembali). .help <kategori|command> tetap memakai tampilan detail.
    Atur di config.json: "help_buttons": false (kembali ke dropdown), "official_handle": "artapediaubot", "brand": "UBOT ARTA PEDIA". Kategori Share tampil di halaman 1.
- Teks /start mengikuti foto: penjelasan Buat Ubot / Preview / Live Chat, kalimat "Setelah connect ...", garis, "Powered by UBOT ARTA PEDIA".
- Tombol "Tulis Claim Userbot Free" diganti "BUY NOKOS MURAH" -> https://www.tokonokosarta.my.id/ (ubah di config.json "shop_url").
- ROLE RESELLER: dibeli lewat Beli Role (QRIS Artapedia Pay), harga default Rp5.000 sekali bayar (owner ubah: /setharga RESELLER 5000 atau tombol Harga RESELLER di PANEL OWNER).
    Reseller menambahkan role ke pengguna: /addrole <ID> <LITE|GOLD|PLATINUM> [hari]  (atau balas/forward pesan penerima: /addrole GOLD 30),
    atau tombol PANEL RESELLER di /start. Reseller tidak bisa menurunkan role yang lebih tinggi dan tidak bisa memberi role ke owner/reseller.
    Owner juga bisa memakai /addrole. Pemberian role dicatat dan dikirim sebagai notifikasi Rich ke channel.
- File baru: resellerpanel.js. Diubah: plugins/_help.js, bot.js, selfrole.js, ownerpanel.js, notify.js.

UPDATE v1.10.1 - EMOJI PREMIUM OTOMATIS
- Tombol "Muat semula" (.help) dan "Muat emoji premium" (panel .ping dll.) sekarang DITEKAN OTOMATIS oleh userbot beberapa detik setelah menu/panel terkirim,
    jadi emoji premium terpasang tanpa klik manual. Berlaku saat "inline feedback" di @BotFather belum aktif (jika sudah aktif, bot memasangnya sendiri).
    Matikan dengan config.json "auto_load_premium": false.

UPDATE v1.10.0 - CONTROL UBOT, PANEL OWNER, UBOT GRATIS INSTAN, .env
- TEMPAT KUNCI ARTAPEDIA PAY (pilih salah satu):
    1) config.json -> "gateway": { "provider": "artapedia", "api_key": "...", "secret": "..." }   (sudah disiapkan kolomnya)
    2) file .env di folder yang sama dengan bot.js (contoh ada di .env.example): ARTAPEDIA_PAY_KEY=... dan ARTAPEDIA_PAY_SECRET=...
    3) environment variable server / panel (Pterodactyl: Startup > Variables). Prioritas: environment/.env lebih dulu, lalu config.json.
    Jangan bagikan config.json / .env (berisi kunci dan token bot).
- CONTROL UBOT: pengguna yang ditunjuk lewat .addadmin melihat tombol CONTROL UBOT di /start. Klik -> daftar akun ubot yang boleh dikontrol -> pilih akun
    -> kartu status (akun, online/offline, paket, expired, prefix) + tombol Menu Command / Ganti Akun. Lalu admin mengetik command langsung di chat bot.
- UBOT GRATIS INSTAN: pengguna yang menekan Buat Ubot (atau Ubot Gratis) langsung disetujui sebagai LITE tanpa group persetujuan; owner memang tidak perlu persetujuan.
    Matikan dengan config.json "free_auto_approve": false (kembali ke persetujuan lewat group). Pengguna yang pernah DITOLAK tetap lewat alur persetujuan.
- PANEL OWNER: tombol PANEL OWNER di /start (khusus owner): ubah harga & masa aktif tiap role (LITE/GOLD/PLATINUM), tambah owner, hapus owner, daftar owner.
    Perintah: /harga | /setharga GOLD 5000 30 | /addown <ID> (atau balas/forward pesan orangnya) | /delown <ID> | /owners.
    Owner di config.json adalah owner utama dan tidak bisa dihapus lewat bot. Harga & owner tambahan tersimpan di data/db.json (menimpa config.json).
- File baru: adminctl.js, ownerpanel.js, .env.example. Diubah: bot.js, access.js, selfrole.js, cfgload.js, plugins/admin.js, config.json.

UPDATE v1.9.1 - JOIN GRUP / FOLDER / AUTOJOIN (menu Share, paket LITE)
- .joingb <link> [link lain ...] (atau balas pesan berisi link): akun ubot bergabung ke grup/channel. Maks 20 link sekali jalan, jeda 5-12 detik antar link.
    Mendukung t.me/+hash, t.me/joinchat/hash, t.me/namagrup, @link tersembunyi di teks. Hasil per link ditampilkan (berhasil / sudah ada / menunggu admin / gagal).
- .joinfolder <link t.me/addlist/xxxx>: folder dipasang di akun dan semua grup di dalamnya di-join. Jika folder sudah ada, hanya grup baru yang di-join.
    Perlu library telegram yang mendukung chatlists (npm i telegram@latest jika muncul pesan "belum mendukung folder").
- .autojoin on|off: ubot membaca link grup di SEMUA pesan masuk (grup, channel, private), mengantrekan, lalu join satu per satu
    dengan jeda ACAK 10-20 menit tiap permintaan. Channel siaran, link pesan, dan bot dilewati. Antrian tersimpan dan lanjut setelah restart.
    .autojoin status | list | clear | jeda <min> <max> (menit, min 5 maks 180). Laporan tiap join dikirim ke bot kontrol (config "autojoin_report": false untuk mematikan).
    Terkena FLOOD_WAIT -> otomatis jeda lalu lanjut; akun penuh (batas grup Telegram) -> AutoJoin dimatikan dan Anda diberi tahu.
- File baru: plugins/join.js.

UPDATE v1.9.0 - ARTAPEDIA PAY + NOTIF CHANNEL + PILIHAN UBOT + AUTOBC2
- PEMBAYARAN: gateway QRIS sekarang Artapedia Pay (https://www.tokonokosarta.my.id/api/pay). Dipakai Beli Role / Up Role otomatis dan .qris.
    Pasang API key owner (jangan taruh di chat): environment ARTAPEDIA_PAY_KEY (dan ARTAPEDIA_PAY_SECRET jika memakai tanda tangan HMAC),
    atau config.json -> "gateway": { "provider": "artapedia", "api_key": "...", "secret": "..." }.
    QRIS dibuat lewat /deposit/create, status dicek tiap 5 detik lewat /deposit/check, tombol Batal memanggil /deposit/cancel.
    Pelanggan yang jualan lewat .qris: .setartapedia <api_key> [secret]. BuatQris/.setbuatqris tetap didukung.
    Catatan: Artapedia membatasi pembuatan QRIS 5/menit per API key.
- NOTIFIKASI CHANNEL (Rich): isi config.json "notify_channel_id": "-100xxxxxxxxxx" (atau env NOTIFY_CHANNEL_ID) dan jadikan bot ADMIN channel.
    Dikirim saat: pengguna baru /start, pengguna mulai buat ubot, ubot tersambung, beli role, up role. Kosong = nonaktif.
- TOMBOL BUAT UBOT: pengguna yang belum punya role diberi pilihan "Ubot Gratis" atau "Beli Role" beserta tabel perbedaannya
    (harga, aktivasi, jumlah command, watermark, fitur terkunci). Ubot Gratis = LITE, menunggu persetujuan owner/reseller, broadcast diberi watermark.
- .autobc2 : autobc dengan BANYAK pesan. .autobc2 add (balas pesan, maks 10) | .autobc2 list | .autobc2 del <no> | .autobc2 clear
    .autobc2 -> wizard tombol (jeda, target, copy/forward, jeda antar chat, urutan pesan: berurutan / gantian / acak) | .autobc2 stop
    Mode berurutan: watermark hanya di pesan terakhir tiap chat.
- File baru: notify.js. Diubah: gateway.js, selfrole.js, bot.js, login.js, plugins/qris.js, plugins/share.js, config.json.

UBOT ARTA PEDIA - ARTA PEDIA ID

UPDATE v1.8.0 - REBRAND + MENU SHARE (PROMOSI) + AUTOCEK + ADDADMIN
- Rebrand: semua nama bot/brand/developer diganti UBOT ARTA PEDIA / ARTA PEDIA ID (config.json "brand", developer_url, channel_url -> https://t.me/artapediaubot).
  URL API pihak ketiga (apiii-xrina.my.id) sengaja TIDAK diubah supaya fitur AI/media tetap jalan. Ganti sendiri di config.json (ai_restapi_url, ai_gemini_url) bila punya API sendiri.
- MENU SHARE (baru, khusus promosi; paket minimal LITE = userbot gratis boleh pakai):
    .autobc  (balas pesan)  wizard tombol: jeda putaran (10/15/20/25/30/35 menit, 1-5 jam) -> target (Grup / Kontak / Channel) -> otomatis hitung jumlah chat
                            -> cara kirim (Copy Paste / Forward) -> jeda antar chat 1-10 detik -> konfirmasi -> Mulai
    .autobc status | .autobc stop | .stopautobc
    .cfd [detik] (balas pesan) forward cepat sekali ke SEMUA grup | .cfd stop
    .autocfd <jeda> [detik] (balas pesan) cfd berulang otomatis | .autocfd status | .autocfd stop
    .bc (lama), .addbl .delbl .listbl .clearbl (blacklist) kini juga masuk menu Share.
    Chat yang di-blacklist TIDAK menerima apa pun dari .bc / .autobc / .cfd / .autocfd.
    Channel yang bukan milik/admin Anda otomatis dilewati (tidak bisa diposting).
- WATERMARK (KHUSUS UBOT GRATIS = paket LITE): .bc .autobc .cfd .autocfd diberi "UBOT AUTO PROMOSI GRATIS @artapediaubot"
    (copy = ditempel di akhir teks/caption; forward = dikirim sebagai pesan susulan). GOLD, PLATINUM, reseller, owner TIDAK diberi.
    config.json: "share_watermark": true|false, "watermark_text": "...", "watermark_tiers": ["LITE"]
- .autocek  : tiap 3 menit (config "autocek_interval_min") bot memilih SATU akun acak yang tersambung ke ubot, akun itu kirim /start ke @SpamBot,
    hasilnya (bebas limit / terkena limit) dikirim ke pemilik akun lewat bot kawalan saat status berubah.
    .autocek (cek akun ini sekarang) | .autocek status | .autocek on|off (owner)
- ADMIN LEWAT BOT KONTROL: .addadmin [@username|ID] (atau balas pesan orangnya) / .deladmin / .listadmin (maks 5 admin) - dijalankan pemilik dari akun ubot.
    Admin TIDAK mengetik di akun ubot. Admin membuka bot kontrol, tekan /start sekali, lalu mengetik command (prefix ubot pemilik, atau "/do autobc") di chat bot.
    Hasil, kartu, dan panel tombol (.autobc / .bc) dikirim balik oleh bot ke chat admin. /menu = daftar command, /akun = pilih ubot bila admin di beberapa ubot.
    Command yang butuh pesan promo (.autobc .bc .cfd .autocfd): kirim/forward pesan promonya ke bot, lalu REPLY pesan itu dengan command-nya.
    Isi pesan (teks + format, foto/video/file maks 20 MB) disalin ke Saved Messages akun ubot lalu dipakai sebagai sumber kiriman.
    Keluaran berupa file/gambar dari command lain masuk ke Saved Messages akun ubot, bukan ke chat admin.
    Diblokir untuk admin: addadmin/deladmin/listadmin/setprefix/setfooter/setnorek/setqr/delset, kategori Owner & Reseller dan VPS & Panel. Paket & maintenance pemilik tetap berlaku.
- Perbaikan: plugin extra50fun & extra50util (50 fitur) sebelumnya gagal dimuat (kit.js), sekarang jalan.
- File baru: watermark.js, plugins/share.js, plugins/autocek.js, plugins/admin.js. Dihapus: plugins/autobc.js (diganti share.js).
  File diubah: panel.js (relay admin), plugins/broadcast.js (watermark + admin), plugins/blacklist.js, manager.js, paket.js, plugins/_help.js, kit.js, config.json.

UBOT - bot kawalan + userbot untuk ramai pelanggan (Node.js)

UPDATE v1.7.5 - LAGU PENUH DI DALAM KARTU .HELP + TEKS DIRAPIKAN (v1.7.3: + 100 FITUR BARU)
- Lagu "Sesuatu di Jogja" kini AUDIO yang tertanam DI DALAM kartu .help (satu pesan dengan daftar fitur, ada tombol play), bukan teks lirik dan bukan pesan terpisah.
  Kode: jogjamenu.js (dipanggil dari plugins/_help.js). Lagu diunduh PENUH sekali lalu disimpan di data/jogja/ (file_id dipakai ulang, jadi .help berikutnya cepat).
  WAJIB agar lagu penuh (bukan 30 detik): jalankan `npm install` (paket @distube/ytdl-core + yt-search, tanpa ffmpeg), ATAU pasang yt-dlp (+ffmpeg) di server / set env YTDLP_BIN.
  Jika keduanya belum ada, bot memakai pratinjau 30 detik sementara dan mencoba mencari versi penuh lagi (maks 1x per 6 jam). Lihat console: baris "[jogja] ...".
  Jika Telegram menolak audio di dalam kartu, menu otomatis tampil tanpa audio (tidak error) dan audio dicoba lagi 30 menit kemudian.
- Teks menu .help dirapikan: huruf awal kapital, ejaan Indonesia (guna->gunakan, hantar->kirim, kad->kartu, dst.), dan cara pakai (.perintah <arg>) dipisah ke baris sendiri berformat kode.
- Dihapus: command .jogja dan .lirik, serta semua lirik di menu.
- 100 fitur baru (semua dihitung lokal, tanpa API, hasil kartu Rich + emoji premium):
    plugins/x100teks.js    (Teks & Font, 30)  alay flip spaced bubble fullwidth smallcaps mocking snakecase camelcase kebabcase constcase sentence swapcase freqhuruf katapanjang katasering cekanagram hapusvokal vokali hashtag unicodeinfo asciikode teksbiner binerteks tekshex hexteks caesar atbash leetspeak nato crc32
    plugins/x100kalk.js    (Matematik & Konversi, 30)  md5 sha1 sha256 sha512 hmac jwtdecode regextest randhex hex2hsl kontras cidr httpstatus mime portinfo kuadrat faktor pecahan persenubah stddev modus kombinasi permutasi trig segitiga volume hitungppn hargajual bep tabungan inflasi
    plugins/x100harian.js  (Utilitas, 20)  umurlengkap ultah weton tambahhari harikerja kalender sisahari cekprovider plat bmr airminum tidurideal darah dariromawi konvkecepatan bbideal detakjantung ukuransepatu bensin
    plugins/x100seru.js    (Hiburan, 20)  jodoh ramalan hoki kerang truth dare wyr tebakkata kartu lotre gombal receh film julukan kelas makan mancing gacha tantangan mood
  File baru: x100kit.js (pembantu bersama). File diubah: plugins/lagu.js, package.json, README.txt.

UPDATE v1.7.2 - LOGIN USERBOT: ALASAN SEBENARNYA (BUKAN "AUTH_USER_CANCEL")
- "AUTH_USER_CANCEL" hanyalah pembungkus dari gramJS: muncul untuk SEMUA ralat sebelum kode login terkirim (juga saat /cancel).
  login.js kini menyimpan ralat aslinya dan menampilkannya sebagai kartu yang jelas: terlalu banyak percobaan (FLOOD_WAIT / PHONE_NUMBER_FLOOD
  + berapa lama tunggu), nomor diblokir / tidak sah, API ID / Hash bermasalah, server tidak bisa mencapai Telegram, kode tidak terkirim.
  /cancel di langkah nomor kini menampilkan "Login Dibatalkan" (bukan "Login Gagal"). api_hash kosong ditolak lebih awal dengan pesan jelas.
  Ralat asli juga tercetak di console: cari baris "Ralat login:" dan "Login gagal:".

UPDATE v1.7.1 - KARTU QRIS GATEWAY + 15 FITUR BARU (SUS & SERU, BERGUNA)
- .qris (mode payment gateway): gambar QR kini ada DI DALAM kartu Rich (judul -> keterangan -> gambar QR -> tabel info -> centang -> footer),
  semua baris berikon premium berbeda. Saat lunas / kedaluwarsa kartu diganti DI TEMPAT (tanpa gambar) - perlu inline feedback aktif
  (BotFather /setinlinefeedback, 100%); jika tidak aktif, kartu LUNAS dikirim sebagai pesan baru.
  Cadangan otomatis: jika QR gagal dipasang di kartu, QR dikirim sebagai foto terpisah + kartu tanpa gambar.
  Teknis: QR diunggah sekali ke chat bot Anda (file_id) lalu pesan sementaranya dihapus; panel.js kini menerima media[] dan punya updatePanel().
- plugins/sus.js  (kategori Hiburan)  - semua hasil kartu Rich + emoji premium:
    .sus [@nama]         sus-meter (tetap per nama per hari) + 3 bukti + vonis
    .eject [@nama]       lempar ke luar pesawat: "was / was not an Impostor"
    .impostor            pilih impostor acak dari anggota grup (chat pribadi: kamu vs dia)
    .emergency <topik>   rapat darurat + voting tersangka (acak)
    .khodam [@nama]      cek khodam (tetap per nama)
    .roast [@nama]       roasting ringan
    .alasan [jenis]      alasan siap tempel: telat | izin | ngilang | tolak | deadline
    .tebak               tebak-tebakan, jawaban di dropdown
- plugins/berguna.js  (kategori Utilitas)  - alat harian + alat jualan:
    .terbilang <angka>                 1250000 -> satu juta dua ratus lima puluh ribu rupiah
    .patungan <total> <orang> [pajak%] [service%]   bagi tagihan, pembulatan per Rp100
    .untung <modal> <jual> [jumlah]    untung/rugi, margin, markup
    .diskon <harga> <persen> [persen2] diskon (bisa bertingkat)
    .cekpass <kata sandi>              kekuatan kata sandi (isinya tidak ditampilkan ulang)
    .jam [kota ...]                    jam dunia: jakarta makassar jayapura kl singapore tokyo seoul mekkah dubai london paris newyork la sydney
    .invoice <nominal> <barang>        invoice rapi + terbilang + rekening dari .setnorek
  Semua masuk paket LITE (ikut kategori Hiburan / Utilitas). Plugin ini berdiri sendiri: cukup salin file ke folder plugins/.

UPDATE v1.7.0 - /START RINGKAS + BELI ROLE / UP ROLE MANDIRI (QRIS OTOMATIS)
- /start dirombak: satu kartu ringkas (judul -> tabel "Akun Anda" dengan emoji premium berbeda tiap baris -> dropdown "Info Bot" -> catatan -> footer).
- Tombol baru di /start: "Beli Role" dan "Up Role". Pembayaran lewat payment gateway QRIS (BuatQris), role aktif OTOMATIS setelah lunas, tanpa kirim bukti.
    Beli Role : beli / perpanjang role (LITE / GOLD / PLATINUM) -> role aktif + tambah hari (default 30 hari)
    Up Role   : naik ke role lebih tinggi -> masa aktif tetap
    Pintasan  : /role  dan  /uprole
- Harga default Rp1.000 per role. Ubah di config.json:
    "self_role": { "enabled": true, "price": 1000, "days": 30 }
    harga per role (opsional): "self_role": { "prices": { "LITE": 1000, "GOLD": { "price": 1000, "days": 30 }, "PLATINUM": 1000 } }
    matikan fitur: "self_role": { "enabled": false }
- WAJIB: kredensial gateway owner. account_id ada di config.json (gateway.account_id); secret token isi lewat environment BUATQRIS_SECRET_TOKEN.
  Uang masuk ke akun BuatQris owner; owner juga dapat notifikasi "Pembayaran diterima" tiap ada yang beli.
- Status pesanan tersimpan di data/db.json (kind "selfrole") + gateway_tx.json; setelah restart bot, pemantauan pembayaran disambung lagi otomatis.
- Perbaikan: QR Beli Role kini dikirim lewat unggahan langsung (sebelumnya gagal terkirim). Rincian pembayaran tampil sebagai kartu Rich + emoji premium,
  begitu juga hasil .qris di userbot (foto QR hanya caption singkat; status LUNAS / kedaluwarsa juga kartu Rich).
- Biaya admin gateway dibebankan ke pembeli (gateway.fee_by = "buyer"). Ubah ke "seller" supaya total bayar tetap sama dengan harga.
- File baru: selfrole.js. File diubah: bot.js, plugins/qris.js, config.json, package.json.

PASANG (v1.6.5)
0. Jika server Offline selepas Start: baca baris TERAKHIR di console (tekan anak panah bawah). Bot kini mencetak sebab yang jelas.
   Punca paling biasa: config.json tiada / bot_token belum diisi / JSON ada koma salah.
   Bot kini membuat config.json sendiri daripada contoh pada permulaan pertama, dan membaiki koma berlebihan.
   Alternatif tanpa edit fail (Pterodactyl > Startup / Variables): BOT_TOKEN  API_ID  API_HASH  GEMINI_API_KEY  OWNER_IDS=123,456
   (atau UBOT_<NAMA_KUNCI> untuk mana-mana kunci lain, contoh UBOT_BRAND). Nilai ini menimpa config.json.
1. Upload semua fail ke folder utama server (sebelah package.json), kemudian Unarchive.
2. Salin config.example.json jadi config.json dan isi:
   api_id, api_hash  -> my.telegram.org
   bot_token         -> @BotFather
   owner_ids         -> ID Telegram owner (boleh lebih dari satu)
   (JANGAN kongsi nilai ini. Setiap baris ada koma kecuali baris terakhir.)
3. @BotFather -> /setinline -> pilih bot (wajib supaya panel .help dan .bc keluar dalam chat).
4. Startup command: npm start  (menjalankan node bot.js)
5. Tekan Start.

GROUP PERSETUJUAN
- Buat satu group (hanya owner, reseller dan bot), masukkan bot.
- Owner hantar /setgroup dalam group itu.
- Bila pelanggan tekan "Buat Userbot", kad permintaan keluar dalam group dengan butang REJECT | ACCEPT.
- Hanya owner dan reseller boleh menekannya. Owner tak perlu minta kebenaran.

ARAHAN OWNER (bot)
/setgroup                 tetapkan group persetujuan (hantar dalam group)
/addreseller <ID>         tambah reseller (atau balas mesej orangnya)
/delreseller <ID>         buang reseller
/resellers                senarai reseller

ARAHAN PELANGGAN (bot)
/start                    panel utama
/cancel                   batal proses login
/stopuserbot              hentikan dan padam userbot sendiri
/beli                     beli paket (DANA / QRIS)   |   owner: /payset /setharga /setdana /setqris /pay   |   staf: /orders

ARAHAN USERBOT (dalam Telegram)
.help   .ping   .ssprofile   .bc [delay]   .setexpired <hari> [ID]   .autorich <permintaan>   .addbl / .delbl / .listbl / .clearbl
blacklist.json (pilihan) -> senarai ID chat yang dilangkau semasa broadcast, contoh [-1001234567890]

v1.2 - 150 COMMAND BARU (semua keluar sebagai kad Rich: jadual + emoji premium)
Lihat senarai: .help (ringkasan kategori)  |  .help <kategori>  contoh .help teks  |  .help <command>  contoh .help cuaca
- Matematik & Konversi (29): .conv .temp .bmi .percent .disc .tip .age .datediff .dayof .addday .bin .roman .fact .prime .gcd .lcm .fib .stat .sortnum .rand .loan .compound .tax .speed .countdown .week .leap .zodiac .shio
- Teks & Font (38): .upper .lower .title .caps .reverse .repeat .slug .camel .snake .kebab .rot13 .morse .tobin .tohex .urlenc .urldec .palindrome .sortlines .uniq .numlines .shuffle .mock .vapor .clap .count + font: .bold .italic .bolditalic .mono .script .fraktur .double .bubble .square .smallcaps .flip .strike .underline
- Generator (11): .uuid .token .color .hex2rgb .rgb2hex .lorem .name .otp .emoji .mac .nick
- Rich & Format (6): .table .checklist .bullets .card .progress .code
- Hiburan (22): .roll .rps .slots .love .iq .fortune .truth .dare .wyr .pantun .gombal .joke .quote .motivasi .hug .slap .kiss .shrug .lenny .tableflip .unflip .lucky
- Web & Info (23): .cuaca .crypto .kurs .ip .dns .short .unshort .qr .wiki .dict .gh .ghrepo .npm .pypi .anime .pokemon .negara .advice .catfact .cat .dog .cekweb .gempa  (guna API awam percuma; perlu internet pelayan)
- Islam & Malaysia (6): .solat .quran .hijri .kiblat .doa .zakat
- Group Management (12): .ginfo .members .admins .bots .tagall .link .msglink .firstmsg .type .say .me .save
- Sistem (3): .uptime .sysinfo .mem
Plugin baru: plugins/math.js text.js gen.js rich.js fun2.js web.js islam.js chat.js sys.js ; pembantu: kit.js (K.plugin(nama, kategori, [{cmd, alias, desc, run}]))

TAMBAH COMMAND BARU
Letak fail .js dalam folder plugins/ (lihat plugins/ping.js sebagai contoh).

KESELAMATAN
- data/db.json mengandungi sesi login pelanggan (akses penuh akaun mereka). Jangan kongsi.
- Pelanggan menghantar kod login dengan sempang (1-2-3-4-5). Bot memadam mesej itu serta-merta.

JIKA .help / .bc TIDAK MUNCUL TERUS DALAM CHAT
- Mesej yang diedit akan menyatakan SEBAB (contoh BOT_RESPONSE_TIMEOUT) dan panel dihantar ke chat bot.
- Console papar baris "[inline help]" / "[inline bc]" yang menunjukkan sama ada bot menerima query dan
  sama ada Telegram menerima jawapan (rich atau teks).
- Urutan percubaan: Rich Message (jadual) -> teks biasa (bahagian boleh dibuka) -> chat bot kawalan.
- Bot memberitahu userbot ID query + ID hasil terus (satu proses), jadi panel Rich boleh dihantar walaupun
  GramJS (versi lama) tidak dapat membaca jawapan inline jenis Rich.
- Jika panel keluar sebagai TEKS, baris kecil di hujung mesej menyatakan sebab panel Rich gagal.

EMOJI PREMIUM (INLINE)
- Telegram tidak membenarkan emoji premium dalam hasil inline yang PERTAMA. Bot menghantar panel tanpa emoji premium,
  kemudian MENGEDITNYA supaya emoji premium muncul. Ini berfungsi jika PEMILIK BOT ada Telegram Premium
  (akaun pelanggan tak perlu Premium; semua orang nampak). Jika pemilik bot tiada Premium, emoji biasa dipaparkan.
- Di @BotFather: /setinlinefeedback -> pilih bot -> Enabled (100%). Tanpa ini, tekan butang "Muat emoji premium" pada panel.

MASA AKTIF (EXPIRED)
- config.json: "default_days": 30 (hari aktif untuk userbot baharu pelanggan; 0 = tiada had), "timezone_offset": 7, "timezone_label": "WIB".
- Owner tiada had masa aktif.
- .setexpired <hari>            tambah hari (diri sendiri, atau pemilik mesej yang direply)
- .setexpired <hari> <ID>        tambah hari kepada ID Telegram itu (hari negatif = kurangkan)
- Hanya owner / reseller. Bila tamat: userbot dihentikan dan pelanggan menerima notis "Userbot anda telah expired" di bot.
- Tambah hari selepas expired -> userbot dihidupkan semula secara automatik.

AI .buildauto = GEMINI SAHAJA (kunci: ai_restapi_url / GEMINI_API_KEY). Tidak guna OpenAI. ai_provider lalai kini "gemini".
AI RICH (.autorich) - GEMINI
- config.json: "ai_restapi_url" (dari Google AI Studio). Pilihan: "gemini_model" (kosong = gemini-3.8-flash, kemudian
  gemini-3.5-flash-lite dan gemini-flash-latest jika model tiada), "ai_cooldown" (saat, lalai 15),
  "ai_daily_limit" (had harian pelanggan, lalai 30; owner/reseller tiada had; 0 = tiada had).
- .autorich <permintaan>   atau balas (reply) satu mesej dengan .autorich
- Keluar notis "Ai sedang menghasilkan Payload...", kemudian Rich Message: jadual, kotak semak, emoji premium
  (hanya ID dalam palet richai.js), butang pautan automatik daripada link dalam payload, dan butang PM ke akaun anda.
- Kunci Gemini dikongsi oleh semua userbot, jadi had penggunaan melindungi kuota anda.

RUPA .help
- Banner (BANNER_TOP / BANNER_BOTTOM dalam plugins/_help.js) ialah jubin emoji premium berurutan kiri -> kanan.
  Jika gambar kelihatan bersepah, tukar susunan ID di situ.

JIKA .autorich GAGAL ("API key Gemini tidak sah / ditolak")
- Taip  .autorich test  -> memaparkan kunci (bertopeng), senarai model yang kunci anda boleh guna, dan keputusan ujian setiap model.
- Mesej ralat kini memaparkan teks sebenar daripada Google. Kunci dibersihkan automatik (ruang / petikan dibuang).
- Jika model tertentu ditolak, bot mencuba model seterusnya. Anda boleh tetapkan "gemini_model" dalam config.json
  kepada model yang disenaraikan oleh .autorich test.

BLACKLIST BROADCAST (.addbl)
- .addbl                 tambah chat ini ke blacklist (dilangkau semasa .bc)
- .addbl <ID | @username> tambah chat lain
- .delbl [ID | @username] buang;  .listbl senarai;  .clearbl kosongkan semua
- Disimpan bagi setiap pengguna dalam data/db.json. blacklist.json (global) masih berfungsi untuk semua userbot.
- ID -1001234567890 dan 1234567890 dianggap sama (dinormalkan).

SIMPANAN (.setqr / .get)
- .setqr [label]  (balas gambar QR, atau hantar gambar dengan capsyen .setqr) ; .set <nama> ; .setnenek (nama bebas)
- .get qr rm5 [catatan]  atau  .getqr rm5 catatan : hantar semula QR + jadual Rich (Nominal, Penerima, Catatan, Masa, Status)
- .getnenek : hantar semula simpanan ; .get nenek <teks> : tambah jadual Maklumat
- .listset  senarai ; .delset <nama> buang. Maksimum 50 simpanan, fail <= 20MB. Fail gambar disimpan dalam data/saved/.

FITUR TAMBAHAN (v1.1) - semua guna kad Rich (jadual + kotak semak) dan emoji premium; jika Rich gagal, jatuh balik ke teks biasa
Utilitas
  .id                       ID chat, akaun anda, mesej yang direply
  .info [@user|ID|reply]    maklumat pengguna / chat
  .calc <ungkapan>          kalkulator selamat: .calc 12*(3+4)  .calc sqrt(144)  .calc 2^10
  .time [zon]               waktu dunia: .time | .time myt | .time +8
  .b64 enc|dec <teks>       Base64          .hash <md5|sha1|sha256|sha512> <teks>      .pass [panjang]
  .afk [sebab]              mod AFK: balas PM/mention automatik (jarak 10 minit setiap chat);
                            hantar mesej biasa untuk matikan AFK (notis dihantar di bot)
Catatan & Tugas
  .setnote <nama> <teks>    simpan catatan (atau balas mesej)   .note <nama>   .notes   .delnote <nama>
  .todo                     senarai tugas berkotak semak: .todo add <teks> | done <no> | undo <no> | del <no> | clear
  .remind <masa> <teks>     peringatan: .remind 10m minum ubat | 1h30m | 2d (min 10 saat, maks 30 hari)
                            dihantar oleh bot ke chat peribadi anda.  .reminders   .delremind <no>
AI (Gemini, kongsi had dengan .autorich)
  .ai <soalan>   .tr <bahasa> <teks>   .sum (balas mesej panjang)   .fix <teks>
Group Management
  .del (reply)   .purge (balas mesej pertama; padam hingga sekarang, maks 500)   .pin / .unpin (reply)
Hiburan
  .pick a | b | c   .dice [sisi]   .coin   .8ball <soalan>   .rate <teks>
Owner / Reseller
  .stats                    statistik sistem: online, expired, hampir tamat, memori, uptime
  .listuser [expired|soon|online]   senarai pengguna     .cekuser [ID|reply]   semak pengguna (sesi login tidak dipaparkan)

Perubahan teknikal: ui.js (pembantu kad Rich kongsi), manager.js (hook onClient untuk plugin yang perlu mesej masuk),
plugins/autorich.js (eksport checkLimit), plugins/_help.js (kategori & ikon baharu).
Data baharu disimpan dalam data/db.json bagi setiap pengguna (notes, todos, reminders, afk).

MENU .help (v1.2.1)
- .help memaparkan setiap kategori sebagai bahagian boleh dibuka (dropdown) berserta ikon dan bilangan command, contoh: "Umum (11)".
- .help <kategori> membuka kategori itu terus; .help <command> memaparkan butiran satu command.
- Jika Telegram menolak mesej (contoh: terlalu besar), bot turun automatik: dropdown penuh -> dropdown nama command sahaja
  -> dropdown tajuk ringkas -> jadual kategori -> teks biasa (blockquote expandable). Lihat console: [inline help] dijawab (<tahap>).

MEDIA & ROOT MENU .help (v1.2.2)
  .setphoto            balas (reply) gambar -> dipaparkan dalam menu .help (di antara hiasan atas dan tajuk)
  .setvideo            balas (reply) video  -> dipaparkan dalam menu .help (maks 20MB setiap media)
  .delphoto / .delvideo   buang media itu
  .helpmedia [auto|embed|separate|off]   status media dan mod paparan
  .setroot @username   tukar teks "Rich render via @..." dalam .help (contoh: .setroot @NikzStury); .setroot reset = kembali ke bot kawalan
- Media disimpan di data/helpmedia/<ID>/ dan dimuat naik sekali ke bot kawalan (muncul sebagai satu mesej dalam chat bot anda)
  untuk mendapatkan file_id. Anda mesti pernah menekan /start pada bot kawalan.
- Mod auto (lalai): media dicuba dipasang DALAM mesej Rich. Jika Telegram menolaknya, bot belajar (dalam memori) lalu menghantar
  media sebagai mesej biasa tepat sebelum menu. Console memaparkan sebab penolakan Telegram:
  "[inline help] jawapan "rich-m" ditolak Telegram: ..." dan "[help] media tidak dapat dipasang dalam mesej Rich ...".
- Mod separate = sentiasa mesej biasa sebelum menu. Mod off = media tidak dipaparkan. Mod embed = paksa dalam mesej Rich.

PAKET LITE / GOLD / PLATINUM (v1.3.0)
  Fitur                                 LITE  GOLD  PLATINUM
  Utiliti asas (.id .calc .time .afk)   ya    ya    ya      
  Catatan, todo, peringatan             ya    ya    ya      
  Teks & Font                           ya    ya    ya      
  Matematik & Konversi                  ya    ya    ya      
  Islam & Malaysia                      ya    ya    ya      
  Hiburan                               ya    ya    ya      
  Web & Info (cuaca, kurs, wiki)        -     ya    ya      
  Generator                             -     ya    ya      
  Rich & Format                         -     ya    ya      
  Group Management                      -     ya    ya      
  Simpanan (.setqr .getqr)              -     ya    ya      
  AI (.ai .tr .sum .fix)                -     ya    ya      
  Broadcast & Blacklist                 -     -     ya      
  AI Rich (.autorich)                   -     -     ya      
  Kustom .help (foto/video/root)        -     -     ya      
  Had AI harian (ai_daily_limit x)      -     x1    x3
  Command terbuka                       128   192   204     

  OWNER = semua fitur. Reseller tanpa paket sendiri = PLATINUM. Pengguna lama tanpa paket = config.json "default_paket" (lalai PLATINUM),
  jadi pelanggan sedia ada tidak kehilangan fitur. Pembahagian ditetapkan dalam paket.js (CATEGORY_MIN, COMMAND_MIN, PLUGIN_MIN) - ubah di situ.
- Beri paket (owner/reseller, tulis dalam chat mana-mana dari userbot anda):
    .addlite <hari> [ID|@user]     .addgold <hari> [ID|@user]     .addplat <hari> [ID|@user]
  atau balas mesej pembeli dengan .addgold 30. Tanpa hari = default_days (30). Hari TERKUMPUL pada baki sedia ada.
  Pembeli baharu terus diluluskan (boleh tekan Buat Userbot) dan dimaklumkan di bot. Beri paket lain kepada pembeli sama = naik/turun taraf.
- .paket = jadual perbandingan + paket anda. Staf: .paket <ID> = paket pengguna itu.
- .ping memaparkan paket (LITE/GOLD/PLATINUM/OWNER) dengan ikon premium masing-masing + bilangan command terbuka.
- Command di luar paket: ditolak dengan mesej "khas paket X ke atas". Dalam .help ditandai ikon kunci (dan jumlah dalam ringkasan kategori).
- Kelulusan permintaan di group persetujuan kini ada 3 butang ACCEPT: LITE / GOLD / PLATINUM (+ REJECT).
- /start direka semula: banner hiasan, jadual Rich (nama, role, PAKET berikon, userbot, expired, command aktif), senarai semak,
  dropdown Perbandingan Paket, dan butang berikon premium berbeza. Butang "Paket" / arahan /paket memaparkan jadual perbandingan.
  config.json "brand" menukar tajuk /start (lalai UBOT ARTA PEDIA).
- Had AI harian = ai_daily_limit x pengganda (GOLD x1, PLATINUM x3).

v1.3.1 - MEDIA .help SEBENAR, .afk RICH, SEMUA KETERANGAN RICH
- Media dalam .help kini mengikut spesifikasi Bot API 10.3 (Rich Messages): <img src="tg://photo?id=hphoto"/> dan
  <video src="tg://video?id=hvideo"></video> dengan senarai media[] dalam rich_message. Jika ada gambar DAN video (.setphoto + .setvideo),
  keduanya digabung dalam <tg-slideshow> (carousel bertitik) di antara hiasan atas dan tajuk "USERBOT MENU".
  Jika Telegram menolak slideshow, bot cuba media disusun biasa; jika masih ditolak, media dihantar sebagai mesej biasa sebelum menu.
  GIF (animation) disokong. Console memaparkan sebab penolakan: [inline help] jawapan "rich-m" ditolak Telegram: ...
- .afk: kad pengesahan, balasan kepada orang yang chat anda (PM / mention), dan notis "AFK dimatikan" semuanya kad Rich
  (jadual + senarai semak + emoji premium). Balasan dihantar melalui bot inline (via @bot) sebagai balasan kepada mesej mereka;
  jika bot inline tidak dapat digunakan di chat itu -> teks biasa. Notis AFK dimatikan menyebut bilangan chat yang dibalas.
- Semua mesej "Guna: ...", amaran (⚠️) dan maklumat daripada command dipaparkan sebagai kad Rich (Cara Guna / Perhatian) dengan emoji premium;
  jika inline gagal -> teks asal. Command yang melebihi paket memaparkan kad "Command Berkunci" (paket diperlukan vs paket anda).

v1.5.0 - /START BARU, SEMUA MESEJ PEMBUATAN USERBOT = KAD RICH + EMOJI PREMIUM, LIVE CHAT, RESTART USERBOT
1) /start direka semula (susunan seperti contoh RyX):
   - Banner, bahagian "Mulai Dari Sini" (jadual Menu | Fungsi: Buat Userbot, Preview, Live Chat, Restart Userbot, Beli Paket),
     nota awalan perintah, jadual "Akun Anda", senarai semak, dropdown Perbandingan Paket, pengaki "Powered by".
   - Butang: [Buat Userbot][Preview][Live Chat] / [Restart Userbot][Status][Paket] / [Beli Paket] / [DEVELOPER][CHANNEL] / [Refresh Home]
     (semua ikon premium + warna). "Preview" = menu .help tanpa perlu connect.
2) Semua mesej proses buat userbot kini kad Rich (jadual + senarai semak + emoji premium; sandaran teks biasa):
   minta nombor telefon, minta kod login, minta kata laluan 2FA, nombor/kod salah, 2FA salah, kod tamat tempoh, nombor tidak sah, masa tamat,
   /cancel, berjaya dihidupkan, /stopuserbot, userbot sudah hidup, userbot expired, Status, Restart.
   Turut kad Rich: Permintaan Dihantar / Disetujui / Ditolak, notis expired (dengan butang Beli Paket), /setgroup /addreseller /delreseller /resellers.
   Kod ada dalam botui.js (card / sendCard / editCard): guna fail ini untuk apa-apa mesej baharu supaya sentiasa Rich + emoji premium.
3) Live Chat (live.js): pelanggan tekan Live Chat (atau /live) lalu menulis; mesej (teks/gambar/fail) sampai kepada Head Owner
   (owner pertama dalam owner_ids, atau "live_chat_id" dalam config.json). Head Owner menjawab dengan BALAS (reply) mesej itu; jawapan
   dihantar kepada pelanggan sebagai kad Rich. Tamat: butang "Tamat Live Chat" atau /stoplive (juga tamat automatik selepas 15 minit senyap).
   Head Owner mesti pernah menekan /start pada bot.
4) Restart Userbot: hentikan dan hidupkan semula userbot anda menggunakan sesi tersimpan (tanpa login semula).

v1.4.0 - .HELP RINGKAS, .SSPROFILE (SCREENSHOT PROFIL iPHONE), BELI PAKET AUTOMATIK (DANA / QRIS)
PASANG: upload semua fail, Unarchive, kemudian jalankan  npm install  (pakej baharu: @resvg/resvg-js untuk menjana gambar).

1) .help dipendekkan
- .help kini hanya memaparkan banner + jadual info ringkas + dropdown kategori yang menyenaraikan NAMA command sahaja
  (teks kelihatan ~5x lebih pendek). Penerangan penuh: .help <kategori> (contoh .help ai) atau .help <command> (contoh .help ssprofile).
- Versi teks biasa (jika Rich gagal) juga senarai nama command sahaja.

2) .ssprofile - screenshot profil gaya iPhone (kategori AI & Media = paket GOLD ke atas; ubah di paket.js)
  .ssprofile                         profil sendiri
  .ssprofile @user | ID | (balas mesej)   profil orang lain
  pilihan: light | dark | fit (satu skrin iPhone sahaja, lalai = skrin panjang) | phone (paparkan nombor telefon, lalai DISEMBUNYIKAN)
           nogift | nochannel
- Dipaparkan: foto, nama (+ lencana verified / premium / EMOJI STATUS), status online/last seen, 4 butang tindakan, bio, username,
  birthday, CHANNEL PERIBADI (nama, pelanggan, post terkini) jika ada, corak emoji latar profil (warna profil Telegram),
  dan tab Gifts: grid GIFT/STICKER profil (sticker, harga bintang, collectible + nombor + latar belakang, pin).
- Gambar dijana sebagai PNG 1179 px (iPhone 15 Pro) oleh profileshot.js menggunakan fon Liberation Sans (OFL, folder fonts/).
- Emoji biasa dalam nama/bio dimuat turun sebagai gambar Twemoji dari cdn.jsdelivr.net (jika pelayan tiada internet, emoji itu dilangkau).
- Had: aksara yang tiada dalam fon (Cina, Arab, Thai dsb.) tidak dipaparkan; jika nama langsung tidak boleh dipaparkan, guna @username.
- Gift memerlukan library "telegram" yang ada API gift (payments.GetSavedStarGifts). Jika tiada, command tetap jalan dan caption
  memberi nota. Kemas kini dengan:  npm update telegram
- Gambar ialah representasi rekaan UI (bukan tangkapan skrin sebenar app Telegram).

3) Beli paket automatik (bot kawalan)  -  pay.js
Aliran pelanggan:  /beli  (atau butang "Beli Paket" di /start dan /paket)  ->  pilih LITE / GOLD / PLATINUM  ->  pilih DANA atau QRIS
  ->  bayar  ->  tekan "Saya sudah bayar"  ->  hantar screenshot bukti  ->  kad masuk group persetujuan (butang ACCEPT / REJECT)
  ->  ACCEPT: paket + hari diaktifkan automatik (hari TERKUMPUL pada baki, userbot dihidupkan semula jika expired) dan pembeli dimaklumkan;
      REJECT: pembeli dimaklumkan dan boleh cuba semula.
- Kad kelulusan guna group persetujuan yang sama (/setgroup). Jika belum ditetapkan, kad dihantar kepada owner di PM.
- Hanya owner dan reseller boleh menekan ACCEPT / REJECT. Satu pesanan hanya boleh diputuskan sekali.
- Pelanggan hanya boleh ada satu pembayaran dalam semakan pada satu masa.
Owner (chat peribadi dengan bot):
  /payset                                 panel tetapan (butang): Pembelian ON/OFF, DANA ON/OFF, QRIS ON/OFF, Harga LITE/GOLD/PLATINUM, Set DANA, Set QRIS
  /setharga <LITE|GOLD|PLATINUM> <harga> [hari]   contoh /setharga GOLD 30000 30   |   /setharga lite 15k
  /setdana <nombor> <nama penerima>       contoh /setdana 08123456789 Putri Titian
  /setqris                                hantar gambar QRIS dengan kapsyen /setqris (atau balas gambar dengan /setqris)
  /pay on|off   /pay dana on|off   /pay qris on|off
Owner / reseller:  /orders  = 10 pesanan terkini
- Harga lalai: LITE Rp 10.000, GOLD Rp 25.000, PLATINUM Rp 50.000 (30 hari). Ubah dengan /payset. Disimpan dalam data/db.json (settings.pay, orders).
- DANA / QRIS hanya muncul sebagai pilihan jika sudah ditetapkan dan dihidupkan.
- Pengesahan bayaran ialah MANUAL (owner/reseller semak bukti, kemudian ACCEPT/REJECT); tiada API payment gateway. Pengaktifan paket selepas ACCEPT automatik.
- Harga semasa turut dipaparkan dalam jadual perbandingan paket (/paket, .paket).
- Semua kad ialah Rich Message (jadual + senarai semak) dengan emoji premium; jika Rich ditolak Telegram -> teks biasa.

PENTING: JANGAN edit fail .js dalam editor panel (ia boleh merosakkan emoji -> "ð¢ Broadcast").
Ubah fail di komputer, kemudian upload dan Unarchive. Semua kod dalam zip ini sudah dikod sebagai \uXXXX (ASCII)
supaya selamat walaupun disunting, tetapi cara paling selamat tetap muat naik fail.


INVOICE (.done) - v1.5.1
- .done barang,jumlah,harga          contoh: .done Sc Ubot,1,3000
- Banyak item (maks 15): pisahkan dengan ; atau baris baru   contoh: .done Sc Ubot,1,3000; Panel,2,5k
- jumlah = kuantiti, harga = harga SATU unit. Jumlah baris = jumlah x harga; Grandtotal = jumlah semua baris.
- Harga boleh ditulis: 3000  3.000  3,000  3k  3rb  1.5jt  rp3000
- Keluar kad Rich: Transaksi Berhasil (Trxno TRX+tarikh+masa, Tanggal, Status LUNAS, Grandtotal), jadual Item Detail
  (No / Produk / Qty / Total + baris Grandtotal), kotak semak, ucapan terima kasih dan "Userbot By @username". Emoji premium
  dipasang sama seperti .ping (pemilik bot perlu Telegram Premium). Jika Rich gagal -> teks biasa.
- Alias: .invoice.   Mata wang lalai IDR: tukar dengan "currency" dalam config.json (contoh "RM").
- Paket minimum: LITE (kategori Utilitas). Mahu kunci ke GOLD: tambah  done: "GOLD"  dalam COMMAND_MIN di paket.js.
- Tukar ikon premium: edit objek EM di bahagian atas plugins/done.js (gunakan ID yang sah sahaja).


RUPA .help (v1.5.2)
- Susunan: ornamen "x" -> gambar/video (.setphoto/.setvideo) -> ornamen sayap + tajuk USERBOT MENU + ornamen daun ->
  jadual Info/Nilai (Akun, Expired, Paket, Prefix, Command) -> kotak semak (Rich render, Premium reply) -> garis ->
  dropdown kumpulan -> baris cara guna -> "Userbot By @akun [ Buy Pv @developer ]".
- Kategori dicampur jadi sedikit kumpulan supaya menu ringkas (semua command masih berfungsi). Ubah pemetaan dalam GROUPS (plugins/_help.js):
  Umum (+Sistem, Owner & Reseller) | AI & Media (+Rich & Format) | Utilitas (+Matematik, Teks, Generator, Catatan, Web, Islam, Hiburan)
  | Broadcast & Alias | Group Management | WhatsApp.  Kumpulan tanpa command tidak dipaparkan.
- Buka kumpulan berbilang sub-kategori: .help utilitas  (jadual sub-kategori). Butiran sub-kategori asal masih boleh: .help teks, .help matematik, .help web
  Butiran satu command: .help cuaca
- Hiasan atas: ORN_TOP_L / ORN_TOP_R / ORN_MID ; baris hiasan hujung (mis. kereta): isi LINE_TILES dengan ID jubin emoji premium.
- "[ Buy Pv @nama ]" diambil daripada developer_url dalam config.json (dilangkau jika masih nilai contoh).


LOADING DENGAN EMOJI BERPUSING (v1.5.3)
- /start: bot hantar "Membuka menu ... (bulat)" dahulu, kemudian menukarnya jadi menu di mesej yang sama. config.json: "start_loading_ms" (lalai 900, 0 = matikan).
- .autorich, .ai, .tr, .sum, .fix: panel "AI sedang menyusun payload ..." / "AI sedang berfikir ..." (via bot) dengan emoji berpusing, kemudian
  diganti di tempat dengan hasilnya. Memerlukan @BotFather -> /setinlinefeedback -> Enabled (100%) dan pemilik bot ada Telegram Premium.
  Selagi inline feedback belum pasti aktif, bot guna teks biasa seperti dahulu. Letak "inline_feedback": true dalam config.json jika sudah dihidupkan
  (supaya panel loading dipakai sejak penggunaan pertama selepas restart).
- ID emoji berpusing: isi "loading_emoji" dalam config.json dengan ID emoji premium beranimasi itu. Kosong = jam pasir biasa (tidak beranimasi).


KAD CARA GUNA (v1.5.4)
- Bila command dipakai salah (kurang hujah, format salah), mesej "Guna: ..." keluar sebagai kad Rich + emoji premium untuk SEMUA command:
  tajuk "Cara Guna .cmd" -> penerangan (daripada .help) -> blok kod (guna + contoh) -> senarai semak nota (ikon premium) -> petikan "Taip .help cmd" -> pengaki.
- Sebab ralat (contoh "Item 1 tidak lengkap") dipaparkan sebagai baris sebelum penerangan. Amaran (Perhatian) dan maklumat guna kad yang sama.
- Dikendalikan di tempat tunggal (ui.js + manager.js), jadi command baharu yang menulis "Guna: ..." terus mendapat gaya ini.


=== v1.6.0 (V8) ===
.unafk                    matikan AFK (AFK kini tahan lama; "afk_autooff": true = cara lama)
.setfooter <teks>         pengaki sendiri semua kad. Token {e:ID} = emoji premium, {user} = nama. .setfooter reset
.cekemoji                 balas mesej berisi emoji premium -> senarai ID (hantar emoji premium kepada bot pun boleh)
.pe <teks>                kad Rich dengan {e:ID}; berfungsi untuk akaun TANPA Premium (kad dihantar melalui bot)
.sschat [@user] [phone|nogift|nochannel]   album 4 slaid (gelap/cerah, penuh/muat-skrin)
.setqris / .qris 25000    QRIS statik -> QR dinamik dengan nominal (tiada pengesahan bayar automatik)
.setnorek bank|no|nama / .norek
.lagu <judul>             cari lagu (iTunes) + pratonton audio
.maintenance on [mesej]|off   (owner/reseller) pelanggan dikunci semasa aktif
Butang merah "Stop Broadcast" semasa broadcast berjalan.
ChatGPT: isi openai_api_key (ai_provider "auto"/"openai"/"gemini") - dipakai .ai .autorich dll.
Bahasa: "lang": "id" (lalai) menukar teks kad ke Indonesia; "ms" untuk matikan. Butang tidak diubah.
.setqris dari gambar: npm i jsqr pngjs jpeg-js (pilihan) - atau tampal teks QRIS 000201...
Kestabilan: ralat tidak dijangka dilog (proses tidak mati) + pengawas menyambung semula userbot terputus.

=== v1.6.2 ===
AutoRich gaya SC: .autorich on|off | ai on|off | emoji on|off | reply on|off | style default|promo|warning|success|info
                  | exclude add|remove|clear | footer <teks>|reset | status   (.autorich <permintaan> = AI seperti sebelumnya)


=== v1.6.3 ===
- .buildauto <permintaan>: AI menghasilkan kad Rich (jadual, senarai semak, butang pautan berikon, footer nama model). Reply mesej + .buildauto untuk mengolah isinya.
- /start disusun semula mengikut contoh RyX: 2 jadual, "Mulai Dari Sini", footer, butang 3 + 2 + 1 (Buat Ubot | Preview | Live Chat / Reset Prefix | Restart Userbot / Tulis Claim Userbot Free).
  config.json: "start_extra": true -> tambah semula butang Paket / Status / Beli Paket. "start_account": true -> tunjuk dropdown Akun Anda + Perbandingan Paket.
- Prefix mengikut pengguna: .setprefix <simbol> (reset = lalai) dan butang Reset Prefix pada /start.
- inline.js: kenal-pasti chat lebih tegar supaya .help / kad Rich muncul juga dalam chat PERIBADI.
- config.json "premium_emoji": true (lalai) | false. false = semua emoji premium dipaparkan sebagai emoji biasa dan ikon premium butang dibuang (tiada percubaan yang ditolak Telegram).
- /premiumtest (owner, chat peribadi bot): semak sama ada Telegram membenarkan bot ini menghantar emoji premium.
  NOTA: kelayakan menghantar emoji premium ditentukan oleh pelayan Telegram (pemilik bot ada Premium, atau bot ada username tambahan Fragment). Kod tidak boleh memintasnya.


=== v1.6.4 ===
PAYMENT GATEWAY QRIS (Pakasir) - pengesahan bayaran AUTOMATIK
- Daftar di pakasir.com -> buat Proyek -> ambil SLUG projek + API KEY.
- Setiap pengguna sambung gateway MEREKA SENDIRI (wang masuk ke akaun Pakasir masing-masing):
    .setpakasir <slug> <api key>   sambung (mesej disunting supaya kunci tidak kelihatan)
    .delpakasir                    putuskan (padam kunci)
    .gateway                       status sambungan
- Guna:
    .qris 1000 [catatan]           hasilkan QR bayar daripada gateway (nominal + caj gateway = jumlah bayar)
                                   bot memantau bayaran (setiap 5 saat); caption gambar QR bertukar "LUNAS" sebaik bayaran diterima
                                   dan pemberitahuan dihantar ke chat bot kawalan anda.
    .qriscek [invois]              semak status invois        .qriscancel <invois>   batalkan invois yang belum dibayar
- Tanpa .setpakasir, .qris kekal guna QRIS statik (.setqris) seperti sebelum ini (tanpa pengesahan automatik).
- Owner boleh letak "gateway": {"project": "...", "api_key": "..."} dalam config.json sebagai lalai untuk akaun OWNER sahaja
  (pengguna biasa TIDAK boleh guna kunci config.json).
- Invois belum selesai disimpan dalam gateway_tx.json dan dipantau semula selepas restart (kunci API tidak disimpan dalam fail ini).
- Kunci API pengguna disimpan dalam db.json (sama seperti sesi lain) - jaga fail ini dan jangan kongsi.
- NOTA: pembelian paket (/beli) masih sahkan secara manual; gateway.js boleh digunakan untuk menjadikannya automatik.


INTEGRASI BUATQRIS (v1.6.5)
- .setbuatqris <account_id> <secret_token> menyimpan kredensial gateway secara per pengguna. Jangan kirim token ke chat publik.
- .qris 1000 membuat QRIS, menampilkan nominal, biaya admin, total, dan status. Status diperiksa sekitar tiap 20 detik (batas API gateway).
- Setelah status sukses dikonfirmasi gateway, pesan gambar QR dihapus dan diganti dengan #Success Terbayar.
- Default fee_by=buyer dan test=false (transaksi live). Gunakan hanya untuk pembayaran yang sah.


CATATAN UPDATE AUTORICH BUTTON ROW
- .autorich sekarang menghasilkan teks biasa + inline button row (maksimum 2 tombol per baris).
- AI memakai GET https://apiii-xrina.my.id/ai/darkgpt?text=...
- Tidak memakai HTML/Rich Message untuk hasil akhir .autorich.
- Isi ulang bot_token, api_id, api_hash, serta gateway.account_id dan gateway.secret_token di config.json.


=== v1.6.6 - Tampilan teks lebih cantik (emoji premium + teks rich) ===
- richtext.js (baru): teks biasa .autorich -> HTML Telegram: judul tebal, kotak harga (LABEL: nilai),
  bullet emoji premium, kutipan untuk CTA (baris berawalan "> "), **tebal** __miring__ ~~coret~~ `kode`.
- panel.js: pesan teks kini diedit ke versi HTML (emoji premium + format); jika ditolak otomatis jatuh ke teks polos.
- autorich.js: prompt AI baru (copywriting + format di atas), tombol memakai ikon premium (bukan emoji di teks tombol).
- buildkit.js / autorichkit.js (.buildauto): prompt kartu Rich lebih kaya, blok baru "quote" & "subheading",
  format inline **tebal**, dan emoji otomatis di setiap heading/baris tabel/item bila AI lupa.
- Emoji di prompt dibatasi ke daftar yang pasti punya ID premium (richtext.EMOJI_WHITELIST).
- Catatan: emoji premium tampil jika pemilik bot punya Telegram Premium (sama seperti sebelumnya).


=== v1.6.7 - Gemini AI (ARTA PEDIA geminiv2) ===
- llm.js: dua provider. gemini = GET https://apiii-xrina.my.id/ai/geminiv2?text=...  |  darkgpt = /ai/darkgpt
- config.json: "ai_gemini_url" (URL geminiv2) dan "ai_provider": "auto" | "gemini" | "darkgpt".
  auto = Gemini dahulu, jika gagal otomatis jatuh ke DarkGPT. .autorich / .buildauto / .ai ikut provider ini.
- .gemini <permintaan> (alias .gm): Gemini menyusun teks cantik + rich + emoji premium. Bisa reply pesan.
- .setai gemini|darkgpt|auto|status|test : ganti provider tanpa edit config (khusus staff). .autorich test juga menguji keduanya.


=== v1.6.8 - Kartu Rich gaya "daftar harga" (mengikuti spesifikasi Bot API 10.3) ===
- .gemini dan .buildauto kini menghasilkan kartu: brand (huruf script) -> heading besar -> subheading -> judul rata tengah
  -> tabel (header beremoji di belakang, tiap baris emoji premium BERBEDA sesuai peran: Full Up, Reseller, Admin, Owner, dst)
  -> tombol CTA DI DALAM kartu (<tg-button-row align="center">) -> paragraf penutup.
- Tombol keyboard bawah: "Hubungi @user" (dari @username di permintaan) + "PM" (akun anda), ikon premium.
- Jika Telegram menolak tombol dalam kartu, otomatis memakai versi "lite": tombol CTA dipindah ke keyboard bawah.
- Blok baru untuk AI/JSON: brand, title (rata tengah), cta; heading memakai ukuran h2. Sanitizer richai.js kini mengizinkan
  h1-h6, aside, mark, sub, sup, tg-spoiler, tg-button-row, tg-button, atribut align/valign/compact.
- Footer nama model tidak lagi ditampilkan; aktifkan dengan "ai_model_footer": true di config.json.
- Contoh: .gemini toko charles, price role cpanel: full up 8k, reseller 14k, partner 18k, admin 22k, owner 37k, beli @whoisvelix1


=== v1.6.9 - Tombol PM hanya untuk teks jualan ===
- Tombol "PM" (dan .autorich PM) sekarang hanya muncul jika isi permintaan berbau jualan/kontak (jual, harga, order, beli, promo, pm, hubungi, angka 5rb/10k, dst).
  Teks biasa (puisi, info, ucapan) tidak diberi tombol PM.
- Kontrol manual per permintaan: tulis "tanpa pm" / "tanpa tombol" / "nopm" untuk mematikan, atau "pakai tombol pm" untuk memaksa.
- config.json "auto_pm_button": "auto" (lalai) | true (selalu) | false (tidak pernah).
- Tombol "Hubungi @username" tetap muncul bila anda menulis @username sendiri di permintaan (kecuali "tanpa pm/tombol").

v1.6.10 - HIBURAN XRINA (kad Rich): .galau (.quotesgalau) .pantun .pap .longteks (.lt) -> plugins/xrinafun.js (API apiii-xrina.my.id/fun/*; .pantun menggantikan pantun lokal)
v1.6.12 - .help: tiap kategori jadi dropdown sendiri (tidak digabung); AUTOBC: .autobc <target> [jeda] [delay] (reply pesan), .autobc status, .stopautobc -> plugins/autobc.js (dilanjutkan otomatis saat restart; laporan tiap putaran, matikan dengan "autobc_report": false di config.json)
v1.6.14 - AI CLAUDE HAIKU: .haiku (.claude .claudehaiku .ch) -> plugins/claudehaiku.js (API apiii-xrina.my.id/ai/claudehaiku; blok kode jadi <pre>, jawaban >2800 huruf dikirim juga sebagai file; batas pemakaian ikut .ai)
v1.6.16 - imgedit: .tofigure pindah ke ARTA PEDIA (/ai-image/tofigure?image=); baru: .tofigurev2 (/ai-image/tofigurav2), .toreal (/ai-image/toreal), .fakedev2 <nama> (/canvas/fakedev2?text=&image=, nama bawaan ARTA PEDIA ID)


KONFIGURASI RAHASIA (WAJIB DI PANEL STARTUP / ENVIRONMENT)
BOT_TOKEN=token bot Telegram yang baru
API_HASH=api hash Telegram
BUATQRIS_ACCOUNT_ID=ID akun BuatQris
BUATQRIS_SECRET_TOKEN=secret token BuatQris yang BARU
Base API BuatQris: https://app.buatqris.site/api (bukan URL halaman dashboard).
AI Gemini: https://apiii-xrina.my.id/ai/gemini
AI DarkGPT: https://apiii-xrina.my.id/ai/darkgpt


KONFIGURASI RAHASIA (WAJIB DI PANEL STARTUP / ENVIRONMENT)
BOT_TOKEN=token bot Telegram yang baru
API_HASH=api hash Telegram
BUATQRIS_ACCOUNT_ID=ID akun BuatQris
BUATQRIS_SECRET_TOKEN=secret token BuatQris yang BARU
Base API BuatQris: https://app.buatqris.site/api (bukan URL halaman dashboard).
AI Gemini: https://apiii-xrina.my.id/ai/gemini
AI DarkGPT: https://apiii-xrina.my.id/ai/darkgpt


=== FITUR TAMBAHAN 100 COMMAND ===
Plugin ubot/plugins/extras100.js dimuat otomatis oleh loader plugin.
Semua hasil command menggunakan kad Rich melalui ui.card/ui.show dan emoji premium projek dengan fallback.
Gunakan .help Utilitas untuk melihat senarai command.

=== LAGU SESUATU DI JOGJA ===
Gunakan .jogja atau .sesuatudijogja untuk mencari lagu dan menghantar pratonton audio rasmi
sehingga 30 saat jika Apple Music menyediakan preview. Lirik penuh tidak disertakan;
gunakan pautan penyedia muzik untuk mendengar lagu penuh.

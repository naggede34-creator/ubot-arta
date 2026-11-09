// VPS & PANEL TOOLKIT - seluruh output menggunakan kad Rich + emoji premium dari ui.js
// Tidak menjalankan perintah root/SSH secara otomatis. Panduan ditujukan untuk server milik sendiri/yang diizinkan.
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const K = require('../kit');
const { R, H, out, esc, UserErr } = K;

const fmt = (n) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(n);
const mb = (n) => `${fmt(n / 1048576)} MB`;
const gb = (n) => `${fmt(n / 1073741824)} GB`;
const dur = (s) => { s = Math.max(0, Math.floor(s)); const d=Math.floor(s/86400), h=Math.floor(s%86400/3600), m=Math.floor(s%3600/60); return `${d} hari ${h} jam ${m} menit`; };
const defs = [];
const add = (cmd, alias, desc, run) => defs.push({ cmd, alias: alias || [], desc, run });

add('vpsreport', ['vpsstatus'], 'laporan VPS: CPU, RAM, uptime dan load', async (ctx) => {
  const total=os.totalmem(), free=os.freemem(), cpus=os.cpus();
  await out(ctx,'Laporan VPS','cloud',[
    R('tag','Hostname',os.hostname()), R('gear','Sistem',`${os.type()} ${os.release()} (${os.arch()})`),
    R('bolt','CPU',`${cpus.length} core · ${(cpus[0]||{}).model||'-'}`),
    R('chart','Load average',os.loadavg().map(x=>fmt(x)).join(' / ')),
    R('box','RAM terpakai',`${mb(total-free)} / ${mb(total)}`),
    R('time','Uptime',dur(os.uptime())), R('robot','Node.js',process.version)
  ],{checks:[[true,'Data dibaca dari server tempat userbot berjalan'],[true,'Tidak ada perubahan konfigurasi server']]});
});
add('vpscpu', ['cpustat'], 'monitor CPU dan load server', async (ctx) => {
  const c=os.cpus(), load=os.loadavg();
  await out(ctx,'Monitor CPU','chart',[R('bolt','Jumlah core',String(c.length)),R('gear','Model',(c[0]||{}).model||'-'),R('chart','Load 1 menit',fmt(load[0])),R('chart','Load 5 menit',fmt(load[1])),R('chart','Load 15 menit',fmt(load[2]))],{checks:[[true,'Load average bukan persentase CPU langsung']]});
});
add('vpsram', ['ramstat'], 'cek penggunaan RAM dan swap proses', async (ctx) => {
  const t=os.totalmem(), f=os.freemem(), p=process.memoryUsage();
  await out(ctx,'Monitor RAM','box',[R('chart','RAM terpakai',`${mb(t-f)} (${fmt((t-f)/t*100)}%)`),R('check','RAM tersedia',mb(f)),R('box','RAM total',mb(t)),R('robot','RSS userbot',mb(p.rss)),R('gear','Heap userbot',`${mb(p.heapUsed)} / ${mb(p.heapTotal)}`)]);
});
add('vpsdisk', ['diskstat'], 'cek kapasitas disk root server', async (ctx) => {
  if (typeof fs.statfsSync !== 'function') throw new UserErr('Versi Node.js belum mendukung pemeriksaan disk. Gunakan Node.js 18+ atau periksa melalui terminal server.');
  const s=fs.statfsSync('/'), total=s.blocks*s.bsize, free=s.bavail*s.bsize, used=total-free;
  await out(ctx,'Monitor Disk','box',[R('box','Terpakai',`${gb(used)} (${fmt(used/total*100)}%)`),R('check','Tersedia',gb(free)),R('chart','Total',gb(total)),R('tag','Mount','/')],{checks:[[free>total*.1,'Ruang kosong lebih dari 10%'],[true,'Nilai berdasarkan filesystem root']]});
});
add('vpsnet', ['netinfo'], 'lihat alamat jaringan lokal server', async (ctx) => {
  const all=os.networkInterfaces(), rows=[];
  for (const [name, list] of Object.entries(all)) for (const n of (list||[])) if (!n.internal) rows.push(R('link',name,`${n.family} ${n.address}`));
  await out(ctx,'Info Jaringan','link',rows.length?rows:[R('warn','Alamat','Tidak ditemukan')],{checks:[[true,'Alamat privat/lokal saja; IP publik tidak ditebak']]});
});
add('vpsguide', ['installvps'], 'panduan persiapan VPS baru', async (ctx) => {
  await out(ctx,'Panduan Persiapan VPS','rocket',[R('check','1 · OS','Pilih Ubuntu LTS yang masih didukung'),R('check','2 · Akses','Pastikan akses console dan SSH milik sendiri'),R('check','3 · Update','Jalankan pembaruan sistem dari console provider'),R('check','4 · Akun','Buat akun admin non-root dan gunakan sudo'),R('check','5 · Keamanan','Aktifkan firewall, update rutin, dan autentikasi SSH key'),R('check','6 · Backup','Siapkan snapshot/backup sebelum memasang layanan')],{extra:'<blockquote>Jangan menyalin skrip instalasi acak ke terminal root. Verifikasi dokumentasi dan sumber paket terlebih dahulu.</blockquote>',extraText:'Jangan menyalin skrip instalasi acak ke terminal root.'});
});
add('panelguide', ['installpanel','panelinstall'], 'panduan instalasi Pterodactyl Panel', async (ctx) => {
  await out(ctx,'Panduan Pterodactyl Panel','gear',[R('link','Dokumentasi','https://pterodactyl.io/panel/1.0/getting_started.html'),R('check','1 · Domain','Siapkan domain/subdomain dan DNS yang benar'),R('check','2 · Server','Gunakan OS dan versi dependensi yang didukung dokumentasi resmi'),R('check','3 · Database','Siapkan database dan kredensial unik'),R('check','4 · Web','Konfigurasikan web server dan HTTPS'),R('check','5 · Panel','Ikuti panduan instalasi resmi sesuai versi'),R('check','6 · Uji','Buat user uji dan pastikan panel dapat diakses')],{checks:[[true,'Panduan ini tidak mengeksekusi instalasi otomatis'],[true,'Buat snapshot VPS sebelum perubahan besar']]});
});
add('wingsguide', ['installwings','wingsinstall'], 'panduan memasang Pterodactyl Wings', async (ctx) => {
  await out(ctx,'Panduan Pterodactyl Wings','rocket',[R('link','Dokumentasi','https://pterodactyl.io/wings/1.0/installing.html'),R('check','1 · Prasyarat','Pastikan Docker dan dukungan OS sesuai dokumentasi'),R('check','2 · Node','Buat Node dari Panel dengan lokasi dan FQDN benar'),R('check','3 · Konfigurasi','Ambil konfigurasi Wings dari panel milik sendiri'),R('check','4 · Firewall','Buka hanya port yang diperlukan sesuai konfigurasi'),R('check','5 · TLS','Gunakan sertifikat TLS yang valid'),R('check','6 · Verifikasi','Periksa status Wings dan koneksi Node dari panel')],{checks:[[true,'Token konfigurasi Node bersifat rahasia'],[true,'Jangan bagikan config.yml atau token ke chat publik']]});
});
add('panelcheck', ['cekpanel'], 'checklist kesehatan panel Pterodactyl', async (ctx) => {
  await out(ctx,'Checklist Panel','check',[R('check','Web server','Status aktif dan virtual host benar'),R('check','PHP','Versi dan ekstensi cocok dokumentasi'),R('check','Database','Koneksi dan backup teruji'),R('check','Queue','Worker berjalan'),R('check','Scheduler','Cron berjalan'),R('check','HTTPS','Sertifikat belum kedaluwarsa'),R('check','Storage','Disk memiliki ruang cukup')],{checks:[[true,'Centang setelah pemeriksaan manual']]});
});
add('wingscheck', ['cekwings'], 'checklist koneksi Wings dan Node', async (ctx) => {
  await out(ctx,'Checklist Wings','check',[R('check','Daemon','Service Wings aktif'),R('check','Node FQDN','DNS mengarah ke server yang benar'),R('check','TLS','Sertifikat sesuai hostname'),R('check','Firewall','Port yang diperlukan diizinkan'),R('check','Docker','Docker daemon aktif'),R('check','Resource','Disk dan RAM node mencukupi')]);
});
add('vpssecure', ['amankanvps'], 'checklist keamanan VPS', async (ctx) => {
  await out(ctx,'Keamanan VPS','crown',[R('check','SSH','Utamakan SSH key; batasi akses admin'),R('check','Firewall','Tutup port yang tidak dipakai'),R('check','Update','Pasang security update berkala'),R('check','Akun','Hapus akun yang tidak dikenal'),R('check','Secret','Jangan simpan token/password di source code'),R('check','Backup','Simpan backup terenkripsi di lokasi terpisah'),R('check','Log','Pantau login dan aktivitas mencurigakan')],{checks:[[true,'Lakukan hanya pada server yang kamu miliki/kelola']]});
});
add('panelpw', ['gantipwpanel'], 'panduan reset password akun Panel milik sendiri', async (ctx) => {
  await out(ctx,'Ganti Password Panel','gem',[R('check','Cara normal','Gunakan menu reset password/login resmi panel'),R('check','Admin panel','Minta admin instance melakukan reset melalui mekanisme resmi'),R('check','Email','Pastikan email pemulihan dapat diakses'),R('check','Keamanan','Gunakan password unik dan aktifkan MFA bila tersedia'),R('warn','Penting','Bot tidak meminta atau menyimpan password lama/baru')],{checks:[[true,'Jangan kirim password ke bot atau chat']]});
});
add('vpspw', ['gantipwvps'], 'panduan ganti password akun VPS milik sendiri', async (ctx) => {
  await out(ctx,'Ganti Password VPS','key',[R('check','Akses','Pastikan masih punya akses console/provider'),R('check','Akun','Ubah password akun milik sendiri melalui mekanisme OS/provider'),R('check','SSH key','Pertimbangkan SSH key sebagai metode utama'),R('check','Uji','Buka sesi baru sebelum menutup sesi lama'),R('warn','Penting','Jangan kirim password atau private key ke bot')]);
});
add('pwgen', ['genpw'], 'buat password acak kuat: .pwgen [panjang 16-64]', async (ctx) => {
  const n=ctx.args[0]===undefined?24:Number(ctx.args[0]);
  if(!Number.isInteger(n)||n<16||n>64) throw new UserErr('Panjang password harus 16-64 karakter. Contoh: .pwgen 24');
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
  let pw=''; const bytes=crypto.randomBytes(n*2);
  for(let i=0;i<n;i++) pw+=chars[bytes[i]%chars.length];
  await out(ctx,'Password Generator','gem',[H('gem','Password baru',`<code>${esc(pw)}</code>`),R('check','Panjang',`${n} karakter`),R('crown','Penyimpanan','Tidak disimpan oleh bot')],{checks:[[true,'Simpan di password manager tepercaya'],[true,'Jangan gunakan ulang pada akun lain']],extra:'<blockquote>Hapus pesan hasil generator setelah disimpan dengan aman.</blockquote>',extraText:'Hapus pesan hasil generator setelah disimpan dengan aman.'});
});
add('tickethelp', ['helpdesk'], 'cara memakai sistem layanan pelanggan otomatis', async (ctx) => {
  await out(ctx,'Helpdesk Otomatis','robot',[R('tag','Buat tiket','.ticket <keluhan>'),R('chart','Lihat antrean','.ticketlist'),R('wave','Balas tiket','.ticketreply <id> <pesan>'),R('check','Tutup tiket','.ticketclose <id>'),R('star','FAQ otomatis','.faq <kata kunci>'),R('gear','Tambah FAQ','.faqadd <kata> | <jawaban>')],{checks:[[true,'Tiket disimpan lokal pada perangkat userbot'],[true,'Jangan masukkan password, OTP, atau private key ke tiket']]});
});

// Persistent, account-scoped helpdesk data.
const storePath = path.join(__dirname, '..', 'data', 'helpdesk.json');
function readStore(){try{return JSON.parse(fs.readFileSync(storePath,'utf8'));}catch(_){return {tickets:[],faq:{}};}}
function writeStore(s){fs.mkdirSync(path.dirname(storePath),{recursive:true});const tmp=storePath+'.tmp';fs.writeFileSync(tmp,JSON.stringify(s,null,2),{mode:0o600});fs.renameSync(tmp,storePath);}
add('ticket', ['buat tiket'], 'buat tiket pelanggan: .ticket <keluhan>', async (ctx) => {
  const body=ctx.args.join(' ').trim(); if(!body) throw new UserErr('Contoh: .ticket Server saya tidak bisa diakses'); if(body.length>1200) throw new UserErr('Pesan maksimal 1.200 karakter.');
  const s=readStore(), id=crypto.randomBytes(3).toString('hex').toUpperCase();
  s.tickets.push({id,account:String(ctx.account.userId||ctx.account.accountId||'default'),sender:String(ctx.msg.senderId||''),body,createdAt:new Date().toISOString(),status:'open'});writeStore(s);
  await out(ctx,'Tiket Dibuat','done',[R('tag','ID Tiket',id),R('wave','Pesan',body),R('time','Status','OPEN')],{checks:[[true,'Simpan ID tiket untuk tindak lanjut']]});
});
add('ticketlist', ['tiketlist'], 'lihat daftar tiket helpdesk', async (ctx) => {
  const s=readStore(), aid=String(ctx.account.userId||ctx.account.accountId||'default'), list=s.tickets.filter(t=>t.account===aid).slice(-12).reverse();
  await out(ctx,'Antrean Tiket','chart',list.length?list.map(t=>R(t.status==='open'?'warn':'check',`#${t.id}`,`${t.status.toUpperCase()} · ${t.body.slice(0,75)}`)):[R('check','Antrean','Belum ada tiket')],{checks:[[true,'Maksimal 12 tiket terbaru ditampilkan']]});
});
add('ticketreply', ['balastiket'], 'balas tiket: .ticketreply <id> <pesan>', async (ctx) => {
  const [id,...parts]=ctx.args, body=parts.join(' ').trim(); if(!id||!body) throw new UserErr('Contoh: .ticketreply A1B2C3 Kami sedang memeriksa laporan.');
  const s=readStore(), aid=String(ctx.account.userId||ctx.account.accountId||'default'), t=s.tickets.find(x=>x.id===id.toUpperCase()&&x.account===aid); if(!t) throw new UserErr('Tiket tidak ditemukan pada akun ini.');
  t.reply=body.slice(0,1200);t.repliedAt=new Date().toISOString();writeStore(s);await out(ctx,'Balasan Tiket','chat',[R('tag','ID',t.id),R('check','Status','Balasan tersimpan'),R('wave','Balasan',t.reply)],{checks:[[true,'Salin/kirim balasan ke pelanggan melalui kanal yang sesuai']]});
});
add('ticketclose', ['tutuptiket'], 'tutup tiket: .ticketclose <id>', async (ctx) => {
  const id=(ctx.args[0]||'').toUpperCase();if(!id)throw new UserErr('Contoh: .ticketclose A1B2C3');const s=readStore(),aid=String(ctx.account.userId||ctx.account.accountId||'default'),t=s.tickets.find(x=>x.id===id&&x.account===aid);if(!t)throw new UserErr('Tiket tidak ditemukan pada akun ini.');t.status='closed';t.closedAt=new Date().toISOString();writeStore(s);await out(ctx,'Tiket Ditutup','done',[R('tag','ID',id),R('check','Status','CLOSED')]);
});
add('faqadd', ['setfaq'], 'tambah jawaban FAQ: .faqadd kata kunci | jawaban', async (ctx) => {
  const raw=ctx.args.join(' '),i=raw.indexOf('|');if(i<1)throw new UserErr('Contoh: .faqadd harga | Silakan cek menu paket.');const key=raw.slice(0,i).trim().toLowerCase(),answer=raw.slice(i+1).trim();if(!key||!answer||key.length>60||answer.length>700)throw new UserErr('Kata kunci maks 60 dan jawaban maks 700 karakter.');const s=readStore();s.faq[key]=answer;writeStore(s);await out(ctx,'FAQ Tersimpan','done',[R('tag','Kata kunci',key),R('wave','Jawaban',answer)]);
});
add('faq', ['tanyafaq'], 'cari jawaban FAQ: .faq <kata kunci>', async (ctx) => {
  const q=ctx.args.join(' ').trim().toLowerCase();if(!q)throw new UserErr('Contoh: .faq harga');const s=readStore(),found=Object.entries(s.faq).find(([k])=>k===q||k.includes(q)||q.includes(k));await out(ctx,'FAQ Otomatis','robot',found?[R('tag','Topik',found[0]),R('wave','Jawaban',found[1])]:[R('warn','Hasil','Belum ada FAQ yang cocok')],{checks:[[!!found,found?'Jawaban ditemukan':'Admin dapat menambahkan dengan .faqadd']]});
});
add('faqdel', ['hapusfaq'], 'hapus FAQ: .faqdel <kata kunci>', async (ctx) => {
  const q=ctx.args.join(' ').trim().toLowerCase();if(!q)throw new UserErr('Contoh: .faqdel harga');const s=readStore();if(!s.faq[q])throw new UserErr('Kata kunci FAQ tidak ditemukan.');delete s.faq[q];writeStore(s);await out(ctx,'FAQ Dihapus','done',[R('tag','Kata kunci',q),R('check','Status','Dihapus dari penyimpanan lokal')]);
});
add('faqlist', ['listfaq'], 'lihat daftar kata kunci FAQ', async (ctx) => {
  const s=readStore(),keys=Object.keys(s.faq);await out(ctx,'Daftar FAQ','book',keys.length?keys.slice(0,25).map(k=>R('tag','Topik',k)):[R('tag','FAQ','Belum ada FAQ')],{checks:[[true,`${keys.length} kata kunci tersimpan`]]});
});
add('backupcheck', ['cekbackup'], 'checklist backup VPS dan panel', async (ctx) => {
  await out(ctx,'Checklist Backup','box',[R('check','Database','Backup database terjadwal'),R('check','File panel','Backup file konfigurasi dan storage penting'),R('check','Server','Snapshot sebelum upgrade'),R('check','Offsite','Salinan terenkripsi di lokasi berbeda'),R('check','Restore','Uji pemulihan berkala'),R('check','Akses','Batasi siapa yang dapat membaca backup')],{checks:[[true,'Backup belum dianggap valid sebelum restore diuji']]});
});
add('portguide', ['portpanel'], 'panduan port layanan panel dan VPS', async (ctx) => {
  await out(ctx,'Panduan Port Server','link',[R('tag','SSH','22/tcp (ubah sesuai konfigurasi)'),R('tag','HTTP','80/tcp'),R('tag','HTTPS','443/tcp'),R('tag','Panel default','80/443 melalui web server'),R('tag','Wings API','8080 atau port yang dikonfigurasi'),R('tag','SFTP Wings','2022 atau port yang dikonfigurasi')],{checks:[[true,'Buka hanya port yang benar-benar digunakan'],[true,'Nilai dapat berbeda jika admin mengubah konfigurasi']]});
});

add('dockerhelp', ['panduan-docker'], 'panduan pengelolaan Docker untuk Wings', async (ctx) => {
  await out(ctx,'Panduan Docker','box',[R('check','Versi','Gunakan versi stabil yang didukung'),R('check','Service','Pastikan daemon berjalan'),R('check','Storage','Pantau penggunaan image, volume, dan container'),R('check','Akses','Jangan memberi akses Docker ke pengguna yang tidak dipercaya'),R('check','Update','Jadwalkan update dan uji kompatibilitas'),R('check','Backup','Backup volume data penting secara terpisah')]);
});
add('nginxhelp', ['panduan-nginx'], 'panduan konfigurasi Nginx untuk panel', async (ctx) => {
  await out(ctx,'Panduan Nginx','gear',[R('check','Virtual host','Pastikan server_name sesuai domain'),R('check','Document root','Arahkan ke direktori publik panel'),R('check','PHP-FPM','Socket/port harus sesuai konfigurasi'),R('check','HTTPS','Aktifkan TLS dan redirect HTTP bila siap'),R('check','Validasi','Uji konfigurasi sebelum reload'),R('warn','Catatan','Simpan salinan konfigurasi sebelum diedit')]);
});
add('mysqlhelp', ['panduan-database'], 'panduan database panel', async (ctx) => {
  await out(ctx,'Panduan Database','chart',[R('check','Akun','Gunakan user database khusus aplikasi'),R('check','Hak akses','Berikan hak minimum yang diperlukan'),R('check','Koneksi','Batasi akses database ke host tepercaya'),R('check','Backup','Jadwalkan backup dan uji restore'),R('check','Secret','Simpan kredensial di konfigurasi privat'),R('warn','Catatan','Jangan kirim dump database atau password ke chat')]);
});
add('cronhelp', ['panduan-cron'], 'panduan scheduler dan cron panel', async (ctx) => {
  await out(ctx,'Panduan Cron & Scheduler','time',[R('check','Jadwal','Pastikan zona waktu server benar'),R('check','User','Jalankan job dengan akun layanan yang sesuai'),R('check','Log','Simpan output dan catat kegagalan'),R('check','Overlap','Hindari job berjalan tumpang tindih'),R('check','Uji','Jalankan job uji sebelum produksi')]);
});
add('pm2help', ['panduan-pm2'], 'panduan pengelolaan proses Node.js dengan PM2', async (ctx) => {
  await out(ctx,'Panduan PM2','rocket',[R('check','Proses','Pisahkan proses berdasarkan aplikasi'),R('check','Restart','Atur restart policy yang wajar'),R('check','Log','Rotasi log agar disk tidak penuh'),R('check','Startup','Pastikan startup service diuji setelah reboot'),R('check','Resource','Pantau RAM dan CPU tiap proses'),R('warn','Keamanan','Jangan jalankan aplikasi tidak dikenal sebagai root')]);
});
add('sslguide', ['panduan-ssl'], 'checklist sertifikat SSL/TLS', async (ctx) => {
  await out(ctx,'Checklist SSL/TLS','gem',[R('check','Domain','DNS mengarah ke server yang benar'),R('check','Sertifikat','Nama domain cocok dengan sertifikat'),R('check','Masa berlaku','Atur pembaruan otomatis dan pantau expiry'),R('check','Private key','Jangan pernah bagikan private key'),R('check','HTTPS','Uji akses dan redirect setelah pemasangan')]);
});
add('firewallguide', ['panduan-firewall'], 'checklist firewall VPS', async (ctx) => {
  await out(ctx,'Checklist Firewall','crown',[R('check','Default','Tolak koneksi masuk yang tidak diperlukan'),R('check','SSH','Batasi sumber akses administrasi'),R('check','Web','Izinkan HTTP/HTTPS hanya jika digunakan'),R('check','Panel','Buka port panel/daemon sesuai konfigurasi'),R('check','Audit','Hapus aturan lama yang tidak digunakan'),R('warn','Peringatan','Jangan ubah firewall tanpa akses console cadangan')]);
});
add('deployguide', ['panduan-deploy'], 'checklist deploy aplikasi ke VPS', async (ctx) => {
  await out(ctx,'Checklist Deploy','rocket',[R('check','Source','Ambil kode dari repository tepercaya'),R('check','Dependency','Kunci versi dependency dan audit paket'),R('check','Environment','Pisahkan secret dari source code'),R('check','Build','Uji build dan health check'),R('check','Process','Gunakan process manager/service manager'),R('check','Rollback','Siapkan versi sebelumnya sebelum rilis')]);
});
add('logguide', ['panduan-log'], 'panduan membaca dan merawat log server', async (ctx) => {
  await out(ctx,'Panduan Log Server','eyes',[R('check','Aplikasi','Periksa error aplikasi dan waktu kejadian'),R('check','Web server','Cocokkan access log dan error log'),R('check','Service','Periksa status service dan journal'),R('check','Disk','Atur rotasi dan retensi log'),R('check','Privasi','Sensor token, email, dan data pelanggan sebelum dibagikan')]);
});
add('dnscheck', ['cekdns'], 'cek DNS domain: .dnscheck example.com', async (ctx) => {
  const dns=require('dns').promises;const host=String(ctx.args[0]||'').trim().toLowerCase();if(!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(host))throw new UserErr('Masukkan domain valid. Contoh: .dnscheck example.com');
  const results=await Promise.allSettled([dns.resolve4(host),dns.resolve6(host),dns.resolveCname(host)]);const rows=[R('link','Domain',host)];for(let i=0;i<results.length;i++){const label=['IPv4','IPv6','CNAME'][i],v=results[i];rows.push(R(v.status==='fulfilled'?'check':'warn',label,v.status==='fulfilled'?v.value.join(', '):'Tidak ada record / tidak tersedia'));}await out(ctx,'Pemeriksaan DNS','link',rows,{checks:[[true,'Hasil berasal dari resolver DNS server bot']]});
});

add('servercheck', ['cekserver'], 'diagnostik server lokal tanpa mengubah konfigurasi', async (ctx) => {
  const total=os.totalmem(),free=os.freemem(),load=os.loadavg()[0],cores=os.cpus().length;const rows=[R('check','Node.js',process.version),R('gear','Platform',`${os.platform()} ${os.arch()}`),R('chart','Load/core',fmt(load/Math.max(1,cores))),R('box','RAM tersedia',`${fmt(free/total*100)}%`),R('time','Uptime',dur(os.uptime()))];
  await out(ctx,'Diagnostik Server','check',rows,{checks:[[free/total>.1,'RAM tersedia di atas 10%'],[load/Math.max(1,cores)<2,'Load/core di bawah 2 (indikator kasar)'],[true,'Pemeriksaan hanya membaca informasi sistem']]});
});
add('jsbeautify', ['deob','beautify'], 'rapikan kode JavaScript teks/reply: .deob <kode> (formatter dasar)', async (ctx) => {
  let src=ctx.args.join(' ');let attached=null; if(!src){const r=await ctx.msg.getReplyMessage().catch(()=>null);src=r&&r.message||'';if(r&&r.media&&r.document){const name=((r.document.attributes||[]).find(a=>a.fileName)||{}).fileName||'source.js';if(!/\.(js|mjs|cjs|json|ts|txt)$/i.test(name))throw new UserErr('File yang didukung: .js .mjs .cjs .json .ts .txt');attached={message:r,name};}}if(!src&&!attached)throw new UserErr('Balas file/kode JavaScript atau gunakan .deob <kode>. Formatter ini merapikan format, bukan membuka enkripsi/proteksi.');if(attached){const buf=await ctx.client.downloadMedia(attached.message.media,{workers:1});if(!buf||buf.length>512*1024)throw new UserErr('File kosong atau melebihi batas 512 KB.');src=Buffer.from(buf).toString('utf8');}if(src.length>12000&&!attached)throw new UserErr('Maksimal 12.000 karakter untuk input teks. File maksimal 512 KB.');
  // Conservative formatter: normalizes indentation around braces and semicolons without eval/execute.
  let outText='',indent=0,quote='',escape=false,line='';const flush=()=>{const x=line.trim();if(x)outText+='  '.repeat(Math.max(0,indent))+x+'\n';line='';};
  for(let i=0;i<src.length;i++){const c=src[i];if(quote){line+=c;if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"||c==='`'){quote=c;line+=c;continue;}if(c==='{'){line=line.trimEnd()+' {';flush();indent++;}else if(c==='}'){flush();indent=Math.max(0,indent-1);line='}';const nx=src[i+1];if(nx!==';'&&nx!==')'&&nx!==','&&nx!==']')flush();}else if(c===';'){line+=';';flush();}else if(c==='\n'||c==='\r'){flush();}else if(c===' '||c==='\t'){if(line&&!line.endsWith(' '))line+=' ';}else line+=c;}flush();
  const result=outText.trim()||src;await out(ctx,'JavaScript Formatter','code',[R('tag','Input',`${src.length} karakter`),R('check','Output',`${result.length} karakter`),R('tag','Mode','Formatter dasar · tidak menjalankan kode')],{extra:`<blockquote>${esc(result.slice(0,2800))}</blockquote>`,extraText:result.slice(0,2800),checks:[[true,'Periksa ulang hasil formatter sebelum dipakai'],[true,'Tidak menghapus proteksi atau mendekripsi file']]});
});

const help=defs.map(d=>({cmd:d.cmd,alias:d.alias,desc:d.desc}));
const commands={};
for(const d of defs){const fn=async(ctx)=>{try{await d.run(ctx);}catch(err){console.error(`[${d.cmd}]`,err);await out(ctx,'Fitur VPS & Panel','warn',[R('warn','Status',String(err.userMsg||err.message||'Terjadi kesalahan').slice(0,500)),R('tag','Perintah',`.${d.cmd}`)]);}};commands[d.cmd]=fn;for(const a of d.alias)commands[a]=fn;}
module.exports={name:'serveradmin',category:'VPS & Panel',help,commands};

// ===== MENU SHARE (UBOT ARTA PEDIA) =====
//   .autobc  (balas pesan)  -> wizard tombol: jeda putaran -> target (grup/kontak/channel) -> hitung jumlah
//                              -> cara kirim (copy paste / forward) -> jeda antar chat (1-10 detik) -> mulai
//   .autobc status | .autobc stop | .stopautobc
//   .autobc2 add (balas pesan) -> tambah pesan ke daftar (maks 10) | .autobc2 list | .autobc2 del <no> | .autobc2 clear
//   .autobc2                -> wizard seperti .autobc, kirim SEMUA pesan di daftar (berurutan / gantian tiap putaran / acak) | .autobc2 stop
//   .cfd  (balas pesan)     -> forward cepat sekali ke SEMUA grup (tanpa menu)      .cfd [jeda detik] | .cfd stop
//   .autocfd <jeda> [delay] -> cfd berulang otomatis                                .autocfd status | .autocfd stop
// Blacklist (.addbl / .delbl / .listbl / .clearbl) berlaku untuk semua: chat yang di-blacklist TIDAK menerima apa pun.
// Setiap kiriman otomatis diberi watermark (lihat watermark.js).
// Pengaturan tersimpan di data/db.json (kunci "autobc" / "autocfd" per pengguna) dan dilanjutkan otomatis saat bot restart.
const crypto = require("crypto");
const db = require("../db");
const { shared, tg, esc, em, stripCustom, normId, fmtTime, TZL, send, sendRich, btn } = require("../core");
const { card, show, edit, rawEdit, footerOf, clip } = require("../ui");
const { style } = require("../fxcard");
const { sendViaInlineAny, notifyAnswered } = require("../inline");
const { parseDuration } = require("./remind");
const BC = require("./broadcast").engine;
const WM = require("../watermark");

const E = {
  mega: "6098421155897545579",
  chart: "5231200819986047254",
  pin: "5397782960512444700",
  ok: "5317020017521359483",
  no: "5316999925664347033",
  ban: "5240241223632954241",
  box: "5992390297533816030",
  bolt: "5377396889652060561",
  spin: "5386367538735104399",
  rocket: "5217880283860194582",
};
const BTN_ICON = "5260379144167890225";

const MIN_MS = 5 * 60000;
const MAX_MS = 7 * 86400000;
const NAMES = { g: "Grup", c: "Channel", p: "Kontak" };
const JEDA_MIN = [10, 15, 20, 25, 30, 35]; // menit
const JEDA_JAM = [1, 2, 3, 4, 5]; // jam
const DELAYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // detik antar chat
const STEPS = ["jeda", "target", "cara", "delay", "confirm"];
const STEPS2 = ["jeda", "target", "cara", "delay", "urut", "confirm"]; // .autobc2 punya langkah tambahan: urutan pesan
const URUT = { semua: "Semua pesan berurutan ke tiap chat", gantian: "Gantian: 1 pesan per putaran", acak: "Acak: 1 pesan acak per chat" };
const MAX_POOL = 10;
const stepsOf = (job) => (job.kind === "autobc2" ? STEPS2 : STEPS);

const jobs = new Map(); // wizard
const loops = new Map(); // "kind:uid" -> { timer, running, stop, cfg, srcPeer, misses }
const cfdRuns = new Map(); // uid -> { stop }

const sleep = BC.sleep;
const lk = (kind, uid) => `${kind}:${uid}`;
const human = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return [d && `${d} hari`, h && `${h} jam`, m && `${m} menit`].filter(Boolean).join(" ") || `${s} detik`;
};
const targetNames = (t) => Object.keys(NAMES).filter((k) => t[k]).map((k) => NAMES[k]).join(" + ") || "-";
const anyT = (t) => !!(t.g || t.c || t.p);

// ===== Pemindai chat (hormati blacklist + hak kirim) =====
const kindOf = (d) => {
  const ent = d.entity;
  if (!ent) return null;
  if (ent.left || ent.deactivated) return null;
  if (d.isUser) return !ent.bot && !ent.deleted && !ent.self && String(ent.id) !== "777000" ? "p" : null;
  if (d.isGroup) return "g";
  if (d.isChannel) {
    // channel siaran hanya bisa diposting oleh pemilik/admin
    if (ent.broadcast && !ent.creator && !ent.adminRights) return null;
    return "c";
  }
  return null;
};

// Bisa kirim pesan ke grup ini? (pembatasan khusus akun menimpa pembatasan default grup)
const canPost = (ent) => {
  if (!ent || ent.creator || ent.adminRights) return true;
  if (ent.bannedRights) return !ent.bannedRights.sendMessages;
  if (ent.defaultBannedRights && ent.defaultBannedRights.sendMessages) return false;
  return true;
};

// Alasan gagal -> label singkat untuk laporan
const REASONS = [
  [/SLOWMODE/i, "slowmode"], [/WRITE_FORBIDDEN|CHAT_SEND_PLAIN_FORBIDDEN|CHAT_SEND_.*FORBIDDEN/i, "dilarang kirim"],
  [/USER_BANNED_IN_CHANNEL|BANNED/i, "akun dibanned"], [/NOT_PARTICIPANT|CHANNEL_PRIVATE|PEER_ID_INVALID/i, "bukan anggota/grup tak bisa diakses"],
  [/FORWARDS_RESTRICTED/i, "forward dilarang"], [/NOT_DELIVERED/i, "tidak terkonfirmasi"], [/PEER_FLOOD/i, "limit spam akun"],
  [/PRIVACY/i, "privasi kontak"], [/TIMEOUT|ETIMEDOUT|ECONN|network/i, "jaringan"],
];
const reasonOf = (err) => {
  const code = String((err && (err.errorMessage || err.message)) || "ERROR");
  for (const [re, label] of REASONS) if (re.test(code)) return label;
  return code.replace(/[^A-Za-z0-9_ ]/g, "").slice(0, 30) || "error";
};
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
const reasonsText = (o) => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, v]) => `${k} \u00D7${v}`).join(", ");

async function scan(client, userId, want, withEntities) {
  const bl = BC.readBlacklist({ userId });
  const defBl = require("../lib/defaultBl");
  const res = { targets: [], peers: new Map(), counts: { g: 0, c: 0, p: 0 }, blacklisted: 0, noSend: 0 };
  const seen = new Set();
  // folder utama + folder arsip (dulu grup yang di-arsip tidak pernah kebagian pesan)
  const folders = shared.cfg.share_include_archived === false ? [undefined] : [undefined, 1];
  for (const folder of folders) {
    try {
      for await (const d of client.iterDialogs(folder === undefined ? {} : { folder })) {
        if (!d.entity) continue;
        const key = String(d.id);
        if (seen.has(key)) continue;
        seen.add(key);
        if (withEntities) res.peers.set(key, d.inputEntity || d.entity);
        const k = kindOf(d);
        if (!k || !want[k]) continue;
        if (bl.has(normId(d.id)) || bl.has(normId(d.entity.id)) || defBl.match(d.id, d.entity)) {
          res.blacklisted++;
          continue;
        }
        if (k === "g" && !canPost(d.entity)) { res.noSend++; continue; } // grup yang memang melarang anggota kirim pesan
        res.counts[k]++;
        if (withEntities) res.targets.push(d.entity);
      }
    } catch (err) {
      if (folder === undefined) throw err; // folder utama wajib berhasil; folder arsip boleh gagal
      console.error("[share] scan folder arsip gagal:", err.message);
    }
  }
  return res;
}

// ===== Notifikasi ke chat bot kawalan pengguna =====
async function notify(uid, c) {
  try {
    await sendRich(uid, c.html);
  } catch (_) {
    await send(uid, c.text).catch(() => {});
  }
}

// ===== Mesin putaran berulang (autobc & autocfd) =====
const recOf = (kind, uid) => (db.getUser(uid) || {})[kind] || null;
const persist = (kind, uid, patch) => {
  const cur = recOf(kind, uid);
  if (cur) db.upsertUser(uid, { [kind]: { ...cur, ...patch } });
};
const TITLE = { autobc: "AutoBC", autobc2: "AutoBC2", autocfd: "AutoCFD" };
const nm = (job) => TITLE[job.kind || "autobc"];
const USE_BC = ".autobc  ->  balas pesan lalu pilih lewat tombol\n.autobc status  ->  lihat status\n.autobc stop  ->  hentikan\n.addbl  ->  blacklist chat (tidak akan menerima apa pun)";
const USE_CFD = ".autocfd <jeda> [delay]  ->  mulai (balas pesan)\n.autocfd status  ->  lihat status\n.autocfd stop  ->  hentikan";
const USE_BC2 = ".autobc2 add  ->  balas pesan untuk menambah ke daftar\n.autobc2 list | .autobc2 del <no> | .autobc2 clear\n.autobc2  ->  mulai (pilih lewat tombol)\n.autobc2 status | .autobc2 stop";
const USE = { autobc: USE_BC, autobc2: USE_BC2, autocfd: USE_CFD };

function halt(kind, uid) {
  const k = lk(kind, uid);
  const st = loops.get(k);
  if (st) {
    st.stop = true;
    clearTimeout(st.timer);
    loops.delete(k);
  }
  if (recOf(kind, uid)) db.upsertUser(uid, { [kind]: null });
}

function schedule(kind, uid, at) {
  const st = loops.get(lk(kind, uid));
  if (!st || st.stop) return;
  clearTimeout(st.timer);
  st.cfg.nextAt = at;
  persist(kind, uid, { nextAt: at });
  st.timer = setTimeout(() => runRound(kind, uid).catch((e) => console.error(`[${kind}] putaran gagal:`, e.message)), Math.max(0, at - Date.now()));
  if (st.timer.unref) st.timer.unref();
}

const tidOf = (t, i) => String((t && t.id) || i);
const srcGone = (m) => !m || m.className === "MessageEmpty";

// Satu "siklus" = satu kali menyapu SEMUA chat target. Kalau kena FloodWait di tengah jalan, siklus dilanjutkan
// dari chat yang belum kebagian (bukan mengulang dari awal), dan nomor putaran baru naik setelah siklus benar-benar selesai.
async function doRound(entry, st) {
  const c = st.cfg;
  const started = Date.now();
  const s = await scan(entry.client, entry.userId, c.targets, true);
  const cy = st.cycle || (st.cycle = { done: new Set(), sent: 0, failed: 0, partial: 0, skippedBad: 0, secs: 0, reasons: {}, tries: 0 });
  cy.tries++;
  cy.skipScan = s.blacklisted + s.noSend;
  const r = { sent: 0, failed: 0, total: s.targets.length, secs: 0, pending: 0, complete: false };

  const multi = st.kind === "autobc2";
  let srcs = [];
  // Error jaringan sementara -> dilempar (putaran diulang nanti). Hanya pesan yang BENAR-BENAR hilang yang menghentikan broadcast.
  if (multi) {
    for (const m of c.msgs || []) {
      const peer = s.peers.get(String(m.chat));
      if (!peer) continue;
      const got = (await entry.client.getMessages(peer, { ids: [m.id] }))[0];
      if (!srcGone(got)) srcs.push(got);
    }
    if (!srcs.length) return { fatal: "Semua pesan di daftar sudah tidak ditemukan." };
  } else {
    const peer = st.srcPeer || s.peers.get(String(c.srcChat));
    if (!peer) return { fatal: "Chat sumber pesan tidak ditemukan lagi." };
    const src = (await entry.client.getMessages(peer, { ids: [c.srcMsgId] }))[0];
    if (srcGone(src)) return { fatal: "Pesan sumber sudah dihapus." };
    st.srcPeer = peer;
    srcs = [src];
  }

  const mode = c.cara === "fwd" ? "fwd" : "direct";
  const round = c.rounds || 0;
  for (let i = 0; i < s.targets.length; i++) {
    if (st.stop) break;
    const tid = tidOf(s.targets[i], i);
    if (cy.done.has(tid)) continue; // sudah diproses di siklus ini (sebelum terjeda)
    if (st.bad && st.bad.get(tid) > Date.now()) { cy.done.add(tid); cy.skippedBad++; continue; } // jelas tidak bisa dikirimi: dilewati 6 jam
    let list = srcs;
    if (multi && c.urut === "gantian") list = [srcs[round % srcs.length]];
    else if (multi && c.urut === "acak") list = [srcs[Math.floor(Math.random() * srcs.length)]];
    let okMsgs = 0;
    try {
      for (let j = 0; j < list.length; j++) {
        // watermark hanya pada pesan TERAKHIR tiap chat (userId undefined = tanpa watermark)
        await BC.withRetry(() => BC.sendOne(entry.client, s.targets[i], list[j], mode, j === list.length - 1 ? entry.userId : undefined), entry.client);
        okMsgs++;
        if (j < list.length - 1) await sleep(BC.jitter(1500));
      }
      r.sent++; cy.sent++; cy.done.add(tid);
    } catch (err) {
      if (err && err.floodPause) {
        // chat ini belum sempat terkirim (bukan gagal): tetap "belum diproses", dilanjutkan setelah limit lewat
        r.flood = err.seconds;
        console.error(`[${st.kind}] kena limit Telegram (FloodWait ${err.seconds} dtk), putaran dijeda, sisa dilanjutkan setelah limit`);
        break;
      }
      r.failed++; cy.failed++; cy.done.add(tid);
      if (okMsgs > 0) cy.partial++; // autobc2: sebagian pesan sudah masuk, sisanya gagal
      const code = String(err.errorMessage || err.message || "");
      bump(cy.reasons, reasonOf(err));
      const tgt = s.targets[i] || {};
      if (/USER_BANNED_IN_CHANNEL|CHANNEL_PRIVATE|USER_NOT_PARTICIPANT|CHAT_WRITE_FORBIDDEN/.test(code)) (st.bad = st.bad || new Map()).set(tid, Date.now() + 6 * 3600e3);
      console.error(`[${st.kind}] gagal kirim ke ${tgt.title || tgt.username || tid}:`, code);
    }
    if (i < s.targets.length - 1 && !st.stop) {
      const until = Date.now() + BC.jitter(c.delay * 1000);
      while (Date.now() < until && !st.stop) await sleep(Math.min(500, until - Date.now()));
    }
  }
  r.secs = Math.round((Date.now() - started) / 1000);
  cy.secs += r.secs;
  r.pending = s.targets.filter((t, i) => !cy.done.has(tidOf(t, i))).length;
  r.complete = !r.flood && !st.stop && r.pending === 0;
  return r;
}

async function runRound(kind, uid) {
  const st = loops.get(lk(kind, uid));
  if (!st || st.stop || st.running) return;
  const entry = shared.manager && shared.manager.getByUser(uid);
  if (!entry) {
    st.misses = (st.misses || 0) + 1;
    if (st.misses > 60) {
      clearTimeout(st.timer);
      loops.delete(lk(kind, uid));
      return;
    }
    return schedule(kind, uid, Date.now() + 60000);
  }
  st.misses = 0;
  st.running = true;
  const began = Date.now();
  let r;
  try {
    r = await doRound(entry, st);
  } catch (err) {
    console.error(`[${kind}] putaran error:`, err.message);
    r = { error: err.errorMessage || err.message };
  }
  st.running = false;
  if (st.stop) return;

  const T = TITLE[kind];
  if (r.fatal) {
    halt(kind, uid);
    await notify(uid, card(style({
      title: `${T} Dihentikan`, icon: "mega", lead: `${T} berhenti otomatis`,
      rows: [["no", "Alasan", esc(r.fatal)], ["chart", "Putaran selesai", String(st.cfg.rounds || 0)]],
      checks: [[false, "Pesan sumber / chat sumber tidak tersedia lagi"]],
    }, USE[kind])));
    return;
  }

  const c = st.cfg;
  const cy = st.cycle || { sent: 0, failed: 0, partial: 0, skippedBad: 0, skipScan: 0, secs: 0, reasons: {}, done: new Set() };
  if (!r.error) {
    c.sent = (c.sent || 0) + r.sent;
    c.failed = (c.failed || 0) + r.failed;
    if (r.complete) c.rounds = (c.rounds || 0) + 1; // nomor putaran naik hanya bila SEMUA chat target sudah diproses
    persist(kind, uid, { rounds: c.rounds || 0, sent: c.sent, failed: c.failed });
  }
  let next;
  if (r.error) next = Math.min(began + c.intervalMs, Date.now() + 5 * 60000); // error sementara: coba lagi lebih cepat
  else if (r.flood) next = Date.now() + (r.flood + 5) * 1000; // jeda limit: lanjutkan sisa chat segera setelah limit lewat
  else next = Math.max(began + c.intervalMs, Date.now() + 10000);
  schedule(kind, uid, next);

  const report = shared.cfg.autobc_report !== false;
  const done = cy;
  const skipped = (done.skipScan || 0) + (done.skippedBad || 0);
  const why = Object.keys(done.reasons).length ? [["tag", "Penyebab gagal", esc(reasonsText(done.reasons))]] : [];
  const when = `${esc(fmtTime(next, true))} ${esc(TZL)}`;
  if (r.complete) st.cycle = null; // siklus selesai; putaran berikutnya mulai dari awal

  if (report) {
    let c2;
    if (r.error) {
      c2 = card(style({
        title: `${T} Putaran Gagal`, icon: "mega", lead: "Putaran ini tidak selesai, akan dicoba lagi",
        rows: [["warn", "Alasan", esc(clip(r.error, 200))], ["time", "Coba lagi", when]],
        checks: [[false, "Putaran gagal"]],
      }, USE[kind]));
    } else if (!r.complete) {
      const processed = done.done.size;
      c2 = card(style({
        title: `${T} Putaran #${(c.rounds || 0) + 1} Dijeda`, icon: "mega", lead: "Putaran belum selesai, dilanjutkan otomatis",
        rows: [
          ["chart", "Progres", `${processed}/${r.total}`],
          ["ok", "Terkirim (terkonfirmasi)", String(done.sent)],
          ["tag", "Gagal", String(done.failed)],
          ["warn", "Belum diproses", String(r.pending)],
          ...why,
          ...(r.flood ? [["warn", "Limit Telegram", `FloodWait ${r.flood} detik`]] : []),
          ["gear", "Lanjut", when],
        ],
        checks: [[false, "Kena limit Telegram, sisa chat dilanjutkan, tidak diulang dari awal"]],
      }, USE[kind]));
    } else {
      c2 = card(style({
        title: `${T} Putaran #${c.rounds}`, icon: "mega", lead: "Laporan broadcast otomatis",
        rows: [
          ["chart", "Total target", String(r.total + (done.skipScan || 0))],
          ["ok", "Terkirim (terkonfirmasi)", String(done.sent)],
          ["tag", "Gagal", String(done.failed)],
          ...(done.partial ? [["warn", "Sebagian terkirim", String(done.partial)]] : []),
          ...why,
          ["chart", "Dilewati (blacklist / dilarang kirim)", String(skipped)],
          ["time", "Durasi", `${done.secs} detik`],
          ["gear", "Berikutnya", when],
        ],
        checks: [[true, "Putaran selesai"], [done.failed === 0, done.failed === 0 ? "Semua chat berhasil" : `${done.failed} chat gagal`]],
      }, USE[kind]));
    }
    await notify(uid, c2);
  }
}

function startLoop(kind, uid, cfg, srcPeer, firstAt) {
  const old = loops.get(lk(kind, uid));
  if (old) {
    old.stop = true;
    clearTimeout(old.timer);
  }
  loops.set(lk(kind, uid), { kind, timer: null, running: false, stop: false, cfg, srcPeer: srcPeer || null, misses: 0 });
  schedule(kind, uid, firstAt);
}

function statusCard(ctx, kind, rec, st) {
  const running = !!(st && st.running);
  return card(style({
    title: `${TITLE[kind]} Aktif`, icon: "mega", lead: "Broadcast otomatis sedang berjalan",
    rows: [
      ["tag", "Target", esc(targetNames(rec.targets))],
      ["gear", "Cara kirim", rec.cara === "fwd" ? "Forward" : "Copy paste"],
      ["time", "Jeda putaran", esc(human(rec.intervalMs))],
      ["gear", "Jeda antar chat", `${rec.delay} detik`],
      ...(kind === "autobc2"
        ? [["link", "Jumlah pesan", String((rec.msgs || []).length)], ["gear", "Urutan", esc(URUT[rec.urut] || "-")]]
        : [["link", "Sumber", esc(clip(rec.srcTitle || "-", 40))]]),
      ["chart", "Putaran selesai", String(rec.rounds || 0)],
      ["ok", "Terkirim / Gagal", `${rec.sent || 0} / ${rec.failed || 0}`],
      ["time", "Berikutnya", rec.nextAt ? `${esc(fmtTime(rec.nextAt, true))} ${esc(TZL)}` : "-"],
    ],
    checks: [[true, `${TITLE[kind]} aktif`], [running, running ? "Sedang mengirim putaran ini" : "Menunggu putaran berikutnya"]],
    footer: footerOf(ctx.account),
  }, USE[kind]));
}

async function statusCmd(ctx, kind) {
  const uid = String(ctx.account.userId);
  const rec = recOf(kind, uid);
  if (!rec) return edit(ctx, `Guna:\n${USE[kind]}\n\n(${TITLE[kind]} belum aktif)`);
  return show(ctx, statusCard(ctx, kind, rec, loops.get(lk(kind, uid))));
}

async function stopCmd(ctx, kind) {
  const uid = String(ctx.account.userId);
  const rec = recOf(kind, uid);
  if (!rec && !loops.has(lk(kind, uid))) return edit(ctx, `\u26A0\uFE0F Tidak ada ${TITLE[kind]} yang aktif.`);
  halt(kind, uid);
  await show(ctx, card(style({
    title: `${TITLE[kind]} Dihentikan`, icon: "mega", lead: "Broadcast otomatis sudah dihentikan",
    rows: [
      ["tag", "Target", esc(rec ? targetNames(rec.targets) : "-")],
      ["chart", "Putaran selesai", String((rec && rec.rounds) || 0)],
      ["ok", "Total terkirim", String((rec && rec.sent) || 0)],
      ["tag", "Total gagal", String((rec && rec.failed) || 0)],
    ],
    checks: [[true, `${TITLE[kind]} dihentikan`]],
    footer: footerOf(ctx.account),
  }, USE[kind])));
}

async function srcInfo(ctx) {
  let srcTitle = "Private";
  try {
    const chat = await ctx.msg.getChat();
    srcTitle = chat.title || [chat.firstName, chat.lastName].filter(Boolean).join(" ") || srcTitle;
  } catch (_) {}
  return srcTitle;
}

// ===== .autocfd =====
async function autocfdCmd(ctx) {
  const { msg, args, account } = ctx;
  const uid = String(account.userId);
  const sub = String(args[0] || "").toLowerCase();
  if (["stop", "off", "berhenti"].includes(sub)) return stopCmd(ctx, "autocfd");
  if (!args.length || ["status", "info"].includes(sub)) return statusCmd(ctx, "autocfd");
  if (recOf("autocfd", uid)) return edit(ctx, "\u26A0\uFE0F AutoCFD sudah aktif. Cek dengan .autocfd status atau hentikan dengan .autocfd stop");

  const intervalMs = parseDuration(args[0]);
  if (!intervalMs || intervalMs < MIN_MS || intervalMs > MAX_MS) {
    return edit(ctx, "\u26A0\uFE0F Jeda tidak valid. Minimum 5m, maksimum 7 hari. Contoh: 30m, 1h, 1h30m\nGuna:\n" + USE_CFD);
  }
  const delay = Math.min(60, Math.max(1, parseFloat(args[1]) || Number(shared.cfg.broadcast_delay) || 3));
  const rm = await msg.getReplyMessage().catch(() => null);
  if (!rm) return edit(ctx, "\u26A0\uFE0F Balas (reply) pesan yang mau disebar.\nGuna:\n" + USE_CFD);

  const srcTitle = await srcInfo(ctx);
  const cfg = {
    srcChat: String(msg.chatId), srcMsgId: rm.id, srcTitle,
    targets: { g: true, c: false, p: false }, cara: "fwd",
    intervalMs, delay, startedAt: Date.now(), rounds: 0, sent: 0, failed: 0, nextAt: Date.now(),
  };
  db.upsertUser(uid, { autocfd: cfg });
  startLoop("autocfd", uid, cfg, msg.peerId, Date.now() + 3000);
  await show(ctx, card(style({
    title: "AutoCFD Dimulai", icon: "mega", lead: "Forward otomatis ke semua grup",
    rows: [
      ["tag", "Target", "Semua grup"],
      ["time", "Jeda putaran", esc(human(intervalMs))],
      ["gear", "Jeda antar grup", `${delay} detik`],
      ["link", "Sumber", esc(clip(srcTitle, 40))],
      ["tag", "Watermark", esc(WM.get(uid) || "nonaktif")],
    ],
    checks: [[true, "Pengaturan tersimpan (lanjut otomatis saat bot restart)"], [true, "Putaran pertama jalan sebentar lagi"]],
    footer: footerOf(account),
  }, USE_CFD)));
}

// ===== .cfd (sekali kirim, forward ke semua grup) =====
async function cfdCmd(ctx) {
  const { msg, args, account, client } = ctx;
  const uid = String(account.userId);
  const sub = String(args[0] || "").toLowerCase();
  if (["stop", "off"].includes(sub)) {
    const r = cfdRuns.get(uid);
    if (!r) return edit(ctx, "\u26A0\uFE0F Tidak ada CFD yang berjalan.");
    r.stop = true;
    return rawEdit(ctx, "\u23F9 CFD dihentikan...");
  }
  if (cfdRuns.has(uid)) return edit(ctx, "\u26A0\uFE0F CFD sedang berjalan. Hentikan dengan .cfd stop");
  const rm = await msg.getReplyMessage().catch(() => null);
  if (!rm) return edit(ctx, "Guna: .cfd [jeda detik]  (balas pesan yang mau di-forward ke semua grup)\nHentikan: .cfd stop\nBerulang otomatis: .autocfd 30m");
  const delay = Math.min(60, Math.max(1, parseFloat(args[0]) || Number(shared.cfg.broadcast_delay) || 3));

  const run = { stop: false };
  cfdRuns.set(uid, run);
  await rawEdit(ctx, "\u23F3 CFD: menyiapkan daftar grup...");
  (async () => {
    const started = Date.now();
    const st = { sent: 0, failed: 0 };
    let total = 0, skipped = 0, flood = 0, processed = 0;
    const reasons = {};
    try {
      const s = await scan(client, uid, { g: true, c: false, p: false }, true);
      total = s.targets.length;
      skipped = s.blacklisted + s.noSend;
      const src = (await client.getMessages(msg.peerId, { ids: [rm.id] }))[0];
      if (srcGone(src)) throw new Error("Pesan sumber tidak ditemukan.");
      let last = 0;
      for (let i = 0; i < s.targets.length; i++) {
        if (run.stop) break;
        try {
          await BC.withRetry(() => BC.sendOne(client, s.targets[i], src, "fwd", uid), client);
          st.sent++; processed++;
        } catch (err) {
          if (err && err.floodPause) { flood = err.seconds; console.error(`[cfd] kena limit Telegram (FloodWait ${err.seconds} dtk), CFD dihentikan lebih awal`); break; }
          st.failed++; processed++;
          bump(reasons, reasonOf(err));
          console.error("[cfd] gagal kirim ke satu grup:", err.errorMessage || err.message);
        }
        if (Date.now() - last > 5000) {
          last = Date.now();
          rawEdit(ctx, `\u23F3 CFD berjalan ${processed}/${total}  (ok ${st.sent}, gagal ${st.failed})\nHentikan: .cfd stop`).catch(() => {});
        }
        if (i < s.targets.length - 1 && !run.stop) {
          const until = Date.now() + BC.jitter(delay * 1000);
          while (Date.now() < until && !run.stop) await sleep(Math.min(500, until - Date.now()));
        }
      }
      await show(ctx, card(style({
        title: run.stop ? "CFD Dihentikan" : flood ? "CFD Terhenti (limit)" : "CFD Selesai", icon: "mega", lead: "Forward ke semua grup",
        rows: [
          ["ok", "Terkirim", String(st.sent)],
          ["tag", "Gagal", String(st.failed)],
          ["chart", "Dilewati (blacklist)", String(skipped)],
          ["gear", "Total grup", String(total)],
          ...(Object.keys(reasons).length ? [["tag", "Penyebab gagal", esc(reasonsText(reasons))]] : []),
          ...(total - processed > 0 ? [["warn", "Belum terkirim (sisa)", String(total - processed)]] : []),
          ...(flood ? [["warn", "Limit Telegram", `FloodWait ${flood} detik, CFD berhenti lebih awal`]] : []),
          ["time", "Durasi", `${Math.round((Date.now() - started) / 1000)} detik`],
        ],
        checks: [[!run.stop && !flood, run.stop ? "Dihentikan manual" : flood ? "Terhenti karena limit Telegram" : "Selesai"]],
        footer: footerOf(account),
      }, ".cfd [jeda]  |  .cfd stop  |  .autocfd 30m")));
    } catch (err) {
      await rawEdit(ctx, "\u26A0\uFE0F CFD gagal: " + String(err.errorMessage || err.message).slice(0, 200)).catch(() => {});
    } finally {
      cfdRuns.delete(uid);
    }
  })();
}

// ===== .autobc : wizard tombol lewat bot kawalan =====
const rowsInfo = (job) => {
  const r = [[`${em(E.chart, "\uD83D\uDCCA")} ${job.kind === "autobc2" ? "Pesan" : "Sumber"}`, esc(clip(job.kind === "autobc2" ? `${job.msgs.length} pesan` : job.srcTitle, 30))]];
  if (job.intervalMs) r.push([`${em(E.spin, "\u23F3")} Jeda putaran`, esc(human(job.intervalMs))]);
  if (anyT(job.targets)) r.push([`${em(E.pin, "\uD83D\uDCCC")} Target`, esc(targetNames(job.targets))]);
  if (job.cara) r.push(["\uD83D\uDCE8 Cara kirim", job.cara === "fwd" ? "Forward" : "Copy paste"]);
  if (job.delay) r.push([`${em(E.bolt, "\u26A1")} Jeda antar chat`, `${job.delay} detik`]);
  if (job.urut) r.push(["\uD83D\uDD00 Urutan pesan", esc(URUT[job.urut])]);
  const wm = WM.get(job.userId);
  r.push(["\uD83C\uDFF7 Watermark", wm ? esc(wm) : "nonaktif"]);
  return r;
};
const tbl = (rows) => `<table bordered><tr><th>Info</th><th>Nilai</th></tr>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table>`;
const txt = (rows) => rows.map(([k, v]) => `${k} : <b>${v}</b>`).join("\n");

function screen(title, lead, rows, kb) {
  const head = `${em(E.mega, "\uD83D\uDCE2")}`;
  const html = `<h3>${head} ${title}</h3><p>${lead}</p>${rows.length ? tbl(rows) : ""}`;
  const text = `${head} <b>${title}</b>\n\n${lead}${rows.length ? "\n\n" + txt(rows) : ""}`;
  return { html, text, kb };
}
const B = (f, label, job, act, o = {}) => btn(f, label, `sh:${job.id}:${act}`, o.style, o.icon);
const grid = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

function screenJeda(job) {
  return screen(nm(job), `<b>Langkah 1/${job.kind === "autobc2" ? 5 : 4}</b> \u2014 Pilih jeda antar putaran. Setelah semua chat target selesai dikirim, ${nm(job)} menunggu sesuai jeda ini lalu mengulang.`, rowsInfo(job), (f) => [
    ...grid(JEDA_MIN.map((m) => B(f, `${m} menit`, job, `jm${m}`)), 3),
    ...grid(JEDA_JAM.map((h) => B(f, `${h} jam`, job, `jh${h}`)), 3),
    [B(f, "\u2716 Batal", job, "cancel", { style: "danger" })],
  ]);
}

function screenTarget(job) {
  const c = job.counts;
  const t = job.targets;
  const rows = rowsInfo(job);
  let lead = `<b>Langkah 2/${job.kind === "autobc2" ? 5 : 4}</b>` + " \u2014 Pilih tujuan kirim (boleh lebih dari satu). Tombol hijau \u2713 = dipilih.";
  if (!c) lead += "\n\u23F3 Menghitung jumlah grup, channel, dan kontak...";
  else {
    rows.push([`${em(E.box, "\uD83D\uDCE6")} Grup`, String(c.g)]);
    rows.push([`${em(E.box, "\uD83D\uDCE6")} Channel (yang Anda admin)`, String(c.c)]);
    rows.push([`${em(E.box, "\uD83D\uDCE6")} Kontak`, String(c.p)]);
    rows.push([`${em(E.ban, "\uD83D\uDEAB")} Diblacklist (dilewati)`, String(c.bl)]);
    rows.push([`${em(E.chart, "\uD83D\uDCCA")} Total terpilih`, String(totalSel(job))]);
  }
  return screen(nm(job), lead, rows, (f) => {
    const tg_ = (k, label) => B(f, `${t[k] ? "\u2713 " : ""}${label}${c ? ` (${c[k]})` : ""}`, job, `t${k}`, { style: t[k] ? "success" : "danger" });
    return [
      [tg_("g", "\uD83D\uDC65 Grup"), tg_("c", "\uD83D\uDCE2 Channel")],
      [tg_("p", "\uD83D\uDC64 Kontak"), B(f, "Pilih Semua", job, "tall")],
      [B(f, "Lanjut \u203A", job, "tnext", { style: anyT(t) ? "success" : undefined, icon: BTN_ICON })],
      [B(f, "\u2039 Kembali", job, "back")],
    ];
  });
}

const totalSel = (job) => (job.counts ? Object.keys(NAMES).reduce((n, k) => n + (job.targets[k] ? job.counts[k] : 0), 0) : 0);

function screenCara(job) {
  const lead =
    `<b>Langkah 3/${job.kind === "autobc2" ? 5 : 4}</b>` + " \u2014 Pilih cara kirim.\n" +
    "\u2022 <b>Copy paste</b>: pesan dikirim ulang sebagai pesan baru (disarankan, tidak ada label forward).\n" +
    "\u2022 <b>Forward</b>: pesan diteruskan apa adanya. \u26A0\uFE0F Banyak grup melarang forward dan bot penjaga akan menghapusnya.";
  return screen(nm(job), lead, rowsInfo(job), (f) => [
    [B(f, "\uD83D\uDCDD Copy Paste", job, "cc", { style: "success", icon: BTN_ICON })],
    [B(f, "\u21AA\uFE0F Forward", job, "cf")],
    [B(f, "\u2039 Kembali", job, "back")],
  ]);
}

function screenDelay(job) {
  return screen(nm(job), `<b>Langkah 4/${job.kind === "autobc2" ? 5 : 4}</b> \u2014 Pilih jeda antar chat (jarak waktu kirim dari satu grup ke grup berikutnya). Jeda lebih lama = lebih aman dari limit.`, rowsInfo(job), (f) => [
    ...grid(DELAYS.map((d) => B(f, `${d} detik`, job, `d${d}`)), 5),
    [B(f, "\u2039 Kembali", job, "back")],
  ]);
}

function screenConfirm(job) {
  const total = totalSel(job);
  const rows = rowsInfo(job);
  rows.push([`${em(E.box, "\uD83D\uDCE6")} Total chat tujuan`, String(total)]);
  rows.push([`${em(E.spin, "\u23F3")} Estimasi 1 putaran`, esc(human(total * job.delay * 1000))]);
  const lead = total
    ? `Periksa pengaturan di bawah. Tekan <b>Mulai</b> untuk menjalankan ${nm(job)}. Chat yang di-blacklist tidak akan menerima pesan.`
    : "\u26A0\uFE0F Tidak ada chat tujuan untuk target ini. Kembali dan pilih target lain.";
  return screen(`Konfirmasi ${nm(job)}`, lead, rows, (f) => [
    [B(f, `\uD83D\uDE80 Mulai ${nm(job)}`, job, "go", { style: total ? "success" : undefined, icon: BTN_ICON })],
    [B(f, "\u2039 Kembali", job, "back"), B(f, "\u2716 Batal", job, "cancel", { style: "danger" })],
  ]);
}

function screenUrut(job) {
  const lead = "<b>Langkah 5/5</b> \u2014 Pilih urutan pesan dari daftar Anda.\n\u2022 <b>Berurutan</b>: semua pesan dikirim berurutan ke tiap chat.\n\u2022 <b>Gantian</b>: tiap putaran memakai 1 pesan (pesan 1, lalu 2, dst).\n\u2022 <b>Acak</b>: tiap chat dapat 1 pesan acak.";
  return screen(nm(job), lead, rowsInfo(job), (f) => [
    [B(f, "\uD83D\uDCDA Berurutan (semua)", job, "u1", { style: "success", icon: BTN_ICON })],
    [B(f, "\uD83D\uDD01 Gantian per putaran", job, "u2")],
    [B(f, "\uD83C\uDFB2 Acak per chat", job, "u3")],
    [B(f, "\u2039 Kembali", job, "back")],
  ]);
}

const screenStarted = (job) =>
  screen(`${nm(job)} Dimulai`, `${em(E.ok, "\u2705")} ${nm(job)} berjalan. Putaran pertama dimulai sebentar lagi. Laporan tiap putaran dikirim ke chat bot kawalan.`, rowsInfo(job), () => []);
const screenCancel = (job) => screen(`${nm(job || {})} Dibatalkan`, `Pengaturan ${nm(job || {})} dibatalkan. Ketik .${(job && job.kind) || "autobc"} lagi untuk mengulang.`, [], () => []);
const screenError = (m) => screen("AutoBC", `${em(E.no, "\u274C")} ${esc(m)}`, [], () => []);
const SCREENS = { jeda: screenJeda, target: screenTarget, cara: screenCara, delay: screenDelay, urut: screenUrut, confirm: screenConfirm };

// ----- kirim / edit panel -----
async function render(job, scr) {
  const asText = job.ui === "text";
  for (const fancy of [true, false]) {
    try {
      await tg("editMessageText", {
        ...job.ref,
        ...(asText
          ? { text: scr.text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }
          : { rich_message: { html: scr.html } }),
        reply_markup: { inline_keyboard: scr.kb(fancy) },
      });
      return;
    } catch (err) {
      if (/not modified/i.test(err.message)) return;
      console.error("[share] edit panel gagal:", err.message);
    }
  }
}

async function sendToDM(job) {
  const scr = screenJeda(job);
  for (const ui of ["rich", "text"]) {
    for (const fancy of [true, false]) {
      try {
        const r = await tg(
          ui === "rich" ? "sendRichMessage" : "sendMessage",
          ui === "rich"
            ? { chat_id: job.adminId || job.userId, rich_message: { html: scr.html }, reply_markup: { inline_keyboard: scr.kb(fancy) } }
            : { chat_id: job.adminId || job.userId, text: scr.text, parse_mode: "HTML", reply_markup: { inline_keyboard: scr.kb(fancy) } }
        );
        job.ui = ui;
        job.ref = { chat_id: job.adminId || job.userId, message_id: r.message_id };
        return;
      } catch (err) {
        console.error(`[share] kirim panel ke DM (${ui}) gagal:`, err.message);
      }
    }
  }
  throw new Error("Tidak dapat mengirim panel. Pastikan Anda sudah menekan /start pada bot kawalan.");
}

async function answerPanel(ctx, job, asText, key) {
  const base = { inline_query_id: ctx.inlineQuery.id, cache_time: 0, is_personal: true };
  const scr = screenJeda(job);
  let lastErr = "";
  for (const a of asText ? ["text"] : ["rich", "text"]) {
    const resultId = `sh${job.id}${a}`;
    try {
      await tg("answerInlineQuery", {
        ...base,
        results: [{
          type: "article", id: resultId, title: "AutoBC", description: "Panel AutoBC",
          input_message_content: a === "rich"
            ? { rich_message: { html: stripCustom(scr.html) } }
            : { message_text: stripCustom(scr.text), parse_mode: "HTML", link_preview_options: { is_disabled: true } },
          reply_markup: { inline_keyboard: scr.kb(false) },
        }],
      });
      job.ui = a;
      notifyAnswered(key, { queryId: ctx.inlineQuery.id, resultId, kind: a });
      return;
    } catch (err) {
      lastErr = err.message;
      console.error(`[share] jawaban inline "${a}" ditolak:`, err.message);
    }
  }
  notifyAnswered(key, { error: `Telegram menolak jawaban: ${lastErr}` });
}

async function loadCounts(job) {
  if (job.scanning) return;
  job.scanning = true;
  try {
    const s = await scan(job.client, job.userId, { g: true, c: true, p: true }, false);
    job.counts = { ...s.counts, bl: s.blacklisted };
  } catch (err) {
    console.error("[share] hitung chat gagal:", err.message);
    job.counts = { g: 0, c: 0, p: 0, bl: 0 };
  } finally {
    job.scanning = false;
  }
  if (job.step === "target" && jobs.has(job.id)) await render(job, screenTarget(job));
}

function goStep(job, step) {
  job.step = step;
  return render(job, SCREENS[step](job));
}

function registerBot(bot) {
  bot.on("inline_query", async (ctx, next) => {
    const q = ctx.inlineQuery.query.trim();
    const m = q.match(/^(sh|sht) ([0-9a-f]+)$/);
    if (!m) return next();
    const job = jobs.get(m[2]);
    if (!job || String(ctx.from.id) !== job.accountId) {
      notifyAnswered(q, { error: "Sesi AutoBC tidak valid" });
      return tg("answerInlineQuery", { inline_query_id: ctx.inlineQuery.id, cache_time: 0, is_personal: true, results: [] }).catch(() => {});
    }
    await answerPanel(ctx, job, m[1] === "sht", q);
  });

  bot.on("chosen_inline_result", async (ctx, next) => {
    const c = ctx.chosenInlineResult;
    const m = c && String(c.result_id || "").match(/^sh([0-9a-f]{8})(rich|text)$/);
    if (!m) return next();
    const job = jobs.get(m[1]);
    if (!job || String(c.from.id) !== job.accountId || !c.inline_message_id) return;
    job.ref = { inline_message_id: c.inline_message_id };
    job.ui = m[2];
    await render(job, screenJeda(job));
  });

  bot.callbackQuery(/^sh:([0-9a-f]+):(\w+)$/, async (ctx) => {
    const [, id, action] = ctx.match;
    const job = jobs.get(id);
    if (!job) return ctx.answerCallbackQuery({ text: "Sesi sudah berakhir. Ketik .autobc lagi.", show_alert: true });
    if (String(ctx.from.id) !== job.accountId && String(ctx.from.id) !== job.adminId) return ctx.answerCallbackQuery({ text: "Panel ini bukan untuk Anda.", show_alert: true });
    const cq = ctx.callbackQuery;
    job.ref = cq.inline_message_id
      ? { inline_message_id: cq.inline_message_id }
      : { chat_id: cq.message.chat.id, message_id: cq.message.message_id };

    if (action === "cancel") {
      jobs.delete(id);
      await ctx.answerCallbackQuery();
      return render(job, screenCancel(job));
    }
    if (action === "back") {
      const steps = stepsOf(job);
      const i = steps.indexOf(job.step);
      await ctx.answerCallbackQuery();
      return goStep(job, steps[Math.max(0, i - 1)]);
    }

    let m;
    if ((m = action.match(/^j([mh])(\d+)$/))) {
      const n = Number(m[2]);
      if (!(m[1] === "m" ? JEDA_MIN : JEDA_JAM).includes(n)) return ctx.answerCallbackQuery();
      job.intervalMs = n * (m[1] === "m" ? 60000 : 3600000);
      await ctx.answerCallbackQuery();
      job.step = "target";
      job.counts = null;
      await render(job, screenTarget(job));
      return loadCounts(job);
    }
    if (["tg", "tc", "tp"].includes(action)) {
      const k = action[1];
      job.targets[k] = !job.targets[k];
      await ctx.answerCallbackQuery();
      return render(job, screenTarget(job));
    }
    if (action === "tall") {
      const all = job.targets.g && job.targets.c && job.targets.p;
      job.targets = { g: !all, c: !all, p: !all };
      await ctx.answerCallbackQuery();
      return render(job, screenTarget(job));
    }
    if (action === "tnext") {
      if (!anyT(job.targets)) return ctx.answerCallbackQuery({ text: "Pilih minimal 1 target dulu.", show_alert: true });
      await ctx.answerCallbackQuery();
      return goStep(job, "cara");
    }
    if (action === "cc" || action === "cf") {
      job.cara = action === "cf" ? "fwd" : "copy";
      await ctx.answerCallbackQuery();
      return goStep(job, "delay");
    }
    if ((m = action.match(/^d(\d+)$/))) {
      const n = Number(m[1]);
      if (!DELAYS.includes(n)) return ctx.answerCallbackQuery();
      job.delay = n;
      await ctx.answerCallbackQuery();
      return goStep(job, job.kind === "autobc2" ? "urut" : "confirm");
    }
    if ((m = action.match(/^u([123])$/))) {
      job.urut = ["semua", "gantian", "acak"][Number(m[1]) - 1];
      await ctx.answerCallbackQuery();
      return goStep(job, "confirm");
    }
    if (action === "go") {
      if (!anyT(job.targets) || !job.intervalMs || !job.cara || !job.delay || (job.kind === "autobc2" && !job.urut)) return ctx.answerCallbackQuery({ text: "Pengaturan belum lengkap.", show_alert: true });
      if (!totalSel(job)) return ctx.answerCallbackQuery({ text: "Tidak ada chat tujuan. Pilih target lain.", show_alert: true });
      const kd = job.kind || "autobc";
      if (recOf(kd, job.userId)) return ctx.answerCallbackQuery({ text: `${nm(job)} sudah aktif. Hentikan dulu dengan .${kd} stop`, show_alert: true });
      await ctx.answerCallbackQuery({ text: `${nm(job)} dimulai!` });
      const cfg = {
        ...(kd === "autobc2" ? { msgs: job.msgs.map((x) => ({ ...x })), urut: job.urut, srcTitle: `${job.msgs.length} pesan` } : { srcChat: job.srcChat, srcMsgId: job.srcMsgId, srcTitle: job.srcTitle }),
        targets: { ...job.targets }, cara: job.cara, intervalMs: job.intervalMs, delay: job.delay,
        startedAt: Date.now(), rounds: 0, sent: 0, failed: 0, nextAt: Date.now(),
      };
      db.upsertUser(job.userId, { [kd]: cfg });
      startLoop(kd, job.userId, cfg, kd === "autobc2" ? null : job.srcPeer, Date.now() + 3000);
      jobs.delete(id);
      return render(job, screenStarted(job));
    }
    return ctx.answerCallbackQuery();
  });
}

// ===== .autobc2 : daftar pesan (lebih dari 1) =====
const poolOf = (uid) => ((db.getUser(uid) || {}).bcpool || []).slice();

async function poolCmd(ctx, sub) {
  const { msg, args, account } = ctx;
  const uid = String(account.userId);
  const pool = poolOf(uid);
  if (sub === "add") {
    if (pool.length >= MAX_POOL) return edit(ctx, `\u26A0\uFE0F Daftar penuh (maks ${MAX_POOL} pesan). Hapus dulu dengan .autobc2 del <no>`);
    const rm = await msg.getReplyMessage().catch(() => null);
    if (!rm) return edit(ctx, "Guna: .autobc2 add  (balas pesan yang mau ditambahkan ke daftar)");
    const chat = String(msg.chatId);
    if (pool.some((p) => p.chat === chat && p.id === rm.id)) return edit(ctx, "\u26A0\uFE0F Pesan ini sudah ada di daftar.");
    const kind = rm.viaBotId ? "[rich]" : rm.groupedId ? "[album]" : rm.photo ? "[foto]" : rm.sticker ? "[stiker]" : rm.voice ? "[voice]" : rm.videoNote ? "[video bulat]" : rm.video ? "[video]" : rm.gif ? "[gif]" : rm.audio ? "[audio]" : rm.poll ? "[polling]" : rm.contact ? "[kontak]" : rm.geo ? "[lokasi]" : rm.document ? "[dokumen]" : rm.media ? "[media]" : "[pesan]";
    const preview = clip((rm.message ? kind + " " + String(rm.message) : kind).replace(/\s+/g, " "), 40);
    pool.push({ chat, id: rm.id, preview, addedAt: Date.now() });
    db.upsertUser(uid, { bcpool: pool });
    return show(ctx, card(style({
      title: "Pesan Ditambahkan", icon: "mega", lead: "Pesan masuk ke daftar AutoBC2",
      rows: [["tag", "Nomor", String(pool.length)], ["link", "Isi", esc(preview)], ["chart", "Total pesan", `${pool.length}/${MAX_POOL}`]],
      checks: [[true, "Tambah lagi: balas pesan lain + .autobc2 add"], [true, "Mulai: .autobc2"]],
      footer: footerOf(account),
    }, USE_BC2)));
  }
  if (sub === "list") {
    if (!pool.length) return edit(ctx, "\u26A0\uFE0F Daftar kosong. Tambah dengan .autobc2 add (balas pesan)");
    return show(ctx, card(style({
      title: "Daftar Pesan AutoBC2", icon: "mega", lead: `${pool.length} pesan siap disebar`,
      rows: pool.map((p, i) => ["tag", `${i + 1}.`, esc(p.preview)]),
      checks: [[true, "Hapus: .autobc2 del <no> | Kosongkan: .autobc2 clear"]],
      footer: footerOf(account),
    }, USE_BC2)));
  }
  if (sub === "del") {
    const n = parseInt(args[1], 10);
    if (!(n >= 1 && n <= pool.length)) return edit(ctx, "Guna: .autobc2 del <nomor>  (lihat nomor di .autobc2 list)");
    const [gone] = pool.splice(n - 1, 1);
    db.upsertUser(uid, { bcpool: pool });
    return edit(ctx, `\u2705 Pesan ${n} dihapus dari daftar (${gone.preview}). Sisa ${pool.length} pesan.`);
  }
  // clear
  db.upsertUser(uid, { bcpool: [] });
  return edit(ctx, `\u2705 Daftar pesan AutoBC2 dikosongkan (${pool.length} pesan dihapus).`);
}

async function autobc2Cmd(ctx) {
  const uid = String(ctx.account.userId);
  const sub = String(ctx.args[0] || "").toLowerCase();
  if (["add", "list", "del", "clear"].includes(sub)) return poolCmd(ctx, sub);
  const pool = poolOf(uid);
  if (!sub && !pool.length && !recOf("autobc2", uid)) return edit(ctx, "Guna:\n" + USE_BC2);
  return autobcCmd(ctx, "autobc2");
}

async function autobcCmd(ctx, kind = "autobc") {
  const { msg, args, account, client } = ctx;
  const uid = String(account.userId);
  const sub = String(args[0] || "").toLowerCase();
  if (["stop", "off", "berhenti"].includes(sub)) return stopCmd(ctx, kind);
  if (["status", "info"].includes(sub)) return statusCmd(ctx, kind);
  if (recOf(kind, uid)) return show(ctx, statusCard(ctx, kind, recOf(kind, uid), loops.get(lk(kind, uid))));
  if (!shared.botUsername) return edit(ctx, "\u26A0\uFE0F Bot kawalan belum siap.");

  let rm = null;
  let msgs = null;
  if (kind === "autobc2") {
    msgs = poolOf(uid).map((p) => ({ chat: p.chat, id: p.id }));
    if (!msgs.length) return edit(ctx, "\u26A0\uFE0F Daftar pesan kosong. Tambah dengan .autobc2 add (balas pesan)");
  } else {
    rm = await msg.getReplyMessage().catch(() => null);
    if (!rm) return edit(ctx, "Guna: .autobc  (balas pesan yang mau disebar, lalu pilih lewat tombol)\n.autobc status | .autobc stop");
  }

  const job = {
    id: crypto.randomBytes(4).toString("hex"), kind, msgs, urut: null,
    accountId: account.accountId, adminId: ctx.byAdmin ? String(ctx.byAdmin) : null, userId: uid, client,
    srcPeer: msg.peerId, srcChat: String(msg.chatId), srcMsgId: rm ? rm.id : 0, srcTitle: kind === "autobc2" ? `${msgs.length} pesan` : await srcInfo(ctx),
    step: "jeda", intervalMs: 0, targets: { g: false, c: false, p: false }, cara: null, delay: 0,
    counts: null, ref: null, ui: "rich",
  };
  jobs.set(job.id, job);
  const t = setTimeout(() => jobs.delete(job.id), 60 * 60 * 1000);
  if (t.unref) t.unref();

  if (ctx.byAdmin) {
    try {
      await sendToDM(job);
    } catch (err) {
      jobs.delete(job.id);
      await edit(ctx, `\u26A0\uFE0F ${err.message}`);
    }
    return;
  }

  let reason = "";
  try {
    await sendViaInlineAny({ client, shared, msg, queries: [`sh ${job.id}`, `sht ${job.id}`] });
    return;
  } catch (err) {
    reason = err.message;
  }
  try {
    await sendToDM(job);
    await edit(ctx, `\uD83D\uDCE9 Panel AutoBC dikirim ke chat bot kawalan Anda.\nSebab tidak muncul di sini: ${reason}`);
  } catch (err) {
    jobs.delete(job.id);
    await edit(ctx, `\u26A0\uFE0F ${err.message}\nSebab inline: ${reason}`);
  }
}

// Lanjutkan putaran tersimpan saat userbot hidup lagi (restart / login ulang)
function onClient(entry) {
  const uid = String(entry.userId);
  for (const kind of ["autobc", "autobc2", "autocfd"]) {
    if (loops.has(lk(kind, uid))) continue;
    const rec = recOf(kind, uid);
    if (!rec) continue;
    startLoop(kind, uid, { ...rec }, null, Math.max(Number(rec.nextAt) || 0, Date.now() + 20000));
    console.log(`[${kind}] dilanjutkan untuk pengguna ${uid}`);
  }
}

module.exports = {
  name: "share",
  category: "MENU SHARE AUTO PROMOSI",
  help: [
    { cmd: "autobc", alias: [], desc: "broadcast otomatis berulang, pilih lewat tombol: jeda, target (grup/kontak/channel), copy/forward, jeda antar chat. Balas pesan: .autobc" },
    { cmd: "autobc2", alias: [], desc: "autobc dengan BANYAK pesan: .autobc2 add (balas pesan, maks 10) | .autobc2 list | .autobc2 del <no> | .autobc2 clear | .autobc2 (mulai, pilih lewat tombol) | .autobc2 stop" },
    { cmd: "stopautobc2", alias: ["autobc2stop"], desc: "hentikan autobc2 (atau .autobc2 stop)" },
    { cmd: "stopautobc", alias: ["autobcstop"], desc: "hentikan autobc (atau .autobc stop)" },
    { cmd: "cfd", alias: [], desc: "forward cepat sekali ke semua grup, balas pesan: .cfd 3 (jeda 3 detik) | .cfd stop" },
    { cmd: "autocfd", alias: [], desc: "cfd berulang otomatis, balas pesan: .autocfd 30m 3 | .autocfd stop" },
    { cmd: "stopautocfd", alias: [], desc: "hentikan autocfd" },
  ],
  registerBot,
  onClient,
  commands: {
    autobc: (c) => autobcCmd(c, "autobc"),
    autobc2: autobc2Cmd,
    stopautobc2: (c) => stopCmd(c, "autobc2"),
    autobc2stop: (c) => stopCmd(c, "autobc2"),
    stopautobc: (c) => stopCmd(c, "autobc"),
    autobcstop: (c) => stopCmd(c, "autobc"),
    cfd: cfdCmd,
    autocfd: autocfdCmd,
    stopautocfd: (c) => stopCmd(c, "autocfd"),
  },
};

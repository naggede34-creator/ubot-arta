// .ssprofile : screenshot profil Telegram gaya iPhone (nama, status, bio, username, channel peribadi, status emoji,
// corak latar profil dan gift/sticker). Dijana sebagai PNG oleh profileshot.js. Perlu: npm install (@resvg/resvg-js).
//   .ssprofile                 profil sendiri          .ssprofile @user | ID | (balas mesej)   profil orang lain
//   pilihan: light | dark | fit (satu skrin sahaja) | phone (paparkan nombor telefon) | nogift | nochannel
const { Api } = require("telegram");
const K = require("../kit");
const { esc, sendBuf, UserErr } = K;
const { rawEdit } = require("../ui");
const { fmtTime } = require("../core");
const shot = require("../profileshot");

const FLAGS = new Set(["light", "dark", "fit", "phone", "nogift", "nochannel"]);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const withTimeout = (p, ms, label) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} tamat masa`)), ms))]);
const errMsg = (e) => String((e && (e.errorMessage || e.message)) || e).slice(0, 70);
const hex = (n) => "#" + (Number(n) & 0xffffff).toString(16).padStart(6, "0");

// ---- masa mengikut zon waktu config.json ----
const hm = (ms) => {
  const [H, Mi] = fmtTime(ms).slice(11, 16).split(":").map(Number);
  return `${((H + 11) % 12) + 1}:${String(Mi).padStart(2, "0")} ${H >= 12 ? "PM" : "AM"}`;
};
const dayKey = (ms) => fmtTime(ms).slice(0, 10);
function statusOf(u) {
  if (u.self) return { text: "online", online: true };
  if (u.bot) return { text: "bot", online: false };
  const st = u.status && u.status.className;
  if (st === "UserStatusOnline") return { text: "online", online: true };
  if (st === "UserStatusRecently") return { text: "last seen recently" };
  if (st === "UserStatusLastWeek") return { text: "last seen within a week" };
  if (st === "UserStatusLastMonth") return { text: "last seen within a month" };
  if (st === "UserStatusOffline" && u.status.wasOnline) {
    const ms = Number(u.status.wasOnline) * 1000;
    const now = Date.now();
    if (dayKey(ms) === dayKey(now)) return { text: `last seen today at ${hm(ms)}` };
    if (dayKey(ms) === dayKey(now - 86400000)) return { text: `last seen yesterday at ${hm(ms)}` };
    const [, mo, dd] = dayKey(ms).split("-").map(Number);
    return { text: `last seen ${MON[mo - 1]} ${dd} at ${hm(ms)}` };
  }
  return { text: "last seen a long time ago" };
}
function fmtPhone(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("60")) return `+60 ${d.slice(2, 4)}-${d.slice(4, 7)} ${d.slice(7)}`.trim();
  if (d.startsWith("62")) return `+62 ${d.slice(2, 5)}-${d.slice(5, 9)}-${d.slice(9)}`.replace(/-$/, "");
  return "+" + d;
}
function fmtBirthday(b) {
  if (!b || !b.day || !b.month) return null;
  let s = `${b.day} ${MON[b.month - 1]}`;
  if (b.year) {
    s += ` ${b.year}`;
    const now = new Date(Date.now() + 7 * 3600000);
    let age = now.getUTCFullYear() - b.year;
    if (now.getUTCMonth() + 1 < b.month || (now.getUTCMonth() + 1 === b.month && now.getUTCDate() < b.day)) age--;
    if (age >= 0 && age < 120) s += ` (${age} years old)`;
  }
  return s;
}

// ---- gambar sticker / emoji premium daripada dokumen Telegram ----
async function docImage(client, doc) {
  if (!doc) return null;
  try {
    const mime = String(doc.mimeType || "");
    if (/image\/(webp|png)/.test(mime)) {
      const b = await withTimeout(client.downloadMedia(doc, {}), 12000, "sticker");
      if (b && b.length) return Buffer.from(b);
    }
    const sizes = (doc.thumbs || []).filter((t) => t.className === "PhotoSize" || t.className === "PhotoSizeProgressive");
    sizes.sort((a, b) => (b.w || 0) - (a.w || 0));
    if (sizes[0]) {
      const b = await withTimeout(client.downloadMedia(doc, { thumb: sizes[0] }), 12000, "thumb");
      if (b && b.length) return Buffer.from(b);
    }
  } catch (_) {}
  return null;
}
async function customEmojiImage(client, id) {
  if (!id) return null;
  const docs = await withTimeout(client.invoke(new Api.messages.GetCustomEmojiDocuments({ documentId: [id] })), 12000, "emoji");
  return docImage(client, docs && docs[0]);
}

// ---- gift (sticker) pada profil ----
async function loadGifts(client, entity, limit) {
  const P = Api.payments || {};
  let res;
  if (P.GetSavedStarGifts) res = await withTimeout(client.invoke(new P.GetSavedStarGifts({ peer: entity, offset: "", limit })), 15000, "gift");
  else if (P.GetUserStarGifts) res = await withTimeout(client.invoke(new P.GetUserStarGifts({ userId: entity, offset: "", limit })), 15000, "gift");
  else throw new Error("versi library telegram tiada API gift (jalankan: npm update telegram)");
  const list = (res.gifts || []).slice(0, limit);
  const items = await Promise.all(
    list.map(async (it) => {
      const g = it.gift || {};
      const attrs = g.attributes || [];
      const model = attrs.find((a) => a.className === "StarGiftAttributeModel");
      const back = attrs.find((a) => a.className === "StarGiftAttributeBackdrop");
      const unique = g.className === "StarGiftUnique" || !!model;
      const doc = unique ? model && (model.document || model.sticker) : g.sticker;
      return {
        img: await docImage(client, doc),
        pinned: !!it.pinnedToTop,
        stars: !unique && g.stars ? Number(g.stars) : null,
        title: unique ? g.title || "Collectible" : null,
        num: unique ? g.num : null,
        backdrop: unique && back ? [hex(back.centerColor), hex(back.edgeColor)] : null,
      };
    })
  );
  return { count: Number(res.count) || items.length, items };
}

// ---- channel peribadi ----
async function loadChannel(client, full, notes) {
  const fu = full.fullUser;
  const pid = fu && fu.personalChannelId;
  if (!pid) return null;
  let ch = (full.chats || []).find((c) => String(c.id) === String(pid));
  if (!ch) ch = await withTimeout(client.getEntity(pid), 10000, "channel").catch(() => null);
  if (!ch) {
    notes.push("channel peribadi ada tetapi maklumatnya tidak dapat dibaca");
    return { title: "Channel", subs: null, post: null, avatar: null };
  }
  const out = { title: ch.title || "Channel", username: ch.username || null, verified: !!ch.verified, seed: Number(String(ch.id).slice(-3)) || 3, subs: ch.participantsCount ? Number(ch.participantsCount) : null, post: null, postDate: null, avatar: null };
  const [fc, msgs, av] = await Promise.all([
    out.subs ? null : withTimeout(client.invoke(new Api.channels.GetFullChannel({ channel: ch })), 12000, "channel").catch(() => null),
    fu.personalChannelMessage ? withTimeout(client.getMessages(ch, { ids: [Number(fu.personalChannelMessage)] }), 12000, "post").catch(() => null) : null,
    withTimeout(client.downloadProfilePhoto(ch, { isBig: false }), 12000, "avatar channel").catch(() => null),
  ]);
  if (fc && fc.fullChat && fc.fullChat.participantsCount) out.subs = Number(fc.fullChat.participantsCount);
  const m = msgs && msgs[0];
  if (m) {
    out.post = (m.message || "").trim() || (m.media ? "[media]" : null);
    if (m.date) {
      const ms = Number(m.date) * 1000;
      out.postDate = dayKey(ms) === dayKey(Date.now()) ? hm(ms) : `${MON[Number(dayKey(ms).slice(5, 7)) - 1]} ${Number(dayKey(ms).slice(8, 10))}`;
    }
  }
  if (av && av.length) out.avatar = Buffer.from(av);
  return out;
}

async function resolveTarget(ctx, token) {
  const { client, msg } = ctx;
  if (token) {
    try {
      return await client.getEntity(/^\d{5,15}$/.test(token) ? Number(token) : token);
    } catch (_) {
      throw new UserErr("Pengguna tidak dijumpai.");
    }
  }
  const rm = await msg.getReplyMessage().catch(() => null);
  if (rm) {
    const s = await rm.getSender().catch(() => null);
    if (s && s.className === "User") return s;
  }
  return client.getMe();
}

async function ssprofile(ctx, album = false) {
  const { client, args, account } = ctx;
  const flags = new Set(args.map((a) => a.toLowerCase()).filter((a) => FLAGS.has(a)));
  const token = args.find((a) => !FLAGS.has(a.toLowerCase()) && (/^@?[A-Za-z][\w]{3,31}$/.test(a) || /^\d{5,15}$/.test(a)));
  await rawEdit(ctx, "\u23F3 Menyediakan screenshot profil...");

  const user = await resolveTarget(ctx, token);
  if (!user || user.className !== "User") throw new UserErr("Hanya profil pengguna disokong (bukan channel/group).");
  const self = !!user.self || String(user.id) === String(account.accountId);
  const notes = [];
  const note = (label) => (e) => (notes.push(`${label}: ${errMsg(e)}`), null);

  const full = await withTimeout(client.invoke(new Api.users.GetFullUser({ id: user })), 15000, "profil penuh").catch(note("profil penuh"));
  const fu = full && full.fullUser;
  const color = user.profileColor && typeof user.profileColor.color === "number" ? user.profileColor.color : null;
  const statusDoc = user.emojiStatus && user.emojiStatus.documentId;
  const patternId = user.profileColor && user.profileColor.backgroundEmojiId;

  const [avatar, emojiStatus, pattern, channel, gifts] = await Promise.all([
    withTimeout(client.downloadProfilePhoto(user, { isBig: true }), 15000, "foto profil").catch(note("foto profil")),
    customEmojiImage(client, statusDoc).catch(note("status emoji")),
    customEmojiImage(client, patternId).catch(note("corak latar")),
    full && !flags.has("nochannel") ? loadChannel(client, full, notes).catch(note("channel")) : null,
    flags.has("nogift") ? null : loadGifts(client, user, 9).catch(note("gift")),
  ]);

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || (user.deleted ? "Deleted Account" : "User");
  const st = statusOf({ ...user, self });
  const uname = user.username || ((user.usernames || []).find((u) => u.active) || {}).username || null;
  const [hh, mm] = fmtTime(Date.now()).slice(11, 16).split(":").map(Number);

  const model = {
    theme: flags.has("light") ? "light" : "dark",
    fit: flags.has("fit"),
    time: `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")}`,
    name,
    status: st.text,
    statusOnline: !!st.online,
    verified: !!user.verified,
    premium: !!user.premium,
    bot: !!user.bot,
    seed: Number(String(user.id).slice(-3)) || 0,
    avatar: avatar && avatar.length ? Buffer.from(avatar) : null,
    emojiStatus,
    pattern,
    profileColor: color,
    phone: flags.has("phone") ? fmtPhone(user.phone) : null,
    about: fu && fu.about ? String(fu.about) : "",
    username: uname,
    birthday: fu ? fmtBirthday(fu.birthday) : null,
    channel,
    gifts,
  };

  let r;
  let pngs = null;
  try {
    if (album) {
      // 4 slaid: gelap penuh, gelap muat-skrin, cerah penuh, cerah muat-skrin
      pngs = [];
      for (const [theme, fit] of [["dark", false], ["dark", true], ["light", false], ["light", true]]) {
        pngs.push((await shot.render({ ...model, theme, fit })).png);
      }
    } else {
      r = await shot.render(model);
    }
  } catch (e) {
    throw new UserErr("Gagal menjana gambar: " + errMsg(e));
  }

  const bits = [`\uD83D\uDCF1 <b>${esc(name)}</b>${uname ? " (@" + esc(uname) + ")" : ""}`];
  const have = [];
  if (channel) have.push("channel");
  if (gifts && gifts.items.length) have.push(`gift ${gifts.items.length}${gifts.count > gifts.items.length ? "/" + gifts.count : ""}`);
  if (emojiStatus) have.push("status emoji");
  if (pattern) have.push("corak latar");
  if (have.length) bits.push("Dipaparkan: " + esc(have.join(", ")));
  if (!shot.hasTxt(name)) notes.push("nama guna aksara yang tidak disokong fon (dipaparkan sebagai username)");
  if (notes.length) bits.push("<i>Nota: " + esc(notes.slice(0, 3).join(" | ")) + "</i>");
  if (pngs) {
    const { CustomFile } = require("telegram/client/uploads");
    await ctx.client.sendFile(ctx.msg.peerId, {
      file: pngs.map((b, i) => new CustomFile(`sschat-${i + 1}.png`, b.length, "", b)),
      caption: bits.join("\n"),
      parseMode: "html",
      replyTo: ctx.msg.id,
    });
    await ctx.msg.delete({ revoke: true }).catch(() => {});
    return;
  }
  await sendBuf(ctx, r.png, "profile.png", bits.join("\n"));
}

module.exports = K.plugin("ssprofile", "AI & Media", [
  {
    cmd: "ssprofile",
    alias: ["ssp"],
    desc: "screenshot profil gaya iPhone + channel + gift/sticker: .ssprofile [@user|reply] [light|fit|phone|nogift|nochannel]",
    run: (ctx) => ssprofile(ctx, false),
  },
  {
    cmd: "sschat",
    alias: ["ssacc"],
    desc: "screenshot profil akaun sebagai album 4 slaid (gelap/cerah, penuh/muat-skrin) supaya semua butiran nampak: .sschat [@user|reply] [phone|nogift|nochannel]",
    run: (ctx) => ssprofile(ctx, true),
  },
]);

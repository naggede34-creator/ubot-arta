// Pengurusan kumpulan & sembang (Group Management): maklumat, ahli, tag semua, pautan jemputan, dll.
const { Api } = require("telegram");
const K = require("../kit");
const { R, H, out, need, esc, clip, UserErr, grp } = K;

const nm = (u) => [u.firstName, u.lastName].filter(Boolean).join(" ") || u.title || u.username || String(u.id);
const mention = (u) => `<a href="tg://user?id=${u.id}">${esc(clip(nm(u), 24))}</a>`;
const needGroup = async (ctx) => {
  const chat = await ctx.msg.getChat();
  if (!chat || chat.className === "User") throw new UserErr("Arahan ini untuk kumpulan/saluran sahaja.");
  return chat;
};
const list = async (ctx, filter, limit = 50) => {
  await needGroup(ctx);
  return ctx.client.getParticipants(ctx.msg.peerId, { limit, ...(filter ? { filter } : {}) });
};

const defs = [
  {
    cmd: "ginfo", alias: ["groupinfo"], desc: "maklumat kumpulan ini",
    async run(ctx) {
      const c = await needGroup(ctx);
      await out(ctx, "Maklumat Kumpulan", "gear", [
        R("tag", "Nama", c.title), R("link", "ID", c.id), R("box", "Jenis", c.megagroup ? "Supergroup" : c.broadcast ? "Saluran" : "Kumpulan"),
        R("user", "Ahli", grp(c.participantsCount || 0, 0)), R("tag", "Username", c.username ? "@" + c.username : "-"),
        R("time", "Dicipta", c.date ? new Date(c.date * 1000).toISOString().slice(0, 10) : "-"),
      ]);
    },
  },
  {
    cmd: "members", alias: ["ahli"], desc: "jumlah & 20 ahli terakhir kumpulan",
    async run(ctx) {
      const l = await list(ctx, null, 20);
      await out(ctx, "Ahli Kumpulan", "user", l.slice(0, 20).map((u) => H("user", u.bot ? "Bot" : "Ahli", mention(u))), {
        sub: "Jumlah: " + (l.total || l.length), headers: ["Jenis", "Pengguna"],
      });
    },
  },
  {
    cmd: "admins", alias: ["admin"], desc: "senarai admin kumpulan",
    async run(ctx) {
      const l = await list(ctx, new Api.ChannelParticipantsAdmins(), 100);
      await out(ctx, "Admin Kumpulan", "crown", l.map((u) => H("crown", "Admin", mention(u))), { sub: "Jumlah: " + l.length, headers: ["Peranan", "Pengguna"] });
    },
  },
  {
    cmd: "bots", desc: "senarai bot dalam kumpulan",
    async run(ctx) {
      const l = await list(ctx, new Api.ChannelParticipantsBots(), 100);
      await out(ctx, "Bot Kumpulan", "robot", l.length ? l.map((u) => H("robot", "Bot", u.username ? "@" + esc(u.username) : esc(nm(u)))) : [R("robot", "Bot", "Tiada")], { sub: "Jumlah: " + l.length });
    },
  },
  {
    cmd: "tagall", alias: ["all"], desc: "tag 30 ahli: .tagall [mesej]",
    async run(ctx) {
      const l = (await list(ctx, null, 30)).filter((u) => !u.bot && !u.deleted);
      const head = ctx.args.length ? esc(ctx.args.join(" ")) + "\n\n" : "";
      await ctx.client.sendMessage(ctx.msg.peerId, { message: head + l.map(mention).join(" "), parseMode: "html" });
      await ctx.msg.delete({ revoke: true }).catch(() => {});
    },
  },
  {
    cmd: "link", alias: ["invite"], desc: "pautan jemputan kumpulan (perlu admin)",
    async run(ctx) {
      const c = await needGroup(ctx);
      let url = c.username ? "https://t.me/" + c.username : null;
      if (!url) {
        const r = await ctx.client.invoke(new Api.messages.ExportChatInvite({ peer: ctx.msg.peerId }));
        url = r.link;
      }
      await out(ctx, "Pautan Jemputan", "link", [R("tag", "Kumpulan", c.title), H("link", "Pautan", `<a href="${esc(url)}">${esc(url)}</a>`)]);
    },
  },
  {
    cmd: "msglink", alias: ["pautanmsg"], desc: "pautan mesej yang direply",
    async run(ctx) {
      const rm = await ctx.msg.getReplyMessage();
      need(rm, "reply pada mesej, kemudian .msglink");
      const c = await needGroup(ctx);
      const url = c.username ? `https://t.me/${c.username}/${rm.id}` : `https://t.me/c/${String(c.id).replace(/^-100/, "")}/${rm.id}`;
      await out(ctx, "Pautan Mesej", "link", [H("link", "Pautan", `<a href="${esc(url)}">${esc(url)}</a>`)]);
    },
  },
  {
    cmd: "firstmsg", alias: ["mulamesej"], desc: "lompat ke mesej pertama dalam sembang",
    async run(ctx) {
      const c = await ctx.msg.getChat();
      const m = (await ctx.client.getMessages(ctx.msg.peerId, { limit: 1, offsetId: 1, addOffset: -1 }))[0];
      if (!m) throw new UserErr("Tiada mesej.");
      const url = c && c.username ? `https://t.me/${c.username}/${m.id}` : c && c.className !== "User" ? `https://t.me/c/${String(c.id).replace(/^-100/, "")}/${m.id}` : null;
      await out(ctx, "Mesej Pertama", "link", [R("box", "ID mesej", m.id), R("time", "Tarikh", new Date(m.date * 1000).toISOString().slice(0, 10)), url ? H("link", "Pautan", `<a href="${esc(url)}">buka</a>`) : R("link", "Pautan", "Tiada (sembang peribadi)")]);
    },
  },
  {
    cmd: "type", alias: ["menaip"], desc: "animasi menaip: .type teks",
    async run(ctx) {
      const t = await K.text(ctx);
      need(t, ".type <teks>");
      let s = "";
      const chunk = Math.max(1, Math.ceil(t.length / 12));
      for (let i = 0; i < t.length; i += chunk) {
        s = t.slice(0, i + chunk);
        await ctx.client.editMessage(ctx.msg.peerId, { message: ctx.msg.id, text: s + "\u2588" }).catch(() => {});
        await new Promise((r) => setTimeout(r, 450));
      }
      await ctx.client.editMessage(ctx.msg.peerId, { message: ctx.msg.id, text: t });
    },
  },
  {
    cmd: "say", alias: ["cakap"], desc: "hantar teks sebagai mesej biasa: .say teks",
    async run(ctx) {
      const t = await K.text(ctx);
      need(t, ".say <teks>");
      await ctx.client.sendMessage(ctx.msg.peerId, { message: t });
      await ctx.msg.delete({ revoke: true }).catch(() => {});
    },
  },
  {
    cmd: "me", alias: ["akaun"], desc: "profil akaun anda",
    async run(ctx) {
      const u = await ctx.client.getMe();
      await out(ctx, "Profil Saya", "user", [
        R("tag", "Nama", nm(u)), R("tag", "Username", u.username ? "@" + u.username : "-"), R("link", "ID", u.id),
        R("tag", "Telefon", u.phone ? "+" + String(u.phone).slice(0, 4) + "******" : "-"), R("crown", "Premium", u.premium ? "Ya" : "Tidak"),
      ]);
    },
  },
  {
    cmd: "save", alias: ["simpanmsg"], desc: "simpan mesej yang direply ke Saved Messages",
    async run(ctx) {
      const rm = await ctx.msg.getReplyMessage();
      need(rm, "reply pada mesej, kemudian .save");
      await ctx.client.forwardMessages("me", { messages: [rm.id], fromPeer: ctx.msg.peerId });
      await out(ctx, "Disimpan", "check", [R("check", "Status", "Dihantar ke Saved Messages"), R("box", "ID mesej", rm.id)]);
    },
  },
];

module.exports = K.plugin("chat", "Group Management", defs);

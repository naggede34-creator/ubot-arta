// .lagu <judul / artis>  -> cari lagu (iTunes Search, tanpa kunci) + kad Rich + pratonton audio 30 saat
const K = require("../kit");
const { UserErr, esc, getJson, getBuf, clip } = K;
const { card, footerOf, show } = require("../ui");
const { showPanel } = require("../panel");

const dur = (ms) => { const s = Math.round((ms || 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

async function lagu(ctx) {
  const { client, msg, account, args } = ctx;
  const q = args.join(" ").trim();
  if (!q) throw new UserErr("Guna: .lagu <judul atau artis>  (contoh: .lagu Tulus Hati-Hati di Jalan)");
  const j = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=5&country=ID`);
  const list = (j.results || []).filter((x) => x.trackName);
  if (!list.length) throw new UserErr(`Lagu "${clip(q, 40)}" tidak dijumpai.`);
  const top = list[0];
  const rows = [
    ["tag", "Judul", `<b>${esc(clip(top.trackName, 50))}</b>`],
    ["user", "Artis", esc(clip(top.artistName, 40))],
    ["box", "Album", esc(clip(top.collectionName || "-", 40))],
    ["time", "Durasi", esc(dur(top.trackTimeMillis))],
    ["star", "Genre", esc(top.primaryGenreName || "-")],
    ["chart", "Tahun", esc(String(top.releaseDate || "").slice(0, 4) || "-")],
  ];
  const others = list.slice(1).map((x, i) => `<li>${i + 2}. ${esc(clip(x.trackName, 40))} - ${esc(clip(x.artistName, 28))}</li>`).join("");
  const c = card({
    title: "Hasil Carian Lagu", icon: "star", rows,
    extra: others ? `<p>Hasil lain:</p><ul>${others}</ul>` : "",
    extraText: list.slice(1).map((x, i) => `${i + 2}. ${esc(clip(x.trackName, 40))} - ${esc(clip(x.artistName, 28))}`).join("\n"),
    footer: footerOf(account),
  });
  const buttons = top.trackViewUrl ? [[{ text: "Buka di Apple Music", url: top.trackViewUrl, style: "primary" }]] : [];
  try {
    await showPanel({ client, msg, account, html: c.html, text: c.text, buttons });
  } catch (e) {
    await K.edit(ctx, `${top.trackName} - ${top.artistName}\n${top.trackViewUrl || ""}`);
    return;
  }
  // pratonton audio 30 saat (jika gagal, kad sudah cukup)
  if (top.previewUrl) {
    try {
      const buf = await getBuf(top.previewUrl, 25000);
      const { CustomFile } = require("telegram/client/uploads");
      const { Api } = require("telegram");
      await client.sendFile(msg.peerId, {
        file: new CustomFile(`${top.trackName}.m4a`.replace(/[\\/:*?"<>|]/g, ""), buf.length, "", buf),
        caption: `${top.trackName} - ${top.artistName} (pratonton 30s)`,
        attributes: [new Api.DocumentAttributeAudio({ duration: 30, title: top.trackName, performer: top.artistName })],
        replyTo: msg.id,
      });
    } catch (e) {
      console.error("[lagu] pratonton gagal:", e.message);
    }
  }
  await msg.delete({ revoke: true }).catch(() => {});
}

module.exports = K.plugin("lagu", "Hiburan", [
  { cmd: "lagu", alias: ["song", "carilagu"], desc: "cari lagu + pratonton audio: .lagu <judul / artis>", run: lagu },
]);

// Sistem: uptime, maklumat pelayan, memori.
const os = require("os");
const K = require("../kit");
const { R, out, fmt } = K;

const dur = (s) => {
  s = Math.floor(s);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return `${d}h ${h}j ${m}m ${s % 60}s`;
};
const mb = (b) => fmt(b / 1048576, 1) + " MB";

module.exports = K.plugin("sys", "Sistem", [
  { cmd: "uptime", desc: "tempoh masa userbot/pelayan hidup", async run(ctx) {
    await out(ctx, "Uptime", "time", [R("bolt", "Userbot", dur(process.uptime())), R("gear", "Pelayan", dur(os.uptime()))]);
  } },
  { cmd: "sysinfo", alias: ["server"], desc: "maklumat pelayan", async run(ctx) {
    const c = os.cpus();
    await out(ctx, "Maklumat Pelayan", "gear", [
      R("gear", "OS", `${os.type()} ${os.release()}`), R("bolt", "CPU", `${c.length}x ${(c[0] || {}).model || "-"}`),
      R("chart", "Beban (1/5/15m)", os.loadavg().map((x) => fmt(x, 2)).join(" / ")), R("box", "RAM", `${mb(os.totalmem() - os.freemem())} / ${mb(os.totalmem())}`),
      R("rocket", "Node.js", process.version), R("tag", "Hos", os.hostname()),
    ]);
  } },
  { cmd: "mem", alias: ["memori"], desc: "penggunaan memori proses userbot", async run(ctx) {
    const m = process.memoryUsage();
    await out(ctx, "Memori Proses", "chart", [R("box", "RSS", mb(m.rss)), R("chart", "Heap digunakan", mb(m.heapUsed)), R("chart", "Heap jumlah", mb(m.heapTotal)), R("gear", "Luaran", mb(m.external))]);
  } },
]);

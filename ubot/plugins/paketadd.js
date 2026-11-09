// Owner / reseller memberi paket: .addlite  .addgold  .addplat   (logik dalam paket.js)
const { give } = require("./paket");

module.exports = {
  name: "paketadd",
  category: "Owner & Reseller",
  help: [
    { cmd: "addlite", alias: [], desc: "beri paket LITE: .addlite <hari> [ID|@user] atau balas mesej pembeli" },
    { cmd: "addgold", alias: [], desc: "beri paket GOLD: .addgold <hari> [ID|@user] atau balas mesej pembeli" },
    { cmd: "addplat", alias: ["addplatinum"], desc: "beri paket PLATINUM: .addplat <hari> [ID|@user] atau balas mesej pembeli" },
  ],
  commands: {
    addlite: (ctx) => give(ctx, "LITE"),
    addgold: (ctx) => give(ctx, "GOLD"),
    addplat: (ctx) => give(ctx, "PLATINUM"),
    addplatinum: (ctx) => give(ctx, "PLATINUM"),
  },
};

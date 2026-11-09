// Mesej "loading" dengan emoji bulat berpusing (emoji premium beranimasi).
// ID emoji ditetapkan dalam config.json:  "loading_emoji": "<ID emoji premium>"
// Jika kosong, guna jam pasir yang sudah terbukti berfungsi dalam projek ini (tidak beranimasi).
// Cara dapat ID: hantar emoji berpusing itu kepada bot pemberi ID emoji (contoh senarai ID yang anda guna untuk .help).
const { cfg, em, esc } = require("./core");

const DEFAULT_ID = "5352940967911517739"; // jam pasir (terbukti)
const spinnerId = () => String(cfg.loading_emoji || "").replace(/\D/g, "") || DEFAULT_ID;
const spin = () => em(spinnerId(), "⏳");

// Rich: perenggan italik + emoji berpusing di hujung ("AI sedang menyusun payload ... (bulat)")
const html = (label) => `<p><i>${esc(label)}</i> ${spin()}</p>`;
// Teks biasa (parse_mode HTML) untuk jatuh balik
const text = (label) => `<i>${esc(label)}</i> ${spin()}`;
// Tanpa emoji premium (suntingan terus oleh userbot)
const plain = (label, icon = "⏳") => `<i>${icon} ${esc(label)}</i>`;

module.exports = { html, text, plain, spin, spinnerId, DEFAULT_ID };

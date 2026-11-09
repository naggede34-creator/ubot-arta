// Bina kad Rich daripada JSON atau DSL teks ringkas. Teks menyokong {e:ID} (emoji premium) dan <b> <i> <code> asas diabaikan (di-escape).
const { esc } = require("./core");
const emo = require("./emo");

const t = (s) => emo.tokensToHtml(String(s == null ? "" : s));
const okUrl = (u) => /^(https?:\/\/|tg:\/\/)/i.test(String(u || ""));

// spec: { title, icon, text|paragraphs[], headers[2], table:[[k,v]..], checks:[ "teks" | "!teks"(belum) ], quote, details:{title,body}, hr, footer, buttons:[{text,url}] }
function fromSpec(spec) {
  if (!spec || typeof spec !== "object") throw new Error("JSON mesti objek");
  if (typeof spec.html === "string") return { html: spec.html, buttons: normButtons(spec.buttons) };
  let h = "";
  if (spec.title) h += `<h3>${spec.icon ? emo.tag(String(spec.icon).replace(/\D/g, "")) + " " : ""}${t(spec.title)}</h3>`;
  const paras = [].concat(spec.paragraphs || [], spec.text ? [spec.text] : []);
  for (const p of paras) h += `<p>${t(p).replace(/\n/g, "<br>")}</p>`;
  if (Array.isArray(spec.table) && spec.table.length) {
    const hd = Array.isArray(spec.headers) && spec.headers.length >= 2 ? spec.headers : ["Info", "Nilai"];
    h += `<table bordered><tr><th>${t(hd[0])}</th><th>${t(hd[1])}</th></tr>`;
    for (const r of spec.table) {
      const row = Array.isArray(r) ? r : [r.k || r.key || "", r.v || r.value || ""];
      h += `<tr><td>${t(row[0])}</td><td>${t(row[1])}</td></tr>`;
    }
    h += `</table>`;
  }
  if (Array.isArray(spec.checks) && spec.checks.length) {
    h += `<ul>` + spec.checks.map((c) => {
      const s = String(c);
      const todo = /^[!☐]/.test(s) || /^\[ \]/.test(s);
      return `<li><input type="checkbox"${todo ? "" : " checked"}>${t(s.replace(/^(!|☐|☑|\[[ xX]\])\s*/, ""))}</li>`;
    }).join("") + `</ul>`;
  }
  if (spec.details && spec.details.title) h += `<details><summary>${t(spec.details.title)}</summary><p>${t(spec.details.body || "").replace(/\n/g, "<br>")}</p></details>`;
  if (spec.quote) h += `<blockquote>${t(spec.quote).replace(/\n/g, "<br>")}</blockquote>`;
  if (spec.hr) h += `<hr>`;
  if (spec.footer) h += `<footer>${t(spec.footer)}</footer>`;
  if (!h) throw new Error("Tiada kandungan (cuba title / text / table / checks)");
  return { html: h, buttons: normButtons(spec.buttons) };
}

function normButtons(b) {
  return (Array.isArray(b) ? b : [])
    .filter((x) => x && x.text && okUrl(x.url))
    .slice(0, 6)
    .map((x) => ({ text: String(x.text).slice(0, 40), url: String(x.url), style: x.style }));
}

// DSL baris demi baris:
//   # Tajuk            teks biasa            > petikan            --- (garis)
//   || Lajur1 | Lajur2   (header jadual)     | kunci | nilai |    (baris jadual)
//   [x] siap   [ ] belum                      + Ringkasan :: isi (details)
//   btn: Teks | https://...                    footer: teks
function fromDsl(src) {
  const spec = { paragraphs: [], table: [], checks: [], buttons: [], quote: [] };
  for (const raw of String(src).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let m;
    if ((m = line.match(/^#\s+(.+)$/))) spec.title = m[1];
    else if ((m = line.match(/^\|\|\s*(.+)$/))) spec.headers = m[1].split("|").map((x) => x.trim());
    else if ((m = line.match(/^\|\s*(.+?)\s*\|\s*(.*?)\s*\|?$/))) spec.table.push([m[1], m[2]]);
    else if ((m = line.match(/^\[([ xX])\]\s*(.+)$/))) spec.checks.push((m[1] === " " ? "!" : "") + m[2]);
    else if ((m = line.match(/^>\s*(.+)$/))) spec.quote.push(m[1]);
    else if (/^-{3,}$/.test(line)) spec.hr = true;
    else if ((m = line.match(/^\+\s*(.+?)\s*::\s*(.+)$/))) spec.details = { title: m[1], body: m[2] };
    else if ((m = line.match(/^btn:\s*(.+?)\s*\|\s*(\S+)$/i))) spec.buttons.push({ text: m[1], url: m[2] });
    else if ((m = line.match(/^footer:\s*(.+)$/i))) spec.footer = m[1];
    else spec.paragraphs.push(line);
  }
  spec.quote = spec.quote.join("\n");
  return fromSpec(spec);
}

module.exports = { fromSpec, fromDsl, normButtons };

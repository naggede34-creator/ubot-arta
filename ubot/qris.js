// QRIS dinamik: tukar QRIS statik (tag 01 = 11) menjadi dinamik (12) dengan nominal (tag 54) + CRC16 baharu.
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// "000201..." -> [{tag, val}] (aras atas)
function parse(payload) {
  const out = [];
  let i = 0;
  while (i < payload.length) {
    const tag = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len) || i + 4 + len > payload.length) throw new Error("Format QRIS tidak sah");
    out.push({ tag, val: payload.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return out;
}
const tlv = (tag, val) => tag + String(val.length).padStart(2, "0") + val;

function check(payload) {
  const p = String(payload || "").trim();
  if (!/^000201/.test(p) || p.length < 40) throw new Error("Bukan teks QRIS (mesti bermula 000201)");
  const tags = parse(p);
  const last = tags[tags.length - 1];
  if (!last || last.tag !== "63") throw new Error("QRIS tiada CRC (tag 63)");
  const body = p.slice(0, p.length - 4);
  const crcOk = crc16(body) === last.val.toUpperCase();
  const get = (t) => (tags.find((x) => x.tag === t) || {}).val || "";
  return { crcOk, merchant: get("59"), city: get("60"), isStatic: get("01") === "11", tags };
}

// nominal: nombor (boleh perpuluhan). Pulangkan payload dinamik.
function dynamic(payload, amount, fee) {
  const info = check(payload);
  const amt = Number(amount);
  if (!(amt > 0) || amt > 999999999999) throw new Error("Nominal tidak sah");
  const s = Number.isInteger(amt) ? String(amt) : amt.toFixed(2);
  const kept = info.tags.filter((t) => t.tag !== "63" && t.tag !== "54" && t.tag !== "55" && t.tag !== "56" && t.tag !== "57");
  const out = [];
  let put = false;
  for (const t of kept) {
    if (!put && Number(t.tag) > 54) {
      out.push(tlv("54", s));
      put = true;
    }
    out.push(t.tag === "01" ? tlv("01", "12") : tlv(t.tag, t.val));
  }
  if (!put) out.push(tlv("54", s));
  const body = out.join("") + "6304";
  return body + crc16(body);
}

module.exports = { crc16, parse, check, dynamic, tlv };

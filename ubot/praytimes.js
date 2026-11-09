// Hitung jadwal sholat secara lokal (tanpa internet) — metode Kemenag RI: Subuh 20°, Isya 18°, Ashar madzhab Syafi'i,
// + ihtiyat (pengaman) 2 menit (Dzuhur 3 menit, Terbit -2 menit). Hasil bisa berbeda 1-2 menit dari jadwal resmi daerah.
// Algoritme berdasarkan PrayTimes.org (Hamid Zarrabi-Zadeh, lisensi LGPL) yang disederhanakan.
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const sin = (d) => Math.sin(rad(d));
const cos = (d) => Math.cos(rad(d));
const tan = (d) => Math.tan(rad(d));
const asin = (x) => deg(Math.asin(x));
const acos = (x) => deg(Math.acos(Math.max(-1, Math.min(1, x))));
const atan2 = (y, x) => deg(Math.atan2(y, x));
const acot = (x) => deg(Math.atan(1 / x));
const fix = (a, b) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };

// Kota bawaan (lat, lng, zona waktu, label zona)
const CITIES = {
  jakarta: ["Jakarta", -6.2088, 106.8456, 7, "WIB"], bogor: ["Bogor", -6.595, 106.8166, 7, "WIB"], bandung: ["Bandung", -6.9175, 107.6191, 7, "WIB"],
  semarang: ["Semarang", -6.9667, 110.4167, 7, "WIB"], yogyakarta: ["Yogyakarta", -7.7956, 110.3695, 7, "WIB"], surabaya: ["Surabaya", -7.2575, 112.7521, 7, "WIB"],
  malang: ["Malang", -7.9666, 112.6326, 7, "WIB"], serang: ["Serang", -6.12, 106.1503, 7, "WIB"], medan: ["Medan", 3.5952, 98.6722, 7, "WIB"],
  padang: ["Padang", -0.9471, 100.4172, 7, "WIB"], pekanbaru: ["Pekanbaru", 0.5071, 101.4478, 7, "WIB"], palembang: ["Palembang", -2.9761, 104.7754, 7, "WIB"],
  lampung: ["Bandar Lampung", -5.4292, 105.261, 7, "WIB"], jambi: ["Jambi", -1.6101, 103.6131, 7, "WIB"], aceh: ["Banda Aceh", 5.5483, 95.3238, 7, "WIB"],
  pontianak: ["Pontianak", -0.0263, 109.3425, 7, "WIB"], banjarmasin: ["Banjarmasin", -3.3186, 114.5944, 8, "WITA"], balikpapan: ["Balikpapan", -1.2379, 116.8529, 8, "WITA"],
  samarinda: ["Samarinda", -0.5022, 117.1536, 8, "WITA"], makassar: ["Makassar", -5.1477, 119.4327, 8, "WITA"], manado: ["Manado", 1.4748, 124.8421, 8, "WITA"],
  denpasar: ["Denpasar", -8.6705, 115.2126, 8, "WITA"], mataram: ["Mataram", -8.5833, 116.1167, 8, "WITA"], kupang: ["Kupang", -10.1772, 123.607, 8, "WITA"],
  ambon: ["Ambon", -3.6954, 128.1814, 9, "WIT"], jayapura: ["Jayapura", -2.5337, 140.7181, 9, "WIT"],
  kualalumpur: ["Kuala Lumpur", 3.139, 101.6869, 8, "MYT"], singapura: ["Singapura", 1.3521, 103.8198, 8, "SGT"],
};

function julian(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}
function sunPos(jd) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * sin(g) + 0.02 * sin(2 * g), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = fix(atan2(cos(e) * sin(L), cos(L)) / 15, 24);
  return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - RA };
}

// -> { imsak, subuh, terbit, dzuhur, ashar, maghrib, isya } dalam jam lokal desimal (mis. 4.35)
function hours(y, m, d, lat, lng, tz) {
  const jd = julian(y, m, d) - lng / (15 * 24);
  const midDay = (t) => fix(12 - sunPos(jd + t).eqt, 24);
  const angleTime = (angle, t, ccw) => {
    const decl = sunPos(jd + t).decl;
    const T = acos((-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15;
    return midDay(t) + (ccw ? -T : T);
  };
  const asrTime = (factor, t) => { const decl = sunPos(jd + t).decl; return angleTime(-acot(factor + tan(Math.abs(lat - decl))), t); };
  let t = { subuh: 5, terbit: 6, dzuhur: 12, ashar: 13, maghrib: 18, isya: 18 };
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v / 24]));
    t = {
      subuh: angleTime(20, p.subuh, true), terbit: angleTime(0.833, p.terbit, true), dzuhur: midDay(p.dzuhur),
      ashar: asrTime(1, p.ashar), maghrib: angleTime(0.833, p.maghrib), isya: angleTime(18, p.isya),
    };
  }
  const adj = (h, min) => h + tz - lng / 15 + min / 60;
  const out = { subuh: adj(t.subuh, 2), terbit: adj(t.terbit, -2), dzuhur: adj(t.dzuhur, 3), ashar: adj(t.ashar, 2), maghrib: adj(t.maghrib, 2), isya: adj(t.isya, 2) };
  out.imsak = out.subuh - 10 / 60;
  return out;
}
const hhmm = (h) => { const m = Math.round(h * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

// jadwal untuk tanggal lokal kota (y, m, d) -> { city, label, tzLabel, times: { name: { h, at, hhmm } } }
function schedule(cityKey, y, m, d) {
  const c = CITIES[cityKey] || CITIES.jakarta;
  const [label, lat, lng, tz, tzLabel] = c;
  const h = hours(y, m, d, lat, lng, tz);
  const base = Date.UTC(y, m - 1, d) - tz * 3600e3;
  const times = {};
  for (const k of ["imsak", "subuh", "terbit", "dzuhur", "ashar", "maghrib", "isya"]) times[k] = { h: h[k], at: base + Math.round(h[k] * 60) * 60e3, hhmm: hhmm(h[k]) };
  return { city: cityKey in CITIES ? cityKey : "jakarta", label, tz, tzLabel, times };
}
// tanggal lokal hari ini di zona kota
function today(cityKey, now = Date.now()) {
  const c = CITIES[cityKey] || CITIES.jakarta;
  const d = new Date(now + c[3] * 3600e3);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), key: d.toISOString().slice(0, 10) };
}

module.exports = { CITIES, schedule, today, hhmm };

// ARTA PEDIA media tools: .iqcpink, .brathd, .animein
const K = require('../kit');
const { need, UserErr, getJson, getBuf, sendBuf, out, R, H, esc, clip } = K;

async function sendApiImage(ctx, url, caption, filename) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30000);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'Mozilla/5.0 ubot', Accept: 'image/*,application/json' } });
    if (!res.ok) throw new UserErr(`API membalas HTTP ${res.status}`);
    const type = String(res.headers.get('content-type') || '').toLowerCase();
    if (type.includes('json') || type.includes('text/')) {
      const data = await res.json().catch(() => ({}));
      const imageUrl = data.url || data.image || data.result || data.data?.url || data.data?.image;
      if (typeof imageUrl === 'string' && /^https?:\/\//i.test(imageUrl)) {
        const buf = await getBuf(imageUrl, 30000);
        if (!buf.length) throw new UserErr('API tidak mengembalikan gambar.');
        return sendBuf(ctx, buf, filename, caption);
      }
      throw new UserErr(data.message || data.error || 'API tidak mengembalikan gambar yang sah.');
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new UserErr('Gambar kosong dari API.');
    return sendBuf(ctx, buf, filename, caption);
  } catch (e) {
    if (e.name === 'AbortError') throw new UserErr('API terlalu lama membalas. Coba lagi.');
    throw e;
  } finally { clearTimeout(timer); }
}

async function iqcpink(ctx) {
  const text = ctx.args.join(' ').trim();
  need(text, '.iqcpink <teks>');
  const url = `https://apiii-xrina.my.id/canvas/iqcpink?text=${encodeURIComponent(text)}`;
  await sendApiImage(ctx, url, `💗 IQC Pink\n${clip(text, 500)}`, 'iqc-pink.png');
}

async function brathd(ctx) {
  const text = ctx.args.join(' ').trim();
  need(text, '.brathd <teks>');
  const url = `https://apiii-xrina.my.id/maker/brathd?text=${encodeURIComponent(text)}`;
  await sendApiImage(ctx, url, `✨ Brat HD\n${clip(text, 500)}`, 'brat-hd.png');
}



async function fakedev(ctx) {
  const name = ctx.args.join(' ').trim() || 'ARTA PEDIA ID';
  const url = `https://apiii-xrina.my.id/canvas/fakedev?name=${encodeURIComponent(name)}`;
  await sendApiImage(ctx, url, `🛠️ Fake Developer\nNama: ${clip(name, 100)}`, 'fake-dev.png');
}

function findList(data) {
  if (Array.isArray(data)) return data;
  for (const v of [data?.result, data?.results, data?.data, data?.anime, data?.items]) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      for (const w of [v.result, v.results, v.data, v.items, v.anime]) if (Array.isArray(w)) return w;
    }
  }
  return [];
}
function pick(obj, keys) {
  for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim()) return String(obj[k]);
  return '';
}
async function animein(ctx) {
  const query = ctx.args.join(' ').trim();
  need(query, '.animein <judul anime>');
  let data, lastError;
  // Endpoint ARTA PEDIA tidak menyertakan skema parameter; coba nama query umum.
  for (const key of ['q', 'query', 'text', 'search']) {
    try {
      data = await getJson(`https://apiii-xrina.my.id/animein/search?${key}=${encodeURIComponent(query)}`, 20000);
      break;
    } catch (e) { lastError = e; }
  }
  if (!data) throw new UserErr(lastError?.userMsg || 'Gagal mencari anime. Coba lagi nanti.');
  const list = findList(data).slice(0, 8);
  if (!list.length) {
    const msg = pick(data, ['message', 'msg', 'error']);
    throw new UserErr(msg || 'Anime tidak ditemukan atau format respons API berubah.');
  }
  const rows = [];
  list.forEach((item, i) => {
    const title = pick(item, ['title', 'name', 'judul', 'anime', 'nama']) || `Hasil ${i + 1}`;
    const episode = pick(item, ['episode', 'episodes', 'eps', 'latest_episode', 'chapter']);
    const url = pick(item, ['url', 'link', 'watch_url', 'stream_url', 'play_url']);
    const info = [episode ? `Episode: ${episode}` : '', pick(item, ['status', 'type', 'year'])].filter(Boolean).join(' • ');
    rows.push(R('tag', `#${i + 1} ${clip(title, 60)}`, info || '-'));
    if (url && /^https?:\/\//i.test(url)) rows.push(H('link', 'Tautan', `<a href="${esc(url)}">Buka hasil anime</a>`));
  });
  await out(ctx, 'Pencarian Anime', 'play', rows, { sub: `Kata kunci: ${clip(query, 70)}` });
}

module.exports = {
  name: 'xrinamedia', category: 'AI & Media',
  help: [
    { cmd: 'iqcpink', alias: [], desc: 'buat gambar IQC pink: .iqcpink <teks>' },
    { cmd: 'brathd', alias: ['stikerhd'], desc: 'buat gambar Brat HD: .brathd <teks>' },
    { cmd: 'animein', alias: ['animecari'], desc: 'cari anime: .animein <judul>' },
    { cmd: 'fakedev', alias: [], desc: 'buat gambar Fake Developer: .fakedev <nama>' },
  ],
  commands: { iqcpink, brathd, animein, fakedev, stikerhd: brathd, animecari: animein },
};

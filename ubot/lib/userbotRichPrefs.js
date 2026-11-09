// USERBOT RICH PREFS - pengaturan fitur Rich PER AKUN (khusus paket PRO).
//   autotext  : SEMUA teks biasa yang kamu ketik otomatis jadi Rich Message
//               + emoji premium (lewat @bot). Default MATI. (.autorich on/off)
//   replyRich : balasan command (HTML) dikirim jadi Rich Message. Default NYALA.
//   footer    : tulisan kecil di bawah balasan command ('' = disembunyiin)
//   inlineBot : username bot inline buat render Rich (null = bot utama)

const path = require('path');
const { getAccountData, setAccountData } = require('../src/lib/perAccountStore');

const prefsPath = path.join(__dirname, '../src/database/userbotRichPrefs.json');

const DEFAULT_FOOTER = '⚡ HAMZX USERBOT PREMIUM';
const MAX_FOOTER = 80;

function getRichPrefs(accountKey) {
  const d = getAccountData(prefsPath, accountKey, null) || {};
  return {
    autotext: d.autotext === true, // default MATI
    replyRich: d.replyRich !== false, // default NYALA
    footer: typeof d.footer === 'string' ? d.footer : DEFAULT_FOOTER,
    inlineBot: d.inlineBot ? String(d.inlineBot) : null,
  };
}

function setRichPref(accountKey, patch) {
  const cur = getAccountData(prefsPath, accountKey, null) || {};
  setAccountData(prefsPath, accountKey, { ...cur, ...patch });
  return getRichPrefs(accountKey);
}

function cleanFooter(input) {
  return String(input || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FOOTER);
}

function escapeHtml(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { getRichPrefs, setRichPref, cleanFooter, escapeHtml, DEFAULT_FOOTER, MAX_FOOTER };
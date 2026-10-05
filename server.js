#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════
   Platform Workshop Terintegrasi — server
   ──────────────────────────────────────────────────────────────
   Satu berkas, TANPA dependensi (hanya modul bawaan Node.js).
   Menjalankan dua hal sekaligus:
     • menyajikan halaman aplikasi dari folder public/
     • menyediakan API di /api  (bentuknya sama seperti versi lama,
       jadi halaman tidak perlu diubah)

   Jalankan:   node server.js
   Pengaturan lewat variabel lingkungan (semuanya opsional):
     PORT=8080            port pendengar
     ADMIN_PASSWORD=...   sandi panitia (default: sayaadminnya)
     DATA_FILE=data.json  lokasi berkas data
   ══════════════════════════════════════════════════════════════ */

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
/* Baca .env di folder ini bila ada (tanpa pustaka tambahan). Variabel sistem tetap menang. */
(function muatEnv() {
  try {
    const isi = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    isi.split(/\r?\n/).forEach(baris => {
      const m = baris.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || baris.trim().startsWith('#')) return;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    });
  } catch (e) {}
})();
const crypto = require('crypto');
const https = require('https');

const PORT = Number(process.env.PORT || 8080);
const ADMIN = process.env.ADMIN_PASSWORD || 'sayaadminnya';
const SUPER_USER = process.env.ADMIN_USER || 'superadmin';
const DATA_FILE = path.resolve(process.env.DATA_FILE || path.join(__dirname, 'data.json'));
/* Xendit — opsional. Tanpa kunci ini, workshop berbiaya memakai persetujuan panitia. */
const XENDIT_SECRET = process.env.XENDIT_SECRET || '';
const XENDIT_TOKEN = process.env.XENDIT_CALLBACK_TOKEN || '';
/* Midtrans — opsional. MIDTRANS_PRODUCTION=1 untuk transaksi sungguhan; tanpa itu memakai sandbox. */
const MIDTRANS_KEY = process.env.MIDTRANS_SERVER_KEY || '';
const MIDTRANS_PROD = /^(1|true|ya|yes)$/i.test(process.env.MIDTRANS_PRODUCTION || '');
/* Zoom — opsional. Aplikasi Server-to-Server OAuth di marketplace.zoom.us. */
const ZOOM_ACCOUNT = process.env.ZOOM_ACCOUNT_ID || '';
const ZOOM_CLIENT = process.env.ZOOM_CLIENT_ID || '';
const ZOOM_SECRET = process.env.ZOOM_CLIENT_SECRET || '';
const ZOOM_USER = process.env.ZOOM_USER || 'me';
const ZOOM_AKTIF = !!(ZOOM_ACCOUNT && ZOOM_CLIENT && ZOOM_SECRET);
const PUBLIC_DIR = path.join(__dirname, 'public');
/* Email tiket — SMTP biasa (Gmail sandi aplikasi, email hosting Rumahweb, Brevo, dll.). */
const SMTP = {
  host: process.env.SMTP_HOST || '', port: Number(process.env.SMTP_PORT || 465),
  user: process.env.SMTP_USER || '', pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || process.env.SMTP_USER || '', name: process.env.SMTP_NAME || 'Ruang islami.co'
};
const MAIL_AKTIF = !!(SMTP.host && SMTP.user && SMTP.pass);

/* Klien SMTP mini: 465 = TLS langsung, 587/25 = STARTTLS. Tanpa dependensi. */
function kirimEmail({ to, subject, html, text, attachments }) {
  const tls = require('tls');
  const net = require('net');
  return new Promise((resolve, reject) => {
    let sock, buf = '', tunggu = null, selesai = false;
    const gagal = e => { if (selesai) return; selesai = true; try { sock && sock.destroy(); } catch (x) {} reject(e instanceof Error ? e : new Error(String(e))); };
    const timer = setTimeout(() => gagal(new Error('SMTP tidak menjawab (batas waktu).')), 30000);
    const pasang = s => {
      sock = s;
      sock.setEncoding('utf8');
      sock.on('data', d => {
        buf += d;
        let m;
        while ((m = buf.match(/^(\d{3})([ -])(.*)\r?\n/m)) && tunggu) {
          const idx = buf.indexOf(m[0]);
          const baris = m[0];
          buf = buf.slice(idx + baris.length);
          tunggu.lines.push(baris.trim());
          if (m[2] === ' ') { const t = tunggu; tunggu = null; t.done(Number(m[1]), t.lines.join('\n')); }
        }
      });
      sock.on('error', gagal);
    };
    const balas = () => new Promise(res => { tunggu = { lines: [], done: (c, t) => res({ c, t }) }; if (buf) sock.emit('data', ''); });
    const kirim = async (cmd, harap) => {
      const p = balas();
      sock.write(cmd + '\r\n');
      const r = await p;
      if (harap && harap.indexOf(r.c) < 0) throw new Error('SMTP menolak "' + cmd.split(' ')[0] + '": ' + r.t);
      return r;
    };
    const b64 = s => Buffer.from(s, 'utf8').toString('base64');
    const lipat = s => s.replace(/(.{76})/g, '$1\r\n');
    const batas1 = 'mix_' + crypto.randomBytes(8).toString('hex');
    const batas2 = 'rel_' + crypto.randomBytes(8).toString('hex');
    const kepala = s => '=?UTF-8?B?' + b64(s) + '?=';
    const bagian = [];
    bagian.push('--' + batas2, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', lipat(b64(html)));
    (attachments || []).filter(a => a.cid).forEach(a => bagian.push('--' + batas2, 'Content-Type: ' + a.type + '; name="' + a.name + '"',
      'Content-Transfer-Encoding: base64', 'Content-ID: <' + a.cid + '>', 'Content-Disposition: inline; filename="' + a.name + '"', '', lipat(a.data)));
    bagian.push('--' + batas2 + '--');
    const isi = [
      'From: ' + kepala(SMTP.name) + ' <' + SMTP.from + '>', 'To: <' + to + '>', 'Subject: ' + kepala(subject),
      'Date: ' + new Date().toUTCString(), 'Message-ID: <' + crypto.randomBytes(12).toString('hex') + '@' + (SMTP.from.split('@')[1] || 'ruang') + '>',
      'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="' + batas1 + '"', '',
      '--' + batas1, 'Content-Type: multipart/related; boundary="' + batas2 + '"', '', bagian.join('\r\n')
    ];
    (attachments || []).forEach(a => isi.push('--' + batas1, 'Content-Type: ' + a.type + '; name="' + a.name + '"',
      'Content-Transfer-Encoding: base64', 'Content-Disposition: attachment; filename="' + a.name + '"', '', lipat(a.data)));
    isi.push('--' + batas1 + '--', '');
    const pesan = isi.join('\r\n').replace(/\r\n\./g, '\r\n..');

    const jalan = async () => {
      try {
        await balas().then(r => { if (r.c !== 220) throw new Error('SMTP: ' + r.t); });
        let r = await kirim('EHLO ruang.local', [250]);
        if (SMTP.port !== 465 && /STARTTLS/i.test(r.t)) {
          await kirim('STARTTLS', [220]);
          const lama = sock; lama.removeAllListeners('data');
          await new Promise((ok, no) => { const t = tls.connect({ socket: lama, servername: SMTP.host }, ok); t.on('error', no); pasang(t); });
          await kirim('EHLO ruang.local', [250]);
        }
        await kirim('AUTH LOGIN', [334]);
        await kirim(b64(SMTP.user), [334]);
        await kirim(b64(SMTP.pass), [235]);
        await kirim('MAIL FROM:<' + SMTP.from + '>', [250]);
        await kirim('RCPT TO:<' + to + '>', [250, 251]);
        await kirim('DATA', [354]);
        await kirim(pesan + '\r\n.', [250]);
        try { sock.write('QUIT\r\n'); sock.end(); } catch (e) {}
        clearTimeout(timer); selesai = true; resolve(true);
      } catch (e) { clearTimeout(timer); gagal(e); }
    };
    if (SMTP.port === 465) pasang(tls.connect({ host: SMTP.host, port: 465, servername: SMTP.host }, jalan));
    else { const s = net.connect({ host: SMTP.host, port: SMTP.port }, jalan); pasang(s); }
  });
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'unggahan');

/* ── Data: dipegang di memori, ditulis ke berkas secara atomik ── */
const EMPTY = { sessions: [], activeSessionId: null, participants: [], groups: [], admins: [], responses: {} };
/* Satu platform memuat banyak workshop. Tiap workshop punya datanya sendiri. */
const WS_BARU = () => ({
  id: '', jenis: 'workshop', title: 'Workshop baru', subtitle: '', partnerName: '', partnerLogo: '', host: 'Islamidotco',
  place: '', dateLabel: '', published: false, registration: 'panitia', price: 0, quota: 0, note: '',
  /* Untuk etalase publik */
  format: 'online', kategori: '', ringkasan: '', deskripsi: '', capaian: [],
  sertifikat: true, batasDaftar: '', unggulan: false, slug: '', flyer: '',
  certTemplate: '', certNameY: 46, certMetaY: 62, certOpen: false, certPage2: false,
  certFields: ['workshop', 'tanggal'], certQr: true, certQrPos: 'kanan-bawah', certPenerbit: ''
});
let store = null;
/* Peran:
   penuh      = super admin lembaga induk, seluruh platform
   wsadmin    = admin workshop, hanya workshop tempat akunnya dibuat
   narasumber = sesi yang ditugaskan saja
   pemantau   = lihat hasil saja
   ('fasilitator' adalah nama lama wsadmin; tetap diterima agar akun lama jalan) */
const BOLEH_SUSUN = { penuh: true };
const BOLEH_JALAN = { penuh: true, wsadmin: true, fasilitator: true, narasumber: true };
/* Admin workshop boleh menyusun isi workshopnya sendiri, tidak boleh menyentuh platform. */
const BOLEH_SUSUN_WS = { penuh: true, wsadmin: true, fasilitator: true };
let db = null;
let version = 1;
store = load();
db = store.data[wsIdSah(null)] || JSON.parse(JSON.stringify(EMPTY));
let writeTimer = null;

function load() {
  let parsed = null;
  try { parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') console.error('[workshop] data.json tidak terbaca, memulai kosong:', e.message); }

  /* Berkas versi lama (satu workshop) dinaikkan sendiri ke bentuk banyak workshop. */
  if (parsed && Array.isArray(parsed.sessions)) {
    const id = 'ws1';
    const meta = Object.assign(WS_BARU(), {
      id, title: 'Workshop Wahid Foundation', partnerName: 'Wahid Foundation',
      partnerLogo: 'assets/wahid-foundation.png', published: true
    });
    return { version: 2, meta: [meta], data: { [id]: normalize(parsed) } };
  }
  if (parsed && parsed.version === 2 && parsed.meta) {
    parsed.lembaga = Array.isArray(parsed.lembaga) ? parsed.lembaga : [];
    parsed.hero = typeof parsed.hero === 'string' ? parsed.hero : '';
    parsed.fee = Number(parsed.fee) || 0;
    parsed.meta = (parsed.meta || []).map(m => Object.assign(WS_BARU(), m));
    parsed.data = parsed.data || {};
    parsed.meta.forEach(m => { parsed.data[m.id] = normalize(parsed.data[m.id] || JSON.parse(JSON.stringify(EMPTY))); });
    return parsed;
  }
  const id = 'ws1';
  return {
    version: 2,
    meta: [Object.assign(WS_BARU(), { id, title: 'Workshop pertama', published: true })],
    data: { [id]: JSON.parse(JSON.stringify(EMPTY)) }
  };
}
function wsIdSah(id) {
  if (id && store.data[id]) return id;
  const terbit = store.meta.filter(m => m.published)[0];
  return (terbit && terbit.id) || (store.meta[0] && store.meta[0].id) || null;
}
/* Semua aksi lama bekerja pada workshop yang sedang dipilih. */
function pakai(id) {
  const wid = wsIdSah(id);
  db = wid ? store.data[wid] : JSON.parse(JSON.stringify(EMPTY));
  return wid;
}
function normalize(d) {
  d.sessions = d.sessions || [];
  d.participants = d.participants || [];
  d.groups = Array.isArray(d.groups) ? d.groups : [];
  d.admins = Array.isArray(d.admins) ? d.admins : [];
  d.payments = d.payments || {};
  d.hereg = d.hereg || {};
  d.heregCfg = d.heregCfg || { mode: 'panitia', token: '' };
  d.responses = d.responses || {};
  d.sessions.forEach(s => {
    if (!d.responses[s.id]) d.responses[s.id] = { checkins: {}, quiz: {}, words: [], feedback: {}, forms: {} };
    const r = d.responses[s.id];
    r.checkins = r.checkins || {}; r.quiz = r.quiz || {};
    r.words = r.words || []; r.feedback = r.feedback || {}; r.forms = r.forms || {};
  });
  if (!d.activeSessionId && d.sessions[0]) d.activeSessionId = d.sessions[0].id;
  return d;
}
/* Tulis tertunda 400 ms lalu diganti-nama — aman bila server mati mendadak. */
function persist() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    const tmp = DATA_FILE + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(store), 'utf8');
      fs.renameSync(tmp, DATA_FILE);
    } catch (e) { console.error('[workshop] gagal menulis data:', e.message); }
  }, 400);
}
function touch() { version++; persist(); broadcast(); }
function metaPublik() {
  return store.meta.map(m => {
    const d = store.data[m.id] || EMPTY;
    return Object.assign({}, m, { sessionCount: (d.sessions || []).length, participantCount: (d.participants || []).length });
  });
}
function slot(sessionId) {
  if (!db.responses[sessionId]) db.responses[sessionId] = { checkins: {}, quiz: {}, words: [], feedback: {}, forms: {} };
  return db.responses[sessionId];
}
function blockOf(sessionId, blockId) {
  const s = db.sessions.find(x => x.id === sessionId);
  return s ? (s.blocks || []).find(b => b.id === blockId) : null;
}

/* ── Zoom: token akun & panggilan API ── */
function httpsJson(opsi, badan) {
  return new Promise((selesai, gagal) => {
    const isi = badan ? Buffer.from(JSON.stringify(badan), 'utf8') : null;
    if (isi) { opsi.headers = Object.assign({ 'Content-Type': 'application/json', 'Content-Length': isi.length }, opsi.headers || {}); }
    const req = https.request(opsi, res => {
      let buf = '';
      res.on('data', c => { buf += c; });
      res.on('end', () => {
        let j = {};
        try { j = buf ? JSON.parse(buf) : {}; } catch (e) { return gagal(new Error('Jawaban tidak terbaca.')); }
        if (res.statusCode >= 400) return gagal(new Error(j.message || j.reason || ('Ditolak (' + res.statusCode + ')')));
        selesai(j);
      });
    });
    req.on('error', gagal);
    req.setTimeout(20000, () => { req.destroy(new Error('Tidak ada jawaban.')); });
    req.end(isi || undefined);
  });
}
let zoomTok = { nilai: '', habis: 0 };
async function zoomToken() {
  if (zoomTok.nilai && zoomTok.habis > Date.now() + 60000) return zoomTok.nilai;
  const j = await httpsJson({
    hostname: 'zoom.us', method: 'POST',
    path: '/oauth/token?grant_type=account_credentials&account_id=' + encodeURIComponent(ZOOM_ACCOUNT),
    headers: { Authorization: 'Basic ' + Buffer.from(ZOOM_CLIENT + ':' + ZOOM_SECRET).toString('base64') }
  });
  zoomTok = { nilai: j.access_token, habis: Date.now() + (j.expires_in || 3600) * 1000 };
  return zoomTok.nilai;
}
async function zoomApi(metode, jalur, badan) {
  const t = await zoomToken();
  return httpsJson({ hostname: 'api.zoom.us', method: metode, path: '/v2' + jalur, headers: { Authorization: 'Bearer ' + t } }, badan);
}

/* ── Pilihan penyedia pembayaran ── */
function penyedia() {
  const pilih = store && store.payProvider;
  if (pilih === 'midtrans' && MIDTRANS_KEY) return 'midtrans';
  if (pilih === 'xendit' && XENDIT_SECRET) return 'xendit';
  if (pilih === 'manual') return 'manual';
  return MIDTRANS_KEY ? 'midtrans' : XENDIT_SECRET ? 'xendit' : 'manual';
}

/* ── Midtrans Snap ── */
function midtrans(metode, host, jalur, badan) {
  return new Promise((selesai, gagal) => {
    const isi = badan ? Buffer.from(JSON.stringify(badan), 'utf8') : null;
    const req = https.request({
      hostname: host, path: jalur, method: metode,
      headers: Object.assign({
        Accept: 'application/json',
        Authorization: 'Basic ' + Buffer.from(MIDTRANS_KEY + ':').toString('base64')
      }, isi ? { 'Content-Type': 'application/json', 'Content-Length': isi.length } : {})
    }, res => {
      let buf = '';
      res.on('data', c => { buf += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(buf || '{}');
          if (res.statusCode >= 400) return gagal(new Error((j.error_messages || []).join('; ') || j.status_message || ('Midtrans menolak permintaan (' + res.statusCode + ')')));
          selesai(j);
        } catch (e) { gagal(new Error('Jawaban Midtrans tidak terbaca.')); }
      });
    });
    req.on('error', gagal);
    req.setTimeout(20000, () => { req.destroy(new Error('Midtrans tidak menjawab.')); });
    req.end(isi || undefined);
  });
}
const snapHost = () => MIDTRANS_PROD ? 'app.midtrans.com' : 'app.sandbox.midtrans.com';
const apiHost = () => MIDTRANS_PROD ? 'api.midtrans.com' : 'api.sandbox.midtrans.com';
function statusMidtrans(t) {
  const s = String(t.transaction_status || '');
  if (s === 'settlement' || (s === 'capture' && String(t.fraud_status || 'accept') === 'accept')) return 'lunas';
  if (s === 'pending') return 'menunggu';
  if (/deny|cancel|expire|failure/.test(s)) return 'gagal';
  return 'menunggu';
}
function tandaiLunas(d, bayar) {
  bayar.status = 'lunas';
  bayar.paidAt = bayar.paidAt || new Date().toISOString();
  const ps = (d.participants || []).filter(x => x.id === bayar.participantId)[0];
  if (ps) { ps.status = 'aktif'; ps.paidAt = bayar.paidAt; }
}

/* ── Xendit: QRIS dinamis ── */
function xendit(jalur, badan) {
  return new Promise((selesai, gagal) => {
    const isi = Buffer.from(JSON.stringify(badan), 'utf8');
    const req = https.request({
      hostname: 'api.xendit.co', path: jalur, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': isi.length,
        'api-version': '2022-07-31',
        Authorization: 'Basic ' + Buffer.from(XENDIT_SECRET + ':').toString('base64')
      }
    }, res => {
      let buf = '';
      res.on('data', c => { buf += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(buf || '{}');
          if (res.statusCode >= 400) return gagal(new Error(j.message || ('Xendit menolak permintaan (' + res.statusCode + ')')));
          selesai(j);
        } catch (e) { gagal(new Error('Jawaban Xendit tidak terbaca.')); }
      });
    });
    req.on('error', gagal);
    req.setTimeout(20000, () => { req.destroy(new Error('Xendit tidak menjawab.')); });
    req.end(isi);
  });
}
/* Catatan pembayaran disimpan di data workshop agar ikut tercadangkan. */
function bayarSlot(d) { if (!d.payments) d.payments = {}; return d.payments; }
function cariByRef(ref) {
  for (const wid of Object.keys(store.data)) {
    const d = store.data[wid];
    const bayar = (d.payments || {})[ref];
    if (bayar) return { wid, d, bayar };
  }
  return null;
}

/* ── Realtime: server-sent events ── */
const clients = new Set();
function broadcast() {
  const line = 'data: ' + JSON.stringify({ version }) + '\n\n';
  for (const res of clients) { try { res.write(line); } catch (e) { clients.delete(res); } }
}

/* ── Utilitas HTTP ── */
function json(res, obj, code) {
  const body = JSON.stringify(obj);
  res.writeHead(code || 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(body);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const parts = [];
    req.on('data', c => {
      size += c.length;
      if (size > (limit || 12 * 1024 * 1024)) { reject(new Error('Kiriman terlalu besar.')); req.destroy(); return; }
      parts.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf', '.md': 'text/markdown; charset=utf-8',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};
function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Terlarang'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Tidak ditemukan'); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(file).pipe(res);
  });
}

/* ── API ── */
function peranDari(pass, user, wsMinta) {
  if (!pass) return null;
  if (pass === ADMIN) return { role: 'penuh', name: 'Super admin', id: null, sessionIds: null, superadmin: true, user: SUPER_USER };
  const cocok = x => x.pass && x.pass === pass && (!user || !x.user || String(x.user).toLowerCase() === String(user).toLowerCase());
  /* Akun panitia dicari di semua event agar bisa masuk dari mana saja. */
  const semua = Object.keys(store.data).filter(w => (store.data[w].admins || []).some(cocok));
  if (!semua.length) return null;
  const wid = wsMinta && semua.indexOf(wsMinta) >= 0 ? wsMinta : semua[0];
  const a = store.data[wid].admins.find(cocok);
  return { role: a.role || 'pemantau', name: a.name || 'Admin', id: a.id, user: a.user || '', sessionIds: a.sessionIds || [], wsId: wid, wsIds: semua, superadmin: false };
}
/* Salinan untuk dikirim ke halaman: sandi admin tidak pernah ikut keluar. */
function dbPublik() {
  const out = Object.assign({}, db);
  out.admins = (db.admins || []).map(a => ({ id: a.id, name: a.name, user: a.user || '', role: a.role, sessionIds: a.sessionIds || [], hasPass: !!a.pass }));
  return out;
}

function handleAction(p) {
  const wid = pakai(p.ws);
  const siapa = peranDari(p.password, p.user, wid);
  const admin = !!siapa && BOLEH_SUSUN[siapa.role];
  /* Akun panitia terikat pada workshop tempat ia dibuat; super admin bebas. */
  const salahWs = !!siapa && !siapa.superadmin && siapa.wsId && siapa.wsId !== wid;
  const namaWs = id => { const m = store.meta.filter(x => x.id === id)[0]; return m ? m.title : id; };
  if (salahWs && /^(putDb|putLive|putWorkshops|reset|markPaid|setAdminPass|zoomCreate|zoomStart)$/.test(String(p.action || ''))) {
    return { ok: false, error: 'Akun ini hanya untuk workshop “' + namaWs(siapa.wsId) + '”.' };
  }

  switch (p.action) {
    case 'login': {
      const code = String(p.code || '').trim().toUpperCase();
      const hit = db.participants.filter(x => String(x.code || '').toUpperCase() === code);
      if (!hit.length) return { ok: false, error: 'Kode peserta tidak dikenali.' };
      if (hit.length > 1) return { ok: false, error: 'Kode ini terdaftar lebih dari sekali.' };
      if (hit[0].status === 'menunggu') return { ok: false, error: 'Pendaftaran Anda belum disetujui panitia.' };
      return { ok: true, data: { id: hit[0].id, name: hit[0].name, group: hit[0].group } };
    }

    case 'checkin': {
      const b = blockOf(p.sessionId, p.blockId);
      if (!b) return { ok: false, error: 'Materi check in tidak ditemukan.' };
      if (!b.open) return { ok: false, error: 'Check in belum dibuka fasilitator.' };
      const want = String(b.token || '').toUpperCase();
      const got = String(p.token || '').toUpperCase().trim();
      const cocok = got === want || got === 'WS-CHECKIN:' + String(p.sessionId).toUpperCase() + ':' + want;
      if (!cocok) return { ok: false, error: 'Kode barcode tidak sesuai sesi ini.' };
      slot(p.sessionId).checkins[p.id] = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
      touch();
      return { ok: true };
    }

    case 'quiz': {
      const b = blockOf(p.sessionId, p.blockId);
      if (!b) return { ok: false, error: 'Kuis tidak ditemukan.' };
      const qs = b.questions || [];
      const answers = p.answers || [];
      const benar = qs.filter((q, i) => answers[i] === q.answer).length;
      const score = qs.length ? Math.round(benar / qs.length * 100) : 0;
      const R = slot(p.sessionId);
      if (!R.quiz[p.blockId]) R.quiz[p.blockId] = {};
      const prev = R.quiz[p.blockId][p.id];
      const maxTries = b.allowRetake ? Math.max(1, b.retakeMax || 2) : 1;
      const tries = ((prev && prev.tries) || 0) + 1;
      if (tries > maxTries) return { ok: false, error: 'Kesempatan mengerjakan kuis sudah terpakai (' + maxTries + '×).' };
      R.quiz[p.blockId][p.id] = { answers, score, tries };
      touch();
      return { ok: true, data: { score } };
    }

    /* Mode permainan (gaya Kahoot): jawaban dikirim per soal, poin dihitung dari kecepatan. */
    case 'gameAnswer': {
      const s = (db.sessions || []).find(x => x.id === p.sessionId);
      const b = blockOf(p.sessionId, p.blockId);
      if (!s || !b || !b.game) return { ok: false, error: 'Permainan tidak ditemukan.' };
      const run = s.run;
      if (!run || run.blockId !== b.id) return { ok: false, error: 'Permainan belum dimulai.' };
      const secs = Math.max(5, run.seconds || 20);
      const elapsed = (Date.now() - run.start) / 1000;
      const idx = Math.floor(elapsed / secs);
      const qi = Number(p.qi);
      if (qi !== idx) return { ok: false, error: 'Waktu soal ini sudah habis.' };
      const qs = b.questions || [];
      const q = qs[qi];
      if (!q) return { ok: false, error: 'Soal tidak ditemukan.' };
      const R = slot(p.sessionId);
      R.game = R.game || {};
      R.game[b.id] = R.game[b.id] || {};
      const st = R.game[b.id][p.id] || { answers: [], points: [], total: 0 };
      if (st.answers[qi] != null) return { ok: true, data: st };
      const pilih = Number(p.choice);
      const sisa = Math.max(0, secs - (elapsed % secs));
      st.answers[qi] = pilih;
      st.points[qi] = pilih === q.answer ? Math.round(500 + 500 * sisa / secs) : 0;
      st.total = st.points.reduce((t, x) => t + (x || 0), 0);
      R.game[b.id][p.id] = st;
      /* Rekap kuis biasa ikut terisi agar hasil & sertifikat tetap jalan. */
      const ans = qs.map((x, i) => st.answers[i] == null ? null : st.answers[i]);
      const benar = qs.filter((x, i) => ans[i] === x.answer).length;
      R.quiz[b.id] = R.quiz[b.id] || {};
      R.quiz[b.id][p.id] = { answers: ans, score: qs.length ? Math.round(benar / qs.length * 100) : 0, tries: 1, points: st.total };
      touch();
      return { ok: true, data: st };
    }

    case 'word': {
      const R = slot(p.sessionId);
      const mine = R.words.filter(w => w.blockId === p.blockId && w.by === p.id);
      if (mine.length >= 3) return { ok: false, error: 'Kuota tiga kata sudah terpakai.' };
      const w = String(p.word || '').trim().toLowerCase();
      if (!w) return { ok: false, error: 'Kata kosong.' };
      R.words.push({ blockId: p.blockId, word: w, by: p.id });
      touch();
      return { ok: true };
    }

    /* Heregistrasi event tatap muka: panitia memindai tiket QR peserta di pintu masuk. */
    case 'hereg': {
      if (!siapa || !BOLEH_JALAN[siapa.role]) return { ok: false, error: 'Hanya panitia yang boleh melakukan heregistrasi.' };
      const raw = String(p.code || '').trim().toUpperCase();
      const kode = raw.indexOf('WS-TIKET:') === 0 ? raw.split(':').slice(2).join(':') : raw;
      const hit = db.participants.filter(x => String(x.code || '').toUpperCase() === kode)[0];
      if (!hit) return { ok: false, error: 'Kode ' + (kode || '—') + ' tidak terdaftar di event ini.' };
      if (p.undo) { delete db.hereg[hit.id]; touch(); return { ok: true, data: { id: hit.id, undone: true } }; }
      if (hit.status === 'menunggu') return { ok: false, error: hit.name + ' belum disetujui / belum membayar.' };
      if (db.hereg[hit.id]) return { ok: true, data: { id: hit.id, already: true, at: db.hereg[hit.id].at } };
      db.hereg[hit.id] = {
        at: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }),
        date: new Date().toISOString(), by: siapa.name || 'Panitia'
      };
      touch();
      return { ok: true, data: { id: hit.id, at: db.hereg[hit.id].at } };
    }

    case 'heregCfg': {
      if (!siapa || !BOLEH_JALAN[siapa.role]) return { ok: false, error: 'Hanya panitia yang boleh mengatur heregistrasi.' };
      const mode = ['panitia', 'peserta', 'keduanya'].indexOf(p.mode) >= 0 ? p.mode : 'panitia';
      db.heregCfg = { mode, token: String(p.token || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) };
      touch();
      return { ok: true, data: db.heregCfg };
    }

    /* Peserta memindai QR heregistrasi di meja registrasi. */
    case 'heregSelf': {
      const cfg = db.heregCfg || {};
      if (cfg.mode !== 'peserta' && cfg.mode !== 'keduanya') return { ok: false, error: 'Heregistrasi mandiri belum dibuka panitia.' };
      const hit = db.participants.filter(x => x.id === p.id)[0];
      if (!hit) return { ok: false, error: 'Peserta tidak ditemukan.' };
      if (hit.status === 'menunggu') return { ok: false, error: 'Pendaftaran Anda belum disetujui panitia.' };
      const raw = String(p.token || '').trim().toUpperCase();
      const tok = raw.indexOf('WS-HEREG:') === 0 ? raw.split(':').pop() : raw;
      if (!cfg.token || tok !== cfg.token) return { ok: false, error: 'Kode heregistrasi tidak cocok.' };
      if (!db.hereg[hit.id]) {
        db.hereg[hit.id] = {
          at: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }),
          date: new Date().toISOString(), by: 'Mandiri'
        };
        touch();
      }
      return { ok: true, data: { at: db.hereg[hit.id].at } };
    }

    case 'feedback': {
      const R = slot(p.sessionId);
      if (!R.feedback[p.blockId]) R.feedback[p.blockId] = {};
      R.feedback[p.blockId][p.id] = { emoji: p.emoji || '', note: p.note || '' };
      touch();
      return { ok: true };
    }

    case 'form': {
      const R = slot(p.sessionId);
      if (!R.forms[p.blockId]) R.forms[p.blockId] = {};
      R.forms[p.blockId][p.id] = p.values || {};
      touch();
      return { ok: true };
    }

    case 'upload': {
      try {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        const safe = String(p.fileName || 'berkas').replace(/[^\w.\-]/g, '_');
        const name = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '-' + safe;
        fs.writeFileSync(path.join(UPLOAD_DIR, name), Buffer.from(p.dataBase64 || '', 'base64'));
        const url = 'unggahan/' + name;
        const R = slot(p.sessionId);
        if (!R.forms[p.blockId]) R.forms[p.blockId] = {};
        if (!R.forms[p.blockId][p.id]) R.forms[p.blockId][p.id] = {};
        R.forms[p.blockId][p.id][p.fieldId] = url;
        R.forms[p.blockId][p.id][p.fieldId + '_nama'] = p.fileName || '';
        touch();
        return { ok: true, data: { url } };
      } catch (e) { return { ok: false, error: 'Unggahan gagal: ' + e.message }; }
    }

    /* Admin menyimpan seluruh susunan; jawaban peserta tidak ditimpa. */
    case 'ajukanLembaga': {
      const nama = String(p.lembaga || '').trim();
      const pic = String(p.pic || '').trim();
      if (!nama || !pic) return { ok: false, error: 'Nama lembaga dan penanggung jawab wajib diisi.' };
      store.lembaga = Array.isArray(store.lembaga) ? store.lembaga : [];
      store.lembaga.push({
        id: 'lb' + Date.now().toString(36), lembaga: nama, pic,
        email: String(p.email || '').trim(), phone: String(p.phone || '').trim(),
        kota: String(p.kota || '').trim(), situs: String(p.situs || '').trim(),
        rencana: String(p.rencana || '').trim(),
        /* Rincian rencana workshop — bahan mengisi profil saat disetujui */
        judul: String(p.judul || '').trim(), jenis: String(p.jenis || 'workshop'), format: String(p.format || 'online'),
        kategori: String(p.kategori || '').trim(), waktu: String(p.waktu || '').trim(),
        lokasi: String(p.lokasi || '').trim(), sesi: Number(p.sesi) || 0,
        kuota: Number(p.kuota) || 0, biaya: Number(p.biaya) || 0,
        narasumber: String(p.narasumber || '').trim(),
        ringkasan: String(p.ringkasan || '').trim(),
        capaian: Array.isArray(p.capaian) ? p.capaian : [],
        status: 'baru', createdAt: new Date().toISOString()
      });
      touch();
      return { ok: true };
    }

    case 'statusLembaga': {
      if (!siapa || !siapa.superadmin) return { ok: false, error: 'Hanya super admin.' };
      const a = (store.lembaga || []).filter(x => x.id === p.id)[0];
      if (!a) return { ok: false, error: 'Ajuan tidak ditemukan.' };
      a.status = String(p.status || 'baru');
      a.updatedAt = new Date().toISOString();
      touch();
      return { ok: true };
    }

    case 'putFee': {
      if (!siapa || !siapa.superadmin) return { ok: false, error: 'Hanya super admin yang boleh mengubah biaya layanan.' };
      store.fee = Math.max(0, Math.min(100, Number(p.fee) || 0));
      touch();
      return { ok: true, data: { fee: store.fee } };
    }

    /* Pendapatan satu workshop, sudah dipotong biaya layanan platform. */
    case 'revenue': {
      if (!siapa) return { ok: false, error: 'Kata sandi admin salah.' };
      if (siapa.role === 'pemantau') return { ok: false, error: 'Peran pemantau tidak boleh melihat pendapatan.' };
      const m = store.meta.filter(x => x.id === wid)[0];
      const bayar = Object.values(bayarSlot(db) || {});
      const lunas = bayar.filter(x => x.status === 'lunas');
      const bruto = lunas.reduce((t, x) => t + (Number(x.amount) || 0), 0);
      const fee = Number(store.fee) || 0;
      const potong = Math.round(bruto * fee / 100);
      return {
        ok: true,
        data: {
          wsTitle: m ? m.title : '', price: m ? Number(m.price) || 0 : 0,
          lunas: lunas.length, menunggu: bayar.length - lunas.length,
          bruto, feePercent: fee, potongan: potong, neto: bruto - potong
        }
      };
    }

    /* Membuat rapat Zoom dan langsung mengisi materi "Tautan Zoom". */
    case 'zoomCreate': {
      if (!siapa || !BOLEH_JALAN[siapa.role]) return { ok: false, error: 'Peran ini tidak boleh membuat rapat Zoom.' };
      if (!ZOOM_AKTIF) return { ok: false, error: 'Zoom belum dipasang di server (ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET).' };
      const s = (db.sessions || []).find(x => x.id === p.sessionId);
      const b = blockOf(p.sessionId, p.blockId);
      if (!s || !b || b.type !== 'zoom') return { ok: false, error: 'Materi Zoom tidak ditemukan.' };
      const m = store.meta.filter(x => x.id === wid)[0] || {};
      const topik = String(p.topic || '').trim() || [m.title, s.title].filter(Boolean).join(' — ') || 'Sesi workshop';
      const mulai = p.startTime ? new Date(p.startTime) : null;
      const badan = {
        topic: topik.slice(0, 200), type: mulai && !isNaN(mulai) ? 2 : 1, timezone: 'Asia/Jakarta',
        duration: Math.max(15, Math.min(1440, Number(p.duration) || 120)),
        agenda: String(s.desc || '').slice(0, 1900),
        settings: { waiting_room: true, join_before_host: false, mute_upon_entry: true, participant_video: false, host_video: true, auto_recording: p.record ? 'cloud' : 'none' }
      };
      if (mulai && !isNaN(mulai)) badan.start_time = mulai.toISOString().replace(/\.\d{3}Z$/, 'Z');
      return zoomApi('POST', '/users/' + encodeURIComponent(ZOOM_USER) + '/meetings', badan).then(z => {
        const idTampil = String(z.id || '').replace(/(\d{3})(\d{3,4})(\d{4})$/, '$1 $2 $3');
        b.url = z.join_url || ''; b.meetingId = idTampil; b.passcode = z.password || '';
        b.zoomId = String(z.id || ''); b.zoomCreatedAt = new Date().toISOString();
        touch();
        return { ok: true, data: { url: b.url, meetingId: b.meetingId, passcode: b.passcode, zoomId: b.zoomId, startUrl: z.start_url || '' } };
      }).catch(e => ({ ok: false, error: 'Zoom menolak: ' + e.message }));
    }

    /* Tautan host Zoom kedaluwarsa ±2 jam, jadi selalu diambil baru. */
    case 'zoomStart': {
      if (!siapa || !BOLEH_JALAN[siapa.role]) return { ok: false, error: 'Peran ini tidak boleh memulai rapat.' };
      if (!ZOOM_AKTIF) return { ok: false, error: 'Zoom belum dipasang di server.' };
      const id = String(p.zoomId || '').replace(/\D/g, '');
      if (!id) return { ok: false, error: 'Rapat belum dibuat lewat platform.' };
      return zoomApi('GET', '/meetings/' + id).then(z => ({ ok: true, data: { startUrl: z.start_url || '' } }))
        .catch(e => ({ ok: false, error: 'Zoom menolak: ' + e.message }));
    }

    case 'putPayProvider': {
      if (!siapa || !siapa.superadmin) return { ok: false, error: 'Hanya super admin.' };
      const v = String(p.provider || '');
      if (['midtrans', 'xendit', 'manual'].indexOf(v) < 0) return { ok: false, error: 'Penyedia tidak dikenal.' };
      if (v === 'midtrans' && !MIDTRANS_KEY) return { ok: false, error: 'MIDTRANS_SERVER_KEY belum dipasang di server.' };
      if (v === 'xendit' && !XENDIT_SECRET) return { ok: false, error: 'XENDIT_SECRET belum dipasang di server.' };
      store.payProvider = v;
      touch();
      return { ok: true, data: { provider: penyedia() } };
    }

    case 'putHero': {
      if (!siapa || !siapa.superadmin) return { ok: false, error: 'Hanya super admin.' };
      store.hero = String(p.hero || '');
      touch();
      return { ok: true };
    }

    case 'listWorkshops':
      return { ok: true, data: { meta: metaPublik() } };

    case 'putWorkshops': {
      const wsadmin = !!siapa && BOLEH_SUSUN_WS[siapa.role] && !BOLEH_SUSUN[siapa.role];
      if (!siapa || (!BOLEH_SUSUN[siapa.role] && !wsadmin)) return { ok: false, error: 'Hanya admin penuh atau admin workshop yang boleh mengubah data workshop.' };
      /* Admin workshop hanya boleh menyunting profil workshopnya sendiri — tidak menambah/menghapus. */
      if (wsadmin) {
        const punya = (Array.isArray(p.meta) ? p.meta : []).filter(x => x.id === siapa.wsId)[0];
        if (!punya) return { ok: false, error: 'Akun ini hanya boleh menyunting workshopnya sendiri.' };
        const asli = store.meta.filter(x => x.id === siapa.wsId)[0];
        if (!asli) return { ok: false, error: 'Workshop tidak ditemukan.' };
        /* Harga, kuota, penerbitan, dan biaya layanan tetap kewenangan super admin. */
        const kunci = ['id', 'price', 'published', 'unggulan', 'slug', 'platformFee', 'platformFeeStatus', 'platformFeeNote'];
        Object.keys(punya).forEach(k => {
          if (kunci.indexOf(k) >= 0 || k === 'sessionCount' || k === 'participantCount') return;
          asli[k] = punya[k];
        });
        touch();
        return { ok: true, data: { meta: metaPublik() } };
      }
      const masuk = Array.isArray(p.meta) ? p.meta : [];
      const idSah = {};
      store.meta = masuk.map(m => {
        const id = String(m.id || '').trim() || ('ws' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
        idSah[id] = true;
        if (!store.data[id]) store.data[id] = JSON.parse(JSON.stringify(EMPTY));
        return Object.assign(WS_BARU(), m, { id });
      });
      /* Workshop yang dihapus dari daftar, datanya ikut dibuang. */
      Object.keys(store.data).forEach(id => { if (!idSah[id]) delete store.data[id]; });
      if (!store.meta.length) {
        const id = 'ws1';
        store.meta = [Object.assign(WS_BARU(), { id, title: 'Workshop pertama', published: true })];
        store.data[id] = JSON.parse(JSON.stringify(EMPTY));
      }
      touch();
      return { ok: true, data: { meta: metaPublik() } };
    }

    /* Kirim tiket (PNG yang disusun di peramban) ke email peserta. */
    case 'sendTicket': {
      if (!MAIL_AKTIF) return { ok: false, error: 'Email belum diatur di server (SMTP_HOST, SMTP_USER, SMTP_PASS).' };
      const ps = db.participants.filter(x => x.id === p.id)[0];
      if (!ps) return { ok: false, error: 'Peserta tidak ditemukan.' };
      const email = String(ps.email || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: ps.name + ' belum punya alamat email yang sah.' };
      if (ps.status === 'menunggu') return { ok: false, error: ps.name + ' belum disetujui / belum membayar.' };
      /* Tanpa sandi panitia: hanya sekali, dan hanya untuk pendaftar baru (≤ 3 jam). */
      if (!siapa) {
        const baru = ps.registeredAt && (Date.now() - Date.parse(ps.registeredAt) < 3 * 3600 * 1000);
        if (!baru || ps.ticketSentAt) return { ok: false, error: 'Tiket hanya bisa dikirim ulang oleh panitia.' };
      }
      const m = (String(p.png || '').match(/^data:image\/png;base64,(.+)$/) || [])[1];
      if (!m || m.length > 4 * 1024 * 1024) return { ok: false, error: 'Gambar tiket tidak sah.' };
      const meta = store.meta.filter(x => x.id === wid)[0] || {};
      const asal = String(p.origin || '').replace(/[^\w:/.\-]/g, '');
      const tautan = asal ? asal + '/' : '';
      const html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#3B3238;max-width:640px;margin:0 auto;padding:8px">' +
        '<p style="font-size:15px">Assalamu\'alaikum <b>' + esc(ps.name) + '</b>,</p>' +
        '<p style="font-size:15px;line-height:1.6">Terima kasih telah mendaftar <b>' + esc(meta.title || 'event') + '</b>' +
        (meta.dateLabel ? ' (' + esc(meta.dateLabel) + (meta.place ? ', ' + esc(meta.place) : '') + ')' : '') + '. Berikut tiket Anda:</p>' +
        '<img src="cid:tiket" alt="Tiket" style="width:100%;max-width:640px;border-radius:10px;display:block;border:1px solid #EAD9C6" />' +
        '<p style="font-size:15px;line-height:1.6;margin-top:18px">Kode peserta: <b style="font-size:20px;letter-spacing:2px">' + esc(ps.code) + '</b></p>' +
        '<p style="font-size:14px;line-height:1.6;color:#6B6168">Tunjukkan QR pada tiket saat heregistrasi di lokasi. Kode yang sama dipakai untuk masuk ke ruang peserta' +
        (tautan ? ' di <a href="' + esc(tautan) + '" style="color:#B31F24">' + esc(tautan) + '</a>' : '') + '.</p>' +
        '<p style="font-size:12px;color:#8C8078;margin-top:26px">Email ini dikirim otomatis oleh Ruang islami.co.</p></div>';
      return kirimEmail({
        to: email, subject: 'Tiket ' + (meta.title || 'event') + ' — ' + ps.code, html,
        attachments: [{ name: 'tiket-' + ps.code + '.png', type: 'image/png', data: m, cid: 'tiket' }]
      }).then(() => {
        ps.ticketSentAt = new Date().toISOString();
        ps.ticketSentBy = siapa ? (siapa.name || 'Panitia') : 'Otomatis';
        touch();
        return { ok: true, data: { sentAt: ps.ticketSentAt } };
      }, e => ({ ok: false, error: 'Email gagal terkirim: ' + e.message }));
    }

    case 'register': {
      const m = store.meta.filter(x => x.id === wid)[0];
      if (!m) return { ok: false, error: 'Workshop tidak ditemukan.' };
      if (m.registration === 'panitia') return { ok: false, error: 'Pendaftaran workshop ini dilakukan oleh panitia.' };
      const nama = String(p.name || '').trim();
      if (!nama) return { ok: false, error: 'Nama belum diisi.' };
      if (m.quota && db.participants.length >= m.quota) return { ok: false, error: 'Kuota peserta sudah penuh.' };
      const email = String(p.email || '').trim().toLowerCase();
      if (email) {
        const sama = db.participants.filter(x => String(x.email || '').toLowerCase() === email)[0];
        if (sama) return { ok: true, data: { id: sama.id, code: sama.code, status: sama.status || 'aktif', lama: true } };
      }
      let kode;
      do { kode = 'WS-' + Math.random().toString(36).toUpperCase().slice(2, 6); }
      while (db.participants.some(x => String(x.code).toUpperCase() === kode));
      const perlu = m.registration === 'mandiri-setuju' || (m.price > 0);
      const pid = 'p' + Date.now().toString(36);
      db.participants.push({
        id: pid, name: nama, code: kode,
        group: (db.groups || [])[0] || 'Kelompok A', org: p.org || '', phone: p.phone || '', email: email,
        status: perlu ? 'menunggu' : 'aktif', registeredAt: new Date().toISOString()
      });
      touch();
      return { ok: true, data: { id: pid, code: kode, status: perlu ? 'menunggu' : 'aktif' } };
    }

    case 'payQris': {
      const m = store.meta.filter(x => x.id === wid)[0];
      if (!m) return { ok: false, error: 'Workshop tidak ditemukan.' };
      if (!(m.price > 0)) return { ok: false, error: 'Workshop ini tidak berbiaya.' };
      const via = penyedia();
      if (via === 'manual') return { ok: false, error: 'Pembayaran daring belum diaktifkan. Hubungi panitia untuk pembayaran manual.' };
      const peserta = db.participants.filter(x => x.id === p.id)[0];
      if (!peserta) return { ok: false, error: 'Peserta tidak ditemukan.' };
      if (peserta.status === 'aktif') return { ok: true, data: { paid: true } };
      const ref = 'ws-' + wid + '-' + peserta.id;
      if (via === 'midtrans') {
        const lama = Object.values(db.payments || {}).filter(x => x.provider === 'midtrans' && x.participantId === peserta.id && x.status === 'menunggu' && x.expiresAt > Date.now())[0];
        if (lama && lama.redirectUrl) return { ok: true, data: { provider: 'midtrans', redirectUrl: lama.redirectUrl, ref: lama.ref, amount: lama.amount } };
        /* Midtrans tidak menerima order_id yang sama dua kali, jadi tiap percobaan diberi akhiran. */
        const orderId = (ref + '-' + Date.now().toString(36)).slice(0, 50);
        const harga = Math.round(Number(m.price));
        return midtrans('POST', snapHost(), '/snap/v1/transactions', {
          transaction_details: { order_id: orderId, gross_amount: harga },
          item_details: [{ id: String(wid).slice(0, 50), price: harga, quantity: 1, name: String(m.title || 'Pendaftaran').slice(0, 50) }],
          customer_details: { first_name: String(peserta.name || 'Peserta').slice(0, 60), email: peserta.email || undefined, phone: peserta.phone || undefined },
          expiry: { unit: 'minutes', duration: 60 }
        }).then(j => {
          bayarSlot(db)[orderId] = {
            ref: orderId, provider: 'midtrans', participantId: peserta.id, amount: harga,
            token: j.token || '', redirectUrl: j.redirect_url || '', status: 'menunggu',
            expiresAt: Date.now() + 3600000, createdAt: new Date().toISOString()
          };
          touch();
          return { ok: true, data: { provider: 'midtrans', redirectUrl: j.redirect_url || '', ref: orderId, amount: harga } };
        }).catch(e => ({ ok: false, error: 'Gagal membuat tagihan Midtrans: ' + e.message }));
      }
      const adaLama = (db.payments || {})[ref];
      if (adaLama && adaLama.qr && adaLama.status === 'menunggu' && adaLama.expiresAt > Date.now()) {
        return { ok: true, data: { provider: 'xendit', qr: adaLama.qr, ref, amount: adaLama.amount, expiresAt: adaLama.expiresAt } };
      }
      return xendit('/qr_codes', {
        reference_id: ref, type: 'DYNAMIC', currency: 'IDR',
        amount: Number(m.price), expires_at: new Date(Date.now() + 3600000).toISOString()
      }).then(j => {
        bayarSlot(db)[ref] = {
          ref, participantId: peserta.id, amount: Number(m.price), qr: j.qr_string || '',
          provider: 'xendit', xenditId: j.id || '', status: 'menunggu', expiresAt: Date.now() + 3600000,
          createdAt: new Date().toISOString()
        };
        touch();
        return { ok: true, data: { provider: 'xendit', qr: j.qr_string || '', ref, amount: Number(m.price), expiresAt: Date.now() + 3600000 } };
      }).catch(e => ({ ok: false, error: 'Gagal membuat QRIS: ' + e.message }));
    }

    case 'payStatus': {
      const bayar = (db.payments || {})[String(p.ref || '')];
      if (!bayar) return { ok: false, error: 'Tagihan tidak ditemukan.' };
      const peserta = db.participants.filter(x => x.id === bayar.participantId)[0];
      if (bayar.provider === 'midtrans' && bayar.status === 'menunggu' && MIDTRANS_KEY) {
        const dPakai = db;
        return midtrans('GET', apiHost(), '/v2/' + encodeURIComponent(bayar.ref) + '/status').then(t => {
          const st = statusMidtrans(t);
          if (st === 'lunas') tandaiLunas(dPakai, bayar);
          else bayar.status = st;
          touch();
          return { ok: true, data: { status: bayar.status, pesertaStatus: peserta ? peserta.status : null } };
        }).catch(() => ({ ok: true, data: { status: bayar.status, pesertaStatus: peserta ? peserta.status : null } }));
      }
      return { ok: true, data: { status: bayar.status, pesertaStatus: peserta ? peserta.status : null } };
    }

    /* Panitia menandai pembayaran manual sebagai lunas. */
    case 'markPaid': {
      if (!siapa || !BOLEH_SUSUN[siapa.role]) return { ok: false, error: 'Hanya admin penuh.' };
      const peserta = db.participants.filter(x => x.id === p.id)[0];
      if (!peserta) return { ok: false, error: 'Peserta tidak ditemukan.' };
      peserta.status = 'aktif';
      peserta.paidAt = new Date().toISOString();
      peserta.paidBy = siapa.name || 'panitia';
      touch();
      return { ok: true };
    }

    case 'adminLogin': {
      if (String(p.pass || '') === ADMIN && String(p.user || '').toLowerCase() !== SUPER_USER.toLowerCase())
        return { ok: false, error: 'Nama pengguna super admin salah.' };
      const s = peranDari(p.pass, p.user);
      if (!s) return { ok: false, error: 'Nama pengguna atau kata sandi tidak dikenali.' };
      return { ok: true, data: Object.assign({}, s, { wsTitle: s.wsId ? namaWs(s.wsId) : '', wsIds: s.wsIds || [] }) };
    }

    /* Ringkasan seluruh platform — hanya super admin. */
    case 'platform': {
      if (!siapa || !siapa.superadmin) return { ok: false, error: 'Hanya super admin.' };
      const bayar = [];
      Object.keys(store.data).forEach(wid => {
        const d = store.data[wid];
        const m = store.meta.filter(x => x.id === wid)[0] || {};
        Object.keys(d.payments || {}).forEach(ref => {
          const b = d.payments[ref];
          const ps = (d.participants || []).filter(x => x.id === b.participantId)[0];
          bayar.push({
            ref, wsId: wid, wsTitle: m.title || wid, amount: b.amount || 0, status: b.status || 'menunggu',
            name: ps ? ps.name : '—', code: ps ? ps.code : '', createdAt: b.createdAt || '', paidAt: b.paidAt || ''
          });
        });
      });
      const admins = [];
      Object.keys(store.data).forEach(wid => {
        const m = store.meta.filter(x => x.id === wid)[0] || {};
        (store.data[wid].admins || []).forEach(a => admins.push({ id: a.id, name: a.name, user: a.user || '', role: a.role, wsId: wid, wsTitle: m.title || wid }));
      });
      return {
        ok: true,
        data: {
          meta: metaPublik(), payments: bayar, admins, lembaga: (store.lembaga || []).slice().reverse(), hero: store.hero || '',
          xendit: { aktif: !!XENDIT_SECRET, callback: !!XENDIT_TOKEN },
          midtrans: { aktif: !!MIDTRANS_KEY, produksi: MIDTRANS_PROD },
          payProvider: penyedia(), zoom: ZOOM_AKTIF, fee: Number(store.fee) || 0,
          superUser: SUPER_USER
        }
      };
    }

    case 'setAdminPass': {
      if (!siapa || !(siapa.superadmin || BOLEH_SUSUN[siapa.role])) return { ok: false, error: 'Hanya admin penuh atau super admin yang boleh mengganti sandi akun.' };
      const baru = String(p.pass || '').trim();
      if (baru.length < 6) return { ok: false, error: 'Kata sandi minimal 6 karakter.' };
      if (baru === ADMIN) return { ok: false, error: 'Kata sandi itu dipakai super admin. Pilih yang lain.' };
      const target = (db.admins || []).find(x => x.id === p.adminId);
      if (!target) return { ok: false, error: 'Akun tidak ditemukan di workshop ini. Muat ulang halaman lalu coba lagi.' };
      for (const wid of Object.keys(store.data)) {
        if ((store.data[wid].admins || []).some(x => x.id !== target.id && x.pass === baru)) return { ok: false, error: 'Kata sandi itu sudah dipakai akun lain.' };
      }
      target.pass = baru;
      touch();
      return { ok: true };
    }

    case 'putDb': {
      if (!siapa) return { ok: false, error: 'Kata sandi admin salah.' };
      if (!BOLEH_SUSUN_WS[siapa.role]) return { ok: false, error: 'Peran “' + siapa.role + '” tidak boleh mengubah susunan sesi atau peserta.' };
      const incoming = p.db || {};
      /* Sandi admin lain tidak boleh terhapus hanya karena tidak ikut terkirim. */
      if (Array.isArray(incoming.admins)) {
        db.admins = incoming.admins.map(a => {
          const lama = (db.admins || []).find(x => x.id === a.id);
          return { id: a.id, name: a.name || '', user: a.user || '', role: a.role || 'pemantau', sessionIds: a.sessionIds || [], pass: a.pass || (lama ? lama.pass : '') };
        });
      }
      db.sessions = incoming.sessions || [];
      db.participants = incoming.participants || [];
      db.groups = Array.isArray(incoming.groups) ? incoming.groups : (db.groups || []);
      db.activeSessionId = incoming.activeSessionId || (db.sessions[0] ? db.sessions[0].id : null);
      const keep = db.responses || {};
      db.responses = {};
      db.sessions.forEach(s => {
        db.responses[s.id] = keep[s.id] || { checkins: {}, quiz: {}, words: [], feedback: {}, forms: {} };
      });
      normalize(db);
      touch();
      return { ok: true };
    }

    /* Kendali langsung: hanya status buka/aktif/hitungan. */
    case 'putLive': {
      if (!siapa) return { ok: false, error: 'Kata sandi admin salah.' };
      if (!BOLEH_JALAN[siapa.role]) return { ok: false, error: 'Peran pemantau tidak boleh menjalankan sesi.' };
      const map = {};
      (p.open || []).forEach(o => { map[o.id] = !!o.open; });
      db.activeSessionId = p.activeSessionId || db.activeSessionId;
      db.sessions.forEach(s => {
        (s.blocks || []).forEach(b => { if (Object.prototype.hasOwnProperty.call(map, b.id)) b.open = map[b.id]; });
        if (s.id === p.sessionId) {
          s.active = p.active || null; s.run = p.run || null;
          if (typeof p.multiOpen !== 'undefined') s.multiOpen = !!p.multiOpen;
        }
        (s.blocks || []).forEach(b => {
          const cd = (p.countdowns || []).find(c => c.id === b.id);
          if (cd) b.endAt = cd.endAt || null;
          const ib = (p.icebreaks || []).find(c => c.id === b.id);
          if (ib) { b.pick = ib.pick || null; b.picked = ib.picked || []; b.card = ib.card || ''; b.groups = ib.groups || null; b.groupCount = ib.groupCount || 4; b.musicMode = ib.musicMode || 'auto'; }
        });
      });
      touch();
      return { ok: true };
    }

    case 'checkAdmin':
      return siapa ? { ok: true, data: siapa } : { ok: false, error: 'Kata sandi salah.' };

    case 'reset': {
      if (!admin) return { ok: false, error: 'Kata sandi admin salah.' };
      db.sessions.forEach(s => { db.responses[s.id] = { checkins: {}, quiz: {}, words: [], feedback: {}, forms: {} }; });
      touch();
      return { ok: true };
    }

    default:
      return { ok: false, error: 'Aksi tidak dikenal: ' + p.action };
  }
}

/* ── Server ── */
const server = http.createServer(async (req, res) => {
  const url = req.url || '/';

  if (req.method === 'OPTIONS') return json(res, { ok: true });

  /* Realtime: halaman berlangganan perubahan */
  if (url.startsWith('/api/events')) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('retry: 3000\n\n');
    res.write('data: ' + JSON.stringify({ version }) + '\n\n');
    clients.add(res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  /* Midtrans memberi tahu perubahan transaksi ke sini. */
  if (url.startsWith('/api/midtrans-callback')) {
    if (req.method !== 'POST') return json(res, { ok: false, error: 'Metode tidak didukung.' }, 405);
    try {
      const body = await readBody(req, 256 * 1024);
      const t = JSON.parse(body || '{}');
      const harus = require('crypto').createHash('sha512')
        .update(String(t.order_id || '') + String(t.status_code || '') + String(t.gross_amount || '') + MIDTRANS_KEY).digest('hex');
      if (!MIDTRANS_KEY || t.signature_key !== harus) return json(res, { ok: false, error: 'Tanda tangan tidak cocok.' }, 401);
      const hit = cariByRef(String(t.order_id || ''));
      if (!hit) return json(res, { ok: true, data: { ignored: true } });
      const st = statusMidtrans(t);
      if (st === 'lunas') tandaiLunas(hit.d, hit.bayar); else hit.bayar.status = st;
      touch();
      return json(res, { ok: true });
    } catch (e) { return json(res, { ok: false, error: e.message }, 400); }
  }

  /* Xendit memberi tahu pembayaran masuk ke sini. */
  if (url.startsWith('/api/xendit-callback')) {
    if (req.method !== 'POST') return json(res, { ok: false, error: 'Metode tidak didukung.' }, 405);
    try {
      const body = await readBody(req, 256 * 1024);
      if (XENDIT_TOKEN && req.headers['x-callback-token'] !== XENDIT_TOKEN) return json(res, { ok: false, error: 'Token callback tidak cocok.' }, 401);
      const ev = JSON.parse(body || '{}');
      const data = ev.data || ev;
      const ref = String(data.reference_id || data.external_id || '');
      const lunas = /SUCCEEDED|PAID|SETTLED|COMPLETED/i.test(String(data.status || ev.status || ''));
      const hit = cariByRef(ref);
      if (!hit) return json(res, { ok: true, data: { ignored: true } });
      hit.bayar.status = lunas ? 'lunas' : String(data.status || 'menunggu').toLowerCase();
      hit.bayar.paidAt = new Date().toISOString();
      if (lunas) {
        const peserta = hit.d.participants.filter(x => x.id === hit.bayar.participantId)[0];
        if (peserta) { peserta.status = 'aktif'; peserta.paidAt = hit.bayar.paidAt; }
      }
      touch();
      return json(res, { ok: true });
    } catch (e) { return json(res, { ok: false, error: e.message }, 400); }
  }

  if (url.startsWith('/api')) {
    if (req.method === 'GET') {
      const q = url.split('?')[1] || '';
      const wsParam = (q.split('&').filter(x => x.indexOf('ws=') === 0)[0] || '').slice(3);
      const wid = pakai(decodeURIComponent(wsParam || ''));
      if (url.indexOf('action=health') >= 0) return json(res, { ok: true, data: { version, workshops: store.meta.length } });
      if (url.indexOf('action=list') >= 0) return json(res, { ok: true, data: { meta: metaPublik() }, version });
      return json(res, { ok: true, data: dbPublik(), meta: metaPublik(), hero: store.hero || '', fee: Number(store.fee) || 0, zoom: ZOOM_AKTIF, mail: MAIL_AKTIF, ws: wid, version });
    }
    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        let payload = {};
        try { payload = JSON.parse(body || '{}'); } catch (e) { return json(res, { ok: false, error: 'Kiriman bukan JSON yang sah.' }); }
        return json(res, await handleAction(payload));
      } catch (e) { return json(res, { ok: false, error: e.message }); }
    }
    return json(res, { ok: false, error: 'Metode tidak didukung.' }, 405);
  }

  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log('┌───────────────────────────────────────────────');
  console.log('│ Platform Workshop Terintegrasi');
  console.log('│ Berjalan di   : http://localhost:' + PORT);
  console.log('│ Data          : ' + DATA_FILE + '  (' + store.meta.length + ' workshop)');
  console.log('│ Midtrans      : ' + (MIDTRANS_KEY ? 'aktif (' + (MIDTRANS_PROD ? 'produksi' : 'sandbox') + ')' : 'nonaktif'));
  console.log('│ Pembayaran    : ' + penyedia());
  console.log('│ Zoom          : ' + (ZOOM_AKTIF ? 'aktif (host: ' + ZOOM_USER + ')' : 'nonaktif'));
  console.log('│ Xendit        : ' + (XENDIT_SECRET ? 'aktif' + (XENDIT_TOKEN ? ' (callback terlindungi)' : ' (TANPA token callback!)') : 'nonaktif — pembayaran manual'));
  console.log('│ Email tiket   : ' + (MAIL_AKTIF ? 'aktif (' + SMTP.host + ':' + SMTP.port + ')' : 'nonaktif — isi SMTP_HOST/USER/PASS'));
  console.log('│ Super admin   : ' + SUPER_USER);
  console.log('│ Sandi admin   : ' + ADMIN + (process.env.ADMIN_PASSWORD ? '  (dari ADMIN_PASSWORD)' : '  (bawaan server.js)'));
  console.log('└───────────────────────────────────────────────');
});

/* Simpan data sebelum berhenti */
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => {
  clearTimeout(writeTimer);
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(store), 'utf8'); } catch (e) {}
  process.exit(0);
}));

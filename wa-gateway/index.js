// Gateway WhatsApp kecil: baca grup PR (teks, pin lokasi, foto) lalu teruskan ke webhook Apps Script.
// Variabel (isi di Railway > Variables, JANGAN ditulis di kode):
//   HOOK_URL   alamat webhook lengkap ...exec?hook=RAHASIA&tugas=PR
//   PUBLIC_URL alamat publik Railway, mis. https://nama-app.up.railway.app
//   PAIR_PHONE nomor WA khusus untuk login pertama, format 628xxxx (tanpa +)
//   GRUP       (opsional) id grup dipisah koma; kosong = semua grup
//   AUTH_DIR   (opsional) folder sesi, arahkan ke Volume Railway, mis. /data/auth
const http = require('http'), crypto = require('crypto');
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, downloadMediaMessage, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

const { HOOK_URL, PUBLIC_URL = '', PAIR_PHONE, GRUP = '', AUTH_DIR = './auth' } = process.env;
if (!HOOK_URL) { console.error('HOOK_URL belum diisi'); process.exit(1); }
const grupBoleh = GRUP.split(',').map(s => s.trim()).filter(Boolean);

// penyimpanan foto sementara (Apps Script mengunduh lewat /m/<id>)
const media = new Map();
http.createServer((req, res) => {
  const m = /^\/m\/([a-f0-9]{32})$/.exec(req.url || '');
  const f = m && media.get(m[1]);
  if (!f) { res.writeHead(req.url === '/' ? 200 : 404); return res.end(req.url === '/' ? 'ok' : ''); }
  res.writeHead(200, { 'Content-Type': f.mime }); res.end(f.buf);
}).listen(process.env.PORT || 3000);

async function kirim(body) {
  try { const r = await fetch(HOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'follow' }); console.log('hook', r.status, body.sender, (body.message || '').slice(0, 40)); }
  catch (e) { console.error('hook gagal', e.message); }
}

async function mulai() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }), browser: ['Gateway PR', 'Chrome', '1.0'] });
  if (!sock.authState.creds.registered && PAIR_PHONE) setTimeout(async () => { try { console.log('KODE PASANGAN:', await sock.requestPairingCode(PAIR_PHONE)); } catch (e) { console.error(e.message); } }, 3000);
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') console.log('terhubung');
    if (connection === 'close') { const kode = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode; if (kode !== DisconnectReason.loggedOut) mulai(); else console.error('Logout: hapus folder sesi lalu pasangkan ulang'); }
  });
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      try {
        const jid = m.key.remoteJid || '';
        if (m.key.fromMe || !m.message || !jid.endsWith('@g.us')) continue;
        if (grupBoleh.length && grupBoleh.indexOf(jid) < 0) continue;
        const isi = m.message.ephemeralMessage ? m.message.ephemeralMessage.message : m.message;
        const img = isi.imageMessage, loc = isi.locationMessage || isi.liveLocationMessage;
        const teks = isi.conversation || (isi.extendedTextMessage && isi.extendedTextMessage.text) || (img && img.caption) || '';
        const body = { sender: jid, member: (m.key.participant || '').split('@')[0], name: m.pushName || '', message: teks || 'non-text message', id: m.key.id };
        if (loc) body.location = loc.degreesLatitude + ',' + loc.degreesLongitude;
        if (img) {
          const buf = await downloadMediaMessage(m, 'buffer', {});
          const id = crypto.randomBytes(16).toString('hex'); media.set(id, { buf, mime: img.mimetype || 'image/jpeg' });
          setTimeout(() => media.delete(id), 30 * 60 * 1000);
          body.url = PUBLIC_URL.replace(/\/$/, '') + '/m/' + id; body.extension = 'jpg'; body.filename = id + '.jpg';
        }
        await kirim(body);
      } catch (e) { console.error('pesan gagal', e.message); }
    }
  });
}
mulai();

// Gateway WhatsApp kecil: baca grup PR (teks, pin lokasi, foto) lalu teruskan ke webhook Apps Script.
// Variabel (isi di Railway > Variables, JANGAN ditulis di kode):
//   HOOK_URL   alamat webhook lengkap ...exec?hook=RAHASIA&tugas=PR
//   PUBLIC_URL alamat publik Railway, mis. https://nama-app.up.railway.app
//   PAIR_PHONE nomor gateway, format 628xxxx (dipakai sebagai nama pengirim pesan dari HP sendiri)
//   TERIMA_SENDIRI  isi 1 bila pesan yang Anda kirim sendiri dari HP nomor gateway juga harus dibaca
//   QR_KEY     kata bebas (panjang) untuk membuka halaman QR: PUBLIC_URL/qr?k=KATA
//   PRIBADI        isi 0 bila chat pribadi TIDAK boleh dibaca (bawaan: grup + pribadi)
//   KIRIM_KEY  kata rahasia untuk kirim pesan dari web: POST PUBLIC_URL/kirim?k=KATA  {"to":"628xx atau id@g.us","message":"teks","file":{"base64","mimetype","filename"} atau "url"}
//   GRUP       id grup PR (@g.us), dipisah koma. Isi ini agar gateway HANYA membaca grup PR
//   AUTH_DIR   (opsional) folder sesi, arahkan ke Volume Railway, mis. /data/auth
const http = require('http'), crypto = require('crypto'), fs = require('fs');
const QRCode = require('qrcode');
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, downloadMediaMessage, downloadContentFromMessage, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

const { HOOK_URL, PUBLIC_URL = '', PAIR_PHONE, GRUP = '', AUTH_DIR = './auth', QR_KEY = '', TERIMA_SENDIRI = '', PRIBADI = '', KIRIM_KEY = '' } = process.env;
let qrTerakhir = '', tersambung = false, sockAktif = null;
if (!HOOK_URL) { console.error('HOOK_URL belum diisi'); process.exit(1); }
const grupBoleh = GRUP.split(',').map(s => s.trim()).filter(Boolean);

// penyimpanan foto sementara (Apps Script mengunduh lewat /m/<id>)
const media = new Map();
// pesan yang KITA kirim lewat /kirim & /reaksi: id dicatat SEBELUM dikirim supaya gemanya tidak diteruskan ke webhook (kalau diteruskan, dibaca sebagai "admin mengetik dari HP"),
// dan isinya dipakai getMessage agar kiriman ulang WhatsApp berhasil (tanpa ini pesan tampil "Menunggu pesan ini")
const terkirimKu = new Map();
async function kirimWA(jid, isi) {
  const mid = '3EB0' + crypto.randomBytes(12).toString('hex').toUpperCase();
  terkirimKu.set(mid, null);
  if (terkirimKu.size > 500) terkirimKu.delete(terkirimKu.keys().next().value);      // shortcut: simpan 500 pesan terakhir saja (memori)
  try { const r = await sockAktif.sendMessage(jid, isi, { messageId: mid }); terkirimKu.set(mid, r); return r; }
  catch (e) { terkirimKu.delete(mid); throw e; }
}
http.createServer((req, res) => {
  if ((req.url || '').split('?')[0] === '/status') {                                  // dibaca Apps Script: {tersambung, qr}
    const k = new URL(req.url, 'http://x').searchParams.get('k');
    if (!QR_KEY || k !== QR_KEY) { res.writeHead(403); return res.end('ditolak'); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ tersambung: tersambung, qr: tersambung ? '' : qrTerakhir }));
  }
  if ((req.url || '').split('?')[0] === '/qr') {
    const k = new URL(req.url, 'http://x').searchParams.get('k');
    if (!QR_KEY || k !== QR_KEY) { res.writeHead(403); return res.end('ditolak'); }
    if (tersambung) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<h2>Sudah terhubung</h2>'); }
    if (!qrTerakhir) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<meta http-equiv=refresh content=3><p>Menunggu QR... halaman dimuat ulang otomatis</p>'); }
    return QRCode.toDataURL(qrTerakhir, { width: 320 }).then(u => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<meta http-equiv=refresh content=15><img src="' + u + '"><p>Scan: WhatsApp > Perangkat tertaut > Tautkan perangkat</p>'); });
  }
  if ((req.url || '').split('?')[0] === '/kirim' && req.method === 'POST') {         // kirim pesan WhatsApp dari web / Apps Script
    const k = new URL(req.url, 'http://x').searchParams.get('k'); let raw = '';
    if (!KIRIM_KEY || k !== KIRIM_KEY) { res.writeHead(403); return res.end('ditolak'); }
    req.on('data', c => { raw += c; if (raw.length > 30e6) req.destroy(); });
    req.on('end', async () => {
      try {
        const b = JSON.parse(raw || '{}'), to = String(b.to || '').trim(), teks = String(b.message || '').trim();
        if (!to || !teks) { res.writeHead(400); return res.end('to dan message wajib'); }
        if (!sockAktif || !tersambung) { res.writeHead(503); return res.end('gateway belum tersambung'); }
        const jid = /@/.test(to) ? to : to.replace(/\D/g, '').replace(/^0/, '62') + '@s.whatsapp.net';
        const f = b.file || (b.url ? { url: String(b.url) } : null);                  // file: {base64, mimetype, filename} atau url https
        if (!f) await kirimWA(jid, { text: teks });
        else {
          const sumber = f.base64 ? Buffer.from(f.base64, 'base64') : { url: f.url }, mime = f.mimetype || 'application/octet-stream';
          if (!f.base64 && !/^https:\/\//.test(f.url || '')) { res.writeHead(400); return res.end('url harus https'); }
          await kirimWA(jid, /^image\//.test(mime) || (!f.base64 && !f.mimetype) ? { image: sumber, caption: teks } : { document: sumber, mimetype: mime, fileName: f.filename || 'dokumen', caption: teks });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"status":"ok"}');
      } catch (e) { res.writeHead(500); res.end(String(e.message)); }
    });
    return;
  }
  if ((req.url || '').split('?')[0] === '/reaksi' && req.method === 'POST') {       // beri reaksi emoji pada pesan: {key:{remoteJid,id,participant,fromMe}, emoji}
    const k = new URL(req.url, 'http://x').searchParams.get('k'); let raw = '';
    if (!KIRIM_KEY || k !== KIRIM_KEY) { res.writeHead(403); return res.end('ditolak'); }
    req.on('data', c => { raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on('end', async () => {
      try {
        const b = JSON.parse(raw || '{}'); if (!b.key || !b.key.remoteJid || !b.key.id) { res.writeHead(400); return res.end('key wajib'); }
        if (!sockAktif || !tersambung) { res.writeHead(503); return res.end('gateway belum tersambung'); }
        await kirimWA(b.key.remoteJid, { react: { text: String(b.emoji || '👍'), key: b.key } });
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"status":"ok"}');
      } catch (e) { res.writeHead(500); res.end(String(e.message)); }
    });
    return;
  }
  const m = /^\/m\/([a-f0-9]{32})$/.exec(req.url || '');
  const f = m && media.get(m[1]);
  if (!f) { res.writeHead(req.url === '/' ? 200 : 404); return res.end(req.url === '/' ? 'ok' : ''); }
  res.writeHead(200, { 'Content-Type': f.mime }); res.end(f.buf);
}).listen(process.env.PORT || 3000);

async function kirim(body, coba) {
  coba = coba || 0;
  try {
    const r = await fetch(HOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'follow' });
    let j = {}; try { j = await r.json(); } catch (e) { /* balasan bukan JSON */ }
    console.log('hook', r.status, body.sender, (body.message || '').slice(0, 40), j.tunda ? '(tunda: ' + j.tunda + ')' : '');
    if (j.tunda && coba < 3) setTimeout(() => kirim(body, coba + 1), [8000, 25000, 90000][coba]);   // nomor untuk ID @lid belum dikenal: coba lagi setelah salinan Fonnte sempat mengajarkannya
  } catch (e) { console.error('hook gagal', e.message); }
}

async function mulai() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }), browser: ['Gateway PR', 'Chrome', '1.0'],
    getMessage: async key => { const r = terkirimKu.get(key.id); return r && r.message ? r.message : undefined; } });   // kiriman ulang WhatsApp (hindari "Menunggu pesan ini")
  sockAktif = sock;
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) { qrTerakhir = qr; console.log('QR siap: buka /qr?k=QR_KEY'); }
    if (connection === 'open') { tersambung = true; console.log('terhubung'); }
    if (connection === 'close') tersambung = false;
    if (connection === 'close') { const kode = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode; if (kode !== DisconnectReason.loggedOut) mulai(); else { console.error('Logout: sesi lama dihapus otomatis, buka /qr dan scan ulang'); try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (e) { /* abaikan */ } mulai(); } }
  });
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const m of messages) {
      try {
        const jid = m.key.remoteJid || '';
        console.log('masuk', type, jid, m.key.fromMe ? 'dari-sendiri' : 'dari-orang', m.message ? Object.keys(m.message).join(',') : 'kosong');   // diagnosa: hapus bila sudah stabil
        if (m.key.fromMe && terkirimKu.has(m.key.id)) continue;                      // gema kiriman kita sendiri (/kirim, /reaksi): jangan diteruskan
        const baru = Date.now() / 1000 - Number(m.messageTimestamp || 0) < 120;       // abaikan riwayat lama saat tersambung
        if (type !== 'notify' && !(TERIMA_SENDIRI && m.key.fromMe && baru)) continue;
        if ((m.key.fromMe && !TERIMA_SENDIRI) || !m.message || /^status@|@broadcast$|@newsletter$/.test(jid) || (PRIBADI === '0' && !jid.endsWith('@g.us'))) continue;   // grup PR + chat pribadi; PRIBADI=0 untuk grup saja
        if (grupBoleh.length && jid.endsWith('@g.us') && grupBoleh.indexOf(jid) < 0) continue;   // GRUP membatasi hanya grup; chat pribadi tetap dibaca (PRIBADI=0 untuk mematikan)
        let isi = m.message;                                                         // buka pembungkus (pesan sementara, sekali lihat, dokumen+keterangan)
        for (let i = 0; i < 4; i++) { const d = isi.ephemeralMessage || isi.viewOnceMessage || isi.viewOnceMessageV2 || isi.viewOnceMessageV2Extension || isi.documentWithCaptionMessage || isi.editedMessage; if (!d || !d.message) break; isi = d.message; }
        const dok = isi.documentMessage && /^image\//.test(isi.documentMessage.mimetype || '') ? isi.documentMessage : null;
        const img = isi.imageMessage || dok, loc = isi.locationMessage || isi.liveLocationMessage;
        const teks = isi.conversation || (isi.extendedTextMessage && isi.extendedTextMessage.text) || (img && img.caption) || '';
        const grupJid = jid.endsWith('@g.us'), tk = Object.keys(isi);
        if (!grupJid && !teks && !img && !loc && tk.every(k => /^(reactionMessage|protocolMessage|senderKeyDistributionMessage|messageContextInfo)$/.test(k))) continue;   // reaksi / pesan sistem di chat pribadi bukan pesan client maupun admin
        const nomorAsli = s => String(s || '').split('@')[0].split(':')[0];          // nomor telepon asli bila WhatsApp menyertakannya (chat dengan ID samaran @lid)
        const pn = nomorAsli(m.key.senderPn || m.key.remoteJidAlt), mp = nomorAsli(m.key.participantPn || m.key.participantAlt);
        const body = { sender: jid, member: grupJid ? (mp || (m.key.participant || (m.key.fromMe ? PAIR_PHONE : '') || '').split('@')[0]) : '', pn: grupJid ? '' : pn, name: m.pushName || '', message: teks || 'non-text message', id: m.key.id, kunci: JSON.stringify(m.key), dariSaya: m.key.fromMe ? '1' : '', tipe: tk.join(',') };
        if (loc) body.location = loc.degreesLatitude + ',' + loc.degreesLongitude;
        if (img) {
          try {
            let buf;
            try { buf = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }); }
            catch (e1) {                                                             // cadangan: unduh langsung dari isi pesan
              console.error('unduh cara 1 gagal:', e1.message);
              const st = await downloadContentFromMessage(img, dok ? 'document' : 'image'); const bagian = [];
              for await (const c of st) bagian.push(c); buf = Buffer.concat(bagian);
            }
            const id = crypto.randomBytes(16).toString('hex'); media.set(id, { buf, mime: img.mimetype || 'image/jpeg' });
            setTimeout(() => media.delete(id), 30 * 60 * 1000);
            body.url = PUBLIC_URL.replace(/\/$/, '') + '/m/' + id; body.extension = 'jpg'; body.filename = id + '.jpg';
          } catch (e) { console.error('foto gagal diunduh', e.message); body.galat = 'foto gagal diunduh gateway: ' + e.message; }
        }
        await kirim(body);
      } catch (e) { console.error('pesan gagal', e.message); }
    }
  });
}
mulai();

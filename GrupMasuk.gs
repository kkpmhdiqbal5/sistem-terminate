/*****************************************************************
 * GrupMasuk.gs  -  file BARU di Apps Script (nama bebas: GrupMasuk)
 * Mengambil data otomatis dari grup WhatsApp (lewat webhook Fonnte):
 *   1) laporan teks / foto + caption "Nama : ... CID : ..." -> sheet sesuai (sudah diambil / kunjungan / lanjut berlanganan)
 *   2) file .docx -> sheet Full Data atau target (nama file mengandung "target" -> target)
 * Hanya data POP / OLT PERBAUNGAN dan PANTAI CERMIN. Grup sumber dipilih di pop-up kirim laporan (tombol 📥).
 * Butuh Terminate.gs, ChatClient.gs, ChatBaru.gs terbaru.
 *****************************************************************/

const GM_MAKS_HARI = 0;   // batas data yang diambil otomatis dari grup per hari (laporan + baris DOCX); 0 = tanpa batas
function gmSisa_() { return GM_MAKS_HARI ? Math.max(0, GM_MAKS_HARI - (Number(PropertiesService.getScriptProperties().getProperty('GRUP_' + tmIso_(new Date()))) || 0)) : 1e9; }
function gmPakai_() { const p = PropertiesService.getScriptProperties(), k = 'GRUP_' + tmIso_(new Date()); p.setProperty(k, String((Number(p.getProperty(k)) || 0) + 1)); }

function gmSumber_(grup) {
  const g = String(grup || '').toLowerCase();
  return !!g && ccTujuanList_().some(x => x.sumber && String(x.nomor).toLowerCase() === g);
}

/* ---------- baca laporan teks ---------- */
function gmParse_(teks) {
  const lines = String(teks || '').replace(/[‎‏‪-‮]/g, '').split(/\r?\n/);
  const tglm = String(teks).match(/(\d{1,2})\s*[,.]?\s*(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s*[,.]?\s*(\d{4})/i);
  const tanggal = tglm ? tmTglParse_(tglm[1] + ' ' + tglm[2] + ' ' + tglm[3]) : '';
  const out = []; let jenis = '', cur = null, abaikan = false;
  const tutup = () => { if (cur && (cur.cid || cur.sn || cur.psn)) out.push(cur); cur = null; };
  lines.forEach(raw => {
    const t = raw.replace(/\*/g, '').trim();
    if (!t) { abaikan = false; return; }
    const kv = /^(?:\d+\s*[.)]\s*)?([A-Za-z\- ]{2,12}?)\s*[:：]\s*(.*)$/.exec(t);
    if (!kv) {                                                      // judul bagian
      const u = t.toUpperCase();
      if (/BERHENTI BERLANGGANAN|PERANGKAT SUDAH DIAMBIL/.test(u)) { tutup(); jenis = 'TERMINATE'; abaikan = false; return; }
      if (/LANJUT BERLANGGANAN/.test(u)) { tutup(); jenis = 'LANJUT'; abaikan = false; return; }
      if (/TIDAK ADA ?DI ?RUMAH/.test(u)) { tutup(); jenis = 'KUNJUNGAN'; abaikan = false; return; }
      return;                                                       // baris nama TS/TIM dan lainnya diabaikan
    }
    const k = tmNorm_(kv[1]), v = kv[2].trim();
    if (k === 'NAMA' || k === 'AN') { tutup(); cur = { jenis: jenis, nama: v, cid: '', odp: '', sn: '', psn: '', ket: '', tanggal: tanggal }; abaikan = false; return; }
    if (!cur) return;
    if (k === 'TS' || k === 'TIM') { abaikan = true; return; }
    if (abaikan) return;
    if (k === 'CID') cur.cid = v.replace(/\D/g, '');
    else if (k === 'ODP') cur.odp = v === '-' ? '' : v;
    else if (k === 'SN') cur.sn = v === '-' ? '' : v;
    else if (k === 'PSN') cur.psn = v === '-' ? '' : v;
    else if (k === 'KET') cur.ket = v;
  });
  tutup();
  out.forEach(x => {                                                // jenis bila tidak ada judul bagian (caption foto)
    if (x.jenis) return;
    const k = x.ket.toLowerCase();
    x.jenis = (x.sn || x.psn) ? (/diambil|dicabut|port/.test(k) ? 'TERMINATE' : '') : /tidak ada ?di ?rumah/.test(k) ? 'KUNJUNGAN' : /lanjut/.test(k) ? 'LANJUT' : '';
  });
  return out.filter(x => x.jenis);
}

/* ---------- cari POP dari data yang sudah ada ---------- */
function gmPopCari_(x) {
  let p = tmPop_(x.odp) || tmPop_(x.pop || '');
  if (p) return { pop: p };
  const cid = tmNorm_(x.cid), sn = tmNorm_(x.sn), psn = tmNorm_(x.psn);
  const sheets = [TM.SH.B1, TM.SH.B2, TM.SH.FULL, TM.SH.TARGET, TM.SH.INSTALASI, TM.SH.MT, TM.SH.LOG];
  for (let i = 0; i < sheets.length; i++) {
    const r = tmRead_(sheets[i]).filter(r => (cid && tmNorm_(r.CID) === cid) || (sn && (tmNorm_(r.SN) === sn || tmNorm_(r.PSN) === sn)) || (psn && (tmNorm_(r.SN) === psn || tmNorm_(r.PSN) === psn)))
      .filter(r => tmPop_(r.POP) || tmPop_(r.ODP))[0];
    if (r) return { pop: tmPop_(r.POP) || tmPop_(r.ODP), nama: String(r.NAMA || '').trim(), cid: String(r.CID || '').trim(), odp: tmOdpAkhir_(String(r.ODP || '')) };
  }
  return { pop: '' };
}
function gmFoto_(url) {
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return '';
    const blob = res.getBlob(); if (blob.getBytes().length > 12 * 1024 * 1024) return '';
    blob.setName('GRUP_' + Utilities.formatDate(new Date(), TM.TZ, 'yyyyMMdd_HHmmss') + '.jpg');
    const it = DriveApp.getFoldersByName(TM.FOLDER_FOTO), folder = it.hasNext() ? it.next() : DriveApp.createFolder(TM.FOLDER_FOTO);
    const f = folder.createFile(blob); f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return f.getUrl();
  } catch (e) { Logger.log('foto grup: ' + e.message); return ''; }
}

/* ---------- simpan ke sheet yang sesuai (sama dengan input tim terminate) ---------- */
function gmProses_(items, fotoUrl, opt) {
  opt = opt || {};
  const h = { masuk: 0, dobel: 0, bukanPop: 0, tidakLengkap: 0, batas: 0 };
  const foto = opt.langsung ? (fotoUrl || '') : (fotoUrl ? gmFoto_(fotoUrl) : '');   // langsung = tautan foto sudah di Drive
  items.forEach(x => {
    if (gmSisa_() < 1) { h.batas++; return; }
    const info = gmPopCari_(x);
    if (!info.pop) { h.bukanPop++; return; }
    if (!x.nama && info.nama) x.nama = info.nama;
    if (!x.cid && info.cid) x.cid = info.cid;
    if (!x.cid || (x.jenis !== 'TERMINATE' && !x.nama) || (x.jenis === 'TERMINATE' && !x.sn && !x.psn)) { h.tidakLengkap++; return; }
    const tgl = x.tanggal || tmIso_(new Date());
    const dobel = tmRead_(TM.SH.LOG).some(r => r.JENIS === x.jenis && (x.jenis === 'TERMINATE'
      ? (tmNorm_(r.CID) === tmNorm_(x.cid) || (x.sn && tmNorm_(r.SN) === tmNorm_(x.sn)) || (x.psn && tmNorm_(r.PSN) === tmNorm_(x.psn)))
      : (tmNorm_(r.CID) === tmNorm_(x.cid) && tmIso_(r.WAKTU) === tgl)));
    if (dobel) { h.dobel++; return; }
    const sekarang = tgl === tmIso_(new Date()), waktu = sekarang ? new Date() : new Date(tgl + 'T12:00:00+07:00');
    const T = x.jenis === 'TERMINATE';
    const rec = { ID: Utilities.getUuid().substring(0, 8).toUpperCase(), WAKTU: waktu, TANGGAL: tmTglIndo_(tgl), ADMIN: opt.admin || 'GRUP WA', TIM: opt.admin || 'GRUP WA', JENIS: x.jenis,
      NAMA: x.nama, CID: x.cid, ODP: T ? tmOdpAkhir_(x.odp || info.odp || '') : '', POP: T ? info.pop : '', SN: T ? tmCleanCode_(x.sn) : '', PSN: T ? tmCleanCode_(x.psn) : '',
      KET: x.ket || TM.KET[x.jenis], VERIF: opt.verif || 'DARI GRUP WA', SUMBER: opt.sumber || 'GRUP_WA', FOTO: foto };
    let bersih = 0;
    try {
      if (T) {
        const cari = tmLookup_(rec.SN, rec.PSN);
        bersih += tmHapusAntrian_(rec) + tmHapusCid_(TM.SH.KUNJUNGAN, rec.CID) + tmHapusCid_(TM.SH.LANJUT, rec.CID);
        tmTandaiDiambil_([rec]);
        if (cari.found && cari.sheet === TM.SH.B1) { try { tmPindahB1_(rec.SN, rec.PSN, rec); } catch (e) { /* abaikan */ } }
        tmHapusCid_(TM.SH.B1, rec.CID);
        if (typeof ccStatusChatCid_ === 'function') ccStatusChatCid_(rec.CID, 'BERHENTI_DILAPOR');
      } else {
        bersih += tmHapusAntrian_(rec);
        if (x.jenis === 'LANJUT') { bersih += tmHapusCid_(TM.SH.B1, rec.CID) + tmHapusCid_(TM.SH.KUNJUNGAN, rec.CID); if (typeof ccStatusChatCid_ === 'function') ccStatusChatCid_(rec.CID, 'LANJUT_DILAPOR'); }
      }
    } catch (e) { rec.VERIF += ' | GAGAL BERSIHKAN ANTRIAN'; }
    const kerja = Object.assign({}, rec); delete kerja.JENIS;
    const tujuan = T ? [TM.SH.TERMINATE] : x.jenis === 'KUNJUNGAN' ? [TM.SH.KUNJUNGAN] : [TM.SH.LANJUT, TM.SH.TERMINATE];
    tujuan.forEach(nm => { try { tmHapusCid_(nm, rec.CID); } catch (e) { /* abaikan */ } tmAppendObj_(tmSheetEnsure_(nm, TM_LOG_KEYS), kerja); });
    tmAppendObj_(tmSheetEnsure_(TM.SH.LOG, TM_LOG_KEYS), rec);
    h.masuk++; gmPakai_();
  });
  return h;
}
function gmRingkas_(h) { return h.masuk + ' masuk, ' + h.dobel + ' dobel, ' + h.bukanPop + ' bukan Perbaungan/Pantai Cermin (atau POP tidak ketahuan), ' + h.tidakLengkap + ' tidak lengkap' + (h.batas ? ', ' + h.batas + ' DITUNDA (batas ' + GM_MAKS_HARI + ' data per hari tercapai)' : ''); }

/* ---------- file DOCX -> Full Data / target ---------- */
function gmDocx_(url, namaFile) {
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { err: 'file tidak bisa diunduh (HTTP ' + res.getResponseCode() + ')' };
  const blob = res.getBlob().setContentType('application/zip');
  let xml = '';
  Utilities.unzip(blob).forEach(f => { if (f.getName() === 'word/document.xml') xml = f.getDataAsString('UTF-8'); });
  if (!xml) return { err: 'bukan file DOCX yang valid' };
  const W = XmlService.getNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
  const teksDari = el => { let s = ''; (function walk(e) { e.getChildren().forEach(c => { const n = c.getName(); if (n === 't') s += c.getText(); else if (n === 'tab') s += ' '; else if (n === 'p' && s && !/\s$/.test(s)) { s += ' '; walk(c); } else walk(c); }); })(el); return s.replace(/\s+/g, ' ').trim(); };
  const tabel = [], paragraf = [];
  (function cari(e) {
    e.getChildren().forEach(c => {
      const n = c.getName();
      if (n === 'tbl') tabel.push(c.getChildren('tr', W).map(tr => tr.getChildren('tc', W).map(tc => teksDari(tc))));
      else if (n === 'p') { const t = teksDari(c); if (t) paragraf.push(t); }
      else cari(c);
    });
  })(XmlService.parse(xml).getRootElement());
  return { tabel: tabel, teks: paragraf.join('\n'), target: /target/i.test(String(namaFile || '')) };
}
function gmKunci_(judul) {
  const n = tmNorm_(judul);
  if (n === 'OLT' || n === 'POP' || n === 'AREA') return 'POP';
  if (/^(NOMORPELANGGAN|NOPELANGGAN|IDPELANGGAN|CUSTOMERID)$/.test(n)) return 'CID';
  if (/^(NAMAPELANGGAN|NAMACUSTOMER|CUSTOMER)$/.test(n)) return 'NAMA';
  if (/^(NOHP|NOMORHP|HP|NOWA|WHATSAPP|TELEPON|TELP)$/.test(n)) return 'NOHP';
  return tmCanon_(judul);
}
function gmMasukSheet_(hasil) {
  const dest = hasil.target ? TM.SH.TARGET : TM.SH.FULL, sh = tmSheet_(dest);
  if (!sh) return { err: 'sheet "' + dest + '" tidak ada' };
  const ada = tmHeaders_(sh).map(tmCanon_);
  const sudah = {}; [TM.SH.FULL, TM.SH.TARGET].forEach(n => tmRead_(n).forEach(r => { const c = tmNorm_(r.CID); if (c) sudah[c] = 1; }));
  const h = { sheet: dest, masuk: 0, dobel: 0, bukanPop: 0, tanpaCid: 0, batas: 0 };
  hasil.tabel.forEach(rows => {
    const hi = rows.findIndex(r => r.filter(c => ['NAMA', 'CID', 'ODP', 'POP', 'SN'].indexOf(gmKunci_(c)) >= 0).length >= 2);
    if (hi < 0) return;
    const kunci = rows[hi].map(gmKunci_), adaPop = kunci.indexOf('POP') >= 0 || kunci.indexOf('ODP') >= 0;
    rows.slice(hi + 1).forEach(r => {
      const o = {}; kunci.forEach((k, i) => { if (k && o[k] === undefined && String(r[i] || '').trim()) o[k] = String(r[i]).trim(); });
      const cid = String(o.CID || '').replace(/\D/g, '');
      if (!cid) { h.tanpaCid++; return; }
      if (gmSisa_() < 1) { h.batas++; return; }
      if (adaPop && !(tmPop_(o.POP) || tmPop_(o.ODP))) { h.bukanPop++; return; }
      if (sudah[cid]) { h.dobel++; return; }
      o.CID = cid; if (tmPop_(o.POP) || tmPop_(o.ODP)) o.POP = tmPop_(o.POP) || tmPop_(o.ODP);
      const baris = {}; Object.keys(o).forEach(k => { if (ada.indexOf(k) >= 0) baris[k] = o[k]; });   // hanya kolom yang sudah ada di sheet
      tmAppendObj_(sh, baris); sudah[cid] = 1; h.masuk++; gmPakai_();
    });
  });
  return h;
}

/* ---------- pintu masuk dari webhook ---------- */
function gmTerima_(m) {
  const nama = String(m.filename || '').toLowerCase();
  if (m.media && (/^docx?$/i.test(m.ext || '') || /\.docx$/.test(nama))) {
    const d = gmDocx_(m.media, nama);
    if (d.err) { ccHookLog_(m.grup, '[docx] ' + nama, 'GAGAL: ' + d.err); return; }
    const h = d.tabel.length ? gmKunci(() => gmMasukSheet_(d)) : null;
    if (h && !h.err) { ccHookLog_(m.grup, '[docx] ' + nama, h.sheet + ': ' + h.masuk + ' masuk, ' + h.dobel + ' dobel, ' + h.bukanPop + ' bukan POP, ' + h.tanpaCid + ' tanpa CID' + (h.batas ? ', ' + h.batas + ' DITUNDA (batas ' + GM_MAKS_HARI + '/hari)' : '')); return; }
    const t = gmKunci(() => gmProses_(gmParse_(d.teks), '')); ccHookLog_(m.grup, '[docx teks] ' + nama, (h && h.err ? h.err + '; ' : 'tidak ada tabel; ') + gmRingkas_(t)); return;
  }
  const teks = String(m.pesan || '');
  const isiFoto = m.media && /^(jpe?g|png|webp)$/i.test(m.ext || 'jpg') ? m.media : '';
  const ringkas = teks.slice(0, 80);
  const terminate = /LAPORAN HARIAN TERMINATE|BERHENTI BERLANGGANAN|MASIH LANJUT BERLANGGANAN|TIDAK ADA ?DI ?RUMAH|PERANGKAT SUDAH DIAMBIL/i.test(teks);
  let hasil = [];
  if (!terminate && typeof WAParser !== 'undefined') hasil.push(gmInstMt_(teks));          // laporan Instalasi / MT teknisi
  const items = gmParse_(teks);
  if (items.length) hasil.push('terminate: ' + gmRingkas_(gmKunci(() => gmProses_(items, items.length === 1 ? isiFoto : ''))));
  hasil = hasil.filter(Boolean);
  ccHookLog_(m.grup, ringkas, hasil.length ? 'laporan grup -> ' + hasil.join(' | ') : 'grup: bukan format laporan, diabaikan');
}
// Instalasi / MT: dibaca pembaca laporan teknisi (WaParser.gs) lalu diimpor dengan aturan anti-dobel yang sama dengan halaman Impor
function gmInstMt_(teks) {
  let ex; try { ex = WAParser.ekstrak(teks, { mode: 'campur', ragu: 'lewati', mtHanyaGanti: true }); } catch (e) { return 'pembaca gagal: ' + e.message; }
  const hariIni = tmIso_(new Date());
  const rows = ex.baris.filter(r => r.sheet === 'Instalasi' || r.sheet === 'MT').map(r => Object.assign({}, r, { tanggal: r.tanggal || hariIni }));
  if (!rows.length) return '';
  const r = tmImporWA_({ rows: rows }, { user: 'GRUP WA' });
  return r.status === 'success' ? 'Instalasi/MT: ' + r.message : 'Instalasi/MT gagal: ' + r.message;
}
function gmKunci(fn) { const lock = LockService.getScriptLock(); lock.waitLock(25000); try { return fn(); } finally { lock.releaseLock(); } }
// uji manual dari halaman Impor: tempel teks laporan
function gmUjiTeks_(d) {
  const items = gmParse_(String(d.teks || ''));
  if (!items.length) return tmErr_('Tidak ada data yang terbaca. Pastikan format "Nama : … CID : …".');
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try { const h = gmProses_(items, ''); return { status: 'success', message: items.length + ' data terbaca: ' + gmRingkas_(h) + '.' }; } finally { lock.releaseLock(); }
}

/* ---------- daftar grup dari Fonnte ---------- */
function ccTujuanFonnte_() {
  const e = ccApiPilih_('LAPORAN', 'WA') || ccApiPilih_('CHAT_CLIENT', 'WA');
  if (!e) return tmErr_('Belum ada API WhatsApp. Atur di Profil > Pengaturan API.');
  let j = {};
  try {
    UrlFetchApp.fetch('https://api.fonnte.com/fetch-group', { method: 'post', headers: { Authorization: e.token }, muteHttpExceptions: true });
    j = JSON.parse(UrlFetchApp.fetch('https://api.fonnte.com/get-whatsapp-group', { method: 'post', headers: { Authorization: e.token }, muteHttpExceptions: true }).getContentText());
  } catch (x) { return tmErr_('Gagal menghubungi Fonnte: ' + x.message); }
  if (j.status === false) return tmErr_('Fonnte menolak: ' + (j.reason || 'tidak diketahui'));
  const arr = Array.isArray(j.data) ? j.data : [];
  const a = ccTujuanList_();
  let baru = 0;
  arr.forEach(g => {
    const id = String(g.id || g.ID || g.Id || '').trim(), nama = String(g.name || g.Name || g.subject || id).trim().slice(0, 40);
    if (!/@g\.us$/i.test(id)) return;
    const ada = a.filter(x => String(x.nomor).toLowerCase() === id.toLowerCase())[0];
    if (ada) { ada.nama = nama; } else { a.push({ nama: nama, nomor: id }); baru++; }
  });
  PropertiesService.getScriptProperties().setProperty('TUJUAN_LIST', JSON.stringify(a.slice(0, 100)));
  return { status: 'success', data: a, message: arr.length + ' grup dari Fonnte, ' + baru + ' baru ditambahkan.' };
}

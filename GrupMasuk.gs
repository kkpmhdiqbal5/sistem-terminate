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

// tugas grup: SEMUA (default) | TERMINATE (laporan pengambilan perangkat + DOCX) | CLIENT (laporan Instalasi & MT teknisi)
function gmTugas_(grup) {
  const g = String(grup || '').toLowerCase(), x = ccTujuanList_().filter(y => y.sumber && String(y.nomor).toLowerCase() === g)[0];
  return x && x.tugas || 'SEMUA';
}

/* ---------- baca laporan teks ---------- */
function gmParse_(teks) {
  const lines = String(teks || '').replace(/[‎‏‪-‮]/g, '').split(/\r?\n/);
  const tglm = String(teks).match(/(\d{1,2})\s*[,.]?\s*(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s*[,.]?\s*(\d{4})/i);
  const tanggal = tglm ? tmTglParse_(tglm[1] + ' ' + tglm[2] + ' ' + tglm[3]) : '';
  const popHead = tmPopKode_(lines.slice(0, 4).join(' '));            // judul laporan menyebut Perbaungan / Pantai Cermin
  const out = []; let jenis = '', cur = null, abaikan = false;
  const tutup = () => { if (cur && (cur.cid || cur.sn || cur.psn)) out.push(cur); cur = null; };
  lines.forEach(raw => {
    const t = raw.replace(/\*/g, '').trim();
    if (!t) { abaikan = false; return; }
    const kv = /^(?:\d+\s*[.)]\s*)?([A-Za-z\/\- ]{2,12}?)\s*[:：]\s*(.*)$/.exec(t);
    if (!kv) {                                                      // judul bagian
      const u = t.toUpperCase();
      if (/MASIH ?(MAU )?LANJUT/.test(u) && /TIDAK ADA ?DI ?RUMAH/.test(u)) { tutup(); jenis = ''; abaikan = false; return; }   // judul gabungan: jenis ditentukan dari Ket tiap data
      if (/BERHENTI BERLANGGANAN|PERANGKAT SUDAH (DIJEMPUT|DIAMBIL)/.test(u)) { tutup(); jenis = 'TERMINATE'; abaikan = false; return; }
      if (/LANJUT BERLANGGANAN|MASIH ?(MAU )?LANJUT/.test(u)) { tutup(); jenis = 'LANJUT'; abaikan = false; return; }
      if (/TIDAK ADA ?DI ?RUMAH/.test(u)) { tutup(); jenis = 'KUNJUNGAN'; abaikan = false; return; }
      return;                                                       // baris nama TS/TIM dan lainnya diabaikan
    }
    const k = tmNorm_(kv[1]), v = kv[2].trim();
    if (k === 'NAMA' || k === 'AN') { tutup(); cur = { jenis: jenis, nama: v, cid: '', odp: '', sn: '', psn: '', ket: '', tanggal: tanggal, pop: popHead }; abaikan = false; return; }
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
// cari SN / P-SN untuk sebuah CID dari sheet yang sudah ada (Baris 1, Baris 2, Instalasi, MT, Full Data, target)
function gmSnDariCid_(cid) {
  const c = tmCidDigit_(cid), sheets = [TM.SH.B1, TM.SH.B2, TM.SH.INSTALASI, TM.SH.MT, TM.SH.FULL, TM.SH.TARGET];
  if (!c) return { sn: '', psn: '' };
  for (let i = 0; i < sheets.length; i++) {
    let rows = []; try { rows = tmRead_(sheets[i]); } catch (e) { rows = []; }
    const r = rows.filter(r => tmCidDigit_(r.CID) === c && (String(r.SN || '').trim() || String(r.PSN || '').trim())).pop();
    if (r) return { sn: String(r.SN || '').trim(), psn: String(r.PSN || '').trim() };
  }
  return { sn: '', psn: '' };
}
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
// POP resmi (Perbaungan / Pantai Cermin) dari data lain yang ODP-nya sama; dipakai bila POP dari peta ODP (KMZ) hanya nama umum
let GM_PODP = null;                                   // peta nama ODP -> POP resmi, dibangun sekali per eksekusi
function gmPopDariOdp_(odp) {
  const o = tmNorm_(tmOdpAkhir_(odp)); if (!o) return '';
  if (!GM_PODP) {
    GM_PODP = {};
    [TM.SH.TARGET, TM.SH.FULL, TM.SH.LOG, TM.SH.MT, TM.SH.INSTALASI].forEach(n => {     // yang terakhir (paling baru) menimpa
      let rows = []; try { rows = tmRead_(n); } catch (e) { rows = []; }
      rows.forEach(r => { const k = tmNorm_(tmOdpAkhir_(r.ODP)), p = tmPopKode_(r.POP); if (k && p) GM_PODP[k] = p; });
    });
  }
  return GM_PODP[o] || '';
}
function gmFoto_(url) {
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return '';
    const blob = res.getBlob(); if (blob.getBytes().length > 12 * 1024 * 1024) return '';
    blob.setName('GRUP_' + Utilities.formatDate(new Date(), TM.TZ, 'yyyyMMdd_HHmmss') + '.jpg');
    const folder = tmFolderFoto_('foto prangkat');
    const f = folder.createFile(blob); f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return f.getUrl();
  } catch (e) { Logger.log('foto grup: ' + e.message); return ''; }
}

/* ---------- simpan ke sheet yang sesuai (sama dengan input tim terminate) ---------- */
function gmProses_(items, fotoUrl, opt) {
  opt = opt || {};
  const h = { masuk: 0, dobel: 0, bukanPop: 0, tidakLengkap: 0, batas: 0 };
  const foto = opt.langsung ? (fotoUrl || '') : (fotoUrl ? gmFoto_(fotoUrl) : '');   // langsung = tautan foto sudah di Drive
  const logRows = tmRead_(TM.SH.LOG);                       // dibaca sekali (cepat untuk impor ratusan data)
  items.forEach(x => {
    if (gmSisa_() < 1) { h.batas++; return; }
    const info = gmPopCari_(x);
    if (!info.pop) { h.bukanPop++; return; }
    if (info.pop && !tmPopKode_(info.pop)) info.pop = gmPopDariOdp_(x.odp || info.odp) || info.pop;
    if (!x.nama && info.nama) x.nama = info.nama;
    if (!x.cid && info.cid) x.cid = info.cid;
    if (x.cariSn && x.jenis === 'TERMINATE' && x.cid && !x.sn && !x.psn) { const s = gmSnDariCid_(x.cid); x.sn = s.sn; x.psn = s.psn; }   // laporan tanpa SN: lengkapi dari data yang sudah ada
    if (!x.cid || (x.jenis !== 'TERMINATE' && !x.nama)) { h.tidakLengkap++; return; }
    const tgl = x.tanggal || tmIso_(new Date());
    const dobel = logRows.some(r => r.JENIS === x.jenis && (x.jenis === 'TERMINATE'
      ? (tmNorm_(r.CID) === tmNorm_(x.cid) || (x.sn && tmNorm_(r.SN) === tmNorm_(x.sn)) || (x.psn && tmNorm_(r.PSN) === tmNorm_(x.psn)))
      : (tmNorm_(r.CID) === tmNorm_(x.cid) && tmIso_(r.WAKTU) === tgl)));
    if (dobel) { h.dobel++; return; }
    const sekarang = tgl === tmIso_(new Date()), waktu = sekarang ? new Date() : new Date(tgl + 'T12:00:00+07:00');
    const T = x.jenis === 'TERMINATE';
    const rec = { ID: Utilities.getUuid().substring(0, 8).toUpperCase(), WAKTU: waktu, TANGGAL: tmTglIndo_(tgl), ADMIN: opt.admin || 'GRUP WA', TIM: opt.admin || 'GRUP WA', JENIS: x.jenis,
      NAMA: x.nama, CID: x.cid, ODP: T ? tmOdpAkhir_(x.odp || info.odp || '') : '', POP: T ? (tmPopKode_(info.pop) || tmPopKode_(x.pop) || '') : '', SN: T ? tmCleanCode_(x.sn) : '', PSN: T ? tmCleanCode_(x.psn) : '',
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
    tujuan.forEach(nm => { try { tmUpsertCid_(nm, TM_LOG_KEYS, kerja); } catch (e) { Logger.log('upsert ' + nm + ': ' + e.message); } });
    tmAppendObj_(tmSheetEnsure_(TM.SH.LOG, TM_LOG_KEYS), rec); logRows.push(rec);
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
  { // file KMZ / KML daftar ODP (mis. "ION SERDANG BEDAGAI.kmz"): langsung memperbarui sheet ODP
    const fn = String(m.filename || ''), isKm = /\.(kmz|kml)$/i.test(fn) || /^(kmz|kml)$/i.test(m.ext || '');
    if (isKm) {
      if (!m.media) { ccHookLog_(m.grup, '[kmz] ' + fn, 'GAGAL: file tidak ikut terkirim dari Fonnte. Unggah manual di Admin > Sumber Grup.'); return; }
      ccHookLog_(m.grup, '[kmz] ' + fn, gmKmz_(m.media, fn)); return;
    }
  }
  if (gmTugas_(m.grup) === 'PR') { gmPrTerima_(m); return; }
  const nama = String(m.filename || '').toLowerCase(), tugas = gmTugas_(m.grup), bolehT = tugas !== 'CLIENT', bolehC = tugas !== 'TERMINATE';
  if (m.media && bolehT && (/^docx?$/i.test(m.ext || '') || /\.docx$/.test(nama))) {
    const d = gmDocx_(m.media, nama);
    if (d.err) { ccHookLog_(m.grup, '[docx] ' + nama, 'GAGAL: ' + d.err); return; }
    const h = d.tabel.length ? gmKunci(() => gmMasukSheet_(d)) : null;
    if (h && !h.err) { ccHookLog_(m.grup, '[docx] ' + nama, h.sheet + ': ' + h.masuk + ' masuk, ' + h.dobel + ' dobel, ' + h.bukanPop + ' bukan POP, ' + h.tanpaCid + ' tanpa CID' + (h.batas ? ', ' + h.batas + ' DITUNDA (batas ' + GM_MAKS_HARI + '/hari)' : '')); return; }
    const t = gmKunci(() => gmProses_(gmParse_(d.teks), '')); ccHookLog_(m.grup, '[docx teks] ' + nama, (h && h.err ? h.err + '; ' : 'tidak ada tabel; ') + gmRingkas_(t)); return;
  }
  const teks = String(m.pesan || '');
  if (/UPDATE\s+ODP/i.test(teks)) { ccHookLog_(m.grup, teks.slice(0, 80), 'update ODP: ' + gmOdpTeks_(teks)); return; }
  const isiFoto = m.media && /^(jpe?g|png|webp)$/i.test(m.ext || 'jpg') ? m.media : '';
  const ringkas = teks.slice(0, 80);
  const terminate = /LAPORAN HARIAN TERMINATE|BERHENTI BERLANGGANAN|MASIH LANJUT BERLANGGANAN|TIDAK ADA ?DI ?RUMAH|PERANGKAT SUDAH DIAMBIL/i.test(teks);
  let hasil = [];
  if (bolehC && !terminate && typeof WAParser !== 'undefined') hasil.push(gmInstMt_(teks, m.tanggal));          // laporan Instalasi / MT teknisi
  const items = bolehT ? gmParse_(teks) : []; items.forEach(it => { it.tanggal = m.tanggal || tmIso_(new Date()); });   // tanggal = saat laporan dikirim ke grup
  if (items.length) hasil.push('terminate: ' + gmRingkas_(gmKunci(() => gmProses_(items, items.length === 1 ? isiFoto : ''))));
  hasil = hasil.filter(Boolean);
  ccHookLog_(m.grup, ringkas, hasil.length ? 'laporan grup -> ' + hasil.join(' | ') : 'grup: bukan format laporan, diabaikan');
}
// baca file .kmz / .kml (daftar ODP) dari URL lalu perbarui sheet ODP
function gmKmz_(url, nama) {
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return 'GAGAL unduh (HTTP ' + res.getResponseCode() + ')';
    let blob = res.getBlob(), xml = '';
    if (/\.kmz$/i.test(nama) || String(blob.getContentType()).indexOf('zip') >= 0 || blob.getBytes()[0] === 0x50) {
      const f = Utilities.unzip(blob.setContentType('application/zip')).filter(b => /\.kml$/i.test(b.getName()))[0];
      if (!f) return 'GAGAL: tidak ada .kml di dalam KMZ';
      xml = f.getDataAsString('UTF-8');
    } else xml = blob.getDataAsString('UTF-8');
    const rows = [];
    const jalan = (el, jalur) => {
      const kids = el.getChildren(); let nm = '';
      kids.forEach(k => { if (k.getName() === 'name') nm = k.getText().trim(); });
      if (el.getName() === 'Placemark') {
        let koor = ''; const cari = e => e.getChildren().forEach(c => { if (!koor && c.getName() === 'coordinates') { const p = c.getText().trim().split(/\s+/)[0].split(','); if (p.length >= 2) koor = p[1] + ',' + p[0]; } else cari(c); });
        cari(el); if (nm) rows.push({ odp: nm, olt: jalur.join(' / '), pop: jalur.join(' / '), koordinat: koor }); return;
      }
      const j = nm && el.getName() !== 'kml' ? jalur.concat(nm) : jalur;
      kids.forEach(k => { if (k.getName() !== 'name') jalan(k, j); });
    };
    jalan(XmlService.parse(xml).getRootElement(), []);
    if (!rows.length) return 'tidak ada titik ODP di file';
    const h = gmKunci(() => tmOdpSimpan_(rows, nama.slice(0, 60)));
    return rows.length + ' titik ODP dibaca: ' + h.tambah + ' baru, ' + h.ubah + ' diperbarui';
  } catch (e) { return 'GAGAL: ' + e.message; }
}
// "UPDATE ODP BARU ... OLT PERBAUNGAN1 / ODP-PRBGN-20985-206 ( Jl.Perbatasan 01B )" -> sheet ODP (supaya POP bisa dikenali lewat nama ODP)
function gmOdpTeks_(teks) {
  const olt = (/OLT\s+([A-Za-z ]+?)\s*\d*\s*$/im.exec(teks) || [])[1] || '', rows = [];
  const re = /(ODP[\s\-]+[A-Za-z]+[\s\-]+\d+[\s\-]+\d+)\s*(?:\(\s*([^)]*?)\s*\))?/gi; let m;
  while ((m = re.exec(teks))) rows.push({ kode: m[1].replace(/\s+/g, ''), odp: m[2] || '', olt: olt });
  if (!rows.length) return 'tidak ada ODP terbaca';
  const h = gmKunci(() => tmOdpSimpan_(rows.map(r => ({ odp: r.odp || r.kode, kode: r.kode, olt: r.olt })), 'UPDATE ODP GRUP'));
  return h.tambah + ' ODP baru, ' + h.ubah + ' diperbarui';
}
// Instalasi / MT: dibaca pembaca laporan teknisi (WaParser.gs) lalu diimpor dengan aturan anti-dobel yang sama dengan halaman Impor
function gmInstMt_(teks, tgl) {
  let ex; try { ex = WAParser.ekstrak(teks, { mode: 'campur', ragu: 'lewati', mtHanyaGanti: false }); } catch (e) { return 'pembaca gagal: ' + e.message; }
  const hariIni = tgl || tmIso_(new Date());
  const rows = ex.baris.filter(r => r.sheet === 'Instalasi' || r.sheet === 'MT').map(r => Object.assign({}, r, { tanggal: hariIni }));
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

/* ---------- simpan pesan grup mentah + "Ambil ulang yang terlewat" ---------- */
const GM_SH_MENTAH = 'GRUP MENTAH', GM_KOLOM = ['WAKTU', 'GRUP', 'PESAN', 'MEDIA', 'EXT', 'FILENAME'];
// dipanggil webhook untuk tiap pesan grup sumber; log webhook hanya menyimpan 200 huruf, jadi teks utuh disimpan di sini
function gmSimpan_(m) {
  const teks = String(m.pesan || '');
  if (teks.length < 40 && !m.filename) return;
  const sh = tmSheetEnsure_(GM_SH_MENTAH, GM_KOLOM);
  tmAppendObj_(sh, { WAKTU: new Date(), GRUP: m.grup, PESAN: teks.slice(0, 45000), MEDIA: m.media || '', EXT: m.ext || '', FILENAME: m.filename || '' });
  if (sh.getLastRow() > 400) sh.deleteRows(2, 150);
}
// proses ulang pesan grup yang tersimpan (hari terakhir); aman diulang karena data yang sudah ada dilewati sebagai dobel
function gmAmbilUlang_(d) {
  const hari = Math.min(14, Math.max(1, Number(d.hari) || 3)), batas = Date.now() - hari * 86400000, mulai = Date.now();
  const sh = tmSheetEnsure_(GM_SH_MENTAH, GM_KOLOM), rows = tmRead_(GM_SH_MENTAH).filter(r => r.WAKTU instanceof Date && r.WAKTU.getTime() >= batas);
  const hitung = () => [TM.SH.LOG, TM.SH.INSTALASI, TM.SH.MT].map(n => { const x = tmSheet_(n); return x ? x.getLastRow() : 0; });
  const awal = hitung(); let n = 0, lewat = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (Date.now() - mulai > 240000) { lewat = rows.length - i; break; }              // batas waktu Apps Script
    if (!gmSumber_(r.GRUP)) { continue; }
    try { gmTerima_({ grup: r.GRUP, pesan: r.PESAN, media: r.MEDIA, ext: r.EXT, filename: r.FILENAME, tanggal: tmIso_(r.WAKTU) }); n++; } catch (e) { Logger.log('ambil ulang: ' + e.message); }
  }
  const akhir = hitung();
  return { status: 'success', message: n + ' pesan grup (' + hari + ' hari terakhir) diperiksa ulang. Baris baru: Terminate/Kunjungan/Lanjut +' + (akhir[0] - awal[0]) + ', Instalasi +' + (akhir[1] - awal[1]) + ', MT +' + (akhir[2] - awal[2]) + '.' + (lewat ? ' ' + lewat + ' pesan belum sempat, tekan lagi.' : '') + (rows.length ? '' : ' Belum ada pesan grup tersimpan (mulai tersimpan setelah versi ini dipasang).') };
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


/* ---------- grup "PR TERMINATE YANG BELUM DIAMBIL" (tim instalasi: pin lokasi + foto + nama lama) ---------- */
// Tiap pengirim dilacak sendiri (kolom MEMBER) supaya data orang yang berbeda tidak tertukar. Lokasi -> ODP terdekat dari titik KMZ (sheet ODP),
// dicocokkan dengan data client di Instalasi/MT, lalu masuk Baris 1. Pertanyaan konfirmasi ODP dikirim lewat API WhatsApp khusus (fungsi "Grup PR").
const GM_SH_PR = 'PR GRUP', GM_PR_KOLOM = ['ID', 'WAKTU', 'GRUP', 'PENGIRIM', 'MEMBER', 'NAMA', 'CID', 'LAT', 'LNG', 'FOTO', 'KET', 'ODP_TERDEKAT', 'JARAK_M', 'ODP_DATA', 'STATUS'];
const GM_PR_MENIT = 60;
function gmKoordinat_(t) { const m = /(-?\d{1,3}\.\d{3,})\s*[, ]\s*(-?\d{1,3}\.\d{3,})/.exec(String(t || '')); return m ? { lat: +m[1], lng: +m[2] } : null; }
// lokasi dari tautan Google Maps yang ditempel di chat (tautan pendek diikuti dulu; gratis, tanpa Fonnte lokasi)
function gmKoordinatTautan_(t) {
  let u = (/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)\S*/i.exec(String(t || '')) || [])[0];
  for (let i = 0; u && i < 4; i++) {
    u = decodeURIComponent(u.replace(/[)\].,]+$/, '')).replace(/%2C/gi, ',');
    const d = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(u), k = d ? { lat: +d[1], lng: +d[2] } : gmKoordinat_(u);
    if (k) return k;
    try { const r = UrlFetchApp.fetch(u, { followRedirects: false, muteHttpExceptions: true }); const l = r.getHeaders().Location || r.getHeaders().location; if (!l) return null; u = l; } catch (e) { return null; }
  }
  return null;
}
function gmJarak_(a, b, c, d) { const R = 6371000, r = x => x * Math.PI / 180, x = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
function gmOdpTerdekat_(lat, lng) {
  let best = null;
  tmRead_('ODP').forEach(r => {
    const k = String(r.KOORDINAT || '').split(','); if (k.length < 2) return;
    const la = parseFloat(k[0]), lo = parseFloat(k[1]); if (isNaN(la) || isNaN(lo)) return;
    const j = gmJarak_(lat, lng, la, lo); if (!best || j < best.j) best = { odp: String(r.ODP || r.KODE || ''), pop: String(r.POP || ''), j: j };
  });
  return best;
}
// cari data client (CID dulu, lalu nama persis, lalu nama yang mengandung bila hanya satu)
function gmCariKlien_(nama, cid) {
  const c = tmCidDigit_(cid), n = tmNorm_(nama); let kandidat = [];
  [TM.SH.INSTALASI, TM.SH.MT, TM.SH.FULL, TM.SH.TARGET].forEach(sn => {
    let rows = []; try { rows = tmRead_(sn); } catch (e) { rows = []; }
    rows.forEach(r => { if (c && tmCidDigit_(r.CID) === c) kandidat.unshift(r); else if (!c && n && tmNorm_(r.NAMA) === n) kandidat.push(r); });
  });
  if (!kandidat.length && !c && n.length >= 5) {
    const mir = []; [TM.SH.INSTALASI, TM.SH.MT].forEach(sn => { let rows = []; try { rows = tmRead_(sn); } catch (e) { rows = []; } rows.forEach(r => { if (tmNorm_(r.NAMA).indexOf(n) >= 0) mir.push(r); }); });
    const unik = {}; mir.forEach(r => { unik[tmCidDigit_(r.CID)] = r; }); if (Object.keys(unik).length === 1) kandidat = [mir[0]];
  }
  const r = kandidat[0]; if (!r) return null;
  const lengkap = kandidat.filter(x => String(x.SN || '').trim())[0] || r;
  return { nama: String(r.NAMA || '').trim(), cid: tmCidDigit_(r.CID), sn: String(lengkap.SN || '').trim(), psn: String(lengkap.PSN || '').trim(), odp: tmOdpAkhir_(String(r.ODP || '')), pop: tmPopKode_(r.POP) };
}
// chat pribadi dari nomor anggota tim yang didaftarkan di Sumber Grup dengan tugas PR diperlakukan sama seperti grup PR
function gmPrPribadi_(hp) { return !!hp && gmSumber_(hp) && gmTugas_(hp) === 'PR'; }
function gmPrKonfirmasi_(tanya, teks, siapa) {
  const ya = /^(ya|iya|y|ok|oke|benar|betul|sesuai)\b/i.test(teks), odpFinal = ya ? tanya.ODP_TERDEKAT : tmOdpAkhir_(teks);
  tmUpdateRows_(GM_SH_PR, r => r.ID === tanya.ID, { STATUS: 'KONFIRMASI', ODP_DATA: odpFinal });
  tmUpdateRows_(TM.SH.B1, r => tmNorm_(r.NAMA) === tmNorm_(tanya.NAMA) && tmNorm_(r.NAMATS) === tmNorm_(tanya.PENGIRIM), { ODP: odpFinal, KET: 'ODP dikonfirmasi ' + siapa + ': ' + odpFinal });
  return 'ODP dikonfirmasi ' + siapa + ' -> ' + odpFinal;
}
// pertanyaan konfirmasi ODP. Mode (Admin > Sumber Grup): PENGIRIM = chat pribadi pengirim (bawaan), GRUP, ADMIN = chat pribadi admin,
// PENGIRIM_ADMIN, KEDUANYA = grup + admin, MATI = bot tidak bertanya (data tetap dicatat)
function gmPrKirim_(tujuan, teks, member) {
  const mode = ccProp_('PR_TANYA') || 'PENGIRIM';
  if (mode === 'MATI') return 'bot pertanyaan dinonaktifkan admin, tidak bertanya';
  const e = ccApiPilih_('PR_GRUP', 'WA');
  if (!e) return 'API khusus "Grup PR" belum diatur (Profil > Pengaturan API, centang fungsi "Grup PR"), pertanyaan tidak terkirim';
  const hp = ccNoHp_(ccProp_('PR_ADMIN_HP')), pribadi = ccNoHp_(member) || '', target = [];
  if (mode === 'PENGIRIM' || mode === 'PENGIRIM_ADMIN') target.push(pribadi || tujuan);
  if (mode === 'GRUP' || mode === 'KEDUANYA') target.push(tujuan);
  if ((mode === 'ADMIN' || mode === 'PENGIRIM_ADMIN' || mode === 'KEDUANYA') && hp) target.push(hp);
  if (!target.length) target.push(tujuan);
  return target.filter((t, k, a) => a.indexOf(t) === k).map(t => { const r = ccWaKirimE_(e, t, teks); return (t === hp ? 'ke admin: ' : /@g\.us$/.test(t) ? 'ke grup: ' : 'ke pribadi pengirim: ') + (r.ok ? 'terkirim' : 'gagal ' + r.msg); }).join('; ');
}
// balasan lewat chat pribadi: dari admin (pertanyaan terbaru) atau dari pengirim data itu sendiri (pertanyaannya sendiri)
function gmPrAdmin_(hp, teks) {
  const adm = ccNoHp_(ccProp_('PR_ADMIN_HP')); teks = String(teks || '').trim();
  if (!hp || !teks || teks.length > 80 || /^🤖/.test(teks) || ccProp_('PR_TANYA') === 'MATI') return false;
  const batas = Date.now() - 24 * 3600000, rows = tmRead_(GM_SH_PR).filter(x => x.STATUS === 'TANYA' && x.WAKTU instanceof Date && x.WAKTU.getTime() >= batas);
  const r = (hp === adm ? rows : rows.filter(x => ccNoHp_(x.MEMBER) === hp)).pop();
  if (!r) return false;
  const h = gmKunci(() => gmPrKonfirmasi_(r, teks, hp === adm ? 'admin' : r.PENGIRIM));
  ccHookLog_(hp, teks, 'grup PR -> ' + h); return true;
}
// pengaturan tujuan pertanyaan (halaman Sumber Grup)
function gmPrAtur_(d) {
  const p = PropertiesService.getScriptProperties();
  if (d.mode !== undefined) {
    const mode = ['PENGIRIM', 'GRUP', 'ADMIN', 'PENGIRIM_ADMIN', 'KEDUANYA', 'MATI'].indexOf(d.mode) >= 0 ? d.mode : 'PENGIRIM', hp = d.hp ? ccNoHp_(d.hp) : '';
    if (d.hp && !hp) return tmErr_('Nomor HP admin tidak valid (pakai 08xx / 628xx).');
    if (['ADMIN', 'PENGIRIM_ADMIN', 'KEDUANYA'].indexOf(mode) >= 0 && !hp) return tmErr_('Isi nomor HP Anda untuk pertanyaan lewat chat pribadi admin.');
    p.setProperty('PR_TANYA', mode); p.setProperty('PR_ADMIN_HP', hp);
  }
  return { status: 'success', mode: ccProp_('PR_TANYA') || 'PENGIRIM', hp: ccProp_('PR_ADMIN_HP'), message: 'Pengaturan pertanyaan Grup PR disimpan.' };
}
function gmPrTerima_(m) {
  const teks = String(m.pesan || '').replace(/[\u200e\u200f]/g, '').trim();
  if (/^🤖/.test(teks)) { ccHookLog_(m.grup, teks.slice(0, 80), 'grup PR: gema pesan bot, diabaikan'); return; }
  const member = String(m.member || m.nama || '?'), pengirim = String(m.nama || m.member || '?');
  const lok = gmKoordinat_(m.lokasi) || gmKoordinat_(teks) || gmKoordinatTautan_(teks);
  const foto = m.media && /^(jpe?g|png|webp)$/i.test(m.ext || 'jpg') ? m.media : '';
  const nm = /nama\s*lama\s*[:\-]?\s*(.+)/i.exec(teks) || /^(?:a\/n|an|nama)\s*[:\-]\s*(.+)/im.exec(teks);
  const cidM = /\b(\d{12})\b/.exec(teks);
  if (!lok && !foto && !nm && !cidM && (teks.length < 2 || /^non-text message$/i.test(teks))) { ccHookLog_(m.grup, teks, 'grup PR: tanpa isi yang bisa dibaca (lokasi=' + (m.lokasi || 'kosong') + ', url=' + (m.media ? 'ada' : 'kosong') + ', tipe=' + (m.ext || '-') + ') - Fonnte tidak mengirim isi pin/foto?'); return; }
  const fotoDrive = foto ? gmFoto_(foto) : '';
  let hasil = '';
  gmKunci(() => {
    tmSheetEnsure_(GM_SH_PR, GM_PR_KOLOM);
    const batas = Date.now() - GM_PR_MENIT * 60000;
    const milik = tmRead_(GM_SH_PR).filter(r => r.GRUP === m.grup && String(r.MEMBER) === member && r.WAKTU instanceof Date && r.WAKTU.getTime() >= batas);
    const tanya = milik.filter(r => r.STATUS === 'TANYA').pop(), baru = milik.filter(r => r.STATUS === 'BARU').pop();
    const jawab = tanya && !lok && !foto && !nm && !cidM && teks.length > 0 && teks.length <= 80;
    if (jawab) {                                                    // balasan atas pertanyaan konfirmasi ODP dari orang yang sama
      hasil = gmPrKonfirmasi_(tanya, teks, pengirim); return;
    }
    let row = baru || (milik.length && !lok && !nm && !cidM ? milik[milik.length - 1] : null);       // foto susulan: ke data terakhir orang yang sama
    if (!row) {
      row = { ID: Utilities.getUuid().substring(0, 8).toUpperCase(), WAKTU: new Date(), GRUP: m.grup, PENGIRIM: pengirim, MEMBER: member, NAMA: '', CID: '', LAT: '', LNG: '', FOTO: '', KET: '', ODP_TERDEKAT: '', JARAK_M: '', ODP_DATA: '', STATUS: 'BARU' };
      tmAppendObj_(tmSheetEnsure_(GM_SH_PR, GM_PR_KOLOM), row);
    }
    const isi = {};
    if (lok && !row.LAT) { isi.LAT = lok.lat; isi.LNG = lok.lng; }
    if (nm && !row.NAMA) isi.NAMA = nm[1].trim().replace(/\s+/g, ' ');
    if (cidM && !row.CID) isi.CID = cidM[1];
    if (fotoDrive && !row.FOTO) isi.FOTO = fotoDrive;
    if (!lok && !nm && !cidM && !foto && teks && !/^non-text/i.test(teks)) isi.KET = (String(row.KET || '') + ' ' + teks).trim().slice(0, 300);
    Object.assign(row, isi);
    if (Object.keys(isi).length) tmUpdateRows_(GM_SH_PR, r => r.ID === row.ID, isi);
    if (fotoDrive && row.STATUS !== 'BARU') tmUpdateRows_(TM.SH.B1, r => tmNorm_(r.NAMA) === tmNorm_(row.NAMA) && tmNorm_(r.NAMATS) === tmNorm_(row.PENGIRIM), { FOTORUMAH: fotoDrive });
    if (row.STATUS === 'BARU' && row.LAT !== '' && (row.NAMA || row.CID)) {                       // lengkap: cari ODP, masuk Baris 1, tanya konfirmasi
      const lat = Number(row.LAT), lng = Number(row.LNG), t = gmOdpTerdekat_(lat, lng), k = gmCariKlien_(row.NAMA, row.CID);
      const namaF = (k && k.nama) || row.NAMA, cid = (k && k.cid) || tmCidDigit_(row.CID);
      const odp = t ? t.odp : (k ? k.odp : ''), jarak = t ? Math.round(t.j) : '';
      const catatan = 'Dari ' + row.PENGIRIM + (t ? ' | ODP terdekat KMZ: ' + t.odp + ' (' + jarak + ' m)' + (t.j > 300 ? ' JAUH, cek manual' : '') : '') + (k && k.odp ? ' | ODP di data: ' + k.odp + (t && tmNorm_(k.odp) !== tmNorm_(t.odp) ? ' (BEDA)' : ' (cocok)') : '') + (k ? '' : ' | client tidak ditemukan di data');
      let sudah = false; try { sudah = !!cid && tmBacaCid_(TM.SH.B1).list.some(x => x.cid === cid); } catch (e) { sudah = false; }
      if (!sudah) tmAppendObj_(tmSheetEnsure_(TM.SH.B1, ['NAMA', 'CID', 'ODP', 'POP']), { NAMA: namaF, CID: cid, ODP: odp, POP: tmPopKode_(t && t.pop) || (k && k.pop) || gmPopDariOdp_(odp) || '', SN: k ? k.sn : '', PSN: k ? k.psn : '', KOORDINAT: lat + ',' + lng, LINKMAPS: 'https://maps.google.com/?q=' + lat + ',' + lng, KET: catatan, FOTORUMAH: row.FOTO || '', NAMATS: row.PENGIRIM });
      tmUpdateRows_(GM_SH_PR, r => r.ID === row.ID, { STATUS: 'TANYA', ODP_TERDEKAT: odp, JARAK_M: jarak, ODP_DATA: k ? k.odp : '', NAMA: namaF, CID: cid });
      const kirim = gmPrKirim_(m.grup, '🤖 Halo ' + row.PENGIRIM + ' data *' + namaF + '* masuk daftar pengambilan.\nODP terdekat dari lokasi: *' + (odp || 'tidak ketemu') + '*' + (jarak !== '' ? ' (' + jarak + ' m)' : '') + (k && k.odp && t && tmNorm_(k.odp) !== tmNorm_(t.odp) ? '\nODP di data client: ' + k.odp : '') + '\nBenar? Balas *ya*, atau tulis ODP yang benar.', row.MEMBER);
      hasil = 'masuk Baris 1: ' + namaF + ' / ODP ' + (odp || '-') + ' (' + catatan + '); ' + kirim;
    } else hasil = 'dicatat dari ' + pengirim + ' (' + [row.LAT !== '' ? 'lokasi' : '', row.NAMA || row.CID ? 'nama/CID' : '', row.FOTO ? 'foto' : ''].filter(Boolean).join(', ') + '), menunggu pasangan datanya';
  });
  ccHookLog_(m.grup, teks.slice(0, 80) || (lok ? '[lokasi]' : foto ? '[foto]' : ''), 'grup PR -> ' + hasil);
}

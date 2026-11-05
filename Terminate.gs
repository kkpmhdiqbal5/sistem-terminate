/*****************************************************************
 * MODUL SISTEM TERMINATE (Apps Script)
 * Tempel sebagai file baru "Terminate.gs" di project Apps Script yang sama.
 * Di doPost lama, tepat setelah data di-parse, tambahkan SATU baris:
 *
 *    const t = terminateRoute_(data); if (t) return t;
 *
 * ("data" = hasil JSON.parse(e.postData.contents)). Setelah itu:
 *   1) jalankan izinkan()            -> beri izin Drive/Sheets (sekali)
 *   2) jalankan pasangTriggerHarian() -> jadwal harian (sekali)
 *   3) Deploy > Manage deployments > Edit > New version
 *****************************************************************/

const TM = {
  SS_ID: '1maoJBATshhb7S8ZPF_8rKOigefztynVnt1mjTWfPxvI',   // ID Google Sheet "data terminate" (script Anda berdiri sendiri, bukan terpasang di sheet)
  TZ: 'Asia/Jakarta',
  SESSION_MS: 12 * 60 * 60 * 1000,   // sesi login 12 jam
  SH: {
    LOG: 'LOG TERMINATE',        // arsip permanen semua input (sumber data halaman)
    TERMINATE: 'Terminate', KUNJUNGAN: 'kunjungan', LANJUT: 'lanjut berlanganan',
    KUNJUNGAN: 'kunjungan', TARGET: 'target', DIAMBIL: 'sudah diambil', B1: 'Baris 1', B2: 'Baris 2', USERS: 'USERS',
    FULL: 'Full Data', INSTALASI: 'Instalasi', MT: 'MT'
  },
  POPS: ['PERBAUNGAN', 'PANTAI CERMIN'],
  FOLDER_FOTO: 'Foto Terminate',
  JAM_HAPUS: 48,                 // baris kerja (Terminate/kunjungan/lanjut) dihapus setelah 48 jam
  JAM_TRIGGER: 23,               // jam jalan harian
  SUMBER: 'TIM_TERMINATE',
  KET: {
    TERMINATE: 'Perangkat sudah diambil dan port sudah dicabut. Sudah kembali ke gudang Perbaungan.',
    KUNJUNGAN: 'Client tidak ada dirumah',
    LANJUT: 'Client masih mau lanjut berlangganan'
  }
};

const TM_LABEL = {
  ID: 'ID', WAKTU: 'WAKTU', TANGGAL: 'TANGGAL', ADMIN: 'ADMIN', TIM: 'TIM', JENIS: 'JENIS', NAMA: 'NAMA', CID: 'CID',
  ODP: 'ODP', POP: 'POP', SN: 'SN', PSN: 'P-SN', KET: 'KET', VERIF: 'VERIF', STATUS: 'STATUS', FOTO: 'FOTO',
  SUMBER: 'SUMBER', ARSIP: 'ARSIP', DIEDITOLEH: 'DIEDIT OLEH', DIEDITWAKTU: 'DIEDIT WAKTU',
  PHONE: 'PHONE', WAKTUKIRIM: 'WAKTU KIRIM', WAKTUBALAS: 'WAKTU BALAS', PESANTERAKHIR: 'PESAN TERAKHIR', FOTORUMAH: 'FOTO RUMAH', ARAH: 'ARAH', ISI: 'ISI', DIKIRIMOLEH: 'DIKIRIM OLEH',
  SHERLOCK: 'SHERLOCK', FOTOBUKTI: 'FOTO BUKTI', JMLINGAT: 'JML INGAT', WAKTUINGAT: 'WAKTU INGAT', VERIFSTOP: 'VERIF STOP', VERIFAMBIL: 'VERIF AMBIL'
};
const TM_LOG_KEYS = ['ID', 'WAKTU', 'TANGGAL', 'ADMIN', 'TIM', 'JENIS', 'NAMA', 'CID', 'ODP', 'POP', 'SN', 'PSN', 'KET', 'VERIF', 'FOTO', 'DIEDITOLEH', 'DIEDITWAKTU', 'ARSIP'];
// Judul kolom lain yang dianggap sama (setelah huruf besar & tanda baca dibuang)
const TM_ALIAS = {
  AN: 'NAMA', NAMAPELANGGAN: 'NAMA', NAMALAMA: 'NAMA', NOMORPELANGGAN: 'CID', CIDLAMA: 'CID', NAMATIANG: 'ODP', AREA: 'POP',
  SERIALNUMBER: 'SN', SNUNIT: 'SN', KETERANGAN: 'KET', TIMESTAMP: 'WAKTU', TIME: 'WAKTU',
  TANGGALKUNJUNNGAN: 'TANGGAL', TANGGALKUNJUNGAN: 'TANGGAL', DIAMBILOLEH: 'ADMIN', FOTOALAT: 'FOTO', SHERLOK: 'SHERLOCK'
};
const TM_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const TM_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/* ===================== ROUTER ===================== */
function terminateRoute_(d) {
  if (!d || String(d.action || '').indexOf('terminate') !== 0) return null;
  try {
    if (d.action === 'terminateLogin') return tmJson_(tmLogin_(d));
    if (['terminateAiIsi', 'terminateAiFoto', 'terminateAiMassal', 'terminateAiImpor', 'terminateAiAktif'].indexOf(d.action) >= 0) {          // AI Lapangan/Massal/Impor/Aktif: akun yang login (izin dicek di ChatClient.gs)
      const tk = tmCheckToken_(d.token), ak = tk && tmAkun_(tk.user);
      if (!ak || typeof chatRoute_ !== 'function') return tmJson_({ status: 'error', code: 'SESSION', message: 'Sesi berakhir. Silakan login ulang.' });
      return tmJson_(chatRoute_(d, { user: tk.user, role: ak.role, izin: ak.izin }));
    }
    const au = tmAuth_(d);
    if (!au) return tmJson_({ status: 'error', code: 'SESSION', message: 'Sesi berakhir. Silakan login ulang.' });
    // Otoritas per halaman: tiap aksi hanya boleh dipakai bila akun punya izin halaman terkait
    const BUTUH = { terminateLookup: 'TINPUT', terminateCek: 'TINPUT', terminateSimpan: 'TINPUT', terminateList: 'TDIAMBIL', terminateEditList: 'TEDIT',
                    terminateEditSimpan: 'TEDIT', terminateEditLengkap: 'TDIAMBIL', terminateHapus: 'TDIAMBIL', terminateRekap: 'TLAPORAN', terminateFotoSimpan: 'TLAPORAN', terminateFull: 'TDATA', terminateImporWA: 'TIMPOR', terminateSnCid: 'TIMPOR', terminateBersih1: 'TIMPOR', terminateBersih2: 'TIMPOR',
                    terminateChatKonfig: 'TCHAT', terminateMenunggu: 'TCHAT', terminateKirimTeknisi: 'TCHAT', terminateChatKirim: 'TCHAT', terminateChatLapor: 'TCHAT', terminateChatAmbil: 'TCHAT', terminateChatStatus: 'TCHAT', terminateKirimLaporan: 'TCHAT', terminateKirimTeks: 'TCHAT', terminateApiBaca: 'TAPI', terminateApiHapus: 'TAPI', terminateChatTandai: 'TCHAT', terminateChatUbah: 'TCHAT', terminateChatIngatkan: 'TCHAT', terminateChatDiag: 'TCHAT', terminateChatSegarkan: 'TCHAT', terminateChatBalas: 'TCHAT', terminateChatBukti: 'TCHAT', terminateTujuanBaca: 'TCHAT', terminateTujuanFonnte: 'TCHAT', terminateTujuanSumber: 'TCHAT', terminateGrupUji: 'TIMPOR', terminateTujuanSimpan: 'TCHAT', terminateTujuanHapus: 'TCHAT', terminateVerifInfo: 'TCHAT', terminateVerifBerhenti: 'TCHAT', terminateVerifAmbil: 'TCHAT', terminateAiBaca: 'TCHAT', terminateAiSimpan: 'TCHAT', terminateApiSimpan: 'TAPI', terminateApiTes: 'TAPI' };
    if (d.action === 'terminateMe') return tmJson_({ status: 'success', user: au.user, role: au.role, izin: au.izin });
    if (d.action === 'terminateGantiPassword') return tmJson_(tmGantiPassword_(d, au));
    const perlu = BUTUH[d.action];
    const punya = d.action === 'terminateCek' ? (au.izin.TINPUT || au.izin.TEDIT) : (d.action === 'terminateEditLengkap' || d.action === 'terminateHapus') ? (au.izin.TDIAMBIL || au.izin.TEDIT) : (perlu ? au.izin[perlu] : TM_IZIN.some(k => au.izin[k]));
    if (!punya) return tmJson_({ status: 'error', code: 'IZIN', message: 'Akun Anda tidak punya izin untuk halaman/fitur ini.' });
    switch (d.action) {
      case 'terminateOptions': return tmJson_(tmOptions_(au));
      case 'terminateLookup': return tmJson_(tmLookupApi_(d));
      case 'terminateCek': return tmJson_(tmCari_(d));
      case 'terminateSimpan': return tmJson_(tmSimpan_(d, au));
      case 'terminateList': return tmJson_(tmListHariIni_(au, d));
      case 'terminateRekap': return tmJson_(tmRekap_(d, au));
      case 'terminateEditList': return tmJson_(tmEditList_(au, d));
      case 'terminateEditSimpan': return tmJson_(tmEditSimpan_(d, au));
      case 'terminateEditLengkap': return tmJson_(tmEditLengkap_(d, au));
      case 'terminateHapus': return tmJson_(tmHapus_(d, au));
      case 'terminateFotoSimpan': return tmJson_(tmFotoSimpan_(d, au));
      case 'terminateFull': return tmJson_(tmFull_(d));
      case 'terminateImporWA': return tmJson_(tmImporWA_(d, au));
      case 'terminateSnCid': return tmJson_(tmSnCid_(d));
      case 'terminateBersih1': return tmJson_(tmBersih_(d, au, 1));
      case 'terminateBersih2': return tmJson_(tmBersih_(d, au, 2));
    }
    if (typeof chatRoute_ === 'function') { const c = chatRoute_(d, au); if (c) return tmJson_(c); }
    return tmJson_({ status: 'error', message: typeof chatRoute_ === 'function' ? 'ChatClient.gs yang terpasang versi lama (tidak mengenal aksi ini). Tempel ulang ChatClient.gs terbaru lalu Deploy > New version.' : 'File ChatClient.gs belum dipasang di Apps Script. Tambahkan sebagai file baru lalu Deploy > New version.' });
  } catch (err) {
    return tmJson_({ status: 'error', message: 'Gagal: ' + err.message });
  }
}

/* ===================== HELPER UMUM ===================== */
function tmJson_(o) { o.tm = 1; return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function tmSS_() { return TM.SS_ID ? SpreadsheetApp.openById(TM.SS_ID) : SpreadsheetApp.getActiveSpreadsheet(); }
function tmNorm_(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function tmCanon_(h) { const n = tmNorm_(h); return TM_ALIAS[n] || n; }
function tmIso_(v) { return v instanceof Date ? Utilities.formatDate(v, TM.TZ, 'yyyy-MM-dd') : String(v || '').trim(); }
function tmWaktuTxt_(v) { return v instanceof Date ? Utilities.formatDate(v, TM.TZ, 'dd/MM/yyyy HH:mm') : ''; }
function tmDateParts_(iso) { const p = String(iso).split('-').map(Number); return { y: p[0], m: p[1], d: p[2], w: new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay() }; }
function tmTglIndo_(iso) { const t = tmDateParts_(iso); return TM_HARI[t.w] + ', ' + t.d + ' ' + TM_BULAN[t.m - 1] + ' ' + t.y; }
function tmTglUpper_(iso) { return tmTglIndo_(iso).toUpperCase(); }
function tmSame_(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }
function tmCleanCode_(s) { return String(s || '').toUpperCase().replace(/\s+/g, ''); }
function tmPop_(v) {
  const n = tmNorm_(v);
  if (n.indexOf('PERBAUNGAN') >= 0 || n.indexOf('PRBGN') >= 0) return 'PERBAUNGAN';
  if (n.indexOf('PANTAICERMIN') >= 0 || n.indexOf('PTCRMN') >= 0) return 'PANTAI CERMIN';
  return '';
}
function tmErr_(m) { return { status: 'error', message: m }; }

function tmSheet_(name) { return tmSS_().getSheetByName(name); }
function tmSheetEnsure_(name, keys) {
  let sh = tmSheet_(name);
  if (!sh) {
    sh = tmSS_().insertSheet(name);
    sh.appendRow(keys.map(k => TM_LABEL[k] || k));
    sh.setFrozenRows(1);
  }
  return sh;
}
function tmHeaders_(sh) { return sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0]; }
// Kolom (1-based) berdasarkan judul; ditambah di kanan bila belum ada
function tmColByLabel_(sh, label) {
  const h = tmHeaders_(sh).map(tmNorm_);
  const i = h.indexOf(tmNorm_(label));
  if (i >= 0) return i + 1;
  const c = sh.getLastColumn() + 1;
  sh.getRange(1, c).setValue(label);
  return c;
}
function tmEnsureCols_(sh, keys) {
  if (sh.getLastRow() === 0) { sh.appendRow(keys.map(k => TM_LABEL[k] || k)); return; }
  const canon = tmHeaders_(sh).map(tmCanon_);
  keys.forEach(k => {
    if (canon.indexOf(k) < 0) {
      const c = sh.getLastColumn() + 1;
      sh.getRange(1, c).setValue(TM_LABEL[k] || k);
      canon.push(k);
    }
  });
}
function tmCell_(k, v) {
  if (v === undefined || v === null) return '';
  if ((k === 'CID' || k === 'SN' || k === 'PSN' || k === 'PHONE') && String(v) !== '') return "'" + String(v);   // simpan sebagai teks
  return v;
}
// Nilai sel sama dengan nilai yang akan ditulis? (supaya sel yang tidak berubah tidak ditulis ulang)
function tmSamaCell_(cv, nv) {
  if (cv instanceof Date && nv instanceof Date) return cv.getTime() === nv.getTime();
  if (typeof nv === 'string' && nv.charAt(0) === "'") nv = nv.slice(1);
  return String(cv == null ? '' : cv) === String(nv == null ? '' : nv);
}
// Satu CID satu baris: kalau CID sudah ada di sheet, HANYA sel yang berubah diperbarui (baris tidak dihapus/ditulis ulang); kalau belum ada, baris baru ditambahkan.
// opts.keepId: jangan ganti ID baris yang sudah punya ID. Baris dobel dengan CID sama dihapus.
function tmUpsertCid_(nama, keys, rec, opts) {
  opts = opts || {};
  const sh = tmSheetEnsure_(nama, keys);
  const c = tmNorm_(rec.CID);
  if (!c) { tmAppendObj_(sh, rec); return { baru: true, ubah: 0 }; }
  tmEnsureCols_(sh, Object.keys(rec).filter(k => rec[k] !== undefined));
  const v = sh.getLastRow() > 1 ? sh.getDataRange().getValues() : [];
  const canon = v.length ? v[0].map(tmCanon_) : [], iC = canon.indexOf('CID');
  const cocok = []; if (iC >= 0) for (let r = 1; r < v.length; r++) if (tmNorm_(v[r][iC]) === c) cocok.push(r);
  if (!cocok.length) { tmAppendObj_(sh, rec); return { baru: true, ubah: 0 }; }
  const r0 = cocok[0], iID = canon.indexOf('ID'); let ubah = 0;
  Object.keys(rec).forEach(k => {
    if (rec[k] === undefined) return;
    if (k === 'ID' && opts.keepId && iID >= 0 && String(v[r0][iID] || '')) return;
    const i = canon.indexOf(k); if (i < 0) return;
    const nv = tmCell_(k, rec[k]);
    if (tmSamaCell_(v[r0][i], nv)) return;
    sh.getRange(r0 + 1, i + 1).setValue(nv); ubah++;
  });
  for (let j = cocok.length - 1; j >= 1; j--) sh.deleteRow(cocok[j] + 1);
  return { baru: false, ubah: ubah };
}
function tmAppendObj_(sh, obj) {
  const keys = Object.keys(obj).filter(k => obj[k] !== undefined);
  tmEnsureCols_(sh, keys);
  const canon = tmHeaders_(sh).map(tmCanon_);
  const row = canon.map(c => (obj[c] === undefined ? '' : tmCell_(c, obj[c])));
  sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}
// Baca sheet menjadi array objek berkunci baku (+ _row)
function tmRead_(name) {
  const sh = tmSheet_(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getDataRange().getValues();
  const canon = v[0].map(tmCanon_);
  const out = [];
  for (let r = 1; r < v.length; r++) {
    const o = { _row: r + 1 };
    canon.forEach((c, i) => { if (c && o[c] === undefined) o[c] = v[r][i]; });
    out.push(o);
  }
  return out;
}
function tmUpdateRows_(name, pred, obj) {
  const sh = tmSheet_(name);
  if (!sh || sh.getLastRow() < 2) return 0;
  const v = sh.getDataRange().getValues();
  const canon = v[0].map(tmCanon_);
  let n = 0;
  for (let r = 1; r < v.length; r++) {
    const o = {};
    canon.forEach((c, i) => { if (c && o[c] === undefined) o[c] = v[r][i]; });
    if (!pred(o)) continue;
    Object.keys(obj).forEach(k => { const i = canon.indexOf(k); if (i < 0) return; const nv = tmCell_(k, obj[k]); if (!tmSamaCell_(v[r][i], nv)) sh.getRange(r + 1, i + 1).setValue(nv); });
    n++;
  }
  return n;
}
// Folder foto di Drive: induk "foto" (ID di bawah) berisi subfolder "foto prangkat", "foto bukti", "foto rumah". Induk tak terjangkau -> folder lama.
const TM_FOLDER_FOTO_ID = '1FP8Re2kJOzdjRmyGpry4s2BJPJreseYk';
function tmSubFoto_(prefix) {
  const p = String(prefix || '').toUpperCase();
  return /^TERMINATE_|^GRUP_/.test(p) ? 'foto prangkat' : /^(BUKTI|LANJUT)_/.test(p) ? 'foto bukti' : 'foto rumah';
}
function tmFolderFoto_(sub) {
  try {
    const induk = DriveApp.getFolderById(TM_FOLDER_FOTO_ID), it = induk.getFoldersByName(sub);
    return it.hasNext() ? it.next() : induk.createFolder(sub);
  } catch (e) {
    Logger.log('folder foto induk gagal (' + sub + '): ' + e.message);
    const it2 = DriveApp.getFoldersByName(TM.FOLDER_FOTO);
    return it2.hasNext() ? it2.next() : DriveApp.createFolder(TM.FOLDER_FOTO);
  }
}
// Foto -> Drive (utama). Jika izin Drive belum diberikan, otomatis dicoba lewat imgbb (uploadToImgbb di Kode.gs).
// Keduanya gagal -> error jelas supaya data TIDAK tersimpan tanpa foto (foto wajib).
function tmSimpanFoto_(dataUrl, prefix) {
  if (!dataUrl) return '';
  const koma = String(dataUrl).indexOf(',');
  if (koma < 0) return '';
  const mime = dataUrl.substring(5, dataUrl.indexOf(';')) || 'image/jpeg';
  const nama = prefix.replace(/[^A-Za-z0-9_-]/g, '') + '_' + Utilities.formatDate(new Date(), TM.TZ, 'yyyyMMdd_HHmmss') + '.jpg';
  let errDrive = '';
  try {
    const blob = Utilities.newBlob(Utilities.base64Decode(dataUrl.substring(koma + 1)), mime, nama);
    const folder = tmFolderFoto_(tmSubFoto_(prefix));
    const f = folder.createFile(blob);
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return f.getUrl();
  } catch (e) { errDrive = String(e.message || e); Logger.log('Drive gagal: ' + errDrive); }
  if (typeof uploadToImgbb === 'function') {
    const u = uploadToImgbb(dataUrl);
    if (u && u !== '-') return u;
  }
  throw new Error('Foto gagal disimpan (Drive: ' + errDrive.slice(0, 120) + '). Admin: jalankan fungsi izinkan di Apps Script lalu Deploy > New version.');
}

/* ===================== LOGIN & SESI (12 JAM) ===================== */
function tmSecret_() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty('TM_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('TM_SECRET', s); }
  return s;
}
function tmSign_(payload) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, tmSecret_())); }
function tmMakeToken_(user, role, exp) {
  const p = Utilities.base64EncodeWebSafe(JSON.stringify({ u: user, r: role, e: exp }));
  return p + '.' + tmSign_(p);
}
function tmCheckToken_(t) {
  if (!t || String(t).indexOf('.') < 0) return null;
  const parts = String(t).split('.');
  if (parts.length !== 2 || tmSign_(parts[0]) !== parts[1]) return null;
  let o;
  try { o = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString()); } catch (e) { return null; }
  if (!o || !o.e || o.e < Date.now()) return null;
  return { user: o.u, role: o.r };
}
// Peran dari sheet USERS, kolom "Akses Terminate": ADMIN atau SUB ADMIN
function tmUsersRows_() {
  const sh = tmSheet_(TM.SH.USERS);
  if (!sh || sh.getLastRow() < 2) return { rows: [], iU: -1, iP: -1, iR: -1 };
  const v = sh.getDataRange().getValues();
  const h = v[0].map(tmNorm_);
  const iU = h.indexOf('USERNAME'), iP = h.indexOf('PASSWORD');   // Kode.gs memakai kolom A (user) dan B (password)
  return { h: h, rows: v.slice(1), iU: iU >= 0 ? iU : 0, iP: iP >= 0 ? iP : 1, iR: h.indexOf('AKSESTERMINATE') };
}
function tmRoleNorm_(v) { const n = tmNorm_(v); return n === 'ADMIN' ? 'ADMIN' : (n === 'SUBADMIN' ? 'SUBADMIN' : ''); }
// ===== OTORITAS SATU PINTU: semua halaman (lama & Terminate) diatur dari sheet USERS =====
// Kolom lama (centang TRUE/FALSE): Akses Dashboard, Akses Form Input, Akses Data Admin, Akses Manajemen Akun
// Kolom Terminate: "Akses Terminate" = ADMIN / SUB ADMIN (kosong = tanpa akses Terminate) dan per halaman
//   Akses Terminate Input / Diambil / Edit / Laporan / Data  (TRUE/FALSE; kosong = bawaan sesuai peran)
const TM_IZIN = ['TINPUT', 'TDIAMBIL', 'TEDIT', 'TLAPORAN', 'TDATA', 'TIMPOR', 'TCHAT'];
const TM_HDR = { TINPUT: 'AKSESTERMINATEINPUT', TDIAMBIL: 'AKSESTERMINATEDIAMBIL', TEDIT: 'AKSESTERMINATEEDIT',
                 TLAPORAN: 'AKSESTERMINATELAPORAN', TDATA: 'AKSESTERMINATEDATA', TIMPOR: 'AKSESTERMINATEIMPOR', TCHAT: 'AKSESTERMINATECHAT' };
const TM_HDR_LAMA = { DASHBOARD: 'AKSESDASHBOARD', FORMINPUT: 'AKSESFORMINPUT', DATAADMIN: 'AKSESDATAADMIN', MANAJEMENAKUN: 'AKSESMANAJEMENAKUN' };
function tmFlag_(v, def) {
  const t = String(v == null ? '' : v).trim().toUpperCase();
  if (['TRUE', 'YA', 'Y', '1', 'BENAR'].indexOf(t) >= 0) return true;
  if (['FALSE', 'TIDAK', 'T', 'N', '0', 'SALAH'].indexOf(t) >= 0) return false;
  return def;
}
// ADMIN TERTINGGI (satu-satunya yang boleh membuka Pengaturan API / mengisi token WA, Telegram, AI):
//  - bila kolom "Akses Pengaturan API" ada dan ada admin bertanda TRUE -> admin-admin itu
//  - selain itu -> admin PERTAMA (paling atas) di sheet USERS
function tmSuperAdmin_(h, rows) {
  const iU = h.indexOf('USERNAME') >= 0 ? h.indexOf('USERNAME') : 0, iR = h.indexOf('AKSESTERMINATE'), iA = h.indexOf('AKSESPENGATURANAPI');
  const admins = rows.filter(r => iR >= 0 && tmRoleNorm_(r[iR]) === 'ADMIN');
  if (!admins.length) return [];
  const tanda = iA >= 0 ? admins.filter(r => tmFlag_(r[iA], false) === true) : [];
  return (tanda.length ? tanda : [admins[0]]).map(r => tmNorm_(r[iU]));
}
function tmIzinDari_(role, row, h, rows) {
  const out = {};
  Object.keys(TM_HDR_LAMA).forEach(k => { const i = h.indexOf(TM_HDR_LAMA[k]); out[k] = i >= 0 ? tmFlag_(row[i], true) : true; });
  TM_IZIN.forEach(k => {
    const bawaan = role === 'ADMIN' ? true : (role === 'SUBADMIN' && k !== 'TDATA' && k !== 'TIMPOR');
    const i = h.indexOf(TM_HDR[k]);
    let v = i >= 0 ? tmFlag_(row[i], bawaan) : bawaan;
    if (!role) v = false;                       // tanpa peran Terminate = tidak ada halaman Terminate
    if ((k === 'TDATA' || k === 'TIMPOR' || k === 'TCHAT') && role !== 'ADMIN') v = false;   // Data penuh & Impor WA selalu khusus Admin
    out[k] = v;
  });
  const iUu = h.indexOf('USERNAME') >= 0 ? h.indexOf('USERNAME') : 0;
  out.TAPI = role === 'ADMIN' && !!rows && tmSuperAdmin_(h, rows).indexOf(tmNorm_(row[iUu])) >= 0;
  return out;
}
function tmAkun_(user) {
  const sh = tmSheet_(TM.SH.USERS);
  if (!sh || sh.getLastRow() < 2) return null;
  const v = sh.getDataRange().getValues(), h = v[0].map(tmNorm_);
  const iU = h.indexOf('USERNAME') >= 0 ? h.indexOf('USERNAME') : 0, iR = h.indexOf('AKSESTERMINATE');
  for (let i = 1; i < v.length; i++) {
    if (!tmSame_(v[i][iU], user)) continue;
    const role = iR >= 0 ? tmRoleNorm_(v[i][iR]) : '';
    return { role: role, izin: tmIzinDari_(role, v[i], h, v.slice(1)) };
  }
  return null;
}
function tmRole_(user) {
  const u = tmUsersRows_();
  if (u.iU < 0 || u.iR < 0) return '';
  for (let i = 0; i < u.rows.length; i++) if (tmSame_(u.rows[i][u.iU], user)) return tmRoleNorm_(u.rows[i][u.iR]);
  return '';
}
function tmNamaLengkap_(user) {
  const sh = tmSheet_(TM.SH.USERS);
  if (!sh || sh.getLastRow() < 2) return String(user);
  const v = sh.getDataRange().getValues(), h = v[0].map(tmNorm_);
  const iU = h.indexOf('USERNAME'), iN = h.indexOf('NAMALENGKAP');
  if (iU < 0 || iN < 0) return String(user);
  for (let i = 1; i < v.length; i++) if (tmSame_(v[i][iU], user) && String(v[i][iN]).trim()) return String(v[i][iN]).trim();
  return String(user);
}
function tmUserList_() {
  const u = tmUsersRows_();
  const out = [];
  if (u.iU < 0 || u.iR < 0) return out;
  u.rows.forEach(r => { if (tmRoleNorm_(r[u.iR])) out.push(String(r[u.iU]).trim()); });
  return out.sort();
}
function tmPassOk_(stored, pass) {
  const st = String(stored == null ? '' : stored).trim();
  if (!st) return false;
  if (st === pass) return true;
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pass, Utilities.Charset.UTF_8);
  const hex = raw.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
  return st.toLowerCase() === hex || st === Utilities.base64Encode(raw);
}

// Ganti password sendiri (profil). Verifikasi password lama, minimal 6 karakter, batas percobaan gagal.
function tmGantiPassword_(d, au) {
  const lama = String(d.lama || ''), baru = String(d.baru || '');
  const cache = CacheService.getScriptCache(), kk = 'tmgp_' + tmNorm_(au.user);
  if (Number(cache.get(kk) || 0) >= 5) return tmErr_('Terlalu banyak percobaan gagal. Coba lagi 10 menit lagi.');
  if (baru.length < 6) return tmErr_('Password baru minimal 6 karakter.');
  if (baru === lama) return tmErr_('Password baru harus berbeda dari password lama.');
  const sh = tmSheet_(TM.SH.USERS), u = tmUsersRows_();
  if (!sh || u.iU < 0 || u.iP < 0) return tmErr_('Sheet USERS tidak punya kolom Username/Password.');
  for (let i = 0; i < u.rows.length; i++) {
    if (!tmSame_(u.rows[i][u.iU], au.user)) continue;
    if (!tmPassOk_(u.rows[i][u.iP], lama)) {
      Utilities.sleep(600);
      cache.put(kk, String(Number(cache.get(kk) || 0) + 1), 600);
      return tmErr_('Password lama salah.');
    }
    const c = sh.getRange(i + 2, u.iP + 1);
    c.setNumberFormat('@');
    c.setValue(baru);
    cache.remove(kk);
    return { status: 'success', message: 'Password berhasil diganti.', tm: 1 };
  }
  return tmErr_('Akun tidak ditemukan.');
}
function tmLogin_(d) {
  const user = String(d.username || '').trim(), pass = String(d.password || '');
  const cache = CacheService.getScriptCache(), kk = 'tmfail_' + tmNorm_(user);
  if (Number(cache.get(kk) || 0) >= 5) return tmErr_('Terlalu banyak percobaan gagal. Coba lagi 10 menit lagi.');
  const u = tmUsersRows_();
  if (u.iU < 0 || u.iP < 0) return tmErr_('Sheet USERS tidak punya kolom Username/Password.');
  for (let i = 0; i < u.rows.length; i++) {
    const r = u.rows[i];
    if (user && tmSame_(r[u.iU], user) && tmPassOk_(r[u.iP], pass)) {
      const role = u.iR >= 0 ? tmRoleNorm_(r[u.iR]) : '';
      const exp = Date.now() + TM.SESSION_MS;
      const nama = String(r[u.iU]).trim();
      return { status: 'success', token: tmMakeToken_(nama, role, exp), user: nama, nama: tmNamaLengkap_(nama), role: role, izin: tmIzinDari_(role, r, u.h, u.rows), expiresAt: exp };
    }
  }
  Utilities.sleep(600);
  if (user) cache.put(kk, String(Number(cache.get(kk) || 0) + 1), 600);
  return tmErr_('Username atau password salah.');
}
function tmAuth_(d) {
  const t = tmCheckToken_(d.token);
  if (!t) return null;
  const a = tmAkun_(t.user);
  return (a && a.role && a.role === t.role) ? { user: t.user, role: a.role, izin: a.izin } : null;   // akses dicabut = langsung keluar
}

/* ===================== OPSI POP/ODP & PENCARIAN SN ===================== */
function tmOptions_(au) {
  const map = {}; TM.POPS.forEach(p => { map[p] = {}; });
  [TM.SH.B1, TM.SH.B2, TM.SH.FULL, TM.SH.LOG, TM.SH.INSTALASI, TM.SH.MT].forEach(name => {
    tmRead_(name).forEach(r => {
      const pop = tmPop_(r.POP), odp = String(r.ODP || '').trim().toUpperCase();
      if (!pop || !odp) return;
      const key = tmNorm_(odp);
      if (key && !map[pop][key]) map[pop][key] = odp;
    });
  });
  const odp = {};
  TM.POPS.forEach(p => { odp[p] = Object.keys(map[p]).map(k => map[p][k]).sort(); });
  const res = { status: 'success', pops: TM.POPS, odp: odp };
  if (au.role === 'ADMIN') res.users = tmUserList_();
  return res;
}
function tmLookup_(sn, psn) {
  const nsn = tmNorm_(sn), npsn = tmNorm_(psn);
  const order = [TM.SH.B1, TM.SH.B2, TM.SH.INSTALASI, TM.SH.MT];
  for (let k = 0; k < order.length; k++) {
    let hit = null;
    tmRead_(order[k]).forEach(r => {
      const a = tmNorm_(r.SN), b = tmNorm_(r.PSN);
      if ((nsn && (a === nsn || b === nsn)) || (npsn && (a === npsn || b === npsn))) hit = r;
    });
    if (hit) return { found: true, sheet: order[k], NAMA: String(hit.NAMA || '').trim(), CID: String(hit.CID || '').trim(),
                      ODP: String(hit.ODP || '').trim().toUpperCase(), POP: tmPop_(hit.POP) };
  }
  return { found: false };
}
function tmLookupApi_(d) {
  const r = tmLookup_(d.sn, d.psn);
  return r.found ? { status: 'success', found: true, sheet: r.sheet, nama: r.NAMA, cid: r.CID, odp: r.ODP, pop: r.POP,
                    fotoRumah: (typeof ccFotoRumah_ === 'function') ? ccFotoRumah_(r.CID) : '' }
                 : { status: 'success', found: false };
}
// Tombol Cek: cari data dengan prioritas SN, lalu P-SN, lalu CID, lalu Nama di semua sheet data
function tmCari_(d) {
  const nsn = tmNorm_(d.sn), npsn = tmNorm_(d.psn), cid = tmCidDigit_(d.cid), nm = tmNorm_(d.nama);
  if (!nsn && !npsn && !cid && !nm) return { status: 'success', kosong: true, message: 'Isi SN, P-SN, CID atau Nama dulu agar data bisa ditemukan.' };
  const order = [TM.SH.B1, TM.SH.B2, TM.SH.INSTALASI, TM.SH.MT, TM.SH.FULL, TM.SH.TARGET], cache = {};
  const baca = n => cache[n] || (cache[n] = (function () { try { return tmRead_(n); } catch (e) { return []; } })());
  const uji = [
    ['SN', nsn, r => { const a = tmNorm_(r.SN), b = tmNorm_(r.PSN); return a === nsn || b === nsn; }],
    ['P-SN', npsn, r => { const a = tmNorm_(r.SN), b = tmNorm_(r.PSN); return a === npsn || b === npsn; }],
    ['CID', cid, r => tmCidDigit_(r.CID) === cid],
    ['NAMA', nm.length >= 3 ? nm : '', r => { const x = tmNorm_(r.NAMA); return x && (x === nm || x.indexOf(nm) >= 0); }]
  ];
  for (let u = 0; u < uji.length; u++) {
    if (!uji[u][1]) continue;
    if (uji[u][0] === 'NAMA') {                              // nama: cocok persis/mengandung, atau MIRIP (salah ketik, urutan kata, sebagian kata) -> pilih dari daftar
      const res = tmCariNama_(d.nama, order, baca);
      if (!res.length) continue;
      const h0 = res[0].h, mirip = res[0].skor < 1.2;
      return { status: 'success', found: true, by: mirip ? 'NAMA (mirip)' : 'NAMA', mirip: mirip, sheet: h0.sheet, data: h0, kandidat: (mirip || res.length > 1) ? res.map(o => o.h) : [],
               fotoRumah: (!mirip && typeof ccFotoRumah_ === 'function' && h0.cid) ? ccFotoRumah_(h0.cid) : '' };
    }
    const hits = [];
    order.forEach(sh => baca(sh).forEach(r => { if (hits.length < 8 && uji[u][2](r)) hits.push({ sheet: sh, nama: String(r.NAMA || '').trim(), cid: String(r.CID || '').trim(), odp: String(r.ODP || '').trim().toUpperCase(), pop: tmPop_(r.POP), sn: String(r.SN || '').trim(), psn: String(r.PSN || '').trim() }); }));
    if (!hits.length) continue;
    const uniq = []; hits.forEach(h => { if (!uniq.some(x => tmCidDigit_(x.cid) === tmCidDigit_(h.cid) && tmNorm_(x.nama) === tmNorm_(h.nama))) uniq.push(h); });
    const h0 = uniq[0];
    return { status: 'success', found: true, by: uji[u][0], sheet: h0.sheet, data: h0, kandidat: uniq.length > 1 ? uniq : [],
             fotoRumah: (typeof ccFotoRumah_ === 'function' && h0.cid) ? ccFotoRumah_(h0.cid) : '' };
  }
  return { status: 'success', found: false, message: 'Data tidak ditemukan. Isi kolom CID atau Nama pelanggan agar data bisa ditemukan.' };
}
function tmEdit_(a, b) {                                     // jarak edit (Levenshtein)
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let p = []; for (let j = 0; j <= n; j++) p[j] = j;
  for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; }
  return p[n];
}
function tmCariNama_(nama, order, baca) {
  const tok = t => String(t || '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  let q = tok(nama).filter(t => t.length >= 3); if (!q.length) q = tok(nama);
  const nq = tmNorm_(nama), best = {};
  if (!q.length) return [];
  order.forEach(sh => baca(sh).forEach(r => {
    const nm = String(r.NAMA || '').trim(); if (!nm) return;
    const rt = tok(nm), nr = tmNorm_(nm);
    let skor = 0;
    if (nq.length >= 3 && (nr === nq || nr.indexOf(nq) >= 0)) skor = 1.2;
    else {
      q.forEach(w => {
        let b = 0;
        rt.forEach(t => {
          if (t === w) b = Math.max(b, 1);
          else if (w.length >= 4 && tmEdit_(w, t) <= 1) b = Math.max(b, 0.9);
          else if (w.length >= 7 && tmEdit_(w, t) <= 2) b = Math.max(b, 0.75);
          else if (w.length >= 4 && t.length >= 4 && (t.indexOf(w) >= 0 || w.indexOf(t) >= 0)) b = Math.max(b, 0.7);
        });
        skor += b;
      });
      skor = skor / q.length;
    }
    if (skor < 0.5) return;
    const h = { sheet: sh, nama: nm, cid: String(r.CID || '').trim(), odp: String(r.ODP || '').trim().toUpperCase(), pop: tmPop_(r.POP), sn: String(r.SN || '').trim(), psn: String(r.PSN || '').trim() };
    const k = tmCidDigit_(h.cid) || tmNorm_(nm);
    if (!best[k] || skor > best[k].skor) best[k] = { skor: skor, h: h };
  }));
  return Object.keys(best).map(k => best[k]).sort((x, y) => y.skor - x.skor).slice(0, 8);
}
// Pindahkan baris dari "Baris 1" (akan diambil) ke "Baris 2" (sudah diambil & diverif tim terminate)
function tmPindahB1_(sn, psn, rec) {
  const s1 = tmSheet_(TM.SH.B1);
  if (!s1 || s1.getLastRow() < 2) return false;
  const v = s1.getDataRange().getValues();
  const canon = v[0].map(tmCanon_);
  const iSN = canon.indexOf('SN'), iPSN = canon.indexOf('PSN');
  const nsn = tmNorm_(sn), npsn = tmNorm_(psn);
  let idx = -1;
  for (let r = v.length - 1; r >= 1; r--) {
    const a = iSN >= 0 ? tmNorm_(v[r][iSN]) : '', b = iPSN >= 0 ? tmNorm_(v[r][iPSN]) : '';
    if ((nsn && (a === nsn || b === nsn)) || (npsn && (a === npsn || b === npsn))) { idx = r; break; }
  }
  if (idx < 0) return false;
  let s2 = tmSheet_(TM.SH.B2);
  if (!s2) { s2 = tmSS_().insertSheet(TM.SH.B2); s2.appendRow(v[0]); s2.setFrozenRows(1); }
  const h1 = v[0].map(tmNorm_);
  const row2 = tmHeaders_(s2).map(h => { const i = h1.indexOf(tmNorm_(h)); return i >= 0 ? v[idx][i] : ''; });
  const newRow = s2.getLastRow() + 1;
  s2.getRange(newRow, 1, 1, row2.length).setValues([row2]);
  s2.getRange(newRow, tmColByLabel_(s2, 'DIVERIF OLEH')).setValue(rec.ADMIN);
  s2.getRange(newRow, tmColByLabel_(s2, 'WAKTU VERIF')).setValue(rec.WAKTU);
  s2.getRange(newRow, tmColByLabel_(s2, 'FOTO TERMINATE')).setValue(rec.FOTO);
  s1.deleteRow(idx + 1);   // hapus dari Baris 1 hanya setelah Baris 2 berhasil ditulis
  return true;
}

/* ===================== SIMPAN ===================== */
function tmSimpan_(d, au) {
  const jenis = String(d.jenis || '').toUpperCase();
  if (['TERMINATE', 'KUNJUNGAN', 'LANJUT'].indexOf(jenis) < 0) return tmErr_('Jenis laporan tidak dikenal.');
  const s = k => String(d[k] == null ? '' : d[k]).trim();
  // POP & ODP hanya untuk Terminate; Kunjungan / Lanjut tidak memakainya
  const pop = jenis === 'TERMINATE' ? tmPop_(s('pop')) : '';
  if (jenis === 'TERMINATE' && !pop) return tmErr_('POP wajib dipilih (PERBAUNGAN atau PANTAI CERMIN).');
  const odp = jenis === 'TERMINATE' ? s('odp').toUpperCase() : '';
  if (jenis === 'TERMINATE' && !odp) return tmErr_('ODP wajib diisi.');
  if (!d.foto) return tmErr_('Foto wajib diambil dengan kamera.');

  let bersih = 0;                       // jumlah baris dobel / antrian yang dibersihkan
  let ada = null;                       // data yang sama sudah ada -> diperbarui (bukan baris baru)
  const now = new Date();
  const rec = {
    ID: Utilities.getUuid().substring(0, 8).toUpperCase(), WAKTU: now, TANGGAL: tmTglIndo_(tmIso_(now)),
    ADMIN: au.user, TIM: s('tim') || au.user, JENIS: jenis,
    NAMA: s('nama'), CID: s('cid').replace(/\s+/g, ''), ODP: odp, POP: pop, SN: '', PSN: '',
    KET: s('ket'), VERIF: '', SUMBER: TM.SUMBER
  };

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    let pindah = false;
    if (jenis === 'TERMINATE') {
      rec.SN = tmCleanCode_(s('sn')); rec.PSN = tmCleanCode_(s('psn'));
      if (!rec.SN || !rec.PSN) return tmErr_('SN dan P-SN wajib diisi keduanya.');

      // perangkat yang sama (SN / P-SN) untuk client yang sama (CID kosong/sama) = data yang sama -> diperbarui; CID beda = client lain (perangkat dipakai ulang) -> baris baru
      ada = tmRead_(TM.SH.LOG).filter(r => r.JENIS === 'TERMINATE' &&
        (tmNorm_(r.SN) === tmNorm_(rec.SN) || tmNorm_(r.PSN) === tmNorm_(rec.PSN)) &&
        (!rec.CID || !tmNorm_(r.CID) || tmNorm_(r.CID) === tmNorm_(rec.CID)))[0] || null;

      const cari = tmLookup_(rec.SN, rec.PSN);
      if (cari.found) {
        if (!rec.NAMA) rec.NAMA = cari.NAMA;
        const cidInput = rec.CID;
        if (!rec.CID) rec.CID = cari.CID;
        rec.VERIF = (cidInput && cari.CID && tmNorm_(cidInput) !== tmNorm_(cari.CID))
          ? 'CID BEDA (sheet ' + cari.sheet + ': ' + cari.CID + ')' : 'COCOK (' + cari.sheet + ')';
      } else {
        rec.VERIF = 'TIDAK DITEMUKAN';
      }
      rec.KET = rec.KET || TM.KET.TERMINATE;
      rec.STATUS = 'TERMINATE';
      rec.FOTO = tmSimpanFoto_(d.foto, 'TERMINATE_' + rec.SN);
      // Berhasil diambil: hapus otomatis dari Full Data & target, lalu catat siapa yang mengambil di "sudah diambil"
      try { const n = tmHapusAntrian_(rec); bersih += n; if (n) rec.VERIF += ' | DIHAPUS DARI FULL DATA/TARGET (' + n + ')'; } catch (e) { rec.VERIF += ' | GAGAL HAPUS FULL DATA/TARGET'; }
      try { bersih += tmHapusCid_(TM.SH.KUNJUNGAN, rec.CID) + tmHapusCid_(TM.SH.LANJUT, rec.CID); } catch (e) { /* abaikan */ }   // sudah diambil: keluar dari kunjungan / lanjut
      try { tmTandaiDiambil_([rec]); } catch (e) { rec.VERIF += ' | GAGAL TULIS SUDAH DIAMBIL'; }
      if (cari.found && cari.sheet === TM.SH.B1) {
        try { pindah = tmPindahB1_(rec.SN, rec.PSN, rec); } catch (e) { rec.VERIF += ' | GAGAL PINDAH KE BARIS 2'; }
        if (pindah) rec.VERIF += ' | DIPINDAH KE BARIS 2';
      }
      try { bersih += tmHapusCid_(TM.SH.B1, rec.CID); } catch (e) { /* abaikan */ }   // sisa CID dobel di Baris 1
      if (typeof ccStatusChatCid_ === 'function') ccStatusChatCid_(rec.CID, 'BERHENTI_DILAPOR');   // status di Chat Client ikut: sudah diambil
    } else {
      if (!rec.NAMA || !rec.CID) return tmErr_('Nama dan CID wajib diisi.');
      ada = tmRead_(TM.SH.LOG).filter(r => r.JENIS === jenis && tmNorm_(r.CID) === tmNorm_(rec.CID) && tmIso_(r.WAKTU) === tmIso_(now))[0] || null;   // CID & jenis sama di hari yang sama
      rec.SN = tmCleanCode_(s('sn')); rec.PSN = tmCleanCode_(s('psn'));   // opsional, membantu mencocokkan antrian
      rec.KET = rec.KET || TM.KET[jenis];
      rec.STATUS = jenis === 'KUNJUNGAN' ? 'TIDAK ADA DIRUMAH' : 'LANJUT';
      rec.FOTO = tmSimpanFoto_(d.foto, jenis + '_' + rec.CID);
      // masuk laporan -> keluar dari antrian pengambilan (Full Data, target) dan CID dobel dihapus
      try {
        bersih += tmHapusAntrian_(rec);
        if (jenis === 'LANJUT') bersih += tmHapusCid_(TM.SH.B1, rec.CID) + tmHapusCid_(TM.SH.KUNJUNGAN, rec.CID);   // lanjut: tidak perlu diambil lagi
        if (jenis === 'LANJUT' && typeof ccStatusChatCid_ === 'function') ccStatusChatCid_(rec.CID, 'LANJUT_DILAPOR');
      } catch (e) { rec.VERIF = ((rec.VERIF ? rec.VERIF + ' | ' : '') + 'GAGAL BERSIHKAN ANTRIAN'); }
    }

    if (ada) rec.ID = String(ada.ID);
    const kerja = Object.assign({}, rec); delete kerja.JENIS;
    // sheet tujuan sesuai jenis; CID dobel di sheet tujuan dihapus dulu supaya satu CID satu baris
    const tujuan = jenis === 'TERMINATE' ? [TM.SH.TERMINATE] : jenis === 'KUNJUNGAN' ? [TM.SH.KUNJUNGAN] : [TM.SH.LANJUT, TM.SH.TERMINATE];
    tujuan.forEach(nm => {
      tmUpsertCid_(nm, TM_LOG_KEYS, kerja);          // CID sudah ada: hanya sel yang berubah diperbarui
    });
    if (ada) { const f = Object.assign({}, rec); delete f.ID; tmUpdateRows_(TM.SH.LOG, r => String(r.ID) === rec.ID, f); }   // baris lama diperbarui (termasuk foto)
    else tmAppendObj_(tmSheetEnsure_(TM.SH.LOG, TM_LOG_KEYS), rec);

    return { status: 'success', message: ada ? 'Data sudah ada: diperbarui (termasuk foto), tidak dibuat baris baru.' : 'Tersimpan.', diperbarui: !!ada,
             data: { nama: rec.NAMA, cid: rec.CID, odp: rec.ODP, pop: rec.POP, sn: rec.SN, psn: rec.PSN, verif: rec.VERIF, pindah: pindah, bersih: bersih } };
  } finally {
    lock.releaseLock();
  }
}

/* ===================== DAFTAR & LAPORAN ===================== */
function tmOut_(r) {
  const s = v => String(v == null ? '' : v);
  return { id: s(r.ID), waktu: tmWaktuTxt_(r.WAKTU), tgl: tmIso_(r.WAKTU), admin: s(r.ADMIN), tim: s(r.TIM), jenis: s(r.JENIS),
           nama: s(r.NAMA), cid: s(r.CID), odp: s(r.ODP), pop: s(r.POP), sn: s(r.SN), psn: s(r.PSN), ket: s(r.KET),
           verif: s(r.VERIF), foto: s(r.FOTO), diedit: s(r.DIEDITOLEH), arsip: !!r.ARSIP };
}
function tmByWaktuDesc_(a, b) { return (b.WAKTU instanceof Date ? b.WAKTU.getTime() : 0) - (a.WAKTU instanceof Date ? a.WAKTU.getTime() : 0); }

// Perangkat sudah diambil HARI INI. Sub admin: miliknya saja. Admin: semua (dengan nama sub admin).
// Rentang tanggal opsional: d.dari / d.sampai (yyyy-MM-dd). Kosong = hari ini.
function tmRentang_(d) {
  const ok = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
  let a = ok(d && d.dari) ? String(d.dari) : '', b = ok(d && d.sampai) ? String(d.sampai) : '';
  if (!a && !b) return null;
  a = a || b; b = b || a;
  return a <= b ? { dari: a, sampai: b } : { dari: b, sampai: a };
}
function tmListHariIni_(au, d) {
  const iso = tmIso_(new Date()), rg = tmRentang_(d);
  let rows = tmRead_(TM.SH.LOG).filter(r => { if (r.JENIS !== 'TERMINATE') return false; const t = tmIso_(r.WAKTU); return rg ? (t >= rg.dari && t <= rg.sampai) : t === iso; });
  const admins = []; rows.forEach(r => { const a = String(r.ADMIN || '').trim(); if (a && admins.indexOf(a) < 0) admins.push(a); });
  if (au.role !== 'ADMIN') rows = rows.filter(r => tmSame_(r.ADMIN, au.user));
  else if (d && String(d.admin || '').trim()) rows = rows.filter(r => tmSame_(r.ADMIN, d.admin));
  rows.sort(tmByWaktuDesc_);
  return { status: 'success', tanggal: rg ? (rg.dari === rg.sampai ? tmTglIndo_(rg.dari) : tmTglIndo_(rg.dari) + ' s/d ' + tmTglIndo_(rg.sampai)) : tmTglIndo_(iso), role: au.role, admins: au.role === 'ADMIN' ? admins.sort() : [], data: rows.map(tmOut_) };
}

function tmNamaTim_(r, fallback) {
  const t0 = String(r.TIM || '').trim();
  const a = String((t0 && !tmSame_(t0, r.ADMIN)) ? t0 : tmNamaLengkap_(fallback || r.ADMIN)).split(/[,\n]/).map(x => x.trim()).filter(Boolean);
  return a.length ? a : [String(fallback || '-')];
}
// gabung nama tim + teman yang diisi saat membuat laporan (tanpa dobel)
function tmGabungTim_(nama, teman) {
  const out = nama.slice();
  (teman || []).forEach(n => { if (!out.some(x => tmSame_(x, n))) out.push(n); });
  return out;
}
// isi 1 data (tanpa nomor urut & tanpa TS); dipakai untuk laporan gabungan dan caption foto
function tmBlok_(r, jenis) {
  let t = 'Nama : ' + (r.NAMA || '-') + '\nCID : ' + (r.CID || '-');
  if (jenis === 'TERMINATE') t += '\nODP : ' + (r.ODP || '-') + '\nSN : ' + (r.SN || '-') + '\nP-SN : ' + (r.PSN || '-');
  else t += '\nODP : -';
  return t + '\nKet : ' + (r.KET || '-');
}
// Laporan SATU daftar (tanpa dikelompokkan per POP). Halaman memilih data lewat kotak centang lalu menyusun teks gabungan.
function tmRekap_(d, au) {
  const ok = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
  let dari = ok(d.dari) ? String(d.dari) : (ok(d.tanggal) ? String(d.tanggal) : tmIso_(new Date()));
  let sampai = ok(d.sampai) ? String(d.sampai) : dari;
  if (sampai < dari) { const t = dari; dari = sampai; sampai = t; }
  let scope = String(d.scope || 'saya');
  if (au.role !== 'ADMIN') scope = 'saya';
  const teman = (Array.isArray(d.teman) ? d.teman : String(d.teman || '').split(/[,\n]/)).map(x => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 10);
  let rows = tmRead_(TM.SH.LOG).filter(r => { const t = tmIso_(r.WAKTU); return t >= dari && t <= sampai; });
  if (scope === 'saya') rows = rows.filter(r => tmSame_(r.ADMIN, au.user));
  else if (scope !== 'gabungan') rows = rows.filter(r => tmSame_(r.ADMIN, scope));
  rows.sort(tmByWaktuDesc_).reverse();
  if (!rows.length) return tmErr_('Belum ada data pada tanggal ini untuk laporan ini.');
  const data = rows.map(r => {
    const tim = tmGabungTim_(tmNamaTim_(r, r.ADMIN), teman);
    const blok = tmBlok_(r, r.JENIS);
    // caption foto gaya tim lapangan: Terminate pakai "TS :", lainnya "TIM :"
    const caption = blok + '\n' + (r.JENIS === 'TERMINATE' ? 'TS :\n' + tim.join('\n') : 'TIM :\n' + tim.join('\n').toUpperCase());
    return Object.assign(tmOut_(r), { blok: blok, caption: caption, timList: tim });
  });
  return { status: 'success', tanggal: dari === sampai ? tmTglUpper_(dari) : tmTglUpper_(dari) + ' - ' + tmTglUpper_(sampai), data: data };
}

/* ===================== EDIT NAMA & CID ===================== */
function tmEditList_(au, d) {
  const batas = Date.now() - 3 * 24 * 3600 * 1000, rg = tmRentang_(d);
  let rows = tmRead_(TM.SH.LOG).filter(r => r.WAKTU instanceof Date && (rg ? (tmIso_(r.WAKTU) >= rg.dari && tmIso_(r.WAKTU) <= rg.sampai) : r.WAKTU.getTime() >= batas));
  if (au.role !== 'ADMIN') rows = rows.filter(r => tmSame_(r.ADMIN, au.user));
  rows.sort(tmByWaktuDesc_);
  return { status: 'success', role: au.role, data: rows.slice(0, 500).map(tmOut_) };
}
// Foto dimasukkan manual dari halaman Laporan (menambah / mengganti foto sebuah data)
function tmFotoSimpan_(d, au) {
  const id = String(d.id || '').trim();
  if (!id) return tmErr_('ID data tidak ada.');
  if (!d.foto || String(d.foto).length < 100) return tmErr_('Foto belum dipilih.');
  if (String(d.foto).length > 6000000) return tmErr_('Foto terlalu besar. Pilih foto lain.');
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const rec = tmRead_(TM.SH.LOG).filter(r => String(r.ID) === id)[0];
    if (!rec) return tmErr_('Data tidak ditemukan.');
    if (au.role !== 'ADMIN' && !tmSame_(rec.ADMIN, au.user)) return tmErr_('Anda hanya boleh mengubah foto data milik sendiri.');
    const link = tmSimpanFoto_(d.foto, (rec.JENIS || 'DATA') + '_' + (rec.CID || rec.SN || id));
    const sama = r => String(r.ID) === id;
    tmUpdateRows_(TM.SH.LOG, sama, { FOTO: link });
    tmUpdateRows_(TM.SH.TERMINATE, sama, { FOTO: link });
    tmUpdateRows_(TM.SH.KUNJUNGAN, sama, { FOTO: link });
    tmUpdateRows_(TM.SH.LANJUT, sama, { FOTO: link });
    if (rec.JENIS === 'TERMINATE' && tmNorm_(rec.SN)) {          // salinan di Baris 2 & sudah diambil (dicari lewat SN)
      const bySN = r => tmNorm_(r.SN) === tmNorm_(rec.SN);
      tmUpdateRows_(TM.SH.B2, bySN, { FOTOTERMINATE: link });
      tmUpdateRows_(TM.SH.DIAMBIL, bySN, { FOTO: link });
    }
    return { status: 'success', foto: link, message: 'Foto tersimpan.' };
  } finally {
    lock.releaseLock();
  }
}
function tmEditSimpan_(d, au) {
  const id = String(d.id || '').trim(), nama = String(d.nama || '').trim(), cid = String(d.cid || '').replace(/\s+/g, '');
  if (!id) return tmErr_('ID data tidak ada.');
  if (!nama || !cid) return tmErr_('Nama dan CID wajib diisi.');
  if (!/^\d{6,20}$/.test(cid)) return tmErr_('CID harus berupa angka (6-20 digit).');

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const semua = tmRead_(TM.SH.LOG);
    const rec = semua.filter(r => String(r.ID) === id)[0];
    if (!rec) return tmErr_('Data tidak ditemukan.');
    if (au.role !== 'ADMIN' && !tmSame_(rec.ADMIN, au.user)) return tmErr_('Anda hanya boleh mengedit data milik sendiri.');
    const dobel = semua.filter(r => String(r.ID) !== id && r.JENIS === rec.JENIS && tmNorm_(r.CID) === tmNorm_(cid) && tmIso_(r.WAKTU) === tmIso_(rec.WAKTU));
    if (dobel.length) return tmErr_('CID ' + cid + ' sudah dipakai data lain pada tanggal yang sama.');

    const f = { NAMA: nama, CID: cid, DIEDITOLEH: au.user, DIEDITWAKTU: new Date() };
    const sama = r => String(r.ID) === id;
    [TM.SH.LOG, TM.SH.TERMINATE].forEach(n => { const sh = tmSheet_(n); if (sh) tmEnsureCols_(sh, ['DIEDITOLEH', 'DIEDITWAKTU']); });
    tmUpdateRows_(TM.SH.LOG, sama, f);
    tmUpdateRows_(TM.SH.TERMINATE, sama, f);
    tmUpdateRows_(TM.SH.KUNJUNGAN, sama, { NAMA: nama, CID: cid });
    tmUpdateRows_(TM.SH.LANJUT, sama, { NAMA: nama, CID: cid });
    if (rec.JENIS === 'TERMINATE') {   // sinkronkan ke Baris 2 & sudah diambil lewat SN
      const bySN = r => tmNorm_(r.SN) === tmNorm_(rec.SN) && tmNorm_(rec.SN) !== '';
      tmUpdateRows_(TM.SH.B2, bySN, { NAMA: nama, CID: cid });
      tmUpdateRows_(TM.SH.DIAMBIL, bySN, { NAMA: nama, CID: cid });
      try { tmHapusAntrian_({ CID: cid, SN: rec.SN, PSN: rec.PSN }); } catch (e) { /* abaikan */ }
    }
    return { status: 'success', message: 'Nama dan CID tersimpan.' };
  } finally {
    lock.releaseLock();
  }
}

// Edit semua kolom satu data (halaman Sudah Diambil): hanya sel yang berubah yang ditulis
function tmEditLengkap_(d, au) {
  const id = String(d.id || '').trim(); if (!id) return tmErr_('ID data tidak ada.');
  const t = k => String(d[k] == null ? '' : d[k]).trim();
  const cid = t('cid').replace(/\s+/g, '');
  if (cid && !/^\d{6,20}$/.test(cid)) return tmErr_('CID harus berupa angka (6-20 digit).');
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const rec = tmRead_(TM.SH.LOG).filter(r => String(r.ID) === id)[0];
    if (!rec) return tmErr_('Data tidak ditemukan.');
    if (au.role !== 'ADMIN' && !tmSame_(rec.ADMIN, au.user)) return tmErr_('Anda hanya boleh mengedit data milik sendiri.');
    const f = { NAMA: t('nama'), CID: cid, ODP: t('odp'), SN: t('sn'), PSN: t('psn'), KET: t('ket') };
    if (t('pop')) f.POP = tmPop_(t('pop')) || t('pop');
    [TM.SH.LOG, TM.SH.TERMINATE].forEach(n => { const sh = tmSheet_(n); if (sh) tmEnsureCols_(sh, ['DIEDITOLEH', 'DIEDITWAKTU']); });
    const sama = r => String(r.ID) === id, o = Object.assign({}, f, { DIEDITOLEH: au.user, DIEDITWAKTU: new Date() });
    tmUpdateRows_(TM.SH.LOG, sama, o); tmUpdateRows_(TM.SH.TERMINATE, sama, o);
    tmUpdateRows_(TM.SH.KUNJUNGAN, sama, f); tmUpdateRows_(TM.SH.LANJUT, sama, f);
    const sn0 = tmNorm_(rec.SN);
    if (rec.JENIS === 'TERMINATE' && sn0) {      // salinan di Baris 2 & sudah diambil (dicari lewat SN lama)
      const bySN = r => tmNorm_(r.SN) === sn0;
      tmUpdateRows_(TM.SH.B2, bySN, f); tmUpdateRows_(TM.SH.DIAMBIL, bySN, f);
    }
    return { status: 'success', message: 'Data tersimpan.' };
  } finally { lock.releaseLock(); }
}
// Hapus satu data dari semua sheet (dicari lewat ID / SN). Dicatat di "LOG HAPUS BERSIH".
function tmHapus_(d, au) {
  const id = String(d.id || '').trim(); if (!id) return tmErr_('ID data tidak ada.');
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const rec = tmRead_(TM.SH.LOG).filter(r => String(r.ID) === id)[0];
    if (!rec) return tmErr_('Data tidak ditemukan.');
    if (au.role !== 'ADMIN' && !tmSame_(rec.ADMIN, au.user)) return tmErr_('Anda hanya boleh menghapus data milik sendiri.');
    const sn0 = tmNorm_(rec.SN), logRows = []; let n = 0;
    const hapusDi = (nama, cocok) => {
      const sh = tmSheet_(nama); if (!sh || sh.getLastRow() < 2) return;
      const v = sh.getDataRange().getValues(), canon = v[0].map(tmCanon_);
      for (let r = v.length - 1; r >= 1; r--) {
        const o = {}; canon.forEach((c, i) => { if (c && o[c] === undefined) o[c] = v[r][i]; });
        if (!cocok(o)) continue;
        logRows.push([Utilities.formatDate(new Date(), TM.TZ, 'dd/MM/yyyy HH:mm:ss'), au.user, 'Hapus data', nama, tmCidDigit_(o.CID), 'dihapus manual', v[r].map(x => x instanceof Date ? tmWaktuTxt_(x) : String(x)).join(' | ').slice(0, 500)]);
        sh.deleteRow(r + 1); n++;
      }
    };
    const byId = o => String(o.ID) === id, bySN = o => sn0 && tmNorm_(o.SN) === sn0;
    [TM.SH.LOG, TM.SH.TERMINATE, TM.SH.KUNJUNGAN, TM.SH.LANJUT].forEach(nm => hapusDi(nm, byId));
    if (rec.JENIS === 'TERMINATE') { hapusDi(TM.SH.B2, bySN); hapusDi(TM.SH.DIAMBIL, bySN); }
    tmBersihLog_(logRows);
    return { status: 'success', message: 'Data dihapus (' + n + ' baris di semua sheet).' };
  } finally { lock.releaseLock(); }
}

/* ===================== DATA LENGKAP (ADMIN) ===================== */
function tmFull_(d) {
  const dari = String(d.dari || '').trim(), sampai = String(d.sampai || '').trim();
  const fa = String(d.admin || '').trim(), fp = tmPop_(d.pop), fj = String(d.jenis || '').toUpperCase(), q = tmNorm_(d.q);
  let rows = tmRead_(TM.SH.LOG).filter(r => {
    const t = tmIso_(r.WAKTU);
    if (dari && t < dari) return false;
    if (sampai && t > sampai) return false;
    if (fa && !tmSame_(r.ADMIN, fa)) return false;
    if (fp && tmPop_(r.POP) !== fp) return false;
    if (fj && r.JENIS !== fj) return false;
    if (q && tmNorm_([r.NAMA, r.CID, r.ODP, r.SN, r.PSN, r.ADMIN].join(' ')).indexOf(q) < 0) return false;
    return true;
  });
  rows.sort(tmByWaktuDesc_);
  return { status: 'success', total: rows.length, data: rows.slice(0, 500).map(tmOut_) };
}

/* ===================== HAPUS DARI FULL DATA & TARGET ===================== */
// Hapus baris perangkat yang sudah diambil dari "Full Data" dan "target" (cocok lewat CID, atau SN/P-SN bila kolomnya ada)
function tmHapusAntrian_(rec) {
  const cid = tmNorm_(rec.CID), sn = tmNorm_(rec.SN), psn = tmNorm_(rec.PSN);
  if (!cid && !sn && !psn) return 0;
  let total = 0;
  [TM.SH.FULL, TM.SH.TARGET].forEach(nama => {
    const sh = tmSheet_(nama);
    if (!sh || sh.getLastRow() < 2) return;
    const v = sh.getDataRange().getValues(), canon = v[0].map(tmCanon_);
    const iC = canon.indexOf('CID'), iS = canon.indexOf('SN'), iP = canon.indexOf('PSN');
    for (let r = v.length - 1; r >= 1; r--) {
      const c = iC >= 0 ? tmNorm_(v[r][iC]) : '', a = iS >= 0 ? tmNorm_(v[r][iS]) : '', b = iP >= 0 ? tmNorm_(v[r][iP]) : '';
      const cocok = (cid && c === cid) || (sn && (a === sn || b === sn)) || (psn && (a === psn || b === psn));
      if (cocok) { sh.deleteRow(r + 1); total++; }
    }
  });
  return total;
}

// Hapus SEMUA baris ber-CID sama dari satu sheet (CID dobel). Mengembalikan jumlah baris yang dihapus.
function tmHapusCid_(nama, cid) {
  const c = tmNorm_(cid); if (!c) return 0;
  const sh = tmSheet_(nama); if (!sh || sh.getLastRow() < 2) return 0;
  const v = sh.getDataRange().getValues(), iC = v[0].map(tmCanon_).indexOf('CID'); if (iC < 0) return 0;
  let n = 0;
  for (let r = v.length - 1; r >= 1; r--) if (tmNorm_(v[r][iC]) === c) { sh.deleteRow(r + 1); n++; }
  return n;
}
// Rapikan satu sheet: CID dobel dihapus, baris pertama dipertahankan.
function tmDedupCid_(nama) {
  const sh = tmSheet_(nama); if (!sh || sh.getLastRow() < 3) return 0;
  const v = sh.getDataRange().getValues(), iC = v[0].map(tmCanon_).indexOf('CID'); if (iC < 0) return 0;
  const seen = {}, hapus = [];
  for (let r = 1; r < v.length; r++) { const c = tmNorm_(v[r][iC]); if (!c) continue; if (seen[c]) hapus.push(r + 1); else seen[c] = 1; }
  hapus.reverse().forEach(r => sh.deleteRow(r));
  return hapus.length;
}

/* ===================== IMPOR DARI WHATSAPP (admin) ===================== */
// Aturan:
//  - SN yang sama (Instalasi & MT): yang TANGGAL-nya terbaru dipertahankan, yang lama dihapus / dilewati.
//  - MT = ganti perangkat: hanya perangkat BARU yang ditulis. Bila SN lama ada di sheet Instalasi, data pelanggannya
//    dipakai melengkapi baris MT lalu baris Instalasi lama dihapus.
function tmOdpAkhir_(v) {   // "ODP-PTCRMN-20987-001 - LUBUK SABAN 01" -> "LUBUK SABAN 01"
  v = String(v || '').trim();
  const r = v.replace(/^ODP[\s\-]+[A-Za-z]+[\s\-]+\d+[\s\-]+\d+\s*(?:[-–·•:]\s*)?/i, '').replace(/\s+/g, ' ').trim();
  return (r || v).toUpperCase();
}
function tmTglParse_(v) {
  if (v instanceof Date) return tmIso_(v);
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) { const i = TM_BULAN.findIndex(b => b.toLowerCase() === m[2].toLowerCase()); if (i >= 0) return m[3] + '-' + ('0' + (i + 1)).slice(-2) + '-' + ('0' + m[1]).slice(-2); }
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}
const TM_KEYS_IW = ['NAMA', 'CID', 'ODP', 'POP', 'SN', 'PSN', 'KET', 'TANGGAL'];
function tmModelIW_(nama) {
  const sh = tmSheetEnsure_(nama, TM_KEYS_IW);
  tmEnsureCols_(sh, TM_KEYS_IW);
  const canon = tmHeaders_(sh).map(tmCanon_);
  const v = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, canon.length).getValues() : [];
  const rows = v.map((r, i) => {
    const o = {}; canon.forEach((c, j) => { if (c && o[c] === undefined) o[c] = r[j]; });
    return { row: i + 2, o: o, tgl: tmTglParse_(o.TANGGAL), upd: {}, del: false };
  });
  return { nama: nama, sh: sh, canon: canon, rows: rows, baru: [] };
}
function tmImporWA_(d, au) {
  let rows = Array.isArray(d.rows) ? d.rows.slice(0, 200) : [];
  if (!rows.length) return tmErr_('Tidak ada baris untuk diimpor.');
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const hasil = { Instalasi: 0, MT: 0, terminate: 0, kunjungan: 0, lanjut: 0, dobel: 0, ditolak: 0, diperbarui: 0, dihapus: 0, pop: 0, lewat: [] };
    // laporan Terminate (diambil / tidak ada di rumah / lanjut) -> jalur grup WA (GrupMasuk.gs), SN dilengkapi dari data yang ada
    const JT = { TERMINATE: 'terminate', KUNJUNGAN: 'kunjungan', LANJUT: 'lanjut' };
    if (typeof gmProses_ === 'function') {
      Object.keys(JT).forEach(j => {
        const sub = rows.filter(x => String(x.sheet) === j).sort((a, b) => (String(a.tanggal || '') + String(a.jam || '')).localeCompare(String(b.tanggal || '') + String(b.jam || '')));
        if (!sub.length) return;
        const h = gmProses_(sub.map(x => ({ jenis: j, nama: String(x.nama || '').trim(), cid: String(x.cid || '').replace(/\s+/g, ''), odp: String(x.odp || ''), pop: String(x.pop || ''), sn: String(x.sn || ''), psn: String(x.psn || ''), ket: String(x.ket || ''), cariSn: !!x.cariSn, tanggal: /^\d{4}-\d{2}-\d{2}$/.test(String(x.tanggal || '')) ? x.tanggal : '' })), '',
          { admin: au.user, verif: 'IMPOR WA (' + au.user + ')', sumber: 'IMPOR_WA' });
        hasil[JT[j]] += h.masuk; hasil.dobel += h.dobel; hasil.ditolak += h.tidakLengkap; hasil.pop += h.bukanPop;
      });
    }
    rows = rows.filter(x => !JT[String(x.sheet)]);
    const lewati = (x, why, k) => { hasil[k]++; if (hasil.lewat.length < 50) hasil.lewat.push({ nama: String(x.nama || '').trim() || '(tanpa nama)', cid: String(x.cid || '-'), sn: String(x.sn || ''), alasan: why }); };
    const M = {}; M.Instalasi = tmModelIW_(TM.SH.INSTALASI); M.MT = tmModelIW_(TM.SH.MT);
    const semua = () => [].concat(M.Instalasi.rows, M.Instalasi.baru, M.MT.rows, M.MT.baru).filter(r => !r.del);
    const sn = r => tmNorm_(r.o.SN);
    const lepas = [];   // perangkat Instalasi baru: catatan lama di "sudah diambil" dengan SN / P-SN sama dihapus (perangkat dipakai ulang)
    // urut dari yang paling lama agar yang terbaru menang
    const urut = rows.map((x, i) => ({ x: x, i: i })).sort((a, b) => (String(a.x.tanggal || '') + String(a.x.jam || '')).localeCompare(String(b.x.tanggal || '') + String(b.x.jam || '')) || a.i - b.i).map(z => z.x);

    urut.forEach(x => {
      const nama = x.sheet === 'MT' ? 'MT' : (x.sheet === 'Instalasi' ? 'Instalasi' : '');
      const s = k => String(x[k] == null ? '' : x[k]).trim();
      const tglIso = /^\d{4}-\d{2}-\d{2}$/.test(s('tanggal')) ? s('tanggal') : tmTglParse_(s('tanggal'));
      const rec = { NAMA: s('nama'), CID: s('cid').replace(/\s+/g, ''), ODP: tmOdpAkhir_(s('odp')), POP: tmPop_(s('pop')),
                    SN: tmCleanCode_(s('sn')), PSN: tmCleanCode_(s('psn')), KET: s('ket'), TANGGAL: tglIso ? tmTglIndo_(tglIso) : s('tanggal') };
      const snLama = tmNorm_(s('snlama'));
      if (!nama || (!rec.CID && !rec.SN && !rec.PSN)) { lewati(x, 'tidak ada CID / SN', 'ditolak'); return; }
      if (!rec.POP) { lewati(x, 'kode ODP bukan PRBGN / PTCRMN' + (s('popasli') ? ' dan POP "' + s('popasli') + '" bukan Perbaungan / Pantai Cermin' : ' dan POP tidak tertulis Perbaungan / Pantai Cermin'), 'pop'); return; }
      const tujuan = M[nama];
      const lengkapi = (dst, src) => TM_KEYS_IW.forEach(k => { if (k !== 'TANGGAL' && k !== 'KET' && !String(rec[k] || '').trim() && String(src[k] || '').trim()) rec[k] = String(src[k]).trim(); });

      // 1) MT ganti perangkat: SN lama di Instalasi -> lengkapi data, lalu hapus baris Instalasi lama
      if (nama === 'MT' && snLama && snLama !== tmNorm_(rec.SN)) {
        M.Instalasi.rows.concat(M.Instalasi.baru).filter(r => !r.del && sn(r) === snLama).forEach(r => {
          lengkapi(rec, r.o); r.del = true; hasil.dihapus++;
        });
      }
      // 1b) Instalasi: CID sama tetapi SN berbeda = ganti perangkat -> perbarui SN & P-SN di baris yang sama (bukan baris baru)
      if (nama === 'Instalasi' && rec.CID && (rec.SN || rec.PSN) && !(rec.SN && semua().some(r => sn(r) === tmNorm_(rec.SN)))) {
        const lama = M.Instalasi.rows.concat(M.Instalasi.baru).filter(r => !r.del && tmNorm_(r.o.CID) === tmNorm_(rec.CID));
        if (lama.length) {
          const t0 = lama.slice().sort((a, b) => (a.tgl || '').localeCompare(b.tgl || '')).pop();
          if ((t0.tgl || '') > tglIso) { lewati(x, 'CID sama, di sheet sudah ada data yang lebih baru', 'dobel'); return; }
          lengkapi(rec, t0.o);
          ['SN', 'PSN', 'TANGGAL'].forEach(k => { if (String(t0.o[k] == null ? '' : t0.o[k]) !== String(rec[k] || '')) { t0.o[k] = rec[k] || ''; t0.upd[k] = rec[k] || ''; } });
          t0.tgl = tglIso; hasil.diperbarui++; lepas.push({ rec: rec, tgl: tglIso });
          lama.forEach(r => { if (r !== t0) { r.del = true; hasil.dihapus++; } });
          return;
        }
      }
      // 2) SN sama -> yang terbaru menang
      if (rec.SN) {
        const cocok = semua().filter(r => sn(r) === tmNorm_(rec.SN));
        if (cocok.length) {
          const terbaru = cocok.slice().sort((a, b) => (a.tgl || '').localeCompare(b.tgl || '')).pop();
          if ((terbaru.tgl || '') > tglIso) { lewati(x, 'SN sama, di sheet sudah ada data yang lebih baru', 'dobel'); return; }                 // data di sheet lebih baru: lewati
          if ((terbaru.tgl || '') === tglIso) {                                          // sama persis: hanya lengkapi yang kosong
            ['NAMA', 'CID', 'ODP', 'POP', 'PSN'].forEach(k => { if (!String(terbaru.o[k] || '').trim() && rec[k]) { terbaru.o[k] = rec[k]; terbaru.upd[k] = rec[k]; } });
            lewati(x, 'SN dan tanggal sama dengan data yang sudah ada (duplikat)', 'dobel'); return;
          }
          // rec lebih baru: lengkapi dari yang lama, hapus semua yang lama kecuali satu di sheet tujuan (diperbarui di tempat)
          cocok.forEach(r => lengkapi(rec, r.o));
          const sama = cocok.find(r => (tujuan.rows.indexOf(r) >= 0) || (tujuan.baru.indexOf(r) >= 0));
          cocok.forEach(r => { if (r !== sama) { r.del = true; hasil.dihapus++; } });
          if (sama) {
            TM_KEYS_IW.forEach(k => { if (rec[k] !== undefined && String(rec[k]).trim() !== '' && String(sama.o[k] == null ? '' : sama.o[k]) !== String(rec[k])) { sama.o[k] = rec[k]; sama.upd[k] = rec[k]; } });
            sama.tgl = tglIso; hasil.diperbarui++; if (nama === 'Instalasi') lepas.push({ rec: rec, tgl: tglIso }); return;
          }
        }
      } else {
        // tanpa SN: duplikat bila CID + TANGGAL + P-SN sama
        const kk = tmNorm_(rec.CID) + '|' + tglIso + '|' + tmNorm_(rec.PSN);
        if (semua().some(r => !sn(r) && (tmNorm_(r.o.CID) + '|' + r.tgl + '|' + tmNorm_(r.o.PSN)) === kk)) { lewati(x, 'duplikat (CID, tanggal, P-SN sama)', 'dobel'); return; }
      }
      // 3) lengkapi nama/ODP/POP dari baris lain dengan CID yang sama
      if (rec.CID) semua().filter(r => tmNorm_(r.o.CID) === tmNorm_(rec.CID)).forEach(r => lengkapi(rec, r.o));
      tujuan.baru.push({ row: 0, o: rec, tgl: tglIso, upd: {}, del: false });
      hasil[nama]++; if (nama === 'Instalasi') lepas.push({ rec: rec, tgl: tglIso });
    });

    // tulis: perbarui di tempat -> tambah baris -> hapus (dari bawah)
    ['Instalasi', 'MT'].forEach(n => {
      const m = M[n];
      m.rows.forEach(r => Object.keys(r.upd).forEach(k => { const c = m.canon.indexOf(k) + 1; if (c > 0) m.sh.getRange(r.row, c).setValue(tmCell_(k, r.upd[k])); }));
      m.baru.filter(r => !r.del).forEach(r => tmAppendObj_(m.sh, r.o));
      m.rows.filter(r => r.del).map(r => r.row).sort((a, b) => b - a).forEach(r => m.sh.deleteRow(r));
    });
    hasil.perangkatDipakaiUlang = tmLepasDiambil_(lepas, au);
    return { status: 'success', hasil: hasil, message: 'Instalasi +' + hasil.Instalasi + ', MT +' + hasil.MT + ', diperbarui ' + hasil.diperbarui + ', dobel/lebih lama dilewati ' + hasil.dobel + ', baris lama dihapus ' + hasil.dihapus + ', ditolak ' + hasil.ditolak + ', POP salah ' + hasil.pop };
  } finally {
    lock.releaseLock();
  }
}

/* ===================== BERSIHKAN DATA (admin) ===================== */
// Tombol 1: hapus CID dobel antara Full Data & target (yang disimpan: Full Data) + hapus yang CID-nya sudah ada di "kunjungan".
// Tombol 2: setelah tidak ada dobel, hapus CID yang sudah ada di "sudah diambil" dari Full Data, target, dan kunjungan.
// d.dry = true -> hanya pratinjau (tidak menghapus apa pun). Setiap penghapusan dicatat di sheet "LOG HAPUS BERSIH".
function tmCidDigit_(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
function tmBacaCid_(nama) {
  const sh = tmSheet_(nama);
  if (!sh || sh.getLastRow() < 2) return { nama: nama, sh: sh, v: [], list: [] };
  const v = sh.getDataRange().getValues();
  const canon = v[0].map(tmCanon_);
  // Kolom CID: pakai judul "CID" bila isinya memang nomor 10+ digit; bila judul tidak cocok dengan isi
  // (mis. sheet kunjungan yang judulnya salah geser) cari kolom yang isinya paling mirip CID.
  const skor = c => { let n = 0, d = 0; for (let r = 1; r < v.length; r++) { const t = String(v[r][c] == null ? '' : v[r][c]).trim(); if (!t) continue; n++; if (/^\d{10,}$/.test(t.replace(/\D/g, '')) && /^[\d\s]+$/.test(t)) d++; } return n ? d / n : 0; };
  let i = canon.indexOf('CID');
  if (i < 0 || skor(i) < 0.5) {
    let best = -1, bs = 0;
    for (let c = 0; c < canon.length; c++) { const sc = skor(c); if (sc > bs) { bs = sc; best = c; } }
    if (best >= 0 && bs >= 0.5) i = best;
    else if (i < 0) throw new Error('Sheet "' + nama + '" tidak punya kolom CID.');
  }
  const list = [];
  const mirip = t => { t = String(t == null ? '' : t).trim(); return /^\d{10,}$/.test(t) && t.indexOf('62') !== 0; };   // nomor HP (62...) bukan CID
  for (let r = 1; r < v.length; r++) {
    let c = tmCidDigit_(v[r][i]);
    if (!mirip(v[r][i])) {                                   // baris yang bergeser kolom: cari sel yang mirip CID
      const k = v[r].findIndex(mirip);
      c = k >= 0 ? tmCidDigit_(v[r][k]) : c;
    }
    if (c) list.push({ row: r + 1, cid: c });
  }
  const cidRow = {}; list.forEach(x => { cidRow[x.row] = x.cid; });
  return { nama: nama, sh: sh, v: v, list: list, iCid: i, cidRow: cidRow };
}
function tmRencanaDobel_(F, T, K) {
  const hapus = { F: {}, T: {} }, alasan = {};
  const tandai = (X, key, row, why) => { if (!hapus[key][row]) { hapus[key][row] = why; } };
  const pegang = {};
  F.list.forEach(x => { if (pegang[x.cid]) tandai(F, 'F', x.row, 'dobel di Full Data'); else pegang[x.cid] = true; });
  const dlmT = {};
  T.list.forEach(x => {
    if (dlmT[x.cid]) tandai(T, 'T', x.row, 'dobel di target');
    else { dlmT[x.cid] = true; if (pegang[x.cid]) tandai(T, 'T', x.row, 'dobel dengan Full Data'); }
  });
  const kunj = {}; K.list.forEach(x => { kunj[x.cid] = true; });
  F.list.forEach(x => { if (kunj[x.cid]) hapus.F[x.row] = 'CID sudah ada di kunjungan'; });
  T.list.forEach(x => { if (kunj[x.cid]) hapus.T[x.row] = 'CID sudah ada di kunjungan'; });
  return hapus;
}
function tmHapusBaris_(X, peta, tombol, admin, logRows) {
  const rows = Object.keys(peta).map(Number).sort((a, b) => a - b);
  rows.forEach(r => logRows.push([Utilities.formatDate(new Date(), TM.TZ, 'dd/MM/yyyy HH:mm:ss'), admin, tombol, X.nama, (X.cidRow && X.cidRow[r]) || tmCidDigit_(X.v[r - 1][X.iCid]), peta[r], X.v[r - 1].map(c => c instanceof Date ? tmIso_(c) : String(c)).join(' | ')]));
  // hapus per kelompok baris berurutan, dari bawah
  const grup = [];
  rows.forEach(r => { const g = grup[grup.length - 1]; if (g && g[1] === r - 1) g[1] = r; else grup.push([r, r]); });
  for (let i = grup.length - 1; i >= 0; i--) X.sh.deleteRows(grup[i][0], grup[i][1] - grup[i][0] + 1);
}
function tmBersihLog_(logRows) {
  if (!logRows.length) return;
  const sh = tmSS_().getSheetByName('LOG HAPUS BERSIH') || (function () { const s = tmSS_().insertSheet('LOG HAPUS BERSIH'); s.appendRow(['WAKTU', 'ADMIN', 'TOMBOL', 'SHEET', 'CID', 'ALASAN', 'ISI BARIS']); s.setFrozenRows(1); return s; })();
  sh.getRange(sh.getLastRow() + 1, 1, logRows.length, 7).setNumberFormat('@').setValues(logRows);
}
function tmRingkasHapus_(hapus) {
  const hit = {};
  Object.keys(hapus).forEach(k => Object.keys(hapus[k]).forEach(r => { const w = hapus[k][r]; hit[w] = (hit[w] || 0) + 1; }));
  return hit;
}
function tmBersih_(d, au, tombol) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const F = tmBacaCid_(TM.SH.FULL), T = tmBacaCid_(TM.SH.TARGET), K = tmBacaCid_(TM.SH.KUNJUNGAN);
    if (!F.sh || !T.sh) return tmErr_('Sheet Full Data / target tidak ditemukan.');
    let hapus, hapusK = {}, perlu = '';
    if (tombol === 1) {
      hapus = tmRencanaDobel_(F, T, K);
    } else {
      // syarat: tidak boleh ada dobel F/T lagi
      const sisa = tmRencanaDobel_(F, T, { list: [] });
      const n = Object.keys(sisa.F).length + Object.keys(sisa.T).length;
      if (n) return tmErr_('Masih ada ' + n + ' data dobel antara Full Data dan target. Jalankan tombol 1 dulu.');
      const D = tmBacaCid_(TM.SH.DIAMBIL);
      const ambil = {}; D.list.forEach(x => { ambil[x.cid] = true; });
      hapus = { F: {}, T: {} };
      F.list.forEach(x => { if (ambil[x.cid]) hapus.F[x.row] = 'CID sudah ada di sudah diambil'; });
      T.list.forEach(x => { if (ambil[x.cid]) hapus.T[x.row] = 'CID sudah ada di sudah diambil'; });
      K.list.forEach(x => { if (ambil[x.cid]) hapusK[x.row] = 'CID sudah ada di sudah diambil'; });
    }
    const jml = { 'Full Data': Object.keys(hapus.F).length, 'target': Object.keys(hapus.T).length, 'kunjungan': Object.keys(hapusK).length };
    const rinci = {}; const t1 = tmRingkasHapus_(hapus), t2 = tmRingkasHapus_({ K: hapusK });
    Object.keys(t1).forEach(k => { rinci[k] = (rinci[k] || 0) + t1[k]; }); Object.keys(t2).forEach(k => { rinci[k] = (rinci[k] || 0) + t2[k]; });
    const total = jml['Full Data'] + jml.target + jml.kunjungan;
    if (d.dry) return { status: 'success', dry: true, jumlah: jml, rinci: rinci, total: total, message: total ? 'Akan dihapus ' + total + ' baris.' : 'Tidak ada yang perlu dihapus.' };
    const logRows = [];
    tmHapusBaris_(F, hapus.F, 'Tombol ' + tombol, au.user, logRows);
    tmHapusBaris_(T, hapus.T, 'Tombol ' + tombol, au.user, logRows);
    if (K.sh && Object.keys(hapusK).length) tmHapusBaris_(K, hapusK, 'Tombol ' + tombol, au.user, logRows);
    tmBersihLog_(logRows);
    return { status: 'success', dry: false, jumlah: jml, rinci: rinci, total: total, message: 'Selesai. Dihapus ' + total + ' baris (Full Data ' + jml['Full Data'] + ', target ' + jml.target + ', kunjungan ' + jml.kunjungan + ').' };
  } finally {
    lock.releaseLock();
  }
}

/* ===================== OTOMATIS HARIAN ===================== */
function jalankanHarian() {
  const baru = tmRead_(TM.SH.LOG).filter(r => r.JENIS === 'TERMINATE' && !r.ARSIP && tmNorm_(r.CID));
  if (baru.length) {
    // Format sama dengan teks WhatsApp yang dibaca handleHapusArsip (tanggal + blok An/Cid/Sn/P-Sn/Odp/Ket)
    const ket = r => /perangkat\s+sudah\s+di\s?ambil/i.test(r.KET || '') ? r.KET : ((r.KET ? r.KET + '. ' : '') + 'Perangkat sudah diambil');
    const teks = tmTglIndo_(tmIso_(new Date())) + '\n\n' + baru.map(r => 'An : ' + (r.NAMA || '-') + '\nCid : ' + r.CID + '\nSn : ' + (r.SN || '-') +
      '\nP-Sn : ' + (r.PSN || '-') + '\nOdp : ' + (r.ODP || '-') + '\nKet : ' + ket(r)).join('\n\n');
    const hasil = tmPanggilHapusArsip_(teks);
    tmTandaiDiambil_(baru);
    if (hasil.ok) {
      const t = new Date();
      const ids = {}; baru.forEach(r => { ids[String(r.ID)] = true; });
      const pred = r => ids[String(r.ID)] === true;
      [TM.SH.LOG, TM.SH.TERMINATE].forEach(n => { const sh = tmSheet_(n); if (sh) tmEnsureCols_(sh, ['ARSIP']); });
      tmUpdateRows_(TM.SH.LOG, pred, { ARSIP: t });
      tmUpdateRows_(TM.SH.TERMINATE, pred, { ARSIP: t });
    } else {
      Logger.log('Hapus & Arsip dilewati: ' + hasil.msg);
    }
  }
  tmBersihkan_();
}
function tmPanggilHapusArsip_(teks) {
  // 0) fungsi asli "Hapus & Arsip WA" di Kode.gs
  if (typeof handleHapusArsip === 'function') {
    try {
      const j = handleHapusArsip(teks);
      if (j && j.status === 'success') return { ok: true, msg: j.message };
      return { ok: false, msg: (j && j.message) || 'handleHapusArsip menolak' };
    } catch (e) { return { ok: false, msg: e.message }; }
  }
  // 1) lewat doPost yang sama dengan tombol "Hapus & Arsip WA" di halaman Laporan
  if (typeof doPost === 'function') {
    try {
      const out = doPost({ postData: { contents: JSON.stringify({ action: 'hapusArsipSelektif', teksCid: teks }) } });
      const j = JSON.parse(out.getContent());
      if (j && j.status === 'success') return { ok: true };
      return { ok: false, msg: (j && j.message) || 'doPost menolak aksi hapusArsipSelektif' };
    } catch (e) { /* lanjut ke cara 2 */ }
  }
  // 2) panggil fungsinya langsung bila ada
  if (typeof hapusArsipSelektif === 'function') {
    try { hapusArsipSelektif(teks); return { ok: true }; } catch (e) { return { ok: false, msg: e.message }; }
  }
  return { ok: false, msg: 'Aksi Hapus & Arsip tidak ditemukan di Code.gs.' };
}
// Tulis siapa yang mengambil di sheet "sudah diambil" (perbarui baris bila CID sudah ada, kalau belum tambah baris)
function tmTandaiDiambil_(recs) {
  const sh = tmSheetEnsure_(TM.SH.DIAMBIL, ['NAMA', 'CID', 'ODP', 'SN', 'PSN', 'POP', 'TANGGAL']);
  const cAdm = tmColByLabel_(sh, 'DIAMBIL OLEH'), cFoto = tmColByLabel_(sh, 'FOTO');
  const canon = tmHeaders_(sh).map(tmCanon_);
  const iCid = canon.indexOf('CID'), iSn = canon.indexOf('SN');
  const v = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues() : [];
  recs.forEach(rec => {
    let baris = -1;
    for (let r = v.length - 1; r >= 0; r--) {
      const cocokCid = tmNorm_(rec.CID) && iCid >= 0 && tmNorm_(v[r][iCid]) === tmNorm_(rec.CID);
      const cocokSn = !tmNorm_(rec.CID) && tmNorm_(rec.SN) && iSn >= 0 && tmNorm_(v[r][iSn]) === tmNorm_(rec.SN);
      if (cocokCid || cocokSn) { baris = r + 2; break; }
    }
    if (baris > 0) {
      sh.getRange(baris, cAdm).setValue(rec.ADMIN);
      sh.getRange(baris, cFoto).setValue(rec.FOTO);
    } else {
      tmAppendObj_(sh, { NAMA: rec.NAMA, CID: rec.CID, ODP: rec.ODP, POP: rec.POP, SN: rec.SN, PSN: rec.PSN,
                         TANGGAL: tmTglIndo_(tmIso_(rec.WAKTU)), ADMIN: rec.ADMIN, FOTO: rec.FOTO });
    }
  });
  try { tmDedupCid_(TM.SH.DIAMBIL); } catch (e) { Logger.log('rapikan sudah diambil gagal: ' + e.message); }   // satu CID satu baris
}
// Hapus baris kerja buatan halaman ini yang sudah lewat JAM_HAPUS. LOG TIDAK pernah dihapus.
function tmBersihkan_() {
  const batas = Date.now() - TM.JAM_HAPUS * 3600 * 1000;
  let total = 0;
  [TM.SH.TERMINATE, TM.SH.KUNJUNGAN, TM.SH.LANJUT].forEach(nama => {
    const sh = tmSheet_(nama);
    if (!sh || sh.getLastRow() < 2) return;
    const v = sh.getDataRange().getValues();
    const canon = v[0].map(tmCanon_);
    const iW = canon.indexOf('WAKTU'), iSum = canon.indexOf('SUMBER'), iSt = canon.indexOf('STATUS'), iAr = canon.indexOf('ARSIP');
    if (iW < 0 || iSum < 0) return;
    for (let r = v.length - 1; r >= 1; r--) {
      const w = v[r][iW];
      if (!(w instanceof Date) || String(v[r][iSum]) !== TM.SUMBER || w.getTime() > batas) continue;
      if (nama === TM.SH.TERMINATE && iSt >= 0 && v[r][iSt] === 'TERMINATE' && (iAr < 0 || !v[r][iAr])) continue;   // belum diarsip: jangan dihapus
      sh.deleteRow(r + 1);
      total++;
    }
  });
  Logger.log('Baris kerja dihapus (> ' + TM.JAM_HAPUS + ' jam): ' + total);
}

/* ===================== PASANG SEKALI ===================== */
function izinkan() {
  DriveApp.getFoldersByName(TM.FOLDER_FOTO);   // meminta izin Drive
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });   // meminta izin akses eksternal (AI, imgbb)
  tmSheetEnsure_(TM.SH.LOG, TM_LOG_KEYS);
  tmSecret_();
  Logger.log('Izin OK. Sheet LOG TERMINATE siap.');
}
function pasangTriggerHarian() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'jalankanHarian').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('jalankanHarian').timeBased().everyDays(1).atHour(TM.JAM_TRIGGER).create();
  Logger.log('Trigger harian terpasang, jam ' + TM.JAM_TRIGGER);
}

// SN / P-SN untuk daftar CID (dibaca dari Baris 1, Baris 2, Instalasi, MT, Full Data, target; yang paling akhir menang)
function tmSnCid_(d) {
  const want = {}; (Array.isArray(d.cids) ? d.cids : []).slice(0, 300).forEach(c => { const k = tmCidDigit_(c); if (k) want[k] = true; });
  const peta = {};
  [TM.SH.TARGET, TM.SH.FULL, TM.SH.MT, TM.SH.INSTALASI, TM.SH.B2, TM.SH.B1].forEach(nm => {
    let rows = []; try { rows = tmRead_(nm); } catch (e) { rows = []; }
    rows.forEach(r => { const k = tmCidDigit_(r.CID); if (want[k] && (String(r.SN || '').trim() || String(r.PSN || '').trim())) peta[k] = { sn: String(r.SN || '').trim(), psn: String(r.PSN || '').trim() }; });
  });
  return { status: 'success', data: peta };
}

// Perangkat (SN / P-SN) yang kini terpasang di Instalasi baru tidak boleh lagi tercatat sebagai "sudah diambil" dari client lama:
// baris di "sudah diambil" dengan SN / P-SN yang sama dihapus (dicatat di LOG HAPUS BERSIH). Riwayat di LOG TERMINATE tidak diubah.
function tmLepasDiambil_(recs, au) {
  const sh = tmSheet_(TM.SH.DIAMBIL); if (!sh || sh.getLastRow() < 2 || !recs.length) return 0;
  const v = sh.getDataRange().getValues(), canon = v[0].map(tmCanon_), iS = canon.indexOf('SN'), iP = canon.indexOf('PSN'), iC = canon.indexOf('CID');
  if (iS < 0 && iP < 0) return 0;
  const iT = canon.indexOf('TANGGAL'), sn = {}, psn = {};
  recs.forEach(x => { const r = x.rec, k = tmNorm_(r.SN), p = tmNorm_(r.PSN); if (k && !(sn[k] && sn[k].tgl > x.tgl)) sn[k] = { cid: r.CID, tgl: x.tgl }; if (p && !(psn[p] && psn[p].tgl > x.tgl)) psn[p] = { cid: r.CID, tgl: x.tgl }; });
  const lebihBaru = (h, tgl) => { const d = iT >= 0 ? tmTglParse_(h[iT]) : ''; return !d || d <= tgl; };   // yang dihapus hanya yang diambil SEBELUM / pada tanggal Instalasi itu
  const hapus = [], log = [];
  for (let r = v.length - 1; r >= 1; r--) {
    const a = iS >= 0 ? tmNorm_(v[r][iS]) : '', b = iP >= 0 ? tmNorm_(v[r][iP]) : '';
    const ma = a && sn[a], mb = b && psn[b];
    if ((ma && lebihBaru(v[r], ma.tgl)) || (mb && lebihBaru(v[r], mb.tgl))) {
      hapus.push(r + 1);
      log.push([new Date(), au.user, 'IMPOR INSTALASI', TM.SH.DIAMBIL, iC >= 0 ? String(v[r][iC]) : '', 'perangkat dipakai ulang di Instalasi baru (CID ' + ((ma || mb).cid || '-') + ')', v[r].map(x => (x instanceof Date ? tmIso_(x) : String(x))).join(' | ').slice(0, 400)]);
    }
  }
  hapus.forEach(r => sh.deleteRow(r));
  try { tmBersihLog_(log); } catch (e) { Logger.log('log lepas: ' + e.message); }
  return hapus.length;
}

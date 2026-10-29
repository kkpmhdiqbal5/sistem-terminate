/*****************************************************************
 * ChatBaru.gs  -  tambahan Chat Client (file BARU di Apps Script, nama bebas: ChatBaru)
 * Isi: cek koneksi webhook, lokasi (Sherlock), ubah status lanjut/berhenti, pengingat, kuota harian.
 * Butuh Terminate.gs dan ChatClient.gs versi terbaru.
 *****************************************************************/
const CB = { MAX_INGAT: 3, JEDA_JAM: 4, SH_HOOK: 'WEBHOOK LOG' };

/* ---------- kuota harian (semua akun): pesan awal + pengingat ---------- */
function ccSisaHari_() {
  const v = Number(PropertiesService.getScriptProperties().getProperty('KUOTA_' + tmIso_(new Date()))) || 0;
  return Math.max(0, CC.MAX_HARI - v);
}
// shortcut: kunci KUOTA_tanggal lama tidak dihapus (kecil), bersihkan manual bila perlu
function ccPakaiKuota_(n) {
  const p = PropertiesService.getScriptProperties(), k = 'KUOTA_' + tmIso_(new Date());
  p.setProperty(k, String((Number(p.getProperty(k)) || 0) + n));
}

/* ---------- log webhook (untuk "Cek koneksi balasan") ---------- */
function ccHookLog_(phone, isi, hasil) {
  try {
    const sh = tmSheetEnsure_(CB.SH_HOOK, ['WAKTU', 'PHONE', 'ISI', 'HASIL']);
    tmAppendObj_(sh, { WAKTU: new Date(), PHONE: phone, ISI: String(isi || '').slice(0, 200), HASIL: String(hasil || '').slice(0, 200) });
    if (sh.getLastRow() > 400) sh.deleteRows(2, 200);
  } catch (e) { Logger.log('hook log: ' + e.message); }
}
function ccDiag_() {
  const sec = ccProp_('WA_HOOK_SECRET'), e = ccApiPilih_('CHAT_CLIENT', 'WA');
  let device = e ? '' : 'Belum ada API WhatsApp berfungsi "Chat client".';
  if (e) {
    try {
      const res = UrlFetchApp.fetch('https://api.fonnte.com/device', { method: 'post', headers: { Authorization: e.token }, muteHttpExceptions: true });
      const j = JSON.parse(res.getContentText());
      device = j.status === false ? 'Token ditolak Fonnte: ' + (j.reason || '') : 'Perangkat: ' + (j.device_status || j.status || '?') + (j.device ? ' (' + j.device + ')' : '');
    } catch (x) { device = 'Tidak bisa cek perangkat Fonnte: ' + x.message; }
  }
  const log = tmRead_(CB.SH_HOOK).slice(-8).reverse().map(r => ({ waktu: tmWaktuTxt_(r.WAKTU), phone: String(r.PHONE || ''), isi: String(r.ISI || ''), hasil: String(r.HASIL || '') }));
  const masuk = tmRead_(CC.SH.LOG).filter(r => r.ARAH === 'IN').length;
  return { status: 'success', masuk: masuk, hook: !!sec, url: ScriptApp.getService().getUrl(), device: device, sisaHari: ccSisaHari_(), log: log };
}

/* ---------- lokasi / Sherlock ---------- */
function ccLokasi_(m) {
  const lok = String(m.lokasi || '').trim();
  const koor = s => { const x = String(s).match(/(-?\d{1,2}\.\d{3,})\s*[,;]\s*(-?\d{2,3}\.\d{3,})/); return x ? 'https://maps.google.com/?q=' + x[1] + ',' + x[2] : ''; };
  if (lok) return koor(lok) || (/^https?:/i.test(lok) ? lok.slice(0, 300) : '');
  const t = String(m.pesan || '');
  const u = t.match(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)\S*/i);
  return u ? u[0].slice(0, 300) : koor(t);
}
// tulis nilai ke kolom (mis. SHERLOCK) pada Full Data, target, Baris 1 untuk CID itu
function ccTulisKolom_(cid, kolom, nilai) {
  [TM.SH.FULL, TM.SH.TARGET, TM.SH.B1].forEach(nm => {
    try {
      const X = tmBacaCid_(nm), hit = X.list.filter(x => x.cid === cid);
      if (!hit.length) return;
      const col = tmColByLabel_(X.sh, kolom);
      hit.forEach(x => X.sh.getRange(x.row, col).setValue(nilai));
    } catch (e) { Logger.log('tulis ' + kolom + ' ' + nm + ': ' + e.message); }
  });
}
function ccTerimaLokasi_(m, row, lok, setS, balas, cid) {
  tmLogChat_(m.phone, cid, 'IN', '[lokasi] ' + lok);
  setS(String(row.STATUS), { SHERLOCK: lok });
  ccTulisKolom_(cid, 'SHERLOCK', lok);
  const siap = ccCekSiapB1_(cid);
  balas(siap ? 'Terima kasih, lokasi dan foto rumah sudah lengkap. Teknisi kami akan segera menghubungi/datang untuk pengambilan perangkat. 🙏'
    : row.FOTORUMAH ? 'Terima kasih, lokasi rumah sudah kami terima. 🙏'
    : 'Terima kasih, lokasi rumah sudah kami terima. Mohon kirim juga *foto rumah* (tampak depan) ya. 🙏');
}
// foto rumah + lokasi lengkap -> status SIAP_DIAMBIL dan masuk Baris 1 (sekali)
function ccCekSiapB1_(cid) {
  const row = tmRead_(CC.SH.CHAT).filter(r => tmCidDigit_(r.CID) === cid).pop();
  if (!row || !row.FOTORUMAH || !row.SHERLOCK) return false;
  if (['MINTA_FOTO', 'FOTO_DITERIMA', 'BERHENTI', 'SIAP_DIAMBIL'].indexOf(String(row.STATUS)) < 0) return false;
  try {
    let sudah = false; try { sudah = tmBacaCid_(TM.SH.B1).list.some(x => x.cid === cid); } catch (e) { sudah = false; }
    if (!sudah) {
      const src = tmRead_(TM.SH.FULL).concat(tmRead_(TM.SH.TARGET)).filter(r => tmCidDigit_(r.CID) === cid)[0] || {};
      const sh = tmSheetEnsure_(TM.SH.B1, ['NAMA', 'CID', 'ODP', 'POP']);
      const ada = tmHeaders_(sh).map(tmCanon_), obj = {};
      Object.keys(src).forEach(k => { if (k !== '_row' && ada.indexOf(k) >= 0) obj[k] = src[k]; });   // hanya kolom yang sudah ada di Baris 1
      Object.assign(obj, { NAMA: src.NAMA || row.NAMA, CID: cid, ODP: src.ODP || row.ODP, POP: src.POP || row.POP, FOTORUMAH: row.FOTORUMAH, SHERLOCK: row.SHERLOCK });
      tmAppendObj_(sh, obj);
    }
    tmUpdateRows_(CC.SH.CHAT, r => tmCidDigit_(r.CID) === cid, { STATUS: 'SIAP_DIAMBIL' });
    ccNotif_('✅ Client berhenti siap diambil (masuk Baris 1)\nNama : ' + (row.NAMA || '-') + '\nCID : ' + cid);
    return true;
  } catch (e) { Logger.log('B1: ' + e.message); return false; }
}

/* ---------- ubah status (kotak centang) ---------- */
const CB_PAUSE = () => Utilities.sleep(2500 + Math.floor(Math.random() * 3500));
function ccSalam_() { const h = Number(Utilities.formatDate(new Date(), TM.TZ, 'H')); return h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 18 ? 'sore' : 'malam'; }
function ccItems_(d) { return (Array.isArray(d.items) ? d.items : []).slice(0, CC.MAX_KIRIM).map(x => ({ phone: String(x.phone || '').trim(), cid: tmCidDigit_(x.cid) })).filter(x => x.phone); }
function ccUbahStatus_(d, au) {
  const st = String(d.status || '').toUpperCase();
  if (['LANJUT_DILAPOR', 'BERHENTI_DILAPOR', 'SALAH_NOMOR'].indexOf(st) >= 0) return ccTandaiManual_(d, au, st);
  if (['LANJUT', 'BERHENTI'].indexOf(st) < 0) return tmErr_('Status tidak dikenal.');
  const items = ccItems_(d); if (!items.length) return tmErr_('Pilih client dulu.');
  const kirim = d.kirim !== false, mulai = Date.now();
  const sh = tmSheetEnsure_(CC.SH.CHAT, CC_KEYS_CHAT); tmEnsureCols_(sh, CC_KEYS_CHAT);
  let diubah = 0, terkirim = 0; const catatan = [];
  items.forEach(it => {
    const row = ccBarisChat_(it.phone, it.cid);
    if (!row || !it.cid) { catatan.push(it.phone + ': data tidak ditemukan'); return; }
    const baru = st === 'LANJUT' ? 'MINTA_BUKTI' : (row.FOTORUMAH && row.SHERLOCK ? 'SIAP_DIAMBIL' : 'MINTA_FOTO');
    const sama = r => String(r.PHONE) === it.phone && tmCidDigit_(r.CID) === it.cid;
    tmUpdateRows_(CC.SH.CHAT, sama, { STATUS: baru, JMLINGAT: 0, WAKTUBALAS: new Date() });
    if (st === 'LANJUT') {                       // lanjut: masuk sheet lanjut, tidak perlu diambil lagi
      try {
        tmHapusCid_(TM.SH.LANJUT, it.cid); tmHapusCid_(TM.SH.B1, it.cid);
        tmAppendObj_(tmSheetEnsure_(TM.SH.LANJUT, ['ID', 'WAKTU', 'TANGGAL', 'ADMIN', 'NAMA', 'CID', 'ODP', 'POP', 'KET']),
          { ID: Utilities.getUuid(), WAKTU: new Date(), TANGGAL: tmTglIndo_(tmIso_(new Date())), ADMIN: au.user, NAMA: row.NAMA, CID: it.cid, ODP: row.ODP, POP: tmPop_(row.POP), KET: 'Client masih mau lanjut berlangganan (diubah admin)' });
      } catch (e) { catatan.push(it.cid + ': gagal pindah sheet'); }
    }
    tmLogChat_(it.phone, it.cid, 'OUT', '[admin ' + au.user + ' mengubah status: ' + st + ']');
    diubah++;
    if (!kirim || baru === 'SIAP_DIAMBIL') return;
    if (ccSisaHari_() < 1) { catatan.push(it.cid + ': kuota harian habis, pesan tidak dikirim'); return; }
    if (Date.now() - mulai > CC.MAKS_DETIK * 1000) { catatan.push(it.cid + ': waktu habis, pesan tidak dikirim'); return; }
    const nama = row.NAMA || 'Pelanggan';
    const teks = st === 'LANJUT'
      ? 'Terima kasih Bapak/Ibu ' + nama + ', kami catat Bapak/Ibu masih lanjut berlangganan. Agar data kami lengkap, mohon kirimkan *foto bukti* (misalnya bukti pembayaran/tagihan yang terlihat nama dan CID Bapak/Ibu). Terima kasih 🙏'
      : CC_MINTA_FOTO + ' Mohon juga *share lokasi (Sherlock)* rumah Bapak/Ibu lewat WhatsApp (ikon + lalu Lokasi).';
    const r = waKirim_(it.phone, teks, 'CHAT_CLIENT');
    if (!r.ok) { catatan.push(it.cid + ': gagal kirim (' + r.msg + ')'); return; }
    tmUpdateRows_(CC.SH.CHAT, sama, { WAKTUKIRIM: new Date(), PESANTERAKHIR: teks.slice(0, 120) });
    tmLogChat_(it.phone, it.cid, 'OUT', teks); ccPakaiKuota_(1); terkirim++; CB_PAUSE();
  });
  return { status: 'success', diubah: diubah, terkirim: terkirim, message: diubah + ' client diubah ke ' + st + (kirim ? ', ' + terkirim + ' pesan permintaan terkirim' : '') + '.' + (catatan.length ? ' Catatan: ' + catatan.slice(0, 6).join('; ') : '') };
}

/* ---------- ingatkan lagi (sopan, kalimat tidak diulang) ---------- */
function ccVarian_(st, nama, row) {
  const s = ccSalam_(), n = nama || 'Pelanggan';
  if (st === 'MINTA_FOTO') {
    const kurang = (row.FOTORUMAH ? '' : '*foto rumah* (tampak depan)') + (!row.FOTORUMAH && !row.SHERLOCK ? ' dan ' : '') + (row.SHERLOCK ? '' : '*lokasi rumah* (share lokasi WhatsApp)');
    return ['Selamat ' + s + ' Bapak/Ibu ' + n + ', mohon maaf mengganggu. Agar teknisi mudah menemukan rumah, kami masih menunggu ' + kurang + ' dari Bapak/Ibu. Terima kasih banyak 🙏',
      'Permisi Bapak/Ibu ' + n + ', jika berkenan mohon dikirimkan ' + kurang + ' ya, supaya proses pengambilan perangkat berjalan lancar. Terima kasih atas bantuannya 🙏',
      'Halo Bapak/Ibu ' + n + ', kami masih membutuhkan ' + kurang + ' untuk melengkapi data. Mohon sempatkan mengirimnya ketika ada waktu. Terima kasih 🙏',
      'Bapak/Ibu ' + n + ', sekadar mengingatkan dengan hormat: ' + kurang + ' belum kami terima. Mohon bantuannya, terima kasih 🙏'];
  }
  if (st === 'MINTA_BUKTI') {
    return ['Selamat ' + s + ' Bapak/Ibu ' + n + ', mohon maaf mengganggu. Kami masih menunggu *foto bukti* langganan (misalnya bukti pembayaran/tagihan dengan nama dan CID terlihat). Terima kasih 🙏',
      'Permisi Bapak/Ibu ' + n + ', jika berkenan mohon kirimkan foto bukti pembayaran/tagihan Bapak/Ibu ya, untuk melengkapi data kami. Terima kasih banyak 🙏',
      'Halo Bapak/Ibu ' + n + ', data Bapak/Ibu tinggal menunggu foto bukti. Mohon dikirim saat sempat ya. Terima kasih atas kerja samanya 🙏'];
  }
  return ['Selamat ' + s + ' Bapak/Ibu ' + n + ', mohon maaf mengganggu. Kami hanya ingin memastikan sekali lagi, apakah layanan internet ION Network masih akan dilanjutkan? Cukup balas *LANJUT* atau *TIDAK*. Terima kasih 🙏',
    'Permisi Bapak/Ibu ' + n + ', jika berkenan mohon konfirmasinya: layanan WiFi Bapak/Ibu mau diteruskan atau dihentikan? Balas *LANJUT* / *TIDAK* saja. Terima kasih banyak 🙏',
    'Halo Bapak/Ibu ' + n + ', kami menunggu kabar terkait langganan internetnya. Mohon sempatkan membalas *LANJUT* atau *TIDAK* agar data kami tepat. Terima kasih atas waktunya 🙏',
    'Mohon maaf mengulang, Bapak/Ibu ' + n + '. Supaya tim kami tidak salah langkah, boleh dikonfirmasi status langganannya (*LANJUT* atau *TIDAK*)? Terima kasih 🙏',
    'Bapak/Ibu ' + n + ', terima kasih atas kesediaannya. Kami masih menunggu konfirmasi langganan Bapak/Ibu, cukup balas satu kata: *LANJUT* atau *TIDAK*. 🙏'];
}
function ccIngatkan_(d, au) {
  const items = ccItems_(d); if (!items.length) return tmErr_('Pilih client dulu.');
  const sh = tmSheetEnsure_(CC.SH.CHAT, CC_KEYS_CHAT); tmEnsureCols_(sh, CC_KEYS_CHAT);
  const mulai = Date.now(); let terkirim = 0; const lewat = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i], row = ccBarisChat_(it.phone, it.cid), nama = row && row.NAMA || it.cid;
    const skip = w => lewat.push(nama + ': ' + w);
    if (!row || !it.cid) { skip('data tidak ditemukan'); continue; }
    const st = String(row.STATUS);
    if (CC.AKTIF.indexOf(st) < 0) { skip('tidak sedang menunggu balasan (' + st + ')'); continue; }
    const n = Number(row.JMLINGAT) || 0;
    if (n >= CB.MAX_INGAT) { skip('sudah ' + CB.MAX_INGAT + 'x diingatkan'); continue; }
    const t = [row.WAKTUINGAT, row.WAKTUKIRIM].filter(x => x instanceof Date).map(x => x.getTime()).sort((a, b) => b - a)[0] || 0;
    if (t && Date.now() - t < CB.JEDA_JAM * 3600 * 1000) { skip('belum ' + CB.JEDA_JAM + ' jam sejak pesan terakhir'); continue; }
    if (ccSisaHari_() < 1) { skip('kuota harian habis'); break; }
    if (Date.now() - mulai > CC.MAKS_DETIK * 1000) { skip('waktu habis'); break; }
    const pernah = ccRiwayat_(it.phone, 40).filter(x => x.dari === 'kami').map(x => x.isi);
    const pilih = ccVarian_(st, row.NAMA, row);
    const baru = pilih.filter(v => !pernah.some(p => p.indexOf(v.slice(v.indexOf(',') + 1, v.indexOf(',') + 40)) >= 0));   // jangan pakai kalimat yang sudah terkirim
    const daftar = baru.length ? baru : pilih;
    const teks = daftar[n % daftar.length];
    const r = waKirim_(it.phone, teks, 'CHAT_CLIENT');
    if (!r.ok) { skip('gagal kirim (' + r.msg + ')'); if (/token|disconnect|device/i.test(r.msg)) break; continue; }
    tmUpdateRows_(CC.SH.CHAT, x => String(x.PHONE) === it.phone && tmCidDigit_(x.CID) === it.cid, { JMLINGAT: n + 1, WAKTUINGAT: new Date(), PESANTERAKHIR: teks.slice(0, 120) });
    tmLogChat_(it.phone, it.cid, 'OUT', teks); ccPakaiKuota_(1); terkirim++;
    if (i < items.length - 1) CB_PAUSE();
  }
  return { status: 'success', terkirim: terkirim, dilewati: lewat, message: 'Pengingat terkirim ' + terkirim + ' dari ' + items.length + '.' + (lewat.length ? ' Dilewati: ' + lewat.slice(0, 8).join('; ') : '') };
}

/* ---------- Dashboard: verifikasi 2 tahap per client berhenti ---------- */
// Tahap 1 = verifikasi keputusan berhenti (bukti dari chat client). Tahap 2 = verifikasi hasil pengambilan (data tim terminate).
function ccJejakVerif_(au) { return au.user + ' | ' + Utilities.formatDate(new Date(), TM.TZ, 'dd/MM/yyyy HH:mm'); }
function ccVerifInfo_(d) {
  const cids = (Array.isArray(d.cids) ? d.cids : []).map(tmCidDigit_).filter(Boolean).slice(0, 500);
  const chat = {}; tmRead_(CC.SH.CHAT).forEach(r => { const c = tmCidDigit_(r.CID); if (c) chat[c] = r; });
  const ambil = {};
  tmRead_(TM.SH.LOG).filter(r => r.JENIS === 'TERMINATE').forEach(r => { ambil[tmCidDigit_(r.CID)] = r; });
  const out = {};
  cids.forEach(c => {
    const r = chat[c] || {}, a = ambil[c];
    out[c] = { chat: String(r.STATUS || ''), foto: String(r.FOTORUMAH || ''), sherlock: String(r.SHERLOCK || ''), balasan: String(r.PESANTERAKHIR || ''),
      v1: String(r.VERIFSTOP || ''), v2: String(r.VERIFAMBIL || ''),
      ambil: a ? { sn: String(a.SN || ''), psn: String(a.PSN || ''), foto: String(a.FOTO || ''), waktu: tmWaktuTxt_(a.WAKTU), oleh: String(a.ADMIN || '') } : null };
  });
  return { status: 'success', data: out };
}
function ccVerifSet_(cid, kolom, nilai) {
  const sh = tmSheetEnsure_(CC.SH.CHAT, CC_KEYS_CHAT); tmEnsureCols_(sh, CC_KEYS_CHAT);
  const n = tmUpdateRows_(CC.SH.CHAT, r => tmCidDigit_(r.CID) === cid, Object.fromEntries([[kolom, nilai]]));
  try { const X = tmBacaCid_(TM.SH.B1), hit = X.list.filter(x => x.cid === cid); if (hit.length) { const col = tmColByLabel_(X.sh, kolom === 'VERIFSTOP' ? 'VERIF BERHENTI' : 'VERIF AMBIL'); hit.forEach(x => X.sh.getRange(x.row, col).setValue(nilai)); } } catch (e) { /* Baris 1 tidak ada / tanpa CID */ }
  return n;
}
function ccVerifBerhenti_(d, au) {
  const cid = tmCidDigit_(d.cid); if (!cid) return tmErr_('CID kosong.');
  const r = tmRead_(CC.SH.CHAT).filter(x => tmCidDigit_(x.CID) === cid).pop();
  if (!r) return tmErr_('Client ini belum punya riwayat chat. Tahap 1 butuh bukti dari chat client.');
  if (['LANJUT', 'MINTA_BUKTI', 'BUKTI_DITERIMA'].indexOf(String(r.STATUS)) >= 0) return tmErr_('Client ini berstatus lanjut, bukan berhenti.');
  if (d.tolak) { tmUpdateRows_(CC.SH.CHAT, x => tmCidDigit_(x.CID) === cid, { STATUS: 'PERLU_ADMIN' }); tmLogChat_(String(r.PHONE), cid, 'OUT', '[verif berhenti DITOLAK oleh ' + au.user + ']'); return { status: 'success', message: 'Ditandai perlu ditinjau admin.' }; }
  ccVerifSet_(cid, 'VERIFSTOP', ccJejakVerif_(au));
  tmLogChat_(String(r.PHONE), cid, 'OUT', '[verif berhenti oleh ' + au.user + ']');
  return { status: 'success', message: 'Tahap 1 terverifikasi.' };
}
function ccVerifAmbil_(d, au) {
  const cid = tmCidDigit_(d.cid); if (!cid) return tmErr_('CID kosong.');
  const a = tmRead_(TM.SH.LOG).filter(r => r.JENIS === 'TERMINATE' && tmCidDigit_(r.CID) === cid).pop();
  if (!a) return tmErr_('Belum ada laporan pengambilan dari tim terminate untuk CID ini.');
  ccVerifSet_(cid, 'VERIFAMBIL', ccJejakVerif_(au));
  return { status: 'success', message: 'Tahap 2 terverifikasi.' };
}

/* ---------- daftar tujuan WhatsApp bernama (dipakai semua akun) ---------- */
function ccTujuanList_() { try { const a = JSON.parse(ccProp_('TUJUAN_LIST') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function ccTujuanSimpan_(d) {
  const nama = String(d.nama || '').trim().slice(0, 40), mentah = String(d.nomor || '').trim();
  const nomor = /@g\.us$/i.test(mentah) ? mentah : ccNoHp_(mentah);
  if (!nama) return tmErr_('Nama wajib diisi.');
  if (!nomor) return tmErr_('Nomor / ID grup tidak valid.');
  const lama = ccTujuanList_(), pernah = lama.filter(x => String(x.nama).toLowerCase() === nama.toLowerCase())[0];
  const a = lama.filter(x => String(x.nama).toLowerCase() !== nama.toLowerCase());
  a.push({ nama: nama, nomor: nomor, sumber: !!(pernah && pernah.sumber) });
  if (a.length > 100) return tmErr_('Maksimal 100 tujuan tersimpan. Hapus yang tidak dipakai.');
  PropertiesService.getScriptProperties().setProperty('TUJUAN_LIST', JSON.stringify(a));
  return { status: 'success', data: a, message: 'Tersimpan: ' + nama };
}
function ccTujuanHapus_(d) {
  const nama = String(d.nama || '').toLowerCase();
  const a = ccTujuanList_().filter(x => String(x.nama).toLowerCase() !== nama);
  PropertiesService.getScriptProperties().setProperty('TUJUAN_LIST', JSON.stringify(a));
  return { status: 'success', data: a };
}
// tandai / lepas grup sebagai SUMBER data masuk (laporan & file DOCX dibaca otomatis)
function ccTujuanSumber_(d) {
  const nomor = String(d.nomor || '').toLowerCase();
  const a = ccTujuanList_(); let ada = false;
  a.forEach(x => { if (String(x.nomor).toLowerCase() === nomor) { x.sumber = !!d.nyala; ada = true; } });
  if (!ada) return tmErr_('Tujuan tidak ditemukan.');
  PropertiesService.getScriptProperties().setProperty('TUJUAN_LIST', JSON.stringify(a));
  return { status: 'success', data: a, message: d.nyala ? 'Grup ini sekarang dibaca otomatis.' : 'Grup ini tidak lagi dibaca.' };
}

// penanda manual tanpa mengirim pesan: sudah dilaporkan (lanjut / berhenti) atau salah nomor
function ccTandaiManual_(d, au, st) {
  const items = ccItems_(d); if (!items.length) return tmErr_('Pilih client dulu.');
  const sh = tmSheetEnsure_(CC.SH.CHAT, CC_KEYS_CHAT); tmEnsureCols_(sh, CC_KEYS_CHAT);
  let n = 0;
  items.forEach(it => {
    const sama = r => String(r.PHONE) === it.phone && tmCidDigit_(r.CID) === it.cid;
    if (tmUpdateRows_(CC.SH.CHAT, sama, { STATUS: st, WAKTUBALAS: new Date() })) { n++; tmLogChat_(it.phone, it.cid, 'OUT', '[admin ' + au.user + ' menandai: ' + st + ']'); }
  });
  return { status: 'success', diubah: n, message: n + ' client ditandai ' + st.replace('_', ' ').toLowerCase() + '.' };
}

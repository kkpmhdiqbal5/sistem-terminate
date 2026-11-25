/* WhatsApp pribadi per sub admin: tiap orang punya gateway Railway sendiri (dibuat otomatis, scan QR di Chat Client).
 * Properti Skrip yang dibutuhkan (isi SEKALI oleh admin utama, jangan ditulis di chat/kode):
 *   RAILWAY_TOKEN        Account/Workspace token Railway (railway.com > Account Settings > Tokens)
 *   RAILWAY_PROJECT_ID   id project Railway tempat service dibuat
 *   RAILWAY_ENV_ID       id environment (production)
 * Tiap sub admin disimpan di properti GWU_<nama> (url, kunci, id service). Kunci tidak pernah dikirim ke browser. */
const GWU = { API: 'https://backboard.railway.com/graphql/v2', REPO: 'kkpmhdiqbal5/wa-gateway-pr', BRANCH: 'main',
  PROJECT: '075e1e5f-f2d4-4ae7-ad61-c3be25f35d4c', ENV: '5ddaad71-19be-44e3-8d56-eaf92c977b2c' };   // ID bukan rahasia; bisa ditimpa lewat properti RAILWAY_PROJECT_ID / RAILWAY_ENV_ID
function gwuPid_() { return ccProp_('RAILWAY_PROJECT_ID') || GWU.PROJECT; }
function gwuEid_() { return ccProp_('RAILWAY_ENV_ID') || GWU.ENV; }
function gwuNama_(user) { return 'GWU_' + String(user || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40); }
function gwuGql_(q, v) {
  const t = ccProp_('RAILWAY_TOKEN'); if (!t) throw new Error('RAILWAY_TOKEN belum diisi di Properti Skrip (admin utama).');
  const r = UrlFetchApp.fetch(GWU.API, { method: 'post', contentType: 'application/json', headers: /^rlwy_proj_/.test(t) ? { 'Project-Access-Token': t } : { Authorization: 'Bearer ' + t }, payload: JSON.stringify({ query: q, variables: v || {} }), muteHttpExceptions: true });
  let j = {}; try { j = JSON.parse(r.getContentText()); } catch (e) { /* bukan JSON */ }
  if (j.errors && j.errors.length) throw new Error('Railway: ' + String(j.errors[0].message).slice(0, 200));
  if (r.getResponseCode() !== 200 || !j.data) throw new Error('Railway HTTP ' + r.getResponseCode());
  return j.data;
}
/* Satu sub admin boleh punya BEBERAPA WhatsApp (gateway). Tiap WhatsApp: nama, fitur yang didukung (CHAT_CLIENT / TEKNISI / LAPORAN), status.
 * Disimpan permanen di properti GWU_<nama> sebagai daftar. Hanya pemilik (dan superadmin) yang bisa melihat/mengubah; kunci tidak pernah ke browser. */
const GWU_FITUR = { CHAT_CLIENT: 'Chat client', TEKNISI: 'Kirim ke teknisi', LAPORAN: 'Kirim laporan' };
function gwuFiturOk_(f) { return (Array.isArray(f) ? f : []).filter((x, i, a) => GWU_FITUR[x] && a.indexOf(x) === i); }
function gwuList_(user) {
  let v = null; try { v = JSON.parse(ccProp_(gwuNama_(user)) || 'null'); } catch (e) { v = null; }
  if (!v) return [];
  if (!Array.isArray(v)) v = [Object.assign({ id: 'g1', nama: 'WhatsApp utama', fitur: Object.keys(GWU_FITUR) }, v)];   // data lama (satu gateway)
  return v;
}
function gwuSimpanList_(user, list) { if (list.length) PropertiesService.getScriptProperties().setProperty(gwuNama_(user), JSON.stringify(list)); else PropertiesService.getScriptProperties().deleteProperty(gwuNama_(user)); }
function gwuBaca_(user) { return gwuList_(user)[0] || null; }
// tambah satu WhatsApp (gateway Railway baru) untuk sub admin yang login: d.nama, d.fitur[]
function gwuBuat_(au, d) {
  d = d || {};
  const user = au && au.user; if (!user) return tmErr_('Belum login.');
  const list = gwuList_(user); if (list.length >= 5) return tmErr_('Maksimal 5 WhatsApp per akun.');
  const fitur = gwuFiturOk_(d.fitur); if (!fitur.length) return tmErr_('Pilih minimal satu fitur untuk WhatsApp ini.');
  const nama = String(d.nama || '').trim().slice(0, 30) || ('WhatsApp ' + (list.length + 1));
  const pid = gwuPid_(), eid = gwuEid_(), hook = ccProp_('WA_HOOK_SECRET');
  if (!ccProp_('RAILWAY_TOKEN')) return tmErr_('Admin utama belum mengisi RAILWAY_TOKEN di Properti Skrip.');
  const exec = ScriptApp.getService().getUrl(); if (!exec || !hook) return tmErr_('Alamat web app / WA_HOOK_SECRET belum tersedia.');
  const id = 'g' + Date.now().toString(36), kirimKey = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''), qrKey = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const vars = { HOOK_URL: exec + '?hook=' + encodeURIComponent(hook) + '&tugas=CHAT&admin=' + encodeURIComponent(user) + '&gw=' + id, KIRIM_KEY: kirimKey, QR_KEY: qrKey, AUTH_DIR: '/data/auth', PRIBADI: '1', TERIMA_SENDIRI: '0', PAIR_PHONE: '' };
  try {
    const sid = gwuGql_('mutation($i: ServiceCreateInput!){ serviceCreate(input:$i){ id } }',
      { i: { projectId: pid, environmentId: eid, name: ('wa-' + gwuNama_(user).slice(4, 20) + '-' + id.slice(-5)).slice(0, 40), source: { repo: GWU.REPO }, branch: GWU.BRANCH, variables: vars } }).serviceCreate.id;
    const g = { id: id, nama: nama, fitur: fitur, serviceId: sid, kirimKey: kirimKey, qrKey: qrKey, url: '', status: 'MEMBUAT', dibuat: new Date().toISOString() };
    list.push(g); gwuSimpanList_(user, list);
    try { gwuGql_('mutation($i: VolumeCreateInput!){ volumeCreate(input:$i){ id } }', { i: { projectId: pid, environmentId: eid, serviceId: sid, mountPath: '/data' } }); } catch (eV) { Logger.log('volume: ' + eV.message); }
    const dom = gwuGql_('mutation($i: ServiceDomainCreateInput!){ serviceDomainCreate(input:$i){ domain } }', { i: { serviceId: sid, environmentId: eid } }).serviceDomainCreate.domain;
    g.url = 'https://' + dom;
    gwuGql_('mutation($i: VariableUpsertInput!){ variableUpsert(input:$i) }', { i: { projectId: pid, environmentId: eid, serviceId: sid, name: 'PUBLIC_URL', value: g.url } });
    gwuSimpanList_(user, list);
    return { status: 'success', message: 'WhatsApp "' + nama + '" sedang dibuat di Railway (sekitar 1-3 menit). QR muncul di sini begitu siap.' };
  } catch (e) { return tmErr_('Gagal membuat gateway: ' + e.message); }
}
function gwuStatusSatu_(user, g) {
  if (!g.url) return { state: 'MEMBUAT' };
  try {
    const r = UrlFetchApp.fetch(g.url + '/status?k=' + encodeURIComponent(g.qrKey), { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return { state: 'MEMBUAT' };
    const j = JSON.parse(r.getContentText());
    if (j.tersambung) { if (g.status !== 'TERHUBUNG') { g.status = 'TERHUBUNG'; const l = gwuList_(user); l.forEach(x => { if (x.id === g.id) x.status = 'TERHUBUNG'; }); gwuSimpanList_(user, l); } return { state: 'TERHUBUNG' }; }
    return { state: j.qr ? 'MENUNGGU_SCAN' : 'MEMBUAT', qr: j.qr || '' };
  } catch (e) { return { state: 'MEMBUAT' }; }
}
// daftar WhatsApp milik akun ini (tanpa kunci) + status; superadmin juga melihat semua akun
function gwuStatus_(au) {
  const user = au && au.user, out = { status: 'success', siap: !!ccProp_('RAILWAY_TOKEN'), fiturDaftar: GWU_FITUR, daftar: [] };
  gwuList_(user).forEach(g => { const s = gwuStatusSatu_(user, g); out.daftar.push({ id: g.id, nama: g.nama, fitur: g.fitur || [], state: s.state, qr: s.qr || '' }); });
  if (au && au.role === 'ADMIN') {
    const p = PropertiesService.getScriptProperties().getProperties(); out.semua = [];
    Object.keys(p).filter(k => k.indexOf('GWU_') === 0).forEach(k => { try { let l = JSON.parse(p[k]); if (!Array.isArray(l)) l = [l]; l.forEach(g => out.semua.push({ admin: k.slice(4), nama: g.nama || 'WhatsApp utama', fitur: g.fitur || Object.keys(GWU_FITUR), status: g.status || 'MEMBUAT' })); } catch (e) { /* abaikan */ } });
  }
  return out;
}
// ubah nama / fitur satu WhatsApp: d.id, d.fitur[], d.nama (opsional)
function gwuFitur_(au, d) {
  const user = au && au.user, list = gwuList_(user), g = list.filter(x => x.id === (d && d.id))[0];
  if (!g) return tmErr_('WhatsApp tidak ditemukan.');
  const fitur = gwuFiturOk_(d.fitur); if (!fitur.length) return tmErr_('Pilih minimal satu fitur.');
  g.fitur = fitur; if (d.nama) g.nama = String(d.nama).trim().slice(0, 30);
  gwuSimpanList_(user, list); return { status: 'success', message: 'Fitur "' + g.nama + '" diperbarui.' };
}
// putuskan & hapus satu WhatsApp: d.id
function gwuHapus_(au, d) {
  const user = au && au.user, list = gwuList_(user), g = list.filter(x => x.id === (d && d.id))[0];
  if (!g) return { status: 'success', message: 'Tidak ada gateway.' };
  try { gwuGql_('mutation($id: String!){ serviceDelete(id:$id) }', { id: g.serviceId }); } catch (e) { return tmErr_('Gagal menghapus di Railway: ' + e.message); }
  gwuSimpanList_(user, list.filter(x => x.id !== g.id)); return { status: 'success', message: 'WhatsApp "' + g.nama + '" dihapus.' };
}
// WhatsApp yang terhubung & mendukung fitur ini
function gwuPilih_(user, fungsi, gid) {
  const l = gwuList_(user).filter(g => g.url && g.status === 'TERHUBUNG');
  return (gid && l.filter(g => g.id === gid)[0]) || l.filter(g => (g.fitur || Object.keys(GWU_FITUR)).indexOf(fungsi) >= 0)[0] || null;
}
function gwuAda_(user, fungsi) { return !!gwuPilih_(user, fungsi || 'LAPORAN'); }
// kirim lewat WhatsApp milik sub admin. hasil.api = penanda "id::nama (akun)" untuk dicatat di chat. pakai:true = gateway terpilih tapi gagal (jangan pindah nomor)
function gwuKirim_(user, target, pesan, foto, fungsi, gid) {
  const g = gwuPilih_(user, fungsi || 'CHAT_CLIENT', gid); if (!g) return { ok: false, pakai: false };
  const api = g.id + '::' + g.nama + ' (' + user + ')';
  try {
    const f = !foto ? undefined : typeof foto === 'string' ? { url: foto } : (foto.getBytes ? { base64: Utilities.base64Encode(foto.getBytes()), mimetype: foto.getContentType(), filename: foto.getName() } : foto);
    const r = UrlFetchApp.fetch(g.url + '/kirim?k=' + encodeURIComponent(g.kirimKey), { method: 'post', contentType: 'application/json', payload: JSON.stringify({ to: String(target), message: String(pesan), file: f }), muteHttpExceptions: true });
    return r.getResponseCode() === 200 ? { ok: true, raw: 'gateway ' + g.nama, api: api } : { ok: false, pakai: true, api: api, msg: 'WA ' + g.nama + ' gagal (' + r.getResponseCode() + '): ' + r.getContentText().slice(0, 80) };
  } catch (e) { return { ok: false, pakai: true, api: api, msg: 'WA ' + g.nama + ': ' + e.message }; }
}

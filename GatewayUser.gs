/* WhatsApp pribadi per sub admin: tiap orang punya gateway Railway sendiri (dibuat otomatis, scan QR di Chat Client).
 * Properti Skrip yang dibutuhkan (isi SEKALI oleh admin utama, jangan ditulis di chat/kode):
 *   RAILWAY_TOKEN        Account/Workspace token Railway (railway.com > Account Settings > Tokens)
 *   RAILWAY_PROJECT_ID   id project Railway tempat service dibuat
 *   RAILWAY_ENV_ID       id environment (production)
 * Tiap sub admin disimpan di properti GWU_<nama> (url, kunci, id service). Kunci tidak pernah dikirim ke browser. */
const GWU = { API: 'https://backboard.railway.com/graphql/v2', REPO: 'kkpmhdiqbal5/wa-gateway-pr', BRANCH: 'main' };
function gwuNama_(user) { return 'GWU_' + String(user || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40); }
function gwuBaca_(user) { try { return JSON.parse(ccProp_(gwuNama_(user)) || 'null'); } catch (e) { return null; } }
function gwuSimpan_(user, o) { PropertiesService.getScriptProperties().setProperty(gwuNama_(user), JSON.stringify(o)); }
function gwuGql_(q, v) {
  const t = ccProp_('RAILWAY_TOKEN'); if (!t) throw new Error('RAILWAY_TOKEN belum diisi di Properti Skrip (admin utama).');
  const r = UrlFetchApp.fetch(GWU.API, { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + t }, payload: JSON.stringify({ query: q, variables: v || {} }), muteHttpExceptions: true });
  let j = {}; try { j = JSON.parse(r.getContentText()); } catch (e) { /* bukan JSON */ }
  if (j.errors && j.errors.length) throw new Error('Railway: ' + String(j.errors[0].message).slice(0, 200));
  if (r.getResponseCode() !== 200 || !j.data) throw new Error('Railway HTTP ' + r.getResponseCode());
  return j.data;
}
// buat service gateway untuk sub admin yang sedang login (sekali; bila sudah ada, kembalikan status)
function gwuBuat_(au) {
  const user = au && au.user; if (!user) return tmErr_('Belum login.');
  const ada = gwuBaca_(user); if (ada && ada.serviceId) return gwuStatus_(au);
  const pid = ccProp_('RAILWAY_PROJECT_ID'), eid = ccProp_('RAILWAY_ENV_ID'), hook = ccProp_('WA_HOOK_SECRET');
  if (!pid || !eid || !ccProp_('RAILWAY_TOKEN')) return tmErr_('Admin utama belum mengisi RAILWAY_TOKEN, RAILWAY_PROJECT_ID, RAILWAY_ENV_ID di Properti Skrip.');
  const exec = ScriptApp.getService().getUrl(); if (!exec || !hook) return tmErr_('Alamat web app / WA_HOOK_SECRET belum tersedia.');
  const kirimKey = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''), qrKey = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const vars = { HOOK_URL: exec + '?hook=' + encodeURIComponent(hook) + '&tugas=CHAT&admin=' + encodeURIComponent(user), KIRIM_KEY: kirimKey, QR_KEY: qrKey, AUTH_DIR: '/data/auth', PRIBADI: '1', TERIMA_SENDIRI: '0', PAIR_PHONE: '' };
  try {
    const s = gwuGql_('mutation($i: ServiceCreateInput!){ serviceCreate(input:$i){ id } }',
      { i: { projectId: pid, environmentId: eid, name: ('wa-' + gwuNama_(user).slice(4)).slice(0, 30), source: { repo: GWU.REPO }, branch: GWU.BRANCH, variables: vars } }).serviceCreate;
    const sid = s.id;
    gwuSimpan_(user, { serviceId: sid, kirimKey: kirimKey, qrKey: qrKey, url: '', status: 'MEMBUAT', dibuat: new Date().toISOString() });
    try { gwuGql_('mutation($i: VolumeCreateInput!){ volumeCreate(input:$i){ id } }', { i: { projectId: pid, environmentId: eid, serviceId: sid, mountPath: '/data' } }); } catch (eV) { Logger.log('volume: ' + eV.message); }
    const dom = gwuGql_('mutation($i: ServiceDomainCreateInput!){ serviceDomainCreate(input:$i){ domain } }', { i: { serviceId: sid, environmentId: eid } }).serviceDomainCreate.domain;
    const url = 'https://' + dom;
    gwuGql_('mutation($i: VariableUpsertInput!){ variableUpsert(input:$i) }', { i: { projectId: pid, environmentId: eid, serviceId: sid, name: 'PUBLIC_URL', value: url } });
    gwuSimpan_(user, { serviceId: sid, kirimKey: kirimKey, qrKey: qrKey, url: url, status: 'MEMBUAT', dibuat: new Date().toISOString() });
    return { status: 'success', state: 'MEMBUAT', message: 'Gateway sedang dibuat di Railway (sekitar 1-3 menit). Halaman akan menampilkan QR begitu siap.' };
  } catch (e) { return tmErr_('Gagal membuat gateway: ' + e.message); }
}
// status untuk dashboard: MEMBUAT | MENUNGGU_SCAN (+qr) | TERHUBUNG | BELUM_ADA
function gwuStatus_(au) {
  const g = gwuBaca_(au && au.user);
  if (!g || !g.serviceId) return { status: 'success', state: 'BELUM_ADA', siap: !!(ccProp_('RAILWAY_TOKEN') && ccProp_('RAILWAY_PROJECT_ID') && ccProp_('RAILWAY_ENV_ID')) };
  if (!g.url) return { status: 'success', state: 'MEMBUAT' };
  try {
    const r = UrlFetchApp.fetch(g.url + '/status?k=' + encodeURIComponent(g.qrKey), { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return { status: 'success', state: 'MEMBUAT' };         // service masih build / belum hidup
    const j = JSON.parse(r.getContentText());
    if (j.tersambung) { if (g.status !== 'TERHUBUNG') { g.status = 'TERHUBUNG'; gwuSimpan_(au.user, g); } return { status: 'success', state: 'TERHUBUNG' }; }
    return { status: 'success', state: j.qr ? 'MENUNGGU_SCAN' : 'MEMBUAT', qr: j.qr || '' };
  } catch (e) { return { status: 'success', state: 'MEMBUAT' }; }
}
// putuskan & hapus gateway sub admin ini
function gwuHapus_(au) {
  const g = gwuBaca_(au && au.user); if (!g || !g.serviceId) return { status: 'success', message: 'Tidak ada gateway.' };
  try { gwuGql_('mutation($id: String!){ serviceDelete(id:$id) }', { id: g.serviceId }); } catch (e) { return tmErr_('Gagal menghapus di Railway: ' + e.message); }
  PropertiesService.getScriptProperties().deleteProperty(gwuNama_(au.user));
  return { status: 'success', message: 'Gateway dihapus.' };
}
// kirim lewat gateway milik sub admin. pakai:true = gateway memang ada & terhubung (jangan diam-diam pindah ke nomor lain)
function gwuKirim_(user, target, pesan, foto) {
  const g = gwuBaca_(user); if (!g || !g.url || g.status !== 'TERHUBUNG') return { ok: false, pakai: false };
  try {
    const f = !foto ? undefined : typeof foto === 'string' ? { url: foto } : (foto.getBytes ? { base64: Utilities.base64Encode(foto.getBytes()), mimetype: foto.getContentType(), filename: foto.getName() } : foto);
    const r = UrlFetchApp.fetch(g.url + '/kirim?k=' + encodeURIComponent(g.kirimKey), { method: 'post', contentType: 'application/json', payload: JSON.stringify({ to: String(target), message: String(pesan), file: f }), muteHttpExceptions: true });
    return r.getResponseCode() === 200 ? { ok: true, raw: 'gateway ' + user } : { ok: false, pakai: true, msg: 'WA ' + user + ' gagal (' + r.getResponseCode() + '): ' + r.getContentText().slice(0, 80) };
  } catch (e) { return { ok: false, pakai: true, msg: 'WA ' + user + ': ' + e.message }; }
}

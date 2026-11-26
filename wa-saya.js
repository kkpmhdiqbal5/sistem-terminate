// Pengingat sambung WhatsApp untuk sub admin: muncul di halaman yang butuh WA bila belum ada / terputus, hilang sendiri setelah terhubung.
// Pakai: WaSaya.pasang(['CHAT_CLIENT', 'LAPORAN'])  (setelah TMC.init)
(function () {
  var NAMA = { CHAT_CLIENT: 'Chat client', TEKNISI: 'Kirim ke teknisi', LAPORAN: 'Kirim laporan' };
  function pasang(butuh) {
    var s = TMC.getSession(); if (!s || s.role === 'ADMIN') return;              // superadmin memakai API bersama
    var esc = TMC.esc, wadah = document.createElement('div'), timer = null, n = 0, tanda = '';
    var induk = document.querySelector('.container') || document.body; induk.insertBefore(wadah, induk.firstChild);
    function cek(pref, pilih) { return Object.keys(NAMA).map(function (k) { return '<label class="me-3"><input type="checkbox" class="' + pref + '" value="' + k + '"' + (pilih.indexOf(k) >= 0 ? ' checked' : '') + '> ' + NAMA[k] + '</label>'; }).join(''); }
    function gambar(r) {
      if (r.status !== 'success') { wadah.innerHTML = ''; return; }
      var ok = {}; r.daftar.forEach(function (g) { if (g.state === 'TERHUBUNG') (g.fitur || []).forEach(function (f) { ok[f] = 1; }); });
      var kurang = butuh.filter(function (f) { return !ok[f]; });
      if (!kurang.length) { wadah.innerHTML = ''; tanda = ''; berhenti(); return; }
      var t = JSON.stringify([r.daftar.map(function (g) { return [g.id, g.state, g.qr]; }), kurang]); if (t === tanda) return; tanda = t;
      var putus = r.daftar.filter(function (g) { return g.state !== 'TERHUBUNG' && (g.fitur || []).some(function (f) { return kurang.indexOf(f) >= 0; }); });
      var h = '<div class="alert alert-warning mb-3"><div class="fw-bold">📱 ' + (r.daftar.length ? 'WhatsApp Anda belum tersambung' : 'Sambungkan WhatsApp Anda dulu') + '</div><div class="small mb-2">Fitur di halaman ini memakai WhatsApp milik Anda: ' + kurang.map(function (f) { return NAMA[f]; }).join(', ') + '.</div>';
      putus.forEach(function (g) {
        h += '<div class="border rounded p-2 mb-2 bg-white text-dark" data-id="' + esc(g.id) + '"><b>' + esc(g.nama) + '</b> ' + (g.state === 'MENUNGGU_SCAN' ? '<span class="text-danger">terputus / menunggu scan</span>' : '<span class="text-secondary">⏳ menyiapkan (1-3 menit)</span>');
        if (g.state === 'MENUNGGU_SCAN') h += '<div class="small mt-1">Buka WhatsApp > <b>Perangkat tertaut</b> > <b>Tautkan perangkat</b>, lalu scan:<div class="waQr bg-white p-2 mt-1" style="width:fit-content"></div></div>';
        h += '</div>';
      });
      if (!putus.length) h += r.siap
        ? '<div class="border rounded p-2 bg-white text-dark"><input id="wsNama" class="form-control form-control-sm mb-1" placeholder="Nama WhatsApp (mis. WA Kantor)"><div class="small mb-1">Fitur: ' + cek('wsF', kurang) + '</div><button id="wsTambah" class="btn btn-success btn-sm">Sambungkan WhatsApp</button></div>'
        : '<div class="small">Admin utama belum mengisi RAILWAY_TOKEN, hubungi admin utama.</div>';
      wadah.innerHTML = h + '</div>';
      r.daftar.forEach(function (g) { var q = wadah.querySelector('[data-id="' + g.id + '"] .waQr'); if (q && g.qr && typeof QRCode !== 'undefined') new QRCode(q, { text: g.qr, width: 200, height: 200 }); });
      var tb = wadah.querySelector('#wsTambah'); if (tb) tb.onclick = function () {
        var f = Array.prototype.map.call(wadah.querySelectorAll('.wsF:checked'), function (c) { return c.value; });
        tb.disabled = true; tb.textContent = 'Membuat...';
        TMC.api('terminateGwBuat', { nama: wadah.querySelector('#wsNama').value, fitur: f }).then(function (x) { alert(x.message); tanda = ''; muat(); });
      };
    }
    function berhenti() { if (timer) { clearInterval(timer); timer = null; } }
    function muat() { TMC.api('terminateGwStatus').then(function (r) { gambar(r); if (wadah.innerHTML && !timer) timer = setInterval(function () { if (document.hidden) return; if (++n > 25) { berhenti(); return; } muat(); }, 12000); }); }
    muat();
  }
  window.WaSaya = { pasang: pasang };
})();

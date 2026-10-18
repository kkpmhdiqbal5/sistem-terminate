/* Kirim teks lewat WA API sistem (hanya akun dengan izin TCHAT). KirimApi.buka(urlScript, [teks...], 'SATU'|'GABUNG') */
(function () {
  var LS = 'kirimapi_nomor';
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function baca() { try { var a = JSON.parse(localStorage.getItem(LS) || '[]'); return a.length ? a : ['']; } catch (e) { return ['']; } }
  window.KirimApi = {
    ok: function () { return !!(window.Auth && Auth.can && Auth.can('TCHAT')); },
    buka: function (url, teks, mode) {
      var s = Auth.get(); if (!s) return alert('Sesi berakhir, login ulang.');
      if (!teks.length) return alert('Tidak ada data yang dipilih.');
      var no = baca(), ov = document.createElement('div'), satu = mode === 'SATU';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:5000;display:flex;align-items:center;justify-content:center;padding:14px';
      var box = document.createElement('div');
      box.style.cssText = 'background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:12px;padding:16px;width:100%;max-width:420px;max-height:92vh;overflow:auto;font-family:sans-serif';
      ov.appendChild(box); document.body.appendChild(ov);
      function ambil() { Array.prototype.forEach.call(box.querySelectorAll('input[data-i]'), function (e) { no[e.getAttribute('data-i')] = e.value; }); }
      function gambar() {
        box.innerHTML = '<div style="font-weight:700;margin-bottom:4px">📤 Kirim via WhatsApp API</div>' +
          '<div style="font-size:12px;color:#94a3b8;margin-bottom:10px">' + teks.length + ' data, ' + (satu ? '1 data 1 pesan (' + teks.length + ' pesan per nomor)' : 'digabung dalam 1 pesan') + '. Isi 1 sampai 10 nomor / ID grup @g.us.</div>' +
          no.map(function (v, i) { return '<div style="display:flex;gap:4px;margin-bottom:4px"><input data-i="' + i + '" inputmode="tel" placeholder="08xx… atau 1203…@g.us" value="' + esc(v) + '" style="flex:1;padding:8px;border-radius:6px;border:1px solid #475569;background:#0f172a;color:#fff">' +
            (no.length > 1 ? '<button data-x="' + i + '" style="border:1px solid #dc2626;color:#f87171;background:none;border-radius:6px;padding:0 10px">✕</button>' : '') + '</div>'; }).join('') +
          '<button id="kaT" style="font-size:12px;border:1px solid #22d3ee;color:#22d3ee;background:none;border-radius:6px;padding:4px 10px;margin:4px 0 10px">+ Tambah nomor</button><div id="kaM"></div>' +
          '<div style="display:flex;gap:8px"><button id="kaB" style="flex:1;padding:8px;border-radius:6px;border:1px solid #64748b;background:none;color:#e2e8f0">Batal</button><button id="kaK" style="flex:1;padding:8px;border-radius:6px;border:0;background:#16a34a;color:#fff;font-weight:700">Kirim</button></div>';
        box.querySelector('#kaT').onclick = function () { ambil(); if (no.length < 10) no.push(''); gambar(); };
        box.querySelector('#kaB').onclick = function () { ov.remove(); };
        Array.prototype.forEach.call(box.querySelectorAll('[data-x]'), function (b) { b.onclick = function () { ambil(); no.splice(+b.getAttribute('data-x'), 1); gambar(); }; });
        box.querySelector('#kaK').onclick = function () {
          ambil(); var n = no.map(function (v) { return v.trim(); }).filter(Boolean), m = box.querySelector('#kaM'), bt = this;
          function info(t, w) { m.innerHTML = '<div style="font-size:12px;padding:6px 8px;border-radius:6px;margin-bottom:8px;background:' + (w ? '#7f1d1d' : '#334155') + '">' + esc(t) + '</div>'; }
          if (!n.length) return info('Nomor tujuan wajib diisi.', 1);
          bt.disabled = true; bt.textContent = 'Mengirim...'; info('Mengirim, jangan tutup halaman...');
          fetch(url, { method: 'POST', body: JSON.stringify({ action: 'terminateKirimTeks', token: s.token, pesan: teks, nomor: n, mode: satu ? 'SATU' : 'GABUNG' }) })
            .then(function (r) { return r.json(); }).then(function (r) {
              if (r.code === 'SESSION') { alert(r.message); location.href = 'login.html'; return; }
              if (r.status === 'success') { try { localStorage.setItem(LS, JSON.stringify(n)); } catch (e) {} ov.remove(); alert(r.message); return; }
              info(/Aksi tidak dikenal/.test(r.message || '') ? 'Server belum diperbarui: tempel ChatClient.gs & Terminate.gs terbaru lalu Deploy > New version.' : (r.message || 'Gagal.'), 1);
              bt.disabled = false; bt.textContent = 'Kirim';
            }).catch(function () { info('Gagal terhubung ke server.', 1); bt.disabled = false; bt.textContent = 'Kirim'; });
        };
      }
      gambar();
    }
  };
})();

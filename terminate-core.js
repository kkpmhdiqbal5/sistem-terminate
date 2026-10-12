/* Inti sistem Terminate: sesi login 12 jam, panggilan API, navigasi bawah, kamera langsung, scanner barcode.
   Dipakai bersama oleh semua halaman terminate-*.html dan terminate.html. */
(function () {
  var SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzsS4-LPktyuUKoC6Cf6TERV498wqvm31frvD7-W0gFhrCb9fkgwVBjAHeLrEeVMd25/exec";
  var LIB = "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";
  var timer = null;
  // Login & sesi 12 jam dipakai bersama seluruh sistem lewat auth.js (satu login untuk semua halaman)
  function getSession() { return window.Auth ? Auth.get() : null; }
  function logout(msg) { Auth.logout(msg); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function post(body) {
    return fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(body) }).then(function (r) { return r.json(); });
  }
  var BELUM = "Backend (Apps Script) belum diperbarui. Tempel Terminate.gs terbaru, lalu Deploy > New version.";
  function checkTm(res) {
    if (!res || res.tm !== 1) return { status: "error", message: BELUM };
    return res;
  }
  function api(action, payload) {
    var s = getSession();
    if (!s) { logout("Sesi berakhir. Silakan login ulang."); return Promise.reject(new Error("sesi")); }
    var body = Object.assign({}, payload || {}, { action: action, token: s.token });
    return post(body).then(function (res) {
      if (res && res.code === "SESSION") logout(res.message);
      return checkTm(res);
    });
  }
  function driveId(url) {
    var m = /\/d\/([^/]+)/.exec(url || "") || /[?&]id=([^&]+)/.exec(url || "");
    return m ? m[1] : "";
  }
  function thumb(url, w) {
    var id = driveId(url);
    return id ? "https://drive.google.com/thumbnail?id=" + id + "&sz=w" + (w || 300) : "";
  }

  var CSS = "body{background:#0b132b;color:#e0e6ed;font-family:'Segoe UI',sans-serif;padding-bottom:85px;margin:0}" +
    ".tm-top{background:#1c2541;padding:12px 16px;border-bottom:1px solid #2a385b;display:flex;justify-content:space-between;align-items:center;gap:8px}" +
    ".card-custom{background:#1c2541;border:1px solid #2a385b;border-radius:12px}" +
    ".form-control-dark,.form-select-dark{background-color:#0b132b;border:1px solid #3a506b;color:#fff;font-size:.85rem}" +
    ".form-control-dark:focus,.form-select-dark:focus{background-color:#0b132b;color:#fff;border-color:#38bdf8;box-shadow:none}" +
    ".form-control-dark::placeholder{color:#64748b}.form-control-dark:disabled,.form-select-dark:disabled{background:#131c36;color:#94a3b8}" +
    ".tm-nav{position:fixed;bottom:0;left:0;right:0;background:#1c2541;border-top:1px solid #2a385b;display:flex;height:65px;z-index:1000}" +
    ".tm-nav a{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-decoration:none;color:#94a3b8;font-size:.7rem;font-weight:600}" +
    ".tm-nav a.ctr{position:relative;top:-12px;color:#22c55e}.tm-nav .circ{background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.5rem;box-shadow:0 4px 15px rgba(34,197,94,.5);border:3px solid #0b132b}.tm-nav a.ctr span{margin-top:2px}.tm-nav a.ctr span.on{color:#38bdf8}" +
    ".tm-nav a.active{color:#38bdf8}.tm-nav .ic{font-size:1.25rem;margin-bottom:2px}" +
    ".tm-ov{position:fixed;inset:0;background:#000;z-index:3000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px}" +
    ".tm-ov video{width:100%;max-height:75vh;object-fit:contain;background:#000}" +
    ".tm-bar{display:flex;gap:12px;padding:14px;align-items:center;justify-content:center;flex-wrap:wrap}" +
    "#tm-reader{width:100%;max-width:480px}.tm-st{color:#fff;font-size:.85rem;margin-top:8px;text-align:center;max-width:480px}" +
    ".thumb{width:84px;height:84px;object-fit:cover;border-radius:8px;border:1px solid #3a506b;background:#0b132b}" +
    ".tm-grp{background:#0b132b;border:1px solid #3a506b;color:#e0e6ed;border-radius:999px;padding:3px 12px 3px 4px;font-size:.82rem;font-weight:600;display:flex;align-items:center;gap:6px;cursor:pointer}" +
    ".tm-grp:hover{border-color:#38bdf8}.tm-av{width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#38bdf8,#2563eb);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700}" +
    ".tm-av.big{width:42px;height:42px;font-size:1.1rem;flex:none}" +
    ".tm-menu{position:fixed;z-index:2500;top:54px;right:12px;width:300px;max-width:94vw;max-height:calc(100vh - 130px);overflow:auto;background:#1c2541;border:1px solid #3a506b;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.55);padding:8px}" +
    ".tm-menu.d-none{display:none!important}" +
    "@media(max-width:640px){.tm-menu{top:auto;bottom:74px;left:8px;right:8px;width:auto;max-width:none}}" +
    ".tm-mh{display:flex;gap:10px;align-items:center;padding:8px 8px 10px;border-bottom:1px solid #2a385b;margin-bottom:6px}" +
    ".tm-gt{font-size:.66rem;letter-spacing:.08em;color:#64748b;font-weight:700;padding:10px 8px 3px}" +
    ".tm-mi{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:0;color:#e0e6ed;text-decoration:none;padding:9px 8px;border-radius:8px;font-size:.88rem;cursor:pointer}" +
    ".tm-mi:hover{background:#26335a;color:#fff}.tm-mi.out{color:#f87171;margin-top:6px;border-top:1px solid #2a385b;border-radius:0 0 8px 8px}" +
    ".tm-mic{width:22px;text-align:center}" +
    ".tm-pv{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:3500;display:flex;align-items:center;justify-content:center;padding:14px;overflow:auto}" +
    ".tm-pc{width:100%;max-width:420px}.tm-chip{display:inline-block;background:#0b132b;border:1px solid #3a506b;border-radius:999px;padding:1px 9px;font-size:.72rem;margin:0 4px 4px 0;color:#cbd5e1}" +
    ".kecil{font-size:.78rem;color:#94a3b8}";

  var NAV = [
    { k: "diambil", p: "TDIAMBIL", href: "terminate-diambil.html", ic: "📦", t: "Diambil" },
    { k: "edit", p: "TEDIT", href: "terminate-edit.html", ic: "✏️", t: "Edit" },
    { k: "input", p: "TINPUT", href: "terminate.html", ic: "📷", t: "Input", center: true },
    { k: "laporan", p: "TLAPORAN", href: "terminate-laporan.html", ic: "📋", t: "Laporan" },
    { k: "full", p: "TDATA", href: "terminate-full.html", ic: "🗂️", t: "Data", admin: true }
  ];

  function init(opt) {
    var s = getSession();
    if (!s) { logout("Silakan login dulu."); throw new Error("login"); }
    s.user = s.username;
    var iz = s.izin || {};
    var boleh = NAV.filter(function (n) { return iz[n.p] && (!n.admin || s.role === "ADMIN"); });
    if (!boleh.length) { logout("Akun Anda belum diberi izin ke halaman Terminate mana pun."); throw new Error("izin"); }
    if (((opt.active === "impor" || opt.active === "bersih") && !(iz.TIMPOR && s.role === "ADMIN")) || (opt.active === "chat" && !(iz.TCHAT && s.role === "ADMIN"))) { location.replace(boleh[0].href); throw new Error("izin"); }
    var kini = NAV.filter(function (n) { return n.k === opt.active; })[0];
    if (kini && !boleh.some(function (n) { return n.k === kini.k; })) { location.replace(boleh[0].href); throw new Error("izin"); }
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);

    // ---------- bilah atas: judul + SATU tombol grup (profil & semua menu) ----------
    var top = document.createElement("div"); top.className = "tm-top";
    top.innerHTML = '<div class="fw-bold text-white">' + esc(opt.title || "Sistem Terminate") + "</div>" +
      '<div class="d-flex align-items-center gap-2"><span id="tm-sisa" class="kecil"></span>' +
      '<button id="tm-grp" class="tm-grp" aria-haspopup="true"><span class="tm-av">' + esc((s.user || "?").charAt(0).toUpperCase()) + "</span>" + esc(s.user) + " ▾</button></div>";
    document.body.insertBefore(top, document.body.firstChild);

    var nav = document.createElement("div"); nav.className = "tm-nav";
    nav.innerHTML = boleh.map(function (n) {
      if (n.center) return '<a href="' + n.href + '" class="ctr"><div class="circ">' + n.ic + '</div><span class="' + (n.k === opt.active ? "on" : "") + '">' + n.t + "</span></a>";
      return '<a href="' + n.href + '" class="' + (n.k === opt.active ? "active" : "") + '"><div class="ic">' + n.ic + "</div><span>" + n.t + "</span></a>";
    }).join("") + '<a href="#" id="tm-menu-nav"><div class="ic">👤</div><span>Profil</span></a>';
    document.body.appendChild(nav);

    // ---------- menu grup ----------
    function grup(judul, arr) {
      arr = arr.filter(Boolean);
      return arr.length ? '<div class="tm-gt">' + judul + "</div>" + arr.map(function (x) { return x; }).join("") : "";
    }
    function lnk(href, ic, t, cls) { return '<a class="tm-mi ' + (cls || "") + '" href="' + href + '"><span class="tm-mic">' + ic + "</span>" + t + "</a>"; }
    var menu = document.createElement("div"); menu.id = "tm-menu"; menu.className = "tm-menu d-none";
    function bangunMenu() {
      var m = Math.max(0, Math.floor((s.exp - Date.now()) / 60000));
      var admin = s.role === "ADMIN";
      menu.innerHTML =
        '<div class="tm-mh"><span class="tm-av big">' + esc((s.user || "?").charAt(0).toUpperCase()) + '</span><div><div class="fw-bold text-white">' + esc(s.nama || s.user) + '</div>' +
        '<div class="kecil">@' + esc(s.user) + ' · <b>' + (admin ? "ADMIN" : "SUB ADMIN") + '</b> · Sesi ' + Math.floor(m / 60) + "j " + (m % 60) + 'm</div></div></div>' +
        '<button class="tm-mi" data-aksi="profil"><span class="tm-mic">🪪</span>Profil Saya &amp; Ganti Password</button>' +
        grup("ALAT ADMIN", [
          Auth.can("TIMPOR") && admin ? lnk("terminate-impor.html", "📥", "Impor WhatsApp") : "",
          Auth.can("TIMPOR") && admin ? lnk("bersih-data.html", "🧹", "Bersihkan Data") : "",
          Auth.can("TCHAT") && admin ? lnk("chat-client.html", "💬", "Chat Client & Kirim Data") : ""]) +
        grup("HALAMAN TERMINATE", boleh.map(function (n) { return lnk(n.href, n.ic, n.t === "Data" ? "Data Penuh" : n.t); })) +
        grup("SISTEM LAPANGAN", [
          lnk("index.html", "🛠️", "Form Lapangan"),
          Auth.can("DASHBOARD") ? lnk("admin.html", "📊", "Dashboard Admin") : "",
          Auth.can("DATAADMIN") ? lnk("search.html", "🔎", "Pencarian Data") : "",
          Auth.can("DATAADMIN") ? lnk("laporan.html", "📑", "Laporan & Input Massal") : ""]) +
        '<button class="tm-mi out" data-aksi="keluar"><span class="tm-mic">⎋</span>Keluar</button>';
    }
    document.body.appendChild(menu);
    function tutupMenu() { menu.classList.add("d-none"); }
    function bukaMenu() { bangunMenu(); menu.classList.toggle("d-none"); }
    document.getElementById("tm-grp").onclick = function (e) { e.stopPropagation(); bukaMenu(); };
    document.getElementById("tm-menu-nav").onclick = function (e) { e.preventDefault(); e.stopPropagation(); bukaMenu(); };
    document.addEventListener("click", function (e) { if (!menu.contains(e.target)) tutupMenu(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") tutupMenu(); });
    menu.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("[data-aksi]"); if (!a) return;
      if (a.getAttribute("data-aksi") === "keluar") logout();
      if (a.getAttribute("data-aksi") === "profil") { tutupMenu(); bukaProfil(); }
    });

    // ---------- profil ----------
    var NAMA_IZIN = { TINPUT: "Input Terminate", TDIAMBIL: "Perangkat Diambil", TEDIT: "Edit Data", TLAPORAN: "Laporan", TDATA: "Data Penuh", TIMPOR: "Impor & Bersihkan", TCHAT: "Chat Client",
      DASHBOARD: "Dashboard", FORMINPUT: "Form Input", DATAADMIN: "Data Admin", MANAJEMENAKUN: "Manajemen Akun" };
    function bukaProfil() {
      var ov = document.createElement("div"); ov.className = "tm-pv";
      var chips = Object.keys(NAMA_IZIN).filter(function (k) { return iz[k]; }).map(function (k) { return '<span class="tm-chip">' + NAMA_IZIN[k] + "</span>"; }).join("") || '<span class="kecil">-</span>';
      ov.innerHTML = '<div class="tm-pc card-custom p-3"><div class="d-flex justify-content-between align-items-center mb-2"><div class="fw-bold text-white">🪪 Profil Saya</div>' +
        '<button class="btn btn-sm btn-outline-light py-0 px-2" data-x="tutup">✕</button></div>' +
        '<div class="d-flex gap-3 align-items-center mb-2"><span class="tm-av big">' + esc((s.user || "?").charAt(0).toUpperCase()) + '</span><div><div class="fw-bold text-white">' + esc(s.nama || s.user) + '</div>' +
        '<div class="kecil">@' + esc(s.user) + ' · ' + (s.role === "ADMIN" ? "ADMIN" : "SUB ADMIN") + '</div><div class="kecil">Sesi berakhir ' + esc(new Date(s.exp).toLocaleString("id-ID")) + '</div></div></div>' +
        '<div class="kecil mb-1">Halaman yang boleh diakses</div><div class="mb-3">' + chips + '</div>' +
        '<div class="fw-bold text-white small mb-1">Ganti Password</div>' +
        '<input id="pw1" type="password" class="form-control form-control-dark mb-2" placeholder="Password lama" autocomplete="current-password">' +
        '<input id="pw2" type="password" class="form-control form-control-dark mb-2" placeholder="Password baru (min. 6 karakter)" autocomplete="new-password">' +
        '<input id="pw3" type="password" class="form-control form-control-dark mb-2" placeholder="Ulangi password baru" autocomplete="new-password">' +
        '<button class="btn btn-info w-100 fw-bold" data-x="simpan">Simpan Password</button><div id="pw-h" class="mt-2"></div>' +
        '<button class="btn btn-danger w-100 fw-bold mt-3" data-x="keluar">Keluar</button></div>';
      document.body.appendChild(ov);
      function h(t, j) { ov.querySelector("#pw-h").innerHTML = '<div class="alert alert-' + j + ' py-2 mb-0 small">' + esc(t) + "</div>"; }
      ov.addEventListener("click", function (e) {
        var x = e.target.getAttribute && e.target.getAttribute("data-x");
        if (e.target === ov || x === "tutup") ov.remove();
        if (x === "keluar") logout();
        if (x === "simpan") {
          var a = ov.querySelector("#pw1").value, b = ov.querySelector("#pw2").value, c = ov.querySelector("#pw3").value;
          if (!a || !b) { h("Isi password lama dan baru.", "warning"); return; }
          if (b.length < 6) { h("Password baru minimal 6 karakter.", "warning"); return; }
          if (b !== c) { h("Ulangi password baru tidak sama.", "warning"); return; }
          e.target.disabled = true; h("Menyimpan...", "secondary");
          api("terminateGantiPassword", { lama: a, baru: b }).then(function (r) {
            h(r.message || "Selesai.", r.status === "success" ? "success" : "danger");
            if (r.status === "success") { ov.querySelector("#pw1").value = ov.querySelector("#pw2").value = ov.querySelector("#pw3").value = ""; }
          }).catch(function () { h("Gagal terhubung ke server.", "danger"); }).finally(function () { e.target.disabled = false; });
        }
      });
    }

    function sisa() {
      var m = Math.max(0, Math.floor((s.exp - Date.now()) / 60000)), e = document.getElementById("tm-sisa");
      if (e) e.textContent = "Sesi " + Math.floor(m / 60) + "j " + (m % 60) + "m";
    }
    sisa(); setInterval(sisa, 60000);
    // segarkan izin dari server (bila admin mengubah akses di sheet USERS, halaman menyesuaikan)
    api("terminateMe").then(function (r) {
      if (r && r.status === "success" && JSON.stringify(r.izin) !== JSON.stringify(s.izin)) {
        try { var raw = JSON.parse(localStorage.getItem("user_session")); raw.izin = r.izin; raw.role = r.role; localStorage.setItem("user_session", JSON.stringify(raw)); } catch (e) {}
        location.reload();
      }
    }).catch(function () {});
    clearTimeout(timer);
    timer = setTimeout(function () { logout("Sesi 12 jam berakhir. Silakan login ulang."); }, Math.max(1000, s.exp - Date.now()));
    return s;
  }

  /* ---------- Kamera langsung (tanpa galeri) ---------- */
  function openCamera(label) {
    return new Promise(function (resolve, reject) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        reject(new Error("Browser tidak mendukung kamera (butuh HTTPS)."));
        return;
      }
      var ov = document.createElement("div"); ov.className = "tm-ov";
      ov.innerHTML = '<video playsinline autoplay muted></video><div class="tm-bar">' +
        '<button class="btn btn-light fw-bold" data-x="cancel">Batal</button>' +
        '<button class="btn btn-success btn-lg fw-bold" data-x="snap">📷 Ambil Foto</button>' +
        '<button class="btn btn-outline-light" data-x="flip">🔄</button></div>';
      document.body.appendChild(ov);
      var video = ov.querySelector("video"), stream = null, facing = "environment";
      function stop() { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); ov.remove(); }
      function start() {
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
          .then(function (s) { stream = s; video.srcObject = s; })
          .catch(function () { stop(); reject(new Error("Kamera tidak bisa dibuka. Izinkan akses kamera di browser.")); });
      }
      ov.addEventListener("click", function (e) {
        var x = e.target.getAttribute && e.target.getAttribute("data-x");
        if (x === "cancel") { stop(); reject(new Error("dibatalkan")); }
        else if (x === "flip") { facing = facing === "environment" ? "user" : "environment"; start(); }
        else if (x === "snap") {
          if (!video.videoWidth) return;
          var r = Math.min(1, 1000 / Math.max(video.videoWidth, video.videoHeight));
          var c = document.createElement("canvas");
          c.width = Math.round(video.videoWidth * r); c.height = Math.round(video.videoHeight * r);
          var g = c.getContext("2d"); g.drawImage(video, 0, 0, c.width, c.height);
          var fs = Math.max(13, Math.round(c.width / 45)), h = fs + 14;
          g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, c.height - h, c.width, h);
          g.fillStyle = "#fff"; g.font = fs + "px sans-serif";
          g.fillText(new Date().toLocaleString("id-ID") + " | " + (label || ""), 8, c.height - 8);
          var data = c.toDataURL("image/jpeg", 0.72);
          stop(); resolve(data);
        }
      });
      start();
    });
  }

  /* ---------- Scanner barcode ---------- */
  function loadLib() {
    return new Promise(function (res, rej) {
      if (window.Html5Qrcode) return res();
      var s = document.createElement("script"); s.src = LIB;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error("Pustaka scanner gagal dimuat. Cek koneksi internet.")); };
      document.head.appendChild(s);
    });
  }
  function cleanCode(v) {
    return String(v || "").trim().toUpperCase().replace(/\s+/g, "").replace(/^(P-?SN|S\/N|SN)[:=]/, "");
  }
  function scanCode(title) {
    return loadLib().then(function () {
      return new Promise(function (resolve, reject) {
        var F = Html5QrcodeSupportedFormats;
        var formats = [F.CODE_128, F.CODE_39, F.CODE_93, F.CODABAR, F.EAN_13, F.EAN_8, F.ITF, F.UPC_A, F.QR_CODE, F.DATA_MATRIX];
        var conf = { formatsToSupport: formats, verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } };
        var ov = document.createElement("div"); ov.className = "tm-ov";
        ov.innerHTML = '<div class="text-white fw-bold mb-2">' + esc(title || "Scan barcode") + "</div>" +
          '<div id="tm-reader"></div><div id="tm-file" style="display:none"></div>' +
          '<div class="tm-st" id="tm-st">Arahkan kamera ke barcode, dekatkan sampai garis terbaca jelas...</div>' +
          '<div class="tm-bar"><button class="btn btn-light fw-bold" data-x="cancel">Batal</button>' +
          '<label class="btn btn-info fw-bold mb-0">📁 Scan dari foto<input type="file" accept="image/*" capture="environment" hidden data-x="file"></label></div>';
        document.body.appendChild(ov);
        var sc = new Html5Qrcode("tm-reader", conf), done = false, running = false;
        function st(t) { var e = document.getElementById("tm-st"); if (e) e.textContent = t; }
        function close() {
          var p = running ? sc.stop().catch(function () {}) : Promise.resolve();
          return p.then(function () { try { sc.clear(); } catch (e) {} ov.remove(); });
        }
        function finish(code) {
          if (done) return; done = true;
          if (navigator.vibrate) navigator.vibrate(80);
          close().then(function () { resolve(cleanCode(code)); });
        }
        ov.addEventListener("click", function (e) {
          if (e.target.getAttribute && e.target.getAttribute("data-x") === "cancel" && !done) {
            done = true; close().then(function () { reject(new Error("dibatalkan")); });
          }
        });
        ov.querySelector('input[data-x="file"]').addEventListener("change", function (e) {
          var f = e.target.files[0]; if (!f) return;
          st("Membaca foto...");
          var go = running ? sc.stop().then(function () { running = false; }).catch(function () {}) : Promise.resolve();
          go.then(function () { return new Html5Qrcode("tm-file", conf).scanFile(f, false); })
            .then(finish)
            .catch(function () { st("Barcode tidak terbaca di foto. Dekatkan, pastikan fokus dan terang, atau ketik manual."); });
        });
        sc.start({ facingMode: "environment" },
          { fps: 12, qrbox: function (w, h) { return { width: Math.floor(w * 0.92), height: Math.floor(Math.min(h * 0.5, w * 0.4)) }; },
            videoConstraints: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } },
          function (txt) { finish(txt); }, function () {})
          .then(function () { running = true; })
          .catch(function () { st("Kamera tidak bisa dibuka. Izinkan akses kamera, atau pakai tombol Scan dari foto / ketik manual."); });
      });
    });
  }

  window.TMC = { init: init, api: api, getSession: getSession, logout: logout, esc: esc, thumb: thumb,
                 driveId: driveId, openCamera: openCamera, scanCode: scanCode };
})();

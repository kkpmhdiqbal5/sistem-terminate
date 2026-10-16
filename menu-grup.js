/* Tombol grup (avatar + username ▾) berisi SEMUA menu: Profil, Alat Admin, Terminate, Sistem Lapangan, Keluar.
   Dipakai di SEMUA halaman. Butuh auth.js. Cara pakai:
   - taruh <span id="grp-slot"></span> di bar atas halaman (tombol muncul di situ), atau
   - tanpa slot, tombol melayang di pojok kanan atas.
   Profil adalah HALAMAN sendiri (profil.html), bukan pop up. */
(function () {
  var CSS = ".mg-btn{background:#0b132b;border:1px solid #3a506b;color:#e0e6ed;border-radius:999px;padding:3px 12px 3px 4px;font:600 .82rem 'Segoe UI',sans-serif;display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap}" +
    ".mg-btn:hover{border-color:#38bdf8}.mg-av{width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#38bdf8,#2563eb);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;flex:none}" +
    ".mg-av.big{width:42px;height:42px;font-size:1.1rem}.mg-float{position:fixed;top:10px;right:10px;z-index:2400}" +
    ".mg-menu{position:fixed;z-index:2600;top:54px;right:12px;width:300px;max-width:94vw;max-height:calc(100vh - 130px);overflow:auto;background:#1c2541;border:1px solid #3a506b;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.55);padding:8px;font-family:'Segoe UI',sans-serif;color:#e0e6ed}" +
    ".mg-menu[hidden]{display:none}@media(max-width:640px){.mg-menu{top:54px;left:8px;right:8px;width:auto;max-width:none}}" +
    ".mg-h{display:flex;gap:10px;align-items:center;padding:8px 8px 10px;border-bottom:1px solid #2a385b;margin-bottom:6px}.mg-h b{color:#fff}.mg-k{font-size:.78rem;color:#94a3b8}" +
    ".mg-t{font-size:.66rem;letter-spacing:.08em;color:#64748b;font-weight:700;padding:10px 8px 3px}" +
    ".mg-i{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:0;color:#e0e6ed;text-decoration:none;padding:9px 8px;border-radius:8px;font-size:.88rem;cursor:pointer;font-family:inherit}" +
    ".mg-i:hover{background:#26335a;color:#fff}.mg-i.on{background:#26335a;color:#38bdf8}.mg-i.out{color:#f87171;margin-top:6px;border-top:1px solid #2a385b;border-radius:0 0 8px 8px}.mg-c{width:22px;text-align:center}";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function sesi() { return window.Auth ? Auth.get() : null; }
  function halaman() { return location.pathname.split("/").pop() || "index.html"; }

  function mount() {
    var s = sesi(); if (!s || document.getElementById("mg-btn")) return;
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    var user = s.username || s.user || "?", admin = s.role === "ADMIN", ini = esc(user.charAt(0).toUpperCase());
    var btn = document.createElement("button");
    btn.id = "mg-btn"; btn.type = "button"; btn.className = "mg-btn"; btn.setAttribute("aria-haspopup", "true");
    btn.innerHTML = '<span class="mg-av">' + ini + "</span>" + esc(user) + " ▾";
    var slot = document.getElementById("grp-slot");
    if (slot) slot.appendChild(btn); else { var w = document.createElement("div"); w.className = "mg-float"; w.appendChild(btn); document.body.appendChild(w); }
    var menu = document.createElement("div"); menu.className = "mg-menu"; menu.hidden = true; document.body.appendChild(menu);

    function lnk(href, ic, t) { return '<a class="mg-i' + (href === halaman() ? " on" : "") + '" href="' + href + '"><span class="mg-c">' + ic + "</span>" + t + "</a>"; }
    function grup(j, a) { a = a.filter(Boolean); return a.length ? '<div class="mg-t">' + j + "</div>" + a.join("") : ""; }
    var can = Auth.can;
    function bangun() {
      var m = Math.max(0, Math.floor((s.exp - Date.now()) / 60000));
      menu.innerHTML = '<div class="mg-h"><span class="mg-av big">' + ini + '</span><div><b>' + esc(s.nama || user) + '</b><div class="mg-k">@' + esc(user) + " · " + (admin ? "ADMIN" : (s.role ? "SUB ADMIN" : "USER")) + " · Sesi " + Math.floor(m / 60) + "j " + (m % 60) + "m</div></div></div>" +
        lnk("profil.html", "🪪", "Profil Saya &amp; Ganti Password") +
        grup("ALAT ADMIN", [
          admin && can("TIMPOR") ? lnk("terminate-impor.html", "📥", "Impor WhatsApp") : "",
          admin && can("TIMPOR") ? lnk("bersih-data.html", "🧹", "Bersihkan Data") : "",
          admin && can("TCHAT") ? lnk("chat-client.html", "💬", "Chat Client &amp; Kirim Data") : "",
          admin && can("TCHAT") ? lnk("pengaturan-api.html", "⚙️", "Pengaturan API") : ""]) +
        grup("HALAMAN TERMINATE", [
          can("TDIAMBIL") ? lnk("terminate-diambil.html", "📦", "Diambil") : "",
          can("TEDIT") ? lnk("terminate-edit.html", "✏️", "Edit") : "",
          can("TINPUT") ? lnk("terminate.html", "📷", "Input") : "",
          can("TLAPORAN") ? lnk("terminate-laporan.html", "📋", "Laporan") : "",
          admin && can("TDATA") ? lnk("terminate-full.html", "🗂️", "Data Penuh") : ""]) +
        grup("SISTEM LAPANGAN", [
          lnk("index.html", "🛠️", "Form Lapangan"),
          can("DASHBOARD") ? lnk("admin.html", "📊", "Dashboard Admin") : "",
          can("DATAADMIN") ? lnk("search.html", "🔎", "Pencarian Data") : "",
          can("DATAADMIN") ? lnk("laporan.html", "📑", "Laporan &amp; Input Massal") : ""]) +
        '<button type="button" class="mg-i out" data-keluar="1"><span class="mg-c">⎋</span>Keluar</button>';
    }
    btn.onclick = function (e) { e.stopPropagation(); bangun(); menu.hidden = !menu.hidden; };
    menu.onclick = function (e) { if (e.target.closest && e.target.closest("[data-keluar]")) Auth.logout(); };
    document.addEventListener("click", function (e) { if (!menu.contains(e.target)) menu.hidden = true; });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") menu.hidden = true; });
  }
  window.MenuGrup = { mount: mount };
  // otomatis dipasang di halaman biasa; halaman Terminate memanggil mount() sendiri setelah bar atasnya jadi
  if (!window.__mgManual) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
  }
})();

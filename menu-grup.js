/* NAVBAR SERAGAM untuk SEMUA halaman (bukan pop up). Butuh auth.js.
   Baris 1: nama sistem | tab grup (Terminate / Lapangan / Admin) | profil & keluar
   Baris 2: tautan milik grup yang sedang dibuka (halaman aktif disorot). Menu disaring otomatis sesuai izin akun.
   Semua tautan diatur di satu tempat: GRUP di bawah ini. */
(function () {
  var GRUP = [
    { id: "terminate", ic: "🚚", t: "Terminate", items: [
      { h: "terminate.html", ic: "📷", t: "Input", p: "TINPUT" },
      { h: "terminate-diambil.html", ic: "📦", t: "Diambil", p: "TDIAMBIL" },
      { h: "terminate-edit.html", ic: "✏️", t: "Edit", p: "TEDIT" },
      { h: "terminate-laporan.html", ic: "📋", t: "Laporan", p: "TLAPORAN" },
      { h: "terminate-full.html", ic: "🗂️", t: "Data Penuh", p: "TDATA", admin: true }] },
    { id: "lapangan", ic: "🛠️", t: "Lapangan", items: [
      { h: "index.html", ic: "📝", t: "Form Lapangan" },
      { h: "admin.html", ic: "📊", t: "Dashboard", p: "DASHBOARD" },
      { h: "search.html", ic: "🔎", t: "Pencarian", p: "DATAADMIN" },
      { h: "laporan.html", ic: "📑", t: "Laporan & Input Massal", p: "DATAADMIN", alt: ["laporan50.html"] }] },
    { id: "admin", ic: "⚙️", t: "Admin", admin: true, items: [
      { h: "terminate-impor.html", ic: "📥", t: "Impor WhatsApp", p: "TIMPOR" },
      { h: "bersih-data.html", ic: "🧹", t: "Bersihkan Data", p: "TIMPOR" },
      { h: "chat-client.html", ic: "💬", t: "Chat Client", p: "TCHAT" },
      { h: "pengaturan-api.html", ic: "🔐", t: "Pengaturan API", p: "TCHAT" }] }
  ];
  var CSS = ".mg-nav{position:sticky;top:0;z-index:2000;background:#111b3a;border-bottom:1px solid #2a385b;font-family:'Segoe UI',sans-serif;color:#e0e6ed;box-shadow:0 2px 10px rgba(0,0,0,.35)}" +
    ".mg-nav *{box-sizing:border-box}.mg-r1{display:flex;align-items:center;gap:6px;padding:6px 10px}" +
    ".mg-brand{font-weight:700;color:#fff;font-size:.95rem;margin-right:8px;white-space:nowrap;text-decoration:none}" +
    ".mg-tabs{display:flex;gap:2px;flex:1 1 auto;min-width:0;overflow-x:auto;scrollbar-width:none}.mg-tabs::-webkit-scrollbar{display:none}" +
    ".mg-tab{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:9px;color:#94a3b8;text-decoration:none;font-size:.88rem;font-weight:600;white-space:nowrap;border:1px solid transparent}" +
    ".mg-tab:hover{background:#1c2a52;color:#fff}.mg-tab.on{background:#1f3a6e;color:#fff;border-color:#38bdf8}" +
    ".mg-sp{display:none}.mg-usr{display:flex;align-items:center;gap:6px}.mg-brand{display:none}.mg-nm{display:none}.mg-tab{padding:7px 7px;font-size:.8rem;gap:4px}.mg-me{padding:3px 4px}" +
    ".mg-me{display:inline-flex;align-items:center;gap:7px;color:#e0e6ed;text-decoration:none;font-size:.82rem;font-weight:600;padding:3px 10px 3px 4px;border:1px solid #3a506b;border-radius:999px;background:#0b132b}" +
    ".mg-me:hover,.mg-me.on{border-color:#38bdf8}.mg-av{width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#38bdf8,#2563eb);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700}" +
    ".mg-sis{font-size:.7rem;color:#64748b;font-weight:500}" +
    ".mg-out{background:none;border:1px solid #7f1d1d;color:#f87171;border-radius:999px;padding:3px 12px;font-size:.8rem;font-weight:600;cursor:pointer}.mg-out:hover{background:#7f1d1d;color:#fff}" +
    ".mg-r2{display:flex;gap:2px;padding:0 10px 6px;overflow-x:auto;scrollbar-width:none;background:#0d1530;border-top:1px solid #1c2a52}.mg-r2::-webkit-scrollbar{display:none}" +
    ".mg-lk{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;color:#cbd5e1;text-decoration:none;font-size:.85rem;white-space:nowrap;border-bottom:2px solid transparent;margin-top:2px}" +
    ".mg-lk:hover{color:#fff;background:#16224a;border-radius:6px 6px 0 0}.mg-lk.on{color:#38bdf8;border-bottom-color:#38bdf8;font-weight:700}" +
    "@media(min-width:900px){.mg-brand{display:inline}.mg-nm{display:inline}.mg-sp{display:block}.mg-tabs{flex:0 1 auto}.mg-tab{padding:7px 14px;font-size:.88rem}.mg-me{padding:3px 10px 3px 4px}}";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function halaman() { return location.pathname.split("/").pop() || "index.html"; }

  function mount() {
    var s = window.Auth && Auth.get(); if (!s || document.getElementById("mg-nav")) return;
    var admin = s.role === "ADMIN", user = s.username || s.user || "?", ini = esc(user.charAt(0).toUpperCase()), now = halaman();
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);

    // saring tautan sesuai izin
    var grup = GRUP.map(function (g) {
      if (g.admin && !admin) return null;
      var it = g.items.filter(function (x) { return (!x.admin || admin) && (!x.p || Auth.can(x.p)); });
      return it.length ? { id: g.id, ic: g.ic, t: g.t, items: it } : null;
    }).filter(Boolean);
    function cocok(x) { return x.h === now || (x.alt || []).indexOf(now) >= 0; }
    var aktif = null;
    grup.forEach(function (g) { if (g.items.some(cocok)) aktif = g; });
    var profil = now === "profil.html";
    if (!aktif && !profil) aktif = grup[0] || null;           // halaman tanpa grup (mis. profil): tab pertama tidak disorot
    var tampil = aktif || (profil ? grup[0] : null);
    if (tampil && tampil.id === "terminate" && document.querySelector(".tm-nav")) tampil = null;   // halaman Terminate sudah punya menu bawah

    var nav = document.createElement("nav"); nav.id = "mg-nav"; nav.className = "mg-nav";
    var m = Math.max(0, Math.floor((s.exp - Date.now()) / 60000));
    nav.innerHTML = '<div class="mg-r1"><a class="mg-brand" href="' + esc(Auth.home()) + '">📡 Lapangan</a>' +
      '<div class="mg-tabs">' + grup.map(function (g) { return '<a class="mg-tab' + (aktif === g && !profil ? " on" : "") + '" href="' + g.items[0].h + '" data-g="' + g.id + '">' + g.ic + " " + g.t + "</a>"; }).join("") + "</div>" +
      '<div class="mg-sp"></div><div class="mg-usr">' +
      '<a class="mg-me' + (profil ? " on" : "") + '" href="profil.html" title="Profil &amp; ganti password · sesi ' + Math.floor(m / 60) + 'j ' + (m % 60) + 'm"><span class="mg-av">' + ini + "</span>" + '<span class="mg-nm">' + esc(user) + "</span></a>" +
      '<button type="button" class="mg-out" id="mg-out" title="Keluar">⎋</button></div></div>' +
      (tampil ? '<div class="mg-r2">' + tampil.items.map(function (x) { return '<a class="mg-lk' + (cocok(x) ? " on" : "") + '" href="' + x.h + '">' + x.ic + " " + esc(x.t) + "</a>"; }).join("") + "</div>" : "");
    document.body.insertBefore(nav, document.body.firstChild);
    document.getElementById("mg-out").onclick = function () { Auth.logout(); };
    var on = nav.querySelector(".mg-lk.on"); if (on && on.scrollIntoView) { try { on.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) {} }
  }
  window.MenuGrup = { mount: mount };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();

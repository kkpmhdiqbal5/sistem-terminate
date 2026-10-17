/* NAVBAR BAWAH SERAGAM untuk SEMUA halaman (bukan pop up). Butuh auth.js.
   Di BAWAH layar. Bar bawah: tab grup (Terminate / Lapangan / Admin) + Profil + Keluar.
   Di atasnya: tautan milik grup yang sedang dibuka (halaman aktif disorot). Menu disaring otomatis sesuai izin akun.
   Semua tautan diatur di satu tempat: GRUP di bawah ini. */
(function () {
  var GRUP = [
    { id: "lapangan", ic: "🛠️", t: "Lapangan", items: [
      { h: "index.html", ic: "📝", t: "Form Lapangan" },
      { h: "terminate.html", ic: "📷", t: "Input", p: "TINPUT" }] },
    { id: "terminate", ic: "🚚", t: "Terminate", items: [
      { h: "terminate-diambil.html", ic: "📦", t: "Diambil", p: "TDIAMBIL" },
      { h: "terminate-edit.html", ic: "✏️", t: "Edit", p: "TEDIT" },
      { h: "terminate-laporan.html", ic: "📋", t: "Laporan", p: "TLAPORAN" },
      { h: "terminate-full.html", ic: "🗂️", t: "Data Penuh", p: "TDATA", admin: true },
      { h: "chat-client.html", ic: "💬", t: "Chat Client", p: "TCHAT", admin: true }] },
    { id: "dashboard", ic: "📊", t: "Dashboard", items: [
      { h: "admin.html", ic: "📊", t: "Dashboard", p: "DASHBOARD" },
      { h: "search.html", ic: "🔎", t: "Pencarian", p: "DATAADMIN" }] },
    { id: "admin", ic: "⚙️", t: "Admin", admin: true, items: [            // sisa fitur admin
      { h: "terminate-impor.html", ic: "📥", t: "Impor WhatsApp", p: "TIMPOR" },
      { h: "bersih-data.html", ic: "🧹", t: "Bersihkan Data", p: "TIMPOR" },
      { h: "laporan.html", ic: "📑", t: "Laporan & Input Massal", p: "DATAADMIN", alt: ["laporan50.html"] },
      { h: "pengaturan-ai.html", ic: "🤖", t: "Pengaturan AI", p: "TCHAT" }] },
    { id: "profil", ic: "👤", t: "Profil", admin: true, items: [
      { h: "profil.html", ic: "🪪", t: "Profil Saya" },
      { h: "pengaturan-api.html", ic: "🔐", t: "Pengaturan API", p: "TAPI" }] }   // token WA/Telegram/AI: admin tertinggi
  ];
  var CSS = ".mg-nav{position:fixed;left:0;right:0;bottom:0;z-index:2000;background:#1c2541;border-top:1px solid #2a385b;font-family:'Segoe UI',sans-serif;color:#e0e6ed;box-shadow:0 -4px 14px rgba(0,0,0,.4)}" +
    ".mg-nav *{box-sizing:border-box}" +
    ".mg-r2{display:flex;gap:2px;padding:0 8px;overflow-x:auto;scrollbar-width:none;background:#111b3a;border-bottom:1px solid #2a385b;justify-content:center}.mg-r2::-webkit-scrollbar{display:none}" +
    ".mg-lk{display:inline-flex;align-items:center;gap:6px;padding:9px 12px;color:#cbd5e1;text-decoration:none;font-size:.82rem;white-space:nowrap;border-top:2px solid transparent}" +
    ".mg-lk:hover{color:#fff}.mg-lk.on{color:#38bdf8;border-top-color:#38bdf8;font-weight:700}" +
    ".mg-r1{display:flex;height:60px}" +
    ".mg-tab{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#94a3b8;text-decoration:none;font-size:.7rem;font-weight:600;background:none;border:0;cursor:pointer;font-family:inherit;padding:0}" +
    ".mg-tab .ic{font-size:1.3rem;line-height:1;height:26px;display:flex;align-items:center;justify-content:center}.mg-tab:hover{color:#fff}.mg-tab.on{color:#38bdf8}.mg-tab.out{color:#f87171}" +
    ".mg-av{width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#38bdf8,#2563eb);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700}" +
    ".bottom-app-nav,.bottom-nav,.tm-nav{display:none!important}";
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
    var tampil = aktif || grup[0] || null;

    var nav = document.createElement("nav"); nav.id = "mg-nav"; nav.className = "mg-nav";
    var m = Math.max(0, Math.floor((s.exp - Date.now()) / 60000));
    nav.innerHTML = (tampil ? '<div class="mg-r2">' + tampil.items.map(function (x) { return '<a class="mg-lk' + (cocok(x) ? " on" : "") + '" href="' + x.h + '">' + x.ic + " " + esc(x.t) + "</a>"; }).join("") + "</div>" : "") +
      '<div class="mg-r1">' + grup.map(function (g) {
        var ikon = g.id === "profil" ? '<span class="mg-av">' + ini + "</span>" : g.ic;
        return '<a class="mg-tab' + (aktif === g ? " on" : "") + '" href="' + g.items[0].h + '"' + (g.id === "profil" ? ' title="Sesi ' + Math.floor(m / 60) + "j " + (m % 60) + 'm"' : "") + '><span class="ic">' + ikon + "</span>" + g.t + "</a>"; }).join("") +
      '<button type="button" class="mg-tab out" id="mg-out"><span class="ic">⎋</span>Keluar</button></div>';
    document.body.appendChild(nav);
    document.body.style.paddingBottom = (nav.offsetHeight + 16) + "px";
    document.getElementById("mg-out").onclick = function () { Auth.logout(); };
    var on = nav.querySelector(".mg-lk.on"); if (on && on.parentNode) { try { on.parentNode.scrollLeft = on.offsetLeft - 40; } catch (e) {} }
  }
  window.MenuGrup = { mount: mount };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();

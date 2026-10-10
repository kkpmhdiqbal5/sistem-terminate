/* Login satu pintu + otoritas per halaman untuk SEMUA halaman (Dashboard, Cari, Laporan, Terminate).
   Sesi disimpan di localStorage "user_session" dan berlaku 12 jam. Izin berasal dari sheet USERS. */
(function () {
  var KEY = "user_session";
  // halaman -> izin yang dibutuhkan (ubah di sini bila ingin memindahkan halaman ke izin lain)
  var PAGES = [
    { href: "search.html", p: "DATAADMIN" },
    { href: "admin.html", p: "DASHBOARD" },
    { href: "laporan.html", p: "DATAADMIN" },
    { href: "laporan50.html", p: "DATAADMIN" },
    { href: "terminate.html", p: "TINPUT" },
    { href: "terminate-diambil.html", p: "TDIAMBIL" },
    { href: "terminate-edit.html", p: "TEDIT" },
    { href: "terminate-laporan.html", p: "TLAPORAN" },
    { href: "terminate-full.html", p: "TDATA" },
    { href: "terminate-impor.html", p: "TIMPOR" }
  ];
  var timer = null;

  function get() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s && typeof s === "object" && s.token && s.exp > Date.now()) { s.user = s.username; return s; }
    } catch (e) {}
    return null;
  }
  function pageName() { return (location.pathname.split("/").pop() || "index.html"); }
  function logout(msg) {
    try { localStorage.removeItem(KEY); } catch (e) {}
    location.replace("login.html?next=" + encodeURIComponent(pageName()) + (msg ? "&m=" + encodeURIComponent(msg) : ""));
  }
  function can(p) { var s = get(); return !!(s && s.izin && s.izin[p]); }
  function anyTerminate() { return ["TINPUT", "TDIAMBIL", "TEDIT", "TLAPORAN", "TDATA", "TIMPOR"].some(can); }
  function home() {
    for (var i = 0; i < PAGES.length; i++) if (can(PAGES[i].p)) return PAGES[i].href;
    return "index.html";
  }
  function izinHalaman(href) {
    if (href === "terminate.html") return anyTerminate();
    for (var i = 0; i < PAGES.length; i++) if (PAGES[i].href === href) return can(PAGES[i].p);
    return true;   // index.html dan tautan lain selalu boleh
  }
  function filterNav() {
    var links = document.querySelectorAll(".bottom-app-nav a, .bottom-nav a");
    for (var i = 0; i < links.length; i++) {
      var h = (links[i].getAttribute("href") || "").split("?")[0];
      if (!izinHalaman(h)) links[i].style.display = "none";
    }
  }
  // Panggil di awal halaman: Auth.guard("DASHBOARD") atau Auth.guard() (cukup login)
  function guard(perm) {
    var s = get();
    if (!s) { logout("Silakan login dulu."); throw new Error("login"); }
    if (perm && !can(perm)) {
      var h = home();
      if (h === pageName() || h === "index.html" && !anyTerminate() && !can("DASHBOARD") && !can("DATAADMIN")) {
        logout("Akun Anda belum diberi izin ke halaman ini."); throw new Error("izin");
      }
      location.replace(h); throw new Error("izin");
    }
    clearTimeout(timer);
    timer = setTimeout(function () { logout("Sesi 12 jam berakhir. Silakan login ulang."); }, Math.max(1000, s.exp - Date.now()));
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", filterNav); else filterNav();
    return s;
  }
  function save(res) {
    var exp = Math.min(res.expiresAt || Infinity, Date.now() + 12 * 3600 * 1000);
    localStorage.setItem(KEY, JSON.stringify({ username: res.user, nama: res.nama || res.user, role: res.role || "", izin: res.izin || {}, token: res.token, exp: exp }));
  }
  window.Auth = { get: get, guard: guard, can: can, logout: logout, home: home, save: save, anyTerminate: anyTerminate };
})();

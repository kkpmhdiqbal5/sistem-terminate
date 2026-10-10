/* Pembaca export chat WhatsApp (.txt dari "Ekspor chat") -> baris untuk sheet Instalasi / MT.
   Berjalan di browser; foto/media di dalam zip diabaikan. */
(function (root) {
  var HEAD = /^‎?\[?(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4}),?\s+(\d{1,2})[.:](\d{2})(?:[.:]\d{2})?(?:\s?[APap]\.?[Mm]\.?)?\]?\s*(?:-\s*)?([^:]{1,80}?):\s?(.*)$/;
  var MT_WORDS = /(ganti|penggantian|tukar|swap|replace|rusak)\s*(perangkat|ont|modem|stb|onu|router|unit)?/i;
  var MT_HINT = /(maintenance|\bmt\b|tiket|gangguan|troubleshoot|ganti|penggantian)/i;
  var INS_HINT = /(instalasi|installasi|pasang baru|\bpsb\b|aktivasi|new install)/i;

  function bersih(s) { return String(s || "").replace(/[‎‏‪-  ]/g, " ").replace(/\s+$/g, ""); }
  function iso(d, m, y) { y = +y; if (y < 100) y += 2000; return y + "-" + ("0" + m).slice(-2) + "-" + ("0" + d).slice(-2); }

  // Pecah teks export menjadi pesan {tanggal, jam, pengirim, teks}
  function pesan(txt) {
    var out = [], cur = null, lines = String(txt || "").split(/\r?\n/);
    lines.forEach(function (raw) {
      var line = raw.replace(/^‎/, "");
      var m = HEAD.exec(line);
      if (m) {
        cur = { tanggal: iso(m[1], m[2], m[3]), jam: m[4] + ":" + m[5], pengirim: bersih(m[6]), teks: bersih(m[7]) };
        out.push(cur);
      } else if (cur) cur.teks += "\n" + bersih(raw);
    });
    return out.filter(function (p) { return !/<Media omitted>|\(file attached\)|^null$/i.test(p.teks.trim()); });
  }

  var LBL = {
    nama: /^(?:\d+\s*[.)]\s*)?(?:nama(?:\s*(?:cust|customer|pelanggan|lama|client))?|a\/n|an)\s*[:=]\s*(.*)$/i,
    cid: /^(?:\d+\s*[.)]\s*)?(?:cid(?:\s*lama)?|id\s*pelanggan|no\.?\s*pelanggan|nomor\s*pelanggan)\s*[:=]\s*(.*)$/i,
    odp: /^(?:odp|nama\s*odp)\s*[:=]\s*(.*)$/i,
    pop: /^(?:pop|area)\s*[:=]\s*(.*)$/i,
    psn: /^(?:p[\s\-]?sn|psn|port\s*sn|sn\s*port)\s*[:=]\s*(.*)$/i,
    snbaru: /^(?:sn|s\/n)\s*(?:ont\s*|unit\s*)?baru\s*[:=]\s*(.*)$/i,
    snlama: /^(?:sn|s\/n)\s*(?:ont\s*|unit\s*)?lama\s*[:=]\s*(.*)$/i,
    sn: /^(?:sn(?:\s*(?:ont|unit))?|s\/n|serial(?:\s*number)?)\s*[:=]\s*(.*)$/i,
    ket: /^(?:ket|keterangan|status|kendala)\s*[:=]\s*(.*)$/i
  };
  function nilai(k, v) {
    v = bersih(v).trim();
    if (k === "cid") return v.replace(/[^0-9]/g, "");
    if (k === "sn" || k === "psn" || k === "snbaru" || k === "snlama") return v.toUpperCase().replace(/\s+/g, "").replace(/^[:=]/, "");
    if (k === "odp") return v.toUpperCase();
    return v;
  }
  // Satu pesan bisa memuat beberapa pelanggan: blok baru dimulai di baris "Nama :"
  function blok(teks) {
    var blocks = [], cur = null;
    teks.split("\n").forEach(function (ln) {
      var l = ln.trim();
      if (!l) return;
      if (LBL.nama.test(l)) {
        if (cur && (cur.cid || cur.sn)) { blocks.push(cur); cur = null; }
        if (!cur) cur = { _raw: [] };
      }
      if (!cur) cur = { _raw: [] };
      cur._raw.push(l);
      for (var k in LBL) {
        var m = LBL[k].exec(l);
        if (m) { var v = nilai(k, m[1]); if (v && !cur[k]) cur[k] = v; break; }
      }
    });
    if (cur) blocks.push(cur);
    blocks.forEach(function (b) {
      if (b.snbaru) { if (b.sn && b.sn !== b.snbaru && !b.snlama) b.snlama = b.sn; b.sn = b.snbaru; }
    });
    return blocks.filter(function (b) { return b.cid || b.sn || b.psn; });
  }

  // opsi: {mode: 'campur'|'Instalasi'|'MT', ragu: 'Instalasi'|'MT'|'lewati', mtHanyaGanti: true}
  function ekstrak(txt, opsi) {
    opsi = opsi || {};
    var hasil = [], ps = pesan(txt);
    ps.forEach(function (p) {
      blok(p.teks).forEach(function (b) {
        var all = b._raw.join(" ");
        var konteks = all + " " + p.teks.replace(/\n/g, " ");   // petunjuk bisa ada di pesan, bukan di blok
        var sheet = opsi.mode === "Instalasi" || opsi.mode === "MT" ? opsi.mode : "";
        if (!sheet) {
          var mt = MT_HINT.test(all), ins = INS_HINT.test(all);
          if (!mt && !ins) { mt = MT_HINT.test(konteks); ins = INS_HINT.test(konteks); }
          sheet = mt && !ins ? "MT" : (ins && !mt ? "Instalasi" : (opsi.ragu && opsi.ragu !== "lewati" ? opsi.ragu : ""));
        }
        if (!sheet) return;
        if (sheet === "MT" && opsi.mtHanyaGanti !== false && !(MT_WORDS.test(all) && (b.sn || b.psn))) return;
        hasil.push({ sheet: sheet, tanggal: p.tanggal, pengirim: p.pengirim, nama: b.nama || "", cid: b.cid || "", odp: b.odp || "", pop: b.pop || "",
                     sn: b.sn || "", psn: b.psn || "", ket: ((b.ket || "") + (b.snlama ? (b.ket ? " | " : "") + "SN lama: " + b.snlama : "")) });
      });
    });
    return { jumlahPesan: ps.length, baris: hasil };
  }
  root.WAParser = { pesan: pesan, blok: blok, ekstrak: ekstrak };
  if (typeof module !== "undefined") module.exports = root.WAParser;
})(typeof window !== "undefined" ? window : globalThis);

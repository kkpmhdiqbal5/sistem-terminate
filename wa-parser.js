/* Pembaca laporan teknisi -> baris untuk sheet Instalasi / MT.
   Bisa membaca (1) file "Ekspor chat" WhatsApp (.txt/.zip, ada stempel waktu) DAN
                (2) teks laporan biasa yang ditempel/disimpan tanpa stempel waktu.
   Berjalan di browser; foto/media diabaikan. */
(function (root) {
  var HEAD = /^‎?\[?(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4}),?\s+(\d{1,2})[.:](\d{2})(?:[.:]\d{2})?(?:\s?[APap]\.?[Mm]\.?)?\]?\s*(?:-\s*)?([^:]{1,80}?):\s?(.*)$/;
  var MT_WORDS = /(ganti|penggantian|tukar|swap|replace|rusak)\s*(perangkat|ont|modem|stb|onu|router|unit)?/i;
  var MT_HINT = /(maintenance|\bmt\b|tiket|gangguan|troubleshoot|ganti|penggantian)/i;
  var INS_HINT = /(instalasi|installasi|pasang baru|\bpsb\b|aktivasi|new install)/i;
  var BULAN = ["januari", "februari", "maret", "april", "mei", "juni", "juli", "agustus", "september", "oktober", "november", "desember"];

  function bersih(s) { return String(s || "").replace(/[‎‏‪-‮⁦-⁩﻿ ]/g, " ").replace(/\s+$/g, ""); }
  function iso(d, m, y) { y = +y; if (y < 100) y += 2000; return y + "-" + ("0" + m).slice(-2) + "-" + ("0" + d).slice(-2); }
  function popNorm(v) {
    var n = String(v || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (n.indexOf("PERBAUNGAN") > -1 || n.indexOf("PRBGN") > -1) return "PERBAUNGAN";
    if (n.indexOf("PANTAICERMIN") > -1 || n.indexOf("PTCRMN") > -1) return "PANTAI CERMIN";
    return "";
  }
  // tanggal dari teks: "9 , OKTOBER, 2026" | "Sabtu,10/10/2026" | "8 Oktober 2026"
  function tglDari(s) {
    s = String(s || "");
    var m = /(\d{1,2})\s*[,.]?\s*(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s*[,.]?\s*(\d{4})/i.exec(s);
    if (m) return iso(m[1], BULAN.indexOf(m[2].toLowerCase()) + 1, m[3]);
    m = /(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/.exec(s);
    if (m) return iso(m[1], m[2], m[3]);
    return "";
  }
  function odpNama(v) {
    v = String(v || "").trim();
    var pop = popNorm(v.replace(/^ODP[\s\-]*([A-Z]+).*$/i, "$1"));
    var nama = v.replace(/^ODP[\s\-]+[A-Z]+[\s\-]+\d+[\s\-]+\d+\s*(?:[-·•:]\s*)?/i, "").replace(/~/g, " ").replace(/\s+/g, " ").trim();
    return { nama: (nama || v).toUpperCase(), pop: pop };
  }

  // Pecah teks export menjadi pesan {tanggal, jam, pengirim, teks}. Tanpa stempel waktu -> satu pesan besar.
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
    out = out.filter(function (p) { return !/<Media omitted>|\(file attached\)|^null$/i.test(p.teks.trim()); });
    if (!out.length && String(txt || "").trim()) out = [{ tanggal: "", jam: "", pengirim: "", teks: bersih(txt).replace(/\r/g, "") }];
    return out;
  }

  var NUM = "(?:\\d+\\s*[.)]\\s*)?";
  var LBL = {
    wo: new RegExp("^" + NUM + "wo\\s*[:=]\\s*(.*)$", "i"),
    nama: new RegExp("^" + NUM + "(?:nama(?:\\s*(?:cust|customer|pelanggan|lama|client))?|a\\/n|an|pelanggan)\\s*[:=]\\s*(.*)$", "i"),
    cid: new RegExp("^" + NUM + "(?:cid(?:\\s*lama)?|id\\s*pelanggan|no\\.?\\s*pelanggan|nomor\\s*pelanggan)\\s*[:=]\\s*(.*)$", "i"),
    odp: /^(?:odp|nama\s*odp)\s*[:=]\s*(.*)$/i,
    pop: /^(?:pop|area|olt)\s*[:=]\s*(.*)$/i,
    psn: /^(?:p[\s\-]?sn|psn|port\s*sn|sn\s*port)\s*[:=]\s*(.*)$/i,
    snbaru: /^(?:sn|s\/n)\s*(?:ont\s*|unit\s*)?baru\s*[:=]\s*(.*)$/i,
    snlama: /^(?:sn|s\/n)\s*(?:ont\s*|unit\s*)?lama\s*[:=]\s*(.*)$/i,
    sn: /^(?:sn(?:\s*(?:ont|unit))?|s\/n|serial(?:\s*number)?)\s*[:=]\s*(.*)$/i,
    laporan: /^(?:laporan|tanggal)\s*[:=]\s*(.*)$/i,
    ket: /^(?:ket|keterangan|status|kendala)\s*[:=]\s*(.*)$/i
  };
  function nilai(k, v, b) {
    v = bersih(v).trim();
    if (k === "cid") return v.replace(/[^0-9]/g, "");
    if (k === "sn" || k === "psn" || k === "snbaru" || k === "snlama") {
      var cat = /\(([^)]*)\)/.exec(v);                       // "(lama)", "(Dismental)" -> catatan, bukan bagian SN
      if (cat && b) b._cat = (b._cat ? b._cat + ", " : "") + cat[1].trim();
      return v.replace(/\([^)]*\)/g, "").toUpperCase().replace(/\s+/g, "").replace(/^[:=]/, "");
    }
    if (k === "odp") return v;
    return v;
  }
  function judul(l) { return l.replace(/[*_~]/g, "").replace(/[:\s.]+$/g, "").trim().toUpperCase(); }

  // Satu pesan -> beberapa blok pelanggan. ctx: {tgl, pop}
  function blok(teks, ctx) {
    ctx = ctx || {};
    var blocks = [], cur = null, sec = "";
    function tutup() { if (cur) { blocks.push(cur); cur = null; } }
    String(teks || "").split("\n").forEach(function (ln) {
      var l = bersih(ln).trim();
      if (!l) return;
      var j = judul(l);
      // judul bagian
      if (/^(MAINTENANCE( ION CORE| ION BROADBAND)?|MAINTENANCE & INSTALASI)$/.test(j) && j !== "MAINTENANCE & INSTALASI") { tutup(); sec = "MAINTENANCE"; return; }
      if (/^INSTALASI( ION BROADBAND)?$/.test(j)) { tutup(); sec = "INSTALASI"; return; }
      if (/^RESCHEDULE$/.test(j)) { tutup(); sec = "RESCHEDULE"; return; }
      if (/^UPDATE LAPORAN/.test(j) || /^LAPORAN[\s\-]*SELESAI/.test(j)) { tutup(); sec = ""; return; }
      // keterangan header (bukan milik blok pelanggan)
      var h = /^\*?\s*(?:hari\s*\/?\s*tanggal)\s*[:=]\s*(.*)$/i.exec(l);
      if (h) { tutup(); var t = tglDari(h[1]); if (t) ctx.tgl = t; return; }
      var lk = /^\*?\s*lokasi\s*[:=]\s*(.*)$/i.exec(l);
      if (lk) { ctx.pop = popNorm(lk[1]) || ctx.pop; return; }
      if (!/[:=]/.test(l) && tglDari(l) && /(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)/i.test(l)) { tutup(); ctx.tgl = tglDari(l); return; }
      if (/^\*?\s*(kegiatan|teknisi|team teknisi)\b/i.test(l) && !(cur && cur._wo)) { tutup(); return; }

      // awal blok baru
      var mulai = false;
      if (LBL.wo.test(l)) mulai = true;
      else if (LBL.nama.test(l) && (!cur || (cur.cid || cur.sn || cur.snlama))) mulai = !(cur && cur._wo && !cur.cid && !cur.sn && !cur.nama0);
      if (mulai) { tutup(); cur = { _raw: [], sec: sec, pop0: ctx.pop || "", tgl0: ctx.tgl || "", _wo: LBL.wo.test(l) }; }
      if (!cur) cur = { _raw: [], sec: sec, pop0: ctx.pop || "", tgl0: ctx.tgl || "" };
      cur._raw.push(l);
      var wo = /WO-(\d{4})(\d{2})(\d{2})/i.exec(l); if (wo && !cur.tglwo) cur.tglwo = wo[1] + "-" + wo[2] + "-" + wo[3];
      for (var k in LBL) {
        if (k === "wo") continue;
        var m = LBL[k].exec(l);
        if (m) {
          if (k === "nama") cur.nama0 = true;
          if (k === "laporan") { var t2 = tglDari(m[1]); if (t2 && !cur.tgl) cur.tgl = t2; break; }
          var v = nilai(k, m[1], cur); if (v && !cur[k]) cur[k] = v; break;
        }
      }
    });
    tutup();
    blocks.forEach(function (b) {
      if (b.snbaru) { if (b.sn && b.sn !== b.snbaru && !b.snlama) b.snlama = b.sn; b.sn = b.snbaru; }
      var o = odpNama(b.odp); b.odpN = o.nama; b.popOdp = o.pop;
      b.popN = popNorm(b.pop) || b.popOdp || b.pop0 || "";
      b.tglN = b.tgl || b.tglwo || b.tgl0 || "";
    });
    return blocks.filter(function (b) { return b.cid || b.sn || b.psn; });
  }

  // opsi: {mode: 'campur'|'Instalasi'|'MT', ragu: 'Instalasi'|'MT'|'lewati', mtHanyaGanti: true}
  function ekstrak(txt, opsi) {
    opsi = opsi || {};
    var hasil = [], ps = pesan(txt);
    ps.forEach(function (p) {
      var ctx = { tgl: p.tanggal || "", pop: "" };
      blok(p.teks, ctx).forEach(function (b) {
        var all = b._raw.join(" ");
        var sheet = opsi.mode === "Instalasi" || opsi.mode === "MT" ? opsi.mode : "";
        if (!sheet) {
          if (b.sec === "INSTALASI") sheet = "Instalasi";
          else if (b.sec === "MAINTENANCE") sheet = "MT";
          else if (b.sec === "RESCHEDULE") return;
          else if (b.snlama) sheet = "MT";
          else {
            var konteks = all + " " + p.teks.replace(/\n/g, " ");
            var mt = MT_HINT.test(all), ins = INS_HINT.test(all);
            if (!mt && !ins) { mt = MT_HINT.test(konteks); ins = INS_HINT.test(konteks); }
            sheet = mt && !ins ? "MT" : (ins && !mt ? "Instalasi" : (opsi.ragu && opsi.ragu !== "lewati" ? opsi.ragu : ""));
          }
        }
        if (!sheet) return;
        if (sheet === "MT" && opsi.mtHanyaGanti !== false && !(b.snlama || (MT_WORDS.test(all) && (b.sn || b.psn)))) return;
        if (sheet === "Instalasi" && !(b.sn || b.psn || b.cid)) return;
        var ket = [];
        if (b.ket && sheet === "MT") ket.push(b.ket);
        if (b._cat && sheet === "Instalasi") ket.push(b._cat);
        hasil.push({ sheet: sheet, tanggal: b.tglN, jam: p.jam, pengirim: p.pengirim, nama: b.nama || "", cid: b.cid || "", odp: b.odpN || "", pop: b.popN || "", popasli: b.popN ? "" : (b.pop || ""),
                     sn: b.sn || "", snlama: b.snlama || "", psn: b.psn || "", ket: ket.join(" | ") });
      });
    });
    return { jumlahPesan: ps.length, baris: hasil };
  }
  root.WAParser = { pesan: pesan, blok: blok, ekstrak: ekstrak };
  if (typeof module !== "undefined") module.exports = root.WAParser;
})(typeof window !== "undefined" ? window : globalThis);

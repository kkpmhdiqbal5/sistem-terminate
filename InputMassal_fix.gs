/**
 * PERBAIKAN handleInputMassal  -> GANTI fungsi lama dengan isi file ini (nama & cara panggil sama:
 *   if (data.action === "inputMassalFile") response = handleInputMassal(data.teks, data.sheet);   // tambah data.sheet)
 *
 * - Satu pelanggan = satu baris (pemisah = munculnya "NAMA :" baru, bukan baris kosong; aman untuk .docx/WA)
 * - Kolom dicocokkan PERSIS (PAKET tidak lagi salah masuk ke KET)
 * - POP diambil dari kode ODP (PTCRMN = pantai cermin, PRBGN = perbaungan); ODP disimpan hanya nama belakangnya.
 *   Tanpa kode itu, POP yang ditulis perbaungan / pantai cermin tetap diterima. Selain itu dilewati + dilaporkan.
 * - Hanya menulis ke SATU sheet: nama sheet diisi admin di form Input Data Massal (kosong = "target").
 * - CID yang sudah ada di Full Data/target/Baris 1/Baris 2 dilewati (seperti aturan lama)
 */
const SHEET_DILARANG_INPUT = ["USERS", "LOG TERMINATE", "LOG HAPUS BERSIH", "CHAT CLIENT", "CHAT LOG"];   // tidak boleh jadi tujuan input massal

function handleInputMassal(teks, sheetTujuan) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  // Hanya SATU sheet yang ditulis: nama sheet diisi admin di form (kosong = "target")
  sheetTujuan = String(sheetTujuan || "target").trim();
  if (SHEET_DILARANG_INPUT.indexOf(sheetTujuan) > -1) return { status: "error", message: "Sheet '" + sheetTujuan + "' tidak boleh dipakai sebagai tujuan input." };
  if (!ss.getSheetByName(sheetTujuan)) return { status: "error", message: "Sheet tujuan '" + sheetTujuan + "' tidak ditemukan. Periksa penulisan nama sheet (huruf besar/kecil dan spasi)." };
  const TUJUAN_INPUT = [sheetTujuan];
  teks = String(teks || "").replace(/\r/g, "").replace(/[ ‎‏]/g, " ");
  if (!teks.trim()) return { status: "error", message: "Teks kosong" };

  const kunci = k => {
    k = k.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (k === "NAMA" || k === "AN") return "NAMA";
    if (k === "CID") return "CID";
    if (k === "PAKET") return "PAKET";
    if (k === "ALAMAT") return "ALAMAT";
    if (["NOHP", "HP", "NOTELP", "TELP", "WA", "KONTAK"].indexOf(k) > -1) return "HP";
    if (["SHERLOK", "SHERLOCK", "SHARELOC", "SHARELOK", "SHERELOC", "SHARELOKASI"].indexOf(k) > -1) return "SHER";
    if (k === "ODP") return "ODP";
    if (k === "POP") return "POP";
    if (k === "SALES" || k === "DS") return "SALES";
    if (k === "KET" || k === "KETERANGAN") return "KET";
    if (k === "TS") return "TS";
    return null;
  };
  const popBaku = v => {
    const n = String(v || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (n.indexOf("PERBAUNGAN") > -1) return "perbaungan";
    if (n.indexOf("PANTAICERMIN") > -1) return "pantai cermin";
    return "";
  };

  // POP ditentukan dari kode ODP: PTCRMN -> PANTAI CERMIN, PRBGN -> PERBAUNGAN.
  // Tanpa kode itu, POP yang ditulis "perbaungan"/"pantai cermin" tetap diterima. Selain itu dilewati.
  const popKode = odp => {
    const m = /ODP[\s\-]+(PRBGN|PTCRMN)\b/i.exec(String(odp || ""));
    return m ? (m[1].toUpperCase() === "PTCRMN" ? "pantai cermin" : "perbaungan") : "";
  };
  const odpAkhir = v => {                      // "ODP-PTCRMN-20987-001 - LUBUK SABAN 01" -> "LUBUK SABAN 01"
    v = String(v || "").trim();
    const r = v.replace(/^ODP[\s\-]+[A-Za-z]+[\s\-]+\d+[\s\-]+\d+\s*(?:[-–·•:]\s*)?/i, "").replace(/\s+/g, " ").trim();
    return r || v;
  };

  // 1) pecah menjadi blok pelanggan
  const blok = []; let cur = null;
  teks.split("\n").forEach(raw => {
    const line = raw.trim(); if (!line) return;
    const m = line.match(/^([A-Za-z .\-\/]{1,15}?)\s*[:：]\s*(.*)$/);
    const k = m ? kunci(m[1]) : null;
    if (k === "NAMA" && (!cur || cur.f.NAMA !== undefined)) { cur = { f: {}, raw: [] }; blok.push(cur); }
    if (!cur) { cur = { f: {}, raw: [] }; blok.push(cur); }
    cur.raw.push(line);
    if (k) { if (k !== "TS") cur.f[k] = (cur.f[k] ? cur.f[k] + " " : "") + m[2].trim(); cur.last = k; }
    else if (cur.last === "ALAMAT" && !m) cur.f.ALAMAT += " " + line;      // alamat yang sambung ke baris berikutnya
  });

  // 2) CID yang sudah ada
  const ada = typeof getActiveCids === "function" ? getActiveCids(ss) : new Set();
  const sheets = TUJUAN_INPUT.map(n => {
    const sh = ss.getSheetByName(n);
    if (!sh) throw new Error("Sheet '" + n + "' tidak ditemukan");
    const hd = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).toUpperCase().replace(/[^A-Z0-9]/g, ""));
    const col = (...a) => { for (const x of a) { const i = hd.indexOf(x); if (i > -1) return i; } return -1; };
    return { sh: sh, n: hd.length, rows: [], C: {
      TIME: col("TIME", "TANGGAL"), NAMA: col("NAMA"), CID: col("CID"), PAKET: col("PAKET"), ALAMAT: col("ALAMAT"),
      HP: col("NOHP", "HP"), SHER: col("SHERLOK", "SHERLOCK"), ODP: col("ODP"), POP: col("POP"),
      SALES: col("SALES", "DS"), KET: col("KET"), DATA: col("DATA") } };
  });

  const waktu = Utilities.formatDate(new Date(), "Asia/Jakarta", "dd/MM/yyyy HH:mm:ss");
  let masuk = 0;
  const lewat = [];                                     // data yang dilewati: {nama, cid, alasan, raw}
  const hitung = { pop: 0, dobel: 0, kosong: 0 };
  blok.forEach(b => {
    const cid = (b.f.CID || "").replace(/\D/g, "");
    const info = { nama: b.f.NAMA || "(tanpa nama)", cid: cid || "-", raw: b.raw.join("\n") };
    if (!b.f.NAMA && !cid) { hitung.kosong++; info.alasan = "tidak ada NAMA dan CID"; lewat.push(info); return; }
    const pop = popKode(b.f.ODP) || popBaku(b.f.POP);
    if (!pop) {
      hitung.pop++;
      info.alasan = "kode ODP bukan PRBGN / PTCRMN" + (b.f.POP ? " dan POP \"" + b.f.POP + "\" bukan perbaungan / pantai cermin" : " dan POP tidak tertulis perbaungan / pantai cermin");
      lewat.push(info); return;
    }
    if (cid && ada.has(cid)) { hitung.dobel++; info.alasan = "CID sudah ada di data (duplikat)"; lewat.push(info); return; }
    if (cid) ada.add(cid);
    sheets.forEach(S => {
      const row = new Array(S.n).fill("");
      const set = (i, v) => { if (i > -1 && v !== undefined) row[i] = v; };
      set(S.C.TIME, waktu); set(S.C.NAMA, b.f.NAMA); set(S.C.CID, cid); set(S.C.PAKET, b.f.PAKET);
      set(S.C.ALAMAT, b.f.ALAMAT); set(S.C.HP, b.f.HP); set(S.C.SHER, b.f.SHER); set(S.C.ODP, odpAkhir(b.f.ODP));
      set(S.C.POP, pop); set(S.C.SALES, b.f.SALES); set(S.C.KET, b.f.KET); set(S.C.DATA, b.raw.join("\n"));
      S.rows.push(row);
    });
    masuk++;
  });

  sheets.forEach(S => {
    if (!S.rows.length) return;
    const rg = S.sh.getRange(S.sh.getLastRow() + 1, 1, S.rows.length, S.n);
    rg.setNumberFormat("@"); rg.setValues(S.rows);
  });

  // pesan notifikasi: berapa masuk, berapa dilewati, karena apa, dan siapa saja
  let msg = "Berhasil masuk: " + masuk + " data (ke " + TUJUAN_INPUT.join(" + ") + ").";
  if (lewat.length) {
    msg += "\n\nDILEWATI: " + lewat.length + " data";
    if (hitung.pop) msg += "\n- " + hitung.pop + " karena kode ODP bukan PRBGN/PTCRMN dan POP bukan perbaungan / pantai cermin";
    if (hitung.dobel) msg += "\n- " + hitung.dobel + " karena CID sudah ada (duplikat)";
    if (hitung.kosong) msg += "\n- " + hitung.kosong + " karena tidak ada NAMA dan CID";
    msg += "\n\nRincian:";
    lewat.slice(0, 20).forEach((x, i) => { msg += "\n" + (i + 1) + ". " + x.nama + " (CID " + x.cid + ") - " + x.alasan; });
    if (lewat.length > 20) msg += "\n... dan " + (lewat.length - 20) + " lainnya";
    msg += "\n\nData yang dilewati dibiarkan di kotak teks agar bisa diperbaiki lalu diproses lagi.";
  }
  return { status: "success", message: msg, masuk: masuk, dilewati: lewat.length, rincian: hitung,
           sisa: lewat.map(x => x.raw).join("\n\n") };
}

/**
 * BERSIHKAN sampah di sheet "target" hasil bug lama.  Urutan aman:
 *   1) cadanganTarget()     -> salin sheet target ke "target cadangan" (bisa dihapus nanti)
 *   2) cekSampahTarget()    -> hanya menampilkan jumlah di Log (tidak mengubah apa pun)
 *   3) hapusSampahTarget()  -> menghapus baris sampah
 * Sampah = kolom waktu berformat "2026-10-10 19:25:03" (format bug lama; data benar memakai dd/MM/yyyy)
 *          ATAU kolom PAKET berisi "Input Massal".
 */
function sampahTarget_() {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("target");
  const v = sh.getDataRange().getValues();
  const h = v[0].map(x => String(x).toUpperCase().replace(/[^A-Z0-9]/g, ""));
  const iP = h.indexOf("PAKET");
  const out = [];
  for (let r = 1; r < v.length; r++) {
    const a = v[r][0];
    const iso = typeof a === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(a.trim());
    const im = iP > -1 && String(v[r][iP]).trim() === "Input Massal";
    if (iso || im) out.push(r + 1);
  }
  return { sh: sh, rows: out };
}
function cadanganTarget() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const lama = ss.getSheetByName("target cadangan"); if (lama) ss.deleteSheet(lama);
  ss.getSheetByName("target").copyTo(ss).setName("target cadangan");
  Logger.log("Cadangan dibuat: target cadangan");
}
function cekSampahTarget() {
  const s = sampahTarget_();
  Logger.log("Baris sampah: " + s.rows.length + " | pertama: " + s.rows[0] + " | terakhir: " + s.rows[s.rows.length - 1]);
}
function hapusSampahTarget() {
  const s = sampahTarget_();
  const grup = [];
  s.rows.forEach(r => { const g = grup[grup.length - 1]; if (g && g[1] === r - 1) g[1] = r; else grup.push([r, r]); });
  for (let i = grup.length - 1; i >= 0; i--) s.sh.deleteRows(grup[i][0], grup[i][1] - grup[i][0] + 1);
  Logger.log("Dihapus: " + s.rows.length + " baris");
}

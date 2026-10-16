// =======================================================
// KONFIGURASI UTAMA
// =======================================================
const SPREADSHEET_ID = "1maoJBATshhb7S8ZPF_8rKOigefztynVnt1mjTWfPxvI"; 
const IMGBB_API_KEY = "006363dcedeee151ee44d188b8ee67f6"; 
const TELEGRAM_CHAT_ID = "8476745358"; 

const BOT_RUMAH_TOKEN = "8782461297:AAF86N2WvKmbbhbQEnQ7rzfaHmPhxmVf5Xg";
const BOT_PERANGKAT_TOKEN = "8903234783:AAEw2CyDfh_hNyVTEUxgF-h0XTiNvL01u14";

const SHEET_BARIS_1 = "Baris 1";
const SHEET_BARIS_2 = "Baris 2"; 
const SHEET_FULL_DATA = "Full Data";
const SHEET_TARGET = "target";
const SHEET_SUDAH_DIAMBIL = "sudah diambil";
const SHEET_USERS = "USERS";
const SHEET_DILARANG_INPUT = ["USERS", "LOG TERMINATE", "LOG HAPUS BERSIH", "CHAT CLIENT", "CHAT LOG"];   // tidak boleh jadi tujuan input massal

// =======================================================
// FUNGSI PENERIMA HTTP (DO GET & DO POST)
// =======================================================
function doGet(e) {
  try {
    const action = e.parameter ? e.parameter.action : null;
    let response = { status: "error", message: "Action tidak dikenali" };

    if (action === "login") response = handleLogin(e.parameter.username, e.parameter.password);
    else if (action === "getInfoPerangkat") response = getInfoPerangkatKhususBaris1(e.parameter.sheetName);
    else if (action === "getDataAdmin") response = getDataLengkap();

    return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const w = (typeof waHookRoute_ === "function") ? waHookRoute_(e) : null; if (w) return w;   // webhook WhatsApp (ChatClient.gs)
    const data = JSON.parse(e.postData.contents);
    const t = terminateRoute_(data); if (t) return t;
    let response = { status: "error", message: "Gagal memproses permintaan" };
    
    if (data.action === "inputMassalFile") response = handleInputMassal(data.teks, data.sheet);
    else if (data.action === "hapusArsipSelektif") response = handleHapusArsip(data.teksCid);
    else if (data.action === "mutasiData") response = handleMutasiData(data);
    else response = handleFormLapangan(data); 
    
    return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getActiveCids(ss) {
  const cids = new Set();
  [SHEET_FULL_DATA, SHEET_TARGET, SHEET_BARIS_1, SHEET_BARIS_2].forEach(sName => {
    const sh = ss.getSheetByName(sName);
    if (sh) {
      const data = sh.getDataRange().getValues();
      if (data.length > 1) {
        const h = data[0].map(x => String(x).toUpperCase().trim());
        const idx = h.findIndex(x => x.includes("CID"));
        if (idx > -1) {
          for (let i = 1; i < data.length; i++) {
            let c = String(data[i][idx]).trim();
            if (c) cids.add(c);
          }
        }
      }
    }
  });
  return cids;
}

// =======================================================
// 1. INPUT FORM LAPANGAN
// =======================================================
function handleFormLapangan(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const cidBaru = String(data.cid_lama).trim();
  const activeCids = getActiveCids(ss);

  if (cidBaru !== "" && activeCids.has(cidBaru)) {
    return { status: "error", message: `CID ${cidBaru} sudah ada di database. Input tidak ditulis ulang.` };
  }

  const sheetBaris1 = ss.getSheetByName(SHEET_BARIS_1);
  if (!sheetBaris1) throw new Error("Sheet 'Baris 1' tidak ditemukan");
  
  const headers = sheetBaris1.getRange(1, 1, 1, sheetBaris1.getLastColumn()).getValues()[0].map(h => String(h).toUpperCase().trim());
  const timestamp = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd HH:mm:ss");
  
  const urlFotoRumah = uploadToImgbb(data.foto_rumah_url);
  const urlFotoAlat = uploadToImgbb(data.foto_alat_url);

  let ketFinal = data.keterangan ? String(data.keterangan).trim() : "";
  if (ketFinal === "") {
    ketFinal = "Perangkat Sudah Diambil Dan Port Sudah Di Cabut";
  }

  let namaTS = data.nama_ts ? String(data.nama_ts).trim() : "-";

  let newRow = new Array(headers.length).fill("");
  const setVal = (possibleNames, value) => {
    for (let name of possibleNames) {
      let idx = headers.findIndex(h => h.includes(name));
      if (idx > -1) { newRow[idx] = value; break; }
    }
  };

  setVal(["TIMESTAMP", "WAKTU"], timestamp);
  setVal(["KOORDINAT", "SHERLOCK"], data.koordinat);
  setVal(["ODP"], data.odp);
  setVal(["POP"], data.pop);
  setVal(["CID LAMA", "CID"], data.cid_lama);
  setVal(["NAMA LAMA", "NAMA"], data.nama_lama);
  setVal(["SN UNIT", "SN"], data.sn);
  setVal(["KETERANGAN", "KET"], ketFinal);
  setVal(["NAMA TS", "TS", "TEKNISI"], namaTS);
  setVal(["FOTO RU"], urlFotoRumah); 
  setVal(["FOTO AL", "FOTO I"], urlFotoAlat); 
  setVal(["LINK MAPS"], `https://www.google.com/maps?q=${data.koordinat}`);
  setVal(["P-SN"], data.psn);

  sheetBaris1.appendRow(newRow);

  const captionAlat = 
`Nama : ${data.nama_lama}
CID      : ${data.cid_lama}
ODP    : ${data.odp}
SN       : ${data.sn}
TS       : ${namaTS}
KET     : ${ketFinal}`;

  sendTelegramPhoto(BOT_PERANGKAT_TOKEN, TELEGRAM_CHAT_ID, urlFotoAlat, captionAlat);

  const captionRumah = 
`Nama : ${data.nama_lama}
CID      : ${data.cid_lama}
ODP    : ${data.odp}
MAPS  : https://www.google.com/maps?q=${data.koordinat}
TS       : ${namaTS}
KET     : ${ketFinal}`;

  sendTelegramPhoto(BOT_RUMAH_TOKEN, TELEGRAM_CHAT_ID, urlFotoRumah, captionRumah);

  return { status: "success", message: "Data berhasil dikirim dan disimpan." };
}

// =======================================================
// 2. INPUT MASSAL
// =======================================================
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

// =========================================================================
// 3. MESIN HAPUS MASSAL SELEKTIF + ARSIP & KUNJUNGAN (LENGKAP & ROBUST)
// =========================================================================
function handleHapusArsip(teksCid) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheetFullData = ss.getSheetByName(SHEET_FULL_DATA); 
  var sheetTarget = ss.getSheetByName(SHEET_TARGET); 
  var sheetBaris1 = ss.getSheetByName(SHEET_BARIS_1);
  var sheetBaris2 = ss.getSheetByName(SHEET_BARIS_2);
  var sheetArsip = ss.getSheetByName(SHEET_SUDAH_DIAMBIL); 
  var sheetKunjungan = ss.getSheetByName("kunjungan"); 
  
  if (!sheetArsip) return { status: "error", message: "Eror: Sheet 'sudah diambil' tidak ditemukan." };
  if (!sheetKunjungan) return { status: "error", message: "Eror: Sheet 'kunjungan' tidak ditemukan." };
  
  var targetDatabase = [sheetFullData, sheetTarget, sheetBaris1, sheetBaris2];

  var txtBerwujud = (teksCid || "").replace(/\u00A0/g, " ").replace(/"/g, "").trim();
  
  // Deteksi Tanggal (Mengenali hari jum'at, koma, dll)
  var extractedDate = "";
  var matchTgl = txtBerwujud.match(/\*?(?:senin|selasa|rabu|kamis|jum['`]?at|sabtu|minggu)[\s,:\-]+\d{1,2}[\s,:\-]+[a-z]+[\s,:\-]+\d{4}\*?/i);
  
  if (matchTgl) {
    extractedDate = matchTgl[0].replace(/\*/g, "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  } else {
    extractedDate = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
  }

  // Pemisah Blok (Mengenali Nama Cust, Nama Pelanggan, dll)
  var blocks = txtBerwujud.split(/(?=(?:\d+\.\s*(?:A\/N|AN|Nama(?: cust| pelanggan)?)\s*:|\b(?:A\/N|AN|Nama(?: cust| pelanggan)?)\s*:))/i); 
  var parsedItems = [];

  function getF(label, text) { 
    var lines = text.split("\n"); 
    for (var k = 0; k < lines.length; k++) { 
      var lineClean = lines[k].replace(/\s+:/g, ":").toLowerCase(); 
      if (lineClean.indexOf(label.toLowerCase() + ":") !== -1) { 
        var p = lines[k].split(":"); 
        if (p.length > 1) return p.slice(1).join(":").trim(); 
      } 
    } 
    return ""; 
  }

  blocks.forEach(function(b) {
    if (!b.trim()) return;
    var bK = b.toLowerCase();
    
    if (bK.indexOf("cid") !== -1 || bK.indexOf("odp") !== -1) {
      var isKunjungan = (
        bK.indexOf("tidak ada di rumah") !== -1 || 
        bK.indexOf("rumah kosong") !== -1 || 
        bK.indexOf("tidak ada orang") !== -1 || 
        bK.indexOf("pelanggan tidak ada") !== -1 || 
        bK.indexOf("client tidak ada") !== -1 ||
        bK.indexOf("klien tidak ada") !== -1
      );

      var isTerminate = (
        bK.indexOf("perangkat sudah diambil") !== -1 || 
        bK.indexOf("perangkat sudah di ambil") !== -1 || 
        bK.indexOf("port sudah dicabut") !== -1 || 
        bK.indexOf("port sudah di cabut") !== -1 || 
        bK.indexOf("masih ingin lanjut") !== -1 || 
        bK.indexOf("masih berlangganan") !== -1 || 
        bK.indexOf("masih lanjut berlangganan") !== -1 || 
        bK.indexOf("terkendala masalah keuangan") !== -1 || 
        bK.indexOf("masalah keuangan") !== -1 ||
        bK.indexOf("terminate") !== -1 ||
        bK.indexOf("teminate") !== -1
      ); 
      
      if (isKunjungan || isTerminate) {
        var cid = getF("CID", b).replace(/[^0-9]/g, "").trim();
        if (cid) {
          parsedItems.push({
            cid: cid,
            nama: getF("A/N", b) || getF("AN", b) || getF("Nama Cust", b) || getF("Nama Pelanggan", b) || getF("Nama", b) || getF("NAMA", b) || "",
            odp: getF("ODP", b) || "",
            sn: getF("S/N", b) || getF("SN", b) || getF("SN ONT", b) || getF("ONT", b) || "",
            psn: getF("P-SN", b) || getF("P-sn", b) || getF("P-Sn", b) || "",
            pop: getF("POP", b) || "",
            jenis: isKunjungan ? "KUNJUNGAN" : "TERMINATE",
            tglLaporan: extractedDate,
            ketAsli: getF("Ket", b) || getF("KET", b) || getF("Keterangan", b) || ""
          });
        }
      }
    }
  });

  if (parsedItems.length === 0) return { status: "error", message: "Sistem Selesai! 0 data ditemukan di teks laporan." };

  var dbDataFound = {}; 
  
  targetDatabase.forEach(function(sh) {
    if (!sh || sh.getLastRow() < 2) return;
    var d = sh.getDataRange().getValues();
    var headers = d[0].map(h => String(h).toUpperCase().trim());
    var cidIdx = headers.findIndex(h => h.includes("CID"));

    if (cidIdx > -1) {
      for (var r = 1; r < d.length; r++) { 
        var rCid = String(d[r][cidIdx]).replace(/[^0-9]/g, "").trim(); 
        if (rCid && parsedItems.some(item => item.cid === rCid)) {
          dbDataFound[rCid] = { sheet: sh, rowIdx: r + 1, dataRow: d[r], headers: headers };
        }
      }
    }
  });

  function appendWithMapping(sheetTarget, itemData, dbDataExtracted) {
    var headersTarget = sheetTarget.getRange(1, 1, 1, sheetTarget.getLastColumn()).getValues()[0].map(h => String(h).toUpperCase().trim());
    var newRow = new Array(headersTarget.length).fill("");

    if (dbDataExtracted) {
      dbDataExtracted.headers.forEach((colName, idx) => {
        var targetIdx = headersTarget.findIndex(h => h === colName);
        if (targetIdx > -1) newRow[targetIdx] = dbDataExtracted.dataRow[idx];
      });
    }

    const setVal = (possibleNames, val) => {
      if(!val || val === "-") return;
      for (let n of possibleNames) {
        let idx = headersTarget.findIndex(h => h === n || h.includes(n));
        if (idx > -1) { newRow[idx] = val; break; }
      }
    };

    setVal(["CID"], itemData.cid);
    if(itemData.nama) setVal(["NAMA", "NAMA LAMA", "A/N"], itemData.nama);
    if(itemData.odp) setVal(["ODP"], itemData.odp);
    if(itemData.sn) setVal(["SN", "SN UNIT", "S/N"], itemData.sn);
    if(itemData.psn) setVal(["P-SN"], itemData.psn);
    if(itemData.pop) setVal(["POP"], itemData.pop);
    
    setVal(["TANGGAL KUNJUNNGAN", "TANGGAL KUNJUNGAN", "TANGGAL", "WAKTU", "TIMESTAMP"], itemData.tglLaporan);

    if(itemData.jenis === "KUNJUNGAN") {
      setVal(["KET", "KETERANGAN"], "Client Tidak Ada Di Rumah");
    } else if(itemData.jenis === "TERMINATE") {
      var finalKet = itemData.ketAsli ? itemData.ketAsli : "Perangkat Sudah Diambil Dan Port Sudah Di Cabut";
      setVal(["KET", "KETERANGAN"], finalKet);
    }

    sheetTarget.appendRow(newRow);
  }

  var countKunjungan = 0;
  var countArsip = 0;
  var countSkipTidakAdaDB = 0;
  var cidsDiproses = [];
  var rowsToDelete = []; 

  parsedItems.forEach(item => {
    var dbData = dbDataFound[item.cid];

    if (item.jenis === "KUNJUNGAN") {
      if (dbData) {
        if (!cidsDiproses.includes(item.cid)) {
          appendWithMapping(sheetKunjungan, item, dbData); 
          rowsToDelete.push(dbData); 
          cidsDiproses.push(item.cid);
          countKunjungan++;
        }
      } else {
        countSkipTidakAdaDB++; 
      }
    } else if (item.jenis === "TERMINATE") {
      if (!cidsDiproses.includes(item.cid)) {
        appendWithMapping(sheetArsip, item, dbData); 
        if (dbData) {
          rowsToDelete.push(dbData); 
        }
        cidsDiproses.push(item.cid);
        countArsip++;
      }
    }
  });

  SpreadsheetApp.flush();

  var totalTerhapus = 0;
  targetDatabase.forEach(function(sh) {
    if(!sh) return;
    var rowsInSheet = rowsToDelete.filter(r => r.sheet.getName() === sh.getName());
    rowsInSheet.sort((a, b) => b.rowIdx - a.rowIdx); 
    
    var deletedRowsThisSheet = new Set();
    rowsInSheet.forEach(r => {
      if(!deletedRowsThisSheet.has(r.rowIdx)) { 
        sh.deleteRow(r.rowIdx);
        deletedRowsThisSheet.add(r.rowIdx);
        totalTerhapus++;
      }
    });
  });

  SpreadsheetApp.flush();

  const bersihkanDuplikat = (sheet) => {
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;
    var h = data[0].map(col => String(col).toUpperCase().trim());
    var idxCid = h.findIndex(col => col.includes("CID"));
    if (idxCid > -1) {
      var seen = {};
      for (var r = data.length - 1; r >= 1; r--) {
        var c = String(data[r][idxCid]).replace(/[^0-9]/g, "").trim();
        if (c !== "") {
          if (seen[c]) sheet.deleteRow(r + 1);
          else seen[c] = true;
        }
      }
    }
  };

  bersihkanDuplikat(sheetKunjungan);
  bersihkanDuplikat(sheetArsip);

  var pesanHasil = "🔥 EKSEKUSI DATA SUKSES!\n\n" +
                   "→ Dihapus dari DB Utama: " + totalTerhapus + " baris.\n" +
                   "→ Masuk Arsip (Cabut/Kendala): " + countArsip + " client.\n" +
                   "→ Mutasi ke Kunjungan: " + countKunjungan + " client.\n";
  if (countSkipTidakAdaDB > 0) pesanHasil += "⚠️ Ditolak (Kunjungan tp tidak ada di DB): " + countSkipTidakAdaDB + " client.\n";
  pesanHasil += "→ Tanggal Laporan: " + extractedDate;

  return { status: "success", message: pesanHasil };
}

// =======================================================
// FITUR MUTASI DATA MANUAL VIA POP-UP
// =======================================================
function handleMutasiData(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetAsal = ss.getSheetByName(data.dariSheet);
  const sheetTujuan = ss.getSheetByName(data.keSheet);

  if (!sheetAsal || !sheetTujuan) throw new Error("Sheet asal atau sheet tujuan tidak ditemukan.");

  const valuesToMove = (data.teksCid || "").split("\n").map(c => String(c).trim().toLowerCase()).filter(c => c !== "");
  if (valuesToMove.length === 0) throw new Error("Tidak ada data yang valid untuk diproses.");

  const kriteria = (data.kriteria || "CID").toUpperCase();
  const dataAsal = sheetAsal.getDataRange().getValues();
  if (dataAsal.length <= 1) return { status: "error", message: "Sheet asal kosong." };

  const headersAsal = dataAsal[0].map(h => String(h).toUpperCase().trim());
  const kriteriaIdx = headersAsal.findIndex(h => h.includes(kriteria) || h === kriteria);
  if (kriteriaIdx === -1) throw new Error(`Kolom kriteria '${kriteria}' tidak ditemukan di sheet asal.`);
  
  const headersTujuan = sheetTujuan.getRange(1, 1, 1, sheetTujuan.getLastColumn()).getValues()[0].map(h => String(h).toUpperCase().trim());
  let deletedCount = 0;

  for (let i = dataAsal.length - 1; i >= 1; i--) {
    const rowVal = String(dataAsal[i][kriteriaIdx]).trim().toLowerCase();
    if (valuesToMove.some(v => rowVal.includes(v)) && rowVal !== "") {
      let newRow = new Array(headersTujuan.length).fill("");
      headersAsal.forEach((colName, idx) => {
         const targetIdx = headersTujuan.findIndex(h => h === colName);
         if (targetIdx > -1) newRow[targetIdx] = dataAsal[i][idx];
      });
      if (data.keSheet === SHEET_BARIS_2) {
         const timeIdx = headersTujuan.findIndex(h => h.includes("TIME") || h.includes("WAKTU") || h.includes("TIMESTAMP"));
         if(timeIdx > -1) newRow[timeIdx] = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd HH:mm:ss");
      }
      
      sheetTujuan.appendRow(newRow);
      sheetAsal.deleteRow(i + 1); 
      deletedCount++;
    }
  }

  return { status: "success", message: `${deletedCount} data perangkat berhasil dipindah ke sheet '${data.keSheet}'.` };
}

function getInfoPerangkatKhususBaris1(sheetTarget) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let targetName = sheetTarget || SHEET_BARIS_1;
  const sheet = ss.getSheetByName(targetName);
  if (!sheet) throw new Error(`Sheet '${targetName}' tidak ditemukan`);
  return { status: "success", data: parseSheetDataDinamis(sheet, targetName.toUpperCase()) };
}

function getDataLengkap() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const dataFull = parseSheetDataDinamis(ss.getSheetByName(SHEET_FULL_DATA), "MENUNGGU DIAMBIL");
  const dataTarget = parseSheetDataDinamis(ss.getSheetByName(SHEET_TARGET), "MENUNGGU DIAMBIL");
  const dataBaris1 = parseSheetDataDinamis(ss.getSheetByName(SHEET_BARIS_1), "BARIS 1"); 
  const dataBaris2 = parseSheetDataDinamis(ss.getSheetByName(SHEET_BARIS_2), "BARIS 2"); 
  const dataSudah = parseSheetDataDinamis(ss.getSheetByName(SHEET_SUDAH_DIAMBIL), "SUDAH DIAMBIL"); 
  
  // Menambahkan data sheet kunjungan dengan label "SUDAH KUNJUNGAN"
  const sheetKunjungan = ss.getSheetByName("kunjungan");
  const dataKunjungan = sheetKunjungan ? parseSheetDataDinamis(sheetKunjungan, "SUDAH KUNJUNGAN") : [];
  
  return { status: "success", data: [].concat(dataFull, dataTarget, dataBaris1, dataBaris2, dataSudah, dataKunjungan) };
}

function parseSheetDataDinamis(sheet, labelFilter) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0].map(h => String(h).toUpperCase().trim());
  let result = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    let item = { sumber_sheet: labelFilter };
    const getVal = (possibleNames) => {
      for (let name of possibleNames) {
        let idx = headers.findIndex(h => h.includes(name));
        if (idx > -1) return row[idx] || "";
      }
      return "";
    };

    item.timestamp = getVal(["TIME", "WAKTU", "TIMESTAMP"]);
    item.odp = getVal(["ODP"]);
    item.pop = getVal(["POP"]);
    item.cid_lama = String(getVal(["CID"])); 
    item.nama_lama = getVal(["NAMA"]); 
    item.sn = getVal(["SN", "SN UNIT"]);
    item.psn = getVal(["P-SN"]);
    item.foto_rumah_url = getVal(["FOTO RU"]);
    item.foto_alat_url = getVal(["FOTO AL", "FOTO I"]);
    item.sherlock = getVal(["SHERLOK", "SHERLOCK", "KOORDINAT"]);
    item.keterangan = getVal(["KET", "KETERANGAN"]);
    item.paket = getVal(["PAKET"]);
    item.nohp = getVal(["HP"]); 
    item.ts = getVal(["TS", "NAMA TS", "TEKNISI"]);
    item.sales = getVal(["SALES", "DS"]);

    if (item.cid_lama || item.nama_lama) result.push(item);
  }
  return result;
}

function handleLogin(username, password) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_USERS);
  if(!sheet) throw new Error("Sheet USERS tidak ditemukan");
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() == String(username).trim() && String(rows[i][1]).trim() == String(password).trim()) {
      return { status: "success", user: { username: username } };
    }
  }
  return { status: "error", message: "Username atau password salah" };
}

function uploadToImgbb(base64Data) {
  if (!base64Data || base64Data === "-") return "-";
  let cleanBase64 = base64Data.indexOf(",") > -1 ? base64Data.split(",")[1] : base64Data;
  const options = { "method": "post", "payload": { "image": cleanBase64 }, "muteHttpExceptions": true };
  try {
    const res = UrlFetchApp.fetch("https://api.imgbb.com/1/upload?key=" + IMGBB_API_KEY, options);
    const json = JSON.parse(res.getContentText());
    if (json.data && json.data.url) return json.data.url;
  } catch (e) { Logger.log(e); }
  return "-";
}

function sendTelegramPhoto(botToken, chatId, photoUrl, caption) {
  if (photoUrl === "-" || !chatId) return;
  const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
  const payload = { "chat_id": chatId, "photo": photoUrl, "caption": caption };
  const options = { "method": "post", "contentType": "application/json", "payload": JSON.stringify(payload), "muteHttpExceptions": true };
  UrlFetchApp.fetch(url, options);
}

// =======================================================
// PEMBERSIH SAMPAH SHEET TARGET (jalankan manual dari editor)
// =======================================================
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

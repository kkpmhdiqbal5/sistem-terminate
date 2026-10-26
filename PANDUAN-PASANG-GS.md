# Panduan memasang script Apps Script (.gs)

Ada 3 file .gs. Semuanya ditempel di SATU proyek Apps Script yang sama (proyek yang sekarang dipakai Web App Anda).

| File | Aksi |
|---|---|
| Kode.gs | Ganti seluruh isi file `Kode.gs` yang lama |
| Terminate.gs | Ganti seluruh isi file `Code.gs` yang lama (isinya modul Terminate) |
| ChatClient.gs | BARU: tambahkan file baru bernama `ChatClient` |

## Langkah
1. Buka Google Sheet Anda > menu **Ekstensi > Apps Script**.
2. Di daftar file kiri, klik `Kode.gs` > tekan Ctrl+A > hapus > tempel isi `Kode.gs` baru > **Ctrl+S**.
3. Klik `Code.gs` > Ctrl+A > hapus > tempel isi `Terminate.gs` baru > Ctrl+S.
4. Tombol **+** di samping "Files" > **Script** > beri nama `ChatClient` > tempel isi `ChatClient.gs` > Ctrl+S.
5. **Deploy > Manage deployments** > ikon pensil (Edit) > Version: **New version** > **Deploy**.
   (Jangan "New deployment", supaya URL tidak berubah.)
6. Bila diminta izin (UrlFetch, Drive): **Review permissions** > pilih akun > Advanced > Go to ... > Allow.
7. Upload file web (HTML/JS) ke GitHub/Vercel, lalu buka sistem.
8. Login admin > klik tombol nama di kanan atas > **Profil Saya** > **Masuk & Atur API** > isi token > Simpan.

Selesai. Tidak perlu lagi mengisi token lewat kode.

## Siapa "admin tertinggi" (boleh buka Pengaturan API)?
- Secara bawaan: admin **paling atas** di sheet USERS (kolom "Akses Terminate" = ADMIN).
- Untuk menunjuk admin lain: tambah kolom **Akses Pengaturan API** di sheet USERS, isi TRUE pada admin yang dipilih
  (boleh lebih dari satu; bila ada yang TRUE, aturan "paling atas" tidak dipakai lagi).
- Admin lain tetap bisa memakai Impor WA, Bersihkan Data, Chat Client, dll., tetapi tidak bisa membuka/mengubah token & API key.

## API & AI (diatur dari web, tanpa membuka Apps Script)
1. Admin tertinggi: **Profil > Pengaturan API > Tambah API**. Isi token, pilih **fungsi** (mis. WA A = Chat client, WA B = Laporan, Claude = AI chat + AI lapangan).
2. Admin: **Profil > Pengaturan AI**: saklar ON/OFF terpisah untuk **AI Chat Client** dan **AI Lapangan**, plus instruksi tambahan untuk AI.
3. Pengaturan lama (WA_TOKEN dkk. di Script Properties) tetap jalan sebagai cadangan sampai fungsinya diambil API baru.

## AI Input Massal & Impor WhatsApp
Di Profil > Pengaturan API, centang fungsi AI "input massal" / "impor WhatsApp" pada API AI Anda, lalu nyalakan saklarnya di Profil > Pengaturan AI. Setelah itu muncul tombol "Rapikan dengan AI" (Laporan & Input Massal) dan kotak centang AI di Impor WhatsApp. Hasil AI selalu diperiksa admin dulu; aturan POP, CID dobel, dan SN terbaru tetap dijalankan sistem.

## AI gratis (Gemini / Groq / Grok / Claude)
Profil > Pengaturan API > Tambah API > Jenis "AI" > pilih Penyedia. Paling mudah: **Google Gemini** (key gratis di aistudio.google.com/apikey, model bawaan gemini-3.5-flash-lite). Lalu centang fungsi AI (Chat, Lapangan, Massal, Impor) dan tekan Tes. Satu fungsi hanya dipegang satu API; boleh pakai API berbeda per fungsi. Ingat: paket gratis ada batas pemakaian dan data bisa dipakai penyedia untuk pelatihan. Setelah menempel ChatClient.gs terbaru, Deploy > New version.

## Kirim WA lewat API dari Pencarian & Admin
Akun dengan izin Chat Client (TCHAT) melihat tombol tambahan di halaman Pencarian dan Admin: "📤 API Gabungan", "📤 API 1 data 1 pesan", dan 📤 per baris. Isi 1-10 nomor/ID grup, maksimal 150 pesan sekali kirim. Butuh ChatClient.gs + Terminate.gs terbaru dan Deploy > New version.

## Impor WhatsApp membaca laporan Terminate
Impor WA (mode Campur atau "Semua laporan Terminate") ikut membaca laporan harian berformat "LAPORAN HARIAN TERMINATE <POP>": bagian *PERANGKAT SUDAH DIAMBIL*, *MASIH LANJUT BERLANGGANAN*, dan *TIDAK ADA DIRUMAH*. Anti dobel: diambil = SN/P-SN sama (atau CID + tanggal bila tanpa SN); lanjut & tidak ada di rumah = CID + tanggal sama. Tanpa foto. Tempel Terminate.gs terbaru ke Code.gs lalu Deploy > New version.

## Balasan client tidak masuk? (webhook)
1. Pasang **ChatClient.gs, Terminate.gs, dan Kode.gs terbaru** lalu Deploy > Manage deployments > Edit > Version: New version.
2. Buka `URL_WEB_APP?hook=KATA_RAHASIA&cek=1` di browser: harus tampil "Webhook aktif". (Kata rahasia ada di Profil > Pengaturan API.)
3. Di dashboard Fonnte, pada device yang dipakai, isi kolom Webhook dengan `URL_WEB_APP?hook=KATA_RAHASIA` (bagian pesan masuk) dan simpan.
4. Chat Client > tab Balasan Client > **Cek koneksi balasan** menampilkan log tiap pesan yang masuk (sheet WEBHOOK LOG) dan hasilnya. Log kosong = Fonnte belum mengirim ke Apps Script.

## Alur lanjut / berhenti
- Lanjut: status LANJUT, tampil di kelompok "Lanjut - belum dilapor". Setelah tim terminate melaporkan (Input Terminate / impor WA), pindah ke "sudah dilapor" dan masuk sheet "lanjut berlanganan" (tampil di Pencarian: sumber "LANJUT BERLANGGANAN").
- Berhenti: bot meminta share lokasi + foto rumah. Lengkap = otomatis dibuat baris di sheet "Baris 1" (NAMA TS "BOT WA"). Saat tim terminate menyimpan pengambilan (CID sama), baris itu pindah ke Baris 2 dan SN/P-SN terisi.

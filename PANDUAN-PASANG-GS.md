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
2. Admin: **Admin > Pengaturan AI**: saklar ON/OFF terpisah untuk **AI Chat Client** dan **AI Lapangan**, plus instruksi tambahan untuk AI.
3. Pengaturan lama (WA_TOKEN dkk. di Script Properties) tetap jalan sebagai cadangan sampai fungsinya diambil API baru.

## AI Input Massal & Impor WhatsApp
Di Profil > Pengaturan API, centang fungsi AI "input massal" / "impor WhatsApp" pada API AI Anda, lalu nyalakan saklarnya di Admin > Pengaturan AI. Setelah itu muncul tombol "Rapikan dengan AI" (Laporan & Input Massal) dan kotak centang AI di Impor WhatsApp. Hasil AI selalu diperiksa admin dulu; aturan POP, CID dobel, dan SN terbaru tetap dijalankan sistem.

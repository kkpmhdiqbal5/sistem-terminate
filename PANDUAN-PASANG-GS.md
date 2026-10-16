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

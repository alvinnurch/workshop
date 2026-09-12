# Platform Workshop Terintegrasi

Islamidotco & Wahid Foundation · platform sesi workshop: check in barcode, materi, kuis pre/post test, word cloud, umpan balik emoticon, dan formulir — dengan dasbor admin dan tampilan proyektor.

- **Basis data**: Google Spreadsheet
- **Backend**: Google Apps Script (Web app)
- **Frontend**: berkas statis (tanpa Node, tanpa build)

## Isi folder

| Berkas | Keterangan |
|---|---|
| `index.html` | halaman untuk peserta, admin, dan proyektor |
| `config.js` | **satu-satunya berkas yang perlu Anda isi** (URL Web app + kata sandi admin) |
| `support.js` | mesin tampilan — jangan diubah |
| `assets/` | logo |
| `apps-script/Code.gs` | backend + struktur spreadsheet |
| `PANDUAN-DEPLOY.md` | panduan lengkap langkah demi langkah |

## Unggah ke GitHub Pages

1. Buat repositori baru, unggah **seluruh isi folder ini** ke akar repositori (bukan hanya `index.html`).
2. **Settings → Pages → Branch: `main` / folder `/ (root)` → Save**.
3. Tunggu satu menit, tautannya berbentuk `https://<akun>.github.io/<repo>/`.

Isi `config.js` sebelum atau sesudah diunggah:

```js
window.WORKSHOP_API = "https://script.google.com/macros/s/AKfy.../exec";
window.WORKSHOP_ADMIN_PASSWORD = "kata-sandi-panitia";
```

Dibiarkan kosong = mode demo (data contoh di peramban), berguna untuk latihan.

> `apps-script/` tidak dipakai oleh halaman web — ia hanya perlu ditempel ke editor Apps Script. Boleh tetap disertakan di repositori sebagai dokumentasi.

Langkah spreadsheet dan deploy Apps Script: lihat **PANDUAN-DEPLOY.md**.

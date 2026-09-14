# Platform Workshop Terintegrasi — Panduan Deploy

Islamidotco & Wahid Foundation

Paket ini berisi satu halaman web siap pakai dan satu berkas backend. Basis datanya Google Spreadsheet, servernya Google Apps Script — tanpa biaya hosting dan tanpa perlu pengetahuan pemrograman.

```
deploy/
├── index.html                 ← halaman untuk peserta, admin, dan proyektor
├── config.js                  ← DUA BARIS yang perlu Anda isi (API + kata sandi admin)
├── support.js                 ← mesin tampilan (jangan diubah, harus ikut diunggah)
├── apps-script/Code.gs        ← backend + struktur spreadsheet
├── assets/                    ← logo (sudah tertanam di index.html, disertakan sebagai cadangan)
└── PANDUAN-DEPLOY.md          ← berkas ini
```

---

## Langkah 1 — Buat spreadsheet dan pasang backend

1. Buka [sheets.new](https://sheets.new), beri nama **Workshop DB**.
2. Menu **Extensions → Apps Script**.
3. Hapus seluruh isi `Code.gs` di editor, lalu tempel isi berkas `apps-script/Code.gs` dari paket ini.
4. Ubah baris berikut di bagian atas, lalu simpan (Ctrl/Cmd + S):
   ```js
   var ADMIN_PASSWORD = 'sayaadminnya';   // ganti bila perlu
   ```
5. Kembali ke tab spreadsheet dan muat ulang halaman. Akan muncul menu **Workshop** di deretan menu atas.
6. Jalankan **Workshop → 1. Siapkan spreadsheet** (membuat 10 sheet).
7. Jalankan **Workshop → 2. Isi contoh sesi** (mengisi dua sesi contoh sehingga bisa langsung dicoba).

> Saat pertama kali menjalankan menu, Google meminta izin. Pilih akun Anda → **Advanced** → **Go to (nama proyek)** → **Allow**. Ini normal untuk skrip milik sendiri.

## Langkah 2 — Deploy sebagai Web app

Di editor Apps Script: **Deploy → New deployment → pilih tipe Web app**.

| Kolom | Isi |
|---|---|
| Description | Platform Workshop |
| Execute as | **Me** |
| Who has access | **Anyone** |

Tekan **Deploy**, lalu salin **Web app URL** (bentuknya `https://script.google.com/macros/s/AKfy…/exec`).

## Langkah 3 — Sambungkan halaman ke spreadsheet

Buka **`config.js`** dengan editor teks apa pun (Notepad, TextEdit, VS Code) — berkasnya hanya beberapa baris. Jangan mengubah `index.html`.

```js
window.WORKSHOP_API = "";
window.WORKSHOP_ADMIN_PASSWORD = "sayaadminnya";
```

Isi menjadi:

```js
window.WORKSHOP_API = "https://script.google.com/macros/s/AKfy…/exec";
window.WORKSHOP_ADMIN_PASSWORD = "kata-sandi-panitia-anda";
```

Simpan. Pastikan `config.js` selalu berada di folder yang sama dengan `index.html`. Kalau `WORKSHOP_API` dibiarkan kosong, halaman tetap jalan dalam **mode demo** (data contoh tersimpan di peramban) — berguna untuk latihan sebelum hari-H.

## Langkah 4 — Sajikan halaman

Pilih salah satu, semuanya gratis:

**a. Netlify Drop (paling cepat, tanpa akun)**
Buka [app.netlify.com/drop](https://app.netlify.com/drop), tarik folder `deploy` ke halaman itu. Dalam beberapa detik Anda mendapat tautan publik.

**b. GitHub Pages**
Unggah isi folder `deploy` ke repositori → **Settings → Pages → Branch: main / root**.

> Unggah **seluruh folder**, bukan hanya `index.html` — `config.js`, `support.js`, dan `assets/` harus ikut serta di folder yang sama.

Bagikan **satu tautan** yang sama ke semua pihak. Perannya dipilih dari halaman depan:

| Jalur | Untuk siapa |
|---|---|
| Login dengan kode peserta | peserta |
| Tombol **Masuk sebagai admin** | panitia / fasilitator |
| Tombol **Layar proyektor** (di dasbor admin) | laptop yang tersambung proyektor |

---

## Langkah 5 — Siapkan data workshop

### Peserta dan kode akses
Isi sheet **Peserta**: `nama`, `kelompok`, `instansi`, `hp`, `email`. Kolom `peserta_id` dan `kode` boleh dibiarkan kosong — jalankan **Workshop → Buat kode peserta yang kosong** dan skrip akan mengisinya. Kode inilah yang dibagikan ke peserta sebagai kunci masuk — cukup kode itu saja untuk login; nama dan kelompoknya terbaca otomatis.

Kode dibuat acak lima karakter dan dijamin tidak kembar. Jalankan **Workshop → Periksa kode ganda** bila daftar peserta pernah disunting manual.

Peserta juga bisa ditambahkan dari dasbor admin, tab **Peserta & kode**, lengkap dengan tombol unduh daftar kode.

### Sesi dan pilihan materi
Semuanya dapat diatur dari dasbor admin (tab **Sesi & materi**) — perubahan langsung tersimpan ke spreadsheet. Atau diisi langsung di sheet `Sesi` dan `Materi` bila lebih nyaman.

Tujuh jenis materi yang dapat dipilih per sesi (tidak semuanya harus dipakai):

| Jenis | Fungsi | Yang perlu diisi |
|---|---|---|
| **Check in** | proyektor menampilkan barcode; peserta memindai untuk mencatat kehadiran | kode barcode (5 huruf, bisa digenerasi) |
| **Materi PPT** | peserta mengunduh paparan | tautan Drive + nama berkas |
| **Tautan Zoom** | untuk sesi daring | tautan, meeting ID, passcode |
| **Kuis** | pre test / post test / kuis mandiri | soal, empat opsi, jawaban benar; opsional batas waktu dan izin kerjakan ulang |
| **Word cloud** | kata kunci peserta tampil langsung di proyektor | pertanyaan |
| **Umpan balik** | lima emoticon + catatan | — |
| **Formulir** | isian teks singkat, teks panjang, angka, pilihan, unggah gambar | daftar isian |

Urutan sesi maupun urutan materi dapat digeser naik-turun dengan tombol ↑ ↓.

### Materi PPT
Unggah berkas ke Google Drive → klik kanan **Share** → **Anyone with the link** → salin tautan ke kolom tautan materi.

### Kuis berbatas waktu
Pada editor kuis, tekan **⏱ Berbatas waktu** lalu pilih modenya:
- **Per soal** — soal muncul satu per satu, berganti otomatis setiap sekian detik, serentak di proyektor dan perangkat peserta.
- **Seluruh soal** — semua soal terbuka sekaligus dengan satu hitungan mundur total.

Tekan **▶ Mulai hitungan** saat sesi berjalan. Jawaban peserta dikirim otomatis saat waktu habis.

### Kerjakan ulang
Tombol **↻ Sekali kerjakan / ↻ Boleh kerjakan ulang** pada editor kuis menentukan apakah peserta dapat mengulang setelah melihat skornya. Untuk pre/post test resmi biarkan pada *Sekali kerjakan*; untuk latihan atau uji coba pilih *Boleh kerjakan ulang*.

---

## Langkah 6 — Alur pemakaian saat workshop

1. **Admin** → tab *Sesi & materi* → pilih sesi → **Jadikan aktif**.
2. Buka **Layar proyektor** di laptop yang tersambung LCD.
3. Buka materi **Check in** → barcode muncul di proyektor → peserta memindai → nama yang masuk tampil berurutan di layar.
4. Buka materi berikutnya satu per satu dengan **Buka & tampilkan**. Layar peserta memunculkan ajakan "Ikuti sekarang"; proyektor mengikuti otomatis.
5. Untuk kuis berbatas waktu, tekan **▶ Mulai hitungan**.
6. Tab *Hasil & rekap* → pilih sesi → lihat kehadiran, skor pre/post beserta selisihnya, jawaban tiap peserta per soal, kata terbanyak, sebaran emoticon, dan tabel formulir. Tekan **Unduh rekap CSV** untuk laporan.

Semua data tetap tersimpan di spreadsheet, jadi bisa diolah lebih lanjut dengan rumus, pivot, atau Looker Studio.

---

## Catatan teknis

- **Sinkronisasi**: halaman menarik data dari spreadsheet setiap 4 detik. Perubahan admin, check-in, dan kiriman peserta muncul di semua perangkat tanpa perlu refresh.
- **Kamera & https**: peramban hanya mengizinkan kamera pada alamat **https** (GitHub Pages, Netlify, dan Vercel sudah https). Membuka berkas lewat `file://` atau menyematkan halaman di dalam bingkai lain akan memblokir kamera — halaman akan menawarkan tombol *Buka di tab baru*.
- **Kamera**: pemindaian barcode memakai `BarcodeDetector` bawaan peramban (Chrome/Edge di Android dan desktop). Bila kamera tidak diizinkan, peserta dapat mengunggah foto barcode atau mengetik kode lima hurufnya — keduanya diverifikasi terhadap kode sesi.
- **Unggahan gambar**: berkas masuk ke folder Drive `Workshop Unggahan` dan tautannya tercatat di sheet `JawabanForm`.
- **Mengosongkan data uji coba**: menu **Workshop → Kosongkan semua jawaban** (susunan sesi dan materi tetap).
- **Memperbarui backend**: setelah mengubah `Code.gs`, jalankan **Deploy → Manage deployments → Edit → Version: New version → Deploy**. Tautan Web app tidak berubah.
- **Jalur penyimpanan**: tindakan peserta (check in, kuis, word cloud, umpan balik, formulir) dikirim ke endpoint masing-masing dan langsung menambah baris di sheet jawaban. Perubahan susunan sesi/materi oleh admin dikirim sebagai `putDb` dan menulis ulang sheet konfigurasi.
- **Menyunting sesi**: perubahan admin disimpan dulu di peramban. Lencana di kanan atas menunjukkan statusnya — *Perubahan belum disimpan* → *Menyimpan…* → *Tersimpan*. Data dikirim ke spreadsheet setelah pengetikan berhenti (±6 detik) atau saat tombol **Simpan sekarang** ditekan, sehingga teks tidak pernah tertimpa data lama saat sedang diketik.
- **Rekap gabungan**: pada pemilih sesi di tab *Hasil & rekap* ada pilihan **Semua sesi (rekap gabungan)** — ringkasan kehadiran, rata-rata pre/post, kata, dan umpan balik tiap sesi, plus capaian tiap peserta lintas sesi; ikut terunduh sebagai CSV maupun PDF.
- **Simpan manual**: seluruh penyuntingan admin (sesi, materi, kuis, peserta) tersimpan dulu di peramban. Tekan **Simpan perubahan** di kanan atas untuk mengirimkannya ke spreadsheet; selama belum disimpan platform tidak membaca ulang data, sehingga ketikan tidak tertimpa. Kendali langsung — menjadikan sesi aktif, membuka/menutup materi, memulai kuis — tetap terkirim seketika.
- **Unduh PDF**: tombol di tab *Hasil & rekap* membuka lembar cetak A4 berkop dua logo, berisi judul dan detail sesi, ringkasan angka, hasil tiap materi, serta tabel kehadiran — dialog cetak terbuka langsung di halaman yang sama; pilih "Save as PDF" sebagai tujuan.
- **Unduh CSV**: berkas memakai pemisah titik koma dan penanda `sep=;` sehingga langsung terbagi per kolom saat dibuka di Excel.
- **Tampilan**: halaman menyesuaikan diri dengan lebar layar. Di ponsel, daftar materi dan daftar sesi tampil satu layar penuh dan berpindah dengan tombol (← Daftar materi / Tampilkan–Sembunyikan), sehingga tidak berdesakan.
- **Keamanan**: kata sandi admin tersimpan di `Code.gs` dan `config.js`. Untuk acara terbuka, ganti kata sandi setelah setiap kegiatan.

# Platform Workshop Terintegrasi — versi server sendiri

Backend satu berkas, **tanpa dependensi** (hanya Node.js bawaan). Tidak ada
`npm install`, tidak ada basis data yang perlu disetel, tidak ada kunci API.
Data tersimpan di `data.json` dengan tulis atomik.

Sandi admin diperiksa **di server**, jadi tidak ada lagi dua tempat yang harus
disamakan — sumber kegagalan yang paling sering pada versi sebelumnya.

---

## Isi folder

```
server.js          ← backend + penyaji halaman (satu berkas)
public/
  index.html       ← aplikasinya
  config.js        ← sudah diisi: WORKSHOP_API = '/api'
  support.js
  assets/          ← logo
data.json          ← dibuat otomatis saat pertama kali menyimpan
```

## Coba dulu di komputer sendiri (2 menit)

Butuh Node.js 18+ ([nodejs.org](https://nodejs.org), pilih LTS).

```bash
cd deploy-node
ADMIN_PASSWORD=workshop2026 node server.js
```

Di Windows (PowerShell):

```powershell
cd deploy-node
$env:ADMIN_PASSWORD="workshop2026"; node server.js
```

Buka `http://localhost:8080`. Masuk sebagai admin dengan sandi tadi, buat sesi,
tekan **Simpan perubahan** — akan muncul `data.json` di folder itu. Tutup server
dengan Ctrl+C, jalankan lagi: data Anda masih ada.

---

## Pasang di AWS Lightsail ($5/bulan, paling murah & stabil)

1. **Buat instance.** [lightsail.aws.amazon.com](https://lightsail.aws.amazon.com)
   → *Create instance* → Region **Singapore** → Platform **Linux** → Blueprint
   **OS Only → Ubuntu 22.04** → paket **$5/bulan** (1 GB RAM, cukup untuk 1000
   peserta) → *Create*.
2. **Buka port.** Instance → tab **Networking** → *Add rule* → **HTTP (80)** dan
   **HTTPS (443)** → Save.
3. **Masuk ke server.** Tombol **Connect using SSH** (terminal langsung di browser).
4. **Pasang Node.js:**

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

5. **Unggah berkas.** Cara termudah — lewat GitHub:

   ```bash
   sudo apt-get install -y git
   git clone https://github.com/<akun>/<repo>.git workshop
   cd workshop/deploy-node
   ```

   (Atau pakai tombol *Upload file* pada jendela SSH Lightsail untuk mengunggah
   zip, lalu `unzip`.)

6. **Jalankan sebagai layanan** supaya tetap hidup setelah SSH ditutup:

   ```bash
   sudo tee /etc/systemd/system/workshop.service > /dev/null <<'EOF'
   [Unit]
   Description=Platform Workshop
   After=network.target

   [Service]
   WorkingDirectory=/home/ubuntu/workshop/deploy-node
   ExecStart=/usr/bin/node server.js
   Environment=PORT=80
   Environment=ADMIN_PASSWORD=SandiPanitiaAnda
   Restart=always
   User=root

   [Install]
   WantedBy=multi-user.target
   EOF

   sudo systemctl enable --now workshop
   sudo systemctl status workshop --no-pager
   ```

7. **Buka alamatnya.** Pakai *Public IPv4 address* dari halaman instance:
   `http://13.212.xxx.xxx`. Sebaiknya klik **Create static IP** dulu (gratis)
   agar alamatnya tidak berubah saat instance di-restart.

### Wajib untuk barcode check in: https

Kamera peramban hanya aktif di `https`. Cara paling cepat (gratis):

1. Punyai nama domain (mis. `workshop.islami.co`), arahkan A-record-nya ke
   static IP tadi.
2. Di server:

   ```bash
   sudo apt-get install -y nginx certbot python3-certbot-nginx
   sudo tee /etc/nginx/sites-available/workshop > /dev/null <<'EOF'
   server {
     listen 80;
     server_name workshop.contoh.id;       # ganti dengan domain Anda
     location / {
       proxy_pass http://127.0.0.1:8080;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection '';
       proxy_buffering off;                # penting untuk realtime
       proxy_read_timeout 1h;
     }
   }
   EOF
   sudo ln -sf /etc/nginx/sites-available/workshop /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo systemctl restart nginx
   sudo certbot --nginx -d workshop.contoh.id
   ```

   Lalu ubah `Environment=PORT=80` pada layanan menjadi `PORT=8080`:
   `sudo systemctl daemon-reload && sudo systemctl restart workshop`.

---

## Alternatif tanpa server sendiri

Kalau tidak ingin mengurus Linux, folder yang sama bisa dipasang di:

- **Railway** — [railway.app](https://railway.app) → *Deploy from GitHub* → pilih
  repo → Variables: `ADMIN_PASSWORD`. Sudah https otomatis. Gratis untuk
  pemakaian ringan. **Catatan**: tambahkan *Volume* pada path `/app/deploy-node`
  agar `data.json` tidak hilang saat deploy ulang.
- **Render** — [render.com](https://render.com) → *New Web Service* → Start
  command `node server.js`, Root directory `deploy-node`, tambahkan *Disk* 1 GB
  pada mount path yang sama.
- **Fly.io** — `fly launch` di dalam folder ini, lalu `fly volumes create data`.

Ketiganya memberi https tanpa konfigurasi — barcode check in langsung jalan.

---

## Operasional

- **Cadangan data**: cukup salin `data.json`. Sebelum acara besar:
  `cp data.json data-$(date +%F).json`.
- **Ganti sandi admin**: ubah `ADMIN_PASSWORD` pada layanan lalu
  `sudo systemctl restart workshop`.
- **Lihat log**: `sudo journalctl -u workshop -f`.
- **Nol-kan jawaban peserta** (susunan sesi tetap): kirim aksi `reset` — atau
  hentikan server, hapus bagian `responses` di `data.json`, jalankan lagi.
- **Pindah dari versi lama**: buka URL Apps Script lama dengan `?action=db`,
  simpan hasilnya sebagai `data.json`… — lebih mudah: buka JSON itu, ambil
  bagian `data`, simpan sebagai `data.json`, letakkan di samping `server.js`,
  lalu jalankan servernya.

## Bila ada masalah

| Gejala | Obatnya |
|---|---|
| `node: command not found` | Node.js belum terpasang (langkah 4) |
| Halaman tidak terbuka dari luar | Port 80/443 belum dibuka di tab Networking |
| "Kata sandi admin salah" | `ADMIN_PASSWORD` pada layanan berbeda dengan yang diketik; cek `sudo systemctl show workshop -p Environment` |
| Data hilang setelah deploy ulang (Railway/Render) | Volume/Disk belum dipasang pada folder kerja |
| Kamera check in tidak jalan | Alamatnya masih `http` — pasang https (bagian di atas) |
| Perubahan admin tidak tersimpan | Lihat log: `sudo journalctl -u workshop -n 50` |


## Akun admin dengan peran berbeda

Kata sandi di `ADMIN_PASSWORD` selalu berperan **admin penuh**. Untuk panitia lain,
buka tab **Akun admin** (hanya terlihat oleh admin penuh) dan buat akun satu per satu.
Tiap akun punya kata sandi sendiri — itulah yang dipakai di halaman *Masuk sebagai admin*.

| Peran | Boleh |
|---|---|
| Admin penuh | Semua: ubah sesi, materi, kuis, peserta, akun admin |
| Fasilitator | Buka/tutup materi, mulai kuis dan hitung mundur — tidak bisa mengubah susunan |
| Narasumber | Sama seperti fasilitator, hanya untuk sesi yang ditugaskan kepadanya |
| Pemantau | Hanya melihat hasil dan mengunduh rekap |

Batasannya ditegakkan di server, bukan hanya disembunyikan di tampilan: permintaan
mengubah susunan dari peran non-penuh ditolak. Kata sandi akun juga tidak pernah
dikirim keluar — `/api` hanya menyebut apakah sandinya sudah diatur.

Setelah membuat atau mengubah akun, tekan **Simpan perubahan**.


## Etalase publik (landing page)

Halaman depan platform kini berupa **etalase**: kartu semua workshop yang
berstatus terbit, lengkap dengan lembaga penyelenggara, format, biaya, tanggal,
dan lokasi. Pengunjung bisa mencari dan menyaring per format, lalu membuka
**profil workshop** — tentang workshop, poin yang akan dipelajari, jadwal sesi
(diambil langsung dari sesi yang Anda susun), narasumber, dan kartu pendaftaran.

Alurnya: etalase → profil → **Daftar** → bila berbiaya, QRIS Xendit → kode
peserta aktif setelah pembayaran diterima. Tombol **Masuk** membawa peserta ke
halaman kode peserta.

Isinya diatur di tab **Workshop** pada panel admin. Selain nama, mitra, dan
logo, kini tersedia: format (online/offline/hybrid), kategori, batas
pendaftaran, ringkasan, deskripsi lengkap, daftar "yang akan dipelajari" (satu
poin per baris), penanda bersertifikat, dan penanda **unggulan** — workshop
unggulan tampil sebagai kartu besar di hero etalase. Workshop baru muncul di
etalase setelah ditekan **Terbitkan**.

## Masuk: nama pengguna + kata sandi

Halaman *Masuk admin* sekarang meminta **nama pengguna** dan **kata sandi**.

- **Super admin**: nama pengguna `superadmin` (ubah lewat `Environment=ADMIN_USER=...`)
  dengan kata sandi dari `ADMIN_PASSWORD`. Ia masuk ke **dasbor platform** —
  daftar semua workshop, rekap pembayaran seluruh workshop, dan pengaturan
  platform. Dari sana tombol *Kelola workshop ini* membawanya ke panel workshop
  yang dipilih, dan tombol *Dasbor platform* di bilah tab mengembalikannya.
- **Panitia**: akun yang dibuat di tab *Akun admin* masing-masing workshop, kini
  dengan nama pengguna sendiri. Panitia hanya melihat workshop tempat akunnya
  dibuat; seluruh tab — sesi & materi, hasil & rekap, peserta & kode, akun admin —
  mengikuti workshop itu.

## Banyak workshop dalam satu platform

Satu pemasangan kini bisa memuat beberapa workshop sekaligus — Wahid Foundation,
lembaga mitra lain, atau angkatan berikutnya — masing-masing dengan sesi, materi,
peserta, dan hasilnya sendiri.

**Mengelola**: masuk sebagai admin penuh → tab **Workshop**. Di sana Anda membuat
workshop baru, mengisi nama lembaga mitra dan logonya (tempel URL/berkas di
`public/assets`, atau unggah langsung — logo tersimpan di dalam data), tanggal,
tempat, biaya, kuota, dan cara peserta masuk. Tombol **Kelola workshop ini**
memindahkan seluruh panel admin ke workshop tersebut; **Terbitkan** membuatnya
tampil di halaman depan.

**Cara peserta masuk** — tiga pilihan per workshop:
- *Panitia yang memasukkan peserta* — seperti sebelumnya.
- *Peserta mendaftar sendiri, kode langsung terbit* — peserta mengisi nama dan
  kontak di halaman depan, kodenya muncul seketika.
- *Peserta mendaftar sendiri, panitia menyetujui* — kode terbit tetapi belum bisa
  dipakai; di tab **Peserta & kode** muncul tombol **Setujui** pada barisnya.
  Workshop berbiaya otomatis memakai alur ini.

**Halaman depan**: bila ada lebih dari satu workshop terbit, pengunjung memilih
workshop dulu, lalu masuk dengan kodenya. Logo mitra di kepala halaman mengikuti
workshop yang sedang dibuka.

**Migrasi otomatis**: `data.json` versi lama (satu workshop) dinaikkan sendiri saat
server pertama kali dijalankan — datanya masuk sebagai workshop pertama, tidak ada
yang hilang. Tetap buat cadangan sebelum memperbarui:
`cp data.json data-sebelum-multi.json`

## Pembayaran QRIS lewat Xendit

Isi biaya workshop di tab **Workshop**. Bila biayanya lebih dari 0, peserta yang
mendaftar mandiri langsung mendapat kode QRIS; kodenya baru aktif setelah
pembayaran diterima.

**Mengaktifkan** — tiga langkah:

1. Ambil **Secret key** di dasbor Xendit: *Settings → Developers → API Keys →
   Generate secret key* (izin *Money-in products: Write*). Untuk uji coba pakai
   kunci berawalan `xnd_development_`, untuk produksi `xnd_production_`.
2. Daftarkan alamat callback di *Settings → Developers → Webhooks*, jenis
   **QR Code Payments**, dengan URL:
   `https://workshop.islamiinstitute.my.id/api/xendit-callback`
   Salin **Webhook verification token** yang tertera di halaman itu.
3. Pasang keduanya ke layanan, lalu jalankan ulang:

   ```bash
   sudo systemctl edit --full workshop
   # tambahkan dua baris di bagian [Service]:
   #   Environment=XENDIT_SECRET=xnd_production_xxxxx
   #   Environment=XENDIT_CALLBACK_TOKEN=token_dari_dasbor
   sudo systemctl daemon-reload && sudo systemctl restart workshop
   sudo journalctl -u workshop -n 20 --no-pager | grep Xendit
   ```

   Baris log harus menyebut `Xendit : aktif (callback terlindungi)`.

**Alur peserta**: daftar → kode QRIS muncul (berlaku 1 jam) → pindai dengan bank
atau e-wallet apa pun yang mendukung QRIS → status berubah sendiri begitu Xendit
mengabari server. Tombol **Saya sudah bayar** memeriksa status lebih awal bila
peserta tidak sabar menunggu.

**Bila Xendit belum diaktifkan**, workshop berbiaya tetap bisa dipakai: peserta
mendaftar, lalu panitia menandai lunas dengan tombol **Setujui** di tab
*Peserta & kode* setelah transfer manual diverifikasi.

**Catatan**: seluruh tagihan tercatat di `data.json` pada bagian `payments`
(nomor rujukan, nominal, status, waktu bayar) sehingga ikut tercadangkan bersama
data lain. Biaya layanan QRIS mengikuti perjanjian akun Xendit Anda.


## Peran admin workshop, biaya layanan, dan sertifikat

**Peran** (tab *Akun admin*, hanya admin penuh):

| Peran | Cakupan |
|---|---|
| Admin penuh | Seluruh platform: semua workshop, akun admin, biaya layanan |
| Admin workshop | Satu workshop saja — sesi, materi, kuis, peserta, sertifikat, dan laporan pendapatannya. Tidak bisa membuka workshop lain, menerbitkan workshop, mengubah harga, atau menyentuh pengaturan platform |
| Narasumber | Sesi yang ditugaskan kepadanya |
| Pemantau | Hanya melihat hasil dan mengunduh rekap |

Akun berperan `fasilitator` dari versi lama otomatis dibaca sebagai **admin workshop**.
Pembatasannya ditegakkan di server: permintaan dari admin workshop untuk workshop lain
ditolak, dan kolom harga, penerbitan, serta unggulan tidak bisa diubahnya.

**Biaya layanan platform**: dasbor super admin → *Pengaturan platform* → **Biaya layanan
platform**. Angka persen ini dipotong dari seluruh pembayaran lunas; admin workshop
melihatnya pada tab **Pendapatan** (bruto, potongan, dan pendapatan bersih) tetapi tidak
dapat mengubahnya.

**Sertifikat**: tab **Sertifikat**. Unggah rancangan sertifikat sebagai gambar lanskap
rasio A4 (297×210 mm, misalnya 2480×1754 piksel). Nama peserta, judul workshop, tanggal,
tempat, dan kode diambil langsung dari sistem lalu dicetak di atas template sebagai PDF
A4 lanskap. Dua penggeser mengatur ketinggian nama dan keterangan; pratinjaunya langsung
terlihat. Tombol **Peserta boleh mengunduh** menampilkan tombol unduh di dasbor peserta
masing-masing.


### Sertifikat: data pilihan dan barcode verifikasi

Di tab **Sertifikat**, selain nama peserta (selalu tercetak) Anda memilih keterangan
apa saja yang ikut tampil — judul workshop, tanggal, tempat, lembaga, kode, kelompok,
instansi, **jumlah sesi hadir**, **nilai pre test**, **nilai post test**, dan
**peningkatan pre → post**. Semuanya dihitung langsung dari data sesi; tiap pilihan
menampilkan contoh nilainya sehingga terlihat sebelum dicetak.

**Barcode verifikasi** dicetak di sudut sertifikat (letaknya bisa dipilih). Saat dipindai,
barcode membuka halaman verifikasi
`#/workshop/<slug>/sertifikat/<kode-peserta>` yang menampilkan nama pemilik, workshop,
penyelenggara, kehadiran, serta nilai pre dan post test — bukti keaslian yang bisa dicek
siapa pun tanpa perlu masuk. Kode peserta yang tidak terdaftar ditolak dengan jelas.

**Unduhan peserta**: nyalakan **Peserta boleh mengunduh**. Setelah itu tiap peserta
melihat kartu sertifikat di dasbornya, berisi ringkasan kehadiran dan nilainya, dengan
tombol unduh PDF — jadi panitia tidak perlu mengirimkan satu per satu.


## Pembayaran lewat Midtrans

Platform bisa memakai Midtrans (QRIS, Virtual Account, GoPay, ShopeePay, kartu) sebagai pengganti atau pendamping Xendit.

1. Daftar di dashboard.midtrans.com. Mulailah di mode **Sandbox** untuk uji coba.
2. Ambil **Server Key** di Settings → Access Keys.
3. Pasang di `workshop.service`:

   ```
   Environment=MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxx
   ```

   Untuk transaksi sungguhan, ganti dengan Server Key produksi dan tambahkan `Environment=MIDTRANS_PRODUCTION=1`.
4. `sudo systemctl daemon-reload && sudo systemctl restart workshop`
5. Di dasbor Midtrans → Settings → Payment → **Notification URL**, isi:
   `https://workshop.islamiinstitute.my.id/api/midtrans-callback`
6. Masuk sebagai super admin → **Pengaturan platform** → **Penyedia pembayaran** → pilih **Midtrans**.

Alurnya: peserta mendaftar → tombol **Bayar sekarang** membuka halaman Midtrans → setelah bayar, kode peserta aktif otomatis lewat notifikasi. Bila notifikasi belum terpasang, tombol **Saya sudah bayar** menanyakan status langsung ke Midtrans.

Notifikasi diverifikasi dengan tanda tangan SHA-512 dari Server Key, jadi kiriman palsu ditolak. Server Key tidak pernah dikirim ke peramban.


## Rapat Zoom otomatis

1. Buka marketplace.zoom.us → Develop → Build App → **Server-to-Server OAuth**, masuk dengan akun Zoom yang akan menjadi host (berbayar bila rapat lebih dari 40 menit).
2. Di bagian **Scopes**, tambahkan izin membuat dan membaca rapat (`meeting:write:meeting:admin` dan `meeting:read:meeting:admin`, atau padanan `meeting:write:admin` / `meeting:read:admin` pada aplikasi lama). Aktifkan aplikasinya.
3. Salin **Account ID**, **Client ID**, **Client Secret**, lalu pasang di `workshop.service`:

   ```
   Environment=ZOOM_ACCOUNT_ID=xxxx
   Environment=ZOOM_CLIENT_ID=xxxx
   Environment=ZOOM_CLIENT_SECRET=xxxx
   ```

   Opsional: `Environment=ZOOM_USER=email-host@lembaga.id` bila rapat ingin dibuat atas nama pengguna lain di akun yang sama.
4. `sudo systemctl daemon-reload && sudo systemctl restart workshop`

Di editor materi **Tautan Zoom** kini ada kotak **Rapat Zoom otomatis**: isi waktu mulai (opsional) dan durasi, tekan **Buat rapat Zoom otomatis** — tautan, Meeting ID, dan passcode terisi sendiri. Tombol **Mulai sebagai host** mengambil tautan host baru setiap kali ditekan. Rapat dibuat dengan ruang tunggu aktif dan peserta dibisukan saat masuk.

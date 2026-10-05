# Ruang Workshop · islami.co

Platform event & workshop terintegrasi: etalase, pendaftaran, pembayaran QRIS
(Xendit / Midtrans), sesi interaktif, proyektor, heregistrasi QR, rekap, dan
sertifikat — dalam **satu server Node.js tanpa dependensi** dan satu berkas data.

```
ruang-workshop-fullstack/
├── server.js            API + penyaji halaman (Node ≥ 18, tanpa npm install)
├── public/              aplikasi (index.html, support.js, config.js, assets/)
├── .env.example         semua pengaturan — salin jadi .env
├── Dockerfile           untuk Docker / Railway / Fly.io
├── docker-compose.yml   satu perintah di VPS ber-Docker
├── render.yaml          blueprint Render (dengan disk)
├── deploy/
│   ├── install-ubuntu.sh   pemasang otomatis VPS (nginx + HTTPS + cadangan)
│   ├── update.sh           perbarui kode tanpa menyentuh data
│   ├── backup.sh           cadangan tiap 30 menit, simpan 14 hari
│   ├── workshop.service    layanan systemd
│   └── nginx-workshop.conf
└── PANDUAN-FITUR.md     penjelasan fitur & peran admin
```

---

## Pilih tempat deploy

Server menyimpan data di **berkas** (`data.json`), jadi tempatnya **wajib punya
penyimpanan permanen**. Vercel, Netlify, dan GitHub Pages **tidak bisa** dipakai
untuk server ini — datanya akan hilang setiap kali dimulai ulang.

| | Biaya/bulan | Kecepatan dari Indonesia | Kerepotan | Cocok untuk |
|---|---|---|---|---|
| **⭐ 1. AWS Lightsail Singapura** (yang sekarang) | US$5 (≈ Rp80 rb) | Sangat baik | Sedang, sekali saja | **Rekomendasi utama** — produksi, banyak event |
| 2. VPS lokal (Biznet Gio, IDCloudHost, Niagahoster VPS) | Rp60–120 rb | Terbaik | Sedang | Bila ingin tagihan rupiah & server di Indonesia |
| 3. Railway (Docker + Volume) | ± US$5 | Baik | Paling mudah | Uji coba cepat tanpa SSH |
| 4. Render (Starter + Disk) | US$7 + disk | Baik | Mudah | Alternatif Railway |

**Saran saya: tetap di Lightsail.** Server sudah berjalan di sana, domain sudah
mengarah ke sana, harganya tetap, dan pemasang otomatis di paket ini membuat
pembaruan jadi satu perintah. Pasang **IP statis** dan aktifkan **snapshot
otomatis** Lightsail sebagai cadangan kedua.

---

## Opsi 1 — Lightsail / VPS Ubuntu (rekomendasi)

**Server baru** (Ubuntu 22.04/24.04, minimal 1 GB RAM):

1. Arahkan DNS domain (rekaman **A**) ke IP statis server.
2. Buka port **80** dan **443** di firewall (Lightsail → *Networking*).
3. Unggah folder ini ke server, lalu:

```bash
cd ruang-workshop-fullstack
sudo bash deploy/install-ubuntu.sh workshop.islamiinstitute.my.id email@anda.id
sudo nano /opt/ruang-workshop/.env        # isi ADMIN_PASSWORD & kunci pembayaran
sudo systemctl restart workshop
```

Selesai: HTTPS terpasang, layanan menyala sendiri saat server reboot, dan
cadangan dibuat tiap 30 menit di `/opt/ruang-workshop/backup/`.

**Pindah dari server lama** (`~/workshop/deploy-node`) — data ikut pindah:

```bash
sudo systemctl stop workshop
cp ~/workshop/deploy-node/data.json ~/data-sebelum-pindah.json      # cadangan dulu
sudo bash deploy/install-ubuntu.sh workshop.islamiinstitute.my.id email@anda.id
sudo systemctl stop workshop
sudo cp ~/workshop/deploy-node/data.json /opt/ruang-workshop/data/data.json
sudo chown workshop:workshop /opt/ruang-workshop/data/data.json
sudo nano /opt/ruang-workshop/.env        # salin ADMIN_PASSWORD yang lama
sudo systemctl start workshop
```

Berkas data versi satu-workshop otomatis dinaikkan ke format banyak event saat
pertama dijalankan — tidak ada yang hilang.

**Memperbarui kode di kemudian hari:**

```bash
cd ruang-workshop-fullstack      # versi baru
sudo bash deploy/update.sh       # cadangan → salin kode → restart
```

## Opsi 2 — VPS dengan Docker

```bash
cp .env.example .env && nano .env
docker compose up -d --build
```

Data tersimpan di folder `./data` di samping compose. Pasang nginx dan certbot
seperti `deploy/nginx-workshop.conf` di depan port 8080.

## Opsi 3 — Railway

1. Unggah folder ini ke repositori GitHub (berkas `.env` dan `data/` sudah
   dikecualikan oleh `.gitignore`).
2. Railway → **New Project → Deploy from GitHub repo** — Dockerfile terdeteksi otomatis.
3. **Variables**: isi seperti `.env.example`, dengan `DATA_FILE=/data/data.json`.
4. **Settings → Volumes → Add Volume**, mount path `/data`. *Wajib* — tanpa ini
   data hilang saat redeploy.
5. **Settings → Networking → Generate Domain**, atau sambungkan domain sendiri.

## Opsi 4 — Render

**New → Blueprint**, arahkan ke repositori — `render.yaml` sudah membuat layanan
Singapura dengan disk 1 GB di `/var/data`. Isi `ADMIN_PASSWORD` di tab Environment.

---

## Pengaturan (`.env`)

| Variabel | Wajib | Keterangan |
|---|---|---|
| `ADMIN_USER` / `ADMIN_PASSWORD` | ya | Akun **super admin**. Akun lain dibuat dari dasbor. |
| `DATA_FILE` | ya | Lokasi `data.json`. Harus di penyimpanan permanen. |
| `PORT` | – | Bawaan 8080. |
| `XENDIT_SECRET`, `XENDIT_CALLBACK_TOKEN` | – | QRIS lewat Xendit. Callback: `https://DOMAIN/api/xendit` |
| `MIDTRANS_SERVER_KEY`, `MIDTRANS_PRODUCTION` | – | QRIS lewat Midtrans. Notifikasi: `https://DOMAIN/api/midtrans` |
| `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | – | Buat rapat Zoom dari panel. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | – | Kirim tiket (QR + kode) ke email peserta. Gmail: pakai *sandi aplikasi*, port 465. |

Tanpa kunci pembayaran, event berbayar tetap jalan dengan **persetujuan manual**
oleh panitia.

## Setelah terpasang — periksa

```bash
curl -s https://DOMAIN/api?action=health        # {"ok":true,...}
sudo journalctl -u workshop -n 30 --no-pager    # ringkasan saat start
ls -lh /opt/ruang-workshop/backup | tail -3      # cadangan berjalan
```

## Cadangan & pemulihan

- Otomatis tiap 30 menit → `/opt/ruang-workshop/backup/backup-YYYY-MM-DD-HHMM.json`
- Ke Mac: `scp workshop:/opt/ruang-workshop/data/data.json ~/Downloads/`
- Memulihkan:

```bash
sudo systemctl stop workshop
sudo cp /opt/ruang-workshop/backup/backup-2026-10-03-1200.json /opt/ruang-workshop/data/data.json
sudo chown workshop:workshop /opt/ruang-workshop/data/data.json
sudo systemctl start workshop
```

> Hentikan layanan **sebelum** mengganti `data.json`. Bila tidak, server yang
> masih berjalan menimpa berkas Anda dengan isi memorinya.

#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
#  Pemasang satu-perintah untuk Ubuntu 22.04/24.04
#  (AWS Lightsail, DigitalOcean, Biznet Gio, IDCloudHost, dll.)
#
#  Pakai:  sudo bash deploy/install-ubuntu.sh workshop.domainanda.id email@anda.id
# ══════════════════════════════════════════════════════════════
set -e
DOMAIN="$1"; EMAIL="$2"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP=/opt/ruang-workshop

if [ -z "$DOMAIN" ]; then echo "Pakai: sudo bash deploy/install-ubuntu.sh DOMAIN EMAIL"; exit 1; fi

echo "→ Memasang Node.js 20, nginx, certbot"
apt-get update -y
apt-get install -y curl ca-certificates nginx
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
apt-get install -y certbot python3-certbot-nginx
timedatectl set-timezone Asia/Jakarta || true

echo "→ Menyalin aplikasi ke $APP"
id workshop >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin workshop
mkdir -p "$APP/data" "$APP/backup"
# Data lama TIDAK pernah ditimpa — hanya kode yang diperbarui.
cp -r "$SRC/server.js" "$SRC/package.json" "$SRC/public" "$APP/"
[ -f "$APP/.env" ] || cp "$SRC/.env.example" "$APP/.env"
sed -i "s#^DATA_FILE=.*#DATA_FILE=$APP/data/data.json#" "$APP/.env"
chown -R workshop:workshop "$APP"
chmod 600 "$APP/.env"

echo "→ Layanan systemd"
cp "$SRC/deploy/workshop.service" /etc/systemd/system/workshop.service
systemctl daemon-reload
systemctl enable --now workshop
systemctl restart workshop

echo "→ nginx"
sed "s/DOMAIN_ANDA/$DOMAIN/" "$SRC/deploy/nginx-workshop.conf" > /etc/nginx/sites-available/workshop
ln -sf /etc/nginx/sites-available/workshop /etc/nginx/sites-enabled/workshop
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "→ Cadangan otomatis tiap 30 menit"
install -m 755 "$SRC/deploy/backup.sh" /usr/local/bin/ruang-backup
( crontab -l 2>/dev/null | grep -v ruang-backup ; echo "*/30 * * * * /usr/local/bin/ruang-backup" ) | crontab -

if [ -n "$EMAIL" ]; then
  echo "→ Sertifikat HTTPS"
  certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --non-interactive --redirect || echo "  (HTTPS gagal — pastikan DNS sudah mengarah ke server ini, lalu jalankan ulang)"
fi

echo ""
echo "✓ Selesai.  https://$DOMAIN"
echo "  Ubah sandi & kunci pembayaran:  sudo nano $APP/.env  lalu  sudo systemctl restart workshop"
echo "  Lihat log:                      sudo journalctl -u workshop -f"

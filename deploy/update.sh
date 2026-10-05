#!/usr/bin/env bash
# Perbarui kode tanpa menyentuh data. Pakai:  sudo bash deploy/update.sh
set -e
SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP=/opt/ruang-workshop
/usr/local/bin/ruang-backup || true
cp "$SRC/server.js" "$SRC/package.json" "$APP/"
rm -rf "$APP/public" && cp -r "$SRC/public" "$APP/public"
chown -R workshop:workshop "$APP/server.js" "$APP/public"
systemctl restart workshop
echo "✓ Diperbarui. Data tetap di $APP/data/data.json"

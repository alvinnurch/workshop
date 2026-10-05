#!/usr/bin/env bash
# Cadangan data tiap 30 menit, simpan 14 hari. Dipasang otomatis oleh install-ubuntu.sh
set -e
APP=/opt/ruang-workshop
DST=$APP/backup
mkdir -p "$DST"
[ -f "$APP/data/data.json" ] || exit 0
cp "$APP/data/data.json" "$DST/backup-$(date +%F-%H%M).json"
find "$DST" -name 'backup-*.json' -mtime +14 -delete

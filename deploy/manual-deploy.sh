#!/usr/bin/env bash
set -euo pipefail

SRC_BASE="$HOME/pixelwise"
SRC_FRONTEND="$SRC_BASE/frontend"
SRC_APP="$SRC_BASE/app"

DST_FRONTEND="/var/www/pixelwise"
DST_OPT_BASE="/opt/pixelwise"
DST_APP="$DST_OPT_BASE/app"

ROOT_FILES=(
  "init_db.py"
  "predict.py"
  ".env"
  "requirements.txt"
  "pytest.ini"
)

require_dir() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then
    echo "Fehler: Verzeichnis nicht gefunden: $dir" >&2
    exit 1
  fi
}

require_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "Fehler: Datei nicht gefunden: $file" >&2
    exit 1
  fi
}

require_dir "$SRC_FRONTEND"
require_dir "$SRC_APP"

for name in "${ROOT_FILES[@]}"; do
  require_file "$SRC_BASE/$name"
done

echo "Erstelle Zielverzeichnisse..."
sudo mkdir -p "$DST_FRONTEND" "$DST_APP" "$DST_OPT_BASE"

echo "Kopiere frontend -> $DST_FRONTEND (ersetzt Inhalt komplett)..."
if command -v rsync >/dev/null 2>&1; then
  sudo rsync -a --delete "$SRC_FRONTEND/" "$DST_FRONTEND/"
else
  sudo find "$DST_FRONTEND" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  sudo cp -a "$SRC_FRONTEND/." "$DST_FRONTEND/"
fi

echo "Kopiere app -> $DST_APP ..."
if command -v rsync >/dev/null 2>&1; then
  sudo rsync -a "$SRC_APP/" "$DST_APP/"
else
  sudo cp -a "$SRC_APP/." "$DST_APP/"
fi

echo "Kopiere Root-Dateien -> $DST_OPT_BASE ..."
for name in "${ROOT_FILES[@]}"; do
  sudo cp -a "$SRC_BASE/$name" "$DST_OPT_BASE/$name"
done

echo "Setze Rechte auf chmod 777..."
sudo chmod -R 777 "$DST_FRONTEND" "$DST_OPT_BASE"

echo "Starte Dienst neu: pixelwise.service"
sudo systemctl restart pixelwise.service

echo "Deployment abgeschlossen."

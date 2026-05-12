#!/usr/bin/env bash
# Startet Chromium im Vollbild-Kiosk-Modus auf der Hestia-Wandseite.
# Wird von hestia-kiosk.service über `cage` aufgerufen.
set -euo pipefail

URL="${HESTIA_WALL_URL:-https://hestia.local/wall}"

# Auto-Login: Wenn HESTIA_KIOSK_EMAIL + HESTIA_KIOSK_PASSWORD gesetzt sind
# (üblicherweise via EnvironmentFile= in der systemd-Unit), einen frischen
# JWT holen und an die URL als #token=... anhängen. main.tsx im Frontend
# liest den Hash, schreibt ihn in localStorage und säubert die URL.
# Schlägt der Login fehl (Backend nicht erreichbar, falsche Credentials),
# läuft der Kiosk trotzdem weiter — dann zeigt er halt /login.
if [[ -n "${HESTIA_KIOSK_EMAIL:-}" && -n "${HESTIA_KIOSK_PASSWORD:-}" ]]; then
  LOGIN_SCRIPT="$(dirname "$0")/hestia-kiosk-login.sh"
  if TOKEN=$("$LOGIN_SCRIPT" 2>/tmp/hestia-kiosk-login.log); then
    URL="${URL}#token=${TOKEN}"
  fi
fi

# Chromium-Profilordner separat halten, damit kein "Restore session"-Popup
# nach Crash/Reboot erscheint und Cache größenbegrenzt bleibt.
PROFILE_DIR="${HOME}/.config/hestia-kiosk-chromium"
mkdir -p "${PROFILE_DIR}"

# Falls Chromium beim letzten Mal hart gekillt wurde, Crash-Marker entfernen.
PREFS="${PROFILE_DIR}/Default/Preferences"
if [[ -f "${PREFS}" ]]; then
  sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' "${PREFS}" || true
  sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' "${PREFS}" || true
fi

exec chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-translate \
  --disable-features=Translate \
  --no-first-run \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  --use-fake-ui-for-media-stream \
  --disk-cache-size=50000000 \
  --user-data-dir="${PROFILE_DIR}" \
  --ozone-platform=wayland \
  "${URL}"

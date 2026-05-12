#!/usr/bin/env bash
# Startet Chromium im Vollbild-Kiosk-Modus auf der Hestia-Wandseite.
# Wird von hestia-kiosk.service über `cage` aufgerufen.
set -euo pipefail

URL="${HESTIA_WALL_URL:-https://hestia.local/wall}"

# Auto-Login: Wenn HESTIA_KIOSK_EMAIL + HESTIA_KIOSK_PASSWORD gesetzt sind
# (üblicherweise via EnvironmentFile= in der systemd-Unit), einen frischen
# JWT holen und an die URL als #token=... anhängen. main.tsx im Frontend
# liest den Hash, schreibt ihn in localStorage und säubert die URL.
# Schlägt der Login fehl (Skript fehlt/nicht executable, Backend down,
# falsche Credentials), läuft der Kiosk trotzdem weiter — dann zeigt
# er halt /login. NICHT den ganzen Kiosk darüber killen.
LOGIN_SCRIPT="$(dirname "$0")/hestia-kiosk-login.sh"
if [[ -n "${HESTIA_KIOSK_EMAIL:-}" && -n "${HESTIA_KIOSK_PASSWORD:-}" && -x "${LOGIN_SCRIPT}" ]]; then
  # || true verhindert, dass `set -e` uns killt
  TOKEN=$("${LOGIN_SCRIPT}" 2>/tmp/hestia-kiosk-login.log || true)
  if [[ -n "${TOKEN}" ]]; then
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

# Skalierung — niedriger Wert = UI wird kleiner / mehr Inhalt sichtbar.
# Default 1.0 passt für 1080p+. Für kleine Displays anpassen:
#   800x480  → 0.6   (offizielles RPi Touch Display Gen 1)
#   1024x600 → 0.7   (häufige Drittanbieter)
#   1280x720 → 0.85
#   1920x1080 → 1.0
SCALE="${HESTIA_KIOSK_SCALE:-1.0}"

# Remote-Debugging optional aktivierbar — z.B. zum Debuggen warum die
# Kamera oder ein Modell nicht lädt. Mit HESTIA_KIOSK_DEBUG=1 starten,
# dann von einem anderen Gerät http://hestia.local:9222 öffnen → Chromium
# DevTools für die Wand-Session.
DEBUG_FLAG=""
if [[ "${HESTIA_KIOSK_DEBUG:-0}" == "1" ]]; then
  DEBUG_FLAG="--remote-debugging-port=9222 --remote-debugging-address=0.0.0.0"
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
  --use-fake-device-for-media-stream=false \
  --enable-features=UseOzonePlatform \
  --disk-cache-size=50000000 \
  --user-data-dir="${PROFILE_DIR}" \
  --ozone-platform=wayland \
  --force-device-scale-factor="${SCALE}" \
  ${DEBUG_FLAG} \
  "${URL}"

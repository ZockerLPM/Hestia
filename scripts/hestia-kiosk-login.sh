#!/usr/bin/env bash
# Holt einen frischen Hestia-JWT via /api/auth/login und gibt ihn auf
# stdout aus. Wird vom Kiosk-Launcher aufgerufen, damit das Wand-Display
# beim Start automatisch eingeloggt ist (kein Touchscreen-Tippen nötig).
#
# Erwartete Environment-Variablen:
#   HESTIA_KIOSK_EMAIL     — Email des Kiosk-Users (z.B. wand@hestia.local)
#   HESTIA_KIOSK_PASSWORD  — Passwort dieses Users
#   HESTIA_LOGIN_URL       — optional, Default: https://hestia.local/api/auth/login
#
# Diese werden typischerweise aus ~/.hestia-kiosk.env per EnvironmentFile=
# in der systemd-Unit nachgeladen. Datei mit chmod 600 schützen!
set -euo pipefail

URL="${HESTIA_LOGIN_URL:-https://hestia.local/api/auth/login}"
EMAIL="${HESTIA_KIOSK_EMAIL:-}"
PASSWORD="${HESTIA_KIOSK_PASSWORD:-}"

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "ERROR: HESTIA_KIOSK_EMAIL und HESTIA_KIOSK_PASSWORD müssen gesetzt sein" >&2
  exit 1
fi

# -k weil Self-Signed-Cert; -s silent; -S zeigt aber Fehler
RESPONSE=$(curl -ksS --max-time 5 -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" 2>&1) || {
  echo "ERROR: Login-Request fehlgeschlagen: $RESPONSE" >&2
  exit 1
}

# Token aus JSON extrahieren — jq wäre sauberer, aber sed reicht und
# spart eine Abhängigkeit
TOKEN=$(echo "$RESPONSE" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: Login erfolgreich aber kein Token in Response: $RESPONSE" >&2
  exit 1
fi

echo "$TOKEN"

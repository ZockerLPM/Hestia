# Production-Deploy auf Raspberry Pi 4

Diese Anleitung führt Schritt-für-Schritt zu einer voll funktionsfähigen
Hestia-Installation auf einem RPi 4 (4GB+) im lokalen Netz mit
**selbst-signiertem HTTPS** über Caddy + mkcert. Nach dem Setup kannst du
von jedem Gerät im Heimnetz (Smartphone, Tablet, Wandtablet) auf die App
zugreifen, inklusive PWA-Installation, Web Push und Kamera-Scan.

## Was du brauchst

- Raspberry Pi 4 oder 5 (mindestens 4 GB RAM)
- microSD-Karte ≥ 32 GB (Class 10 oder besser)
- Stabiler Strom (USB-C-Netzteil ≥ 3 A)
- Ethernet oder WLAN
- Optional: USB-SSD für DB + Backups (sehr empfohlen)
- Zugang zu deinem Router (DHCP-Reservation oder statische IP)

## Übersicht der Architektur

```
              Router (192.168.1.1)
                       │
                       ├── Smartphone (192.168.1.42)
                       │       │
                       │       │ https://hestia.local  ← LAN-Hostname
                       │       │
                       ▼       ▼
        ┌─────────────────────────────────┐
        │  RPi 4 (192.168.1.100)          │
        │  ┌───────────────────────────┐  │
        │  │ Caddy (Reverse Proxy)     │  │
        │  │   :443 (HTTPS)            │  │
        │  └────────────┬──────────────┘  │
        │               │                 │
        │   ┌───────────┴────────┐        │
        │   ▼                    ▼        │
        │  ┌──────────┐      ┌──────────┐ │
        │  │ Frontend │      │ Backend  │ │
        │  │ (nginx)  │      │ (node)   │ │
        │  │  :80     │      │  :3001   │ │
        │  └──────────┘      └─────┬────┘ │
        │                          │      │
        │                  ┌───────▼────┐ │
        │                  │ SQLite-DB  │ │
        │                  │ on USB-SSD │ │
        │                  └────────────┘ │
        └─────────────────────────────────┘
```

## Schritt 1 — RPi-OS installieren

1. **Raspberry Pi Imager** laden: <https://www.raspberrypi.com/software/>
2. **Raspberry Pi OS Lite (64-bit)** auswählen (keine Desktop-Umgebung nötig)
3. Beim Imagen unter "Erweiterte Optionen":
   - Hostname: `hestia`
   - SSH aktivieren mit Public-Key (oder Passwort)
   - User: dein User + Passwort
   - WLAN konfigurieren (falls kein Ethernet)
4. SD-Karte einsetzen, RPi starten
5. Per SSH verbinden: `ssh <user>@hestia.local` (oder per IP)

## Schritt 2 — System aktualisieren und Tools installieren

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ca-certificates gnupg lsb-release ufw
```

### Docker installieren

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# einmal aus- und einloggen, damit die Gruppe greift
exit
```

Wieder verbinden, dann prüfen:
```bash
docker --version
docker compose version
```

### Statische IP via Router

Reserviere im Router die MAC-Adresse des RPi für eine feste IP, z.B.
`192.168.1.100`. Notiere dir die IP für später.

### Firewall (optional, aber empfohlen)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 443/tcp
sudo ufw allow 80/tcp        # Caddy braucht 80 nur fürs Setup
sudo ufw enable
```

## Schritt 3 — USB-SSD für Datenbank (sehr empfohlen)

SD-Karten haben begrenzte Schreibzyklen. SQLite kann sie schnell
verschleißen. USB-SSD ist deutlich robuster.

```bash
# SSD anstecken, identifizieren
lsblk
# vermutlich /dev/sda1 oder ähnlich

sudo mkdir -p /mnt/hestia-data
sudo blkid /dev/sda1
# UUID notieren

# Auto-Mount in /etc/fstab:
echo 'UUID=<deine-uuid>  /mnt/hestia-data  ext4  defaults,noatime,nofail  0  2' \
  | sudo tee -a /etc/fstab

sudo mount -a
sudo chown -R $USER:$USER /mnt/hestia-data
```

## Schritt 4 — Hestia-Code holen

```bash
mkdir -p ~/hestia && cd ~/hestia
git clone <dein-repo-url> .

# oder per SCP vom Windows-Rechner
scp -r s:\Programmieren\Hestia\* <user>@hestia.local:~/hestia/
```

## Schritt 5 — Production-Compose erstellen

Im Repo gibt es ein `docker-compose.yml` für lokale Entwicklung. Für
Production legen wir eine erweiterte Variante an:

```bash
cat > ~/hestia/docker-compose.prod.yml <<'EOF'
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    restart: unless-stopped
    expose:
      - "3001"
    environment:
      - DATABASE_URL=file:/data/hestia.db
      - JWT_SECRET=${JWT_SECRET}
      - VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
      - VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
      - VAPID_SUBJECT=${VAPID_SUBJECT}
      - NODE_ENV=production
      - TZ=Europe/Berlin
    volumes:
      - /mnt/hestia-data/db:/data
    networks: [hestia]

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    restart: unless-stopped
    expose:
      - "80"
    depends_on: [backend]
    networks: [hestia]

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - ./caddy/certs:/certs:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [frontend, backend]
    networks: [hestia]

networks:
  hestia:

volumes:
  caddy_data:
  caddy_config:
EOF
```

## Schritt 6 — Backend-Image für ARM64 anpassen

`backend/Dockerfile` ist bereits multi-stage, läuft auf arm64. Aber die DB
liegt jetzt unter `/data/hestia.db` statt im Container. Prüfen, dass das
Dockerfile beim Start `prisma db push` ausführt:

```bash
cat ~/hestia/backend/Dockerfile
```

Wenn nicht vorhanden, am Ende des Dockerfile sicherstellen:
```dockerfile
CMD npx prisma db push --skip-generate && node dist/index.js
```

## Schritt 7 — VAPID-Keys + JWT-Secret generieren

```bash
cd ~/hestia/backend
docker compose -f ../docker-compose.prod.yml run --rm backend npm run push:keys
```

Notiere `VAPID_PUBLIC_KEY` und `VAPID_PRIVATE_KEY`. Falls das `docker run`
zu früh ist (Image nicht gebaut), kannst du die Keys auch lokal generieren:

```bash
# Auf RPi, mit Node + web-push installiert:
npx web-push generate-vapid-keys
```

JWT-Secret:
```bash
openssl rand -base64 48
```

## Schritt 8 — `.env` schreiben

```bash
cat > ~/hestia/.env <<'EOF'
JWT_SECRET=<dein-jwt-secret>
VAPID_PUBLIC_KEY=<dein-public-key>
VAPID_PRIVATE_KEY=<dein-private-key>
VAPID_SUBJECT=mailto:du@example.com
EOF

chmod 600 ~/hestia/.env
```

## Schritt 9 — Selbst-signiertes Zertifikat mit mkcert

mkcert erzeugt ein "lokales CA" — du installierst es **einmalig** auf
jedem Gerät, das die App nutzen soll, und alle Zertifikate von dieser CA
werden ohne Browserwarnung akzeptiert.

### Auf dem RPi

```bash
sudo apt install -y libnss3-tools
# mkcert manuell holen (kein Paket im apt):
curl -L https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v1.4.4-linux-arm64 \
  -o ~/mkcert
chmod +x ~/mkcert
sudo mv ~/mkcert /usr/local/bin/mkcert

mkcert -install      # CA-Root installieren

mkdir -p ~/hestia/caddy/certs
cd ~/hestia/caddy/certs

# Zertifikat für mehrere Hostnames erzeugen:
mkcert hestia.local "*.hestia.local" 192.168.1.100 localhost
# Resultat: zwei Dateien, z.B.
#   hestia.local+3.pem
#   hestia.local+3-key.pem

# Umbenennen für Caddy
mv hestia.local+3.pem hestia.crt
mv hestia.local+3-key.pem hestia.key
```

Die `rootCA.pem` ist das, was du auf jedem Client installierst. Pfad
ausgeben:
```bash
mkcert -CAROOT
# z.B. /home/<user>/.local/share/mkcert
# Datei rootCA.pem von dort an alle Geräte kopieren (siehe Schritt 12)
```

## Schritt 10 — Caddyfile erstellen

```bash
cat > ~/hestia/caddy/Caddyfile <<'EOF'
hestia.local, 192.168.1.100 {
    tls /certs/hestia.crt /certs/hestia.key

    # Backend für /api und /socket.io
    @api {
        path /api/* /socket.io/*
    }
    handle @api {
        reverse_proxy backend:3001
    }

    # Frontend für alles andere
    handle {
        reverse_proxy frontend:80
    }

    # Sicherheits-Header
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    encode gzip
}
EOF
```

## Schritt 11 — Erster Start

```bash
cd ~/hestia
mkdir -p /mnt/hestia-data/db
docker compose -f docker-compose.prod.yml up -d --build
```

Logs prüfen:
```bash
docker compose -f docker-compose.prod.yml logs -f
```

Wenn alles läuft:
- Backend-Healthcheck: `curl http://localhost:3001/api/health`
- Frontend: `curl http://localhost`
- Caddy mit HTTPS: `curl -k https://localhost`

### Seed-Daten (einmalig)

```bash
docker compose -f docker-compose.prod.yml exec backend npm run db:seed
```

## Schritt 12 — Clients konfigurieren

### Linux/Mac

```bash
scp <user>@hestia.local:~/.local/share/mkcert/rootCA.pem ./
sudo cp rootCA.pem /usr/local/share/ca-certificates/hestia-rootCA.crt
sudo update-ca-certificates
```

Firefox + manche Apps haben eigenen Store — dort separat importieren.

### Windows

1. `rootCA.pem` per SCP holen (z.B. mit WinSCP)
2. Datei doppelklicken → "Zertifikat installieren" → "Lokaler Computer" →
   "Alle Zertifikate in folgendem Speicher" → "Vertrauenswürdige
   Stammzertifizierungsstellen"
3. Edge/Chrome nutzen jetzt das Zert; Firefox braucht eine eigene
   Installation in `about:preferences#privacy` → Zertifikate

### Android

1. `rootCA.pem` per Email oder Cloud auf das Handy holen
2. Einstellungen → Sicherheit → Verschlüsselung → Zertifikat installieren
   (genaue Bezeichnung variiert je Hersteller)
3. **Wichtig**: Ab Android 11 müssen Apps explizit User-CAs vertrauen.
   Im Browser funktioniert es trotzdem — die PWA läuft also.

### iOS

1. `rootCA.pem` als Profil herunterladen (Mail oder Safari → "Profil
   laden")
2. Einstellungen → Allgemein → VPN & Geräteverwaltung → Profil installieren
3. **Außerdem**: Einstellungen → Allgemein → Info → Zertifikatsvertrauen
   → mkcert root aktivieren

### DNS auflösbar machen

Variante A — **mDNS**: `hestia.local` wird auf den meisten Systemen
automatisch erkannt (Bonjour/Avahi). Auf Linux:
```bash
sudo apt install -y avahi-daemon
sudo systemctl enable --now avahi-daemon
```

Variante B — **Router-DNS**: Eintrag im Router-DNS-Server hinzufügen
(meist unter "lokale DNS"-Einstellungen): `hestia.local → 192.168.1.100`.

Variante C — **Hosts-File** auf jedem Client (Fallback):
```
192.168.1.100  hestia.local
```

## Schritt 13 — App in Production testen

Browser öffnen: `https://hestia.local`

Du solltest:
- Kein Browser-Warnung sehen (wegen mkcert-CA)
- Login-Seite sehen
- Mit `person1@hestia.local / hestia123` einloggen können
- Auf Smartphone: "App installieren" verfügbar (Chrome-Menü)

### Push-Notifications testen

```bash
# Token holen
TOKEN=$(curl -k -s -X POST https://hestia.local/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"person1@hestia.local","password":"hestia123"}' | jq -r .token)

# Im Browser: Dashboard → "Benachrichtigungen aktivieren"

# Test-Push senden
curl -k -X POST https://hestia.local/api/push/test \
  -H "Authorization: Bearer $TOKEN"
```

## Schritt 14 — Wandtablet einrichten

Der Wand-Modus (`/wall`) ist eine eigenständige, voll interaktive
Oberfläche: Aufgaben abhaken, Einkaufsliste pflegen, Mahlzeiten als
gekocht markieren und vor allem **Einkauf in Vorrat übernehmen** mit
USB-Scanner/Kamera und Touch-MHD-Räder — alles ohne Modulwechsel.

### Empfohlenes Hardware-Setup

- **Touchscreen-Tablet** (Android oder ähnliches) fest an der Wand
- **USB-Barcode-Scanner** (HID-Modus, ca. 20–40 €) — Hestia erkennt
  ihn automatisch, sobald `/wall` und der Sammelmodus offen ist
- Optional: Kamera-Berechtigung im Browser erlauben → falls kein
  USB-Scanner verfügbar, funktioniert die Tablet-Kamera

### Variante A — Tablet im Browser

1. Tablet mit Browser im selben WLAN
2. `https://hestia.local/wall` öffnen
3. PWA-Installation (Chrome → 3-Punkt-Menü → "App installieren") oder
   "Zum Homescreen hinzufügen"
4. Optional: **Fully Kiosk Browser** für echten Kiosk-Modus (Android)
   - Start-URL: `https://hestia.local/wall`
   - Screen-Saver/Sleep deaktivieren
   - Kamera-Permission erteilen, sodass `WallPantryEntry` die Kamera
     nutzen kann

### Variante B — RPi mit angeschlossenem Touchscreen

Wenn du den RPi selbst als Wandtablet nutzt:

```bash
sudo apt install -y chromium-browser unclutter
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/hestia.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=Hestia Wall
Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars https://hestia.local/wall
X-GNOME-Autostart-enabled=true
EOF
```

`unclutter` blendet den Mauszeiger aus.

### USB-Scanner testen

Im Sammelmodus (Header → "Einkauf eintragen"):
1. Scanner anschließen — er meldet sich als HID-Tastatur, keine Treiber
   nötig
2. Beliebigen Produkt-Barcode scannen
3. Eintrag erscheint sofort in der Sammlung; bei bekanntem Barcode
   (Open Food Facts) wird der Produktname automatisch übernommen
4. Detail-Editor rechts erlaubt Mengen, Standort und MHD per
   Räder-Picker zu setzen
5. "Alle in Vorrat" speichert den ganzen Stapel auf einmal

## Schritt 15 — Automatische Backups

```bash
cat > ~/backup-hestia.sh <<'EOF'
#!/bin/bash
set -e
SRC=/mnt/hestia-data/db/hestia.db
DEST=/mnt/hestia-data/backups
TS=$(date +%Y%m%d-%H%M%S)

mkdir -p "$DEST"
# SQLite Online-Backup (atomar)
docker compose -f /home/$USER/hestia/docker-compose.prod.yml exec -T backend \
  sqlite3 /data/hestia.db ".backup '/data/backup-${TS}.db'"

mv /mnt/hestia-data/db/backup-${TS}.db "$DEST/"

# Rotation: 7 tägliche, 4 wöchentliche, 12 monatliche
find "$DEST" -name "backup-*.db" -mtime +7 \
  -not -name "backup-*-Mon*.db" -delete

# Optional: gzippen
gzip "$DEST/backup-${TS}.db"
EOF

chmod +x ~/backup-hestia.sh

# Crontab
(crontab -l 2>/dev/null; echo "0 3 * * * /home/$USER/backup-hestia.sh >> /home/$USER/backup.log 2>&1") | crontab -
```

## Schritt 16 — Updates

```bash
cat > ~/update-hestia.sh <<'EOF'
#!/bin/bash
set -e
cd ~/hestia

# Backup vorher
~/backup-hestia.sh

# Code aktualisieren
git pull

# Neu bauen und neustarten
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --build

# Alte Images aufräumen
docker image prune -f
EOF
chmod +x ~/update-hestia.sh
```

Manuell ausführen oder als Cron, z.B. wöchentlich Sonntag 04:00:
```bash
(crontab -l; echo "0 4 * * 0 /home/$USER/update-hestia.sh >> /home/$USER/update.log 2>&1") | crontab -
```

## Troubleshooting

### "Mixed Content"-Fehler im Browser

Symptome: Login klappt, aber Socket.io / API funktioniert nicht.

Caddy stellt sicher, dass alles über HTTPS läuft — wenn dennoch HTTP-
Requests im Network-Tab erscheinen, prüfe ob das Frontend mit
`baseURL: '/api'` (relativ!) konfiguriert ist. Das ist Standard in
`api/client.ts`.

### "ERR_CERT_AUTHORITY_INVALID"

Die mkcert-Root-CA ist auf dem Client nicht installiert. Siehe
Schritt 12.

### Push funktioniert nicht

1. `https://hestia.local/api/push/public-key` muss `enabled: true` liefern
2. Im Browser DevTools → Application → Service Worker → "Update" klicken
3. Notification-Permission im Browser-Setting prüfen
4. Backend-Logs: `docker compose logs backend | grep push`

### DB-File-Permissions

Wenn `/mnt/hestia-data/db` nicht beschreibbar ist:
```bash
sudo chown -R 1000:1000 /mnt/hestia-data/db
# Node-User im Container hat UID 1000 (Standard)
```

### Hoher CPU-Load

RPi 4 hat 4 Cores — Node + Nginx + Caddy gleichzeitig ist meist
unkritisch. Bei Bedarf:
- Recharts deaktivieren auf der Stats-Page bei großen Datenmengen
- SQLite-VACUUM monatlich: `sqlite3 hestia.db "VACUUM;"`

## Sicherheits-Checkliste vor Go-Live

- [ ] `JWT_SECRET` ist zufällig (≥ 32 Bytes), nicht das Default
- [ ] `.env` hat `chmod 600`
- [ ] mkcert-CA nur auf eigenen Geräten installiert
- [ ] UFW-Firewall aktiv, nur SSH/80/443 offen
- [ ] SSH per Public-Key, kein Passwort-Login (`PasswordAuthentication no` in `/etc/ssh/sshd_config`)
- [ ] Demo-User-Passwörter sind geändert (nicht `hestia123`)
- [ ] Automatische Backups laufen
- [ ] Update-Skript getestet
- [ ] Router-Port-Forwarding **nicht** aktiv (LAN-only!)

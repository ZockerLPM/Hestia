# Production-Deploy auf Raspberry Pi 4

Diese Anleitung führt Schritt-für-Schritt zu einer voll funktionsfähigen
Hestia-Installation auf einem RPi 4 (4GB+) im lokalen Netz mit
**selbst-signiertem HTTPS** über Caddy + mkcert. Nach dem Setup kannst du
von jedem Gerät im Heimnetz (Smartphone, Tablet, Wandtablet) auf die App
zugreifen, inklusive PWA-Installation, Web Push und Kamera-Scan.

## Was du brauchst

**Pflicht (Server-Betrieb):**
- Raspberry Pi 4 oder 5 (mindestens 4 GB RAM)
- microSD-Karte ≥ 32 GB (Class 10 oder besser)
- Stabiler Strom (USB-C-Netzteil ≥ 3 A)
- Ethernet oder WLAN
- Zugang zu deinem Router (für DHCP-Reservation)

**Empfohlen:**
- USB-SSD für DB + Backups (Schritt 3) — SD-Karten verschleißen unter
  DB-Last; SSD verlängert die Lebensdauer um Jahre

**Optional — nur wenn du den RPi auch als Wand-Display nutzt:**
- HDMI-Touchscreen (z.B. 10–15"-Industrie-Display oder Waveshare-Panel)
- HC-SR501 PIR-Bewegungssensor + 3 Jumper-Kabel (Schritt 14, PIR-Abschnitt)
- Optional: RPi-Kameramodul (für Gesichtserkennung im Wand-Modus)

## Roadmap durch diese Anleitung

| Schritt | Was passiert | Aufwand |
|---------|--------------|---------|
| 1–2 | RPi OS Lite installieren, Docker einrichten | ~30 Min |
| 3 | USB-SSD vorbereiten und mounten | ~10 Min |
| 4 | Hestia-Code auf den RPi bringen | ~5 Min |
| 5 | Production-`docker-compose.prod.yml` anlegen | ~5 Min |
| 6 | Backend-Dockerfile kurz prüfen | ~2 Min |
| 6b | Face-API-Modelle laden (optional) | ~3 Min |
| 6c | RPi-Kamera aktivieren (optional) | ~5 Min |
| 7 | JWT- und VAPID-Schlüssel erzeugen | ~5 Min |
| 8 | `.env` mit allen Secrets schreiben | ~3 Min |
| 9–10 | mkcert-Zertifikat + Caddyfile | ~15 Min |
| 11 | Erster `docker compose up --build` | ~15 Min |
| 12 | Clients konfigurieren (CA, DNS) | ~10 Min pro Gerät |
| 13 | App in Production testen, Push-Test | ~10 Min |
| 14 | Wandtablet / RPi-Kiosk + PIR-Sensor | ~30 Min |
| 15–16 | Backup + Update automatisieren | ~10 Min |

Erstmaliges Komplettsetup: **~3 Stunden**, davon ~30 Min Wartezeit beim
ersten Docker-Build.

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
2. Storage wählen (deine microSD-Karte)
3. OS wählen: **Raspberry Pi OS (other) → Raspberry Pi OS Lite (64-bit)**.
   "Lite" heißt: keine Desktop-Umgebung, keine vorinstallierten GUI-Apps —
   genau das, was wir für einen Docker-Server wollen. Den Browser für den
   Wand-Modus installieren wir in Schritt 14 gezielt nach.
4. Vor dem Schreiben unbedingt das ⚙️-Zahnrad öffnen ("OS-Anpassung"):
   - **Hostname**: `hestia` → später erreichbar als `hestia.local`
   - **SSH aktivieren**: Public-Key-Authentifizierung empfohlen
   - **Benutzername + Passwort**: merken — alle späteren Schritte in
     dieser Doku zeigen `pi` als Beispiel. Wenn du z.B. `marc` wählst,
     ersetze überall `pi` → `marc` und `/home/pi/` → `/home/marc/`.
   - **WLAN konfigurieren** (falls kein Ethernet): SSID + Passwort + Land
   - **Locale-Einstellungen**: Zeitzone `Europe/Berlin`, Tastatur `de`
5. Schreiben starten (~5 Min), Karte auswerfen, in den RPi stecken,
   Strom dran. Erster Boot dauert ~60 s (resize-Partition, SSH-Keys).
6. Vom Hauptrechner per SSH verbinden:
   ```bash
   ssh pi@hestia.local
   # Wenn .local nicht auflöst: ssh pi@192.168.1.<x>, IP aus dem Router
   ```

## Schritt 2 — System aktualisieren und Tools installieren

Erstmal alles auf den neuesten Stand bringen und die Basis-Tools nachziehen,
die wir später brauchen (`curl` für Downloads, `git` für den Code-Pull,
`ufw` für die Firewall, `ca-certificates` für TLS).

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ca-certificates gnupg lsb-release ufw openssl
```

### Docker installieren

Das offizielle "Convenience Script" — installiert Docker Engine + Compose-
Plugin in einem Schritt, funktioniert sauber auf RPi OS Bookworm:

```bash
curl -fsSL https://get.docker.com | sudo sh

# Aktuellen User in die docker-Gruppe aufnehmen, damit du Docker ohne
# sudo aufrufen kannst:
sudo usermod -aG docker $USER

# Wichtig: Die Gruppenmitgliedschaft greift erst nach einem neuen Login.
# Am einfachsten: SSH-Session beenden und neu verbinden.
exit
```

Neu einloggen und Docker prüfen:
```bash
ssh pi@hestia.local
docker --version          # Docker version 27.x.x oder neuer
docker compose version    # Docker Compose version v2.x.x
docker run --rm hello-world   # End-to-end-Test, lädt ein 13 KB Image
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

SD-Karten haben begrenzte Schreibzyklen. SQLite mit regelmäßigen Writes
kann sie nach 1–2 Jahren verschleißen. Eine USB-SSD (auch eine alte
60-GB-SSD im USB-Adapter) ist deutlich robuster und auch schneller.

> Wenn du erstmal ohne SSD starten willst: überspringe diesen Schritt
> und ersetze in der `docker-compose.prod.yml` (Schritt 5) den Eintrag
> `/mnt/hestia-data/db:/data` durch ein Docker-Volume:
> `- hestia-data:/data` und unten `volumes:` ergänzen um `hestia-data:`.

### SSD identifizieren

```bash
sudo apt install -y parted    # falls noch nicht da

# SSD anstecken, kurz warten, dann:
lsblk
# Beispiel-Output:
#   sda           931.5G  disk
#   └─sda1        931.5G  part   ← die Partition, die wir mounten wollen
```

Welcher Device-Node deine SSD ist (`/dev/sda`, `/dev/sdb`, ...) hängt
davon ab, was sonst noch dranhängt. Notiere ihn dir aus dem `lsblk`-Output.

### Falls die SSD leer/neu ist: einmalig formatieren

> ⚠️ **Datenverlust-Risiko!** Folgender Block löscht ALLES auf der SSD.
> Doppelt prüfen, dass `/dev/sdX` wirklich die neue SSD ist, nicht die
> Boot-Karte.

```bash
DEV=/dev/sda                       # ggf. anpassen
sudo parted "$DEV" --script mklabel gpt mkpart primary ext4 0% 100%
sudo mkfs.ext4 -L hestia-data "${DEV}1"
```

### Mounten und in fstab eintragen

```bash
sudo mkdir -p /mnt/hestia-data

# UUID der frisch formatierten Partition holen:
sudo blkid /dev/sda1
# z.B.: /dev/sda1: LABEL="hestia-data" UUID="abc12345-..." TYPE="ext4" ...

# UUID einsetzen — bessere Methode als /dev/sdX, weil stabil:
echo 'UUID=<deine-uuid>  /mnt/hestia-data  ext4  defaults,noatime,nofail  0  2' \
  | sudo tee -a /etc/fstab

sudo mount -a
# Wenn 'mount -a' fehlerlos durchläuft, ist auch der Reboot sicher.

# Berechtigung dem User geben:
sudo chown -R $USER:$USER /mnt/hestia-data
df -h /mnt/hestia-data    # zeigt freien Platz
```

## Schritt 4 — Hestia-Code holen

Zwei Wege — je nachdem, ob dein Code in einem Git-Repo liegt oder lokal:

### Variante A — git clone (empfohlen, ermöglicht spätere Updates)

```bash
mkdir -p ~/hestia && cd ~/hestia
git clone <dein-repo-url> .
# z.B. git clone git@github.com:<user>/hestia.git .
```

### Variante B — SCP vom Entwickler-Rechner

Falls du den Code noch nirgends gepusht hast: vom **Windows**-Rechner aus
(PowerShell), in dem Ordner mit dem Repo:

```powershell
# Auf Windows ausführen — kopiert ins HOME des pi-Users
scp -r S:\Programmieren\Hestia\* pi@hestia.local:~/hestia/
```

Vom **macOS/Linux**-Rechner:
```bash
rsync -avz --exclude node_modules --exclude .git \
  ./hestia/ pi@hestia.local:~/hestia/
```

> Empfehlung: auch bei lokalem Code mindestens ein lokales Git-Repo
> anlegen, damit du in Schritt 16 (Updates) `git pull` benutzen kannst.

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
      - TOMTOM_API_KEY=${TOMTOM_API_KEY:-}
      - MOTION_SECRET=${MOTION_SECRET:-}
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

## Schritt 6 — Backend-Image prüfen (in der Regel nichts zu tun)

Das mitgelieferte `backend/Dockerfile` ist multi-stage gebaut und läuft
nativ auf arm64. Es führt beim Container-Start automatisch
`prisma db push` aus, sodass Schema-Änderungen ohne separate Migration
greifen. Du musst hier normalerweise nichts anpassen — kurz prüfen reicht:

```bash
tail -n 5 ~/hestia/backend/Dockerfile
# Erwartet etwa:
#   RUN mkdir -p data
#   EXPOSE 3001
#   CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]
```

Die DB liegt im Container unter `/data/hestia.db` und ist via dem
Bind-Mount aus der `docker-compose.prod.yml` (`/mnt/hestia-data/db`)
auf der USB-SSD persistent.

## Schritt 6b — Face-Modelle herunterladen (optional, für Wand-Erkennung)

Wenn du die Gesichtserkennung im Wand-Modus nutzen willst, müssen die
face-api.js-Modelle (~7 MB, 6 Dateien) **vor dem ersten Docker-Build**
unter `frontend/public/models/` liegen. Sie werden in das Nginx-Image
gebacken und über `https://hestia.local/models/*` ausgeliefert.

> **Wichtig:** RPi OS Lite hat **kein Node.js installiert**. Das im Repo
> mitgelieferte `npm run face:models`-Skript funktioniert daher auf dem
> Host nicht. Wir laden die Modelle stattdessen direkt mit `curl` —
> das genau gleiche Resultat, eine Abhängigkeit weniger.

```bash
MODELS_DIR=~/hestia/frontend/public/models
mkdir -p "$MODELS_DIR"
BASE=https://raw.githubusercontent.com/vladmandic/face-api/master/model

for f in \
    tiny_face_detector_model-weights_manifest.json \
    tiny_face_detector_model.bin \
    face_landmark_68_model-weights_manifest.json \
    face_landmark_68_model.bin \
    face_recognition_model-weights_manifest.json \
    face_recognition_model.bin; do
  echo "↓ $f"
  curl -fsSL "$BASE/$f" -o "$MODELS_DIR/$f"
done

ls -lh "$MODELS_DIR"
# Erwartete Größen:
#   tiny_face_detector_model.bin     ~190 KB
#   face_landmark_68_model.bin       ~350 KB
#   face_recognition_model.bin       ~6.2 MB
#   + 3 Manifest-JSONs (je <1 KB)
```

Beim nächsten `docker compose build` landen diese Dateien automatisch
unter `/usr/share/nginx/html/models/` im Frontend-Image. Solange der
Ordner leer bleibt, läuft der Wand-Modus trotzdem — nur die Gesichts-
erkennung ist dann deaktiviert (zeigt "Keine Gesichter registriert").

## Schritt 6c — RPi-Kameramodul aktivieren (für Wand-Erkennung)

Wenn der RPi sowohl Server als auch Wand-Display ist und du das
Kameramodul nutzen willst:

```bash
sudo raspi-config
# Interface Options → Camera → Enable → reboot
```

Auf RPi OS Bookworm (64-bit) läuft die Kamera über **libcamera** und ist
direkt als `/dev/video0` (V4L2) für Chromium verfügbar. Test:

```bash
libcamera-hello --timeout 2000     # Vorschau-Fenster, sollte Bild zeigen
ls /dev/video*                     # /dev/video0 etc. müssen existieren
```

Chromium braucht Kamera-Zugriff. Im Kiosk-Modus muss der Flag
`--use-fake-ui-for-media-stream` ODER eine vorab erteilte Permission
gesetzt sein — siehe Schritt 14.

## Schritt 7 — VAPID-Keys + JWT-Secret generieren

Web-Push braucht ein einmaliges VAPID-Schlüsselpaar, JWT braucht ein
zufälliges Server-Secret. Beides erzeugst du **ohne Node auf dem Host**:

### JWT-Secret (openssl ist auf Lite vorinstalliert)

```bash
JWT_SECRET=$(openssl rand -base64 48)
echo "JWT_SECRET=$JWT_SECRET"
# Beispielausgabe:
# JWT_SECRET=zK9lqJ3v7pYxN8mR2tQ5wA1eS6fD0gH4uI8oP3bC7vN5xY9zA1eS6fD0gH4u
```

Notiere dir den Wert — du brauchst ihn in Schritt 8.

### VAPID-Keys via Docker (kein npm/Node-Install nötig)

Wir starten kurz einen Wegwerf-Container, der die Keys ausgibt:

```bash
docker run --rm node:22-alpine sh -c \
  'npx --yes -q web-push generate-vapid-keys 2>/dev/null'
```

Erstmaliger Aufruf lädt das `node:22-alpine`-Image (~50 MB) und das
`web-push`-npm-Paket — dauert auf einer normalen RPi-Verbindung
ca. 60–90 Sekunden. Ausgabe etwa so:

```
=======================================
Public Key:
BNw1MaXa7w...8z3vT4qK
Private Key:
8vRfP2k...xY9zA1eS
=======================================
```

Beide Werte für Schritt 8 notieren.

> **Alternative — nach dem ersten Build:** Sobald das Backend-Image
> existiert (Schritt 11), kannst du auch das mitgelieferte npm-Script
> verwenden, das gleich im `KEY=...`-Format ausgibt:
> ```bash
> docker compose -f ~/hestia/docker-compose.prod.yml run --rm backend npm run push:keys
> ```

## Schritt 8 — `.env` schreiben

```bash
cat > ~/hestia/.env <<'EOF'
JWT_SECRET=<dein-jwt-secret>
VAPID_PUBLIC_KEY=<dein-public-key>
VAPID_PRIVATE_KEY=<dein-private-key>
VAPID_SUBJECT=mailto:du@example.com

# Optional: TomTom-Key für Stau-Anzeige im Wand-Modus
# Free Tier 2500 calls/day; ohne Key wird Verkehr-Card ausgeblendet
TOMTOM_API_KEY=

# Optional: Shared Secret für den PIR-Sensor (siehe Schritt 14, PIR-Abschnitt).
# Leer lassen, wenn das Backend nur loopback erreichbar ist.
MOTION_SECRET=
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

> **Voraussetzung:** Schritte 6b (Face-Modelle, falls gewünscht), 7
> (VAPID/JWT), 8 (`.env`), 9 (Zertifikat) und 10 (Caddyfile) sind durch.
> Andernfalls bricht der Build entweder ab oder die Container starten
> ohne notwendige Secrets.

```bash
cd ~/hestia
mkdir -p /mnt/hestia-data/db
docker compose -f docker-compose.prod.yml up -d --build
```

> **Build-Dauer auf dem RPi 4:** ~12–18 Minuten beim ersten Mal — Node
> kompiliert TypeScript für Backend und Frontend, vite bundelt ~3500
> Module, faceapi-Modelle werden ins Image kopiert. Folge-Builds nutzen
> den Docker-Layer-Cache und sind in 1–3 Minuten durch.

Logs während des Hochfahrens beobachten:
```bash
docker compose -f docker-compose.prod.yml logs -f
# Mit Ctrl+C wieder verlassen — Container laufen weiter
```

Healthchecks nach dem Start. In `docker-compose.prod.yml` sind Backend
und Frontend nur intern erreichbar (`expose:`), nach außen mappt nur
Caddy auf 80/443. Drei Möglichkeiten zum Prüfen:

```bash
# 1) Container-Status auf einen Blick — alle drei sollten "running" sein
docker compose -f docker-compose.prod.yml ps

# 2) Backend von innen testen (umgeht Caddy/Frontend)
docker compose -f docker-compose.prod.yml exec backend \
  wget -qO- http://localhost:3001/api/health
# → {"status":"ok","version":"1.0.0"}

# 3) End-to-end über Caddy (das, was Clients später auch nutzen)
#    -k weil curl die mkcert-CA auf dem Server nicht kennt; aus dem
#    Browser, wo die CA installiert ist, ist es vertrauenswürdig.
curl -k https://localhost/api/health
# → {"status":"ok","version":"1.0.0"}
```

Wenn etwas hakt, **Logs des betreffenden Containers** ansehen:
```bash
docker compose -f docker-compose.prod.yml logs backend --tail=50
docker compose -f docker-compose.prod.yml logs caddy --tail=50
```

### Seed-Daten (einmalig — legt Demo-User, Kategorien, Beispieldaten an)

```bash
docker compose -f docker-compose.prod.yml exec backend npm run db:seed
```

Demo-Logins danach: `person1@hestia.local` / `hestia123` und
`person2@hestia.local` / `hestia123`. **Diese Passwörter vor dem
produktiven Einsatz ändern** (Profil-Seite → Passwort ändern).

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

Damit `https://hestia.local` von Clients **und** vom RPi selbst (für den
Kiosk-Browser!) gefunden wird, brauchst du eine Form von Namensauflösung.

> **Auch auf dem RPi-Server selbst installieren**, wenn der RPi als
> Wand-Display dient — sonst kann der Chromium-Kiosk `hestia.local`
> nicht auflösen:
> ```bash
> sudo apt install -y avahi-daemon
> sudo systemctl enable --now avahi-daemon
> # Test:
> avahi-resolve -n hestia.local
> # → hestia.local  192.168.1.100
> ```

Drei Optionen, eine reicht:

**Variante A — mDNS** (empfohlen, zero-config): `hestia.local` wird auf
den meisten Systemen automatisch erkannt (Bonjour auf macOS/iOS, Avahi
auf Linux, ab Win10 Build 17134 nativ). Voraussetzung: alle Clients und
der RPi sind im gleichen Broadcast-Domain (Heim-LAN).

**Variante B — Router-DNS**: Eintrag im Router-DNS-Server hinzufügen
(meist unter "lokale DNS"-Einstellungen oder "Host Override"):
`hestia.local → 192.168.1.100`. Funktioniert auch über Subnetze.

**Variante C — Hosts-File** auf jedem Client (Fallback, wenn A und B
nicht gehen):
```
192.168.1.100  hestia.local
```
Pfade: `/etc/hosts` (Linux/Mac), `C:\Windows\System32\drivers\etc\hosts`
(Windows, Admin nötig).

## Schritt 13 — App in Production testen

Browser öffnen: `https://hestia.local`

Du solltest:
- Kein Browser-Warnung sehen (wegen mkcert-CA)
- Login-Seite sehen
- Mit `person1@hestia.local / hestia123` einloggen können
- Auf Smartphone: "App installieren" verfügbar (Chrome-Menü)

### Push-Notifications testen

```bash
# jq für JSON-Parsing (nicht in Lite vorinstalliert)
sudo apt install -y jq

# Token via Login holen
TOKEN=$(curl -k -s -X POST https://hestia.local/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"person1@hestia.local","password":"hestia123"}' | jq -r .token)
echo "$TOKEN"   # sollte ein JWT-String sein, kein 'null'

# Im Browser auf einem Smartphone:
#   Dashboard → "Benachrichtigungen aktivieren" → erlauben

# Test-Push vom Server aus senden
curl -k -X POST https://hestia.local/api/push/test \
  -H "Authorization: Bearer $TOKEN"
# Auf dem Smartphone sollte jetzt eine Hestia-Benachrichtigung erscheinen.
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

### Variante B — RPi mit angeschlossenem Touchscreen (empfohlen)

Der Repo-Stand liefert ein fertiges Kiosk-Setup für **RPi OS Lite** (also
das CLI-only-System, das du in Schritt 1 installiert hast). Du bekommst
einen vollwertigen Chromium-Browser auf dem Display — **ohne Desktop-
Environment, ohne Login-Manager, ohne Window-Manager**.

#### Geht das überhaupt mit Lite?

Ja. RPi OS Lite hat zwar keinen Desktop, aber die Kernel-Grafiktreiber
(DRM/KMS) sind aktiv. Sobald irgendein Programm Pixel auf den Framebuffer
schreibt, sieht man sie. Wir nutzen dafür **cage**:

| Komponente | Aufgabe | Größe |
|------------|---------|-------|
| `cage` | Minimaler Wayland-Compositor, der **ein** Programm fullscreen anzeigt. Keine Fensterdekoration, keine Taskbar, kein Menü. | ~200 KB Binary |
| `seatd` | Vermittelt Zugriff auf Grafik-/Input-Geräte ohne logind. | ~50 KB |
| `chromium` | Der eigentliche Browser, läuft als Wayland-Client in cage. | ~280 MB RAM |

**Trade-offs gegenüber RPi OS mit Desktop:**

|  | Lite + cage | RPi OS Desktop |
|---|---|---|
| RAM idle (gesamt) | ~150 MB OS + 30 MB cage + 280 MB Chromium ≈ **460 MB** | ~400 MB Desktop + 280 MB Chromium ≈ **680 MB** |
| Boot bis Wand sichtbar | ~15 s | ~25–35 s |
| Updates / Angriffsfläche | minimal (nur was du `apt install`st) | voller Desktop-Stack |
| Andere Apps parallel | nein (echter Kiosk) | ja |
| Lokal debuggen am Display | nur über SSH oder Service-Stop | direkter Desktop-Zugriff |

Für ein dauerhaft an die Wand geklebtes Display ist Lite + cage die
richtige Wahl. Du verlierst nichts, was du im `/wall`-Modus brauchst.

#### Installation

```bash
# 1. Pakete installieren
sudo apt install -y cage chromium seatd

# 2. seatd starten (regelt GPU-/Tastatur-Zugriff)
sudo systemctl enable --now seatd

# 3. Den User in die nötigen Gruppen aufnehmen
#    'pi' ggf. durch deinen User ersetzen, falls anders:
sudo usermod -aG video,input,seat,render,tty pi

# 4. tty1 freiräumen — sonst kollidiert cage mit dem Login-Prompt:
sudo systemctl disable --now getty@tty1.service

# 5. Service + Launcher aus dem Repo installieren
sudo cp ~/hestia/scripts/hestia-kiosk.service /etc/systemd/system/
chmod +x ~/hestia/scripts/hestia-kiosk.sh

# 6. Username/HOME in der Unit anpassen, falls du nicht 'pi' bist:
sudoedit /etc/systemd/system/hestia-kiosk.service
#   → User=<dein-user>
#   → ExecStart-Pfad: /home/<dein-user>/hestia/scripts/hestia-kiosk.sh

# 7. Aktivieren
sudo systemctl daemon-reload
sudo systemctl enable --now hestia-kiosk.service
```

#### Was beim Boot passiert

1. systemd kommt bis `multi-user.target` hoch (~10 s nach Power-On)
2. `seatd.service` läuft, vermittelt GPU-Zugriff
3. `hestia-kiosk.service` greift sich tty1
4. `cage -s` startet, übernimmt den Framebuffer
5. `hestia-kiosk.sh` startet `chromium --kiosk` mit allen passenden Flags
6. Du siehst direkt `https://hestia.local/wall` — kein Login, kein Logo,
   nichts dazwischen

#### Welche Chromium-Flags wir setzen (und warum)

`hestia-kiosk.sh` ruft Chromium mit folgenden Optionen auf:

| Flag | Zweck |
|------|-------|
| `--kiosk` | Vollbild, keine Tabs, kein Menü |
| `--ozone-platform=wayland` | Direkt Wayland-Client, kein X-Wrapper |
| `--noerrdialogs` | Kein "Aw, Snap!"-Dialog nach Crash |
| `--disable-infobars --disable-translate` | Keine Banner verdecken die UI |
| `--autoplay-policy=no-user-gesture-required` | Video-Stream der Gesichtserkennung darf ohne Touch starten |
| `--use-fake-ui-for-media-stream` | Kamera-Permission automatisch erteilt (sonst Dialog) |
| `--no-first-run --check-for-update-interval=...` | Kein "Willkommen", kein Update-Popup |
| `--user-data-dir=...` | Eigenes Profil, getrennt vom Default — sorgt zusätzlich dafür, dass der "Restore session?"-Hinweis nach Stromausfall sauber zurückgesetzt werden kann |

Außerdem setzt das Skript vor dem Start den Crash-Marker im Profil
zurück (`"exit_type":"Crashed" → "Normal"`), damit nach einem Stromausfall
nicht die orange "Wiederherstellen"-Leiste hängenbleibt.

#### Bildschirm-Aus / Dimmen

Wir aktivieren **bewusst keinen** OS-Bildschirmschoner. Das macht der
Frontend-Code: `useWallScreensaver` blendet nach konfigurierbarer Idle-
Zeit ein schwarzes Overlay ein und stoppt zusätzlich die Kamera. Geweckt
wird über:

- **PIR-Sensor** (siehe weiter unten) — sendet `motion-detected` per
  Socket.io, Frontend deckt das Overlay sofort wieder ab
- **Touch / Maus / Tastatur** auf dem Display selbst

So bleibt der einzige Wake-Pfad in der App-Logik, nicht in der OS-
Konfiguration — kein Konflikt zwischen `xset dpms`, `setterm` und
Browser-Verhalten.

#### Debugging und Wartung

Während Kiosk läuft, ist tty1 vom Display belegt. Du arbeitest stattdessen
über SSH:

```bash
# Logs des Kiosks
journalctl -u hestia-kiosk -f

# Kiosk vorübergehend anhalten (zeigt Login-Prompt auf tty1)
sudo systemctl stop hestia-kiosk

# Wieder starten
sudo systemctl start hestia-kiosk

# Komplett deaktivieren (überlebt Reboot)
sudo systemctl disable --now hestia-kiosk
```

URL ändern, ohne die Unit zu editieren:
```bash
sudo systemctl edit hestia-kiosk
# In den Override-Block einfügen:
#   [Service]
#   Environment=HESTIA_WALL_URL=http://192.168.1.100/wall
sudo systemctl restart hestia-kiosk
```

#### Wenn du doch RPi OS mit Desktop fährst

Statt `hestia-kiosk.service` reicht eine Autostart-Datei, die das gleiche
Skript aufruft:

```bash
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/hestia-kiosk.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=Hestia Wall
Exec=/home/pi/hestia/scripts/hestia-kiosk.sh
X-GNOME-Autostart-enabled=true
EOF
```

Beim Login startet dann Chromium im Kiosk-Modus innerhalb der Desktop-
Session.

### Wand-Erkennung (optional)

Wenn du die Gesichtserkennung im Wand-Modus nutzen möchtest:

1. **Modelle ausliefern**: Beim ersten Build wurden `frontend/public/models/`
   bereits ins Image gepackt (siehe Schritt 6b)
2. **RPi-Kameramodul** ist nach Schritt 6c aktiv
3. **Gesichter registrieren**: Auf einem regulären Gerät (Notebook,
   Smartphone) `https://hestia.local/profile` öffnen → "Wand-Erkennung"
   → 2-3 Aufnahmen pro Person aus verschiedenen Winkeln
4. **Auf der Wand**: Im Header das Auge-Icon prüfen — Erkennung sollte
   "Suche…" und dann "&lt;Name&gt; erkannt" anzeigen
5. **Toggle**: Bei Bedenken jederzeit deaktivierbar — State persistiert
   in `localStorage`

Performance auf RPi 4 (Wand-Display):
- Detection alle 2 s, 30 s "Schlaf" nach Erkennung
- CPU-Last ohne aktive Erkennung: <2%
- CPU-Last während Erkennung: ~30% (kurze Spikes von ~700 ms)
- RAM-Footprint Chromium + Modelle: ~280 MB
- Wird bei niedrigem Licht ungenauer — gute Beleuchtung erhöht
  Trefferquote deutlich

### PIR-Bewegungssensor (HC-SR501) einrichten

Der PIR-Sensor sendet bei Bewegung `motion-detected` via Socket.io an alle
Wall-Clients. Das weckt die Gesichtserkennung auf, ohne dauerhaft CPU zu
verbrauchen.

**Verkabelung HC-SR501:**
```
VCC  → Pin 2  (5V)
OUT  → Pin 11 (GPIO 17, BCM)
GND  → Pin 6
```

**Installation** — Repo liefert Skript und systemd-Unit unter `scripts/`:

```bash
sudo apt install -y python3-gpiozero python3-requests

sudo cp ~/hestia/scripts/hestia-pir.service /etc/systemd/system/
# User= und HOME-Pfad in der Unit anpassen, falls nicht 'pi':
sudoedit /etc/systemd/system/hestia-pir.service

sudo systemctl daemon-reload
sudo systemctl enable --now hestia-pir.service
```

Das Skript [`scripts/pir-motion.py`](../scripts/pir-motion.py) nutzt
`gpiozero` (event-getrieben statt Polling, läuft auch auf RPi 5) und
respektiert ein Cooldown-Fenster, damit der HC-SR501 nicht jede Bewegung
einzeln meldet.

**Konfigurierbar über Environment-Variablen** in der Unit-Datei:
- `HESTIA_PIR_GPIO` — BCM-Pin (Default 17)
- `HESTIA_MOTION_URL` — Backend-Endpoint (Default loopback)
- `HESTIA_MOTION_SECRET` — muss mit `MOTION_SECRET` in der `.env` matchen
- `HESTIA_MOTION_COOLDOWN` — Sekunden zwischen aufeinanderfolgenden Posts
  (Default 5)

**`MOTION_SECRET` in `.env` setzen** (optional, empfohlen wenn Backend
nicht nur loopback erreichbar ist):
```
MOTION_SECRET=<openssl rand -hex 16>
```
Den selben Wert in der Service-Unit als `HESTIA_MOTION_SECRET` eintragen.
Ohne Secret erlaubt das Backend POST ohne Header.

**Test:**
```bash
# Manuell triggern, sollte 'motion-detected' auf der Wand auslösen:
curl -X POST http://localhost:3001/api/internal/motion \
  -H "x-motion-secret: $MOTION_SECRET"
# → {"ok":true}
```

### Persönliche Daten konfigurieren

Damit `PersonalPanel` Inhalte zeigt, jeder Benutzer einmalig:

1. App öffnen, einloggen, `/profile` ansteuern
2. **Zuhause**: Heimatbahnhof oder Wohnadresse (z.B. "Zürich HB")
3. **Arbeit**: Zielbahnhof (z.B. "Bern")
4. **Pendel-Modus**: ÖV / Auto / Fahrrad / Zu Fuß
   - ÖV → nutzt `transport.opendata.ch` mit dem Stationsnamen aus Label
   - Auto → nutzt TomTom mit Lat/Lng (Key in `.env` erforderlich)
5. **Wetter-Standort**: leer = nimmt Home; sonst eigener Punkt
6. **Arbeitsschichten**: konkrete Schichten und/oder Muster anlegen
   - Muster: Profil → "Schicht-Muster" → Wochentag + Zeit; werden täglich
     automatisch in konkrete Schichten generiert (14-Tage-Horizont)
   - Einzelschichten: weiterhin manuell unter "Schichten"
7. **Dashboard anpassen**: `/wall` → SlidersHorizontal-Icon oben rechts
   - Reihenfolge per Drag & Drop
   - Einzelne Karten ein-/ausblenden
   - Hintergrundfarbe und Sekundenanzeige konfigurieren

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

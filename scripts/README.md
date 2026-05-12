# Hestia RPi-Hilfsskripte

Skripte und systemd-Units für den RPi-Betrieb. Werden in
[`docs/DEPLOYMENT-RPI.md`](../docs/DEPLOYMENT-RPI.md) referenziert.

## Dateien im Überblick

| Datei | Zweck |
|-------|-------|
| `pir-motion.py` | HC-SR501-Reader, sendet bei Bewegung POST an Backend |
| `hestia-pir.service` | systemd-Unit für `pir-motion.py` |
| `hestia-kiosk.sh` | Launcher: holt Auto-Login-Token, startet Chromium |
| `hestia-kiosk-login.sh` | Holt JWT via `/api/auth/login` für Auto-Login |
| `hestia-kiosk.service` | systemd-Unit für Wand-Display via `cage` |
| `hestia-cam-bridge.sh` | CSI-Kamera → v4l2loopback Pipeline (Bookworm-Workaround) |
| `hestia-cam-bridge.service` | systemd-Unit für die Cam-Brücke |
| `v4l2loopback.conf` | modprobe-Optionen für das virtuelle Capture-Device |

## Setup-Reihenfolge (kompakt)

Voraussetzung: RPi OS Lite eingerichtet, Docker-Stack läuft, Hestia ist
unter `https://hestia.local` erreichbar (siehe Schritte 1–13 in
DEPLOYMENT-RPI.md).

### 0. Execute-Bit prüfen (zwingend nach jedem Sync von Windows!)

```bash
chmod +x ~/hestia/scripts/*.sh ~/hestia/scripts/*.py
```

Sync von Windows (SCP/rsync/Imager-USB) verliert das Linux-execute-Bit,
weil NTFS keine POSIX-Permissions kennt. Symptome ohne diesen Schritt:
- `cage`: `Failed to spawn client: Permission denied`
- `python3`: `cannot execute: ...`

Die mitgelieferten systemd-Units (`hestia-kiosk.service`,
`hestia-pir.service`) ziehen das execute-Bit zusätzlich als
`ExecStartPre=-chmod +x …` selbst nach — also auch wenn du den Schritt
vergisst, läuft der Service. Manuell nachziehen ist trotzdem sauberer
und vermeidet eine Fehlersuche-Schleife.

### 1a. CSI-Kamera für Chromium nutzbar machen (nur bei Cam-Modul am CSI-Port)

Auf RPi OS Bookworm sind CSI-Kameras nicht direkt via V4L2 erreichbar
(libcamera-Pipeline blockiert direkten Zugriff). Wir starten daher eine
`rpicam-vid → ffmpeg → /dev/video40`-Brücke, die das Stream-Format
Chromium-tauglich macht.

```bash
# Pakete: v4l2loopback Kernel-Modul + ffmpeg + rpicam-Tools
sudo apt install -y v4l2loopback-dkms ffmpeg rpicam-apps

# Modul-Optionen (card_label, video_nr, exclusive_caps)
sudo cp ~/hestia/scripts/v4l2loopback.conf /etc/modprobe.d/

# Modul beim Boot automatisch laden
echo 'v4l2loopback' | sudo tee /etc/modules-load.d/v4l2loopback.conf

# Sofort einmalig laden (für aktuellen Boot, ohne Reboot)
sudo modprobe v4l2loopback
ls /dev/video40   # muss jetzt existieren

# Bridge-Service installieren
sudo cp ~/hestia/scripts/hestia-cam-bridge.service /etc/systemd/system/
# !!! User-HOME-Pfad in ExecStart= anpassen, falls nicht 'pi':
sudoedit /etc/systemd/system/hestia-cam-bridge.service
#   ExecStart=/home/fabi/hestia/scripts/hestia-cam-bridge.sh
#   ExecStartPre=-/bin/chmod +x /home/fabi/hestia/scripts/hestia-cam-bridge.sh

chmod +x ~/hestia/scripts/hestia-cam-bridge.sh
sudo systemctl daemon-reload
sudo systemctl enable --now hestia-cam-bridge

# Test: schreibt Bridge wirklich in /dev/video40?
sudo apt install -y fswebcam
fswebcam -d /dev/video40 -r 640x480 --no-banner /tmp/cam-test.jpg
ls -la /tmp/cam-test.jpg
# Erwartet: ~30-50 KB JPEG. Wenn ja: Chromium sieht "HestiaCam" jetzt als ganz normale Webcam.

# Kiosk neu starten, damit der Frontend-Code die HestiaCam findet
sudo systemctl restart hestia-kiosk
```

**Troubleshooting:**

```bash
# Service-Status + Logs
systemctl status hestia-cam-bridge --no-pager
journalctl -u hestia-cam-bridge -n 50 --no-pager

# Auflösung anpassen — wenn 640x480 zu wenig oder zu viel ist:
sudo systemctl edit hestia-cam-bridge
# [Service]
# Environment=HESTIA_CAM_WIDTH=1280
# Environment=HESTIA_CAM_HEIGHT=720
# Environment=HESTIA_CAM_FPS=15
```

**Bei jedem Kernel-Update:** das `v4l2loopback-dkms`-Paket baut sich
selbst gegen den neuen Kernel — bei seltenen Versionsmismatches manuell:
```bash
sudo dpkg-reconfigure v4l2loopback-dkms
```

### 1. PIR-Sensor (optional, falls HC-SR501 angeschlossen)

```bash
sudo apt install -y python3-gpiozero python3-requests
sudo cp ~/hestia/scripts/hestia-pir.service /etc/systemd/system/
sudoedit /etc/systemd/system/hestia-pir.service     # User= anpassen
sudo systemctl daemon-reload
sudo systemctl enable --now hestia-pir
```

### 2. Wand-Display (Kiosk)

```bash
# Pakete
sudo apt install -y cage chromium seatd libnss3-tools imagemagick xcursorgen

sudo systemctl enable --now seatd
sudo systemctl disable --now getty@tty1.service
sudo usermod -aG video,input,seat,render,tty $USER
sudo loginctl enable-linger $USER

# Leerer Cursor-Theme (Mauszeiger ausblenden — siehe DEPLOYMENT-RPI.md)
cd /tmp
convert -size 1x1 xc:transparent blank.png
echo "1 0 0 blank.png" > blank.cfg
xcursorgen blank.cfg blank-cursor
sudo mkdir -p /usr/share/icons/blank/cursors
sudo cp blank-cursor /usr/share/icons/blank/cursors/default
for c in left_ptr text crosshair pointer hand grab grabbing watch progress \
         help context-menu not-allowed wait xterm arrow; do
  sudo ln -sf default /usr/share/icons/blank/cursors/$c
done
sudo tee /usr/share/icons/blank/index.theme > /dev/null <<'EOF'
[Icon Theme]
Name=blank
Inherits=core
EOF

# Optional: Auto-Login (sonst zeigt der Kiosk das Login-Formular)
cat > ~/.hestia-kiosk.env <<'EOF'
HESTIA_KIOSK_EMAIL=person1@hestia.local
HESTIA_KIOSK_PASSWORD=hestia123
EOF
chmod 600 ~/.hestia-kiosk.env

# Cursor-Theme für Chromium (NSS-Trust-Store mit mkcert-CA)
mkdir -p ~/.pki/nssdb
certutil -d sql:$HOME/.pki/nssdb -N --empty-password
mkcert -install

# Service installieren und konfigurieren
sudo cp ~/hestia/scripts/hestia-kiosk.service /etc/systemd/system/

# Override mit allen RPi-spezifischen Settings auf einmal
sudo systemctl edit hestia-kiosk --force --full
# Oder mit drop-in (empfohlen, behält Repo-File unverändert):
sudo systemctl edit hestia-kiosk
```

### Empfohlener Override-Block für `sudo systemctl edit hestia-kiosk`

Dieser eine Block deckt alle bekannten RPi-Spezifika ab. **Username + UID
+ DRM-Card unbedingt prüfen und anpassen**, der Rest ist Defaults:

```ini
[Service]
# Username anpassen — Repo-Default ist 'pi', RPi-OS-Imager-Setup heißt
# in der Regel anders (z.B. 'fabi'). Zwingend, sonst exit 217/USER.
User=fabi

# /run/user/<uid> für Wayland-Sockets. enable-linger vorher ausführen!
# UID ggf. anpassen: `id -u <user>`
Environment=XDG_RUNTIME_DIR=/run/user/1000

# Bei DSI-Display (RPi Touch Display) sitzt der Display-Connector auf card1.
# Bei reinem HDMI: weglassen oder auf /dev/dri/card0 setzen.
# Prüfen mit: for f in /sys/class/drm/card*-*/status; do echo "$f: $(cat $f)"; done
Environment=WLR_DRM_DEVICES=/dev/dri/card1

# Mauszeiger ausblenden (leerer XCursor-Theme installiert? siehe oben)
Environment=XCURSOR_THEME=blank
Environment=XCURSOR_SIZE=1

# Auflösungs-Skalierung — niedriger = UI wird kleiner / mehr Inhalt sichtbar.
# Display-Auflösung prüfen: cat /sys/class/drm/card1-DSI-1/modes
#   800x480  → 0.6
#   1024x600 → 0.7
#   1280x720 → 0.85
#   1920x1080 → 1.0 (default)
Environment=HESTIA_KIOSK_SCALE=0.6

# Auto-Login Credentials (siehe ~/.hestia-kiosk.env). %h-Spezifier funktioniert
# in Override-Dropins manchmal nicht zuverlässig — daher absoluter Pfad.
# Die leere EnvironmentFile=-Zeile davor löscht eventuell überlebende
# Werte aus der Repo-Unit-Datei, dann setzt die zweite den neuen Pfad.
EnvironmentFile=
EnvironmentFile=-/home/fabi/.hestia-kiosk.env

# ExecStart mit absolutem Pfad (analog: %h ist im Override unzuverlässig).
# Leere ExecStart=Zeile = "alle vorherigen ExecStart= löschen", dann neue setzen.
ExecStart=
ExecStart=/usr/bin/cage -s -- /home/fabi/hestia/scripts/hestia-kiosk.sh
```

Speichern, dann:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hestia-kiosk
journalctl -u hestia-kiosk -f
```

## Troubleshooting

Komplette Fehler-Cheatsheet siehe **Troubleshooting**-Sektion in
[`docs/DEPLOYMENT-RPI.md`](../docs/DEPLOYMENT-RPI.md). Häufigste Patterns:

| Symptom | Ursache | Fix |
|---------|---------|-----|
| `status=217/USER` | `User=pi` ≠ realer Username | Override `User=<real>` |
| `Failed to spawn client: Permission denied` | CRLF im Skript | `dos2unix scripts/*.sh` |
| `Failed to parse EDID` + Silent-Exit | DSI auf card1, cage nimmt card0 | `WLR_DRM_DEVICES=/dev/dri/card1` |
| Login-Page statt Wand | Kein Token / `.hestia-kiosk.env` fehlt | Datei anlegen, chmod 600 |
| "your connection is not private" | NSS-Trust-Store leer | `certutil -N` vor `mkcert -install` |

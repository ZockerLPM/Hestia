#!/usr/bin/env bash
# Brücke von CSI-Kamera (libcamera) zu einem v4l2loopback-Device, damit
# Chromium die Kamera nutzen kann. Auf RPi OS Bookworm sind CSI-Module
# nicht direkt via klassisches V4L2 erreichbar — sie hängen hinter der
# libcamera-ISP-Pipeline. Diese Brücke übersetzt den Stream einmalig
# in ein YUYV-Format, das alle modernen Browser direkt nutzen können.
#
# Wird vom hestia-cam-bridge.service als root gestartet (rpicam-vid
# braucht Zugriff auf /dev/media* + GPU-Memory).
set -euo pipefail

# Konfigurierbar über Service-Environment
WIDTH="${HESTIA_CAM_WIDTH:-640}"
HEIGHT="${HESTIA_CAM_HEIGHT:-480}"
FPS="${HESTIA_CAM_FPS:-15}"
LOOPBACK_DEV="${HESTIA_CAM_LOOPBACK:-/dev/video40}"

# Sanity-Check: ist das Loopback-Device da?
if [[ ! -e "${LOOPBACK_DEV}" ]]; then
  echo "ERROR: ${LOOPBACK_DEV} existiert nicht — v4l2loopback-Modul geladen?" >&2
  echo "       Prüfen mit: lsmod | grep v4l2loopback" >&2
  exit 1
fi

# Pipeline:
#   rpicam-vid liest die CSI-Cam via libcamera, gibt rohes YUV420 nach stdout
#   ffmpeg konvertiert YUV420 → YUYV422 (Chromium-Standard) und schreibt
#   in das v4l2loopback-Device, das Chromium dann als USB-Cam sieht
exec rpicam-vid \
    --camera 0 \
    --width "${WIDTH}" --height "${HEIGHT}" \
    --framerate "${FPS}" \
    --timeout 0 \
    --codec yuv420 \
    --nopreview \
    --inline \
    --output - \
  | ffmpeg \
    -hide_banner -loglevel warning \
    -f rawvideo -pix_fmt yuv420p \
    -s "${WIDTH}x${HEIGHT}" -r "${FPS}" \
    -i pipe:0 \
    -f v4l2 -pix_fmt yuyv422 \
    "${LOOPBACK_DEV}"

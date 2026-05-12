#!/usr/bin/env python3
"""
Hestia PIR motion sensor → backend bridge.

Liest den HC-SR501 (Default GPIO 17, BCM-Nummerierung) und sendet bei steigender
Flanke einen POST an /api/internal/motion. Das Backend feuert dann via Socket.io
'motion-detected' an alle Wall-Clients (weckt Display + Face-Erkennung).

Setup-Voraussetzungen auf RPi OS Bookworm:
    sudo apt install -y python3-gpiozero python3-requests
"""

import os
import sys
import time
import logging
from gpiozero import MotionSensor
import requests

GPIO_PIN     = int(os.environ.get('HESTIA_PIR_GPIO', '17'))
ENDPOINT     = os.environ.get('HESTIA_MOTION_URL', 'http://localhost:3001/api/internal/motion')
SECRET       = os.environ.get('HESTIA_MOTION_SECRET', '')
COOLDOWN_SEC = float(os.environ.get('HESTIA_MOTION_COOLDOWN', '5'))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
)
log = logging.getLogger('hestia-pir')


def post_motion() -> None:
    headers = {'x-motion-secret': SECRET} if SECRET else {}
    try:
        r = requests.post(ENDPOINT, headers=headers, timeout=2)
        if r.status_code != 200:
            log.warning('Backend %s: %s', r.status_code, r.text[:200])
    except requests.RequestException as e:
        log.warning('Backend unreachable: %s', e)


def main() -> int:
    log.info('Starting PIR bridge: GPIO %d → %s', GPIO_PIN, ENDPOINT)
    sensor = MotionSensor(GPIO_PIN)
    last_fired = 0.0

    while True:
        sensor.wait_for_motion()
        now = time.monotonic()
        if now - last_fired >= COOLDOWN_SEC:
            log.info('Motion detected')
            post_motion()
            last_fired = now
        sensor.wait_for_no_motion()


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(0)

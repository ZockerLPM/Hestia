import { Router } from 'express';
import axios from 'axios';
import { auth } from '../middleware/auth';
import { cached } from '../lib/externalCache';

const router = Router();
router.use(auth);

// =================== WETTER (Open-Meteo) ===================
// Doku: https://open-meteo.com/en/docs — kostenlos, keine Key, weltweit
router.get('/weather', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: 'lat/lng required' });
  }

  const key = `weather:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  try {
    const data = await cached(key, 15 * 60 * 1000, async () => {
      const url = 'https://api.open-meteo.com/v1/forecast';
      const resp = await axios.get(url, {
        params: {
          latitude: lat,
          longitude: lng,
          current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m',
          daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
          timezone: 'auto',
          forecast_days: 3,
        },
        timeout: 5000,
      });
      return resp.data;
    });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'Wetter-API nicht erreichbar' });
  }
});

// =================== ÖV (transport.opendata.ch — Schweiz) ===================
// Doku: https://transport.opendata.ch/docs.html — kostenlos, ohne Key
// SBB + alle Schweizer Verbünde.
router.get('/transit', async (req, res) => {
  const from = String(req.query.from ?? '');
  const to = String(req.query.to ?? '');
  if (!from || !to) return res.status(400).json({ error: 'from/to required' });

  const key = `transit:${from}:${to}`;
  try {
    const data = await cached(key, 60 * 1000, async () => {
      const resp = await axios.get('https://transport.opendata.ch/v1/connections', {
        params: { from, to, limit: 4 },
        timeout: 5000,
      });
      // Nur relevante Felder zurückgeben, schont Bandbreite
      const conns = (resp.data?.connections ?? []).map((c: any) => ({
        from: {
          station: c.from?.station?.name,
          platform: c.from?.platform,
          departure: c.from?.departure,
          delay: c.from?.delay ?? 0,
        },
        to: {
          station: c.to?.station?.name,
          arrival: c.to?.arrival,
          arrivalDelay: c.to?.arrivalDelay ?? 0,
        },
        duration: c.duration,
        transfers: c.transfers,
        products: c.products,
      }));
      return { connections: conns };
    });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'ÖV-API nicht erreichbar' });
  }
});

// =================== VERKEHR (TomTom) ===================
// Doku: https://developer.tomtom.com — Free Tier 2500 calls/day
// API-Key über Env: TOMTOM_API_KEY
router.get('/traffic', async (req, res) => {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) {
    return res.json({ enabled: false });
  }
  const fromLat = Number(req.query.fromLat);
  const fromLng = Number(req.query.fromLng);
  const toLat = Number(req.query.toLat);
  const toLng = Number(req.query.toLng);
  if ([fromLat, fromLng, toLat, toLng].some(Number.isNaN)) {
    return res.status(400).json({ error: 'fromLat/fromLng/toLat/toLng required' });
  }

  const key = `traffic:${fromLat.toFixed(3)}:${fromLng.toFixed(3)}:${toLat.toFixed(3)}:${toLng.toFixed(3)}`;
  try {
    const data = await cached(key, 3 * 60 * 1000, async () => {
      const url = `https://api.tomtom.com/routing/1/calculateRoute/${fromLat},${fromLng}:${toLat},${toLng}/json`;
      const resp = await axios.get(url, {
        params: { key: apiKey, traffic: true, routeType: 'fastest', travelMode: 'car' },
        timeout: 5000,
      });
      const route = resp.data?.routes?.[0]?.summary;
      if (!route) throw new Error('no route');
      return {
        enabled: true,
        durationSec: route.travelTimeInSeconds,
        durationNoTrafficSec: route.noTrafficTravelTimeInSeconds,
        delaySec: route.trafficDelayInSeconds ?? 0,
        distanceM: route.lengthInMeters,
        congestion: route.trafficDelayInSeconds > 300 ? 'heavy'
                   : route.trafficDelayInSeconds > 120 ? 'moderate'
                   : 'free',
      };
    });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'Verkehrs-API nicht erreichbar' });
  }
});

// Configuration probe — Frontend kann fragen welche Provider verfügbar
router.get('/status', (_req, res) => {
  res.json({
    weather: true,
    transit: true,
    traffic: !!process.env.TOMTOM_API_KEY,
  });
});

export default router;

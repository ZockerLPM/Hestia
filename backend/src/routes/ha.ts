import { Router } from 'express';
import { auth } from '../middleware/auth';

const router = Router();
router.use(auth);

// Home-Assistant-Proxy. Token bleibt server-seitig, Frontend bekommt es nie.
// Bei fehlender Konfiguration antworten wir mit 503 statt zu crashen,
// damit Hestia ohne HA-Setup weiter läuft.
function haConfig(): { url: string; token: string } | null {
  const url = process.env.HOMEASSISTANT_URL?.replace(/\/+$/, '');
  const token = process.env.HOMEASSISTANT_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

async function haFetch(path: string, init?: RequestInit) {
  const cfg = haConfig();
  if (!cfg) throw new Error('HA_NOT_CONFIGURED');
  const res = await fetch(`${cfg.url}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`HA returned ${res.status}: ${await res.text()}`);
  return res.json();
}

// Health-Check ob HA überhaupt konfiguriert + erreichbar ist.
router.get('/health', async (_req, res) => {
  const cfg = haConfig();
  if (!cfg) return res.json({ configured: false });
  try {
    const data = await haFetch('/api/');
    res.json({ configured: true, ok: true, version: (data as { message?: string }).message });
  } catch (e) {
    res.json({ configured: true, ok: false, error: e instanceof Error ? e.message : 'unknown' });
  }
});

// State eines oder mehrerer Entities. Frontend POSTet die gewünschten
// entity_ids — wir liefern nur diese zurück (kein Dump aller HA-Entities).
router.post('/states', async (req, res) => {
  const ids = req.body?.entityIds;
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) {
    return res.status(400).json({ error: 'entityIds muss ein String-Array sein' });
  }
  if (ids.length === 0) return res.json([]);
  try {
    const all = (await haFetch('/api/states')) as Array<{
      entity_id: string;
      state: string;
      attributes: Record<string, unknown>;
      last_changed: string;
    }>;
    const wanted = new Set(ids);
    res.json(all.filter((e) => wanted.has(e.entity_id)));
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : 'HA unreachable' });
  }
});

// Service-Call ausführen — z.B. light.turn_on, switch.toggle, scene.turn_on.
// Whitelisting der Domains, damit nichts Sicherheitskritisches möglich ist
// (kein z.B. shell_command, python_script).
const ALLOWED_DOMAINS = new Set([
  'light', 'switch', 'scene', 'script', 'media_player',
  'climate', 'cover', 'fan', 'vacuum', 'lock', 'input_boolean',
  'input_select', 'input_number',
]);

router.post('/service/:domain/:service', async (req, res) => {
  const { domain, service } = req.params;
  if (!ALLOWED_DOMAINS.has(domain)) {
    return res.status(403).json({ error: `Domain '${domain}' nicht erlaubt` });
  }
  try {
    const data = await haFetch(`/api/services/${domain}/${service}`, {
      method: 'POST',
      body: JSON.stringify(req.body ?? {}),
    });
    res.json(data);
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : 'HA unreachable' });
  }
});

// Auto-Discovery: alle HA-Entities listen — nützlich für den WallConfigEditor,
// damit der User aus einer Liste wählen kann statt entity_ids zu tippen.
router.get('/entities', async (_req, res) => {
  try {
    const all = (await haFetch('/api/states')) as Array<{
      entity_id: string;
      state: string;
      attributes: Record<string, unknown>;
    }>;
    res.json(
      all.map((e) => ({
        entityId: e.entity_id,
        friendlyName: (e.attributes.friendly_name as string) ?? e.entity_id,
        domain: e.entity_id.split('.')[0],
        unit: (e.attributes.unit_of_measurement as string) ?? null,
        deviceClass: (e.attributes.device_class as string) ?? null,
      })),
    );
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : 'HA unreachable' });
  }
});

export default router;

import { Thermometer } from 'lucide-react';
import type { HAEntityConfig } from '../../../wall/types';
import type { HAState } from '../../../api/ha';
import WallCard from './WallCard';

interface Props {
  entities: HAEntityConfig[];
  states: HAState[];
  wide?: boolean;
}

/** Formatiert State + Unit so, wie es auf der Wand erscheinen soll. */
function formatValue(state: HAState | undefined): string {
  if (!state) return '—';
  if (state.state === 'unavailable' || state.state === 'unknown') return '–';
  const unit = state.attributes.unit_of_measurement;

  // Numerische Werte: auf eine Nachkommastelle runden, wenn Float
  const num = Number(state.state);
  if (!Number.isNaN(num) && state.state.trim() !== '') {
    const rounded = Number.isInteger(num) ? num : num.toFixed(1);
    return unit ? `${rounded} ${unit}` : String(rounded);
  }

  // Binäre Sensoren: lesbarer machen
  if (state.state === 'on') return 'an';
  if (state.state === 'off') return 'aus';
  if (state.state === 'open') return 'offen';
  if (state.state === 'closed') return 'zu';
  if (state.state === 'home') return 'zuhause';
  if (state.state === 'not_home') return 'unterwegs';

  return state.state;
}

/** Farbe pro Device-Class für visuelles Anchoring */
function colorForState(state: HAState | undefined): string {
  if (!state) return '#6b7280';
  const dc = state.attributes.device_class;
  if (dc === 'temperature') return '#f59e0b';
  if (dc === 'humidity')    return '#3b82f6';
  if (dc === 'co2' || dc === 'carbon_dioxide') return '#10b981';
  if (dc === 'power' || dc === 'energy') return '#eab308';
  if (dc === 'door' || dc === 'window') {
    return state.state === 'on' || state.state === 'open' ? '#ef4444' : '#22c55e';
  }
  if (dc === 'motion' || dc === 'occupancy') {
    return state.state === 'on' ? '#22c55e' : '#6b7280';
  }
  return '#6b7280';
}

export default function HASensorsCard({ entities, states, wide }: Props) {
  if (entities.length === 0) return null;

  // Nach group + entityId stabil sortieren
  const grouped = new Map<string, HAEntityConfig[]>();
  for (const e of entities) {
    const key = e.group ?? '';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(e);
  }

  const stateMap = new Map(states.map((s) => [s.entity_id, s]));

  return (
    <WallCard icon={Thermometer} title="Sensoren" color="#3b82f6" wide={wide}>
      <div className="space-y-3">
        {[...grouped.entries()].map(([group, ents]) => (
          <div key={group}>
            {group && (
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">
                {group}
              </p>
            )}
            <ul className="space-y-1">
              {ents.map((e) => {
                const s = stateMap.get(e.entityId);
                const label = e.label ?? s?.attributes.friendly_name ?? e.entityId;
                return (
                  <li
                    key={e.entityId}
                    className="flex items-center justify-between gap-2 px-2 py-1"
                  >
                    <span className="text-sm text-gray-300 truncate">{label}</span>
                    <span
                      className="text-sm xl:text-base font-semibold tabular-nums shrink-0"
                      style={{ color: colorForState(s) }}
                    >
                      {formatValue(s)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </WallCard>
  );
}

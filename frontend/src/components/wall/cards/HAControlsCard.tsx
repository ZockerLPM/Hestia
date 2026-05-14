import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lightbulb } from 'lucide-react';
import toast from 'react-hot-toast';
import type { HAEntityConfig } from '../../../wall/types';
import { callHAService, type HAState } from '../../../api/ha';
import WallCard from './WallCard';

interface Props {
  entities: HAEntityConfig[];
  states: HAState[];
  wide?: boolean;
}

/** Welcher Service-Aufruf für welche Entity-Domain bei einem Toggle-Click? */
function toggleAction(entityId: string): { domain: string; service: string } | null {
  const domain = entityId.split('.')[0];
  if (domain === 'light' || domain === 'switch' || domain === 'fan' || domain === 'input_boolean') {
    return { domain, service: 'toggle' };
  }
  if (domain === 'scene' || domain === 'script') {
    return { domain, service: 'turn_on' };
  }
  if (domain === 'cover') {
    // Cover hat kein toggle — turn_on/off als Workaround, je nach State.
    // Hier vereinfacht: open. Für 'close' braucht's eine zweite Action-Karte.
    return { domain: 'cover', service: 'toggle' };
  }
  return null;
}

export default function HAControlsCard({ entities, states, wide }: Props) {
  if (entities.length === 0) return null;
  const qc = useQueryClient();
  const stateMap = new Map(states.map((s) => [s.entity_id, s]));

  const trigger = useMutation({
    mutationFn: async ({ entityId }: { entityId: string }) => {
      const action = toggleAction(entityId);
      if (!action) throw new Error('Nicht steuerbar: ' + entityId);
      await callHAService(action.domain, action.service, { entity_id: entityId });
    },
    onSuccess: () => {
      // Nach kurzer Verzögerung neuen State holen (HA braucht ggf. einen
      // Moment, bis sich der State propagiert).
      setTimeout(() => qc.invalidateQueries({ queryKey: ['ha-states'] }), 300);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'HA-Aufruf fehlgeschlagen'),
  });

  // Nach group + entityId gruppieren
  const grouped = new Map<string, HAEntityConfig[]>();
  for (const e of entities) {
    const key = e.group ?? '';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(e);
  }

  return (
    <WallCard icon={Lightbulb} title="Steuerung" color="#eab308" wide={wide}>
      <div className="space-y-3">
        {[...grouped.entries()].map(([group, ents]) => (
          <div key={group}>
            {group && (
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">
                {group}
              </p>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {ents.map((e) => {
                const s = stateMap.get(e.entityId);
                const isOn = s?.state === 'on';
                const label = e.label ?? s?.attributes.friendly_name ?? e.entityId;
                return (
                  <button
                    key={e.entityId}
                    onClick={() => trigger.mutate({ entityId: e.entityId })}
                    disabled={trigger.isPending}
                    className={`px-2.5 py-2 rounded-lg text-left transition-colors text-sm flex items-center gap-2 ${
                      isOn
                        ? 'bg-amber-500/20 border border-amber-500/50 text-amber-200'
                        : 'bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${isOn ? 'bg-amber-400' : 'bg-gray-600'}`}
                    />
                    <span className="flex-1 truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </WallCard>
  );
}

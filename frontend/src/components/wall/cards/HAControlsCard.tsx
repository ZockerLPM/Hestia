import { useState, useEffect } from 'react';
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

/** HA-Feature-Bits aus light.supported_color_modes / supported_features. */
function supportsBrightness(state: HAState | undefined): boolean {
  if (!state) return false;
  const modes = state.attributes.supported_color_modes as string[] | undefined;
  if (modes && modes.length > 0) {
    // brightness / color_temp / rgb / etc. — alle erlauben Helligkeit
    return modes.some((m) => m !== 'onoff' && m !== 'unknown');
  }
  // Fallback: aktuelle Helligkeit vorhanden
  return state.attributes.brightness !== undefined;
}

/** Welcher Service für welche Domain bei Toggle? */
function toggleAction(entityId: string): { domain: string; service: string } | null {
  const domain = entityId.split('.')[0];
  if (domain === 'light' || domain === 'switch' || domain === 'fan' || domain === 'input_boolean') {
    return { domain, service: 'toggle' };
  }
  if (domain === 'scene' || domain === 'script') {
    return { domain, service: 'turn_on' };
  }
  if (domain === 'cover') return { domain: 'cover', service: 'toggle' };
  return null;
}

interface ControlRowProps {
  entityConfig: HAEntityConfig;
  state: HAState | undefined;
  onToggle: () => void;
  onLightBrightness: (brightness: number) => void;
  onVolumeChange: (volumeLevel: number) => void;
  disabled: boolean;
}

function ControlRow({ entityConfig, state, onToggle, onLightBrightness, onVolumeChange, disabled }: ControlRowProps) {
  const domain = entityConfig.entityId.split('.')[0];
  const isOn = state?.state === 'on' || state?.state === 'playing';
  const label = entityConfig.label ?? (state?.attributes.friendly_name as string | undefined) ?? entityConfig.entityId;

  // Brightness-Slider für Lichter (0–255 in HA → 0–100% in UI).
  // Lokaler State für Live-Drag, Service-Call erst onChange-End.
  const haBrightness = (state?.attributes.brightness as number | undefined) ?? 0;
  const [draftBrightness, setDraftBrightness] = useState<number | null>(null);
  useEffect(() => { setDraftBrightness(null); }, [haBrightness]);
  const displayBrightness = draftBrightness ?? haBrightness;
  const brightnessPercent = Math.round((displayBrightness / 255) * 100);

  // Volume-Slider für Media-Player (0.0–1.0 in HA → 0–100% in UI).
  const haVolume = (state?.attributes.volume_level as number | undefined) ?? 0;
  const [draftVolume, setDraftVolume] = useState<number | null>(null);
  useEffect(() => { setDraftVolume(null); }, [haVolume]);
  const displayVolume = draftVolume ?? haVolume;
  const volumePercent = Math.round(displayVolume * 100);

  const showBrightness = domain === 'light' && isOn && supportsBrightness(state);
  const showVolume = domain === 'media_player' && state?.state !== 'off' && state?.state !== 'unavailable';

  return (
    <div className={`px-2.5 py-2 rounded-lg border transition-colors ${
      isOn
        ? 'bg-amber-500/20 border-amber-500/50'
        : 'bg-gray-800 border-gray-700'
    }`}>
      <button
        onClick={onToggle}
        disabled={disabled}
        className="w-full flex items-center gap-2 text-left text-sm"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${isOn ? 'bg-amber-400' : 'bg-gray-600'}`} />
        <span className={`flex-1 truncate ${isOn ? 'text-amber-200' : 'text-gray-300'}`}>{label}</span>
        {showBrightness && (
          <span className="text-xs text-amber-300/70 tabular-nums shrink-0">{brightnessPercent}%</span>
        )}
        {showVolume && (
          <span className="text-xs text-gray-300 tabular-nums shrink-0">{volumePercent}%</span>
        )}
      </button>

      {showBrightness && (
        <input
          type="range"
          min={1}
          max={255}
          step={1}
          value={displayBrightness}
          onChange={(e) => setDraftBrightness(Number(e.target.value))}
          onPointerUp={() => {
            if (draftBrightness !== null) onLightBrightness(draftBrightness);
          }}
          onTouchEnd={() => {
            if (draftBrightness !== null) onLightBrightness(draftBrightness);
          }}
          disabled={disabled}
          className="w-full mt-2 accent-amber-400 h-2"
        />
      )}

      {showVolume && (
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={displayVolume}
          onChange={(e) => setDraftVolume(Number(e.target.value))}
          onPointerUp={() => {
            if (draftVolume !== null) onVolumeChange(draftVolume);
          }}
          onTouchEnd={() => {
            if (draftVolume !== null) onVolumeChange(draftVolume);
          }}
          disabled={disabled}
          className="w-full mt-2 accent-blue-400 h-2"
        />
      )}
    </div>
  );
}

export default function HAControlsCard({ entities, states, wide }: Props) {
  if (entities.length === 0) return null;
  const qc = useQueryClient();
  const stateMap = new Map(states.map((s) => [s.entity_id, s]));

  // Optimistic Cache-Patch: setzt den State sofort lokal, damit der
  // User Feedback bekommt. WS-Push korrigiert den echten Wert wenn HA
  // bestätigt hat. Kein HTTP-Polling-Race mehr.
  //
  // setQueriesData matched ALLE Query-Keys mit Prefix ['ha-states'] —
  // useWallData nutzt einen Key, der von den entityIds abhängt, den wir
  // hier nicht zwingend exakt rekonstruieren wollen. Prefix-Match ist
  // robuster.
  const patchState = (entityId: string, patch: { state?: string; attributes?: Record<string, unknown> }) => {
    qc.setQueriesData<HAState[]>({ queryKey: ['ha-states'] }, (prev) => {
      if (!prev) return prev;
      const idx = prev.findIndex((s) => s.entity_id === entityId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        attributes: { ...next[idx].attributes, ...(patch.attributes ?? {}) },
      };
      return next;
    });
  };

  const trigger = useMutation({
    mutationFn: async ({
      domain, service, serviceData,
    }: { domain: string; service: string; serviceData: Record<string, unknown> }) => {
      await callHAService(domain, service, serviceData);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'HA-Aufruf fehlgeschlagen'),
    // Kein onSuccess-invalidate! Der WebSocket-Push aus dem Backend setzt
    // den echten State im Cache. Wenn WS down ist, kommt der State beim
    // nächsten 60s-Polling.
  });

  const handleToggle = (entityId: string) => {
    const action = toggleAction(entityId);
    if (!action) {
      toast.error('Nicht steuerbar: ' + entityId);
      return;
    }
    // Optimistic: state sofort flippen. WS-Push korrigiert wenn nötig.
    const current = stateMap.get(entityId);
    if (current && (action.service === 'toggle')) {
      patchState(entityId, { state: current.state === 'on' ? 'off' : 'on' });
    } else if (current && (action.service === 'turn_on')) {
      patchState(entityId, { state: 'on' });
    }
    trigger.mutate({ ...action, serviceData: { entity_id: entityId } });
  };

  const handleBrightness = (entityId: string, brightness: number) => {
    // Optimistic: brightness im Attributes-Patch setzen
    patchState(entityId, { state: 'on', attributes: { brightness } });
    trigger.mutate({
      domain: 'light',
      service: 'turn_on',
      serviceData: { entity_id: entityId, brightness },
    });
  };

  const handleVolume = (entityId: string, volumeLevel: number) => {
    patchState(entityId, { attributes: { volume_level: volumeLevel } });
    trigger.mutate({
      domain: 'media_player',
      service: 'volume_set',
      serviceData: { entity_id: entityId, volume_level: volumeLevel },
    });
  };

  // Nach group gruppieren
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {ents.map((e) => (
                <ControlRow
                  key={e.entityId}
                  entityConfig={e}
                  state={stateMap.get(e.entityId)}
                  disabled={trigger.isPending}
                  onToggle={() => handleToggle(e.entityId)}
                  onLightBrightness={(b) => handleBrightness(e.entityId, b)}
                  onVolumeChange={(v) => handleVolume(e.entityId, v)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </WallCard>
  );
}

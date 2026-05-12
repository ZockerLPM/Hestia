import { useState, useRef } from 'react';
import { X, GripVertical, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { type WallCardConfig, type WallConfigShape, CARD_META, DEFAULT_CONFIG } from '../../wall/types';

interface Props {
  config: WallConfigShape;
  onSave: (cfg: WallConfigShape) => void;
  onClose: () => void;
}

const BG_PRESETS = [
  { label: 'Schwarz',     value: '#030712' },
  { label: 'Dunkelblau', value: '#0a0f1e' },
  { label: 'Dunkelgrün', value: '#051a0a' },
  { label: 'Dunkelrot',  value: '#1a0505' },
  { label: 'Dunkelviolett', value: '#0f051a' },
];

const TIMEOUT_OPTIONS = [
  { label: 'Aus',    ms: 0 },
  { label: '1 min',  ms: 60_000 },
  { label: '2 min',  ms: 2 * 60_000 },
  { label: '5 min',  ms: 5 * 60_000 },
  { label: '10 min', ms: 10 * 60_000 },
  { label: '30 min', ms: 30 * 60_000 },
];

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${value ? 'bg-primary-500' : 'bg-gray-700'}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          value ? 'translate-x-6' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{children}</p>
  );
}

function SelectRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-gray-300">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="shrink-0 bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {TIMEOUT_OPTIONS.map((o) => (
          <option key={o.ms} value={o.ms}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export default function WallConfigEditor({ config, onSave, onClose }: Props) {
  const [cards, setCards] = useState<WallCardConfig[]>(
    [...config.cards].sort((a, b) => a.order - b.order),
  );
  const [bgColor, setBgColor]         = useState(config.bgColor       ?? DEFAULT_CONFIG.bgColor!);
  const [showSeconds, setShowSeconds] = useState(config.showSeconds   ?? false);
  const [screensaverMs, setScreensaverMs] = useState(config.screensaverMs ?? DEFAULT_CONFIG.screensaverMs!);
  const [cameraSleepMs, setCameraSleepMs] = useState(config.cameraSleepMs ?? DEFAULT_CONFIG.cameraSleepMs!);

  const dragIdx = useRef<number | null>(null);

  // ── Card list mutations ─────────────────────────────────────────────────────

  const toggleEnabled = (id: string) =>
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));

  const toggleWide = (id: string) =>
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, wide: !c.wide } : c)));

  const onDragStart = (i: number) => { dragIdx.current = i; };

  const onDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === i) return;
    setCards((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx.current!, 1);
      next.splice(i, 0, moved);
      dragIdx.current = i;
      return next.map((c, idx) => ({ ...c, order: idx }));
    });
  };

  const onDragEnd = () => { dragIdx.current = null; };

  // ── Actions ─────────────────────────────────────────────────────────────────

  const reset = () => {
    setCards([...DEFAULT_CONFIG.cards]);
    setBgColor(DEFAULT_CONFIG.bgColor!);
    setShowSeconds(false);
    setScreensaverMs(DEFAULT_CONFIG.screensaverMs!);
    setCameraSleepMs(DEFAULT_CONFIG.cameraSleepMs!);
  };

  const save = () =>
    onSave({ cards, bgColor, showSeconds, screensaverMs, cameraSleepMs });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <h2 className="font-bold text-lg text-gray-100">Dashboard anpassen</h2>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="text-gray-400 hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6 overflow-y-auto">

          {/* ── Karten ── */}
          <div>
            <SectionLabel>Karten — Reihenfolge &amp; Sichtbarkeit</SectionLabel>
            <ul className="space-y-1.5">
              {cards.map((card, i) => {
                const meta = CARD_META[card.id as keyof typeof CARD_META]
                  ?? { label: card.id, emoji: '▪' };
                return (
                  <li
                    key={card.id}
                    draggable
                    onDragStart={() => onDragStart(i)}
                    onDragOver={(e) => onDragOver(e, i)}
                    onDragEnd={onDragEnd}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors select-none cursor-grab active:cursor-grabbing ${
                      card.enabled
                        ? 'bg-gray-800 border-gray-700'
                        : 'bg-gray-900 border-gray-800 opacity-50'
                    }`}
                  >
                    <GripVertical className="w-4 h-4 text-gray-600 shrink-0" />
                    <span className="text-lg shrink-0">{meta.emoji}</span>
                    <span className={`flex-1 text-sm truncate ${card.enabled ? 'text-gray-200' : 'text-gray-500'}`}>
                      {meta.label}
                    </span>
                    <button
                      onClick={() => toggleWide(card.id)}
                      title={card.wide ? '2-spaltig — klicken für 1-spaltig' : '1-spaltig — klicken für 2-spaltig'}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                        card.wide
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      2×
                    </button>
                    <button
                      onClick={() => toggleEnabled(card.id)}
                      aria-label={card.enabled ? 'Ausblenden' : 'Einblenden'}
                      className="p-1 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
                    >
                      {card.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ── Darstellung ── */}
          <div>
            <SectionLabel>Darstellung</SectionLabel>
            <div className="space-y-4">
              {/* Hintergrundfarbe */}
              <div>
                <p className="text-sm text-gray-300 mb-2">Hintergrundfarbe</p>
                <div className="flex flex-wrap gap-2 items-center">
                  {BG_PRESETS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setBgColor(c.value)}
                      title={c.label}
                      aria-label={c.label}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        bgColor === c.value ? 'border-white scale-110' : 'border-gray-700 hover:border-gray-500'
                      }`}
                      style={{ backgroundColor: c.value }}
                    />
                  ))}
                  <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="w-8 h-8 rounded-full border-2 border-gray-700 cursor-pointer bg-transparent"
                    />
                    Eigene
                  </label>
                </div>
              </div>

              {/* Sekunden */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-300">Sekunden anzeigen</p>
                  <p className="text-xs text-gray-500 mt-0.5">Uhr zeigt HH:MM:SS statt HH:MM</p>
                </div>
                <ToggleSwitch value={showSeconds} onChange={setShowSeconds} />
              </div>
            </div>
          </div>

          {/* ── Energiesparen ── */}
          <div>
            <SectionLabel>Energiesparen &amp; Datenschutz</SectionLabel>
            <div className="space-y-4">
              <SelectRow
                label="Bildschirmschoner"
                description="Bildschirm wird nach Inaktivität schwarz"
                value={screensaverMs}
                onChange={setScreensaverMs}
              />
              <SelectRow
                label="Kamera pausieren"
                description="Kamerastream wird gestoppt — durch Bewegung wieder aktiviert"
                value={cameraSleepMs}
                onChange={setCameraSleepMs}
              />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 shrink-0">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> Zurücksetzen
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={save}
              className="px-5 py-2 text-sm rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold transition-colors"
            >
              Speichern
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

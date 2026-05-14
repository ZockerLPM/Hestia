export type WallCardId =
  | 'tasks'
  | 'events'
  | 'meals'
  | 'shopping'
  | 'expiring'
  | 'upcoming-tasks'
  | 'budget'
  | 'countdown'
  | 'ha-sensors'
  | 'ha-controls';

/** Eine in der Wand sichtbare HA-Entity. */
export interface HAEntityConfig {
  /** entity_id aus HA, z.B. "sensor.wohnzimmer_temperatur" oder "light.flur" */
  entityId: string;
  /** Anzeigename in der Wand (überschreibt friendly_name aus HA) */
  label?: string;
  /** Lucide-Icon-Name als String (z.B. "Thermometer", "Lightbulb") */
  icon?: string;
  /** Wo soll sie auftauchen? */
  card: 'ha-sensors' | 'ha-controls';
  /** Anzeigegruppe innerhalb der Karte, z.B. "Wohnzimmer" */
  group?: string;
}

export interface WallCardConfig {
  id: WallCardId;
  enabled: boolean;
  order: number;
  wide?: boolean;
}

export interface WallConfigShape {
  cards: WallCardConfig[];
  bgColor?: string;
  showSeconds?: boolean;
  /** ms without motion before screen dims to black; 0 = off */
  screensaverMs?: number;
  /** ms without motion before camera stream is stopped; 0 = off */
  cameraSleepMs?: number;
  /** User-IDs, die im manuellen Wand-User-Switcher übersprungen werden
   *  (z.B. ein Kiosk-Account ohne Profil). Default: leer = alle dabei. */
  excludedUserIds?: string[];
  /** HA-Entities, die auf der Wand sichtbar/steuerbar sein sollen.
   *  Leer = HA-Karten zeigen "Nichts konfiguriert". */
  haEntities?: HAEntityConfig[];
}

export interface WallCardMeta {
  label: string;
  emoji: string;
}

export const CARD_META: Record<WallCardId, WallCardMeta> = {
  tasks:            { label: 'Aufgaben heute',        emoji: '✅' },
  events:           { label: 'Termine heute',          emoji: '📅' },
  meals:            { label: 'Mahlzeiten heute',       emoji: '🍽️' },
  shopping:         { label: 'Einkaufsliste',          emoji: '🛒' },
  expiring:         { label: 'Bald ablaufend',         emoji: '⚠️' },
  'upcoming-tasks': { label: 'Kommende Aufgaben',      emoji: '📋' },
  budget:           { label: 'Budget diesen Monat',    emoji: '💰' },
  countdown:        { label: 'Countdowns',             emoji: '⏱️' },
  'ha-sensors':     { label: 'Smart Home — Sensoren',  emoji: '🌡️' },
  'ha-controls':    { label: 'Smart Home — Steuerung', emoji: '💡' },
};

export const DEFAULT_CARDS: WallCardConfig[] = [
  { id: 'tasks',          enabled: true,  order: 0 },
  { id: 'events',         enabled: true,  order: 1 },
  { id: 'meals',          enabled: true,  order: 2 },
  { id: 'shopping',       enabled: true,  order: 3, wide: true },
  { id: 'expiring',       enabled: true,  order: 4 },
  { id: 'upcoming-tasks', enabled: true,  order: 5 },
  { id: 'budget',         enabled: true,  order: 6 },
  { id: 'countdown',      enabled: true,  order: 7 },
  { id: 'ha-sensors',     enabled: false, order: 8 },
  { id: 'ha-controls',    enabled: false, order: 9 },
];

export const DEFAULT_CONFIG: WallConfigShape = {
  cards: DEFAULT_CARDS,
  bgColor: '#030712',
  showSeconds: false,
  screensaverMs: 5 * 60 * 1000,  // 5 min
  cameraSleepMs: 2 * 60 * 1000,  // 2 min
};

export type WallCardId =
  | 'tasks'
  | 'events'
  | 'meals'
  | 'shopping'
  | 'expiring'
  | 'upcoming-tasks'
  | 'budget'
  | 'countdown';

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
];

export const DEFAULT_CONFIG: WallConfigShape = {
  cards: DEFAULT_CARDS,
  bgColor: '#030712',
  showSeconds: false,
  screensaverMs: 5 * 60 * 1000,  // 5 min
  cameraSleepMs: 2 * 60 * 1000,  // 2 min
};

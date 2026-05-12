# Frontend-Referenz

React-App in `frontend/src/`. Vollständige Übersicht aller Pages,
Komponenten, Hooks, Stores und API-Helfer.

> **Tech-Konventionen**:
> - Pages liegen in `pages/`, jede entspricht einer Route in `App.tsx`
> - Komponenten in `components/`, UI-Bausteine in `components/ui/`
> - Server-State über **TanStack Query**, Client-State über **Zustand**
> - Mutations rufen `queryClient.invalidateQueries` auf, um zu refetchen
> - Realtime-Updates über Socket.io invalidieren dieselben Queries

---

## Entry-Points

### `main.tsx`

```typescript
ReactDOM.createRoot(...).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster position="top-right" toastOptions={…} />
    </QueryClientProvider>
  </StrictMode>
);
```

- QueryClient: `staleTime: 30s`, `retry: 1`
- `<Toaster>` (react-hot-toast) global gemountet — alle Mutationen können
  ohne Provider toasten

### `App.tsx`

```typescript
<BrowserRouter>
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/wall" element={<RequireAuth><Wall /></RequireAuth>} />
    <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
      <Route index element={<Dashboard />} />
      <Route path="finance" element={<Finance />} />
      …
    </Route>
  </Routes>
</BrowserRouter>
```

`RequireAuth` prüft `useAuthStore().token` — bei `null` → Redirect auf
`/login`. Beim App-Start macht `App` einen `GET /auth/me`, um den User
hinter dem persistierten Token wiederherzustellen.

### `sw.ts` (Service Worker, custom, injectManifest)

Generiert über `vite-plugin-pwa`. Drei Workbox-Routes:

1. **NavigationRoute** mit `NetworkFirst` (3s Timeout) — App rendert
   auch offline.
2. **`/api/*` Route** mit `NetworkFirst` (5s Timeout, 200 Entries, 24h)
3. **Open Food Facts** mit `CacheFirst` (500 Entries, 30 Tage)

Außerdem Push-Handler:

```typescript
self.addEventListener('push', (event) => { … showNotification(…) });
self.addEventListener('notificationclick', (event) => {
  // Findet existierendes Fenster, fokussiert + navigiert,
  // oder öffnet neues Fenster mit payload.url
});
```

---

## API-Layer (`src/api/`)

### `client.ts`

```typescript
export const api = axios.create({ baseURL: '/api' });
```

**Request-Interceptor**: setzt `Authorization: Bearer ${localStorage.getItem('hestia-token')}`.

**Response-Interceptor**:
- `401` → `localStorage.removeItem('hestia-token')` + Redirect `/login`
- `ERR_NETWORK` auf Mutation (`POST/PUT/DELETE/PATCH`) ohne `silent`-Flag:
  Request wird in `offlineQueue` gelegt, Toast "Offline — wird gesendet
  sobald online", Antwort fake `{data: null, status: 202}` damit Mutation
  ihren `onSuccess` ausführt
- Sonst: Toast mit `error.response.data.error` oder generischer Fallback-Message

```typescript
declare module 'axios' {
  export interface AxiosRequestConfig {
    silent?: boolean;       // Unterdrückt Error-Toast und Queue
    skipQueue?: boolean;    // Nur Toast unterdrücken, aber kein Queue
  }
}
```

### `socket.ts`

```typescript
connectSocket(token: string): Socket
disconnectSocket(): void
getSocket(): Socket | null
```

Single-Connection-Manager: ein globaler `Socket`, verbindet sich auf
`/socket.io` (über Vite-Proxy oder Caddy), joint `household` beim Connect.

### `offlineQueue.ts`

IndexedDB-basiert via `idb-keyval`. Pro Request:
```typescript
{ id: crypto.randomUUID(), method, url, data, createdAt: Date.now() }
```

```typescript
enqueue(req): Promise<number>      // gibt neue Queue-Größe zurück
queueSize(): Promise<number>
flushQueue(): Promise<{sent, failed}>
```

`flushQueue` spielt FIFO ab. 4xx-Antworten gelten als endgültig
gescheitert (kein Retry). Andere Fehler (5xx, Netz) bleiben in der Queue.

### `push.ts`

```typescript
isPushSupported(): boolean
getPushStatus(): Promise<{ supported, enabled, subscribed, publicKey? }>
subscribePush(): Promise<void>
unsubscribePush(): Promise<void>
```

`subscribePush` fragt `Notification.requestPermission()`, dann
`pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`,
schickt Subscription an Backend.

### `types.ts`

TypeScript-Interfaces, die 1:1 zu den Backend-Antworten passen. Bei
Schema-Änderungen müssen beide Seiten synchron gehalten werden — kein
Code-Gen aktuell.

Hauptexporte: `User`, `UserProfile`, `FaceDescriptorEntry`, `WorkShift`,
`FinanceCategory`, `FinanceEntry`, `RecurringFinance`, `Budget`,
`ShoppingList`, `ShoppingItem`, `PantryItem`, `Recipe`, `RecipeIngredient`,
`MealPlan`, `Task`, `TaskTemplate`, `CalendarEvent`, `FinanceSummary`.

### `external.ts`

Wrapper für die Server-Proxies in `/api/external`. Alle Calls mit
`{ silent: true }` — Fehler werden nicht als Toast geworfen (Wand-Modus
soll bei Provider-Ausfall still bleiben).

```typescript
fetchWeather(lat, lng): Promise<WeatherData>
fetchTransit(from, to): Promise<{ connections }>
fetchTraffic(fromLat, fromLng, toLat, toLng): Promise<TrafficData>
fetchProviderStatus(): Promise<{ weather, transit, traffic }>
weatherCodeIcon(code: number): string   // Open-Meteo-Code → Emoji
```

---

## Stores

### `store/authStore.ts` (Zustand)

```typescript
interface AuthStore {
  user: User | null;
  token: string | null;       // persistiert in localStorage
  setAuth(user, token): void;
  logout(): void;
}
```

### `store/themeStore.ts` (Zustand)

```typescript
type Mode = 'light' | 'dark' | 'system';
{ mode, setMode(m), applyMode() }
```

- `mode` persistiert in `localStorage` unter `hestia-theme`
- `applyMode()` setzt `html.classList.dark`
- `matchMedia('(prefers-color-scheme: dark)').addEventListener` reagiert
  automatisch auf OS-Wechsel wenn `mode === 'system'`

---

## Hooks

### `hooks/useRealtimeSync.ts`

Wird in `Layout.tsx` aufgerufen (also nur für eingeloggte User aktiv).
Connectet Socket, mappt 12 Events auf Query-Invalidierungen:

```typescript
const EVENT_INVALIDATIONS = {
  'shopping:item-added':    [['shopping-items'], ['shopping-lists']],
  'tasks:created':          [['tasks']],
  'pantry:changed':         [['pantry-items'], ['pantry-low-stock'], ['pantry-expiring']],
  …
};
```

Bei Unmount: Listener entfernen. Disconnect passiert nur bei Logout
(im zweiten useEffect, prüft Token).

### `hooks/useOfflineStatus.ts`

```typescript
const { offline, pending } = useOfflineStatus();
```

- `offline = !navigator.onLine`
- `pending` = aktuelle Queue-Größe (alle 4s aktualisiert)
- Bei `online`-Event: `flushQueue()` + Toast mit Erfolgs-Count

Wird in `Layout.tsx` für das Banner verwendet.

### `hooks/useFaceRecognition.ts`

Kapselt die Webcam + face-api.js-Erkennung für den Wand-Modus. CPU-
schonend dimensioniert für RPi 4 als Wand-Display.

```typescript
const { videoRef, recognizedUser, ready, error, forget, descriptorsLoaded } =
  useFaceRecognition({
    enabled,
    intervalMs,       // Default 2000 ms
    matchDistance,    // Default 0.55
    inactivityMs,     // Default 30000 ms — CPU-Pause nach Erkennung
    autoLogoutMs,     // Default 0 (aus) — nach X ms ohne Gesicht: forget()
    onMotionWakeup,   // Default false — Socket.io 'motion-detected' → detect()
  });
```

Defaults:
- `intervalMs: 2000` — alle 2 s ein Frame, sonst pause
- `matchDistance: 0.55` — Euclidean-Threshold (höher = laxer); 0.6 ist
  face-api.js default
- `inactivityMs: 30000` — nach Erkennung 30 s pause, dann erst neu detect
- `autoLogoutMs: 45000` (in Wall.tsx konfiguriert) — wenn 45 s kein Gesicht
  nach letzter Erkennung → `recognizedUser` wird auf `null` zurückgesetzt
- `onMotionWakeup: true` (in Wall.tsx) — Socket-Event `motion-detected` weckt
  die Detection auf, auch wenn der PIR-Sensor den RPi sonst schlafen lässt

Ablauf beim Mount (wenn `enabled` und Descriptors vorhanden):
1. `@vladmandic/face-api` lazy importieren (zieht 1.3 MB Chunk)
2. Modelle von `/models/` laden (cached vom Browser)
3. `LabeledFaceDescriptors` aus DB-Einträgen bauen, gruppiert nach User
4. `FaceMatcher` mit `matchDistance` instanzieren
5. `getUserMedia({video: facingMode:'user', 320×240})` — kleine Auflösung
   spart CPU
6. `setInterval(detect, intervalMs)` — alle N ms einen Frame analysieren

`detect()`:
- Skip wenn `Date.now() - lastSeen < inactivityMs` (CPU-Pause)
- `detectSingleFace` mit `tinyFaceDetector` (190 KB), `inputSize: 224`,
  `scoreThreshold: 0.5`
- Wenn Treffer → `matcher.findBestMatch(descriptor)`
- Bei `label !== 'unknown'` → `setRecognizedUser(...)` + Timer reset
- Wenn niemand erkannt + Inactivity überschritten → `setRecognizedUser(null)`

`forget()` setzt manuell auf null (User-Button "generic anzeigen").

Cleanup beim Unmount: Interval clearen + alle Tracks stoppen.

### `hooks/usePwaUpdate.tsx`

```typescript
const { needRefresh, updateServiceWorker } = useRegisterSW({…});
```

Bei verfügbarem SW-Update zeigt einen persistenten Toast mit "Neu laden"-
Button, der `updateServiceWorker(true)` aufruft.

---

## Komponenten

### `components/Layout.tsx`

Wurzel-Layout für alle eingeloggten Routes. Aktiviert:
- `useRealtimeSync()`
- `usePwaUpdate()`
- `useOfflineStatus()` → Offline-Banner

Struktur:
- Desktop: `<Sidebar />` links + `<main>` rechts mit `<Outlet />`
- Mobile: Top-Bar (Hestia-Logo + Theme-Toggle + Avatar + Logout),
  `<BottomTabBar />` unten, Main scrollt mit `pb-20`

### `components/Sidebar.tsx`

Desktop-Only (`hidden lg:flex`). Nutzt `navItems.ts`. Footer mit User-Box,
Logout-Button, `<ThemeToggle />` (3-Mode-Variant).

### `components/BottomTabBar.tsx`

Mobile-Only. Bottom-Fixed mit `safe-area-inset-bottom`. Gleiche
`navItems.ts` wie Sidebar.

### `components/navItems.ts`

Geteilte Nav-Definition:
```typescript
export const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Start' },
  { to: '/finance', icon: Wallet, label: 'Finanzen' },
  { to: '/shopping', icon: ShoppingCart, label: 'Einkauf' },
  { to: '/pantry', icon: Package, label: 'Vorrat' },
  { to: '/recipes', icon: ChefHat, label: 'Rezepte' },
  { to: '/meal-plan', icon: Utensils, label: 'Plan' },
  { to: '/tasks', icon: CheckSquare, label: 'Aufgaben' },
  { to: '/calendar', icon: Calendar, label: 'Kalender' },
  { to: '/stats', icon: BarChart3, label: 'Statistik' },
] as const;
```

### `components/ProductAutocomplete.tsx`

Combobox mit Backend-Suggestions. Props:
```typescript
{
  value: string;
  onChange(value: string): void;
  onSelect?(s: ProductSuggestion): void;
  placeholder?, required?, autoFocus?, className?
}
```

- 150ms-Debounce auf Query
- KeyboardNav: ArrowUp/Down, Enter, Escape
- Click-Außerhalb schließt die Liste
- Bei `onSelect` wird der Vorschlag mit Unit/Category/Location/Barcode
  zurückgeliefert — der Caller entscheidet, was zu übernehmen ist

### `components/CameraScanner.tsx`

Vollbild-Modal mit `<video>`. Lazy-Import von `@zxing/browser`.
- Sucht Rückkamera (`/back|rear|environment/i`)
- Bei erkanntem Code: `onScan(code)` + `onClose()`
- Setzt sich selbst auf, wenn `open=true`; räumt bei `open=false`/Unmount
  Stream + Reader auf

### `components/PushToggle.tsx`

Auf Dashboard sichtbar. Zeigt drei Zustände:
1. Nicht unterstützt → rendert `null`
2. Server unkonfiguriert → grauer Hinweis "Push am Server nicht konfiguriert"
3. Sonst: Toggle-Button (subscribePush / unsubscribePush)

### `components/QuickAdd.tsx`

Dashboard-Widget mit Inline-Input für Einkaufslisten-Eintrag (nutzt
`ProductAutocomplete`) + Chips für Top-6-Aufgabenvorlagen.

### `components/ThemeToggle.tsx`

Zwei Varianten via `compact`-Prop:
- `compact={true}` (Mobile-Topbar): Einzel-Button cycelt Modi
- `compact={false}` (Sidebar): 3 Buttons (Sonne/Mond/Monitor)

### `components/WheelDatePicker.tsx`

Touch-freundlicher 3-Räder-Datepicker (Tag/Monat/Jahr) für MHD-Eingabe
auf dem Wandtablet. Pure CSS `scroll-snap` — keine externe Lib.

Props:
```typescript
{
  value: Date | null;
  onChange(date: Date | null): void;
  minYear?, maxYear?: number;     // Default: jetzt-1 bis jetzt+5
  allowNull?: boolean;             // Default true — "Kein MHD"-Toggle
}
```

Mechanik:
- Drei `<Wheel>`-Komponenten nebeneinander (Tag, Monat, Jahr)
- Jeder Wheel scrollt vertikal mit `snap-y snap-mandatory`
- Item-Höhe 40 px (`ITEM_H`); aktives Item ist das in der Mitte
- 80 ms Debounce nach Scrollende → `onPick(value)` mit dem gerasteten Wert
- Tap auf ein Item scrollt direkt dorthin
- Tag wird auf `daysInMonth(year, month)` geclampt — kein 31. Februar möglich
- Aktives Item ist fett, andere transparent + leicht skaliert
- Highlight-Band in der Mitte (visueller Rahmen für die Auswahl)

Eingesetzt in `WallPantryEntry` zum schnellen MHD-Setzen ohne Tastatur.

### `components/wall/PersonalPanel.tsx`

Wird angezeigt, sobald `useFaceRecognition` einen User identifiziert.
Linke Spalte der Wand (340 px breit) mit personalisierten Karten:

- **Avatar-Header** mit "Willkommen zurück, &lt;Name&gt;"
- **Wetter-Card** — aktuell + 2-Tages-Vorschau aus Open-Meteo
- **Pendel-Card** — abhängig von `commuteMode`:
  - `transit` → nächste ÖV-Verbindungen, Verspätung, Gleis, Umstiege
  - `driving` → Verkehrslage + Stau-Minuten + Distanz (nur mit TomTom-Key)
  - `biking`/`walking` → kein Provider-Call, Card wird ausgeblendet
- **Nächste-Schicht-Card** — kommende Schicht inkl. "in Xh Ymin" oder
  "Aktuell" wenn laufend

Wenn das Profil keine Standorte gesetzt hat und keine Schicht ansteht:
Hinweis-Card "Im Profil Pendel-Strecke eintragen".

Query-Intervalle (alle via TanStack-Query `refetchInterval`):
- Wetter: 15 min
- Transit: 1 min (Verbindungen ändern sich häufig)
- Traffic: 3 min
- Shifts: 5 min

### `components/wall/WallPantryEntry.tsx`

Vollbild-Modal zum schnellen Eintragen vieler Produkte in den Vorrat —
optimiert für Wandtablet-Bedienung. Wird vom Wand-Header geöffnet.

Drei Eingabequellen, alle landen in derselben **Sammlung**:
1. **USB-Scanner** — globaler Keylistener, Enter nach ≥4 Zeichen löst aus
2. **Kamera** — öffnet `CameraScanner` Vollbild
3. **Manuelle Eingabe** — Suchfeld mit `ProductSuggestion`-Vorschlägen, Enter erzeugt Eintrag
4. **Chip-Reihe "Eben eingekauft?"** — abgehakte Items der Default-Liste, 1 Tap übernimmt sie

Layout: `grid-cols-[1fr_440px]`. Links Eingabe + Sammlungs-Liste, rechts
Detail-Editor des aktiven Eintrags.

**`DraftItem`-State** pro Eintrag in der Sammlung:
```typescript
{
  tempId: string;          // crypto.randomUUID()
  name, quantity, unit, location, category, barcode;
  expiryDate: Date | null;
  fromShoppingItemId?: string;   // wenn aus Einkaufsliste übernommen
}
```

Detail-Editor (`DraftEditor`):
- Namens-Input (groß, h-12)
- Menge mit `−` / `+` Touch-Buttons + Einheits-Dropdown
- Standort-Chips (3×2 Grid, alle Touch-Targets)
- Kategorie optional
- `WheelDatePicker` für MHD
- "Aus Sammlung entfernen"-Button

**Speichern** (`saveAll`-Mutation):
- Items mit `fromShoppingItemId` → über `POST /shopping/lists/:id/to-pantry`
  (merget mit existierenden PantryItems nach Name, löscht Shopping-Item)
- Direkt-Eingaben → einzeln `POST /pantry/items` (triggert ggf. Auto-Add
  bei Mindestbestand)
- Alle relevanten Queries werden invalidiert: `pantry-items`,
  `pantry-low-stock`, `pantry-expiring`, `shopping-items`, `shopping-lists`

Verzeichnis-Konvention: `components/wall/` für Wand-spezifische Komponenten,
die nicht im normalen App-Flow vorkommen.

### `components/wall/MoodCheckIn.tsx`

Erscheint einmalig pro Tag im `PersonalPanel`, direkt nach dem Gesichts-Login.
Fünf Emoji-Buttons (😞–😄), Wert 1–5 via `POST /mood`. Bei bereits
vorhandenem Eintrag heute (`GET /mood/today` → nicht null) wird die Komponente
gar nicht gerendert. "Überspringen" setzt `dismissed: true` (React-State,
nicht persistiert).

### `components/wall/WallConfigEditor.tsx`

Modal zum personalisierten Anpassen des Wand-Dashboards. Öffnet sich via
SlidersHorizontal-Button im Wand-Header.

Features:
- **Kartenreihenfolge**: Drag & Drop via HTML5 native `draggable` API
  (keine externe DnD-Lib nötig). Drag-Index wird in `useRef` gehalten.
- **Sichtbarkeit**: Eye-Toggle pro Card (aus → opacity-50, in Liste aber noch vorhanden)
- **Wide-Toggle**: "2×"-Button — Card belegt 2 Spalten (`lg:col-span-2`)
- **Hintergrundfarbe**: 5 Preset-Buttons + freier Color-Picker
- **Sekunden-Anzeige**: Toggle-Switch für HH:MM:SS vs. HH:MM
- **Reset**: stellt `DEFAULT_CARDS` + Schwarz wieder her
- Beim Speichern: `PUT /wall/config` → `queryClient.invalidateQueries(['wall-config'])`

### `components/ShiftPatternEditor.tsx`

Eingebunden in `pages/Profile.tsx` nach den einzelnen Schichten.

- **Wochenansicht** (7 Spalten): zeigt alle aktiven Muster als farbige
  Chips inkl. Start-/Endzeit. Hover → Löschen-Button.
- **Formular**: Wochentag-Auswahl (7 Buttons, highlight aktiver), Time-Inputs,
  optionale Notiz
- **"Generieren"-Button**: `POST /shifts/patterns/generate` → generiert für
  nächste 14 Tage alle fehlenden `WorkShift`-Einträge
- Muster werden täglich 03:00 automatisch generiert (Cron); Startup ebenfalls

### `components/ui/Modal.tsx`

Generisches Modal. Props: `open`, `onClose`, `title`, `children`,
`size: 'sm'|'md'|'lg'`. Escape-Key schließt; Backdrop-Click ebenfalls.

### `components/ui/Badge.tsx`

Mini-Komponent für farbige Pills (Solid/Soft). Wird selten verwendet —
die meisten Pages stylen Badges inline.

---

## Pages

Jede Page enthält:
- Eine Top-Bar mit Titel + Action-Buttons
- Eine oder mehrere TanStack-Query-Hooks für Daten
- Eine oder mehrere `useMutation` für CRUD
- Modals für Edit/Create

### `pages/Login.tsx`

Login + Register in Tabs. Bei Erfolg `setAuth(user, token)` + Redirect `/`.
Beim Register kann der User eine Farbe für seinen Avatar wählen.

### `pages/Dashboard.tsx`

Übersicht:
- Greeting nach Tageszeit
- `<QuickAdd />`
- Warn-Banner für ablaufende Pantry-Items, Low-Stock, überschrittene Budgets
- 4 Stat-Cards (Einnahmen/Ausgaben/Listen/Tasks)
- Aufgaben + Jahresübersicht-Cards

### `pages/Finance.tsx`

Komplexeste Page. Enthält:
- Monats/Jahres-Selector + Aktionen (Beleg-Scan, Budgets, Wiederkehrend, Eintrag)
- 3 Summary-Cards
- Budget-Card mit Progressbars (grün/gelb/rot)
- Recurring-Card mit Play/Pause/Apply pro Vorlage
- Jahresverlauf-BarChart (Recharts)
- Einträge-Liste mit Edit/Delete
- 3 Modals: Eintrag, Budgets-Editor, Recurring-Editor

Beleg-OCR-Flow:
```typescript
const handleScanReceipt = async (file) => {
  const { scanReceipt } = await import('../lib/receiptParser');  // lazy!
  const result = await scanReceipt(file, (p) => setScanProgress(p));
  setForm({ …form, type: 'expense', amount, date, description: merchant });
  setShowModal(true);
};
```

### `pages/Shopping.tsx`

- Tabs für mehrere Listen (Pin-Icon für Default)
- BarcodeInput (USB-Scanner Keylistener)
- CameraScanner-Trigger
- Item-Add-Modal mit ProductAutocomplete
- Erledigt-Sektion mit "In Vorrat"-Button → Vorschau-Modal
- Vorschau-Modal: pro Item editierbare Menge/Standort/Ablaufdatum,
  Checkbox zum Inkludieren

### `pages/Pantry.tsx`

- Suche + Standort-Filter
- Globaler Keylistener für USB-Barcode-Scan
- Multi-Select-Modus mit Bulk-Toolbar (Standort/Kategorie/Löschen)
- Items gruppiert nach `location`
- Add/Edit-Modal mit ProductAutocomplete

### `pages/Recipes.tsx`

Master-Detail-Layout:
- Links: Rezeptliste mit Suche
- Rechts: `<RecipeDetail />` mit Portions-Skalierung + Vorrats-Anzeige pro
  Zutat + "Einkaufsliste"- und "Gekocht!"-Buttons
- Modal mit dynamischen Ingredients-Reihen (ProductAutocomplete)

### `pages/MealPlan.tsx`

Wochenraster `4 Mahlzeiten × 7 Tage`. Zellen klickbar → Add-Modal mit
Recipe-Selector. Pro Zelle Hover-Actions (Cook / Entfernen).

`"Wocheneinkauf"`-Button ruft `/meal-plan/week-to-shopping` auf →
aggregiert und dedupliziert alle Zutaten der Woche.

### `pages/Tasks.tsx`

- Filter-Tabs (Offen/Erledigt)
- Vorlagen-Chip-Reihe oberhalb der Liste
- Task-Liste mit Toggle, Priority-Badge, Recurring-Badge, Due-Date,
  Assignee
- 2 Modals: Aufgabe-Editor, Vorlagen-Verwalter

### `pages/Calendar.tsx`

Monatsansicht (Mo–So). Wiederholungs-Events haben ein Repeat-Icon. Form
enthält Recurrence-Dropdown + `recurrenceUntil`-Datepicker.

### `pages/Stats.tsx`

- 4 Mini-Stats (Ausgaben, Vorräte, Rezepte, Aktivität)
- PieChart: Top-Kategorien
- Fairness-Bars (erledigte Tasks pro User, 90 Tage)
- 30-Tage-Aktivitäts-Counter (Einkauf/Finanzen/Tasks)

### `pages/Profile.tsx`

Erreichbar via `/profile`. Klick auf den Avatar in Sidebar/Topbar landet
hier. Vier Sektionen:

1. **Standort-Karten** (`<LocationCard>`-Helper, 3×) — Zuhause, Arbeit,
   Wetter. Bearbeiten-Modus mit Lat/Lng-Eingabe, "Aktuellen Standort
   übernehmen"-Button via `navigator.geolocation`, Tipp-Link auf
   openstreetmap.org für manuelles Heraussuchen.
2. **Pendel-Modus** — 4 Chips (ÖV / Auto / Fahrrad / Zu Fuß). Speichert
   sofort via `PUT /profile/me`.
3. **Arbeitsschichten** (`<ShiftsCard>`) — Liste kommender Schichten +
   Inline-Form zum Anlegen (Start, Ende, Notiz).
4. **Wand-Erkennung** (`<FacesCard>`) — Live-Kamera-Vorschau, Capture
   speichert Descriptor. 2-3 Aufnahmen aus verschiedenen Winkeln werden
   empfohlen. Jeder Eintrag löschbar.

Capture-Flow:
- `getUserMedia({facingMode: 'user'})` öffnet Frontkamera
- Bei "Gesicht erfassen" Klick: `@vladmandic/face-api` lazy-laden
- `detectSingleFace(...).withFaceLandmarks().withFaceDescriptor()`
- 128-Float-Array → `POST /profile/face-descriptors`

### `pages/Wall.tsx`

Eigene Route `/wall`, getrennt vom Layout. Vollständig **interaktiv** —
keine simple Übersicht mit Links zur App, sondern eine eigenständige
Touch-Oberfläche fürs Wandtablet, die häufige Eingaben direkt erledigt.

**Mount-Verhalten**
- Setzt permanent `html.classList.dark` (Wand ist immer dunkel, unabhängig
  vom Theme-Store)
- Uhr aktualisiert pro Sekunde via `setNow(new Date())` in 1 s-Interval
- Alle Daten-Queries werden alle 60 s invalidiert (Auto-Refresh)
- Beim Unmount: alte `document.title` wiederherstellen

**Header**
- Großes Uhrzeit-Display + Datum
- **"Einkauf eintragen"**-Button (primary, prominent) → öffnet
  `WallPantryEntry` (Sammelmodus, siehe Komponenten-Sektion)
- **Erkennung-Toggle** (Eye-Icon) — schaltet `useFaceRecognition` an/aus.
  State wird in `localStorage['hestia-wall-face']` persistiert
- **Erkennungs-Reset** (User-Icon, nur sichtbar bei aktiver Erkennung) —
  setzt manuell auf generic zurück (z.B. wenn jemand anderes davor steht)
- Settings-Icon → Link zurück zur Haupt-App `/`

**Personalisierung (optional)**
Wenn ein Gesicht erkannt ist, erscheint links eine 340px breite Spalte
mit `<PersonalPanel>` (Wetter, Pendel, nächste Schicht). Das Layout
wechselt von `grid-cols-1` zu `grid-cols-[340px_1fr]`. Bei keiner
Erkennung oder deaktiviertem Toggle bleibt das generische Layout. Unten
links zeigt ein kleiner Status-Indikator den Erkennungs-Zustand
("Suche…", "<Name> erkannt", "Keine Gesichter registriert", "Kamera-Fehler").

Die Erkennung läuft mit dem hidden `<video>`-Element direkt auf der
Wand-Page. CPU-Last bleibt durch `intervalMs: 2000` und
`inactivityMs: 30000` minimal.

- **Auto-Logout**: Nach `autoLogoutMs: 45000` ms ohne erkanntes Gesicht
  wird `recognizedUser` automatisch auf `null` zurückgesetzt → generisches Interface
- **Motion-Wakeup**: `onMotionWakeup: true` — Socket-Event `motion-detected`
  (vom PIR-Sensor) weckt die Detection auf; ohne Bewegung schläft der Loop

**Dashboard-Konfiguration** (`WallConfig`)
- "Dashboard anpassen"-Button (SlidersHorizontal-Icon) öffnet `WallConfigEditor`
- Konfiguration wird via `GET/PUT /wall/config` gespeichert (pro User, SQLite)
- Beim Start wird `wallCfgRaw` geladen; bei `null` greifen die `DEFAULT_CARDS`
- `bgColor` wird als `style={{ backgroundColor }}` auf den Root-Div angewendet
- `showSeconds` schaltet die Uhrzeitanzeige zwischen `HH:mm` und `HH:mm:ss` um

**Kacheln** (alle Card-basiert, dunkel, große Schrift)

Alle Kacheln nutzen die geteilte `<WallCard>`-Helper-Komponente
(Icon + Titel + optionaler Counter rechts + Children). Die Reihenfolge
und Sichtbarkeit ist über `WallConfig.cards` individuell konfigurierbar.

| Kachel-ID | Inhalt | Interaktionen |
|-----------|--------|---------------|
| `tasks` | Tasks mit `dueDate ≤ heute` oder ohne `dueDate`, sortiert nach Priorität | Tap auf Kreis = abhaken; Inline-Add für neue Task |
| `events` | Events des Tages + Vorschau-Sektion "Nächste Tage" (4 kommende) | Read-only |
| `meals` | `MealPlan`-Einträge des Tages, sortiert nach mealType | Tap → `confirm` → `cookMeal.mutate(id)` (Vorräte abziehen) |
| `shopping` (wide) | Nicht-abgehakte Items der Default-Liste, scrollbar | Tap = abhaken; Inline-Add |
| `expiring` | Pantry-Items mit `expiryDate ≤ heute+7` | Read-only |
| `upcoming-tasks` | Bis zu 5 Tasks mit `dueDate > heute` | Read-only |
| `budget` | Budgets des Monats als Fortschrittsbalken (grün/gelb/rot) | Read-only |
| `countdown` | Kalender-Events mit 📍 🎂 🗓️ ⭐ im Titel, Tage-Countdown | Read-only |

**Inline-Add-Pattern** (`<InlineAdd>`-Helper):
- Eingeklappter Zustand: gestrichelter "+ Neue Aufgabe…"-Button
- Bei Click: expandiert zu `<form>` mit Input + Submit-Button + Cancel-X
- Submit: `addTask`/`addShopping`-Mutation; Input wird geleert, Form
  schließt sich
- Tastatur-Submit: Enter
- Sehr leichtgewichtig — keine vollen Modals nötig für Quick-Adds

**Mutationen auf der Wand**
| Mutation | Endpoint | Trigger |
|----------|----------|---------|
| `toggleTask` | `PUT /tasks/:id` mit `{completed: true}` | Tap auf Task-Kreis |
| `addTask` | `POST /tasks` mit `priority: 'medium'` | Inline-Add Tasks |
| `toggleShopping` | `PUT /shopping/items/:id` mit `{checked: true}` | Tap auf Liste-Item |
| `addShopping` | `POST /shopping/items` mit `quantity: 1`, `unit: 'Stück'` | Inline-Add Einkauf |
| `cookMeal` | `POST /meal-plan/:id/cook` | Tap auf Mahlzeit (mit Confirm) |

Alle invalidieren die jeweiligen Queries → Realtime-Sync sorgt für
Aktualisierung anderer Clients.

> Wand-Modus ist **nicht** für Erstellen/Edit von Terminen mit Datum/
> Wiederholung gedacht — dafür gibt es die normale `/calendar`-Page.
> Touch-Datums-Eingabe ist auf einem Wand-Display zu umständlich. Das MHD
> ist der einzige Datumswert, der auf der Wand häufig gebraucht wird —
> dafür der spezielle `WheelDatePicker`.

---

## Lib

### `lib/receiptParser.ts`

```typescript
scanReceipt(file: File, onProgress?): Promise<ReceiptParsed>
parseReceiptText(raw: string): ReceiptParsed
```

`ReceiptParsed`: `{ amount, date, merchant, raw }`.

Lazy-Import von Tesseract.js, deutsche Sprache (`deu`). Heuristiken:
- **Betrag**: sucht nach Zeilen mit "SUMME"/"GESAMT"/"TOTAL"/"ZU ZAHLEN";
  fallback auf höchsten gefundenen Betrag im Text
- **Datum**: regex `\d{1,2}\.\d{1,2}\.\d{2,4}` oder ISO
- **Händler**: erste sinnvolle Zeile (3–40 Zeichen, enthält Buchstaben)

---

## Styling

### Tailwind-Config

`tailwind.config.js`:
- `darkMode: 'class'` (kein automatisches Medium-Query — Theme-Store
  steuert die `.dark`-Klasse)
- Custom `primary` Farb-Skala basierend auf Indigo `#6366f1`

### `index.css`

```css
@layer components {
  .card { @apply bg-white rounded-xl shadow-sm border border-gray-100
                  dark:bg-gray-900 dark:border-gray-800; }
  .btn-primary { @apply bg-primary-500 hover:bg-primary-600 text-white
                  px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50; }
  .input { … dark:bg-gray-800 dark:border-gray-700 …; }
  .label { … dark:text-gray-300; }
}

/* Dark-Mode-Overrides für bestehende Tailwind-Utilities */
.dark .bg-white { background-color: rgb(17 24 39); }
.dark .text-gray-900 { color: rgb(243 244 246); }
.dark .border-gray-100 { … }
…

/* Utility für versteckte Scrollbar (z.B. WheelDatePicker) */
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
.scrollbar-hide::-webkit-scrollbar { display: none; }
```

Diese Overrides sparen sich das `dark:`-Prefix in jeder Komponente.
Tradeoff: weniger explizit, dafür viel weniger Boilerplate.

---

## Build-Konfiguration (`vite.config.ts`)

- **Dev-Server**: Port 3000, Proxy `/api` und `/socket.io` zu `localhost:3001`
- **manualChunks**: react-vendor, query, charts, utils, icons, scanner, ocr, faceapi
- **`globIgnores: ['models/**']`** — face-api.js-Modelle (`public/models/`)
  bleiben aus dem Precache; werden bei Bedarf live geladen
- **`maximumFileSizeToCacheInBytes: 8 MB`** — höher gesetzt für die
  faceapi-Chunk (1.3 MB)
- **VitePWA** mit `injectManifest`-Strategie → eigener `sw.ts`
- **Manifest**: Hestia-Branding, Icons aus `/icons/icon-*.png`, App-Shortcuts
  für Einkauf/Aufgaben/Vorrat
- `runtimeCaching` ist NICHT im Plugin-Config — das macht der eigene SW

---

## PWA-Icons

`public/icons/source.svg` ist das Master-Icon. `npm run icons` rendert es
über `sharp` zu vier PNG-Größen (192, 512, 512-maskable, 180 für Apple).
Maskable-Variant hat 20% Padding für Adaptive Icons auf Android.

## Face-Modelle

Für die Wand-Erkennung müssen die face-api.js-Modelle in `public/models/`
liegen. Einmalig nach Setup ausführen:

```powershell
cd s:\Programmieren\Hestia\frontend
npm run face:models
```

Lädt aus dem `@vladmandic/face-api`-GitHub-Repo:

| Modell | Größe | Zweck |
|--------|-------|-------|
| `tiny_face_detector_model` | 190 KB | Bounding-Box-Detection (RPi-tauglich) |
| `face_landmark_68_model` | 350 KB | Landmark-Punkte für Alignment |
| `face_recognition_model` | 6.2 MB | 128-Float-Descriptor-Embedding |

Total ~7 MB. Sie liegen außerhalb des PWA-Precache (`globIgnores`), werden
beim ersten Erkennungs- oder Capture-Versuch vom Browser geladen und
gecached.

# Architektur

## High-Level-Überblick

Hestia besteht aus zwei Diensten + einer SQLite-Datei:

```
                ┌──────────────────────────────────────────────┐
                │              Browser (PWA)                   │
                │  React  +  Service Worker  +  IndexedDB      │
                └───────────┬────────────────────┬─────────────┘
                            │ HTTPS              │ WebSocket
                            ▼                    ▼
                    ┌───────────────┐   ┌───────────────┐
                    │  Frontend     │   │  Backend      │
                    │  (Nginx +     │   │  (Express +   │
                    │   Static-     │◄──┤   Socket.io + │
                    │   Build)      │   │   node-cron)  │
                    └───────────────┘   └───────┬───────┘
                                                │
                                                ▼
                                        ┌───────────────┐
                                        │  SQLite-File  │
                                        │  (Prisma)     │
                                        └───────────────┘
```

In Production (RPi-Setup) sitzt **Caddy** als Reverse Proxy vor beiden
Containern und terminiert HTTPS. Im Dev-Modus verbindet sich Vite direkt
mit dem Backend via Proxy in der `vite.config.ts`.

## Bedienungs-Modi

Hestia hat **zwei UI-Modi** für unterschiedliche Geräte/Use-Cases:

| Modus | Route | Zielgerät | Typische Aktionen |
|-------|-------|-----------|-------------------|
| **App-Modus** | `/` (mit Sidebar/BottomBar) | Desktop, Smartphone, Tablet | Vollständige CRUD aller Daten |
| **Wand-Modus** | `/wall` (eigenständig, Vollbild dunkel) | Wandtablet im Hausflur/Küche | Häufige Quick-Aktionen direkt erledigen: Tasks abhaken, Einkaufsliste verwalten, Mahlzeiten als gekocht markieren, **Einkauf in Vorrat übernehmen** (eigener Vollbild-Sammelmodus mit USB-Scanner/Kamera/MHD-Räder) |

Die Wand ist bewusst **nicht** eine reine Dashboard-Anzeige mit
Quick-Links zur App — die häufigsten Eingaben sind direkt im Wand-Modus
möglich, ohne Modul-Wechsel. Edits mit komplexen Datumsfeldern (Termine,
recurring Tasks) bleiben in der App, da Touch-Datepicker ineffizient
sind.

## Komponenten-Verantwortlichkeiten

### Backend (`backend/src/`)

| Verantwortlichkeit | Datei |
|--------------------|-------|
| App-Bootstrap, Routenregistrierung | `index.ts` |
| JWT-basierte Authentifizierung | `middleware/auth.ts` |
| Realtime-Sync zwischen Clients | `index.ts` (Socket.io-Setup) |
| Persistenz | `prisma/schema.prisma` + Prisma Client |
| Wiederkehrende Tasks/Termine/Ausgaben | `lib/recurring.ts`, `lib/recurringFinance.ts` |
| Auto-Add bei Mindestbestand | `lib/autoShop.ts` |
| Web Push (VAPID) | `lib/push.ts` |
| Tägliche Cron-Jobs | `index.ts` (03:00 + 08:00) |
| HTTP-Endpoints pro Domäne | `routes/*.ts` |

### Frontend (`frontend/src/`)

| Verantwortlichkeit | Datei/Verzeichnis |
|--------------------|-------------------|
| Routing | `App.tsx` |
| Daten-Fetching + Caching | TanStack Query (über `api/client.ts`) |
| HTTP-Client mit Token + Offline-Queue | `api/client.ts` |
| Realtime-Empfang | `api/socket.ts` + `hooks/useRealtimeSync.ts` |
| Auth-State (Token, User) | `store/authStore.ts` |
| Theme (Light/Dark/System) | `store/themeStore.ts` |
| Service Worker (Precache, Push, Offline) | `sw.ts` |
| Offline-Mutation-Queue | `api/offlineQueue.ts` + `hooks/useOfflineStatus.ts` |
| PWA-Update-Prompt | `hooks/usePwaUpdate.tsx` |
| Pro Domäne eine Seite | `pages/*.tsx` |

## Datenfluss am Beispiel "Einkaufsartikel hinzufügen"

```
1. User klickt "+" auf Shopping-Page
2. React-Komponent öffnet Modal
3. Submit → useMutation(addItem) → api.post('/shopping/items', …)
   ├── axios-Request mit Bearer-Token (Interceptor)
   ├── bei Offline: in IndexedDB-Queue + Toast "Wird gesendet…"
   └── bei Erfolg:
       4. Backend route: POST /api/shopping/items
          ├── auth-Middleware prüft JWT → setzt req.userId
          ├── prisma.shoppingItem.create(...)
          └── io.to('household').emit('shopping:item-added', item)
       5. Frontend useMutation.onSuccess
          ├── queryClient.invalidateQueries(['shopping-items', listId])
          ├── queryClient.invalidateQueries(['shopping-lists'])
          ├── toast.success(...)
          └── Modal schließt
       6. Andere Browser-Fenster im Haushalt:
          ├── Socket.io-Client empfängt 'shopping:item-added'
          ├── useRealtimeSync mapt Event auf Query-Keys
          └── invalidateQueries → automatischer Refetch
```

## Realtime-Sync (Socket.io)

Backend hält **einen Raum "household"** — beim Connect verbindet sich der
Client mit `socket.emit('join-household')`. Jede mutierende Route emittiert
nach der DB-Operation ein passendes Event:

| Domäne | Events |
|--------|--------|
| Shopping | `shopping:item-added`, `shopping:item-updated`, `shopping:item-deleted`, `shopping:checked-cleared` |
| Tasks | `tasks:created`, `tasks:updated`, `tasks:deleted` |
| Calendar | `calendar:created`, `calendar:updated`, `calendar:deleted` |
| Pantry | `pantry:changed` (mit `{type, id}`) |
| Finance | `finance:changed` (mit `{type, id}`) |
| MealPlan | `mealplan:changed` (mit `{type, id}`) |

Frontend mappt diese auf Query-Invalidierungen in
[`hooks/useRealtimeSync.ts`](../frontend/src/hooks/useRealtimeSync.ts). So
muss der Backend-Code nie wissen, **welche** Query der Client gerade
gecached hat — nur das logische Event zählt.

## PWA / Offline-Konzept

### Service Worker (`frontend/src/sw.ts`)

Generiert via `vite-plugin-pwa` mit `injectManifest`-Strategie (eigener
SW-Code statt Auto-Generierung). Drei Cache-Strategien:

1. **Navigation** — `NetworkFirst`, 3s Timeout, Fallback auf Cache: App-Shell
   funktioniert auch komplett offline.
2. **API-Requests** (`/api/*`) — `NetworkFirst`, 5s Timeout, 24h-Cache:
   Lesen geht offline mit letztem bekannten Stand.
3. **Open Food Facts** — `CacheFirst`, 30-Tage-Cache: Produktdaten bleiben
   verfügbar.

### Offline-Mutation-Queue

Bei `ERR_NETWORK` auf POST/PUT/DELETE/PATCH legt der axios-Interceptor
([`api/client.ts`](../frontend/src/api/client.ts)) den Request in eine
IndexedDB-Queue ([`api/offlineQueue.ts`](../frontend/src/api/offlineQueue.ts)).
Sobald das `online`-Event feuert, spielt
[`hooks/useOfflineStatus.ts`](../frontend/src/hooks/useOfflineStatus.ts) die
Queue ab. 4xx-Antworten gelten als endgültig fehlgeschlagen (kein Retry),
5xx oder Netzwerkfehler bleiben in der Queue.

### Web Push

VAPID-Keys werden mit `npm run push:keys` im Backend erzeugt und in
`.env` abgelegt. Frontend abonniert über
[`api/push.ts`](../frontend/src/api/push.ts) → Backend persistiert die
Subscription. Cron um 08:00 versendet täglich Notifications für ablaufende
Pantry-Items und fällige Tasks.

## Authentifizierung

- **Login/Register** in `routes/auth.ts`. Passwort mit `bcrypt` (10 Rounds).
- **Token**: JWT, signiert mit `JWT_SECRET` aus `.env`, gültig **30 Tage**.
- **Client-Storage**: `localStorage` unter `hestia-token`.
- **Request-Header**: axios-Interceptor setzt `Authorization: Bearer ...`.
- **Refresh**: Bei 401 wird der Token gelöscht und der Browser auf `/login`
  redirected.

> Da Hestia für 2-3 Haushaltsmitglieder gedacht ist, gibt es bewusst
> **keine** rollenbasierte Autorisierung. Jeder authentifizierte Nutzer
> kann alles tun.

## Cron-Jobs

Beim Server-Start (in [`index.ts`](../backend/src/index.ts)) werden zwei
Cron-Tasks via `node-cron` registriert:

| Zeit | Aufgaben |
|------|----------|
| 03:00 täglich | `backfillOverdueRecurring()` (Tasks) + `runDueRecurringFinance()` (Ausgaben) |
| 08:00 täglich | Push-Benachrichtigungen für ablaufende Vorräte + fällige Tasks |

Beim Server-Start läuft `backfillOverdueRecurring()` einmalig nach, um
verpasste Wiederholungen während des Downtimes aufzuholen.

## Build-Pipeline

### Backend

```
tsx watch src/index.ts        # Dev: hot-reload
tsc                           # Build: dist/*.js
prisma generate               # Client-Stubs aus Schema
prisma db push                # Schema → DB (dev)
```

### Frontend

```
vite                          # Dev: HMR auf Port 3000, Proxy zu :3001
tsc && vite build             # Build: dist/ + Service Worker
  └── manualChunks splittet:
      ├── react-vendor (172 KB)   React, React-DOM, Router
      ├── query (49 KB)           TanStack Query
      ├── charts (403 KB)         Recharts
      ├── utils (68 KB)           date-fns, zustand, axios
      ├── icons (18 KB)           lucide-react
      ├── scanner (416 KB)        ZXing (lazy, nur bei Kameranutzen)
      └── ocr (17 KB + WASM)      Tesseract (lazy, nur bei Beleg)
```

Initial-Load: ~430 KB (gzipped: ~140 KB). Scanner und OCR werden erst
geladen, wenn die zugehörige Funktion benutzt wird.

## Sicherheits-Modell

| Aspekt | Maßnahme |
|--------|----------|
| Passwort-Storage | `bcrypt` mit 10 Salt-Rounds |
| Session | JWT, 30 Tage, `Authorization: Bearer` |
| CORS | Default offen — in Production durch Caddy hinter Reverse-Proxy abgesichert |
| SQL-Injection | Prisma Parametrized Queries — kein Raw-SQL |
| XSS | React escaped per default; keine `dangerouslySetInnerHTML` |
| CSRF | Nicht relevant: JWT im Authorization-Header (nicht im Cookie) |
| Secrets | `.env` ist in `.gitignore`; JWT_SECRET + VAPID_PRIVATE_KEY müssen lokal/auf RPi gesetzt werden |
| Transport | TLS via Caddy (selbst-signiert auf RPi LAN) |

> **Vor Production-Deploy:** `JWT_SECRET` ändern (`openssl rand -base64 48`).

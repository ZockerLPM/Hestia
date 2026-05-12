# Dev-Workflow

Empfohlene Workflows für tägliches Arbeiten, Datenbank-Änderungen,
Testen und Debugging.

## Tägliches Arbeiten

### Setup einmalig (auf neuem Rechner)

```powershell
# Tools
node --version            # ≥ 22.0.0
git --version

# Repo holen
git clone <repo-url> s:\Programmieren\Hestia
cd s:\Programmieren\Hestia

# Backend
cd backend
copy .env.example .env
npm install
npx prisma db push
npm run db:seed

# Frontend
cd ..\frontend
npm install
```

### Standard-Dev-Loop (2 Terminals)

```powershell
# Terminal 1: Backend mit Hot-Reload
cd s:\Programmieren\Hestia\backend
npm run dev
# tsx watch — neulädt bei jeder src/-Änderung
# Läuft auf http://localhost:3001

# Terminal 2: Frontend mit HMR
cd s:\Programmieren\Hestia\frontend
npm run dev
# Vite — Hot-Module-Replacement
# Läuft auf http://localhost:3000
```

Frontend proxyt automatisch `/api` und `/socket.io` zu Backend. Browser
öffnen: `http://localhost:3000`.

### Branch-Strategie

Single-Developer-Projekt — `main` ist Production-ready, Features in
Branches:

```powershell
# Neues Feature
git checkout -b feature/recipes-photo-upload
# Code schreiben, committen
git add -p
git commit -m "feat(recipes): Foto-Upload mit Drag&Drop"
# Wenn fertig:
git checkout main
git merge --no-ff feature/recipes-photo-upload
git branch -d feature/recipes-photo-upload
```

Auf RPi später:
```bash
git pull
~/update-hestia.sh
```

### Commit-Konventionen

Empfehlung: Conventional Commits. Prefixes:
- `feat:` — neues Feature
- `fix:` — Bugfix
- `refactor:` — kein Verhalten geändert
- `docs:` — nur Dokumentation
- `chore:` — Build-Config, Deps
- `style:` — nur Formatierung
- `perf:` — Performance-Optimierung

Optional Domain in Klammern: `feat(shopping): Pin-Default-Liste`.

### Hot-Reload-Verhalten

| Change | Was passiert |
|--------|--------------|
| Frontend `.tsx`/`.ts` | Vite HMR — Komponenten-State bleibt erhalten |
| Frontend `.css` / Tailwind | Sofortiger Reload, kein Refresh nötig |
| Frontend `vite.config.ts` | Vite startet neu |
| Backend `src/*.ts` | tsx watch killt + restartet Node — alle Connections trennen |
| `prisma/schema.prisma` | **kein Auto-Reload** — `npm run db:push` manuell |
| `.env` | Backend neu starten |

### Useful Scripts

| Befehl | Wirkung |
|--------|---------|
| `npm run dev` (backend) | tsx watch, Auto-Reload |
| `npm run dev` (frontend) | Vite + HMR |
| `npm run build` | Production-Build (beide) |
| `npm run push:keys` (backend) | VAPID-Keys generieren |
| `npm run icons` (frontend) | PNG-Icons aus `source.svg` |
| `npm run db:push` (backend) | Schema → DB |
| `npm run db:generate` (backend) | Prisma Client neu generieren |
| `npm run db:seed` (backend) | Demo-Daten einspielen |

---

## Datenbank-Workflow

### Migrations vs. `db push`

Hestia nutzt **`prisma db push`**:
- Synct das Schema **direkt** in die DB ohne Migrations-History
- Schneller, kein Migrations-Ordner zu pflegen
- **Nachteil**: bei destructiven Änderungen (Spalte umbenennen, NOT NULL
  hinzufügen mit Daten) gibt es keinen Sicherheits-Netz

> Wenn dein Projekt jemals mehrere Devs hat oder ein produktives
> Schema-Changelog braucht → auf `prisma migrate dev` umsteigen.

### Schema ändern — sicherer Ablauf

```powershell
# 1. Backup
cd s:\Programmieren\Hestia\backend\prisma\data
copy hestia.db hestia.db.bak

# 2. Schema-File bearbeiten
# (s:\Programmieren\Hestia\backend\prisma\schema.prisma)

# 3. Push + Client neu generieren
cd s:\Programmieren\Hestia\backend
npm run db:push
# Bei Datenverlust-Warning: aufmerksam lesen, ggf. abbrechen

# 4. Falls Fehler: Backup zurück
copy prisma\data\hestia.db.bak prisma\data\hestia.db /Y
```

### Destruktive Änderungen mit Daten-Migration

Beispiel: Spalte `priority: string` zu `priorityLevel: int`.

```powershell
# Variante A: Manuell mit SQLite-CLI
sqlite3 prisma\data\hestia.db
> ALTER TABLE Task ADD COLUMN priorityLevel INTEGER DEFAULT 2;
> UPDATE Task SET priorityLevel = CASE
    WHEN priority = 'high' THEN 3
    WHEN priority = 'medium' THEN 2
    WHEN priority = 'low' THEN 1
    ELSE 2
  END;
# Erst dann die alte Spalte im Schema entfernen + db:push
```

### Seeding-Strategie

`backend/src/seed.ts` ist **idempotent**: prüft, ob User existieren,
bevor Daten angelegt werden. Mehrfaches Ausführen schadet nicht. Bei
Bedarf erweitern (z.B. mehr Demo-Rezepte für Screenshots).

### DB-Backup im Dev

```powershell
# Manuell vor riskanten Operationen
cd s:\Programmieren\Hestia\backend\prisma\data
copy hestia.db "hestia.db.$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
```

### Direkt-Zugriff auf die DB

SQLite-Browser (https://sqlitebrowser.org/) — GUI-Tool zum Anschauen,
Editieren, Queries ausführen. Datei: `backend/prisma/data/hestia.db`.

Oder über CLI:
```powershell
# SQLite-Tools installieren (z.B. via Scoop: scoop install sqlite)
sqlite3 backend\prisma\data\hestia.db ".schema"
sqlite3 backend\prisma\data\hestia.db "SELECT * FROM User"
```

### Inspect via Prisma Studio

```powershell
cd s:\Programmieren\Hestia\backend
npx prisma studio
# Öffnet http://localhost:5555 mit Web-GUI zum Browsen aller Tabellen
```

---

## Test- und Debugging-Strategie

### Was es **gibt** und was **nicht**

| Vorhanden | Fehlt aktuell |
|-----------|---------------|
| TypeScript Strict-Mode | Unit-Tests (Vitest/Jest) |
| ESLint via TS-Compiler-Checks | E2E (Playwright/Cypress) |
| Manuelles Testing | Integration-Tests |
| Build-Verify (tsc + vite) | CI/CD-Pipeline |

> Bei Wachstum → Vitest für Backend-Lib (`autoShop`, `recurring`),
> Playwright für kritische User-Flows (Login, Einkauf-zu-Vorrat).

### Manuelles Test-Vorgehen für ein Feature

1. **Happy-Path**: Feature wie geplant nutzen, prüfen ob alles klappt
2. **Edge-Cases** durchspielen — leere Eingaben, sehr lange Strings,
   gleichzeitige Aktionen
3. **Realtime**: Zweites Browserfenster im Inkognito-Modus mit demselben
   Account → prüfen ob Updates ankommen
4. **Offline**: DevTools → Network → Offline-Throttling → Mutation
   ausführen → wieder Online → prüfen ob Queue-Replay funktioniert
5. **Mobile**: DevTools → Mobile-Emulation oder echtes Gerät im LAN
6. **Dark Mode**: Theme-Toggle umschalten, prüfen ob Farben passen

### Backend-Debugging

#### Logs

`console.log` reicht für die meisten Fälle. tsx watch zeigt sie direkt
im Terminal an. Bei Bedarf strukturierter:

```typescript
console.log('[shopping] item created', { id: item.id, listId: item.listId });
```

#### Express-Errors

Express schluckt synchrone Errors in async-Handlern nicht — bei Bedarf:
```typescript
router.post('/foo', async (req, res, next) => {
  try {
    …
  } catch (e) {
    next(e);
  }
});
```

Aktuell ist Hestia bewusst optimistisch — async-Errors werden vom
Default-Errorhandler 500'd. Wenn ein Endpoint hängt, prüfe das im Backend-
Terminal.

#### Datenbank-Queries inspizieren

```typescript
// Temporär im PrismaClient-Setup:
export const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});
```

Zeigt alle Queries inkl. Parameter im Backend-Terminal.

#### VSCode Debug

`.vscode/launch.json` (anlegen falls nicht da):
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Backend Debug",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "cwd": "${workspaceFolder}/backend",
      "console": "integratedTerminal"
    }
  ]
}
```

Breakpoints in `.ts`-Files setzen, F5 starten.

### Frontend-Debugging

#### Browser DevTools

Wichtige Tabs:
- **Network** — API-Requests, Status, Latency, Response-Bodies
- **Application → Service Worker** — SW-Status, Update erzwingen, Cache
  löschen
- **Application → IndexedDB** — Offline-Queue inspizieren (Schlüssel
  `hestia-offline-queue`)
- **Application → Local Storage** — JWT (`hestia-token`), Theme
- **Console** — alle `console.log` der App + Errors

#### React Query DevTools

Optional aktivieren in `main.tsx`:
```typescript
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

…
<QueryClientProvider client={queryClient}>
  <App />
  <ReactQueryDevtools initialIsOpen={false} />
</QueryClientProvider>
```

Dazu `npm i -D @tanstack/react-query-devtools`. Erlaubt Live-Inspect
aller Queries + manuelles Invalidieren.

#### Socket.io-Debugging

In Browser-Konsole:
```javascript
localStorage.debug = 'socket.io-client:*';
// dann Page-Reload — Socket-Events landen in der Konsole
```

#### PWA / Service Worker

```javascript
// Workbox-Logs in Konsole aktivieren:
navigator.serviceWorker.getRegistrations().then(console.log);

// SW komplett entfernen + Caches löschen (für Tests):
navigator.serviceWorker.getRegistrations().then((rs) =>
  rs.forEach((r) => r.unregister()));
caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
// dann Hard-Reload
```

### Realtime testen

Empfohlenes Setup:
- Browser 1: `http://localhost:3000` als `person1@hestia.local`
- Browser 2 (Inkognito oder anderer Browser): selbe URL als
  `person2@hestia.local`
- Aktion in einem Fenster → muss im anderen ohne Reload erscheinen

Wenn nicht: Backend-Terminal prüfen — werden Events emittet? Browser-
Konsole prüfen — verbindet sich Socket.io überhaupt?

### Offline testen

```
DevTools → Application → Service Worker → "Offline" Checkbox
oder
DevTools → Network → Offline-Dropdown
```

Dann:
1. Einen Vorrat anlegen → Toast "Offline — wird gesendet…"
2. Anwendung neuladen → Item ist nicht in Backend, aber in Queue
   sichtbar (Banner zeigt "1 Änderung in Warteschlange")
3. Offline-Checkbox wieder abwählen → automatisch geflusht

### Build-Verify vor Commit

Vor jedem größeren Push:

```powershell
# Backend
cd s:\Programmieren\Hestia\backend
npm run build
# tsc muss ohne Errors durchlaufen

# Frontend
cd ..\frontend
npm run build
# tsc + vite build muss durchlaufen, Bundle-Größen prüfen
```

Wenn tsc Errors meldet: **erst fixen**, nicht ignorieren. Hestia hat
keine separate Linter-Pass — tsc strict ist die Qualitätsgrenze.

---

## Häufige Fragen

### "Wieso ist tsc nicht in der Dev-Loop?"

`tsx watch` läuft mit lockerer Type-Prüfung (Esbuild). Für strikte
Validierung `npm run build` separat. Vite macht im Frontend `tsc` als
Pre-Build-Step.

### "Wieso kein `git pull` Auto-Update?"

Bewusst manuell. `update-hestia.sh` auf RPi macht es bei Bedarf. Auto-
Updates ohne Tests sind in einem 2-Personen-Haushalt mehr Risiko als
Nutzen.

### "Was tun bei kaputter DB?"

1. Stop Backend
2. `cp prisma/data/hestia.db prisma/data/hestia.db.broken` (forensik)
3. Letztes Backup zurückkopieren: `cp .../backup-YYYYMMDD.db hestia.db`
4. Backend wieder starten

### "Wie debug ich Cron-Jobs?"

Manuell triggern:
```bash
# Im laufenden Backend-Container:
docker compose exec backend node -e "
  require('./dist/lib/recurringFinance').runDueRecurringFinance().then(console.log);
"
```

Oder via Test-Endpoint: `POST /api/finance/recurring/run-now` triggert
manuell.

### "Wie sehe ich, ob Push wirklich funktioniert?"

```
POST /api/push/test
→ Server-Antwort: {sent, failed}
```

`sent: 0` = niemand abonniert, `failed > 0` = Subscriptions kaputt.
Browser-Konsole zeigt empfangene Pushes wenn Notification-Permission da
ist.

### "Bundle ist zu groß, wo kann ich sparen?"

Initial-Chunk (`index-*.js`) prüfen mit:
```powershell
cd s:\Programmieren\Hestia\frontend
npm run build
# Bundle-Größen werden gelistet
```

Wenn eine Page selten genutzt wird: in `App.tsx` lazy-laden:
```typescript
const Stats = lazy(() => import('./pages/Stats'));
…
<Suspense fallback={<div>Lädt…</div>}>
  <Stats />
</Suspense>
```

# Backend-Referenz

Vollständige Referenz aller Endpoints, Lib-Module und Middleware.
Basis-URL: `http://<host>:3001/api`

> **Authentifizierung**: Alle Endpoints außer `/api/auth/*` und
> `/api/health` benötigen einen `Authorization: Bearer <jwt>`-Header.

---

## App-Bootstrap (`src/index.ts`)

### Aufgaben

1. Prisma-Client als Singleton exportieren (`export const prisma`)
2. Express-App + HTTP-Server + Socket.io-Server aufsetzen
3. Alle Router unter `/api/<domain>` mounten
4. Socket.io: `'join-household'`-Event → Client betritt Raum `household`
5. Cron-Tasks registrieren (03:00 und 08:00 täglich)
6. Beim Server-Start einmalig `backfillOverdueRecurring()` laufen lassen

### Cron-Jobs

```typescript
// 03:00 — Recurring backfill
cron.schedule('0 3 * * *', async () => {
  await backfillOverdueRecurring();          // Tasks
  await runDueRecurringFinance();            // Finance-Vorlagen
});

// 08:00 — Daily Push-Notifications
cron.schedule('0 8 * * *', async () => {
  const expiring = await prisma.pantryItem.findMany({
    where: { expiryDate: { gte: now, lte: in7days } },
  });
  const tasksDueToday = await prisma.task.findMany({ … });
  if (expiring.length > 0) await sendToHousehold({ … });
  if (tasksDueToday.length > 0) await sendToHousehold({ … });
});
```

Default-Port `3001`, überschreibbar via `process.env.PORT`.

---

## Auth-Middleware (`middleware/auth.ts`)

### `signToken(userId: string): string`

Erzeugt ein JWT mit `userId` als Payload, signiert mit `JWT_SECRET`, gültig
30 Tage.

### `auth: RequestHandler`

Middleware, die `Authorization: Bearer <token>` validiert und bei Erfolg
`req.userId` setzt. Bei fehlendem/ungültigem Token → `401`.

### `AuthRequest extends Request`

Hilfs-Typ mit `userId?: string` für Routes-Code:
```typescript
router.post('/something', async (req: AuthRequest, res) => {
  // req.userId ist garantiert gesetzt (auth-Middleware lief)
});
```

---

## Routes

### `/api/auth` (`routes/auth.ts`)

| Method | Path | Body | Auth | Rückgabe |
|--------|------|------|------|----------|
| POST | `/register` | `{name, email, password, color?}` | nein | `{user, token}` |
| POST | `/login` | `{email, password}` | nein | `{user, token}` |
| GET | `/me` | — | ja | `User` ohne `passwordHash` |

**Register-Flow**:
1. Email-Konflikt-Check
2. `bcrypt.hash(password, 10)`
3. `User.create`
4. `signToken(user.id)` → JWT zurückgeben

### `/api/users` (`routes/users.ts`)

| Method | Path | Rückgabe |
|--------|------|----------|
| GET | `/` | Alle Haushaltsmitglieder (`id`, `name`, `color`) — für Task-Zuweisung |

### `/api/finance` (`routes/finance.ts`)

#### Kategorien

| Method | Path | Body | Beschreibung |
|--------|------|------|--------------|
| GET | `/categories` | — | Alle Kategorien, sortiert nach Name |
| POST | `/categories` | `{name, icon, color, type, monthlyBudget?}` | Neue Kategorie |
| PUT | `/categories/:id` | partielle Felder | Update (Budget wird auf `null` gesetzt bei leerem String) |

#### Einträge

| Method | Path | Body / Query | Beschreibung |
|--------|------|---------------|--------------|
| GET | `/entries` | `?month=&year=&type=` | Filterung nach Monat/Jahr/Typ |
| POST | `/entries` | `{type, amount, description, date, categoryId}` | Eintrag + Socket-Event `finance:changed` |
| PUT | `/entries/:id` | gleiche Felder | Update + Socket-Event |
| DELETE | `/entries/:id` | — | Löschen + Socket-Event |

#### Aggregationen

| Method | Path | Rückgabe |
|--------|------|----------|
| GET | `/summary?year=` | `{monthlyData[], totalIncome, totalExpenses, balance}` für gesamtes Jahr |
| GET | `/budgets?month=&year=` | Pro Kategorie mit Budget: `{categoryId, name, icon, color, limit, spent, percent}` sortiert nach `percent` desc |

#### Wiederkehrende Ausgaben

| Method | Path | Body | Beschreibung |
|--------|------|------|--------------|
| GET | `/recurring` | — | Alle Vorlagen mit Kategorie-Info eingebettet |
| POST | `/recurring` | `{type, amount, description, categoryId, interval, dayOfMonth?, startDate, endDate?, autoCreate}` | Vorlage erstellen; `nextRunAt` = `startDate` |
| PUT | `/recurring/:id` | partiell | Update |
| DELETE | `/recurring/:id` | — | Löschen |
| POST | `/recurring/:id/apply` | — | Einen Eintrag jetzt erzeugen, `nextRunAt` springt einen Schritt vorwärts |
| POST | `/recurring/run-now` | — | Cron-Logik manuell triggern (debug/test) |

### `/api/shopping` (`routes/shopping.ts`)

#### Listen

| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | `/lists` | Alle Listen mit `_count.items` |
| POST | `/lists` | `{name}` → neue Liste |
| PUT | `/lists/:id/default` | Setzt diese Liste als `isDefault=true`, alle anderen auf `false` |
| DELETE | `/lists/:id` | Löschen (Cascade auf Items) |

#### Items

| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | `/lists/:id/items` | Items mit `addedBy` + `checkedBy`, sortiert (`checked asc, createdAt asc`) |
| POST | `/items` | `{listId, name, quantity, unit, barcode?, category?, note?}` |
| PUT | `/items/:id` | partiell; `checked=true` setzt `checkedById = req.userId`, `checkedAt = now()` |
| DELETE | `/items/:id` | Löschen |
| DELETE | `/lists/:id/checked` | Alle abgehakten Items dieser Liste löschen |

#### Übernahme in Vorrat

| Method | Path | Body | Beschreibung |
|--------|------|------|--------------|
| POST | `/lists/:id/to-pantry` | `{items: [{shoppingItemId, name, quantity, unit, location?, category?, expiryDate?}]}` | Pro Item: existierendes PantryItem mit gleichem Namen → Menge addieren; sonst neu anlegen. ShoppingItem wird gelöscht. Emittiert `pantry:changed` und `shopping:item-deleted`. Antwort: `{success, added, updated}` |

### `/api/pantry` (`routes/pantry.ts`)

| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | `/items` | `?search=&category=&location=` Filter |
| POST | `/items` | Anlegen + `autoAddIfBelowMin()` |
| PUT | `/items/:id` | Update + `autoAddIfBelowMin()` |
| DELETE | `/items/:id` | Löschen |
| POST | `/bulk` | `{ids[], action: 'delete'\|'location'\|'category'\|'expiry', payload?}` für Massenoperationen |
| GET | `/low-stock` | Items mit `quantity ≤ minQuantity` |
| GET | `/expiring-soon` | Items deren `expiryDate` in den nächsten 7 Tagen liegt |

**Auto-Add-Mechanik** (siehe auch `lib/autoShop.ts`):
- Wird bei POST und PUT auf `/pantry/items` ausgeführt
- Prüft: `minQuantity != null && quantity ≤ minQuantity`
- Sucht **nicht-abgehakten** Item mit gleichem Namen in Default-Liste
- Wenn keiner existiert: legt einen mit Note "Automatisch ergänzt (Mindestbestand)" an

### `/api/tasks` (`routes/tasks.ts`)

#### Tasks

| Method | Path | Body / Query | Beschreibung |
|--------|------|---------------|--------------|
| GET | `/` | `?completed=&assignedToId=&priority=` | Liste mit `assignedTo`/`createdBy` |
| POST | `/` | `{title, description?, priority, dueDate?, assignedToId?, recurring?}` | Anlegen + Socket-Event `tasks:created` |
| PUT | `/:id` | partiell | Update; wenn `completed=true` + `recurring` gesetzt → `spawnRecurringClone()` |
| DELETE | `/:id` | — | Löschen |

#### Vorlagen

| Method | Path | Body | Beschreibung |
|--------|------|------|--------------|
| GET | `/templates/all` | — | Alle Vorlagen |
| POST | `/templates` | `{title, description?, priority, assignedToId?, defaultDueInDays?}` | Neue Vorlage |
| PUT | `/templates/:id` | partiell | Update |
| DELETE | `/templates/:id` | — | Löschen |
| POST | `/templates/:id/spawn` | — | Erzeugt einen Task. `dueDate = now() + defaultDueInDays * 86400000` |

### `/api/calendar` (`routes/calendar.ts`)

| Method | Path | Body / Query | Beschreibung |
|--------|------|---------------|--------------|
| GET | `/events` | `?start=&end=` ISO-Daten | Liefert **expandierte** Vorkommen — wiederkehrende Events werden im Fenster aufgefächert; jedes Vorkommen hat `isRecurring: true` |
| POST | `/events` | `{title, description?, startDate, endDate, allDay?, color?, recurrence?, recurrenceUntil?}` | Anlegen |
| PUT | `/events/:id` | partiell | Update (am Master-Event — ändert alle Vorkommen) |
| DELETE | `/events/:id` | — | Löschen (löscht alle Vorkommen) |

**Recurrence-Expansion** (`expandRecurring()`):
- Bei `recurrence === null` → ein einziges Vorkommen mit Original-Dates
- Sonst: ab `startDate` schrittweise vorwärts (`daily/weekly/monthly/yearly`)
- Stoppt bei `recurrenceUntil` oder am Fenster-Ende
- Hardcap **500 Vorkommen** pro Event (Schutz vor Endlosschleifen)
- Duration bleibt konstant (`endDate - startDate`)

### `/api/recipes` (`routes/recipes.ts`)

| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | `/` | `?search=` Volltextsuche im Titel |
| GET | `/:id` | Einzel-Rezept mit Zutaten + verknüpften `pantryItem`-Mengen |
| POST | `/` | `{title, description?, instructions?, servings, prepMinutes?, tags?, ingredients[]}`; pro Zutat `{name, quantity, unit, pantryItemId?}`. Auto-Linking via `resolvePantryLink()` |
| PUT | `/:id` | Wie POST. Zutaten werden **ersetzt** (DELETE all + INSERT) |
| DELETE | `/:id` | Löschen (Cascade auf Ingredients) |
| POST | `/:id/to-shopping` | `{listId?, servings?}` — alle Zutaten auf Liste setzen, mit Skalierungs-Faktor `servings/recipe.servings`. Existierende Items werden gemerged. |
| POST | `/:id/cook` | `{servings?}` — zieht alle verknüpften PantryItems um die nötige Menge ab. Antwort: `{success, consumed[], missing[]}`. Triggert `autoAddIfBelowMin` für betroffene Items. |

**`resolvePantryLink(name, explicitId?)`**:
- Wenn `explicitId` gesetzt → das nehmen
- Sonst: `pantryItem.findFirst({where: {name: {equals: name}}})` (case-insensitive in SQLite default)
- Sonst: `null`

### `/api/meal-plan` (`routes/mealPlan.ts`)

| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | `/?start=&end=` | Mahlzeiten im Zeitfenster, mit Recipe-Subset |
| POST | `/` | `{date, mealType, recipeId? \| customTitle, servings, notes?}` |
| PUT | `/:id` | partiell, inkl. `cooked` |
| DELETE | `/:id` | Löschen |
| POST | `/:id/cook` | Vorräte abziehen (wie Recipe-Cook) + `cooked=true` setzen |
| POST | `/week-to-shopping` | `{start, end, listId?}` — aggregiert alle Zutaten **aller nicht-gekochten Mahlzeiten** im Fenster, dedupliziert nach Name+Unit, schreibt auf die Liste |

### `/api/barcode` (`routes/barcode.ts`)

| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | `/:code` | Sucht zuerst in `PantryItem`, dann Open Food Facts API. Rückgabe `{source: 'pantry'\|'openfoodfacts', product: {...}}` |

5s Timeout für Open Food Facts; bei Fehler `{source: 'none'}`.

### `/api/stats` (`routes/stats.ts`)

| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | `/overview?year=` | Aggregierte Übersicht für die Stats-Page |

Rückgabe:
```typescript
{
  topCategories: { name, icon, color, total }[],   // Top 8 Ausgaben
  fairness: { name, color, count }[],              // Erledigte Tasks pro User (90 Tage)
  activity30d: { tasksCreated, financeEntries, shoppingItems },
  totals: { pantry, recipes, expired },
  yearTotalSpent: number,
}
```

### `/api/suggestions` (`routes/suggestions.ts`)

| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | `/products?q=` | Auto-Complete-Vorschläge aus Pantry + Shopping-Historie + Rezept-Zutaten |

Gewichtung:
- Pantry-Items: `count = 10` (höchster Boost — vorhandener Vorrat zuerst)
- Shopping-Items: `count += 1` pro Vorkommen (häufig gekaufte Sachen ranken hoch)
- Rezept-Zutaten: nur Fallback wenn nicht in Pantry/Shopping

Bei Treffer in Pantry werden auch `unit`, `category`, `location`, `barcode`
zurückgegeben — Frontend übernimmt sie komplett bei Klick.

### `/api/profile` (`routes/profile.ts`)

User-eigene Personalisierungsfelder + Gesichts-Descriptors für die
Wand-Erkennung.

| Method | Path | Body / Query | Beschreibung |
|--------|------|---------------|--------------|
| GET | `/me` | — | Eigenes Profil (User ohne passwordHash) |
| PUT | `/me` | partielle Felder aus `PROFILE_FIELDS` | Aktualisiert Profil-Felder (name, color, homeLat/Lng/Label, workLat/Lng/Label, commuteMode, weatherLat/Lng) |
| GET | `/face-descriptors` | — | **Alle** Descriptors aller User (mit eingebettetem User-Subset) — vom Wand-Recognizer benutzt |
| POST | `/face-descriptors` | `{descriptor: number[128], label?: string}` | Speichert eigenen Descriptor; validiert auf 128 Floats |
| DELETE | `/face-descriptors/:id` | — | Löscht **nur eigene** Descriptors (404 bei fremden) |

`PROFILE_FIELDS` ist eine Whitelist im Code:
```typescript
['name', 'color', 'homeLat', 'homeLng', 'homeLabel',
 'workLat', 'workLng', 'workLabel', 'commuteMode',
 'weatherLat', 'weatherLng']
```

### `/api/shifts` (`routes/shifts.ts`)

Private Arbeitsschichten — werden im Profil verwaltet und im Wand-Modus
unter "Nächste Schicht" angezeigt.

| Method | Path | Body / Query | Beschreibung |
|--------|------|---------------|--------------|
| GET | `/` | `?userId=&upcoming=true` | Default: eigene Schichten. `upcoming=true` filtert auf `endsAt ≥ now`, limit 10 |
| POST | `/` | `{startsAt, endsAt, note?}` | Anlegen für eingeloggten User |
| PUT | `/:id` | partiell | Update — `404` bei fremder Schicht |
| DELETE | `/:id` | — | Löschen — `404` bei fremder Schicht |

### `/api/external` (`routes/external.ts`)

Server-Side-Proxies für externe APIs. Vorteile:
- Cache (`lib/externalCache.ts`) reduziert Calls und schont Rate-Limits
- API-Keys (TomTom) bleiben Server-side, gelangen nicht ins Frontend
- Vermeidet CORS

| Method | Path | Query | Beschreibung |
|--------|------|-------|--------------|
| GET | `/status` | — | `{weather: true, transit: true, traffic: !!TOMTOM_API_KEY}` |
| GET | `/weather` | `lat, lng` | Open-Meteo: aktuelles + 3-Tage-Forecast. **Kein API-Key**. Cache 15 min |
| GET | `/transit` | `from, to` (Station-Namen, z.B. "Zürich HB") | transport.opendata.ch — Schweizer ÖV (SBB + Verbünde). 4 Verbindungen. Cache 1 min |
| GET | `/traffic` | `fromLat, fromLng, toLat, toLng` | TomTom Routing mit Live-Traffic. Liefert `{durationSec, durationNoTrafficSec, delaySec, distanceM, congestion: 'free' \| 'moderate' \| 'heavy'}`. Cache 3 min. Wenn `TOMTOM_API_KEY` nicht gesetzt: `{enabled: false}` |

Provider-Defaults und Konfiguration:
- **Wetter**: Open-Meteo — kostenlos, keine Registrierung
- **ÖV**: transport.opendata.ch — Schweizer Verbund-Daten, kostenlos
- **Verkehr**: TomTom — Free Tier 2500 calls/day. API-Key kostenlos auf
  developer.tomtom.com erstellen, in `.env` als `TOMTOM_API_KEY`

### `/api/push` (`routes/push.ts`)

| Method | Path | Body | Beschreibung |
|--------|------|------|--------------|
| GET | `/public-key` | — | `{publicKey, enabled}` für Frontend-Subscription |
| POST | `/subscribe` | `{endpoint, keys: {p256dh, auth}, userAgent?}` | Upsert |
| DELETE | `/subscribe` | `{endpoint}` | Löschen |
| POST | `/test` | — | Testmitteilung an alle Subscriptions im Haushalt |

---

## Lib-Module

### `lib/autoShop.ts`

```typescript
getDefaultShoppingListId(): Promise<string | null>
```
Liefert die ID der Liste mit `isDefault=true`, sonst die älteste Liste.
Wird benutzt von Pantry-Auto-Add, Recipe-to-Shopping, Meal-Plan.

```typescript
autoAddIfBelowMin(pantryItemId: string): Promise<void>
```
Idempotent: Prüft Mindestbestand und legt ggf. Eintrag auf Default-Liste
an. Tut nichts wenn:
- `minQuantity` nicht gesetzt
- `quantity > minQuantity`
- keine Default-Liste existiert
- bereits ein nicht-abgehakter Eintrag mit gleichem Namen existiert

### `lib/push.ts`

```typescript
isPushConfigured(): boolean
getPublicKey(): string | null
sendToHousehold(payload: PushPayload): Promise<{sent, failed}>
```

`PushPayload`: `{title, body, url?, tag?}`. `url` wird beim Click in der
Notification verwendet (Service-Worker-Handler navigiert dorthin).

Bei `404` oder `410` vom Push-Service wird die Subscription automatisch
gelöscht (Browser hat Permission entzogen oder ist deinstalliert).

### `lib/recurring.ts`

```typescript
nextDueDate(recurring: 'daily'|'weekly'|'monthly', from: Date): Date
```
Berechnet das nächste Fälligkeitsdatum.

```typescript
spawnRecurringClone(taskId: string): Promise<Task | null>
```
Wird beim Abhaken eines recurring-Task aufgerufen. Erzeugt eine neue
Instanz mit demselben Titel/Priority/Assignee, aber neuem `dueDate`.
**Idempotent**: existiert bereits ein nicht-completed Klon, wird nichts
erzeugt (verhindert Doppel-Spawn bei mehrfachem Klicken).

```typescript
backfillOverdueRecurring(): Promise<number>
```
Findet alle nicht-completed recurring-Tasks mit `dueDate < now` und
spawnt für jeden einen Nachfolger. Wird vom Cron um 03:00 und beim
Server-Start aufgerufen.

### `lib/externalCache.ts`

In-memory TTL-Cache für die External-API-Proxies. Verhindert Spam an
Open-Meteo/TomTom/transport.opendata.ch.

```typescript
cacheGet<T>(key: string): T | null
cacheSet<T>(key: string, value: T, ttlMs: number): void
cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T>
```

`cached()` ist der typische Wrapper — bei Miss wird gefetcht, bei Hit
direkt zurückgegeben. Reicht für 2-3 Nutzer auf einem RPi; für größere
Setups würde Redis Sinn ergeben.

### `lib/recurringFinance.ts`

```typescript
advanceFinanceDate(date, interval, dayOfMonth?): Date
```
Schiebt das Datum um ein Intervall (weekly/monthly/yearly). `dayOfMonth`
wird via `Math.min(day, 28)` geclampt, um Februar-Probleme zu vermeiden.

```typescript
runDueRecurringFinance(): Promise<number>
```
Iteriert alle aktiven `RecurringFinance` mit `autoCreate=true && nextRunAt <= now`.
Erzeugt jeweils `FinanceEntry` und springt `nextRunAt` mit `advanceFinanceDate`
vorwärts — kann mehrere Einträge pro Vorlage erzeugen (Catch-Up). Hardcap
24 pro Lauf, um Endlosschleifen bei kaputtem `nextRunAt` zu vermeiden.

---

## Neue Routes (Wall, Mood, Motion, ShiftPatterns)

### `GET/PUT /wall/config`

Pro-User Wall-Konfiguration (Kartenreihenfolge, Sichtbarkeit, Hintergrundfarbe, Sekundenanzeige).

```
GET  /wall/config          → WallConfig | null
PUT  /wall/config          → WallConfig (upsert)
```

Body für PUT: `{ cards: [{id, enabled, order, wide?}], bgColor?, showSeconds? }`

### `POST /mood` · `GET /mood` · `GET /mood/today`

Mood-Check-in (1–5 Emojis) beim Wall-Login.

```
POST /mood                { mood: 1–5, note? }      → MoodLog
GET  /mood                                           → MoodLog[] (30 Tage)
GET  /mood/today                                     → MoodLog | null
```

### `POST /internal/motion`

Kein Auth — für PIR-Sensor-Script auf dem RPi. Broadcastet `motion-detected`
via Socket.io an alle Wall-Clients.

Header optional: `x-motion-secret: <MOTION_SECRET>` (aus `.env`).

```
POST /internal/motion      → { ok: true }
```

Socket-Event: `motion-detected` → `{ ts: number }` (Unix-Timestamp)

### `GET/POST/PUT/DELETE /shifts/patterns`

Wiederkehrende Schicht-Muster.

```
GET    /shifts/patterns              → ShiftPattern[]
POST   /shifts/patterns              { weekday, startsAt, endsAt, validFrom?, note? }
PUT    /shifts/patterns/:id          Partial<ShiftPattern>
DELETE /shifts/patterns/:id          → { success: true }
POST   /shifts/patterns/generate     → { created: number }  (manuell auslösen)
```

`generateShiftsFromPatterns(days=14)` ist auch als exportierte Funktion verfügbar
und wird täglich um 03:00 vom Cron-Job und einmalig beim Start aufgerufen.

---

## Socket.io-Events

| Event | Payload | Wann |
|-------|---------|------|
| `shopping:item-added` | komplettes Item mit `addedBy` | POST `/shopping/items`, Auto-Add, Recipe-to-Shopping |
| `shopping:item-updated` | komplettes Item | PUT `/shopping/items/:id` |
| `shopping:item-deleted` | `{id}` | DELETE, Übernahme in Vorrat |
| `shopping:checked-cleared` | `{listId}` | DELETE `/lists/:id/checked` |
| `tasks:created` | komplette Task | POST `/tasks`, Template-Spawn, recurring-Clone |
| `tasks:updated` | komplette Task | PUT `/tasks/:id` |
| `tasks:deleted` | `{id}` | DELETE |
| `calendar:created` / `:updated` / `:deleted` | Event / `{id}` | jeweils |
| `pantry:changed` | `{type: 'created'\|'updated'\|'deleted', id}` | Pantry-Mutationen |
| `finance:changed` | `{type, id}` | Finance-Mutationen |
| `mealplan:changed` | `{type, id}` | MealPlan-Mutationen |

Alle Events gehen an den Raum `'household'`. Im Frontend werden sie in
[`hooks/useRealtimeSync.ts`](../frontend/src/hooks/useRealtimeSync.ts) auf
Query-Keys gemappt.

---

## Fehler-Konvention

Express-Default-Errorhandler. Routes geben bei bekannten Fehlern strukturiert
zurück:

```json
{ "error": "Beschreibung des Fehlers" }
```

mit passendem HTTP-Status (400, 404, 409, 500). Der axios-Client im
Frontend zeigt diese Message als Toast (siehe `api/client.ts`).

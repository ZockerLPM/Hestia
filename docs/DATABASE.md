# Datenbank-Schema

Hestia nutzt **SQLite** als Datei-DB (`backend/prisma/data/hestia.db`) und
**Prisma 5** als ORM. Schema lebt in
[`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma).

## Generator + Datasource

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

`DATABASE_URL` kommt aus `.env`, z.B. `file:./data/hestia.db`. Der relative
Pfad ist **relativ zum `prisma/`-Verzeichnis** — die DB liegt also unter
`backend/prisma/data/hestia.db`.

## Modelle (vollständig)

### `User`

```prisma
model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  passwordHash String
  color        String   @default("#6366f1")
  createdAt    DateTime @default(now())

  financeEntries FinanceEntry[]
  addedItems     ShoppingItem[] @relation("AddedBy")
  checkedItems   ShoppingItem[] @relation("CheckedBy")
  tasksCreated   Task[]         @relation("TaskCreator")
  tasksAssigned  Task[]         @relation("TaskAssignee")
  calendarEvents CalendarEvent[]
}
```

| Feld | Bedeutung |
|------|-----------|
| `id` | cuid — kompakter, sortierbarer Identifier |
| `email` | Unique, Login-Identifier |
| `passwordHash` | bcrypt-Hash (10 Rounds), nie in API-Responses |
| `color` | Hex-Farbe für Avatar-Initiale (z.B. `#ec4899`) |

**Beziehungen:**
- `financeEntries` — alle Finanzeinträge die der User erstellt hat
- `addedItems`/`checkedItems` — Einkaufsartikel (zwei separate Foreign-Keys
  auf `ShoppingItem`, daher Named Relations)
- `tasksCreated`/`tasksAssigned` — Tasks die er erstellt bzw. zugewiesen
  bekommen hat
- `calendarEvents` — vom User erstellte Termine

### `FinanceCategory`

```prisma
model FinanceCategory {
  id            String  @id @default(cuid())
  name          String
  icon          String  @default("💰")
  color         String  @default("#6366f1")
  type          String  // "income" | "expense" | "both"
  monthlyBudget Float?

  entries FinanceEntry[]
}
```

| Feld | Bedeutung |
|------|-----------|
| `type` | Filtert, ob Kategorie für Einnahmen, Ausgaben oder beides nutzbar ist |
| `monthlyBudget` | Wenn gesetzt → erscheint in `/finance/budgets`-Endpoint mit Auslastung |

Beim Seed werden 12 typische Kategorien angelegt (Lebensmittel, Miete,
Strom etc.).

### `FinanceEntry`

```prisma
model FinanceEntry {
  id          String          @id @default(cuid())
  type        String          // "income" | "expense"
  amount      Float
  description String
  date        DateTime
  categoryId  String
  userId      String
  createdAt   DateTime        @default(now())

  category FinanceCategory @relation(fields: [categoryId], references: [id])
  user     User            @relation(fields: [userId], references: [id])
}
```

Ein einzelner Geldeintrag. `userId` zeigt, **wer den Eintrag gemacht hat**
(nicht zwingend, wer das Geld bezahlt hat — Hestia trennt nicht zwischen
Käufer und Eintragender).

### `RecurringFinance`

```prisma
model RecurringFinance {
  id          String   @id @default(cuid())
  type        String   // "income" | "expense"
  amount      Float
  description String
  categoryId  String
  userId      String
  interval    String   // "weekly" | "monthly" | "yearly"
  dayOfMonth  Int?     // 1-28 für monthly/yearly
  startDate   DateTime
  endDate     DateTime?
  active      Boolean  @default(true)
  lastRunAt   DateTime?
  nextRunAt   DateTime
  autoCreate  Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

**Vorlage** für wiederkehrende Ausgaben/Einnahmen (z.B. Miete, Gehalt).
Keine FK-Constraint auf `categoryId`/`userId` aktuell — pragmatisch, da
SQLite eh keine ON DELETE CASCADE auf changed columns hat.

- `interval` + optionaler `dayOfMonth` legen die Frequenz fest.
- `nextRunAt` ist der nächste fällige Termin. Cron prüft täglich, ob
  `nextRunAt <= now()` und erzeugt einen `FinanceEntry`.
- `autoCreate = false` macht den Eintrag zur reinen **Vorlage** — der User
  muss manuell "Anwenden" klicken.
- `active = false` pausiert den Cron-Lauf.
- `dayOfMonth` ist auf **max. 28** geclampt, um Februar-Probleme zu
  vermeiden (siehe `advanceFinanceDate` in `lib/recurringFinance.ts`).

### `ShoppingList` + `ShoppingItem`

```prisma
model ShoppingList {
  id        String         @id @default(cuid())
  name      String
  isDefault Boolean        @default(false)
  createdAt DateTime       @default(now())

  items ShoppingItem[]
}

model ShoppingItem {
  id          String       @id @default(cuid())
  listId      String
  name        String
  quantity    Float        @default(1)
  unit        String       @default("Stück")
  checked     Boolean      @default(false)
  barcode     String?
  category    String?
  note        String?
  addedById   String?
  checkedById String?
  checkedAt   DateTime?
  createdAt   DateTime     @default(now())

  list      ShoppingList @relation(fields: [listId], references: [id], onDelete: Cascade)
  addedBy   User?        @relation("AddedBy", fields: [addedById], references: [id])
  checkedBy User?        @relation("CheckedBy", fields: [checkedById], references: [id])
}
```

- `ShoppingList.isDefault` markiert die Liste, in die **Auto-Add aus
  Mindestbestand und Rezept-Übernahmen** schreiben.
- `onDelete: Cascade` auf `list` — beim Löschen einer Liste fliegen auch
  alle Items raus.
- `checked` + `checkedById` + `checkedAt`: wer hat wann abgehakt.

### `PantryItem`

```prisma
model PantryItem {
  id          String    @id @default(cuid())
  name        String
  quantity    Float
  unit        String    @default("Stück")
  barcode     String?
  expiryDate  DateTime?
  category    String?
  location    String?
  minQuantity Float?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  ingredients RecipeIngredient[]
}
```

| Feld | Bedeutung |
|------|-----------|
| `location` | "Kühlschrank", "Tiefkühl", "Vorratskammer", "Keller", "Sonstiges" |
| `minQuantity` | Wenn gesetzt und `quantity ≤ minQuantity` → Auto-Add auf Einkaufsliste |
| `barcode` | Aus EAN-13 Scan oder Open-Food-Facts-Lookup |
| `ingredients` | Backrelation: welche Rezept-Zutaten zeigen auf dieses Item |

### `Recipe` + `RecipeIngredient`

```prisma
model Recipe {
  id           String   @id @default(cuid())
  title        String
  description  String?
  instructions String?
  servings     Int      @default(2)
  prepMinutes  Int?
  imageUrl     String?
  tags         String?
  createdById  String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  ingredients RecipeIngredient[]
  mealPlans   MealPlan[]
}

model RecipeIngredient {
  id           String  @id @default(cuid())
  recipeId     String
  name         String
  quantity     Float
  unit         String  @default("Stück")
  pantryItemId String?
  order        Int     @default(0)

  recipe     Recipe      @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  pantryItem PantryItem? @relation(fields: [pantryItemId], references: [id], onDelete: SetNull)
}
```

- Auto-Linking: Wenn beim Speichern eines Rezepts der Zutaten-Name dem
  Namen eines existierenden `PantryItem` entspricht (case-insensitive),
  setzt `resolvePantryLink()` in `routes/recipes.ts` die `pantryItemId`
  automatisch — wichtig für "Gekocht!" (zieht Vorräte ab).
- `order` für stabile Sortierung der Zutaten.
- `tags` ist ein einfaches Komma-getrenntes String-Feld (keine separate
  Tag-Tabelle — bewusst pragmatisch).

### `MealPlan`

```prisma
model MealPlan {
  id          String    @id @default(cuid())
  date        DateTime
  mealType    String    // "breakfast" | "lunch" | "dinner" | "snack"
  recipeId    String?
  customTitle String?
  servings    Int       @default(2)
  cooked      Boolean   @default(false)
  cookedAt    DateTime?
  notes       String?
  createdAt   DateTime  @default(now())

  recipe Recipe? @relation(fields: [recipeId], references: [id], onDelete: SetNull)
}
```

Mahlzeitenplanung. Entweder `recipeId` (verknüpftes Rezept, dann
Zutaten-Verknüpfung beim Cook möglich) **oder** `customTitle` ("Reste vom
Vortag") — beide gleichzeitig sind erlaubt aber selten sinnvoll.

### `Task` + `TaskTemplate`

```prisma
model TaskTemplate {
  id            String   @id @default(cuid())
  title         String
  description   String?
  priority      String   @default("medium")
  assignedToId  String?
  defaultDueInDays Int?
  createdAt     DateTime @default(now())
}

model Task {
  id           String    @id @default(cuid())
  title        String
  description  String?
  completed    Boolean   @default(false)
  priority     String    @default("medium")
  dueDate      DateTime?
  recurring    String?
  assignedToId String?
  createdById  String?
  completedAt  DateTime?
  createdAt    DateTime  @default(now())

  assignedTo User? @relation("TaskAssignee", fields: [assignedToId], references: [id])
  createdBy  User? @relation("TaskCreator", fields: [createdById], references: [id])
}
```

- `priority`: "low" | "medium" | "high" (Frontend-Konvention, kein Enum).
- `recurring`: "daily" | "weekly" | "monthly" oder `null`. Wird **nicht**
  als Cron erzeugt, sondern beim Setzen auf `completed=true` wird sofort
  eine neue Instanz mit neuem `dueDate` erstellt (siehe
  `lib/recurring.ts`). Der nächtliche Cron ist nur Sicherheitsnetz für
  Tasks mit überfälligem `dueDate`, die nie abgehakt wurden.
- `TaskTemplate` — Vorlage, die per `POST /tasks/templates/:id/spawn`
  einen neuen `Task` erzeugt. `defaultDueInDays` wird auf jetzt addiert.

### `CalendarEvent`

```prisma
model CalendarEvent {
  id              String    @id @default(cuid())
  title           String
  description     String?
  startDate       DateTime
  endDate         DateTime
  allDay          Boolean   @default(false)
  color           String    @default("#6366f1")
  recurrence      String?   // "daily" | "weekly" | "monthly" | "yearly"
  recurrenceUntil DateTime?
  createdById     String?
  createdAt       DateTime  @default(now())

  createdBy User? @relation(fields: [createdById], references: [id])
}
```

- `recurrence` + `recurrenceUntil`: Wiederholungen werden **nicht**
  materialisiert. Stattdessen expandiert `routes/calendar.ts` beim GET
  on-the-fly bis zu 500 Vorkommen im Anfrage-Zeitfenster.
- `color` ist ein freier Hex-String, im Frontend gibt es 7 Presets.

### `PushSubscription`

```prisma
model PushSubscription {
  id        String   @id @default(cuid())
  userId    String
  endpoint  String   @unique
  p256dh    String
  authKey   String
  userAgent String?
  createdAt DateTime @default(now())
}
```

Eine Push-Subscription pro Browser-Profil. `endpoint` ist die VAPID-URL
des Push-Service (Google FCM, Mozilla autopush, etc.). Bei 404/410 vom
Push-Service löscht `lib/push.ts` den Eintrag automatisch.

## Beziehungs-Diagramm

```
User ──┬─────► FinanceEntry ──► FinanceCategory ◄── RecurringFinance
       │
       ├─────► ShoppingItem.addedBy / .checkedBy ──► ShoppingList
       │
       ├─────► Task.createdBy / .assignedTo
       │
       └─────► CalendarEvent.createdBy

PantryItem ◄── RecipeIngredient ──► Recipe ──► MealPlan

PushSubscription (loose, userId String)
TaskTemplate    (loose, kein FK)
```

## Migrations-Strategie

Hestia nutzt **`prisma db push`** statt `prisma migrate dev`. Hintergrund:
- Single-Developer-Projekt mit kleinem Team
- SQLite-File ist trivial zu sichern (kopieren)
- Migrations-History wäre Overhead

**Konsequenz**: Bei Schema-Änderungen wird das DB-File "in-place"
modifiziert. **Datenverlust ist möglich**, wenn z.B. eine NOT-NULL-Spalte
hinzukommt. Workflow:

1. Vor jeder Änderung: `cp data/hestia.db data/hestia.db.bak`
2. Schema-File ändern
3. `npm run db:push` (führt auch `prisma generate` aus)
4. Falls Fehler: DB-Backup zurückkopieren, Schema fixen

Siehe [DEV-WORKFLOW.md](./DEV-WORKFLOW.md#datenbank-workflow) für Details.

## Seeding

`backend/src/seed.ts` legt beim ersten Setup an:

- 2 Demo-User (`person1@hestia.local` / `person2@hestia.local`, beide
  Passwort `hestia123`)
- 12 Finance-Kategorien
- 1 Default-ShoppingList "Wocheneinkauf"
- 6 Demo-Pantry-Items
- 1 Sample-Task

Mit `npm run db:seed` ausführen.

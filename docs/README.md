# Hestia — Dokumentation

Hestia ist eine selbstgehostete Haushalts-Management-Webapp mit Finanzen,
Einkaufslisten, Vorratsverwaltung, Rezepten, Mahlzeitenplaner, Aufgaben,
Kalender und Statistiken — geschrieben in TypeScript für Node.js + React.

Diese Dokumentation deckt den **vollständigen Code, das Daten­modell, das
Deployment und den Dev-Workflow** ab.

---

## Wo finde ich was?

| Dokument | Inhalt |
|----------|--------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System-Überblick: Komponenten, Datenfluss, Realtime, PWA, Tech-Stack |
| [DATABASE.md](./DATABASE.md) | Vollständiges Prisma-Schema mit Erklärungen pro Modell und Beziehungen |
| [BACKEND.md](./BACKEND.md) | Jeder Endpoint, jede Lib, Auth-Middleware, Socket.io, Cron-Jobs |
| [FRONTEND.md](./FRONTEND.md) | Jede Page, Komponente, Hook, Store, API-Client, Service-Worker |
| [DEPLOYMENT-RPI.md](./DEPLOYMENT-RPI.md) | Production-Deploy auf RPi 4 mit Docker + Caddy + selbstsigniertem HTTPS |
| [DEV-WORKFLOW.md](./DEV-WORKFLOW.md) | Branches, Commits, DB-Migrations, Tests, Debugging |

## Tech-Stack auf einen Blick

```
Backend                Frontend                Infra
─────────              ─────────               ──────
Node.js 22             React 18                Docker / docker-compose
Express                Vite 6                  Caddy (Reverse Proxy)
Prisma 5 + SQLite      TypeScript 5            mkcert (lokales HTTPS)
Socket.io              Tailwind 3              SQLite-File-Backups
node-cron              TanStack Query 5        Web Push (VAPID)
JWT (jsonwebtoken)     Zustand                 PWA (vite-plugin-pwa)
bcrypt                 Recharts                Workbox Service Worker
web-push               ZXing (Kamera-Scan)
                       Tesseract.js (OCR)
                       face-api.js (Wand-Erkennung)
                       react-hot-toast
                       idb-keyval (Offline)
                       Socket.io-Client

Externe APIs (server-side proxy):
- Open-Meteo (Wetter, kein Key)
- transport.opendata.ch (CH-ÖV, kein Key)
- TomTom Routing (Verkehr, optionaler Key)
```

## Verzeichnisstruktur

```
Hestia/
├── backend/                     Node.js API
│   ├── prisma/
│   │   ├── schema.prisma        Datenmodell
│   │   └── data/hestia.db       SQLite-DB (im Gitignore)
│   ├── scripts/
│   │   └── generate-vapid.mjs   VAPID-Keys für Web Push
│   ├── src/
│   │   ├── index.ts             App-Bootstrap, Cron, Socket.io
│   │   ├── middleware/auth.ts   JWT-Middleware
│   │   ├── lib/                 Geteilte Logik (push, recurring, autoShop)
│   │   ├── routes/              Express-Router pro Domäne
│   │   └── seed.ts              Demo-Daten
│   ├── Dockerfile               Multi-Stage-Build
│   └── package.json
├── frontend/                    React-App
│   ├── index.html               PWA-Meta-Tags
│   ├── public/
│   │   ├── icons/               App-Icons + SVG-Source
│   │   └── models/              face-api.js-Modelle (von fetch-Skript befüllt)
│   ├── scripts/
│   │   ├── generate-icons.mjs   PNG-Icons aus SVG
│   │   └── fetch-face-models.mjs face-api-Modelle nach public/models/
│   ├── src/
│   │   ├── main.tsx             React-Root + Toaster
│   │   ├── App.tsx              Router-Konfig
│   │   ├── sw.ts                Custom Service Worker (Workbox)
│   │   ├── index.css            Tailwind + Dark-Mode-Overrides
│   │   ├── api/                 Axios-Client, Push, Socket, Offline-Queue
│   │   ├── components/          UI-Bausteine, Layout, Toggles
│   │   │   └── wall/            Wand-spezifische Komponenten (Sammelmodus)
│   │   ├── hooks/               Realtime-Sync, PWA-Update, Offline
│   │   ├── lib/                 Receipt-OCR-Parser
│   │   ├── pages/               Top-Level-Routes
│   │   └── store/               Zustand-Stores (auth, theme)
│   ├── vite.config.ts           Build, PWA, Chunks, Dev-Proxy
│   ├── tailwind.config.js
│   ├── Dockerfile
│   └── nginx.conf               Reverse-Proxy in der Frontend-Image
├── docs/                        Diese Dokumentation
├── docker-compose.yml           Lokaler All-in-One-Start
└── .gitignore
```

## Quick-Start (5 Minuten zum Laufen)

```powershell
# Backend
cd s:\Programmieren\Hestia\backend
copy .env.example .env
npm install
npx prisma db push
npm run db:seed
npm run dev          # http://localhost:3001

# Frontend (neues Terminal)
cd s:\Programmieren\Hestia\frontend
npm install
npm run dev          # http://localhost:3000
```

Login: `person1@hestia.local` / `hestia123`

Für Production-Deploy siehe [DEPLOYMENT-RPI.md](./DEPLOYMENT-RPI.md).

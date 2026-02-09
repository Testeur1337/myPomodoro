# MyPomodoro

A fast, GoodTime-inspired Pomodoro web app with rich stats, local JSON persistence, and a zero-external-services footprint. Designed to run locally on Windows and deploy later to a small VPS with minimal changes.

## Features
- Pomodoro timer with configurable focus, short break, and long break durations.
- Long break interval control, auto-start toggles, keyboard shortcuts.
- Topics/tags with per-topic stats.
- Dashboard: daily stats, streaks, charts, history table, and trends.
- Export/import JSON backups.
- Local server mode (JSON files) or pure static mode (localStorage fallback).

## Tech Stack
- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express + TypeScript
- **Charts:** Recharts

## Quick Start (Windows)

### Prerequisites
- Install **Node.js LTS** from https://nodejs.org

### One-command dev
```powershell
npm install
npm run dev
```
- Client: http://localhost:5173
- Server: http://localhost:5174

### Production build
```powershell
npm run build
npm run start
```
The server will serve the built client from `client/dist`.

## Data Storage
All data is stored as JSON in:
```
/server/data/
  settings.json
  topics.json
  sessions.json
```

### Backup & Restore
- Use **Settings → Download backup JSON** to export.
- Use **Settings → Import JSON** to restore (replaces local data).

## Deploy Later to a VPS
1. Copy the repo (or built artifacts) to the server.
2. Run `npm install`.
3. Build: `npm run build`.
4. Start: `npm run start`.
5. Set a custom port with `PORT` if needed.

The data JSON files live in `/server/data` and can be backed up or migrated to another machine.

### Render deployment tip
- Use the repo root as the service root so the `postinstall` script can install client/server dependencies.
- Build command: `npm run build`
- Start command: `npm run start`

## API Endpoints
```
GET  /api/settings
PUT  /api/settings
GET  /api/topics
POST /api/topics
PUT  /api/topics/:id
DELETE /api/topics/:id
GET  /api/sessions?from=&to=&topicId=&type=
POST /api/sessions
PUT  /api/sessions/:id
DELETE /api/sessions/:id
POST /api/import
GET  /api/export
```

## Notes
- Static mode (localStorage fallback) can be enabled in Settings if the server is unavailable.
- Timer state is persisted so refreshes keep your progress.

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


## Full Netlify Deployment Guide (Next.js client-only)

This project includes a dedicated Netlify-friendly frontend in `next-client/`.
It is intentionally configured to run entirely in the browser with localStorage.

### What this deployment mode means
- Netlify hosts only static frontend files.
- No Node/Express server is deployed.
- No `server/data/*.json` files are required.
- User data is saved in each browser's localStorage.

### 1) Prepare your repository
1. Make sure your latest changes are committed and pushed to the branch Netlify will build.
2. Confirm these files exist in the repo root:
   - `netlify.toml`
   - `next-client/package.json`
   - `next-client/next.config.mjs`
3. Confirm the Netlify config has:
   - `base = "next-client"`
   - `command = "npm run build"`
   - `publish = "out"`

### 2) Create the Netlify site
1. Log in to Netlify and click **Add new site** → **Import an existing project**.
2. Connect your Git provider (GitHub/GitLab/Bitbucket).
3. Select this repository.
4. Select the branch you want to deploy (usually `main`).

### 3) Set build configuration in Netlify UI
Use these values:

- **Base directory:** `next-client`
- **Build command:** `npm run build`
- **Publish directory:** `out`

These values match the checked-in `netlify.toml`.

### 4) Set required environment variable
In **Site configuration** → **Environment variables**, add:

- `NEXT_PUBLIC_FORCE_LOCAL_STORAGE` = `true`

Why: this forces the app to skip `/api` calls and use localStorage-only mode.

### 5) Trigger deploy
1. Click **Deploy site** (first deploy) or trigger a new deploy from the **Deploys** tab.
2. Wait for build completion.
3. Open the generated Netlify URL.

### 6) Verify deployment after publish
After deployment, verify:
- App loads (no blank page).
- Timer can start/stop/reset.
- Creating topics works.
- Stats/History update after a completed session.
- Refreshing the page keeps saved data (localStorage persistence).

### Troubleshooting

#### A) `next: not found`
- Cause: dependencies were not installed in the `next-client` base.
- Fix: ensure Base directory is exactly `next-client` and build command is `npm run build`.

#### B) TypeScript build failure in `next-client/src/components/StatsDashboard.tsx`
- Cause: strict type/syntax issue in recent commit.
- Fix: pull latest branch with the StatsDashboard fixes and redeploy.

#### C) Build fails because Netlify is using wrong folder
- Symptom: it tries to build from repo root or wrong publish path.
- Fix: check Netlify UI values and `netlify.toml` are aligned:
  - base: `next-client`
  - build command: `npm run build`
  - publish: `out`

### Data and backup notes for Netlify mode
- Because this mode is localStorage-only, data is browser/device specific.
- Clearing browser storage will erase local app data.
- Use in-app backup/export regularly if you want portable backups.

### Optional: custom domain
1. In Netlify, open **Domain management**.
2. Add custom domain.
3. Follow DNS instructions from Netlify.
4. Enable HTTPS (Netlify provisions certificates automatically).

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

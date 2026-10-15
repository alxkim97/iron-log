# Iron Log

Workout logger. Phone (installable PWA — the gym logger that replaces HEVY),
web, and Windows desktop (Electron) from one Vite codebase — the same setup as
WorkLog and Coin.

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Browser dev server (also reachable from your phone on the same Wi-Fi) |
| `npm run demo` | Same, with fake in-memory data instead of Supabase — for design work |
| `npm test` | HEVY importer tests |
| `npm run build` | Build the web app into `dist/` |
| `npm run electron:dev` | Desktop app against the dev server |
| `npm run electron:build` | Build + package the Windows installer into `release/` |
| `npm run release` | Build installer and publish it as a GitHub Release (auto-update) |
| `npm run shots -- file.json` | Screenshot the running app (see WorkLog's `scripts/shots.example.json`) |
| `npm run icons` | Re-render the icons from `public/favicon.svg` |

**Bump `version` in package.json on every change** — it's shown in the app
(sidebar / Settings) so it's obvious which build is running.

## How it fits together

- Data lives in the shared **lifelog** Supabase project, in v1's tables — so
  everything already synced from v1 shows up as-is:
  - `iron_sessions` — one row per session (`user_id`, `session_id`, `data` jsonb)
  - `iron_bwlog`, `iron_checkins`, `iron_exerciselib` — one row per user (`data` jsonb)
  - `iron_prefs` — **new in v2**: routine, rest timer, seen achievements (SQL below)
- Every change is applied on the device first and queued (`src/store.js`
  outbox), then synced — so finishing a workout with no gym signal loses
  nothing. Per-user tables are edited as operations replayed on the freshest
  copy, so phone and PC don't overwrite each other.
- A live workout is kept in the device's storage until you finish it — close
  the app mid-workout and it's still there.
- `src/workout.js` — the workout screen (live at the gym / edit a past session)
- `src/hevy.js` — HEVY CSV import (pure, tested). Uses local dates; v1 used UTC,
  which filed 6am workouts a day early — the importer moves those back.
- `src/views/` — Today, History, Progress (exercises, stats, awards), Body
  (weight + weekly check-ins), Routine, Exercises, Settings.
- Phone vs desktop is one breakpoint (860px) — same views, different CSS.
- `legacy/` — v1 (single-file Electron app) for reference; tag `v1.9.0-legacy`.

## Setup — run once in Supabase (lifelog → SQL Editor)

```sql
create table if not exists iron_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table iron_prefs enable row level security;
drop policy if exists "own row" on iron_prefs;
create policy "own row" on iron_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Until this runs, the routine and settings are kept on each device separately
(the app says so in Settings and shows this SQL there too).

Retire v1 once v2 is in use: v1 pushes its whole local copy back to the cloud,
so a session deleted in v2 would come back if v1 is still running somewhere.

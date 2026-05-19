# Iron Log — Session Handoff

**Last updated:** 2026-05-19 (Condo PC)
**Current version:** v1.4.1
**Branch:** main

---

## App overview

Iron Log is a personal workout session logger — Electron 28 desktop app, vanilla HTML/CSS/JS, no framework. Data stored locally as JSON (`~/Documents/IronLog/ironlog-data.json`) + optional Supabase cloud sync.

**Key files:**
- `index.html` — 5,800+ line renderer (all UI, CSS, and JS in one file)
- `main.js` — Electron main process (IPC, file ops, auto-backup)
- `preload.js` — context bridge (`window.electronAPI`)
- `vendor/supabase.js` — Supabase JS SDK (bundled, no CDN)
- `assets/icon.ico` / `icon.png` — app icons

**Run:** `npm start` | **Build:** `npm run build`
**Data dir (Windows):** `~/Documents/IronLog/`
**Backups:** `~/Documents/IronLog/backups/` (last 10 kept automatically)

---

## Feature overview (v1.4.x)

- **Dashboard** — streak widget, body weight sparkline, walk tracker, weekly dot calendar, stat cards, weekly volume chart, top exercises, muscle volume grid, science-based volume targets
- **All Sessions** — sortable/filterable table, inline quick-delete
- **Session modal** — exercise blocks with warmup/working sets, per-set volume calc, effort stars, exercise autocomplete from library, last performance display, overload suggestions, undo/redo (Ctrl+Z/Y)
- **Overload Tracker** — per-exercise SVG chart (max weight + est. 1RM), full session history table, PR badge
- **Statistics** — most frequent exercises, highest volume lifts, sessions/week chart, personal records, all-time totals
- **Calendar** — month view with session dots, click day to see session list
- **Weekly Check-in** — effort + recovery stars, notes, weekly volume chart, insights
- **Templates** — save/apply/edit templates with per-field exclude toggles
- **Exercise Library** — searchable, filterable by muscle, usage stats, muscle distribution
- **Muscle Recovery** — last-trained heatmap per muscle group (fresh / recovering / fatigued)
- **Excel Import** — paste or upload `.xlsx` to bulk import sessions
- **Supabase Cloud Sync** — sign in, auto-sync every 5 min, manual push/pull, sync log
- **Settings** — display name, training defaults, danger zone, activity heatmap, achievements, PR table, monthly volume chart

---

## What was done this session (2026-05-19, Condo PC)

### Bug fixes (v1.4.1)

**1. Theme not persisted across launches**
- `toggleTheme()` now saves `'light'` or `'dark'` to `localStorage`
- `restoreTheme()` called at the top of `initApp()` before any rendering

**2. Auto-sync interval missing 4 tables**
- The 5-min background `setInterval` was only pushing `iron_sessions` + `iron_bwlog`
- Fixed: now pushes all 6 tables (`iron_sessions`, `iron_bwlog`, `iron_templates`, `iron_checkins`, `iron_walkdata`, `iron_exerciselib`)

**3. Import restoring sessions only**
- `handleImport` was merging `sessions` only — `bwLog`, `templates`, `checkins`, `walkData` from the backup file were silently dropped
- Fixed: now merges all four with deduplication (by date for bwLog, by id for templates, by weekStart for checkins, merge log for walkData)

---

## Previous session summary (v1.4.0, Company PC)

Complete rebuild from v1.3.0. Major additions:
- Supabase cloud sync (sign in, push/pull, 5-min auto-sync, sync log)
- Walk tracker widget with custom goal
- Excel / paste import (`.xlsx` + TSV paste)
- Undo/Redo stack — global (Ctrl+Z/Y) + inside session modal
- Exercise library with autocomplete, usage stats, muscle filter
- Template editing with per-field (weight/reps/sets) exclude toggles
- Last performance display + overload suggestions in session modal
- Topbar live clock, display name, training defaults
- Muscle recovery indicator (fresh / recovering / fatigued)
- Export/More dropdown menus, keyboard shortcuts panel
- Copy last session feature
- Fixed `removeExerciseBlock` crash (undefined `block` variable)

---

## What to continue next session

1. **Test cloud sync** — sign in on company PC, verify all 6 tables sync correctly after v1.4.1
2. **Test import restore** — export backup, clear data, re-import → check bwLog/templates/checkins/walkData all come back
3. **Feature ideas (priority order):**
   - Plate calculator — input target weight, show plates to load per side
   - Nutrition / calorie burn estimate per session (based on duration + volume)
   - Rest timer — countdown between sets with audio cue
   - Body measurements tracker (waist, chest, arms etc.)
   - Dark/light theme pill moved to topbar (currently sidebar-only)

---

## Session protocol

When you type **"git push"** to Claude Code:
1. Claude updates `HANDOFF.md` with session summary
2. Bumps version (major.minor.patch — patch for fixes, minor for new features)
3. Commits all staged changes + HANDOFF.md + package.json
4. Pushes to GitHub (`origin/main`)
5. Returns the handoff prompt for the other PC

## How to continue on company PC

Paste this into a new Claude Code session after pulling latest:

```
Continue Iron Log development. Pull latest from GitHub first.
Read HANDOFF.md for full session context. Current version: v1.4.1.

Key facts:
- Electron 28, vanilla HTML/CSS/JS, single-file renderer (index.html ~5800 lines)
- vendor/supabase.js bundled locally (no CDN)
- Supabase cloud sync: 6 tables (iron_sessions, iron_bwlog, iron_templates, iron_checkins, iron_walkdata, iron_exerciselib)
- Local data: ~/Documents/IronLog/ironlog-data.json
- Run: npm start | Build: npm run build

Last fixed: theme persistence, full auto-sync interval, import restoring all data stores.
Pending: plate calculator, rest timer, body measurements tracker.
```

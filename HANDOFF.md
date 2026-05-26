# Iron Log — Session Handoff

**Last updated:** 2026-05-26 (Company PC)
**Current version:** v1.6.0
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

## What was done this session (2026-05-26, Company PC)

### Major UX update (v1.6.0)

**Split session modal — exercise context panel:**
- Session modal now 980px wide with left pane (form + exercises) and right pane (exercise history)
- Click any exercise name → right pane shows: line chart (last 8 sessions, max weight + est. 1RM), PR, sessions count, last 5 sessions as clickable rows
- Click a row → loads that session's weights into the inputs
- "Load Last" button removed; "▾ history" inline dropdown removed — replaced by the right panel

**Auto-fill last session values:**
- When an exercise name is resolved (typed or autocomplete), inputs are auto-filled with last session's actual values (solid, not placeholders)
- Only fills if inputs are currently empty (won't overwrite manual entries)

**Template exercise autocomplete:**
- New Template modal exercise inputs now have the same autocomplete dropdown as the session modal (library + history)

**Today's Workout popup:**
- On app launch, shows today's workout from the OPTION B PPL Hybrid routine
- Pre-fills session modal with today's exercises (correct set counts, auto-filled last weights)
- Skip dropdown: Skip today / Pause 3 days / Pause 1 week / Turn off
- View Routine opens the full protocol on top (today popup stays open underneath)
- Settings → Appearance: "Daily Workout Prompt" toggle + "Show now" button
- ✕ button only closes modal, doesn't mark as "seen today"

**Dashboard Collapse All:**
- "— COLLAPSE ALL / + EXPAND ALL" toggle button at top-right of dashboard
- Collapses or expands all 6 sections at once; button label reflects current state

**Bug fix — GPU crash on launch:**
- Electron GPU process was crashing on this machine's GPU driver
- Fix: `--disable-gpu --disable-software-rasterizer` flags added to `package.json` start script

---

### Bug fix (v1.5.1)

**Sync badge showing email instead of display name:**
- Race condition: Supabase `getSession()` resolves before `initApp()` finishes loading local data, so `displayName` was still `''` when `updateSyncBadge('online')` first fired
- Fix: added `if (_supaUser) updateSyncBadge('online')` at the end of `initApp()`, after data is fully loaded — badge now always shows saved display name (e.g. "Alex Kim") on startup

---

### UI overhaul + bug fixes (v1.5.0)

**Theme system (NutriLog-inspired):**
- 4 color variants: Volt (yellow, default) · Iron (silver/gunmetal) · Cobalt (electric blue) · Forge (ember orange)
- Each variant works in both dark and light mode
- Gradient sidebar background per variant in dark mode
- Logo icon box now uses gradient fill + glow shadow
- Primary button upgraded to gradient (accent → accent2) with hover lift
- Modal overlays get `backdrop-filter: blur(4px)` for depth
- Light mode cards get box-shadow for depth (was flat before)
- Variant picker added to Settings → Appearance; persists to localStorage

**Bug fixes:**
- More menu (··· More) was white in dark mode — `.em-item` CSS was scoped to export menu only, now covers both
- Display name not saving — input had no `onchange` handler; now auto-saves on change
- Sync badge showing email instead of display name — was checking `_syncEnabled` instead of `_supaUser`
- Duration column showing "5933 min" (Excel import read wrong cell) — display now hides values > 300 as `—`; import capped at 300
- Settings and Exercise Library had unused right-side space — max-width increased to 1200px

---

## Previous session (2026-05-19, Condo PC)

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

1. **Test today's popup** — Settings → Appearance → "Show now" to verify it fires and "Start Session" pre-fills correctly
2. **Test split session modal** — open new session, click each exercise, verify right panel chart + history rows + load-on-click all work
3. **Test auto-fill** — start session, type exercise name that has history, verify inputs fill automatically
4. **Feature ideas (priority order):**
   - Plate calculator — input target weight, show plates to load per side
   - Rest timer — countdown between sets with audio cue
   - Body measurements tracker (waist, chest, arms etc.)

---

## Session protocol

When you type **"git push"** to Claude Code:
1. Claude updates `HANDOFF.md` with session summary
2. Bumps version (major.minor.patch — patch for fixes, minor for new features)
3. Commits all staged changes + HANDOFF.md + package.json
4. Pushes to GitHub (`origin/main`)
5. Returns the handoff prompt for the other PC

## How to continue on another PC

**Step 1 — Pull latest via GitHub Desktop** (Fetch origin → Pull)
**Step 2 — Run `npm install`** in the iron-log folder (only needed after a fresh clone)
**Step 3 — Paste this into a new Claude Code session:**

```
Continue Iron Log development. Read HANDOFF.md for full context. Current version: v1.4.1.

Key facts:
- Electron 28, vanilla HTML/CSS/JS, single-file renderer (index.html ~5800 lines)
- vendor/supabase.js bundled locally (no CDN)
- Supabase cloud sync: 6 tables (iron_sessions, iron_bwlog, iron_templates, iron_checkins, iron_walkdata, iron_exerciselib)
- Local data: ~/Documents/IronLog/ironlog-data.json
- Run: npm start | Build: npm run build
- Git: push/pull via GitHub Desktop ONLY (CLI git push gives 403 on this account)

Last done: Split session modal with exercise history/chart panel, auto-fill last session values, Today's Workout popup with pause options, Collapse All dashboard toggle, template autocomplete, GPU crash fix.
Pending features: plate calculator, rest timer, body measurements tracker.
```

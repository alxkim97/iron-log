import { esc, icon, seg } from '../ui.js'
import { state } from '../store.js'
import { timeAgo } from '../dates.js'

export const PREFS_SQL = `create table if not exists iron_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table iron_prefs enable row level security;
drop policy if exists "own row" on iron_prefs;
create policy "own row" on iron_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());`

export const PHOTOS_SQL = `insert into storage.buckets (id, name, public) values ('iron-photos', 'iron-photos', false)
on conflict (id) do nothing;
drop policy if exists "iron photos own" on storage.objects;
create policy "iron photos own" on storage.objects for all to authenticated
  using (bucket_id = 'iron-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'iron-photos' and (storage.foldername(name))[1] = auth.uid()::text);`

export function syncLine() {
  const s = state.sync
  if (s.syncing) return 'Syncing…'
  if (s.pending) return `${s.pending} change${s.pending === 1 ? '' : 's'} waiting to sync${s.error ? ` — ${s.error}` : ''}`
  if (s.error) return `Sync problem: ${s.error}`
  return s.at ? `Synced ${timeAgo(s.at)}` : 'Not synced yet'
}

export function renderSettings({ isPhone }) {
  const d = state.device
  return `
    <div class="settings">
      ${isPhone ? `
        <section class="card">
          <button class="row-link" data-act="nav" data-view="body">${icon('scale', 20)}<span>Body weight &amp; check-ins</span>${icon('right', 18)}</button>
          <button class="row-link" data-act="nav" data-view="routine">${icon('list', 20)}<span>Routine</span>${icon('right', 18)}</button>
          <button class="row-link" data-act="nav" data-view="exercises">${icon('book', 20)}<span>Exercise library</span>${icon('right', 18)}</button>
        </section>` : ''}

      ${state.prefsCloud ? '' : `
        <section class="card tone-warn">
          <header class="card-head"><h2>${icon('alert', 18)} One-time setup</h2></header>
          <p>Your routine and rest-timer setting are saved on this device only. Run this once in the Supabase SQL editor (lifelog project) so they sync between phone and PC:</p>
          <pre class="sql">${esc(PREFS_SQL)}</pre>
          <div class="row-gap"><button class="btn soft" data-act="copy-sql">Copy SQL</button><button class="btn primary" data-act="reload">I ran it</button></div>
        </section>`}

      ${state.sync.photoError === 'setup' ? `
        <section class="card tone-warn">
          <header class="card-head"><h2>${icon('camera', 18)} Photo storage setup</h2></header>
          <p>Your photos are saved on this device and waiting to upload. Run this once in the Supabase SQL editor (lifelog project):</p>
          <pre class="sql">${esc(PHOTOS_SQL)}</pre>
          <div class="row-gap"><button class="btn soft" data-act="copy-photo-sql">Copy SQL</button><button class="btn primary" data-act="sync">I ran it</button></div>
        </section>` : ''}

      <section class="card">
        <header class="card-head"><h2>${icon('timer', 18)} Workout</h2></header>
        <label class="setting-label">Rest timer after each set</label>
        ${seg('rest', String(state.prefs.restSecs || 90), [['60', '1:00'], ['90', '1:30'], ['120', '2:00'], ['180', '3:00'], ['0', 'Off']])}
        <label class="toggle"><input type="checkbox" data-act="sound" ${d.sound ? 'checked' : ''}><span>Beep when rest is over</span></label>
        <label class="toggle"><input type="checkbox" data-act="wake" ${d.wake ? 'checked' : ''}><span>Keep the screen on during a workout</span></label>
      </section>

      <section class="card">
        <header class="card-head"><h2>${icon('moon', 18)} Appearance</h2></header>
        ${seg('theme', d.theme, [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])}
      </section>

      <section class="card">
        <header class="card-head"><h2>${icon('upload', 18)} Import</h2></header>
        <div class="row-gap">
          <button class="btn soft" data-act="import-hevy">${icon('upload', 16)} HEVY export (.csv)</button>
          <button class="btn soft" data-act="import-backup">${icon('upload', 16)} Iron Log backup (.json)</button>
        </div>
        <p class="muted small">HEVY: Profile → Settings → Export &amp; Import → Export workouts. Already-imported workouts are skipped, so re-importing the full export is safe. The backup option takes v1's <code>Documents\\IronLog\\ironlog-data.json</code> too.</p>
      </section>

      <section class="card">
        <header class="card-head"><h2>${icon('download', 18)} Export</h2></header>
        <div class="row-gap">
          <button class="btn soft" data-act="export-json">${icon('download', 16)} Backup (.json)</button>
          <button class="btn soft" data-act="export-csv">${icon('download', 16)} Every set (.csv)</button>
          <button class="btn soft" data-act="export-hevy">${icon('download', 16)} For HEVY (.csv)</button>
        </div>
      </section>

      <section class="card">
        <header class="card-head"><h2>${icon('sync', 18)} Account</h2></header>
        <p class="setting-line">${esc(state.session?.user?.email || '')}</p>
        <p class="muted small">${esc(syncLine())} · ${state.sessions.length} sessions</p>
        <div class="row-gap">
          <button class="btn soft" data-act="sync">${icon('sync', 16)} Sync now</button>
          ${window.electronAPI ? `<button class="btn soft" data-act="update">Check for updates</button>` : ''}
          <button class="btn ghost" data-act="signout">${icon('logout', 16)} Sign out</button>
        </div>
        <p class="muted small version">Iron Log v${__APP_VERSION__}</p>
      </section>
    </div>`
}

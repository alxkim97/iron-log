// Settings → Claude access (same model as Coin). Claude works through its
// own helper account — never your login. The database (CLAUDE_SQL below)
// enforces what this card switches on:
//   Read           — sessions, routine/settings, body weight, check-ins
//   Direct editing — sessions (add/edit/delete) and the routine only, until
//                    edit_until; after that the database refuses its writes
// Gyms, measurements, body weight and check-ins are never writable by it.
// Every change it makes lands in iron_delegate_log (trigger / function),
// listed here with Undo.
import { supa } from './data.js'
import { esc, icon, toast, confirmBox } from './ui.js'
import { state, saveSession, deleteSessions, setRoutine } from './store.js'

export const CLAUDE_SQL = `-- Iron Log: Claude access (helper account). Safe to run more than once.
create table if not exists iron_delegates (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  delegate_id uuid not null references auth.users(id) on delete cascade,
  delegate_email text not null,
  can_read boolean not null default true,
  edit_until timestamptz,
  edit_note text,
  created_at timestamptz not null default now(),
  primary key (owner_id, delegate_id)
);
alter table iron_delegates enable row level security;
drop policy if exists "owner manages" on iron_delegates;
create policy "owner manages" on iron_delegates for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "delegate reads own grant" on iron_delegates;
create policy "delegate reads own grant" on iron_delegates for select
  using (auth.uid() = delegate_id);

create or replace function iron_can_read(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from iron_delegates where owner_id = owner and delegate_id = auth.uid()
    and (can_read or edit_until > now()))
$$;
create or replace function iron_can_edit(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from iron_delegates where owner_id = owner and delegate_id = auth.uid() and edit_until > now())
$$;

create or replace function iron_add_delegate(helper_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare d uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id into d from auth.users where lower(email) = lower(trim(helper_email));
  if d is null then raise exception 'No account with that email — create it first'; end if;
  if d = auth.uid() then raise exception 'That is your own account — use a separate one for Claude'; end if;
  insert into iron_delegates (owner_id, delegate_id, delegate_email)
    values (auth.uid(), d, lower(trim(helper_email)))
    on conflict (owner_id, delegate_id) do update set can_read = true;
  return d;
end $$;
revoke all on function iron_add_delegate(text) from public, anon;
grant execute on function iron_add_delegate(text) to authenticated;

-- Read access.
drop policy if exists "delegate read" on iron_sessions;
create policy "delegate read" on iron_sessions for select using (iron_can_read(user_id));
drop policy if exists "delegate read" on iron_prefs;
create policy "delegate read" on iron_prefs for select using (iron_can_read(user_id));
drop policy if exists "delegate read" on iron_bwlog;
create policy "delegate read" on iron_bwlog for select using (iron_can_read(user_id));
drop policy if exists "delegate read" on iron_checkins;
create policy "delegate read" on iron_checkins for select using (iron_can_read(user_id));
drop policy if exists "delegate read" on iron_exerciselib;
create policy "delegate read" on iron_exerciselib for select using (iron_can_read(user_id));

-- Sessions: write only inside the editing window.
drop policy if exists "delegate insert" on iron_sessions;
create policy "delegate insert" on iron_sessions for insert with check (iron_can_edit(user_id));
drop policy if exists "delegate update" on iron_sessions;
create policy "delegate update" on iron_sessions for update using (iron_can_edit(user_id)) with check (iron_can_edit(user_id));
drop policy if exists "delegate delete" on iron_sessions;
create policy "delegate delete" on iron_sessions for delete using (iron_can_edit(user_id));

-- Change log: the helper can't read or alter it.
create table if not exists iron_delegate_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null,
  action text not null,   -- insert | update | delete
  target text not null,   -- session | routine
  target_id text,
  before jsonb,
  after jsonb,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);
alter table iron_delegate_log enable row level security;
drop policy if exists "owner reads" on iron_delegate_log;
create policy "owner reads" on iron_delegate_log for select using (auth.uid() = owner_id);
drop policy if exists "owner marks undone" on iron_delegate_log;
create policy "owner marks undone" on iron_delegate_log for update
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create or replace function iron_log_session_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid := coalesce(new.user_id, old.user_id);
begin
  if auth.uid() is null or auth.uid() = owner then return null; end if;
  insert into iron_delegate_log (owner_id, actor_id, action, target, target_id, before, after)
  values (owner, auth.uid(), lower(tg_op), 'session', coalesce(new.session_id, old.session_id),
    case when tg_op <> 'INSERT' then old.data end,
    case when tg_op <> 'DELETE' then new.data end);
  return null;
end $$;
drop trigger if exists iron_sessions_delegate_log on iron_sessions;
create trigger iron_sessions_delegate_log after insert or update or delete on iron_sessions
  for each row execute function iron_log_session_change();

-- Routine: the only part of your settings the helper may change, via this
-- function (it can't write iron_prefs directly). Logged with the old routine.
create or replace function iron_set_routine(owner uuid, new_routine jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare old_routine jsonb;
begin
  if not iron_can_edit(owner) then raise exception 'Direct editing is off'; end if;
  if jsonb_typeof(new_routine -> 'days') is distinct from 'array' then raise exception 'Routine needs a days array'; end if;
  select data -> 'routine' into old_routine from iron_prefs where user_id = owner;
  insert into iron_prefs (user_id, data) values (owner, jsonb_build_object('routine', new_routine))
    on conflict (user_id) do update set data = jsonb_set(iron_prefs.data, '{routine}', new_routine), updated_at = now();
  insert into iron_delegate_log (owner_id, actor_id, action, target, before, after)
    values (owner, auth.uid(), 'update', 'routine', old_routine, new_routine);
end $$;
revoke all on function iron_set_routine(uuid, jsonb) from public, anon;
grant execute on function iron_set_routine(uuid, jsonb) to authenticated;`

const me = () => state.session?.user?.id

async function fetchAll() {
  const [d, l] = await Promise.all([
    supa.from('iron_delegates').select('*').eq('owner_id', me()).order('created_at'),
    supa.from('iron_delegate_log').select('*').order('created_at', { ascending: false }).limit(30),
  ])
  if (d.error) throw d.error
  if (l.error) throw l.error
  return { delegates: d.data, log: l.data }
}
const updateDelegate = async (id, patch) => {
  const { error } = await supa.from('iron_delegates').update(patch).eq('owner_id', me()).eq('delegate_id', id)
  if (error) throw error
}

export const isEditOpen = d => !!d?.edit_until && new Date(d.edit_until) > new Date()
function fmtUntil(iso) {
  const d = new Date(iso)
  const t = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString() ? t : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${t}`
}

function describe(e) {
  if (e.target === 'routine') return 'Changed your routine'
  const s = e.after || e.before || {}
  const verb = e.action === 'insert' ? 'Added' : e.action === 'update' ? 'Edited' : 'Deleted'
  return `${verb} ${esc(s.title || s.program || 'session')} <span class="muted">(${esc(s.date || '')})</span>`
}

// Undo goes through the normal store, so this device updates at once and
// the change syncs like any other edit.
function undo(e) {
  if (e.target === 'routine') { if (!e.before) throw new Error('No earlier routine to go back to'); setRoutine(e.before); return }
  if (e.action === 'insert') deleteSessions([e.target_id])
  else saveSession({ ...e.before, id: e.target_id })
}

// The card renders from a cache so re-renders of Settings don't refetch.
let cache = null, loading = false, failed = false
export function claudeAccessCard() {
  return `
    <section class="card">
      <header class="card-head"><h2>${icon('zap', 18)} Claude access</h2></header>
      <div data-claude-access>${cardBody()}</div>
    </section>`
}

function cardBody() {
  if (failed) return `<p class="muted small">Not set up yet — run this SQL once in Supabase (lifelog → SQL Editor), then tap I ran it.</p>
    <div class="row-gap"><button class="btn soft" data-ca="copy-sql">Copy SQL</button><button class="btn primary" data-ca="refresh">I ran it</button></div>`
  if (!cache) return '<p class="muted small">Loading…</p>'
  const d = cache.delegates[0]
  if (!d) return `
    <p class="muted small">Let Claude read your workouts and, when you allow it, fix sessions or update your routine — through its <b>own</b> account, never your login. It can never change gyms, body weight, measurements or check-ins.</p>
    <ol class="muted small ca-steps">
      <li>Use the helper account you made for Coin (or sign out → Create one, e.g. <code>you+claude@gmail.com</code>).</li>
      <li>Enter its email below.</li>
      <li>On your PC, run <code>node scripts/save-session.js</code> yourself in the iron-log folder and sign in as the helper.</li>
    </ol>
    <form class="bw-add" data-ca-form><input type="email" name="email" placeholder="Helper account email" autocomplete="off"><button class="btn soft" type="submit">Connect</button></form>`
  const open = isEditOpen(d)
  return `
    <p class="setting-line">Helper: <b>${esc(d.delegate_email)}</b></p>
    <label class="toggle"><input type="checkbox" data-ca="read" ${d.can_read ? 'checked' : ''}><span>Can read your workouts, routine and body weight</span></label>
    <label class="setting-label" style="margin-top:14px">Direct editing <span class="muted small">(sessions + routine only)</span></label>
    ${open
      ? `<p class="setting-line">On until <b>${esc(fmtUntil(d.edit_until))}</b>${d.edit_note ? ` — ${esc(d.edit_note)}` : ''}</p>
         <div class="row-gap"><button class="btn soft" data-ca="stop">Stop now</button></div>`
      : `<p class="muted small">Off — Claude can only read.</p>
         <input class="ca-note" data-ca-note placeholder="What for? e.g. apply the new legs day (optional)">
         <div class="row-gap"><button class="btn soft" data-ca="win" data-w="1h">1 hour</button><button class="btn soft" data-ca="win" data-w="today">Rest of today</button><button class="btn soft" data-ca="win" data-w="24h">24 hours</button></div>`}
    <label class="setting-label" style="margin-top:16px">Claude activity</label>
    ${cache.log.length ? `<div class="list">${cache.log.map(e => `
      <div class="ca-log"><div><div>${describe(e)}</div><div class="muted small">${esc(new Date(e.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))}</div></div>
      ${e.undone_at ? '<span class="muted small">Undone</span>' : `<button class="btn small ghost" data-ca="undo" data-id="${esc(e.id)}">Undo</button>`}</div>`).join('')}</div>
      <div class="row-gap"><button class="btn small ghost" data-ca="reload-data">${icon('sync', 14)} Load Claude's changes</button></div>`
    : '<p class="muted small">No changes yet.</p>'}
    <div class="row-gap"><button class="btn small ghost" data-ca="remove">Disconnect</button></div>`
}

const redraw = () => { const el = document.querySelector('[data-claude-access]'); if (el) el.innerHTML = cardBody() }
async function refresh() {
  if (loading || !supa) return
  loading = true
  try { cache = await fetchAll(); failed = false } catch { failed = true }
  loading = false
  redraw()
}

// Called after every render; fetches once per visit to Settings.
export function mountClaudeAccess({ reload }) {
  const el = document.querySelector('[data-claude-access]')
  if (!el) { cache = null; failed = false; return }
  if (!cache && !failed) refresh()
  if (el.dataset.bound) return
  el.dataset.bound = '1'
  const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok) } catch (err) { toast(err.message || 'Failed') } await refresh() }
  el.addEventListener('submit', e => {
    if (!e.target.matches('[data-ca-form]')) return
    e.preventDefault()
    const email = e.target.email.value.trim()
    if (!email.includes('@')) return toast('Enter the helper account email')
    run(async () => { const { error } = await supa.rpc('iron_add_delegate', { helper_email: email }); if (error) throw error }, 'Helper connected — it can read now')
  })
  el.addEventListener('change', e => {
    if (e.target.dataset.ca !== 'read') return
    const d = cache?.delegates[0]
    run(() => updateDelegate(d.delegate_id, { can_read: e.target.checked }), e.target.checked ? 'Reading on' : 'Reading off')
  })
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-ca]')
    if (!b || b.dataset.ca === 'read') return
    const d = cache?.delegates[0]
    const k = b.dataset.ca
    if (k === 'copy-sql') return navigator.clipboard.writeText(CLAUDE_SQL).then(() => toast('SQL copied'))
    if (k === 'refresh') { failed = false; return refresh() }
    if (k === 'reload-data') return reload()
    if (k === 'stop') return run(() => updateDelegate(d.delegate_id, { edit_until: null, edit_note: null }), 'Direct editing stopped')
    if (k === 'win') {
      const now = new Date()
      const until = b.dataset.w === '1h' ? new Date(now.getTime() + 3600e3)
        : b.dataset.w === '24h' ? new Date(now.getTime() + 86400e3)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
      const note = el.querySelector('[data-ca-note]')?.value.trim() || null
      if (!(await confirmBox(`Let Claude add, edit and delete sessions and change your routine until ${fmtUntil(until.toISOString())}? Every change shows here with Undo.`, { ok: 'Allow', danger: false }))) return
      return run(() => updateDelegate(d.delegate_id, { edit_until: until.toISOString(), edit_note: note }), 'Direct editing on')
    }
    if (k === 'undo') {
      const entry = cache.log.find(x => x.id === b.dataset.id)
      return run(async () => {
        undo(entry)
        const { error } = await supa.from('iron_delegate_log').update({ undone_at: new Date().toISOString() }).eq('id', entry.id)
        if (error) throw error
      }, 'Undone')
    }
    if (k === 'remove') {
      if (!(await confirmBox(`Disconnect ${d.delegate_email}? It loses all access immediately. The activity log stays.`, { ok: 'Disconnect' }))) return
      return run(async () => { const { error } = await supa.from('iron_delegates').delete().eq('owner_id', me()).eq('delegate_id', d.delegate_id); if (error) throw error }, 'Helper disconnected')
    }
  })
}

// Claude's command-line access to Iron Log, as the HELPER account saved by
// scripts/save-session.js — never the owner's login. The database limits it
// to what Settings → Claude access allows:
//   read                  while "Can read" is on (or an editing window is open)
//   sessions + routine    writable only while a direct-editing window is open
// Gyms, measurements, body weight and check-ins are read-only to it. Every
// change is logged (iron_delegate_log) and undoable in Settings.
//
// Usage:
//   node scripts/iron-claude.js status
//   node scripts/iron-claude.js export [--from YYYY-MM-DD] [--out file.json]
//   node scripts/iron-claude.js sessions [--from YYYY-MM-DD] [--to YYYY-MM-DD]
//   node scripts/iron-claude.js session <id>
//   node scripts/iron-claude.js put-session <file.json>      add or replace (window only)
//   node scripts/iron-claude.js delete-session <id>          (window only)
//   node scripts/iron-claude.js routine [--out file.json]
//   node scripts/iron-claude.js set-routine <file.json>      (window only)

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/config.js'
import { normalizeSession } from '../src/model.js'

const SESSION_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '.iron-session.json')
const fail = msg => { console.error(msg); process.exit(1) }
const readJson = f => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch (e) { fail(`Can't read ${f}: ${e.message}`) } }
const flag = (args, name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const DATE = /^\d{4}-\d{2}-\d{2}$/

async function connect() {
  if (!existsSync(SESSION_PATH)) fail('No helper session — ask the user to run: node scripts/save-session.js')
  const saved = JSON.parse(readFileSync(SESSION_PATH, 'utf8'))
  const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await supa.auth.setSession({ access_token: saved.access_token, refresh_token: saved.refresh_token })
  if (error) fail('Helper session expired — ask the user to re-run: node scripts/save-session.js\n' + error.message)
  writeFileSync(SESSION_PATH, JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token, saved_at: new Date().toISOString(), email: data.user.email }, null, 2))
  const { data: grants, error: gErr } = await supa.from('iron_delegates').select('*').eq('delegate_id', data.user.id)
  if (gErr) fail(gErr.message)
  if (!grants.length) fail(`${data.user.email} isn't connected — the user enters it in Settings → Claude access.`)
  const grant = grants[0]
  return { supa, me: data.user, grant, owner: grant.owner_id, editOpen: !!grant.edit_until && new Date(grant.edit_until) > new Date() }
}
const requireEdit = ctx => { if (!ctx.editOpen) fail('Direct editing is off — ask the user to open a window in Settings → Claude access.') }

async function fetchSessions(ctx, from = '0000', to = '9999') {
  const out = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await ctx.supa.from('iron_sessions').select('session_id,data').eq('user_id', ctx.owner).order('session_id').range(start, start + 999)
    if (error) fail(error.message)
    for (const r of data) if (r.data && r.data.date >= from && r.data.date <= to) out.push({ ...r.data, id: r.session_id })
    if (data.length < 1000) break
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
async function blob(ctx, table) {
  const { data, error } = await ctx.supa.from(table).select('data').eq('user_id', ctx.owner).maybeSingle()
  if (error) fail(`${table}: ${error.message}`)
  return data?.data ?? null
}

const summary = s => `${s.id}  ${s.date}  ${(s.title || s.program || '').padEnd(14)} ${String(s.duration || 0).padStart(3)}m  ${s.exercises.map(e => `${e.name} ${e.sets.filter(x => x.type !== 'warmup').map(x => `${x.weight}x${x.reps}`).join(',')}`).join(' ; ')}`

function checkSession(s) {
  if (!s || typeof s !== 'object') fail('Session must be a JSON object')
  if (!s.id || typeof s.id !== 'string') fail('Session needs a string id (reuse the existing id to replace one)')
  if (!DATE.test(s.date || '')) fail('Session needs date YYYY-MM-DD')
  if (!Array.isArray(s.exercises) || !s.exercises.length) fail('Session needs a non-empty exercises array')
  for (const e of s.exercises) if (!e.name || !Array.isArray(e.sets)) fail('Every exercise needs name and sets[]')
  return normalizeSession(s)
}
function checkRoutine(r) {
  if (!r || !Array.isArray(r.days) || !r.days.length) fail('Routine needs a non-empty days array')
  for (const d of r.days) {
    if (!d.id || !d.name || !Array.isArray(d.exercises)) fail('Every day needs id, name and exercises[]')
    if (d.dow != null && !(Number.isInteger(d.dow) && d.dow >= 0 && d.dow <= 6)) fail(`${d.name}: dow must be 0–6 or null`)
    for (const e of d.exercises) if (!e.name || !(e.sets > 0)) fail(`${d.name}: every exercise needs name and sets > 0`)
  }
  return r
}

const [cmd, ...args] = process.argv.slice(2)
const ctx = await connect()

switch (cmd) {
  case 'status': {
    console.log(`Helper: ${ctx.me.email}`)
    console.log(`Read: ${ctx.grant.can_read || ctx.editOpen ? 'on' : 'off'}`)
    console.log(`Direct editing: ${ctx.editOpen ? `on until ${new Date(ctx.grant.edit_until).toLocaleString('en-GB')}${ctx.grant.edit_note ? ` — ${ctx.grant.edit_note}` : ''}` : 'off'}`)
    break
  }
  case 'export': {
    const from = flag(args, '--from') || '0000'
    const out = {
      exportedAt: new Date().toISOString(),
      sessions: await fetchSessions(ctx, from),
      prefs: await blob(ctx, 'iron_prefs'),
      bwLog: await blob(ctx, 'iron_bwlog'),
      checkins: await blob(ctx, 'iron_checkins'),
      exerciseLib: await blob(ctx, 'iron_exerciselib'),
    }
    const file = flag(args, '--out')
    if (file) { writeFileSync(file, JSON.stringify(out, null, 2)); console.log(`${out.sessions.length} sessions → ${file}`) }
    else console.log(JSON.stringify(out, null, 2))
    break
  }
  case 'sessions': {
    const list = await fetchSessions(ctx, flag(args, '--from') || '0000', flag(args, '--to') || '9999')
    for (const s of list) console.log(summary(s))
    console.log(`${list.length} sessions`)
    break
  }
  case 'session': {
    const { data, error } = await ctx.supa.from('iron_sessions').select('session_id,data').eq('user_id', ctx.owner).eq('session_id', args[0] || '').maybeSingle()
    if (error) fail(error.message)
    if (!data) fail('No session with that id')
    console.log(JSON.stringify({ ...data.data, id: data.session_id }, null, 2))
    break
  }
  case 'put-session': {
    requireEdit(ctx)
    const s = checkSession(readJson(args[0]))
    const { error } = await ctx.supa.from('iron_sessions').upsert({ user_id: ctx.owner, session_id: s.id, data: s, updated_at: new Date().toISOString() }, { onConflict: 'user_id,session_id' })
    if (error) fail(error.message)
    console.log('Saved: ' + summary(s))
    break
  }
  case 'delete-session': {
    requireEdit(ctx)
    if (!args[0]) fail('Give a session id')
    const { data, error } = await ctx.supa.from('iron_sessions').delete().eq('user_id', ctx.owner).eq('session_id', args[0]).select('session_id')
    if (error) fail(error.message)
    console.log(data.length ? `Deleted ${args[0]}` : 'Nothing deleted (no such session)')
    break
  }
  case 'routine': {
    const r = (await blob(ctx, 'iron_prefs'))?.routine ?? null
    const file = flag(args, '--out')
    if (file) { writeFileSync(file, JSON.stringify(r, null, 2)); console.log(`Routine → ${file}`) }
    else console.log(r ? JSON.stringify(r, null, 2) : 'No saved routine (the app is using its built-in default).')
    break
  }
  case 'set-routine': {
    requireEdit(ctx)
    const r = checkRoutine(readJson(args[0]))
    const { error } = await ctx.supa.rpc('iron_set_routine', { owner: ctx.owner, new_routine: r })
    if (error) fail(error.message)
    console.log(`Routine saved: ${r.days.map(d => `${d.name} (${d.exercises.length})`).join(', ')}`)
    break
  }
  default:
    fail('Commands: status, export, sessions, session, put-session, delete-session, routine, set-routine')
}

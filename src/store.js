// App state, the offline outbox, and the selectors every view shares.
import * as db from './data.js'
import { applyBlobOp } from './blobs.js'
import { buildLibrary, makeMuscleLookup, normalizeSession, exerciseStats, MUSCLES, round1 } from './model.js'
import { DEFAULT_ROUTINE, cloneRoutine } from './routine.js'
import { today, addDays, weekStart, daysBetween, dow } from './dates.js'
import { achievementDefs } from './achievements.js'

const DEVICE_KEY = 'il_prefs'
const CACHE_KEY = 'il_cache'
const OUTBOX_KEY = 'il_outbox'

const defaultDevice = { theme: 'system', sound: true, wake: true }
const loadJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d } catch { return d } }
const saveJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

export const DEFAULT_PREFS = { restSecs: 90, priorityMuscles: [] }

export const state = {
  session: null,
  loaded: false,
  view: 'today',
  sessions: [],
  bwLog: [],
  checkins: [],
  userLib: [],
  prefs: { ...DEFAULT_PREFS },
  prefsCloud: true,          // false until iron_prefs exists (SQL not run yet)
  sync: { pending: 0, syncing: false, error: null, at: null, photoError: null },
  device: { ...defaultDevice, ...loadJson(DEVICE_KEY, {}) },
  ui: {},                    // per-view scratch: selected exercise, month, tabs…
  rev: 0,                    // bumps whenever data changes; derived caches key on it
}

export function saveDevice(patch) {
  Object.assign(state.device, patch)
  saveJson(DEVICE_KEY, state.device)
}

// ── Cache (instant + offline open) ──
function cacheData() {
  saveJson(CACHE_KEY, {
    user: state.session?.user?.id, sessions: state.sessions, bwLog: state.bwLog, checkins: state.checkins,
    userLib: state.userLib, prefs: state.prefs, prefsCloud: state.prefsCloud, at: state.sync.at,
  })
}
export function restoreCache() {
  const c = loadJson(CACHE_KEY, null)
  if (!c || c.user !== state.session?.user?.id) return false
  Object.assign(state, {
    sessions: (c.sessions || []).map(normalizeSession), bwLog: c.bwLog || [], checkins: c.checkins || [],
    userLib: c.userLib || [], prefs: { ...DEFAULT_PREFS, ...(c.prefs || {}) }, prefsCloud: c.prefsCloud !== false,
  })
  state.sync.at = c.at || null
  state.loaded = true
  touch(false)
  return true
}
export function clearLocal() {
  try { localStorage.removeItem(CACHE_KEY); localStorage.removeItem(OUTBOX_KEY) } catch {}
}

// ── Outbox: every change is applied locally first, then queued ──
let outbox = loadJson(OUTBOX_KEY, [])
const saveOutbox = () => { saveJson(OUTBOX_KEY, outbox); state.sync.pending = outbox.length }
state.sync.pending = outbox.length

const BLOB_STATE = { iron_bwlog: 'bwLog', iron_checkins: 'checkins', iron_exerciselib: 'userLib', iron_prefs: 'prefs' }

function applyLocal(op) {
  if (op.kind === 'put') {
    const s = normalizeSession(op.session)
    const i = state.sessions.findIndex(x => x.id === s.id)
    if (i === -1) state.sessions.push(s); else state.sessions[i] = s
  } else if (op.kind === 'del') {
    const ids = new Set(op.ids)
    state.sessions = state.sessions.filter(s => !ids.has(s.id))
  } else if (op.kind === 'blob') {
    const k = BLOB_STATE[op.table]
    state[k] = applyBlobOp(op.table, state[k], op.op)
  }
}

let onChange = () => {}
export const setOnChange = fn => { onChange = fn }

function touch(persist = true) {
  state.rev++
  derived = null
  if (persist) cacheData()
}

const isPhotoOp = o => o.kind === 'photo' || o.kind === 'photo-del'
export const pendingPhoto = path => outbox.find(o => o.kind === 'photo' && o.path === path)?.dataUrl || null
export const queuePhoto = (path, dataUrl) => queue({ kind: 'photo', path, dataUrl })
export function queuePhotoDelete(paths) {
  if (!paths.length) return
  // Not uploaded yet → just drop it from the queue.
  const pending = new Set(outbox.filter(o => o.kind === 'photo' && paths.includes(o.path)).map(o => o.path))
  outbox = outbox.filter(o => !(o.kind === 'photo' && pending.has(o.path)))
  const rest = paths.filter(p => !pending.has(p))
  if (rest.length) queue({ kind: 'photo-del', paths: rest })
  else saveOutbox()
}

function queue(...ops) {
  for (const op of ops) applyLocal(op)
  outbox.push(...ops)
  saveOutbox()
  touch()
  onChange()
  flush()
}

let flushing = null
export function flush() {
  if (flushing) return flushing
  if (!outbox.length || !state.session) return Promise.resolve()
  flushing = (async () => {
    state.sync.syncing = true
    onChange()
    try {
      let i = 0
      while (i < outbox.length) {
        const head = outbox[i]
        // Photos never block sessions: a failed upload waits for the next flush.
        if (isPhotoOp(head)) {
          try {
            if (head.kind === 'photo') await db.uploadPhoto(head.path, await (await fetch(head.dataUrl)).blob())
            else await db.deletePhotos(head.paths)
            outbox.splice(i, 1)
            saveOutbox()
            state.sync.photoError = null
          } catch (e) {
            state.sync.photoError = db.isMissingBucket(e) ? 'setup' : (e?.message || String(e))
            i++
          }
          continue
        }
        let n = 1
        if (head.kind === 'put' || head.kind === 'del') {
          while (i + n < outbox.length && outbox[i + n].kind === head.kind) n++
          const batch = outbox.slice(i, i + n)
          if (head.kind === 'put') {
            const latest = new Map(batch.map(o => [o.session.id, o.session]))
            await db.putSessions([...latest.values()])
          } else {
            await db.deleteSessions([...new Set(batch.flatMap(o => o.ids))])
          }
        } else {
          while (i + n < outbox.length && outbox[i + n].kind === 'blob' && outbox[i + n].table === head.table) n++
          const ops = outbox.slice(i, i + n)
          try {
            let cur = await db.readBlob(head.table)
            for (const o of ops) cur = applyBlobOp(head.table, cur, o.op)
            await db.writeBlob(head.table, cur)
          } catch (e) {
            if (!(head.table === 'iron_prefs' && db.isMissingTable(e))) throw e
            state.prefsCloud = false // kept on this device until the table exists
          }
        }
        outbox.splice(i, n)
        saveOutbox()
      }
      state.sync.error = null
      state.sync.at = new Date().toISOString()
      cacheData()
    } catch (e) {
      state.sync.error = e?.message || String(e)
    } finally {
      state.sync.syncing = false
      flushing = null
      onChange()
    }
  })()
  return flushing
}

// ── Load ──
export async function loadAll() {
  await flush()
  if (outbox.some(o => !isPhotoOp(o))) throw new Error(state.sync.error || 'Offline')
  const missing = Symbol('missing')
  const blob = t => db.readBlob(t).catch(e => { if (t === 'iron_prefs' && db.isMissingTable(e)) return missing; throw e })
  const [sessions, bw, ci, lib, prefs] = await Promise.all([
    db.fetchSessions(), blob('iron_bwlog'), blob('iron_checkins'), blob('iron_exerciselib'), blob('iron_prefs'),
  ])
  state.sessions = sessions.map(normalizeSession)
  state.bwLog = Array.isArray(bw) ? bw : []
  state.checkins = Array.isArray(ci) ? ci : []
  state.userLib = Array.isArray(lib) ? lib : []
  const wasLocalOnly = !state.prefsCloud
  state.prefsCloud = prefs !== missing
  // Table just created: push what this device kept meanwhile instead of
  // replacing it with an empty row.
  const promote = prefs === null && wasLocalOnly && Object.keys(state.prefs).length > Object.keys(DEFAULT_PREFS).length
  if (prefs !== missing && !promote) state.prefs = { ...DEFAULT_PREFS, ...(prefs || {}) }
  for (const op of outbox) applyLocal(op) // anything queued meanwhile
  if (promote) { outbox.push({ kind: 'blob', table: 'iron_prefs', op: { type: 'merge', patch: { ...state.prefs } } }); saveOutbox(); flush() }
  state.loaded = true
  state.sync.at = new Date().toISOString()
  state.sync.error = null
  touch()
}

// ── Mutations ──
export function saveSession(s) {
  const clean = normalizeSession(s)
  clean.totalVol = Math.round(sessionVol(clean) * 100) / 100
  for (const e of clean.exercises) e.totalVol = Math.round(exerciseStats(e, isCardio(e.name)).vol * 100) / 100
  queue({ kind: 'put', session: clean })
  return clean
}
export const saveSessions = list => queue(...list.map(s => ({ kind: 'put', session: normalizeSession(s) })))
export const deleteSessions = ids => queue({ kind: 'del', ids })
export const blobOp = (table, op) => queue({ kind: 'blob', table, op })
export const setPrefs = patch => blobOp('iron_prefs', { type: 'merge', patch })

export const routine = () => state.prefs.routine || DEFAULT_ROUTINE
export const setRoutine = r => setPrefs({ routine: cloneRoutine(r) })

// ── Derived (rebuilt when rev changes) ──
let derived = null
function D() {
  if (derived) return derived
  const library = buildLibrary(state.userLib)
  const lookup = makeMuscleLookup(library)
  const sorted = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0))
  const ex = new Map()
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = sorted[i]
    for (const e of s.exercises) {
      const k = e.name.toLowerCase()
      if (!ex.has(k)) ex.set(k, { key: k, name: e.name, entries: [] })
      const rec = ex.get(k)
      rec.name = e.name
      rec.entries.push({ date: s.date, sid: s.id, ex: e, st: exerciseStats(e, lookup(e.name).primary === 'Cardio') })
    }
  }
  derived = { library, lookup, sorted, ex, vol: new Map() }
  return derived
}

export const library = () => D().library
export const muscles = name => D().lookup(name)
export const isCardio = name => D().lookup(name).primary === 'Cardio'
export const sortedSessions = () => D().sorted
export const exerciseIndex = () => D().ex
export const historyFor = name => D().ex.get(String(name || '').trim().toLowerCase()) || null
export const sessionById = id => state.sessions.find(s => s.id === id) || null

export function sessionVol(s) {
  const cache = derived?.vol
  if (cache?.has(s)) return cache.get(s)
  const v = s.exercises.reduce((a, e) => a + exerciseStats(e, isCardio(e.name)).vol, 0)
  cache?.set(s, v)
  return v
}

// Last time this exercise was done, before a given date (or ever).
export function lastFor(name, beforeDate = '9999', exceptId = null) {
  const h = historyFor(name)
  if (!h) return null
  for (let i = h.entries.length - 1; i >= 0; i--) {
    const e = h.entries[i]
    if (e.date <= beforeDate && e.sid !== exceptId) return e
  }
  return null
}

// Best-ever numbers, optionally ignoring one session (to detect new PRs).
export function bestFor(name, exceptId = null) {
  const h = historyFor(name)
  let maxW = 0, e1 = 0, vol = 0
  for (const e of h?.entries || []) {
    if (e.sid === exceptId) continue
    maxW = Math.max(maxW, e.st.maxW); e1 = Math.max(e1, e.st.e1rm); vol = Math.max(vol, e.st.vol)
  }
  return { maxW, e1rm: e1, vol }
}

export function sessionsBetween(from, to) {
  return sortedSessions().filter(s => s.date >= from && s.date <= to)
}

// Working sets per muscle in a date range: primary 1, secondary ½.
export function muscleSets(from, to) {
  const out = Object.fromEntries(MUSCLES.map(m => [m.key, 0]))
  for (const s of sessionsBetween(from, to)) {
    for (const e of s.exercises) {
      const m = muscles(e.name)
      if (!m.primary || m.primary === 'Cardio') continue
      const n = e.sets.filter(x => x.type !== 'warmup').length
      if (m.primary in out) out[m.primary] += n
      for (const sec of m.secondary) if (sec in out) out[sec] += n / 2
    }
  }
  for (const k in out) out[k] = round1(out[k])
  return out
}

// Days since each muscle last worked (primary or secondary).
export function lastTrained() {
  const out = {}
  for (const s of sortedSessions()) {
    for (const e of s.exercises) {
      const m = muscles(e.name)
      for (const k of [m.primary, ...m.secondary]) if (k && k !== 'Cardio' && !out[k]) out[k] = s.date
    }
  }
  return out
}

// Weeks in a row (ending this week, or last week if this one's still young)
// with at least `min` sessions.
export function weekStreak(min = 3) {
  const counts = new Map()
  for (const s of state.sessions) { const w = weekStart(s.date); counts.set(w, (counts.get(w) || 0) + 1) }
  let w = weekStart(today())
  if ((counts.get(w) || 0) < min) w = addDays(w, -7)
  let n = 0
  while ((counts.get(w) || 0) >= min) { n++; w = addDays(w, -7) }
  return n
}

export function latestBw() {
  return [...state.bwLog].sort((a, b) => b.date.localeCompare(a.date))[0] || null
}

export function achievements() {
  return achievementDefs({ sessions: state.sessions, bwLog: state.bwLog, checkins: state.checkins, volOf: sessionVol })
}

export const plannedThisWeek = r => (r || routine()).days.filter(d => d.dow != null).length
export const isToday = d => d === today()
export { daysBetween, dow }

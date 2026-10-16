// `npm run demo` swaps this in for data.js (vite.config.js alias): same
// exports, fake in-memory data — for design work without touching Supabase.
import { today, addDays, dow } from './dates.js'
import { DEFAULT_ROUTINE } from './routine.js'

const user = { id: 'demo-user', email: 'alex@demo.local' }
const session = { user, access_token: 'demo' }

// Deterministic pseudo-random so screenshots are stable.
let seed = 7
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }

const BASE = {
  'Smith Incline Bench': 40, 'Lateral Raise': 6, 'Tricep Pushdown': 25, 'Smith Overhead Press': 30, 'Seated Cable Row': 28,
  'Treadmill': 6, 'Wrist Curl': 12, 'EZ Bar Curl': 25, 'Straight-Arm Pulldown': 20, 'Reverse Curl EZ Bar': 17.5,
  'Leg Extension': 60, 'Pallof Press': 9, 'Back Extension': 40, 'Decline Crunch': 0, 'Smith Squat': 45,
  'Smith Bench Press': 50, 'Close-Grip Bench Press': 37.5, 'Lat Pulldown': 30, 'Incline DB Curl': 14, 'Overhead Tricep Ext.': 18,
}

function build() {
  const t = today()
  const sessions = []
  const weeks = 30
  for (let d = -weeks * 7; d <= -1; d++) {
    const date = addDays(t, d)
    const day = DEFAULT_ROUTINE.days.find(x => x.dow === dow(date))
    if (!day || rnd() < 0.14) continue
    const progress = 1 + (d + weeks * 7) / (weeks * 7) * 0.22
    const exercises = day.exercises.map(e => {
      const cardio = e.name === 'Treadmill'
      const base = BASE[e.name] ?? 20
      const w = cardio ? 6 + Math.round(rnd() * 2) : Math.round(base * progress / 2.5) * 2.5
      const [lo, hi] = (e.reps.match(/\d+/g) || [8, 12]).map(Number)
      const sets = Array.from({ length: e.sets }, (_, i) => ({
        type: 'working',
        weight: cardio ? w : w,
        reps: cardio ? 30 + Math.round(rnd() * 10) : Math.max(lo, hi - i - Math.round(rnd() * 2)),
      }))
      return { name: e.name, sets, effort: 0 }
    })
    sessions.push({
      id: `demo-${date}`, date, program: day.program, duration: 30 + Math.round(rnd() * 30),
      notes: '', exercises, createdAt: new Date(date + 'T06:15').getTime(), source: 'live',
    })
  }
  const bw = []
  for (let d = -weeks * 7; d <= 0; d += 2 + Math.round(rnd() * 2)) {
    bw.push({ date: addDays(t, d), weight: Math.round((76.5 - 4 * d / (weeks * 7) + (rnd() - 0.5) * 0.8) * 10) / 10, note: '' })
  }
  const checkins = []
  for (let w = 1; w <= 8; w++) {
    const ws = addDays(t, -dow(t) - 7 * w)
    if (rnd() < 0.3) continue
    checkins.push({ id: `ci-${ws}`, weekStart: ws, effort: 3 + Math.round(rnd() * 2), recovery: 2 + Math.round(rnd() * 3), notes: w === 1 ? 'Shoulder felt tight on OHP' : '', savedAt: addDays(ws, 6) })
  }
  return { sessions, blobs: { iron_bwlog: bw, iron_checkins: checkins, iron_exerciselib: [], iron_prefs: null } }
}

const db = build()
const wait = (ms = 120) => new Promise(r => setTimeout(r, ms))
const copy = x => x == null ? x : JSON.parse(JSON.stringify(x))

export const supa = null
export const getSession = async () => session
export const onAuthChange = () => {}
export const signIn = async () => {}
export const signUp = async () => ({ session })
export const signOut = async () => location.reload()
export const isMissingTable = () => false
export const fetchSessions = async () => { await wait(); return copy(db.sessions) }
export async function putSessions(list) {
  await wait()
  for (const s of list) { const i = db.sessions.findIndex(x => x.id === s.id); if (i === -1) db.sessions.push(copy(s)); else db.sessions[i] = copy(s) }
}
export async function deleteSessions(ids) { await wait(); db.sessions = db.sessions.filter(s => !ids.includes(s.id)) }
export const readBlob = async table => { await wait(40); return copy(db.blobs[table] ?? null) }
export async function writeBlob(table, value) { await wait(40); db.blobs[table] = copy(value) }
const photoStore = new Map()
export const isMissingBucket = () => false
export async function uploadPhoto(path, blob) { await wait(200); photoStore.set(path, URL.createObjectURL(blob)) }
export const photoUrls = async paths => Object.fromEntries(paths.filter(p => photoStore.has(p)).map(p => [p, photoStore.get(p)]))
export async function deletePhotos(paths) { for (const p of paths) photoStore.delete(p) }

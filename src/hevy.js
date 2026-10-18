// HEVY CSV export → Iron Log sessions. Pure; tested in test/hevy.test.js.
import { toStr } from './dates.js'

// HEVY titles → the names Iron Log has always used.
export const HEVY_NAMES = {
  'Seated Cable Row - Bar Grip': 'Seated Cable Row',
  'EZ Bar Biceps Curl': 'EZ Bar Curl',
  'Seated Palms Up Wrist Curl': 'Wrist Curl',
  'Straight Arm Lat Pulldown (Cable)': 'Straight-Arm Pulldown',
  'Reverse Curl (Barbell)': 'Reverse Curl EZ Bar',
  'Reverse Curl (Cable)': 'Reverse Curl EZ Bar',
  'Reverse Curl (Dumbbell)': 'Reverse Curl EZ Bar',
  'Squat (Smith Machine)': 'Smith Squat',
  'Back Extension (Weighted Hyperextension)': 'Back Extension',
  'Cable Core Pallof Press': 'Pallof Press',
  'Cable Core Palloff Press': 'Pallof Press',
  'Leg Extension (Machine)': 'Leg Extension',
  'Incline Bench Press (Smith Machine)': 'Smith Incline Bench',
  'Lateral Raise (Dumbbell)': 'Lateral Raise',
  'Cable Fly Crossovers': 'Cable Fly Low-High',
  'Triceps Pushdown': 'Tricep Pushdown',
  'Overhead Press (Smith Machine)': 'Smith Overhead Press',
  'Seated Incline Curl (Dumbbell)': 'Incline DB Curl',
  'Overhead Triceps Extension (Cable)': 'Tricep Extension Cable',
  'Bench Press (Smith Machine)': 'Smith Bench Press',
  'Bench Press - Close Grip (Barbell)': 'Close-Grip Bench Press',
  'Hammer Curl (Cable)': 'Cross Body Hammer Curl',
  'Bicep Curl (Cable)': 'Cable Bicep Curl',
  'Lat Pulldown (Machine)': 'Lat Pulldown',
  'Lat Pulldown (Cable)': 'Lat Pulldown',
  'Shrug (Smith Machine)': 'Smith Shrug',
  'Shrug (Cable)': 'Cable Shrug',
  'Chest Press (Machine)': 'Chest Press Machine',
}
export const mapHevyName = n => HEVY_NAMES[n] || n

export function mapHevyProgram(t) {
  if (/\(Pull\)/.test(t)) return 'Pull'
  if (/\(Push\)/.test(t)) return 'Push'
  if (/\(Legs\)/.test(t)) return 'Legs'
  if (/\(Arms\)/.test(t)) return 'Arms'
  if (/\(Upper\)|Upper Push|Upper Pull/.test(t)) return 'Upper'
  if (/Cardio/i.test(t)) return 'Cardio'
  if (/Full Body/i.test(t)) return 'Push'
  if (/Lower|Legs/i.test(t)) return 'Legs'
  if (/Upper/i.test(t)) return 'Upper'
  if (/Pull/i.test(t)) return 'Pull'
  if (/Push/i.test(t)) return 'Push'
  return 'Other'
}

// RFC-4180-ish: quoted fields may hold commas, "" and newlines.
export function parseCsv(text) {
  const rows = []
  let row = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.some(v => v !== '')) rows.push(row)
      row = []
    } else cur += c
  }
  row.push(cur)
  if (row.some(v => v !== '')) rows.push(row)
  return rows
}

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }
// "8 Sep 2026, 06:31" → local Date (same as v1, so createdAt values match).
export function parseHevyDate(s) {
  const m = String(s || '').trim().match(/^(\d+)\s+(\w{3})\w*\s+(\d{4}),\s*(\d+):(\d+)$/)
  if (!m || MONTHS[m[2]] === undefined) return null
  return new Date(+m[3], MONTHS[m[2]], +m[1], +m[4], +m[5])
}

const n = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0 }
const CARDIO = /treadmill|elliptical|bike|cycling|rowing machine|stair|walk|run/i

export function parseHevy(text) {
  const rows = parseCsv(text.replace(/^﻿/, ''))
  if (!rows.length) return { workouts: [], weights: [] }
  const head = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  if (!head.includes('exercise_title') || !head.includes('start_time')) throw new Error("This doesn't look like a HEVY workout export (workout_data.csv).")
  const recs = rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])))

  const groups = new Map()
  for (const r of recs) {
    const k = `${r.title}|${r.start_time}|${r.end_time}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }

  const workouts = [], weights = []
  for (const g of groups.values()) {
    const r0 = g[0]
    const st = parseHevyDate(r0.start_time)
    if (!st) continue
    const et = parseHevyDate(r0.end_time)
    const date = toStr(st)
    const desc = (r0.description || '').trim()
    // v1 habit: a bare number in the description was that day's body weight.
    const isBw = /^\d{2,3}(\.\d+)?$/.test(desc) && n(desc) >= 30 && n(desc) <= 200
    if (isBw) weights.push({ date, weight: n(desc), note: 'HEVY' })

    const exOrder = new Map()
    for (const r of g) {
      if (!exOrder.has(r.exercise_title)) exOrder.set(r.exercise_title, [])
      exOrder.get(r.exercise_title).push(r)
    }
    const exercises = []
    for (const [title, list] of exOrder) {
      list.sort((a, b) => n(a.set_index) - n(b.set_index))
      const cardio = CARDIO.test(title) || list.some(r => n(r.distance_km))
      const sets = list.map(r => {
        const type = r.set_type === 'warmup' ? 'warmup' : 'working'
        if (n(r.duration_seconds) && !n(r.reps)) {
          // Cardio keeps v1's convention (distance in kg, minutes in reps);
          // holds like Plank keep their seconds.
          if (cardio) return { type, weight: n(r.distance_km), reps: Math.round(n(r.duration_seconds) / 60) }
          return { type, weight: n(r.weight_kg), reps: n(r.duration_seconds), timed: true }
        }
        return { type, weight: n(r.weight_kg), reps: n(r.reps) }
      })
      // Older workouts ramped up on set 1 without marking it a warm-up.
      if (sets.length >= 3 && !sets.some(s => s.type === 'warmup')) {
        const restMax = Math.max(...sets.slice(1).map(s => s.weight))
        if (restMax > 0 && sets[0].weight < restMax * 0.75) sets[0].type = 'warmup'
      }
      const note = list.find(r => r.exercise_notes)?.exercise_notes || ''
      const totalVol = Math.round(sets.filter(s => s.type === 'working').reduce((a, s) => a + s.weight * s.reps, 0) * 100) / 100
      exercises.push({ name: mapHevyName(title), sets, totalVol, effort: 0, ...(note ? { note } : {}) })
    }
    workouts.push({
      start: st.getTime(),
      title: r0.title,
      date,
      program: mapHevyProgram(r0.title),
      duration: et ? Math.max(1, Math.round((et - st) / 60000)) : 0,
      notes: isBw ? '' : desc,
      exercises,
    })
  }
  workouts.sort((a, b) => a.start - b.start)
  return { workouts, weights }
}

const overlap = (a, b) => {
  const A = new Set(a.exercises.map(e => e.name.toLowerCase()))
  const B = b.exercises.map(e => e.name.toLowerCase())
  if (!A.size || !B.length) return 0
  return B.filter(x => A.has(x)).length / Math.min(A.size, B.length)
}

// What an import would do against what's already logged:
// - add: workouts not in Iron Log yet
// - fixDates: earlier imports (v1) whose date was shifted a day by UTC
// - same: already there; dupes: a hand-logged session that day already covers it
export function planImport(parsed, sessions, bwLog = []) {
  const byStart = new Map()
  for (const s of sessions) {
    if (s.hevyStart) byStart.set(Number(s.hevyStart), s)
    else if (s.createdAt) byStart.set(Number(s.createdAt), s)
  }
  const byDate = new Map()
  for (const s of sessions) { if (!byDate.has(s.date)) byDate.set(s.date, []); byDate.get(s.date).push(s) }

  const add = [], fixDates = []
  let same = 0, dupes = 0
  for (const w of parsed.workouts) {
    const hit = byStart.get(w.start)
    if (hit) {
      same++
      if (hit.date !== w.date) fixDates.push({ id: hit.id, from: hit.date, to: w.date })
      continue
    }
    if ((byDate.get(w.date) || []).some(s => overlap(s, w) >= 0.5)) { dupes++; continue }
    const totalVol = Math.round(w.exercises.reduce((a, e) => a + e.totalVol, 0) * 100) / 100
    add.push({
      id: `hevy-${w.start}`, date: w.date, program: w.program, title: w.title, duration: w.duration,
      notes: w.notes, exercises: w.exercises, totalVol, createdAt: w.start, hevyStart: w.start, source: 'hevy',
    })
  }
  const haveBw = new Set(bwLog.map(b => b.date))
  const weights = parsed.weights.filter(b => !haveBw.has(b.date))
  return { add, fixDates, same, dupes, weights }
}

// ── Iron Log → HEVY ──
// HEVY imports Strong-format CSVs, so sessions go out in that layout with
// HEVY's exercise titles (first HEVY title wins where several map to one).
export const TO_HEVY = {}
for (const [hevy, iron] of Object.entries(HEVY_NAMES)) if (!(iron in TO_HEVY)) TO_HEVY[iron] = hevy
export const toHevyName = n => TO_HEVY[n] || n

const pad2 = x => String(x).padStart(2, '0')
const stamp = (date, ms) => {
  const d = ms ? new Date(ms) : null
  const t = d && toStr(d) === date ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}:00` : '06:00:00'
  return `${date} ${t}`
}
const dur = m => !m ? '0m' : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
const csvCell = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)

export function toStrongCsv(sessions, isCardio = () => false) {
  const rows = [['Date', 'Workout Name', 'Duration', 'Exercise Name', 'Set Order', 'Weight', 'Reps', 'Distance', 'Seconds', 'Notes', 'Workout Notes', 'RPE']]
  for (const s of [...sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    const when = stamp(s.date, s.startedAt || s.hevyStart || s.createdAt)
    const title = s.title || s.program
    for (const e of s.exercises) {
      const cardio = isCardio(e.name)
      e.sets.forEach((x, i) => {
        const [w, r, dist, secs] = cardio ? ['', '', x.weight || '', x.reps ? Math.round(x.reps * 60) : '']
          : x.timed ? [x.weight || '', '', '', x.reps]
          : [x.weight, x.reps, '', '']
        rows.push([when, title, dur(s.duration), toHevyName(e.name), i + 1, w, r, dist, secs, i === 0 ? e.note || '' : '', s.notes || '', ''])
      })
    }
  }
  return rows.map(r => r.map(csvCell).join(',')).join('\n')
}

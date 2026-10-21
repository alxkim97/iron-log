// Training domain: programs, muscles, the exercise library, and the maths on
// sessions (volume, e1RM, PRs). Pure — no DOM, no Supabase.

// Colours are theme tokens (--p-push …) with separate light/dark steps,
// validated with the dataviz palette checker.
export const PROGRAMS = ['Push', 'Pull', 'Legs', 'Upper', 'Arms', 'Cardio', 'Other']
export const programColor = k => `var(--p-${PROGRAMS.includes(k) ? k.toLowerCase() : 'other'})`

// Weekly working-set targets per muscle (v1's science-based numbers).
export const MUSCLES = [
  { key: 'Chest', min: 10, optimal: 16 },
  { key: 'Back', min: 10, optimal: 18 },
  { key: 'Shoulders', min: 10, optimal: 15 },
  { key: 'Biceps', min: 10, optimal: 14 },
  { key: 'Triceps', min: 10, optimal: 16 },
  { key: 'Forearms', min: 6, optimal: 12 },
  { key: 'Quads', min: 10, optimal: 14 },
  { key: 'Hamstrings', min: 8, optimal: 14 },
  { key: 'Glutes', min: 6, optimal: 14 },
  { key: 'Core', min: 6, optimal: 10 },
]
export const MUSCLE_KEYS = [...MUSCLES.map(m => m.key), 'Cardio']

const L = (name, muscle, secondary = [], equipment = '', notes = '') => ({ name, muscle, secondary, equipment, notes })

// Names follow v1 (HEVY titles are mapped onto these on import) so the
// 300+ sessions already in the cloud line up with new ones.
export const DEFAULT_LIBRARY = [
  L('Smith Incline Bench', 'Chest', ['Shoulders', 'Triceps'], 'Smith Machine', 'Upper chest — Push anchor'),
  L('Smith Bench Press', 'Chest', ['Triceps', 'Shoulders'], 'Smith Machine', 'Upper anchor'),
  L('Chest Press Machine', 'Chest', ['Triceps', 'Shoulders'], 'Machine'),
  L('Cable Fly Low-High', 'Chest', ['Shoulders'], 'Cable'),
  L('Bench Press (Dumbbell)', 'Chest', ['Triceps', 'Shoulders'], 'Dumbbells'),
  L('Incline Bench Press (Dumbbell)', 'Chest', ['Shoulders', 'Triceps'], 'Dumbbells'),
  L('Chest Fly (Dumbbell)', 'Chest', ['Shoulders'], 'Dumbbells'),
  L('Close-Grip Bench Press', 'Triceps', ['Chest', 'Shoulders'], 'Barbell'),
  L('Tricep Pushdown', 'Triceps', [], 'Cable'),
  L('Triceps Rope Pushdown', 'Triceps', [], 'Cable'),
  L('Tricep Extension Cable', 'Triceps', [], 'Cable', 'Long head'),
  L('Skullcrusher (Dumbbell)', 'Triceps', [], 'Dumbbells'),
  L('Lateral Raise', 'Shoulders', [], 'Dumbbells', 'Side delt'),
  L('Smith Overhead Press', 'Shoulders', ['Triceps'], 'Smith Machine'),
  L('Shoulder Press (Dumbbell)', 'Shoulders', ['Triceps'], 'Dumbbells'),
  L('Overhead Press (Barbell)', 'Shoulders', ['Triceps'], 'Barbell'),
  L('Face Pull', 'Shoulders', ['Back'], 'Cable', 'Rear delt — rotator cuff health'),
  L('Seated Cable Row', 'Back', ['Biceps', 'Forearms'], 'Cable', 'Pull anchor'),
  L('Single Arm Cable Row', 'Back', ['Biceps'], 'Cable'),
  L('Lat Pulldown', 'Back', ['Biceps'], 'Machine'),
  L('Straight-Arm Pulldown', 'Back', ['Triceps'], 'Cable', 'Lat isolation'),
  L('Back Extension', 'Back', ['Glutes', 'Hamstrings'], 'Machine', 'Erectors'),
  L('Bent Over Row (Barbell)', 'Back', ['Biceps'], 'Barbell'),
  L('Pull Up', 'Back', ['Biceps'], 'Pull-up Bar'),
  L('Superman', 'Back', ['Glutes'], 'Bodyweight', 'Lower back — lie face down, lift arms and legs'),
  L('Smith Shrug', 'Back', ['Forearms'], 'Smith Machine', 'Traps'),
  L('Cable Shrug', 'Back', ['Forearms'], 'Cable', 'Traps'),
  L('EZ Bar Curl', 'Biceps', ['Forearms'], 'EZ Bar'),
  L('Incline DB Curl', 'Biceps', ['Forearms'], 'Dumbbells', 'Long head'),
  L('Concentration Curl', 'Biceps', [], 'Dumbbells'),
  L('Cable Bicep Curl', 'Biceps', ['Forearms'], 'Cable'),
  L('Bicep Curl (Dumbbell)', 'Biceps', ['Forearms'], 'Dumbbells'),
  L('Bicep Curl (Barbell)', 'Biceps', ['Forearms'], 'Barbell'),
  L('Cross Body Hammer Curl', 'Biceps', ['Forearms'], 'Dumbbells'),
  L('Hammer Curl (Dumbbell)', 'Biceps', ['Forearms'], 'Dumbbells'),
  L('Zottman Curl (Dumbbell)', 'Biceps', ['Forearms'], 'Dumbbells'),
  L('Wrist Curl', 'Forearms', [], 'Dumbbells', 'Flexors'),
  L('Reverse Curl EZ Bar', 'Forearms', ['Biceps'], 'EZ Bar', 'Brachioradialis'),
  L('Seated Wrist Extension (Barbell)', 'Forearms', [], 'Barbell', 'Extensors'),
  L('Smith Squat', 'Quads', ['Glutes', 'Hamstrings'], 'Smith Machine', 'Legs anchor'),
  L('Leg Extension', 'Quads', [], 'Machine'),
  L('Leg Press', 'Quads', ['Glutes'], 'Machine'),
  L('Squat (Dumbbell)', 'Quads', ['Glutes'], 'Dumbbells'),
  L('Bodyweight Squat', 'Quads', ['Glutes'], 'Bodyweight'),
  L('Reverse Lunge', 'Quads', ['Glutes', 'Hamstrings'], 'Bodyweight', 'Each leg'),
  L('Romanian Deadlift (Dumbbell)', 'Hamstrings', ['Glutes', 'Back'], 'Dumbbells'),
  L('Seated Leg Curl', 'Hamstrings', [], 'Machine'),
  L('Single-Leg RDL', 'Hamstrings', ['Glutes'], 'Bodyweight', 'Each leg'),
  L('Cable Glute Kickback', 'Glutes', ['Hamstrings'], 'Cable'),
  L('Hip Thrust (Smith Machine)', 'Glutes', ['Hamstrings'], 'Smith Machine'),
  L('Glute Bridge', 'Glutes', ['Hamstrings'], 'Bodyweight'),
  L('Push-up', 'Chest', ['Triceps', 'Shoulders'], 'Bodyweight'),
  L('Pike Push-up', 'Shoulders', ['Triceps'], 'Bodyweight'),
  L('Bench Dip', 'Triceps', ['Chest', 'Shoulders'], 'Bodyweight', 'A chair or bed edge works'),
  L('Pallof Press', 'Core', [], 'Cable', 'Anti-rotation'),
  L('Decline Crunch', 'Core', [], 'Bench'),
  L('Crunch', 'Core', [], 'Bodyweight'),
  L('Plank', 'Core', [], 'Bodyweight'),
  L('Dead Bug', 'Core', [], 'Bodyweight'),
  L('Cable Twist (Down to up)', 'Core', [], 'Cable'),
  L('Treadmill', 'Cardio', [], 'Cardio machine', 'Speed (km/h) in the kg box, minutes in reps'),
  L('Elliptical Trainer', 'Cardio', [], 'Cardio machine', 'Level in the kg box, minutes in reps'),
]

// Unknown names (typed by hand, new HEVY titles) get a best guess so they
// still count toward muscle volume; the library page can correct it.
const GUESS = [
  [/treadmill|elliptical|bike|cycling|rowing machine|cardio|\brun\b|walk/i, 'Cardio'],
  [/wrist|reverse curl|forearm|zottman/i, 'Forearms'],
  [/leg curl|hamstring|rdl|romanian|deadlift|good morning/i, 'Hamstrings'],
  [/hip thrust|glute|kickback|abduct/i, 'Glutes'],
  [/leg ext|squat|leg press|lunge|split squat|step up/i, 'Quads'],
  [/curl/i, 'Biceps'],
  [/pushdown|tricep|skull|close.?grip|\bdip|overhead ext|kickback/i, 'Triceps'],
  [/crunch|plank|pallof|\bab\b|abs|core|twist|sit.?up|leg raise/i, 'Core'],
  [/lateral|face pull|shoulder|overhead press|ohp|delt|military|arnold/i, 'Shoulders'],
  [/row|pulldown|pull.?up|chin.?up|\blat\b|shrug|back ext|pullover/i, 'Back'],
  [/bench|fly|chest|pec|push.?up|press/i, 'Chest'],
]
export function guessMuscle(name) {
  for (const [re, m] of GUESS) if (re.test(name)) return m
  return null
}

const asList = v => Array.isArray(v) ? v : String(v || '').split(',').map(x => x.trim()).filter(Boolean)
// v1 library used 'Legs' for everything below the waist.
const fixMuscle = m => m === 'Legs' ? 'Quads' : m

// Defaults overlaid by the user's own entries (matched by name).
export function buildLibrary(userLib = []) {
  const byName = new Map(DEFAULT_LIBRARY.map(e => [e.name.toLowerCase(), { ...e, id: 'dl:' + e.name }]))
  for (const e of userLib || []) {
    if (!e?.name) continue
    const k = e.name.trim().toLowerCase()
    byName.set(k, {
      ...(byName.get(k) || {}),
      ...e,
      name: e.name.trim(),
      muscle: fixMuscle(e.muscle) || byName.get(k)?.muscle || guessMuscle(e.name),
      secondary: asList(e.secondary).map(fixMuscle).filter(m => MUSCLE_KEYS.includes(m)),
      hidden: !!e.hidden,
    })
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function makeMuscleLookup(library) {
  const map = new Map(library.map(e => [e.name.toLowerCase(), e]))
  const cache = new Map()
  return name => {
    const k = String(name || '').trim().toLowerCase()
    if (cache.has(k)) return cache.get(k)
    const e = map.get(k)
    const r = e ? { primary: e.muscle, secondary: e.secondary || [] } : { primary: guessMuscle(k), secondary: [] }
    cache.set(k, r)
    return r
  }
}

// ── Sets & sessions ──
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }
export const isWarmup = set => set.type === 'warmup'

export function normalizeSession(s) {
  return {
    ...s,
    date: s.date,
    program: s.program || 'Other',
    duration: num(s.duration) > 0 && num(s.duration) <= 400 ? Math.round(num(s.duration)) : 0,
    notes: s.notes || '',
    exercises: (s.exercises || []).filter(e => e && e.name).map(e => ({
      ...e,
      name: String(e.name).trim(),
      note: e.note || e.notes || '',
      effort: e.effort || 0,
      sets: (e.sets || []).map(st => ({ ...st, type: st.type === 'warmup' ? 'warmup' : 'working', weight: num(st.weight), reps: num(st.reps) })),
    })),
  }
}

// Epley. Above 15 reps it stops meaning much, so those sets don't count.
export function e1rm(weight, reps) {
  if (!weight || !reps || reps > 15) return 0
  return reps === 1 ? weight : weight * (1 + reps / 30)
}

export const round1 = n => Math.round(n * 10) / 10

export function exerciseStats(ex, isCardio) {
  const work = ex.sets.filter(s => !isWarmup(s))
  let vol = 0, maxW = 0, best = 0, bestSet = null, reps = 0
  for (const s of work) {
    if (!isCardio) vol += s.weight * s.reps
    reps += s.reps
    if (s.weight > maxW) maxW = s.weight
    const e = e1rm(s.weight, s.reps)
    if (e > best) { best = e; bestSet = s }
  }
  return { vol, maxW, e1rm: best, bestSet, sets: work.length, reps }
}

export function sessionVolume(s, isCardio) {
  return s.exercises.reduce((a, e) => a + exerciseStats(e, isCardio(e.name)).vol, 0)
}

export const fmtKg = n => {
  if (!n) return '0'
  const r = Math.round(n * 100) / 100
  return Number.isInteger(r) ? String(r) : String(r).replace(/(\.\d)0$/, '$1')
}
export const fmtVol = kg => kg >= 10000 ? `${(kg / 1000).toFixed(1)} t` : kg >= 1000 ? `${(kg / 1000).toFixed(2)} t` : `${Math.round(kg)} kg`
export const fmtSet = (s, cardio) => s.timed
  ? `${fmtKg(s.reps)} s${s.weight ? ` @ ${fmtKg(s.weight)} kg` : ''}`
  : cardio
  ? `${s.reps ? `${fmtKg(s.reps)} min` : ''}${s.weight ? ` @ ${fmtKg(s.weight)}` : ''}`.trim() || '—'
  : s.weight ? `${fmtKg(s.weight)} × ${fmtKg(s.reps)}` : `${fmtKg(s.reps)} reps`

// Rep range text like "6–10", "8-12", "15-20 each" → [lo, hi]
export function parseRepRange(txt) {
  const m = String(txt || '').match(/(\d+)\s*[–\-—to]+\s*(\d+)/)
  if (m) return [Number(m[1]), Number(m[2])]
  const one = String(txt || '').match(/(\d+)/)
  return one ? [Number(one[1]), Number(one[1])] : null
}

// Progression nudge: every working set last time reached the top of the
// range → add the smallest sensible jump. With a gym setup, `step` is that
// gym's increment and nothing above `limit` (the heaviest there) is offered.
export function suggestNext(lastSets, repRange, cardio, { step = null, limit = null } = {}) {
  if (cardio || !lastSets?.length || !repRange) return null
  const work = lastSets.filter(s => !isWarmup(s) && s.weight > 0)
  if (!work.length) return null
  const top = Math.max(...work.map(s => s.weight))
  const atTop = work.filter(s => s.weight === top)
  if (!atTop.every(s => s.reps >= repRange[1])) return null
  const next = top + (step || (top < 20 ? 1 : 2.5))
  return limit && next > limit ? null : next
}

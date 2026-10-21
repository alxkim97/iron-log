// Plan builder and Holiday mode. Turns "what equipment do I have, how many
// days, how long per session" into a weekly routine, and builds the short
// maintenance sessions Holiday mode offers. Pure: callers pass the library
// and the numbers derived from history (see planContext in store.js).

// Keys match the library's `equipment` field. Bodyweight is always available.
export const EQUIPMENT = [
  ['Machine', 'Machines'],
  ['Cable', 'Cables'],
  ['Smith Machine', 'Smith machine'],
  ['Dumbbells', 'Dumbbells'],
  ['Barbell', 'Barbell'],
  ['EZ Bar', 'EZ bar'],
  ['Bench', 'Bench'],
  ['Pull-up Bar', 'Pull-up bar'],
  ['Cardio machine', 'Treadmill'],
]
export const GYM_EQUIPMENT = EQUIPMENT.map(([k]) => k)
export const DEFAULT_HOLIDAY = { on: false, equipment: ['Cardio machine'], minutes: 20 }

const norm = s => String(s || '').trim().toLowerCase()

// A library entry is usable when any of its listed equipment is available
// ("Cable, Smith Machine" = either works). Blank equipment = unknown = skipped.
export function hasEquipment(entry, equipment) {
  const parts = String(entry.equipment || '').split(/[,/]/).map(norm).filter(Boolean)
  if (!parts.length) return false
  const have = new Set(['bodyweight', ...equipment.map(norm)])
  return parts.some(p => have.has(p))
}

// Muscle slots per day type, most important first. Truncated to what fits
// in the session, so the tail is what a short day drops.
const TEMPLATES = {
  Full: ['Quads', 'Chest', 'Back', 'Hamstrings', 'Shoulders', 'Glutes', 'Core', 'Biceps', 'Triceps'],
  Upper: ['Chest', 'Back', 'Shoulders', 'Back', 'Triceps', 'Biceps', 'Chest', 'Forearms'],
  Lower: ['Quads', 'Hamstrings', 'Glutes', 'Quads', 'Core', 'Core'],
  Push: ['Chest', 'Shoulders', 'Triceps', 'Chest', 'Shoulders', 'Triceps'],
  Pull: ['Back', 'Back', 'Biceps', 'Forearms', 'Biceps', 'Back'],
  Legs: ['Quads', 'Hamstrings', 'Glutes', 'Quads', 'Core', 'Hamstrings'],
}
const PROGRAM_OF = { Full: 'Other', Upper: 'Upper', Lower: 'Legs', Push: 'Push', Pull: 'Pull', Legs: 'Legs' }

// [day name, template] per days-a-week, with the weekdays they land on
// (0 = Sun). Mon and Sat stay free where the count allows.
export const SPLITS = {
  2: { days: [['Full body A', 'Full'], ['Full body B', 'Full']], dows: [2, 5] },
  3: { days: [['Upper', 'Upper'], ['Lower', 'Lower'], ['Full body', 'Full']], dows: [0, 2, 4] },
  4: { days: [['Upper A', 'Upper'], ['Lower A', 'Lower'], ['Upper B', 'Upper'], ['Lower B', 'Lower']], dows: [0, 2, 3, 5] },
  5: { days: [['Push', 'Push'], ['Pull', 'Pull'], ['Legs', 'Legs'], ['Upper', 'Upper'], ['Lower', 'Lower']], dows: [0, 2, 3, 4, 5] },
  6: { days: [['Push A', 'Push'], ['Pull A', 'Pull'], ['Legs A', 'Legs'], ['Push B', 'Push'], ['Pull B', 'Pull'], ['Legs B', 'Legs']], dows: [0, 1, 2, 3, 4, 5] },
}

// Holiday sessions rotate through these so back-to-back days differ.
const HOLIDAY_TEMPLATES = [
  ['Quads', 'Chest', 'Hamstrings', 'Back', 'Core', 'Shoulders', 'Glutes'],
  ['Glutes', 'Shoulders', 'Quads', 'Triceps', 'Core', 'Chest', 'Hamstrings'],
  ['Hamstrings', 'Chest', 'Quads', 'Back', 'Core', 'Glutes', 'Shoulders'],
]

// Minutes per working set including rest, from the user's own sessions
// (median of the last 30 with a duration). Sessions with cardio or over
// 90 min are skipped: walking time and long weekend sessions aren't the
// pace of a normal lifting day. Falls back to 2.5.
export function minutesPerSet(sessions, isCardio = () => false) {
  const rates = []
  for (const s of sessions) {
    if (!(s.duration > 0) || s.duration > 90 || s.exercises.some(e => isCardio(e.name))) continue
    const n = s.exercises.reduce((a, e) => a + e.sets.filter(x => x.type !== 'warmup').length, 0)
    if (n >= 3) rates.push(s.duration / n)
    if (rates.length >= 30) break
  }
  if (!rates.length) return 2.5
  rates.sort((a, b) => a - b)
  const mid = rates[Math.floor(rates.length / 2)]
  return Math.min(4, Math.max(1.5, Math.round(mid * 10) / 10))
}

// ~1 min to set up each exercise on top of its sets.
export const exercisesThatFit = (minutes, sets, perSet) => Math.max(2, Math.floor(minutes / (sets * perSet + 1)))

function prescription(entry, slot, maintain) {
  const bw = norm(entry.equipment) === 'bodyweight'
  const iso = !entry.secondary?.length
  let reps = entry.name === 'Plank' ? '30–60 s'
    : bw ? (entry.muscle === 'Core' ? '12–20' : '10–20')
    : slot === 0 && !iso ? (maintain ? '8–10' : '6–10')
    : iso ? '12–15' : '8–12'
  const notes = [
    slot === 0 && !iso && !bw ? 'Compound anchor' : '',
    maintain ? 'Stop 2–3 reps short of failure' : '',
  ].filter(Boolean).join(' · ')
  return { name: entry.name, sets: maintain ? 2 : 3, reps, notes }
}

// Familiarity is capped so a well-known compound can still beat a very
// well-known isolation move; ties then go to whichever was done more.
// `avoid` (same day type earlier in the week) costs more than `week`
// (used on any other day) — repeats are allowed, just not preferred.
function pick(muscle, slot, { pool, used, avoid, week, familiarity }) {
  let best = null, bestScore = -Infinity, bestFam = 0
  for (const e of pool) {
    if (e.muscle !== muscle || used.has(norm(e.name))) continue
    const fam = familiarity(e.name)
    const score = Math.min(3, Math.log1p(fam))
      + (slot === 0 && e.secondary?.length ? 1.5 : 0)
      + (/anchor/i.test(e.notes || '') ? 1 : 0)
      - (avoid.has(norm(e.name)) ? 2 : 0)
      - (week.has(norm(e.name)) ? 0.5 : 0)
    if (score > bestScore || (score === bestScore && (fam > bestFam || (fam === bestFam && e.name < best.name)))) {
      best = e; bestScore = score; bestFam = fam
    }
  }
  return best
}

// Fill a day's slots: the first stays put (the compound); muscles well
// under target (more than halfway short) move up next, once each; the rest
// keep the template's balanced order. Then cut to what fits in the time.
function buildDay(template, { pool, avoid, week = new Set(), familiarity, behind, count, maintain }) {
  const [lead, ...rest] = template
  const promoted = [...new Set(rest)].filter(m => m !== lead && (behind[m] || 0) >= 0.5).sort((a, b) => behind[b] - behind[a])
  const tail = [...rest]
  for (const m of promoted) tail.splice(tail.indexOf(m), 1)
  const ordered = [lead, ...promoted, ...tail]
  const used = new Set()
  const out = []
  for (const muscle of ordered) {
    if (out.length >= count) break
    const e = pick(muscle, out.length, { pool, used, avoid, week, familiarity })
    if (!e) continue
    used.add(norm(e.name))
    out.push(prescription(e, out.length, maintain))
  }
  return out
}

const usablePool = (library, equipment) =>
  library.filter(e => !e.hidden && e.muscle && e.muscle !== 'Cardio' && hasEquipment(e, equipment))

// A weekly routine in the same shape as DEFAULT_ROUTINE.
export function buildPlan({ equipment, days, minutes, library, familiarity = () => 0, behind = {}, perSet = 2.5 }) {
  const split = SPLITS[days] || SPLITS[3]
  const pool = usablePool(library, equipment)
  const count = exercisesThatFit(minutes, 3, perSet)
  const usedBy = {}
  const week = new Set()
  return {
    days: split.days.map(([name, tpl], i) => {
      const avoid = usedBy[tpl] || new Set()
      const exercises = buildDay(TEMPLATES[tpl], { pool, avoid, week, familiarity, behind, count, maintain: false })
      usedBy[tpl] = new Set([...avoid, ...exercises.map(e => norm(e.name))])
      for (const e of exercises) week.add(norm(e.name))
      return { id: `plan-${i}`, name, program: PROGRAM_OF[tpl], dow: split.dows[i], exercises }
    }),
  }
}

// Best exercise for one muscle with this equipment, as an accessory.
export function suggestFor(muscle, { library, equipment, familiarity = () => 0, exclude = [] }) {
  const skip = new Set(exclude.map(norm))
  const pool = usablePool(library, equipment).filter(e => !skip.has(norm(e.name)))
  const e = pick(muscle, 1, { pool, used: new Set(), avoid: new Set(), week: new Set(), familiarity })
  return e ? prescription(e, 1, false) : null
}

// Main lifts (marked anchor/compound) get the long rest.
export const isMainEntry = e => /anchor|compound/i.test(e?.notes || '')

// Minutes a planned exercise takes: ~45 s per set of work, the rest after
// each set, and a minute to set up.
export const exerciseMinutes = (e, restSecs) => e.sets * (0.75 + restSecs / 60) + 1

// Time-box a planned day: keep exercises in order (most important first)
// while they fit. Always keeps the first one.
export function fitToTime(exercises, minutes, restFor) {
  const out = []
  let used = 0
  for (const e of exercises) {
    const t = exerciseMinutes(e, restFor(e))
    if (out.length && used + t > minutes) break
    out.push(e)
    used += t
  }
  return { exercises: out, minutes: Math.round(used) }
}

// One swap for a planned day: the muscle furthest under target that the
// day doesn't train replaces the day's last accessory whose muscle is
// already on track. null when nothing is far enough behind.
export function swapIdea(day, { library, equipment, familiarity, behind, muscleOf }) {
  const trained = new Set(day.exercises.map(e => muscleOf(e.name)))
  const lag = Object.entries(behind).filter(([m, b]) => b >= 0.5 && !trained.has(m)).sort((a, b) => b[1] - a[1])[0]
  if (!lag) return null
  let index = -1
  day.exercises.forEach((e, i) => { if (!isMainEntry(e) && (behind[muscleOf(e.name)] || 0) < 0.5) index = i })
  if (index < 0) return null
  const add = suggestFor(lag[0], { library, equipment, familiarity, exclude: day.exercises.map(e => e.name) })
  return add ? { muscle: lag[0], index, out: day.exercises[index], in: add } : null
}

// One short full-body maintenance session. `variant` rotates the template
// so consecutive holiday days hit muscles in a different order. Balanced on
// purpose (no catching up on lagging muscles), and paced for ~60 s rests.
const HOLIDAY_PER_SET = 1.5
export function holidaySession({ equipment, minutes, library, familiarity = () => 0, variant = 0 }) {
  const pool = usablePool(library, equipment)
  const count = exercisesThatFit(minutes, 2, HOLIDAY_PER_SET)
  const day = (v, avoid) => buildDay(HOLIDAY_TEMPLATES[v % 3], { pool, avoid, familiarity, behind: {}, count, maintain: true })
  const prev = day(variant + 2, new Set())
  const exercises = day(variant, new Set(prev.map(e => norm(e.name))))
  const cardio = library
    .filter(e => !e.hidden && e.muscle === 'Cardio' && hasEquipment(e, equipment))
    .sort((a, b) => familiarity(b.name) - familiarity(a.name) || (b.name === 'Treadmill') - (a.name === 'Treadmill'))[0]
  if (cardio) exercises.push({ name: cardio.name, sets: 1, reps: '10–15', notes: 'Optional finisher — easy incline walk if there\'s time' })
  return exercises
}

// Rest-day catch-up suggestions (Mon/Sat): what got skipped this training
// cycle, ranked by which muscles are furthest under their weekly volume
// target — not an auto-built session, just a ranked pick-and-choose list
// (see src/main.js catchupSheet()).
import { routine, sessionsBetween, muscleSets, muscles } from './store.js'
import { sortedDays } from './routine.js'
import { today, dow, weekStart, addDays } from './dates.js'
import { MUSCLES } from './model.js'

// Sat looks at this week's Sun..Fri. Mon is only the 2nd day of a new week —
// barely any data in "this week" yet — so it closes out the cycle that just
// ended instead: last week's Sun..Sat plus this week's Sunday.
export function catchupWindow(date = today()) {
  return dow(date) === 1
    ? { from: addDays(weekStart(date), -7), to: addDays(date, -1) }
    : { from: weekStart(date), to: addDays(date, -1) }
}

const STATUS_RANK = { none: 0, low: 1, good: 2, over: 3 }
export const muscleStatus = (v, m) => (v === 0 ? 'none' : v < m.min ? 'low' : v <= m.optimal ? 'good' : 'over')

export function muscleStatuses(from, to) {
  const sets = muscleSets(from, to)
  return Object.fromEntries(MUSCLES.map(m => [m.key, muscleStatus(sets[m.key] || 0, m)]))
}

// Everything planned this cycle that wasn't logged: a whole skipped day
// counts every exercise on it; a partially-done day counts only whichever
// exercises never showed up in any session logged under that program.
export function missedExercises(from, to) {
  const sessions = sessionsBetween(from, to)
  const out = []
  for (const day of sortedDays(routine()).filter(d => d.dow != null)) {
    const done = sessions.filter(s => s.program === day.program)
    const logged = new Set(done.flatMap(s => s.exercises.map(e => e.name.toLowerCase())))
    const wholeDayMissed = done.length === 0
    for (const ex of day.exercises) {
      if (logged.has(ex.name.toLowerCase())) continue
      out.push({ name: ex.name, entry: ex, dayId: day.id, dayName: day.name, program: day.program, wholeDayMissed })
    }
  }
  return out
}

// Ranked, highest-value first: under-target muscles before on-target before
// already-over; priority muscles and compound anchors bump up within that;
// a fully-skipped day outranks a partially-done one at the same muscle status.
export function catchupSuggestions(date = today(), priorityMuscles = []) {
  const { from, to } = catchupWindow(date)
  const statuses = muscleStatuses(from, to)
  const items = missedExercises(from, to).map(m => {
    const mm = muscles(m.name)
    const status = statuses[mm.primary] || 'none'
    const isPriority = priorityMuscles.includes(mm.primary) || mm.secondary.some(s => priorityMuscles.includes(s))
    const isAnchor = /anchor/i.test(m.entry.notes || '')
    const score = STATUS_RANK[status] * 10 - (isPriority ? 3 : 0) - (isAnchor ? 1 : 0) - (m.wholeDayMissed ? 0.5 : 0)
    return { ...m, muscle: mm.primary, status, isPriority, isAnchor, score }
  }).sort((a, b) => a.score - b.score)
  return { from, to, statuses, items }
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLibrary } from '../src/model.js'
import { buildPlan, holidaySession, minutesPerSet, hasEquipment, GYM_EQUIPMENT, SPLITS } from '../src/planner.js'

const library = buildLibrary([])
const byName = new Map(library.map(e => [e.name, e]))
const muscleOf = n => byName.get(n)?.muscle

test('equipment matching: bodyweight always, blank never, comma lists match any', () => {
  assert.equal(hasEquipment({ equipment: 'Bodyweight' }, []), true)
  assert.equal(hasEquipment({ equipment: '' }, GYM_EQUIPMENT), false)
  assert.equal(hasEquipment({ equipment: 'Cable, Smith Machine' }, ['Smith Machine']), true)
  assert.equal(hasEquipment({ equipment: 'Dumbbells' }, ['Machine']), false)
})

test('every split has a day on a distinct weekday', () => {
  for (const [n, s] of Object.entries(SPLITS)) {
    assert.equal(s.days.length, Number(n))
    assert.equal(new Set(s.dows).size, Number(n))
  }
})

test('full gym, 5 days: legs day leads with the squat and gets hamstrings + glutes when they are behind', () => {
  const plan = buildPlan({ library, equipment: GYM_EQUIPMENT, days: 5, minutes: 30, perSet: 2.5, behind: { Hamstrings: 1, Glutes: 1, Quads: 0.9 } })
  const legs = plan.days.find(d => d.name === 'Legs')
  assert.equal(legs.exercises[0].name, 'Smith Squat')
  const muscles = legs.exercises.map(e => muscleOf(e.name))
  assert.ok(muscles.includes('Hamstrings'), muscles.join())
  assert.ok(muscles.includes('Glutes'), muscles.join())
  for (const d of plan.days) assert.ok(d.exercises.length >= 2, d.name)
})

test('time budget caps exercises per day', () => {
  const short = buildPlan({ library, equipment: GYM_EQUIPMENT, days: 4, minutes: 20, perSet: 2.5 })
  const long = buildPlan({ library, equipment: GYM_EQUIPMENT, days: 4, minutes: 60, perSet: 2.5 })
  assert.ok(Math.max(...short.days.map(d => d.exercises.length)) <= 2)
  assert.ok(Math.min(...long.days.map(d => d.exercises.length)) >= 5)
})

test('only machines: no dumbbell/barbell work, hamstrings from the leg curl', () => {
  const plan = buildPlan({ library, equipment: ['Machine'], days: 4, minutes: 60, perSet: 2.5 })
  const names = plan.days.flatMap(d => d.exercises.map(e => e.name))
  for (const n of names) assert.ok(['machine', 'bodyweight'].includes(byName.get(n).equipment.toLowerCase()), n)
  assert.ok(names.includes('Seated Leg Curl'))
})

test('A/B days of the same type prefer different exercises', () => {
  const plan = buildPlan({ library, equipment: GYM_EQUIPMENT, days: 4, minutes: 45, perSet: 2.5 })
  const a = plan.days.find(d => d.name === 'Upper A').exercises.map(e => e.name)
  const b = plan.days.find(d => d.name === 'Upper B').exercises.map(e => e.name)
  assert.notDeepEqual(a, b)
})

test('familiar exercises win over unfamiliar ones for the same muscle', () => {
  const plan = buildPlan({ library, equipment: GYM_EQUIPMENT, days: 5, minutes: 45, perSet: 2.5, familiarity: n => (n === 'Chest Press Machine' ? 40 : 0) })
  assert.equal(plan.days.find(d => d.name === 'Push').exercises[0].name, 'Chest Press Machine')
})

test('holiday with just a treadmill: bodyweight only, 2 sets, optional walk at the end', () => {
  const s = holidaySession({ library, equipment: ['Cardio machine'], minutes: 20, perSet: 2.5 })
  const lifts = s.slice(0, -1)
  assert.ok(lifts.length >= 3)
  for (const e of lifts) {
    assert.equal(byName.get(e.name).equipment, 'Bodyweight', e.name)
    assert.equal(e.sets, 2)
  }
  assert.equal(s.at(-1).name, 'Treadmill')
})

test('holiday without a treadmill skips the walk; consecutive variants differ', () => {
  const a = holidaySession({ library, equipment: [], minutes: 20, variant: 0 })
  const b = holidaySession({ library, equipment: [], minutes: 20, variant: 1 })
  assert.ok(!a.some(e => e.name === 'Treadmill'))
  assert.notDeepEqual(a.map(e => e.name), b.map(e => e.name))
})

test('minutes per set is the median of recent sessions, clamped', () => {
  const s = (duration, sets) => ({ duration, exercises: [{ sets: Array.from({ length: sets }, () => ({ type: 'working' })) }] })
  assert.equal(minutesPerSet([s(30, 10), s(40, 10), s(60, 10)]), 4)
  assert.equal(minutesPerSet([s(25, 10), s(26, 10), s(27, 10)]), 2.6)
  assert.equal(minutesPerSet([]), 2.5)
  assert.equal(minutesPerSet([s(0, 10), s(10, 2)]), 2.5)
})

import { fitToTime, swapIdea, suggestFor, isMainEntry } from '../src/planner.js'
import { suggestNext } from '../src/model.js'

test('time box keeps exercises in order while they fit, always at least one', () => {
  const day = [
    { name: 'Smith Squat', sets: 3, notes: 'Legs anchor' },
    { name: 'Romanian Deadlift (Dumbbell)', sets: 3 },
    { name: 'Leg Extension', sets: 3 },
    { name: 'Decline Crunch', sets: 3 },
  ]
  const rest = e => (isMainEntry(e) ? 180 : 90)
  // squat 3×(0.75+3)+1 = 12.25, others 3×(0.75+1.5)+1 = 7.75 each
  assert.deepEqual(fitToTime(day, 20, rest).exercises.map(e => e.name), ['Smith Squat', 'Romanian Deadlift (Dumbbell)'])
  assert.equal(fitToTime(day, 5, rest).exercises.length, 1)
  assert.equal(fitToTime(day, 60, rest).exercises.length, 4)
})

test('swap: furthest-behind untrained muscle replaces the last on-track accessory', () => {
  const day = { exercises: [
    { name: 'Seated Cable Row', sets: 3, notes: 'Compound anchor' },
    { name: 'Wrist Curl', sets: 3 },
    { name: 'EZ Bar Curl', sets: 3 },
  ] }
  const behind = { Back: 0, Forearms: 0, Biceps: 0.2, Hamstrings: 1, Glutes: 0.9, Chest: 0.4 }
  const idea = swapIdea(day, { library, equipment: GYM_EQUIPMENT, familiarity: () => 0, behind, muscleOf })
  assert.equal(idea.muscle, 'Hamstrings')
  assert.equal(idea.out.name, 'EZ Bar Curl')
  assert.equal(muscleOf(idea.in.name), 'Hamstrings')
  assert.equal(swapIdea(day, { library, equipment: GYM_EQUIPMENT, familiarity: () => 0, behind: { Back: 0 }, muscleOf }), null)
})

test('suggestFor respects equipment and exclusions', () => {
  assert.equal(suggestFor('Hamstrings', { library, equipment: ['Machine'] }).name, 'Seated Leg Curl')
  assert.equal(byName.get(suggestFor('Hamstrings', { library, equipment: [], exclude: [] }).name).equipment, 'Bodyweight')
})

test('weight suggestion uses the gym step and stops at its heaviest', () => {
  const last = [{ type: 'working', weight: 70, reps: 12 }, { type: 'working', weight: 70, reps: 12 }]
  assert.equal(suggestNext(last, [8, 12], false), 72.5)
  assert.equal(suggestNext(last, [8, 12], false, { step: 5 }), 75)
  assert.equal(suggestNext(last, [8, 12], false, { step: 5, limit: 72 }), null)
  assert.equal(suggestNext(last, [8, 12], false, { step: 2, limit: 72 }), 72)
})

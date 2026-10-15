process.env.TZ = 'Asia/Bangkok'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { parseCsv, parseHevy, planImport, parseHevyDate } from '../src/hevy.js'

const HEAD = 'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe'
const csv = [
  HEAD,
  'Tues (Pull),"8 Sep 2026, 06:31","8 Sep 2026, 06:57",,Seated Palms Up Wrist Curl,1,,0,normal,15,20,,,',
  'Tues (Pull),"8 Sep 2026, 06:31","8 Sep 2026, 06:57",,Seated Palms Up Wrist Curl,1,,1,normal,15,20,,,',
  'Tues (Pull),"8 Sep 2026, 06:31","8 Sep 2026, 06:57",,Lat Pulldown (Machine),2,"grip ""wide"", slow",0,normal,36,24,,,',
  'Mon (Cardio),"7 Sep 2026, 06:10","7 Sep 2026, 06:45",77.4,Treadmill,,,0,normal,,,,2100,',
  'Mon (Cardio),"7 Sep 2026, 06:10","7 Sep 2026, 06:45",77.4,Plank,,,0,normal,,,,75,',
  'Sun (Full Body + Arms),"29 Mar 2026, 15:38","29 Mar 2026, 16:40","felt strong\nslept 8h",Incline Bench Press (Smith Machine),0,,0,normal,22.5,12,,,',
  'Sun (Full Body + Arms),"29 Mar 2026, 15:38","29 Mar 2026, 16:40","felt strong\nslept 8h",Incline Bench Press (Smith Machine),0,,1,normal,45,10,,,',
  'Sun (Full Body + Arms),"29 Mar 2026, 15:38","29 Mar 2026, 16:40","felt strong\nslept 8h",Incline Bench Press (Smith Machine),0,,2,normal,45,9,,,',
].join('\n')

test('csv parser handles quotes, escaped quotes and newlines', () => {
  const rows = parseCsv('a,"b, c","d ""e""\nf"\r\n1,2,3')
  assert.deepEqual(rows, [['a', 'b, c', 'd "e"\nf'], ['1', '2', '3']])
})

test('dates are local, not UTC (6am Bangkok stays on the same day)', () => {
  const { workouts } = parseHevy(csv)
  const pull = workouts.find(w => w.program === 'Pull')
  assert.equal(pull.date, '2026-09-08')
  assert.equal(pull.duration, 26)
  assert.equal(pull.start, parseHevyDate('8 Sep 2026, 06:31').getTime())
})

test('names map to Iron Log names, notes and warm-up ramp detected', () => {
  const { workouts, weights } = parseHevy(csv)
  const pull = workouts.find(w => w.program === 'Pull')
  assert.deepEqual(pull.exercises.map(e => e.name), ['Wrist Curl', 'Lat Pulldown'])
  assert.equal(pull.exercises[1].note, 'grip "wide", slow')
  assert.ok(pull.exercises[0].sets.every(s => s.type === 'working'))
  const fb = workouts.find(w => w.title.startsWith('Sun'))
  assert.equal(fb.notes, 'felt strong\nslept 8h')
  assert.equal(fb.exercises[0].name, 'Smith Incline Bench')
  assert.deepEqual(fb.exercises[0].sets.map(s => s.type), ['warmup', 'working', 'working'])
  assert.deepEqual(weights, [{ date: '2026-09-07', weight: 77.4, note: 'HEVY' }])
  const cardio = workouts.find(w => w.program === 'Cardio')
  assert.deepEqual(cardio.exercises[0].sets[0], { type: 'working', weight: 0, reps: 35 })
  assert.deepEqual(cardio.exercises[1].sets[0], { type: 'working', weight: 0, reps: 75, timed: true })
})

test('plan: v1 imports matched by createdAt get their shifted date fixed; new ones added', () => {
  const parsed = parseHevy(csv)
  const start = parseHevyDate('8 Sep 2026, 06:31').getTime()
  const existing = [
    { id: 'v1a', date: '2026-09-07', program: 'Pull', createdAt: start, exercises: [{ name: 'Wrist Curl', sets: [] }] },
    { id: 'm1', date: '2026-03-29', program: 'Push', createdAt: 1, exercises: [{ name: 'Smith Incline Bench', sets: [] }] },
  ]
  const plan = planImport(parsed, existing, [{ date: '2026-09-07', weight: 77 }])
  assert.deepEqual(plan.fixDates, [{ id: 'v1a', from: '2026-09-07', to: '2026-09-08' }])
  assert.equal(plan.same, 1)
  assert.equal(plan.dupes, 1)
  assert.deepEqual(plan.add.map(s => s.program), ['Cardio'])
  assert.equal(plan.add[0].id, `hevy-${parseHevyDate('7 Sep 2026, 06:10').getTime()}`)
  assert.equal(plan.weights.length, 0)
  const again = planImport(parsed, [...existing, ...plan.add], [])
  assert.equal(again.add.length, 0)
})

const real = new URL('../raw data/260909 workout_data.csv', import.meta.url)
const latest = new URL('../raw data/261015 workout_data.csv', import.meta.url)
test('15 Oct export parses (378 workouts)', { skip: !existsSync(latest) }, () => {
  const { workouts } = parseHevy(readFileSync(latest, 'utf8'))
  assert.equal(workouts.length, 378)
  assert.equal(workouts.at(-1).date, '2026-10-15')
  const plank = workouts.flatMap(w => w.exercises).find(e => e.name === 'Plank')
  assert.ok(plank.sets.every(s => s.timed && s.reps >= 30))
})

test('real export parses (359 workouts)', { skip: !existsSync(real) }, () => {
  const { workouts } = parseHevy(readFileSync(real, 'utf8'))
  assert.equal(workouts.length, 359)
  assert.ok(workouts.every(w => /^\d{4}-\d\d-\d\d$/.test(w.date) && w.exercises.length))
  assert.equal(workouts.at(-1).date, '2026-09-08')
})

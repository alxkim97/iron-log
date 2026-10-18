// The weekly routine: one entry per training day. Seeded from what Alex
// actually logged in HEVY Jul–Sep 2026 (most frequent exercises per day),
// with v1's protocol rep ranges. Editable on the Routine page; synced in
// iron_prefs.
//
// Mon and Sat are both rest days (confirmed 2026-10-18) — Mon was
// previously seeded as a "Cardio" day from old HEVY data, but that was
// never actually the plan, which is why it never got logged (0/14 weeks).
// Treadmill walks are tracked separately in WalkLog, not as an Iron Log
// training day.
import { dow } from './dates.js'

const E = (name, sets, reps, notes = '') => ({ name, sets, reps, notes })

export const DEFAULT_ROUTINE = {
  days: [
    { id: 'push', name: 'Push', program: 'Push', dow: 0, exercises: [
      E('Smith Incline Bench', 3, '6–10', 'Compound anchor'),
      E('Lateral Raise', 3, '15–20'),
      E('Tricep Pushdown', 3, '8–12'),
      E('Smith Overhead Press', 3, '8–12'),
      E('Seated Cable Row', 3, '8–12'),
    ] },
    { id: 'pull', name: 'Pull', program: 'Pull', dow: 2, exercises: [
      E('Seated Cable Row', 3, '6–12', 'Compound anchor'),
      E('Wrist Curl', 3, '15–20'),
      E('EZ Bar Curl', 3, '8–12'),
      E('Straight-Arm Pulldown', 3, '12–15'),
      E('Reverse Curl EZ Bar', 3, '10–15'),
    ] },
    { id: 'legs', name: 'Legs', program: 'Legs', dow: 3, exercises: [
      E('Leg Extension', 3, '10–15'),
      E('Pallof Press', 3, '12–15'),
      E('Back Extension', 3, '10–15'),
      E('Decline Crunch', 3, '15–20'),
      E('Smith Squat', 3, '6–12'),
    ] },
    { id: 'upper', name: 'Upper', program: 'Upper', dow: 4, exercises: [
      E('Smith Bench Press', 3, '6–10', 'Compound anchor'),
      E('Seated Cable Row', 3, '8–12'),
      E('Close-Grip Bench Press', 3, '8–12'),
      E('Lat Pulldown', 3, '10–15'),
    ] },
    { id: 'arms', name: 'Arms', program: 'Arms', dow: 5, exercises: [
      E('Incline DB Curl', 3, '8–12'),
      E('Wrist Curl', 3, '15–20'),
      E('Tricep Extension Cable', 3, '10–15'),
      E('Lateral Raise', 3, '15–20'),
      E('Reverse Curl EZ Bar', 3, '8–12'),
    ] },
  ],
}

export const cloneRoutine = r => JSON.parse(JSON.stringify(r || DEFAULT_ROUTINE))

export const dayForDate = (routine, date) => (routine?.days || []).find(d => d.dow === dow(date)) || null
export const dayById = (routine, id) => (routine?.days || []).find(d => d.id === id) || null

// Days in week order, unscheduled ones last.
export const sortedDays = routine => [...(routine?.days || [])].sort((a, b) => (a.dow ?? 9) - (b.dow ?? 9))

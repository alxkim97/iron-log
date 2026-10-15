// v1's 35 achievements, same names (the seen-list is keyed by name).
import { daysBetween, addDays } from './dates.js'

export function achievementDefs({ sessions, bwLog, checkins, volOf }) {
  const n = sessions.length
  const vols = sessions.map(volOf)
  const vol = vols.reduce((a, v) => a + v, 0)
  const maxSingleVol = n ? Math.max(...vols) : 0
  const maxDuration = Math.max(0, ...sessions.map(s => s.duration || 0))

  const dates = [...new Set(sessions.map(s => s.date))].sort()
  let best = 0, run = 0, prev = null
  for (const d of dates) { run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = d }

  const uEx = new Set(sessions.flatMap(s => s.exercises.map(e => e.name.toLowerCase()))).size
  const programs = new Set(sessions.map(s => s.program))
  const count = p => sessions.filter(s => s.program === p).length
  const perKey = key => { const m = {}; for (const s of sessions) { const k = key(s.date); m[k] = (m[k] || 0) + 1 } return Math.max(0, ...Object.values(m)) }
  const maxWeek = perKey(d => addDays(d, -((new Date(d + 'T00:00').getDay() + 6) % 7)))
  const maxMonth = perKey(d => d.slice(0, 7))
  const hasCardio = sessions.some(s => s.program === 'Cardio' || s.program === 'Other' || s.exercises.some(e => /treadmill|elliptical/i.test(e.name)))

  return [
    { icon: '🏁', name: 'First Rep', desc: 'Log your first workout', u: n >= 1, p: [n, 1] },
    { icon: '🥉', name: '10 Sessions', desc: 'Log 10 sessions', u: n >= 10, p: [n, 10] },
    { icon: '🥈', name: '25 Sessions', desc: 'Log 25 sessions', u: n >= 25, p: [n, 25] },
    { icon: '🥇', name: '50 Sessions', desc: 'Log 50 sessions', u: n >= 50, p: [n, 50] },
    { icon: '💯', name: 'Century', desc: 'Log 100 sessions', u: n >= 100, p: [n, 100] },
    { icon: '💎', name: 'Elite 200', desc: 'Log 200 sessions', u: n >= 200, p: [n, 200] },
    { icon: '👑', name: 'Legend 500', desc: 'Log 500 sessions', u: n >= 500, p: [n, 500] },
    { icon: '⚡', name: '3-Day Streak', desc: 'Train 3 days in a row', u: best >= 3, p: [best, 3] },
    { icon: '🔥', name: 'Week Warrior', desc: 'Train 7 days in a row', u: best >= 7, p: [best, 7] },
    { icon: '🌟', name: 'Fortnight', desc: 'Train 14 days straight', u: best >= 14, p: [best, 14] },
    { icon: '🏔️', name: 'Iron Month', desc: 'Train 30 days straight', u: best >= 30, p: [best, 30] },
    { icon: '🏋️', name: '10K Club', desc: 'Lift 10,000 kg in total', u: vol >= 1e4, p: [vol, 1e4] },
    { icon: '💪', name: '50K Beast', desc: 'Lift 50,000 kg in total', u: vol >= 5e4, p: [vol, 5e4] },
    { icon: '🚀', name: '100K Monster', desc: 'Lift 100,000 kg in total', u: vol >= 1e5, p: [vol, 1e5] },
    { icon: '🌍', name: '250K Titan', desc: 'Lift 250,000 kg in total', u: vol >= 2.5e5, p: [vol, 2.5e5] },
    { icon: '🌌', name: '500K Legend', desc: 'Lift 500,000 kg in total', u: vol >= 5e5, p: [vol, 5e5] },
    { icon: '♾️', name: 'Million Kilo', desc: 'Lift 1,000,000 kg in total', u: vol >= 1e6, p: [vol, 1e6] },
    { icon: '⚡', name: 'Iron 5K', desc: 'Lift 5,000 kg in one session', u: maxSingleVol >= 5000, p: [maxSingleVol, 5000] },
    { icon: '🔱', name: 'Titan Day', desc: 'Lift 10,000 kg in one session', u: maxSingleVol >= 10000, p: [maxSingleVol, 10000] },
    { icon: '📚', name: 'Explorer', desc: 'Log 5 different exercises', u: uEx >= 5, p: [uEx, 5] },
    { icon: '🎯', name: 'Specialist', desc: 'Log 10 different exercises', u: uEx >= 10, p: [uEx, 10] },
    { icon: '🔬', name: 'Experimenter', desc: 'Log 20 different exercises', u: uEx >= 20, p: [uEx, 20] },
    { icon: '🎨', name: 'Full Spectrum', desc: 'Log Push, Pull, Legs, Upper and Arms', u: ['Push', 'Pull', 'Legs', 'Upper', 'Arms'].every(p => programs.has(p)) },
    { icon: '🫸', name: 'Push × 10', desc: 'Complete 10 Push sessions', u: count('Push') >= 10, p: [count('Push'), 10] },
    { icon: '🫷', name: 'Pull × 10', desc: 'Complete 10 Pull sessions', u: count('Pull') >= 10, p: [count('Pull'), 10] },
    { icon: '🦵', name: 'Leg Day × 10', desc: 'Complete 10 Legs sessions', u: count('Legs') >= 10, p: [count('Legs'), 10] },
    { icon: '🗓️', name: 'Quad Week', desc: 'Log 4 sessions in one week', u: maxWeek >= 4, p: [maxWeek, 4] },
    { icon: '📅', name: 'Month Grind', desc: 'Log 10 sessions in one month', u: maxMonth >= 10, p: [maxMonth, 10] },
    { icon: '⚖️', name: 'Scale Habit', desc: 'Log 10 body weights', u: bwLog.length >= 10, p: [bwLog.length, 10] },
    { icon: '📊', name: 'Scale Master', desc: 'Log 30 body weights', u: bwLog.length >= 30, p: [bwLog.length, 30] },
    { icon: '📋', name: 'First Check-in', desc: 'Complete a weekly check-in', u: checkins.length >= 1, p: [checkins.length, 1] },
    { icon: '📝', name: 'Reflector', desc: 'Complete 5 weekly check-ins', u: checkins.length >= 5, p: [checkins.length, 5] },
    { icon: '🏆', name: 'Dedicated', desc: 'Complete 20 weekly check-ins', u: checkins.length >= 20, p: [checkins.length, 20] },
    { icon: '⏱️', name: 'Marathon', desc: 'A session over 90 minutes', u: maxDuration >= 90, p: [maxDuration, 90] },
    { icon: '🏃', name: 'Cardio Starter', desc: 'Log a cardio session', u: hasCardio },
  ]
}

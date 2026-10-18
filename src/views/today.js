import { esc, icon } from '../ui.js'
import { state, routine, sortedSessions, sessionVol, weekStreak, latestBw, sessionsBetween } from '../store.js'
import { dayForDate, sortedDays } from '../routine.js'
import { today, weekStart, addDays, longDate, DOW_LONG, dow, clock } from '../dates.js'
import { catchupSuggestions } from '../catchup.js'
import { fmtVol, fmtKg, programColor } from '../model.js'
import { liveSummary } from '../workout.js'
import { sessionRow, weekStrip, muscleBars, recoveryGrid } from '../components.js'
import { lineChart } from '../charts.js'
import { checkinCard } from './body.js'

function hero() {
  const t = today()
  const day = dayForDate(routine(), t)
  const doneToday = sortedSessions().filter(s => s.date === t)
  const live = liveSummary()
  let h, sub, actions, color = 'var(--accent)'
  if (live) {
    h = 'Workout in progress'
    sub = `${esc(live.title)} · <span class="wk-clock">${clock((Date.now() - live.startedAt) / 1000)}</span> · ${live.sets} sets logged`
    actions = `<button class="btn hero-btn" data-act="resume">${icon('play', 18)} Resume</button>`
  } else if (doneToday.length) {
    const s = doneToday[0]
    color = programColor(s.program)
    h = 'Done for today 💪'
    sub = `${esc(s.program)} · ${s.duration ? `${s.duration} min · ` : ''}${esc(fmtVol(sessionVol(s)))}`
    actions = `<button class="btn hero-btn" data-act="session" data-id="${esc(s.id)}">View session</button><button class="btn hero-ghost" data-act="start-sheet">Another workout</button>`
  } else if (day) {
    color = programColor(day.program)
    h = `${esc(day.name)} day`
    sub = esc(day.exercises.map(e => e.name).join(' · '))
    actions = `<button class="btn hero-btn" data-act="start" data-day="${esc(day.id)}">${icon('play', 18)} Start ${esc(day.name)}</button><button class="btn hero-ghost" data-act="start-sheet">Something else</button>`
  } else {
    h = 'Rest day'
    const next = sortedDays(routine()).find(d => d.dow != null && d.dow > dow(t)) || sortedDays(routine())[0]
    const missed = catchupSuggestions(t, state.prefs.priorityMuscles || []).items.length
    sub = missed
      ? `${missed} exercise${missed === 1 ? '' : 's'} from this week could use a catch-up.`
      : `Recover well.${next ? ` Next up: ${esc(next.name)} on ${DOW_LONG[next.dow] || 'any day'}.` : ''}`
    actions = missed
      ? `<button class="btn hero-btn" data-act="catchup-sheet">${icon('repeat', 18)} Catch-up</button><button class="btn hero-ghost" data-act="start-sheet">Something else</button>`
      : `<button class="btn hero-btn" data-act="start-sheet">${icon('play', 18)} Train anyway</button>`
  }
  const ws = weekStart(t)
  const week = sessionsBetween(ws, addDays(ws, 6))
  const planned = routine().days.filter(d => d.dow != null).length
  const bw = latestBw()
  const streak = weekStreak()
  return `
    <section class="hero" style="--hc:${color}">
      <div class="hero-text">
        <p class="hero-date">${esc(longDate(t))}</p>
        <h1>${h}</h1>
        <p class="hero-sub">${sub}</p>
        <div class="hero-actions">${actions}</div>
      </div>
      <div class="stats">
        <div class="stat"><b>${week.length}<small>/${planned}</small></b><span>this week</span></div>
        <div class="stat"><b>${streak}</b><span>week streak</span></div>
        <div class="stat"><b>${unit(fmtVol(week.reduce((a, s) => a + sessionVol(s), 0)))}</b><span>volume</span></div>
        <div class="stat"><b>${bw ? `${esc(fmtKg(bw.weight))}<small> kg</small>` : '—'}</b><span>body weight</span></div>
      </div>
    </section>`
}

const unit = txt => { const [n, u] = txt.split(' '); return `${esc(n)}<small> ${esc(u || '')}</small>` }

function bwCard() {
  const pts = [...state.bwLog].filter(b => b.date >= addDays(today(), -90)).sort((a, b) => a.date.localeCompare(b.date)).map(b => ({ x: b.date, y: b.weight, tip: `${fmtKg(b.weight)} kg` }))
  const bw = latestBw()
  const first = pts[0]
  const delta = bw && first && first.x !== bw.date ? Math.round((bw.weight - first.y) * 10) / 10 : null
  return `
    <section class="card">
      <header class="card-head"><h2>${icon('scale', 18)} Body weight</h2><button class="btn small ghost" data-act="nav" data-view="body">All ${icon('right', 14)}</button></header>
      ${bw ? `<p class="big-num">${esc(fmtKg(bw.weight))}<small> kg</small>${delta != null ? `<span class="delta ${delta <= 0 ? 'down' : 'up'}">${delta > 0 ? '+' : ''}${delta} kg in 90 days</span>` : ''}</p>` : ''}
      ${pts.length >= 2 ? lineChart([{ label: 'Body weight', color: 'var(--chart-1)', points: pts }], { height: 110, unit: ' kg' }) : ''}
      <form class="bw-add" data-form="bw">
        <input name="w" inputmode="decimal" placeholder="Today's weight, kg" autocomplete="off" aria-label="Body weight in kg">
        <button class="btn soft" type="submit">Log</button>
      </form>
    </section>`
}

export function renderToday({ isPhone }) {
  const recent = sortedSessions().slice(0, 6)
  const left = `
    <section class="card">
      <header class="card-head"><h2>${icon('calendar', 18)} This week</h2></header>
      ${weekStrip()}
    </section>
    <section class="card">
      <header class="card-head"><h2>${icon('zap', 18)} Muscle volume</h2></header>
      ${muscleBars()}
    </section>
    <section class="card">
      <header class="card-head"><h2>${icon('history', 18)} Recent</h2><button class="btn small ghost" data-act="nav" data-view="history">History ${icon('right', 14)}</button></header>
      ${recent.length ? `<div class="list">${recent.map(s => sessionRow(s)).join('')}</div>` : '<p class="muted">No sessions yet — start one above, or import your HEVY history in Settings.</p>'}
    </section>`
  const right = `
    ${checkinCard({ compact: true })}
    <section class="card">
      <header class="card-head"><h2>${icon('heart', 18)} Recovery</h2></header>
      ${recoveryGrid()}
    </section>
    ${bwCard()}`
  return `
    ${hero()}
    <div class="today-grid">
      <div class="col">${left}</div>
      <div class="col">${right}</div>
    </div>`
}

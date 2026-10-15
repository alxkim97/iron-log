import { esc, icon, seg } from '../ui.js'
import { state, exerciseIndex, historyFor, muscles, isCardio, sortedSessions, sessionVol, achievements, routine } from '../store.js'
import { today, addDays, weekStart, shortDate, fullDate, agoDays, DOW_SHORT, monthShort } from '../dates.js'
import { fmtKg, fmtVol, fmtSet, round1, programColor, PROGRAMS } from '../model.js'
import { lineChart, columns } from '../charts.js'

const TABS = [['exercises', 'Exercises'], ['stats', 'Stats'], ['awards', 'Awards']]

export function renderProgress({ isPhone }) {
  const tab = state.ui.ptab || 'exercises'
  const body = tab === 'stats' ? stats() : tab === 'awards' ? awards() : exercises(isPhone)
  return `<div class="progress">${seg('ptab', tab, TABS, 'aria-label="Progress section"')}<div class="ptab-body">${body}</div></div>`
}

// ── Exercises ──
function exerciseList() {
  const q = (state.ui.exq || '').trim().toLowerCase()
  const rows = [...exerciseIndex().values()]
    .filter(h => !q || h.key.includes(q) || (muscles(h.name).primary || '').toLowerCase().includes(q))
    .sort((a, b) => b.entries.at(-1).date.localeCompare(a.entries.at(-1).date))
  return `
    <label class="search-box big">${icon('search', 16)}<input type="search" data-input="exq" placeholder="Find an exercise" value="${esc(state.ui.exq || '')}" autocomplete="off"></label>
    <div class="ex-list">
      ${rows.map(h => {
        const best = Math.max(...h.entries.map(e => e.st.maxW))
        const cardio = isCardio(h.name)
        return `<button type="button" class="ex-row${state.ui.exercise?.toLowerCase() === h.key ? ' on' : ''}" data-act="exercise" data-name="${esc(h.name)}">
          <span class="ex-row-main"><b>${esc(h.name)}</b><span>${esc(muscles(h.name).primary || '—')} · ${h.entries.length}× · ${esc(agoDays(h.entries.at(-1).date))}</span></span>
          ${!cardio && best ? `<span class="ex-row-best">${esc(fmtKg(best))}<small> kg</small></span>` : ''}
        </button>`
      }).join('') || '<p class="muted pad">No exercises logged yet.</p>'}
    </div>`
}

const RANGES = [['180', '6 mo'], ['365', '1 yr'], ['all', 'All']]

function exerciseDetail(name, isPhone) {
  const h = historyFor(name)
  if (!h) return `<div class="empty"><div class="empty-emoji">📈</div><p>Pick an exercise to see its progress.</p></div>`
  const cardio = isCardio(h.name)
  const range = state.ui.exRange || '365'
  const from = range === 'all' ? '0000' : addDays(today(), -Number(range))
  const entries = h.entries.filter(e => e.date >= from)
  const all = h.entries
  const heaviest = all.reduce((a, e) => e.st.maxW > (a?.st.maxW || 0) ? e : a, null)
  const bestE1 = all.reduce((a, e) => e.st.e1rm > (a?.st.e1rm || 0) ? e : a, null)
  const bestVol = all.reduce((a, e) => e.st.vol > (a?.st.vol || 0) ? e : a, null)
  const mu = muscles(h.name)
  const series = cardio
    ? [{ label: 'Minutes', color: 'var(--chart-1)', points: entries.map(e => ({ x: e.date, y: e.st.reps, tip: `${fmtKg(e.st.reps)} min` })) }]
    : [
      { label: 'Heaviest set', color: 'var(--chart-1)', points: entries.filter(e => e.st.maxW).map(e => ({ x: e.date, y: e.st.maxW, tip: `${fmtKg(e.st.maxW)} kg` })) },
      ...(entries.some(e => e.st.e1rm) ? [{ label: 'Est. 1RM', color: 'var(--chart-2)', points: entries.filter(e => e.st.e1rm).map(e => ({ x: e.date, y: round1(e.st.e1rm), tip: `${fmtKg(round1(e.st.e1rm))} kg e1RM` })) }] : []),
    ]
  const tile = (label, val, sub) => `<div class="tile"><span>${label}</span><b>${val}</b><em>${sub || ''}</em></div>`
  return `
    <div class="exd">
      <header class="exd-head">
        ${isPhone ? `<button class="icon-btn" data-act="exercise" data-name="" aria-label="Back">${icon('left')}</button>` : ''}
        <div><h2>${esc(h.name)}</h2><p class="muted small">${esc([mu.primary, ...mu.secondary].filter(Boolean).join(' · ') || 'Muscle not set')}</p></div>
      </header>
      <div class="tiles">
        ${cardio ? tile('Sessions', all.length, `since ${shortDate(all[0].date)}`) + tile('Longest', `${fmtKg(Math.max(...all.map(e => e.st.reps)))}<small> min</small>`, '')
          : [
            tile('Heaviest', heaviest ? `${fmtKg(heaviest.st.maxW)}<small> kg</small>` : '—', heaviest ? shortDate(heaviest.date) : ''),
            tile('Best est. 1RM', bestE1 ? `${fmtKg(round1(bestE1.st.e1rm))}<small> kg</small>` : '—', bestE1 ? `${fmtSet(bestE1.st.bestSet)} · ${shortDate(bestE1.date)}` : 'sets ≤15 reps'),
            tile('Best volume', bestVol ? esc(fmtVol(bestVol.st.vol)) : '—', bestVol ? shortDate(bestVol.date) : ''),
            tile('Done', `${all.length}<small>×</small>`, `since ${shortDate(all[0].date)}`),
          ].join('')}
      </div>
      <section class="card">
        <header class="card-head"><h2>${cardio ? 'Minutes per session' : 'Strength over time'}</h2>${seg('ex-range', range, RANGES)}</header>
        ${lineChart(series, { height: 220, unit: cardio ? ' min' : ' kg' })}
      </section>
      <section class="card">
        <header class="card-head"><h2>History</h2></header>
        <div class="table-list">
          ${[...all].reverse().slice(0, state.ui.exAll ? 9999 : 30).map(e => `
            <button type="button" class="tl-row hist" data-act="session" data-id="${esc(e.sid)}">
              <span>${esc(fullDate(e.date))}</span>
              <span class="hist-sets">${e.ex.sets.map(s => `<i class="${s.type === 'warmup' ? 'warm' : ''}${!cardio && s.weight && s.weight === heaviest?.st.maxW ? ' best' : ''}">${esc(fmtSet(s, cardio))}</i>`).join('')}</span>
              ${cardio ? '' : `<b>${esc(fmtVol(e.st.vol))}</b>`}
            </button>`).join('')}
        </div>
        ${all.length > 30 && !state.ui.exAll ? `<button class="btn small ghost" data-act="ex-all">Show all ${all.length}</button>` : ''}
      </section>
    </div>`
}

function exercises(isPhone) {
  const sel = state.ui.exercise
  if (isPhone) return sel ? exerciseDetail(sel, true) : exerciseList()
  const pick = sel || [...exerciseIndex().values()].sort((a, b) => b.entries.at(-1).date.localeCompare(a.entries.at(-1).date))[0]?.name
  return `<div class="ex-split"><aside class="ex-side">${exerciseList()}</aside><div>${pick ? exerciseDetail(pick, false) : exerciseDetail(null)}</div></div>`
}

// ── Stats ──
function stats() {
  const all = sortedSessions()
  if (!all.length) return '<div class="empty"><div class="empty-emoji">📊</div><p>Stats appear once you have a few sessions.</p></div>'
  const t = today()
  const ws = weekStart(t)
  const weeks = Array.from({ length: 16 }, (_, i) => addDays(ws, -7 * (15 - i)))
  const perWeek = weeks.map(w => all.filter(s => s.date >= w && s.date <= addDays(w, 6)))
  const planned = routine().days.filter(d => d.dow != null).length
  const totalVol = all.reduce((a, s) => a + sessionVol(s), 0)
  const hours = all.reduce((a, s) => a + (s.duration || 0), 0) / 60
  const last12 = perWeek.slice(-13, -1).reduce((a, w) => a + w.length, 0) / 12
  const since90 = addDays(t, -90)
  const recent = all.filter(s => s.date >= since90)
  const mix = PROGRAMS.map(p => ({ p, n: recent.filter(s => s.program === p).length })).filter(x => x.n)
  const mixMax = Math.max(1, ...mix.map(x => x.n))
  const freq = new Map()
  for (const s of recent) for (const e of s.exercises) freq.set(e.name, (freq.get(e.name) || 0) + 1)
  const top = [...freq].sort((a, b) => b[1] - a[1]).slice(0, 8)
  const weekLabel = w => `${Number(w.slice(8))} ${monthShort(w)}`

  // Activity: last 26 weeks, one cell per day, coloured by program.
  const hmStart = addDays(ws, -7 * 25)
  const byDate = new Map(all.filter(s => s.date >= hmStart).map(s => [s.date, s]))
  const cols = Array.from({ length: 26 }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const date = addDays(hmStart, w * 7 + d)
    const s = byDate.get(date)
    return `<i class="${date > t ? 'fut' : s ? 'on' : ''}" style="${s ? `--c:${programColor(s.program)}` : ''}" title="${esc(fullDate(date) + (s ? ` · ${s.program}` : ''))}"></i>`
  }).join(''))
  return `
    <div class="tiles">
      <div class="tile"><span>Sessions</span><b>${all.length}</b><em>since ${esc(shortDate(all.at(-1).date))}</em></div>
      <div class="tile"><span>Total volume</span><b>${esc(fmtVol(totalVol))}</b><em>working sets</em></div>
      <div class="tile"><span>Time trained</span><b>${Math.round(hours)}<small> h</small></b><em>logged durations</em></div>
      <div class="tile"><span>Per week</span><b>${round1(last12)}</b><em>avg, last 12 weeks</em></div>
    </div>
    <div class="two-col">
      <section class="card">
        <header class="card-head"><h2>Sessions per week</h2><span class="muted small">line = ${planned} planned</span></header>
        ${columns(perWeek.map((w, i) => ({ label: weekLabel(weeks[i]), v: w.length, tip: `Week of ${shortDate(weeks[i])}: ${w.length} sessions` })), { target: planned, labelEvery: 4 })}
      </section>
      <section class="card">
        <header class="card-head"><h2>Volume per week</h2><span class="muted small">kg, working sets</span></header>
        ${columns(perWeek.map((w, i) => ({ label: weekLabel(weeks[i]), v: Math.round(w.reduce((a, s) => a + sessionVol(s), 0)), tip: `Week of ${shortDate(weeks[i])}: ${fmtVol(w.reduce((a, s) => a + sessionVol(s), 0))}` })), { labelEvery: 4 })}
      </section>
    </div>
    <section class="card">
      <header class="card-head"><h2>Activity</h2><span class="muted small">last 26 weeks</span></header>
      <div class="heat-wrap"><div class="heat-days">${DOW_SHORT.map((d, i) => `<span>${i % 2 ? '' : d}</span>`).join('')}</div><div class="heat">${cols.map(c => `<div>${c}</div>`).join('')}</div></div>
      <div class="legend">${PROGRAMS.filter(p => all.some(s => s.program === p && s.date >= hmStart)).map(p => `<span><i style="--c:${programColor(p)}"></i>${p}</span>`).join('')}</div>
    </section>
    <div class="two-col">
      <section class="card">
        <header class="card-head"><h2>Program mix</h2><span class="muted small">last 90 days</span></header>
        <div class="hbars">${mix.map(x => `<div class="hbar"><span class="hbar-name"><i style="--c:${programColor(x.p)}"></i>${x.p}</span><span class="hbar-track"><i style="width:${(x.n / mixMax) * 100}%;--c:${programColor(x.p)}"></i></span><b>${x.n}</b></div>`).join('')}</div>
      </section>
      <section class="card">
        <header class="card-head"><h2>Most done</h2><span class="muted small">last 90 days</span></header>
        <div class="table-list">${top.map(([n, c]) => `<button type="button" class="tl-row" data-act="exercise" data-name="${esc(n)}"><span>${esc(n)}</span><b>${c}×</b></button>`).join('')}</div>
      </section>
    </div>`
}

// ── Awards ──
function awards() {
  const defs = achievements()
  const got = defs.filter(a => a.u).length
  const sorted = [...defs].sort((a, b) => (b.u - a.u) || ((b.p ? b.p[0] / b.p[1] : 0) - (a.p ? a.p[0] / a.p[1] : 0)))
  return `
    <p class="muted">${got} of ${defs.length} unlocked</p>
    <div class="awards">${sorted.map(a => `
      <div class="award${a.u ? ' on' : ''}">
        <div class="award-icon">${a.icon}</div>
        <b>${esc(a.name)}</b>
        <span>${esc(a.desc)}</span>
        ${!a.u && a.p ? `<div class="award-prog"><i style="width:${Math.min(100, (a.p[0] / a.p[1]) * 100)}%"></i></div><em>${esc(fmtNum(a.p[0]))} / ${esc(fmtNum(a.p[1]))}</em>` : ''}
      </div>`).join('')}
    </div>`
}
const fmtNum = n => n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(Math.round(n))

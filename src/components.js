// Markup shared by several views. Interaction is wired by data-act attributes
// and the one delegated click handler in main.js.
import { esc, icon } from './ui.js'
import { programColor, MUSCLES, fmtVol, fmtKg } from './model.js'
import { sessionVol, muscleSets, lastTrained, routine, sortedSessions, isCardio } from './store.js'
import { today, weekStart, addDays, relDay, daysBetween, DOW_SHORT } from './dates.js'

export const pchip = p => `<span class="pchip static on" style="--c:${programColor(p)}">${esc(p)}</span>`

export function sessionRow(s, { showDate = true } = {}) {
  const names = s.exercises.map(e => e.name)
  const sets = s.exercises.reduce((a, e) => a + e.sets.filter(x => x.type !== 'warmup').length, 0)
  const vol = sessionVol(s)
  const cardioMins = s.exercises.filter(e => isCardio(e.name)).reduce((a, e) => a + e.sets.reduce((b, x) => b + x.reps, 0), 0)
  const big = vol ? fmtVol(vol) : cardioMins ? `${fmtKg(cardioMins)} min` : '—'
  return `
    <button type="button" class="srow" style="--c:${programColor(s.program)}" data-act="session" data-id="${esc(s.id)}">
      <span class="srow-bar"></span>
      <span class="srow-main">
        <span class="srow-top">${showDate ? `<b>${esc(relDay(s.date))}</b>` : ''}<span class="srow-prog">${esc(s.title && !/\(copy\)/.test(s.title) && s.source !== 'hevy' ? s.title : s.program)}</span></span>
        <span class="srow-ex">${esc(names.slice(0, 4).join(' · '))}${names.length > 4 ? ` +${names.length - 4}` : ''}</span>
      </span>
      <span class="srow-nums"><b>${esc(big)}</b><span>${sets} set${sets === 1 ? '' : 's'}${s.duration ? ` · ${s.duration}m` : ''}</span></span>
    </button>`
}

// Sun → Sat of the current training week: planned day vs what happened.
export function weekStrip(ref = today()) {
  const ws = weekStart(ref)
  const r = routine()
  const byDate = new Map()
  for (const s of sortedSessions()) if (s.date >= ws && s.date <= addDays(ws, 6)) { if (!byDate.has(s.date)) byDate.set(s.date, []); byDate.get(s.date).push(s) }
  return `<div class="wstrip">${Array.from({ length: 7 }, (_, i) => {
    const d = addDays(ws, i)
    const plan = r.days.find(x => x.dow === i)
    const done = byDate.get(d) || []
    const p = done[0]?.program || plan?.program
    const cls = [done.length ? 'done' : '', d === today() ? 'today' : '', d > today() ? 'future' : '', !done.length && plan && d < today() ? 'missed' : ''].join(' ')
    return `<button type="button" class="wday ${cls}" style="--c:${p ? programColor(p) : 'var(--border-2)'}" ${done[0] ? `data-act="session" data-id="${esc(done[0].id)}"` : ''} title="${esc(done.length ? done.map(s => s.program).join(', ') : plan ? `Planned: ${plan.name}` : 'Rest')}">
      <span class="wd">${DOW_SHORT[i][0]}</span>
      <span class="wdot">${done.length ? icon('check', 14) : ''}</span>
      <span class="wlabel">${esc(done[0]?.program || plan?.name || 'Rest')}</span>
    </button>`
  }).join('')}</div>`
}

export function muscleBars(from = weekStart(today()), to = today()) {
  const sets = muscleSets(from, to)
  return `<div class="mbars">${MUSCLES.map(m => {
    const v = sets[m.key] || 0
    const status = v === 0 ? 'none' : v < m.min ? 'low' : v <= m.optimal ? 'good' : 'over'
    const label = { none: '—', low: 'Low', good: 'On target', over: 'Above' }[status]
    const scale = m.optimal * 1.3
    return `<div class="mbar s-${status}" title="${esc(`${m.key}: ${v} sets · target ${m.min}–${m.optimal}`)}">
      <span class="mbar-name">${m.key}</span>
      <span class="mbar-track"><i class="mbar-zone" style="left:${(m.min / scale) * 100}%;width:${((m.optimal - m.min) / scale) * 100}%"></i><i class="mbar-fill" style="width:${Math.min(100, (v / scale) * 100)}%"></i></span>
      <span class="mbar-val"><b>${fmtKg(v)}</b><em>${label}</em></span>
    </div>`
  }).join('')}</div>
  <p class="muted small">Working sets this week · secondary muscles count half · shaded band = target range.</p>`
}

export function recoveryGrid() {
  const last = lastTrained()
  return `<div class="recov">${MUSCLES.map(m => {
    const d = last[m.key]
    const days = d ? daysBetween(d, today()) : null
    const st = days == null || days >= 3 ? 'fresh' : days >= 2 ? 'recovering' : 'fatigued'
    return `<div class="recov-item r-${st}">
      <i></i><span class="recov-name">${m.key}</span>
      <span class="recov-when">${days == null ? 'Not yet' : days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`}</span>
    </div>`
  }).join('')}</div>
  <p class="muted small"><span class="key r-fatigued"><i></i>Worked &lt;48h</span><span class="key r-recovering"><i></i>48–72h</span><span class="key r-fresh"><i></i>Fresh</span></p>`
}

export function stars(act, value, max = 5) {
  return `<div class="stars" role="radiogroup">${Array.from({ length: max }, (_, i) => `<button type="button" class="star${i < value ? ' on' : ''}" data-act="${act}" data-value="${i + 1}" aria-label="${i + 1} of ${max}">★</button>`).join('')}</div>`
}

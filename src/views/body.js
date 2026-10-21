import { esc, icon, seg } from '../ui.js'
import { state, sessionsBetween, latestBw, measurements, MEASURES } from '../store.js'
import { today, addDays, weekStart, dow, shortDate, fullDate } from '../dates.js'
import { fmtKg } from '../model.js'
import { lineChart } from '../charts.js'
import { stars } from '../components.js'

// Which week a check-in is due for: the current one from Friday, the one
// just ended on Sunday/Monday.
export function checkinWeek() {
  const t = today()
  const d = dow(t)
  if (d >= 5) return weekStart(t)
  if (d <= 1) return addDays(weekStart(t), -7)
  return null
}

function checkinForm(ws, { compact }) {
  const existing = state.checkins.find(c => c.weekStart === ws)
  const ui = state.ui.ci?.ws === ws ? state.ui.ci : (state.ui.ci = { ws, effort: existing?.effort || 0, recovery: existing?.recovery || 0, notes: existing?.notes || '' })
  const n = sessionsBetween(ws, addDays(ws, 6)).length
  return `
    <div class="ci-form">
      <p class="muted small">Week of ${esc(shortDate(ws))} · ${n} session${n === 1 ? '' : 's'}</p>
      <div class="ci-row"><span>Effort</span>${stars('ci-effort', ui.effort)}</div>
      <div class="ci-row"><span>Recovery</span>${stars('ci-recovery', ui.recovery)}</div>
      <textarea class="ci-notes" rows="2" placeholder="Anything worth remembering — sleep, aches, wins">${esc(ui.notes)}</textarea>
      <div class="row-end"><button class="btn primary small" data-act="ci-save">${existing ? 'Update' : 'Save check-in'}</button></div>
    </div>`
}

export function checkinCard({ compact = false } = {}) {
  const ws = checkinWeek()
  if (compact && (!ws || state.checkins.some(c => c.weekStart === ws))) return ''
  if (!ws) return ''
  return `
    <section class="card tone-accent">
      <header class="card-head"><h2>${icon('note', 18)} Weekly check-in</h2></header>
      ${checkinForm(ws, { compact })}
    </section>`
}

const RANGES = [['90', '3 months'], ['365', '1 year'], ['all', 'All']]

// Tape measurements: what changes when muscle grows or fat drops, which
// body weight alone can't separate.
function measureCard() {
  const list = measurements()
  const first = [...list].reverse()
  const startOf = k => first.find(m => m[k])?.[k]
  const diff = (k, v) => { const s = startOf(k); const d = s && v ? Math.round((v - s) * 10) / 10 : 0; return d ? `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>` : '' }
  return `
    <section class="card">
      <header class="card-head"><h2>${icon('scale', 18)} Measurements</h2><span class="muted small">cm</span></header>
      <p class="muted small">Every 2–4 weeks, same time of day, before eating. Waist at the belly button, relaxed. Chest across the nipples. Arm flexed, at the biggest point. Thigh halfway between hip and knee. Arm and thigh going up while waist holds is muscle; waist going up is mostly fat.</p>
      <form class="measure-add" data-form="measure">
        <input type="date" name="d" value="${today()}" max="${today()}" aria-label="Date">
        ${MEASURES.map(([k, l]) => `<label class="field">${l}<input name="${k}" inputmode="decimal" placeholder="${(v => v ? esc(fmtKg(v)) : '—')(list.find(m => m[k])?.[k])}" autocomplete="off"></label>`).join('')}
        <button class="btn primary" type="submit">Save</button>
      </form>
      ${list.length ? `
        <div class="measure-table">
          <span class="mt-head">Date</span>${MEASURES.map(([, l]) => `<span class="mt-head">${l}</span>`).join('')}<span></span>
          ${list.map(m => `
            <span>${esc(shortDate(m.date))}</span>
            ${MEASURES.map(([k]) => `<span class="mt-val">${m[k] ? `${esc(fmtKg(m[k]))} ${m === list[0] ? diff(k, m[k]) : ''}` : '—'}</span>`).join('')}
            <button class="icon-btn small" data-act="measure-del" data-date="${esc(m.date)}" aria-label="Delete">${icon('x', 14)}</button>`).join('')}
        </div>
        ${list.length > 1 ? `<p class="muted small">Changes on the latest row are since your first measurement.</p>` : ''}` : '<p class="muted">No measurements yet.</p>'}
    </section>`
}

export function renderBody() {
  const range = state.ui.bwRange || '90'
  const from = range === 'all' ? '0000' : addDays(today(), -Number(range))
  const list = [...state.bwLog].sort((a, b) => b.date.localeCompare(a.date))
  const pts = list.filter(b => b.date >= from).reverse().map(b => ({ x: b.date, y: b.weight, tip: `${fmtKg(b.weight)} kg${b.note ? ` · ${b.note}` : ''}` }))
  const bw = latestBw()
  const ws = checkinWeek()
  const past = [...state.checkins].sort((a, b) => b.weekStart.localeCompare(a.weekStart))
  return `
    <div class="two-col">
      <div class="col">
        <section class="card">
          <header class="card-head"><h2>${icon('scale', 18)} Body weight</h2>${seg('bw-range', range, RANGES, 'aria-label="Range"')}</header>
          ${bw ? `<p class="big-num">${esc(fmtKg(bw.weight))}<small> kg</small><span class="muted small"> · ${esc(fullDate(bw.date))}</span></p>` : ''}
          ${lineChart([{ label: 'Body weight', color: 'var(--chart-1)', points: pts }], { height: 200, unit: ' kg' })}
          <form class="bw-add wide" data-form="bw-full">
            <input type="date" name="d" value="${today()}" max="${today()}" aria-label="Date">
            <input name="w" inputmode="decimal" placeholder="kg" autocomplete="off" aria-label="Weight in kg">
            <button class="btn primary" type="submit">Log weight</button>
          </form>
        </section>
        ${measureCard()}
        <section class="card">
          <header class="card-head"><h2>Entries</h2><span class="muted small">${list.length}</span></header>
          <div class="table-list">
            ${list.slice(0, state.ui.bwAll ? 9999 : 25).map((b, i) => {
              const prev = list[i + 1]
              const d = prev ? Math.round((b.weight - prev.weight) * 10) / 10 : null
              return `<div class="tl-row"><span>${esc(fullDate(b.date))}</span><b>${esc(fmtKg(b.weight))} kg</b><span class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d ? `${d > 0 ? '+' : ''}${d}` : ''}</span><span class="muted small">${esc(b.note || '')}</span><button class="icon-btn small" data-act="bw-del" data-date="${esc(b.date)}" aria-label="Delete">${icon('x', 14)}</button></div>`
            }).join('') || '<p class="muted">No weights logged yet.</p>'}
          </div>
          ${list.length > 25 && !state.ui.bwAll ? `<button class="btn small ghost" data-act="bw-all">Show all ${list.length}</button>` : ''}
        </section>
      </div>
      <div class="col">
        ${ws ? `<section class="card tone-accent"><header class="card-head"><h2>${icon('note', 18)} This week's check-in</h2></header>${checkinForm(ws, {})}</section>` : `<section class="card"><p class="muted">The weekly check-in opens on Friday.</p></section>`}
        <section class="card">
          <header class="card-head"><h2>Past check-ins</h2></header>
          ${past.map(c => {
            const n = sessionsBetween(c.weekStart, addDays(c.weekStart, 6)).length
            return `<div class="ci-past">
              <div class="ci-past-head"><b>Week of ${esc(shortDate(c.weekStart))}</b><span class="muted small">${n} sessions</span></div>
              <div class="ci-past-stars"><span>Effort ${'★'.repeat(c.effort || 0)}<i>${'★'.repeat(5 - (c.effort || 0))}</i></span><span>Recovery ${'★'.repeat(c.recovery || 0)}<i>${'★'.repeat(5 - (c.recovery || 0))}</i></span></div>
              ${c.notes ? `<p>${esc(c.notes)}</p>` : ''}
            </div>`
          }).join('') || '<p class="muted">None yet.</p>'}
        </section>
      </div>
    </div>`
}

import { esc, icon, openModal, confirmBox, toast } from '../ui.js'
import { state, sortedSessions, sessionVol, sessionById, isCardio, bestFor, deleteSessions, saveSession } from '../store.js'
import { today, addMonths, monthStart, monthYear, addDays, dow, longDate, DOW_SHORT } from '../dates.js'
import { programColor, fmtVol, fmtSet, exerciseStats } from '../model.js'
import { sessionRow, pchip } from '../components.js'

export const historyTitle = () => monthYear(state.ui.month || monthStart(today()))

export function renderHistory({ isPhone }) {
  const ms = state.ui.month || monthStart(today())
  const me = addDays(addMonths(ms, 1), -1)
  const sessions = sortedSessions().filter(s => s.date >= ms && s.date <= me)
  const byDate = new Map()
  for (const s of sessions) { if (!byDate.has(s.date)) byDate.set(s.date, []); byDate.get(s.date).push(s) }
  const lead = dow(ms)
  const days = Number(me.slice(8))
  const cells = []
  for (let i = 0; i < lead; i++) cells.push('<span class="cal-cell out"></span>')
  for (let d = 1; d <= days; d++) {
    const date = `${ms.slice(0, 8)}${String(d).padStart(2, '0')}`
    const list = byDate.get(date) || []
    const s = list[0]
    const future = date > today()
    cells.push(`<button type="button" class="cal-cell${s ? ' has' : ''}${date === today() ? ' today' : ''}${future ? ' future' : ''}" style="--c:${s ? programColor(s.program) : 'transparent'}"
      ${s ? `data-act="session" data-id="${esc(s.id)}"` : future ? 'disabled' : `data-act="log-day" data-date="${date}"`} title="${esc(s ? list.map(x => x.program).join(' + ') : future ? '' : 'Log a session for this day')}">
      <span class="cal-num">${d}</span>${s ? `<span class="cal-prog">${esc(s.program)}</span>` : ''}${list.length > 1 ? '<span class="cal-more">+</span>' : ''}
    </button>`)
  }
  const vol = sessions.reduce((a, s) => a + sessionVol(s), 0)
  const mins = sessions.reduce((a, s) => a + (s.duration || 0), 0)
  return `
    <div class="history">
      <section class="card cal-card">
        <div class="cal-nav">
          <button class="icon-btn" data-act="month" data-v="-1" aria-label="Previous month">${icon('left')}</button>
          <h2>${esc(monthYear(ms))}</h2>
          <button class="icon-btn" data-act="month" data-v="1" aria-label="Next month" ${ms >= monthStart(today()) ? 'disabled' : ''}>${icon('right')}</button>
        </div>
        <div class="cal">${DOW_SHORT.map(d => `<span class="cal-wd">${d[0]}${isPhone ? '' : d.slice(1)}</span>`).join('')}${cells.join('')}</div>
        <div class="month-stats">
          <div><b>${sessions.length}</b><span>sessions</span></div>
          <div><b>${esc(fmtVol(vol))}</b><span>volume</span></div>
          <div><b>${Math.round(mins / 60 * 10) / 10}</b><span>hours</span></div>
        </div>
        ${isPhone ? '' : `<p class="muted small">Click an empty day to log a session for it.</p>`}
      </section>
      <section class="card">
        <header class="card-head"><h2>${sessions.length ? `${sessions.length} session${sessions.length === 1 ? '' : 's'}` : 'No sessions'}</h2></header>
        <div class="list">${sessions.map(s => sessionRow(s)).join('') || '<p class="muted">Nothing logged this month.</p>'}</div>
      </section>
    </div>`
}

export function openSessionDetail(id, { onEdit, onRepeat, rerender }) {
  const s = sessionById(id)
  if (!s) return
  const sets = s.exercises.reduce((a, e) => a + e.sets.filter(x => x.type !== 'warmup').length, 0)
  const m = openModal(`
    <header class="modal-head" style="--c:${programColor(s.program)}">
      <div>
        <p class="eyebrow">${esc(longDate(s.date))}${s.source === 'hevy' ? ' · from HEVY' : ''}</p>
        <h2>${pchip(s.program)} ${s.title && s.source !== 'hevy' ? esc(s.title) : ''}</h2>
      </div>
      <button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button>
    </header>
    <div class="modal-body">
      <div class="summary-stats inline">
        <div><b>${s.duration || '—'}</b><span>min</span></div>
        <div><b>${sets}</b><span>sets</span></div>
        <div><b>${esc(fmtVol(sessionVol(s)))}</b><span>volume</span></div>
      </div>
      ${s.exercises.map(e => {
        const cardio = isCardio(e.name)
        const st = exerciseStats(e, cardio)
        const best = cardio ? null : bestFor(e.name)
        const isPr = best && st.maxW > 0 && st.maxW >= best.maxW
        return `<div class="dx">
          <div class="dx-head"><button type="button" class="link" data-ex-link="${esc(e.name)}">${esc(e.name)}</button>${isPr ? `<span class="pr-badge">${icon('trophy', 12)} Best</span>` : ''}${!cardio && st.vol ? `<span class="muted small">${esc(fmtVol(st.vol))}</span>` : ''}</div>
          <div class="dx-sets">${e.sets.map((x, i) => `<span class="dx-set${x.type === 'warmup' ? ' warm' : ''}"><i>${x.type === 'warmup' ? 'W' : e.sets.slice(0, i + 1).filter(y => y.type !== 'warmup').length}</i>${esc(fmtSet(x, cardio))}</span>`).join('')}</div>
          ${e.note ? `<p class="dx-note">${icon('note', 13)} ${esc(e.note)}</p>` : ''}
        </div>`
      }).join('')}
      ${s.notes ? `<p class="dx-notes">${esc(s.notes)}</p>` : ''}
    </div>
    <footer class="modal-foot">
      <button type="button" class="btn ghost danger-text" data-d="delete">${icon('trash', 16)} Delete</button>
      <div class="row-gap">
        <button type="button" class="btn soft" data-d="repeat">${icon('repeat', 16)} Repeat</button>
        <button type="button" class="btn primary" data-d="edit">${icon('edit', 16)} Edit</button>
      </div>
    </footer>`)
  m.el.addEventListener('click', async e => {
    const link = e.target.closest('[data-ex-link]')
    if (link) { m.close(true); state.view = 'progress'; state.ui.ptab = 'exercises'; state.ui.exercise = link.dataset.exLink; return rerender() }
    const a = e.target.closest('[data-d]')?.dataset.d
    if (!a) return
    if (a === 'edit') { m.close(true); return onEdit(id) }
    if (a === 'repeat') { m.close(true); return onRepeat(id) }
    if (a === 'delete') {
      if (!(await confirmBox(`Delete this ${s.program} session from ${longDate(s.date)}?`))) return
      deleteSessions([id])
      m.close(true)
      rerender()
      toast('Session deleted', { label: 'Undo', run: () => { saveSession(s); rerender() } })
    }
  })
}

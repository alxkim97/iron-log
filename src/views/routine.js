import { esc, icon, openModal, confirmBox, toast } from '../ui.js'
import { state, routine, setRoutine, lastFor, isCardio } from '../store.js'
import { cloneRoutine, sortedDays, DEFAULT_ROUTINE } from '../routine.js'
import { PROGRAMS, programColor, fmtSet } from '../model.js'
import { exThumb } from '../components.js'
import { DOW_LONG, DOW_SHORT, dow, today } from '../dates.js'
import { pickExercise } from '../picker.js'

export function renderRoutine() {
  const r = routine()
  const days = sortedDays(r)
  const t = dow(today())
  const rest = DOW_LONG.filter((_, i) => !r.days.some(d => d.dow === i))
  return `
    <div class="routine">
      <p class="muted">Your week. <b>Start</b> fills the workout with these exercises and last time's numbers.${state.prefsCloud ? '' : ' <span class="warn-text">Saved on this device only until iron_prefs is set up (Settings).</span>'}</p>
      <div class="day-grid">
        ${days.map(d => `
          <section class="card day-card${d.dow === t ? ' is-today' : ''}" style="--c:${programColor(d.program)}">
            <header class="day-head">
              <span class="day-dow">${d.dow == null ? 'Any day' : DOW_SHORT[d.dow]}</span>
              <h2>${esc(d.name)}</h2>
              <button class="icon-btn small" data-act="day-edit" data-id="${esc(d.id)}" aria-label="Edit ${esc(d.name)}">${icon('edit', 16)}</button>
            </header>
            <ol class="day-ex">${d.exercises.map(e => `<li>${exThumb(e.name)}<span>${esc(e.name)}</span><em>${e.sets} × ${esc(e.reps || '—')}</em></li>`).join('') || '<li class="muted">No exercises</li>'}</ol>
            <button class="btn soft small block" data-act="start" data-day="${esc(d.id)}">${icon('play', 14)} Start ${esc(d.name)}</button>
          </section>`).join('')}
        <button class="day-add" data-act="day-new">${icon('plus', 22)}<span>Add a day</span></button>
      </div>
      ${rest.length ? `<p class="muted small">Rest: ${rest.join(', ')}</p>` : ''}
      <button class="btn ghost small" data-act="routine-reset">Reset to the default routine</button>
    </div>`
}

export async function resetRoutine(rerender) {
  if (!(await confirmBox('Replace your routine with the default (built from your Jul–Sep HEVY workouts)?', { ok: 'Reset' }))) return
  setRoutine(DEFAULT_ROUTINE)
  rerender()
}

export function editDay(id, rerender) {
  const r = cloneRoutine(routine())
  let day = r.days.find(d => d.id === id)
  const isNew = !day
  if (isNew) day = { id: 'd' + Date.now().toString(36), name: '', program: 'Push', dow: null, exercises: [] }
  let dirty = false
  const m = openModal('', {
    cls: 'tall', wide: true,
    beforeClose: async () => !dirty || confirmBox('Discard changes to this day?', { ok: 'Discard' }),
  })
  const draw = () => {
    const taken = new Set(r.days.filter(d => d.id !== day.id).map(d => d.dow))
    m.el.innerHTML = `
      <header class="modal-head"><h2>${isNew ? 'New day' : `Edit ${esc(day.name)}`}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></header>
      <div class="modal-body">
        <div class="field-row">
          <label class="field">Name<input data-k="name" value="${esc(day.name)}" placeholder="Push" maxlength="40"></label>
          <label class="field">Day<select data-k="dow">
            <option value="">Any day</option>
            ${DOW_LONG.map((n, i) => `<option value="${i}" ${day.dow === i ? 'selected' : ''}>${n}${taken.has(i) ? ' (in use)' : ''}</option>`).join('')}
          </select></label>
        </div>
        <div class="prog-row">${PROGRAMS.map(p => `<button type="button" class="pchip${day.program === p ? ' on' : ''}" style="--c:${programColor(p)}" data-p="${p}">${p}</button>`).join('')}</div>
        <div class="rex-list">
          <div class="rex head"><span>Exercise</span><span>Sets</span><span>Reps</span><span></span></div>
          ${day.exercises.map((e, i) => {
            const last = lastFor(e.name)
            return `<div class="rex" data-i="${i}">
              <button type="button" class="rex-name" data-x="swap">${exThumb(e.name)}<span class="rex-text"><b>${esc(e.name)}</b><small>${last ? esc(`last: ${last.ex.sets.filter(s => s.type !== 'warmup').map(s => fmtSet(s, isCardio(e.name))).join(', ')}`) : 'not done yet'}</small></span></button>
              <input data-e="sets" inputmode="numeric" value="${e.sets}" aria-label="Sets">
              <input data-e="reps" value="${esc(e.reps || '')}" placeholder="8–12" aria-label="Reps">
              <span class="rex-btns">
                <button type="button" class="icon-btn small" data-x="up" ${i ? '' : 'disabled'} aria-label="Move up">${icon('up', 15)}</button>
                <button type="button" class="icon-btn small" data-x="down" ${i < day.exercises.length - 1 ? '' : 'disabled'} aria-label="Move down">${icon('down', 15)}</button>
                <button type="button" class="icon-btn small" data-x="del" aria-label="Remove">${icon('x', 15)}</button>
              </span>
              <input class="rex-note" data-e="notes" value="${esc(e.notes || '')}" placeholder="Note shown during the workout (optional)">
            </div>`
          }).join('')}
        </div>
        <button type="button" class="btn soft" data-x="add">${icon('plus', 16)} Add exercise</button>
      </div>
      <footer class="modal-foot">
        ${isNew ? '<span></span>' : `<button type="button" class="btn ghost danger-text" data-x="delete">${icon('trash', 16)} Delete day</button>`}
        <div class="row-gap"><button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn primary" data-x="save">Save</button></div>
      </footer>`
  }
  m.el.addEventListener('input', e => {
    const k = e.target.dataset.k, f = e.target.dataset.e
    dirty = true
    if (k === 'name') day.name = e.target.value
    if (f) {
      const ex = day.exercises[Number(e.target.closest('[data-i]').dataset.i)]
      ex[f] = f === 'sets' ? Math.max(1, Math.min(10, parseInt(e.target.value) || 1)) : e.target.value
    }
  })
  m.el.addEventListener('change', e => {
    if (e.target.dataset.k === 'dow') { day.dow = e.target.value === '' ? null : Number(e.target.value); dirty = true }
  })
  m.el.addEventListener('click', async e => {
    const p = e.target.closest('[data-p]')
    if (p) { day.program = p.dataset.p; if (!day.name) day.name = p.dataset.p; dirty = true; return draw() }
    const x = e.target.closest('[data-x]')?.dataset.x
    if (!x) return
    const i = Number(e.target.closest('[data-i]')?.dataset.i)
    if (x === 'add') {
      const name = await pickExercise({ exclude: day.exercises.map(e => e.name) })
      if (name) { day.exercises.push({ name, sets: 3, reps: '8–12', notes: '' }); dirty = true; draw() }
    } else if (x === 'swap') {
      const name = await pickExercise({ title: 'Replace with', exclude: day.exercises.map(e => e.name) })
      if (name) { day.exercises[i].name = name; dirty = true; draw() }
    } else if (x === 'up' || x === 'down') {
      const j = x === 'up' ? i - 1 : i + 1
      ;[day.exercises[i], day.exercises[j]] = [day.exercises[j], day.exercises[i]]
      dirty = true; draw()
    } else if (x === 'del') { day.exercises.splice(i, 1); dirty = true; draw() }
    else if (x === 'delete') {
      if (!(await confirmBox(`Delete ${day.name} from your routine?`))) return
      r.days = r.days.filter(d => d.id !== day.id)
      setRoutine(r); m.close(true); rerender()
    } else if (x === 'save') {
      if (!day.name.trim()) { m.el.querySelector('[data-k="name"]').focus(); return toast('Give the day a name') }
      day.name = day.name.trim()
      if (day.dow != null) for (const d of r.days) if (d.id !== day.id && d.dow === day.dow) d.dow = null
      if (isNew) r.days.push(day)
      else r.days[r.days.findIndex(d => d.id === day.id)] = day
      setRoutine(r); m.close(true); rerender(); toast('Routine saved')
    }
  })
  draw()
}

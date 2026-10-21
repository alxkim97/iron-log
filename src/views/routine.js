import { esc, icon, openModal, confirmBox, toast, seg } from '../ui.js'
import { state, routine, setRoutine, lastFor, isCardio, planContext, gymEquipment, setPrefs, sortedSessions, gyms, activeGym } from '../store.js'
import { gymChips } from './gyms.js'
import { cloneRoutine, sortedDays, DEFAULT_ROUTINE } from '../routine.js'
import { PROGRAMS, programColor, fmtSet } from '../model.js'
import { EQUIPMENT, buildPlan, exercisesThatFit } from '../planner.js'
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
      <button class="btn soft plan-btn" data-act="plan-build">${icon('dumbbell', 16)} Build a plan from my equipment</button>
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

const MINUTES = [20, 30, 45, 60]

// Typical session length from recent history, snapped to a builder option.
function typicalMinutes() {
  const d = sortedSessions().slice(0, 40).map(s => s.duration).filter(x => x > 0).sort((a, b) => a - b)
  if (!d.length) return 45
  const mid = d[Math.floor(d.length / 2)]
  return MINUTES.reduce((a, b) => Math.abs(b - mid) < Math.abs(a - mid) ? b : a)
}

export function planBuilder(rerender) {
  const ctx = planContext()
  const planned = routine().days.filter(d => d.dow != null).length
  const v = { gym: activeGym()?.id || null, equipment: [...gymEquipment()], days: Math.min(6, Math.max(2, planned || 4)), minutes: typicalMinutes() }
  let plan = null
  const m = openModal('', { cls: 'tall', wide: true })
  const draw = () => {
    // Pace from the rest timers: one main lift on the long rest, the rest on the short one.
    const restMain = state.prefs.restSecs ?? 90, restShort = state.prefs.restShort ?? 90
    const perSet = Math.round((0.75 + (restMain + 2 * restShort) / 3 / 60) * 10) / 10
    plan = buildPlan({ ...ctx, perSet, equipment: v.equipment, days: v.days, minutes: v.minutes })
    const fit = exercisesThatFit(v.minutes, 3, perSet)
    const restTip = restShort >= 120 ? ' Shorter rest for accessories (Settings → Workout) would fit more.' : ''
    m.el.innerHTML = `
      <header class="modal-head"><h2>${icon('dumbbell', 18)} Build a plan</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></header>
      <div class="modal-body">
        <p class="muted small">Pick what your gym has, how often you can train and how long you've got. Exercises you already know are preferred, and the muscles you're furthest behind on go first in each day — so if time runs out, what you skip is the least needed.</p>
        ${gyms().length ? `<label class="setting-label">Fill in from a gym</label>${gymChips('data-x', v.gym)}` : ''}
        <label class="setting-label">Equipment <span class="muted small">(bodyweight always counts)</span></label>
        <div class="chip-row wrap">
          ${EQUIPMENT.map(([k, label]) => `<button type="button" class="fchip${v.equipment.includes(k) ? ' on' : ''}" data-x="eq" data-value="${esc(k)}">${esc(label)}</button>`).join('')}
        </div>
        <label class="setting-label">Days a week</label>
        ${seg('pb-days', String(v.days), ['2', '3', '4', '5', '6'].map(n => [n, n]))}
        <label class="setting-label">Time per session</label>
        ${seg('pb-min', String(v.minutes), MINUTES.map(n => [String(n), `${n} min`]))}
        <p class="muted small pb-fit">${fit} exercises a day fit — about ${perSet} min per set with your rest timers (main lifts ${Math.floor(restMain / 60)}:${String(restMain % 60).padStart(2, '0')}, others ${Math.floor(restShort / 60)}:${String(restShort % 60).padStart(2, '0')}).${restTip}</p>
        <div class="pb-days">
          ${plan.days.map(d => `
            <section class="pb-day" style="--c:${programColor(d.program)}">
              <h3><span>${DOW_SHORT[d.dow]}</span>${esc(d.name)}</h3>
              <ol>${d.exercises.map(e => `<li><span>${esc(e.name)}</span><em>${e.sets} × ${esc(e.reps)}</em></li>`).join('') || '<li class="muted">Nothing fits this equipment</li>'}</ol>
            </section>`).join('')}
        </div>
      </div>
      <footer class="modal-foot">
        <span></span>
        <div class="row-gap"><button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn primary" data-x="use">Use this plan</button></div>
      </footer>`
  }
  m.el.addEventListener('click', async e => {
    const a = e.target.closest('[data-act]')
    if (a?.dataset.act === 'pb-days') { v.days = Number(a.dataset.value); return draw() }
    if (a?.dataset.act === 'pb-min') { v.minutes = Number(a.dataset.value); return draw() }
    const x = e.target.closest('[data-x]')
    if (x?.dataset.x === 'gym') {
      const g = gyms().find(q => q.id === x.dataset.value)
      if (g) { v.gym = g.id; v.equipment = [...g.equipment] }
      return draw()
    }
    if (x?.dataset.x === 'eq') {
      const k = x.dataset.value
      v.equipment = v.equipment.includes(k) ? v.equipment.filter(q => q !== k) : [...v.equipment, k]
      v.gym = null
      return draw()
    }
    if (x?.dataset.x === 'use') {
      if (!(await confirmBox(`Replace your current routine with this ${v.days}-day plan? You can undo right after.`, { ok: 'Use plan', danger: false }))) return
      const prev = cloneRoutine(routine())
      setPrefs({ equipment: v.equipment })
      setRoutine(plan)
      m.close(true)
      rerender()
      toast('New plan saved', { label: 'Undo', run: () => { setRoutine(prev); rerender() } })
    }
  })
  draw()
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

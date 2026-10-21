// Gym setups: what each place has and how heavy it goes, so plans, swaps
// and weight suggestions fit the gym you're at.
import { esc, icon, openModal, confirmBox, toast } from '../ui.js'
import { gyms, activeGym, saveGym, deleteGym, setActiveGym } from '../store.js'
import { EQUIPMENT, GYM_EQUIPMENT } from '../planner.js'
import { fmtKg } from '../model.js'

// Equipment that comes in weights worth recording.
const LOADED = ['Dumbbells', 'Machine', 'Cable', 'Smith Machine', 'Barbell', 'EZ Bar']
const label = k => EQUIPMENT.find(([key]) => key === k)?.[1] || k

export function gymsCard() {
  const list = gyms()
  const on = activeGym()
  return `
      <section class="card">
        <header class="card-head"><h2>${icon('dumbbell', 18)} Gyms</h2></header>
        <p class="muted small">Save each place you train: its equipment and how heavy it goes. The gym you pick shapes plans and swaps, shows that gym's last numbers, and stops weight suggestions at its heaviest.</p>
        ${list.length ? `<div class="gym-list">${list.map(g => `
          <div class="gym-row${g.id === on?.id ? ' on' : ''}">
            <button type="button" class="gym-pick" data-act="gym-active" data-value="${esc(g.id)}" aria-pressed="${g.id === on?.id}">
              <b>${esc(g.name)}</b>
              <span class="muted small">${g.id === on?.id ? 'Training here · ' : ''}${g.equipment.length} kinds of equipment${Object.keys(g.caps || {}).length ? ` · ${Object.keys(g.caps).length} machine max${Object.keys(g.caps).length > 1 ? 'es' : ''}` : ''}</span>
            </button>
            <button type="button" class="icon-btn small" data-act="gym-edit" data-value="${esc(g.id)}" aria-label="Edit ${esc(g.name)}">${icon('edit', 16)}</button>
          </div>`).join('')}</div>` : ''}
        <button type="button" class="btn soft" data-act="gym-edit" data-value="">${icon('plus', 16)} Add a gym</button>
      </section>`
}

export function editGym(id, rerender) {
  const cur = gyms().find(g => g.id === id)
  const g = cur
    ? JSON.parse(JSON.stringify(cur))
    : { id: 'g' + Date.now().toString(36), name: '', equipment: [...GYM_EQUIPMENT], weights: {}, caps: {} }
  g.weights ||= {}
  g.caps ||= {}
  const m = openModal('', { cls: 'tall', wide: true })
  const draw = () => {
    const loaded = LOADED.filter(k => g.equipment.includes(k))
    const caps = Object.entries(g.caps)
    m.el.innerHTML = `
      <header class="modal-head"><h2>${cur ? `Edit ${esc(cur.name)}` : 'New gym'}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></header>
      <div class="modal-body">
        <label class="field">Name<input id="gym-name" value="${esc(g.name)}" placeholder="Condo gym" maxlength="40"></label>
        <label class="setting-label">Equipment <span class="muted small">(bodyweight always counts)</span></label>
        <div class="chip-row wrap">
          ${EQUIPMENT.map(([k, l]) => `<button type="button" class="fchip${g.equipment.includes(k) ? ' on' : ''}" data-x="eq" data-value="${esc(k)}">${esc(l)}</button>`).join('')}
        </div>
        ${loaded.length ? `
          <label class="setting-label">Weights <span class="muted small">(leave blank if there's no limit)</span></label>
          <div class="gym-weights">
            <span class="gw-head">Equipment</span><span class="gw-head">Heaviest, kg</span><span class="gw-head">Steps of, kg</span>
            ${loaded.map(k => `
              <span class="gw-name">${esc(label(k))}</span>
              <input data-w="${esc(k)}" data-f="max" inputmode="decimal" value="${g.weights[k]?.max ? esc(fmtKg(g.weights[k].max)) : ''}" placeholder="${k === 'Dumbbells' ? '25' : '—'}" aria-label="${esc(label(k))} heaviest kg">
              <input data-w="${esc(k)}" data-f="step" inputmode="decimal" value="${g.weights[k]?.step ? esc(fmtKg(g.weights[k].step)) : ''}" placeholder="${k === 'Dumbbells' ? '2.5' : '—'}" aria-label="${esc(label(k))} step kg">`).join('')}
          </div>` : ''}
        ${caps.length ? `
          <label class="setting-label">Machine maxes <span class="muted small">(set from an exercise's menu during a workout)</span></label>
          <div class="gym-caps">${caps.map(([n, kg]) => `<span class="gym-cap">${esc(n)} <b>${esc(fmtKg(kg))} kg</b><button type="button" class="icon-btn small" data-x="cap-del" data-value="${esc(n)}" aria-label="Remove">${icon('x', 13)}</button></span>`).join('')}</div>` : ''}
      </div>
      <footer class="modal-foot">
        ${cur ? `<button type="button" class="btn ghost danger-text" data-x="delete">${icon('trash', 16)} Delete gym</button>` : '<span></span>'}
        <div class="row-gap"><button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn primary" data-x="save">Save</button></div>
      </footer>`
  }
  const num = v => { const n = parseFloat(String(v).replace(',', '.')); return n > 0 ? n : null }
  m.el.addEventListener('input', e => {
    if (e.target.id === 'gym-name') g.name = e.target.value
    const k = e.target.dataset.w
    if (k) {
      g.weights[k] = { ...(g.weights[k] || {}), [e.target.dataset.f]: num(e.target.value) }
      if (!g.weights[k].max && !g.weights[k].step) delete g.weights[k]
    }
  })
  m.el.addEventListener('click', async e => {
    const x = e.target.closest('[data-x]')
    if (!x) return
    const v = x.dataset.value
    if (x.dataset.x === 'eq') { g.equipment = g.equipment.includes(v) ? g.equipment.filter(k => k !== v) : [...g.equipment, v]; return draw() }
    if (x.dataset.x === 'cap-del') { delete g.caps[v]; return draw() }
    if (x.dataset.x === 'delete') {
      if (!(await confirmBox(`Delete ${cur.name}? Sessions logged there keep their numbers.`))) return
      deleteGym(g.id); m.close(true); rerender(); return
    }
    if (x.dataset.x === 'save') {
      if (!g.name.trim()) { m.el.querySelector('#gym-name').focus(); return toast('Give the gym a name') }
      g.name = g.name.trim()
      for (const k of Object.keys(g.weights)) if (!g.equipment.includes(k)) delete g.weights[k]
      saveGym(g)
      if (!activeGym()) setActiveGym(g.id)
      m.close(true); rerender(); toast(`${g.name} saved`)
    }
  })
  draw()
}

// Chips to switch the gym you're training at, for sheets that start a workout.
export const gymChips = (attr, current = activeGym()?.id) => gyms().length
  ? `<div class="chip-row wrap gym-chips">${gyms().map(g => `<button type="button" class="fchip${g.id === current ? ' on' : ''}" ${attr}="gym" data-value="${esc(g.id)}">${icon('dumbbell', 13)} ${esc(g.name)}</button>`).join('')}</div>`
  : ''

// Exercise library: the muscle each exercise counts toward (drives muscle
// volume + recovery), plus rename/merge across history.
import { esc, icon, openModal, confirmBox, toast } from '../ui.js'
import { state, library, historyFor, blobOp, saveSessions, muscles, routine, setRoutine } from '../store.js'
import { MUSCLE_KEYS, DEFAULT_LIBRARY } from '../model.js'
import { agoDays } from '../dates.js'

export function renderExercises() {
  const q = (state.ui.libq || '').trim().toLowerCase()
  const filter = state.ui.libm || 'All'
  const lib = library().filter(e => !e.hidden)
  const known = new Set(lib.map(e => e.name.toLowerCase()))
  // Logged names that aren't in the library yet (e.g. new HEVY titles).
  const extra = []
  for (const s of state.sessions) for (const e of s.exercises) {
    const k = e.name.toLowerCase()
    if (!known.has(k)) { known.add(k); extra.push({ name: e.name, muscle: muscles(e.name).primary, secondary: [], guessed: true }) }
  }
  const rows = [...lib, ...extra]
    .filter(e => (filter === 'All' || e.muscle === filter) && (!q || e.name.toLowerCase().includes(q)))
    .sort((a, b) => (historyFor(b.name)?.entries.length || 0) - (historyFor(a.name)?.entries.length || 0) || a.name.localeCompare(b.name))
  return `
    <div class="library">
      <div class="lib-top">
        <label class="search-box big">${icon('search', 16)}<input type="search" data-input="libq" placeholder="Search exercises" value="${esc(state.ui.libq || '')}" autocomplete="off"></label>
        <button class="btn primary" data-act="lib-new">${icon('plus', 16)} New exercise</button>
      </div>
      <div class="chip-row">${['All', ...MUSCLE_KEYS].map(k => `<button type="button" class="fchip${filter === k ? ' on' : ''}" data-act="lib-m" data-value="${k}">${k}</button>`).join('')}</div>
      <div class="lib-grid">
        ${rows.map(e => {
          const h = historyFor(e.name)
          return `<button type="button" class="lib-card" data-act="lib-edit" data-name="${esc(e.name)}">
            <b>${esc(e.name)}</b>
            <span class="lib-mus">${e.muscle ? `<span class="mchip">${esc(e.muscle)}</span>` : '<span class="mchip warn">No muscle</span>'}${(e.secondary || []).map(m => `<span class="mchip ghost">${esc(m)}</span>`).join('')}${e.guessed ? '<span class="mchip ghost">guessed</span>' : ''}</span>
            <span class="muted small">${h ? `${h.entries.length}× · last ${esc(agoDays(h.entries.at(-1).date))}` : 'Never logged'}${e.equipment ? ` · ${esc(e.equipment)}` : ''}</span>
          </button>`
        }).join('') || '<p class="muted">No matches.</p>'}
      </div>
    </div>`
}

export function editExercise(name, rerender) {
  const cur = name ? (library().find(e => e.name.toLowerCase() === name.toLowerCase()) || { name, muscle: muscles(name).primary, secondary: [] }) : { name: '', muscle: null, secondary: [] }
  const v = { name: cur.name, muscle: cur.muscle || null, secondary: [...(cur.secondary || [])], equipment: cur.equipment || '', notes: cur.notes || '' }
  const used = name ? historyFor(name)?.entries.length || 0 : 0
  const isDefault = name && DEFAULT_LIBRARY.some(e => e.name.toLowerCase() === name.toLowerCase())
  const m = openModal('', { wide: true })
  const draw = () => {
    m.el.innerHTML = `
      <header class="modal-head"><h2>${name ? 'Edit exercise' : 'New exercise'}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></header>
      <div class="modal-body">
        <label class="field">Name<input data-k="name" value="${esc(v.name)}" maxlength="80" autocomplete="off"></label>
        ${name && used ? `<p class="muted small">Renaming also updates the ${used} logged session${used === 1 ? '' : 's'} — and if the new name already exists, merges the two.</p>` : ''}
        <div class="field"><span class="field-label">Main muscle</span><div class="chip-row wrap">${MUSCLE_KEYS.map(k => `<button type="button" class="fchip${v.muscle === k ? ' on' : ''}" data-mp="${k}">${k}</button>`).join('')}</div></div>
        <div class="field"><span class="field-label">Also works (counts half)</span><div class="chip-row wrap">${MUSCLE_KEYS.filter(k => k !== 'Cardio' && k !== v.muscle).map(k => `<button type="button" class="fchip${v.secondary.includes(k) ? ' on' : ''}" data-ms="${k}">${k}</button>`).join('')}</div></div>
        <div class="field-row">
          <label class="field">Equipment<input data-k="equipment" value="${esc(v.equipment)}" placeholder="Cable, Smith Machine…"></label>
          <label class="field">Notes<input data-k="notes" value="${esc(v.notes)}" placeholder="Setup, cues"></label>
        </div>
      </div>
      <footer class="modal-foot">
        ${name && !used && !isDefault ? `<button type="button" class="btn ghost danger-text" data-x="hide">${icon('trash', 16)} Remove</button>` : name && !used ? `<button type="button" class="btn ghost" data-x="hide">Hide from picker</button>` : '<span></span>'}
        <div class="row-gap"><button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn primary" data-x="save">Save</button></div>
      </footer>`
  }
  m.el.addEventListener('input', e => { const k = e.target.dataset.k; if (k) v[k] = e.target.value })
  m.el.addEventListener('click', async e => {
    const mp = e.target.closest('[data-mp]')?.dataset.mp
    if (mp) { v.muscle = mp; v.secondary = v.secondary.filter(x => x !== mp); return draw() }
    const ms = e.target.closest('[data-ms]')?.dataset.ms
    if (ms) { v.secondary = v.secondary.includes(ms) ? v.secondary.filter(x => x !== ms) : [...v.secondary, ms]; return draw() }
    const x = e.target.closest('[data-x]')?.dataset.x
    if (x === 'hide') {
      blobOp('iron_exerciselib', { type: 'upsert', item: { name: cur.name, muscle: v.muscle, secondary: v.secondary, hidden: true } })
      m.close(true); rerender(); return
    }
    if (x !== 'save') return
    const newName = v.name.trim()
    if (!newName) return m.el.querySelector('[data-k="name"]').focus()
    if (!v.muscle) return toast('Pick the main muscle')
    const renamed = name && newName.toLowerCase() !== name.toLowerCase()
    if (renamed && used) {
      const target = historyFor(newName)
      if (!(await confirmBox(target ? `Merge “${name}” into “${target.name}”? ${used} session${used === 1 ? '' : 's'} will be updated.` : `Rename “${name}” to “${newName}” in ${used} session${used === 1 ? '' : 's'}?`, { ok: target ? 'Merge' : 'Rename', danger: false }))) return
      const changed = state.sessions.filter(s => s.exercises.some(e => e.name.toLowerCase() === name.toLowerCase()))
        .map(s => ({ ...s, exercises: s.exercises.map(e => e.name.toLowerCase() === name.toLowerCase() ? { ...e, name: newName } : e) }))
      saveSessions(changed)
    }
    blobOp('iron_exerciselib', {
      type: 'upsert',
      replaces: renamed ? name.toLowerCase() : undefined,
      item: { name: newName, muscle: v.muscle, secondary: v.secondary, equipment: v.equipment.trim(), notes: v.notes.trim() },
    })
    if (renamed) {
      if (isDefault) blobOp('iron_exerciselib', { type: 'upsert', item: { name, muscle: cur.muscle, secondary: cur.secondary, hidden: true } })
      const r = routine()
      if (r.days.some(d => d.exercises.some(e => e.name.toLowerCase() === name.toLowerCase()))) {
        setRoutine({ ...r, days: r.days.map(d => ({ ...d, exercises: d.exercises.map(e => e.name.toLowerCase() === name.toLowerCase() ? { ...e, name: newName } : e) })) })
      }
    }
    m.close(true); rerender(); toast('Saved')
  })
  draw()
}

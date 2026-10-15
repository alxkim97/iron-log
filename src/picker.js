// Exercise picker: library + everything ever logged, most-used first,
// filter by muscle, or create a new name.
import { openModal, esc, icon } from './ui.js'
import { library, exerciseIndex, muscles } from './store.js'
import { MUSCLE_KEYS } from './model.js'
import { agoDays } from './dates.js'

function candidates() {
  const idx = exerciseIndex()
  const out = new Map()
  for (const e of library()) if (!e.hidden) out.set(e.name.toLowerCase(), { name: e.name, n: 0, last: null })
  for (const [k, h] of idx) out.set(k, { name: h.name, n: h.entries.length, last: h.entries.at(-1)?.date })
  return [...out.values()]
}

function score(name, q) {
  if (!q) return 1
  const n = name.toLowerCase()
  if (n === q) return 6
  if (n.startsWith(q)) return 5
  const words = q.split(/\s+/).filter(Boolean)
  if (words.every(w => n.includes(w))) return 4
  if (words.some(w => w.length > 2 && n.includes(w))) return 2
  let i = 0
  for (const c of n) if (c === q[i]) i++
  return i === q.length ? 1 : 0
}

export function pickExercise({ title = 'Add exercise', exclude = [] } = {}) {
  return new Promise(resolve => {
    let picked = null
    let muscle = 'All'
    const all = candidates()
    const skip = new Set(exclude.map(x => x.toLowerCase()))
    const m = openModal(`
      <div class="picker">
        <header class="modal-head">
          <h2>${esc(title)}</h2>
          <button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button>
        </header>
        <div class="picker-top">
          <label class="search-box big">${icon('search', 18)}<input type="search" placeholder="Search or type a new name" autocomplete="off" autocapitalize="words"></label>
          <div class="chip-row">${['All', ...MUSCLE_KEYS].map(k => `<button type="button" class="fchip${k === 'All' ? ' on' : ''}" data-m="${k}">${k}</button>`).join('')}</div>
        </div>
        <div class="picker-list"></div>
      </div>`, { cls: 'tall', onClose: () => resolve(picked) })
    const input = m.el.querySelector('input')
    const list = m.el.querySelector('.picker-list')
    const draw = () => {
      const q = input.value.trim().toLowerCase()
      let rows = all.filter(c => !skip.has(c.name.toLowerCase()) && (muscle === 'All' || muscles(c.name).primary === muscle))
        .map(c => ({ ...c, s: score(c.name, q) })).filter(c => c.s > 0)
        .sort((a, b) => b.s - a.s || b.n - a.n || a.name.localeCompare(b.name))
        .slice(0, 80)
      const exact = all.some(c => c.name.toLowerCase() === q)
      list.innerHTML = `
        ${q && !exact ? `<button type="button" class="pick-row create" data-name="${esc(input.value.trim())}">${icon('plus', 18)}<span>Create “${esc(input.value.trim())}”</span></button>` : ''}
        ${rows.map(c => {
          const mu = muscles(c.name)
          return `<button type="button" class="pick-row" data-name="${esc(c.name)}">
            <span class="pick-name">${esc(c.name)}</span>
            <span class="pick-meta">${esc(mu.primary || '—')}${c.n ? ` · ${c.n}× · ${esc(agoDays(c.last))}` : ''}</span>
          </button>`
        }).join('') || (q ? '' : '<p class="muted pad">Nothing here yet.</p>')}`
    }
    input.addEventListener('input', draw)
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); list.querySelector('.pick-row')?.click() }
    })
    m.el.querySelector('.chip-row').addEventListener('click', e => {
      const b = e.target.closest('[data-m]')
      if (!b) return
      muscle = b.dataset.m
      m.el.querySelectorAll('.fchip').forEach(x => x.classList.toggle('on', x === b))
      draw()
    })
    list.addEventListener('click', e => {
      const b = e.target.closest('[data-name]')
      if (!b) return
      picked = b.dataset.name
      m.close(true)
    })
    draw()
    if (!matchMedia('(max-width: 859px)').matches) setTimeout(() => input.focus(), 60)
  })
}

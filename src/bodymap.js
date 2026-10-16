// Front/back anatomical figure with muscle regions shaded by how much they worked.
// levels: { Chest: 0..1, ... } — one hue (accent), stronger = more sets.
import { esc } from './ui.js'
import { FRONT, BACK, FRONT_VIEW, BACK_VIEW } from './anatomy-paths.js'

// App muscle group → body regions it lights up.
const REGIONS = {
  Chest: ['chest'],
  Back: ['upper-back', 'trapezius'],
  Shoulders: ['deltoids'],
  Biceps: ['biceps'],
  Triceps: ['triceps'],
  Forearms: ['forearm'],
  Quads: ['quadriceps'],
  Hamstrings: ['hamstring'],
  Glutes: ['gluteal'],
  Core: ['abs', 'obliques'],
}
const OWNER = {}
for (const [m, rs] of Object.entries(REGIONS)) for (const r of rs) OWNER[r] = m

function figure(paths, view, levels, label) {
  const parts = Object.entries(paths).map(([slug, d]) => {
    if (slug === 'hair') return `<path d="${d}" class="bm-hair"/>`
    const m = OWNER[slug], level = m ? levels[m] || 0 : 0
    if (level <= 0) return `<path d="${d}" class="bm-p"/>`
    const op = (0.28 + 0.72 * Math.min(1, level)).toFixed(2)
    return `<path d="${d}" class="bm-p on" style="--o:${op}"><title>${esc(m)}</title></path>`
  }).join('')
  return `<figure class="bm-fig">
    <svg viewBox="${view}" role="img" aria-label="${label}">${parts}</svg>
    <figcaption>${label}</figcaption>
  </figure>`
}

export function bodyMap(levels, { size = 'md' } = {}) {
  return `<div class="bm bm-${size}">${figure(FRONT, FRONT_VIEW, levels, 'Front')}${figure(BACK, BACK_VIEW, levels, 'Back')}</div>`
}

// Session → levels: working sets per muscle (secondary counts half), scaled
// so ~6 sets reads as fully worked.
export function sessionLevels(session, musclesOf) {
  const sets = {}
  for (const e of session.exercises) {
    const m = musclesOf(e.name)
    const n = e.sets.filter(s => s.type !== 'warmup').length
    if (m.primary) sets[m.primary] = (sets[m.primary] || 0) + n
    for (const s of m.secondary) sets[s] = (sets[s] || 0) + n / 2
  }
  const levels = {}
  for (const [k, v] of Object.entries(sets)) levels[k] = Math.min(1, v / 6)
  return { levels, sets }
}

export function exerciseLevels(m) {
  const levels = {}
  if (m.primary) levels[m.primary] = 1
  for (const s of m.secondary) levels[s] = 0.35
  return levels
}

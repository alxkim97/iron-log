// Front/back anatomical figure with muscle regions shaded by how much they worked.
// levels: { Chest: 0..1, ... } — one hue (accent), stronger = more sets.
// Region outlines live once in a hidden sprite; figures and icons <use> them.
import { esc, icon } from './ui.js'
import { round1 } from './model.js'
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

const VIEWS = { f: FRONT, b: BACK }

// Call once per page; display:none would stop <use> from rendering.
export const bodySprite = () => `<svg class="bm-sprite" aria-hidden="true" focusable="false"><defs>${
  Object.entries(VIEWS).map(([v, P]) => Object.entries(P).map(([slug, d]) =>
    `<path id="bm-${v}-${slug}" d="${d}" vector-effect="non-scaling-stroke"/>`).join('')).join('')
}</defs></svg>`

const opacity = level => (0.28 + 0.72 * Math.min(1, level)).toFixed(2)

function regions(v, levels, titles) {
  return Object.keys(VIEWS[v]).map(slug => {
    const href = `href="#bm-${v}-${slug}"`
    if (slug === 'hair') return `<use ${href} class="bm-hair"/>`
    const m = OWNER[slug], level = m ? levels[m] || 0 : 0
    if (level <= 0) return `<use ${href} class="bm-p"/>`
    return `<use ${href} class="bm-p on" style="--o:${opacity(level)}">${titles ? `<title>${esc(m)}</title>` : ''}</use>`
  }).join('')
}

const figure = (v, view, levels, label) => `<figure class="bm-fig">
    <svg viewBox="${view}" role="img" aria-label="${label}">${regions(v, levels, true)}</svg>
    <figcaption>${label}</figcaption>
  </figure>`

export function bodyMap(levels, { size = 'md' } = {}) {
  return `<div class="bm bm-${size}">${figure('f', FRONT_VIEW, levels, 'Front')}${figure('b', BACK_VIEW, levels, 'Back')}</div>`
}

// Exercise icon: the one view and half of the body where its main muscle is.
const CROP = {
  upperFront: ['f', '120 228 490 490'], upperBack: ['b', '835 215 497 497'],
  lowerFront: ['f', '144 625 440 440'], lowerBack: ['b', '863 600 440 440'],
}
const PLACE = {
  Chest: 'upperFront', Shoulders: 'upperFront', Biceps: 'upperFront', Forearms: 'upperFront', Core: 'upperFront',
  Back: 'upperBack', Triceps: 'upperBack', Quads: 'lowerFront', Hamstrings: 'lowerBack', Glutes: 'lowerBack',
}
export function exIcon(m) {
  if (m.primary === 'Cardio') return `<span class="exi cardio" aria-hidden="true">${icon('heart', 16)}</span>`
  const [v, box] = CROP[PLACE[m.primary] || 'upperFront']
  return `<svg class="exi" viewBox="${box}" aria-hidden="true">${regions(v, exerciseLevels(m), false)}</svg>`
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

// Map + per-muscle set bars, as in a session's detail.
export function muscleBreakdown(session, musclesOf, empty = '') {
  const { levels, sets } = sessionLevels(session, musclesOf)
  const top = Object.entries(sets).filter(([k, v]) => k !== 'Cardio' && v > 0).sort((a, b) => b[1] - a[1])
  if (!top.length) return empty
  return `<div class="dx-map">${bodyMap(levels)}<div class="dx-mus"><p class="field-label">Muscles worked</p>${
    top.map(([k, v]) => `<div class="dx-mrow"><span>${esc(k)}</span><i style="--w:${Math.min(100, v / 6 * 100)}%"></i><b>${round1(v)}</b></div>`).join('')
  }<p class="muted small">Working sets · secondary counts half</p></div></div>`
}

export function exerciseLevels(m) {
  const levels = {}
  if (m.primary) levels[m.primary] = 1
  for (const s of m.secondary) levels[s] = 0.35
  return levels
}

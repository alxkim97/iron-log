// Front/back body figure with muscle regions shaded by how much they worked.
// levels: { Chest: 0..1, ... } — one hue (accent), stronger = more sets.
import { esc } from './ui.js'

const E = (cx, cy, rx, ry, rot = 0) => ({ e: [cx, cy, rx, ry, rot] })
const P = d => ({ d })

const FRONT = {
  Shoulders: [E(30, 37, 7, 6, -20), E(70, 37, 7, 6, 20)],
  Chest: [P('M50 33 C44 31 37 33 36 39 C35 45 39 50 45 50 C48 50 50 48 50 46 Z'), P('M50 33 C56 31 63 33 64 39 C65 45 61 50 55 50 C52 50 50 48 50 46 Z')],
  Biceps: [E(27, 53, 4.5, 9, 8), E(73, 53, 4.5, 9, -8)],
  Forearms: [E(23, 74, 4, 10, 10), E(77, 74, 4, 10, -10)],
  Core: [P('M43 52 Q50 50 57 52 L57 78 Q50 82 43 78 Z')],
  Quads: [E(43, 110, 7, 20, 4), E(57, 110, 7, 20, -4)],
}
const BACK = {
  Back: [P('M42 26 L58 26 L65 34 L50 42 L35 34 Z'), P('M36 38 C35 52 40 62 46 66 L50 64 L50 42 Z'), P('M64 38 C65 52 60 62 54 66 L50 64 L50 42 Z'), P('M45 66 L55 66 L56 80 L44 80 Z')],
  Shoulders: [E(30, 37, 7, 6, -20), E(70, 37, 7, 6, 20)],
  Triceps: [E(27, 53, 4.5, 9, 8), E(73, 53, 4.5, 9, -8)],
  Forearms: [E(23, 74, 4, 10, 10), E(77, 74, 4, 10, -10)],
  Glutes: [E(43, 89, 7.5, 7.5), E(57, 89, 7.5, 7.5)],
  Hamstrings: [E(43, 115, 6.5, 15, 4), E(57, 115, 6.5, 15, -4)],
}

// Neutral silhouette pieces drawn underneath.
const BASE = `
  <circle cx="50" cy="14" r="9"/>
  <rect x="45" y="21" width="10" height="7" rx="2"/>
  <path d="M34 31 Q50 26 66 31 L67 60 Q66 82 58 86 L42 86 Q34 82 33 60 Z"/>
  <ellipse cx="27" cy="53" rx="5" ry="10" transform="rotate(8 27 53)"/><ellipse cx="73" cy="53" rx="5" ry="10" transform="rotate(-8 73 53)"/>
  <ellipse cx="23" cy="74" rx="4.5" ry="11" transform="rotate(10 23 74)"/><ellipse cx="77" cy="74" rx="4.5" ry="11" transform="rotate(-10 77 74)"/>
  <circle cx="20" cy="88" r="3.5"/><circle cx="80" cy="88" r="3.5"/>
  <ellipse cx="43" cy="110" rx="7.5" ry="22" transform="rotate(4 43 110)"/><ellipse cx="57" cy="110" rx="7.5" ry="22" transform="rotate(-4 57 110)"/>
  <ellipse cx="43" cy="152" rx="5" ry="15"/><ellipse cx="57" cy="152" rx="5" ry="15"/>
  <ellipse cx="42" cy="170" rx="5" ry="2.5"/><ellipse cx="58" cy="170" rx="5" ry="2.5"/>`

const shape = (s, level, name) => {
  const op = level > 0 ? (0.28 + 0.72 * Math.min(1, level)).toFixed(2) : 0
  const attrs = `class="bm-m${level > 0 ? ' on' : ''}" style="--o:${op}"`
  const t = `<title>${esc(name)}</title>`
  if (s.d) return `<path d="${s.d}" ${attrs}>${t}</path>`
  const [cx, cy, rx, ry, rot] = s.e
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${rot ? `transform="rotate(${rot} ${cx} ${cy})"` : ''} ${attrs}>${t}</ellipse>`
}

function figure(map, levels, label) {
  return `<figure class="bm-fig">
    <svg viewBox="12 2 76 172" role="img" aria-label="${label}">
      <g class="bm-base">${BASE}</g>
      ${Object.entries(map).map(([m, parts]) => parts.map(p => shape(p, levels[m] || 0, m)).join('')).join('')}
    </svg>
    <figcaption>${label}</figcaption>
  </figure>`
}

export function bodyMap(levels, { size = 'md' } = {}) {
  return `<div class="bm bm-${size}">${figure(FRONT, levels, 'Front')}${figure(BACK, levels, 'Back')}</div>`
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

// Two chart forms, plain HTML/SVG. Lines: 2px, ringed end dots, one shared
// axis, crosshair + tooltip on hover/touch. Columns: ≤24px, rounded data
// end, value tip on hover/focus. Text always in text tokens, never series colour.
import { esc } from './ui.js'
import { fromStr, shortDate } from './dates.js'

const registry = new Map()
let nextId = 0

function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1 }
  const span = max - min
  const step0 = span / count
  const mag = 10 ** Math.floor(Math.log10(step0))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || step0
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100)
  return { lo, hi, ticks }
}
const compact = v => Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}K` : String(Math.round(v * 10) / 10)

// series: [{ label, color, points: [{ x: 'YYYY-MM-DD', y, tip? }] }]
export function lineChart(series, { height = 200, unit = '', zero = false } = {}) {
  const all = series.flatMap(s => s.points)
  if (all.length < 2) return `<div class="chart-empty">Not enough data to chart yet.</div>`
  const xs = all.map(p => fromStr(p.x).getTime())
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  const ys = all.map(p => p.y)
  const { lo, hi, ticks } = niceTicks(zero ? 0 : Math.min(...ys), Math.max(...ys))
  const X = p => x1 === x0 ? 50 : ((fromStr(p.x).getTime() - x0) / (x1 - x0)) * 100
  const Y = v => 100 - ((v - lo) / (hi - lo)) * 100
  const id = `lc${++nextId}`
  registry.set(id, { series, X, Y, unit })
  const paths = series.map(s => {
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p).toFixed(2)} ${Y(p.y).toFixed(2)}`).join(' ')
    return `<path d="${d}" stroke="${s.color}" ${s.dashed ? 'stroke-dasharray="4 4"' : ''}/>`
  }).join('')
  const ends = series.map(s => { const p = s.points.at(-1); return p ? `<i class="lc-dot" style="left:${X(p)}%;top:${Y(p.y)}%;--c:${s.color}"></i>` : '' }).join('')
  const legend = series.length > 1 ? `<div class="legend">${series.map(s => `<span><i style="--c:${s.color}"${s.dashed ? ' class="dash"' : ''}></i>${esc(s.label)}</span>`).join('')}</div>` : ''
  const first = all.reduce((a, p) => p.x < a ? p.x : a, all[0].x), last = all.reduce((a, p) => p.x > a ? p.x : a, all[0].x)
  return `
    ${legend}
    <div class="lc" id="${id}" style="--h:${height}px">
      <div class="lc-y">${ticks.map(t => `<span style="top:${Y(t)}%">${compact(t)}</span>`).join('')}</div>
      <div class="lc-plot">
        ${ticks.map(t => `<b class="lc-grid" style="top:${Y(t)}%"></b>`).join('')}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>
        ${ends}
        <i class="lc-cross" hidden></i><div class="lc-tip" hidden></div>
      </div>
      <div class="lc-x"><span>${esc(shortDate(first))}</span><span>${esc(shortDate(last))}</span></div>
    </div>`
}

function onMove(e) {
  const plot = e.target.closest?.('.lc-plot')
  if (!plot) return
  const chart = registry.get(plot.parentElement.id)
  if (!chart) return
  const r = plot.getBoundingClientRect()
  const px = ((e.clientX - r.left) / r.width) * 100
  let best = null
  for (const s of chart.series) for (const p of s.points) {
    const d = Math.abs(chart.X(p) - px)
    if (!best || d < best.d) best = { d, p }
  }
  if (!best) return
  const x = best.p.x
  const rows = chart.series.map(s => ({ s, p: s.points.find(q => q.x === x) })).filter(r => r.p)
  const cross = plot.querySelector('.lc-cross'), tip = plot.querySelector('.lc-tip')
  const left = chart.X(best.p)
  cross.hidden = false
  cross.style.left = `${left}%`
  tip.hidden = false
  tip.innerHTML = `<b>${esc(shortDate(x))}</b>${rows.map(({ s, p }) => `<span><i style="--c:${s.color}"></i>${esc(p.tip || `${compact(p.y)}${chart.unit}`)}${chart.series.length > 1 ? ` <em>${esc(s.label)}</em>` : ''}</span>`).join('')}`
  tip.style.left = `${left}%`
  tip.classList.toggle('flip', left > 60)
  plot.querySelectorAll('.lc-hot').forEach(n => n.remove())
  for (const { s, p } of rows) plot.insertAdjacentHTML('beforeend', `<i class="lc-dot lc-hot" style="left:${left}%;top:${chart.Y(p.y)}%;--c:${s.color}"></i>`)
}
function onLeave(e) {
  const plot = e.target.closest?.('.lc-plot')
  if (!plot) return
  plot.querySelector('.lc-cross')?.setAttribute('hidden', '')
  plot.querySelector('.lc-tip')?.setAttribute('hidden', '')
  plot.querySelectorAll('.lc-hot').forEach(n => n.remove())
}
document.addEventListener('pointermove', onMove)
document.addEventListener('pointerdown', onMove)
document.addEventListener('pointerout', e => { if (e.target.closest?.('.lc-plot') && !e.relatedTarget?.closest?.('.lc-plot')) onLeave(e) })

// items: [{ label, v, tip, color?, dim? }] — one column per item.
export function columns(items, { height = 140, color = 'var(--chart-1)', target = null, labelEvery = 1 } = {}) {
  if (!items.length) return ''
  const max = Math.max(target || 0, ...items.map(i => i.v), 1)
  const { hi, ticks } = niceTicks(0, max, 3)
  return `
    <div class="cols" style="--h:${height}px">
      <div class="cols-y">${ticks.map(t => `<span style="bottom:${(t / hi) * 100}%">${compact(t)}</span>`).join('')}</div>
      <div class="cols-plot">
        ${ticks.map(t => `<b class="lc-grid" style="bottom:${(t / hi) * 100}%"></b>`).join('')}
        ${target ? `<b class="cols-target" style="bottom:${(target / hi) * 100}%"></b>` : ''}
        ${items.map((it, i) => `
          <div class="colb${it.dim ? ' dim' : ''}" tabindex="0" data-tip="${esc(it.tip || `${it.label}: ${compact(it.v)}`)}">
            <i style="height:${(it.v / hi) * 100}%;--c:${it.color || color}"></i>
            <span>${i % labelEvery === 0 ? esc(it.label) : ''}</span>
          </div>`).join('')}
      </div>
    </div>`
}

export const resetCharts = () => registry.clear()

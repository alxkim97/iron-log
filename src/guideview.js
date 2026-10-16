// "How to" for one exercise: muscles on the body map + form cues.
import { openModal, esc, icon } from './ui.js'
import { muscles } from './store.js'
import { bodyMap, exerciseLevels } from './bodymap.js'
import { guideFor, videoLink } from './guides.js'
import { toHevyName } from './hevy.js'

export function guideBlock(name, { compact = false } = {}) {
  const m = muscles(name)
  const g = guideFor(name)
  return `
    <div class="guide${compact ? ' compact' : ''}">
      <div class="guide-map">
        ${bodyMap(exerciseLevels(m), { size: 'sm' })}
        <div class="guide-mus">
          ${m.primary ? `<span class="mchip strong">${esc(m.primary)}</span>` : ''}
          ${m.secondary.map(s => `<span class="mchip ghost">${esc(s)}</span>`).join('')}
        </div>
      </div>
      <div class="guide-text">
        ${g ? `
          <p class="guide-setup"><b>Setup</b> ${esc(g.setup)}</p>
          <ol class="guide-cues">${g.cues.map(c => `<li>${esc(c)}</li>`).join('')}</ol>
          <p class="guide-avoid">${icon('alert', 14)} <b>Avoid:</b> ${esc(g.avoid)}</p>`
          : '<p class="muted">No written cues for this one yet — the video search below has demos.</p>'}
        <a class="btn soft small" href="${esc(videoLink(toHevyName(name)))}" target="_blank" rel="noopener">${icon('play', 14)} Watch form videos</a>
      </div>
    </div>`
}

export function openGuide(name) {
  openModal(`
    <header class="modal-head"><div><p class="eyebrow">How to</p><h2>${esc(name)}</h2></div><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></header>
    <div class="modal-body">${guideBlock(name)}</div>`, { cls: 'small' })
}

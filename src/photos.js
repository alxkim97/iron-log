// Workout photos: shrink on the device, queue the upload (works offline),
// show from the local copy until the private signed URL is available.
import { state, queuePhoto, pendingPhoto } from './store.js'
import { photoUrls } from './data.js'
import { openModal, esc, icon, toast } from './ui.js'
import { longDate } from './dates.js'

const urls = new Map() // path → { url, until }

export function pickPhotos() {
  return new Promise(resolve => {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = 'image/*'
    inp.multiple = true
    inp.onchange = () => resolve([...inp.files])
    inp.click()
  })
}

async function shrink(file, max = 1400, q = 0.8) {
  const src = URL.createObjectURL(file)
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', q)
  } finally { URL.revokeObjectURL(src) }
}

// Returns [{ path, at }] for the session; uploads continue in the background.
export async function addPhotos(sessionId) {
  const files = await pickPhotos()
  const out = []
  for (const f of files) {
    try {
      const dataUrl = await shrink(f)
      const path = `${state.session.user.id}/${sessionId}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`
      queuePhoto(path, dataUrl)
      out.push({ path, at: Date.now() })
    } catch { toast(`Couldn't read ${f.name}`) }
  }
  return out
}

const known = path => pendingPhoto(path) || (urls.get(path)?.until > Date.now() ? urls.get(path).url : '')

export const photoImg = (path, cls = 'ph-img', extra = '') =>
  `<img class="${cls}" data-photo="${esc(path)}" src="${esc(known(path))}" alt="" loading="lazy" ${extra}>`

// After any render: fill in images whose URL we don't have yet.
let timer
export function hydratePhotos() {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    const need = [...new Set([...document.querySelectorAll('img[data-photo]')].filter(i => !i.getAttribute('src')).map(i => i.dataset.photo))]
    if (!need.length) return
    try {
      const got = await photoUrls(need)
      for (const [p, url] of Object.entries(got)) urls.set(p, { url, until: Date.now() + 50 * 60 * 1000 })
      for (const img of document.querySelectorAll('img[data-photo]')) if (!img.getAttribute('src') && urls.has(img.dataset.photo)) img.src = urls.get(img.dataset.photo).url
    } catch {}
  }, 30)
}
new MutationObserver(hydratePhotos).observe(document.documentElement, { childList: true, subtree: true })

export function viewPhotos(photos, start = 0, { date, onOpenSession } = {}) {
  let i = start
  const m = openModal('', { cls: 'photo-view' })
  const draw = () => {
    const p = photos[i]
    m.el.innerHTML = `
      <div class="pv-top">
        <span>${date ? esc(longDate(date)) : ''}${photos.length > 1 ? ` · ${i + 1}/${photos.length}` : ''}</span>
        <div class="row-gap">
          ${onOpenSession ? `<button type="button" class="btn small ghost" data-pv="open">Open session</button>` : ''}
          <button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button>
        </div>
      </div>
      <div class="pv-stage">
        ${photos.length > 1 ? `<button type="button" class="pv-nav prev" data-pv="prev" aria-label="Previous">${icon('left', 28)}</button>` : ''}
        ${photoImg(p.path, 'pv-img')}
        ${photos.length > 1 ? `<button type="button" class="pv-nav next" data-pv="next" aria-label="Next">${icon('right', 28)}</button>` : ''}
      </div>`
  }
  m.el.addEventListener('click', e => {
    const a = e.target.closest('[data-pv]')?.dataset.pv
    if (a === 'prev') { i = (i - 1 + photos.length) % photos.length; draw() }
    if (a === 'next') { i = (i + 1) % photos.length; draw() }
    if (a === 'open') { m.close(true); onOpenSession() }
  })
  draw()
}

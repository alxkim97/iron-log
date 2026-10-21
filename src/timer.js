// Rest timer. Runs off an end timestamp, so a locked phone or a reload picks
// up where it should be. Updates any .rest-bar in the DOM; beeps + buzzes at 0.
import { state } from './store.js'
import { clock } from './dates.js'
import { icon } from './ui.js'

let rest = null        // { endsAt, total }
let ticker = null
let audio = null
let onEnd = () => {}

export const restState = () => rest
export const setRestEndHandler = fn => { onEnd = fn }

// Must be called from a tap (iOS only lets audio start inside a gesture).
export function unlockAudio() {
  if (!state.device.sound) return
  // 'transient' = a short alert that ducks music instead of stopping it (iOS 17+).
  try { if (navigator.audioSession) navigator.audioSession.type = 'transient' } catch {}
  if (audio) { audio.resume?.(); return }
  try {
    audio = new (window.AudioContext || window.webkitAudioContext)()
    const b = audio.createBuffer(1, 1, 22050), src = audio.createBufferSource() // prime the context inside the tap
    src.buffer = b; src.connect(audio.destination); src.start(0)
  } catch {}
}

// Three rising chimes, twice — square + sine layered so it cuts through gym noise.
function beep() {
  if (!audio || !state.device.sound) return
  try {
    audio.resume?.()
    const t = audio.currentTime
    const comp = audio.createDynamicsCompressor()
    comp.connect(audio.destination)
    for (const round of [0, 0.9]) {
      for (const [at, f] of [[0, 880], [0.22, 1175], [0.44, 1568]]) {
        for (const [type, vol] of [['square', 0.35], ['sine', 0.9]]) {
          const o = audio.createOscillator(), g = audio.createGain()
          o.type = type
          o.frequency.value = f
          const s0 = t + round + at
          g.gain.setValueAtTime(0.0001, s0)
          g.gain.exponentialRampToValueAtTime(vol, s0 + 0.015)
          g.gain.exponentialRampToValueAtTime(0.0001, s0 + 0.2)
          o.connect(g).connect(comp)
          o.start(s0); o.stop(s0 + 0.22)
        }
      }
    }
  } catch {}
}

// System notification when the app isn't on screen. Works in the desktop
// app and in browsers that keep running in the background; an iPhone
// freezes the web app once it's left, so nothing can fire there.
export async function enableNotify() {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'default') { try { await Notification.requestPermission() } catch {} }
  return Notification.permission
}
function notify() {
  if (!state.device.notify || !('Notification' in window) || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible' && document.hasFocus()) return
  const opts = { body: 'Time for your next set', tag: 'iron-rest', renotify: true, requireInteraction: false }
  const plain = () => { try { new Notification('Rest over', opts) } catch {} }
  if (navigator.serviceWorker?.controller) navigator.serviceWorker.ready.then(r => r.showNotification('Rest over', opts)).catch(plain)
  else plain()
}

// Full-width banner so the end of rest is obvious even at arm's length.
let bannerTimer
function restDone() {
  document.querySelector('.rest-done')?.remove()
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'rest-done'
  el.innerHTML = `${icon('zap', 26)}<span><b>Rest over</b><em>Time for your next set</em></span>`
  document.body.append(el)
  requestAnimationFrame(() => el.classList.add('show'))
  const hide = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 300) }
  el.onclick = hide
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(hide, 10000)
}

export function startRest(secs) {
  if (!secs) return
  rest = { endsAt: Date.now() + secs * 1000, total: secs }
  run()
}
export function restoreRest(r) {
  rest = r && r.endsAt > Date.now() ? r : null
  if (rest) run()
}
export function adjustRest(delta) {
  if (!rest) return
  rest.endsAt += delta * 1000
  rest.total = Math.max(1, rest.total + delta)
  if (rest.endsAt <= Date.now()) return stopRest()
  paint()
  onEnd(rest)
}
export function stopRest() {
  rest = null
  clearInterval(ticker); ticker = null
  paint()
  onEnd(null)
}

function run() {
  clearInterval(ticker)
  ticker = setInterval(() => {
    if (rest && rest.endsAt <= Date.now()) {
      rest = null
      clearInterval(ticker); ticker = null
      beep()
      navigator.vibrate?.([400, 150, 400, 150, 600])
      notify()
      restDone()
      onEnd(null)
    }
    paint()
  }, 250)
  paint()
  onEnd(rest)
}

export function restBar() {
  return `<div class="rest-bar" ${rest ? '' : 'hidden'}>
    <div class="rest-fill"></div>
    <span class="rest-label">${icon('timer', 18)} Rest</span>
    <b class="rest-time">${rest ? clock((rest.endsAt - Date.now()) / 1000) : ''}</b>
    <div class="rest-btns">
      <button type="button" class="btn small ghost" data-wk="rest-adj" data-v="-15">−15</button>
      <button type="button" class="btn small ghost" data-wk="rest-adj" data-v="15">+15</button>
      <button type="button" class="btn small soft" data-wk="rest-skip">Skip</button>
    </div>
  </div>`
}

function paint() {
  for (const bar of document.querySelectorAll('.rest-bar')) {
    if (!rest) { bar.hidden = true; continue }
    bar.hidden = false
    const left = Math.max(0, (rest.endsAt - Date.now()) / 1000)
    bar.querySelector('.rest-time').textContent = clock(Math.ceil(left))
    bar.querySelector('.rest-fill').style.transform = `scaleX(${Math.min(1, left / rest.total)})`
  }
}

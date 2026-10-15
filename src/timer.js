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
  if (audio || !state.device.sound) return
  try { audio = new (window.AudioContext || window.webkitAudioContext)() } catch {}
}

function beep() {
  if (!audio || !state.device.sound) return
  try {
    audio.resume?.()
    const t = audio.currentTime
    for (const [at, f] of [[0, 880], [0.18, 880], [0.36, 1175]]) {
      const o = audio.createOscillator(), g = audio.createGain()
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t + at)
      g.gain.exponentialRampToValueAtTime(0.25, t + at + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.15)
      o.connect(g).connect(audio.destination)
      o.start(t + at); o.stop(t + at + 0.16)
    }
  } catch {}
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
      navigator.vibrate?.([200, 100, 200])
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

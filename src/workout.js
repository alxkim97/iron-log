// The workout screen. Two modes, one UI:
//  live — at the gym: elapsed clock, previous numbers as placeholders, tick a
//         set to log it (an empty tick takes last time's numbers), rest timer.
//         The draft lives in localStorage, so closing the app loses nothing.
//  edit — backfill or fix a session: date + duration fields, typing a value
//         ticks the set.
// Only ticked sets are saved.
import { openModal, confirmBox, toast, esc, icon } from './ui.js'
import {
  state, saveSession, deleteSessions, sessionById, lastFor, bestFor, isCardio, muscles, routine, latestBw, blobOp, historyFor, queuePhotoDelete,
} from './store.js'
import { addPhotos, photoImg } from './photos.js'
import { openGuide } from './guideview.js'
import { PROGRAMS, programColor, parseRepRange, suggestNext, fmtKg, fmtSet, exerciseStats, fmtVol } from './model.js'
import { dayById, dayForDate } from './routine.js'
import { today, clock, longDate, relDay, shortDate } from './dates.js'
import { pickExercise } from './picker.js'
import { bodyMap, sessionLevels, muscleBreakdown } from './bodymap.js'
import { exThumb } from './components.js'
import { startRest, stopRest, adjustRest, restBar, restoreRest, setRestEndHandler, unlockAudio, restState } from './timer.js'

const LIVE_KEY = 'il_draft'
const loadLive = () => { try { return JSON.parse(localStorage.getItem(LIVE_KEY) || 'null') } catch { return null } }
let live = loadLive()
let shown = null          // the draft on screen (live or an edit draft)
let modal = null
let dirty = false
let hooks = { rerender: () => {}, afterSave: () => {} }

export const initWorkout = h => { hooks = { ...hooks, ...h }; if (live?.rest) restoreRest(live.rest) }
export const liveDraft = () => live
export const workoutOpen = () => !!modal

function persistLive() {
  try { live ? localStorage.setItem(LIVE_KEY, JSON.stringify(live)) : localStorage.removeItem(LIVE_KEY) } catch {}
}
setRestEndHandler(r => { if (live) { live.rest = r; persistLive() } })

const uid = () => Math.random().toString(36).slice(2, 9)
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const str = v => v ? fmtKg(v) : ''

function rangeFor(name, entry) {
  const own = parseRepRange(entry?.reps)
  if (own) return own
  for (const d of routine().days) for (const e of d.exercises) if (e.name.toLowerCase() === name.toLowerCase()) return parseRepRange(e.reps)
  return null
}

function makeExercise(name, { entry = null, date = today(), exceptId = null, count = null, values = false } = {}) {
  const last = lastFor(name, date, exceptId)
  const prev = last ? last.ex.sets.map(s => ({ type: s.type, weight: s.weight, reps: s.reps })) : []
  const range = rangeFor(name, entry)
  const n = count ?? entry?.sets ?? (prev.length || 3)
  const sets = Array.from({ length: Math.max(1, n) }, (_, i) => {
    const p = prev[i] || prev.filter(s => s.type !== 'warmup').at(-1)
    return { uid: uid(), type: prev[i]?.type === 'warmup' ? 'warmup' : 'working', w: values && p ? str(p.weight) : '', r: values && p ? str(p.reps) : '', done: false }
  })
  return {
    uid: uid(), name, note: '', hint: entry?.notes || '', range, prev,
    lastDate: last?.date || null,
    suggest: suggestNext(prev, range, isCardio(name)),
    sets,
  }
}

// ── Entry points ──
// `custom` is a picked list of { name, entry } (catch-up sheet, Holiday
// mode) — not tied to any single routine day, so it gets its own title
// rather than borrowing one day's.
export function startWorkout({ dayId = null, fromSessionId = null, custom = null, title = 'Catch-up' } = {}) {
  if (live) return resume()
  const day = dayId ? dayById(routine(), dayId) : null
  const src = fromSessionId ? sessionById(fromSessionId) : null
  const exercises = custom ? custom.map(c => makeExercise(c.name, { entry: c.entry }))
    : day ? day.exercises.map(e => makeExercise(e.name, { entry: e }))
    : src ? src.exercises.map(e => makeExercise(e.name, { count: e.sets.length }))
    : []
  live = {
    mode: 'live', id: genId(), date: today(), startedAt: Date.now(),
    program: custom ? 'Other' : (day?.program || src?.program || 'Other'),
    title: custom ? title : (day?.name || ''),
    dayId: day?.id || null,
    notes: '', exercises, rest: null, photos: [],
  }
  persistLive()
  open(live)
  hooks.rerender()
  if (!exercises.length) addExercise()
}

export function resume() { if (live) open(live) }

export function newSession(date = today()) {
  const day = dayForDate(routine(), date)
  open({
    mode: 'edit', id: genId(), date, program: day?.program || 'Other', title: '', duration: '', notes: '', photos: [], added: [],
    exercises: day ? day.exercises.map(e => makeExercise(e.name, { entry: e, date })) : [],
  })
}

export function editSession(id) {
  const s = sessionById(id)
  if (!s) return
  open({
    mode: 'edit', existing: true, base: s, id: s.id, date: s.date, program: s.program, title: s.title || '',
    duration: s.duration ? String(s.duration) : '', notes: s.notes || '', photos: [...(s.photos || [])], added: [],
    exercises: s.exercises.map(e => {
      const last = lastFor(e.name, s.date, s.id)
      return {
        uid: uid(), name: e.name, note: e.note || '', hint: '', range: rangeFor(e.name), lastDate: last?.date || null,
        prev: last ? last.ex.sets.map(x => ({ type: x.type, weight: x.weight, reps: x.reps })) : [], suggest: null,
        sets: e.sets.map(x => ({ uid: uid(), type: x.type, w: str(x.weight), r: str(x.reps), done: true, ...(x.timed ? { timed: true } : {}) })),
      }
    }),
  })
}

// ── Screen ──
function open(d) {
  if (modal) modal.close(true)
  shown = d
  dirty = false
  modal = openModal('', {
    cls: 'workout', wide: true,
    beforeClose: async () => {
      if (shown.mode === 'live') return true // minimise; the draft stays
      if (!dirty) return true
      return confirmBox('Discard changes to this session?', { ok: 'Discard' })
    },
    onClose: () => {
      // Edit closed without saving: drop photos added in it.
      if (shown?.mode === 'edit' && !shown.saved && shown.added?.length) queuePhotoDelete(shown.added)
      modal = null; shown = null; keepAwake(false); hooks.rerender()
    },
  })
  modal.el.addEventListener('click', onClick)
  modal.el.addEventListener('input', onInput)
  modal.el.addEventListener('change', onChange)
  render()
  if (d.mode === 'live') keepAwake(true)
}

// Only ticked sets count, so the map fills in as the workout goes.
const doneSession = d => ({ exercises: d.exercises.map(e => ({ name: e.name, sets: e.sets.filter(s => s.done) })) })

const cardioLabels = name => isCardio(name) ? ['km/h', 'min'] : ['kg', 'reps']

function exerciseCard(e, i, d) {
  const [wl, rl] = cardioLabels(e.name)
  const mu = muscles(e.name)
  const lastLine = e.prev.length
    ? `Last ${relDay(e.lastDate).toLowerCase() === 'today' ? 'today' : shortDate(e.lastDate)}: ${e.prev.filter(s => s.type !== 'warmup').map(s => fmtSet(s, isCardio(e.name))).join(', ')}`
    : 'First time — no history yet'
  return `
    <section class="wk-ex" data-ex="${e.uid}">
      <header class="wk-ex-head">
        ${exThumb(e.name)}
        <div class="wk-ex-title">
          <button type="button" class="wk-ex-name" data-wk="ex-menu">${esc(e.name)}</button>
          <div class="wk-ex-sub">${mu.primary ? `<span class="mchip">${esc(mu.primary)}</span>` : ''}${e.range ? `<span class="mchip ghost">${e.range[0] === e.range[1] ? e.range[0] : `${e.range[0]}–${e.range[1]}`} ${isCardio(e.name) ? 'min' : 'reps'}</span>` : ''}${e.suggest ? `<span class="mchip up" title="Every set hit the top of the range last time">${icon('up', 12)} try ${fmtKg(e.suggest)} kg</span>` : ''}</div>
        </div>
        <button type="button" class="icon-btn" data-wk="guide" aria-label="How to do ${esc(e.name)}" title="How to">${icon('info')}</button>
        <button type="button" class="icon-btn" data-wk="ex-menu" aria-label="Exercise options">${icon('more')}</button>
      </header>
      <p class="wk-last">${esc(lastLine)}${e.hint ? ` · <em>${esc(e.hint)}</em>` : ''}</p>
      ${e.note || e.showNote ? `<input class="wk-note" data-f="note" value="${esc(e.note)}" placeholder="Note (seat 4, cable level 3…)" autocomplete="off">` : ''}
      <div class="sets">
        <div class="set-row head"><span>Set</span><span>Previous</span><span>${wl}</span><span>${rl}</span><span>${icon('check', 16)}</span></div>
        ${e.sets.map((s, si) => {
          const p = e.prev[si]
          const n = e.sets.slice(0, si + 1).filter(x => x.type !== 'warmup').length
          return `
          <div class="set-row${s.done ? ' done' : ''}" data-set="${s.uid}">
            <button type="button" class="set-no${s.type === 'warmup' ? ' warm' : ''}" data-wk="set-type" title="Tap: warm-up / working">${s.type === 'warmup' ? 'W' : n}</button>
            <button type="button" class="set-prev" data-wk="prev-fill" ${p ? '' : 'disabled'}>${p ? esc(fmtSet(p, isCardio(e.name))) : '—'}</button>
            <input class="set-in" data-f="w" inputmode="decimal" enterkeyhint="next" value="${esc(s.w)}" placeholder="${p ? esc(str(p.weight) || '0') : ''}" aria-label="${wl}" autocomplete="off">
            <input class="set-in" data-f="r" inputmode="decimal" enterkeyhint="done" value="${esc(s.r)}" placeholder="${p ? esc(str(p.reps)) : ''}" aria-label="${rl}" autocomplete="off">
            <button type="button" class="set-tick" data-wk="tick" aria-pressed="${s.done}" aria-label="Log set">${icon('check', 18)}</button>
          </div>`
        }).join('')}
      </div>
      <div class="wk-ex-foot">
        <button type="button" class="btn small soft" data-wk="add-set">${icon('plus', 15)} Add set</button>
        ${e.sets.length > 1 ? `<button type="button" class="btn small ghost" data-wk="del-set">${icon('minus', 15)} Remove set</button>` : ''}
      </div>
    </section>`
}

function html(d) {
  const isLive = d.mode === 'live'
  const doneSets = d.exercises.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0)
  const title = isLive ? (d.title || `${d.program} workout`) : d.existing ? 'Edit session' : 'Log a session'
  return `
    <header class="wk-head">
      <button type="button" class="icon-btn" data-close aria-label="${isLive ? 'Minimise' : 'Close'}">${icon(isLive ? 'down' : 'x')}</button>
      <div class="wk-head-mid">
        <h2>${esc(title)}</h2>
        <p>${isLive ? `<span class="wk-clock">${clock((Date.now() - d.startedAt) / 1000)}</span> · ` : ''}<span class="wk-count">${doneSets} set${doneSets === 1 ? '' : 's'} logged</span></p>
      </div>
      <button type="button" class="wk-map" data-wk="map" aria-label="Muscles worked so far">${bodyMap(sessionLevels(doneSession(d), muscles).levels, { size: 'xs' })}</button>
      <button type="button" class="btn primary" data-wk="finish">${isLive ? 'Finish' : 'Save'}</button>
    </header>
    <div class="wk-body">
      <div class="prog-row" role="radiogroup" aria-label="Workout type">
        ${PROGRAMS.map(p => `<button type="button" class="pchip${d.program === p ? ' on' : ''}" style="--c:${programColor(p)}" data-wk="program" data-v="${p}">${p}</button>`).join('')}
      </div>
      ${isLive ? '' : `
        <div class="field-row">
          <label class="field">Date<input type="date" data-f="date" value="${esc(d.date)}" max="${today()}"></label>
          <label class="field">Minutes<input data-f="duration" inputmode="numeric" value="${esc(d.duration)}" placeholder="45"></label>
        </div>`}
      ${d.exercises.map((e, i) => exerciseCard(e, i, d)).join('') || `<div class="empty"><div class="empty-emoji">🏋️</div><p>Add your first exercise.</p></div>`}
      <button type="button" class="btn soft block add-ex" data-wk="add-ex">${icon('plus', 18)} Add exercise</button>
      <div class="wk-photos">
        <span class="field-label">Photos</span>
        <div class="ph-row">
          ${(d.photos || []).map((p, i) => `<div class="ph-thumb">${photoImg(p.path)}<button type="button" class="ph-del" data-wk="del-photo" data-i="${i}" aria-label="Remove photo">${icon('x', 12)}</button></div>`).join('')}
          <button type="button" class="ph-add" data-wk="add-photo">${icon('camera', 22)}<span>Add photo</span></button>
        </div>
      </div>
      <label class="field">Session notes<textarea data-f="notes" rows="2" placeholder="How did it go?">${esc(d.notes)}</textarea></label>
      <div class="wk-danger">
        ${isLive ? `<button type="button" class="btn ghost danger-text" data-wk="discard">${icon('trash', 16)} Discard workout</button>`
          : d.existing ? `<button type="button" class="btn ghost danger-text" data-wk="delete">${icon('trash', 16)} Delete session</button>` : ''}
      </div>
    </div>
    ${isLive ? restBar() : ''}`
}

function render() {
  if (!modal || !shown) return
  const body = modal.el.querySelector('.wk-body')
  const y = body?.scrollTop || 0
  modal.el.innerHTML = html(shown)
  modal.el.querySelector('.wk-body').scrollTop = y
}

function save() {
  dirty = true
  if (shown === live) persistLive()
}

const exOf = el => shown.exercises.find(e => e.uid === el.closest('[data-ex]')?.dataset.ex)
const setOf = (ex, el) => ex?.sets.find(s => s.uid === el.closest('[data-set]')?.dataset.set)

function paintCounts() {
  const n = shown.exercises.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0)
  const el = modal?.el.querySelector('.wk-count')
  if (el) el.textContent = `${n} set${n === 1 ? '' : 's'} logged`
}

function onInput(e) {
  const f = e.target.dataset.f
  if (!f || !shown) return
  if (f === 'w' || f === 'r') {
    const ex = exOf(e.target), s = setOf(ex, e.target)
    if (!s) return
    s[f] = e.target.value
    if (shown.mode === 'edit' && !s.done && (s.w || s.r)) {
      s.done = true
      e.target.closest('.set-row').classList.add('done')
      e.target.closest('.set-row').querySelector('.set-tick').setAttribute('aria-pressed', 'true')
      paintCounts()
    }
  } else if (f === 'note') exOf(e.target).note = e.target.value
  else if (f === 'notes') shown.notes = e.target.value
  else if (f === 'duration') shown.duration = e.target.value
  save()
}

function onChange(e) {
  if (e.target.dataset.f === 'date' && e.target.value) { shown.date = e.target.value; save() }
}

async function onClick(e) {
  const b = e.target.closest('[data-wk]')
  if (!b || !shown) return
  const act = b.dataset.wk
  const ex = exOf(b)
  switch (act) {
    case 'program': shown.program = b.dataset.v; save(); return render()
    case 'tick': return tick(ex, setOf(ex, b), b)
    case 'prev-fill': {
      const s = setOf(ex, b), i = ex.sets.indexOf(s), p = ex.prev[i]
      if (!p) return
      s.w = str(p.weight); s.r = str(p.reps)
      save(); return render()
    }
    case 'set-type': { const s = setOf(ex, b); s.type = s.type === 'warmup' ? 'working' : 'warmup'; save(); return render() }
    case 'add-set': {
      const last = ex.sets.at(-1)
      ex.sets.push({ uid: uid(), type: 'working', w: last?.w || '', r: '', done: false })
      save(); render()
      modal.el.querySelector(`[data-ex="${ex.uid}"] .set-row:last-child .set-in`)?.focus()
      return
    }
    case 'del-set': ex.sets.pop(); save(); return render()
    case 'add-ex': return addExercise()
    case 'ex-menu': return exerciseMenu(ex)
    case 'guide': return openGuide(ex.name)
    case 'map': return openModal(`
      <header class="modal-head"><div><p class="eyebrow">This workout so far</p><h2>${(n => `${n} set${n === 1 ? '' : 's'} logged`)(shown.exercises.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0))}</h2></div><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></header>
      <div class="modal-body">${muscleBreakdown(doneSession(shown), muscles, '<p class="muted">Tick a set and the muscles it works light up here.</p>')}</div>`, { cls: 'small' })
    case 'add-photo': {
      const d = shown
      const got = await addPhotos(d.id)
      if (!got.length || shown !== d) return
      d.photos = [...(d.photos || []), ...got]
      if (d.mode === 'edit') d.added.push(...got.map(p => p.path))
      save(); return render()
    }
    case 'del-photo': {
      const [p] = shown.photos.splice(Number(b.dataset.i), 1)
      // Live / newly added: delete now. Existing in an edit: on save.
      if (shown.mode === 'live' || shown.added?.includes(p.path)) queuePhotoDelete([p.path])
      save(); return render()
    }
    case 'finish': return finish()
    case 'discard':
      if (!(await confirmBox('Discard this workout? Nothing from it will be saved.', { ok: 'Discard' }))) return
      queuePhotoDelete((live.photos || []).map(p => p.path))
      live = null; persistLive(); stopRest(); modal.close(true); return
    case 'delete': {
      if (!(await confirmBox('Delete this session?'))) return
      const s = shown.base
      deleteSessions([s.id])
      modal.close(true)
      toast('Session deleted', { label: 'Undo', run: () => { saveSession(s); hooks.rerender() } })
      return
    }
    case 'rest-adj': return adjustRest(Number(b.dataset.v))
    case 'rest-skip': return stopRest()
  }
}

function tick(ex, s, btn) {
  if (!s) return
  unlockAudio()
  const i = ex.sets.indexOf(s)
  if (!s.done) {
    const p = ex.prev[i]
    if (!s.w && p) s.w = str(p.weight)
    if (!s.r && p) s.r = str(p.reps)
    if (!num(s.r) && !num(s.w)) {
      const row = btn.closest('.set-row')
      row.classList.add('shake'); setTimeout(() => row.classList.remove('shake'), 400)
      row.querySelector('[data-f="r"]').focus()
      return
    }
    s.done = true
    if (shown.mode === 'live' && s.type !== 'warmup') startRest(state.prefs.restSecs || 90)
  } else s.done = false
  save()
  render()
}

async function addExercise() {
  const name = await pickExercise({ exclude: shown.exercises.map(e => e.name) })
  if (!name || !shown) return
  shown.exercises.push(makeExercise(name, { date: shown.date, exceptId: shown.id, values: false }))
  save(); render()
  const cards = modal.el.querySelectorAll('.wk-ex')
  cards[cards.length - 1]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

function exerciseMenu(ex) {
  const i = shown.exercises.indexOf(ex)
  const h = historyFor(ex.name)
  const recent = (h?.entries || []).slice(-5).reverse()
  const m = openModal(`
    <div class="sheet-menu">
      <header class="modal-head"><h2>${esc(ex.name)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></header>
      <div class="modal-body">
        ${recent.length ? `<div class="mini-hist">${recent.map(r => `<div><b>${esc(shortDate(r.date))}</b><span>${esc(r.ex.sets.filter(s => s.type !== 'warmup').map(s => fmtSet(s, isCardio(ex.name))).join(' · '))}</span></div>`).join('')}</div>` : ''}
        <div class="menu-list">
          <button type="button" data-m="note">${icon('note', 18)} ${ex.note || ex.showNote ? 'Edit note' : 'Add note'}</button>
          <button type="button" data-m="guide">${icon('info', 18)} How to do it</button>
          <button type="button" data-m="swap">${icon('swap', 18)} Replace exercise</button>
          ${i > 0 ? `<button type="button" data-m="up">${icon('up', 18)} Move up</button>` : ''}
          ${i < shown.exercises.length - 1 ? `<button type="button" data-m="down">${icon('down', 18)} Move down</button>` : ''}
          <button type="button" data-m="remove" class="danger-text">${icon('trash', 18)} Remove exercise</button>
        </div>
      </div>
    </div>`, { cls: 'small' })
  m.el.addEventListener('click', async e => {
    const a = e.target.closest('[data-m]')?.dataset.m
    if (!a) return
    m.close(true)
    if (a === 'guide') return openGuide(ex.name)
    if (a === 'note') { ex.showNote = true; render(); modal.el.querySelector(`[data-ex="${ex.uid}"] .wk-note`)?.focus(); return }
    if (a === 'up' || a === 'down') { const j = a === 'up' ? i - 1 : i + 1; [shown.exercises[i], shown.exercises[j]] = [shown.exercises[j], shown.exercises[i]] }
    if (a === 'remove') {
      if (ex.sets.some(s => s.done) && !(await confirmBox(`Remove ${ex.name} and its logged sets?`, { ok: 'Remove' }))) return
      shown.exercises.splice(shown.exercises.indexOf(ex), 1)
    }
    if (a === 'swap') {
      const name = await pickExercise({ title: `Replace ${ex.name}`, exclude: shown.exercises.map(x => x.name), similarTo: ex.name })
      if (!name) return
      const fresh = makeExercise(name, { date: shown.date, exceptId: shown.id, count: ex.sets.length })
      shown.exercises[shown.exercises.indexOf(ex)] = fresh
    }
    save(); render()
  })
}

// ── Finish ──
function collect(d) {
  return d.exercises.map(e => ({
    name: e.name,
    note: e.note.trim(),
    effort: 0,
    sets: e.sets.filter(s => s.done).map(s => ({ type: s.type, weight: num(s.w), reps: num(s.r), ...(s.timed ? { timed: true } : {}) })),
  })).filter(e => e.sets.length)
}

async function finish() {
  const d = shown
  const exercises = collect(d)
  if (!exercises.length) return toast(d.mode === 'live' ? 'Tick at least one set first' : 'Add at least one set')
  const loose = d.exercises.reduce((a, e) => a + e.sets.filter(s => !s.done && (s.w || s.r)).length, 0)
  if (d.mode === 'live' && loose && !(await confirmBox(`${loose} set${loose === 1 ? ' has' : 's have'} numbers but no tick and won't be saved. Finish anyway?`, { ok: 'Finish', danger: false, cancel: 'Back' }))) return

  const base = d.base || {}
  const session = {
    ...base,
    id: d.id,
    date: d.date,
    program: d.program,
    title: d.title || base.title || '',
    duration: d.mode === 'live' ? Math.min(300, Math.max(1, Math.round((Date.now() - d.startedAt) / 60000))) : num(d.duration),
    notes: d.notes.trim(),
    exercises,
    photos: d.photos || [],
    createdAt: base.createdAt || d.startedAt || Date.now(),
    ...(d.mode === 'live' ? { startedAt: d.startedAt, source: 'live' } : {}),
    updatedAt: Date.now(),
  }
  const prs = []
  for (const e of exercises) {
    if (isCardio(e.name)) continue
    const st = exerciseStats(e, false)
    const best = bestFor(e.name, session.id)
    if (best.maxW > 0 && st.maxW > best.maxW) prs.push({ name: e.name, what: `${fmtKg(st.maxW)} kg — heaviest yet (was ${fmtKg(best.maxW)})` })
    else if (best.e1rm > 0 && st.e1rm > best.e1rm + 0.05) prs.push({ name: e.name, what: `est. 1RM ${fmtKg(Math.round(st.e1rm * 10) / 10)} kg (was ${fmtKg(Math.round(best.e1rm * 10) / 10)})` })
  }
  if (d.base?.photos?.length) queuePhotoDelete(d.base.photos.map(p => p.path).filter(p => !session.photos.some(x => x.path === p)))
  d.saved = true
  const saved = saveSession(session)
  if (d.mode === 'live') { live = null; persistLive(); stopRest() }
  modal.close(true)
  if (d.mode === 'live') summary(saved, prs)
  else toast(d.existing ? 'Saved' : 'Session logged ✓')
  hooks.afterSave(saved)
}

function summary(s, prs) {
  const sets = s.exercises.reduce((a, e) => a + e.sets.filter(x => x.type !== 'warmup').length, 0)
  const bw = latestBw()
  const m = openModal(`
    <div class="summary">
      <div class="summary-hero">
        <div class="summary-emoji">${prs.length ? '🏆' : '💪'}</div>
        <h2>${prs.length ? `${prs.length} new PR${prs.length > 1 ? 's' : ''}!` : 'Workout done'}</h2>
        <p>${esc(longDate(s.date))}</p>
      </div>
      <div class="summary-stats">
        <div><b>${s.duration}</b><span>min</span></div>
        <div><b>${sets}</b><span>sets</span></div>
        <div><b>${esc(fmtVol(s.totalVol || 0))}</b><span>volume</span></div>
      </div>
      ${prs.length ? `<ul class="pr-list">${prs.map(p => `<li>${icon('trophy', 16)}<div><b>${esc(p.name)}</b><span>${esc(p.what)}</span></div></li>`).join('')}</ul>` : ''}
      <form class="bw-quick">
        <label>Body weight<input name="w" inputmode="decimal" placeholder="${bw ? esc(fmtKg(bw.weight)) : 'kg'}" autocomplete="off"></label>
        <button class="btn soft" type="submit">Log</button>
      </form>
      <div class="ph-row sum-photos"></div>
      <div class="row-gap sum-btns">
        <button type="button" class="btn soft" data-sum="photo">${icon('camera', 16)} Add photo</button>
        <button type="button" class="btn primary" data-close>Done</button>
      </div>
    </div>`, { cls: 'small' + (prs.length ? ' celebrate' : '') })
  let cur = s
  m.el.querySelector('[data-sum="photo"]').onclick = async () => {
    const got = await addPhotos(s.id)
    if (!got.length) return
    cur = saveSession({ ...cur, photos: [...(cur.photos || []), ...got] })
    m.el.querySelector('.sum-photos').innerHTML = cur.photos.map(p => `<div class="ph-thumb">${photoImg(p.path)}</div>`).join('')
    hooks.rerender()
  }
  m.el.querySelector('form').onsubmit = e => {
    e.preventDefault()
    const w = num(e.target.elements.w.value)
    if (w < 30 || w > 250) return toast('Enter your weight in kg')
    blobOp('iron_bwlog', { type: 'upsert', item: { date: s.date, weight: w, note: 'Post-workout' } })
    e.target.innerHTML = `<p class="muted">Logged ${fmtKg(w)} kg ✓</p>`
  }
}

// ── Screen awake + live clock ──
let wake = null
async function keepAwake(on) {
  try {
    if (on && state.device.wake && 'wakeLock' in navigator) wake = await navigator.wakeLock.request('screen')
    else { await wake?.release(); wake = null }
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && modal && shown?.mode === 'live') keepAwake(true)
})
setInterval(() => {
  if (!live) return
  const t = clock((Date.now() - live.startedAt) / 1000)
  for (const el of document.querySelectorAll('.wk-clock')) el.textContent = t
}, 1000)

export const liveSummary = () => live && {
  title: live.title || `${live.program} workout`,
  sets: live.exercises.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0),
  startedAt: live.startedAt,
  rest: restState(),
}

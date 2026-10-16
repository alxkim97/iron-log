import './style.css'
import { isConfigured } from './config.js'
import { getSession, onAuthChange, signOut } from './data.js'
import {
  state, saveDevice, restoreCache, clearLocal, loadAll, flush, setOnChange, setPrefs, blobOp, routine, sortedSessions, achievements,
} from './store.js'
import { today, addMonths, monthStart, clock, relDay } from './dates.js'
import { esc, icon, toast, closeTopModal, modalOpen, openModal } from './ui.js'
import { applyTheme } from './theme.js'
import { bodySprite } from './bodymap.js'
import { initUpdateReload } from './swUpdate.js'
import { renderAuth, logo } from './views/auth.js'
import { renderToday } from './views/today.js'
import { renderHistory, historyTitle, openSessionDetail, openPhoto } from './views/history.js'
import { renderProgress } from './views/progress.js'
import { renderBody } from './views/body.js'
import { renderRoutine, editDay, resetRoutine } from './views/routine.js'
import { renderExercises, editExercise } from './views/exercises.js'
import { renderSettings, syncLine, PREFS_SQL, PHOTOS_SQL } from './views/settings.js'
import { initWorkout, startWorkout, resume, newSession, editSession, liveDraft, liveSummary, workoutOpen } from './workout.js'
import { importHevy, importBackup, exportBackup, exportCsv, exportForHevy } from './importer.js'
import { sortedDays } from './routine.js'
import { programColor, fmtKg } from './model.js'
import { resetCharts } from './charts.js'

const root = document.getElementById('app')
const PHONE = window.matchMedia('(max-width: 859px)')
const isPhone = () => PHONE.matches

applyTheme(state.device.theme)
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(state.device.theme))

document.body.insertAdjacentHTML('afterbegin', bodySprite())

// ── Boot / auth ──
async function boot() {
  if (!isConfigured() && import.meta.env.MODE !== 'demo') { root.textContent = 'Supabase is not configured (src/config.js).'; return }
  state.session = await getSession()
  onAuthChange(session => {
    const was = state.session?.user?.id
    state.session = session
    if (session?.user?.id !== was) start()
  })
  start()
}

async function start() {
  if (!state.session) { clearLocal(); state.loaded = false; return renderAuth(root) }
  if (restoreCache()) render()
  else root.innerHTML = `<div class="auth"><div class="loading">${logo('pulse')}<p class="muted">Loading your training…</p></div></div>`
  await load()
}

async function load({ quiet = false } = {}) {
  try {
    await loadAll()
  } catch (e) {
    if (!state.loaded) {
      root.innerHTML = `<div class="auth"><div class="auth-card"><h2>Can't reach Iron Log</h2><p class="auth-sub">${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">Retry</button></div></div>`
      return
    }
    if (!quiet) toast('Offline — showing saved data')
  }
  render()
  checkAchievements()
}

setOnChange(() => { if (state.loaded) paintSync() })
window.addEventListener('online', () => flush())

let lastFocusLoad = Date.now()
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.loaded) return
  flush()
  if (Date.now() - lastFocusLoad < 60_000 || workoutOpen() || modalOpen()) return
  lastFocusLoad = Date.now()
  load({ quiet: true })
})

// ── Achievements ──
let achQueue = [], achShowing = false
function checkAchievements() {
  const unlocked = achievements().filter(a => a.u).map(a => a.name)
  const seen = state.prefs.achSeen
  if (!Array.isArray(seen)) { setPrefs({ achSeen: unlocked }); return } // first run: no flood
  const fresh = achievements().filter(a => a.u && !seen.includes(a.name))
  if (!fresh.length) return
  setPrefs({ achSeen: [...seen, ...fresh.map(a => a.name)] })
  achQueue.push(...fresh)
  if (!achShowing) nextAch()
}
function nextAch() {
  const a = achQueue.shift()
  if (!a) { achShowing = false; return }
  achShowing = true
  const el = document.createElement('button')
  el.className = 'ach-pop'
  el.innerHTML = `<span class="ach-icon">${a.icon}</span><span><em>Achievement unlocked</em><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></span>`
  document.body.append(el)
  requestAnimationFrame(() => el.classList.add('show'))
  const done = () => { el.classList.remove('show'); setTimeout(() => { el.remove(); nextAch() }, 300) }
  el.onclick = () => { done(); state.view = 'progress'; state.ui.ptab = 'awards'; render() }
  setTimeout(done, 4200)
}

// ── Rendering ──
const NAV = [
  { view: 'today', label: 'Today', icon: 'home' },
  { view: 'history', label: 'History', icon: 'history' },
  { view: 'progress', label: 'Progress', icon: 'chart' },
  { view: 'body', label: 'Body', icon: 'scale' },
  { view: 'routine', label: 'Routine', icon: 'list' },
  { view: 'exercises', label: 'Exercises', icon: 'book' },
  { view: 'settings', label: 'Settings', icon: 'settings' },
]
const TITLES = { today: 'Today', progress: 'Progress', body: 'Body', routine: 'Routine', exercises: 'Exercises', settings: 'Settings' }
const viewTitle = () => state.view === 'settings' && isPhone() ? 'More' : state.view === 'history' ? 'History' : TITLES[state.view]

function content() {
  const phone = isPhone()
  switch (state.view) {
    case 'history': return renderHistory({ isPhone: phone })
    case 'progress': return renderProgress({ isPhone: phone })
    case 'body': return renderBody()
    case 'routine': return renderRoutine()
    case 'exercises': return renderExercises()
    case 'settings': return renderSettings({ isPhone: phone })
    default: return renderToday({ isPhone: phone })
  }
}

function syncIcon() {
  const s = state.sync
  const cls = s.syncing ? ' spinning' : s.error ? ' failed' : s.pending ? ' pending' : ''
  return `<button class="sync-btn${cls}" data-act="sync" title="${esc(syncLine())}" aria-label="${esc(syncLine())}">${icon(s.error && !s.syncing ? 'cloudOff' : 'sync', 16)}${s.pending ? `<b>${s.pending}</b>` : ''}<span class="sync-text">${esc(s.syncing ? 'Syncing…' : s.error ? 'Offline' : s.pending ? 'Waiting' : 'Synced')}</span></button>`
}
function paintSync() {
  for (const el of root.querySelectorAll('.sync-btn')) el.outerHTML = syncIcon()
}

function liveBar() {
  const l = liveSummary()
  if (!l || workoutOpen()) return ''
  return `<button class="live-bar" data-act="resume"><span class="live-dot"></span><b>${esc(l.title)}</b><span class="wk-clock">${clock((Date.now() - l.startedAt) / 1000)}</span><span class="live-go">Resume ${icon('right', 16)}</span></button>`
}

function desktopShell() {
  const live = liveDraft()
  return `
    <div class="shell desktop">
      <aside class="sidebar">
        <div class="brand">${logo()}<span>Iron Log</span></div>
        <button class="btn primary block new-btn" data-act="${live ? 'resume' : 'start-sheet'}">${icon('play', 18)} ${live ? 'Resume workout' : 'Start workout'}</button>
        <nav>
          ${NAV.map(n => `<button class="nav-item${state.view === n.view ? ' on' : ''}" data-act="nav" data-view="${n.view}">${icon(n.icon, 18)}<span>${n.label}</span></button>`).join('')}
        </nav>
        <div class="sidebar-foot">${syncIcon()}<p class="version">v${__APP_VERSION__}</p></div>
      </aside>
      <main class="main">
        <header class="topbar">
          <h1>${esc(viewTitle())}</h1>
          <div class="topbar-right">${state.view === 'history' ? `<button class="btn soft small" data-act="log-day" data-date="${today()}">${icon('plus', 15)} Log past session</button>` : ''}</div>
        </header>
        ${liveBar()}
        <div class="content view-${state.view}">${content()}</div>
      </main>
    </div>`
}

function phoneShell() {
  const live = liveDraft()
  const tabs = [
    { view: 'today', label: 'Today', icon: 'home' },
    { view: 'history', label: 'History', icon: 'history' },
    { add: true },
    { view: 'progress', label: 'Progress', icon: 'chart' },
    { view: 'settings', label: 'More', icon: 'more', also: ['body', 'routine', 'exercises'] },
  ]
  const back = ['body', 'routine', 'exercises'].includes(state.view)
  return `
    <div class="shell phone">
      <header class="phone-top">
        ${back ? `<button class="icon-btn" data-act="nav" data-view="settings" aria-label="Back">${icon('left')}</button>` : ''}
        ${state.view === 'today' ? `<div class="brand">${logo()}<span>Iron Log</span></div>` : `<h1>${esc(viewTitle())}</h1>`}
        <div class="phone-top-right">${syncIcon()}</div>
      </header>
      <main class="content view-${state.view}">${content()}</main>
      ${liveBar()}
      <nav class="tabbar">
        ${tabs.map(t => t.add
          ? `<button class="tab-add${live ? ' live' : ''}" data-act="${live ? 'resume' : 'start-sheet'}" aria-label="${live ? 'Resume workout' : 'Start workout'}">${icon(live ? 'timer' : 'play', 26)}</button>`
          : `<button class="tab${state.view === t.view || t.also?.includes(state.view) ? ' on' : ''}" data-act="nav" data-view="${t.view}">${icon(t.icon, 22)}<span>${t.label}</span></button>`).join('')}
      </nav>
    </div>`
}

function render() {
  if (!state.loaded) return
  const active = document.activeElement
  const focusKey = active?.dataset?.input
  const caret = focusKey ? active.selectionStart : null
  const scroller = isPhone() ? document.scrollingElement : root.querySelector('.content')
  const keep = render.lastView === state.view ? scroller?.scrollTop || 0 : 0
  resetCharts()
  root.innerHTML = isPhone() ? phoneShell() : desktopShell()
  render.lastView = state.view
  const sc = isPhone() ? document.scrollingElement : root.querySelector('.content')
  if (sc) sc.scrollTop = keep
  if (focusKey) {
    const inp = root.querySelector(`[data-input="${focusKey}"]`)
    if (inp) { inp.focus(); try { inp.setSelectionRange(caret, caret) } catch {} }
  }
}
PHONE.addEventListener('change', render)

function setView(view) {
  state.view = view
  render()
  ;(isPhone() ? document.scrollingElement : root.querySelector('.content'))?.scrollTo(0, 0)
}

const afterSave = () => { render(); setTimeout(checkAchievements, 600) }
initWorkout({ rerender: render, afterSave })

// ── Start sheet ──
function startSheet() {
  const r = routine()
  const todayDay = r.days.find(d => d.dow === new Date().getDay())
  const recent = sortedSessions().slice(0, 3)
  const m = openModal(`
    <header class="modal-head"><h2>Start a workout</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></header>
    <div class="modal-body">
      <div class="start-days">
        ${sortedDays(r).map(d => `<button type="button" class="start-day${d === todayDay ? ' today' : ''}" style="--c:${programColor(d.program)}" data-s="day" data-id="${esc(d.id)}">
          <b>${esc(d.name)}</b><span>${d === todayDay ? 'Today' : d.dow != null ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.dow] : 'Any day'} · ${d.exercises.length} exercises</span></button>`).join('')}
      </div>
      ${recent.length ? `<p class="field-label">Repeat a recent one</p><div class="list">${recent.map(s => `<button type="button" class="srow" style="--c:${programColor(s.program)}" data-s="repeat" data-id="${esc(s.id)}"><span class="srow-bar"></span><span class="srow-main"><span class="srow-top"><b>${esc(relDay(s.date))}</b><span class="srow-prog">${esc(s.program)}</span></span><span class="srow-ex">${esc(s.exercises.map(e => e.name).join(' · '))}</span></span></button>`).join('')}</div>` : ''}
      <div class="row-gap">
        <button type="button" class="btn soft" data-s="empty">${icon('plus', 16)} Empty workout</button>
        <button type="button" class="btn ghost" data-s="past">${icon('calendar', 16)} Log a past session</button>
      </div>
    </div>`)
  m.el.addEventListener('click', e => {
    const b = e.target.closest('[data-s]')
    if (!b) return
    m.close(true)
    const k = b.dataset.s
    if (k === 'day') startWorkout({ dayId: b.dataset.id })
    else if (k === 'repeat') startWorkout({ fromSessionId: b.dataset.id })
    else if (k === 'empty') startWorkout({})
    else newSession(today())
  })
}

// ── Interaction (one delegated handler) ──
root.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]')
  if (!el || !root.contains(el) || el.type === 'checkbox') return
  const { act, id, view, date, value, name } = el.dataset
  switch (act) {
    case 'nav': return setView(view)
    case 'start': return startWorkout({ dayId: el.dataset.day })
    case 'start-sheet': return startSheet()
    case 'resume': return resume()
    case 'session': return openSessionDetail(id, { onEdit: editSession, onRepeat: sid => startWorkout({ fromSessionId: sid }), rerender: render })
    case 'log-day': return newSession(date)
    case 'htab': state.ui.htab = value; return render()
    case 'photo': return openPhoto(id, Number(el.dataset.i), { onOpenSession: () => openSessionDetail(id, { onEdit: editSession, onRepeat: sid => startWorkout({ fromSessionId: sid }), rerender: render }) })
    case 'month': {
      const cur = state.ui.month || monthStart(today())
      const next = addMonths(cur, Number(el.dataset.v))
      if (next > monthStart(today())) return
      state.ui.month = next
      return render()
    }
    case 'ptab': state.ui.ptab = value; return render()
    case 'exercise': state.ui.exercise = name || null; state.ui.exAll = false; if (state.view !== 'progress') { state.view = 'progress'; state.ui.ptab = 'exercises' } render(); if (isPhone()) window.scrollTo(0, 0); return
    case 'ex-range': state.ui.exRange = value; return render()
    case 'ex-all': state.ui.exAll = true; return render()
    case 'bw-range': state.ui.bwRange = value; return render()
    case 'bw-all': state.ui.bwAll = true; return render()
    case 'bw-del': {
      const entry = state.bwLog.find(b => b.date === date)
      blobOp('iron_bwlog', { type: 'remove', key: date })
      render()
      return toast('Weight deleted', { label: 'Undo', run: () => { blobOp('iron_bwlog', { type: 'upsert', item: entry }); render() } })
    }
    case 'ci-effort': case 'ci-recovery':
      state.ui.ci[act === 'ci-effort' ? 'effort' : 'recovery'] = Number(value)
      return render()
    case 'ci-save': {
      const ci = state.ui.ci
      if (!ci.effort || !ci.recovery) return toast('Rate effort and recovery first')
      const old = state.checkins.find(c => c.weekStart === ci.ws)
      blobOp('iron_checkins', { type: 'upsert', item: { id: old?.id || `ci-${ci.ws}`, weekStart: ci.ws, effort: ci.effort, recovery: ci.recovery, notes: (ci.notes || '').trim(), savedAt: today() } })
      render()
      setTimeout(checkAchievements, 400)
      return toast('Check-in saved ✓')
    }
    case 'day-edit': return editDay(id, render)
    case 'day-new': return editDay(null, render)
    case 'routine-reset': return resetRoutine(render)
    case 'lib-new': return editExercise(null, render)
    case 'lib-edit': return editExercise(name, render)
    case 'lib-m': state.ui.libm = value; return render()
    case 'rest': setPrefs({ restSecs: Number(value) }); return render()
    case 'theme': saveDevice({ theme: value }); applyTheme(value); return render()
    case 'import-hevy': return importHevy(render)
    case 'import-backup': return importBackup(render)
    case 'export-json': return exportBackup()
    case 'export-csv': return exportCsv()
    case 'export-hevy': return exportForHevy()
    case 'sync': await flush(); return load()
    case 'update': return window.electronAPI?.checkForUpdates()
    case 'signout': await signOut(); return
    case 'copy-sql': navigator.clipboard.writeText(PREFS_SQL).then(() => toast('SQL copied')); return
    case 'reload': return load()
    case 'copy-photo-sql': navigator.clipboard.writeText(PHOTOS_SQL).then(() => toast('SQL copied')); return
  }
})

root.addEventListener('change', e => {
  const act = e.target.dataset?.act
  if (act === 'sound' || act === 'wake') saveDevice({ [act]: e.target.checked })
})

root.addEventListener('submit', e => {
  const form = e.target.closest('[data-form]')
  if (!form) return
  e.preventDefault()
  const w = parseFloat(String(form.elements.w.value).replace(',', '.'))
  if (!(w >= 30 && w <= 250)) { form.elements.w.focus(); return toast('Enter your weight in kg') }
  const d = form.elements.d?.value || today()
  blobOp('iron_bwlog', { type: 'upsert', item: { date: d, weight: Math.round(w * 10) / 10, note: '' } })
  render()
  toast(`Logged ${fmtKg(w)} kg`)
  setTimeout(checkAchievements, 400)
})

let inputTimer
root.addEventListener('input', e => {
  if (e.target.classList.contains('ci-notes')) { state.ui.ci.notes = e.target.value; return }
  const k = e.target.dataset.input
  if (!k) return
  state.ui[k] = e.target.value
  clearTimeout(inputTimer)
  inputTimer = setTimeout(render, 140)
})

// Desktop shortcuts.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeTopModal(); return }
  const typing = e.target.closest('input, textarea, select, [contenteditable]')
  if (typing || modalOpen() || e.ctrlKey || e.metaKey || e.altKey || !state.loaded) return
  const keys = {
    n: () => liveDraft() ? resume() : startSheet(),
    '1': () => setView('today'), '2': () => setView('history'), '3': () => setView('progress'),
    '4': () => setView('body'), '5': () => setView('routine'), '6': () => setView('exercises'),
  }
  const fn = keys[e.key]
  if (fn) { e.preventDefault(); fn() }
})

// iOS ignores user-scalable=no; block pinch zoom like Coin does.
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, e => e.preventDefault(), { passive: false })

initUpdateReload({ isBusy: () => modalOpen() || !!liveDraft() })
boot()

// Keep relative times honest on a window left open.
setInterval(() => { if (state.loaded && !modalOpen() && document.visibilityState === 'visible' && !document.activeElement?.closest('input,textarea')) render() }, 5 * 60_000)

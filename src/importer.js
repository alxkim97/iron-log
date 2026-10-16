// Imports (HEVY CSV, Iron Log backup JSON) and exports (JSON backup, CSV).
import { openModal, esc, icon, toast, pickFile, download } from './ui.js'
import { state, saveSessions, blobOp, sessionById, isCardio } from './store.js'
import { parseHevy, planImport, toStrongCsv } from './hevy.js'
import { fullDate, today, addDays } from './dates.js'
import { normalizeSession } from './model.js'

const readText = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(f) })

function preview(title, lines, okLabel, onOk) {
  const m = openModal(`
    <header class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></header>
    <div class="modal-body"><ul class="import-list">${lines.filter(Boolean).map(l => `<li>${l}</li>`).join('')}</ul></div>
    <footer class="modal-foot"><span></span><div class="row-gap"><button type="button" class="btn ghost" data-close>Cancel</button>${okLabel ? `<button type="button" class="btn primary" data-ok>${esc(okLabel)}</button>` : ''}</div></footer>`)
  m.el.querySelector('[data-ok]')?.addEventListener('click', () => { onOk(); m.close(true) })
}

export async function importHevy(rerender) {
  const f = await pickFile('.csv,text/csv')
  if (!f) return
  let parsed
  try { parsed = parseHevy(await readText(f)) } catch (e) { return toast(e.message) }
  if (!parsed.workouts.length) return toast('No workouts found in that file')
  const plan = planImport(parsed, state.sessions, state.bwLog)
  const range = plan.add.length ? `${fullDate(plan.add[0].date)} – ${fullDate(plan.add.at(-1).date)}` : ''
  const nothing = !plan.add.length && !plan.fixDates.length && !plan.weights.length
  preview('Import from HEVY', [
    `<b>${parsed.workouts.length}</b> workouts in the file.`,
    plan.add.length ? `<b>${plan.add.length}</b> new — ${esc(range)}.` : 'No new workouts.',
    plan.same ? `${plan.same} already in Iron Log.` : '',
    plan.fixDates.length ? `<b>${plan.fixDates.length}</b> earlier HEVY imports were filed a day early (v1 used UTC for 6am workouts) — they'll be moved to the right day.` : '',
    plan.dupes ? `${plan.dupes} skipped — a session you logged by hand that day already covers them.` : '',
    plan.weights.length ? `${plan.weights.length} body weights from workout descriptions.` : '',
  ], nothing ? null : 'Import', () => {
    const fixed = plan.fixDates.map(f => ({ ...sessionById(f.id), date: f.to }))
    saveSessions([...plan.add, ...fixed])
    for (const w of plan.weights) blobOp('iron_bwlog', { type: 'upsert', item: w })
    rerender()
    toast(`Imported ${plan.add.length} workout${plan.add.length === 1 ? '' : 's'}${fixed.length ? ` · fixed ${fixed.length} dates` : ''}`)
  })
}

// v1's ironlog-data.json (or a v2 backup): adds what's missing, never overwrites.
export async function importBackup(rerender) {
  const f = await pickFile('.json,application/json')
  if (!f) return
  let data
  try { data = JSON.parse(await readText(f)) } catch { return toast("That file isn't valid JSON") }
  if (!Array.isArray(data?.sessions)) return toast("That doesn't look like an Iron Log backup")
  const have = new Set(state.sessions.map(s => s.id))
  const add = data.sessions.filter(s => s?.id && s.date && !have.has(s.id)).map(normalizeSession)
  const bwHave = new Set(state.bwLog.map(b => b.date))
  const bw = (data.bwLog || []).filter(b => b?.date && b.weight && !bwHave.has(b.date))
  const ciHave = new Set(state.checkins.map(c => c.weekStart))
  const ci = (data.checkins || []).filter(c => c?.weekStart && !ciHave.has(c.weekStart))
  const libHave = new Set(state.userLib.map(e => String(e.name).toLowerCase()))
  const lib = (data.exerciseLib || []).filter(e => e?.name && !libHave.has(e.name.toLowerCase()))
  preview('Import backup', [
    `<b>${data.sessions.length}</b> sessions in the file, <b>${add.length}</b> not in Iron Log yet.`,
    bw.length ? `${bw.length} body weights.` : '',
    ci.length ? `${ci.length} weekly check-ins.` : '',
    lib.length ? `${lib.length} exercise library entries.` : '',
    'Nothing already here gets changed.',
  ], add.length || bw.length || ci.length || lib.length ? 'Import' : null, () => {
    if (add.length) saveSessions(add)
    for (const b of bw) blobOp('iron_bwlog', { type: 'upsert', item: b })
    for (const c of ci) blobOp('iron_checkins', { type: 'upsert', item: c })
    for (const e of lib) blobOp('iron_exerciselib', { type: 'upsert', item: e })
    rerender()
    toast(`Imported ${add.length} sessions`)
  })
}

export function exportBackup() {
  const out = {
    app: 'iron-log', version: __APP_VERSION__, exportedAt: new Date().toISOString(),
    sessions: state.sessions, bwLog: state.bwLog, checkins: state.checkins, exerciseLib: state.userLib, prefs: state.prefs,
  }
  download(`Iron Log backup ${today()}.json`, JSON.stringify(out, null, 1))
}

export function exportCsv() {
  const q = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)
  const rows = [['date', 'program', 'duration_min', 'exercise', 'set', 'type', 'weight_kg', 'reps', 'note']]
  for (const s of [...state.sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const e of s.exercises) e.sets.forEach((x, i) => rows.push([s.date, s.program, s.duration || '', e.name, i + 1, x.type, x.weight, x.reps, i === 0 ? e.note || '' : '']))
  }
  download(`Iron Log sets ${today()}.csv`, rows.map(r => r.map(q).join(',')).join('\n'), 'text/csv')
}

// Back to HEVY: workouts in a date range as a Strong-format CSV. Defaults to
// everything after the last workout that came from HEVY, so nothing goes
// back that HEVY already has.
export function exportForHevy() {
  const fromHevy = state.sessions.filter(s => s.source === 'hevy' || s.hevyStart).map(s => s.date).sort()
  const from0 = fromHevy.length ? addDays(fromHevy.at(-1), 1) : addDays(today(), -30)
  const m = openModal(`
    <header class="modal-head"><h2>Export for HEVY</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></header>
    <div class="modal-body">
      <p class="muted small">Makes a Strong-format CSV with HEVY's exercise names. In HEVY: Profile → Settings → Export &amp; Import → Import data, then pick this file.</p>
      <div class="field-row">
        <label class="field">From<input type="date" name="from" value="${from0}" max="${today()}"></label>
        <label class="field">To<input type="date" name="to" value="${today()}" max="${today()}"></label>
      </div>
      <p class="hx-count muted"></p>
    </div>
    <footer class="modal-foot"><span></span><div class="row-gap"><button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn primary" data-ok>${icon('download', 16)} Download</button></div></footer>`)
  const pick = () => {
    const from = m.el.querySelector('[name=from]').value, to = m.el.querySelector('[name=to]').value
    return state.sessions.filter(s => s.date >= from && s.date <= to)
  }
  const count = () => { const n = pick().length; m.el.querySelector('.hx-count').textContent = `${n} workout${n === 1 ? '' : 's'} in this range${fromHevy.length ? ` · HEVY already has everything up to ${fullDate(fromHevy.at(-1))}` : ''}` }
  m.el.addEventListener('input', count)
  count()
  m.el.querySelector('[data-ok]').onclick = () => {
    const list = pick()
    if (!list.length) return toast('No workouts in that range')
    download(`Iron Log for HEVY ${today()}.csv`, toStrongCsv(list, isCardio), 'text/csv')
    m.close(true)
  }
}

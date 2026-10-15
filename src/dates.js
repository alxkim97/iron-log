// Dates are plain 'YYYY-MM-DD' strings in local time everywhere (they compare
// correctly as strings). Never go through toISOString() — in Bangkok that's
// UTC and shifts a 6am workout to the day before (v1's HEVY import did this).

const pad = n => String(n).padStart(2, '0')

export const toStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromStr = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const today = () => toStr(new Date())

export function addDays(s, n) {
  const d = fromStr(s)
  d.setDate(d.getDate() + n)
  return toStr(d)
}

export function addMonths(s, n) {
  const d = fromStr(s)
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  return toStr(d)
}

export const daysBetween = (a, b) => Math.round((fromStr(b) - fromStr(a)) / 86400000)
export const dow = s => fromStr(s).getDay()

// Training weeks start on Sunday (Push day) — matches v1's check-ins.
export const weekStart = s => addDays(s, -dow(s))
export const monthStart = s => s.slice(0, 8) + '01'

const fmt = opts => new Intl.DateTimeFormat('en-GB', opts)
const F = {
  wd: fmt({ weekday: 'short' }),
  wdLong: fmt({ weekday: 'long' }),
  dm: fmt({ day: 'numeric', month: 'short' }),
  dmy: fmt({ day: 'numeric', month: 'short', year: 'numeric' }),
  my: fmt({ month: 'long', year: 'numeric' }),
  mShort: fmt({ month: 'short' }),
  long: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
}
export const weekday = s => F.wd.format(fromStr(s))
export const weekdayLong = s => F.wdLong.format(fromStr(s))
export const shortDate = s => (s.slice(0, 4) === today().slice(0, 4) ? F.dm : F.dmy).format(fromStr(s))
export const fullDate = s => F.dmy.format(fromStr(s))
export const monthYear = s => F.my.format(fromStr(s))
export const monthShort = s => F.mShort.format(fromStr(s))
export const longDate = s => F.long.format(fromStr(s))
export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// "Today", "Yesterday", "Mon", or "12 Oct" — whichever reads fastest.
export function relDay(s) {
  const diff = daysBetween(today(), s)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  if (diff < -1 && diff > -7) return weekday(s)
  return shortDate(s)
}

export function agoDays(s) {
  const d = daysBetween(s, today())
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 14) return `${d}d ago`
  if (d < 60) return `${Math.round(d / 7)}w ago`
  return `${Math.round(d / 30)}mo ago`
}

export function timeAgo(iso) {
  if (!iso) return 'never'
  const s = Math.round((Date.now() - new Date(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export const clock = secs => {
  secs = Math.max(0, Math.round(secs))
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

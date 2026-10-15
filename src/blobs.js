// Per-user "blob" tables (one jsonb row per user, v1's layout). Edits are
// operations replayed on the freshest copy, so the phone and the desktop
// can both add entries without overwriting each other.
export const BLOB_KEYS = {
  iron_bwlog: x => x.date,
  iron_checkins: x => x.weekStart,
  iron_exerciselib: x => String(x.name || '').trim().toLowerCase(),
}

export function applyBlobOp(table, data, op) {
  if (op.type === 'merge') return { ...(data && typeof data === 'object' && !Array.isArray(data) ? data : {}), ...op.patch }
  const key = BLOB_KEYS[table]
  const arr = Array.isArray(data) ? data : []
  if (op.type === 'upsert') {
    const k = key(op.item)
    const rest = arr.filter(x => key(x) !== k && !(op.replaces && key(x) === op.replaces))
    return [...rest, op.item]
  }
  if (op.type === 'remove') return arr.filter(x => key(x) !== op.key)
  return arr
}

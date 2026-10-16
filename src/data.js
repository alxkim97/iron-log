// Supabase access. Tables are v1's (lifelog project), plus iron_prefs:
//   iron_sessions    one row per session: user_id, session_id, data jsonb
//   iron_bwlog / iron_checkins / iron_exerciselib / iron_prefs
//                    one row per user: user_id, data jsonb
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from './config.js'

export const supa = isConfigured() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null

// ── Auth ──
export const getSession = async () => (await supa.auth.getSession()).data.session
export const onAuthChange = cb => supa.auth.onAuthStateChange((_e, session) => cb(session))
export async function signIn(email, password) {
  const { error } = await supa.auth.signInWithPassword({ email, password })
  if (error) throw error
}
export async function signUp(email, password) {
  const { data, error } = await supa.auth.signUp({ email, password })
  if (error) throw error
  return data
}
export const signOut = () => supa.auth.signOut()

const uid = async () => {
  const s = await getSession()
  if (!s) throw new Error('Signed out')
  return s.user.id
}
// Table not created yet (iron_prefs before its SQL is run).
export const isMissingTable = e => ['42P01', 'PGRST205', 'PGRST106'].includes(e?.code) || /does not exist|could not find the table/i.test(e?.message || '')

// ── Sessions ──
export async function fetchSessions() {
  const user = await uid()
  const out = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supa.from('iron_sessions').select('session_id,data')
      .eq('user_id', user).order('session_id').range(start, start + 999)
    if (error) throw error
    for (const r of data) if (r.data) out.push({ ...r.data, id: r.session_id })
    if (data.length < 1000) break
  }
  return out
}

export async function putSessions(sessions) {
  if (!sessions.length) return
  const user = await uid()
  const at = new Date().toISOString()
  for (let i = 0; i < sessions.length; i += 200) {
    const rows = sessions.slice(i, i + 200).map(s => ({ user_id: user, session_id: s.id, data: s, updated_at: at }))
    const { error } = await supa.from('iron_sessions').upsert(rows, { onConflict: 'user_id,session_id' })
    if (error) throw error
  }
}

export async function deleteSessions(ids) {
  if (!ids.length) return
  const user = await uid()
  const { error } = await supa.from('iron_sessions').delete().eq('user_id', user).in('session_id', ids)
  if (error) throw error
}

// ── Blobs ──
export async function readBlob(table) {
  const user = await uid()
  const { data, error } = await supa.from(table).select('data').eq('user_id', user).maybeSingle()
  if (error) throw error
  return data?.data ?? null
}

export async function writeBlob(table, value) {
  const user = await uid()
  const { error } = await supa.from(table).upsert({ user_id: user, data: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw error
}

// ── Photos (Storage bucket iron-photos, files under <user id>/<session id>/) ──
const BUCKET = 'iron-photos'
export const isMissingBucket = e => /bucket not found/i.test(e?.message || '')
export async function uploadPhoto(path, blob) {
  const { error } = await supa.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error
}
export async function photoUrls(paths) {
  const { data, error } = await supa.storage.from(BUCKET).createSignedUrls(paths, 3600)
  if (error) throw error
  return Object.fromEntries(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]))
}
export async function deletePhotos(paths) {
  const { error } = await supa.storage.from(BUCKET).remove(paths)
  if (error) throw error
}

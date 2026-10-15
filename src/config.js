// The shared "lifelog" Supabase project (NutriLog, Coin, v1 Iron Log). The
// key is the public publishable key — rows are locked to their owner by RLS.
export const SUPABASE_URL = 'https://jpsisvaprkrcyvwnmasb.supabase.co'
export const SUPABASE_ANON_KEY = 'sb_publishable_O7OGGWVTjMkfCMoMFc9Ofw_t6lUw7Zw'

export const isConfigured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY)

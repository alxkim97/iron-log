// Run this yourself, in your own terminal — not through Claude. Sign in as
// the HELPER account (Settings → Claude access), never your own: it saves
// that account's session (refresh token) to .iron-session.json so Claude can
// use scripts/iron-claude.js without ever seeing a password. What the helper
// may do is enforced by the database, per the switches in Settings.
//
// Usage:
//   node scripts/save-session.js
//   (prompts for email, then password with hidden input — nothing is echoed
//   or left in shell history)
//
// Refuses to save an account that has its own workouts (i.e. your main one).
// .iron-session.json is gitignored. Delete it, or Disconnect the helper in
// Settings, to revoke access.

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import readline from 'readline'
import { SUPABASE_URL as SUPA_URL, SUPABASE_ANON_KEY as SUPA_KEY } from '../src/config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SESSION_PATH = join(__dirname, '..', '.iron-session.json')


function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()) }))
}

function promptHidden(question) {
  return new Promise(resolve => {
    const stdin = process.stdin
    process.stdout.write(question)
    stdin.resume()
    stdin.setRawMode(true)
    stdin.setEncoding('utf8')
    let value = ''
    const onData = (char) => {
      if (char === '\r' || char === '\n' || char === '\u0004') {
        stdin.setRawMode(false)
        stdin.pause()
        stdin.removeListener('data', onData)
        process.stdout.write('\n')
        resolve(value)
      } else if (char === '\u0003') {
        process.exit(1)
      } else if (char === '\u007f' || char === '\b') {
        value = value.slice(0, -1)
      } else {
        value += char
      }
    }
    stdin.on('data', onData)
  })
}

async function main() {
  const email = await prompt('Email: ')
  const password = await promptHidden('Password: ')
  if (!email || !password) {
    console.error('Email and password are required.')
    process.exit(1)
  }

  const supa = createClient(SUPA_URL, SUPA_KEY)
  const { data, error } = await supa.auth.signInWithPassword({ email, password })
  if (error) throw error

  // safety: the helper account logs no workouts of its own
  const { data: own, error: ownErr } = await supa.from('iron_sessions').select('session_id').eq('user_id', data.user.id).limit(1)
  if (ownErr) throw ownErr
  if (own.length) {
    await supa.auth.signOut()
    console.error(`${data.user.email} has its own workouts — that looks like your main account. Not saved.`)
    console.error('Sign in with the separate helper account instead (Settings → Claude access).')
    process.exit(1)
  }
  const { data: grants } = await supa.from('iron_delegates').select('owner_id').eq('delegate_id', data.user.id)
  if (!grants?.length) console.warn('Note: this account is not connected yet — enter its email in Settings → Claude access.')

  writeFileSync(SESSION_PATH, JSON.stringify({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    saved_at: new Date().toISOString(),
    email: data.user.email,
  }, null, 2))

  console.log(`Signed in as ${data.user.email}. Session saved to ${SESSION_PATH}`)
  console.log('Claude can now act as this helper account, limited to what Settings → Claude access allows.')
}

main().catch(e => {
  console.error('Sign-in failed:', e.message || e)
  process.exit(1)
})

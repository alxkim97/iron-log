import { signIn, signUp } from '../data.js'
import { esc } from '../ui.js'

export const logo = cls => `<span class="logo ${cls || ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg></span>`

const shell = inner => `
  <div class="auth">
    <div class="auth-card">
      <div class="brand big">${logo()}<span>Iron Log</span></div>
      ${inner}
    </div>
  </div>`

export function renderAuth(root) {
  let mode = 'in'
  const draw = (msg = '') => {
    root.innerHTML = shell(`
      <p class="auth-sub">Same account as v1 — your history is already there.</p>
      <form class="auth-form">
        <label>Email<input name="email" type="email" autocomplete="email" required></label>
        <label>Password<input name="password" type="password" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}" minlength="6" required></label>
        ${msg ? `<p class="auth-msg">${esc(msg)}</p>` : ''}
        <button class="btn primary block" type="submit">${mode === 'in' ? 'Sign in' : 'Create account'}</button>
      </form>
      <button class="link" data-toggle>${mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}</button>`)
    root.querySelector('[data-toggle]').onclick = () => { mode = mode === 'in' ? 'up' : 'in'; draw() }
    root.querySelector('form').onsubmit = async e => {
      e.preventDefault()
      const f = new FormData(e.target)
      e.target.querySelector('button[type=submit]').disabled = true
      try {
        if (mode === 'in') await signIn(f.get('email'), f.get('password'))
        else {
          const r = await signUp(f.get('email'), f.get('password'))
          if (!r.session) { mode = 'in'; draw('Check your email to confirm the account, then sign in.') }
        }
      } catch (err) { draw(err.message || 'Something went wrong') }
    }
  }
  draw()
}

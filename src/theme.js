// 'system' leaves data-theme off so the prefers-color-scheme block applies.
export function applyTheme(mode) {
  const el = document.documentElement
  if (mode === 'light' || mode === 'dark') el.setAttribute('data-theme', mode)
  else el.removeAttribute('data-theme')
  const dark = mode === 'dark' || (mode !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#141117' : '#faf7f5')
}

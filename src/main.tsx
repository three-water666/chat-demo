import { createRoot } from 'react-dom/client'
import { App } from './app/App.js'
import { setupTheme } from './app/theme.js'
import { ensureKatex } from './services/markdown/katex.js'
import './app/theme.css'
import './app/global.css'

const favicon =
  document.querySelector<HTMLLinkElement>('link[rel="icon"]') ??
  document.head.appendChild(document.createElement('link'))
favicon.rel = 'icon'
favicon.type = 'image/png'
favicon.href = new URL('./xunwen-favicon.png', import.meta.url).href

ensureKatex()
setupTheme()

createRoot(document.getElementById('root') as HTMLElement).render(<App />)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// fonts are bundled with the app (no requests to font servers, and they work offline)
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import '@fontsource/atkinson-hyperlegible/latin-400.css'
import '@fontsource/atkinson-hyperlegible/latin-700.css'
import '@fontsource/caveat/latin-600.css'
import '@fontsource/dancing-script/latin-600.css'
import '@fontsource/great-vibes/latin-400.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

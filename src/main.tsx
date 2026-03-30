import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

// ストレージ永続化を要求（ブラウザの自動削除を防ぐ）
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then(granted => {
    if (!granted) {
      console.warn('Storage persistence not granted. Data may be evicted by the browser.')
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { IconContext } from '@phosphor-icons/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/outfit/latin-400.css'
import '@fontsource/outfit/latin-500.css'
import '@fontsource/outfit/latin-600.css'
import '@fontsource/outfit/latin-700.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-700.css'
import '../index.css'
import '../App.css'
import '../replay/pages/AppGraphsPanel.css'
import './replay-shell.css'
import './replay-theme.css'
import { LocalReplayApp } from './LocalReplayApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IconContext.Provider value={{ weight: 'bold' }}>
      <LocalReplayApp />
    </IconContext.Provider>
  </StrictMode>,
)

import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import './ui/styles.css'
import { useStore } from './state/store'
;(window as any).__manoever = useStore   // dev hook for debugging / automation

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)

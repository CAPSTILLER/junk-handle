import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { OwnerPage } from './OwnerPage'
import '../index.css'
import './owner.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OwnerPage />
  </StrictMode>,
)

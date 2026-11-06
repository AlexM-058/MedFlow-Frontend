import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/base.css'
import './styles/buttons.css'
import './styles/app.css'
import App from './App.tsx'
import { applyBrand } from './brand/applyBrand'
import { brand } from './brand/brand.config'

applyBrand(brand)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

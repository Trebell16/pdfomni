import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

const app = (
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)

const root = document.getElementById('root')
document.querySelectorAll('.prerendered-seo').forEach((node) => node.remove())
createRoot(root).render(app)

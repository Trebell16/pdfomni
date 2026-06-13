import { useEffect, useRef } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import Home from './pages/Home'
import ToolPage from './pages/ToolPage'
import WorkflowPage from './pages/WorkflowPage'
import ToolPageAlias from './pages/ToolPageAlias'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsOfService from './pages/TermsOfService'
import ContactPage from './pages/ContactPage'
import AboutPage from './pages/AboutPage'
import ErrorPage from './pages/ErrorPage'

function EditPdfWrapper() {
  return (
    <iframe
      src="/editpdf.html"
      style={{
        width: '100vw',
        height: '100vh',
        border: 'none',
        display: 'block',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 9999,
        margin: 0,
        padding: 0,
      }}
      title="PDF Editor"
    />
  )
}

export default function App() {
  const location = useLocation()
  const hasTrackedInitialPage = useRef(false)

  useEffect(() => {
    if (!hasTrackedInitialPage.current) {
      hasTrackedInitialPage.current = true
      return
    }

    const pagePath = `${location.pathname}${location.search}`
    const timer = window.setTimeout(() => {
      if (typeof window.gtag === 'function') {
        window.gtag('config', 'G-TSWLYFYBM8', {
          page_path: pagePath,
          page_title: document.title,
        })
      }
    }, 0)

    return () => window.clearTimeout(timer)
  }, [location.pathname, location.search])

  useEffect(() => {
    const toolPagePaths = new Set([
      '/merge', '/split', '/reorder', '/compress', '/rotate', '/page-numbers',
      '/word-to-pdf', '/excel-to-pdf', '/image-to-pdf', '/html-to-pdf',
      '/pdf-to-image', '/pdf-to-text', '/watermark', '/redact', '/crop',
      '/protect', '/unlock', '/sign', '/batch', '/wcag-check',
    ])
    const shouldFocusToolHeader = toolPagePaths.has(location.pathname) || location.pathname.startsWith('/tool/')

    if (!shouldFocusToolHeader || ['/tool/edit', '/tool/draw', '/tool/image-edit'].includes(location.pathname)) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      return undefined
    }

    const timer = window.setTimeout(() => {
      const toolPage = document.querySelector('.tool-page')
      if (!toolPage) {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
        return
      }
      const headerHeight = document.getElementById('header')?.offsetHeight || 0
      window.scrollTo({
        top: Math.max(0, toolPage.getBoundingClientRect().top + window.scrollY - headerHeight - 16),
        left: 0,
        behavior: 'auto',
      })
    }, 0)

    return () => window.clearTimeout(timer)
  }, [location.pathname])

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tool/edit" element={<EditPdfWrapper />} />
        <Route path="/tool/draw" element={<EditPdfWrapper />} />
        <Route path="/tool/image-edit" element={<EditPdfWrapper />} />
        <Route path="/tool/:toolId" element={<ToolPage />} />
        <Route path="/merge" element={<ToolPageAlias toolId="merge" />} />
        <Route path="/split" element={<ToolPageAlias toolId="split" />} />
        <Route path="/reorder" element={<ToolPageAlias toolId="reorder" />} />
        <Route path="/compress" element={<ToolPageAlias toolId="compress" />} />
        <Route path="/rotate" element={<ToolPageAlias toolId="rotate" />} />
        <Route path="/page-numbers" element={<ToolPageAlias toolId="page-numbers" />} />
        <Route path="/word-to-pdf" element={<ToolPageAlias toolId="word-to-pdf" />} />
        <Route path="/excel-to-pdf" element={<ToolPageAlias toolId="excel-to-pdf" />} />
        <Route path="/image-to-pdf" element={<ToolPageAlias toolId="image-to-pdf" />} />
        <Route path="/html-to-pdf" element={<ToolPageAlias toolId="html-to-pdf" />} />
        <Route path="/pdf-to-image" element={<ToolPageAlias toolId="pdf-to-image" />} />
        <Route path="/pdf-to-text" element={<ToolPageAlias toolId="pdf-to-text" />} />
        <Route path="/edit-pdf" element={<EditPdfWrapper />} />
        <Route path="/watermark" element={<ToolPageAlias toolId="watermark" />} />
        <Route path="/redact" element={<ToolPageAlias toolId="redact" />} />
        <Route path="/crop" element={<ToolPageAlias toolId="crop" />} />
        <Route path="/protect" element={<ToolPageAlias toolId="encrypt" />} />
        <Route path="/unlock" element={<ToolPageAlias toolId="decrypt" />} />
        <Route path="/sign" element={<ToolPageAlias toolId="sign" />} />
        <Route path="/batch" element={<ToolPageAlias toolId="batch" />} />
        <Route path="/wcag-check" element={<ToolPageAlias toolId="wcag" />} />
        <Route path="/workflow" element={<WorkflowPage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/500" element={<ErrorPage status={500} />} />
        <Route path="*" element={<ErrorPage status={404} />} />
      </Routes>
    </Layout>
  )
}

import { Link } from 'react-router-dom'
import Seo from '../components/Common/Seo'

const errorCopy = {
  404: {
    title: 'Page Not Found',
    description: 'The PDFOmni page you are looking for could not be found.',
    heading: 'Page Not Found',
    lead: 'That page does not exist, may have moved, or was typed incorrectly.',
    body: 'You can head back to the PDFOmni home page and choose a tool from the full list. The core PDF tools still run locally in your browser, so your files stay on your device during normal document workflows.',
    canonicalPath: '/404',
  },
  500: {
    title: 'Server Error',
    description: 'PDFOmni hit an unexpected error while loading this page.',
    heading: 'Something Went Wrong',
    lead: 'The page could not be loaded correctly.',
    body: 'Please try refreshing the page or returning to the home page. If a specific PDF tool keeps failing, the contact page can be used to prepare a support email with the tool name, browser, file size, and steps that caused the problem.',
    canonicalPath: '/500',
  },
}

export default function ErrorPage({ status = 404 }) {
  const copy = errorCopy[status] || errorCopy[404]

  return (
    <div className="tool-page" id={`error-${status}-page`}>
      <Seo
        title={`${copy.title} | PDFOmni`}
        description={copy.description}
        canonicalPath={copy.canonicalPath}
        robots="noindex,follow"
      />
      <div className="container">
        <div className="tool-page-header">
          <h1 className="tool-page-title">{copy.heading}</h1>
          <p className="tool-page-desc">{copy.lead}</p>
        </div>
        <div className="card legal-card">
          <h2>Error {status}</h2>
          <p>{copy.body}</p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginTop: 'var(--space-5)' }}>
            <Link className="btn btn-primary" to="/">Go Home</Link>
            <Link className="btn btn-secondary" to="/contact">Contact Support</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

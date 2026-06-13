import Seo from '../components/Common/Seo'

export default function TermsOfService() {
  return (
    <div className="tool-page" id="terms-page">
      <Seo
        title="Terms of Service | PDFOmni"
        description="Read the terms of service for using PDFOmni's private client-side PDF tools on pdfomni.com."
        canonicalPath="/terms"
      />
      <div className="container">
        <div className="tool-page-header">
          <h1 className="tool-page-title">Terms of Service</h1>
          <p className="tool-page-desc">Use PDFOmni responsibly and only with documents you are allowed to process.</p>
        </div>
        <div className="card legal-card">
          <h2>Acceptable Use</h2>
          <p>Use PDFOmni only for lawful document processing. Do not use the site for illegal redistribution, fraud, or abuse.</p>
          <h2>No Warranty</h2>
          <p>PDFOmni is provided as-is. Always keep backups of important files before editing, compressing, or converting them.</p>
          <h2>Third-Party Services</h2>
          <p>AI assistance and analytics may rely on third-party services. Their own terms and availability may affect those features.</p>
          <h2>Content Ownership</h2>
          <p>You remain responsible for the documents and content you process with the site.</p>
        </div>
      </div>
    </div>
  )
}

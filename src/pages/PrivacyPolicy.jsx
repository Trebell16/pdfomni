import Seo from '../components/Common/Seo'

export default function PrivacyPolicy() {
  return (
    <div className="tool-page" id="privacy-page">
      <Seo
        title="Privacy Policy | PDFOmni"
        description="Read how PDFOmni handles privacy, local browser processing, and client-side PDF data on pdfomni.com."
        canonicalPath="/privacy"
      />
      <div className="container">
        <div className="tool-page-header">
          <h1 className="tool-page-title">Privacy Policy</h1>
          <p className="tool-page-desc">PDFOmni is built around local-first document processing and minimal data exposure.</p>
        </div>
        <div className="card legal-card">
          <h2>Local Processing</h2>
          <p>PDFOmni processes files inside your browser whenever possible. Uploaded PDFs, images, and converted documents stay on your device during normal tool usage.</p>
          <h2>AI Copilot</h2>
          <p>The AI sidebar keeps ingestion, chunking, retrieval, and context selection local. Only the final curated prompt and the message you send are transmitted to the selected AI provider.</p>
          <h2>Analytics and Third-Party Services</h2>
          <p>Some optional services, such as analytics or AI providers, can receive normal web request data such as IP address, browser details, and referrer. That is separate from PDF processing. The actual document bytes used by the core PDF tools stay local in your browser and are not uploaded by the PDF-processing pipeline.</p>
          <h2>Cookies and Advertising</h2>
          <p>PDFOmni may use cookies, local storage, or similar browser technologies for basic site functionality, analytics, abuse prevention, and future third-party advertising such as Google AdSense. Advertising partners can use cookies or similar signals to measure ad performance, prevent fraud, and show relevant ads according to their own privacy policies. You can manage or block cookies through your browser settings.</p>
          <h2>Contact</h2>
          <p>Questions about privacy can be sent from the contact page on this site.</p>
        </div>
      </div>
    </div>
  )
}

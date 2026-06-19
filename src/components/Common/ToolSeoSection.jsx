export default function ToolSeoSection({ tool, seo, headingLevel = 2 }) {
  const mainTerm = tool.name
  const Heading = headingLevel === 1 ? 'h1' : 'h2'

  return (
    <section className="tool-seo-section" aria-labelledby="tool-seo-heading">
      <div className="tool-seo-kicker">Private PDF workflow</div>
      <Heading id="tool-seo-heading">{seo.h1}</Heading>
      <p className="tool-seo-lead">{seo.intro}</p>

      <div className="tool-seo-grid tool-seo-steps" aria-label={`How to use ${tool.name}`}>
        {seo.steps.map((step, index) => (
          <div className="tool-seo-item" key={step}>
            <span className="tool-seo-step">{index + 1}</span>
            <p>{step}</p>
          </div>
        ))}
      </div>

      <div className="tool-seo-copy">
        <div>
          <h3>Why Use This Tool?</h3>
          <p>{seo.why}</p>
          <p>
            PDFOmni is built around zero-knowledge document handling: the browser does the work, and your original file stays on your device. That means fewer waiting screens, fewer privacy tradeoffs, and a faster path from upload area to finished download.
          </p>
          <p>
            Since the workflow does not depend on uploading the PDF first, performance is tied mostly to your device and browser instead of server queues, account limits, or network speed. That is especially useful for large PDFs, confidential files, and repeated document tasks.
          </p>
          <p>
            The result is a practical private PDF tool page with enough context to choose the right workflow and a fast interface for people who just want to finish the document.
          </p>
        </div>
        <div>
          <h3>Advanced Capabilities</h3>
          <p>{seo.advanced}</p>
          <p>
            This makes the tool useful as a standalone utility and as part of a larger document workflow when you need to prepare PDFs for email, storage, printing, review, or secure sharing.
          </p>
          <h3>Compared with Other PDF Tools</h3>
          <p>{seo.positioning}</p>
        </div>
      </div>

      <div className="tool-seo-use-cases">
        <h3>Common Use Cases</h3>
        <ul>
          {seo.useCases.map((useCase) => (
            <li key={useCase}>{useCase}</li>
          ))}
        </ul>
      </div>

      <div className="tool-seo-copy tool-seo-expanded">
        <div>
          <h3>{mainTerm} Without the Upload Tradeoff</h3>
          <p>
            Many PDF tasks are simple in theory but frustrating in practice: upload the file, wait for a remote queue, create an account, then download the result. PDFOmni keeps the {mainTerm.toLowerCase()} workflow focused on the document itself. You choose the file, the browser reads it, and the result is produced on your device.
          </p>
          <p>
            That matters for everyday files as much as it matters for confidential documents. A student preparing assignments, a freelancer handling client paperwork, a family member cleaning scanned records, or a business user working with contracts may all need a fast PDF tool, but they may not want those files copied to someone else's server.
          </p>
          <p>
            The page is also designed around larger files. PDFOmni sets a clear 500 MB per-file limit for browser tools, while actual speed still depends on your device, available memory, browser, and the complexity of the PDF. If you are working with scanned documents, image-heavy pages, or long reports, local processing avoids upload time and can feel more predictable than waiting for a remote queue.
          </p>
        </div>
        <div>
          <h3>PDFOmni vs iLovePDF</h3>
          <p>
            iLovePDF is a well-known online PDF toolkit, but its web product is built around cloud processing, account tiers, and premium upgrades. PDFOmni is different: it focuses on browser-side work, privacy, and free access. The important question is not only which button exists. It is where your file goes, what limit applies, and whether a subscription is needed for your normal workflow.
          </p>
          <div className="tool-compare-checklist" role="table" aria-label={`PDFOmni compared with iLovePDF for ${mainTerm}`}>
            <div role="row">
              <span role="columnheader">Feature</span>
              <span role="columnheader">PDFOmni</span>
              <span role="columnheader">iLovePDF web</span>
            </div>
            <div role="row">
              <span role="rowheader">Privacy Focused</span>
              <span role="cell" className="compare-mark compare-yes" aria-label="Yes" />
              <span role="cell" className="compare-mark compare-no" aria-label="No" />
            </div>
            <div role="row">
              <span role="rowheader">500 MB File Size Limit</span>
              <span role="cell" className="compare-mark compare-yes" aria-label="Yes" />
              <span role="cell" className="compare-mark compare-no" aria-label="No" />
            </div>
            <div role="row">
              <span role="rowheader">Totally Free</span>
              <span role="cell" className="compare-mark compare-yes" aria-label="Yes" />
              <span role="cell" className="compare-mark compare-no" aria-label="No" />
            </div>
            <div role="row">
              <span role="rowheader">No Rate Limits</span>
              <span role="cell" className="compare-mark compare-yes" aria-label="Yes" />
              <span role="cell" className="compare-mark compare-no" aria-label="No" />
            </div>
          </div>
        </div>
      </div>

      <div className="tool-seo-faq">
        <h3>Frequently Asked Questions</h3>
        {seo.faqs.map((faq) => (
          <details key={faq.question}>
            <summary>{faq.question}</summary>
            <p>{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

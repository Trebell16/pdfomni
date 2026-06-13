import Seo from '../components/Common/Seo'

export default function AboutPage() {
  return (
    <div className="tool-page" id="about-page">
      <Seo
        title="About Us | PDFOmni"
        description="Learn about PDFOmni, a student-built private PDF toolkit focused on local browser processing, free tools, and practical document workflows."
        canonicalPath="/about"
      />
      <div className="container">
        <div className="tool-page-header">
          <h1 className="tool-page-title">About Us</h1>
          <p className="tool-page-desc">PDFOmni is a student-built PDF toolkit for people who want useful document tools without handing every file to a server.</p>
        </div>
        <div className="card legal-card">
          <h2>Why PDFOmni Exists</h2>
          <p>
            PDFOmni started as a college project from a student who kept running into the same annoying problem: simple PDF tasks were either locked behind accounts, limited by upload caps, or required trusting random websites with private documents. The goal became straightforward: build PDF tools that feel quick, free, and practical while keeping the document work inside the browser whenever possible.
          </p>
          <h2>Built Around Local Processing</h2>
          <p>
            The site focuses on client-side workflows. Tools such as merge, split, compress, rotate, redact, crop, protect, unlock, sign, and convert are designed so the file is handled on your device instead of being uploaded to a PDF processing server. The browser loads normal website assets, but the core document pipeline is built around local work.
          </p>
          <h2>Who Builds It</h2>
          <p>
            PDFOmni is maintained by an independent college student who likes building practical web tools, learning from real user complaints, and turning messy PDF edge cases into better product decisions. The project is intentionally small, direct, and focused on improving the parts of PDF work that people actually touch every day.
          </p>
          <h2>What We Care About</h2>
          <p>
            The main priorities are privacy-focused processing, a clear 500 MB file size limit, tools that stay totally free, and no artificial rate limits on local PDF actions. When something breaks, the plan is to improve the tool rather than hide behind vague limits or force users into a paid tier.
          </p>
          <h2>What Comes Next</h2>
          <p>
            PDFOmni will keep improving the editor, batch workflows, mobile layouts, accessibility checks, and AI copilot features while staying honest about browser limits. PDFs are complicated files with fonts, images, forms, tables, scans, and permissions, so the project will continue to evolve around real documents and real feedback.
          </p>
        </div>
      </div>
    </div>
  )
}

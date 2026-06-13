import { useState } from 'react'
import Seo from '../components/Common/Seo'

const CONTACT_EMAIL = 'a4q1d6wn@anonaddy.me'

export default function ContactPage() {
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  const mailtoHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject || 'PDFOmni Support')}&body=${encodeURIComponent(`Name: ${name}\n\n${message}`)}`

  return (
    <div className="tool-page" id="contact-page">
      <Seo
        title="Contact | PDFOmni"
        description="Contact PDFOmni for privacy, support, and indexing questions through the on-site contact page."
        canonicalPath="/contact"
      />
      <div className="container">
        <div className="tool-page-header">
          <h1 className="tool-page-title">Contact</h1>
          <p className="tool-page-desc">Use the local form below to prepare a support email without sending your documents anywhere.</p>
        </div>
        <div className="card legal-card">
          <div className="input-group">
            <label className="input-label" htmlFor="contact-name">Name</label>
            <input id="contact-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="contact-subject">Subject</label>
            <input id="contact-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Support request" />
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="contact-message">Message</label>
            <textarea
              id="contact-message"
              className="input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your issue or question"
              style={{ minHeight: 180, resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <a className="btn btn-primary" href={mailtoHref}>Open Email Draft</a>
          </div>
        </div>
      </div>
    </div>
  )
}

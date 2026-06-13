import { Shield, Heart } from 'lucide-react'
import { Link } from 'react-router-dom'
import tools, { toolCategories } from '../../config/tools'

export default function Footer() {
  const footerToolSections = toolCategories
    .map((category) => ({
      ...category,
      tools: tools.filter((tool) => tool.category === category.id && tool.canonicalPath && !tool.hiddenOnHome),
    }))
    .filter((category) => category.tools.length > 0)

  return (
    <footer className="footer" id="footer">
      <div className="container">
        <div className="footer-tool-map" aria-label="PDF tool links">
          {footerToolSections.map((category) => (
            <nav key={category.id} className="footer-tool-column" aria-label={`${category.label} tools`}>
              <h3>{category.label}</h3>
              {category.tools.map((tool) => (
                <a key={tool.id} href={tool.canonicalPath}>
                  {tool.name}
                </a>
              ))}
            </nav>
          ))}
        </div>
        <div className="footer-inner">
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            <div className="footer-text">
              {'©'} {new Date().getFullYear()} PDFOmni - Free PDF Toolkit
            </div>
            <div className="footer-links" style={{ display: 'flex', gap: 'var(--space-4, 16px)', alignItems: 'center', flexWrap: 'wrap' }}>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms of Service</Link>
              <Link to="/contact">Contact</Link>
              <Link to="/about">About Us</Link>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className="footer-privacy">
              <Shield size={14} />
              <span>Zero-Knowledge Architecture</span>
            </div>
            <span
              className="footer-text"
              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              Made with <Heart size={14} style={{ color: '#ef4444' }} /> by a broke boy
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}

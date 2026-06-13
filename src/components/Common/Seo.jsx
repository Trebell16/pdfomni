import { useEffect } from 'react'

const SITE_URL = 'https://pdfomni.com'
const DEFAULT_DESCRIPTION = 'Edit, merge, and compress PDFs locally in your browser. 100% private PDF tools with no server uploads.'

function setMeta(name, content, property = false) {
  const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`
  let element = document.head.querySelector(selector)
  if (!element) {
    element = document.createElement('meta')
    if (property) element.setAttribute('property', name)
    else element.setAttribute('name', name)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}

function setLink(rel, href) {
  let element = document.head.querySelector(`link[rel="${rel}"]`)
  if (!element) {
    element = document.createElement('link')
    element.setAttribute('rel', rel)
    document.head.appendChild(element)
  }
  element.setAttribute('href', href)
}

export default function Seo({
  title,
  description = DEFAULT_DESCRIPTION,
  canonicalPath = '/',
  structuredData,
  robots = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1',
}) {
  useEffect(() => {
    const canonicalUrl = `${SITE_URL}${canonicalPath}`
    document.documentElement.lang = 'en'
    document.title = title

    setMeta('description', description)
    setMeta('robots', robots)
    setMeta('theme-color', '#f6f1e8')
    setMeta('og:title', title, true)
    setMeta('og:description', description, true)
    setMeta('og:type', 'website', true)
    setMeta('og:url', canonicalUrl, true)
    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', title)
    setMeta('twitter:description', description)
    setLink('canonical', canonicalUrl)

    let script = document.head.querySelector('script[data-seo-ld="true"]')
    if (!script) {
      script = document.createElement('script')
      script.type = 'application/ld+json'
      script.dataset.seoLd = 'true'
      document.head.appendChild(script)
    }
    const defaultStructuredData = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url: canonicalUrl,
    }
    script.textContent = JSON.stringify(structuredData || defaultStructuredData)
  }, [title, description, canonicalPath, structuredData, robots])

  return null
}

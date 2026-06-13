import fs from 'node:fs'
import path from 'node:path'
import tools from '../src/config/tools.js'

const outDir = process.argv[2] || 'dist'
const rootDir = process.cwd()
const outputRoot = path.resolve(rootDir, outDir)

const routes = [
  '/',
  ...tools.filter((tool) => tool.canonicalPath && !tool.hiddenOnHome).map((tool) => tool.canonicalPath),
  '/workflow',
  '/privacy',
  '/terms',
  '/contact',
  '/about',
  '/404',
  '/500',
]

function routeFile(route) {
  if (route === '/') return path.join(outputRoot, 'index.html')
  return path.join(outputRoot, route.replace(/^\/+|\/+$/g, ''), 'index.html')
}

function routeHtmlFile(route) {
  if (route === '/') return null
  return path.join(outputRoot, `${route.replace(/^\/+|\/+$/g, '')}.html`)
}

function textLength(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length
}

const failures = []

for (const route of routes) {
  const files = [routeFile(route), routeHtmlFile(route)].filter(Boolean)
  for (const file of files) {
    if (!fs.existsSync(file)) {
      failures.push(`${route}: missing ${file}`)
      continue
    }

    const html = fs.readFileSync(file, 'utf8')
    const seoIndex = html.indexOf('class="prerendered-seo"')
    const rootIndex = html.indexOf('id="root"')
    const isToolRoute = tools.some((tool) => tool.canonicalPath === route && !tool.hiddenOnHome)

    const checks = [
      ['title', /<title>[^<]{8,}<\/title>/i.test(html)],
      ['description', /<meta name="description" content="[^"]{50,}"/i.test(html)],
      ['canonical', html.includes(`rel="canonical" href="https://pdfomni.com${route}"`)],
      ['no old pages.dev domain', !html.includes('pdfomni.pages.dev')],
      ['crawler body', seoIndex >= 0],
      ['h1', /<h1>[^<]{8,}<\/h1>/i.test(html)],
      ['root after crawler body', rootIndex > seoIndex],
      ['not noscript-only', !html.includes('<noscript>')],
      ['body text', textLength(html) > (isToolRoute ? 1800 : 80)],
    ]

    if (isToolRoute) {
      checks.push(
        ['privacy copy', /local|browser|device|privacy/i.test(html)]
      )
      if (route !== '/edit-pdf') {
        checks.push(
          ['faq heading', html.includes('Frequently Asked Questions')],
          ['faq schema', html.includes('"@type":"FAQPage"')]
        )
      }
    }

    for (const [name, ok] of checks) {
      if (!ok) failures.push(`${route}: failed ${name} in ${file}`)
    }
  }
}

if (failures.length) {
  console.error(`Prerender verification failed for ${outDir}:`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Verified ${routes.length} prerendered route(s) with index and extensionless HTML in ${outDir}.`)

import { useParams, Link, Navigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { getToolById } from '../config/tools'
import { getToolSeo } from '../config/toolSeo'
import Seo from '../components/Common/Seo'
import ToolSeoSection from '../components/Common/ToolSeoSection'

// Tool components
import MergeTool from '../components/Tools/MergeTool'
import SplitTool from '../components/Tools/SplitTool'
import ReorderTool from '../components/Tools/ReorderTool'
import RotateTool from '../components/Tools/RotateTool'
import PageNumberTool from '../components/Tools/PageNumberTool'
import WatermarkTool from '../components/Tools/WatermarkTool'
import RedactTool from '../components/Tools/RedactTool'
import CropTool from '../components/Tools/CropTool'
import EncryptTool from '../components/Tools/EncryptTool'
import DecryptTool from '../components/Tools/DecryptTool'
import SignTool from '../components/Tools/SignTool'
import ImageToPdfTool from '../components/Tools/ImageToPdfTool'
import PdfToImageTool from '../components/Tools/PdfToImageTool'
import PdfToTextTool from '../components/Tools/PdfToTextTool'
import WordToPdfTool from '../components/Tools/WordToPdfTool'
import ExcelToPdfTool from '../components/Tools/ExcelToPdfTool'
import HtmlToPdfTool from '../components/Tools/HtmlToPdfTool'
import BatchTool from '../components/Tools/BatchTool'
import WcagTool from '../components/Tools/WcagTool'

function CompressIframeWrapper() {
  const applyTheme = (event) => {
    const theme = document.documentElement.dataset.theme || 'light'
    const frameWindow = event.currentTarget.contentWindow
    try {
      event.currentTarget.contentDocument.documentElement.dataset.theme = theme
    } catch {
      // The iframe is same-origin in normal builds, but posting is harmless if direct access fails.
    }
    frameWindow?.postMessage({ type: 'pdfomni-theme', theme }, window.location.origin)
  }

  return (
    <iframe
      src="/compress/app/index.html"
      onLoad={applyTheme}
      style={{
        width: '100%',
        height: '820px',
        border: 'none',
        display: 'block',
        background: 'transparent',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
      }}
      title="PDF Compressor"
    />
  )
}

const toolComponents = {
  'merge': MergeTool,
  'split': SplitTool,
  'reorder': ReorderTool,
  'compress': CompressIframeWrapper,
  'rotate': RotateTool,
  'page-numbers': PageNumberTool,
  'watermark': WatermarkTool,
  'redact': RedactTool,
  'crop': CropTool,
  'encrypt': EncryptTool,
  'decrypt': DecryptTool,
  'sign': SignTool,
  'image-to-pdf': ImageToPdfTool,
  'pdf-to-image': PdfToImageTool,
  'pdf-to-text': PdfToTextTool,
  'word-to-pdf': WordToPdfTool,
  'excel-to-pdf': ExcelToPdfTool,
  'html-to-pdf': HtmlToPdfTool,
  'batch': BatchTool,
  'wcag': WcagTool,
}

const wideLayoutTools = new Set(['watermark', 'crop', 'redact', 'sign', 'batch', 'word-to-pdf', 'excel-to-pdf'])

export default function ToolPage({ forcedToolId }) {
  const params = useParams()
  const toolId = forcedToolId || params.toolId
  const tool = getToolById(toolId)

  if (tool?.redirectTo && toolId === 'draw') {
    return <Navigate to={`/tool/${tool.redirectTo}`} replace />
  }

  const ToolComponent = toolComponents[toolId]

  if (!tool || !ToolComponent) {
    return (
      <div className="tool-page">
        <div className="container" style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 'var(--text-3xl)', marginBottom: 'var(--space-4)' }}>
            Tool not found
          </h1>
          <Link to="/" className="btn btn-primary">
            <ArrowLeft size={18} />
            Back to Home
          </Link>
        </div>
      </div>
    )
  }

  const Icon = tool.icon
  const canonicalPath = tool.canonicalPath || `/tool/${tool.id}`
  const seo = getToolSeo(toolId, tool)
  const title = `${seo.h1} | PDFOmni`
  const description = `${seo.intro} 100% client-side PDF workflow with no server upload.`
  const faqSchema = {
    '@type': 'FAQPage',
    mainEntity: seo.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  }
  const howToSchema = {
    '@type': 'HowTo',
    name: seo.h1,
    description: seo.intro,
    step: seo.steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      text: step,
    })),
  }

  return (
    <div className="tool-page" id={`tool-page-${toolId}`}>
      <Seo
        title={title}
        description={description}
        canonicalPath={canonicalPath}
        structuredData={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'SoftwareApplication',
              name: `PDFOmni ${tool.name}`,
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web Browser',
              description,
              url: `https://pdfomni.com${canonicalPath}`,
            },
            howToSchema,
            faqSchema,
          ],
        }}
      />
      <div className={wideLayoutTools.has(toolId) ? 'container-wide' : 'container'}>
        <Link to="/" className="btn btn-ghost" style={{ marginBottom: 'var(--space-6)' }}>
          <ArrowLeft size={18} />
          All Tools
        </Link>
        
        <div className="tool-page-header">
          <div style={{ 
            display: 'inline-flex', 
            padding: 'var(--space-3)', 
            borderRadius: 'var(--radius-lg)',
            background: `${tool.color}15`,
            color: tool.color,
            marginBottom: 'var(--space-4)',
          }}>
            <Icon size={32} />
          </div>
          <h1 className={`tool-page-title ${tool.tooltip ? 'tooltip' : ''}`} data-tooltip={tool.tooltip || undefined}>
            {seo.h1}
          </h1>
          <p className="tool-page-desc">{tool.description}</p>
        </div>

        <div className={`tool-page-content ${wideLayoutTools.has(toolId) ? 'tool-page-content-wide' : ''}`}>
          <ToolComponent toolId={toolId} tool={tool} />
        </div>

        <ToolSeoSection tool={tool} seo={seo} />
      </div>
    </div>
  )
}

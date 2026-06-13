import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

export default defineConfig(({ mode }) => {
  const protectedBuild = mode === 'protected'
  const outDir = protectedBuild ? 'obfuscated_dist' : 'dist'

  function copyGoogleVerificationFiles() {
    const projectRoot = process.cwd()
    const outputRoot = path.resolve(projectRoot, outDir)
    if (!fs.existsSync(outputRoot)) return

    for (const fileName of fs.readdirSync(projectRoot)) {
      if (!/^google[a-z0-9]+\.html$/i.test(fileName)) continue
      fs.copyFileSync(path.join(projectRoot, fileName), path.join(outputRoot, fileName))
    }
  }

  return {
  plugins: [
    react(),
    {
      name: 'copy-google-verification-files',
      closeBundle() {
        copyGoogleVerificationFiles()
      },
    },
    {
      name: 'serve-compress',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url.split('?')[0]; // strip query params
          if (url.startsWith('/compress')) {
            let relativePath = url.replace(/^\/compress/, '');
            if (relativePath === '/' || relativePath === '') {
              relativePath = '/index.html';
            }
            const filePath = path.resolve('dist/compress' + relativePath);
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              const ext = path.extname(filePath);
              const contentType = {
                '.html': 'text/html',
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.svg': 'image/svg+xml',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.gif': 'image/gif',
                '.mjs': 'application/javascript',
              }[ext] || 'application/octet-stream';
              
              res.setHeader('Content-Type', contentType);
              res.end(fs.readFileSync(filePath));
              return;
            }
          }
          next();
        });
      }
    }
  ],
  server: {
    port: 5174,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
  worker: {
    format: 'es',
  },
  build: {
    outDir,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: 'index.html',
        editpdf: 'editpdf.html',
      },
      output: protectedBuild ? {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/')
          if (normalized.includes('pdfjs-dist')) return 'pdfjs-dist'
          if (normalized.includes('pdf-lib')) return 'pdf-lib'
          if (normalized.includes('onnxruntime-web') || normalized.includes('@xenova/transformers')) return 'ai-runtime'
          if (normalized.includes('lucide-react')) return 'lucide-react'
          if (normalized.includes('jspdf')) return 'jspdf'
          if (normalized.includes('tesseract.js')) return 'tesseract'
          if (normalized.includes('xlsx')) return 'xlsx'
          if (normalized.includes('mammoth')) return 'mammoth'
          if (normalized.includes('dompurify') || normalized.includes('marked')) return 'content-libs'
          if (!normalized.includes('node_modules')) {
            if (normalized.includes('/src/components/AI/') || normalized.includes('/src/ai/')) return 'app-ai'
            if (normalized.includes('/src/components/Tools/')) return 'app-tools'
            if (normalized.includes('/src/engine/') || normalized.includes('/src/utils/')) return 'app-engine'
            if (normalized.includes('/src/pages/WorkflowPage.jsx')) return 'app-workflow'
            if (normalized.includes('/src/pages/') || normalized.includes('/src/components/Common/') || normalized.includes('/src/components/Layout/')) return 'app-ui'
            if (normalized.includes('/src/config/') || normalized.includes('/src/store/')) return 'app-core'
            return
          }
          return 'vendor'
        },
      } : undefined,
    },
  },
  }
})

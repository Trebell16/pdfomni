import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: '/compress/app/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
  build: {
    target: 'esnext',
    outDir: mode === 'protected' ? '../obfuscated_dist/compress/app' : '../dist/compress/app',
    sourcemap: false,
    // manualChunks as function is supported by Rolldown (Vite 6+)
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('pdf-lib'))     return 'pdf-lib';
          if (id.includes('pdfjs-dist')) return 'pdfjs-dist';
          if (id.includes('lucide-react')) return 'lucide-react';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
  // Required for GitHub Pages subdirectory deploys — change base as needed:
  // base: '/repo-name/',
}))

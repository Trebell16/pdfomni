# PDFOmni Edit PDF Standalone

This folder is a raw, independently buildable copy of PDFOmni's Edit PDF tool. It exists as a focused testing ground for Safari and iPadOS editing work without requiring the rest of the PDFOmni application.

The editor source is intentionally kept in one file:

- `index.html` - editor UI, styles, PDF extraction, editing, and export logic
- `public/lib/` - browser builds of PDF-Lib and Fontkit used directly by the page
- `test/` - representative PDFs for editor regression testing
- `vite.config.js` - standalone development and production build configuration

## Local Development

Requirements:

- Node.js 22.13 or newer
- npm

Install and run:

```bash
npm install
npm run dev
```

Open `http://localhost:5174`.

## Production Build

```bash
npm run build
npm run preview
```

The production output is written to `dist/`.

## Cloudflare Pages

Create a separate Cloudflare Pages project with these settings:

- Root directory: `tempedit` if deploying from the parent repository
- Build command: `npm run build`
- Build output directory: `dist`
- Node.js version: 22.13 or newer

If `tempedit` becomes its own repository, leave the root directory empty and use the same build command and output directory.

The included `_redirects` file makes `/edit-pdf` serve the standalone editor. The included `_headers` file deliberately does not enable COOP/COEP, matching the current editor deployment behavior.

## Test Documents

- `Juhi BP protocol.pdf` - text extraction, styling, and Safari interaction case
- `latest_redacted-1.pdf` - PDFOmni redaction-output compatibility case
- `big.pdf` - embedded and specialized font case
- `img pdf.pdf` - image-only/scanned PDF case

## Important Notes

- `pdfjs-dist` and `qpdf-run` are bundled by Vite.
- PDF-Lib and Fontkit are loaded from `public/lib` because the current editor expects their browser globals.
- The source currently retains PDFOmni analytics, metadata, support links, and external font lookup behavior from the main editor. Remove or replace those intentionally if this test project is deployed publicly under another domain.
- Do not copy fixes back into the main project without testing text editing, image editing, scanned PDFs, export, re-import, desktop browsers, and real iPad Safari.

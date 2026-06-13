# PDFOmni

This is the working repo for https://pdfomni.com.

PDFOmni is a local-first PDF toolkit built with React, Vite, JavaScript, TypeScript, Web Workers, WebAssembly, PDF.js, and PDF-lib. Its core PDF tools run in the browser so documents do not need to be uploaded to a PDFOmni processing server.

## What the project includes

PDFOmni provides dedicated pages for:

- Organizing PDFs: merge, split, reorder, compress, rotate, and page numbering
- Converting to PDF: Word, Excel, images, and HTML
- Converting from PDF: images and extracted text
- Editing: text and images, drawing, watermarking, redaction, and cropping
- Security: password protection, unlocking, and signatures
- Advanced work: batch processing, accessibility checks, and visual workflows
- AI Copilot: local document indexing and retrieval with an OpenRouter-powered chat interface

The site also includes prerendered route content, per-page metadata, canonical URLs, structured data, a sitemap, crawler directives, legal pages, and a categorized footer for discoverability.

## Privacy model

Core PDF processing is designed to happen locally in the browser. Selected files remain on the user's device while supported tools read, transform, preview, and export them.

The AI Copilot is optional and different from the core PDF tools. It stores its settings locally, but when a user sends a chat request, the selected query and retrieved document context are sent to OpenRouter using the API key supplied by that user.

Browser memory, device performance, page count, image resolution, embedded fonts, and document complexity can affect processing speed. The interface presents a 500 MB per-file limit, but practical limits still depend on the device.

## Architecture

### Main application

The main site lives in `src/` and uses:

- React 19
- React Router
- Vite
- Zustand
- Vanilla CSS design tokens and responsive layouts
- PDF.js, PDF-lib, qpdf WebAssembly, Tesseract.js, Mammoth, SheetJS, and jsPDF

Most tool routes are rendered inside the shared React shell with the common header, footer, AI sidebar, SEO content, and download flow.

### PDF editor

`editpdf.html` is a standalone editor entry point. It has its own rendering and editing runtime because text detection, embedded fonts, canvas virtualization, image editing, drawing, undo/redo, and PDF export need tighter control than the shared tool shell.

The public route is `/edit-pdf`; older editor routes redirect there.

### PDF compressor

`compress_pdf/` is a separate React and TypeScript application. It uses a Web Worker for compression and builds into the main deployment under `dist/compress/app/`.

Keeping it isolated prevents its worker, TypeScript, and styling pipeline from interfering with the main application.

### AI and RAG

The local retrieval system lives in `src/ai/` with its embedding worker and chat integration. It combines searchable document chunks with optional semantic embeddings so large PDFs can be queried without sending the entire document in every request.

See [rag.md](./rag.md) for the current indexing, retrieval, limits, and debugging behavior.

### Static route generation

The app remains interactive React in the browser, while `scripts/prerender_routes.js` generates meaningful initial HTML for the homepage, every tool route, workflow, and supporting pages. This provides:

- Route-specific titles and descriptions
- Self-referencing canonical URLs on `https://pdfomni.com`
- Crawlable headings, copy, and internal links
- JSON-LD structured data
- HTML that is useful to crawlers that do not execute JavaScript

`scripts/verify_prerender_routes.js` checks the generated routes during each build.

## Repository layout

```text
src/                    Main React application
src/components/Tools/   PDF tool interfaces
src/engine/             Shared PDF, OCR, and rendering engines
src/ai/                 Local retrieval and embedding code
src/config/             Tool catalog and SEO content
compress_pdf/           Isolated TypeScript compressor application
public/                 Static assets, crawler files, headers, and redirects
scripts/                Prerendering, verification, and protected-build scripts
tests/                  Playwright test suites and reusable fixtures
editpdf.html            Standalone PDF editor
```

## Requirements

- Node.js 18 or newer
- npm 9 or newer
- A modern browser with WebAssembly and Web Worker support

## Local development

Install the main and compressor dependencies:

```bash
npm install
```

The root `postinstall` script installs dependencies inside `compress_pdf/` as well.

Run the main application:

```bash
npm run dev
```

The configured main development URL is:

```text
http://localhost:5174
```

When actively developing the standalone compressor, it can also be run separately:

```bash
npm run dev --prefix compress_pdf
```

## Builds

### Normal build

```bash
npm run build
```

This command:

1. Builds the main application into `dist/`.
2. Builds the compressor into `dist/compress/app/`.
3. Prerenders and verifies all public routes.
4. Generates the Cloudflare deployment manifest.
5. Creates `dist.zip`.

### Protected build

```bash
npm run build:protected
```

This creates a separate deployment in `obfuscated_dist/`, obfuscates first-party JavaScript while excluding public libraries and runtime assets, prerenders the routes, verifies them, and creates `obfuscated_dist.zip`.

The protected build is a copying deterrent, not a security boundary. Any code executed by a browser can ultimately be inspected by a determined user.

## Testing

Run lint checks:

```bash
npm run lint
```

Run the Playwright suite:

```bash
npx playwright test
```

Run a focused test:

```bash
npx playwright test tests/verify-compressor.spec.js
```

Playwright uses `http://localhost:5174` by default. Override it with `PLAYWRIGHT_TEST_BASE_URL` when testing another deployment.

## Cloudflare deployment

The production target is Cloudflare Pages with the custom domain `pdfomni.com`.

Deploy either:

- The contents of `dist/` for the normal build
- The contents of `obfuscated_dist/` for the protected build

The generated build includes `_headers`, `_redirects`, the Google Search Console verification file, crawler directives, the sitemap, static route HTML, workers, WebAssembly files, and compressor assets.

Do not commit local environment files, API keys, certificates, downloaded user documents, generated builds, screenshots, logs, or deployment archives. The root `.gitignore` covers these common cases.

## Important project notes

- Keep `pdfjs-dist` API and worker versions aligned.
- Preserve the isolated editor and compressor build paths when changing Vite configuration.
- Test PDF export changes by reopening exported files in PDFOmni and at least one external viewer.
- Check both light and dark themes on desktop and mobile after shared CSS changes.
- Rebuild both normal and protected distributions before publishing.

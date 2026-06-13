# PDFCrush — Client-Side PDF Compression Web App

> **100% in-browser PDF compression. No server. No uploads. No privacy risk.**

A production-ready, serverless-compatible PDF compression application built with React, TypeScript, Vite, and Tailwind CSS.

---

## ✨ Features

- 🔒 **100% Private** — Files never leave your device
- ⚡ **Web Worker architecture** — UI never freezes, even on 500 MB PDFs
- 🎯 **Target-size slider** — Set exact output size from 15% to 90% of original
- 📊 **Live preview** — Real-time size estimates and quality impact display
- 🔁 **Multi-pass compression** — Iterative algorithm converges on your target
- 📱 **Fully responsive** — Works on mobile, tablet, and desktop
- 🚀 **Serverless-ready** — One-command deploy to Vercel, Netlify, Cloudflare Pages, GitHub Pages

---

## 🏗️ Project Architecture

```
pdf-compressor/
├── public/
│   ├── favicon.svg          # App icon
│   ├── _headers             # Cloudflare Pages / Netlify headers
│   └── _redirects           # Netlify SPA routing
├── src/
│   ├── components/
│   │   ├── UploadZone.tsx       # Drag-and-drop file upload
│   │   ├── FileInfoCard.tsx     # Loaded file metadata display
│   │   ├── AnalysisPanel.tsx    # PDF structure analysis stats
│   │   ├── CompressionSlider.tsx# Target size % slider + live preview
│   │   ├── ProgressPanel.tsx    # Real-time compression progress
│   │   ├── ResultsPanel.tsx     # Results, metrics, download button
│   │   ├── PrivacyBanner.tsx    # Privacy notice banner
│   │   └── ErrorDisplay.tsx     # Error state with retry
│   ├── hooks/
│   │   └── useCompressor.ts     # Worker lifecycle + state management
│   ├── types/
│   │   └── index.ts             # Shared TypeScript types & utilities
│   ├── utils/
│   │   └── format.ts            # Formatting helpers (bytes, %, etc.)
│   ├── workers/
│   │   └── compressionWorker.ts # Web Worker: multi-stage PDF compression
│   ├── App.tsx                  # Root component (stage router)
│   ├── main.tsx                 # React entry point
│   └── index.css                # Global styles + Tailwind + custom CSS
├── index.html                   # HTML shell
├── vite.config.ts               # Vite configuration
├── tsconfig.json                # TypeScript config (root)
├── tsconfig.app.json            # TypeScript config (app)
├── vercel.json                  # Vercel deployment config
├── netlify.toml                 # Netlify deployment config
└── .github/workflows/
    └── deploy-pages.yml         # GitHub Actions → GitHub Pages
```

---

## 🧠 Compression Algorithm

### Multi-Stage Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                     COMPRESSION PIPELINE                      │
├─────────────────────────────────────────────────────────────┤
│ Stage 1: PDF Analysis                                         │
│   → Count pages, images, fonts, embedded objects             │
│   → Report to UI for display                                 │
├─────────────────────────────────────────────────────────────┤
│ Stage 2: Metadata Optimisation                               │
│   → Strip author, title, keywords, creation history         │
│   → Remove XMP metadata stream                               │
│   → Remove page thumbnails (Thumb entries)                   │
├─────────────────────────────────────────────────────────────┤
│ Stage 3: Baseline Measurement                                │
│   → Save after metadata removal                              │
│   → If already ≤ target → DONE                               │
├─────────────────────────────────────────────────────────────┤
│ Stage 4: Iterative Image Compression (up to 8 passes)        │
│   → Map targetPct → JPEG quality + maxDimension              │
│   → For each image XObject:                                  │
│       → Decode via OffscreenCanvas (Web Worker safe)         │
│       → Downsample if over maxDimension                      │
│       → Re-encode as JPEG at computed quality                │
│       → Replace only if new bytes < old bytes                │
│   → Save and measure                                         │
│   → If size reduction < 2% → early exit                     │
│   → If target reached → early exit                           │
├─────────────────────────────────────────────────────────────┤
│ Stage 5: Object Stream Optimisation                           │
│   → Reload from last-saved bytes                             │
│   → Re-save with useObjectStreams=true                        │
│   → Compresses XRef tables and object streams               │
└─────────────────────────────────────────────────────────────┘
```

### Adaptive Quality Mapping

| Target % | JPEG Quality (base) | Max Dimension |
|----------|---------------------|---------------|
| ≥ 85%    | 88%                 | 2400 px       |
| ≥ 75%    | 80%                 | 2000 px       |
| ≥ 60%    | 70%                 | 1600 px       |
| ≥ 45%    | 58%                 | 1200 px       |
| ≥ 30%    | 44%                 | 900 px        |
| ≥ 20%    | 32%                 | 720 px        |
| < 20%    | 20%                 | 600 px        |

Each iteration reduces quality by an additional 6% until the target is hit or quality floor (10%) is reached.

### Target Size Formula

```
targetSize = originalFileSize × (sliderPercentage ÷ 100)
```

Example:
```
Original:  100 MB
Target:    50%
→ Target:  50 MB

Pass 1 → 70 MB   (metadata + light image compression)
Pass 2 → 58 MB   (medium quality)
Pass 3 → 51 MB   (tighter quality)
Pass 4 → 49.8 MB ← STOP (target reached)
```

---

## 🔧 Local Development

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9

### Setup

```bash
# Clone the repository
git clone https://github.com/your-org/pdf-compressor.git
cd pdf-compressor

# Install dependencies
npm install

# Start the development server
npm run dev
```

App will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

Output goes to `dist/`. The build is fully self-contained static HTML/JS/CSS.

### Preview Production Build

```bash
npm run preview
```

---

## 🚀 Deployment

### Important: COOP / COEP Headers

PDF compression uses `OffscreenCanvas` in a Web Worker, which requires **Cross-Origin Isolation** headers on some browsers/use-cases. These are pre-configured in all deployment configs:

```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

---

### ▶ Vercel

```bash
# Option 1: Vercel CLI
npm install -g vercel
vercel --prod

# Option 2: Connect GitHub repo at vercel.com
# Build Command:   npm run build
# Output Dir:      dist
# Framework:       Vite
```

The `vercel.json` in this repo auto-configures headers and SPA routing.

---

### ▶ Netlify

```bash
# Option 1: Netlify CLI
npm install -g netlify-cli
netlify deploy --prod --dir=dist

# Option 2: Connect GitHub repo at app.netlify.com
# Build Command:   npm run build
# Publish Dir:     dist
```

The `netlify.toml` auto-configures COOP/COEP headers, SPA fallback, and asset caching.

---

### ▶ Cloudflare Pages

```bash
# Option 1: Wrangler CLI
npm install -g wrangler
wrangler pages deploy dist --project-name=pdf-compressor

# Option 2: Connect GitHub repo at dash.cloudflare.com → Pages
# Build Command:   npm run build
# Build Output:    dist
# Root Directory:  / (or wherever package.json is)
```

The `public/_headers` file configures Cloudflare's edge headers.

---

### ▶ GitHub Pages

1. Enable GitHub Pages in your repo Settings → Pages → Source: **GitHub Actions**

2. Push to `main` — the workflow at `.github/workflows/deploy-pages.yml` will automatically build and deploy.

3. If deploying to a **subdirectory** (e.g. `username.github.io/pdf-compressor/`), update `vite.config.ts`:

```ts
// vite.config.ts
export default defineConfig({
  base: '/pdf-compressor/',  // ← add this
  // ...
})
```

---

## 🛡️ Privacy & Security

- **No data exfiltration** — All processing uses browser-native APIs (`OffscreenCanvas`, `FileReader`, `Blob`)
- **No analytics** — No tracking scripts, no cookies, no telemetry
- **No CDN dependencies** — All libraries are bundled into the static build
- **Content Security Policy** ready — No eval, no inline scripts (except Vite dev HMR)
- **File stays local** — `FileReader.readAsArrayBuffer` → Web Worker → `URL.createObjectURL` — never touches a network socket

---

## ⚡ Performance

### Large File Handling (10 MB – 500 MB)

| Technique | Benefit |
|-----------|---------|
| Web Worker | Compression runs off main thread; UI stays responsive |
| Zero-copy transfer | `ArrayBuffer` is transferred (not copied) to Worker via `postMessage(msg, [buffer])` |
| Chunked image processing | Images processed one at a time with progress reporting |
| Early exit | Stops iterating when size reduction < 2% per pass |
| Lazy loading | `pdf-lib` and `pdfjs-dist` are in separate chunks, loaded on demand |
| Object URLs | Compressed result is served as `blob:` URL — never held in JS heap after download |

### Browser Support

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome  | ≥ 69    | Full support (OffscreenCanvas GA) |
| Firefox | ≥ 105   | Full support |
| Safari  | ≥ 16.4  | Full support |
| Edge    | ≥ 79    | Full support (Chromium-based) |

---

## 🔨 Error Handling

| Error | User Message |
|-------|-------------|
| Password-protected PDF | Clear message asking to remove password first |
| Corrupted / invalid PDF | Descriptive error with retry button |
| Browser memory limit | Suggests smaller file or closing other tabs |
| Unsupported image format | Silently skipped; other images still compressed |
| Worker crash | Caught by `worker.onerror`, shows generic error + retry |

---

## 📦 Tech Stack

| Layer | Library | Version |
|-------|---------|---------|
| UI Framework | React | 19 |
| Language | TypeScript | 5 |
| Build Tool | Vite | 8 |
| CSS | Tailwind CSS v4 | 4 |
| Icons | Lucide React | latest |
| PDF Manipulation | pdf-lib | 1.17 |
| Image Processing | Browser OffscreenCanvas | native |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push to branch: `git push origin feat/my-feature`
5. Open a Pull Request

---

## 📄 License

MIT © Your Organization

---

*Built with ❤️ — runs entirely in your browser.*

# Cloudflare Deployment Guide — PDFOmni

To host this project on Cloudflare Pages, you need to compile/build the project first. The build output is generated in the `dist` folder. **You should upload the contents of the `dist` folder to Cloudflare, NOT the root project folder.**

---

## 🚀 How to Build the Project

Before uploading, run the build script to compile all the React code, HTML pages, and assets:

```bash
# 1. Install dependencies (if you haven't already)
npm install

# 2. Build the project
npm run build
```

This will create a `dist` directory in your project root containing the production-ready assets.

---

## 📁 Files and Folders to Upload (from the `dist` directory)

When deploying to Cloudflare (either via Direct Upload drag-and-drop or using Wrangler), upload the **entire contents of the `dist` folder**:

```text
dist/
├── assets/                 # Compiled CSS, JS bundles, and workers
│   ├── main-[hash].css     # Styled components and main stylesheet
│   ├── index.es-[hash].js  # Main React application logic
│   ├── main-[hash].js      # Combined utility/routing chunk
│   └── pdf.worker.min-[hash].mjs  # PDF.js web worker for background processing
├── lib/                    # Vendor libraries (e.g. local scripts, external tools)
├── ocr/                    # OCR assets and resources (if applicable)
├── _redirects              # Cloudflare routing rules for Single Page Apps (SPA)
├── editpdf.html            # The custom, high-performance Edit PDF page
├── favicon.svg             # Application favicon
├── icons.svg               # SVG icons sheet
├── index.html              # Main application entrypoint
├── robots.txt              # Search engine crawler configuration
└── sitemap.xml             # Search engine sitemap
```

---

## ☁️ Deployment Methods

### Method 1: Cloudflare Pages Direct Upload (No Git)
1. Go to your **Cloudflare Dashboard** -> **Workers & Pages**.
2. Click **Create** -> **Pages** -> **Upload assets**.
3. Set your Project Name (e.g. `pdfomni`).
4. Drag and drop the **`dist` folder** (or select the `dist` folder from your file explorer).
5. Click **Deploy site**.

### Method 2: Git Integration (Automatic Deployments)
If you connect your GitHub repository to Cloudflare Pages:
1. Go to **Workers & Pages** -> **Create** -> **Pages** -> **Connect to Git**.
2. Select your repository.
3. In **Build Settings**:
   - **Framework preset**: `Vite` (or `None`)
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Click **Save and Deploy**. Cloudflare will automatically build and deploy the project every time you push to your repository.

---

## ⚙️ How Routing Works on Cloudflare Pages
* **Single Page App Routing**: The `_redirects` file directs all dynamic sub-routes (e.g., `/tool/compress`, `/tool/merge`) back to `index.html` so the client-side router can load the appropriate tool page.
* **Direct File Access**: Cloudflare Pages serves files that physically exist first. Since `editpdf.html` is output directly into the root of the `dist` folder, accessing `/editpdf.html` will correctly bypass the SPA redirection and load the custom editor page instantly.

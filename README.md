# Kagaz — free PDF & photo tools

Edit, sign, merge, split, convert and compress PDFs, and resize photos to exact KB limits for any upload form. Free, no signup, no watermark. **Every file is processed inside the user's browser and never uploaded.**

## Features

| Tool | What it does |
|---|---|
| Fill PDF form | Detects fillable forms (text boxes, checkboxes, radio buttons, dropdowns) and lets users fill them directly; answers are saved into the form's real fields, so portals and PDF readers see them. Optional "lock answers" makes every field read-only. Answers in any language (Hindi, Arabic, Chinese, etc.) are supported. Plain forms with blank lines are filled with the Text, Tick and Sign tools. |
| Edit PDF | Add text (multi-line, 3 fonts, sizes, colours, bold), white-out, highlight, freehand drawing, boxes, ticks and crosses, images. Move, resize, delete, undo/redo. Works on rotated pages. Text in any language supported. |
| Sign PDF | Draw, type (3 handwriting styles) or upload a photo of a signature. Paper background is removed automatically. Signatures can be remembered on the device. |
| Merge PDF | Combine many PDFs in any order. |
| Split PDF | Extract chosen pages (tap thumbnails or type `1-3, 5`), split every page, or every N pages (ZIP). |
| Organize | Rotate, reorder (drag or arrows) and delete pages. |
| Images → PDF | Phone photos to one PDF. A4/Letter/fit, margins, optional "scanned look". |
| PDF → images | Every page as JPG or PNG at 96–300 DPI (ZIP for multiple pages). |
| Compress photo | Hit a KB range exactly (binary search on JPEG quality, then dimensions), optional exact pixel size with centre-crop. Presets for common size limits, passport/visa photo sizes and Indian exams (SSC, IBPS/SBI, UPSC, NEET, RRB). |
| Compress PDF | Light / Recommended / Strong, or a target size (100 KB to 5 MB). Tries a lossless pass first. |

It also installs as an app (PWA) and works offline after the first visit.

## Why there's no backend server

All processing runs in the browser with `pdf-lib` and `pdf.js`. That means:
- **Privacy:** ID cards, certificates and contracts never leave the user's device.
- **Cost:** hosting is free static hosting. 10 users or 100,000 users cost the same.
- **Speed:** no upload or download wait.

A server is only needed later for things browsers can't do well (Word ↔ PDF, OCR). See "Next steps".

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the production build
```

## Deploy for free (about 10 minutes)

### 1. Put the code on GitHub
1. Create a free account at github.com.
2. Click **New repository**, name it `kagaz`, keep it Public, and create it.
3. On the repository page choose **uploading an existing file**, drag in everything from this folder **except `node_modules` and `dist`**, and commit.

### 2a. Cloudflare Pages (recommended: free, allows ads later)
1. Sign up at dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pick your `kagaz` repository.
3. Build settings: Framework preset **Vite** (or None), build command `npm run build`, output directory `dist`.
4. Deploy. You get a live URL like `kagaz.pages.dev`.

### 2b. Or Vercel
1. Sign up at vercel.com with GitHub → **Add New Project** → import `kagaz`.
2. It detects Vite automatically. Click **Deploy**.
3. Note: Vercel's free Hobby plan is for non-commercial use. If you add ads, use Cloudflare Pages or upgrade.

Both redeploy automatically whenever you push a change to GitHub. Routing is already configured (`public/_redirects` for Cloudflare/Netlify, `vercel.json` for Vercel).

### 3. Your own domain (optional, roughly ₹500–1,000/year)
Buy a `.in` or `.com` domain, then add it under **Custom domains** in Cloudflare Pages or Vercel. HTTPS is automatic.

### 4. Get found on Google
1. Replace `YOUR-DOMAIN` in `public/robots.txt` with your domain.
2. Add the site in Google Search Console (search.google.com/search-console) and submit your URL.

## Project structure

```
src/
  lib/pdf.ts            pdf.js setup, rendering, downloads, page ranges
  lib/annotations.ts    editor data model + burning edits into the PDF
  lib/compress.ts       target-KB photo compression, PDF compression, presets
  components/ui.tsx     layout, file drop zone, notices, progress bar
  components/SignatureModal.tsx
  pages/                one file per tool
  tools.ts              tool registry (routes, titles, home page cards)
public/                 PWA manifest, service worker, icons, hosting config
```

## Known limits (be upfront with users)
- White-out **covers** text visually. The original text is still inside the file, so don't rely on it to hide sensitive information.
- Existing printed text can't be edited in place (most free tools work this way). Cover it with White-out and type over it. This only matters for changing text; filling forms doesn't need it.
- Strong PDF compression turns pages into images, so the text is no longer selectable (the app tells the user).
- Password-protected PDFs need to be unlocked first.
- Presets are typical values. Requirements change, so the app tells users to check the rules of the form they're uploading to.

## Next steps (ideas for version 2)
- SEO landing pages: "compress photo to 20 KB", "US visa photo 600x600", "merge PDF online free", etc.
- Translate the interface (Hindi, Spanish, Arabic, etc.).
- Camera document scanner with auto-crop.
- A small backend (Node + LibreOffice/Tesseract on Render or Railway) for Word ↔ PDF and OCR.
- Privacy-friendly analytics (Plausible or Umami) to measure users for your resume.

import { PDFDocument } from 'pdf-lib'
import { canvasToBlob, closePdf, loadImage, openPdf, renderPage } from './pdf'

export type PresetGroup = 'Size limit' | 'Photo sizes' | 'India exams'

export interface Preset {
  id: string
  label: string
  group: PresetGroup
  minKB: number
  maxKB: number
  width?: number
  height?: number
}

/**
 * Convenience presets. Official requirements change often, so the UI always tells
 * users to confirm with the rules of the site or form they are uploading to.
 */
export const PRESETS: Preset[] = [
  { id: 'kb-20', label: 'Under 20 KB', group: 'Size limit', minKB: 0, maxKB: 20 },
  { id: 'kb-50', label: 'Under 50 KB', group: 'Size limit', minKB: 0, maxKB: 50 },
  { id: 'kb-100', label: 'Under 100 KB', group: 'Size limit', minKB: 0, maxKB: 100 },
  { id: 'kb-200', label: 'Under 200 KB', group: 'Size limit', minKB: 0, maxKB: 200 },
  { id: 'kb-500', label: 'Under 500 KB', group: 'Size limit', minKB: 0, maxKB: 500 },
  { id: 'kb-1024', label: 'Under 1 MB', group: 'Size limit', minKB: 0, maxKB: 1024 },
  { id: 'us-visa', label: 'US passport / visa photo (600×600)', group: 'Photo sizes', minKB: 0, maxKB: 240, width: 600, height: 600 },
  { id: 'photo-35x45', label: '35×45 mm photo at 300 dpi (413×531)', group: 'Photo sizes', minKB: 0, maxKB: 500, width: 413, height: 531 },
  { id: 'photo-2x2', label: '2×2 inch photo at 300 dpi (600×600)', group: 'Photo sizes', minKB: 0, maxKB: 500, width: 600, height: 600 },
  { id: 'profile-400', label: 'Square profile picture (400×400)', group: 'Photo sizes', minKB: 0, maxKB: 200, width: 400, height: 400 },
  { id: 'ssc-photo', label: 'SSC – Photo', group: 'India exams', minKB: 20, maxKB: 50 },
  { id: 'ssc-sign', label: 'SSC – Signature', group: 'India exams', minKB: 10, maxKB: 20 },
  { id: 'ibps-photo', label: 'IBPS / SBI – Photo (200×230)', group: 'India exams', minKB: 20, maxKB: 50, width: 200, height: 230 },
  { id: 'ibps-sign', label: 'IBPS / SBI – Signature (140×60)', group: 'India exams', minKB: 10, maxKB: 20, width: 140, height: 60 },
  { id: 'upsc-photo', label: 'UPSC – Photo', group: 'India exams', minKB: 20, maxKB: 200 },
  { id: 'upsc-sign', label: 'UPSC – Signature', group: 'India exams', minKB: 20, maxKB: 100 },
  { id: 'neet-photo', label: 'NEET – Passport photo', group: 'India exams', minKB: 10, maxKB: 200 },
  { id: 'rrb-photo', label: 'RRB – Photo', group: 'India exams', minKB: 20, maxKB: 50 },
]

export interface ImageCompressResult {
  blob: Blob
  width: number
  height: number
  quality: number
  hitTarget: boolean
  note?: string
}

function drawToCanvas(img: CanvasImageSource, srcW: number, srcH: number, w: number, h: number, cover: boolean) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w))
  canvas.height = Math.max(1, Math.round(h))
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff' // JPEG has no transparency; signatures on PNG should become white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = 'high'
  if (cover) {
    // center-crop to the exact requested aspect ratio
    const scale = Math.max(canvas.width / srcW, canvas.height / srcH)
    const dw = srcW * scale
    const dh = srcH * scale
    ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh)
  } else {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  }
  return canvas
}

/**
 * Compress an image so it lands between minKB and maxKB.
 * Binary-searches JPEG quality; if even the lowest acceptable quality is too large,
 * shrinks the dimensions step by step and searches again.
 */
export async function compressImageToTarget(
  file: Blob,
  opts: { minKB: number; maxKB: number; width?: number; height?: number },
): Promise<ImageCompressResult> {
  const img = await loadImage(file)
  const srcW = img.naturalWidth
  const srcH = img.naturalHeight
  const maxBytes = opts.maxKB * 1024
  const minBytes = opts.minKB * 1024
  const fixed = !!(opts.width && opts.height)

  let w = fixed ? opts.width! : srcW
  let h = fixed ? opts.height! : srcH
  // very large photos: start no larger than 2400px on the long side
  if (!fixed && Math.max(w, h) > 2400) {
    const s = 2400 / Math.max(w, h)
    w *= s
    h *= s
  }

  let best: { blob: Blob; q: number; w: number; h: number } | null = null

  for (let attempt = 0; attempt < 14; attempt++) {
    const canvas = drawToCanvas(img, srcW, srcH, w, h, fixed)
    let lo = 0.05
    let hi = 0.95
    let found: { blob: Blob; q: number } | null = null
    // fast path: highest quality already fits
    const top = await canvasToBlob(canvas, 'image/jpeg', hi)
    if (top.size <= maxBytes) {
      found = { blob: top, q: hi }
    } else {
      for (let i = 0; i < 8; i++) {
        const q = (lo + hi) / 2
        const blob = await canvasToBlob(canvas, 'image/jpeg', q)
        if (blob.size <= maxBytes) {
          found = { blob, q }
          lo = q
        } else {
          hi = q
        }
      }
      if (!found) {
        const floor = await canvasToBlob(canvas, 'image/jpeg', 0.05)
        if (floor.size <= maxBytes) found = { blob: floor, q: 0.05 }
      }
    }
    if (found && found.q >= 0.35) {
      best = { ...found, w: canvas.width, h: canvas.height }
      break
    }
    if (found && (!best || found.q > best.q)) best = { ...found, w: canvas.width, h: canvas.height }
    if (fixed) break // can't shrink fixed-size outputs
    w *= 0.82
    h *= 0.82
    if (w < 40 || h < 40) break
  }

  if (!best) {
    const canvas = drawToCanvas(img, srcW, srcH, w, h, fixed)
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.05)
    return { blob, width: canvas.width, height: canvas.height, quality: 0.05, hitTarget: false, note: 'Could not get under the size limit at these dimensions.' }
  }

  if (best.blob.size < minBytes) {
    // Too small for the portal's minimum: re-encode at top quality, then pad with a JPEG comment if still short.
    const canvas = drawToCanvas(img, srcW, srcH, best.w, best.h, fixed)
    let blob = await canvasToBlob(canvas, 'image/jpeg', 0.95)
    if (blob.size > maxBytes) blob = best.blob
    if (blob.size < minBytes) blob = await padJpeg(blob, Math.min(minBytes + 512, maxBytes))
    return { blob, width: best.w, height: best.h, quality: 0.95, hitTarget: blob.size >= minBytes && blob.size <= maxBytes }
  }

  return { blob: best.blob, width: best.w, height: best.h, quality: best.q, hitTarget: true }
}

/** Insert a COM (comment) segment after SOI so the file reaches a minimum size without changing the picture. */
async function padJpeg(blob: Blob, targetBytes: number): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let need = targetBytes - bytes.length
  if (need <= 0) return blob
  const segments: Uint8Array[] = [bytes.slice(0, 2)]
  while (need > 0) {
    const len = Math.min(65533, Math.max(need - 4, 1))
    const seg = new Uint8Array(len + 4)
    seg[0] = 0xff
    seg[1] = 0xfe
    seg[2] = ((len + 2) >> 8) & 0xff
    seg[3] = (len + 2) & 0xff
    seg.fill(0x20, 4)
    segments.push(seg)
    need -= seg.length
  }
  segments.push(bytes.slice(2))
  return new Blob(segments as BlobPart[], { type: 'image/jpeg' })
}

export type PdfLevel = 'light' | 'medium' | 'strong'
const LEVELS: Record<PdfLevel, { scale: number; quality: number }> = {
  light: { scale: 1.6, quality: 0.72 },
  medium: { scale: 1.25, quality: 0.6 },
  strong: { scale: 0.95, quality: 0.45 },
}

/** Lossless pass: re-save with object streams (helps some PDFs, harmless otherwise). */
export async function resavePdf(bytes: ArrayBuffer): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  return doc.save({ useObjectStreams: true })
}

/** Rebuild the PDF from page images. Big savings on scans/photos; text stops being selectable. */
export async function rasterizePdf(
  bytes: ArrayBuffer,
  scale: number,
  quality: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const src = await openPdf(bytes)
  const out = await PDFDocument.create()
  for (let i = 1; i <= src.numPages; i++) {
    const page = await src.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    const canvas = await renderPage(page, scale)
    const jpg = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', quality)).arrayBuffer())
    const image = await out.embedJpg(jpg)
    const p = out.addPage([vp.width, vp.height])
    p.drawImage(image, { x: 0, y: 0, width: vp.width, height: vp.height })
    page.cleanup()
    canvas.width = canvas.height = 0
    onProgress?.(i, src.numPages)
  }
  await closePdf(src)
  return out.save({ useObjectStreams: true })
}

export async function compressPdfLevel(bytes: ArrayBuffer, level: PdfLevel, onProgress?: (d: number, t: number) => void) {
  const { scale, quality } = LEVELS[level]
  return rasterizePdf(bytes, scale, quality, onProgress)
}

/** Try progressively stronger settings until the PDF fits under maxKB. */
export async function compressPdfToTarget(bytes: ArrayBuffer, maxKB: number, onStatus?: (msg: string) => void) {
  const steps = [
    { scale: 1.6, quality: 0.7 },
    { scale: 1.3, quality: 0.6 },
    { scale: 1.1, quality: 0.5 },
    { scale: 0.9, quality: 0.42 },
    { scale: 0.75, quality: 0.35 },
    { scale: 0.6, quality: 0.3 },
  ]
  let last: Uint8Array | null = null
  for (let i = 0; i < steps.length; i++) {
    onStatus?.(`Trying setting ${i + 1} of ${steps.length}…`)
    last = await rasterizePdf(bytes, steps[i].scale, steps[i].quality)
    if (last.length <= maxKB * 1024) return { bytes: last, hitTarget: true }
  }
  return { bytes: last!, hitTarget: false }
}

import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type { PDFDocumentProxy, PDFPageProxy }

/** Open a PDF for viewing/rendering (pdf.js). Pass a copy: pdf.js transfers the buffer. */
export async function openPdf(bytes: ArrayBuffer | Uint8Array): Promise<PDFDocumentProxy> {
  const data = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes.slice(0))
  return pdfjs.getDocument({ data }).promise
}

export const AnnotationMode = pdfjs.AnnotationMode

/**
 * Render a page into a new canvas at the given scale.
 * Pass hideFormFields when an editable form layer is drawn on top, so field contents aren't painted twice.
 */
export async function renderPage(
  page: PDFPageProxy,
  scale: number,
  rotation?: number,
  hideFormFields = false,
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale, rotation: rotation ?? page.rotate })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({
    canvas,
    canvasContext: ctx,
    viewport,
    annotationMode: hideFormFields ? pdfjs.AnnotationMode.ENABLE_FORMS : pdfjs.AnnotationMode.ENABLE,
  }).promise
  return canvas
}

/** Render a small thumbnail for every page. */
export async function renderThumbnails(
  bytes: ArrayBuffer,
  width = 160,
  onProgress?: (done: number, total: number) => void,
  limit = Infinity,
): Promise<string[]> {
  const doc = await openPdf(bytes)
  const out: string[] = []
  const n = Math.min(doc.numPages, limit)
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i)
    const base = page.getViewport({ scale: 1 })
    const canvas = await renderPage(page, width / base.width)
    out.push(canvas.toDataURL('image/jpeg', 0.7))
    onProgress?.(i, n)
    page.cleanup()
  }
  await closePdf(doc)
  return out
}

export function readAsArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  return file.arrayBuffer()
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality),
  )
}

export function downloadBlob(data: Blob | Uint8Array, filename: string, type = 'application/pdf') {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  // let the UI show a "downloaded" pop-up
  window.dispatchEvent(new CustomEvent('kagaz:download', { detail: { filename, size: blob.size } }))
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

/** Parse "1-3, 5, 8-" into zero-based page indices (in order, unique). */
export function parseRanges(input: string, pageCount: number): number[] {
  const result: number[] = []
  const seen = new Set<number>()
  for (const part of input.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/)
    let from: number, to: number
    if (m) {
      from = m[1] ? parseInt(m[1], 10) : 1
      to = m[2] ? parseInt(m[2], 10) : pageCount
    } else if (/^\d+$/.test(part)) {
      from = to = parseInt(part, 10)
    } else {
      throw new Error(`"${part}" is not a valid page or range`)
    }
    if (from < 1 || to > pageCount || from > to) throw new Error(`Range "${part}" is outside 1–${pageCount}`)
    for (let p = from; p <= to; p++) {
      if (!seen.has(p)) {
        seen.add(p)
        result.push(p - 1)
      }
    }
  }
  if (!result.length) throw new Error('Enter at least one page')
  return result
}

/** Load an image file (any browser-supported format) into an HTMLImageElement. */
export function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = typeof src === 'string' ? src : URL.createObjectURL(src)
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('This image format is not supported by your browser'))
    img.src = url
  })
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1]
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Free pdf.js memory for a document (API differs slightly across pdf.js versions). */
export async function closePdf(doc: PDFDocumentProxy | null | undefined) {
  if (!doc) return
  const d = doc as unknown as { destroy?: () => Promise<void>; loadingTask?: { destroy: () => Promise<void> } }
  try {
    if (d.loadingTask) await d.loadingTask.destroy()
    else if (d.destroy) await d.destroy()
    else await doc.cleanup()
  } catch {
    /* ignore */
  }
}

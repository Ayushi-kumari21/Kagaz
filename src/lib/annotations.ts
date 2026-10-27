import { PDFDocument, StandardFonts, rgb, degrees, BlendMode, LineCapStyle, type PDFFont, type PDFPage } from 'pdf-lib'
import { dataUrlToBytes } from './pdf'
import { fieldFontSize, fillForm, type FormField, type FormValues } from './forms'

export type FontKey = 'sans' | 'serif' | 'mono'

export interface BaseAnnot {
  id: string
  page: number
  /** Box in page display units (scale 1, top-left origin, y down). */
  x: number
  y: number
  w: number
  h: number
}
export interface TextAnnot extends BaseAnnot {
  type: 'text'
  text: string
  size: number
  color: string
  font: FontKey
  bold: boolean
}
export interface RectAnnot extends BaseAnnot {
  type: 'rect'
  variant: 'whiteout' | 'highlight' | 'box'
  color: string
}
export interface PathAnnot extends BaseAnnot {
  type: 'path'
  points: [number, number][]
  color: string
  width: number
}
export interface ImageAnnot extends BaseAnnot {
  type: 'image'
  src: string // PNG or JPEG data URL
}
export type Annot = TextAnnot | RectAnnot | PathAnnot | ImageAnnot

/** Minimal shape of a pdf.js viewport we need for coordinate conversion. */
export interface PageGeom {
  width: number
  height: number
  rotation: number
  toPdf: (x: number, y: number) => [number, number]
}

export const FONT_CSS: Record<FontKey, string> = {
  sans: 'Helvetica, Arial, sans-serif',
  serif: '"Times New Roman", Times, serif',
  mono: '"Courier New", Courier, monospace',
}

export const LINE_HEIGHT = 1.2
export const TEXT_PAD = 2

function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

function fontName(f: FontKey, bold: boolean) {
  if (f === 'serif') return bold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman
  if (f === 'mono') return bold ? StandardFonts.CourierBold : StandardFonts.Courier
  return bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica
}

function canEncode(font: PDFFont, text: string) {
  try {
    font.encodeText(text)
    return true
  } catch {
    return false
  }
}

/** Render a text block to a PNG (used for non-Latin scripts such as Hindi, Arabic or Chinese, and emoji, which standard PDF fonts can't encode). */
function textToPng(a: TextAnnot): string {
  const scale = 4
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(a.w * scale)
  canvas.height = Math.ceil(a.h * scale)
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.fillStyle = a.color
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${a.bold ? 'bold ' : ''}${a.size}px ${a.font === 'sans' ? 'system-ui, ' : ''}${FONT_CSS[a.font]}`
  a.text.split('\n').forEach((line, i) => {
    ctx.fillText(line, TEXT_PAD, TEXT_PAD + a.size * 0.88 + i * a.size * LINE_HEIGHT)
  })
  return canvas.toDataURL('image/png')
}

async function drawImageBox(doc: PDFDocument, page: PDFPage, g: PageGeom, a: BaseAnnot, src: string) {
  const bytes = dataUrlToBytes(src)
  const img = src.startsWith('data:image/jpeg') ? await doc.embedJpg(bytes) : await doc.embedPng(bytes)
  const [x, y] = g.toPdf(a.x, a.y + a.h) // display bottom-left
  page.drawImage(img, { x, y, width: a.w, height: a.h, rotate: degrees(g.rotation) })
}

/** Burn all annotations into the PDF and return the new bytes. */
export async function applyAnnotations(
  bytes: ArrayBuffer,
  annotsIn: Annot[],
  geoms: PageGeom[],
  form?: { fields: FormField[]; values: FormValues; flatten: boolean },
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const pages = doc.getPages()
  let annots = annotsIn
  if (form && form.fields.length) {
    // fill the real fields; text the standard font can't show (Hindi etc.) is drawn on the page instead
    const drawInstead = await fillForm(doc, form.values, form.flatten)
    const drawn = form.fields.filter((f) => f.kind === 'text' && drawInstead.includes(f.name))
    annots = [...annotsIn, ...drawn.flatMap((f) => fieldToAnnots(f, form.values))]
  }
  const fonts = new Map<string, PDFFont>()
  const getFont = async (f: FontKey, b: boolean) => {
    const k = fontName(f, b)
    if (!fonts.has(k)) fonts.set(k, await doc.embedFont(k))
    return fonts.get(k)!
  }

  // whiteouts first so text/signatures placed on top of them stay visible
  const order = [...annots].sort((a, b) => Number(isWhiteout(b)) - Number(isWhiteout(a)))

  for (const a of order) {
    const page = pages[a.page]
    const g = geoms[a.page]
    if (!page || !g) continue

    if (a.type === 'rect') {
      const [x1, y1] = g.toPdf(a.x, a.y)
      const [x2, y2] = g.toPdf(a.x + a.w, a.y + a.h)
      const x = Math.min(x1, x2)
      const y = Math.min(y1, y2)
      const width = Math.abs(x2 - x1)
      const height = Math.abs(y2 - y1)
      if (a.variant === 'whiteout') {
        page.drawRectangle({ x, y, width, height, color: rgb(1, 1, 1) })
      } else if (a.variant === 'highlight') {
        page.drawRectangle({ x, y, width, height, color: hexToRgb(a.color), opacity: 0.4, blendMode: BlendMode.Multiply })
      } else {
        page.drawRectangle({ x, y, width, height, borderColor: hexToRgb(a.color), borderWidth: 1.5 })
      }
    } else if (a.type === 'path') {
      if (a.points.length < 2) continue
      const d = a.points
        .map(([px, py], i) => {
          const [X, Y] = g.toPdf(px, py)
          return `${i ? 'L' : 'M'}${X.toFixed(2)} ${(-Y).toFixed(2)}`
        })
        .join(' ')
      page.drawSvgPath(d, { x: 0, y: 0, borderColor: hexToRgb(a.color), borderWidth: a.width, borderLineCap: LineCapStyle.Round })
    } else if (a.type === 'image') {
      await drawImageBox(doc, page, g, a, a.src)
    } else if (a.type === 'text') {
      if (!a.text.trim()) continue
      const font = await getFont(a.font, a.bold)
      if (!canEncode(font, a.text.replace(/\n/g, ''))) {
        await drawImageBox(doc, page, g, a, textToPng(a))
        continue
      }
      a.text.split('\n').forEach((line, i) => {
        if (!line) return
        const [x, y] = g.toPdf(a.x + TEXT_PAD, a.y + TEXT_PAD + a.size * 0.88 + i * a.size * LINE_HEIGHT)
        page.drawText(line, { x, y, size: a.size, font, color: hexToRgb(a.color), rotate: degrees(g.rotation) })
      })
    }
  }
  return doc.save({ useObjectStreams: true })
}

/** Draw a form answer as page content (used for text the PDF's standard font can't encode). */
function fieldToAnnots(f: FormField, values: FormValues): TextAnnot[] {
  const v = values[f.name]
  let text = ''
  let size = fieldFontSize(f)
  let bold = false
  if (f.kind === 'text') text = String(v ?? '')
  else if (f.kind === 'select') text = f.options?.find((o) => o.value === v)?.label ?? String(v ?? '')
  else if (f.kind === 'checkbox' && v) text = '✓'
  else if (f.kind === 'radio' && v && v === f.onValue) text = '●'
  if (!text) return []
  if (f.kind === 'checkbox' || f.kind === 'radio') {
    size = Math.min(f.w, f.h) * (f.kind === 'radio' ? 0.7 : 0.9)
    bold = true
  }
  const lines = text.split('\n').length
  const h = size * LINE_HEIGHT * lines + TEXT_PAD * 2
  const centred = f.kind !== 'text' || !f.multiline
  const w = f.kind === 'checkbox' || f.kind === 'radio' ? size * 0.9 + TEXT_PAD * 2 : f.w
  return [
    {
      id: uid(),
      page: f.page,
      type: 'text',
      text,
      size,
      color: '#111827',
      font: 'sans',
      bold,
      x: f.kind === 'checkbox' || f.kind === 'radio' ? f.x + (f.w - w) / 2 : f.x,
      y: centred ? f.y + (f.h - h) / 2 : f.y,
      w,
      h,
    },
  ]
}

function isWhiteout(a: Annot) {
  return a.type === 'rect' && a.variant === 'whiteout'
}

/** Crop transparent (or white, when knockOutWhite) margins from a canvas and return a PNG data URL. */
export function trimCanvas(src: HTMLCanvasElement, knockOutWhite = false): string | null {
  const ctx = src.getContext('2d')!
  const { width, height } = src
  const data = ctx.getImageData(0, 0, width, height)
  const px = data.data
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (knockOutWhite) {
        const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
        if (lum > 200) px[i + 3] = 0
        else if (lum > 150) px[i + 3] = Math.round(px[i + 3] * ((200 - lum) / 50))
      }
      if (px[i + 3] > 10) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  if (knockOutWhite) ctx.putImageData(data, 0, 0)
  const pad = 4
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(width - 1, maxX + pad)
  maxY = Math.min(height - 1, maxY + pad)
  const out = document.createElement('canvas')
  out.width = maxX - minX + 1
  out.height = maxY - minY + 1
  out.getContext('2d')!.drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height)
  return out.toDataURL('image/png')
}

export const uid = () => Math.random().toString(36).slice(2, 10)

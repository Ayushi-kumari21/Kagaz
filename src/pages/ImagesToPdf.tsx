import { useEffect, useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import { FileDrop, Notice, ToolHeader } from '../components/ui'
import { canvasToBlob, downloadBlob, loadImage } from '../lib/pdf'
import { Icon } from '../components/icons'

interface Img {
  id: string
  file: File
  url: string
  rot: number
}
type PageSize = 'a4' | 'letter' | 'fit'
const SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const

function enhance(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // grayscale + contrast stretch: makes phone photos of paper look like scans
  const d = ctx.getImageData(0, 0, w, h)
  const p = d.data
  let lo = 255,
    hi = 0
  const hist = new Uint32Array(256)
  for (let i = 0; i < p.length; i += 4) {
    const g = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0
    hist[g]++
  }
  const total = w * h
  // ignore the darkest 2% and brightest 10% of pixels when stretching contrast
  let acc = 0
  for (let v = 0; v < 256; v++) {
    acc += hist[v]
    if (acc > total * 0.02) {
      lo = v
      break
    }
  }
  acc = 0
  for (let v = 255; v >= 0; v--) {
    acc += hist[v]
    if (acc > total * 0.1) {
      hi = v
      break
    }
  }
  const range = Math.max(1, hi - lo)
  for (let i = 0; i < p.length; i += 4) {
    const g = p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114
    const v = Math.max(0, Math.min(255, ((g - lo) / range) * 255))
    p[i] = p[i + 1] = p[i + 2] = v
  }
  ctx.putImageData(d, 0, 0)
}

export default function ImagesToPdf() {
  const [imgs, setImgs] = useState<Img[]>([])
  const [size, setSize] = useState<PageSize>('a4')
  const [margin, setMargin] = useState(18)
  const [scan, setScan] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => () => imgs.forEach((i) => URL.revokeObjectURL(i.url)), []) // eslint-disable-line

  const add = (files: File[]) => {
    const list = files.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name))
    if (list.length < files.length) setError('Some files were skipped because they are not images.')
    setImgs((prev) => [...prev, ...list.map((file) => ({ id: Math.random().toString(36).slice(2), file, url: URL.createObjectURL(file), rot: 0 }))])
  }

  const move = (i: number, d: -1 | 1) =>
    setImgs((prev) => {
      const a = [...prev]
      const j = i + d
      if (j < 0 || j >= a.length) return a
      ;[a[i], a[j]] = [a[j], a[i]]
      return a
    })

  const build = async () => {
    setBusy('Creating PDF…')
    setError('')
    try {
      const doc = await PDFDocument.create()
      for (let k = 0; k < imgs.length; k++) {
        setBusy(`Adding image ${k + 1} of ${imgs.length}…`)
        const it = imgs[k]
        const el = await loadImage(it.url)
        const swap = it.rot % 180 !== 0
        const scale = Math.min(1, 2200 / Math.max(el.naturalWidth, el.naturalHeight))
        const iw = el.naturalWidth * scale
        const ih = el.naturalHeight * scale
        const c = document.createElement('canvas')
        c.width = swap ? ih : iw
        c.height = swap ? iw : ih
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, c.width, c.height)
        ctx.translate(c.width / 2, c.height / 2)
        ctx.rotate((it.rot * Math.PI) / 180)
        ctx.drawImage(el, -iw / 2, -ih / 2, iw, ih)
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        if (scan) enhance(ctx, c.width, c.height)
        const jpg = await doc.embedJpg(new Uint8Array(await (await canvasToBlob(c, 'image/jpeg', 0.85)).arrayBuffer()))

        let pw: number, ph: number
        if (size === 'fit') {
          // ~150 dpi: image pixels → points
          pw = (c.width * 72) / 150 + margin * 2
          ph = (c.height * 72) / 150 + margin * 2
        } else {
          const [a, b] = SIZES[size]
          const landscape = c.width > c.height
          pw = landscape ? b : a
          ph = landscape ? a : b
        }
        const page = doc.addPage([pw, ph])
        const fit = Math.min((pw - margin * 2) / c.width, (ph - margin * 2) / c.height)
        const dw = c.width * fit
        const dh = c.height * fit
        page.drawImage(jpg, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh })
      }
      downloadBlob(await doc.save({ useObjectStreams: true }), imgs.length === 1 ? 'document.pdf' : 'images.pdf')
    } catch (e) {
      setError((e as Error).message || 'Could not create the PDF.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="tool">
      <ToolHeader title="Images to PDF" sub="Turn photos of documents, certificates or notes into one neat PDF." />
      <FileDrop accept="image/*" multiple onFiles={add} label={imgs.length ? 'Add more images' : 'Choose images'} compact={!!imgs.length} />
      {error && <Notice kind="error">{error}</Notice>}
      {imgs.length > 0 && (
        <>
          <div className="panel options">
            <label className="field">
              Page size
              <select className="input" value={size} onChange={(e) => setSize(e.target.value as PageSize)}>
                <option value="a4">A4</option>
                <option value="letter">Letter</option>
                <option value="fit">Same as image</option>
              </select>
            </label>
            <label className="field">
              Margin
              <select className="input" value={margin} onChange={(e) => setMargin(Number(e.target.value))}>
                <option value={0}>None</option>
                <option value={18}>Small</option>
                <option value={40}>Large</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={scan} onChange={(e) => setScan(e.target.checked)} />
              Make it look scanned (black &amp; white, sharper)
            </label>
          </div>
          <div className="thumb-grid">
            {imgs.map((it, i) => (
              <div key={it.id} className="thumb org-thumb">
                <div className="thumb-img">
                  <img src={it.url} alt="" style={{ transform: `rotate(${it.rot}deg)${it.rot % 180 ? " scale(0.72)" : ""}`, filter: scan ? 'grayscale(1) contrast(1.4)' : undefined }} />
                </div>
                <span>{i + 1}</span>
                <div className="thumb-actions">
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move left">
                    <Icon name="left" size={15} />
                  </button>
                  <button onClick={() => setImgs((p) => p.map((x) => (x.id === it.id ? { ...x, rot: (x.rot + 90) % 360 } : x)))} aria-label="Rotate">
                    <Icon name="rotateR" size={15} />
                  </button>
                  <button className="del" onClick={() => setImgs((p) => p.filter((x) => x.id !== it.id))} aria-label="Remove">
                    <Icon name="trash" size={15} />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === imgs.length - 1} aria-label="Move right">
                    <Icon name="right" size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="row end">
            <button className="btn primary lg" onClick={build} disabled={!!busy}>
              {busy || 'Create PDF'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

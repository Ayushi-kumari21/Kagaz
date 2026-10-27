import { useState } from 'react'
import JSZip from 'jszip'
import { FileDrop, Notice, Progress, ToolHeader } from '../components/ui'
import { baseName, canvasToBlob, closePdf, downloadBlob, openPdf, renderPage } from '../lib/pdf'

export default function PdfToImages() {
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<'jpeg' | 'png'>('jpeg')
  const [dpi, setDpi] = useState(150)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async () => {
    if (!file) return
    setBusy(true)
    setError('')
    setProgress(0)
    try {
      const doc = await openPdf(await file.arrayBuffer())
      const name = baseName(file.name)
      const ext = format === 'jpeg' ? 'jpg' : 'png'
      const blobs: Blob[] = []
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i)
        const canvas = await renderPage(page, dpi / 72)
        blobs.push(await canvasToBlob(canvas, `image/${format}`, 0.9))
        canvas.width = canvas.height = 0
        page.cleanup()
        setProgress(i / doc.numPages)
      }
      await closePdf(doc)
      if (blobs.length === 1) {
        downloadBlob(blobs[0], `${name}.${ext}`)
      } else {
        const zip = new JSZip()
        blobs.forEach((b, i) => zip.file(`${name}-page-${String(i + 1).padStart(3, '0')}.${ext}`, b))
        downloadBlob(await zip.generateAsync({ type: 'blob' }), `${name}-images.zip`, 'application/zip')
      }
    } catch {
      setError('Could not convert this PDF. It may be protected or damaged.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tool">
      <ToolHeader title="PDF to images" sub="Save each page as a JPG or PNG. Multiple pages download as a ZIP." />
      {!file ? (
        <FileDrop accept="application/pdf,.pdf" onFiles={(f) => setFile(f[0])} label="Choose PDF" />
      ) : (
        <div className="panel">
          <div className="row between wrap">
            <strong className="fl-name">{file.name}</strong>
            <button className="btn sm" onClick={() => setFile(null)}>
              Choose another
            </button>
          </div>
          <div className="options">
            <label className="field">
              Format
              <select className="input" value={format} onChange={(e) => setFormat(e.target.value as 'jpeg' | 'png')}>
                <option value="jpeg">JPG (smaller)</option>
                <option value="png">PNG (sharper)</option>
              </select>
            </label>
            <label className="field">
              Quality
              <select className="input" value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
                <option value={96}>Screen (96 DPI)</option>
                <option value={150}>Standard (150 DPI)</option>
                <option value={220}>High (220 DPI)</option>
                <option value={300}>Print (300 DPI)</option>
              </select>
            </label>
          </div>
          <div className="row end">
            <button className="btn primary lg" onClick={run} disabled={busy}>
              {busy ? 'Converting…' : 'Convert & download'}
            </button>
          </div>
          {busy && <Progress value={progress} label={`${Math.round(progress * 100)}%`} />}
        </div>
      )}
      {error && <Notice kind="error">{error}</Notice>}
    </div>
  )
}

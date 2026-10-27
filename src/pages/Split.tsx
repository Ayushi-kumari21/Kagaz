import { useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'
import { FileDrop, Notice, Progress, ToolHeader } from '../components/ui'
import { baseName, downloadBlob, parseRanges, renderThumbnails } from '../lib/pdf'

type Mode = 'extract' | 'each' | 'chunks'

function toRangeText(sel: number[]) {
  const s = [...sel].sort((a, b) => a - b).map((n) => n + 1)
  const parts: string[] = []
  for (let i = 0; i < s.length; i++) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
    parts.push(i === j ? `${s[i]}` : `${s[i]}-${s[j]}`)
    i = j
  }
  return parts.join(', ')
}

export default function Split() {
  const [file, setFile] = useState<File | null>(null)
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null)
  const [thumbs, setThumbs] = useState<string[]>([])
  const [progress, setProgress] = useState(0)
  const [ranges, setRanges] = useState('')
  const [mode, setMode] = useState<Mode>('extract')
  const [chunk, setChunk] = useState(2)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = async (f: File) => {
    setError('')
    setThumbs([])
    setRanges('')
    try {
      const buf = await f.arrayBuffer()
      setFile(f)
      setBytes(buf)
      setBusy('Loading pages…')
      const t = await renderThumbnails(buf, 130, (d, n) => setProgress(d / n))
      setThumbs(t)
    } catch {
      setError('Could not open this PDF.')
      setFile(null)
    } finally {
      setBusy('')
    }
  }

  let selected: number[] = []
  let rangeErr = ''
  if (ranges.trim() && thumbs.length) {
    try {
      selected = parseRanges(ranges, thumbs.length)
    } catch (e) {
      rangeErr = (e as Error).message
    }
  }

  const toggle = (i: number) => {
    const set = new Set(selected)
    if (set.has(i)) set.delete(i)
    else set.add(i)
    setRanges(toRangeText([...set]))
  }

  const run = async () => {
    if (!bytes || !file) return
    setBusy('Working…')
    setError('')
    try {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const name = baseName(file.name)
      const makeDoc = async (idx: number[]) => {
        const d = await PDFDocument.create()
        ;(await d.copyPages(src, idx)).forEach((p) => d.addPage(p))
        return d.save({ useObjectStreams: true })
      }
      if (mode === 'extract') {
        if (!selected.length) throw new Error('Select pages or type a range first.')
        downloadBlob(await makeDoc(selected), `${name}-pages-${toRangeText(selected).replace(/[ ,]+/g, '_')}.pdf`)
      } else {
        const zip = new JSZip()
        const n = src.getPageCount()
        const size = mode === 'each' ? 1 : Math.max(1, chunk)
        for (let s = 0; s < n; s += size) {
          const idx = Array.from({ length: Math.min(size, n - s) }, (_, k) => s + k)
          const label = idx.length === 1 ? `${idx[0] + 1}` : `${idx[0] + 1}-${idx[idx.length - 1] + 1}`
          zip.file(`${name}-${label}.pdf`, await makeDoc(idx))
        }
        downloadBlob(await zip.generateAsync({ type: 'blob' }), `${name}-split.zip`, 'application/zip')
      }
    } catch (e) {
      setError((e as Error).message || 'Split failed.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="tool">
      <ToolHeader title="Split PDF" sub="Extract the pages you need, or split a PDF into separate files." />
      {!file ? (
        <FileDrop accept="application/pdf,.pdf" onFiles={(f) => load(f[0])} label="Choose PDF" />
      ) : (
        <div className="panel">
          <div className="row between wrap">
            <strong className="fl-name">{file.name}</strong>
            <button className="btn sm" onClick={() => (setFile(null), setThumbs([]))}>
              Choose another
            </button>
          </div>
          <div className="seg">
            {(
              [
                ['extract', 'Extract pages'],
                ['each', 'Every page separately'],
                ['chunks', 'Every N pages'],
              ] as [Mode, string][]
            ).map(([m, l]) => (
              <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
                {l}
              </button>
            ))}
          </div>
          {mode === 'extract' && (
            <label className="field">
              Pages (tap thumbnails, or type like <code>1-3, 5</code>)
              <input className="input" value={ranges} onChange={(e) => setRanges(e.target.value)} placeholder="e.g. 1-3, 5" />
              {rangeErr && <span className="error-text">{rangeErr}</span>}
            </label>
          )}
          {mode === 'chunks' && (
            <label className="field">
              Pages per file
              <input className="input" type="number" min={1} value={chunk} onChange={(e) => setChunk(Number(e.target.value))} />
            </label>
          )}
          <div className="row end">
            <button className="btn primary lg" onClick={run} disabled={!!busy || !thumbs.length}>
              {mode === 'extract' ? 'Extract & download' : 'Split & download ZIP'}
            </button>
          </div>
        </div>
      )}
      {busy && (thumbs.length ? <Notice>{busy}</Notice> : <Progress value={progress} label={busy} />)}
      {error && <Notice kind="error">{error}</Notice>}
      {thumbs.length > 0 && (
        <div className="thumb-grid">
          {thumbs.map((t, i) => (
            <button
              key={i}
              className={`thumb ${mode === 'extract' && selected.includes(i) ? 'picked' : ''}`}
              onClick={() => mode === 'extract' && toggle(i)}
            >
              <img src={t} alt={`Page ${i + 1}`} />
              <span>{i + 1}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

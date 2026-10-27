import { useRef, useState } from 'react'
import { PDFDocument, degrees } from 'pdf-lib'
import { FileDrop, Notice, Progress, ToolHeader } from '../components/ui'
import { baseName, describePdfError, downloadBlob, renderThumbnails } from '../lib/pdf'
import { Icon } from '../components/icons'

interface PageItem {
  src: number // original page index
  rot: number // extra rotation in degrees
  thumb: string
}

export default function Organize() {
  const [file, setFile] = useState<File | null>(null)
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null)
  const [items, setItems] = useState<PageItem[]>([])
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const dragFrom = useRef<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  const load = async (f: File) => {
    setError('')
    try {
      const buf = await f.arrayBuffer()
      setFile(f)
      setBytes(buf)
      setBusy('Loading pages…')
      const t = await renderThumbnails(buf, 150, (d, n) => setProgress(d / n))
      setItems(t.map((thumb, i) => ({ src: i, rot: 0, thumb })))
    } catch (e) {
      console.error(e)
      setError(describePdfError(e))
      setFile(null)
    } finally {
      setBusy('')
    }
  }

  const update = (fn: (a: PageItem[]) => PageItem[]) => setItems((prev) => fn([...prev]))
  const rotate = (i: number, by: number) => update((a) => ((a[i] = { ...a[i], rot: (a[i].rot + by + 360) % 360 }), a))
  const remove = (i: number) => update((a) => (a.splice(i, 1), a))
  const move = (from: number, to: number) =>
    update((a) => {
      if (to < 0 || to >= a.length || from === to) return a
      const [x] = a.splice(from, 1)
      a.splice(to, 0, x)
      return a
    })

  const save = async () => {
    if (!bytes || !file) return
    setBusy('Saving…')
    try {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const out = await PDFDocument.create()
      const copied = await out.copyPages(src, items.map((i) => i.src))
      copied.forEach((p, k) => {
        const extra = items[k].rot
        if (extra) p.setRotation(degrees((p.getRotation().angle + extra) % 360))
        out.addPage(p)
      })
      downloadBlob(await out.save({ useObjectStreams: true }), `${baseName(file.name)}-organized.pdf`)
    } catch {
      setError('Saving failed. The PDF may be protected.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="tool wide">
      <ToolHeader title="Rotate, reorder & delete pages" sub="Drag pages to reorder. Use the buttons to rotate or remove." />
      {!file ? (
        <FileDrop accept="application/pdf,.pdf" onFiles={(f) => load(f[0])} label="Choose PDF" />
      ) : (
        <div className="panel row between wrap sticky-bar">
          <strong className="fl-name">{file.name}</strong>
          <div className="row">
            <button className="btn sm" onClick={() => update((a) => a.map((p) => ({ ...p, rot: (p.rot + 90) % 360 })))}>
              Rotate all
            </button>
            <button className="btn sm" onClick={() => (setFile(null), setItems([]))}>
              Choose another
            </button>
            <button className="btn primary" onClick={save} disabled={!items.length || !!busy}>
              Download PDF
            </button>
          </div>
        </div>
      )}
      {busy && !items.length && <Progress value={progress} label={busy} />}
      {busy && items.length > 0 && <Notice>{busy}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {file && !items.length && !busy && <Notice>All pages removed. Choose another file or reload.</Notice>}
      <div className="thumb-grid org">
        {items.map((p, i) => (
          <div
            key={`${p.src}-${i}`}
            className={`thumb org-thumb ${dragging === i ? 'dragging' : ''} ${over === i && dragging !== i ? 'drop-target' : ''}`}
            draggable
            onDragStart={() => {
              dragFrom.current = i
              setDragging(i)
            }}
            onDragEnd={() => (setDragging(null), setOver(null))}
            onDragOver={(e) => {
              e.preventDefault()
              if (over !== i) setOver(i)
            }}
            onDrop={() => {
              if (dragFrom.current !== null) move(dragFrom.current, i)
              dragFrom.current = null
              setDragging(null)
              setOver(null)
            }}
          >
            <div className="thumb-img">
              <img src={p.thumb} alt={`Page ${p.src + 1}`} style={{ transform: `rotate(${p.rot}deg)${p.rot % 180 ? " scale(0.72)" : ""}` }} />
            </div>
            <span>{i + 1}</span>
            <div className="thumb-actions">
              <button onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move left" title="Move left">
                <Icon name="left" size={15} />
              </button>
              <button onClick={() => rotate(i, -90)} aria-label="Rotate left" title="Rotate left">
                <Icon name="rotateL" size={15} />
              </button>
              <button onClick={() => rotate(i, 90)} aria-label="Rotate right" title="Rotate right">
                <Icon name="rotateR" size={15} />
              </button>
              <button onClick={() => remove(i)} aria-label="Delete page" title="Delete page" className="del">
                <Icon name="trash" size={15} />
              </button>
              <button onClick={() => move(i, i + 1)} disabled={i === items.length - 1} aria-label="Move right" title="Move right">
                <Icon name="right" size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

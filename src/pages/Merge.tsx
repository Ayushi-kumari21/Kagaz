import { useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import { FileDrop, Notice, ToolHeader } from '../components/ui'
import { describePdfError, downloadBlob, formatBytes, renderThumbnails } from '../lib/pdf'
import { Icon } from '../components/icons'

interface Item {
  id: string
  file: File
  pages: number
  thumb: string
}

export default function Merge() {
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const add = async (files: File[]) => {
    setError('')
    setBusy('Reading files…')
    const next: Item[] = []
    for (const file of files) {
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') continue
      try {
        const buf = await file.arrayBuffer()
        const d = await PDFDocument.load(buf, { ignoreEncryption: true })
        const [thumb] = await renderThumbnails(buf, 90, undefined, 1)
        next.push({ id: Math.random().toString(36).slice(2), file, pages: d.getPageCount(), thumb })
      } catch (e) {
        console.error(e)
        setError(`${file.name}: ${describePdfError(e)}`)
      }
    }
    setItems((prev) => [...prev, ...next])
    setBusy('')
  }

  const move = (i: number, dir: -1 | 1) => {
    setItems((prev) => {
      const a = [...prev]
      const j = i + dir
      if (j < 0 || j >= a.length) return a
      ;[a[i], a[j]] = [a[j], a[i]]
      return a
    })
  }

  const merge = async () => {
    setBusy('Merging…')
    setError('')
    try {
      const out = await PDFDocument.create()
      for (const it of items) {
        const src = await PDFDocument.load(await it.file.arrayBuffer(), { ignoreEncryption: true })
        const copied = await out.copyPages(src, src.getPageIndices())
        copied.forEach((p) => out.addPage(p))
      }
      downloadBlob(await out.save({ useObjectStreams: true }), 'merged.pdf')
    } catch {
      setError('Merging failed. One of the files may be protected or damaged.')
    } finally {
      setBusy('')
    }
  }

  const totalPages = items.reduce((s, i) => s + i.pages, 0)

  return (
    <div className="tool">
      <ToolHeader title="Merge PDF" sub="Combine PDFs into one file. Arrange them in the order you want." />
      <FileDrop accept="application/pdf,.pdf" multiple onFiles={add} label={items.length ? 'Add more PDFs' : 'Choose PDFs'} compact={!!items.length} />
      {busy && <Notice>{busy}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {items.length > 0 && (
        <>
          <ul className="file-list">
            {items.map((it, i) => (
              <li key={it.id}>
                <img src={it.thumb} alt="" className="mini-thumb" />
                <div className="fl-main">
                  <span className="fl-name">{it.file.name}</span>
                  <span className="muted">
                    {it.pages} page{it.pages === 1 ? '' : 's'}, {formatBytes(it.file.size)}
                  </span>
                </div>
                <div className="fl-actions">
                  <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                    <Icon name="up" size={16} />
                  </button>
                  <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down">
                    <Icon name="down" size={16} />
                  </button>
                  <button className="icon-btn" onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))} aria-label="Remove">
                    <Icon name="close" size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="row end">
            <span className="muted">{totalPages} pages total</span>
            <button className="btn primary lg" disabled={items.length < 2 || !!busy} onClick={merge}>
              Merge &amp; download
            </button>
          </div>
          {items.length < 2 && <p className="muted">Add at least two PDFs to merge.</p>}
        </>
      )}
    </div>
  )
}

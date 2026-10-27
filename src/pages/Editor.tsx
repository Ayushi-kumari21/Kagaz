import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { FileDrop, Notice, ToolHeader, toast } from '../components/ui'
import { Icon, type IconName } from '../components/icons'
import { SignatureModal } from '../components/SignatureModal'
import {
  applyAnnotations,
  FONT_CSS,
  LINE_HEIGHT,
  TEXT_PAD,
  uid,
  type Annot,
  type FontKey,
  type PageGeom,
  type TextAnnot,
} from '../lib/annotations'
import { baseName, closePdf, describePdfError, downloadBlob, loadImage, openPdf, renderPage, type PDFDocumentProxy } from '../lib/pdf'
import { extractFields, fieldFontSize, type FormField, type FormValues } from '../lib/forms'

type ToolId = 'select' | 'text' | 'whiteout' | 'highlight' | 'box' | 'draw' | 'check' | 'cross' | 'sign' | 'image'

const TOOLBAR: { id: ToolId; label: string; icon: IconName; tip: string }[] = [
  { id: 'select', label: 'Select', icon: 'cursor', tip: 'Select, move and resize' },
  { id: 'text', label: 'Text', icon: 'text', tip: 'Click on the page to type' },
  { id: 'sign', label: 'Sign', icon: 'sign', tip: 'Add a signature' },
  { id: 'whiteout', label: 'White-out', icon: 'eraser', tip: 'Drag to cover existing text' },
  { id: 'highlight', label: 'Highlight', icon: 'highlight', tip: 'Drag to highlight' },
  { id: 'draw', label: 'Draw', icon: 'draw', tip: 'Draw freehand' },
  { id: 'box', label: 'Box', icon: 'box', tip: 'Drag to draw a rectangle' },
  { id: 'check', label: 'Tick', icon: 'check', tip: 'Click to place a tick' },
  { id: 'cross', label: 'Cross', icon: 'cross', tip: 'Click to place a cross' },
  { id: 'image', label: 'Image', icon: 'image', tip: 'Insert a photo or stamp' },
]

const COLORS = ['#111827', '#1d4ed8', '#dc2626', '#047857', '#ffffff']
const HIGHLIGHTS = ['#fde047', '#86efac', '#93c5fd', '#f9a8d4']

interface PageInfo extends PageGeom {
  index: number
}

export default function Editor() {
  const { pathname } = useLocation()
  const signMode = pathname === '/sign-pdf'
  const fillMode = pathname === '/fill-pdf-form'

  const [fileName, setFileName] = useState('')
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [pages, setPages] = useState<PageInfo[]>([])
  const [annots, setAnnots] = useState<Annot[]>([])
  const [history, setHistory] = useState<Annot[][]>([])
  const [future, setFuture] = useState<Annot[][]>([])
  const [tool, setTool] = useState<ToolId>('select')
  const [selected, setSelected] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [fitZoom, setFitZoom] = useState(1)
  const [color, setColor] = useState(COLORS[0])
  const [hl, setHl] = useState(HIGHLIGHTS[0])
  const [size, setSize] = useState(14)
  const [font, setFont] = useState<FontKey>('sans')
  const [pending, setPending] = useState<{ src: string; w: number; h: number } | null>(null)
  const [showSign, setShowSign] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [fields, setFields] = useState<FormField[]>([])
  const [values, setValues] = useState<FormValues>({})
  const [flatten, setFlatten] = useState(false)
  const setValue = useCallback((name: string, v: string | boolean) => setValues((prev) => ({ ...prev, [name]: v })), [])
  const viewerRef = useRef<HTMLDivElement>(null)
  const imgInput = useRef<HTMLInputElement>(null)

  // ---------- history helpers ----------
  const annotsRef = useRef(annots)
  annotsRef.current = annots
  const commit = useCallback((next: Annot[] | ((prev: Annot[]) => Annot[])) => {
    setHistory((h) => [...h.slice(-60), annotsRef.current])
    setFuture([])
    setAnnots((prev) => (typeof next === 'function' ? next(prev) : next))
  }, [])
  /** Live update without a history entry (used while dragging/typing). */
  const patch = useCallback((id: string, p: Partial<Annot>) => {
    setAnnots((prev) => prev.map((a) => (a.id === id ? ({ ...a, ...p } as Annot) : a)))
  }, [])
  const snapshot = useCallback(() => {
    setHistory((h) => [...h.slice(-60), annotsRef.current])
    setFuture([])
  }, [])
  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h
      setFuture((f) => [annotsRef.current, ...f])
      setAnnots(h[h.length - 1])
      return h.slice(0, -1)
    })
    setSelected(null)
  }, [])
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f
      setHistory((h) => [...h, annotsRef.current])
      setAnnots(f[0])
      return f.slice(1)
    })
  }, [])

  // ---------- loading ----------
  const loadFile = async (file: File) => {
    setError('')
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) {
      setError('Please choose a PDF file.')
      return
    }
    setBusy('Opening PDF…')
    try {
      const buf = await file.arrayBuffer()
      const d = await openPdf(buf)
      const info: PageInfo[] = []
      for (let i = 1; i <= d.numPages; i++) {
        const p = await d.getPage(i)
        const vp = p.getViewport({ scale: 1 })
        info.push({
          index: i - 1,
          width: vp.width,
          height: vp.height,
          rotation: p.rotate,
          toPdf: (x, y) => vp.convertToPdfPoint(x, y) as [number, number],
        })
      }
      const form = await extractFields(d).catch(() => ({ fields: [] as FormField[], values: {} as FormValues }))
      closePdf(doc)
      setFields(form.fields)
      setValues(form.values)
      setFlatten(false)
      setDoc(d)
      setPages(info)
      setBytes(buf)
      setFileName(file.name)
      setAnnots([])
      setHistory([])
      setFuture([])
      setSelected(null)
      // fillable forms: start in Select so a tap goes straight into the form's own boxes
      setTool(signMode ? 'sign' : form.fields.length ? 'select' : 'text')
      if (signMode) setShowSign(true)
      if (form.fields.length)
        toast({ kind: 'info', title: 'Fillable form found', body: `Tap a blue box to fill it. ${new Set(form.fields.map((f) => f.name)).size} fields.` })
    } catch (e) {
      console.error(e)
      setError(describePdfError(e))
    } finally {
      setBusy('')
    }
  }

  // fit page width to the viewer (and keep fitting on resize/rotation unless the user zoomed manually)
  const fitRef = useRef(1)
  useLayoutEffect(() => {
    const el = viewerRef.current
    if (!pages.length || !el) return
    // fit the most common page width (a single landscape page shouldn't shrink everything)
    const counts = new Map<number, number>()
    pages.forEach((p) => counts.set(Math.round(p.width), (counts.get(Math.round(p.width)) || 0) + 1))
    const maxW = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
    const measure = () => {
      const avail = el.clientWidth - 24
      if (avail <= 0) return
      const z = Math.min(1.6, Math.max(0.3, avail / maxW))
      const prevFit = fitRef.current
      fitRef.current = z
      setZoom((cur) => (Math.abs(cur - prevFit) < 0.001 ? z : cur))
      setFitZoom(z)
    }
    fitRef.current = zoom
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages])

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT'
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !typing) {
        e.preventDefault()
        commit((prev) => prev.filter((a) => a.id !== selected))
        setSelected(null)
      } else if (e.key === 'Escape') {
        setSelected(null)
        setPending(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, undo, redo, commit])

  const selectedAnnot = annots.find((a) => a.id === selected) || null

  // apply toolbar style changes to the selected item
  const styleSelected = (p: Partial<TextAnnot> & { color?: string }) => {
    if (!selectedAnnot) return
    commit((prev) => prev.map((a) => (a.id === selectedAnnot.id ? ({ ...a, ...p } as Annot) : a)))
  }

  const chooseTool = (t: ToolId) => {
    setSelected(null)
    if (t === 'sign') {
      setShowSign(true)
    } else if (t === 'image') {
      imgInput.current?.click()
    } else {
      setPending(null)
    }
    setTool(t)
  }

  const preparePending = async (src: string) => {
    const img = await loadImage(src)
    const w = Math.min(180, img.naturalWidth)
    setPending({ src, w, h: (w * img.naturalHeight) / img.naturalWidth })
  }

  const onImagePicked = async (file: File) => {
    try {
      const img = await loadImage(file)
      // downscale big photos and normalise to PNG/JPEG data URL
      const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight))
      const c = document.createElement('canvas')
      c.width = img.naturalWidth * scale
      c.height = img.naturalHeight * scale
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      const isPng = file.type === 'image/png'
      await preparePending(isPng ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9))
      setTool('image')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const save = async () => {
    if (!bytes) return
    setBusy('Preparing your PDF…')
    setError('')
    try {
      const out = await applyAnnotations(bytes, annots, pages, fields.length ? { fields, values, flatten } : undefined)
      downloadBlob(out, `${baseName(fileName)}-${fields.length ? 'filled' : 'edited'}.pdf`)
    } catch (e) {
      console.error(e)
      const msg = 'Saving failed. If the PDF is password-protected, print it to a new PDF and try again.'
      setError(msg)
      toast({ kind: 'error', title: 'Could not save', body: msg })
    } finally {
      setBusy('')
    }
  }

  if (!doc) {
    return (
      <div className="tool">
        <ToolHeader
          title={signMode ? 'Sign PDF' : fillMode ? 'Fill PDF form' : 'Edit PDF'}
          sub={
            signMode
              ? 'Draw, type or upload your signature and place it anywhere. Free download, no watermark.'
              : fillMode
                ? 'Fill application forms online: type into the boxes, tick options, add your signature. Free download, no watermark.'
                : 'Fill forms, add text, signatures, ticks, highlights and white-out. Free download, no watermark.'
          }
        />
        <FileDrop accept="application/pdf,.pdf" onFiles={(f) => loadFile(f[0])} label="Choose PDF" />
        {busy && <Notice>{busy}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        <div className="how">
          <h2>How it works</h2>
          <ol>
            <li>Open your PDF. It stays on your device.</li>
            <li>
              <strong>Fillable form?</strong> Its boxes are highlighted in blue. Tap one and type, or tap a checkbox to tick it.
            </li>
            <li>
              <strong>Plain form with blank lines?</strong> Choose <em>Text</em>, tap on the line and type. Use <em>Tick</em> for
              checkboxes and <em>Sign</em> for your signature.
            </li>
            <li>Press Download. No signup and no payment.</li>
          </ol>
        </div>
      </div>
    )
  }

  const toolTip =
    tool === 'select' && fields.length ? 'Tap a blue box to fill it. Use Text for anything else.' : TOOLBAR.find((t) => t.id === tool)?.tip
  const formActive = tool === 'select' || tool === 'text'
  const filledCount = new Set(fields.filter((f) => values[f.name]).map((f) => f.name)).size
  const fieldCount = new Set(fields.map((f) => f.name)).size
  const showTextStyle = tool === 'text' || selectedAnnot?.type === 'text'
  const showInk = tool === 'draw' || tool === 'box' || tool === 'check' || tool === 'cross' || showTextStyle || (selectedAnnot && selectedAnnot.type !== 'image' && !(selectedAnnot.type === 'rect' && selectedAnnot.variant !== 'box'))
  const showHl = tool === 'highlight' || (selectedAnnot?.type === 'rect' && selectedAnnot.variant === 'highlight')

  return (
    <div className="editor">
      <div className="editor-bar">
        <div className="toolset" role="toolbar" aria-label="Editing tools">
          {TOOLBAR.map((t) => (
            <button
              key={t.id}
              className={`tool-btn ${tool === t.id ? 'active' : ''}`}
              onClick={() => chooseTool(t.id)}
              title={t.tip}
            >
              <span className="ti" aria-hidden>
                <Icon name={t.icon} size={20} />
              </span>
              <span className="tl">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="editor-actions">
          <button className="icon-btn" onClick={undo} disabled={!history.length} title="Undo (Ctrl+Z)" aria-label="Undo">
            <Icon name="undo" size={18} />
          </button>
          <button className="icon-btn" onClick={redo} disabled={!future.length} title="Redo" aria-label="Redo">
            <Icon name="redo" size={18} />
          </button>
          <button className="btn primary" onClick={save} disabled={!!busy}>
            <Icon name="download" size={18} />
            {busy ? 'Saving…' : 'Download PDF'}
          </button>
        </div>
      </div>

      <div className="style-bar">
        <span className="file-chip" title={fileName}>
          {fileName}
        </span>
        {showTextStyle && (
          <>
            <select
              className="input sm"
              value={selectedAnnot?.type === 'text' ? selectedAnnot.font : font}
              onChange={(e) => {
                const f = e.target.value as FontKey
                setFont(f)
                if (selectedAnnot?.type === 'text') styleSelected({ font: f })
              }}
              aria-label="Font"
            >
              <option value="sans">Sans</option>
              <option value="serif">Serif</option>
              <option value="mono">Mono</option>
            </select>
            <select
              className="input sm"
              value={selectedAnnot?.type === 'text' ? selectedAnnot.size : size}
              onChange={(e) => {
                const s = Number(e.target.value)
                setSize(s)
                if (selectedAnnot?.type === 'text') {
                  const lines = selectedAnnot.text.split('\n').length
                  styleSelected({ size: s, h: lines * s * LINE_HEIGHT + TEXT_PAD * 2 })
                }
              }}
              aria-label="Text size"
            >
              {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {selectedAnnot?.type === 'text' && (
              <button
                className={`icon-btn ${selectedAnnot.bold ? 'on' : ''}`}
                onClick={() => styleSelected({ bold: !selectedAnnot.bold })}
                title="Bold"
              >
                <b>B</b>
              </button>
            )}
          </>
        )}
        {showInk && (
          <div className="swatches">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`swatch ${(selectedAnnot && 'color' in selectedAnnot ? selectedAnnot.color : color) === c ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => {
                  setColor(c)
                  styleSelected({ color: c })
                }}
                aria-label={`Colour ${c}`}
              />
            ))}
          </div>
        )}
        {showHl && (
          <div className="swatches">
            {HIGHLIGHTS.map((c) => (
              <button
                key={c}
                className={`swatch ${hl === c ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => {
                  setHl(c)
                  styleSelected({ color: c })
                }}
                aria-label={`Highlight ${c}`}
              />
            ))}
          </div>
        )}
        {selectedAnnot && (
          <button
            className="btn danger sm"
            onClick={() => {
              commit((prev) => prev.filter((a) => a.id !== selectedAnnot.id))
              setSelected(null)
            }}
          >
            Delete
          </button>
        )}
        <div className="zoom">
          <button className="icon-btn" onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))} aria-label="Zoom out">
            −
          </button>
          <button className="zoom-val" onClick={() => setZoom(fitZoom)} title="Fit width">
            {Math.round(zoom * 100)}%
          </button>
          <button className="icon-btn" onClick={() => setZoom((z) => Math.min(3, z + 0.15))} aria-label="Zoom in">
            +
          </button>
        </div>
      </div>

      <p className="tool-tip">
        {pending ? 'Tap on the page where you want to place it.' : toolTip}
        {error && <span className="error-text"> {error}</span>}
      </p>

      {fields.length > 0 && (
        <div className="form-banner">
          <span>
            <strong>Fillable form detected.</strong> {filledCount} of {fieldCount} fields filled
            <span className="form-meter" aria-hidden>
              <i style={{ width: `${fieldCount ? (filledCount / fieldCount) * 100 : 0}%` }} />
            </span>
          </span>
          <label className="check">
            <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
            Lock answers in the downloaded file
          </label>
        </div>
      )}

      <div className="viewer" ref={viewerRef} onPointerDown={() => setSelected(null)}>
        {pages.map((p) => (
          <PageView
            key={p.index}
            doc={doc}
            page={p}
            zoom={zoom}
            tool={tool}
            annots={annots.filter((a) => a.page === p.index)}
            selected={selected}
            setSelected={setSelected}
            commit={commit}
            patch={patch}
            snapshot={snapshot}
            color={color}
            hl={hl}
            size={size}
            font={font}
            pending={pending}
            clearPending={() => {
              setPending(null)
              setTool('select')
            }}
            focusId={focusId}
            setFocusId={setFocusId}
            fields={fields.filter((f) => f.page === p.index)}
            hasForm={fields.length > 0}
            values={values}
            setValue={setValue}
            formActive={formActive}
          />
        ))}
        <div className="viewer-end">
          <button className="btn primary lg" onClick={save} disabled={!!busy}>
            Download PDF
          </button>
          <button
            className="btn"
            onClick={() => {
              if ((annots.length || filledCount) && !confirm('Close this PDF? Your edits will be lost.')) return
              closePdf(doc)
              setDoc(null)
              setBytes(null)
            }}
          >
            Open another PDF
          </button>
        </div>
      </div>

      <input
        ref={imgInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onImagePicked(f)
          e.target.value = ''
        }}
      />

      {showSign && (
        <SignatureModal
          onClose={() => {
            setShowSign(false)
            if (!pending) setTool('select')
          }}
          onDone={async (src) => {
            setShowSign(false)
            await preparePending(src)
            setTool('sign')
          }}
        />
      )}
    </div>
  )
}

// =====================================================================

interface PageViewProps {
  doc: PDFDocumentProxy
  page: PageInfo
  zoom: number
  tool: ToolId
  annots: Annot[]
  selected: string | null
  setSelected: (id: string | null) => void
  commit: (next: Annot[] | ((prev: Annot[]) => Annot[])) => void
  patch: (id: string, p: Partial<Annot>) => void
  snapshot: () => void
  color: string
  hl: string
  size: number
  font: FontKey
  pending: { src: string; w: number; h: number } | null
  clearPending: () => void
  focusId: string | null
  setFocusId: (id: string | null) => void
  fields: FormField[]
  hasForm: boolean
  values: FormValues
  setValue: (name: string, v: string | boolean) => void
  formActive: boolean
}

function PageView(props: PageViewProps) {
  const { doc, page, zoom, tool, annots, pending } = props
  const holder = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [draft, setDraft] = useState<Annot | null>(null)
  const draftRef = useRef<Annot | null>(null)

  // only render pages near the screen (keeps big PDFs fast on phones)
  useEffect(() => {
    const el = holder.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || !holder.current) return
    let cancelled = false
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    ;(async () => {
      const p = await doc.getPage(page.index + 1)
      const canvas = await renderPage(p, zoom * ratio, undefined, props.hasForm)
      if (cancelled || !holder.current) return
      canvas.className = 'page-canvas'
      const old = holder.current.querySelector('canvas')
      if (old) old.replaceWith(canvas)
      else holder.current.prepend(canvas)
    })().catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, zoom, doc, page.index])

  const toPage = (e: { clientX: number; clientY: number }) => {
    const r = overlay.current!.getBoundingClientRect()
    return [
      Math.min(page.width, Math.max(0, (e.clientX - r.left) / zoom)),
      Math.min(page.height, Math.max(0, (e.clientY - r.top) / zoom)),
    ] as const
  }

  const onDown = (e: React.PointerEvent) => {
    if (tool === 'select' && !pending) return
    e.stopPropagation()
    // stop the browser's default focus handling, which would immediately blur a new text box
    e.preventDefault()
    const [x, y] = toPage(e)
    const id = uid()

    if (pending && (tool === 'sign' || tool === 'image')) {
      const w = Math.min(pending.w, page.width * 0.8)
      const h = (w * pending.h) / pending.w
      props.commit((prev) => [...prev, { id, page: page.index, type: 'image', src: pending.src, x: Math.max(0, x - w / 2), y: Math.max(0, y - h / 2), w, h }])
      props.setSelected(id)
      props.clearPending()
      return
    }
    if (tool === 'text' || tool === 'check' || tool === 'cross') {
      const isMark = tool !== 'text'
      const s = isMark ? Math.max(props.size, 16) : props.size
      const a: TextAnnot = {
        id,
        page: page.index,
        type: 'text',
        text: isMark ? (tool === 'check' ? '✓' : '✗') : '',
        size: s,
        color: props.color === '#ffffff' ? '#111827' : props.color,
        font: props.font,
        bold: isMark,
        x: Math.max(0, x - (isMark ? s * 0.4 : 2)),
        y: Math.max(0, y - s * 0.7),
        w: isMark ? s * 1.1 : Math.min(220, page.width - x + 2),
        h: s * LINE_HEIGHT + TEXT_PAD * 2,
      }
      props.commit((prev) => [...prev, a])
      props.setSelected(id)
      if (!isMark) props.setFocusId(id)
      return
    }
    if (tool === 'whiteout' || tool === 'highlight' || tool === 'box' || tool === 'draw') {
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
      const d: Annot =
        tool === 'draw'
          ? { id, page: page.index, type: 'path', points: [[x, y]], color: props.color, width: 2, x, y, w: 0, h: 0 }
          : {
              id,
              page: page.index,
              type: 'rect',
              variant: tool,
              color: tool === 'highlight' ? props.hl : props.color,
              x,
              y,
              w: 0,
              h: 0,
            }
      draftRef.current = d
      setDraft(d)
      const start = [x, y] as const
      const move = (ev: PointerEvent) => {
        const [mx, my] = toPage(ev)
        const cur = draftRef.current
        if (!cur) return
        let next: Annot
        if (cur.type === 'path') {
          next = { ...cur, points: [...cur.points, [mx, my]] }
        } else {
          next = { ...cur, x: Math.min(start[0], mx), y: Math.min(start[1], my), w: Math.abs(mx - start[0]), h: Math.abs(my - start[1]) }
        }
        draftRef.current = next
        setDraft(next)
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        const cur = draftRef.current
        draftRef.current = null
        setDraft(null)
        if (!cur) return
        if (cur.type === 'path') {
          if (cur.points.length < 2) return
          const xs = cur.points.map((p) => p[0])
          const ys = cur.points.map((p) => p[1])
          const bx = Math.min(...xs)
          const by = Math.min(...ys)
          props.commit((prev) => [...prev, { ...cur, x: bx, y: by, w: Math.max(...xs) - bx, h: Math.max(...ys) - by }])
        } else if (cur.w > 3 && cur.h > 3) {
          props.commit((prev) => [...prev, cur])
        }
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
  }

  const all = draft ? [...annots, draft] : annots
  const drawingTool = tool !== 'select'

  return (
    <div className="page-wrap" style={{ width: page.width * zoom }}>
      <div ref={holder} className="page" style={{ width: page.width * zoom, height: page.height * zoom }}>
        <div
          ref={overlay}
          className={`overlay ${drawingTool ? 'drawing' : ''} tool-${tool}`}
          onPointerDown={onDown}
        >
          <svg className="paths" width={page.width * zoom} height={page.height * zoom}>
            {all
              .filter((a) => a.type === 'path')
              .map((a) =>
                a.type === 'path' ? (
                  <polyline
                    key={a.id}
                    points={a.points.map(([x, y]) => `${x * zoom},${y * zoom}`).join(' ')}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={a.width * zoom}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null,
              )}
          </svg>
          {props.fields.length > 0 && (
            <FormLayer fields={props.fields} values={props.values} setValue={props.setValue} zoom={zoom} active={props.formActive} />
          )}
          {all.map((a) => (
            <AnnotView key={a.id} a={a} {...props} pageW={page.width} pageH={page.height} />
          ))}
        </div>
      </div>
      <div className="page-num">Page {page.index + 1}</div>
    </div>
  )
}

function AnnotView({
  a,
  zoom,
  selected,
  setSelected,
  patch,
  snapshot,
  commit,
  tool,
  pageW,
  pageH,
  focusId,
  setFocusId,
}: PageViewProps & { a: Annot; pageW: number; pageH: number }) {
  const isSel = selected === a.id
  const taRef = useRef<HTMLTextAreaElement>(null)
  const typedSinceFocus = useRef(false)
  // while a placing tool is active, clicks go to the page (e.g. typing on top of a white-out)
  const passive = tool !== 'select' && !(tool === 'text' && a.type === 'text')

  useEffect(() => {
    if (focusId === a.id && taRef.current) {
      taRef.current.focus({ preventScroll: true })
      setFocusId(null)
    }
  }, [focusId, a.id, setFocusId])

  const startDrag = (e: React.PointerEvent, mode: 'move' | 'resize') => {
    e.stopPropagation()
    e.preventDefault()
    setSelected(a.id)
    const sx = e.clientX
    const sy = e.clientY
    const o = { x: a.x, y: a.y, w: a.w, h: a.h }
    const ratio = a.w / Math.max(1, a.h)
    let moved = false
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / zoom
      const dy = (ev.clientY - sy) / zoom
      if (!moved) {
        if (Math.abs(dx) + Math.abs(dy) < 1) return
        moved = true
        snapshot()
      }
      if (mode === 'move') {
        const nx = Math.min(pageW - Math.min(o.w, 10), Math.max(-o.w + 10, o.x + dx))
        const ny = Math.min(pageH - Math.min(o.h, 10), Math.max(-o.h + 10, o.y + dy))
        if (a.type === 'path') {
          patch(a.id, { x: nx, y: ny, points: a.points.map(([px, py]) => [px + nx - o.x, py + ny - o.y]) } as Partial<Annot>)
        } else patch(a.id, { x: nx, y: ny })
      } else {
        let w = Math.max(12, o.w + dx)
        let h = Math.max(8, o.h + dy)
        if (a.type === 'image') h = w / ratio
        if (a.type === 'text') {
          // resizing text scales the font
          const s = Math.max(6, Math.min(96, (a.size * w) / o.w))
          const lines = a.text.split('\n').length
          patch(a.id, { w, size: s, h: lines * s * LINE_HEIGHT + TEXT_PAD * 2 } as Partial<Annot>)
          return
        }
        patch(a.id, { w, h })
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const style: React.CSSProperties = {
    left: a.x * zoom,
    top: a.y * zoom,
    width: a.w * zoom,
    height: a.h * zoom,
    pointerEvents: passive ? 'none' : 'auto',
  }

  const handle = isSel && a.type !== 'path' && (
    <span className="resize" onPointerDown={(e) => startDrag(e, 'resize')} aria-label="Resize" />
  )

  if (a.type === 'path') {
    return (
      <div
        className={`annot path-hit ${isSel ? 'sel' : ''}`}
        style={{ ...style, left: (a.x - 4) * zoom, top: (a.y - 4) * zoom, width: (a.w + 8) * zoom, height: (a.h + 8) * zoom }}
        onPointerDown={(e) => startDrag(e, 'move')}
      />
    )
  }
  if (a.type === 'rect') {
    const bg =
      a.variant === 'whiteout' ? '#ffffff' : a.variant === 'highlight' ? a.color : 'transparent'
    return (
      <div
        className={`annot rect ${a.variant} ${isSel ? 'sel' : ''}`}
        style={{ ...style, background: bg, borderColor: a.variant === 'box' ? a.color : undefined, borderWidth: a.variant === 'box' ? 1.5 * zoom : undefined }}
        onPointerDown={(e) => startDrag(e, 'move')}
      >
        {handle}
      </div>
    )
  }
  if (a.type === 'image') {
    return (
      <div className={`annot img ${isSel ? 'sel' : ''}`} style={style} onPointerDown={(e) => startDrag(e, 'move')}>
        <img src={a.src} alt="" draggable={false} />
        {handle}
      </div>
    )
  }
  // text
  return (
    <div
      className={`annot text ${isSel ? 'sel' : ''}`}
      style={style}
      onPointerDown={(e) => {
        e.stopPropagation()
        if (!isSel) startDrag(e, 'move')
      }}
    >
      {isSel && (
        <span className="grip" onPointerDown={(e) => startDrag(e, 'move')} title="Drag to move">
          ⠿
        </span>
      )}
      <textarea
        ref={taRef}
        value={a.text}
        spellCheck={false}
        placeholder={isSel ? 'Type here' : ''}
        onFocus={() => {
          setSelected(a.id)
          typedSinceFocus.current = false
        }}
        onChange={(e) => {
          if (!typedSinceFocus.current) {
            typedSinceFocus.current = true
            snapshot()
          }
          const text = e.target.value
          const lines = text.split('\n')
          // grow the box to fit the longest line
          const ctx = measureCtx()
          ctx.font = `${a.bold ? 'bold ' : ''}${a.size}px ${FONT_CSS[a.font]}`
          const need = Math.max(...lines.map((l) => ctx.measureText(l).width)) + TEXT_PAD * 2 + 4
          patch(a.id, {
            text,
            w: Math.max(a.w, Math.min(pageW - a.x, need)),
            h: lines.length * a.size * LINE_HEIGHT + TEXT_PAD * 2,
          } as Partial<Annot>)
        }}
        onBlur={() => {
          if (!a.text.trim()) commit((prev) => prev.filter((x) => x.id !== a.id))
        }}
        style={{
          fontSize: a.size * zoom,
          lineHeight: LINE_HEIGHT,
          fontFamily: FONT_CSS[a.font],
          fontWeight: a.bold ? 700 : 400,
          color: a.color,
          padding: TEXT_PAD * zoom,
          pointerEvents: isSel ? 'auto' : 'none',
        }}
      />
      {handle}
    </div>
  )
}

let _ctx: CanvasRenderingContext2D | null = null
function measureCtx() {
  if (!_ctx) _ctx = document.createElement('canvas').getContext('2d')!
  return _ctx
}

// =====================================================================
// Fillable form fields, drawn as real inputs over the page

function FormLayer({
  fields,
  values,
  setValue,
  zoom,
  active,
}: {
  fields: FormField[]
  values: FormValues
  setValue: (name: string, v: string | boolean) => void
  zoom: number
  active: boolean
}) {
  return (
    <div className="form-layer">
      {fields.map((f) => {
        const style: React.CSSProperties = {
          left: f.x * zoom,
          top: f.y * zoom,
          width: f.w * zoom,
          height: f.h * zoom,
          pointerEvents: active ? 'auto' : 'none',
        }
        const stop = (e: React.PointerEvent) => e.stopPropagation()
        const label = f.name.replace(/[._\[\]0-9]+/g, ' ').trim() || 'Form field'
        const v = values[f.name]

        if (f.kind === 'text') {
          const fs = fieldFontSize(f) * zoom
          const common = {
            className: 'ff ff-text',
            style: {
              ...style,
              fontSize: fs,
              textAlign: f.align,
              ...(f.comb && f.maxLen
                ? { fontFamily: 'Courier New, monospace', letterSpacing: Math.max(0, (f.w * zoom) / f.maxLen - fs * 0.6), paddingLeft: Math.max(0, ((f.w * zoom) / f.maxLen - fs * 0.6) / 2) }
                : {}),
            },
            value: String(v ?? ''),
            maxLength: f.maxLen,
            readOnly: f.readOnly,
            'aria-label': label,
            title: label,
            onPointerDown: stop,
            spellCheck: false,
          }
          return f.multiline ? (
            <textarea key={f.id} {...common} onChange={(e) => setValue(f.name, e.target.value)} />
          ) : (
            <input key={f.id} {...common} onChange={(e) => setValue(f.name, e.target.value)} />
          )
        }
        if (f.kind === 'checkbox' || f.kind === 'radio') {
          const on = f.kind === 'checkbox' ? !!v : !!v && v === f.onValue
          return (
            <button
              key={f.id}
              type="button"
              role={f.kind}
              aria-checked={on}
              aria-label={label}
              title={label}
              disabled={f.readOnly}
              className={`ff ff-${f.kind} ${on ? 'on' : ''}`}
              style={{ ...style, fontSize: Math.min(f.w, f.h) * zoom * 0.85 }}
              onPointerDown={stop}
              onClick={() => {
                if (f.kind === 'checkbox') setValue(f.name, !v)
                else setValue(f.name, on ? '' : f.onValue || '')
              }}
            >
              {on ? (f.kind === 'checkbox' ? '✓' : '●') : ''}
            </button>
          )
        }
        return (
          <select
            key={f.id}
            className="ff ff-select"
            style={{ ...style, fontSize: Math.max(6, Math.min(12, f.h * 0.6)) * zoom }}
            value={String(v ?? '')}
            disabled={f.readOnly}
            aria-label={label}
            title={label}
            onPointerDown={stop}
            onChange={(e) => setValue(f.name, e.target.value)}
          >
            <option value="">—</option>
            {(f.options || []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )
      })}
    </div>
  )
}

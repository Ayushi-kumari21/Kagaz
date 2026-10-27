import { useEffect, useRef, useState } from 'react'
import { trimCanvas } from '../lib/annotations'
import { loadImage } from '../lib/pdf'
import { Icon } from './icons'

const STORE_KEY = 'kagaz.signatures'
const SIGN_FONTS = ['Caveat', 'Dancing Script', 'Great Vibes']

function loadSaved(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '[]')
  } catch {
    return []
  }
}
function storeSaved(list: string[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 6)))
  } catch {
    /* storage unavailable: signatures just won't be remembered */
  }
}

export function SignatureModal({
  onDone,
  onClose,
  title = 'Add your signature',
}: {
  onDone: (dataUrl: string) => void
  onClose: () => void
  title?: string
}) {
  const [tab, setTab] = useState<'draw' | 'type' | 'upload'>('draw')
  const [saved, setSaved] = useState<string[]>(loadSaved)
  const [remember, setRemember] = useState(true)
  const [ink, setInk] = useState('#111827')
  const [name, setName] = useState('')
  const [font, setFont] = useState(SIGN_FONTS[0])
  const [err, setErr] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasInk = useRef(false)

  useEffect(() => {
    const c = canvasRef.current
    if (!c || tab !== 'draw') return
    const ratio = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    c.width = rect.width * ratio
    c.height = rect.height * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    hasInk.current = false
  }, [tab])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }

  const finish = (dataUrl: string | null) => {
    if (!dataUrl) {
      setErr('Nothing to add yet.')
      return
    }
    if (remember) {
      const next = [dataUrl, ...saved.filter((s) => s !== dataUrl)]
      storeSaved(next)
    }
    onDone(dataUrl)
  }

  const handleDrawn = () => {
    if (!hasInk.current) return setErr('Draw your signature in the box first.')
    finish(trimCanvas(canvasRef.current!))
  }

  const handleTyped = async () => {
    if (!name.trim()) return setErr('Type your name first.')
    await document.fonts.load(`64px "${font}"`).catch(() => {})
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')!
    ctx.font = `96px "${font}", cursive`
    const w = ctx.measureText(name).width
    c.width = Math.ceil(w + 40)
    c.height = 160
    ctx.font = `96px "${font}", cursive`
    ctx.fillStyle = ink
    ctx.textBaseline = 'middle'
    ctx.fillText(name, 20, 80)
    finish(trimCanvas(c))
  }

  const handleUpload = async (file: File) => {
    try {
      const img = await loadImage(file)
      const scale = Math.min(1, 1200 / img.naturalWidth)
      const c = document.createElement('canvas')
      c.width = img.naturalWidth * scale
      c.height = img.naturalHeight * scale
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      finish(trimCanvas(c, true))
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>

        {saved.length > 0 && (
          <div className="saved-sigs">
            <span className="muted">Saved:</span>
            {saved.map((s, i) => (
              <div key={i} className="saved-sig">
                <button onClick={() => onDone(s)} title="Use this signature">
                  <img src={s} alt={`Saved signature ${i + 1}`} />
                </button>
                <button
                  className="x"
                  aria-label="Remove saved signature"
                  onClick={() => {
                    const next = saved.filter((_, j) => j !== i)
                    setSaved(next)
                    storeSaved(next)
                  }}
                >
                  <Icon name="close" size={11} strokeWidth={3} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="tabs">
          {(['draw', 'type', 'upload'] as const).map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => (setTab(t), setErr(''))}>
              {t === 'draw' ? 'Draw' : t === 'type' ? 'Type' : 'Upload photo'}
            </button>
          ))}
        </div>

        {tab !== 'upload' && (
          <div className="ink-row">
            {['#111827', '#1d3a8a', '#0b5d3b'].map((c) => (
              <button
                key={c}
                className={`swatch ${ink === c ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => setInk(c)}
                aria-label="Ink colour"
              />
            ))}
          </div>
        )}

        {tab === 'draw' && (
          <>
            <canvas
              ref={canvasRef}
              className="sig-pad"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                drawing.current = true
                const ctx = canvasRef.current!.getContext('2d')!
                const [x, y] = pos(e)
                ctx.strokeStyle = ink
                ctx.lineWidth = 2.6
                ctx.beginPath()
                ctx.moveTo(x, y)
                ctx.lineTo(x + 0.1, y + 0.1)
                ctx.stroke()
                hasInk.current = true
                setErr('')
              }}
              onPointerMove={(e) => {
                if (!drawing.current) return
                const ctx = canvasRef.current!.getContext('2d')!
                const [x, y] = pos(e)
                ctx.lineTo(x, y)
                ctx.stroke()
              }}
              onPointerUp={() => (drawing.current = false)}
              onPointerCancel={() => (drawing.current = false)}
            />
            <div className="row between">
              <button
                className="btn"
                onClick={() => {
                  const c = canvasRef.current!
                  c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
                  hasInk.current = false
                }}
              >
                Clear
              </button>
              <button className="btn primary" onClick={handleDrawn}>
                Use signature
              </button>
            </div>
          </>
        )}

        {tab === 'type' && (
          <>
            <input
              className="input"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <div className="font-picks">
              {SIGN_FONTS.map((f) => (
                <button
                  key={f}
                  className={font === f ? 'on' : ''}
                  style={{ fontFamily: `"${f}", cursive`, color: ink }}
                  onClick={() => setFont(f)}
                >
                  {name || 'Your name'}
                </button>
              ))}
            </div>
            <div className="row end">
              <button className="btn primary" onClick={handleTyped}>
                Use signature
              </button>
            </div>
          </>
        )}

        {tab === 'upload' && (
          <label className="drop compact">
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
            <span className="btn primary">Choose photo of signature</span>
            <span className="drop-hint">Sign on white paper and take a photo. The white background is removed for you.</span>
          </label>
        )}

        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember on this device
        </label>
        {err && <p className="error-text">{err}</p>}
      </div>
    </div>
  )
}

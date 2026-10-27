import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { TOOLS } from '../tools'
import { Icon, type IconName } from './icons'
import { formatBytes } from '../lib/pdf'

// ---------------------------------------------------------------- layout

export function Layout() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    window.scrollTo(0, 0)
    setOpen(false)
  }, [pathname])
  useEffect(() => {
    document.body.classList.toggle('sheet-open', open)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Kagaz home">
          <BrandMark />
          <span>Kagaz</span>
        </Link>
        <nav className="nav" aria-label="Tools">
          {TOOLS.filter((t) => t.nav).map((t) => (
            <NavLink key={t.path} to={t.path}>
              {t.short}
            </NavLink>
          ))}
        </nav>
        <button className="menu-btn" onClick={() => setOpen(true)} aria-expanded={open} aria-label="All tools">
          <Icon name="menu" />
        </button>
      </header>

      {/* phone menu: slides up from the bottom */}
      <div className={`sheet-back ${open ? 'show' : ''}`} onClick={() => setOpen(false)} aria-hidden={!open} />
      <div className={`sheet ${open ? 'show' : ''}`} role="dialog" aria-label="All tools" aria-hidden={!open}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>All tools</h2>
          <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-list">
          {TOOLS.map((t, i) => (
            <NavLink key={t.path} to={t.path} style={{ ['--i' as string]: i }} tabIndex={open ? 0 : -1}>
              <span className="tool-icon sm">
                <Icon name={t.icon} size={18} />
              </span>
              {t.title}
            </NavLink>
          ))}
        </div>
      </div>

      <main>
        <div className="page-enter" key={pathname}>
          <Outlet />
        </div>
      </main>
      <footer className="footer">
        <p>
          <Icon name="lock" size={16} /> Files never leave your device. Kagaz is free, with no signup and no watermark.
        </p>
        <p className="footer-links">
          <Link to="/privacy">Privacy</Link>
          <Link to="/about">About</Link>
        </p>
      </footer>
      <ToastHost />
    </div>
  )
}

function BrandMark() {
  // a folded paper corner with a highlighter stripe
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden>
      <path d="M7 3h13l7 7v17a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="var(--sheet)" stroke="var(--ink)" strokeWidth="1.8" />
      <path d="M20 3v7h7" fill="none" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round" />
      <rect x="9" y="15" width="14" height="5" rx="1" fill="var(--marker)" />
      <path d="M10 23.5h9" stroke="var(--pen)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

// ---------------------------------------------------------------- toasts

interface Toast {
  id: number
  kind: 'ok' | 'error' | 'info'
  title: string
  body?: string
  leaving?: boolean
}

/** Show a slide-up pop-up from anywhere: toast({ title: 'Saved' }). */
export function toast(t: Omit<Toast, 'id'>) {
  window.dispatchEvent(new CustomEvent('kagaz:toast', { detail: t }))
}

function ToastHost() {
  const [items, setItems] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 260)
  }, [])

  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = nextId.current++
      setItems((list) => [...list.slice(-2), { ...t, id }])
      setTimeout(() => dismiss(id), t.kind === 'error' ? 7000 : 4200)
    },
    [dismiss],
  )

  useEffect(() => {
    const onDownload = (e: Event) => {
      const { filename, size } = (e as CustomEvent).detail
      push({ kind: 'ok', title: 'Downloaded', body: `${filename} (${formatBytes(size)})` })
    }
    const onToast = (e: Event) => push((e as CustomEvent).detail)
    window.addEventListener('kagaz:download', onDownload)
    window.addEventListener('kagaz:toast', onToast)
    return () => {
      window.removeEventListener('kagaz:download', onDownload)
      window.removeEventListener('kagaz:toast', onToast)
    }
  }, [push])

  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind} ${t.leaving ? 'leaving' : ''}`} role="status">
          <span className="toast-icon">
            <Icon name={t.kind === 'error' ? 'alert' : 'ok'} size={20} />
          </span>
          <span className="toast-text">
            <strong>{t.title}</strong>
            {t.body && <span>{t.body}</span>}
          </span>
          <button className="toast-x" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- shared bits

export function ToolHeader({ title, sub, icon }: { title: string; sub: string; icon?: IconName }) {
  useEffect(() => {
    document.title = `${title}: free, no watermark | Kagaz`
  }, [title])
  const tool = TOOLS.find((t) => t.title === title)
  const name = icon ?? tool?.icon
  return (
    <div className="tool-head">
      {name && (
        <span className="tool-icon lg" aria-hidden>
          <Icon name={name} size={28} />
        </span>
      )}
      <h1>{title}</h1>
      <p>{sub}</p>
    </div>
  )
}

export function FileDrop({
  accept,
  multiple,
  onFiles,
  label,
  hint,
  compact,
}: {
  accept: string
  multiple?: boolean
  onFiles: (files: File[]) => void
  label: string
  hint?: string
  compact?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  return (
    <div
      className={`drop ${over ? 'over' : ''} ${compact ? 'compact' : ''}`}
      onDragEnter={(e) => {
        e.preventDefault()
        depth.current++
        setOver(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1)
        if (!depth.current) setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        depth.current = 0
        setOver(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length) onFiles(multiple ? files : files.slice(0, 1))
      }}
      onClick={() => input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files || [])
          if (files.length) onFiles(files)
          e.target.value = ''
        }}
      />
      {!compact && (
        <span className="drop-art" aria-hidden>
          <span className="sheet-a" />
          <span className="sheet-b" />
          <Icon name="upload" size={26} />
        </span>
      )}
      <span className="btn primary">{label}</span>
      {!compact && <span className="drop-hint">{over ? 'Let go to open' : (hint ?? 'or drag files here')}</span>}
    </div>
  )
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'ok'; children: ReactNode }) {
  return (
    <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      {kind !== 'info' && <Icon name={kind === 'error' ? 'alert' : 'ok'} size={18} />}
      <span>{children}</span>
    </div>
  )
}

export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-bar" style={{ width: `${Math.max(4, Math.round(value * 100))}%` }} />
      {label && <span>{label}</span>}
    </div>
  )
}

/** Animates a number from 0 to `to` once, for result reveals. */
export function CountUp({ to, format }: { to: number; format: (n: number) => string }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setV(to)
      return
    }
    let raf = 0
    const start = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 700)
      setV(to * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return <>{format(v)}</>
}

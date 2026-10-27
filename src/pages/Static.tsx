import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TOOLS, type Tool } from '../tools'
import { Icon } from '../components/icons'

const GROUPS: { id: Tool['group']; title: string }[] = [
  { id: 'Edit', title: 'Fill, edit and sign' },
  { id: 'Organize', title: 'Arrange pages' },
  { id: 'Convert', title: 'Convert' },
  { id: 'Compress', title: 'Make files smaller' },
]

export function Home() {
  useEffect(() => {
    document.title = 'Kagaz: free PDF form filler, editor and compressor. No watermark, no signup.'
  }, [])
  return (
    <>
      <section className="hero">
        <div>
          <h1>
            Fill it, sign it, <span className="mark">send it.</span>
          </h1>
          <p className="lede">
            Free tools for everyday paperwork. Fill PDF forms, sign, merge and shrink files, right in your browser.
            Nothing is uploaded, and there is no watermark on the download.
          </p>
          <ToolSearch />
          <div className="hero-actions">
            <Link className="btn primary lg" to="/fill-pdf-form">
              <Icon name="form" /> Fill a PDF form
            </Link>
            <Link className="btn lg" to="/compress-image">
              <Icon name="photo" /> Shrink a photo
            </Link>
          </div>
        </div>
        <FormDemo />
      </section>

      {GROUPS.map((g) => (
        <section key={g.id} className="tool-group">
          <h2>{g.title}</h2>
          <div className="tool-grid">
            {TOOLS.filter((t) => t.group === g.id).map((t) => (
              <Link key={t.path} to={t.path} className="tool-card">
                <span className="tool-icon" aria-hidden>
                  <Icon name={t.icon} size={22} />
                </span>
                <span className="tool-title">{t.title}</span>
                <span className="tool-desc">{t.desc}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section className="why">
        <div>
          <Icon name="lock" />
          <h3>Your files stay with you</h3>
          <p>Everything runs on your phone or computer. Nothing is uploaded, stored or seen by anyone else.</p>
        </div>
        <div>
          <Icon name="globe" />
          <h3>Any form, any language</h3>
          <p>Fill fillable PDFs, hit exact size limits for uploads, and type in Hindi, Arabic, Chinese or English.</p>
        </div>
        <div>
          <Icon name="phone" />
          <h3>Works on any phone</h3>
          <p>Light enough for budget phones, and keeps working offline after your first visit.</p>
        </div>
      </section>
    </>
  )
}

/** Type-to-find tool search with keyboard navigation. */
function ToolSearch() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const nav = useNavigate()
  const box = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter((w) => w && !/^\d+$/.test(w)) // ignore bare numbers like 50
    if (!words.length) return []
    return TOOLS.filter((t) => {
      const hay = `${t.title} ${t.desc} ${t.keywords}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    }).slice(0, 6)
  }, [q])

  useEffect(() => {
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [])

  return (
    <div className="tool-search" ref={box}>
      <Icon name="search" />
      <input
        className="input"
        type="search"
        placeholder="Find a tool, like “sign”"
        aria-label="Search tools"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, results.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter' && results[active]) {
            nav(results[active].path)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && q.trim() && (
        <ul className="search-results" role="listbox">
          {results.length ? (
            results.map((t, i) => (
              <li key={t.path}>
                <Link to={t.path} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)}>
                  <span className="tool-icon sm">
                    <Icon name={t.icon} size={18} />
                  </span>
                  {t.title}
                </Link>
              </li>
            ))
          ) : (
            <li className="empty">No tool matches “{q}”. Try a word like merge, photo or sign.</li>
          )}
        </ul>
      )}
    </div>
  )
}

/** A small paper form that fills itself in once when the page loads. */
function FormDemo() {
  return (
    <div className="demo" aria-hidden>
      <div className="demo-sheet back" />
      <div className="demo-sheet">
        <div className="demo-title">Application form</div>
        <div className="demo-row">
          <span>Full name</span>
          <span className="demo-line">
            <span className="demo-type t1">Maya Fernandes</span>
          </span>
        </div>
        <div className="demo-row">
          <span>Email</span>
          <span className="demo-line">
            <span className="demo-type t2">maya@mail.com</span>
          </span>
        </div>
        <div className="demo-checks">
          <span>
            <span className="demo-box">
              <Icon name="check" size={14} strokeWidth={3} />
            </span>
            I agree to the terms
          </span>
        </div>
        <div className="demo-sign">
          <span>Signature</span>
          <svg viewBox="0 0 200 60">
            <path
              d="M8 44c14-2 18-30 26-30 6 0-2 30 6 30 7 0 10-20 16-20 5 0 2 16 8 16 5 0 9-12 15-12 4 0 3 9 8 9 8 0 16-10 30-10 12 0 30 4 70 2"
              fill="none"
              stroke="#2433b8"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="demo-stamp">Ready to send</div>
      </div>
    </div>
  )
}

export function Privacy() {
  useEffect(() => {
    document.title = 'Privacy policy | Kagaz'
  }, [])
  return (
    <article className="prose">
      <h1>Privacy policy</h1>
      <p>
        <strong>Short version: your files never leave your device.</strong>
      </p>
      <p>
        Every tool on Kagaz (editing, signing, merging, splitting, converting and compressing) runs inside your web
        browser using JavaScript. The files you open are read into your device's memory, processed there, and handed
        back to you as a download. They are not uploaded to any server, and we have no way to see them.
      </p>
      <h2>What we collect</h2>
      <p>
        We do not ask for an account, name, email or phone number. If anonymous, cookie-free visit statistics are
        enabled (for example, which tool pages are popular), they contain no file content and no personal identifiers.
      </p>
      <h2>Saved signatures</h2>
      <p>
        If you choose to save a signature for reuse, it is stored only in your own browser's local storage. Clearing
        your browser data removes it.
      </p>
      <h2>Contact</h2>
      <p>Questions about privacy can be sent to the site owner through the contact listed on the About page.</p>
    </article>
  )
}

export function About() {
  useEffect(() => {
    document.title = 'About | Kagaz'
  }, [])
  return (
    <article className="prose">
      <h1>About Kagaz</h1>
      <p>
        Kagaz started from a simple frustration: most PDF websites let you edit a document, then ask for money or add a
        watermark the moment you try to download it.
      </p>
      <p>
        Kagaz does the work in your browser instead of on a paid server, which means it costs almost nothing to run and
        can stay free for everyone. It is built for everyday paperwork anywhere in the world: application forms, job and visa
        uploads, contracts and school documents.
      </p>
      <p>
        Upload requirements change. Presets are a convenience, so always check the size and dimension rules of the form
        you're submitting.
      </p>
    </article>
  )
}

export function NotFound() {
  return (
    <article className="prose">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Go to all tools</Link>
      </p>
    </article>
  )
}

import { useState } from 'react'
import { CountUp, FileDrop, Notice, Progress, ToolHeader } from '../components/ui'
import { Icon } from '../components/icons'
import { compressPdfLevel, compressPdfToTarget, resavePdf, type PdfLevel } from '../lib/compress'
import { baseName, downloadBlob, formatBytes } from '../lib/pdf'

type Mode = PdfLevel | 'target'

export default function CompressPdf() {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<Mode>('medium')
  const [target, setTarget] = useState(1024)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<{ bytes: Uint8Array; note: string; ok: boolean } | null>(null)
  const [error, setError] = useState('')

  const run = async () => {
    if (!file) return
    setBusy(true)
    setError('')
    setOut(null)
    setProgress(0)
    try {
      const buf = await file.arrayBuffer()
      // lossless attempt first: keeps text selectable
      setStatus('Optimising structure…')
      const lossless = await resavePdf(buf).catch(() => null)
      const goal = mode === 'target' ? target * 1024 : Infinity
      if (lossless && mode === 'target' && lossless.length <= goal) {
        setOut({ bytes: lossless, ok: true, note: 'Reached the target without reducing quality. Text is still selectable.' })
        return
      }
      let result: Uint8Array
      let ok = true
      if (mode === 'target') {
        const r = await compressPdfToTarget(buf, target, setStatus)
        result = r.bytes
        ok = r.hitTarget
      } else {
        setStatus('Compressing pages…')
        result = await compressPdfLevel(buf, mode, (d, t) => setProgress(d / t))
      }
      // never hand back something bigger than the original or the lossless version
      const candidates = [result, lossless].filter(Boolean) as Uint8Array[]
      const best = candidates.reduce((a, b) => (b.length < a.length ? b : a))
      if (best.length >= file.size) {
        setOut({ bytes: best, ok: false, note: 'This PDF is already well compressed. The result is not smaller than the original.' })
      } else {
        setOut({
          bytes: best,
          ok,
          note: ok
            ? best === lossless
              ? 'Compressed without quality loss.'
              : 'Pages were re-encoded as images. Text in the result cannot be selected or searched.'
            : `Could not reach ${target} KB. This is the smallest readable version.`,
        })
      }
    } catch {
      setError('Could not compress this PDF. It may be protected or damaged.')
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  const saved = out && file ? 1 - out.bytes.length / file.size : 0

  return (
    <div className="tool">
      <ToolHeader title="Compress PDF" sub="Shrink scanned documents and photo-heavy PDFs to fit upload limits." />
      {!file ? (
        <FileDrop accept="application/pdf,.pdf" onFiles={(f) => (setFile(f[0]), setOut(null))} label="Choose PDF" />
      ) : (
        <div className="panel">
          <div className="row between wrap">
            <span>
              <strong className="fl-name">{file.name}</strong> <span className="muted">{formatBytes(file.size)}</span>
            </span>
            <button className="btn sm" onClick={() => (setFile(null), setOut(null))}>
              Choose another
            </button>
          </div>
          <div className="choice-list">
            {(
              [
                ['light', 'Light', 'Best quality, moderate saving'],
                ['medium', 'Recommended', 'Good quality, good saving'],
                ['strong', 'Strong', 'Smallest file, lower quality'],
                ['target', 'Target size', 'Get under a specific size'],
              ] as [Mode, string, string][]
            ).map(([m, l, d]) => (
              <label key={m} className={`choice ${mode === m ? 'on' : ''}`}>
                <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} />
                <span>
                  <strong>{l}</strong>
                  <span className="muted">{d}</span>
                </span>
              </label>
            ))}
          </div>
          {mode === 'target' && (
            <label className="field">
              Maximum size
              <select className="input" value={target} onChange={(e) => setTarget(Number(e.target.value))}>
                {[100, 200, 300, 500, 1024, 2048, 5120].map((k) => (
                  <option key={k} value={k}>
                    {k >= 1024 ? `${k / 1024} MB` : `${k} KB`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="row end">
            <button className="btn primary lg" onClick={run} disabled={busy}>
              {busy ? 'Compressing…' : 'Compress'}
            </button>
          </div>
          {busy && <Progress value={mode === 'target' ? 0.5 : progress} label={status} />}
        </div>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      {out && file && (
        <>
          <div className="result-card">
            <div>
              <span className="muted">Before</span>
              <strong>{formatBytes(file.size)}</strong>
            </div>
            <span className="arrow">
              <Icon name="right" size={26} />
            </span>
            <div>
              <span className="muted">After</span>
              <strong>
                <CountUp to={Math.max(0, file.size - out.bytes.length)} format={(n) => formatBytes(Math.round(file.size - n))} />
              </strong>
            </div>
            {saved > 0 && <span className="badge">{Math.round(saved * 100)}% smaller</span>}
          </div>
          <Notice kind={out.ok ? 'ok' : 'info'}>{out.note}</Notice>
          <div className="row end">
            <button className="btn primary lg" onClick={() => downloadBlob(out.bytes, `${baseName(file.name)}-compressed.pdf`)}>
              Download PDF
            </button>
          </div>
        </>
      )}
    </div>
  )
}

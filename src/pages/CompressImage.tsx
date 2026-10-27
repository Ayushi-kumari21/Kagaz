import { useEffect, useState } from 'react'
import { FileDrop, Notice, ToolHeader } from '../components/ui'
import { compressImageToTarget, PRESETS, type ImageCompressResult, type PresetGroup } from '../lib/compress'
import { baseName, downloadBlob, formatBytes, loadImage } from '../lib/pdf'

export default function CompressImage() {
  const [file, setFile] = useState<File | null>(null)
  const [srcUrl, setSrcUrl] = useState('')
  const [srcDims, setSrcDims] = useState<[number, number] | null>(null)
  const [preset, setPreset] = useState('kb-50')
  const [minKB, setMinKB] = useState(0)
  const [maxKB, setMaxKB] = useState(50)
  const [w, setW] = useState('')
  const [h, setH] = useState('')
  const [result, setResult] = useState<ImageCompressResult | null>(null)
  const [outUrl, setOutUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const pick = async (f: File) => {
    setError('')
    setResult(null)
    try {
      const url = URL.createObjectURL(f)
      const img = await loadImage(url)
      setFile(f)
      setSrcUrl(url)
      setSrcDims([img.naturalWidth, img.naturalHeight])
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const applyPreset = (id: string) => {
    setPreset(id)
    const p = PRESETS.find((x) => x.id === id)
    if (!p) return
    setMinKB(p.minKB)
    setMaxKB(p.maxKB)
    setW(p.width ? String(p.width) : '')
    setH(p.height ? String(p.height) : '')
  }

  useEffect(() => () => void (outUrl && URL.revokeObjectURL(outUrl)), [outUrl])

  const run = async () => {
    if (!file) return
    if (maxKB <= 0 || minKB > maxKB) return setError('Check the size limits: minimum must be less than maximum.')
    const width = Number(w) || undefined
    const height = Number(h) || undefined
    if ((width && !height) || (!width && height)) return setError('Enter both width and height, or leave both empty.')
    setBusy(true)
    setError('')
    try {
      const r = await compressImageToTarget(file, { minKB, maxKB, width, height })
      setResult(r)
      setOutUrl(URL.createObjectURL(r.blob))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tool">
      <ToolHeader
        title="Compress photo to exact KB"
        sub="Get photos and signatures within the size and pixel limits of job, visa, exam and government upload forms."
      />
      {!file ? (
        <FileDrop accept="image/*" onFiles={(f) => pick(f[0])} label="Choose photo" />
      ) : (
        <div className="panel">
          <div className="row between wrap">
            <span>
              <strong className="fl-name">{file.name}</strong>{' '}
              <span className="muted">
                {formatBytes(file.size)}
                {srcDims && `, ${srcDims[0]}×${srcDims[1]} px`}
              </span>
            </span>
            <button className="btn sm" onClick={() => (setFile(null), setResult(null))}>
              Choose another
            </button>
          </div>

          <label className="field">
            Requirement
            <select className="input" value={preset} onChange={(e) => applyPreset(e.target.value)}>
              {(['Size limit', 'Photo sizes', 'India exams'] as PresetGroup[]).map((g) => (
                <optgroup key={g} label={g === 'Size limit' ? g : `${g} (typical)`}>
                  {PRESETS.filter((p) => p.group === g).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                      {p.group === 'India exams' ? ` (${p.minKB}–${p.maxKB} KB)` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </label>

          <div className="options">
            <label className="field">
              Min KB
              <input className="input" type="number" min={0} value={minKB} onChange={(e) => (setMinKB(Number(e.target.value)), setPreset('custom'))} />
            </label>
            <label className="field">
              Max KB
              <input className="input" type="number" min={1} value={maxKB} onChange={(e) => (setMaxKB(Number(e.target.value)), setPreset('custom'))} />
            </label>
            <label className="field">
              Width px <span className="muted">(optional)</span>
              <input className="input" type="number" min={1} value={w} onChange={(e) => (setW(e.target.value), setPreset('custom'))} placeholder="auto" />
            </label>
            <label className="field">
              Height px <span className="muted">(optional)</span>
              <input className="input" type="number" min={1} value={h} onChange={(e) => (setH(e.target.value), setPreset('custom'))} placeholder="auto" />
            </label>
          </div>
          <p className="muted small">
            Presets are typical values and rules change. Always confirm the size and dimensions required by the form you're uploading to.
          </p>
          <div className="row end">
            <button className="btn primary lg" onClick={run} disabled={busy}>
              {busy ? 'Compressing…' : 'Compress'}
            </button>
          </div>
        </div>
      )}
      {error && <Notice kind="error">{error}</Notice>}

      {file && (
        <div className="compare">
          <figure>
            <img src={srcUrl} alt="Original" />
            <figcaption>Original: {formatBytes(file.size)}</figcaption>
          </figure>
          {result && (
            <figure>
              <img src={outUrl} alt="Compressed" />
              <figcaption>
                Result: <strong>{formatBytes(result.blob.size)}</strong>, {result.width}×{result.height} px
              </figcaption>
            </figure>
          )}
        </div>
      )}
      {result && (
        <>
          <Notice kind={result.hitTarget ? 'ok' : 'error'}>
            {result.hitTarget
              ? `Done: ${(result.blob.size / 1024).toFixed(1)} KB, within ${minKB}–${maxKB} KB.`
              : result.note || 'Could not fully meet the limit. Try allowing smaller dimensions.'}
          </Notice>
          <div className="row end">
            <button className="btn primary lg" onClick={() => downloadBlob(result.blob, `${baseName(file!.name)}-${Math.round(result.blob.size / 1024)}kb.jpg`)}>
              Download JPG
            </button>
          </div>
        </>
      )}
    </div>
  )
}

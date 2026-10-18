import { useState } from 'react'
import { localReplaySource } from './localSessionData'
import { screenshotArtifactUrl, type ScreenshotInspection } from './screenshotInspection'
import './ScreenshotInspectionResults.css'

export function ScreenshotInspectionResults({ result }: { result: ScreenshotInspection }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [overlay, setOverlay] = useState(false)
  const [showIgnored, setShowIgnored] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [savedSelection, setSavedSelection] = useState<string | null>(null)
  const selected = result.regions.filter(region => selectedIds.includes(region.id))
  const selectionKey = selected.map(region => region.id).join(',')
  const url = (file: Parameters<typeof screenshotArtifactUrl>[1]) => screenshotArtifactUrl(result.sessionId, file)
  const masks = showIgnored ? result.ignoreRegions ?? [] : []
  const maskBoxes = masks.map((mask, index) => <span key={index} className="local-image-inspection-mask"
    role="img" aria-label={`Ignored region ${index + 1}`} style={{ left: `${mask.x * 100}%`, top: `${mask.y * 100}%`,
      width: `${mask.width * 100}%`, height: `${mask.height * 100}%` }} />)
  function select(ids: string[]) { setSelectedIds(ids); setOverlay(false); setMessage('') }
  async function annotate() {
    if (!selected.length || saving || !localReplaySource.upsertAnnotation) return
    setSaving(true)
    try {
      await localReplaySource.upsertAnnotation(result.sessionId, {
        annotationId: crypto.randomUUID(), startUtc: result.image.capturedAtUtc,
        label: selected.length === 1 ? selected[0].label : 'Image assessment regions',
        notes: [result.message, ...(result.criteria ?? []).filter(finding => finding.regionIds.some(id => selectedIds.includes(id)))
          .map(finding => `${finding.id}: ${finding.explanation}`)].join('\n'), source: 'screenshot-inspection',
        geometry: selected.map(region => ({ ...region.geometry, geometryId: crypto.randomUUID(),
          capturedAtUtc: result.image.capturedAtUtc, strokeColor: '#FF6348' })),
      })
      setSavedSelection(selectionKey)
      setMessage('Annotation saved to the session.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the annotation.') }
    finally { setSaving(false) }
  }
  return <section className="local-image-inspection" aria-label="Screenshot evidence">
    <header><strong>{result.capability === 'screenshot.compare' ? 'Image comparison' : 'Image assessment'}</strong><span>{result.message}</span></header>
    {result.ignoredPixelCount !== undefined && result.ignoredPixelCount > 0 ? <p>
      {result.ignoredPixelCount.toLocaleString()} pixels excluded{result.totalPixelCount !== undefined ? ` · ${result.totalPixelCount.toLocaleString()} pixels compared` : ''}.
      {' '}Ignored areas do not contribute to the score or difference highlights.
    </p> : null}
    {result.systemUiMaskResolutions?.length ? <p aria-label="System UI masks">
      {result.systemUiMaskResolutions.map(item => `${({ statusBar: 'Status bar', navigationBar: 'Navigation bar', displayCutout: 'Display cutout' })[item.kind]}: ${item.state === 'absent' ? 'absent from this capture' : 'excluded from comparison'}`).join(' · ')}.
    </p> : null}
    {result.criteria?.length ? <div className="local-image-findings" aria-label="Image findings">
      {result.criteria.map(finding => <button key={finding.id} type="button" onClick={() => select(finding.regionIds)}>
        <strong>{finding.id} · {finding.verdict}</strong><span>{finding.explanation}</span>
      </button>)}
    </div> : null}
    <div className="local-image-inspection-frames">
      {result.reference ? <figure><figcaption>Reference · expected</figcaption><div className="local-image-inspection-canvas">
        <img src={url(result.reference.artifact)} alt="Expected reference" loading="lazy" />{maskBoxes}
      </div></figure> : null}
      <figure><figcaption>Actual{overlay ? ' · differences highlighted' : ''}</figcaption>
        <div className="local-image-inspection-canvas"><img src={url(overlay && result.overlay ? result.overlay : result.image.artifact)} alt="Actual screenshot" loading="lazy" />
          {maskBoxes}
          {selected.map(region => <span key={region.id} className="local-image-inspection-box" aria-label={region.label} style={{
            left: `${region.geometry.x * 100}%`, top: `${region.geometry.y * 100}%`,
            width: `${region.geometry.width * 100}%`, height: `${region.geometry.height * 100}%`,
          }} />)}
        </div>
      </figure>
    </div>
    <div className="local-image-inspection-actions">
      {result.overlay ? <label><input type="checkbox" checked={overlay} onChange={event => setOverlay(event.target.checked)} /> Show pixel differences</label> : null}
      {result.ignoreRegions?.length ? <label><input type="checkbox" checked={showIgnored} onChange={event => setShowIgnored(event.target.checked)} /> Show ignored areas</label> : null}
      {selected.length ? <button type="button" onClick={() => select([])}>Clear selection</button> : null}
      <a href={url(result.evidence)} target="_blank" rel="noreferrer">View retained result</a>
    </div>
    {result.regions.length ? <div className="local-image-regions" aria-label="Image regions">
      {result.regions.map(region => <button type="button" key={region.id} aria-pressed={selectedIds.includes(region.id)} onClick={() => select([region.id])}>{region.label}</button>)}
    </div> : null}
    {result.regionsTruncated ? <p>The 64 largest changed regions are shown. All changed pixels outside ignored areas contribute to the comparison.</p> : null}
    {selected.length ? <div className="local-image-selection">
      <div className="local-image-crops">{selected.map(region => <figure key={region.id}><figcaption>{region.label}</figcaption>
        <a href={url(region.crop)} target="_blank" rel="noreferrer"><img src={url(region.crop)} alt={`Crop: ${region.label}`} loading="lazy" /></a></figure>)}</div>
      <button type="button" disabled={saving || savedSelection === selectionKey} onClick={() => { void annotate() }}>{saving ? 'Saving…' : 'Annotate selected regions'}</button>
    </div> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>
}

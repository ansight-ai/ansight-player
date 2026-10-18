import { useEffect, useMemo, useRef, useState } from 'react'
import type { ArtifactProfile, ProfilePreview, ProfileSpan } from './artifactProfiles'

export function ProfileArtifactPreview({ value }: { value: ProfilePreview }) {
  const [selected, setSelected] = useState(0)
  const profile = value.profiles[selected]
  return <div className="artifact-rich">
    {value.warnings.map((warning, index) => <p role="status" key={index}>{warning}</p>)}
    <div className="artifact-rich-toolbar"><label>Profile / track <select value={selected} onChange={event => setSelected(Number(event.target.value))}>{value.profiles.map((profile, index) => <option key={index} value={index}>{profile.name}</option>)}</select></label></div>
    {profile ? <ProfileChart key={selected} profile={profile} /> : <p>No supported samples or intervals were found.</p>}
  </div>
}

function ProfileChart({ profile }: { profile: ArtifactProfile }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [range, setRange] = useState({ start: profile.start, end: profile.end })
  const [hover, setHover] = useState<ProfileSpan>(), [query, setQuery] = useState('')
  const depth = profile.spans.reduce((maximum, span) => Math.max(maximum, span.depth), 0)
  const height = Math.max(140, (depth + 1) * 22 + 28)
  const duration = Math.max(Number.EPSILON, range.end - range.start)
  const totals = useMemo(() => {
    const result = new Map<string, { name: string; location?: string; duration: number; count: number }>()
    for (const span of profile.spans) {
      const frame = profile.frames[span.frame], key = `${frame.name}\n${frame.location ?? ''}`
      const current = result.get(key) ?? { ...frame, duration: 0, count: 0 }
      current.duration += Math.max(0, Math.min(span.end, range.end) - Math.max(span.start, range.start))
      current.count++
      result.set(key, current)
    }
    return [...result.values()].sort((left, right) => right.duration - left.duration)
  }, [profile, range])
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    function draw() {
      if (!canvas) return
      const width = Math.max(400, canvas.clientWidth), scale = window.devicePixelRatio || 1
      canvas.width = width * scale; canvas.height = height * scale
      const context = canvas.getContext('2d')
      if (!context) return
      context.scale(scale, scale)
      context.clearRect(0, 0, width, height)
      context.font = '11px system-ui'
      for (const span of profile.spans) {
        if (span.end < range.start || span.start > range.end) continue
        const x = Math.max(0, (span.start - range.start) / duration * width)
        const end = Math.min(width, (span.end - range.start) / duration * width)
        const y = span.depth * 22 + 25
        const name = profile.frames[span.frame].name
        const hash = [...name].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) | 0, 0)
        context.fillStyle = `hsl(${Math.abs(hash) % 60 + 5} 75% ${query && !name.toLowerCase().includes(query.toLowerCase()) ? 85 : 60}%)`
        context.fillRect(x, y, Math.max(1, end - x - 1), 20)
        if (end - x > 35) {
          context.save(); context.beginPath(); context.rect(x + 3, y, end - x - 6, 20); context.clip()
          context.fillStyle = '#241b18'; context.fillText(name, x + 4, y + 14); context.restore()
        }
      }
      context.fillStyle = '#888'
      context.fillText(`${range.start.toLocaleString()} ${profile.unit}`, 3, 15)
      context.textAlign = 'right'; context.fillText(`${range.end.toLocaleString()} ${profile.unit}`, width - 3, 15)
    }
    const observer = new ResizeObserver(draw)
    observer.observe(canvas); draw()
    return () => observer.disconnect()
  }, [profile, range, duration, height, query])
  function findSpan(event: React.MouseEvent<HTMLCanvasElement>): ProfileSpan | undefined {
    const bounds = event.currentTarget.getBoundingClientRect()
    const time = range.start + (event.clientX - bounds.left) / bounds.width * duration
    const depth = Math.floor((event.clientY - bounds.top - 25) / 22)
    return profile.spans.find(span => span.depth === depth && span.start <= time && span.end >= time)
  }
  return <>
    <div className="artifact-rich-toolbar"><input aria-label="Highlight profile frames" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a function…" /><button type="button" onClick={() => setRange({ start: profile.start, end: profile.end })}>Reset zoom</button><span>{profile.spans.length.toLocaleString()} frames · click a frame to zoom</span></div>
    <div className="artifact-profile-chart"><canvas ref={canvasRef} style={{ height }} role="img" aria-label={`${profile.name} flame chart. Function timings are also listed in the table below.`} onMouseMove={event => setHover(findSpan(event))} onMouseLeave={() => setHover(undefined)} onClick={event => { const span = findSpan(event); if (span && span.end > span.start) setRange({ start: span.start, end: span.end }) }} /></div>
    <p role="status">{hover ? `${profile.frames[hover.frame].name} · ${(hover.end - hover.start).toLocaleString()} ${profile.unit} · ${profile.frames[hover.frame].location ?? ''}` : `Visible interval: ${duration.toLocaleString()} ${profile.unit}`}</p>
    <h4>Inclusive time by function</h4><p>Parent and child durations overlap; totals are not additive.</p>
    <div className="artifact-table-scroll"><table><thead><tr><th>Function</th><th>Inclusive time ({profile.unit})</th><th>Frames</th><th>Location</th></tr></thead><tbody>{totals.filter(item => item.name.toLowerCase().includes(query.toLowerCase())).slice(0, 200).map((item, index) => <tr key={index}><td>{item.name}</td><td>{item.duration.toLocaleString()}</td><td>{item.count}</td><td>{item.location}</td></tr>)}</tbody></table></div>
    {totals.length > 200 ? <p>Showing the first 200 matching functions by inclusive time.</p> : null}
  </>
}

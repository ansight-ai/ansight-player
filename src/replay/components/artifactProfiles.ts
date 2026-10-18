export interface ProfileFrame { name: string; location?: string }
export interface ProfileSpan { frame: number; start: number; end: number; depth: number }
export interface ArtifactProfile { name: string; unit: string; frames: ProfileFrame[]; spans: ProfileSpan[]; start: number; end: number }
export interface ProfilePreview { profiles: ArtifactProfile[]; warnings: string[] }
type Data = Record<string, unknown>
const maximumSpans = 100_000
const maximumDepth = 256

function object(value: unknown): Data { return value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {} }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function number(value: unknown, fallback = 0): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback }
function label(value: unknown, fallback: string): string { return typeof value === 'string' && value ? value : fallback }
function frame(value: unknown): ProfileFrame {
  const data = object(value)
  return { name: label(data.name ?? data.functionName, '(anonymous)'), location: typeof (data.file ?? data.url) === 'string' ? `${data.file ?? data.url}:${number(data.line ?? data.lineNumber)}` : undefined }
}

export function parseArtifactProfiles(text: string): ProfilePreview {
  if (text.length > 32 * 1024 * 1024) throw new Error('Profile preview is limited to 32 MiB. Use Perfetto for larger traces.')
  const value: unknown = JSON.parse(text)
  const root = object(value)
  if (Array.isArray(root.profiles) && Array.isArray(object(root.shared).frames)) return parseSpeedscope(root)
  if (Array.isArray(root.nodes) && Array.isArray(root.samples)) return parseCpuProfile(root)
  if (Array.isArray(root.traceEvents) || Array.isArray(value)) return parseTraceEvents(array(root.traceEvents ?? value))
  throw new Error('Expected a Speedscope profile, Chrome CPU profile, or Chrome/Perfetto JSON trace.')
}

function appendSpan(profile: ArtifactProfile, span: ProfileSpan): void {
  if (profile.spans.length >= maximumSpans) throw new Error('Profile exceeds 100,000 visible frames. Open it in Perfetto or export a shorter interval.')
  if (span.depth > maximumDepth) throw new Error('Profile stack exceeds 256 frames.')
  if (!profile.frames[span.frame] || span.end < span.start || !Number.isFinite(span.start) || !Number.isFinite(span.end)) throw new Error('Invalid frame reference or time interval in profile.')
  profile.spans.push(span)
}

function parseSpeedscope(root: Data): ProfilePreview {
  const frames = array(object(root.shared).frames).map(frame)
  const warnings: string[] = []
  if (array(root.profiles).length > 128) throw new Error('Profile contains more than 128 tracks.')
  const profiles = array(root.profiles).map((value, index) => {
    const data = object(value)
    const profile: ArtifactProfile = { name: label(data.name, `Profile ${index + 1}`), unit: label(data.unit, 'none'), frames, spans: [], start: number(data.startValue), end: number(data.endValue) }
    if (data.type === 'sampled') {
      const samples = array(data.samples), weights = array(data.weights)
      if (samples.length > maximumSpans || (weights.length && weights.length !== samples.length)) throw new Error('Invalid sample count or weights in profile.')
      let time = profile.start
      const defaultWeight = samples.length ? (profile.end - profile.start) / samples.length : 0
      samples.forEach((sample, sampleIndex) => {
        const weight = weights.length ? number(weights[sampleIndex], -1) : defaultWeight
        if (weight < 0) throw new Error('Profile weights must be non-negative.')
        const stack = array(sample)
        stack.forEach((id, depth) => appendSpan(profile, { frame: number(id, -1), start: time, end: time + weight, depth }))
        time += weight
      })
      profile.end = Math.max(profile.end, time)
    } else if (data.type === 'evented') {
      const stack: { frame: number; start: number }[] = []
      let previousTime = profile.start
      for (const value of array(data.events)) {
        const event = object(value), at = number(event.at, NaN), id = number(event.frame, -1)
        if (at < previousTime || !Number.isFinite(at) || !frames[id]) throw new Error('Invalid event timestamp or frame in profile.')
        previousTime = at
        if (event.type === 'O') { if (stack.length >= maximumDepth) throw new Error('Profile stack exceeds 256 frames.'); stack.push({ frame: id, start: at }) }
        else if (event.type === 'C') {
          const opened = stack.pop()
          if (!opened || opened.frame !== id) throw new Error('Profile contains mismatched open/close events.')
          appendSpan(profile, { ...opened, end: at, depth: stack.length })
        } else throw new Error('Unknown profile event type.')
      }
      if (stack.length) warnings.push(`${profile.name}: unfinished frames are clipped to the end of the capture.`)
      stack.forEach((opened, depth) => appendSpan(profile, { ...opened, end: profile.end, depth }))
    } else throw new Error('Unknown Speedscope profile type.')
    return profile
  })
  return { profiles, warnings }
}

function parseCpuProfile(root: Data): ProfilePreview {
  const nodes = array(root.nodes).map(object)
  const frames = nodes.map(node => frame(node.callFrame))
  const indexes = new Map(nodes.map((node, index) => [number(node.id, -1), index]))
  const parents = new Map<number, number>()
  nodes.forEach(node => array(node.children).forEach(child => parents.set(number(child, -1), number(node.id, -1))))
  const samples = array(root.samples), deltas = array(root.timeDeltas)
  if (samples.length > maximumSpans) throw new Error('CPU profile exceeds 100,000 samples.')
  if (deltas.length && deltas.length !== samples.length) throw new Error('CPU profile samples and time deltas have different lengths.')
  const profile: ArtifactProfile = { name: label(root.title, 'CPU samples'), unit: 'microseconds', frames, spans: [], start: number(root.startTime), end: number(root.endTime) }
  let time = profile.start
  samples.forEach((sample, sampleIndex) => {
    const weight = deltas.length ? number(deltas[sampleIndex], -1) : (profile.end - profile.start) / Math.max(1, samples.length)
    if (weight < 0) throw new Error('CPU sample durations must be non-negative.')
    const stack: number[] = [], visited = new Set<number>()
    let id: number | undefined = number(sample, -1)
    while (id !== undefined) {
      if (visited.has(id) || stack.length >= maximumDepth) throw new Error('CPU profile contains a cyclic or excessively deep stack.')
      visited.add(id)
      const index = indexes.get(id)
      if (index === undefined) throw new Error('CPU sample references an unknown node.')
      stack.push(index)
      id = parents.get(id)
    }
    stack.reverse().forEach((frame, depth) => appendSpan(profile, { frame, start: time, end: time + weight, depth }))
    time += weight
  })
  profile.end = Math.max(profile.end, time)
  return { profiles: [profile], warnings: [] }
}

function parseTraceEvents(events: unknown[]): ProfilePreview {
  if (events.length > 500_000) throw new Error('Trace exceeds 500,000 events. Open it in Perfetto.')
  const tracks = new Map<string, ArtifactProfile>(), stacks = new Map<string, { frame: number; start: number }[]>()
  let ignored = 0
  for (const data of events.map(object).sort((left, right) => number(left.ts) - number(right.ts))) {
    const key = `${data.pid ?? 0}:${data.tid ?? 0}`
    if (data.ph === 'M') continue
    if (!['X', 'B', 'E', 'i', 'I'].includes(String(data.ph))) { ignored++; continue }
    let profile = tracks.get(key)
    if (!profile) {
      if (tracks.size >= 128) throw new Error('Trace contains more than 128 tracks.')
      profile = { name: `Process / thread ${key}`, unit: 'microseconds', frames: [], spans: [], start: number(data.ts), end: number(data.ts) }
      tracks.set(key, profile); stacks.set(key, [])
    }
    const stack = stacks.get(key)!, at = number(data.ts)
    if (data.ph === 'E') {
      const opened = stack.pop()
      if (opened) appendSpan(profile, { ...opened, end: at, depth: stack.length })
      else ignored++
    } else {
      const id = profile.frames.push({ name: label(data.name, '(unnamed)'), location: label(data.cat, '') }) - 1
      if (data.ph === 'B') {
        if (stack.length >= maximumDepth) throw new Error('Trace stack exceeds 256 frames.')
        stack.push({ frame: id, start: at })
      } else appendSpan(profile, { frame: id, start: at, end: at + Math.max(0, number(data.dur)), depth: stack.length })
    }
    profile.end = Math.max(profile.end, at + Math.max(0, number(data.dur)))
  }
  for (const [key, profile] of tracks) {
    const stack = stacks.get(key)!
    ignored += stack.length
    stack.forEach((opened, depth) => appendSpan(profile, { ...opened, end: profile.end, depth }))
    // Complete events carry no depth: assign non-overlapping lanes from their intervals.
    const ends: number[] = []
    profile.spans.sort((left, right) => left.start - right.start || right.end - left.end).forEach(span => {
      let depth = 0
      while (depth < ends.length && ends[depth] > span.start) depth++
      if (depth >= maximumDepth) throw new Error('Trace exceeds 256 overlapping intervals.')
      span.depth = depth; ends[depth] = span.end
    })
  }
  return { profiles: [...tracks.values()], warnings: ignored ? [`${ignored.toLocaleString()} metadata, counter, async, unmatched, or unfinished events are not represented fully. Use Perfetto for the complete trace.`] : [] }
}

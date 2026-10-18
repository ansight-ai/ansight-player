export interface HarField { name: string; value: string }
export interface HarRequest {
  index: number; method: string; url: string; status: number; started: number; duration: number; size: number;
  requestHeaders: HarField[]; responseHeaders: HarField[]; query: HarField[];
  requestBody: string; responseBody: string; mimeType: string; timings: HarField[]
}
export interface HarPreview { requests: HarRequest[]; start: number; end: number }
type Data = Record<string, unknown>
const object = (value: unknown): Data => value && typeof value === 'object' ? value as Data : {}
const string = (value: unknown) => typeof value === 'string' ? value : ''
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0
const fields = (value: unknown): HarField[] => Array.isArray(value) ? value.map(item => ({ name: string(object(item).name), value: string(object(item).value) })) : []

export function parseArtifactHar(text: string): HarPreview {
  if (text.length > 32 * 1024 * 1024) throw new Error('HAR preview is limited to 32 MiB.')
  const entries = object(object(JSON.parse(text)).log).entries
  if (!Array.isArray(entries)) throw new Error('HAR must contain log.entries.')
  if (entries.length > 20_000) throw new Error('HAR preview is limited to 20,000 requests.')
  const requests = entries.map((entry, index): HarRequest => {
    const data = object(entry), request = object(data.request), response = object(data.response), content = object(response.content)
    let responseBody = string(content.text)
    if (content.encoding === 'base64') {
      try { responseBody = new TextDecoder().decode(Uint8Array.from(atob(responseBody), character => character.charCodeAt(0))) }
      catch { responseBody = '[Invalid base64 body]' }
    }
    const parsedStart = Date.parse(string(data.startedDateTime))
    return {
      index, method: string(request.method), url: string(request.url), status: number(response.status),
      started: Number.isFinite(parsedStart) ? parsedStart : 0, duration: Math.max(0, number(data.time)), size: Math.max(0, number(content.size)),
      requestHeaders: fields(request.headers), responseHeaders: fields(response.headers), query: fields(request.queryString),
      requestBody: string(object(request.postData).text), responseBody, mimeType: string(content.mimeType),
      timings: Object.entries(object(data.timings)).filter(([, value]) => typeof value === 'number' && value >= 0).map(([name, value]) => ({ name, value: `${value} ms` })),
    }
  })
  return { requests, start: requests.reduce((start, item) => Math.min(start, item.started), requests[0]?.started ?? 0), end: requests.reduce((end, item) => Math.max(end, item.started + item.duration), 0) }
}

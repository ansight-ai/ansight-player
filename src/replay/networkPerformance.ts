import type { SessionNetworkRequest, SessionViewerPayload, SharedSessionStreamFile } from './sessionViewerData'

export function measuredValue(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/** Average body rate during a measured transfer; never derived from Content-Length or total request time. */
export function transferMbps(bytes: number | null | undefined, durationMs: number | null | undefined): number | null {
  const size = measuredValue(bytes)
  const duration = measuredValue(durationMs)
  if (size == null || size <= 0 || duration == null || duration <= 0) return null
  const rate = size * 8 / duration / 1000
  return Number.isFinite(rate) ? rate : null
}

export function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
}

export function summarizeNetworkPerformance(requests: SessionNetworkRequest[], fromMs: number, toMs: number) {
  const samples = requests.flatMap(request => {
    const time = Date.parse(request.completedAtUtc)
    if (!Number.isFinite(time) || time < fromMs || time > toMs) return []
    let host = 'Unknown server'
    try { host = new URL(request.url).host || host } catch { /* Relative or redacted URL. */ }
    return [{
      request, time, host,
      latency: measuredValue(request.performance?.timeToFirstByteMilliseconds),
      duration: measuredValue(request.durationMilliseconds),
      download: transferMbps(request.performance?.downloadedBytes, request.performance?.downloadDurationMilliseconds),
      upload: transferMbps(request.performance?.uploadedBytes, request.performance?.uploadDurationMilliseconds),
      failed: !!request.errorType || request.statusCode == null || request.statusCode >= 400,
    }]
  }).sort((a, b) => a.time - b.time)
  const hosts = new Map<string, typeof samples>()
  for (const sample of samples) {
    const group = hosts.get(sample.host) ?? []
    group.push(sample)
    hosts.set(sample.host, group)
  }
  return {
    samples,
    hosts: Array.from(hosts, ([host, group]) => {
      const latencies = group.flatMap(sample => sample.latency == null ? [] : [sample.latency])
      const downloads = group.flatMap(sample => sample.download == null ? [] : [sample.download])
      const uploads = group.flatMap(sample => sample.upload == null ? [] : [sample.upload])
      return {
        host, count: group.length, failed: group.filter(sample => sample.failed).length,
        latencyCount: latencies.length, downloadCount: downloads.length, uploadCount: uploads.length,
        medianLatency: percentile(latencies, 0.5), p95Latency: percentile(latencies, 0.95),
        medianDownload: percentile(downloads, 0.5), medianUpload: percentile(uploads, 0.5),
      }
    }).sort((a, b) => b.count - a.count || a.host.localeCompare(b.host)),
  }
}

/** Read archived requests only on demand, with bounded storage concurrency. */
export async function loadNetworkRequestFiles(
  payload: SessionViewerPayload,
  read: (file: SharedSessionStreamFile) => Promise<SessionNetworkRequest>,
): Promise<SessionNetworkRequest[]> {
  const files = payload.manifest.files.filter(file => /^network\/requests\/[^/]+\.json$/i.test(file.entryPath.replace(/\\/g, '/').replace(/^\/+/, '')))
  const requests = new Map((payload.capture.session?.networkRequests ?? []).map(request => [request.id, request]))
  let next = 0
  await Promise.all(Array.from({ length: Math.min(6, files.length) }, async () => {
    while (next < files.length) {
      const request = await read(files[next++])
      if (request?.schema !== 'ansight.network-request.v1' || typeof request.id !== 'string'
        || typeof request.url !== 'string' || typeof request.method !== 'string') {
        throw new Error('An archived network request could not be read.')
      }
      requests.set(request.id, request)
    }
  }))
  return [...requests.values()]
}

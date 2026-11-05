export async function fetchSimulatorScreenshot(url: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(url, { cache: 'no-store', signal })
  if (!response.ok) {
    throw new Error(await resolveSimulatorResponseError(response, 'Screenshot capture failed.'))
  }

  const frame = await response.blob()
  if (!frame.type.startsWith('image/') || frame.size === 0) {
    throw new Error('The simulator did not return a screenshot image.')
  }

  return frame
}

export async function resolveSimulatorResponseError(response: Response, fallback: string): Promise<string> {
  try {
    const text = await response.text()
    if (response.headers.get('content-type')?.includes('json')) {
      const body: unknown = JSON.parse(text)
      if (body && typeof body === 'object') {
        const message = 'message' in body ? body.message : undefined
        const error = 'error' in body ? body.error : undefined
        if (typeof message === 'string' && message.trim()) {
          return message
        }
        if (typeof error === 'string' && error.trim()) {
          return error
        }
      }
    } else if (response.headers.get('content-type')?.includes('text/plain') && text.trim()) {
      return text.trim()
    }
  } catch {
    // A proxy or connection failure may have no usable response body.
  }

  return `${fallback} (HTTP ${response.status})`
}

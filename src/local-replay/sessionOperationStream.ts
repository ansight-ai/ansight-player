export type SessionOperationProgress = { message: string; completed?: number; total?: number }

export async function readSessionOperationStream<T>(
  response: Response,
  onProgress: (progress: SessionOperationProgress) => void,
): Promise<T> {
  if (!response.body) throw new Error('The host did not return a session progress stream.')
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let result: T | undefined
  function readLine(line: string) {
    if (!line.trim()) return
    const event = JSON.parse(line) as { status: string; message?: string; progress?: SessionOperationProgress; result?: T }
    if (event.status === 'error') throw new Error(event.message || 'The session operation failed.')
    if (event.progress) onProgress(event.progress)
    if (event.status === 'success' && event.result !== undefined) result = event.result
  }
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += value ?? ''
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        readLine(buffer.slice(0, newline))
        buffer = buffer.slice(newline + 1)
      }
      if (done) { readLine(buffer); break }
    }
  } finally { reader.releaseLock() }
  if (result === undefined) throw new Error('The host connection ended before the session update completed. Reopen the session to check its state before retrying.')
  return result
}

export type SessionUiTest = {
  testId: string | null
  testName: string
  runId: string | null
  batchRunId: string | null
  status: 'running' | 'passed' | 'failed' | 'cancelled' | 'skipped' | 'unknown'
}

export function readSessionUiTest(customProperties: unknown): SessionUiTest | null {
  if (!isRecord(customProperties) || !isRecord(customProperties['ui-test'])) return null
  const properties = customProperties['ui-test']
  const testId = readText(properties.testId)
  const testName = readText(properties.testName) ?? testId
  if (!testName) return null
  const status = readText(properties.status)?.toLowerCase()
  return {
    testId,
    testName,
    runId: readText(properties.runId),
    batchRunId: readText(properties.batchRunId),
    status: status === 'succeeded' || status === 'passed' ? 'passed'
      : status === 'running' || status === 'failed' || status === 'cancelled' || status === 'skipped' ? status : 'unknown',
  }
}

export function sessionDisplayTitle(session: {
  customProperties?: unknown
  name?: string | null
  appName?: string | null
  clientName?: string | null
  appId?: string | null
  sessionId?: string | null
}): string {
  return readSessionUiTest(session.customProperties)?.testName
    ?? readText(session.name) ?? readText(session.appName) ?? readText(session.clientName)
    ?? readText(session.appId) ?? readText(session.sessionId) ?? 'Session'
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

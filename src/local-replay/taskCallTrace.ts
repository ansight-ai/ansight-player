import type { LocalRepositoryTaskToolCall, LocalTaskExtractionAssertion, LocalTestAuditPayload, LocalTestToolCallAudit } from './types'

export type TaskAssertionTraceRow = {
  id: string
  taskPath: string
  assertion: LocalTaskExtractionAssertion
}

export type TaskAssertionTrace = {
  rows: TaskAssertionTraceRow[]
  message: string | null
}

export function readTaskAssertionTrace(toolCall: LocalTestToolCallAudit): TaskAssertionTrace {
  const rows: TaskAssertionTraceRow[] = []
  let legacy: Record<string, unknown> | null = null
  try {
    const envelope: unknown = JSON.parse(toolCall.result?.content ?? '')
    const result = isRecord(envelope) && isRecord(envelope.result) ? envelope.result : envelope
    if (isRecord(result)) legacy = result
  } catch { /* Dedicated assertions remain readable when the enclosing result is truncated. */ }

  let recorded = false
  let malformed = false
  function append(candidates: unknown, taskPath: string) {
    if (!Array.isArray(candidates)) return
    recorded = true
    candidates.forEach((value, index) => {
      if (!isRecord(value) || typeof value.assertionId !== 'string' || typeof value.passed !== 'boolean') {
        malformed = true
        return
      }
      rows.push({
        id: `${taskPath}/${index}`,
        taskPath,
        assertion: {
          assertionId: value.assertionId,
          passed: value.passed,
          message: typeof value.message === 'string' ? value.message : '',
          matcher: typeof value.matcher === 'string' ? value.matcher : null,
          completedAtUtc: typeof value.completedAtUtc === 'string' ? value.completedAtUtc : null,
          ...('expected' in value ? { expected: value.expected } : {}),
          ...('actual' in value ? { actual: value.actual } : {}),
        },
      })
    })
  }
  function appendChildren(calls: unknown, parentPath: string) {
    if (!Array.isArray(calls)) return
    calls.forEach((call, index) => {
      if (!isRecord(call)) return
      const path = `${parentPath}${parentPath ? '.' : ''}${typeof call.sequence === 'number' ? call.sequence : index + 1}`
      // Older composed task results can still contain assertion summaries.
      let nested: Record<string, unknown> | null = null
      try {
        const result: unknown = isRecord(call.result) && typeof call.result.content === 'string' ? JSON.parse(call.result.content) : null
        if (isRecord(result)) nested = result
      } catch { /* Prefer dedicated assertion data below. */ }
      append(Array.isArray(call.assertions) ? call.assertions : nested?.assertions, path)
      appendChildren(call.childCalls, path)
    })
  }
  append(Array.isArray(toolCall.taskAssertions) ? toolCall.taskAssertions : legacy?.assertions, '')
  appendChildren(Array.isArray(toolCall.taskCalls) ? toolCall.taskCalls : legacy?.toolCalls, '')
  return {
    rows,
    message: malformed ? 'Some saved assertion entries could not be read.'
      : rows.length ? null
      : recorded ? 'This task run did not execute any expect assertions.'
      : 'Assertion details were not retained in this trace. Rerun the task to capture them.',
  }
}

export type TaskCallTraceRow = {
  id: string
  sequenceLabel: string
  depth: number
  call: LocalRepositoryTaskToolCall
}

export type TaskCallTrace = {
  rows: TaskCallTraceRow[]
  message: string | null
}

export function readTaskCallTrace(toolCall: LocalTestToolCallAudit): TaskCallTrace {
  if (Array.isArray(toolCall.taskCalls)) {
    return buildTrace(toolCall.taskCalls)
  }

  const content = toolCall.result?.content
  if (!content) {
    return { rows: [], message: 'No API call results were recorded for this task run.' }
  }

  let envelope: unknown
  try {
    envelope = JSON.parse(content)
  } catch {
    return {
      rows: [],
      message: toolCall.result.wasTruncated
        ? 'The saved task result was truncated, so its API calls cannot be read. Rerun with --trace to capture individual call results.'
        : 'The saved task result could not be read. Rerun with --trace to capture individual call results.',
    }
  }

  const result = isRecord(envelope) && isRecord(envelope.result) ? envelope.result : envelope
  if (!isRecord(result) || !Array.isArray(result.toolCalls)) {
    return {
      rows: [],
      message: toolCall.result.wasTruncated || (isRecord(envelope) && envelope.truncated === true)
        ? 'The saved task result was truncated, so its API calls cannot be read. Rerun with --trace to capture individual call results.'
        : 'No API call results were recorded for this task run.',
    }
  }
  return buildTrace(result.toolCalls)
}

function buildTrace(candidates: unknown[]): TaskCallTrace {
  const rows: TaskCallTraceRow[] = []
  let invalidCalls = false
  function append(calls: unknown[], parentId: string, parentSequence: string, depth: number) {
    const ordered = calls.flatMap((candidate, index) => {
      const call = readCall(candidate)
      if (!call) {
        invalidCalls = true
        return []
      }
      return [{ call, index }]
    }).sort((left, right) => left.call.sequence - right.call.sequence || left.index - right.index)
    for (const { call, index } of ordered) {
      const id = `${parentId}${index}`
      const sequenceLabel = `${parentSequence}${call.sequence}`
      rows.push({ id, sequenceLabel, depth, call })
      if (call.childCalls) append(call.childCalls, `${id}/`, `${sequenceLabel}.`, depth + 1)
    }
  }
  append(candidates, '', '', 0)
  return {
    rows,
    message: invalidCalls
      ? 'Some saved API call entries could not be read.'
      : rows.length === 0 ? 'This task run did not record any API calls.' : null,
  }
}

function readCall(value: unknown): LocalRepositoryTaskToolCall | null {
  if (!isRecord(value) || typeof value.toolName !== 'string'
    || typeof value.sequence !== 'number' || !Number.isFinite(value.sequence)
    || typeof value.durationMilliseconds !== 'number' || !Number.isFinite(value.durationMilliseconds)
    || typeof value.isError !== 'boolean') return null
  return {
    sequence: value.sequence,
    toolName: value.toolName,
    startedAtUtc: typeof value.startedAtUtc === 'string' ? value.startedAtUtc : null,
    completedAtUtc: typeof value.completedAtUtc === 'string' ? value.completedAtUtc : null,
    durationMilliseconds: value.durationMilliseconds,
    isError: value.isError,
    message: typeof value.message === 'string' ? value.message : '',
    correlationId: typeof value.correlationId === 'string' ? value.correlationId : null,
    arguments: readPayload(value.arguments),
    result: readPayload(value.result),
    childCalls: Array.isArray(value.childCalls) ? value.childCalls as LocalRepositoryTaskToolCall[] : null,
  }
}

function readPayload(value: unknown): LocalTestAuditPayload | null {
  if (!isRecord(value) || typeof value.content !== 'string') return null
  return {
    content: value.content,
    originalCharacterCount: typeof value.originalCharacterCount === 'number' ? value.originalCharacterCount : value.content.length,
    wasTruncated: value.wasTruncated === true,
    sha256: typeof value.sha256 === 'string' ? value.sha256 : '',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function taskCallPayloadPreview(payload?: LocalTestAuditPayload | null): string {
  if (!payload) return 'Not recorded'
  const text = payload.content.replace(/\s+/g, ' ').trim()
  const preview = text.length > 96 ? `${text.slice(0, 95)}…` : text || '(empty)'
  return payload.wasTruncated ? `Truncated · ${preview}` : preview
}

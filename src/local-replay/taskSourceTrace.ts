import type { LocalTaskSourceTrace, LocalTestToolCallAudit } from './types'

export type TaskSourceEntry = LocalTaskSourceTrace & { invocation: string }

export function readTaskSources(call: LocalTestToolCallAudit): TaskSourceEntry[] {
  let legacy: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(call.result?.content ?? '{}')
    if (isRecord(parsed)) legacy = isRecord(parsed.result) ? parsed.result : parsed
  } catch { /* Dedicated evidence survives truncated result text. */ }
  const entries: TaskSourceEntry[] = []
  function append(value: unknown, invocation: string) {
    if (!isRecord(value) || typeof value.taskId !== 'string' || !Array.isArray(value.modules)) return
    const modules = value.modules.filter((module) => isRecord(module)
      && typeof module.path === 'string' && typeof module.language === 'string'
      && typeof module.content === 'string' && typeof module.sha256 === 'string'
      && typeof module.originalCharacterCount === 'number' && typeof module.wasTruncated === 'boolean')
    entries.push({ taskId: value.taskId, invocation, modules,
      captureError: typeof value.captureError === 'string' ? value.captureError : null })
  }
  function children(calls: unknown, parent: string) {
    if (!Array.isArray(calls)) return
    calls.forEach((child, index) => {
      if (!isRecord(child)) return
      const invocation = `${parent}.${typeof child.sequence === 'number' ? child.sequence : index + 1}`
      append(child.sourceTrace, invocation)
      children(child.childCalls, invocation)
    })
  }
  append(call.taskSource ?? legacy.sourceTrace, 'Task')
  children(call.taskCalls ?? legacy.toolCalls, 'Call')
  return entries
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

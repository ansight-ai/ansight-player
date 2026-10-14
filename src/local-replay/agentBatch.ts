export function isAgentBatch(toolName: string): boolean {
  return toolName === 'ansight_run_ui_batch' || toolName === 'ansight_run_task_batch'
}

export function readTaskBatchReason(toolName: string, argumentsContent?: string): string | null {
  if (toolName !== 'ansight_run_task_batch' || !argumentsContent) return null
  try {
    const value: unknown = JSON.parse(argumentsContent)
    if (!value || typeof value !== 'object' || !('reason' in value)) return null
    return typeof value.reason === 'string' && value.reason.trim() ? value.reason.trim() : null
  } catch {
    return null
  }
}

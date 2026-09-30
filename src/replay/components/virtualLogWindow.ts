export function virtualLogWindow(count: number, scrollTop: number, viewportHeight: number, rowHeight: number, headerHeight: number) {
  const height = Math.max(1, rowHeight)
  const visibleHeight = Math.max(height, viewportHeight - headerHeight)
  const offset = Math.min(Math.max(0, scrollTop), Math.max(0, count * height - visibleHeight))
  const first = Math.floor(offset / height)
  const start = Math.max(0, first - 8)
  const end = Math.min(count, Math.ceil((offset + visibleHeight) / height) + 8)
  return { start, end, height: count * height }
}

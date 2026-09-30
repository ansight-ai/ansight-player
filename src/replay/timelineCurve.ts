type Point = { x: number; y: number }

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const coordinates = (point: Point): string => `${point.x} ${point.y}`

/** Keep the connecting lines straight, rounding only a few pixels around corners. */
export function timelineCornerPaths(points: readonly Point[]): string[] {
  const corners = points.map((point, i) => {
    const before = points[i - 1]
    const after = points[i + 1]
    if (!before || !after || before.x >= point.x || after.x <= point.x) {
      return { entry: point, exit: point, center: point, incoming: point, outgoing: point }
    }
    const previousLength = Math.hypot(point.x - before.x, point.y - before.y)
    const nextLength = Math.hypot(after.x - point.x, after.y - point.y)
    const trim = Math.min(4, previousLength * 0.15, nextLength * 0.15)
    const entry = {
      x: point.x + (before.x - point.x) * trim / previousLength,
      y: point.y + (before.y - point.y) * trim / previousLength,
    }
    const exit = {
      x: point.x + (after.x - point.x) * trim / nextLength,
      y: point.y + (after.y - point.y) * trim / nextLength,
    }
    // Split the quadratic at its midpoint so FPS colors can still change per sample.
    const incoming = midpoint(entry, point)
    const outgoing = midpoint(point, exit)
    return { entry, exit, incoming, outgoing, center: midpoint(incoming, outgoing) }
  })
  return corners.slice(1).map((end, i) => {
    const start = corners[i]
    return `M ${coordinates(start.center)} Q ${coordinates(start.outgoing)} ${coordinates(start.exit)} L ${coordinates(end.entry)} Q ${coordinates(end.incoming)} ${coordinates(end.center)}`
  })
}

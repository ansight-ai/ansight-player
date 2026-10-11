import type { visibleTouches } from '../touchReplay'
import './RecordedTouchOverlay.css'

// Draw inside a screenshot-aligned SVG with a 1000-unit-wide viewBox.
export function RecordedTouchOverlay({ touches, viewHeight }: {
  touches: ReturnType<typeof visibleTouches>
  viewHeight: number
}) {
  return (
    <g className="recorded-touch-overlay" aria-hidden="true" data-testid="touch-overlay">
      {touches.map((touch) => (
        <g key={touch.id} data-touch-id={touch.id} data-x={touch.point.x} data-y={touch.point.y} opacity={touch.opacity}>
          {touch.trail.length > 1 && <>
            <polyline className="recorded-touch-trail-outline" points={touch.trail.map(point => `${point.x * 1000},${point.y * viewHeight}`).join(' ')} vectorEffect="non-scaling-stroke" />
            <polyline className="recorded-touch-trail" points={touch.trail.map(point => `${point.x * 1000},${point.y * viewHeight}`).join(' ')} vectorEffect="non-scaling-stroke" />
          </>}
          <circle className="recorded-touch-ring-outline" cx={touch.point.x * 1000} cy={touch.point.y * viewHeight} r={touch.radius} vectorEffect="non-scaling-stroke" />
          <circle className="recorded-touch-ring" cx={touch.point.x * 1000} cy={touch.point.y * viewHeight} r={touch.radius} vectorEffect="non-scaling-stroke" />
          <circle className="recorded-touch-center" cx={touch.point.x * 1000} cy={touch.point.y * viewHeight} r={12} />
        </g>
      ))}
    </g>
  )
}

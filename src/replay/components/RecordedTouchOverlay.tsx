import type { visibleTouches } from '../touchReplay'
import './RecordedTouchOverlay.css'

// Shared by the full session player and the inline chat replay.
export function RecordedTouchOverlay({ touches, viewHeight }: {
  touches: ReturnType<typeof visibleTouches>
  viewHeight: number
}) {
  return (
    <g className="recorded-touch-overlay" aria-hidden="true" data-testid="touch-overlay">
      {touches.map((touch) => {
        const x = touch.point.x * 1000, y = touch.point.y * viewHeight, pen = touch.pen
        return <g key={touch.id} data-touch-id={touch.id} data-tool={touch.tool} data-x={touch.point.x} data-y={touch.point.y} opacity={touch.opacity}>
          {touch.trail.length > 1 && <>
            <polyline className="recorded-touch-trail-outline" points={touch.trail.map(point => `${point.x * 1000},${point.y * viewHeight}`).join(' ')} vectorEffect="non-scaling-stroke" />
            <polyline className="recorded-touch-trail" points={touch.trail.map(point => `${point.x * 1000},${point.y * viewHeight}`).join(' ')} vectorEffect="non-scaling-stroke" />
          </>}
          {pen ? <>
            {touch.tapProgress !== null && <circle className="recorded-pencil-tap" cx={(touch.tapPoint?.x ?? touch.point.x) * 1000} cy={(touch.tapPoint?.y ?? touch.point.y) * viewHeight} r={12 + 36 * touch.tapProgress} opacity={1 - touch.tapProgress} vectorEffect="non-scaling-stroke" />}
            {touch.showTip && <g className={pen.hover ? 'recorded-pencil recorded-pencil--hover' : 'recorded-pencil'} data-roll={pen.roll} data-distance={pen.distance} opacity={pen.opacity} transform={`translate(${x} ${y})`}>
              <ellipse className="recorded-pencil-shadow" rx={6 + pen.pressure * 7 + pen.distance * 10} ry={3 + pen.distance * 5} opacity={pen.hover ? .45 : .8} />
              {pen.hover && <line className="recorded-pencil-tether" x1={0} y1={0} x2={0} y2={-pen.lift} vectorEffect="non-scaling-stroke" />}
              <g transform={`translate(0 ${-pen.lift}) rotate(${pen.rotation})`}>
                <path className="recorded-pencil-body" d={`M 0 0 L 22 -8 L ${pen.length} -8 Q ${pen.length + 8} 0 ${pen.length} 8 L 22 8 Z`} vectorEffect="non-scaling-stroke" />
                <path className="recorded-pencil-wood" d="M 0 0 L 22 -8 L 22 8 Z" />
                <path className="recorded-pencil-nib" d={`M 0 0 L 8 ${-2 - pen.pressure * 2} L 8 ${2 + pen.pressure * 2} Z`} />
                <line className="recorded-pencil-roll" x1={25} x2={pen.length - 2} y1={Math.sin(pen.roll) * 5.5} y2={Math.sin(pen.roll) * 5.5} strokeWidth={1.5 + 2 * Math.abs(Math.cos(pen.roll))} opacity={.45 + .55 * (Math.cos(pen.roll) + 1) / 2} />
                {touch.tool === 'eraser' && <rect className="recorded-pencil-eraser" x={pen.length - 6} y={-7} width={9} height={14} rx={3} />}
              </g>
            </g>}
          </> : <>
            <circle className="recorded-touch-ring-outline" cx={x} cy={y} r={touch.radius} vectorEffect="non-scaling-stroke" />
            <circle className="recorded-touch-ring" cx={x} cy={y} r={touch.radius} vectorEffect="non-scaling-stroke" />
            <circle className="recorded-touch-center" cx={x} cy={y} r={12} />
          </>}
        </g>
      })}
    </g>
  )
}

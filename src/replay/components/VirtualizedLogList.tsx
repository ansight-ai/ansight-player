import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { virtualLogWindow } from './virtualLogWindow'

export function VirtualizedLogList<T>({ items, renderRow }: {
  items: T[]
  renderRow: (item: T) => ReactNode
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const [geometry, setGeometry] = useState({ scrollTop: 0, viewportHeight: 430, rowHeight: 36, headerHeight: 36 })
  const window = virtualLogWindow(items.length, geometry.scrollTop, geometry.viewportHeight, geometry.rowHeight, geometry.headerHeight)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    function measure() {
      if (!viewport) return
      const rowHeight = rowRef.current?.firstElementChild?.getBoundingClientRect().height ?? 36
      const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 36
      setGeometry(current => {
        const next = { scrollTop: viewport.scrollTop, viewportHeight: viewport.clientHeight, rowHeight: Math.max(1, rowHeight), headerHeight }
        return Object.keys(next).every(key => next[key as keyof typeof next] === current[key as keyof typeof current]) ? current : next
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    if (headerRef.current) observer.observe(headerRef.current)
    if (rowRef.current?.firstElementChild) observer.observe(rowRef.current.firstElementChild)
    return () => observer.disconnect()
  }, [items])

  return (
    <div className="live-log-list" ref={viewportRef} onScroll={event => {
      const scrollTop = event.currentTarget.scrollTop
      setGeometry(current => ({ ...current, scrollTop }))
    }} aria-label="Captured logs" tabIndex={0}>
      <div className="live-log-row live-log-row--header" ref={headerRef}>
        <span>Time</span><span>Level</span><span>Message</span>
      </div>
      <div className="live-log-virtual-space" style={{ height: window.height }}>
        <div className="live-log-virtual-rows" style={{ top: window.start * geometry.rowHeight }} ref={rowRef}>
          {items.slice(window.start, window.end).map(renderRow)}
        </div>
      </div>
    </div>
  )
}

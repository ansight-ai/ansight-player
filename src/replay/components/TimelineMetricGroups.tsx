import { CaretDown } from '@phosphor-icons/react'
import type { MetricGroup } from '../metricGroups'
import './TimelineMetricGroups.css'

export function TimelineMetricGroups({ groups, selectedGroup, selectedIds, series, onSelectGroup, onToggleMetric, onReset }: {
  groups: MetricGroup[]
  selectedGroup: MetricGroup
  selectedIds: ReadonlySet<number>
  series: { channelId: number; name: string; color: string }[]
  onSelectGroup: (id: string) => void
  onToggleMetric: (id: number) => void
  onReset: () => void
}) {
  return <div className="timeline-metric-controls">
    <label className="timeline-metric-group-select">
      <span>Metrics</span>
      <select aria-label="Metric group" value={selectedGroup.id} onChange={event => onSelectGroup(event.target.value)}>
        {groups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}
      </select>
    </label>
    <details className="timeline-metric-picker" key={selectedGroup.id}>
      <summary aria-label={`Choose ${selectedGroup.label.toLowerCase()} metrics`}>
        {selectedIds.size} shown <CaretDown aria-hidden="true" />
      </summary>
      <div className="timeline-metric-popover" role="group" aria-label={`${selectedGroup.label} metric selection`}>
        <div className="timeline-metric-popover-heading"><strong>{selectedGroup.label}</strong><button type="button" onClick={onReset}>Reset</button></div>
        <div className="timeline-metric-options">
          {series.filter(item => selectedGroup.channelIds.includes(item.channelId)).map(item => <label key={item.channelId}>
            <input type="checkbox" checked={selectedIds.has(item.channelId)} onChange={() => onToggleMetric(item.channelId)} />
            <i style={{ background: item.color }} />
            <span>{item.name}</span>
          </label>)}
        </div>
      </div>
    </details>
  </div>
}

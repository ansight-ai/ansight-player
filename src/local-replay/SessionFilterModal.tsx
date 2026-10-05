import { Funnel, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import flutterLogo from '../assets/technology/flutter.svg'
import reactNativeLogo from '../assets/technology/react-native.svg'
import mauiLogo from '../assets/technology/dotnet-maui.svg'
import dotnetLogo from '../assets/technology/dotnet.svg'
import swiftUiLogo from '../assets/technology/swiftui.svg'
import composeLogo from '../assets/technology/jetpack-compose.svg'
import appleNativeLogo from '../assets/technology/swift.svg'
import androidNativeLogo from '../assets/technology/kotlin.svg'
import { emptySessionFilters, toggleFilterValue, type SessionFilters } from './sessionFilters'
import type { LocalSessionSummary } from './types'

const technologyChoices = [
  { key: 'react-native', label: 'React Native', logo: reactNativeLogo },
  { key: 'flutter', label: 'Flutter', logo: flutterLogo },
  { key: 'dotnet-maui', label: '.NET MAUI', logo: mauiLogo },
  { key: 'dotnet', label: '.NET', logo: dotnetLogo },
  { key: 'swiftui', label: 'SwiftUI', logo: swiftUiLogo },
  { key: 'jetpack-compose', label: 'Jetpack Compose', logo: composeLogo },
  { key: 'swift', label: 'Apple native', logo: appleNativeLogo },
  { key: 'kotlin', label: 'Android native', logo: androidNativeLogo },
]

export function SessionFilterModal({ filters, onApply, onClose, sessions }: {
  filters: SessionFilters
  onApply: (filters: SessionFilters) => void
  onClose: () => void
  sessions: LocalSessionSummary[]
}) {
  const [draft, setDraft] = useState<SessionFilters>(() => ({ ...filters }))
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const tags = useMemo(() => [...new Set(sessions.flatMap((session) => session.tags))].sort((left, right) => left.localeCompare(right)), [sessions])
  const platforms = useMemo(() => [...new Set(sessions.map((session) => session.runtimePlatform?.toLowerCase()).filter((value): value is string => Boolean(value)))].sort(), [sessions])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    firstFieldRef.current?.focus()
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !dialogRef.current) return
      const controls = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')]
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      previousFocus?.focus()
    }
  }, [onClose])

  function update<Key extends keyof SessionFilters>(key: Key, value: SessionFilters[Key]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  return createPortal(
    <div className="local-session-filter-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section aria-label="Filter sessions" aria-modal="true" className="local-session-filter-modal" ref={dialogRef} role="dialog">
        <header>
          <span className="local-session-filter-title"><Funnel aria-hidden="true" /><strong>Filter sessions</strong></span>
          <button aria-label="Close filters" className="local-session-filter-close" onClick={onClose} type="button"><X aria-hidden="true" /></button>
        </header>
        <div className="local-session-filter-fields">
          <fieldset>
            <legend>Play length</legend>
            <div className="local-session-filter-range">
              <label>Minimum (seconds)<input min="0" onChange={(event) => update('minimumSeconds', event.target.value)} ref={firstFieldRef} type="number" value={draft.minimumSeconds} /></label>
              <label>Maximum (seconds)<input min="0" onChange={(event) => update('maximumSeconds', event.target.value)} type="number" value={draft.maximumSeconds} /></label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Package ID</legend>
            <input aria-label="Package ID pattern" onChange={(event) => update('packagePattern', event.target.value)} placeholder="com.example.*" type="text" value={draft.packagePattern} />
            <small>Use * for any number of characters and ? for one character. Plain text matches part of the ID.</small>
          </fieldset>
          <fieldset>
            <legend>Tags</legend>
            {tags.length ? <div className="local-session-filter-chips">{tags.map((tag) => <button aria-pressed={draft.tags.includes(tag)} key={tag} onClick={() => update('tags', toggleFilterValue(draft.tags, tag))} type="button">{tag}</button>)}</div> : <small>No tags on these sessions.</small>}
            {tags.length ? <small>Selected tags must all be present.</small> : null}
          </fieldset>
          <fieldset>
            <legend>Platform</legend>
            {platforms.length ? <div className="local-session-filter-chips">{platforms.map((platform) => <button aria-pressed={draft.platforms.includes(platform)} key={platform} onClick={() => update('platforms', toggleFilterValue(draft.platforms, platform))} type="button">{platform}</button>)}</div> : <small>No platform data yet.</small>}
          </fieldset>
          <fieldset>
            <legend>Technology</legend>
            <div className="local-session-technology-choices">{technologyChoices.map((choice) => <button aria-label={choice.label} aria-pressed={draft.technologies.includes(choice.key)} key={choice.key} onClick={() => update('technologies', toggleFilterValue(draft.technologies, choice.key))} type="button"><img alt="" src={choice.logo} /><span>{choice.label}</span></button>)}</div>
            <small>Technology is detected from available capture metadata. Older sessions may have no technology data.</small>
          </fieldset>
          <fieldset>
            <legend>Device type</legend>
            <div className="local-session-filter-chips">{(['any', 'physical', 'virtual'] as const).map((deviceType) => <button aria-pressed={draft.deviceType === deviceType} key={deviceType} onClick={() => update('deviceType', deviceType)} type="button">{deviceType === 'any' ? 'Any' : deviceType === 'physical' ? 'Device' : 'Virtual'}</button>)}</div>
          </fieldset>
          <fieldset>
            <legend>Date captured</legend>
            <div className="local-session-filter-range">
              <label>From<input max={draft.capturedTo || undefined} onChange={(event) => update('capturedFrom', event.target.value)} type="date" value={draft.capturedFrom} /></label>
              <label>To<input min={draft.capturedFrom || undefined} onChange={(event) => update('capturedTo', event.target.value)} type="date" value={draft.capturedTo} /></label>
            </div>
          </fieldset>
        </div>
        <footer>
          <button onClick={() => setDraft({ ...emptySessionFilters })} type="button">Clear all</button>
          <span />
          <button onClick={onClose} type="button">Cancel</button>
          <button className="local-session-filter-apply" disabled={Boolean(draft.minimumSeconds && draft.maximumSeconds && Number(draft.minimumSeconds) > Number(draft.maximumSeconds)) || Boolean(draft.capturedFrom && draft.capturedTo && draft.capturedFrom > draft.capturedTo)} onClick={() => onApply(draft)} type="button">Apply filters</button>
        </footer>
      </section>
    </div>, document.body,
  )
}

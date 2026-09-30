import {
  Check,
  CircleNotch,
  Database,
  FileText,
  FloppyDisk,
  Pulse,
  TerminalWindow,
  X,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type {
  LocalCoreSettings,
  LocalCoreSettingsUpdateRequest,
  LocalCoreSettingsUpdateResult,
} from './types'

type CoreSettingsPanelProps = {
  onClose: () => void
}

const cacheOptions = [
  { bytes: 512 * 1024 * 1024, label: '512 MB' },
  { bytes: 1024 * 1024 * 1024, label: '1 GB' },
  { bytes: 2 * 1024 * 1024 * 1024, label: '2 GB' },
  { bytes: 5 * 1024 * 1024 * 1024, label: '5 GB' },
  { bytes: 10 * 1024 * 1024 * 1024, label: '10 GB' },
  { bytes: 25 * 1024 * 1024 * 1024, label: '25 GB' },
  { bytes: 50 * 1024 * 1024 * 1024, label: '50 GB' },
]

export function CoreSettingsPanel({ onClose }: CoreSettingsPanelProps) {
  const [settings, setSettings] = useState<LocalCoreSettings | null>(null)
  const [draft, setDraft] = useState<LocalCoreSettings | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [messageKind, setMessageKind] = useState<'error' | 'success'>('error')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let isMounted = true
    async function loadSettings() {
      try {
        const response = await fetch('api/settings', { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(await readErrorMessage(response, `The local host returned HTTP ${response.status}.`))
        }

        const next = await response.json() as LocalCoreSettings
        if (isMounted) {
          setSettings(next)
          setDraft(next)
          setMessage(null)
        }
      } catch (error) {
        if (isMounted) {
          setMessage(resolveErrorMessage(error, 'Unable to load host settings.'))
          setMessageKind('error')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadSettings()
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSaving) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSaving, onClose])

  const hasChanges = useMemo(
    () => settings !== null && draft !== null && JSON.stringify(settings) !== JSON.stringify(draft),
    [draft, settings],
  )

  function updateSetting<Key extends keyof LocalCoreSettings>(key: Key, value: LocalCoreSettings[Key]) {
    setDraft((current) => current ? { ...current, [key]: value } : current)
    if (messageKind === 'success') {
      setMessage(null)
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || isSaving) {
      return
    }

    const request: LocalCoreSettingsUpdateRequest = {
      logCaptureLevel: draft.logCaptureLevel,
      captureNativeSessionLogs: draft.captureNativeSessionLogs,
      captureHostOperationLogs: draft.captureHostOperationLogs,
      captureFullHostOperationTrafficToDisk: draft.captureFullHostOperationTrafficToDisk,
      adbPath: draft.adbPath,
      xcodePath: draft.xcodePath,
      sessionAutoCleanupEnabled: draft.sessionAutoCleanupEnabled,
      sessionAutoCleanupRetentionDays: draft.sessionAutoCleanupRetentionDays,
      sessionAutoCompactionAgeDays: draft.sessionAutoCompactionAgeDays,
      sessionAutoCleanupMaximumCacheBytes: draft.sessionAutoCleanupMaximumCacheBytes,
      memorySpikeMinimumIncreasePercent: draft.memorySpikeMinimumIncreasePercent,
      memorySpikeMinimumIncreaseMegabytes: draft.memorySpikeMinimumIncreaseMegabytes,
      companionMachineName: draft.companionMachineName,
      companionTeamId: draft.companionTeamId,
      companionAccessMode: draft.companionAccessMode,
    }

    setIsSaving(true)
    setMessage(null)
    try {
      const response = await fetch('api/settings', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      const result = await response.json() as LocalCoreSettingsUpdateResult
      if (!response.ok || !result.isSuccess) {
        throw new Error(result.message || `The local host returned HTTP ${response.status}.`)
      }

      setSettings(result.settings)
      setDraft(result.settings)
      setMessage(result.message)
      setMessageKind('success')
    } catch (error) {
      setMessage(resolveErrorMessage(error, 'Unable to save host settings.'))
      setMessageKind('error')
    } finally {
      setIsSaving(false)
    }
  }

  const hasKnownCacheOption = draft
    ? cacheOptions.some((option) => option.bytes === draft.sessionAutoCleanupMaximumCacheBytes)
    : true

  return (
    <div className="local-settings-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target && !isSaving) {
        onClose()
      }
    }}>
      <section aria-label="Core Ansight settings" aria-modal="true" className="local-settings-panel" role="dialog">
        <header>
          <div>
            <p className="eyebrow">Core settings</p>
          </div>
          <button aria-label="Close settings" className="local-icon-button" disabled={isSaving} onClick={onClose} type="button">
            <X aria-hidden="true" />
          </button>
        </header>

        {message ? (
          <p className={`inline-message local-settings-message local-settings-message--${messageKind}`}>
            {messageKind === 'success' ? <Check aria-hidden="true" /> : null}
            {message}
          </p>
        ) : null}

        {isLoading ? (
          <div className="local-settings-loading">
            <CircleNotch className="spin" aria-hidden="true" />
            <strong>Loading settings</strong>
          </div>
        ) : draft ? (
          <form className="local-settings-form" onSubmit={saveSettings}>
            <div className="local-settings-grid">


              <SettingsSection
                description="Choose what the host records for diagnostics and automation."
                icon={<FileText aria-hidden="true" />}
                title="Capture & logging"
              >
                <label className="local-control-field">
                  Minimum application log level
                  <select
                    onChange={(event) => updateSetting('logCaptureLevel', event.target.value as LocalCoreSettings['logCaptureLevel'])}
                    value={draft.logCaptureLevel}
                  >
                    {['Verbose', 'Debug', 'Information', 'Warning', 'Error', 'Fatal'].map((level) => (
                      <option key={level} value={level}>{level === 'Information' ? 'Info' : level}</option>
                    ))}
                  </select>
                </label>
                <SettingToggle
                  checked={draft.captureNativeSessionLogs}
                  description="Attach Android and Apple native logs to sessions."
                  onChange={(value) => updateSetting('captureNativeSessionLogs', value)}
                  title="Capture native session logs"
                />
                <SettingToggle
                  checked={draft.captureHostOperationLogs}
                  description="Write summaries of in-process host operations to the application log."
                  onChange={(value) => updateSetting('captureHostOperationLogs', value)}
                  title="Log host operations"
                />
                <SettingToggle
                  checked={draft.captureFullHostOperationTrafficToDisk}
                  description="Write complete app-tool requests and responses to local storage."
                  onChange={(value) => updateSetting('captureFullHostOperationTrafficToDisk', value)}
                  title="Capture full host-operation traffic"
                />
              </SettingsSection>

              <SettingsSection
                description="Bound local disk use without removing pinned or live sessions."
                icon={<Database aria-hidden="true" />}
                title="Session storage"
              >
                <SettingToggle
                  checked={draft.sessionAutoCleanupEnabled}
                  description="Compact and delete eligible sessions using the limits below."
                  onChange={(value) => updateSetting('sessionAutoCleanupEnabled', value)}
                  title="Automatic cleanup"
                />
                <div className="local-settings-field-row">
                  <label className="local-control-field">
                    Retain sessions (days)
                    <input
                      disabled={!draft.sessionAutoCleanupEnabled}
                      max="365"
                      min="1"
                      onChange={(event) => updateSetting('sessionAutoCleanupRetentionDays', Number(event.target.value))}
                      type="number"
                      value={draft.sessionAutoCleanupRetentionDays}
                    />
                  </label>
                  <label className="local-control-field">
                    Compact after (days)
                    <input
                      disabled={!draft.sessionAutoCleanupEnabled}
                      max="365"
                      min="1"
                      onChange={(event) => updateSetting('sessionAutoCompactionAgeDays', Number(event.target.value))}
                      type="number"
                      value={draft.sessionAutoCompactionAgeDays}
                    />
                  </label>
                </div>
                <label className="local-control-field">
                  Maximum session cache
                  <select
                    disabled={!draft.sessionAutoCleanupEnabled}
                    onChange={(event) => updateSetting('sessionAutoCleanupMaximumCacheBytes', Number(event.target.value))}
                    value={draft.sessionAutoCleanupMaximumCacheBytes}
                  >
                    {!hasKnownCacheOption ? (
                      <option value={draft.sessionAutoCleanupMaximumCacheBytes}>{formatBytes(draft.sessionAutoCleanupMaximumCacheBytes)}</option>
                    ) : null}
                    {cacheOptions.map((option) => <option key={option.bytes} value={option.bytes}>{option.label}</option>)}
                  </select>
                </label>
              </SettingsSection>

              <SettingsSection
                description="Tune when Ansight flags a memory increase as a spike."
                icon={<Pulse aria-hidden="true" />}
                title="Telemetry analysis"
              >
                <div className="local-settings-field-row">
                  <label className="local-control-field">
                    Minimum increase (%)
                    <input
                      max="100"
                      min="1"
                      onChange={(event) => updateSetting('memorySpikeMinimumIncreasePercent', Number(event.target.value))}
                      type="number"
                      value={draft.memorySpikeMinimumIncreasePercent}
                    />
                  </label>
                  <label className="local-control-field">
                    Minimum size (MB)
                    <input
                      max="4096"
                      min="1"
                      onChange={(event) => updateSetting('memorySpikeMinimumIncreaseMegabytes', Number(event.target.value))}
                      type="number"
                      value={draft.memorySpikeMinimumIncreaseMegabytes}
                    />
                  </label>
                </div>
              </SettingsSection>

              <SettingsSection
                className="local-settings-section--wide"
                description="Override native tool discovery when the defaults are not correct."
                icon={<TerminalWindow aria-hidden="true" />}
                title="Native developer tools"
              >
                <div className="local-settings-field-row">
                  <label className="local-control-field">
                    ADB executable path
                    <input
                      onChange={(event) => updateSetting('adbPath', event.target.value)}
                      placeholder="Auto-detect"
                      type="text"
                      value={draft.adbPath}
                    />
                  </label>
                  <label className="local-control-field">
                    Xcode developer directory
                    <input
                      onChange={(event) => updateSetting('xcodePath', event.target.value)}
                      placeholder="Auto-detect"
                      type="text"
                      value={draft.xcodePath}
                    />
                  </label>
                </div>
                <p className="local-settings-note">Leave a path empty to use automatic discovery. Path changes apply to newly started host processes.</p>
              </SettingsSection>
            </div>

            <footer className="local-settings-footer">
              <span>{hasChanges ? 'You have unsaved changes.' : 'Settings are up to date.'}</span>
              <div>
                <button className="button button--secondary" disabled={!hasChanges || isSaving} onClick={() => setDraft(settings)} type="button">Reset</button>
                <button className="button button--primary" disabled={!hasChanges || isSaving} type="submit">
                  {isSaving ? <CircleNotch className="spin" aria-hidden="true" /> : <FloppyDisk aria-hidden="true" />}
                  {isSaving ? 'Saving…' : 'Save settings'}
                </button>
              </div>
            </footer>
          </form>
        ) : null}
      </section>
    </div>
  )
}

type SettingsSectionProps = {
  children: ReactNode
  className?: string
  description: string
  icon: ReactNode
  title: string
}

function SettingsSection({ children, className, description, icon, title }: SettingsSectionProps) {
  return (
    <section className={`local-settings-section${className ? ` ${className}` : ''}`}>
      <div className="local-settings-section-heading">
        {icon}
        <div><strong>{title}</strong><span>{description}</span></div>
      </div>
      <div className="local-settings-section-content">{children}</div>
    </section>
  )
}

type SettingToggleProps = {
  checked: boolean
  description: string
  onChange: (value: boolean) => void
  title: string
}

function SettingToggle({ checked, description, onChange, title }: SettingToggleProps) {
  return (
    <label className="local-settings-toggle">
      <span><strong>{title}</strong><small>{description}</small></span>
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <i aria-hidden="true" />
    </label>
  )
}

function formatBytes(bytes: number): string {
  const gibibytes = bytes / (1024 * 1024 * 1024)
  return gibibytes >= 1 ? `${gibibytes.toLocaleString(undefined, { maximumFractionDigits: 1 })} GB` : `${Math.round(bytes / (1024 * 1024))} MB`
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { message?: string }
    return body.message || fallback
  } catch {
    return fallback
  }
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

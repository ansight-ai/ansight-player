import { CircleNotch, Key } from '@phosphor-icons/react'
import { useEffect, useState, type FormEvent } from 'react'

export function RunnerOpenAiSettings() {
  const [apiKey, setApiKey] = useState('')
  const [isConfigured, setIsConfigured] = useState(false)
  const [isAvailable, setIsAvailable] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch('api/runner/openai', { cache: 'no-store', signal: controller.signal })
        if (response.status === 404) {
          throw new Error('Update the Ansight host to configure an OpenAI API key.')
        }
        if (!response.ok) {
          throw new Error('Unable to load OpenAI settings.')
        }

        const result = await response.json() as { isConfigured: boolean }
        if (!controller.signal.aborted) {
          setIsConfigured(result.isConfigured)
          setIsAvailable(true)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setMessage(error instanceof Error ? error.message : 'Unable to load OpenAI settings.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    void load()
    return () => controller.abort()
  }, [])

  async function update(remove: boolean) {
    setIsSaving(true)
    setMessage(null)

    try {
      const response = await fetch('api/runner/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(remove ? { remove: true } : { apiKey: apiKey.trim() }),
      })
      const result = await response.json() as { isSuccess: boolean; isConfigured: boolean; message?: string }
      if (!response.ok || !result.isSuccess) {
        throw new Error(result.message || 'Unable to update the OpenAI API key.')
      }

      setApiKey('')
      setIsConfigured(result.isConfigured)
      setMessage(result.message ?? 'OpenAI settings updated.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update the OpenAI API key.')
    } finally {
      setIsSaving(false)
    }
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (apiKey.trim() && !isSaving) {
      void update(false)
    }
  }

  return (
    <section className="local-admin-section" aria-label="OpenAI API key settings">
      <div className="local-admin-section-heading">
        <div><Key aria-hidden="true" /><span><strong>Local AI provider</strong><small>{isLoading ? 'Loading settings…' : !isAvailable ? 'Settings unavailable' : isConfigured ? 'Your OpenAI API key' : 'Ansight AI'}</small></span></div>
      </div>
      <p>Use your own OpenAI key for local AI runs. OpenAI bills your project directly.</p>
      {message ? <p className="inline-message" role="status">{message}</p> : null}
      {isAvailable ? (
        <form className="local-admin-form" onSubmit={save}>
          <label className="local-admin-form--wide">
            {isConfigured ? 'Replace OpenAI API key' : 'OpenAI API key'}
            <input
              autoCapitalize="none"
              autoComplete="new-password"
              disabled={isSaving}
              maxLength={4096}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={isConfigured ? 'A key is saved securely' : 'sk-…'}
              spellCheck={false}
              type="password"
              value={apiKey}
            />
          </label>
          <small className="local-admin-form--wide">Stored encrypted on this machine. Changes apply to new runs without restarting the host.</small>
          <div className="local-admin-actions local-admin-form--wide">
            <button className="button button--primary" disabled={!apiKey.trim() || isSaving} type="submit">
              {isSaving ? <CircleNotch className="spin" aria-hidden="true" /> : null}
              {isConfigured ? 'Replace key' : 'Save key'}
            </button>
            {isConfigured ? <button disabled={isSaving} onClick={() => void update(true)} type="button">Remove key and use Ansight AI</button> : null}
          </div>
        </form>
      ) : null}
    </section>
  )
}

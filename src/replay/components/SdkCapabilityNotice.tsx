import { ArrowSquareOut, Info } from '@phosphor-icons/react'
import './SdkCapabilityNotice.css'

export const sdkSetupUrl = 'https://www.ansight.ai/docs/sdk/'

const features = {
  network: {
    title: 'Network capture needs the SDK',
    description: 'Add the Ansight SDK and enable network capture to inspect request timing, headers, bodies, and failures in future sessions.',
  },
  logs: {
    title: 'Expand app logging',
    description: 'Native device logs are available here. Add the Ansight SDK to capture structured app logs, custom events, spans, and exception details in future sessions.',
  },
  trees: {
    title: 'Inspect framework views with the SDK',
    description: 'Accessibility inspection is available externally. Add the Ansight SDK and the relevant UI tools to inspect framework view trees, framework properties, and SDK node overlays.',
  },
  artifacts: {
    title: 'Capture app-generated artifacts with the SDK',
    description: 'Files can be saved from the external file browser. Add the Ansight SDK to submit custom artifacts and capture app-defined state and diagnostics.',
  },
  fileAccess: {
    title: 'App-side file access is available with the SDK',
    description: 'Android private sandbox access through ADB requires a debuggable app or an already provisioned root daemon. Adding the Ansight SDK with file tools provides app-side access to permitted sandbox roots.',
  },
  overview: {
    title: 'Expand capabilities with the Ansight SDK',
    description: 'Add the SDK and the relevant integrations to capture app logs, exceptions, HTTP requests, custom telemetry, frame timing, spans, in-app touches and lifecycle events, and app-generated artifacts. SDK app tools add framework trees, navigation state, live app-state queries, managed-runtime diagnostics, and app-specific automation. These become available in future SDK sessions.',
  },
} as const

export type SdkCapabilityFeature = keyof typeof features

export function SdkTouchCaptureNotice() {
  return (
    <p className="sdk-touch-capture-notice" role="note" aria-label="Touch capture">
      <Info aria-hidden="true" />
      <span>Capture touch locations with the <a href={sdkSetupUrl} target="_blank" rel="noreferrer">Ansight SDK</a>. Enable touch capture for future sessions.</span>
    </p>
  )
}

export function SdkCapabilityNotice({ feature }: { feature: SdkCapabilityFeature }) {
  const content = features[feature]
  return (
    <aside className="sdk-capability-notice" aria-label={content.title}>
      <Info aria-hidden="true" />
      <div><strong>{content.title}</strong><p>{content.description}</p></div>
      <a href={sdkSetupUrl} target="_blank" rel="noreferrer">Add the Ansight SDK <ArrowSquareOut aria-hidden="true" /></a>
    </aside>
  )
}

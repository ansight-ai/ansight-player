import { useMemo } from 'react'
import { sanitizeArtifactHtml } from './artifactHtml'

export function HtmlArtifactPreview({ text }: { text: string }) {
  const source = useMemo(() => text.length <= 16 * 1024 * 1024 ? sanitizeArtifactHtml(text) : undefined, [text])
  if (source === undefined) return <p className="artifact-rich" role="alert">HTML preview is limited to 16 MiB. Download this report to inspect it locally.</p>
  return <div className="artifact-rich"><p>Static report preview. Scripts, forms, navigation, and external resources are disabled.</p><iframe className="artifact-document-frame" title="HTML report preview" sandbox="" srcDoc={source} referrerPolicy="no-referrer" /></div>
}

export function sanitizeArtifactHtml(text: string): string {
  const document = new DOMParser().parseFromString(text, 'text/html')
  document.querySelectorAll('script, iframe, frame, object, embed, base, meta, link, form').forEach(element => element.remove())
  document.querySelectorAll('*').forEach(element => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on') || ['srcdoc', 'action', 'formaction', 'target', 'download', 'ping'].includes(name)) element.removeAttribute(attribute.name)
      if (['href', 'xlink:href', 'src', 'srcset', 'poster'].includes(name) && !attribute.value.startsWith('#') && !(name === 'src' && /^data:image\/(png|jpeg|gif|webp|avif);/i.test(attribute.value))) element.removeAttribute(attribute.name)
    }
  })
  const policy = document.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'
  policy.content = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'"
  document.head.prepend(policy)
  return '<!doctype html>\n' + document.documentElement.outerHTML
}

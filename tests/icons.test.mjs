import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as icons from '../dist/library/icons.js'

const render = (Icon, props = {}) => renderToStaticMarkup(createElement(Icon, props))

test('Framework7 icons render SVG geometry without a font or external asset', () => {
  for (const [name, Icon] of Object.entries(icons)) {
    const svg = render(Icon)
    assert.match(svg, /viewBox="0 0 56 56"/, name)
    assert.match(svg, /<path /, name)
    assert.match(svg, /fill="currentColor"/, name)
    assert.doesNotMatch(svg, /<image|<use|<text/, name)
  }
})

test('selected pins and completion badges retain distinct filled states', () => {
  for (const Icon of [icons.PushPin, icons.CheckCircle]) {
    assert.notEqual(render(Icon, { weight: 'fill' }), render(Icon, { weight: 'regular' }))
  }
})

test('icons preserve sizing, animation classes and accessible names', () => {
  const decorative = render(icons.CircleNotch, { size: 18, className: 'spin' })
  assert.match(decorative, /width="18" height="18"/)
  assert.match(decorative, /class="spin"/)
  assert.match(decorative, /aria-hidden="true"/)
  const labelled = render(icons.CheckCircle, { 'aria-label': 'Complete', role: 'img' })
  assert.match(labelled, /aria-label="Complete"/)
  assert.doesNotMatch(labelled, /aria-hidden="true"/)
  const titled = render(icons.CheckCircle, { title: 'Complete' })
  assert.match(titled, /<title>Complete<\/title>/)
  assert.match(titled, /role="img"/)
})

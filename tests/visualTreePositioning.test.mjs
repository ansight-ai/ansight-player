import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { VisualTreeInspector } from '../dist/library/replay/components/VisualTreeInspector.js'

// Geometry from ControlCatalog 2453, snapshot 11. The corresponding 720 x 1558
// screenshot places the standard button at approximately (106, 562).
const snapshot = {
  snapshotId: 'controlcatalog-buttons-logical',
  source: 'sdk.touchCapture',
  payload: {
    source: 'avalonia-logical',
    types: ['Avalonia.Controls.Embedding.EmbeddableControlRoot', 'ControlCatalog.Pages.ButtonsPage',
      'Avalonia.Controls.Button', 'Avalonia.Controls.Primitives.AccessText'],
    root: {
      typeId: 0, bounds: [0, 0, 390, 844, 0, 0, 390, 844], children: [{
        typeId: 1, label: 'Buttons', visual: { text: 'Buttons' },
        bounds: [0, 0, 390, 748, 0, 96, 390, 748], children: [{
          typeId: 2, label: 'Standard _button', visual: { text: 'Standard _button' },
          bounds: [0, 0, 123.66666666666667, 27, 57, 304, 123.66666666666669, 27], children: [{
            typeId: 3, label: 'Standard _button', visual: { text: 'Standard _button' },
            bounds: [12, 6, 99.66666666666667, 14, 69, 310, 99.66666666666669, 14],
          }],
        }],
      }],
    },
  },
}

function preview(overrides = {}) {
  const html = renderToStaticMarkup(createElement(VisualTreeInspector, {
    snapshot, viewportWidth: 720, viewportHeight: 1558, ...overrides,
  }))
  return html.slice(html.indexOf('<aside'))
}

test('Avalonia absolute bounds are not offset again by their logical parents', () => {
  const html = preview()
  const button = html.match(/<button[^>]+title="Avalonia.Controls.Button · Standard _button"[^>]*>/)?.[0]
  assert.ok(button)
  const left = Number(button.match(/left:([\d.]+)%/)[1])
  const top = Number(button.match(/top:([\d.]+)%/)[1])
  assert.ok(Math.abs(left * 7.2 - 106) < 1)
  assert.ok(Math.abs(top * 15.58 - 562) < 1)
})

test('wireframe uses the positioned text child without duplicating the button or page labels', () => {
  const html = preview()
  assert.equal((html.match(/<span>Standard _button<\/span>/g) ?? []).length, 1)
  assert.doesNotMatch(html, /<span>Buttons<\/span>/)
  assert.match(html, /aria-label="Select Buttons"/)
})

test('screenshot preview preserves captured pixels and only overlays tree bounds', () => {
  const html = preview({ screenshotUrl: '/captured-buttons.png' })
  assert.match(html, /Tree bounds over captured screenshot/)
  assert.match(html, /src="\/captured-buttons.png"/)
  assert.doesNotMatch(html, /<span>Standard _button<\/span>|<span>Buttons<\/span>/)
})

test('a subtree cannot stretch the entire screenshot into its own small coordinate space', () => {
  const subtree = structuredClone(snapshot)
  subtree.payload.root = subtree.payload.root.children[0].children[0]
  const html = preview({ snapshot: subtree, screenshotUrl: '/captured-buttons.png' })
  assert.doesNotMatch(html, /<img|Tree bounds over captured screenshot/)
})

test('accessibility rectangles stay absolute despite their semantic parents', () => {
  const accessibility = structuredClone(snapshot)
  accessibility.payload.source = 'avalonia-accessibility'
  function convert(node) {
    const [x, y, width, height] = node.bounds.slice(4)
    node.bounds = { x, y, width, height }
    node.children?.forEach(convert)
  }
  convert(accessibility.payload.root)
  assert.equal(preview({ snapshot: accessibility }), preview())
})

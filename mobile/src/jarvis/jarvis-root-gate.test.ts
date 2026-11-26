// Why the lock's wiring is read from the syntax tree and not by rendering the root layout: the
// layout pulls in navigation, notifications and the transport, and what matters is one structural
// fact. Every screen hangs inside the gate (RF-2.1, docs/01-prd.md), pairing included.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const layoutPath = fileURLToPath(new URL('../../app/_layout.tsx', import.meta.url))
const sourceFile = ts.createSourceFile(
  layoutPath,
  readFileSync(layoutPath, 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
)

type OpeningTag = ts.JsxOpeningElement | ts.JsxSelfClosingElement

const isOpeningTag = (node: ts.Node): node is OpeningTag =>
  ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)

const tagNames = (nodes: OpeningTag[]): string[] =>
  nodes.map((node) => node.tagName.getText(sourceFile))

/** Every opening tag nested inside the element that `opening` starts, itself excluded. */
function openingTagsInside(opening: OpeningTag): OpeningTag[] {
  const found: OpeningTag[] = []
  const visit = (node: ts.Node): void => {
    if (node !== opening && isOpeningTag(node)) {
      found.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(ts.isJsxSelfClosingElement(opening) ? opening : opening.parent)
  return found
}

/** The opening tags that enclose `node`, outermost first. */
function enclosingTags(node: ts.Node): OpeningTag[] {
  const chain: OpeningTag[] = []
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxElement(current)) {
      chain.unshift(current.openingElement)
    }
  }
  return chain
}

function attributeOf(opening: OpeningTag, name: string): ts.JsxAttribute | undefined {
  return opening.attributes.properties.find(
    (attribute): attribute is ts.JsxAttribute => attribute.name?.getText(sourceFile) === name
  )
}

/** The value of a plain string attribute, without its quotes; empty when it is missing or an expression. */
function stringAttributeOf(opening: OpeningTag, name: string): string {
  const initializer = attributeOf(opening, name)?.initializer
  return initializer && ts.isStringLiteral(initializer) ? initializer.text : ''
}

describe('the root layout keeps the whole app behind the biometric lock', () => {
  const allOpeningTags: OpeningTag[] = []
  const collect = (node: ts.Node): void => {
    if (isOpeningTag(node)) {
      allOpeningTags.push(node)
    }
    ts.forEachChild(node, collect)
  }
  collect(sourceFile)

  const screens = allOpeningTags.filter((tag) => tagNames([tag])[0] === 'Stack.Screen')
  const gates = allOpeningTags.filter((tag) => tagNames([tag])[0] === 'LockGate')

  it('finds the assistant screens, the Orca home and the pairing flow', () => {
    expect(screens.map((screen) => stringAttributeOf(screen, 'name'))).toEqual(
      expect.arrayContaining(['jarvis', 'jarvis-settings', 'index', 'pair-scan'])
    )
  })

  it('hangs every screen inside the gate', () => {
    for (const screen of screens) {
      expect(
        tagNames(enclosingTags(screen)),
        `la pantalla ${stringAttributeOf(screen, 'name')} queda fuera del candado`
      ).toContain('LockGate')
    }
  })

  it('shows the character asleep on the lock screen', () => {
    expect(gates).toHaveLength(1)
    const character = attributeOf(gates[0], 'character')
    expect(character, 'el candado no recibe al personaje').toBeDefined()

    const sleeping = openingTagsInside(gates[0]).find(
      (tag) => tagNames([tag])[0] === 'JarvisCharacter'
    )
    expect(sleeping, 'la pantalla de bloqueo no dibuja al personaje').toBeDefined()
    expect(stringAttributeOf(sleeping!, 'activity')).toBe('sleeping')
  })
})

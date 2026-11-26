import { describe, expect, it } from 'vitest'
import { jarvisMarkdownToLines, type JarvisTranscriptLine } from './jarvis-markdown'

function lines(markdown: string): JarvisTranscriptLine[] {
  return jarvisMarkdownToLines(markdown)
}

function texts(markdown: string): string[] {
  return jarvisMarkdownToLines(markdown).map((line) => line.text)
}

function markersAndTexts(markdown: string): string[][] {
  return jarvisMarkdownToLines(markdown).map((line) => [line.marker ?? '', line.text])
}

function paragraph(text: string): JarvisTranscriptLine {
  return { kind: 'text', text, marker: null, depth: 0 }
}

function item(marker: string, text: string, depth = 0): JarvisTranscriptLine {
  return { kind: 'text', text, marker, depth }
}

function code(text: string): JarvisTranscriptLine {
  return { kind: 'code', text, marker: null, depth: 0 }
}

describe('jarvisMarkdownToLines: paragraphs', () => {
  it('keeps each written line as its own line', () => {
    expect(lines('Respuesta corta.\nEl detalle sigue aquí.')).toEqual([
      paragraph('Respuesta corta.'),
      paragraph('El detalle sigue aquí.')
    ])
  })

  it('drops the blank lines that separate paragraphs', () => {
    expect(texts('Primero.\n\n\nSegundo.\n')).toEqual(['Primero.', 'Segundo.'])
  })

  it('trims each line and accepts Windows line endings', () => {
    expect(texts('  Con sangría   \r\n\tSin nada\t')).toEqual(['Con sangría', 'Sin nada'])
  })

  it('collapses runs of spaces inside a line', () => {
    expect(texts('Dos   palabras    separadas')).toEqual(['Dos palabras separadas'])
  })

  it('returns nothing for empty or whitespace-only input', () => {
    expect(jarvisMarkdownToLines('')).toEqual([])
    expect(jarvisMarkdownToLines(' \n\t\n  ')).toEqual([])
  })
})

describe('jarvisMarkdownToLines: headings, quotes and rules', () => {
  it('drops the heading markers', () => {
    expect(texts('# Plan de hoy\n## Pasos\n### Lo que necesito de ti ###')).toEqual([
      'Plan de hoy',
      'Pasos',
      'Lo que necesito de ti'
    ])
  })

  it('keeps a hash that does not open a heading', () => {
    expect(texts('#1 está en revisión\nEl PR #12 falla')).toEqual([
      '#1 está en revisión',
      'El PR #12 falla'
    ])
  })

  it('drops thematic breaks', () => {
    expect(texts('Arriba\n---\n***\nAbajo')).toEqual(['Arriba', 'Abajo'])
  })

  it('unwraps block quotes, including nested ones', () => {
    expect(texts('> Citado\n> > Doble')).toEqual(['Citado', 'Doble'])
  })
})

describe('jarvisMarkdownToLines: lists', () => {
  it('numbers ordered items in sequence, as a markdown renderer would', () => {
    expect(lines('1. Revisa los PRs.\n2. Corrige el CI.\n10. Cierra.')).toEqual([
      item('1.', 'Revisa los PRs.'),
      item('2.', 'Corrige el CI.'),
      item('3.', 'Cierra.')
    ])
  })

  it('renumbers an agent that repeats 1. and keeps each level on its own count', () => {
    expect(lines('1. Uno\n   1. Uno y medio\n   1. Otro\n1. Dos\n2. Tres')).toEqual([
      item('1.', 'Uno', 0),
      item('1.', 'Uno y medio', 1),
      item('2.', 'Otro', 1),
      item('2.', 'Dos', 0),
      item('3.', 'Tres', 0)
    ])
  })

  it('starts counting from the number the agent wrote', () => {
    expect(markersAndTexts('3. Tercero\n4. Cuarto')).toEqual([
      ['3.', 'Tercero'],
      ['4.', 'Cuarto']
    ])
  })

  it('writes every bullet style with a dash', () => {
    expect(lines('- Uno\n* Dos\n+ Tres')).toEqual([
      item('–', 'Uno'),
      item('–', 'Dos'),
      item('–', 'Tres')
    ])
  })

  it('nests by indentation and returns to the outer level', () => {
    expect(
      lines('- Uno\n  - Uno y medio\n    - Dos\n- Otro\n1. Primer paso\n   1. Subpaso\n2. Segundo')
    ).toEqual([
      item('–', 'Uno', 0),
      item('–', 'Uno y medio', 1),
      item('–', 'Dos', 2),
      item('–', 'Otro', 0),
      item('1.', 'Primer paso', 0),
      item('1.', 'Subpaso', 1),
      item('2.', 'Segundo', 0)
    ])
  })

  it('joins an indented continuation to its item', () => {
    expect(
      lines('1. Revisa los PRs abiertos\n   y dime cuáles tienen CI en rojo.\n2. Lista.')
    ).toEqual([
      item('1.', 'Revisa los PRs abiertos y dime cuáles tienen CI en rojo.'),
      item('2.', 'Lista.')
    ])
  })

  it('closes the list when a paragraph starts at the margin after a blank line', () => {
    expect(lines('- Uno\n\nPárrafo aparte')).toEqual([
      item('–', 'Uno', 0),
      paragraph('Párrafo aparte')
    ])
  })

  it('keeps an item that is still arriving without its text', () => {
    expect(lines('1. Primero\n2.')).toEqual([item('1.', 'Primero'), item('2.', '')])
  })

  it('does not take emphasis or a lone hyphen for a bullet', () => {
    expect(texts('*ojalá* que sí\n-5 grados')).toEqual(['ojalá que sí', '-5 grados'])
  })
})

describe('jarvisMarkdownToLines: inline markers', () => {
  it('removes bold and italic markers and keeps the words', () => {
    expect(texts('**Importante** y *revisado* y ***ambos***')).toEqual([
      'Importante y revisado y ambos'
    ])
    expect(texts('__Negrita__ y _cursiva_')).toEqual(['Negrita y cursiva'])
  })

  it('leaves underscores inside identifiers alone', () => {
    expect(texts('Abre `src/jarvis/jarvis-entry.ts` y mira mi_variable_local')).toEqual([
      'Abre src/jarvis/jarvis-entry.ts y mira mi_variable_local'
    ])
  })

  it('removes strikethrough and inline code marks', () => {
    expect(texts('~~ya no~~ y `pnpm test`')).toEqual(['ya no y pnpm test'])
  })

  it('does not process markers inside inline code', () => {
    expect(texts('Escribe `**no es negrita**` y `_literal_`')).toEqual([
      'Escribe **no es negrita** y _literal_'
    ])
  })

  it('leaves an asterisk that is a multiplication sign or unmatched', () => {
    expect(texts('2 * 3 * 4 y **sin cerrar')).toEqual(['2 * 3 * 4 y **sin cerrar'])
  })

  it('unescapes markdown escapes', () => {
    expect(texts('\\*literal\\* y \\_literal\\_ y \\[corchete\\]')).toEqual([
      '*literal* y _literal_ y [corchete]'
    ])
  })
})

describe('jarvisMarkdownToLines: links', () => {
  it('keeps the link text and drops the target', () => {
    expect(
      texts('Mira [el PR #12](https://github.com/org/repo/pull/12 "título") cuando puedas')
    ).toEqual(['Mira el PR #12 cuando puedas'])
  })

  it('handles a target with parentheses and reference-style links', () => {
    expect(texts('[Nota](https://es.wikipedia.org/wiki/Nota_(desambiguación)) y [Ref][1]')).toEqual(
      ['Nota y Ref']
    )
  })

  it('keeps bare URLs, autolinks and image descriptions', () => {
    expect(
      texts('Entra a https://example.com/a?b=1 o <mailto:hola@x.co> ![logo](x.png) ![ ](y.png)')
    ).toEqual(['Entra a https://example.com/a?b=1 o mailto:hola@x.co logo'])
  })

  it('leaves a bracket that is not a link', () => {
    expect(texts('Revisa [esto] y [1]')).toEqual(['Revisa [esto] y [1]'])
  })
})

describe('jarvisMarkdownToLines: html and tables', () => {
  it('strips html tags and breaks the line at <br>', () => {
    expect(lines('Primera<br/>Segunda y <b>tercera</b>')).toEqual([
      paragraph('Primera'),
      paragraph('Segunda y tercera')
    ])
  })

  it('drops html comments', () => {
    expect(texts('<!-- nota del agente -->Visible')).toEqual(['Visible'])
  })

  it('joins table cells with a middle dot and drops the delimiter row', () => {
    expect(lines('| PR | CI |\n|---|:---:|\n| #12 | rojo |\n#14 | verde |')).toEqual([
      paragraph('PR · CI'),
      paragraph('#12 · rojo'),
      paragraph('#14 · verde')
    ])
  })

  it('leaves a pipe alone when no delimiter row follows', () => {
    expect(texts('Elige A | B')).toEqual(['Elige A | B'])
  })
})

describe('jarvisMarkdownToLines: code blocks', () => {
  it('keeps fenced code as monospaced lines with their indentation', () => {
    expect(
      lines('Antes\n```ts\nconst a = 1\n  if (a) {\n\treturn **a**\n  }\n```\nDespués')
    ).toEqual([
      paragraph('Antes'),
      code('const a = 1'),
      code('  if (a) {'),
      code('\treturn **a**'),
      code('  }'),
      paragraph('Después')
    ])
  })

  it('keeps blank lines inside a block', () => {
    expect(lines('```\nuno\n\n\ndos\n```')).toEqual([code('uno'), code(''), code(''), code('dos')])
  })

  it('shows an unfinished block while the answer is still arriving', () => {
    expect(lines('Copia esto:\n```\npnpm test')).toEqual([
      paragraph('Copia esto:'),
      code('pnpm test')
    ])
  })

  it('accepts tilde fences and a fence inside a list', () => {
    expect(lines('1. Corre:\n   ~~~\n   pnpm lint\n   ~~~')).toEqual([
      item('1.', 'Corre:'),
      code('pnpm lint')
    ])
  })

  it('never treats four-space indentation as code', () => {
    expect(lines('    solo sangría')).toEqual([paragraph('solo sangría')])
  })
})

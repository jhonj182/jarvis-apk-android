import { describe, expect, it } from 'vitest'
import { MAX_SENTENCE_CHARS, endsSentence, splitSentences } from './speech-sentences'

describe('splitSentences', () => {
  it.each([
    ['plain sentences', 'Uno. Dos. Tres.', ['Uno.', 'Dos.', 'Tres.']],
    ['an unfinished tail', 'Uno. Dos', ['Uno.', 'Dos']],
    [
      'questions and exclamations before a lowercase word',
      '¿Ya? sí. ¡No! vale.',
      ['¿Ya?', 'sí.', '¡No!', 'vale.']
    ],
    [
      'closing quotes and brackets',
      'Dijo «hola». Luego (nada). Se fue.',
      ['Dijo «hola».', 'Luego (nada).', 'Se fue.']
    ],
    [
      'titles',
      'Sr. García y Dra. Paz llegaron. Después salieron.',
      ['Sr. García y Dra. Paz llegaron.', 'Después salieron.']
    ],
    [
      'abbreviations before an uppercase word',
      'Revisé todo, etc. Después te cuento.',
      ['Revisé todo, etc.', 'Después te cuento.']
    ],
    ['initials', 'J. K. Rowling escribió. Vendió.', ['J. K. Rowling escribió.', 'Vendió.']],
    ['centuries', 'Es del s. XXI. Oye.', ['Es del s. XXI.', 'Oye.']],
    [
      'decimals and hours',
      'Mide 3.14 m a las 10.30 h. Bien.',
      ['Mide 3.14 m a las 10.30 h.', 'Bien.']
    ],
    [
      'a numbered item keeps its number',
      '12. Revisa los PRs. Bien.',
      ['12. Revisa los PRs.', 'Bien.']
    ],
    ['ellipsis always ends a sentence', 'Espera... ya llegó', ['Espera...', 'ya llegó']],
    ['an ellipsis character', 'Piensa… ¿y?', ['Piensa…', '¿y?']],
    [
      'a colon is not an end',
      'Haz esto: revisa. Luego: avisa.',
      ['Haz esto: revisa.', 'Luego: avisa.']
    ],
    ['empty', '   ', []],
    ['only punctuation', '— …', []]
  ])('%s', (_name, text, expected) => {
    expect(splitSentences(text)).toEqual(expected)
  })

  it('cuts a long sentence at clause punctuation and keeps every word', () => {
    const long = `Hoy ${'revisa los pull requests abiertos del repositorio, '.repeat(8)}y avísame.`
    const parts = splitSentences(long)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.join(' ')).toBe(long)
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(MAX_SENTENCE_CHARS)
    }
  })

  it('hard-cuts a clause that is long even without punctuation', () => {
    const word = 'palabra '
    const long = `${word.repeat(60).trim()}.`
    const parts = splitSentences(long)
    expect(parts.join(' ')).toBe(long)
    expect(parts.every((part) => part.length <= MAX_SENTENCE_CHARS)).toBe(true)
  })
})

describe('endsSentence', () => {
  it.each([
    ['Hola.', true],
    ['¿Qué tal?', true],
    ['«Sí».', true],
    ['(nada).', true],
    ['Hola', false],
    ['Haz esto:', false]
  ])('%s → %s', (text, expected) => {
    expect(endsSentence(text)).toBe(expected)
  })
})

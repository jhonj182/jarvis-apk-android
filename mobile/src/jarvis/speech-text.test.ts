import { describe, expect, it } from 'vitest'
import {
  SPEECH_SENTENCE_CAP,
  SPEECH_TRUNCATED_NOTICE,
  planSpeech,
  speakableText,
  speechSentences
} from './speech-text'

describe('speakableText', () => {
  it.each([
    [
      'drops fenced code blocks',
      'Corre esto:\n```bash\npnpm install\n```\nY avísame.',
      'Corre esto: Y avísame.'
    ],
    [
      'drops a fence that is still open (text still arriving)',
      'Primero:\n```\nconst x = 1',
      'Primero:'
    ],
    ['drops a tilde fence', '~~~ts\nlet a = 1\n~~~\nListo.', 'Listo.'],
    [
      'drops inline code',
      'Edita `package.json` y corre `pnpm install` ahora.',
      'Edita y corre ahora.'
    ],
    ['drops inline code that is still open', 'Edita `package.json y corre', 'Edita'],
    [
      'keeps link text and drops the URL',
      'Mira [el PR 12](https://github.com/a/b/pull/12) cuando puedas.',
      'Mira el PR 12 cuando puedas.'
    ],
    ['drops images with their alt text', '![logo](docs/logo.png) Hecho.', 'Hecho.'],
    ['drops bare URLs', 'Está en https://example.com/docs/a?b=1 ahora.', 'Está en ahora.'],
    [
      'removes table pipes, one row per sentence',
      '| Archivo | Líneas |\n|---|---:|\n| `a.ts` | 12 |\n| total | 42 |',
      'Archivo, Líneas. 12. total, 42'
    ],
    [
      'removes heading markers and ends the heading',
      '## Plan de hoy\nRevisa los PRs.',
      'Plan de hoy. Revisa los PRs.'
    ],
    [
      'removes bullets and keeps numbers',
      '- Primero\n- Segundo\n1. Tercero\n2) Cuarto',
      'Primero. Segundo. 1. Tercero. 2. Cuarto'
    ],
    ['removes block quote markers', '> Déjame revisar.\n> Los PRs.', 'Déjame revisar. Los PRs.'],
    [
      'removes emphasis markers',
      '**Importante**: revisa el _CI_ y *luego* avísame.',
      'Importante: revisa el CI y luego avísame.'
    ],
    ['keeps underscores inside words', 'Revisa `mobile_upper` y `snake_case_word`.', 'Revisa y.'],
    [
      'drops file paths',
      'Edita src/main/runtime/rpc-client.ts y mobile/src/jarvis/speech-text.ts.',
      'Edita y.'
    ],
    [
      'drops file paths with a line number and punctuation around',
      'Fíjate en (app/index.tsx:42) por favor.',
      'Fíjate en por favor.'
    ],
    ['drops bare file names', 'Revisa package.json, _layout.tsx y README.md.', 'Revisa y.'],
    [
      'keeps product names and numbers that look like file names',
      'Usa Node.js 20.11.1 y Vue.js.',
      'Usa Node.js 20.11.1 y Vue.js.'
    ],
    [
      'keeps fractions, units and slashes that are not paths',
      'Va a 24/7, unos 120 km/h, y/o 3/4 de taza.',
      'Va a 24/7, unos 120 km/h, y/o 3/4 de taza.'
    ],
    [
      'drops emojis and the space they leave',
      'Listo ✅ en 2 min 🎉. ¿Vamos?',
      'Listo en 2 min. ¿Vamos?'
    ],
    ['drops emoji-only lines', '- ✅ Hecho\n- 🎉', 'Hecho'],
    ['removes HTML tags', 'Primero.<br/>Segundo.', 'Primero. Segundo.'],
    [
      'drops horizontal rules and reference definitions',
      'Antes\n---\nDespués\n[ref]: https://x.y',
      'Antes. Después'
    ],
    [
      'joins soft-wrapped lines of one paragraph',
      'Van dos en revisión\ny uno con CI en rojo.',
      'Van dos en revisión y uno con CI en rojo.'
    ]
  ])('%s', (_name, markdown, expected) => {
    expect(speakableText(markdown)).toBe(expected)
  })

  it.each([
    ['empty string', ''],
    ['whitespace', ' \n\t '],
    ['only a code block', '```\nconst a = 1\n```'],
    ['only an emoji', '🚀'],
    ['only a path', 'src/jarvis/speech-text.ts']
  ])('returns an empty string for %s', (_name, markdown) => {
    expect(speakableText(markdown)).toBe('')
  })
})

describe('speechSentences', () => {
  it('splits on Spanish sentence punctuation', () => {
    expect(speechSentences('Van dos en revisión. ¿Quieres el detalle? ¡Claro que sí!')).toEqual([
      'Van dos en revisión.',
      '¿Quieres el detalle?',
      '¡Claro que sí!'
    ])
  })

  it('reads a numbered plan as one sentence per step, in order', () => {
    const plan =
      'Plan de hoy:\n\n1. Revisa los PRs abiertos.\n2. Corre el CI en sarlaft\n3. Envía el resumen por WhatsApp.'
    expect(speechSentences(plan)).toEqual([
      'Plan de hoy:',
      '1. Revisa los PRs abiertos.',
      '2. Corre el CI en sarlaft.',
      '3. Envía el resumen por WhatsApp.'
    ])
  })

  it.each([
    ['decimals', 'Son 3.14 unidades. Y media hora.', ['Son 3.14 unidades.', 'Y media hora.']],
    ['titles', 'Sr. García llegó. Dra. Paz también.', ['Sr. García llegó.', 'Dra. Paz también.']],
    [
      'abbreviations before a lower-case word',
      'Revisé docs, CI, etc. y todo bien. Después te cuento.',
      ['Revisé docs, CI, etc. y todo bien.', 'Después te cuento.']
    ],
    [
      'initials',
      'Lo escribió J. K. Rowling. Y vendió mucho.',
      ['Lo escribió J. K. Rowling.', 'Y vendió mucho.']
    ],
    ['ordinals', 'Vamos en el s. XXI. Sin prisa.', ['Vamos en el s. XXI.', 'Sin prisa.']],
    ['hours', 'Son las 10.30 h. Empieza a las 11.', ['Son las 10.30 h.', 'Empieza a las 11.']]
  ])('does not split inside %s', (_name, text, expected) => {
    expect(speechSentences(text)).toEqual(expected)
  })

  it('splits after an ellipsis', () => {
    expect(speechSentences('Espera... ya llegó. ¿Vemos?')).toEqual([
      'Espera...',
      'ya llegó.',
      '¿Vemos?'
    ])
  })

  it('drops sentences left empty after stripping', () => {
    expect(speechSentences('Hecho. `x=1`. Sigue.')).toEqual(['Hecho.', 'Sigue.'])
  })

  it('cuts a very long sentence at its last comma', () => {
    const clause = 'revisa los pull requests abiertos del repositorio, '
    const long = `Hoy toca ${clause.repeat(7)}y avísame.`
    const sentences = speechSentences(long)
    expect(sentences.length).toBeGreaterThan(1)
    expect(sentences.join(' ')).toBe(long)
    for (const sentence of sentences) {
      expect(sentence.length).toBeLessThanOrEqual(230)
    }
  })

  it(`reads at most ${SPEECH_SENTENCE_CAP} sentences and announces the cut`, () => {
    const nine = Array.from({ length: 9 }, (_unused, index) => `Frase ${index + 1}.`).join(' ')
    expect(speechSentences(nine)).toEqual([
      ...Array.from({ length: SPEECH_SENTENCE_CAP }, (_unused, index) => `Frase ${index + 1}.`),
      SPEECH_TRUNCATED_NOTICE
    ])
  })

  it('reads a reply of exactly eight sentences whole, without the notice', () => {
    const eight = Array.from({ length: 8 }, (_unused, index) => `Frase ${index + 1}.`).join(' ')
    expect(speechSentences(eight)).toHaveLength(8)
    expect(speechSentences(eight)).not.toContain(SPEECH_TRUNCATED_NOTICE)
  })

  it.each([
    ['empty string', ''],
    ['whitespace', '\n\n'],
    ['only a code block', '```\nconst a = 1\n```'],
    ['only an emoji', '🚀'],
    ['only a path', 'src/jarvis/speech-text.ts']
  ])('returns an empty list for %s', (_name, markdown) => {
    expect(speechSentences(markdown)).toEqual([])
  })
})

describe('planSpeech', () => {
  it('marks a reply settled when it ends with sentence punctuation', () => {
    expect(planSpeech('Hola. ¿Qué necesitas?')).toEqual({
      sentences: ['Hola.', '¿Qué necesitas?'],
      settled: true,
      truncated: false
    })
  })

  it('keeps the unfinished last sentence out until it ends', () => {
    expect(planSpeech('Hola. ¿Qué necesitas')).toEqual({
      sentences: ['Hola.', '¿Qué necesitas'],
      settled: false,
      truncated: false
    })
  })

  it('treats a finished list item as settled even without a period', () => {
    expect(planSpeech('1. Revisa los PRs\n2. Mira el CI').settled).toBe(false)
    expect(planSpeech('1. Revisa los PRs\n2. Mira el CI\n').settled).toBe(false)
    expect(planSpeech('1. Revisa los PRs\n2. Mira el CI\n\nY avísame.').settled).toBe(true)
  })

  it('settles a cut reply because nothing more will be read from it', () => {
    const nine = Array.from({ length: 9 }, (_unused, index) => `Frase ${index + 1}.`).join(' ')
    expect(planSpeech(nine)).toMatchObject({ settled: true, truncated: true })
    expect(planSpeech(nine).sentences.at(-1)).toBe(SPEECH_TRUNCATED_NOTICE)
  })
})

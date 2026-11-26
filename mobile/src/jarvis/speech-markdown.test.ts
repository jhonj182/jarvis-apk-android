import { describe, expect, it } from 'vitest'
import { speakableUnits, stripInlineMarkup } from './speech-markdown'

describe('stripInlineMarkup', () => {
  it.each([
    ['plain text passes through', 'Hola, ¿qué necesitas?', 'Hola, ¿qué necesitas?'],
    ['keeps a lone comparator', 'si a < b, avísame', 'si a < b, avísame'],
    ['collapses the gap a removed token leaves', 'Revisa  `x`   ahora .', 'Revisa ahora.'],
    ['swallows the comma that followed a removed token', 'Mira `a.ts`, y sigue.', 'Mira y sigue.'],
    [
      'keeps the sentence end of a sentence that emptied out',
      'Hecho. `x=1`. Sigue.',
      'Hecho. Sigue.'
    ],
    ['drops a punctuation run left alone', '. , Hola.', 'Hola.'],
    ['removes escaped markdown', 'Es 3\\*4 y \\_esto\\_.', 'Es 3*4 y _esto_.'],
    ['keeps a literal asterisk between digits', 'son 2*3 puntos', 'son 2*3 puntos']
  ])('%s', (_name, text, expected) => {
    expect(stripInlineMarkup(text)).toBe(expected)
  })

  describe('file paths', () => {
    it.each([
      'src/main/runtime/rpc-client.ts',
      'mobile/src/jarvis/speech-text.ts',
      'docs/01-prd.md',
      './scripts/build.sh',
      '../src/shared/x.ts',
      '~/wp-sites/a.php',
      '/home/jhon/orca/projects/jarvis-mobile-brain/AGENTS.md',
      'C:\\Users\\jhon\\AppData\\Roaming\\orca',
      'app/index.tsx:42',
      'src/jarvis/use-jarvis-conversation.ts:12-40',
      'package.json',
      'pnpm-lock.yaml',
      '_layout.tsx',
      'README.md',
      'CLAUDE.md',
      '.gitignore',
      '.env.local',
      'tsconfig.json,'
    ])('strips %s', (token) => {
      expect(stripInlineMarkup(`Revisa ${token} y avísame.`)).toBe('Revisa y avísame.')
    })

    it.each([
      'y/o',
      'km/h',
      'm/s',
      '24/7',
      '3/4',
      '25/11/2026',
      'and/or',
      'día/noche',
      'café/té',
      'Node.js',
      'Vue.js',
      'Next.js',
      '20.11.1',
      '3.14',
      'etc.',
      'Sr.',
      'e.g.',
      'U.S.',
      'github.com',
      'jhon@example.com',
      'sr.'
    ])('keeps %s', (token) => {
      expect(stripInlineMarkup(`Va ${token} bien.`)).toBe(`Va ${token} bien.`)
    })
  })

  describe('emojis', () => {
    it.each(['✅', '🎉', '🚀', '👍🏽', '🇨🇴', '❤️', '⭐', '⚠️', '✔', '😀'])('strips %s', (emoji) => {
      expect(stripInlineMarkup(`Listo ${emoji}.`)).toBe('Listo.')
    })

    it('keeps the characters emojis are built from', () => {
      expect(stripInlineMarkup('Son #3 y 2*3, el 70% y el 42')).toBe('Son #3 y 2*3, el 70% y el 42')
    })
  })
})

describe('speakableUnits', () => {
  it('turns headings, list items and table rows into their own units', () => {
    expect(
      speakableUnits(
        '# Título\n\nPárrafo largo\nque sigue.\n\n- Uno\n- Dos\n\n| a | b |\n|---|---|\n| 1 | 2 |'
      )
    ).toEqual(['Título', 'Párrafo largo que sigue.', 'Uno', 'Dos', 'a, b', '1, 2'])
  })

  it('reads a table whose rows have no outer pipes', () => {
    expect(speakableUnits('Paso | Tiempo\n--- | ---:\nrevisar | 5 min')).toEqual([
      'Paso, Tiempo',
      'revisar, 5 min'
    ])
  })

  it('keeps an indented continuation line inside its list item', () => {
    expect(speakableUnits('- Revisa los PRs\n  de sarlaft.\n- Sigue.')).toEqual([
      'Revisa los PRs de sarlaft.',
      'Sigue.'
    ])
  })

  it('drops units left empty', () => {
    expect(speakableUnits('- `a`\n- 🚀\n- Real')).toEqual(['Real'])
  })
})

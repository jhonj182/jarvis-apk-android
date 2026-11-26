// Classifies dictation and keyboard text that must be answered on the phone,
// without a round trip to the agent. Music playback is the one local order:
// a false positive steals a normal message from the agent, a false negative
// only costs one agent hop, so anything ambiguous stays `unknown`.

export type LocalIntent =
  | { kind: 'music.play'; query: string }
  | { kind: 'unknown' }

// Matched against normalized tokens, exact per word. Multi-word phrases must be
// tried first so "pon a sonar salsa" is not consumed by the bare verb "pon".
const MUSIC_VERB_PHRASES = [
  'pon a sonar',
  'quiero escuchar',
  'dejame escuchar',
  'pongame',
  'reproduzca',
  'reproduce',
  'ponme',
  'tocame',
  'metele',
  'escucho',
  'pone',
  'toca',
  'pon'
].sort((a, b) => b.split(' ').length - a.split(' ').length)

// Why strip diacritics for matching: dictation returns both "música" and
// "musica" depending on the engine, so comparison is accent- and case-blind.
// The query itself keeps the original spelling.
const COMBINING_MARKS = /[̀-ͯ]/g
const EDGE_PUNCTUATION = /^[.,;:!?¿¡()"']+|[.,;:!?¿¡()"']+$/g

// Dropped anywhere in the remainder: search terms for a music app, not noise.
const MUSIC_NOUNS = new Set(['musica', 'cancion', 'canciones'])

// Dropped only while they lead the remainder, never inside it: "de
// entrenamiento" survives in "playlist de entrenamiento".
const LEADING_FILLERS = new Set([
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'de',
  'del',
  'a',
  'algo',
  'poco'
])

interface Token {
  raw: string
  norm: string
}

function normalizeToken(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(EDGE_PUNCTUATION, '')
}

function tokenize(text: string): Token[] {
  return text
    .split(/\s+/)
    .map((raw) => ({ raw, norm: normalizeToken(raw) }))
    .filter(({ norm }) => norm.length > 0)
}

function verbTokenCount(tokens: Token[]): number {
  for (const phrase of MUSIC_VERB_PHRASES) {
    const words = phrase.split(' ')
    const matches =
      tokens.length >= words.length && words.every((word, index) => tokens[index].norm === word)
    if (matches) {
      return words.length
    }
  }
  return 0
}

export function classifyLocalIntent(text: string): LocalIntent {
  const tokens = tokenize(text)
  const verb = verbTokenCount(tokens)
  if (verb === 0) {
    return { kind: 'unknown' }
  }

  const rest = tokens.slice(verb).filter((token) => !MUSIC_NOUNS.has(token.norm))
  let start = 0
  while (start < rest.length && LEADING_FILLERS.has(rest[start].norm)) {
    start += 1
  }

  const query = rest
    .slice(start)
    .map((token) => token.raw)
    .join(' ')
    .replace(EDGE_PUNCTUATION, '')
    .trim()

  return { kind: 'music.play', query }
}

export function musicConfirmation(intent: { kind: 'music.play'; query: string }): string {
  return `Reproduciendo ${intent.query || 'música'} en YouTube Music.`
}

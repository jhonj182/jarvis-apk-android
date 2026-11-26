// Classifies dictation and keyboard text that must be answered on the phone,
// without a round trip to the agent. Music playback is the one local order:
// a false positive steals a normal message from the agent, a false negative
// only costs one agent hop, so anything ambiguous stays `unknown`.

export type LocalIntent = { kind: 'music.play'; query: string } | { kind: 'unknown' }

interface VerbRule {
  phrase: string
  // Why the split: after "reproduce" or "escucho" comes what to play. "pon" also
  // means set, put or add ("pon la alarma"), so what follows must carry a music
  // marker or the text is the agent's job.
  needsMusicMarker: boolean
  // "toca" also means "one has to": "toca revisar" is a duty, not an order to play.
  infinitiveIsDuty?: boolean
}

// Matched against normalized tokens, exact per word. Multi-word phrases must be
// tried first so "pon a sonar salsa" is not consumed by the bare verb "pon".
const VERB_RULES: VerbRule[] = [
  { phrase: 'pon a sonar', needsMusicMarker: false },
  { phrase: 'quiero escuchar', needsMusicMarker: false },
  { phrase: 'dejame escuchar', needsMusicMarker: false },
  { phrase: 'reproduzca', needsMusicMarker: false },
  { phrase: 'reproduce', needsMusicMarker: false },
  { phrase: 'tocame', needsMusicMarker: false, infinitiveIsDuty: true },
  { phrase: 'toca', needsMusicMarker: false, infinitiveIsDuty: true },
  { phrase: 'metele', needsMusicMarker: false },
  { phrase: 'escucho', needsMusicMarker: false },
  { phrase: 'pongame', needsMusicMarker: true },
  { phrase: 'ponme', needsMusicMarker: true },
  { phrase: 'pone', needsMusicMarker: true },
  { phrase: 'pon', needsMusicMarker: true }
].sort((a, b) => b.phrase.split(' ').length - a.phrase.split(' ').length)

// What people say to the assistant before the order. The dictation keeps it,
// and "Jarvis, pon música" must not fail just because the wake word came along.
const ADDRESS_TOKENS = new Set(['oye', 'jarvis', 'ey', 'oiga', 'ok', 'okey', 'okay', 'bueno'])

// What people say after the order. None of it is a search term.
const TRAILING_POLITENESS = new Set(['por', 'favor', 'porfa', 'porfavor', 'gracias'])

// Words that only make sense inside a music order. They are dropped from the
// search term ("música de salsa" searches salsa) and are a music marker alone.
const MUSIC_ONLY_NOUNS = new Set(['musica', 'cancion', 'canciones', 'cancioncita'])

// Openers that turn "pon" into a music order: "pon algo de salsa",
// "póngame una de Shakira".
const MUSIC_OPENERS = new Set(['algo', 'un', 'una', 'unos', 'unas', 'poco'])

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
  'algo',
  'poco',
  'mi',
  'mis',
  'a'
])

// Genres people name without the word "música" ("ponme salsa"). Compared
// without accents. It is a marker, not a search restriction: an unknown genre
// still plays when the order says "música de".
const GENRES = new Set([
  'salsa',
  'vallenato',
  'bachata',
  'merengue',
  'reggaeton',
  'champeta',
  'cumbia',
  'porro',
  'bolero',
  'tropical',
  'carrilera',
  'llanera',
  'carranga',
  'rock',
  'pop',
  'jazz',
  'blues',
  'soul',
  'funk',
  'disco',
  'reggae',
  'ska',
  'punk',
  'metal',
  'indie',
  'electronica',
  'techno',
  'house',
  'hip',
  'rap',
  'trap',
  'balada',
  'baladas',
  'romantica',
  'romantico',
  'cristiana',
  'clasica',
  'clasico',
  'instrumental',
  'mariachi',
  'ranchera',
  'banda',
  'nortena',
  'afrobeat',
  'flamenco',
  'boleros'
])

// Why strip diacritics for matching: dictation returns both "música" and
// "musica" depending on the engine, so comparison is accent- and case-blind.
// The query itself keeps the original spelling.
const COMBINING_MARKS = /[̀-ͯ]/g
const EDGE_PUNCTUATION = /^[.,;:!?¿¡()"']+|[.,;:!?¿¡()"']+$/g

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

function findVerb(tokens: Token[]): { rule: VerbRule; length: number } | null {
  for (const rule of VERB_RULES) {
    const words = rule.phrase.split(' ')
    const matches =
      tokens.length >= words.length && words.every((word, index) => tokens[index].norm === word)
    if (matches) {
      return { rule, length: words.length }
    }
  }
  return null
}

function trimTokens(tokens: Token[]): Token[] {
  let start = 0
  let end = tokens.length
  while (start < end && ADDRESS_TOKENS.has(tokens[start].norm)) {
    start += 1
  }
  while (end > start && TRAILING_POLITENESS.has(tokens[end - 1].norm)) {
    end -= 1
  }
  return tokens.slice(start, end)
}

// Why: in Colombian Spanish "toca revisar los PRs" means "one has to review the PRs". With an
// infinitive right after "toca", only a named genre or the word "música" makes it an order to play.
const isInfinitive = (norm: string | undefined): boolean =>
  norm !== undefined && norm.length >= 2 && /[a-zñ]*(ar|er|ir)$/.test(norm)

const namesMusic = (rest: Token[]): boolean =>
  rest.some((token) => MUSIC_ONLY_NOUNS.has(token.norm) || GENRES.has(token.norm))

function isMusicOrder(rest: Token[], needsMusicMarker: boolean): boolean {
  if (!needsMusicMarker) {
    return true
  }
  if (rest.some((token) => MUSIC_ONLY_NOUNS.has(token.norm))) {
    return true
  }
  const first = rest[0]
  return first !== undefined && (MUSIC_OPENERS.has(first.norm) || GENRES.has(first.norm))
}

function buildQuery(rest: Token[]): string {
  const content = rest.filter((token) => !MUSIC_ONLY_NOUNS.has(token.norm))
  let start = 0
  while (start < content.length && LEADING_FILLERS.has(content[start].norm)) {
    start += 1
  }
  return content
    .slice(start)
    .map((token) => token.raw)
    .join(' ')
    .replace(EDGE_PUNCTUATION, '')
    .trim()
}

export function classifyLocalIntent(text: string): LocalIntent {
  const tokens = trimTokens(tokenize(text))
  const verb = findVerb(tokens)
  if (!verb) {
    return { kind: 'unknown' }
  }

  let rest = tokens.slice(verb.length)
  if (verb.rule.infinitiveIsDuty && isInfinitive(rest[0]?.norm)) {
    if (!namesMusic(rest)) {
      return { kind: 'unknown' }
    }
    // The infinitive was the order itself ("toca escuchar salsa"); the genre is what plays.
    rest = rest.slice(1)
  } else if (!isMusicOrder(rest, verb.rule.needsMusicMarker)) {
    return { kind: 'unknown' }
  }
  return { kind: 'music.play', query: buildQuery(rest) }
}

export function musicConfirmation(intent: { kind: 'music.play'; query: string }): string {
  return `Reproduciendo ${intent.query || 'música'} en YouTube Music.`
}

// Splits clean text into the units the voice reads one at a time. Pure.

/** The Android engine rejects an utterance past 4000 characters and cuts long ones mid-way. */
export const MAX_SENTENCE_CHARS = 220

const TERMINATORS = '.!?…'
const CLOSERS = '"\'”’)]}»'
const ENUMERATOR = /^\d{1,3}[.)]\s+/
const LONE_ENUMERATOR = /^\d{1,3}[.)]$/
const SENTENCE_START = /^[A-Z0-9¿¡"'“‘([{#]/
const HAS_WORDS = /[A-Za-z0-9À-ɏͰ-ӿ؀-ۿऀ-๿぀-ヿ一-鿿]/
// Why: these are followed by a capitalized name or number without starting a new sentence.
// Lower-case units such as `h.` (hora) stay out: `a las 10.30 h. Bien.` are two sentences.
const TITLES = new Set(
  (
    'sr sra srta dr dra prof profa lic ing arq cap ten tte my cnel gral brig ee uu pp ej fig figs sec art ' +
    'ref refs caps sig tel av pag pág págs num núm s p n c'
  ).split(' ')
)

function isTerminatorAt(text: string, index: number): boolean {
  return index < text.length && TERMINATORS.includes(text.charAt(index))
}

function endsHere(body: string, terminatorIndex: number, isRun: boolean): boolean {
  // Why: `?`, `!` and an ellipsis end a sentence even before a lower-case word.
  if (body.charAt(terminatorIndex) !== '.' || isRun) {
    return true
  }
  const word = /\S*$/.exec(body.slice(0, terminatorIndex))?.[0] ?? ''
  if (!/[A-Za-zÀ-ÿ]$/.test(word)) {
    return true
  }
  // Why: `J. K. Rowling` are initials; a lone lower-case letter is a unit such as `h`.
  const isInitial = word.length === 1 && word === word.toUpperCase()
  if (isInitial || TITLES.has(word.toLowerCase())) {
    return false
  }
  const rest = body.slice(terminatorIndex + 1)
  return rest.trim() === '' || SENTENCE_START.test(rest.trimStart())
}

function sentencesOf(body: string): string[] {
  const out: string[] = []
  let start = 0
  let index = 0
  while (index < body.length) {
    if (!TERMINATORS.includes(body.charAt(index))) {
      index += 1
      continue
    }
    const runStart = index
    let runEnd = index
    while (isTerminatorAt(body, runEnd + 1)) {
      runEnd += 1
    }
    let next = runEnd + 1
    while (next < body.length && CLOSERS.includes(body.charAt(next))) {
      next += 1
    }
    const reached = next
    index = next
    // Why: a dot with no space after it is a decimal, an hour or a host name.
    if (reached < body.length && !/\s/.test(body.charAt(reached))) {
      continue
    }
    if (!endsHere(body, runEnd, runEnd > runStart)) {
      continue
    }
    out.push(body.slice(start, reached).trim())
    start = reached
  }
  if (start < body.length) {
    out.push(body.slice(start).trim())
  }
  return out.filter((sentence) => sentence !== '')
}

/** Index of the space after the last comma, semicolon or colon in the window. */
function lastClauseBreak(window: string): number {
  for (let index = window.length - 1; index > 0; index -= 1) {
    if (window.charAt(index) === ' ' && ',;:'.includes(window.charAt(index - 1))) {
      return index
    }
  }
  return -1
}

function cut(sentence: string): string[] {
  if (sentence.length <= MAX_SENTENCE_CHARS) {
    return [sentence]
  }
  const pieces: string[] = []
  let rest = sentence
  while (rest.length > MAX_SENTENCE_CHARS) {
    const window = rest.slice(0, MAX_SENTENCE_CHARS + 1)
    const clauseBreak = lastClauseBreak(window)
    const end = clauseBreak > 0 ? clauseBreak : window.lastIndexOf(' ')
    if (end <= 0) {
      break
    }
    pieces.push(rest.slice(0, end))
    rest = rest.slice(end + 1)
  }
  pieces.push(rest)
  return pieces
}

/** True when the text ends with sentence punctuation, optionally inside quotes or brackets. */
export function endsSentence(text: string): boolean {
  return /[.!?…]["'”’)\]}»]*$/.test(text)
}

/** Splits one clean block into sentences; a list number stays with its item. */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim()
  if (LONE_ENUMERATOR.test(trimmed)) {
    return []
  }
  const enumerator = ENUMERATOR.exec(trimmed)
  const body = enumerator ? trimmed.slice(enumerator[0].length) : trimmed
  const prefix = enumerator ? `${enumerator[0].trim()} ` : ''
  const pieces = sentencesOf(body)
    .flatMap(cut)
    .filter((piece) => HAS_WORDS.test(piece))
  return pieces.map((piece, index) => (index === 0 ? `${prefix}${piece}` : piece))
}

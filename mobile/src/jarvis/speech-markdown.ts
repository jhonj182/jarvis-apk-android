// Markdown → plain text that is safe to read aloud. Pure: no React, no platform.
// Code, images, URLs, file paths and emojis leave; the words stay.

/** Marks a removed token so the punctuation around it can be tidied up afterwards. */
// Why a private-use character: it cannot occur in an agent's text and it is not a control character.
const REMOVED = '\uE000'

const FENCE = /^\s{0,3}(`{3,}|~{3,})/
const HEADING = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/
const BULLET = /^\s{0,3}[-*+•]\s+/
const ORDERED_ITEM = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/
const QUOTE_MARKERS = /^\s{0,3}(?:>\s?)+/
const REFERENCE_DEFINITION = /^\s{0,3}\[[^\]]+\]:\s+\S+/
const TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/

const HTML_TAG = /<\/?[a-zA-Z][^>]*>/g
const IMAGE_INLINE = /!\[[^\]]*\]\([^)]*\)/g
const IMAGE_REFERENCE = /!\[[^\]]*\]\[[^\]]*\]/g
const LINK_INLINE = /\[([^\]]+)\]\([^)]*\)/g
const LINK_REFERENCE = /\[([^\]]+)\]\[[^\]]*\]/g
const FOOTNOTE_MARKER = /\[\^[^\]]*\]/g
const TASK_MARKER = /\[[ xX]\]/g
const CODE_DOUBLE_BACKTICK = /``+[^`]*``+/g
const CODE_SINGLE_BACKTICK = /`[^`\n]*`/g
// Why: while a reply streams, its last span of inline code has no closing backtick yet.
const CODE_STILL_OPEN = /`[^`\n]*$/g
const URL = /\b(?:https?|file):\/\/[^\s<>()[\]"']+|\bwww\.[^\s<>()[\]"']+/gi
// Why: explicit ranges instead of \p{Extended_Pictographic}, which also matches
// `#`, `*` and the digits, and whose support in Hermes cannot be checked here.
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{231A}-\u{231B}]|\u{FE0E}|\u{FE0F}|\u{200D}|\u{20E3}/gu
const ESCAPED_MARKDOWN = /\\([\\`*_{}[\]()#+\-.!~|>])/g
// Why: private-use characters, so the emphasis patterns below cannot match an escaped marker.
const ESCAPED_LITERALS: Record<string, string> = { '*': '\uE001', _: '\uE002', '~': '\uE003' }
const RESTORED_LITERALS: Record<string, string> = { '\uE001': '*', '\uE002': '_', '\uE003': '~' }
const EMPHASIS_STAR = /(^|[^\w])\*([^*\n]+)\*(?=[^\w]|$)/g
const EMPHASIS_UNDERSCORE = /(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/g

const PATH_EXTENSIONS = new Set(
  (
    'ts tsx js jsx mjs cjs json json5 jsonc md mdx markdown yaml yml toml txt log csv tsv xml html htm ' +
    'css scss sass less py java kt kts swift m mm h c cc cpp hpp sh bash zsh fish ps1 sql gradle properties ' +
    'plist pro lock env png jpg jpeg gif svg webp ico pdf zip gz tar apk ipa aab map snap conf cfg ini bak ' +
    'tmp patch diff'
  ).split(' ')
)
const CODE_ROOTS = new Set(
  (
    'src app lib libs doc docs mobile scripts config packages plugins assets public test tests spec build ' +
    'dist server client api core ui components hooks utils types android ios www bin etc var opt usr home'
  ).split(' ')
)
const BARE_FILE = /^([\w.-]+)\.([a-z][a-z0-9]{0,9})$/i
const DOTFILE = /^\.[a-z][\w.-]*$/i
const LINE_SUFFIX = /:\d+(?:-\d+)?$/
const LEADING_PUNCTUATION = /^([([{<«"“‘']*)(.*)$/
const TRAILING_PUNCTUATION = /^(.*?)((?:[)\]}>,;:!?…»"”’']|\.)+$)/

function identifierLike(segment: string): boolean {
  return (
    /[A-Za-z]/.test(segment) &&
    (/\d|[_-]/.test(segment) || /[a-z][A-Z]/.test(segment) || /[A-Z].*[A-Z]/.test(segment))
  )
}

/** Heuristic, tuned to keep `y/o`, `km/h`, `24/7` and product names like `Node.js` spoken. */
function isPathLike(token: string): boolean {
  const core = token.replace(LINE_SUFFIX, '')
  // Why: a backslash between names is a Windows path; `\*` and `\_` are escaped Markdown.
  if (/\\[A-Za-z0-9]/.test(core)) {
    return true
  }
  const segments = core.split('/')
  if (segments.length > 1) {
    if (/^[.~]?\//.test(core)) {
      return true
    }
    if (segments.length >= 3) {
      return (
        segments.some((segment) => /[A-Za-z]/.test(segment)) &&
        segments.some((segment) => segment.length >= 3)
      )
    }
    const [head, tail] = segments
    const file = BARE_FILE.exec(tail ?? '')
    if (file && PATH_EXTENSIONS.has(file[2].toLowerCase())) {
      return true
    }
    return (
      CODE_ROOTS.has((head ?? '').toLowerCase()) ||
      [head, tail].some((segment) => identifierLike(segment ?? ''))
    )
  }
  const file = BARE_FILE.exec(core)
  if (file && PATH_EXTENSIONS.has(file[2].toLowerCase())) {
    // Why: `Node.js` and `Vue.js` are products in prose, not files; code files are lower case.
    return !(file[2].toLowerCase() === 'js' && /^[A-Z]/.test(file[1]))
  }
  return DOTFILE.test(core)
}

function stripPathToken(token: string): string {
  const leading = LEADING_PUNCTUATION.exec(token)
  const rest = leading ? leading[2] : token
  const trailing = TRAILING_PUNCTUATION.exec(rest)
  const core = trailing ? trailing[1] : rest
  return isPathLike(core) ? `${leading?.[1] ?? ''}${REMOVED}${trailing?.[2] ?? ''}` : token
}

function stripPaths(text: string): string {
  return text
    .split(/(\s+)/)
    .map((part, index) => (index % 2 === 1 ? part : stripPathToken(part)))
    .join('')
}

function tidy(text: string): string {
  return text
    .replace(/\uE000\s*[;,]\s*/g, ' ')
    .replace(/\(\s*\uE000\s*\)/g, ' ')
    .replace(/\s*\uE000(?:\s*\uE000)*\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/([^.!?,;:…])\s+([.,;:!?…])/g, '$1$2')
    .replace(/[.!?…]\s+[.,;:!?…]+(?=\s|$)/g, (match) => `${match.charAt(0)} `)
    .replace(/^[.,;:!?…]+\s+/, '')
    .replace(/\s+[.,;:]+(?=\s|$)/g, '')
    .replace(/([([{«“‘])\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Removes what must not be read from one run of text: inline code, links, paths, emojis. */
export function stripInlineMarkup(text: string): string {
  // Why: paths are matched on whole tokens, so emphasis markers are only removed afterwards.
  const marked = stripPaths(
    text
      .replace(HTML_TAG, ' ')
      .replace(IMAGE_INLINE, ' ')
      .replace(IMAGE_REFERENCE, ' ')
      .replace(LINK_INLINE, '$1')
      .replace(LINK_REFERENCE, '$1')
      .replace(FOOTNOTE_MARKER, ' ')
      .replace(TASK_MARKER, ' ')
      .replace(CODE_DOUBLE_BACKTICK, ` ${REMOVED} `)
      .replace(CODE_SINGLE_BACKTICK, ` ${REMOVED} `)
      .replace(CODE_STILL_OPEN, ` ${REMOVED} `)
      .replace(URL, ` ${REMOVED} `)
      .replace(EMOJI, REMOVED)
      // Why: `\*` and `\_` are literals, so they hide while emphasis markers are removed.
      .replace(ESCAPED_MARKDOWN, (_match, char: string) => ESCAPED_LITERALS[char] ?? char)
  )
  return tidy(
    marked
      .replace(/(\*\*|__|~~)/g, '')
      .replace(EMPHASIS_STAR, '$1$2')
      .replace(EMPHASIS_UNDERSCORE, '$1$2')
      .replace(/[\uE001\uE002\uE003]/g, (char) => RESTORED_LITERALS[char])
  )
}

function tableCells(line: string): string[] | null {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) {
    return null
  }
  const inner = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed
  const body = inner.endsWith('|') ? inner.slice(0, -1) : inner
  return body.split('|').map((cell) => cell.trim())
}

function isTableSeparator(line: string): boolean {
  const cells = tableCells(line)
  return (
    cells !== null && cells.length > 0 && cells.every((cell) => TABLE_SEPARATOR_CELL.test(cell))
  )
}

function tableRowText(line: string): string {
  const cells = tableCells(line) ?? []
  return cells
    .map((cell) => stripInlineMarkup(cell))
    .filter((cell) => cell !== '')
    .join(', ')
}

/** Splits markdown into block units: paragraphs, headings, list items and table rows. */
export function speakableUnits(markdown: string): string[] {
  const lines = markdown.split(/\r\n|\r|\n/)
  const units: string[] = []
  let open: string | null = null
  let fence: string | null = null
  let inTable = false
  const close = (): void => {
    if (open !== null) {
      units.push(open)
      open = null
    }
  }

  lines.forEach((line, index) => {
    const marker = FENCE.exec(line)
    if (fence !== null) {
      if (marker && marker[1].startsWith(fence.charAt(0)) && marker[1].length >= fence.length) {
        fence = null
      }
      return
    }
    if (marker) {
      close()
      fence = marker[1]
      inTable = false
      return
    }
    if (line.trim() === '') {
      close()
      inTable = false
      return
    }
    if (isTableSeparator(line)) {
      close()
      inTable = true
      return
    }
    const nextIsSeparator = index + 1 < lines.length && isTableSeparator(lines[index + 1])
    if (tableCells(line) && (inTable || nextIsSeparator || line.trim().startsWith('|'))) {
      close()
      inTable = true
      const row = tableRowText(line)
      if (row !== '') {
        units.push(row)
      }
      return
    }
    inTable = false
    const heading = HEADING.exec(line)
    if (heading) {
      close()
      units.push(heading[1])
      return
    }
    if (RULE.test(line) || REFERENCE_DEFINITION.test(line)) {
      close()
      return
    }
    const text = line.replace(QUOTE_MARKERS, '')
    const ordered = ORDERED_ITEM.exec(text)
    if (ordered) {
      close()
      open = `${ordered[1]}. ${ordered[2]}`
      return
    }
    if (BULLET.test(text)) {
      close()
      open = text.replace(BULLET, '')
      return
    }
    open = open === null ? text.trim() : `${open} ${text.trim()}`
  })
  close()

  return units.map(stripInlineMarkup).filter((unit) => unit !== '')
}

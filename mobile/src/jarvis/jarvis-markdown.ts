// Assistant markdown as plain lines for the transcript. Pure: no React.
//
// Decisions made here (docs/personaje/jarvis.md §1, "Formato para la voz"):
// - A single newline is a line break, because that is how agents write; blank lines
//   only separate.
// - Ordered items are counted in sequence from the first number, like a renderer would;
//   bullets become an en dash and nesting follows indentation.
// - Emphasis, strikethrough, inline-code and link markers go; their words stay.
// - Fenced code stays as monospaced lines: the design doc sends code "En pantalla".
// - Indented code is not recognized, because agents indent nested lists far more often.

export type JarvisTranscriptLineKind = 'text' | 'code'

export interface JarvisTranscriptLine {
  kind: JarvisTranscriptLineKind
  /** The words without markers. A code line keeps its indentation. */
  text: string
  /** "1." or "–" on a list item; null on everything else. */
  marker: string | null
  /** List nesting; 0 for a top-level item. */
  depth: number
}

const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/
const CLOSING_FENCE = /^([ \t]*)(`{3,}|~{3,})[ \t]*$/
const HEADING = /^[ \t]{0,3}#{1,6}(?:[ \t]+|$)(.*)$/
const HEADING_CLOSING = /[ \t]+#+[ \t]*$/
const RULE = /^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const QUOTE_PREFIX = /^(?:[ \t]{0,3}>[ \t]?)+/
const ORDERED_ITEM = /^([ \t]*)(\d{1,9})[.)]([ \t]+|$)(.*)$/
const BULLET_ITEM = /^([ \t]*)([-*+])([ \t]+|$)(.*)$/
const TABLE_DELIMITER = /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/
const LINE_BREAK_TAG = /<br\s*\/?>/i
const BULLET = '–'

const PROTECTED_OPEN = ''
const PROTECTED_CLOSE = ''

interface ListItemParts {
  ordered: boolean
  number: number
  /** Columns before the marker; a tab counts as four. */
  indent: number
  /** Column where the item text starts, which is where its children indent to. */
  textColumn: number
  text: string
}

function columns(whitespace: string): number {
  return whitespace.replace(/\t/g, '    ').length
}

function listItem(line: string): ListItemParts | null {
  const ordered = ORDERED_ITEM.exec(line)
  if (ordered) {
    return {
      ordered: true,
      number: Number(ordered[2]),
      indent: columns(ordered[1]),
      textColumn: columns(ordered[1]) + ordered[2].length + 1 + ordered[3].length,
      text: ordered[4]
    }
  }
  const bullet = BULLET_ITEM.exec(line)
  if (bullet) {
    return {
      ordered: false,
      number: 0,
      indent: columns(bullet[1]),
      textColumn: columns(bullet[1]) + 1 + bullet[3].length,
      text: bullet[4]
    }
  }
  return null
}

function paragraph(text: string): JarvisTranscriptLine {
  return { kind: 'text', text, marker: null, depth: 0 }
}

function codeLine(text: string): JarvisTranscriptLine {
  return { kind: 'code', text: text.replace(/[ \t]+$/, ''), marker: null, depth: 0 }
}

/** One line of prose without its inline markers. Inline code and escapes are protected. */
function stripInline(text: string): string {
  const protectedText: string[] = []
  const protect = (value: string): string =>
    `${PROTECTED_OPEN}${protectedText.push(value) - 1}${PROTECTED_CLOSE}`

  return text
    .replace(/(`+)(.+?)\1/g, (_match, _ticks: string, code: string) => protect(code.trim()))
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, (_match, escaped: string) => protect(escaped))
    .replace(/!\[([^\]]*)\]\((?:[^()\s]|\([^()]*\))*(?:[ \t]+"[^"]*")?\)/g, '$1')
    .replace(/\[([^\]]*)\]\((?:[^()\s]|\([^()]*\))*(?:[ \t]+"[^"]*")?\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/<([a-z][a-z0-9+.-]*:[^<>\s]*)>/gi, '$1')
    .replace(/<!--.*?-->/g, '')
    .replace(/(\*\*\*|___)(?=\S)(.+?)\1/g, '$2')
    .replace(/(\*\*|__)(?=\S)(.+?)\1/g, '$2')
    .replace(/\*(?=\S)(.+?)\*/g, '$1')
    .replace(/(?<!\w)_(?=\S)(.+?)_(?!\w)/g, '$1')
    .replace(/~~(?=\S)(.+?)~~/g, '$1')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .replace(
      new RegExp(`${PROTECTED_OPEN}(\\d+)${PROTECTED_CLOSE}`, 'g'),
      (_match, index: string) => protectedText[Number(index)] ?? ''
    )
}

/** Inline markers off a line that cannot be split, so a `<br>` becomes a space. */
function stripInlineJoined(text: string): string {
  return stripInline(text.replace(LINE_BREAK_TAG, ' '))
}

function splitLineBreaks(line: string): string[] {
  return line.split(LINE_BREAK_TAG)
}

function tableCells(row: string): string {
  const cells = row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
  return cells.map((cell) => stripInline(cell.trim())).join(' · ')
}

function isTableRow(line: string): boolean {
  return (
    line.trim() !== '' &&
    line.includes('|') &&
    !FENCE.test(line) &&
    !HEADING.test(line) &&
    !QUOTE_PREFIX.test(line) &&
    listItem(line) === null
  )
}

function readCodeBlock(
  source: string[],
  openingIndex: number,
  opening: RegExpExecArray
): { block: JarvisTranscriptLine[]; next: number } {
  const marker = opening[1]
  const openingIndent = opening[0].match(/^[ \t]*/)?.[0] ?? ''
  const block: JarvisTranscriptLine[] = []
  let cursor = openingIndex + 1
  while (cursor < source.length) {
    const line = source[cursor]
    const closing = CLOSING_FENCE.exec(line)
    if (closing && closing[2][0] === marker[0] && closing[2].length >= marker.length) {
      return { block, next: cursor }
    }
    block.push(codeLine(line.startsWith(openingIndent) ? line.slice(openingIndent.length) : line))
    cursor += 1
  }
  return { block, next: cursor - 1 }
}

export function jarvisMarkdownToLines(markdown: string): JarvisTranscriptLine[] {
  const source = markdown.replace(/\r\n?/g, '\n').split('\n')
  const out: JarvisTranscriptLine[] = []
  const listColumns: number[] = []
  const listNumbers: number[] = []
  let afterBlank = false
  let continuable = false
  // Where in `out` the paragraph of the previous raw line landed, if it was one line: the
  // only thing a table delimiter row can turn into a header.
  let headerCandidate = -1

  const closeList = (): void => {
    listColumns.length = 0
    listNumbers.length = 0
  }

  for (let index = 0; index < source.length; index += 1) {
    const raw = source[index]
    const fence = FENCE.exec(raw)
    if (fence) {
      const { block, next } = readCodeBlock(source, index, fence)
      out.push(...block)
      index = next
      closeList()
      continuable = false
      afterBlank = false
      headerCandidate = -1
      continue
    }

    const previousIsHeader = headerCandidate === out.length - 1 && out.length > 0
    if (TABLE_DELIMITER.test(raw) && previousIsHeader && source[index - 1].includes('|')) {
      out[headerCandidate] = paragraph(tableCells(source[index - 1]))
      while (index + 1 < source.length && isTableRow(source[index + 1])) {
        index += 1
        out.push(paragraph(tableCells(source[index])))
      }
      closeList()
      continuable = false
      afterBlank = false
      headerCandidate = -1
      continue
    }

    if (raw.trim() === '') {
      afterBlank = true
      headerCandidate = -1
      continue
    }
    const followsBlank = afterBlank
    afterBlank = false
    if (RULE.test(raw)) {
      closeList()
      continuable = false
      headerCandidate = -1
      continue
    }

    const line = raw.replace(QUOTE_PREFIX, '')
    const heading = HEADING.exec(line)
    const item = heading ? null : listItem(line)

    if (heading) {
      out.push(paragraph(stripInlineJoined(heading[1].replace(HEADING_CLOSING, ''))))
      closeList()
      continuable = false
      headerCandidate = -1
    } else if (item) {
      while (listColumns.length > 0 && item.indent < listColumns[listColumns.length - 1]) {
        listColumns.pop()
      }
      const depth = listColumns.length
      listColumns.push(item.textColumn)
      let marker = BULLET
      if (item.ordered) {
        const continues = listNumbers.length > depth
        const number = continues ? (listNumbers[depth] ?? 0) + 1 : item.number
        listNumbers.length = depth
        listNumbers.push(number)
        marker = `${number}.`
      } else {
        listNumbers.length = Math.min(listNumbers.length, depth)
      }
      out.push({ kind: 'text', text: stripInlineJoined(item.text), marker, depth })
      continuable = true
      headerCandidate = -1
    } else if (continuable && !followsBlank) {
      const last = out[out.length - 1]
      last.text = `${last.text} ${stripInlineJoined(line.trim())}`.trim()
      headerCandidate = -1
    } else {
      const pieces = splitLineBreaks(line)
      for (const piece of pieces) {
        out.push(paragraph(stripInline(piece)))
      }
      headerCandidate = pieces.length === 1 ? out.length - 1 : -1
      if (columns(raw.match(/^[ \t]*/)?.[0] ?? '') === 0) {
        closeList()
      }
      continuable = false
    }
  }

  return out
}

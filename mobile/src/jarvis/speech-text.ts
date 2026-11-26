// Markdown → sentences that are safe to read aloud. Pure: no React, no platform.
import { speakableUnits } from './speech-markdown'
import { endsSentence, splitSentences } from './speech-sentences'

/** What the voice reads at most from one reply; the rest stays on screen (RF-4.4). */
export const SPEECH_SENTENCE_CAP = 8
export const SPEECH_TRUNCATED_NOTICE = 'El detalle completo está en pantalla.'

export type SpeechPlan = {
  /** Sentences to read aloud, in order, already capped. */
  sentences: string[]
  /** False while the last sentence has no end yet, so the reply may still grow. */
  settled: boolean
  /** True when the cap dropped sentences and the notice took their place. */
  truncated: boolean
}

// A colon or comma already ends a unit; only a period, question or exclamation ends a sentence.
const UNIT_END = /[.!?…:,]["'”’)\]}»]*$/

function close(unit: string): string {
  return UNIT_END.test(unit) ? unit : `${unit}.`
}

/** Markdown as one line of plain text, with every block but the last closed. */
export function speakableText(markdown: string): string {
  const units = speakableUnits(markdown)
  return units.map((unit, index) => (index === units.length - 1 ? unit : close(unit))).join(' ')
}

/** The sentences to read aloud from a finished reply. */
export function speechSentences(markdown: string): string[] {
  return planSpeech(markdown).sentences
}

/** The sentences to read from a reply, and whether its last one may still be arriving. */
export function planSpeech(markdown: string): SpeechPlan {
  const units = speakableUnits(markdown)
  const lastUnit = units.length - 1
  const sentences: string[] = []
  units.forEach((unit, unitIndex) => {
    const parts = splitSentences(unit)
    const lastPart = parts.length - 1
    parts.forEach((part, partIndex) => {
      // Why: only a block's last sentence carries its end; a cut inside a long one keeps its comma.
      const endsBlock = partIndex === lastPart
      const isOpen = unitIndex === lastUnit && endsBlock
      sentences.push(!endsBlock || isOpen ? part : close(part))
    })
  })
  if (sentences.length > SPEECH_SENTENCE_CAP) {
    return {
      sentences: [...sentences.slice(0, SPEECH_SENTENCE_CAP), SPEECH_TRUNCATED_NOTICE],
      settled: true,
      truncated: true
    }
  }
  const last = sentences.at(-1)
  return { sentences, settled: last === undefined || endsSentence(last), truncated: false }
}

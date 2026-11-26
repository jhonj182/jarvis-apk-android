// Remembers which sentences of each reply were already read, so a streaming reply is read once, in order.
import type { JarvisMessage } from './jarvis-contract'
import { planSpeech } from './speech-text'

type Progress = { spoken: number; done: boolean }

export type JarvisSpeechTracker = {
  /** Marks assistant messages as already read: history, or the rest of what an interruption discarded. */
  skip: (messages: readonly JarvisMessage[], historyThroughId?: string | null) => void
  /** Sentences of assistant messages that became readable since the last call, in order. */
  collect: (messages: readonly JarvisMessage[]) => string[]
}

const WHOLE = Number.POSITIVE_INFINITY

export function createJarvisSpeechTracker(): JarvisSpeechTracker {
  // Why: nothing is pruned. A reply that scrolls out of the window and is replayed later must not be read twice.
  const progress = new Map<string, Progress>()

  return {
    skip(messages, historyThroughId) {
      // Why: with an id, everything up to it is history and what follows is the reply being waited for.
      const found = historyThroughId
        ? messages.findIndex((message) => message.id === historyThroughId)
        : -1
      const limit = found >= 0 ? found : WHOLE
      messages.forEach((message, index) => {
        if (message.role === 'assistant' && index <= limit) {
          progress.set(message.id, { spoken: WHOLE, done: true })
        }
      })
    },
    collect(messages) {
      const out: string[] = []
      for (const message of messages) {
        if (message.role !== 'assistant') {
          continue
        }
        const state = progress.get(message.id)
        if (state?.done) {
          continue
        }
        const plan = planSpeech(message.text)
        // Why: while the reply streams, a last sentence without an end may still grow; it waits.
        const readable =
          plan.settled || !message.streaming ? plan.sentences.length : plan.sentences.length - 1
        const spoken = state?.spoken ?? 0
        const last = readable - 1
        for (let index = spoken; index < readable; index += 1) {
          const sentence = plan.sentences[index]!
          // Why: only the reply's own last sentence can lack an end; a finished block before it already has one.
          const openTail = index === last && index === plan.sentences.length - 1 && !plan.settled
          out.push(openTail ? `${sentence}.` : sentence)
        }
        progress.set(message.id, {
          spoken: Math.max(spoken, readable),
          done: plan.truncated || (!message.streaming && readable >= plan.sentences.length)
        })
      }
      return out
    }
  }
}

// The reading queue of Jarvis's voice: every sentence reaches the engine as soon as it is queued.
// Plain logic over a speech engine: no React, no platform, so it runs in tests with a fake.
import type { SpeechOptions, Voice } from 'expo-speech'
import { speechSentences } from './speech-text'

export type SpeechEngine = {
  speak: (text: string, options?: SpeechOptions) => void
  stop: () => Promise<void> | void
  getAvailableVoicesAsync: () => Promise<Voice[]>
  maxSpeechInputLength: number
}

export type SpeechQueueState = {
  speaking: boolean
  /** The sentence the engine is reading, while it reads. */
  spokenText: string | null
}

export type JarvisSpeechQueue = {
  speak: (text: string) => void
  /**
   * Queues text and resolves once it has been read. It resolves earlier when the voice is stopped
   * or disposed, or when `timeoutMs` passes: whoever waits must not be held hostage by the engine.
   */
  speakAndWait: (text: string, timeoutMs: number) => Promise<void>
  stop: () => void
  dispose: () => void
  /** Starts looking for the Spanish voice, so the first sentence does not wait for it. */
  prepare: () => void
  getSnapshot: () => SpeechQueueState
  subscribe: (listener: () => void) => () => void
}

const IDLE: SpeechQueueState = { speaking: false, spokenText: null }
/** docs/personaje/jarvis.md §2: `es-CO`, `es-US`, `es-ES`, then any Spanish. */
const PREFERRED_REGIONS = ['es-co', 'es-us', 'es-es']
const FALLBACK_LANGUAGE = 'es-CO'
/** The voice list is read once; a slow engine must not hold the first sentence hostage. */
export const VOICE_LOOKUP_TIMEOUT_MS = 1500
/** A sentence of 220 characters reads in well under 20 seconds; past this the engine is silent. */
export const ENGINE_SILENCE_MS = 30_000

export function pickSpanishVoice(voices: readonly Voice[]): Voice | null {
  const first = (accepts: (language: string) => boolean): Voice | null =>
    voices.find((candidate) => accepts(candidate.language.toLowerCase())) ?? null
  for (const region of PREFERRED_REGIONS) {
    const regional = first((language) => language === region)
    if (regional) {
      return regional
    }
  }
  return first((language) => language === 'es' || /^es[-_]/.test(language))
}

/** Words are never cut: an utterance too long for the engine is split at spaces. */
export function speechChunks(text: string, maxLength: number): string[] {
  const trimmed = text.trim()
  if (trimmed === '') {
    return []
  }
  if (trimmed.length <= maxLength || maxLength <= 0) {
    return [trimmed]
  }
  const chunks: string[] = []
  let rest = trimmed
  while (rest.length > maxLength) {
    const end = rest.slice(0, maxLength + 1).lastIndexOf(' ')
    // Why: a lone word longer than the limit is left whole for the engine to refuse or read.
    if (end <= 0) {
      break
    }
    chunks.push(rest.slice(0, end))
    rest = rest.slice(end + 1)
  }
  chunks.push(rest)
  return chunks
}

type Timer = ReturnType<typeof setTimeout>

export function createJarvisSpeechQueue(
  engine: SpeechEngine,
  options: { voiceTimeoutMs?: number } = {}
): JarvisSpeechQueue {
  const voiceTimeoutMs = options.voiceTimeoutMs ?? VOICE_LOOKUP_TIMEOUT_MS
  const listeners = new Set<() => void>()
  const idleWaiters = new Set<() => void>()
  const pending: string[] = []
  let state = IDLE
  let voice: Voice | null | undefined
  let lookupStarted = false
  let lookupTimer: Timer | null = null
  let silenceTimer: Timer | null = null
  let inFlight = 0
  // Why: bumped by stop and by the silence watchdog, so late callbacks from what was playing count for nothing.
  let generation = 0
  let disposed = false

  const set = (next: SpeechQueueState): void => {
    if (next.speaking === state.speaking && next.spokenText === state.spokenText) {
      return
    }
    state = next
    listeners.forEach((listener) => listener())
    if (!next.speaking) {
      idleWaiters.forEach((waiter) => waiter())
      idleWaiters.clear()
    }
  }

  const finish = (at: number): void => {
    if (at !== generation) {
      return
    }
    inFlight -= 1
    if (inFlight > 0) {
      return
    }
    inFlight = 0
    if (silenceTimer) {
      clearTimeout(silenceTimer)
      silenceTimer = null
    }
    set(IDLE)
  }

  const optionsFor = (text: string, at: number): SpeechOptions => ({
    // Why: no rate and no pitch, so each voice keeps its own; the language is a hint for engines without that voice.
    language: voice?.language ?? FALLBACK_LANGUAGE,
    ...(voice ? { voice: voice.identifier } : {}),
    onDone: () => finish(at),
    onStopped: () => finish(at),
    onError: () => finish(at)
  })

  const flush = (): void => {
    if (disposed || voice === undefined) {
      return
    }
    let lastDispatched: string | null = null
    while (pending.length > 0) {
      const text = pending.shift()!
      const at = generation
      inFlight += 1
      try {
        engine.speak(text, optionsFor(text, at))
        lastDispatched = text
      } catch (error) {
        console.warn('Jarvis voice skipped a sentence', error)
        inFlight -= 1
      }
    }
    if (lastDispatched !== null) {
      set({ speaking: true, spokenText: lastDispatched })
      if (silenceTimer) {
        clearTimeout(silenceTimer)
      }
      silenceTimer = setTimeout(() => {
        generation += 1
        inFlight = 0
        silenceTimer = null
        set(IDLE)
      }, ENGINE_SILENCE_MS)
    } else if (inFlight === 0) {
      set(IDLE)
    }
  }

  const startVoiceLookup = (): void => {
    if (lookupStarted) {
      return
    }
    lookupStarted = true
    lookupTimer = setTimeout(() => {
      if (voice === undefined) {
        voice = null
        flush()
      }
    }, voiceTimeoutMs)
    Promise.resolve()
      .then(() => engine.getAvailableVoicesAsync())
      .then(
        (voices) => {
          voice = pickSpanishVoice(voices)
        },
        (error: unknown) => {
          console.warn('Jarvis voice list unavailable; reading with the system voice', error)
          voice = null
        }
      )
      .then(() => {
        if (lookupTimer) {
          clearTimeout(lookupTimer)
          lookupTimer = null
        }
        flush()
      })
  }

  const speak = (text: string): void => {
    if (disposed || typeof text !== 'string') {
      return
    }
    // Why: `speechSentences` also applies the eight-sentence cap to whatever reaches the voice.
    for (const sentence of speechSentences(text)) {
      pending.push(...speechChunks(sentence, engine.maxSpeechInputLength))
    }
    if (pending.length === 0) {
      return
    }
    set({ speaking: true, spokenText: null })
    startVoiceLookup()
    flush()
  }

  const speakAndWait = (text: string, timeoutMs: number): Promise<void> =>
    new Promise<void>((resolve) => {
      speak(text)
      if (disposed || !state.speaking) {
        resolve()
        return
      }
      let timer: Timer | null = null
      const waiter = (): void => {
        if (timer) {
          clearTimeout(timer)
        }
        timer = null
        idleWaiters.delete(waiter)
        resolve()
      }
      timer = setTimeout(waiter, timeoutMs)
      idleWaiters.add(waiter)
    })

  return {
    prepare: startVoiceLookup,
    speak,
    speakAndWait,
    stop() {
      generation += 1
      pending.length = 0
      inFlight = 0
      if (silenceTimer) {
        clearTimeout(silenceTimer)
        silenceTimer = null
      }
      set(IDLE)
      // Why: an explicit stop must silence the engine even if the queue lost track of an utterance.
      if (!lookupStarted) {
        return
      }
      try {
        Promise.resolve(engine.stop()).catch((error: unknown) => {
          console.warn('Jarvis voice could not be stopped', error)
        })
      } catch (error) {
        console.warn('Jarvis voice could not be stopped', error)
      }
    },
    dispose() {
      // Why: teardown is not news; a reader unmounting must not be told the voice went idle.
      listeners.clear()
      idleWaiters.forEach((waiter) => waiter())
      idleWaiters.clear()
      this.stop()
      disposed = true
      if (lookupTimer) {
        clearTimeout(lookupTimer)
        lookupTimer = null
      }
    },
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

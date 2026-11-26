import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import * as Speech from 'expo-speech'
import { createJarvisSpeechQueue, type SpeechEngine } from './jarvis-speech-queue'

/** How long an order waits for its confirmation to be read before it runs anyway. */
export const JARVIS_ORDER_VOICE_WAIT_MS = 6000

export type JarvisSpeech = {
  speaking: boolean
  /** The sentence the voice is reading, while it reads. */
  spokenText: string | null
  /** Queues text; each sentence reaches the voice as soon as it is queued. Never throws. */
  speak: (text: string) => void
  /** Queues text and resolves once it was read, or earlier when the voice stops or the wait runs out. */
  sayAndWait: (text: string) => Promise<void>
  /** Drops everything queued and silences the voice now. Never throws. */
  stop: () => void
}

/** Jarvis's voice on top of `expo-speech`. Failures are logged and swallowed. */
export function useJarvisSpeech(engine: SpeechEngine = Speech): JarvisSpeech {
  // Why: created on first render, not in an effect cleanup, so React's development remount keeps it usable.
  const queueRef = useRef<ReturnType<typeof createJarvisSpeechQueue> | null>(null)
  if (queueRef.current === null) {
    queueRef.current = createJarvisSpeechQueue(engine)
  }
  const queue = queueRef.current
  const { speaking, spokenText } = useSyncExternalStore(
    queue.subscribe,
    queue.getSnapshot,
    queue.getSnapshot
  )

  useEffect(() => {
    queue.prepare()
    return () => queue.stop()
  }, [queue])

  const speak = useCallback((text: string) => queue.speak(text), [queue])
  const sayAndWait = useCallback(
    (text: string) => queue.speakAndWait(text, JARVIS_ORDER_VOICE_WAIT_MS),
    [queue]
  )
  const stop = useCallback(() => queue.stop(), [queue])

  return useMemo(
    () => ({ speaking, spokenText, speak, sayAndWait, stop }),
    [sayAndWait, speak, spokenText, speaking, stop]
  )
}

// The voice that reads the agent's replies: only what is new, sentence by sentence, never the history.
import { useCallback, useEffect, useRef } from 'react'
import { createJarvisSpeechTracker, type JarvisSpeechTracker } from './jarvis-speech-tracker'
import { jarvisEchoConfirmationId, type JarvisLocalEcho } from './jarvis-transcript-merge'
import { useJarvisSpeech } from './use-jarvis-speech'
import type { JarvisMessage } from './jarvis-contract'

export type JarvisReplyVoice = {
  speaking: boolean
  spokenText: string | null
  /** Reads text the app itself wrote: a greeting, a confirmation, an error. */
  say: (text: string) => void
  /** Reads text before something that will silence the voice, and resolves once it was read. */
  sayBeforeActing: (text: string) => Promise<void>
  /** Silences the voice now and drops the rest of the reply being read, and of that turn. */
  discard: () => void
}

type Args = {
  /** Changes when another session is shown; reading starts over without touching history. */
  identity: string
  transcript: readonly JarvisMessage[]
  echoes: readonly JarvisLocalEcho[]
  /** True once a read of this transcript has completed. */
  settled: boolean
  enabled: boolean
  /** The agent is still working on the turn that is being read. */
  agentBusy: boolean
}

type Reading = { identity: string | null; primed: boolean; tracker: JarvisSpeechTracker }

export function useJarvisReplyVoice(args: Args): JarvisReplyVoice {
  const speech = useJarvisSpeech()
  const { speak: sayNow, sayAndWait, stop } = speech
  const reading = useRef<Reading>({
    identity: null,
    primed: true,
    tracker: createJarvisSpeechTracker()
  })
  const skipVisible = useRef(false)
  const latest = useRef(args)
  latest.current = args
  // Why: interrupting means "enough of this answer". A turn can go on after a tool call and write
  // another message, and reading that would talk over the owner. The silence lasts until the agent rests.
  const silencedTurn = useRef(false)

  useEffect(() => {
    if (!args.agentBusy) {
      silencedTurn.current = false
    }
  }, [args.agentBusy])

  // Why: declared before the reading effect, so turning the voice on skips before anything is read.
  const wasEnabled = useRef(args.enabled)
  useEffect(() => {
    if (wasEnabled.current === args.enabled) {
      return
    }
    wasEnabled.current = args.enabled
    if (args.enabled) {
      skipVisible.current = true
    } else {
      stop()
    }
  }, [args.enabled, stop])

  useEffect(() => {
    if (!args.enabled || !args.settled) {
      return
    }
    if (reading.current.identity !== args.identity) {
      reading.current = {
        identity: args.identity,
        primed: false,
        tracker: createJarvisSpeechTracker()
      }
    }
    const tracker = reading.current.tracker
    if (!reading.current.primed) {
      reading.current.primed = true
      skipVisible.current = false
      // Why: history is never read; in a new session the reply follows the prompt this phone just sent.
      tracker.skip(
        args.transcript,
        jarvisEchoConfirmationId(args.echoes, args.transcript) ?? undefined
      )
    } else if (skipVisible.current) {
      skipVisible.current = false
      tracker.skip(args.transcript)
    }
    if (silencedTurn.current) {
      tracker.skip(args.transcript)
      return
    }
    for (const sentence of tracker.collect(args.transcript)) {
      sayNow(sentence)
    }
  }, [args.echoes, args.enabled, args.identity, args.settled, args.transcript, sayNow])

  const say = useCallback(
    (text: string) => {
      if (latest.current.enabled) {
        sayNow(text)
      }
    },
    [sayNow]
  )

  const sayBeforeActing = useCallback(
    (text: string): Promise<void> =>
      latest.current.enabled ? sayAndWait(text) : Promise.resolve(),
    [sayAndWait]
  )

  const discard = useCallback(() => {
    silencedTurn.current = latest.current.agentBusy
    reading.current.primed = true
    reading.current.tracker.skip(latest.current.transcript)
    skipVisible.current = false
    stop()
  }, [stop])

  return { speaking: speech.speaking, spokenText: speech.spokenText, say, sayBeforeActing, discard }
}

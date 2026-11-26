// The conversation of the Jarvis session: the agent's transcript plus what this phone added itself.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { encodeNativeChatTranscriptIdentity } from '../../../src/shared/native-chat-transcript-retention'
import { useMobileNativeChatSession } from '../session/use-mobile-native-chat-session'
import type { RpcClient } from '../transport/rpc-client'
import type { JarvisMessage, JarvisMessageRole } from './jarvis-contract'
import {
  isJarvisEchoConfirmed,
  jarvisEchoOf,
  jarvisTranscriptMessages,
  mergeJarvisEchoes,
  type JarvisLocalEcho
} from './jarvis-transcript-merge'

// docs/personaje/jarvis.md §2: an app error says what failed and what to do.
export const TRANSCRIPT_UNREADABLE_TEXT =
  'No pude leer la conversación del escritorio. Vuelve a entrar en un momento.'

export type JarvisTranscript = {
  /** What the agent's transcript holds: the only text the voice may read. */
  transcript: JarvisMessage[]
  /** The transcript with this phone's own messages placed where they belong. */
  messages: JarvisMessage[]
  loading: boolean
  /** True once a read of this session's transcript has completed; history can be told from replies. */
  settled: boolean
  error: string | null
  /** The phone's own messages the transcript has not confirmed yet. */
  echoes: readonly JarvisLocalEcho[]
  /** Adds a message the phone produced itself and returns its id. */
  addEcho: (echo: { role: JarvisMessageRole; text: string }) => string
  removeEcho: (id: string) => void
}

type Args = {
  client: RpcClient | null
  hostId: string
  worktreeId: string
  agent: string | null
  sessionId: string | null
  transcriptPath: string | null
  agentBusy: boolean
}

export function useJarvisTranscript(args: Args): JarvisTranscript {
  const { client, hostId, worktreeId, agent, sessionId, transcriptPath, agentBusy } = args
  const native = useMobileNativeChatSession({
    client,
    // Why: survives a reconnect, which replaces the client, so the conversation is not blanked.
    sourceIdentity: encodeNativeChatTranscriptIdentity([hostId, worktreeId]),
    agent,
    sessionId,
    transcriptPath
  })
  const [echoes, setEchoes] = useState<JarvisLocalEcho[]>([])
  const counter = useRef(0)

  const transcript = useMemo(
    () => jarvisTranscriptMessages({ transcript: native.messages, agentBusy }),
    [native.messages, agentBusy]
  )
  const transcriptRef = useRef(transcript)
  transcriptRef.current = transcript

  useEffect(() => {
    setEchoes([])
  }, [hostId, worktreeId])

  useEffect(() => {
    setEchoes((current) => {
      const kept = current.filter((echo) => !isJarvisEchoConfirmed(echo, transcript))
      return kept.length === current.length ? current : kept
    })
  }, [transcript])

  const addEcho = useCallback((echo: { role: JarvisMessageRole; text: string }): string => {
    counter.current += 1
    const id = `local-${counter.current}`
    setEchoes((all) => [...all, jarvisEchoOf(transcriptRef.current, { id, ...echo })])
    return id
  }, [])
  const removeEcho = useCallback(
    (id: string) => setEchoes((all) => all.filter((echo) => echo.id !== id)),
    []
  )

  const messages = useMemo(
    () => mergeJarvisEchoes({ messages: transcript, echoes }),
    [transcript, echoes]
  )

  return {
    transcript,
    messages,
    loading: native.transcriptLoading,
    settled: native.status === 'ready',
    error: native.error || native.status === 'error' ? TRANSCRIPT_UNREADABLE_TEXT : null,
    echoes,
    addEcho,
    removeEcho
  }
}

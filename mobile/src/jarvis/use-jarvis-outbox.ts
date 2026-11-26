// The one place that writes to the agent terminal, and the wait for the agent to pick it up.
import { useCallback, useEffect, useRef, useState } from 'react'
import { sendMobileNativeChatMessageWithOutcome } from '../session/mobile-native-chat-send'
import type { RpcClient } from '../transport/rpc-client'

/** Past this the agent is assumed not to have taken the message; the character stops "thinking". */
export const AWAITING_REPLY_TIMEOUT_MS = 30_000

// docs/personaje/jarvis.md §2: the app's own lines.
export const DESKTOP_UNREACHABLE_TEXT = 'No encuentro el escritorio. ¿Está abierto Orca Lab?'
export const MESSAGE_NOT_DELIVERED_TEXT =
  'No pude entregar el mensaje al escritorio. Inténtalo de nuevo.'
export const MESSAGE_DELIVERY_UNKNOWN_TEXT =
  'No sé si el mensaje llegó al escritorio. Mira la pantalla antes de repetirlo.'
export const JARVIS_CONNECTING_TEXT = 'Estoy conectando con Jarvis. Dame un segundo y repíteme.'
// Claude's permission dialog holds the keyboard on the desktop; a message sent now would answer it.
export const AGENT_WAITING_TEXT =
  'Jarvis espera tu permiso en Orca Lab. Apruébalo allí y repíteme el mensaje.'

export type JarvisOutbox = {
  /** True from an accepted send until the agent is seen working, a reply lands, or it times out. */
  awaitingReply: boolean
  sending: boolean
  /** Writes text to the agent terminal. True when the desktop took it. Never throws. */
  sendToAgent: (text: string) => Promise<boolean>
  forget: () => void
}

type Args = {
  client: RpcClient | null
  hostConnected: boolean
  terminal: string | null
  /** This phone's pairing token, which the desktop uses to tell phones apart. */
  mobileClientId: string | null
  /** The session is still being found or opened on a desktop that answered. */
  attaching: boolean
  agentBusy: boolean
  /** Claude is asking permission on the desktop. Nothing is sent until it is answered there. */
  agentWaiting: boolean
  /** Changes whenever the last assistant reply changes. */
  lastReplyKey: string
  /** Shows, and reads, a line that says what became of a message. */
  onNotice: (text: string) => void
}

export function useJarvisOutbox(args: Args): JarvisOutbox {
  const { agentBusy, lastReplyKey } = args
  const [awaiting, setAwaiting] = useState(false)
  const [sending, setSending] = useState(false)
  const latest = useRef(args)
  latest.current = args
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const sendToAgent = useCallback(async (text: string): Promise<boolean> => {
    const { client, hostConnected, terminal, mobileClientId, agentWaiting, attaching, onNotice } =
      latest.current
    if (!client || !terminal || !hostConnected) {
      onNotice(attaching ? JARVIS_CONNECTING_TEXT : DESKTOP_UNREACHABLE_TEXT)
      return false
    }
    if (agentWaiting) {
      onNotice(AGENT_WAITING_TEXT)
      return false
    }
    setSending(true)
    try {
      // Why: like the upstream composer, a Ctrl+U clears whatever is parked on the agent's input line.
      const outcome = await sendMobileNativeChatMessageWithOutcome({
        client,
        terminal,
        text,
        clearInputFirst: true,
        ...(mobileClientId ? { mobileClient: { id: mobileClientId, type: 'mobile' as const } } : {})
      })
      if (outcome === 'accepted') {
        if (alive.current) {
          setAwaiting(true)
        }
        return true
      }
      // Why: an unknown delivery is never retried here; repeating it could send the message twice.
      onNotice(outcome === 'unknown' ? MESSAGE_DELIVERY_UNKNOWN_TEXT : MESSAGE_NOT_DELIVERED_TEXT)
      return false
    } catch (error) {
      console.warn('Jarvis could not deliver a message to the desktop', error)
      onNotice(MESSAGE_NOT_DELIVERED_TEXT)
      return false
    } finally {
      if (alive.current) {
        setSending(false)
      }
    }
  }, [])

  useEffect(() => {
    if (agentBusy) {
      setAwaiting(false)
    }
  }, [agentBusy])

  useEffect(() => {
    setAwaiting((current) => (current ? false : current))
  }, [lastReplyKey])

  useEffect(() => {
    if (!awaiting) {
      return undefined
    }
    const timer = setTimeout(() => setAwaiting(false), AWAITING_REPLY_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [awaiting])

  return {
    awaitingReply: awaiting,
    sending,
    sendToAgent,
    forget: useCallback(() => setAwaiting(false), [])
  }
}

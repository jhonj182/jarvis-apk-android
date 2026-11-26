// The agent's transcript as the Jarvis screen shows it, plus what this phone said before the
// transcript caught up. Pure.
import { stripNoiseMessages } from '../../../src/shared/native-chat-noise'
import { isTextBlock, type NativeChatMessage } from '../../../src/shared/native-chat-types'
import type { JarvisMessage, JarvisMessageRole } from './jarvis-contract'

/** A message this phone added itself: a sent prompt the transcript has not repeated yet, or a local reply. */
export type JarvisLocalEcho = {
  id: string
  role: JarvisMessageRole
  text: string
  /** Id of the last transcript message when the echo was added; null when there was none. */
  anchorId: string | null
  /** How many messages with this role and text the transcript already held when the echo was added. */
  baseline: number
}

type ConversationRow = NativeChatMessage & { role: JarvisMessageRole }

const sameWords = (left: string, right: string): boolean =>
  left.trim().replace(/\s+/g, ' ') === right.trim().replace(/\s+/g, ' ')

/** The agent's prose or the owner's prompt; tool calls and results are not part of either. */
function proseText(message: NativeChatMessage): string {
  return message.blocks
    .filter(isTextBlock)
    .map((block) => block.text)
    .join('\n\n')
    .trim()
}

function isConversation(message: NativeChatMessage): message is ConversationRow {
  if (message.role !== 'user' && message.role !== 'assistant') {
    return false
  }
  // Why: Claude attaches harness text to the user rows that carry a tool result; that is not the owner.
  if (message.role === 'user' && message.blocks.some((block) => block.type !== 'text')) {
    return false
  }
  return proseText(message) !== ''
}

/** User prompts and assistant prose, in order. The last reply streams only while the agent works. */
export function jarvisTranscriptMessages(args: {
  transcript: readonly NativeChatMessage[]
  agentBusy: boolean
}): JarvisMessage[] {
  const conversation = stripNoiseMessages(args.transcript).filter(isConversation)
  const last = conversation.length - 1
  return conversation.map((message, index) => ({
    id: message.id,
    role: message.role,
    text: proseText(message),
    streaming: args.agentBusy && index === last && message.role === 'assistant'
  }))
}

/** An echo, anchored to the tail of the conversation shown at the moment it was added. */
export function jarvisEchoOf(
  messages: readonly JarvisMessage[],
  echo: { id: string; role: JarvisMessageRole; text: string }
): JarvisLocalEcho {
  return {
    ...echo,
    text: echo.text.trim(),
    anchorId: messages.at(-1)?.id ?? null,
    baseline: messages.filter(
      (message) => message.role === echo.role && sameWords(message.text, echo.text)
    ).length
  }
}

/** True once the transcript repeats the echo's text more times than it did when the echo was added. */
export function isJarvisEchoConfirmed(
  echo: JarvisLocalEcho,
  messages: readonly JarvisMessage[]
): boolean {
  return isConfirmed(echo, messages)
}

/** The transcript message that confirms one of the owner's pending prompts, if any has landed. */
export function jarvisEchoConfirmationId(
  echoes: readonly JarvisLocalEcho[],
  messages: readonly JarvisMessage[]
): string | null {
  let latest = -1
  for (const echo of echoes) {
    if (echo.role !== 'user') {
      continue
    }
    // Why: the prompt is confirmed by the first message that repeats it, never by the ones after it.
    const at = messages.findIndex((_message, index) =>
      isConfirmed(echo, messages.slice(0, index + 1))
    )
    latest = Math.max(latest, at)
  }
  return latest >= 0 ? messages[latest]!.id : null
}

function isConfirmed(echo: JarvisLocalEcho, messages: readonly JarvisMessage[]): boolean {
  let seen = 0
  for (const message of messages) {
    if (message.role === echo.role && sameWords(message.text, echo.text)) {
      seen += 1
    }
  }
  // Why: only a repeat newer than the echo confirms it; an older identical prompt must not hide it.
  return seen > echo.baseline
}

const asMessage = (echo: JarvisLocalEcho): JarvisMessage => ({
  id: echo.id,
  role: echo.role,
  text: echo.text,
  streaming: false
})

/** Places the echoes that the transcript has not confirmed yet among the transcript messages. */
export function mergeJarvisEchoes(args: {
  messages: readonly JarvisMessage[]
  echoes?: readonly JarvisLocalEcho[]
}): JarvisMessage[] {
  const { messages } = args
  const echoes = (args.echoes ?? []).filter((echo) => !isConfirmed(echo, messages))
  if (echoes.length === 0) {
    return messages as JarvisMessage[]
  }
  const known = new Set(messages.map((message) => message.id))
  const leading: JarvisLocalEcho[] = []
  const trailing: JarvisLocalEcho[] = []
  const afterAnchor = new Map<string, JarvisLocalEcho[]>()
  for (const echo of echoes) {
    if (echo.anchorId !== null && known.has(echo.anchorId)) {
      afterAnchor.set(echo.anchorId, [...(afterAnchor.get(echo.anchorId) ?? []), echo])
    } else if (echo.anchorId === null && messages.length === 0) {
      // Why: an unanchored echo only leads the list once history that predates it shows up.
      trailing.push(echo)
    } else {
      leading.push(echo)
    }
  }
  const out: JarvisMessage[] = leading.map(asMessage)
  for (const message of messages) {
    out.push(message)
    for (const echo of afterAnchor.get(message.id) ?? []) {
      out.push(asMessage(echo))
    }
  }
  return [...out, ...trailing.map(asMessage)]
}

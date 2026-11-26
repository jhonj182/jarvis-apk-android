import { beforeEach, describe, expect, it } from 'vitest'
import type { NativeChatBlock, NativeChatMessage } from '../../../src/shared/native-chat-types'
import type { JarvisMessage } from './jarvis-contract'
import type { JarvisLocalEcho } from './jarvis-transcript-merge'
import {
  isJarvisEchoConfirmed,
  jarvisEchoConfirmationId,
  jarvisEchoOf,
  jarvisTranscriptMessages,
  mergeJarvisEchoes
} from './jarvis-transcript-merge'

let sequence = 0

function message(
  role: NativeChatMessage['role'],
  text = '',
  blocks?: NativeChatBlock[]
): NativeChatMessage {
  sequence += 1
  return {
    id: `m${sequence}`,
    role,
    blocks: blocks ?? (text === '' ? [] : [{ type: 'text', text }]),
    timestamp: sequence,
    source: 'transcript'
  }
}

const ids = (messages: readonly { id: string }[]): string[] => messages.map((item) => item.id)
const texts = (messages: readonly { text: string }[]): string[] => messages.map((item) => item.text)

describe('jarvisTranscriptMessages', () => {
  beforeEach(() => {
    sequence = 0
  })

  it('keeps user and assistant prose in order', () => {
    const transcript = [message('user', '¿Cómo van?'), message('assistant', 'Van bien.')]

    expect(jarvisTranscriptMessages({ transcript, agentBusy: false })).toEqual([
      { id: 'm1', role: 'user', text: '¿Cómo van?', streaming: false },
      { id: 'm2', role: 'assistant', text: 'Van bien.', streaming: false }
    ])
  })

  it('drops tool calls, tool results, reasoning and system rows', () => {
    const transcript = [
      message('user', 'revisa'),
      message('assistant', '', [{ type: 'tool-call', name: 'Bash', input: {} }]),
      message('tool', '', [{ type: 'tool-result', output: 'ok' }]),
      message('assistant', 'Listo.', [
        { type: 'text', text: 'Listo.' },
        { type: 'tool-call', name: 'Edit', input: {} }
      ]),
      message('reasoning', 'pensando'),
      message('system', 'Conversation interrupted')
    ]

    expect(texts(jarvisTranscriptMessages({ transcript, agentBusy: false }))).toEqual([
      'revisa',
      'Listo.'
    ])
  })

  it('drops harness noise and the text a tool-result row carries', () => {
    const transcript = [
      message('user', '<task-notification>\n<task-id>x</task-id>'),
      message('user', '', [
        { type: 'tool-result', output: 'r' },
        { type: 'text', text: 'sidecar' }
      ]),
      message('user', 'real'),
      message('user', '', [])
    ]

    expect(texts(jarvisTranscriptMessages({ transcript, agentBusy: false }))).toEqual(['real'])
  })

  it('joins the text blocks of one message', () => {
    const transcript = [
      message('assistant', '', [
        { type: 'text', text: 'Primero.' },
        { type: 'text', text: 'Segundo.' }
      ])
    ]

    expect(texts(jarvisTranscriptMessages({ transcript, agentBusy: false }))).toEqual([
      'Primero.\n\nSegundo.'
    ])
  })

  it('marks the last assistant message as streaming only while the agent works', () => {
    const transcript = [message('user', 'q'), message('assistant', 'a'), message('assistant', 'b')]

    expect(
      jarvisTranscriptMessages({ transcript, agentBusy: true }).map((item) => item.streaming)
    ).toEqual([false, false, true])
    expect(
      jarvisTranscriptMessages({ transcript, agentBusy: false }).some((item) => item.streaming)
    ).toBe(false)
  })

  it('streams nothing when the agent is working on a turn nobody answered yet', () => {
    const transcript = [message('assistant', 'viejo'), message('user', 'nuevo')]

    expect(
      jarvisTranscriptMessages({ transcript, agentBusy: true }).map((item) => item.streaming)
    ).toEqual([false, false])
  })
})

describe('jarvisEchoOf', () => {
  beforeEach(() => {
    sequence = 0
  })

  const shown = (rows: NativeChatMessage[]): JarvisMessage[] =>
    jarvisTranscriptMessages({ transcript: rows, agentBusy: false })

  it('anchors the echo to the transcript tail and counts the identical messages before it', () => {
    const messages = shown([
      message('user', 'hola'),
      message('assistant', 'hola'),
      message('user', ' hola ')
    ])

    expect(jarvisEchoOf(messages, { id: 'e1', role: 'user', text: 'hola' })).toEqual({
      id: 'e1',
      role: 'user',
      text: 'hola',
      anchorId: 'm3',
      baseline: 2
    })
  })

  it('anchors to nothing when the transcript is still empty', () => {
    expect(jarvisEchoOf([], { id: 'e1', role: 'assistant', text: 'Hecho.' })).toEqual({
      id: 'e1',
      role: 'assistant',
      text: 'Hecho.',
      anchorId: null,
      baseline: 0
    })
  })
})

describe('mergeJarvisEchoes', () => {
  beforeEach(() => {
    sequence = 0
  })

  const echo = (
    patch: Partial<JarvisLocalEcho> & Pick<JarvisLocalEcho, 'id' | 'role' | 'text'>
  ): JarvisLocalEcho => ({
    anchorId: null,
    baseline: 0,
    ...patch
  })

  it('shows an echo right after the message it was anchored to', () => {
    const messages = jarvisTranscriptMessages({
      transcript: [message('user', 'uno'), message('assistant', 'dos'), message('user', 'tres')],
      agentBusy: false
    })

    const merged = mergeJarvisEchoes({
      messages,
      echoes: [echo({ id: 'e1', role: 'user', text: ' cuatro', anchorId: 'm2' })]
    })

    expect(ids(merged)).toEqual(['m1', 'm2', 'e1', 'm3'])
    expect(merged[2]).toEqual({ id: 'e1', role: 'user', text: ' cuatro', streaming: false })
  })

  it('removes a user echo once the transcript repeats its text after the baseline', () => {
    const rows = [message('user', 'viejo'), message('assistant', 'respuesta')]
    const pending = jarvisTranscriptMessages({ transcript: rows, agentBusy: false })
    const sent = jarvisEchoOf(pending, { id: 'e1', role: 'user', text: 'hola' })
    const landed = jarvisTranscriptMessages({
      transcript: [...rows, message('user', ' hola ')],
      agentBusy: false
    })

    expect(sent).toMatchObject({ anchorId: 'm2', baseline: 0 })
    expect(ids(mergeJarvisEchoes({ messages: pending, echoes: [sent] }))).toEqual([
      'm1',
      'm2',
      'e1'
    ])
    expect(ids(mergeJarvisEchoes({ messages: landed, echoes: [sent] }))).toEqual(['m1', 'm2', 'm3'])
  })

  it('keeps an echo while only an older identical message exists', () => {
    const messages = jarvisTranscriptMessages({
      transcript: [message('user', 'hola'), message('assistant', 'respuesta')],
      agentBusy: false
    })
    const sent = jarvisEchoOf(messages, { id: 'e1', role: 'user', text: 'hola' })

    expect(sent.baseline).toBe(1)
    expect(ids(mergeJarvisEchoes({ messages, echoes: [sent] }))).toEqual(['m1', 'm2', 'e1'])
  })

  it('keeps a local reply that the transcript will never carry, in place, as history grows', () => {
    const rows = [message('user', 'viejo'), message('assistant', 'vieja respuesta')]
    const before = jarvisTranscriptMessages({ transcript: rows, agentBusy: false })
    const order = jarvisEchoOf(before, { id: 'e1', role: 'user', text: 'pon música' })
    const reply = jarvisEchoOf(before, {
      id: 'e2',
      role: 'assistant',
      text: 'Reproduciendo música en YouTube Music.'
    })
    const later = jarvisTranscriptMessages({
      transcript: [...rows, message('user', 'y luego'), message('assistant', 'listo')],
      agentBusy: false
    })

    expect(texts(mergeJarvisEchoes({ messages: later, echoes: [order, reply] }))).toEqual([
      'viejo',
      'vieja respuesta',
      'pon música',
      'Reproduciendo música en YouTube Music.',
      'y luego',
      'listo'
    ])
  })

  it('puts echoes from before an empty transcript first once history appears', () => {
    const messages = jarvisTranscriptMessages({
      transcript: [message('user', 'hola'), message('assistant', 'hola')],
      agentBusy: false
    })

    expect(
      ids(
        mergeJarvisEchoes({
          messages,
          echoes: [echo({ id: 'e1', role: 'assistant', text: 'Hecho.' })]
        })
      )
    ).toEqual(['e1', 'm1', 'm2'])
    expect(
      ids(
        mergeJarvisEchoes({
          messages: [],
          echoes: [echo({ id: 'e1', role: 'assistant', text: 'Hecho.' })]
        })
      )
    ).toEqual(['e1'])
  })

  it('puts an echo whose anchor scrolled out of the transcript first', () => {
    const messages = jarvisTranscriptMessages({
      transcript: [message('user', 'nuevo')],
      agentBusy: false
    })

    expect(
      ids(
        mergeJarvisEchoes({
          messages,
          echoes: [echo({ id: 'e1', role: 'user', text: 'viejo', anchorId: 'm0' })]
        })
      )
    ).toEqual(['e1', 'm1'])
  })

  it('names the transcript message that confirms the owner pending prompt', () => {
    const rows = [message('user', 'hola'), message('assistant', 'hola')]
    const before = jarvisTranscriptMessages({ transcript: rows, agentBusy: false })
    const sent = jarvisEchoOf(before, { id: 'e1', role: 'user', text: 'plan' })
    const pending = [...before, { id: 'm3', role: 'user' as const, text: 'otra', streaming: false }]
    const landed = [...before, { id: 'm4', role: 'user' as const, text: 'plan', streaming: false }]
    const local = jarvisEchoOf(before, { id: 'e2', role: 'assistant', text: 'Hecho.' })

    expect(isJarvisEchoConfirmed(sent, landed)).toBe(true)
    expect(jarvisEchoConfirmationId([sent, local], pending)).toBeNull()
    expect(jarvisEchoConfirmationId([sent, local], landed)).toBe('m4')
    // Why this matters: the reply that shares the first read with the prompt must not count as history.
    expect(
      jarvisEchoConfirmationId(
        [sent],
        [...landed, { id: 'm5', role: 'assistant', text: 'listo', streaming: false }]
      )
    ).toBe('m4')
    expect(jarvisEchoConfirmationId([], landed)).toBeNull()
  })
})

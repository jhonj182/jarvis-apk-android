import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { useJarvisTranscript } from './use-jarvis-transcript'

const session = vi.hoisted(() => ({
  useMobileNativeChatSession: vi.fn(),
  messages: [] as NativeChatMessage[]
}))

vi.mock('../session/use-mobile-native-chat-session', () => ({
  useMobileNativeChatSession: session.useMobileNativeChatSession
}))

let sequence = 0
const row = (role: NativeChatMessage['role'], text: string): NativeChatMessage => {
  sequence += 1
  return {
    id: `m${sequence}`,
    role,
    blocks: [{ type: 'text', text }],
    timestamp: sequence,
    source: 'transcript'
  }
}

describe('useJarvisTranscript', () => {
  const mounted: { renderer?: ReactTestRenderer } = {}
  const seen: ReturnType<typeof useJarvisTranscript>[] = []
  type Args = Parameters<typeof useJarvisTranscript>[0]
  const base: Args = {
    client: { id: 'client' } as unknown as Args['client'],
    hostId: 'fedora',
    worktreeId: 'f::brain',
    agent: 'claude',
    sessionId: 's1',
    transcriptPath: '/t.jsonl',
    agentBusy: false
  }

  function Probe(args: Args) {
    seen.push(useJarvisTranscript(args))
    return null
  }

  const hook = () => seen.at(-1)!
  const rerender = async (args: Args) => {
    await act(async () => mounted.renderer?.update(createElement(Probe, args)))
  }
  const native = (messages: NativeChatMessage[], status = 'ready') => {
    session.messages = messages
    session.useMobileNativeChatSession.mockImplementation(() => ({
      messages,
      status,
      transcriptLoading: status === 'loading',
      error: undefined,
      hasMore: false,
      loadingEarlier: false,
      loadEarlier: () => undefined
    }))
  }
  async function mount(args: Args) {
    await act(async () => {
      mounted.renderer = create(createElement(Probe, args))
    })
  }

  let initial: NativeChatMessage[]

  beforeEach(() => {
    sequence = 0
    session.useMobileNativeChatSession.mockReset()
    initial = [row('user', '¿Cómo van?'), row('assistant', 'Van bien.')]
    native(initial)
    seen.length = 0
  })

  afterEach(() => {
    act(() => mounted.renderer?.unmount())
    mounted.renderer = undefined
  })

  it('subscribes through the upstream session hook with the identity of the Jarvis session', async () => {
    await mount(base)

    expect(session.useMobileNativeChatSession).toHaveBeenLastCalledWith({
      client: base.client,
      sourceIdentity: expect.stringContaining('fedora'),
      agent: 'claude',
      sessionId: 's1',
      transcriptPath: '/t.jsonl'
    })
    expect(
      JSON.parse(session.useMobileNativeChatSession.mock.calls.at(-1)![0].sourceIdentity)
    ).toEqual(['fedora', 'f::brain'])
  })

  it('reduces the transcript to owner and assistant prose, without tool rows', async () => {
    await mount(base)

    expect(hook().transcript).toEqual([
      { id: 'm1', role: 'user', text: '¿Cómo van?', streaming: false },
      { id: 'm2', role: 'assistant', text: 'Van bien.', streaming: false }
    ])
    expect(hook().messages).toEqual(hook().transcript)
  })

  it('streams the last reply only while the agent is busy', async () => {
    await mount(base)
    await rerender({ ...base, agentBusy: true })

    expect(hook().messages.at(-1)?.streaming).toBe(true)
  })

  it('shows what the phone sent until the transcript repeats it', async () => {
    await mount(base)

    await act(async () => hook().addEcho({ role: 'user', text: '¿y el CI?' }))
    expect(hook().messages.map((item) => [item.id, item.text])).toEqual([
      ['m1', '¿Cómo van?'],
      ['m2', 'Van bien.'],
      ['local-1', '¿y el CI?']
    ])

    native([...initial, row('user', ' ¿y el CI? ')])
    await rerender(base)

    expect(hook().messages.map((item) => item.id)).toEqual(['m1', 'm2', 'm3'])
  })

  it('keeps a reply the phone gave itself, where it gave it', async () => {
    await mount(base)

    await act(async () => hook().addEcho({ role: 'user', text: 'pon música' }))
    await act(async () =>
      hook().addEcho({ role: 'assistant', text: 'Reproduciendo música en YouTube Music.' })
    )
    native([...initial, row('user', 'gracias'), row('assistant', 'Un gusto.')])
    await rerender(base)

    expect(hook().messages.map((item) => item.text)).toEqual([
      '¿Cómo van?',
      'Van bien.',
      'pon música',
      'Reproduciendo música en YouTube Music.',
      'gracias',
      'Un gusto.'
    ])
  })

  it('forgets the echoes when another workspace is shown', async () => {
    await mount(base)
    await act(async () => hook().addEcho({ role: 'assistant', text: 'Hecho.' }))

    await rerender({ ...base, worktreeId: 'f::other' })

    expect(hook().messages.some((item) => item.id.startsWith('local-'))).toBe(false)
  })

  it('reads nothing until the session is known, without reporting a load', async () => {
    native([])
    session.useMobileNativeChatSession.mockImplementation(() => ({
      messages: [],
      status: 'waiting-session',
      transcriptLoading: false,
      error: undefined,
      hasMore: false,
      loadingEarlier: false,
      loadEarlier: () => undefined
    }))

    await mount({ ...base, agent: null, sessionId: null })

    expect(session.useMobileNativeChatSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ agent: null, sessionId: null })
    )
    expect(hook()).toMatchObject({ messages: [], loading: false, settled: false, error: null })
  })

  it('names a failed transcript read in Spanish', async () => {
    session.useMobileNativeChatSession.mockImplementation(() => ({
      messages: [],
      status: 'error',
      transcriptLoading: false,
      error: 'Transcript unavailable',
      hasMore: false,
      loadingEarlier: false,
      loadEarlier: () => undefined
    }))

    await mount(base)

    expect(hook()).toMatchObject({
      loading: false,
      error: 'No pude leer la conversación del escritorio. Vuelve a entrar en un momento.'
    })
  })

  it('is loading while the first read of a session is in flight, and settled once it completed', async () => {
    native([], 'loading')

    await mount(base)
    expect(hook()).toMatchObject({ loading: true, settled: false })

    native(initial)
    await rerender(base)
    expect(hook()).toMatchObject({ loading: false, settled: true })
  })

  it('is not settled while the desktop has not been asked yet, even with an empty transcript', async () => {
    native([])
    session.useMobileNativeChatSession.mockImplementation(() => ({
      messages: [],
      status: 'idle',
      transcriptLoading: false,
      error: undefined,
      hasMore: false,
      loadingEarlier: false,
      loadEarlier: () => undefined
    }))

    await mount({ ...base, client: null })

    expect(hook()).toMatchObject({ loading: false, settled: false })
  })

  it('hands out the same addEcho across renders', async () => {
    await mount(base)
    const before = hook().addEcho

    await rerender({ ...base, agentBusy: true })

    expect(hook().addEcho).toBe(before)
  })
})

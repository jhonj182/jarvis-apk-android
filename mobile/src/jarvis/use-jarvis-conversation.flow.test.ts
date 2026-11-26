// The whole engine over a fake desktop: real hooks, only the transport, the microphone and the
// speech engine replaced. Nothing here runs on a device, so this is as close to the loop of
// docs/01-prd.md §4 as a test gets.
import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import * as Speech from 'expo-speech'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentStatusEntry } from '../../../src/shared/agent-status-types'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import type { RpcClient } from '../transport/rpc-client'
import type { HostProfile, RpcResponse } from '../transport/types'
import type { JarvisConversation, JarvisOrderVoice } from './jarvis-contract'
import type { LockState } from './lock-policy'
import { useJarvisConversation } from './use-jarvis-conversation'
import { LockStateProvider } from './use-lock-state'

const transport = vi.hoisted(() => ({
  loadHosts: vi.fn<() => Promise<HostProfile[]>>(),
  client: null as RpcClient | null,
  // Why: the real hook hands out a memoized array; a fresh one every render is not what it promises.
  connections: [] as { hostId: string; client: unknown; state: string; path: string }[]
}))

vi.mock('expo-speech', () => ({
  speak: vi.fn(),
  stop: vi.fn(async () => undefined),
  getAvailableVoicesAsync: vi.fn(async () => [
    { identifier: 'es-co', name: 'Colombian', quality: 'Default', language: 'es-CO' }
  ]),
  maxSpeechInputLength: 4000
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined) }
}))

const microphone = vi.hoisted(() => ({
  /** What the engine last asked of the dictation: an open mic needs this to be true. */
  enabled: null as boolean | null,
  isStarting: false,
  start: vi.fn<() => Promise<void>>(async () => undefined),
  stop: vi.fn<() => Promise<void>>(async () => undefined),
  cancel: vi.fn<() => Promise<void>>(async () => undefined)
}))

vi.mock('../hooks/use-mobile-dictation', () => ({
  useMobileDictation: (args: { enabled: boolean }) => {
    microphone.enabled = args.enabled
    return {
      status: microphone.isStarting ? 'starting' : 'idle',
      isStarting: microphone.isStarting,
      isRecording: false,
      isProcessing: false,
      error: null,
      start: microphone.start,
      stop: microphone.stop,
      cancel: microphone.cancel
    }
  }
}))

vi.mock('../transport/host-store', () => ({ loadHosts: transport.loadHosts }))
vi.mock('../transport/use-all-host-clients', () => ({
  useAllHostClients: () => transport.connections
}))
vi.mock('../transport/client-context', () => ({
  useHostClient: () => ({ client: transport.client, state: 'connected' })
}))

const ok = (result: unknown): RpcResponse =>
  ({ id: 'x', ok: true, result, _meta: { runtimeId: 'rt' } }) as RpcResponse
const refused = (message: string): RpcResponse =>
  ({
    id: 'x',
    ok: false,
    error: { code: 'internal', message },
    _meta: { runtimeId: 'rt' }
  }) as RpcResponse

const FEDORA: HostProfile = {
  id: 'fedora',
  name: 'Fedora',
  endpoint: 'wss://fedora',
  deviceToken: 'token-1',
  publicKeyB64: 'key',
  lastConnected: 1
}

type Listener = (frame: unknown) => void

function desktop() {
  const listeners = new Map<string, Set<Listener>>()
  const calls: { method: string; params: unknown }[] = []
  // An answer is the result to wrap, or a full response when a refusal with a message is needed.
  const answers: Record<string, () => unknown> = {
    'worktree.ps': () => ({
      worktrees: [
        {
          worktreeId: 'f::brain',
          displayName: 'jarvis-mobile-brain',
          path: '/x',
          isArchived: false
        }
      ]
    }),
    'speech.models.list': () => ({
      enabled: true,
      selectedModelId: 'parakeet',
      dictationMode: 'hold',
      models: [
        {
          id: 'parakeet',
          label: 'Parakeet',
          provider: 'local',
          sizeBytes: 1,
          recommended: true,
          status: 'ready',
          progress: null
        }
      ]
    }),
    'terminal.send': () => ({ send: { accepted: true } }),
    'terminal.createAgentSession': () => ({
      terminal: { handle: 'term_new', tabId: 'tab-new' },
      disposition: 'created'
    })
  }
  const client = {
    sendRequest: vi.fn(async (method: string, params?: unknown) => {
      calls.push({ method, params })
      if (!(method in answers)) {
        return refused(`unexpected method ${method}`)
      }
      const reply = answers[method]!() as Partial<RpcResponse> | null
      return typeof reply?.ok === 'boolean' ? (reply as RpcResponse) : ok(reply)
    }),
    subscribe: vi.fn((method: string, params: unknown, listener: Listener) => {
      calls.push({ method, params })
      const set = listeners.get(method) ?? new Set<Listener>()
      set.add(listener)
      listeners.set(method, set)
      return () => set.delete(listener)
    })
  } as unknown as RpcClient
  return {
    client,
    calls,
    of: (method: string) =>
      calls.filter((call) => call.method === method).map((call) => call.params),
    answer: (method: string, reply: () => unknown) => {
      answers[method] = reply
    },
    emit: (method: string, frame: unknown) => {
      for (const listener of listeners.get(method) ?? []) {
        listener(frame)
      }
    }
  }
}

const claudeStatus = (patch: Partial<AgentStatusEntry> = {}): AgentStatusEntry =>
  ({
    state: 'done',
    prompt: '',
    updatedAt: 1,
    stateStartedAt: 1,
    paneKey: 'pane',
    stateHistory: [],
    agentType: 'claude',
    ...patch
  }) as unknown as AgentStatusEntry

const claudeTab = (status: AgentStatusEntry | null = null) => ({
  type: 'terminal',
  id: 'tab-1',
  title: 'claude',
  terminal: 'term_1',
  launchAgent: 'claude',
  agentStatus: status,
  isActive: true
})
const LIVE = { key: 'session_id' as const, id: 's1', transcriptPath: '/t.jsonl' }
const row = (id: string, role: NativeChatMessage['role'], text: string): NativeChatMessage => ({
  id,
  role,
  blocks: [{ type: 'text', text }],
  timestamp: 1,
  source: 'transcript'
})

describe('useJarvisConversation over a desktop', () => {
  // Why a factory and not the element: React skips a re-render when handed the very same element.
  const mounted: { renderer?: ReactTestRenderer; draw?: () => React.ReactElement } = {}
  const seen: JarvisConversation[] = []
  let world: ReturnType<typeof desktop>
  let localAnswer: string | null
  // Stands for the real handler: it says what must be heard through the voice it is given.
  const localIntents = {
    handle: vi.fn(async (_text: string, voice?: JarvisOrderVoice) => {
      if (localAnswer !== null) {
        await voice?.say(localAnswer)
      }
      return localAnswer
    })
  }

  function Probe() {
    seen.push(useJarvisConversation({ localIntents }))
    return null
  }

  const hook = () => seen.at(-1)!
  const spoken = () => vi.mocked(Speech.speak).mock.calls.map(([text]) => text)
  /** The engine reports each utterance finished, as the native side does when it falls silent. */
  const finishReading = async () => {
    await act(async () => {
      for (const [, options] of vi.mocked(Speech.speak).mock.calls) {
        for (const event of ['onDone'] as const) {
          if (typeof options?.[event] === 'function') {
            ;(options[event] as () => void)()
          }
        }
      }
    })
    await flush()
  }
  const flush = async () => {
    for (let round = 0; round < 5; round += 1) {
      await act(async () => {
        await Promise.resolve()
      })
    }
  }

  beforeEach(() => {
    world = desktop()
    transport.client = world.client
    transport.connections = [
      { hostId: 'fedora', client: world.client, state: 'connected', path: 'direct' }
    ]
    transport.loadHosts.mockReset().mockResolvedValue([FEDORA])
    localAnswer = null
    localIntents.handle.mockClear()
    microphone.enabled = null
    microphone.isStarting = false
    microphone.start.mockClear()
    microphone.stop.mockClear()
    microphone.cancel.mockClear()
    vi.mocked(Speech.speak).mockClear()
    vi.mocked(Speech.stop).mockClear()
    seen.length = 0
  })

  afterEach(() => {
    act(() => mounted.renderer?.unmount())
    mounted.renderer = undefined
    mounted.draw = undefined
  })

  async function mount() {
    await act(async () => {
      mounted.draw = () => createElement(Probe)
      mounted.renderer = create(mounted.draw())
    })
    await flush()
  }

  /** Renders the same tree again, so the engine reads what a mock changed between renders. */
  const rerender = async () => {
    await act(async () => {
      mounted.renderer?.update(mounted.draw?.())
    })
    await flush()
  }

  const attachTo = async (status: AgentStatusEntry | null) => {
    await mount()
    await act(async () =>
      world.emit('session.tabs.subscribe', { type: 'snapshot', tabs: [claudeTab(status)] })
    )
    await flush()
  }

  // The same engine, under a gate that says whether the app is locked (RF-2.1).
  const GREETING = 'Aquí Jarvis. ¿Qué necesitas?'
  /** The voice reads sentence by sentence, so that is what reaches the speech engine. */
  const GREETING_READ = ['Aquí Jarvis.', '¿Qué necesitas?']
  const gate = { lock: 'unlocked' as LockState }
  function GreetingProbe() {
    seen.push(useJarvisConversation({ localIntents, greeting: GREETING }))
    return null
  }
  function GatedProbe() {
    return createElement(LockStateProvider, { value: gate.lock }, createElement(GreetingProbe))
  }
  const setLock = async (lock: LockState) => {
    await act(async () => {
      gate.lock = lock
      mounted.renderer?.update(mounted.draw?.())
    })
    await flush()
  }
  const mountGated = async (lock: LockState) => {
    await act(async () => {
      gate.lock = lock
      mounted.draw = () => createElement(GatedProbe)
      mounted.renderer = create(mounted.draw())
    })
    await flush()
  }
  const attachGatedTo = async (lock: LockState, status: AgentStatusEntry | null) => {
    await mountGated(lock)
    await act(async () =>
      world.emit('session.tabs.subscribe', { type: 'snapshot', tabs: [claudeTab(status)] })
    )
    await flush()
  }
  /** The desktop reports the Claude tab again, with its agent in the given state. */
  const setAgentState = async (state: AgentStatusEntry['state']) => {
    await act(async () => {
      world.emit('session.tabs.subscribe', {
        type: 'updated',
        tabs: [claudeTab(claudeStatus({ state, providerSession: LIVE }))]
      })
    })
    await flush()
  }
  const receive = async (type: 'snapshot' | 'appended', messages: NativeChatMessage[]) => {
    await act(async () => {
      world.emit('nativeChat.subscribe', { type, messages, hasMore: false })
    })
    await flush()
  }

  it('finds the Jarvis workspace by itself, attaches to its Claude tab and sends what is typed', async () => {
    await attachTo(null)

    expect(hook()).toMatchObject({ setupNeed: null, connected: true, activity: 'idle' })
    expect(hook().statusText).toBe('¿Qué necesitas?')

    await act(async () => hook().sendText('¿cómo van los PRs?'))
    await flush()

    expect(world.of('terminal.send')).toEqual([
      expect.objectContaining({ terminal: 'term_1', text: '\u0015¿cómo van los PRs?', enter: true })
    ])
    expect(hook().messages.map((message) => [message.role, message.text])).toEqual([
      ['user', '¿cómo van los PRs?']
    ])
    expect(hook().activity).toBe('thinking')
  })

  it('reads the first sentence of the reply before the reply has finished arriving', async () => {
    await attachTo(null)
    await act(async () => hook().sendText('hola'))
    await flush()

    await act(async () => {
      world.emit('session.tabs.subscribe', {
        type: 'updated',
        tabs: [claudeTab(claudeStatus({ state: 'working', providerSession: LIVE }))]
      })
    })
    await flush()

    expect(world.of('nativeChat.subscribe').at(-1)).toMatchObject({
      agent: 'claude',
      sessionId: 's1',
      transcriptPath: '/t.jsonl'
    })

    await act(async () => {
      world.emit('nativeChat.subscribe', {
        type: 'snapshot',
        messages: [row('u1', 'user', 'hola'), row('a1', 'assistant', 'Hola. ¿Qué')],
        hasMore: false
      })
    })
    await flush()

    // The transcript now carries the prompt, so the stand-in the phone added is gone.
    expect(hook().messages.map((message) => message.id)).toEqual(['u1', 'a1'])
    expect(hook().messages.at(-1)?.streaming).toBe(true)
    expect(spoken()).toEqual(['Hola.'])

    await act(async () => {
      world.emit('nativeChat.subscribe', {
        type: 'appended',
        messages: [row('a1', 'assistant', 'Hola. ¿Qué necesitas?')]
      })
    })
    await flush()

    expect(spoken()).toEqual(['Hola.', '¿Qué necesitas?'])
    expect(vi.mocked(Speech.speak).mock.calls[0]?.[1]).toMatchObject({
      voice: 'es-co',
      language: 'es-CO'
    })

    await act(async () => {
      world.emit('session.tabs.subscribe', {
        type: 'updated',
        tabs: [claudeTab(claudeStatus({ state: 'done', providerSession: LIVE }))]
      })
    })
    await flush()

    expect(hook().messages.at(-1)?.streaming).toBe(false)
    expect(hook().activity).toBe('speaking')

    await finishReading()

    expect(hook().activity).toBe('idle')
    expect(hook().statusText).toBe('¿Qué necesitas?')
  })

  it('never reads aloud the history it finds when it attaches to a session in use', async () => {
    await attachTo(claudeStatus({ providerSession: LIVE }))

    await act(async () => {
      world.emit('nativeChat.subscribe', {
        type: 'snapshot',
        messages: [
          row('u0', 'user', 'pregunta vieja'),
          row('a0', 'assistant', 'Respuesta vieja. Dos frases.')
        ],
        hasMore: false
      })
    })
    await flush()

    expect(hook().messages).toHaveLength(2)
    expect(spoken()).toEqual([])
  })

  it('opens the session itself when the workspace has no Claude tab yet', async () => {
    await mount()
    await act(async () => world.emit('session.tabs.subscribe', { type: 'snapshot', tabs: [] }))
    await flush()

    const [request] = world.of('terminal.createAgentSession')
    expect(request).toMatchObject({
      worktree: 'id:f::brain',
      agent: 'claude',
      clientOperationId: /^\d{13}-[0-9a-f]{32}$/
    })
    expect(request).not.toHaveProperty('claudeAccountId')
    expect(request).not.toHaveProperty('prompt')
    expect(hook()).toMatchObject({ connected: true, setupNeed: null })
  })

  it('answers a music order on the phone without touching the session', async () => {
    await attachTo(null)
    localAnswer = 'Reproduciendo salsa en YouTube Music.'

    await act(async () => hook().sendText('ponme música de salsa'))
    await flush()
    // The order waits until its confirmation was read before it counts as answered.
    expect(hook().messages).toEqual([])
    await finishReading()

    expect(world.of('terminal.send')).toEqual([])
    expect(hook().messages.map((message) => [message.role, message.text])).toEqual([
      ['user', 'ponme música de salsa'],
      ['assistant', 'Reproduciendo salsa en YouTube Music.']
    ])
    expect(spoken()).toEqual(['Reproduciendo salsa en YouTube Music.'])
  })

  it('says the desktop is unreachable, and keeps nothing in the conversation, when a send is refused', async () => {
    world.answer('terminal.send', () => refused('terminal gone'))
    await attachTo(null)

    await act(async () => hook().sendText('hola'))
    await flush()

    expect(hook().messages).toEqual([])
    expect(hook().statusText).toBe('No pude entregar el mensaje al escritorio. Inténtalo de nuevo.')
    // The voice hands the engine one sentence at a time.
    expect(spoken()).toEqual(['No pude entregar el mensaje al escritorio.', 'Inténtalo de nuevo.'])
  })

  it('interrupts the reading and drops the rest of the reply', async () => {
    // The agent is still writing this reply, so its unfinished last sentence has not been read.
    await attachTo(claudeStatus({ state: 'working', providerSession: LIVE }))
    await act(async () =>
      world.emit('nativeChat.subscribe', { type: 'snapshot', messages: [], hasMore: false })
    )
    await flush()
    await act(async () => {
      world.emit('nativeChat.subscribe', {
        type: 'appended',
        messages: [row('u1', 'user', 'dime'), row('a1', 'assistant', 'Uno. Dos. Tres')]
      })
    })
    await flush()
    expect(spoken()).toEqual(['Uno.', 'Dos.'])

    await act(async () => hook().stopSpeaking())
    await act(async () => {
      world.emit('nativeChat.subscribe', {
        type: 'appended',
        messages: [row('a1', 'assistant', 'Uno. Dos. Tres. Cuatro.')]
      })
    })
    await flush()

    expect(Speech.stop).toHaveBeenCalled()
    expect(spoken()).toEqual(['Uno.', 'Dos.'])
    expect(hook()).toMatchObject({ activity: 'thinking', statusText: 'Pensando' })
  })

  it('reads nothing more once the voice is switched off, and reads again when it is back', async () => {
    await attachTo(claudeStatus({ providerSession: LIVE }))
    await act(async () =>
      world.emit('nativeChat.subscribe', { type: 'snapshot', messages: [], hasMore: false })
    )
    await flush()
    await act(async () => hook().toggleSpeech())
    await flush()

    expect(hook().speechEnabled).toBe(false)
    await act(async () => {
      world.emit('nativeChat.subscribe', {
        type: 'appended',
        messages: [row('a1', 'assistant', 'En silencio.')]
      })
    })
    await flush()
    expect(spoken()).toEqual([])

    await act(async () => hook().toggleSpeech())
    await flush()
    await act(async () => {
      world.emit('nativeChat.subscribe', {
        type: 'appended',
        messages: [row('a2', 'assistant', 'De vuelta.')]
      })
    })
    await flush()

    expect(hook().speechEnabled).toBe(true)
    expect(spoken()).toEqual(['De vuelta.'])
  })

  it('stays silent while the app is locked, and greets only once it is open', async () => {
    await attachGatedTo('locked-armed', null)

    expect(hook()).toMatchObject({ connected: true, setupNeed: null })
    expect(spoken()).toEqual([])

    await setLock('unlocked')

    expect(spoken()).toEqual(GREETING_READ)
  })

  it('falls silent the moment the app locks, and does not read what arrives while it is locked', async () => {
    await attachGatedTo('unlocked', claudeStatus({ providerSession: LIVE }))
    await receive('snapshot', [])
    await receive('appended', [row('u1', 'user', 'dime'), row('a1', 'assistant', 'Uno. Dos.')])
    const soFar = [...GREETING_READ, 'Uno.', 'Dos.']
    expect(spoken()).toEqual(soFar)
    vi.mocked(Speech.stop).mockClear()

    await setLock('locked-armed')

    expect(Speech.stop).toHaveBeenCalled()
    await receive('appended', [row('a1', 'assistant', 'Uno. Dos. Tres.')])
    expect(spoken()).toEqual(soFar)

    await setLock('unlocked')

    expect(spoken()).toEqual(soFar)
    expect(hook().activity).toBe('idle')
  })

  // Why: the dictation runs on the desktop over the phone's microphone, so it would hear
  // Jarvis's own voice and send it back as if the owner had said it.
  it('stops reading when the owner presses to talk, and the rest of that reply stays unread', async () => {
    await attachTo(claudeStatus({ state: 'working', providerSession: LIVE }))
    await receive('snapshot', [])
    await receive('appended', [row('u1', 'user', 'dime'), row('a1', 'assistant', 'Uno. Dos. Tres')])
    expect(spoken()).toEqual(['Uno.', 'Dos.'])
    vi.mocked(Speech.stop).mockClear()

    await act(async () => hook().startListening())
    await flush()

    expect(Speech.stop).toHaveBeenCalled()

    // The agent finishes the reply after the interruption, tail included.
    await act(async () => {
      world.emit('session.tabs.subscribe', {
        type: 'updated',
        tabs: [claudeTab(claudeStatus({ state: 'done', providerSession: LIVE }))]
      })
    })
    await receive('appended', [row('a1', 'assistant', 'Uno. Dos. Tres. Cuatro.')])

    expect(spoken()).toEqual(['Uno.', 'Dos.'])
  })

  // Why: on the desktop the dictation only exists once the microphone is open, and until then
  // `stop` does nothing. A short tap, or the first one with the permission dialog, would leave
  // the microphone open with nobody holding the button.
  it('cancels the dictation when the button is released before it has started', async () => {
    await attachTo(null)

    microphone.isStarting = true
    await rerender()
    await act(async () => hook().startListening())
    await act(async () => hook().stopListening())

    expect(microphone.cancel).toHaveBeenCalledTimes(1)
    expect(microphone.stop).not.toHaveBeenCalled()

    microphone.isStarting = false
    await rerender()
    microphone.cancel.mockClear()
    await act(async () => hook().startListening())
    await act(async () => hook().stopListening())

    expect(microphone.stop).toHaveBeenCalledTimes(1)
    expect(microphone.cancel).not.toHaveBeenCalled()
  })

  // Why: on Android a system dialog, the microphone permission first of all, is another Activity,
  // and the app passing through it locks. The microphone must not open behind the lock.
  it('does not open the microphone while the app is locked', async () => {
    await attachGatedTo('unlocked', null)
    expect(microphone.enabled).toBe(true)

    await setLock('locked-armed')
    microphone.start.mockClear()
    await act(async () => hook().startListening())

    expect(microphone.enabled).toBe(false)
    expect(microphone.start).not.toHaveBeenCalled()

    await setLock('unlocked')

    expect(microphone.enabled).toBe(true)
  })

  // Why: the screens are mounted before the owner has unlocked. A session that already exists
  // is found, but none is opened on the desktop for someone who has not authenticated yet.
  it('opens no session on the desktop until the app is unlocked', async () => {
    await mountGated('locked-armed')
    await act(async () => world.emit('session.tabs.subscribe', { type: 'snapshot', tabs: [] }))
    await flush()

    expect(world.of('terminal.createAgentSession')).toEqual([])

    await setLock('unlocked')

    expect(world.of('terminal.createAgentSession')).toHaveLength(1)
    expect(hook()).toMatchObject({ connected: true })
  })

  // Why the order speaks for itself: opening YouTube Music sends this app to the background, so
  // the confirmation has to be said before the launch. Only the handler knows when that is.
  it('hands a music order a voice, and does not repeat what it said', async () => {
    await attachTo(null)
    localAnswer = 'Reproduciendo salsa en YouTube Music.'

    await act(async () => hook().sendText('ponme música de salsa'))
    await flush()

    const voice = localIntents.handle.mock.calls[0]?.[1]
    expect(voice, 'el motor no le dio voz a la orden').toBeDefined()
    expect(spoken()).toEqual(['Reproduciendo salsa en YouTube Music.'])
    // The order is still waiting to be heard; nothing is on screen yet.
    expect(hook().messages).toEqual([])

    // What the order says resolves once it was read.
    let read: Promise<void> | undefined
    await act(async () => {
      read = voice!.say('Primero.')
    })
    expect(spoken()).toEqual(['Reproduciendo salsa en YouTube Music.', 'Primero.'])
    await finishReading()
    await expect(read).resolves.toBeUndefined()
    await flush()

    expect(hook().messages.map((message) => message.text)).toEqual([
      'ponme música de salsa',
      'Reproduciendo salsa en YouTube Music.'
    ])
  })

  it('gives a music order no voice while the app is locked: it runs at once and in silence', async () => {
    await attachGatedTo('unlocked', null)
    await finishReading()
    await setLock('locked-armed')
    localAnswer = 'Reproduciendo salsa en YouTube Music.'

    await act(async () => hook().sendText('ponme música de salsa'))
    await flush()

    expect(localIntents.handle.mock.calls.at(-1)?.[1]).toBeUndefined()
    expect(spoken()).toEqual(GREETING_READ)
  })

  it('gives a music order no voice when the owner switched the voice off', async () => {
    await attachTo(null)
    await act(async () => hook().toggleSpeech())
    await flush()
    localAnswer = 'Reproduciendo salsa en YouTube Music.'

    await act(async () => hook().sendText('ponme música de salsa'))
    await flush()

    expect(localIntents.handle.mock.calls[0]?.[1]).toBeUndefined()
    expect(spoken()).toEqual([])

    // The saved choice outlives the test: put it back so later ones hear Jarvis.
    await act(async () => hook().toggleSpeech())
    await flush()
    expect(hook().speechEnabled).toBe(true)
  })

  // Why: interrupting means "enough of this answer". The turn can go on after a tool call and
  // write another message, and reading that would talk over the owner.
  it('stays silent for the rest of the turn once interrupted, and reads the next turn again', async () => {
    await attachTo(claudeStatus({ state: 'working', providerSession: LIVE }))
    await receive('snapshot', [])
    await receive('appended', [row('u1', 'user', 'dime'), row('a1', 'assistant', 'Uno. Dos.')])
    expect(spoken()).toEqual(['Uno.', 'Dos.'])

    await act(async () => hook().stopSpeaking())
    await receive('appended', [row('a2', 'assistant', 'Tres.')])

    expect(spoken()).toEqual(['Uno.', 'Dos.'])

    await setAgentState('done')
    await act(async () => hook().sendText('otro'))
    await flush()
    await receive('appended', [row('u2', 'user', 'otro'), row('a3', 'assistant', 'Cuatro.')])

    expect(spoken()).toEqual(['Uno.', 'Dos.', 'Cuatro.'])
  })

  // Why: Claude asks for permission through a dialog on the desktop. Without this, Jarvis looks
  // idle while nothing can move, and the next message would be typed into that dialog.
  it('says it is waiting for a permission on the desktop, and sends nothing meanwhile', async () => {
    await attachTo(claudeStatus({ providerSession: LIVE }))
    await setAgentState('waiting')

    expect(hook().statusText).toBe('Espero tu permiso en Orca Lab')
    expect(hook().activity).toBe('thinking')

    await act(async () => hook().sendText('sigue'))
    await flush()

    expect(world.of('terminal.send')).toEqual([])
    expect(hook().messages).toEqual([])
    expect(hook().statusText).toBe(
      'Jarvis espera tu permiso en Orca Lab. Apruébalo allí y repíteme el mensaje.'
    )
    expect(spoken()).toContain('Jarvis espera tu permiso en Orca Lab.')

    // The line about what to do stays a few seconds; the character itself is at rest again.
    await finishReading()
    await setAgentState('done')
    expect(hook().activity).toBe('idle')
  })
})

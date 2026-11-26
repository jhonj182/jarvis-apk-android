import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JarvisLocalIntentHandler, JarvisMessage, JarvisWorkspaceRef } from './jarvis-contract'
import { useJarvisConversation } from './use-jarvis-conversation'

const world = vi.hoisted(() => ({
  preferences: {
    preferences: { workspace: null as JarvisWorkspaceRef | null, speechEnabled: true },
    setSpeechEnabled: vi.fn(async (_enabled: boolean) => undefined),
    setWorkspace: vi.fn(async () => undefined)
  },
  catalogs: {
    hosts: [] as {
      host: { id: string; name: string; lastConnected: number; deviceToken: string }
      state: string
      worktrees: { worktreeId: string; displayName: string; isArchived: boolean }[] | null
      error: string | null
    }[],
    hostsLoaded: true,
    pairedHostIds: [] as string[],
    loading: false,
    error: null as string | null,
    refresh: () => undefined
  },
  host: { client: null as object | null, state: 'disconnected' as string },
  attach: {
    phase: 'idle' as string,
    target: null as unknown,
    error: null as string | null,
    attaching: false
  },
  transcript: {
    transcript: [] as JarvisMessage[],
    messages: [] as JarvisMessage[],
    loading: false,
    settled: true,
    error: null as string | null,
    echoes: [],
    addEcho: vi.fn((_echo: { role: string; text: string }) => 'local-1'),
    removeEcho: vi.fn((_id: string) => undefined)
  },
  dictationSetup: { availability: 'unknown' as string, recheck: vi.fn() },
  voice: {
    speaking: false,
    spokenText: null as string | null,
    say: vi.fn(),
    sayBeforeActing: vi.fn(async (_text: string) => undefined),
    discard: vi.fn()
  },
  outbox: {
    awaitingReply: false,
    sending: false,
    sendToAgent: vi.fn(async (_text: string) => true),
    forget: vi.fn()
  },
  dictation: {
    status: 'idle',
    isStarting: false,
    isRecording: false,
    isProcessing: false,
    error: null as string | null,
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined)
  },
  dictationArgs: null as null | {
    client: unknown
    enabled: boolean
    onTranscript: (text: string) => void
    onError?: (error: Error) => void
  },
  transcriptArgs: null as null | Record<string, unknown>,
  hostClientArgs: [] as (string | undefined)[]
}))

vi.mock('./use-jarvis-preferences', () => ({ useJarvisPreferences: () => world.preferences }))
vi.mock('./use-jarvis-host-worktrees', () => ({ useJarvisHostWorktrees: () => world.catalogs }))
vi.mock('../transport/client-context', () => ({
  useHostClient: (hostId: string | undefined) => {
    world.hostClientArgs.push(hostId)
    return { client: world.host.client, state: world.host.state }
  }
}))
vi.mock('./use-jarvis-session-attach', () => ({ useJarvisSessionAttach: () => world.attach }))
vi.mock('./use-jarvis-transcript', () => ({
  useJarvisTranscript: (args: Record<string, unknown>) => {
    world.transcriptArgs = args
    return world.transcript
  }
}))
vi.mock('./use-jarvis-dictation-availability', () => ({
  useJarvisDictationAvailability: (args: unknown) => {
    void args
    return world.dictationSetup
  }
}))
vi.mock('./use-jarvis-reply-voice', () => ({ useJarvisReplyVoice: () => world.voice }))
vi.mock('./use-jarvis-outbox', () => ({ useJarvisOutbox: () => world.outbox }))
vi.mock('../hooks/use-mobile-dictation', () => ({
  useMobileDictation: (args: NonNullable<typeof world.dictationArgs>) => {
    world.dictationArgs = args
    return world.dictation
  }
}))

const TARGET = {
  tabId: 'tab',
  terminal: 'term_1',
  agentBusy: false,
  sessionId: 's1',
  transcriptPath: '/t.jsonl'
}

describe('useJarvisConversation', () => {
  const mounted: { renderer?: ReactTestRenderer } = {}
  const seen: ReturnType<typeof useJarvisConversation>[] = []
  let localAnswer: string | null
  const localIntents: JarvisLocalIntentHandler = { handle: vi.fn(async () => localAnswer) }

  function Probe() {
    seen.push(useJarvisConversation({ localIntents, greeting: 'Aquí Jarvis. ¿Qué necesitas?' }))
    return null
  }

  const hook = () => seen.at(-1)!
  async function mount() {
    await act(async () => {
      mounted.renderer = create(createElement(Probe))
    })
    await settle()
  }
  async function settle() {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  function readyDesktop() {
    world.catalogs.pairedHostIds = ['fedora']
    world.catalogs.hosts = [
      {
        host: { id: 'fedora', name: 'Fedora', lastConnected: 1, deviceToken: 'token-1' },
        state: 'connected',
        worktrees: [
          { worktreeId: 'f::brain', displayName: 'jarvis-mobile-brain', isArchived: false }
        ],
        error: null
      }
    ]
    world.host = { client: { id: 'client' }, state: 'connected' }
    world.attach = { phase: 'attached', target: TARGET, error: null, attaching: false }
  }

  beforeEach(() => {
    localAnswer = null
    vi.mocked(localIntents.handle).mockClear()
    world.preferences.preferences = { workspace: null, speechEnabled: true }
    world.preferences.setSpeechEnabled.mockClear()
    world.catalogs = {
      ...world.catalogs,
      hosts: [],
      hostsLoaded: true,
      pairedHostIds: [],
      loading: false,
      error: null
    }
    world.host = { client: null, state: 'disconnected' }
    world.attach = { phase: 'idle', target: null, error: null, attaching: false }
    world.transcript = {
      ...world.transcript,
      transcript: [],
      messages: [],
      settled: true,
      error: null,
      addEcho: vi.fn(() => 'local-1'),
      removeEcho: vi.fn()
    }
    world.dictationSetup = { availability: 'unknown', recheck: vi.fn() }
    world.voice = {
      speaking: false,
      spokenText: null,
      say: vi.fn(),
      sayBeforeActing: vi.fn(async (_text: string) => undefined),
      discard: vi.fn()
    }
    world.outbox = {
      awaitingReply: false,
      sending: false,
      sendToAgent: vi.fn(async () => true),
      forget: vi.fn()
    }
    world.dictation = {
      ...world.dictation,
      status: 'idle',
      isStarting: false,
      isRecording: false,
      isProcessing: false,
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined)
    }
    world.dictationArgs = null
    world.transcriptArgs = null
    world.hostClientArgs = []
    seen.length = 0
  })

  afterEach(() => {
    act(() => mounted.renderer?.unmount())
    mounted.renderer = undefined
  })

  it('asks to pair a desktop when none is paired', async () => {
    await mount()

    expect(hook()).toMatchObject({ setupNeed: 'pair-desktop', connected: false, activity: 'idle' })
    expect(hook().statusText).toBe('Empareja tu escritorio para empezar')
    expect(world.hostClientArgs).toEqual([undefined])
  })

  it('asks to choose a workspace when no desktop has the Jarvis one', async () => {
    world.catalogs.pairedHostIds = ['fedora']
    world.catalogs.hosts = [
      {
        host: { id: 'fedora', name: 'Fedora', lastConnected: 1, deviceToken: 't' },
        state: 'connected',
        worktrees: [{ worktreeId: 'x', displayName: 'main', isArchived: false }],
        error: null
      }
    ]

    await mount()

    expect(hook()).toMatchObject({ setupNeed: 'choose-workspace', connected: false })
    expect(hook().statusText).toBe('Elige desde qué espacio de trabajo habla Jarvis')
  })

  it('picks the Jarvis workspace by itself and connects to its session', async () => {
    readyDesktop()

    await mount()

    expect(world.hostClientArgs).toEqual(['fedora'])
    expect(hook()).toMatchObject({
      setupNeed: null,
      connected: true,
      activity: 'idle',
      speechEnabled: true
    })
    expect(hook().statusText).toBe('¿Qué necesitas?')
    expect(world.transcriptArgs).toMatchObject({
      hostId: 'fedora',
      worktreeId: 'f::brain',
      agent: 'claude',
      sessionId: 's1',
      transcriptPath: '/t.jsonl'
    })
  })

  it('prefers the workspace the owner chose over the automatic pick', async () => {
    readyDesktop()
    world.catalogs.hosts[0]!.worktrees!.push({
      worktreeId: 'f::other',
      displayName: 'otro',
      isArchived: false
    })
    world.preferences.preferences = {
      workspace: { hostId: 'fedora', worktreeId: 'f::other', name: 'otro' },
      speechEnabled: true
    }

    await mount()

    expect(world.transcriptArgs).toMatchObject({ worktreeId: 'f::other' })
  })

  it('shows the offline line as soon as the desktop stops answering', async () => {
    readyDesktop()
    await mount()

    world.host.state = 'reconnecting'
    await act(async () => mounted.renderer?.update(createElement(Probe)))

    expect(hook()).toMatchObject({ connected: false, activity: 'idle' })
    expect(hook().statusText).toBe('Sin conexión con el escritorio')
  })

  it('says it is connecting while the session opens on a connected desktop', async () => {
    readyDesktop()
    world.attach = { phase: 'attaching', target: null, error: null, attaching: true }

    await mount()

    expect(hook().statusText).toBe('Conectando con Jarvis…')
  })

  it('names a failure to open the session, but only once the desktop answered', async () => {
    readyDesktop()
    world.attach = {
      phase: 'failed',
      target: null,
      error:
        'No pude abrir la sesión de Jarvis en el escritorio. Revisa que Claude esté instalado ahí.',
      attaching: false
    }

    await mount()
    expect(hook().statusText).toBe(
      'No pude abrir la sesión de Jarvis en el escritorio. Revisa que Claude esté instalado ahí.'
    )

    world.host.state = 'disconnected'
    await act(async () => mounted.renderer?.update(createElement(Probe)))
    expect(hook().statusText).toBe('Sin conexión con el escritorio')
  })

  // The order says its own confirmation, before it opens another app: the engine hands it the voice
  // and must not repeat the sentence afterwards.
  it('resolves a music order on the phone: shown, given the voice, and never sent to the agent', async () => {
    readyDesktop()
    localAnswer = 'Reproduciendo salsa en YouTube Music.'
    await mount()

    await act(async () => hook().sendText('  ponme música\nde salsa '))
    await settle()

    expect(localIntents.handle).toHaveBeenCalledWith(
      'ponme música de salsa',
      expect.objectContaining({ say: expect.any(Function) })
    )
    expect(world.outbox.sendToAgent).not.toHaveBeenCalled()
    expect(world.transcript.addEcho).toHaveBeenNthCalledWith(1, {
      role: 'user',
      text: 'ponme música de salsa'
    })
    expect(world.transcript.addEcho).toHaveBeenNthCalledWith(2, {
      role: 'assistant',
      text: 'Reproduciendo salsa en YouTube Music.'
    })
    expect(world.voice.say).not.toHaveBeenCalledWith('Reproduciendo salsa en YouTube Music.')
  })

  it('sends everything else to the agent terminal and shows it as the owner message', async () => {
    readyDesktop()
    await mount()

    await act(async () => hook().sendText('¿Cómo van los PRs?'))
    await settle()

    expect(world.outbox.sendToAgent).toHaveBeenCalledWith('¿Cómo van los PRs?')
    expect(world.transcript.addEcho).toHaveBeenCalledTimes(1)
    expect(world.voice.say).not.toHaveBeenCalledWith('¿Cómo van los PRs?')
  })

  it('takes the message back off the conversation when the desktop did not take it', async () => {
    readyDesktop()
    await mount()
    world.outbox.sendToAgent.mockResolvedValue(false)

    await act(async () => hook().sendText('hola'))
    await settle()

    expect(world.transcript.removeEcho).toHaveBeenCalledWith('local-1')
  })

  it('ignores empty text', async () => {
    readyDesktop()
    await mount()

    act(() => hook().sendText('   '))

    expect(localIntents.handle).not.toHaveBeenCalled()
    expect(world.outbox.sendToAgent).not.toHaveBeenCalled()
  })

  it('dictates on press and release, sending what it heard through the same path as the keyboard', async () => {
    readyDesktop()
    await mount()
    expect(world.dictationArgs).toMatchObject({ client: { id: 'client' }, enabled: true })

    world.dictation.isStarting = true
    await act(async () => hook().startListening())
    await act(async () => mounted.renderer?.update(createElement(Probe)))
    expect(hook()).toMatchObject({ activity: 'listening', statusText: 'Te escucho' })
    await act(async () => mounted.renderer?.update(createElement(Probe)))

    world.dictation.isStarting = false
    world.dictation.isRecording = true
    await act(async () => mounted.renderer?.update(createElement(Probe)))
    expect(hook().activity).toBe('listening')

    await act(async () => hook().stopListening())
    world.dictation.isRecording = false
    world.dictation.isProcessing = true
    await act(async () => mounted.renderer?.update(createElement(Probe)))
    expect(hook()).toMatchObject({ activity: 'thinking', statusText: 'Pensando' })

    localAnswer = 'Reproduciendo salsa en YouTube Music.'
    await act(async () => world.dictationArgs!.onTranscript('ponme música de salsa'))
    await settle()

    expect(world.dictation.start).toHaveBeenCalledTimes(1)
    expect(world.dictation.stop).toHaveBeenCalledTimes(1)
    expect(localIntents.handle).toHaveBeenCalledWith(
      'ponme música de salsa',
      expect.objectContaining({ say: expect.any(Function) })
    )
    expect(world.outbox.sendToAgent).not.toHaveBeenCalled()
  })

  it('says it did not understand, and sends nothing, when the dictation hears no words', async () => {
    readyDesktop()
    await mount()

    await act(async () => world.dictationArgs!.onError!(new Error('No speech detected.')))
    await settle()

    expect(hook().statusText).toBe('No te entendí. ¿Me lo repites?')
    expect(world.voice.say).toHaveBeenCalledWith('No te entendí. ¿Me lo repites?')
    expect(world.outbox.sendToAgent).not.toHaveBeenCalled()
  })

  it('turns dictation failures into a line that says what to do', async () => {
    readyDesktop()
    await mount()
    world.dictation.start.mockRejectedValue(new Error('Microphone permission denied'))

    await act(async () => hook().startListening())
    await settle()

    expect(hook().statusText).toBe(
      'Jarvis no tiene permiso para usar el micrófono. Actívalo en los ajustes del teléfono.'
    )
  })

  it('reports dictation switched off on the desktop, whether checked or found while trying', async () => {
    readyDesktop()
    world.dictationSetup.availability = 'off'
    await mount()
    expect(hook().setupNeed).toBe('dictation-off')

    world.dictationSetup.availability = 'unknown'
    await act(async () => mounted.renderer?.update(createElement(Probe)))
    expect(hook().setupNeed).toBeNull()

    await act(async () => world.dictationArgs!.onError!(new Error('voice_dictation_disabled')))
    await settle()
    expect(hook().setupNeed).toBe('dictation-off')
    expect(hook().statusText).toBe(
      'El dictado no está activo en el escritorio. Ábrelo en Orca Lab para hablar con Jarvis.'
    )
  })

  it('keeps the keyboard path usable while dictation is off', async () => {
    readyDesktop()
    world.dictationSetup.availability = 'off'
    await mount()

    await act(async () => hook().sendText('hola'))
    await settle()

    expect(world.outbox.sendToAgent).toHaveBeenCalledWith('hola')
  })

  it('greets once when the session is first connected and idle', async () => {
    readyDesktop()
    world.attach = { ...world.attach, target: { ...TARGET, agentBusy: true } }
    await mount()
    expect(world.voice.say).not.toHaveBeenCalled()

    world.attach = { ...world.attach, target: TARGET }
    await act(async () => mounted.renderer?.update(createElement(Probe)))
    expect(world.voice.say).toHaveBeenCalledWith('Aquí Jarvis. ¿Qué necesitas?')

    world.host.state = 'reconnecting'
    await act(async () => mounted.renderer?.update(createElement(Probe)))
    world.host.state = 'connected'
    await act(async () => mounted.renderer?.update(createElement(Probe)))
    expect(world.voice.say).toHaveBeenCalledTimes(1)
  })

  it('thinks while a sent message waits for the agent, and speaks while the voice reads', async () => {
    readyDesktop()
    await mount()
    world.outbox.awaitingReply = true
    await act(async () => mounted.renderer?.update(createElement(Probe)))
    expect(hook()).toMatchObject({ activity: 'thinking' })

    world.voice.speaking = true
    world.voice.spokenText = 'Van dos en revisión.'
    world.attach = { ...world.attach, target: { ...TARGET, agentBusy: true } }
    await act(async () => mounted.renderer?.update(createElement(Probe)))
    expect(hook()).toMatchObject({ activity: 'speaking' })
    expect(hook().statusText).toBe('Van dos en revisión.')
  })

  it('switches the voice off and on through the preferences', async () => {
    readyDesktop()
    await mount()

    await act(async () => hook().toggleSpeech())

    expect(world.preferences.setSpeechEnabled).toHaveBeenCalledWith(false)
  })

  it('interrupts the reading when told to', async () => {
    readyDesktop()
    await mount()

    act(() => hook().stopSpeaking())

    expect(world.voice.discard).toHaveBeenCalledTimes(1)
  })

  it('shows the conversation the transcript hook builds', async () => {
    readyDesktop()
    const messages: JarvisMessage[] = [
      { id: 'm1', role: 'assistant', text: 'Hola.', streaming: false }
    ]
    world.transcript.messages = messages

    await mount()

    expect(hook().messages).toBe(messages)
  })

  it('names a conversation that cannot be read', async () => {
    readyDesktop()
    world.transcript.error =
      'No pude leer la conversación del escritorio. Vuelve a entrar en un momento.'

    await mount()

    expect(hook().statusText).toBe(
      'No pude leer la conversación del escritorio. Vuelve a entrar en un momento.'
    )
  })
})

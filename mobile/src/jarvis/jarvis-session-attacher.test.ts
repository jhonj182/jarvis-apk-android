import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentStatusEntry } from '../../../src/shared/agent-status-types'
import type { RpcClient } from '../transport/rpc-client'
import { ATTACH_TIMEOUT_REASON } from './jarvis-session-attach'
import {
  createJarvisSessionAttacher,
  type JarvisAttachState,
  type JarvisTabLike
} from './jarvis-session-attacher'

type Frame = { type?: string; tabs?: unknown; message?: string }

function fakeClient(options: { create?: () => Promise<unknown> } = {}) {
  const frames: Frame[] = []
  const listeners: ((frame: unknown) => void)[] = []
  const unsubscribe = vi.fn()
  const subscribe = vi.fn(
    (_method: string, _params: unknown, listener: (frame: unknown) => void) => {
      listeners.push(listener)
      return unsubscribe
    }
  )
  const sendRequest = vi.fn(async () => options.create?.())
  const emit = (frame: Frame) => listeners.forEach((listener) => listener(frame))
  return {
    client: { subscribe, sendRequest } as unknown as RpcClient,
    frames,
    subscribe,
    unsubscribe,
    sendRequest,
    emit
  }
}

const status = (patch: Partial<AgentStatusEntry> = {}): AgentStatusEntry =>
  ({
    state: 'done',
    paneKey: 'pane',
    stateHistory: [],
    prompt: '',
    updatedAt: 0,
    stateStartedAt: 0,
    ...patch
  }) as unknown as AgentStatusEntry

const claudeTab = (patch: Partial<JarvisTabLike> = {}): JarvisTabLike => ({
  type: 'terminal',
  id: 'tab-claude',
  terminal: 'term_claude',
  agentStatus: status({ agentType: 'claude' }),
  ...patch
})
const CREATED = { kind: 'created', terminal: 'term_new', tabId: 'tab-new' }
const OPERATION = '1763164800000-0123456789abcdef0123456789abcdef'

describe('createJarvisSessionAttacher', () => {
  let states: JarvisAttachState[]
  let warn: ReturnType<typeof vi.spyOn>

  const start = (client: RpcClient, options: { timeoutMs?: number } = {}) => {
    states = []
    return createJarvisSessionAttacher({
      client,
      worktreeId: 'repo::brain',
      operationId: OPERATION,
      onChange: (state) => states.push(state),
      createSession: vi.fn(async () => CREATED),
      ...options
    })
  }
  const last = (): JarvisAttachState => states.at(-1)!
  const flush = async () => {
    await Promise.resolve()
    await Promise.resolve()
  }

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })
  afterEach(() => {
    warn.mockRestore()
  })

  it('subscribes once to the tabs of the workspace and attaches to its Claude tab', async () => {
    const fake = fakeClient()
    const attacher = start(fake.client)

    expect(last().phase).toBe('attaching')
    expect(fake.subscribe).toHaveBeenCalledWith(
      'session.tabs.subscribe',
      { worktree: 'id:repo::brain' },
      expect.any(Function)
    )

    fake.emit({ type: 'snapshot', tabs: [{ type: 'markdown' }, claudeTab()] })

    expect(last()).toEqual({
      phase: 'attached',
      target: {
        tabId: 'tab-claude',
        terminal: 'term_claude',
        agentBusy: false,
        agentWaiting: false,
        sessionId: null,
        transcriptPath: null
      },
      error: null
    })
    expect(fake.sendRequest).not.toHaveBeenCalled()
    attacher.stop()
  })

  it('follows the tab: its session id once the agent reports it, and whether it is busy', async () => {
    const fake = fakeClient()
    const attacher = start(fake.client)

    fake.emit({ type: 'snapshot', tabs: [claudeTab()] })
    fake.emit({
      type: 'updated',
      tabs: [
        claudeTab({
          agentStatus: status({
            agentType: 'claude',
            state: 'working',
            providerSession: { key: 'session_id', id: 's1', transcriptPath: '/t.jsonl' }
          })
        })
      ]
    })
    fake.emit({
      type: 'updated',
      tabs: [claudeTab({ agentStatus: status({ agentType: 'claude', state: 'done' }) })]
    })

    expect(states.map((state) => state.target)).toEqual([
      null,
      expect.objectContaining({ agentBusy: false, sessionId: null }),
      expect.objectContaining({ agentBusy: true, sessionId: 's1', transcriptPath: '/t.jsonl' }),
      expect.objectContaining({ agentBusy: false, sessionId: null })
    ])
    expect(states.every((state) => state.phase === 'attached' || state.phase === 'attaching')).toBe(
      true
    )
    attacher.stop()
  })

  it('opens the session itself when the workspace has no Claude tab', async () => {
    const createSession = vi.fn(async () => CREATED)
    const fake = fakeClient()
    const attacher = start(fake.client, { createSession })

    fake.emit({
      type: 'snapshot',
      tabs: [{ type: 'terminal', id: 'shell', terminal: 'term_shell' }]
    })
    await flush()

    expect(createSession).toHaveBeenCalledTimes(1)
    expect(createSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ worktreeId: 'repo::brain' })
    )
    expect(last()).toEqual({
      phase: 'attached',
      target: {
        tabId: 'tab-new',
        terminal: 'term_new',
        agentBusy: false,
        agentWaiting: false,
        sessionId: null,
        transcriptPath: null
      },
      error: null
    })

    fake.emit({
      type: 'updated',
      tabs: [{ type: 'terminal', id: 'tab-new', terminal: 'term_new' }, claudeTab()]
    })
    expect(last().target?.tabId).toBe('tab-new')
    expect(createSession).toHaveBeenCalledTimes(1)
    attacher.stop()
  })

  it('does not open a second session while the first is still being created', async () => {
    let finishCreate: (result: unknown) => void = () => undefined
    const createSession = vi.fn(() => new Promise<unknown>((resolve) => (finishCreate = resolve)))
    const fake = fakeClient()
    const attacher = start(fake.client, { createSession })

    fake.emit({ type: 'snapshot', tabs: [] })
    fake.emit({ type: 'updated', tabs: [] })
    expect(createSession).toHaveBeenCalledTimes(1)

    finishCreate(CREATED)
    await flush()
    fake.emit({ type: 'updated', tabs: [] })
    expect(createSession).toHaveBeenCalledTimes(1)
    expect(last().phase).toBe('attached')
    attacher.stop()
  })

  it('fails, in Spanish, when the tab stream stays silent', () => {
    vi.useFakeTimers()
    try {
      const fake = fakeClient()
      const attacher = start(fake.client, { timeoutMs: 5000 })

      vi.advanceTimersByTime(4999)
      expect(last().phase).toBe('attaching')
      vi.advanceTimersByTime(1)

      expect(last()).toEqual({
        phase: 'failed',
        target: null,
        error:
          'El escritorio no respondió al abrir la sesión de Jarvis. Revisa que Orca Lab esté abierto.'
      })
      expect(fake.unsubscribe).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith(expect.any(String), ATTACH_TIMEOUT_REASON)
      attacher.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not time out once the stream has answered', () => {
    vi.useFakeTimers()
    try {
      const fake = fakeClient()
      const attacher = start(fake.client, { timeoutMs: 5000 })

      fake.emit({ type: 'snapshot', tabs: [claudeTab()] })
      vi.advanceTimersByTime(60_000)

      expect(last().phase).toBe('attached')
      attacher.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails when the stream itself reports an error', () => {
    const fake = fakeClient()
    const attacher = start(fake.client)

    fake.emit({ type: 'error', message: 'worktree not found' })

    expect(last()).toEqual({
      phase: 'failed',
      target: null,
      error:
        'No pude abrir la sesión de Jarvis en el escritorio. Revisa que Claude esté instalado ahí.'
    })
    expect(fake.sendRequest).not.toHaveBeenCalled()
    attacher.stop()
  })

  it('fails when the desktop refuses to open the session', async () => {
    const createSession = vi.fn(async () => ({
      kind: 'failed' as const,
      reason: 'agent_session_legacy_required'
    }))
    const fake = fakeClient()
    const attacher = start(fake.client, { createSession })

    fake.emit({ type: 'snapshot', tabs: [] })
    await flush()

    expect(last()).toMatchObject({
      phase: 'failed',
      error: expect.stringContaining('No pude abrir la sesión')
    })
    expect(warn).toHaveBeenCalledWith(expect.any(String), 'agent_session_legacy_required')
    attacher.stop()
  })

  it('opens a new session when the tab it was attached to is closed on the desktop', async () => {
    const createSession = vi.fn(async () => CREATED)
    const fake = fakeClient()
    const attacher = start(fake.client, { createSession })

    fake.emit({ type: 'snapshot', tabs: [claudeTab()] })
    fake.emit({ type: 'updated', tabs: [] })
    await flush()

    expect(createSession).toHaveBeenCalledTimes(1)
    expect(last().target?.terminal).toBe('term_new')
    attacher.stop()
  })

  // Why: the session Jarvis opens is the usual one. If the owner closes that tab on the desktop,
  // every message would then fail, with no way back short of leaving the screen.
  it('opens a new session, under a new id, when the session it opened is closed on the desktop', async () => {
    const createSession = vi.fn(async () => CREATED)
    const NEXT = '1763164800001-0123456789abcdef0123456789abcdef'
    const nextOperationId = vi.fn(() => NEXT)
    const fake = fakeClient()
    const attacher = start(fake.client, { createSession, nextOperationId })

    fake.emit({ type: 'snapshot', tabs: [] })
    await flush()
    // The agent comes up in the new tab, so the stream shows it as a Claude tab.
    fake.emit({ type: 'updated', tabs: [claudeTab({ id: 'tab-new', terminal: 'term_new' })] })
    expect(last().target?.terminal).toBe('term_new')
    expect(createSession).toHaveBeenCalledTimes(1)

    fake.emit({ type: 'updated', tabs: [] })
    await flush()

    expect(createSession).toHaveBeenCalledTimes(2)
    expect(createSession).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ worktreeId: 'repo::brain', operationId: NEXT })
    )
    expect(last().phase).toBe('attached')
    attacher.stop()
  })

  // Why: the screens are mounted before the owner has unlocked. Finding a session that already
  // exists is reading; opening one is acting on the desktop, and that waits for the unlock.
  it('opens nothing until it may, and then opens it without waiting for another frame', async () => {
    const createSession = vi.fn(async () => CREATED)
    const fake = fakeClient()
    const attacher = start(fake.client, { createSession, mayCreate: false })

    fake.emit({ type: 'snapshot', tabs: [] })
    await flush()
    expect(createSession).not.toHaveBeenCalled()
    expect(last().phase).toBe('attaching')

    attacher.setMayCreate(true)
    await flush()

    expect(createSession).toHaveBeenCalledTimes(1)
    expect(last().phase).toBe('attached')
    attacher.stop()
  })

  it('still attaches to a session that already exists while it may not open one', async () => {
    const createSession = vi.fn(async () => CREATED)
    const fake = fakeClient()
    const attacher = start(fake.client, { createSession, mayCreate: false })

    fake.emit({ type: 'snapshot', tabs: [claudeTab()] })

    expect(last().phase).toBe('attached')
    expect(createSession).not.toHaveBeenCalled()
    attacher.stop()
  })

  it('ignores everything that arrives after it is stopped', async () => {
    let finishCreate: (result: unknown) => void = () => undefined
    const createSession = vi.fn(() => new Promise<unknown>((resolve) => (finishCreate = resolve)))
    const fake = fakeClient()
    const attacher = start(fake.client, { createSession })

    fake.emit({ type: 'snapshot', tabs: [] })
    attacher.stop()
    const seen = states.length

    fake.emit({ type: 'updated', tabs: [claudeTab()] })
    finishCreate({ kind: 'failed', reason: 'late' })
    await flush()

    expect(states).toHaveLength(seen)
    expect(fake.unsubscribe).toHaveBeenCalledTimes(1)
  })
})

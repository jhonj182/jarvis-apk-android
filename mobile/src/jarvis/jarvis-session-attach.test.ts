import { describe, expect, it, vi } from 'vitest'
import type { AgentStatusEntry } from '../../../src/shared/agent-status-types'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcResponse } from '../transport/types'
import {
  JARVIS_AGENT,
  createJarvisAgentSession,
  findJarvisAgentTab,
  isJarvisWorktreeName,
  jarvisAttachErrorText,
  pickJarvisWorktree,
  readJarvisWorktrees,
  resolveJarvisWorkspace,
  type JarvisHostCatalog,
  type JarvisTabLike,
  type JarvisWorktreeSummary
} from './jarvis-session-attach'

const worktree = (
  worktreeId: string,
  displayName: string,
  isArchived = false
): JarvisWorktreeSummary => ({
  worktreeId,
  displayName,
  isArchived
})
const catalog = (
  hostId: string,
  lastConnected: number,
  worktrees: readonly JarvisWorktreeSummary[] | null
): JarvisHostCatalog => ({ hostId, hostName: hostId.toUpperCase(), lastConnected, worktrees })

const status = (patch: Partial<AgentStatusEntry> = {}): AgentStatusEntry =>
  ({
    state: 'done',
    prompt: '',
    updatedAt: 0,
    stateStartedAt: 0,
    paneKey: 'pane',
    stateHistory: [],
    effort: null,
    ...patch
  }) as unknown as AgentStatusEntry

const tab = (patch: Partial<JarvisTabLike> = {}): JarvisTabLike => ({
  type: 'terminal',
  id: 'tab-1',
  terminal: 'term_1',
  ...patch
})

describe('isJarvisWorktreeName', () => {
  it.each([
    ['jarvis-mobile-brain', true],
    ['Jarvis-Mobile', true],
    ['orca jarvis-mobile-brain', true],
    ['jarvis', false],
    ['jarvis-movil', false],
    ['mobile', false]
  ])('%s → %s', (name, expected) => {
    expect(isJarvisWorktreeName(name)).toBe(expected)
  })
})

describe('pickJarvisWorktree', () => {
  const brain = worktree('repo::brain', 'jarvis-mobile-brain')
  const other = worktree('repo::main', 'main')

  it('takes the Jarvis workspace of the host that connected last', () => {
    const picked = pickJarvisWorktree([
      catalog('mac', 10, [brain]),
      catalog('fedora', 20, [worktree('f::brain', 'jarvis-mobile-brain')]),
      catalog('asleep', 99, null)
    ])

    expect(picked).toEqual({
      hostId: 'fedora',
      worktreeId: 'f::brain',
      name: 'jarvis-mobile-brain'
    })
  })

  it('skips archived workspaces and hosts whose catalog is not loaded', () => {
    expect(
      pickJarvisWorktree([
        catalog('a', 20, [worktree('x', 'jarvis-mobile-old', true)]),
        catalog('b', 10, [brain, other])
      ])
    ).toEqual({ hostId: 'b', worktreeId: 'repo::brain', name: 'jarvis-mobile-brain' })
  })

  it('finds nothing when no connected host has one', () => {
    expect(pickJarvisWorktree([catalog('a', 1, [other]), catalog('b', 2, [])])).toBeNull()
    expect(pickJarvisWorktree([])).toBeNull()
  })
})

describe('resolveJarvisWorkspace', () => {
  const saved = { hostId: 'fedora', worktreeId: 'f::brain', name: 'jarvis-mobile-brain' }
  const brain = worktree('f::brain', 'jarvis-mobile-brain')
  const base = { hostsLoaded: true, pairedHostIds: ['fedora'] }

  it('asks to pair a desktop when none is paired', () => {
    expect(
      resolveJarvisWorkspace({ ...base, pairedHostIds: [], preference: null, catalogs: [] })
    ).toEqual({
      workspace: null,
      setupNeed: 'pair-desktop'
    })
  })

  it('waits while the paired desktops are still being read', () => {
    expect(
      resolveJarvisWorkspace({
        ...base,
        hostsLoaded: false,
        pairedHostIds: [],
        preference: null,
        catalogs: []
      })
    ).toEqual({ workspace: null, setupNeed: null })
  })

  it('uses the saved workspace, even while its desktop is offline', () => {
    expect(
      resolveJarvisWorkspace({ ...base, preference: saved, catalogs: [catalog('fedora', 1, null)] })
    ).toEqual({ workspace: saved, setupNeed: null })
  })

  it('asks to pair again when the saved desktop is no longer paired', () => {
    expect(
      resolveJarvisWorkspace({ ...base, pairedHostIds: ['mac'], preference: saved, catalogs: [] })
    ).toEqual({ workspace: null, setupNeed: 'pair-desktop' })
  })

  it('falls back to the automatic pick when the saved workspace is gone from its desktop', () => {
    const other = worktree('f::other', 'jarvis-mobile-brain')
    expect(
      resolveJarvisWorkspace({
        ...base,
        preference: saved,
        catalogs: [catalog('fedora', 1, [other])]
      })
    ).toEqual({
      workspace: { hostId: 'fedora', worktreeId: 'f::other', name: 'jarvis-mobile-brain' },
      setupNeed: null
    })
  })

  it('asks the owner to choose when nothing can be picked automatically', () => {
    expect(
      resolveJarvisWorkspace({
        ...base,
        preference: null,
        catalogs: [catalog('fedora', 1, [worktree('x', 'main')])]
      })
    ).toEqual({ workspace: null, setupNeed: 'choose-workspace' })
    expect(
      resolveJarvisWorkspace({ ...base, preference: null, catalogs: [catalog('fedora', 1, null)] })
    ).toEqual({
      workspace: null,
      setupNeed: 'choose-workspace'
    })
  })

  it('picks the Jarvis workspace automatically when nothing was saved', () => {
    expect(
      resolveJarvisWorkspace({
        ...base,
        preference: null,
        catalogs: [catalog('fedora', 1, [brain])]
      })
    ).toEqual({
      workspace: { hostId: 'fedora', worktreeId: 'f::brain', name: 'jarvis-mobile-brain' },
      setupNeed: null
    })
  })
})

describe('findJarvisAgentTab', () => {
  it('finds the terminal that runs the Claude agent', () => {
    const claude = tab({
      id: 'tab-2',
      terminal: 'term_2',
      agentStatus: status({
        agentType: 'claude',
        providerSession: { key: 'session_id', id: 's1', transcriptPath: '/t.jsonl' }
      })
    })
    const tabs = [
      tab({ id: 'shell', terminal: 'term_0' }),
      tab({ id: 'codex', terminal: 'term_x', agentStatus: status({ agentType: 'codex' }) }),
      claude
    ]

    expect(findJarvisAgentTab(tabs)).toEqual({
      tabId: 'tab-2',
      terminal: 'term_2',
      agentBusy: false,
      agentWaiting: false,
      sessionId: 's1',
      transcriptPath: '/t.jsonl'
    })
  })

  it('reports the agent as busy while it works', () => {
    const claude = tab({ agentStatus: status({ agentType: 'claude', state: 'working' }) })

    expect(findJarvisAgentTab([claude])?.agentBusy).toBe(true)
  })

  // Why: Claude asks for permission through a dialog on the desktop, and that reaches the phone as
  // `waiting`. A message sent into that dialog answers it instead of reaching the agent.
  it.each(['waiting', 'blocked'] as const)(
    'reports the agent as waiting, not busy, while its state is %s',
    (state) => {
      const claude = tab({ agentStatus: status({ agentType: 'claude', state }) })

      expect(findJarvisAgentTab([claude])).toMatchObject({ agentBusy: false, agentWaiting: true })
    }
  )

  it('accepts a Claude tab that has not reported a session yet', () => {
    const fresh = tab({ launchAgent: 'claude' })

    expect(findJarvisAgentTab([fresh])).toMatchObject({
      tabId: 'tab-1',
      terminal: 'term_1',
      sessionId: null
    })
  })

  it('ignores other agents, non-terminal tabs and tabs without a terminal', () => {
    expect(
      findJarvisAgentTab([
        tab({ type: 'markdown' }),
        tab({ terminal: null, launchAgent: 'claude' }),
        tab({ launchAgent: 'codex' }),
        tab({ launchAgent: 'claude-zai' })
      ])
    ).toBeNull()
  })

  it('prefers a tab with a live agent, then the active one', () => {
    const idle = tab({ id: 'idle', terminal: 'term_i', launchAgent: 'claude' })
    const live = tab({
      id: 'live',
      terminal: 'term_l',
      agentStatus: status({ agentType: 'claude' })
    })
    const active = tab({ id: 'active', terminal: 'term_a', isActive: true, launchAgent: 'claude' })

    expect(findJarvisAgentTab([idle, active])?.tabId).toBe('active')
    expect(findJarvisAgentTab([active, live])?.tabId).toBe('live')
  })

  it('follows the tab the phone itself created', () => {
    const created = tab({ id: 'new', terminal: 'term_new', launchAgent: 'claude' })
    const live = tab({
      id: 'live',
      terminal: 'term_l',
      agentStatus: status({ agentType: 'claude' })
    })

    expect(findJarvisAgentTab([live, created], { tabId: 'new', terminal: 'term_new' })?.tabId).toBe(
      'new'
    )
    expect(findJarvisAgentTab([live], { tabId: 'new', terminal: 'term_new' })).toBeNull()
  })
})

describe('readJarvisWorktrees', () => {
  const ok = (result: unknown): RpcResponse =>
    ({ id: 'x', ok: true, result, _meta: { runtimeId: 'rt' } }) as RpcResponse

  it('reads the whole catalog of a desktop', async () => {
    const sendRequest = vi.fn(async () =>
      ok({
        worktrees: [{ worktreeId: 'a', displayName: 'A', path: '/a' }, { worktreeId: 'b' }],
        totalCount: 2
      })
    )

    await expect(readJarvisWorktrees({ sendRequest } as unknown as RpcClient)).resolves.toEqual([
      { worktreeId: 'a', displayName: 'A', path: '/a', isArchived: false },
      { worktreeId: 'b', displayName: '', path: '', isArchived: false }
    ])
    expect(sendRequest).toHaveBeenCalledWith(
      'worktree.ps',
      expect.objectContaining({ limit: expect.any(Number) })
    )
  })

  it('rejects when the desktop refuses', async () => {
    const sendRequest = vi.fn(async () => ({
      id: 'x',
      ok: false,
      error: { code: 'internal', message: 'catalog unavailable' },
      _meta: { runtimeId: 'rt' }
    })) as unknown as RpcClient['sendRequest']

    await expect(readJarvisWorktrees({ sendRequest } as unknown as RpcClient)).rejects.toThrow(
      'catalog unavailable'
    )
  })
})

describe('createJarvisAgentSession', () => {
  const ok = (result: unknown): RpcResponse =>
    ({ id: 'x', ok: true, result, _meta: { runtimeId: 'rt' } }) as RpcResponse
  const failed = (message: string): RpcResponse =>
    ({
      id: 'x',
      ok: false,
      error: { code: 'internal', message },
      _meta: { runtimeId: 'rt' }
    }) as RpcResponse
  const operationId = '1763164800000-0123456789abcdef0123456789abcdef'

  function clientAnswering(answer: RpcResponse | Error) {
    const sendRequest = vi.fn(async () => {
      if (answer instanceof Error) {
        throw answer
      }
      return answer
    })
    return { client: { sendRequest } as unknown as RpcClient, sendRequest }
  }

  it("opens a Claude session on the desktop's selected account, without a prompt", async () => {
    const { client, sendRequest } = clientAnswering(
      ok({
        terminal: { handle: 'term_new', tabId: 'tab-new', worktreeId: 'f::brain' },
        disposition: 'created'
      })
    )

    await expect(
      createJarvisAgentSession(client, { worktreeId: 'f::brain', operationId })
    ).resolves.toEqual({ kind: 'created', terminal: 'term_new', tabId: 'tab-new' })

    expect(sendRequest).toHaveBeenCalledWith(
      'terminal.createAgentSession',
      { clientOperationId: operationId, worktree: 'id:f::brain', agent: JARVIS_AGENT },
      { timeoutMs: expect.any(Number) }
    )
  })

  it('reports why the desktop could not open it', async () => {
    const refused = clientAnswering(failed('agent_session_legacy_required'))
    await expect(
      createJarvisAgentSession(refused.client, { worktreeId: 'f::brain', operationId })
    ).resolves.toEqual({ kind: 'failed', reason: 'agent_session_legacy_required' })

    const dropped = clientAnswering(new Error('Connection closed'))
    await expect(
      createJarvisAgentSession(dropped.client, { worktreeId: 'f::brain', operationId })
    ).resolves.toEqual({ kind: 'failed', reason: 'Connection closed' })
  })
})

describe('jarvisAttachErrorText', () => {
  it('says what failed and what to do', () => {
    expect(jarvisAttachErrorText('timeout')).toBe(
      'El escritorio no respondió al abrir la sesión de Jarvis. Revisa que Orca Lab esté abierto.'
    )
    expect(jarvisAttachErrorText('agent_session_legacy_required')).toBe(
      'No pude abrir la sesión de Jarvis en el escritorio. Revisa que Claude esté instalado ahí.'
    )
  })
})

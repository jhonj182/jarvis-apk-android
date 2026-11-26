import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostProfile } from '../transport/types'
import type { JarvisWorktreeSummary } from './jarvis-session-attach'
import { useJarvisHostWorktrees } from './use-jarvis-host-worktrees'

const transport = vi.hoisted(() => ({
  loadHosts: vi.fn<() => Promise<HostProfile[]>>(),
  useAllHostClients: vi.fn<(hostIds: string[]) => unknown[]>()
}))

vi.mock('../transport/host-store', () => ({ loadHosts: transport.loadHosts }))
vi.mock('../transport/use-all-host-clients', () => ({
  useAllHostClients: transport.useAllHostClients
}))

const BRAIN: JarvisWorktreeSummary = {
  worktreeId: 'f::brain',
  displayName: 'jarvis-mobile-brain',
  path: '',
  isArchived: false
}

const host = (id: string, name = id): HostProfile => ({
  id,
  name,
  endpoint: 'wss://host',
  deviceToken: `token-${id}`,
  publicKeyB64: 'key',
  lastConnected: 1
})
const entry = (hostId: string, state = 'connected', connection: object = {}) => ({
  hostId,
  client: connection,
  state,
  path: 'direct'
})

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('useJarvisHostWorktrees', () => {
  const mounted: { renderer?: ReactTestRenderer } = {}
  const seen: ReturnType<typeof useJarvisHostWorktrees>[] = []
  const readWorktrees = vi.fn<(connection: never) => Promise<JarvisWorktreeSummary[]>>()

  function Probe() {
    seen.push(useJarvisHostWorktrees({ readWorktrees }))
    return null
  }

  const hook = () => seen.at(-1)!
  const rerender = async () => {
    await act(async () => {
      mounted.renderer?.update(createElement(Probe))
    })
    await settle()
  }
  async function settle() {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }
  async function mount(): Promise<void> {
    await act(async () => {
      mounted.renderer = create(createElement(Probe))
    })
    await settle()
  }

  beforeEach(() => {
    readWorktrees.mockReset().mockResolvedValue([BRAIN])
    transport.loadHosts
      .mockReset()
      .mockResolvedValue([host('fedora', 'Fedora'), host('mac', 'MacBook')])
    transport.useAllHostClients.mockReset().mockReturnValue([])
    seen.length = 0
  })

  afterEach(() => {
    act(() => mounted.renderer?.unmount())
    mounted.renderer = undefined
  })

  it('reads the paired desktops once and asks only the connected ones for their workspaces', async () => {
    const fedora = {}
    transport.useAllHostClients.mockReturnValue([
      entry('fedora', 'connected', fedora),
      entry('mac', 'disconnected')
    ])

    await mount()

    expect(transport.loadHosts).toHaveBeenCalledTimes(1)
    expect(readWorktrees).toHaveBeenCalledTimes(1)
    expect(readWorktrees).toHaveBeenCalledWith(fedora)
    expect(
      hook().hosts.map((item) => [item.host.name, item.state, item.worktrees, item.error])
    ).toEqual([
      ['Fedora', 'connected', [BRAIN], null],
      ['MacBook', 'disconnected', null, null]
    ])
    expect(hook()).toMatchObject({
      hostsLoaded: true,
      loading: false,
      error: null,
      pairedHostIds: ['fedora', 'mac']
    })
  })

  it('is still loading until the desktop list has been read', async () => {
    const listed = deferred<HostProfile[]>()
    transport.loadHosts.mockReturnValue(listed.promise)
    await act(async () => {
      mounted.renderer = create(createElement(Probe))
    })

    expect(hook()).toMatchObject({ hostsLoaded: false, loading: true, hosts: [] })

    await act(async () => listed.resolve([host('fedora')]))
    expect(hook()).toMatchObject({ hostsLoaded: true, loading: false })
  })

  it('asks a desktop once it connects, and only once while it stays connected', async () => {
    const fedora = {}
    transport.useAllHostClients.mockReturnValue([entry('fedora', 'reconnecting', fedora)])
    await mount()
    expect(readWorktrees).not.toHaveBeenCalled()

    transport.useAllHostClients.mockReturnValue([entry('fedora', 'connected', fedora)])
    await rerender()
    await rerender()

    expect(readWorktrees).toHaveBeenCalledTimes(1)
  })

  it('reads again when the desktop comes back on a new connection', async () => {
    const first = {}
    const second = {}
    transport.useAllHostClients.mockReturnValue([entry('fedora', 'connected', first)])
    await mount()

    transport.useAllHostClients.mockReturnValue([entry('fedora', 'connected', second)])
    await rerender()

    expect(readWorktrees).toHaveBeenCalledTimes(2)
    expect(readWorktrees).toHaveBeenLastCalledWith(second)
  })

  it('reads everything again on refresh', async () => {
    transport.useAllHostClients.mockReturnValue([entry('fedora', 'connected', {})])
    await mount()

    await act(async () => hook().refresh())
    await settle()

    expect(transport.loadHosts).toHaveBeenCalledTimes(2)
    expect(readWorktrees).toHaveBeenCalledTimes(2)
  })

  it('keeps the last good list when a later read fails, and names the failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    transport.useAllHostClients.mockReturnValue([entry('fedora', 'connected', {})])
    await mount()
    readWorktrees.mockRejectedValue(new Error('catalog unavailable'))

    await act(async () => hook().refresh())
    await settle()

    expect(hook().hosts[0]).toMatchObject({ worktrees: [BRAIN], error: 'catalog unavailable' })
    expect(hook().loading).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('ignores a read that finishes after the connection was replaced', async () => {
    const slow = deferred<JarvisWorktreeSummary[]>()
    const OLD: JarvisWorktreeSummary = {
      worktreeId: 'old',
      displayName: 'old',
      path: '',
      isArchived: false
    }
    readWorktrees.mockImplementationOnce(() => slow.promise).mockResolvedValueOnce([BRAIN])
    transport.useAllHostClients.mockReturnValue([entry('fedora', 'connected', {})])
    await act(async () => {
      mounted.renderer = create(createElement(Probe))
    })
    await settle()

    transport.useAllHostClients.mockReturnValue([entry('fedora', 'connected', {})])
    await rerender()
    await act(async () => slow.resolve([OLD]))

    expect(hook().hosts[0]?.worktrees).toEqual([BRAIN])
  })

  it('says so and keeps waiting when the desktop list cannot be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    transport.loadHosts.mockRejectedValue(new Error('storage unavailable'))
    await mount()

    expect(hook()).toMatchObject({
      hostsLoaded: false,
      loading: false,
      hosts: [],
      error: 'No pude leer los escritorios emparejados. Vuelve a intentarlo.'
    })
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('does not start the same read again when the connection list changes identity mid-read', async () => {
    const slow = deferred<JarvisWorktreeSummary[]>()
    readWorktrees.mockImplementation(() => slow.promise)
    const connection = {}
    // Why: a hook upstream may hand out a fresh array every render; that must not multiply requests.
    transport.useAllHostClients.mockImplementation(() => [entry('fedora', 'connected', connection)])
    await act(async () => {
      mounted.renderer = create(createElement(Probe))
    })
    await settle()
    await rerender()
    await rerender()

    expect(readWorktrees).toHaveBeenCalledTimes(1)

    await act(async () => slow.resolve([BRAIN]))
    await settle()
    expect(hook().hosts[0]?.worktrees).toEqual([BRAIN])
  })

  it('hands out the same list between renders when nothing changed', async () => {
    transport.useAllHostClients.mockReturnValue([entry('fedora', 'connected', {})])
    await mount()
    const before = hook().hosts

    await rerender()

    expect(hook().hosts).toBe(before)
  })
})

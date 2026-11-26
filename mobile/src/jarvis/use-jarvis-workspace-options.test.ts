import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HostProfile } from '../transport/types'
import type { JarvisWorkspaceOption } from './jarvis-contract'
import type { JarvisHostCatalogs, JarvisHostWorktrees } from './use-jarvis-host-worktrees'
import {
  NO_DESKTOP_CONNECTED_TEXT,
  WORKSPACES_UNREADABLE_TEXT,
  jarvisWorkspaceOptions,
  jarvisWorkspaceOptionsError,
  useJarvisWorkspaceOptions
} from './use-jarvis-workspace-options'

const catalogs = vi.hoisted(() => ({ current: null as unknown }))

vi.mock('./use-jarvis-host-worktrees', () => ({
  useJarvisHostWorktrees: () => catalogs.current
}))

const host = (id: string, name = id): HostProfile => ({
  id,
  name,
  endpoint: 'wss://host',
  deviceToken: 'token',
  publicKeyB64: 'key',
  lastConnected: 1
})
const row = (
  patch: Partial<JarvisHostWorktrees> & Pick<JarvisHostWorktrees, 'host' | 'state'>
): JarvisHostWorktrees => ({
  worktrees: null,
  error: null,
  ...patch
})
const worktree = (worktreeId: string, displayName: string, isArchived = false) => ({
  worktreeId,
  displayName,
  path: '',
  isArchived
})
const whole = (patch: Partial<JarvisHostCatalogs>): JarvisHostCatalogs => ({
  hosts: [],
  hostsLoaded: true,
  pairedHostIds: [],
  loading: false,
  error: null,
  refresh: () => undefined,
  ...patch
})

describe('jarvisWorkspaceOptions', () => {
  it('lists every workspace of every desktop that answered, with its desktop name', () => {
    const options = jarvisWorkspaceOptions([
      row({
        host: host('fedora', 'Fedora'),
        state: 'connected',
        worktrees: [worktree('f1', 'jarvis-mobile-brain'), worktree('f2', 'main')]
      }),
      row({
        host: host('mac', 'MacBook'),
        state: 'connected',
        worktrees: [worktree('m1', 'portal')]
      }),
      row({ host: host('off', 'Apagado'), state: 'disconnected' })
    ])

    expect(options).toEqual([
      { hostId: 'fedora', hostName: 'Fedora', worktreeId: 'f1', name: 'jarvis-mobile-brain' },
      { hostId: 'fedora', hostName: 'Fedora', worktreeId: 'f2', name: 'main' },
      { hostId: 'mac', hostName: 'MacBook', worktreeId: 'm1', name: 'portal' }
    ])
  })

  it('hides archived workspaces', () => {
    expect(
      jarvisWorkspaceOptions([
        row({
          host: host('fedora'),
          state: 'connected',
          worktrees: [worktree('old', 'jarvis-mobile-old', true), worktree('new', 'new')]
        })
      ]).map((option: JarvisWorkspaceOption) => option.worktreeId)
    ).toEqual(['new'])
  })
})

describe('jarvisWorkspaceOptionsError', () => {
  it.each([
    [
      'nothing to report',
      whole({ hosts: [row({ host: host('a'), state: 'connected', worktrees: [] })] }),
      null
    ],
    ['no desktop is paired', whole({}), null],
    ['still loading', whole({ loading: true }), null],
    ['desktops not read yet', whole({ hostsLoaded: false }), null],
    [
      'the paired desktops could not be read',
      whole({
        hostsLoaded: false,
        error: 'No pude leer los escritorios emparejados. Vuelve a intentarlo.'
      }),
      'No pude leer los escritorios emparejados. Vuelve a intentarlo.'
    ],
    [
      'no desktop is connected',
      whole({ pairedHostIds: ['a'], hosts: [row({ host: host('a'), state: 'reconnecting' })] }),
      NO_DESKTOP_CONNECTED_TEXT
    ],
    [
      'the connected desktop did not answer',
      whole({
        pairedHostIds: ['a'],
        hosts: [
          row({
            host: host('a'),
            state: 'connected',
            worktrees: null,
            error: 'catalog unavailable'
          })
        ]
      }),
      WORKSPACES_UNREADABLE_TEXT
    ],
    [
      'one of two desktops answered',
      whole({
        pairedHostIds: ['a', 'b'],
        hosts: [
          row({ host: host('a'), state: 'connected', worktrees: null, error: 'x' }),
          row({ host: host('b'), state: 'connected', worktrees: [] })
        ]
      }),
      null
    ]
  ])('%s → %s', (_name, value, expected) => {
    expect(jarvisWorkspaceOptionsError(value)).toBe(expected)
  })
})

describe('useJarvisWorkspaceOptions', () => {
  const mounted: { renderer?: ReactTestRenderer } = {}
  const seen: ReturnType<typeof useJarvisWorkspaceOptions>[] = []

  function Probe() {
    seen.push(useJarvisWorkspaceOptions())
    return null
  }

  afterEach(() => {
    act(() => mounted.renderer?.unmount())
    mounted.renderer = undefined
    catalogs.current = null
  })

  it('returns the options, the loading flag, the error line and the refresh of the catalogs', async () => {
    const refresh = vi.fn()
    catalogs.current = whole({
      hosts: [
        row({
          host: host('fedora', 'Fedora'),
          state: 'connected',
          worktrees: [worktree('f1', 'jarvis-mobile-brain')]
        })
      ],
      loading: true
    })
    await act(async () => {
      mounted.renderer = create(createElement(Probe))
    })

    expect(seen.at(-1)).toEqual({
      options: [
        { hostId: 'fedora', hostName: 'Fedora', worktreeId: 'f1', name: 'jarvis-mobile-brain' }
      ],
      loading: true,
      error: null,
      refresh: expect.any(Function)
    })

    catalogs.current = whole({ pairedHostIds: ['x'], refresh })
    await act(async () => mounted.renderer?.update(createElement(Probe)))

    expect(seen.at(-1)).toEqual({
      options: [],
      loading: false,
      error: NO_DESKTOP_CONNECTED_TEXT,
      refresh
    })
  })
})

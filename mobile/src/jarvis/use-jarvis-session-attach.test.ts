import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import {
  ATTACH_IDLE,
  createJarvisSessionAttacher,
  type JarvisAttachState
} from './jarvis-session-attacher'
import { ATTACH_RETRY_DELAYS_MS, useJarvisSessionAttach } from './use-jarvis-session-attach'

type AttacherDeps = Parameters<typeof createJarvisSessionAttacher>[0]
type Session = ReturnType<typeof createJarvisSessionAttacher>

function attacherStub() {
  const sessions: { deps: AttacherDeps; stop: vi.fn; setMayCreate: vi.fn }[] = []
  const attacher = vi.fn((deps: AttacherDeps): Session => {
    const stop = vi.fn()
    const setMayCreate = vi.fn()
    sessions.push({ deps, stop, setMayCreate })
    deps.onChange({ phase: 'attaching', target: null, error: null })
    return { stop, setMayCreate }
  })
  const publish = (index: number, state: JarvisAttachState) => sessions[index]?.deps.onChange(state)
  const last = () => sessions.at(-1)!
  return { attacher, sessions, publish, last }
}

describe('useJarvisSessionAttach', () => {
  const mounted: { renderer?: ReactTestRenderer } = {}
  const client = {} as RpcClient
  const seen: ReturnType<typeof useJarvisSessionAttach>[] = []
  let stub: ReturnType<typeof attacherStub>

  type ProbeProps = {
    hostState: ConnectionState
    worktreeId: string | null
    mayCreate?: boolean
  }

  function Probe({ hostState, worktreeId, mayCreate }: ProbeProps) {
    seen.push(
      useJarvisSessionAttach({ client, hostState, worktreeId, mayCreate, attacher: stub.attacher })
    )
    return null
  }

  const hook = () => seen.at(-1)!
  const render = (hostState: ConnectionState, worktreeId: string | null, mayCreate?: boolean) =>
    act(async () => {
      mounted.renderer?.update(createElement(Probe, { hostState, worktreeId, mayCreate }))
    })

  beforeEach(() => {
    stub = attacherStub()
    seen.length = 0
    vi.useFakeTimers()
  })

  afterEach(() => {
    act(() => mounted.renderer?.unmount())
    mounted.renderer = undefined
    vi.useRealTimers()
  })

  async function mount(hostState: ConnectionState, worktreeId: string | null, mayCreate?: boolean) {
    await act(async () => {
      mounted.renderer = create(createElement(Probe, { hostState, worktreeId, mayCreate }))
    })
  }

  // Why: the screens are mounted before the owner has unlocked, and the unlock must neither
  // restart the attach nor wait for the desktop to speak again.
  it('tells the attacher already running when it may open a session, instead of starting another', async () => {
    await mount('connected', 'repo::brain', false)

    expect(stub.attacher).toHaveBeenCalledTimes(1)
    expect(stub.last().setMayCreate).toHaveBeenLastCalledWith(false)

    await render('connected', 'repo::brain', true)

    expect(stub.attacher).toHaveBeenCalledTimes(1)
    expect(stub.last().setMayCreate).toHaveBeenLastCalledWith(true)
  })

  it('stays idle without a workspace, and waits without claiming to attach while the desktop is away', async () => {
    await mount('connected', null)

    expect(hook()).toEqual({ ...ATTACH_IDLE, attaching: false })
    expect(stub.attacher).not.toHaveBeenCalled()

    await render('disconnected', 'repo::brain')
    expect(hook()).toEqual({ phase: 'attaching', target: null, error: null, attaching: false })
  })

  it('hands the attacher one operation id shaped for the host, reused for the same workspace', async () => {
    await mount('connected', 'repo::brain')

    expect(stub.last().deps).toMatchObject({ client, worktreeId: 'repo::brain' })
    expect(stub.last().deps.operationId).toMatch(/^\d{13}-[0-9a-f]{32}$/)

    await act(async () => stub.publish(0, { phase: 'attached', target: null, error: null }))
    await render('connected', 'repo::brain')
    expect(stub.attacher).toHaveBeenCalledTimes(1)
  })

  it('reports attaching on a connected desktop until the session is attached', async () => {
    await mount('connected', 'repo::brain')
    expect(hook()).toEqual({ phase: 'attaching', target: null, error: null, attaching: true })

    await act(async () => stub.publish(0, { phase: 'attached', target: null, error: null }))
    expect(hook()).toMatchObject({ phase: 'attached', attaching: false })

    await render('reconnecting', 'repo::brain')
    expect(hook()).toMatchObject({ phase: 'attached', attaching: false })
  })

  it('stops the attacher when the workspace changes or the screen unmounts', async () => {
    await mount('connected', 'repo::brain')
    await render('connected', 'repo::other')

    expect(stub.sessions[0]?.stop).toHaveBeenCalledTimes(1)
    expect(stub.last().deps.worktreeId).toBe('repo::other')

    act(() => mounted.renderer?.unmount())
    mounted.renderer = undefined
    expect(stub.last().stop).toHaveBeenCalledTimes(1)
  })

  it('retries with backoff while the desktop is connected, keeping the operation id', async () => {
    await mount('connected', 'repo::brain')
    await act(async () => stub.publish(0, { phase: 'failed', target: null, error: 'falló' }))
    expect(hook()).toMatchObject({ phase: 'failed', error: 'falló', attaching: false })

    await act(async () => {
      vi.advanceTimersByTime(ATTACH_RETRY_DELAYS_MS[0]! - 1)
    })
    expect(stub.attacher).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(stub.attacher).toHaveBeenCalledTimes(2)
    expect(stub.last().deps.operationId).toBe(stub.sessions[0]!.deps.operationId)
  })

  it('waits for the desktop to come back instead of retrying while it is gone', async () => {
    await mount('connected', 'repo::brain')
    await act(async () => stub.publish(0, { phase: 'failed', target: null, error: 'falló' }))
    await render('disconnected', 'repo::brain')

    await act(async () => {
      vi.advanceTimersByTime(ATTACH_RETRY_DELAYS_MS.at(-1)! * 2)
    })
    expect(stub.attacher).toHaveBeenCalledTimes(1)

    await render('connected', 'repo::brain')
    expect(stub.attacher).toHaveBeenCalledTimes(2)
  })

  it('gives up after the last delay and starts over once a session attaches', async () => {
    await mount('connected', 'repo::brain')
    for (const [index, delay] of ATTACH_RETRY_DELAYS_MS.entries()) {
      await act(async () => stub.publish(index, { phase: 'failed', target: null, error: 'falló' }))
      await act(async () => {
        vi.advanceTimersByTime(delay)
      })
    }
    const attempts = stub.attacher.mock.calls.length
    expect(attempts).toBe(ATTACH_RETRY_DELAYS_MS.length + 1)

    await act(async () =>
      stub.publish(attempts - 1, { phase: 'failed', target: null, error: 'falló' })
    )
    await act(async () => {
      vi.advanceTimersByTime(ATTACH_RETRY_DELAYS_MS.at(-1)! * 3)
    })
    expect(stub.attacher).toHaveBeenCalledTimes(attempts)

    await act(async () =>
      stub.publish(attempts - 1, { phase: 'attached', target: null, error: null })
    )
    await act(async () =>
      stub.publish(attempts - 1, { phase: 'failed', target: null, error: 'falló' })
    )
    await act(async () => {
      vi.advanceTimersByTime(ATTACH_RETRY_DELAYS_MS[0]!)
    })
    expect(stub.attacher).toHaveBeenCalledTimes(attempts + 1)
  })
})

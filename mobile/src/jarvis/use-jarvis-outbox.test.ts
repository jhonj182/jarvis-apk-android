import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import {
  AGENT_WAITING_TEXT,
  AWAITING_REPLY_TIMEOUT_MS,
  DESKTOP_UNREACHABLE_TEXT,
  JARVIS_CONNECTING_TEXT,
  MESSAGE_NOT_DELIVERED_TEXT,
  MESSAGE_DELIVERY_UNKNOWN_TEXT,
  useJarvisOutbox
} from './use-jarvis-outbox'

const upstream = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('../session/mobile-native-chat-send', () => ({
  sendMobileNativeChatMessageWithOutcome: upstream.send
}))

describe('useJarvisOutbox', () => {
  const mounted: { renderer?: ReactTestRenderer } = {}
  const seen: ReturnType<typeof useJarvisOutbox>[] = []
  const onNotice = vi.fn<(text: string) => void>()
  const client = { id: 'client' } as unknown as RpcClient
  type Args = Parameters<typeof useJarvisOutbox>[0]
  const base: Args = {
    client,
    hostConnected: true,
    terminal: 'term_1',
    mobileClientId: 'token',
    agentBusy: false,
    agentWaiting: false,
    attaching: false,
    lastReplyKey: '',
    onNotice
  }

  function Probe(args: Args) {
    seen.push(useJarvisOutbox(args))
    return null
  }

  const hook = () => seen.at(-1)!
  const rerender = async (args: Args) => {
    await act(async () => mounted.renderer?.update(createElement(Probe, args)))
  }
  async function mount(args: Args = base) {
    await act(async () => {
      mounted.renderer = create(createElement(Probe, args))
    })
  }

  beforeEach(() => {
    upstream.send.mockReset().mockResolvedValue('accepted')
    onNotice.mockReset()
    seen.length = 0
  })

  afterEach(() => {
    act(() => mounted.renderer?.unmount())
    mounted.renderer = undefined
  })

  it('writes to the agent terminal through the upstream helper, clearing the input line first', async () => {
    await mount()

    await expect(act(async () => hook().sendToAgent('¿Cómo van los PRs?'))).resolves.toBe(true)

    expect(upstream.send).toHaveBeenCalledWith({
      client,
      terminal: 'term_1',
      text: '¿Cómo van los PRs?',
      clearInputFirst: true,
      mobileClient: { id: 'token', type: 'mobile' }
    })
    expect(onNotice).not.toHaveBeenCalled()
  })

  it('sends without a mobile client id when the desktop did not give one', async () => {
    await mount({ ...base, mobileClientId: null })

    await act(async () => hook().sendToAgent('hola'))

    expect(upstream.send).toHaveBeenCalledWith(
      expect.not.objectContaining({ mobileClient: expect.anything() })
    )
  })

  it('does not write, and says the desktop is unreachable, when there is no session to write to', async () => {
    await mount({ ...base, hostConnected: false })
    await act(async () => hook().sendToAgent('hola'))

    await rerender({ ...base, hostConnected: true, terminal: null })
    await act(async () => hook().sendToAgent('hola'))

    await rerender({ ...base, hostConnected: true, client: null })
    await expect(act(async () => hook().sendToAgent('hola'))).resolves.toBe(false)

    expect(upstream.send).not.toHaveBeenCalled()
    expect(onNotice).toHaveBeenCalledTimes(3)
    expect(onNotice).toHaveBeenLastCalledWith(DESKTOP_UNREACHABLE_TEXT)
    expect(DESKTOP_UNREACHABLE_TEXT).toBe('No encuentro el escritorio. ¿Está abierto Orca Lab?')
  })

  it.each([
    ['rejected', 'rejected', MESSAGE_NOT_DELIVERED_TEXT],
    ['of unknown delivery', 'unknown', MESSAGE_DELIVERY_UNKNOWN_TEXT]
  ])('reports a send that was %s and returns false', async (_name, outcome, text) => {
    upstream.send.mockResolvedValue(outcome)
    await mount()

    await expect(act(async () => hook().sendToAgent('hola'))).resolves.toBe(false)

    expect(onNotice).toHaveBeenCalledWith(text)
    expect(hook().awaitingReply).toBe(false)
  })

  it('never rethrows when the helper itself fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    upstream.send.mockRejectedValue(new Error('socket gone'))
    await mount()

    await expect(act(async () => hook().sendToAgent('hola'))).resolves.toBe(false)

    expect(onNotice).toHaveBeenCalledWith(MESSAGE_NOT_DELIVERED_TEXT)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  // Why: for a few seconds after the screen opens the session is still being found on a desktop
  // that is very much there. Blaming the desktop sends the owner to look for a problem that isn't.
  it('says it is still connecting, and does not blame the desktop, while the session is being found', async () => {
    await mount({ ...base, terminal: null, attaching: true })

    await expect(hook().sendToAgent('hola')).resolves.toBe(false)

    expect(upstream.send).not.toHaveBeenCalled()
    expect(onNotice).toHaveBeenCalledWith(JARVIS_CONNECTING_TEXT)
    expect(onNotice).not.toHaveBeenCalledWith(DESKTOP_UNREACHABLE_TEXT)
  })

  // Why: Claude's permission dialog has the keyboard on the desktop. A message sent into it would
  // answer the dialog, so nothing goes until the owner deals with it there.
  it('sends nothing while the agent waits for a permission on the desktop', async () => {
    await mount({ ...base, agentWaiting: true })

    await expect(hook().sendToAgent('sigue')).resolves.toBe(false)

    expect(upstream.send).not.toHaveBeenCalled()
    expect(onNotice).toHaveBeenCalledWith(AGENT_WAITING_TEXT)
    expect(hook()).toMatchObject({ awaitingReply: false, sending: false })
  })

  it('awaits the reply once the desktop took the message, until the agent is seen working', async () => {
    await mount()
    expect(hook().awaitingReply).toBe(false)

    await act(async () => hook().sendToAgent('hola'))
    expect(hook()).toMatchObject({ awaitingReply: true, sending: false })

    await rerender({ ...base, agentBusy: true })
    expect(hook().awaitingReply).toBe(false)
  })

  it('stops awaiting when a reply lands', async () => {
    await mount()
    await act(async () => hook().sendToAgent('hola'))

    await rerender({ ...base, lastReplyKey: 'a2:40' })

    expect(hook().awaitingReply).toBe(false)
  })

  it('stops awaiting after a while even if nothing happens', async () => {
    vi.useFakeTimers()
    try {
      await mount()
      await act(async () => hook().sendToAgent('hola'))

      await act(async () => {
        vi.advanceTimersByTime(AWAITING_REPLY_TIMEOUT_MS - 1)
      })
      expect(hook().awaitingReply).toBe(true)
      await act(async () => {
        vi.advanceTimersByTime(1)
      })
      expect(hook().awaitingReply).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('forgets what it was awaiting when told to', async () => {
    await mount()
    await act(async () => hook().sendToAgent('hola'))

    await act(async () => hook().forget())

    expect(hook().awaitingReply).toBe(false)
  })

  it('hands out the same sendToAgent across renders', async () => {
    await mount()
    const before = hook().sendToAgent

    await rerender({ ...base, agentBusy: true })

    expect(hook().sendToAgent).toBe(before)
  })
})

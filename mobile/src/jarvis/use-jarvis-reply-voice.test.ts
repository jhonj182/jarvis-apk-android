import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JarvisMessage } from './jarvis-contract'
import type { JarvisLocalEcho } from './jarvis-transcript-merge'
import { useJarvisReplyVoice } from './use-jarvis-reply-voice'

const voice = vi.hoisted(() => ({ useJarvisSpeech: vi.fn() }))

vi.mock('./use-jarvis-speech', () => ({ useJarvisSpeech: voice.useJarvisSpeech }))

const user = (id: string, text: string): JarvisMessage => ({
  id,
  role: 'user',
  text,
  streaming: false
})
const reply = (id: string, text: string, streaming = false): JarvisMessage => ({
  id,
  role: 'assistant',
  text,
  streaming
})
const sent = (text: string): JarvisLocalEcho => ({
  id: 'local-1',
  role: 'user',
  text,
  anchorId: null,
  baseline: 0
})

describe('useJarvisReplyVoice', () => {
  const mounted: { renderer?: ReactTestRenderer } = {}
  const seen: ReturnType<typeof useJarvisReplyVoice>[] = []
  const speak = vi.fn<(text: string) => void>()
  const stop = vi.fn()
  type Args = Parameters<typeof useJarvisReplyVoice>[0]
  const history = [user('u1', 'pregunta vieja'), reply('a1', 'Respuesta vieja. Nunca se lee.')]
  const base: Args = {
    identity: 'fedora|s1',
    transcript: history,
    echoes: [],
    settled: true,
    enabled: true
  }

  function Probe(args: Args) {
    seen.push(useJarvisReplyVoice(args))
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
    speak.mockReset()
    stop.mockReset()
    voice.useJarvisSpeech
      .mockReset()
      .mockImplementation(() => ({ speaking: false, spokenText: null, speak, stop }))
    seen.length = 0
  })

  afterEach(() => {
    act(() => mounted.renderer?.unmount())
    mounted.renderer = undefined
  })

  it('never reads the history it finds when the conversation attaches', async () => {
    await mount()

    expect(speak).not.toHaveBeenCalled()
  })

  it('reads each new reply as it lands, sentence by sentence', async () => {
    await mount()

    await rerender({
      ...base,
      transcript: [...history, user('u2', '¿y?'), reply('a2', 'Van dos. Uno en rojo.', true)]
    })
    await rerender({
      ...base,
      transcript: [
        ...history,
        user('u2', '¿y?'),
        reply('a2', 'Van dos. Uno en rojo. Y falta uno.', true)
      ]
    })
    await rerender({
      ...base,
      transcript: [
        ...history,
        user('u2', '¿y?'),
        reply('a2', 'Van dos. Uno en rojo. Y falta uno.', false)
      ]
    })

    expect(speak.mock.calls.map(([text]) => text)).toEqual([
      'Van dos.',
      'Uno en rojo.',
      'Y falta uno.'
    ])
  })

  it('reads the first reply of a new session, which lands inside the first read', async () => {
    const first = [user('u1', 'hola'), reply('a1', 'Hola. ¿Qué necesitas?')]

    await mount({ ...base, transcript: first, echoes: [sent('hola')] })

    expect(speak.mock.calls.map(([text]) => text)).toEqual(['Hola.', '¿Qué necesitas?'])
  })

  it('reads nothing until the first read of the session settles', async () => {
    await mount({ ...base, transcript: [], settled: false })

    await rerender({ ...base, transcript: history, settled: true })

    expect(speak).not.toHaveBeenCalled()
  })

  it('reads nothing while the voice is off, and skips what arrived meanwhile when it comes back', async () => {
    await mount({ ...base, enabled: false })
    await rerender({
      ...base,
      enabled: false,
      transcript: [...history, reply('a2', 'Llegó apagada.')]
    })

    await rerender({ ...base, transcript: [...history, reply('a2', 'Llegó apagada.')] })
    await rerender({
      ...base,
      transcript: [...history, reply('a2', 'Llegó apagada.'), reply('a3', 'Ya encendida.')]
    })

    expect(speak.mock.calls.map(([text]) => text)).toEqual(['Ya encendida.'])
  })

  it('stops the voice at once when it is turned off', async () => {
    await mount()
    await rerender({ ...base, transcript: [...history, reply('a2', 'En curso.')] })
    expect(speak).toHaveBeenCalledTimes(1)

    await rerender({ ...base, enabled: false })

    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('says what the app itself has to say, only while the voice is on', async () => {
    await mount()
    await rerender({ ...base, enabled: false })

    await act(async () => hook().say('Aquí Jarvis. ¿Qué necesitas?'))
    expect(speak).not.toHaveBeenCalled()

    await rerender(base)
    await act(async () => hook().say('Aquí Jarvis. ¿Qué necesitas?'))
    expect(speak).toHaveBeenCalledWith('Aquí Jarvis. ¿Qué necesitas?')
  })

  it('discard silences the voice and the rest of that reply, but not the next one', async () => {
    await mount()
    const streaming = [...history, user('u2', 'plan'), reply('a2', 'Paso uno. Paso', true)]
    await rerender({ ...base, transcript: streaming })
    expect(speak.mock.calls.map(([text]) => text)).toEqual(['Paso uno.'])

    await act(async () => hook().discard())
    expect(stop).toHaveBeenCalledTimes(1)

    await rerender({
      ...base,
      transcript: [
        ...history,
        user('u2', 'plan'),
        reply('a2', 'Paso uno. Paso dos. Paso tres.', false)
      ]
    })
    expect(speak).toHaveBeenCalledTimes(1)
    await rerender({
      ...base,
      transcript: [
        ...history,
        user('u2', 'plan'),
        reply('a2', 'Paso uno. Paso dos. Paso tres.', false),
        reply('a3', 'Listo.')
      ]
    })
    expect(speak).toHaveBeenLastCalledWith('Listo.')
  })

  it('starts over for another conversation without reading its history', async () => {
    await mount()
    const other = [user('x1', 'otra pregunta'), reply('y1', 'Otra respuesta.')]

    await rerender({ ...base, identity: 'mac|s9', transcript: other })
    await rerender({ ...base, identity: 'mac|s9', transcript: [...other, reply('y2', 'Nueva.')] })

    expect(speak.mock.calls.map(([text]) => text)).toEqual(['Nueva.'])
  })

  it('shows the voice state of the speech hook', async () => {
    voice.useJarvisSpeech.mockImplementation(() => ({
      speaking: true,
      spokenText: 'Van dos.',
      speak,
      stop
    }))

    await mount()

    expect(hook()).toMatchObject({ speaking: true, spokenText: 'Van dos.' })
  })
})

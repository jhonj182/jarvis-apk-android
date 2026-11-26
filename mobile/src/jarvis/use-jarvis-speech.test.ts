import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import * as Speech from 'expo-speech'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpeechOptions, Voice } from 'expo-speech'
import { useJarvisSpeech, type JarvisSpeech } from './use-jarvis-speech'

vi.mock('expo-speech', () => ({
  speak: vi.fn(),
  stop: vi.fn(async () => undefined),
  getAvailableVoicesAsync: vi.fn(async () => []),
  maxSpeechInputLength: 4000
}))

const COLOMBIAN: Voice = {
  identifier: 'es-co-voice',
  name: 'Colombian Spanish',
  quality: 'Default' as unknown as Voice['quality'],
  language: 'es-CO'
}

type Utterance = Parameters<typeof Speech.speak>

describe('useJarvisSpeech', () => {
  const mounted: { renderer?: ReactTestRenderer } = {}
  const seen: JarvisSpeech[] = []

  function Probe() {
    seen.push(useJarvisSpeech())
    return null
  }

  const hook = (): JarvisSpeech => seen.at(-1)!
  const utterances = (): Utterance[] => vi.mocked(Speech.speak).mock.calls
  const textOf = (utterances: Utterance[]): (string | undefined)[] =>
    utterances.map(([text]) => text)
  const optionsOf = (utterance: Utterance | undefined): SpeechOptions | undefined => utterance?.[1]
  const settle = (utterance: Utterance | undefined, event: 'onDone' | 'onError' = 'onDone') => {
    const callback = optionsOf(utterance)?.[event]
    if (typeof callback === 'function') {
      ;(callback as () => void)()
    }
  }

  async function mount(): Promise<void> {
    await act(async () => {
      mounted.renderer = create(createElement(Probe))
    })
    await act(async () => {
      await Promise.resolve()
    })
  }

  beforeEach(() => {
    vi.mocked(Speech.speak).mockReset()
    vi.mocked(Speech.stop).mockReset().mockResolvedValue(undefined)
    vi.mocked(Speech.getAvailableVoicesAsync).mockReset().mockResolvedValue([COLOMBIAN])
    seen.length = 0
  })

  afterEach(() => {
    act(() => mounted.renderer?.unmount())
    mounted.renderer = undefined
  })

  it('looks for the Spanish voice when it mounts, before anything is read', async () => {
    await mount()

    expect(Speech.getAvailableVoicesAsync).toHaveBeenCalledTimes(1)
    expect(Speech.speak).not.toHaveBeenCalled()
    expect(hook().speaking).toBe(false)
  })

  it('reads every sentence at once with the Spanish voice, without rate or pitch', async () => {
    await mount()

    act(() => hook().speak('Van dos en revisión. Uno tiene CI en rojo.'))

    expect(textOf(utterances())).toEqual(['Van dos en revisión.', 'Uno tiene CI en rojo.'])
    expect(optionsOf(utterances()[0])).toMatchObject({ voice: 'es-co-voice', language: 'es-CO' })
    expect(optionsOf(utterances()[0])).not.toHaveProperty('rate')
    expect(optionsOf(utterances()[0])).not.toHaveProperty('pitch')
  })

  it('is speaking, and shows the sentence being read, until the engine finishes the last one', async () => {
    await mount()

    act(() => hook().speak('Primero. Segundo.'))
    expect(hook().speaking).toBe(true)
    expect(hook().spokenText).toBe('Segundo.')

    await act(async () => settle(utterances()[0]))
    expect(hook().speaking).toBe(true)

    await act(async () => settle(utterances()[1], 'onError'))
    expect(hook().speaking).toBe(false)
    expect(hook().spokenText).toBeNull()
  })

  it('stop silences the engine at once and forgets what was queued', async () => {
    await mount()
    act(() => hook().speak('Primero. Segundo.'))

    await act(async () => hook().stop())

    expect(Speech.stop).toHaveBeenCalledTimes(1)
    expect(hook().speaking).toBe(false)
    await act(async () => settle(utterances()[0]))
    expect(hook().speaking).toBe(false)
  })

  it('silences the voice when the screen unmounts', async () => {
    await mount()
    act(() => hook().speak('En construcción.'))

    act(() => mounted.renderer?.unmount())
    mounted.renderer = undefined

    expect(Speech.stop).toHaveBeenCalledTimes(1)
  })

  it('hands out the same speak and stop across renders', async () => {
    await mount()
    const before = hook()

    act(() => before.speak('Hola.'))

    expect(hook().speak).toBe(before.speak)
    expect(hook().stop).toBe(before.stop)
  })

  it('never throws to the caller when the engine does', async () => {
    vi.mocked(Speech.speak).mockImplementation(() => {
      throw new Error('engine busy')
    })
    vi.mocked(Speech.stop).mockRejectedValue(new Error('engine gone'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await mount()

    expect(() => act(() => hook().speak('Hola.'))).not.toThrow()
    await expect(act(async () => hook().stop())).resolves.toBeUndefined()

    expect(hook().speaking).toBe(false)
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('still reads, with the system voice, when no Spanish voice is installed', async () => {
    vi.mocked(Speech.getAvailableVoicesAsync).mockResolvedValue([])
    await mount()

    act(() => hook().speak('Hola.'))

    expect(optionsOf(utterances()[0])).toMatchObject({ language: 'es-CO' })
    expect(optionsOf(utterances()[0])).not.toHaveProperty('voice')
  })
})

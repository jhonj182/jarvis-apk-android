import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeSpeechSetupState } from '../../../src/shared/runtime-types'
import type { RpcClient } from '../transport/rpc-client'
import { jarvisDictationFailure } from './jarvis-dictation-status'
import { useJarvisDictationAvailability } from './use-jarvis-dictation-availability'

const desktop = vi.hoisted(() => ({ fetchDictationSetup: vi.fn() }))

vi.mock('../dictation/mobile-dictation-setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dictation/mobile-dictation-setup')>()
  return { ...actual, fetchDictationSetup: desktop.fetchDictationSetup }
})

const setup = (patch: Partial<RuntimeSpeechSetupState> = {}): RuntimeSpeechSetupState => ({
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
  ],
  ...patch
})
const client = {} as RpcClient

describe('jarvisDictationFailure', () => {
  it.each([
    [
      'dictation switched off on the desktop',
      'voice_dictation_disabled',
      'dictation-off',
      'El dictado no está activo en el escritorio. Ábrelo en Orca Lab para hablar con Jarvis.'
    ],
    [
      'no model chosen',
      'voice_model_not_selected',
      'dictation-off',
      'El dictado no está activo en el escritorio. Ábrelo en Orca Lab para hablar con Jarvis.'
    ],
    [
      'model still downloading',
      'voice_model_not_ready:parakeet',
      'dictation-off',
      'El dictado no está activo en el escritorio. Ábrelo en Orca Lab para hablar con Jarvis.'
    ],
    [
      'nothing recognizable was said',
      'No speech detected.',
      null,
      'No te entendí. ¿Me lo repites?'
    ],
    [
      'the microphone is forbidden',
      'Microphone permission denied',
      null,
      'Jarvis no tiene permiso para usar el micrófono. Actívalo en los ajustes del teléfono.'
    ],
    [
      'the microphone cannot start',
      'Failed to initialize microphone',
      null,
      'No pude iniciar el micrófono. Cierra Jarvis y vuelve a abrirlo.'
    ],
    [
      'anything else',
      'speech.dictation.finish timed out',
      null,
      'El dictado falló. Inténtalo de nuevo.'
    ]
  ])('%s', (_name, message, setupNeed, text) => {
    expect(jarvisDictationFailure(message)).toEqual({ setupNeed, text })
  })
})

describe('useJarvisDictationAvailability', () => {
  const mounted: { renderer?: ReactTestRenderer } = {}
  const seen: ReturnType<typeof useJarvisDictationAvailability>[] = []
  type Args = Parameters<typeof useJarvisDictationAvailability>[0]

  function Probe(args: Args) {
    seen.push(useJarvisDictationAvailability(args))
    return null
  }

  const hook = () => seen.at(-1)!
  const settle = async () => {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }
  const rerender = async (args: Args) => {
    await act(async () => mounted.renderer?.update(createElement(Probe, args)))
    await settle()
  }

  beforeEach(() => {
    desktop.fetchDictationSetup.mockReset().mockResolvedValue(setup())
    seen.length = 0
  })

  afterEach(() => {
    act(() => mounted.renderer?.unmount())
    mounted.renderer = undefined
  })

  it('stays unknown while there is no desktop connection or nothing to dictate into', async () => {
    await act(async () => {
      mounted.renderer = create(createElement(Probe, { client: null, active: true }))
    })
    await settle()
    await rerender({ client, active: false })

    expect(desktop.fetchDictationSetup).not.toHaveBeenCalled()
    expect(hook().availability).toBe('unknown')
  })

  it.each([
    ['ready', setup(), 'ready'],
    ['switched off', setup({ enabled: false }), 'off'],
    ['without a model', setup({ selectedModelId: '' }), 'off'],
    [
      'with the model still downloading',
      setup({
        models: [
          {
            id: 'parakeet',
            label: 'Parakeet',
            provider: 'local',
            sizeBytes: 1,
            recommended: true,
            status: 'downloading',
            progress: 40
          }
        ]
      }),
      'off'
    ]
  ])('asks the desktop once and reports %s', async (_name, answer, expected) => {
    desktop.fetchDictationSetup.mockResolvedValue(answer)
    await act(async () => {
      mounted.renderer = create(createElement(Probe, { client, active: true }))
    })
    await settle()
    await rerender({ client, active: true })

    expect(desktop.fetchDictationSetup).toHaveBeenCalledTimes(1)
    expect(desktop.fetchDictationSetup).toHaveBeenCalledWith(client)
    expect(hook().availability).toBe(expected)
  })

  it('stays unknown, and says so in the log, when the desktop cannot answer', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    desktop.fetchDictationSetup.mockRejectedValue(new Error('method not found'))
    await act(async () => {
      mounted.renderer = create(createElement(Probe, { client, active: true }))
    })
    await settle()

    expect(hook().availability).toBe('unknown')
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('asks again on recheck', async () => {
    await act(async () => {
      mounted.renderer = create(createElement(Probe, { client, active: true }))
    })
    await settle()
    desktop.fetchDictationSetup.mockResolvedValue(setup({ enabled: false }))

    await act(async () => hook().recheck())
    await settle()

    expect(desktop.fetchDictationSetup).toHaveBeenCalledTimes(2)
    expect(hook().availability).toBe('off')
  })

  it('ignores an answer from the connection that was replaced', async () => {
    let answerFirst: (value: RuntimeSpeechSetupState) => void = () => undefined
    desktop.fetchDictationSetup
      .mockImplementationOnce(
        () => new Promise<RuntimeSpeechSetupState>((resolve) => (answerFirst = resolve))
      )
      .mockResolvedValue(setup())
    await act(async () => {
      mounted.renderer = create(createElement(Probe, { client, active: true }))
    })
    await settle()

    const next = {} as RpcClient
    await rerender({ client: next, active: true })
    await act(async () => answerFirst(setup({ enabled: false })))

    expect(hook().availability).toBe('ready')
  })
})

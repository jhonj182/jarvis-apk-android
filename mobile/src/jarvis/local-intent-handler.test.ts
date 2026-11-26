import { describe, expect, it, vi } from 'vitest'
import {
  createLocalIntentHandler,
  type LocalIntent,
  type MusicLaunch
} from './local-intent-handler'

const UNKNOWN: LocalIntent = { kind: 'unknown' }
const PLAY_SALSA: LocalIntent = { kind: 'music.play', query: 'salsa' }

function handlerWith(
  options: {
    classify?: (text: string) => LocalIntent
    play?: (query: string) => Promise<MusicLaunch>
    confirm?: (intent: { kind: 'music.play'; query: string }) => string
  } = {}
) {
  const classify = vi.fn(options.classify ?? ((): LocalIntent => UNKNOWN))
  const play = vi.fn(options.play ?? (async (): Promise<MusicLaunch> => ({ ok: true, via: 'url' })))
  const confirm = vi.fn(
    options.confirm ??
      ((intent: { kind: 'music.play'; query: string }) => `Reproduciendo ${intent.query}.`)
  )
  return { classify, play, confirm, handler: createLocalIntentHandler({ classify, play, confirm }) }
}

describe('createLocalIntentHandler', () => {
  it('lets text that is not a local order go to the agent', async () => {
    const { classify, play, handler } = handlerWith()

    await expect(handler.handle('¿Cómo van los PRs de sarlaft?')).resolves.toBeNull()
    expect(classify).toHaveBeenCalledWith('¿Cómo van los PRs de sarlaft?')
    expect(play).not.toHaveBeenCalled()
  })

  it('ignores empty text without asking the classifier', async () => {
    const { classify, handler } = handlerWith()

    await expect(handler.handle('   \n ')).resolves.toBeNull()
    expect(classify).not.toHaveBeenCalled()
  })

  it('plays the order on the phone and returns the confirmation sentence', async () => {
    const { play, confirm, handler } = handlerWith({
      classify: () => PLAY_SALSA,
      play: async () => ({ ok: true, via: 'play-from-search' })
    })

    await expect(handler.handle('ponme música de salsa')).resolves.toBe('Reproduciendo salsa.')

    expect(play).toHaveBeenCalledWith('salsa')
    expect(confirm).toHaveBeenCalledWith(PLAY_SALSA)
  })

  it('keeps the query exactly as the classifier built it', async () => {
    const query = 'playlist de entrenamiento'
    const { play, handler } = handlerWith({ classify: () => ({ kind: 'music.play', query }) })

    await handler.handle('reproduce la playlist de entrenamiento')

    expect(play).toHaveBeenCalledWith(query)
  })

  it('says what failed and what to do when nothing on the phone can play it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { confirm, handler } = handlerWith({
      classify: () => PLAY_SALSA,
      play: async () => ({ ok: false, reason: 'no_handler', detail: 'No Activity found' })
    })

    const sentence = await handler.handle('pon música')

    expect(sentence).toBe(
      'No pude abrir YouTube Music en este teléfono. Revisa que la app esté instalada.'
    )
    expect(sentence).not.toContain('No Activity found')
    expect(confirm).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('does not throw when the launcher throws; it answers with the failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { handler } = handlerWith({
      classify: () => PLAY_SALSA,
      play: async () => {
        throw new Error('linking failed')
      }
    })

    await expect(handler.handle('pon música')).resolves.toBe(
      'No pude abrir YouTube Music en este teléfono. Revisa que la app esté instalada.'
    )
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('sends the text to the agent when the classifier itself fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { play, handler } = handlerWith({
      classify: () => {
        throw new Error('bad token')
      }
    })

    await expect(handler.handle('pon música')).resolves.toBeNull()
    expect(play).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  // Why before and not after: opening YouTube Music sends this app to the background, where the
  // lock silences the voice. Said afterwards, the confirmation is never heard.
  it('says the confirmation through the voice it is given, before opening YouTube Music', async () => {
    const steps: string[] = []
    const { handler } = handlerWith({
      classify: () => PLAY_SALSA,
      play: async () => {
        steps.push('open')
        return { ok: true, via: 'url' }
      }
    })

    await expect(
      handler.handle('ponme salsa', {
        say: async (text) => {
          steps.push(`say ${text}`)
        }
      })
    ).resolves.toBe('Reproduciendo salsa.')

    expect(steps).toEqual(['say Reproduciendo salsa.', 'open'])
  })

  it('says the failure out loud when YouTube Music does not open', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const said: string[] = []
    const { handler } = handlerWith({
      classify: () => PLAY_SALSA,
      play: async () => ({ ok: false, reason: 'no_handler' })
    })

    await expect(
      handler.handle('ponme salsa', { say: async (text) => said.push(text) })
    ).resolves.toBe(
      'No pude abrir YouTube Music en este teléfono. Revisa que la app esté instalada.'
    )

    expect(said).toEqual([
      'Reproduciendo salsa.',
      'No pude abrir YouTube Music en este teléfono. Revisa que la app esté instalada.'
    ])
    warn.mockRestore()
  })

  it('opens YouTube Music right away when it is given no voice', async () => {
    const { play, handler } = handlerWith({ classify: () => PLAY_SALSA })

    await expect(handler.handle('ponme salsa')).resolves.toBe('Reproduciendo salsa.')

    expect(play).toHaveBeenCalledTimes(1)
  })
})

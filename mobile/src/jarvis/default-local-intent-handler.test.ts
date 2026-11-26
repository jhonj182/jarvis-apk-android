import { describe, expect, it, vi } from 'vitest'

import { defaultLocalIntentHandler } from './default-local-intent-handler'

vi.mock('./youtube-music', () => ({
  playYouTubeMusic: vi.fn(async () => ({ ok: true as const, via: 'url' as const }))
}))

// Why this test exists: the default handler is the single seam where the
// classifier and the YouTube Music launcher reach the engine. A regression here
// is not caught by the module tests, which inject fakes.
describe('defaultLocalIntentHandler', () => {
  it('resolves a music order on the phone, with the wake word and all', async () => {
    await expect(defaultLocalIntentHandler.handle('Jarvis, ponme música de salsa')).resolves.toBe(
      'Reproduciendo salsa en YouTube Music.'
    )
  })

  it('leaves everything else to the agent', async () => {
    await expect(
      defaultLocalIntentHandler.handle('¿cómo van los PRs de sarlaft?')
    ).resolves.toBeNull()
  })

  it('does not hijack a message that only starts with "pon"', async () => {
    await expect(defaultLocalIntentHandler.handle('pon la alarma a las siete')).resolves.toBeNull()
  })
})

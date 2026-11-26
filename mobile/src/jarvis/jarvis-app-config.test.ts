import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Why these three and not the name or the package: the store identity test already holds those
// (src/store-release-identity.test.ts), and one rule asserted twice is a rule that gets fixed halfway.
const appConfig = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../app.json', import.meta.url)), 'utf8')
) as {
  expo: {
    scheme: string
    android: { permissions: string[] }
    plugins: Array<string | [string, unknown]>
  }
}

const pluginNames = appConfig.expo.plugins.map((plugin) =>
  Array.isArray(plugin) ? plugin[0] : plugin
)

describe('Jarvis app config', () => {
  it('answers deep links on its own scheme, not on the Orca Lab one', () => {
    expect(appConfig.expo.scheme).toBe('jarvis')
  })

  it('declares the manifest plugin that lets it see YouTube Music', () => {
    expect(pluginNames).toContain('./plugins/jarvis-android-manifest.js')
  })

  it('asks for the microphone and the audio settings that dictating and speaking need', () => {
    expect(appConfig.expo.android.permissions).toEqual(
      expect.arrayContaining(['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS'])
    )
  })
})

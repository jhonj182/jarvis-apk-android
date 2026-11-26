import { describe, expect, it } from 'vitest'

import withJarvisAndroidManifest from '../../plugins/jarvis-android-manifest.js'

// Shape of the AndroidManifest.xml as expo config-plugins parse it: attributes
// under `$`, repeated children as arrays keyed by tag name.
interface ManifestNode {
  $?: Record<string, string>
  action?: ManifestNode[]
  category?: ManifestNode[]
  data?: ManifestNode[]
  intent?: ManifestNode[]
  queries?: ManifestNode[]
  application?: ManifestNode[]
}

interface ManifestModResults {
  manifest: ManifestNode
}

type ManifestAction = (config: { modResults: ManifestModResults }) => Promise<{
  modResults: ManifestModResults
}>

interface PluginConfig {
  mods?: { android?: { manifest?: ManifestAction } }
}

function pluginAction(): ManifestAction {
  const config = withJarvisAndroidManifest({}) as PluginConfig
  const action = config.mods?.android?.manifest
  expect(action, 'withAndroidManifest must register an android.manifest mod').toBeTypeOf('function')
  return action as ManifestAction
}

async function run(modResults: ManifestModResults): Promise<ManifestModResults> {
  return (await pluginAction()({ modResults })).modResults
}

function expectedIntents(): ManifestNode[] {
  return [
    {
      action: [{ $: { 'android:name': 'android.media.action.MEDIA_PLAY_FROM_SEARCH' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }]
    },
    {
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
      data: [{ $: { 'android:scheme': 'https', 'android:host': 'music.youtube.com' } }]
    }
  ]
}

// The one the Expo prebuild template ships, so every real manifest has it first.
const TEMPLATE_HTTPS_INTENT: ManifestNode = {
  action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
  category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
  data: [{ $: { 'android:scheme': 'https' } }]
}

describe('withJarvisAndroidManifest', () => {
  it('adds the queries declaration to a bare manifest', async () => {
    const results = await run({ manifest: { $: { package: 'com.ab2web.orca.mobile' } } })

    expect(results.manifest.queries).toEqual([{ intent: expectedIntents() }])
  })

  it('is idempotent when applied twice', async () => {
    let results = await run({ manifest: {} })
    results = await run(results)

    expect(results.manifest.queries).toEqual([{ intent: expectedIntents() }])
  })

  // Why: Android 15 and 16 refuse to install the APK when an <intent> under <queries> has neither
  // an <action> child nor <data>. The 0.1.0 APK failed that way, with the action written as an
  // attribute the platform ignores.
  it('names each action in an <action> child and leaves nothing on the <intent> itself', async () => {
    const results = await run({ manifest: {} })

    const declared = (results.manifest.queries?.[0].intent ?? []).map((intent) => ({
      ownAttributes: Object.keys(intent.$ ?? {}),
      actions: (intent.action ?? []).map((action) => action.$?.['android:name'])
    }))
    expect(declared).toEqual([
      { ownAttributes: [], actions: ['android.media.action.MEDIA_PLAY_FROM_SEARCH'] },
      { ownAttributes: [], actions: ['android.intent.action.VIEW'] }
    ])
  })

  it('merges into an existing queries element instead of duplicating it', async () => {
    const foreign: ManifestNode = {
      action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
      data: [{ $: { 'android:mimeType': 'image/jpeg' } }]
    }
    const results = await run({ manifest: { queries: [{ intent: [foreign] }] } })

    expect(results.manifest.queries).toHaveLength(1)
    expect(results.manifest.queries?.[0].intent).toEqual([foreign, ...expectedIntents()])
  })

  it('replaces a malformed empty queries element instead of stacking another', async () => {
    const results = await run({ manifest: { queries: [{}] } })

    expect(results.manifest.queries).toHaveLength(1)
    expect(results.manifest.queries).toEqual([{ intent: expectedIntents() }])
  })

  // Why: the template's VIEW intent covers all of https. Judged by its action alone it could pass
  // for ours, and the two intents visibility needs would be skipped.
  it('keeps the template https intent and adds its own once across two runs', async () => {
    let results = await run({ manifest: { queries: [{ intent: [TEMPLATE_HTTPS_INTENT] }] } })
    results = await run(results)

    expect(results.manifest.queries).toEqual([
      { intent: [TEMPLATE_HTTPS_INTENT, ...expectedIntents()] }
    ])
  })
})

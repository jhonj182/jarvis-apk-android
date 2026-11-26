import { describe, expect, it } from 'vitest'

import withJarvisAndroidManifest from '../../plugins/jarvis-android-manifest.js'

// Shape of the AndroidManifest.xml as expo config-plugins parse it: attributes
// under `$`, repeated children as arrays keyed by tag name.
interface ManifestNode {
  $?: Record<string, string>
  intent?: ManifestNode[]
  category?: ManifestNode[]
  data?: ManifestNode[]
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
      $: { 'android:name': 'android.media.action.MEDIA_PLAY_FROM_SEARCH' },
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }]
    },
    {
      $: { 'android:name': 'android.intent.action.VIEW' },
      category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
      data: [{ $: { 'android:scheme': 'https', 'android:host': 'music.youtube.com' } }]
    }
  ]
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

  it('merges into an existing queries element instead of duplicating it', async () => {
    const foreign: ManifestNode = { $: { 'android:name': 'android.intent.action.SEND' } }
    const results = await run({ manifest: { queries: [{ intent: [foreign] }] } })

    expect(results.manifest.queries).toHaveLength(1)
    expect(results.manifest.queries?.[0].intent).toEqual([foreign, ...expectedIntents()])
  })

  it('replaces a malformed empty queries element instead of stacking another', async () => {
    const results = await run({ manifest: { queries: [{}] } })

    expect(results.manifest.queries).toHaveLength(1)
    expect(results.manifest.queries).toEqual([{ intent: expectedIntents() }])
  })
})

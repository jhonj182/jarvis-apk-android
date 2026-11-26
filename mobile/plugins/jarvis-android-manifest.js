const { withAndroidManifest } = require('expo/config-plugins')

// Why: Android 11+ package visibility hides other apps from
// Linking.canOpenURL unless the manifest declares which ones this app needs to
// see. The two intents below cover both launch paths of the Jarvis music
// order: the system media search intent and the https fallback URL.
const PLAY_FROM_SEARCH_INTENT = {
  $: { 'android:name': 'android.media.action.MEDIA_PLAY_FROM_SEARCH' },
  category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }]
}

const VIEW_MUSIC_URL_INTENT = {
  $: { 'android:name': 'android.intent.action.VIEW' },
  category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
  data: [{ $: { 'android:scheme': 'https', 'android:host': 'music.youtube.com' } }]
}

const JARVIS_INTENTS = [PLAY_FROM_SEARCH_INTENT, VIEW_MUSIC_URL_INTENT]

function intentName(intent) {
  return intent.$ && intent.$['android:name']
}

// Why action and data together: other plugins declare a VIEW intent for the
// whole of https. Judged by its action alone that one passes for ours, and the
// music intent, the one package visibility needs, would be skipped.
function intentKey(intent) {
  const declared = intent.data === undefined ? [] : [].concat(intent.data)
  const data = declared
    .map((entry) => entry && entry.$)
    .filter(Boolean)
    .map((attrs) =>
      Object.keys(attrs)
        .sort()
        .map((name) => `${name}=${attrs[name]}`)
        .join(',')
    )
    .sort()
  return `${intentName(intent)}|${data.join(';')}`
}

module.exports = function withJarvisAndroidManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest
    if (!Array.isArray(manifest.queries)) {
      manifest.queries = []
    }

    // Reuse (and fix up) an existing <queries> instead of stacking a second
    // one, so this plugin stays idempotent and coexists with other plugins.
    let queries = manifest.queries[0]
    if (!queries) {
      queries = {}
      manifest.queries.push(queries)
    }
    if (!Array.isArray(queries.intent)) {
      queries.intent = []
    }

    const declared = new Set(queries.intent.map((intent) => intentKey(intent)))
    for (const intent of JARVIS_INTENTS) {
      if (!declared.has(intentKey(intent))) {
        queries.intent.push(intent)
      }
    }
    return cfg
  })
}

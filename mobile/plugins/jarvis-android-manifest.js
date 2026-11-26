const { withAndroidManifest } = require('expo/config-plugins')

// Why: Android 11+ package visibility hides other apps from
// Linking.canOpenURL unless the manifest declares which ones this app needs to
// see. The two intents below cover both launch paths of the Jarvis music
// order: the system media search intent and the https fallback URL.
//
// Why an <action> child and not an attribute on <intent>: the platform reads
// the action of a <queries> intent only from that child, and Android 15 and 16
// refuse to install an APK in which one has neither an action nor data.
const PLAY_FROM_SEARCH_INTENT = {
  action: [{ $: { 'android:name': 'android.media.action.MEDIA_PLAY_FROM_SEARCH' } }],
  category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }]
}

const VIEW_MUSIC_URL_INTENT = {
  action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
  category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
  data: [{ $: { 'android:scheme': 'https', 'android:host': 'music.youtube.com' } }]
}

const JARVIS_INTENTS = [PLAY_FROM_SEARCH_INTENT, VIEW_MUSIC_URL_INTENT]

function childAttributes(intent, tag) {
  const declared = intent[tag] === undefined ? [] : [].concat(intent[tag])
  return declared.map((entry) => entry && entry.$).filter(Boolean)
}

// Why action and data together: other plugins declare a VIEW intent for the
// whole of https. Judged by its action alone that one passes for ours, and the
// music intent, the one package visibility needs, would be skipped.
function intentKey(intent) {
  const actions = childAttributes(intent, 'action')
    .map((attrs) => attrs['android:name'])
    .filter(Boolean)
    .sort()
  const data = childAttributes(intent, 'data')
    .map((attrs) =>
      Object.keys(attrs)
        .sort()
        .map((name) => `${name}=${attrs[name]}`)
        .join(',')
    )
    .sort()
  return `${actions.join(',')}|${data.join(';')}`
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

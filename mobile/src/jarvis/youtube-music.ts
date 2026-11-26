import * as Linking from 'expo-linking'

export type MusicLaunch =
  | { ok: true; via: 'play-from-search' | 'url' }
  | { ok: false; reason: 'no_handler'; detail?: string }

const MUSIC_HOME_URL = 'https://music.youtube.com'
const PLAY_FROM_SEARCH_ACTION = 'android.media.action.MEDIA_PLAY_FROM_SEARCH'

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function openWebSearch(query: string): Promise<MusicLaunch> {
  try {
    await Linking.openURL(`${MUSIC_HOME_URL}/search?q=${encodeURIComponent(query)}`)
    return { ok: true, via: 'url' }
  } catch (error) {
    return { ok: false, reason: 'no_handler', detail: errorDetail(error) }
  }
}

// Why sendIntent and not a deep link: android.media.action.MEDIA_PLAY_FROM_SEARCH
// makes the installed music app start playing the query with the account already
// signed in on the phone, instead of just landing on a search screen.
export async function playYouTubeMusic(query: string): Promise<MusicLaunch> {
  try {
    // Why canOpenURL first: the intent only answers when a music app exists, and
    // on Android 11+ that probe requires the <queries> declaration the manifest
    // plugin adds.
    if (await Linking.canOpenURL(MUSIC_HOME_URL)) {
      await Linking.sendIntent(PLAY_FROM_SEARCH_ACTION, [{ key: 'query', value: query }])
      return { ok: true, via: 'play-from-search' }
    }
  } catch {
    // No music app, or the probe or the intent itself failed: the browser
    // search below still gives the user something to play.
  }
  return openWebSearch(query)
}

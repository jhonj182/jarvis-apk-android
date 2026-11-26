// Resolves on the phone the orders that must not wait for the agent. Everything else goes to it.
import type { JarvisLocalIntentHandler } from './jarvis-contract'

// Shapes of `classifyLocalIntent` (local-intents.ts) and `playYouTubeMusic` (youtube-music.ts).
// Declared here, not imported: the handler is wired to the real modules at integration time.
export type LocalIntent = { kind: 'music.play'; query: string } | { kind: 'unknown' }

export type MusicLaunch =
  | { ok: true; via: 'play-from-search' | 'url' }
  | { ok: false; reason: 'no_handler'; detail?: string }

export type MusicOrder = Extract<LocalIntent, { kind: 'music.play' }>

export type LocalIntentHandlerDeps = {
  classify: (text: string) => LocalIntent
  play: (query: string) => Promise<MusicLaunch>
  /** The sentence the app speaks once the order is on its way. */
  confirm: (intent: MusicOrder) => string
}

// docs/personaje/jarvis.md §2: an app error says what failed and what to do.
export const JARVIS_MUSIC_FAILURE_TEXT =
  'No pude abrir YouTube Music en este teléfono. Revisa que la app esté instalada.'

export function createLocalIntentHandler(deps: LocalIntentHandlerDeps): JarvisLocalIntentHandler {
  return {
    async handle(text, voice) {
      if (typeof text !== 'string' || text.trim() === '') {
        return null
      }
      // Why: a broken classifier must not swallow the message; the agent still answers.
      let intent: LocalIntent
      try {
        intent = deps.classify(text.trim())
      } catch (error) {
        console.warn('Jarvis local intent classifier failed', error)
        return null
      }
      if (intent.kind !== 'music.play') {
        return null
      }
      // Why the confirmation before the launch and not after: opening YouTube Music sends this
      // app to the background, where the lock silences the voice, and it would never be heard.
      const confirmation = voice ? deps.confirm(intent) : null
      if (voice && confirmation !== null) {
        await voice.say(confirmation)
      }
      const launched = await launch(deps, intent.query)
      if (launched) {
        return confirmation ?? deps.confirm(intent)
      }
      await voice?.say(JARVIS_MUSIC_FAILURE_TEXT)
      return JARVIS_MUSIC_FAILURE_TEXT
    }
  }
}

/** True when the order reached an app that can play it. Never throws. */
async function launch(deps: LocalIntentHandlerDeps, query: string): Promise<boolean> {
  try {
    const result = await deps.play(query)
    return result.ok ? true : fail(result.detail)
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
}

function fail(detail: string | undefined): boolean {
  console.warn('Jarvis could not open YouTube Music', detail)
  return false
}

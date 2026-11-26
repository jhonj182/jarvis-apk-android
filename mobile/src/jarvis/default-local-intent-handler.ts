import type { JarvisLocalIntentHandler } from './jarvis-contract'
import { createLocalIntentHandler } from './local-intent-handler'
import { classifyLocalIntent, musicConfirmation } from './local-intents'
import { playYouTubeMusic } from './youtube-music'

// The single seam where the classifier and the YouTube Music launcher reach the
// engine. The screen passes this to `useJarvisConversation`; the engine itself
// only knows the `JarvisLocalIntentHandler` contract.
export const defaultLocalIntentHandler: JarvisLocalIntentHandler = createLocalIntentHandler({
  classify: classifyLocalIntent,
  play: playYouTubeMusic,
  confirm: musicConfirmation
})

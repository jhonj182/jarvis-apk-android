// Contract between the Jarvis assistant screen and the Jarvis conversation engine.
// Types only: the screen imports these and never reaches into the engine, and
// the engine never imports screen files. Both sides are tested against this.

/** What the character expresses. Drives the animation, nothing else. */
export type JarvisActivity = 'idle' | 'listening' | 'thinking' | 'speaking'

export type JarvisMessageRole = 'user' | 'assistant'

export interface JarvisMessage {
  id: string
  role: JarvisMessageRole
  /** Markdown source as the agent wrote it. The screen renders it; speech cleans it. */
  text: string
  /** True while the text of this message is still arriving. */
  streaming: boolean
}

/** What the owner must do before talking, if anything. `null` means ready. */
export type JarvisSetupNeed = 'pair-desktop' | 'choose-workspace' | 'dictation-off' | null

/**
 * Resolves an order on the phone, without the agent. Returns the sentence to
 * speak aloud when it handled the text, or null to send the text to the agent.
 */
export interface JarvisLocalIntentHandler {
  handle: (text: string) => Promise<string | null>
}

export interface JarvisConversation {
  activity: JarvisActivity
  /** One short line in Spanish under the character: what Jarvis is doing right now. */
  statusText: string
  messages: JarvisMessage[]
  /** True when the paired desktop answers and the Jarvis session is attached. */
  connected: boolean
  setupNeed: JarvisSetupNeed
  speechEnabled: boolean
  /** Push-to-talk: press starts the dictation, release sends. */
  startListening: () => void
  stopListening: () => void
  /** Keyboard path. Runs through the same local intents as the voice path. */
  sendText: (text: string) => void
  toggleSpeech: () => void
  /** Interrupts whatever is being read aloud. */
  stopSpeaking: () => void
}

/** The desktop workspace that plays Jarvis. See docs/personaje/jarvis.md. */
export interface JarvisWorkspaceRef {
  hostId: string
  worktreeId: string
  name: string
}

export interface JarvisWorkspaceOption {
  hostId: string
  hostName: string
  worktreeId: string
  name: string
}

export interface JarvisPreferences {
  workspace: JarvisWorkspaceRef | null
  speechEnabled: boolean
}

export interface JarvisWorkspaceOptions {
  options: JarvisWorkspaceOption[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export interface JarvisPreferencesController {
  preferences: JarvisPreferences
  setWorkspace: (workspace: JarvisWorkspaceRef | null) => Promise<void>
  setSpeechEnabled: (enabled: boolean) => Promise<void>
}

// Derives what the character expresses, and the one line under it, from a few flags. Pure.
import type { JarvisActivity, JarvisSetupNeed } from './jarvis-contract'

export type JarvisActivityFlags = {
  /** Dictation is starting or recording. */
  listening: boolean
  /** Dictation ended and its text is still being transcribed. */
  transcribing: boolean
  /** The voice is reading. */
  speaking: boolean
  /** The agent is working on a turn. */
  agentBusy: boolean
  /** The agent stopped for a permission only the desktop can give. */
  agentWaiting?: boolean
  /** A message left this phone and neither a reply nor agent activity was seen yet. */
  awaitingReply: boolean
}

export type JarvisStatusInput = {
  activity: JarvisActivity
  connected: boolean
  setupNeed: JarvisSetupNeed
  /** Sentence the voice is reading right now, when known. */
  spokenText?: string | null
  /** What failed and what to do. Outranks every other line. */
  error?: string | null
  /** The session is being found or opened on a connected desktop. */
  attaching?: boolean
  /** Claude is asking permission in a dialog on the desktop. */
  agentWaiting?: boolean
}

/** The lines of docs/personaje/jarvis.md §3 and its interface text, verbatim. */
export const JARVIS_STATUS_TEXT = {
  idle: '¿Qué necesitas?',
  listening: 'Te escucho',
  thinking: 'Pensando',
  awaitingPermission: 'Espero tu permiso en Orca Lab',
  speaking: 'Hablando',
  offline: 'Sin conexión con el escritorio',
  attaching: 'Conectando con Jarvis…',
  pairDesktop: 'Empareja tu escritorio para empezar',
  chooseWorkspace: 'Elige desde qué espacio de trabajo habla Jarvis'
} as const

/** First signal that holds wins: the owner dictating, the voice, the agent, then rest. */
export function deriveJarvisActivity(flags: JarvisActivityFlags): JarvisActivity {
  if (flags.listening) {
    return 'listening'
  }
  if (flags.speaking) {
    return 'speaking'
  }
  if (flags.transcribing || flags.agentBusy || flags.agentWaiting || flags.awaitingReply) {
    return 'thinking'
  }
  return 'idle'
}

export function jarvisStatusText(input: JarvisStatusInput): string {
  if (input.error) {
    return input.error
  }
  if (input.setupNeed === 'pair-desktop') {
    return JARVIS_STATUS_TEXT.pairDesktop
  }
  if (input.setupNeed === 'choose-workspace') {
    return JARVIS_STATUS_TEXT.chooseWorkspace
  }
  if (!input.connected) {
    return input.attaching ? JARVIS_STATUS_TEXT.attaching : JARVIS_STATUS_TEXT.offline
  }
  switch (input.activity) {
    case 'listening':
      return JARVIS_STATUS_TEXT.listening
    case 'thinking':
      return input.agentWaiting
        ? JARVIS_STATUS_TEXT.awaitingPermission
        : JARVIS_STATUS_TEXT.thinking
    case 'speaking':
      return input.spokenText?.trim() || JARVIS_STATUS_TEXT.speaking
    default:
      return JARVIS_STATUS_TEXT.idle
  }
}

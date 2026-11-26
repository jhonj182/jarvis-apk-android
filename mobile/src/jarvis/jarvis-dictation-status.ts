// What Jarvis says when dictation fails. The words are the app's own (docs/personaje/jarvis.md §2),
// never the agent's and never the raw error.
import { isDictationSetupRequiredError } from '../dictation/mobile-dictation-setup'

export type JarvisDictationNotice = {
  /** `'dictation-off'` when the owner must switch dictation on in the desktop first. */
  setupNeed: 'dictation-off' | null
  /** Spanish line that says what failed and what to do. */
  text: string
}

export const DICTATION_OFF_TEXT =
  'El dictado no está activo en el escritorio. Ábrelo en Orca Lab para hablar con Jarvis.'
export const DICTATION_UNHEARD_TEXT = 'No te entendí. ¿Me lo repites?'
const DICTATION_FAILED_TEXT = 'El dictado falló. Inténtalo de nuevo.'

const FAILURES: readonly [RegExp, string][] = [
  [/no speech detected/i, DICTATION_UNHEARD_TEXT],
  [
    /permission/i,
    'Jarvis no tiene permiso para usar el micrófono. Actívalo en los ajustes del teléfono.'
  ],
  [/initiali[sz]e/i, 'No pude iniciar el micrófono. Cierra Jarvis y vuelve a abrirlo.']
]

export function jarvisDictationFailure(message: string): JarvisDictationNotice {
  if (isDictationSetupRequiredError(message)) {
    return { setupNeed: 'dictation-off', text: DICTATION_OFF_TEXT }
  }
  return {
    setupNeed: null,
    text: FAILURES.find(([pattern]) => pattern.test(message))?.[1] ?? DICTATION_FAILED_TEXT
  }
}

// One shared copy of the Jarvis preferences, so the assistant and its settings screen never disagree.
import type { JarvisPreferences } from './jarvis-contract'
import {
  DEFAULT_JARVIS_PREFERENCES,
  loadJarvisPreferences,
  saveJarvisPreferences
} from './jarvis-preferences'

export type JarvisPreferencesStore = {
  getSnapshot: () => JarvisPreferences
  subscribe: (listener: () => void) => () => void
  /** Reads the stored record once; later calls return what is already known. */
  load: () => Promise<JarvisPreferences>
  /** Shows the change at once and saves it; puts the previous value back if the save fails. */
  update: (patch: Partial<JarvisPreferences>) => Promise<JarvisPreferences>
}

type Dependencies = {
  load: () => Promise<JarvisPreferences>
  save: (patch: Partial<JarvisPreferences>) => Promise<JarvisPreferences>
}

export function createJarvisPreferencesStore(deps: Dependencies): JarvisPreferencesStore {
  let snapshot = DEFAULT_JARVIS_PREFERENCES
  // Why: the last value known to be in storage; a failed save returns to it, not to another unsaved change.
  let persisted = DEFAULT_JARVIS_PREFERENCES
  let revision = 0
  let loading: Promise<JarvisPreferences> | null = null
  let saving: Promise<unknown> = Promise.resolve()
  const listeners = new Set<() => void>()

  const publish = (next: JarvisPreferences): void => {
    if (next === snapshot) {
      return
    }
    snapshot = next
    listeners.forEach((listener) => listener())
  }

  const read = (): Promise<JarvisPreferences> => {
    if (loading) {
      return loading
    }
    const started = revision
    loading = saving
      // Why: a read that overtakes a save in flight would bring back the record the save replaces.
      .catch(() => undefined)
      .then(() => deps.load())
      .then((loaded) => {
        if (revision === started) {
          publish(loaded)
        }
        persisted = snapshot
        return snapshot
      })
      .catch(() => snapshot)
    return loading
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    load: read,
    update(patch) {
      const at = ++revision
      publish({ ...snapshot, ...patch })
      const attempt = saving
        .catch(() => undefined)
        .then(() => deps.save(patch))
        .then((saved) => {
          persisted = saved
          // Why: a newer change is on screen; this result predates it.
          if (revision === at) {
            publish(saved)
          }
          return saved
        })
        .catch((error: unknown) => {
          if (revision === at) {
            publish(persisted)
          }
          throw error
        })
      saving = attempt
      return attempt
    }
  }
}

export const jarvisPreferencesStore: JarvisPreferencesStore = createJarvisPreferencesStore({
  load: loadJarvisPreferences,
  save: saveJarvisPreferences
})

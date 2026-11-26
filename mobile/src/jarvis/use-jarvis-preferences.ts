import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { JarvisPreferencesController, JarvisWorkspaceRef } from './jarvis-contract'
import { jarvisPreferencesStore, type JarvisPreferencesStore } from './jarvis-preferences-store'

/** The Jarvis preferences as every screen sees them. The callbacks never change between renders. */
export function useJarvisPreferences(
  store: JarvisPreferencesStore = jarvisPreferencesStore
): JarvisPreferencesController {
  const preferences = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)

  useEffect(() => {
    void store.load()
  }, [store])

  const setWorkspace = useCallback(
    async (workspace: JarvisWorkspaceRef | null): Promise<void> => {
      await saveQuietly(() => store.update({ workspace }))
    },
    [store]
  )
  const setSpeechEnabled = useCallback(
    async (enabled: boolean): Promise<void> => {
      await saveQuietly(() => store.update({ speechEnabled: enabled }))
    },
    [store]
  )

  return useMemo(
    () => ({ preferences, setWorkspace, setSpeechEnabled }),
    [preferences, setSpeechEnabled, setWorkspace]
  )
}

// Why: the store already put the previous value back; a screen that awaits the setter has nothing to recover.
async function saveQuietly(save: () => Promise<unknown>): Promise<void> {
  try {
    await save()
  } catch (error) {
    console.warn('Jarvis preferences could not be saved', error)
  }
}

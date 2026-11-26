// Where Jarvis keeps what the owner chose: the workspace it speaks from and whether it reads aloud.
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { JarvisPreferences, JarvisWorkspaceRef } from './jarvis-contract'

export const JARVIS_PREFERENCES_KEY = 'orca:jarvis:preferences:v1'

export const DEFAULT_JARVIS_PREFERENCES: JarvisPreferences = {
  workspace: null,
  // Why: a voice assistant that starts muted looks broken; the owner turns it off once.
  speechEnabled: true
}

const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

function workspaceOf(value: unknown): JarvisWorkspaceRef | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const candidate = value as Partial<JarvisWorkspaceRef>
  return nonEmpty(candidate.hostId) && nonEmpty(candidate.worktreeId) && nonEmpty(candidate.name)
    ? {
        hostId: candidate.hostId,
        worktreeId: candidate.worktreeId,
        name: candidate.name
      }
    : null
}

/** Reads a stored record field by field: anything missing or malformed takes its default. */
export function parseJarvisPreferences(raw: string | null): JarvisPreferences {
  let stored: unknown = null
  try {
    stored = raw ? JSON.parse(raw) : null
  } catch {
    return DEFAULT_JARVIS_PREFERENCES
  }
  if (typeof stored !== 'object' || stored === null) {
    return DEFAULT_JARVIS_PREFERENCES
  }
  const record = stored as Partial<JarvisPreferences>
  return {
    workspace: record.workspace === undefined ? null : workspaceOf(record.workspace),
    speechEnabled:
      typeof record.speechEnabled === 'boolean'
        ? record.speechEnabled
        : DEFAULT_JARVIS_PREFERENCES.speechEnabled
  }
}

/** The stored preferences. Corrupt or missing data reads as the defaults; it never throws. */
export async function loadJarvisPreferences(): Promise<JarvisPreferences> {
  try {
    return await readStoredJarvisPreferences()
  } catch {
    return DEFAULT_JARVIS_PREFERENCES
  }
}

async function readStoredJarvisPreferences(): Promise<JarvisPreferences> {
  return parseJarvisPreferences(await AsyncStorage.getItem(JARVIS_PREFERENCES_KEY))
}

// Why: two saves in flight would each read the old record and the last write would drop the other's field.
let writes: Promise<unknown> = Promise.resolve()

/** Merges a patch into the stored record, saves it and returns what was saved. */
export async function saveJarvisPreferences(
  patch: Partial<JarvisPreferences>
): Promise<JarvisPreferences> {
  const save = writes.then(async () => {
    // Why: an unreadable record must not be overwritten with defaults; the caller keeps its state.
    const current = await readStoredJarvisPreferences()
    const next: JarvisPreferences = {
      workspace: patch.workspace === undefined ? current.workspace : workspaceOf(patch.workspace),
      speechEnabled: patch.speechEnabled ?? current.speechEnabled
    }
    await AsyncStorage.setItem(JARVIS_PREFERENCES_KEY, JSON.stringify(next))
    return next
  })
  writes = save.catch(() => undefined)
  return save
}

// The desktops and workspaces the owner can choose as "where Jarvis speaks from".
import { useMemo } from 'react'
import type { JarvisWorkspaceOption, JarvisWorkspaceOptions } from './jarvis-contract'
import {
  useJarvisHostWorktrees,
  type JarvisHostCatalogs,
  type JarvisHostWorktrees
} from './use-jarvis-host-worktrees'

// docs/personaje/jarvis.md §2: an app error says what failed and what to do.
export const NO_DESKTOP_CONNECTED_TEXT =
  'No hay ningún escritorio conectado. Abre Orca Lab en uno y vuelve a intentarlo.'
export const WORKSPACES_UNREADABLE_TEXT =
  'No pude leer los espacios de trabajo del escritorio. Revisa que Orca Lab esté abierto.'

/** Every workspace of every desktop that answered, skipping archived ones. */
export function jarvisWorkspaceOptions(
  hosts: readonly JarvisHostWorktrees[]
): JarvisWorkspaceOption[] {
  return hosts.flatMap((entry) =>
    (entry.worktrees ?? [])
      .filter((summary) => !summary.isArchived)
      .map((summary) => ({
        hostId: entry.host.id,
        hostName: entry.host.name,
        worktreeId: summary.worktreeId,
        name: summary.displayName
      }))
  )
}

/** One Spanish line for what keeps the list from being useful, or null while there is nothing to say. */
export function jarvisWorkspaceOptionsError(catalogs: JarvisHostCatalogs): string | null {
  if (catalogs.error) {
    return catalogs.error
  }
  if (!catalogs.hostsLoaded || catalogs.loading || catalogs.pairedHostIds.length === 0) {
    return null
  }
  const connected = catalogs.hosts.filter((entry) => entry.state === 'connected')
  if (connected.length === 0) {
    return NO_DESKTOP_CONNECTED_TEXT
  }
  // Why: one desktop that answers is enough; a partial failure must not hide the list it produced.
  return connected.every((entry) => entry.worktrees === null) ? WORKSPACES_UNREADABLE_TEXT : null
}

export function useJarvisWorkspaceOptions(): JarvisWorkspaceOptions {
  const catalogs = useJarvisHostWorktrees()
  const options = useMemo(() => jarvisWorkspaceOptions(catalogs.hosts), [catalogs.hosts])
  return {
    options,
    loading: catalogs.loading,
    error: jarvisWorkspaceOptionsError(catalogs),
    refresh: catalogs.refresh
  }
}

// Every paired desktop with the workspaces a connected one reports. Shared by the assistant and its
// settings screen, so both resolve "where Jarvis lives" from the same data.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import { loadHosts } from '../transport/host-store'
import { useAllHostClients } from '../transport/use-all-host-clients'
import type { ConnectionState, HostProfile } from '../transport/types'
import { readJarvisWorktrees, type JarvisWorktreeSummary } from './jarvis-session-attach'

/** What reading a catalog needs from a desktop's shared client. */
export type CatalogClient = Pick<RpcClient, 'sendRequest'>

export type JarvisHostWorktrees = {
  host: HostProfile
  state: ConnectionState
  /** Null until a connected desktop answers; the last good list survives a failed refresh. */
  worktrees: readonly JarvisWorktreeSummary[] | null
  error: string | null
}

export type JarvisHostCatalogs = {
  hosts: JarvisHostWorktrees[]
  /** False until the paired desktops were read from storage. */
  hostsLoaded: boolean
  pairedHostIds: string[]
  loading: boolean
  /** Spanish line when the paired desktops themselves could not be read. */
  error: string | null
  refresh: () => void
}

type Catalog = Pick<JarvisHostWorktrees, 'worktrees' | 'error'>

// docs/personaje/jarvis.md §2: an app error says what failed and what to do.
export const HOSTS_UNREADABLE_TEXT =
  'No pude leer los escritorios emparejados. Vuelve a intentarlo.'

const failureText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export function useJarvisHostWorktrees(
  options: {
    loadHosts?: () => Promise<HostProfile[]>
    readWorktrees?: (client: CatalogClient) => Promise<JarvisWorktreeSummary[]>
  } = {}
): JarvisHostCatalogs {
  const load = options.loadHosts ?? loadHosts
  const read = options.readWorktrees ?? readJarvisWorktrees
  const [hosts, setHosts] = useState<HostProfile[] | null>(null)
  const [hostsError, setHostsError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [catalogs, setCatalogs] = useState<Readonly<Record<string, Catalog>>>({})
  const [pending, setPending] = useState(0)
  const alive = useRef(true)
  // Why: a desktop is asked again only when its connection is new or the owner refreshes.
  const readFor = useRef(new Map<string, CatalogClient>())
  const inFlight = useRef(new Map<string, CatalogClient>())
  const readsByHost = useRef(new Map<string, number>())
  const lastTick = useRef(tick)

  const hostIds = useMemo(() => (hosts ?? []).map((profile) => profile.id), [hosts])
  const clients = useAllHostClients(hostIds)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void load().then(
      (loaded) => {
        if (!cancelled) {
          setHosts(loaded)
          setHostsError(null)
        }
      },
      (error: unknown) => {
        if (cancelled) {
          return
        }
        console.warn('Jarvis could not read the paired desktops', error)
        setHostsError(HOSTS_UNREADABLE_TEXT)
      }
    )
    return () => {
      cancelled = true
    }
  }, [load, tick])

  const statesKey = clients.map((entry) => `${entry.hostId}:${entry.state}`).join('|')
  useEffect(() => {
    const force = lastTick.current !== tick
    lastTick.current = tick
    const targets = clients.filter(
      (entry) =>
        entry.state === 'connected' &&
        (force || readFor.current.get(entry.hostId) !== entry.client) &&
        // Why: a render that happens while a read is on its way must not start the same read again.
        inFlight.current.get(entry.hostId) !== entry.client
    )
    for (const entry of targets) {
      inFlight.current.set(entry.hostId, entry.client)
      // Why: only the newest read per desktop may land, so a slow answer never replaces a newer one.
      const readNumber = (readsByHost.current.get(entry.hostId) ?? 0) + 1
      readsByHost.current.set(entry.hostId, readNumber)
      const current = () => alive.current && readsByHost.current.get(entry.hostId) === readNumber
      setPending((count) => count + 1)
      void read(entry.client)
        .then(
          (worktrees) => {
            if (!current()) {
              return
            }
            readFor.current.set(entry.hostId, entry.client)
            setCatalogs((all) => ({ ...all, [entry.hostId]: { worktrees, error: null } }))
          },
          (error: unknown) => {
            if (!current()) {
              return
            }
            console.warn('Jarvis could not read the workspaces of a desktop', error)
            setCatalogs((all) => ({
              ...all,
              [entry.hostId]: {
                worktrees: all[entry.hostId]?.worktrees ?? null,
                error: failureText(error)
              }
            }))
          }
        )
        .finally(() => {
          if (inFlight.current.get(entry.hostId) === entry.client) {
            inFlight.current.delete(entry.hostId)
          }
          if (alive.current) {
            setPending((count) => Math.max(0, count - 1))
          }
        })
    }
  }, [clients, statesKey, read, tick])

  const list = useMemo(() => {
    const byHost = new Map(clients.map((entry) => [entry.hostId, entry]))
    return (hosts ?? []).flatMap((profile) => {
      const entry = byHost.get(profile.id)
      if (!entry) {
        return []
      }
      const catalog = catalogs[profile.id]
      return [
        {
          host: profile,
          state: entry.state,
          worktrees: catalog?.worktrees ?? null,
          error: catalog?.error ?? null
        }
      ]
    })
  }, [catalogs, clients, hosts])

  return {
    hosts: list,
    hostsLoaded: hosts !== null,
    pairedHostIds: hostIds,
    loading: (hosts === null && hostsError === null) || pending > 0,
    error: hostsError,
    refresh: useCallback(() => setTick((count) => count + 1), [])
  }
}

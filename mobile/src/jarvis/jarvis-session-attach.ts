// Where Jarvis lives on the paired desktop, and how the phone reaches its Claude session.
// Pure rules first, then two RPC helpers shaped like the upstream `fresh-lead-start.ts`.
import type { AgentStatusEntry } from '../../../src/shared/agent-status-types'
import { freshLeadOperationIdOf } from '../new-tab-team/fresh-lead-start'
import { resolveMobileNativeChat } from '../session/mobile-native-chat-eligibility'
import type { RpcClient } from '../transport/rpc-client'
import { WORKTREE_PS_FULL_LIMIT } from '../worktree/worktree-catalog-snapshot-client'
import type { JarvisSetupNeed, JarvisWorkspaceRef } from './jarvis-contract'

/** ADR-002: Jarvis is a `claude` session; the desktop's selected AI account is the one it uses. */
export const JARVIS_AGENT = 'claude'
/** The installer (scripts/jarvis/install-workspace.sh) creates a folder named after this. */
export const JARVIS_WORKTREE_NAME = 'jarvis-mobile'
// Why longer than a read: the host spawns the agent and its shell before it answers.
export const JARVIS_CREATE_TIMEOUT_MS = 60_000
export const ATTACH_TIMEOUT_REASON = 'timeout'

export type JarvisWorktreeSummary = {
  worktreeId: string
  displayName: string
  path: string
  isArchived: boolean
}

/** One paired desktop's workspaces. `worktrees` is null until a connected desktop answered. */
export type JarvisHostCatalog = {
  hostId: string
  hostName: string
  lastConnected: number
  worktrees: readonly JarvisWorktreeSummary[] | null
}

export type JarvisSetupResolution = {
  workspace: JarvisWorkspaceRef | null
  setupNeed: Extract<JarvisSetupNeed, 'pair-desktop' | 'choose-workspace'> | null
}

export type JarvisTabTarget = {
  tabId: string | null
  /** Terminal handle `terminal.send` writes to. */
  terminal: string
  agentBusy: boolean
  /** The agent stopped for a decision: Claude is asking permission in a dialog on the desktop. */
  agentWaiting: boolean
  /** The agent's own session id and transcript, once its hook reports them. */
  sessionId: string | null
  transcriptPath: string | null
}

/** The fields of a session tab that matter here; the host sends more. */
export type JarvisTabLike = {
  type: string
  id?: string
  terminal?: string | null
  isActive?: boolean
  launchAgent?: string | null
  agentStatus?: AgentStatusEntry | null
  launchDraft?: string
  launchDraftCreatedAt?: number
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const folderName = (path: unknown): string =>
  text(path)
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .pop() ?? ''

export function isJarvisWorktreeName(name: string): boolean {
  return name.toLowerCase().includes(JARVIS_WORKTREE_NAME)
}

/** Reads `worktree.ps` rows, keeping only what Jarvis needs and never trusting a missing field. */
export function summarizeJarvisWorktrees(value: unknown): JarvisWorktreeSummary[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((row: unknown) => {
    if (typeof row !== 'object' || row === null) {
      return []
    }
    const record = row as Record<string, unknown>
    const worktreeId = text(record.worktreeId)
    if (worktreeId === '') {
      return []
    }
    const path = text(record.path)
    return [
      {
        worktreeId,
        displayName: text(record.displayName) || folderName(path),
        path,
        isArchived: record.isArchived === true
      }
    ]
  })
}

export async function readJarvisWorktrees(
  client: Pick<RpcClient, 'sendRequest'>
): Promise<JarvisWorktreeSummary[]> {
  // Why: worktree.ps silently truncates at 200; the full limit keeps large desktops complete.
  const response = await client.sendRequest('worktree.ps', { limit: WORKTREE_PS_FULL_LIMIT })
  if (!response.ok) {
    throw new Error(response.error.message)
  }
  const result = response.result as { worktrees?: unknown } | null
  return summarizeJarvisWorktrees(result?.worktrees)
}

const isJarvisWorkspace = (summary: JarvisWorktreeSummary): boolean =>
  !summary.isArchived &&
  (isJarvisWorktreeName(summary.displayName) || isJarvisWorktreeName(folderName(summary.path)))

/** The Jarvis workspace on the desktop that connected last, when a connected desktop has one. */
export function pickJarvisWorktree(
  catalogs: readonly JarvisHostCatalog[]
): JarvisWorkspaceRef | null {
  const found = catalogs
    .filter((catalog) => catalog.worktrees !== null)
    .map((catalog) => ({ catalog, worktree: catalog.worktrees?.find(isJarvisWorkspace) }))
    .filter(
      (entry): entry is { catalog: JarvisHostCatalog; worktree: JarvisWorktreeSummary } =>
        entry.worktree !== undefined
    )
    .sort((left, right) => right.catalog.lastConnected - left.catalog.lastConnected)
  const first = found[0]
  return first
    ? {
        hostId: first.catalog.hostId,
        worktreeId: first.worktree.worktreeId,
        name: first.worktree.displayName
      }
    : null
}

/** The workspace to use, or what the owner must do before there can be one. */
export function resolveJarvisWorkspace(args: {
  hostsLoaded: boolean
  pairedHostIds: readonly string[]
  preference: JarvisWorkspaceRef | null
  catalogs: readonly JarvisHostCatalog[]
}): JarvisSetupResolution {
  if (!args.hostsLoaded) {
    return { workspace: null, setupNeed: null }
  }
  if (args.pairedHostIds.length === 0) {
    return { workspace: null, setupNeed: 'pair-desktop' }
  }
  const saved = args.preference
  if (saved) {
    if (!args.pairedHostIds.includes(saved.hostId)) {
      return { workspace: null, setupNeed: 'pair-desktop' }
    }
    const catalog = args.catalogs.find((entry) => entry.hostId === saved.hostId)
    // Why: an unread catalog is no evidence that the workspace is gone; only a loaded one without it is.
    const stillThere =
      catalog === undefined ||
      catalog.worktrees === null ||
      catalog.worktrees.some((summary) => summary.worktreeId === saved.worktreeId)
    if (stillThere) {
      return { workspace: saved, setupNeed: null }
    }
  }
  const picked = pickJarvisWorktree(args.catalogs)
  return picked
    ? { workspace: picked, setupNeed: null }
    : { workspace: null, setupNeed: 'choose-workspace' }
}

function targetOf(tab: JarvisTabLike): JarvisTabTarget | null {
  const resolution = resolveMobileNativeChat(tab, true)
  if (!resolution || resolution.agent !== JARVIS_AGENT || typeof tab.terminal !== 'string') {
    return null
  }
  return {
    tabId: tab.id ?? null,
    terminal: tab.terminal,
    agentBusy: tab.agentStatus?.state === 'working',
    // Why `blocked` too: some agents report a permission prompt that way; both mean "waiting on a person".
    agentWaiting: tab.agentStatus?.state === 'waiting' || tab.agentStatus?.state === 'blocked',
    sessionId: resolution.sessionId,
    transcriptPath: resolution.transcriptPath
  }
}

/** The terminal tab that plays Jarvis: the one the phone created, or the best Claude tab present. */
export function findJarvisAgentTab(
  tabs: readonly JarvisTabLike[],
  created?: { tabId: string | null; terminal: string | null } | null
): JarvisTabTarget | null {
  const candidates = tabs.flatMap((tab) => {
    const target = targetOf(tab)
    return target ? [{ tab, target }] : []
  })
  if (created) {
    return (
      candidates.find(
        ({ tab }) =>
          (created.tabId !== null && tab.id === created.tabId) || tab.terminal === created.terminal
      )?.target ?? null
    )
  }
  // Why: a tab with a live agent status is a session in use; an idle or unlaunched one comes later.
  const rank = ({ tab }: { tab: JarvisTabLike }): number =>
    (tab.agentStatus?.state !== undefined ? 2 : 0) + (tab.isActive ? 1 : 0)
  return candidates.sort((left, right) => rank(right) - rank(left))[0]?.target ?? null
}

export type JarvisCreateSessionResult =
  | { kind: 'created'; terminal: string; tabId: string | null }
  | { kind: 'failed'; reason: string }

/** Opens the Jarvis session on the desktop: agent `claude`, its selected account, no prompt. */
export async function createJarvisAgentSession(
  client: Pick<RpcClient, 'sendRequest'>,
  args: { worktreeId: string; operationId: string }
): Promise<JarvisCreateSessionResult> {
  try {
    const response = await client.sendRequest(
      'terminal.createAgentSession',
      {
        clientOperationId: args.operationId,
        worktree: `id:${args.worktreeId}`,
        agent: JARVIS_AGENT
      },
      { timeoutMs: JARVIS_CREATE_TIMEOUT_MS }
    )
    if (!response.ok) {
      return { kind: 'failed', reason: response.error.message }
    }
    const terminal = (
      response.result as { terminal?: { handle?: unknown; tabId?: unknown } } | null
    )?.terminal
    return typeof terminal?.handle === 'string'
      ? { kind: 'created', terminal: terminal.handle, tabId: text(terminal.tabId) || null }
      : { kind: 'failed', reason: 'terminal_missing' }
  } catch (error) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) }
  }
}

export { freshLeadOperationIdOf as jarvisOperationIdOf }

// docs/personaje/jarvis.md §2: an app error says what failed and what to do.
const ATTACH_FAILED_TEXT =
  'No pude abrir la sesión de Jarvis en el escritorio. Revisa que Claude esté instalado ahí.'

export function jarvisAttachErrorText(reason: string): string {
  return reason === ATTACH_TIMEOUT_REASON
    ? 'El escritorio no respondió al abrir la sesión de Jarvis. Revisa que Orca Lab esté abierto.'
    : ATTACH_FAILED_TEXT
}

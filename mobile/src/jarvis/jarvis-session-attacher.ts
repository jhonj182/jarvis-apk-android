// Finds, or opens, the Claude session of the Jarvis workspace and follows its tab. Plain logic over
// a client, so the hook around it stays thin and this runs in tests with a fake.
import type { RpcClient } from '../transport/rpc-client'
import {
  ATTACH_TIMEOUT_REASON,
  createJarvisAgentSession,
  findJarvisAgentTab,
  jarvisAttachErrorText,
  type JarvisCreateSessionResult,
  type JarvisTabLike,
  type JarvisTabTarget
} from './jarvis-session-attach'

export type JarvisAttachPhase = 'idle' | 'attaching' | 'attached' | 'failed'

export type JarvisAttachState = {
  phase: JarvisAttachPhase
  /** The Claude terminal once attached; its session id arrives when the agent reports it. */
  target: JarvisTabTarget | null
  /** Spanish line for the character; null unless the phase is `failed`. */
  error: string | null
}

export const ATTACH_IDLE: JarvisAttachState = { phase: 'idle', target: null, error: null }

type TabFrame = { type?: unknown; tabs?: unknown; message?: unknown; error?: unknown }

type Dependencies = {
  client: Pick<RpcClient, 'subscribe' | 'sendRequest'>
  worktreeId: string
  /** The host deduplicates session creation by this id, so every retry of one attach reuses it. */
  operationId: string
  /** Mints the id of a session opened after the first one was closed on the desktop. */
  nextOperationId?: () => string
  /** False until the app is unlocked: a session that exists is then found, but none is opened. */
  mayCreate?: boolean
  onChange: (state: JarvisAttachState) => void
  createSession?: typeof createJarvisAgentSession
  /** How long a connected desktop may stay silent before the attach is given up. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 20_000

const isTab = (value: unknown): value is JarvisTabLike =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { type?: unknown }).type === 'string'

const emptyTarget = (terminal: string, tabId: string | null): JarvisTabTarget => ({
  tabId,
  terminal,
  agentBusy: false,
  agentWaiting: false,
  sessionId: null,
  transcriptPath: null
})

export function createJarvisSessionAttacher(deps: Dependencies): {
  stop: () => void
  /** Lets the attacher open sessions, or stops it from doing so, from one moment to the next. */
  setMayCreate: (may: boolean) => void
} {
  const create = deps.createSession ?? createJarvisAgentSession
  let state = ATTACH_IDLE
  let stopped = false
  let answered = false
  let creating = false
  let created: { tabId: string | null; terminal: string } | null = null
  // Why: until the stream has shown the tab once, its absence is the stream lagging behind the creation.
  let createdSeen = false
  let operationId = deps.operationId
  let mayCreate = deps.mayCreate ?? true
  // Why: set when a session would have been opened but may not be yet; the last tabs are kept for that moment.
  let held = false
  let lastTabs: readonly JarvisTabLike[] = []
  let unsubscribe: (() => void) | null = null
  let watchdog: ReturnType<typeof setTimeout> | null = null

  const publish = (patch: Partial<JarvisAttachState>): void => {
    state = { ...state, ...patch }
    deps.onChange(state)
  }

  const teardown = (): void => {
    unsubscribe?.()
    unsubscribe = null
    if (watchdog) {
      clearTimeout(watchdog)
      watchdog = null
    }
  }

  const fail = (reason: string): void => {
    if (stopped) {
      return
    }
    stopped = true
    held = false
    teardown()
    console.warn('Jarvis could not attach to its session', reason)
    publish({ phase: 'failed', target: null, error: jarvisAttachErrorText(reason) })
  }

  const openSession = (): void => {
    creating = true
    void create(deps.client, { worktreeId: deps.worktreeId, operationId }).then(
      (result: JarvisCreateSessionResult) => {
        // Why cleared here: a session may have to be opened again, once the first one is closed.
        creating = false
        if (stopped) {
          return
        }
        if (result.kind === 'failed') {
          fail(result.reason)
          return
        }
        created = { tabId: result.tabId, terminal: result.terminal }
        publish({
          phase: 'attached',
          target: emptyTarget(result.terminal, result.tabId),
          error: null
        })
      },
      (error: unknown) => fail(error instanceof Error ? error.message : String(error))
    )
  }

  const applyTabs = (tabs: readonly JarvisTabLike[]): void => {
    lastTabs = tabs
    const target = findJarvisAgentTab(tabs, created)
    if (target) {
      if (created) {
        createdSeen = true
      }
      held = false
      publish({ phase: 'attached', target, error: null })
      return
    }
    if (creating) {
      return
    }
    // Why: right after a creation the stream can lag behind the response; the tab we opened is still ours.
    if (created && !createdSeen) {
      return
    }
    if (!mayCreate) {
      // Why: nobody has unlocked the app. Opening a session is acting on the desktop; it can wait.
      held = true
      return
    }
    if (created) {
      // Why a new id: the host answers a repeated one with the session it already opened, the one just closed.
      created = null
      createdSeen = false
      operationId = deps.nextOperationId?.() ?? deps.operationId
    }
    openSession()
  }

  const onFrame = (raw: unknown): void => {
    if (stopped) {
      return
    }
    const frame = (typeof raw === 'object' && raw !== null ? raw : {}) as TabFrame
    if (frame.type === 'error') {
      const message = frame.message ?? frame.error
      fail(typeof message === 'string' && message ? message : 'stream_error')
      return
    }
    if (!answered) {
      answered = true
      if (watchdog) {
        clearTimeout(watchdog)
        watchdog = null
      }
    }
    applyTabs(Array.isArray(frame.tabs) ? frame.tabs.filter(isTab) : [])
  }

  publish({ phase: 'attaching', target: null, error: null })
  try {
    unsubscribe = deps.client.subscribe(
      'session.tabs.subscribe',
      { worktree: `id:${deps.worktreeId}` },
      onFrame
    )
    watchdog = setTimeout(() => fail(ATTACH_TIMEOUT_REASON), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }

  return {
    stop() {
      stopped = true
      teardown()
    },
    setMayCreate(may: boolean) {
      mayCreate = may
      if (may && held && !stopped && !creating) {
        // The tabs will not arrive again just because the app was unlocked.
        applyTabs(lastTabs)
      }
    }
  }
}

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import { jarvisOperationIdOf } from './jarvis-session-attach'
import {
  ATTACH_IDLE,
  createJarvisSessionAttacher,
  type JarvisAttachState
} from './jarvis-session-attacher'

export type JarvisSessionAttach = JarvisAttachState & {
  /** True while the session is being found or opened on a connected desktop. */
  attaching: boolean
}

/** Wait before each retry of a failed attach; the last delay repeats no more, the owner is told instead. */
export const ATTACH_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000, 30_000] as const

type Args = {
  client: RpcClient | null
  hostState: ConnectionState
  worktreeId: string | null
  attacher?: typeof createJarvisSessionAttacher
  /** False until the app is unlocked: the session is then only found, never opened. */
  mayCreate?: boolean
}

/** Attaches to the Jarvis session of a workspace and keeps retrying, with backoff, until it does. */
export function useJarvisSessionAttach(args: Args): JarvisSessionAttach {
  const { client, hostState, worktreeId } = args
  const attacher = args.attacher ?? createJarvisSessionAttacher
  const mayCreate = args.mayCreate ?? true
  const session = useRef<ReturnType<typeof createJarvisSessionAttacher> | null>(null)
  const mayCreateNow = useRef(mayCreate)
  mayCreateNow.current = mayCreate
  const [state, setState] = useState<JarvisAttachState>(ATTACH_IDLE)
  const [attempt, setAttempt] = useState(0)
  const [failures, setFailures] = useState(0)
  // Why: one id per desktop and workspace, so the host treats a retried creation as the same request.
  const operationId = useMemo(
    () => jarvisOperationIdOf(Date.now(), Math.random),
    [client, worktreeId]
  )
  const previousHostState = useRef(hostState)

  useEffect(() => {
    if (!client || !worktreeId) {
      return undefined
    }
    const started = attacher({
      client,
      worktreeId,
      operationId,
      // Why a minted id and not the first one: it names the session opened after that one is closed.
      nextOperationId: () => jarvisOperationIdOf(Date.now(), Math.random),
      onChange: setState
    })
    started.setMayCreate(mayCreateNow.current)
    session.current = started
    return () => {
      session.current = null
      started.stop()
    }
  }, [attacher, attempt, client, operationId, worktreeId])

  useEffect(() => {
    // Why told and not restarted: unlocking arrives mid-attach, and a new attacher would wait
    // for the desktop to speak again before it could act.
    session.current?.setMayCreate(mayCreate)
  }, [mayCreate])

  useEffect(() => {
    if (state.phase === 'attached') {
      setFailures(0)
    }
  }, [state.phase])

  useEffect(() => {
    if (
      state.phase !== 'failed' ||
      hostState !== 'connected' ||
      failures >= ATTACH_RETRY_DELAYS_MS.length
    ) {
      return undefined
    }
    const timer = setTimeout(() => {
      setFailures((count) => count + 1)
      setAttempt((count) => count + 1)
    }, ATTACH_RETRY_DELAYS_MS[failures])
    return () => clearTimeout(timer)
  }, [failures, hostState, state.phase])

  useEffect(() => {
    // Why: a failed attach is usually a dropped connection; coming back is the moment to try again.
    const reconnected = previousHostState.current !== 'connected' && hostState === 'connected'
    previousHostState.current = hostState
    if (reconnected && state.phase === 'failed') {
      setFailures(0)
      setAttempt((count) => count + 1)
    }
  }, [hostState, state.phase])

  if (!client || !worktreeId) {
    return { ...ATTACH_IDLE, attaching: false }
  }
  return {
    ...state,
    attaching: hostState === 'connected' && state.phase !== 'attached' && state.phase !== 'failed'
  }
}

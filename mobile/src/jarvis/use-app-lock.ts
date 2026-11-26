import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import { INITIAL_LOCK_STATE, reduceLock, type LockEvent, type LockState } from './lock-policy'

const NO_LOCK_REASON =
  'Este teléfono no tiene bloqueo de pantalla. Configura un PIN, patrón o huella para usar Jarvis.'

/** Past this, a prompt the system has not answered is given up: the app must never be sealed for good. */
export const PROMPT_WATCHDOG_MS = 60_000

export interface AppLockController {
  state: LockState
  unavailableReason: string | null
  unlock: () => void
}

// Why a ref mirror: the prompt resolves long after the last render, and
// lifecycle events must reduce against the newest state, not the one the
// callback happened to close over.
export function useAppLock(): AppLockController {
  const [state, setState] = useState<LockState>(INITIAL_LOCK_STATE)
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null)
  const stateRef = useRef<LockState>(INITIAL_LOCK_STATE)
  const promptingRef = useRef(false)
  // Why: numbers each prompt, so an answer that comes for one already given up counts for nothing.
  const promptRef = useRef(0)

  const apply = useCallback((event: LockEvent) => {
    const transition = reduceLock(stateRef.current, event)
    stateRef.current = transition.state
    setState(transition.state)
    return transition
  }, [])

  const runPrompt = useCallback(async () => {
    if (promptingRef.current) {
      return
    }
    promptingRef.current = true
    const prompt = promptRef.current + 1
    promptRef.current = prompt
    const abandoned = (): boolean => promptRef.current !== prompt
    const watchdog = setTimeout(() => {
      if (abandoned() || stateRef.current !== 'authenticating') {
        return
      }
      promptRef.current += 1
      promptingRef.current = false
      apply('AUTH_FAILURE')
    }, PROMPT_WATCHDOG_MS)
    try {
      const level = await LocalAuthentication.getEnrolledLevelAsync()
      if (abandoned()) {
        return
      }
      if (level === LocalAuthentication.SecurityLevel.NONE) {
        // Why AUTH_FAILURE: it is the machine's only "stay locked without a
        // prompt" path, so a phone with no lock ends disarmed with the reason
        // on screen instead of stuck in a zombie "authenticating" state.
        setUnavailableReason(NO_LOCK_REASON)
        apply('AUTH_FAILURE')
        return
      }
      setUnavailableReason(null)
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloquea Jarvis',
        cancelLabel: 'Cancelar',
        disableDeviceFallback: false,
        requireConfirmation: true
      })
      if (abandoned()) {
        return
      }
      apply(result.success ? 'AUTH_SUCCESS' : 'AUTH_FAILURE')
    } catch {
      if (!abandoned()) {
        apply('AUTH_FAILURE')
      }
    } finally {
      clearTimeout(watchdog)
      if (!abandoned()) {
        promptingRef.current = false
      }
    }
  }, [apply])

  const dispatch = useCallback(
    (event: LockEvent) => {
      if (apply(event).action === 'prompt') {
        void runPrompt()
      }
    },
    [apply, runPrompt]
  )

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        dispatch('APP_ACTIVE')
      } else if (next === 'background') {
        dispatch('APP_BACKGROUND')
      }
    })
    return () => subscription.remove()
  }, [dispatch])

  useEffect(() => {
    // Cold start while already in the foreground: ask right away.
    if (AppState.currentState === 'active') {
      dispatch('APP_ACTIVE')
    }
  }, [dispatch])

  const unlock = useCallback(() => {
    dispatch('USER_UNLOCK')
  }, [dispatch])

  return { state, unavailableReason, unlock }
}

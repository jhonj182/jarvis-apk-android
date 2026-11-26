// Pure state machine for the mandatory app lock. The hook wires it to AppState
// and expo-local-authentication; keeping it pure makes every rule testable
// without a device. See docs/01-prd.md RF-2.

export type LockState = 'locked-armed' | 'locked-disarmed' | 'authenticating' | 'unlocked'

export type LockEvent =
  | 'APP_ACTIVE'
  | 'APP_BACKGROUND'
  | 'AUTH_SUCCESS'
  | 'AUTH_FAILURE'
  | 'USER_UNLOCK'

export type LockAction = 'prompt' | 'none'

export interface LockTransition {
  state: LockState
  action: LockAction
}

export const INITIAL_LOCK_STATE: LockState = 'locked-armed'

const TRANSITIONS: Record<LockState, Partial<Record<LockEvent, LockTransition>>> = {
  // Armed lock asks for the biometric prompt as soon as the app is active:
  // never show content before authenticating.
  'locked-armed': {
    APP_ACTIVE: { state: 'authenticating', action: 'prompt' }
  },
  // The user cancelled the prompt: no auto re-prompt (that loop traps the
  // user). Going to background re-arms; the unlock button asks again.
  'locked-disarmed': {
    USER_UNLOCK: { state: 'authenticating', action: 'prompt' },
    APP_BACKGROUND: { state: 'locked-armed', action: 'none' }
  },
  // Android emits lifecycle events while the biometric prompt is up; both are
  // ignored so the prompt cannot block or trigger another prompt itself.
  authenticating: {
    AUTH_SUCCESS: { state: 'unlocked', action: 'none' },
    AUTH_FAILURE: { state: 'locked-disarmed', action: 'none' }
  },
  // No grace period: leaving the foreground locks immediately.
  unlocked: {
    APP_BACKGROUND: { state: 'locked-armed', action: 'none' }
  }
}

export function reduceLock(state: LockState, event: LockEvent): LockTransition {
  return TRANSITIONS[state][event] ?? { state, action: 'none' }
}

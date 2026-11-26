import { describe, expect, it } from 'vitest'
import { INITIAL_LOCK_STATE, reduceLock, type LockEvent, type LockState } from './lock-policy'

const FILLED: ReadonlyArray<{
  state: LockState
  event: LockEvent
  next: LockState
  action: 'prompt' | 'none'
}> = [
  { state: 'locked-armed', event: 'APP_ACTIVE', next: 'authenticating', action: 'prompt' },
  { state: 'locked-disarmed', event: 'USER_UNLOCK', next: 'authenticating', action: 'prompt' },
  { state: 'locked-disarmed', event: 'APP_BACKGROUND', next: 'locked-armed', action: 'none' },
  { state: 'authenticating', event: 'AUTH_SUCCESS', next: 'unlocked', action: 'none' },
  { state: 'authenticating', event: 'AUTH_FAILURE', next: 'locked-disarmed', action: 'none' },
  { state: 'unlocked', event: 'APP_BACKGROUND', next: 'locked-armed', action: 'none' }
]

const STATES: readonly LockState[] = [
  'locked-armed',
  'locked-disarmed',
  'authenticating',
  'unlocked'
]
const EVENTS: readonly LockEvent[] = [
  'APP_ACTIVE',
  'APP_BACKGROUND',
  'AUTH_SUCCESS',
  'AUTH_FAILURE',
  'USER_UNLOCK'
]

describe('reduceLock', () => {
  it('starts locked and armed, so no content shows before authenticating', () => {
    expect(INITIAL_LOCK_STATE).toBe('locked-armed')
  })

  it.each(FILLED)(
    '$state + $EVENT goes to $next with action $action',
    ({ state, event, next, action }) => {
      expect(reduceLock(state, event)).toEqual({ state: next, action })
    }
  )

  it('leaves every other cell untouched with action none', () => {
    const filled = new Set(FILLED.map(({ state, event }) => `${state}+${event}`))
    for (const state of STATES) {
      for (const event of EVENTS) {
        if (filled.has(`${state}+${event}`)) {
          continue
        }
        expect(reduceLock(state, event)).toEqual({ state, action: 'none' })
      }
    }
  })

  // Why: the biometric prompt makes Android emit lifecycle events; the cancelled
  // flow must end disarmed without a second prompt that traps the user.
  it('survives the cancel flow: background noise during the prompt, one prompt only', () => {
    let current: LockState = INITIAL_LOCK_STATE
    let prompts = 0
    for (const event of [
      'APP_ACTIVE',
      'APP_BACKGROUND',
      'APP_ACTIVE',
      'AUTH_FAILURE',
      'APP_ACTIVE'
    ] as const) {
      const transition = reduceLock(current, event)
      if (transition.action === 'prompt') {
        prompts += 1
      }
      current = transition.state
    }
    expect(current).toBe('locked-disarmed')
    expect(prompts).toBe(1)
  })
})

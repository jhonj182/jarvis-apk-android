import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import type * as LocalAuthentication from 'expo-local-authentication'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppLock } from './use-app-lock'

type AuthResult = LocalAuthentication.LocalAuthenticationResult

const mocks = vi.hoisted(() => ({
  authenticateAsync: vi.fn(),
  enrolledLevel: { value: 3 },
  remove: vi.fn(),
  appState: { current: 'active' }
}))

let appStateListener: ((next: string) => void) | null = null

vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return mocks.appState.current
    },
    addEventListener: (_event: 'change', listener: (next: string) => void) => {
      appStateListener = listener
      return { remove: mocks.remove }
    }
  }
}))

vi.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC: 2, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: () => Promise.resolve(mocks.enrolledLevel.value),
  authenticateAsync: (options: unknown) => mocks.authenticateAsync(options)
}))

let controller: ReturnType<typeof useAppLock> | null = null

function Harness(): null {
  controller = useAppLock()
  return null
}

describe('useAppLock', () => {
  let renderer: ReactTestRenderer | undefined

  const mount = async (): Promise<void> => {
    await act(async () => {
      renderer = create(createElement(Harness))
    })
  }

  const fire = async (next: string): Promise<void> => {
    await act(async () => {
      appStateListener?.(next)
    })
  }

  beforeEach(() => {
    mocks.appState.current = 'active'
    mocks.enrolledLevel.value = 3
    mocks.authenticateAsync.mockReset()
    mocks.authenticateAsync.mockResolvedValue({ success: true })
    appStateListener = null
  })

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = undefined
    controller = null
  })

  it('prompts as soon as it mounts while active, with the app lock wording', async () => {
    mocks.authenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' })
    await mount()
    expect(mocks.authenticateAsync).toHaveBeenCalledTimes(1)
    expect(mocks.authenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'Desbloquea Jarvis',
      cancelLabel: 'Cancelar',
      disableDeviceFallback: false,
      requireConfirmation: true
    })
  })

  it('does not prompt at mount when the app is not active yet', async () => {
    mocks.appState.current = 'background'
    await mount()
    expect(mocks.authenticateAsync).not.toHaveBeenCalled()
    expect(controller?.state).toBe('locked-armed')
    await fire('active')
    expect(mocks.authenticateAsync).toHaveBeenCalledTimes(1)
  })

  it('unlocks on success and clears any past reason', async () => {
    await mount()
    expect(controller?.state).toBe('unlocked')
    expect(controller?.unavailableReason).toBeNull()
  })

  it('stays disarmed after a cancelled prompt, ignoring active and inactive', async () => {
    mocks.authenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' })
    await mount()
    expect(controller?.state).toBe('locked-disarmed')
    await fire('active')
    await fire('inactive')
    expect(mocks.authenticateAsync).toHaveBeenCalledTimes(1)
    expect(controller?.state).toBe('locked-disarmed')
  })

  it('asks again after leaving and returning from the background', async () => {
    await mount()
    expect(controller?.state).toBe('unlocked')
    await fire('background')
    expect(controller?.state).toBe('locked-armed')
    await fire('active')
    expect(mocks.authenticateAsync).toHaveBeenCalledTimes(2)
    expect(controller?.state).toBe('unlocked')
  })

  it('treats a thrown prompt as a failure and stays locked', async () => {
    mocks.authenticateAsync.mockRejectedValue(new Error('sensor offline'))
    await mount()
    expect(controller?.state).toBe('locked-disarmed')
    expect(mocks.authenticateAsync).toHaveBeenCalledTimes(1)
  })

  it('never prompts and explains when the device has no lock method at all', async () => {
    mocks.enrolledLevel.value = 0
    await mount()
    expect(mocks.authenticateAsync).not.toHaveBeenCalled()
    expect(controller?.state).toBe('locked-disarmed')
    expect(controller?.unavailableReason).toBe(
      'Este teléfono no tiene bloqueo de pantalla. Configura un PIN, patrón o huella para usar Jarvis.'
    )
  })

  it('recovers the reason once a lock method exists again', async () => {
    mocks.enrolledLevel.value = 0
    await mount()
    expect(controller?.unavailableReason).not.toBeNull()
    mocks.enrolledLevel.value = 1
    await act(async () => {
      controller?.unlock()
    })
    expect(controller?.unavailableReason).toBeNull()
    expect(mocks.authenticateAsync).toHaveBeenCalledTimes(1)
  })

  it('keeps unlock stable across renders and uses it to ask again', async () => {
    mocks.authenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' })
    await mount()
    const unlockSeenAtMount = controller?.unlock
    await act(async () => {
      renderer?.update(createElement(Harness))
    })
    expect(controller?.unlock).toBe(unlockSeenAtMount)
    mocks.authenticateAsync.mockResolvedValue({ success: true })
    await act(async () => {
      controller?.unlock()
    })
    expect(mocks.authenticateAsync).toHaveBeenCalledTimes(2)
    expect(controller?.state).toBe('unlocked')
  })

  // Why: a slow sensor plus an eager tap must not stack prompts on top of each other.
  it('does not stack a second prompt while one is already in flight', async () => {
    let release: ((value: AuthResult) => void) | undefined
    mocks.authenticateAsync.mockImplementation(
      () =>
        new Promise<AuthResult>((resolve) => {
          release = resolve
        })
    )
    await mount()
    expect(controller?.state).toBe('authenticating')
    await act(async () => {
      controller?.unlock()
      controller?.unlock()
    })
    expect(mocks.authenticateAsync).toHaveBeenCalledTimes(1)
    await act(async () => {
      release?.({ success: true })
    })
    expect(controller?.state).toBe('unlocked')
  })
})

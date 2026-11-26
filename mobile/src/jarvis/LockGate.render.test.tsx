import { createElement, type ReactNode } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { Modal, Pressable, Text, View } from 'react-native'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MIN_TOUCH_TARGET } from '../theme/mobile-theme'
import { LockGate } from './LockGate'
import type { AppLockController, LockState } from './use-app-lock'
import { useLockState } from './use-lock-state'

const lock = vi.hoisted(() => ({ controller: null as AppLockController | null }))

vi.mock('./use-app-lock', () => ({
  useAppLock: () => lock.controller
}))

// Why a stand-in for the window: the real Modal renders into document.body through a portal,
// and the test renderer cannot follow it there. What is asserted is the contract with React
// Native: the cover asks for a native window of its own, visible only while locked, that keeps
// its content mounted where the gate can reach it.
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>()
  const Modal = ({
    visible,
    onRequestClose,
    children
  }: {
    visible: boolean
    onRequestClose: () => void
    children: ReactNode
  }) => (visible ? createElement('ModalWindow', { onRequestClose }, children) : null)
  return { ...actual, Modal }
})

function given(state: LockState, over: Partial<AppLockController> = {}): AppLockController {
  lock.controller = { state, unavailableReason: null, unlock: vi.fn(), ...over }
  return lock.controller
}

/** Stands for anything that runs under the gate and has to know whether the app is locked. */
function ReadsTheLock() {
  return <Text>{`lock:${useLockState()}`}</Text>
}

function flatStyle(style: unknown): Record<string, unknown> {
  const list = Array.isArray(style) ? style : style == null ? [] : [style]
  return list.reduce<Record<string, unknown>>((merged, one) => Object.assign(merged, one), {})
}

describe('LockGate', () => {
  let renderer: ReactTestRenderer | undefined

  const mount = (child?: ReactNode): void => {
    act(() => {
      renderer = create(<LockGate>{child ?? <Text>SECRETO</Text>}</LockGate>)
    })
  }

  // Why the child and not the character slot: what learns the lock state is the app itself.
  const mountChild = (child: ReactNode, character?: ReactNode): void => {
    act(() => {
      renderer = create(<LockGate character={character}>{child}</LockGate>)
    })
  }

  // Why walking every descendant: react-native-web renders Text content through
  // internal wrappers, so the string children do not sit on the Text instance.
  const textsOf = (node: ReactTestInstance): string[] =>
    node
      .findAll(() => true)
      .flatMap((one) => one.children)
      .filter((child): child is string => typeof child === 'string')

  const texts = (): string[] => textsOf(renderer!.root)

  const hiddenContentWrapper = (): ReactTestInstance | undefined =>
    renderer?.root
      .findAllByType(View)
      .find((node) => node.props.accessibilityElementsHidden === true)

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = undefined
    lock.controller = null
  })

  it('mounts the children while locked but covers them and hides them from screen readers', () => {
    given('locked-disarmed')
    mount()
    expect(texts()).toContain('SECRETO')
    expect(texts()).toContain('Jarvis está descansando')
    const wrapper = hiddenContentWrapper()
    expect(wrapper).toBeDefined()
    expect(wrapper?.props.importantForAccessibility).toBe('no-hide-descendants')
    expect(textsOf(wrapper!)).toContain('SECRETO')
  })

  it('shows the app once unlocked, with no cover and nothing hidden', () => {
    given('unlocked')
    mount()
    expect(texts()).toContain('SECRETO')
    expect(texts()).not.toContain('Jarvis está descansando')
    expect(hiddenContentWrapper()).toBeUndefined()
  })

  it('unlocks through a Desbloquear button that meets the minimum touch target', () => {
    const controller = given('locked-disarmed')
    mount()
    const buttons = renderer!.root.findAllByType(Pressable)
    expect(buttons).toHaveLength(1)
    const style = flatStyle(buttons[0]!.props.style)
    expect(style.minWidth).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET)
    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET)
    act(() => buttons[0]!.props.onPress())
    expect(controller.unlock).toHaveBeenCalledTimes(1)
  })

  it('keeps the button to the disarmed state: armed and authenticating show no way in', () => {
    given('locked-armed')
    mount()
    expect(renderer!.root.findAllByType(Pressable)).toHaveLength(0)
    given('authenticating')
    mount()
    expect(renderer!.root.findAllByType(Pressable)).toHaveLength(0)
    expect(texts()).toContain('Comprobando que eres tú…')
  })

  it('shows the reason when the device cannot protect the app at all', () => {
    const reason =
      'Este teléfono no tiene bloqueo de pantalla. Configura un PIN, patrón o huella para usar Jarvis.'
    given('locked-disarmed', { unavailableReason: reason })
    mount()
    expect(texts()).toContain(reason)
    // Why nothing to press: on a phone with no lock of its own the prompt would fail again.
    expect(renderer!.root.findAllByType(Pressable)).toHaveLength(0)
    expect(texts()).not.toContain('Toca Desbloquear para entrar.')
  })

  // Why its own native window and not a View laid over the app: the app's drawers are native
  // modals too, and no View of ours can cover one. A drawer left open would stay visible and
  // tappable above the lock, and the Back button would still reach the app behind it (RF-2.1).
  it('covers the app with its own native window, which also takes the Back button', () => {
    given('locked-disarmed')
    mountChild(<ReadsTheLock />)
    const windows = renderer!.root.findAllByType(Modal)
    expect(windows).toHaveLength(1)
    expect(windows[0]!.props.visible).toBe(true)
    expect(windows[0]!.props.transparent).toBe(false)
    expect(windows[0]!.props.onRequestClose()).toBeUndefined()
    expect(texts()).toContain('Jarvis está descansando')

    given('unlocked')
    mountChild(<ReadsTheLock />)
    expect(renderer!.root.findAllByType(Modal)).toHaveLength(0)
    expect(texts()).toContain('lock:unlocked')
  })

  it('renders the character slot integration passes in', () => {
    given('locked-disarmed')
    mountChild(<Text>SECRETO</Text>, <Text>PERSONAJE</Text>)
    expect(texts()).toContain('PERSONAJE')
    expect(texts()).toContain('Jarvis está descansando')
  })

  it('tells the app under it that it is locked, and that it is open again', () => {
    given('locked-armed')
    mountChild(<ReadsTheLock />)
    expect(texts()).toContain('lock:locked-armed')

    given('unlocked')
    mountChild(<ReadsTheLock />)
    expect(texts()).toContain('lock:unlocked')
  })
})

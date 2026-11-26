import type { ReactNode } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { Pressable, Text, View } from 'react-native'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MIN_TOUCH_TARGET } from '../theme/mobile-theme'
import { LockGate } from './LockGate'
import type { AppLockController, LockState } from './use-app-lock'

const lock = vi.hoisted(() => ({ controller: null as AppLockController | null }))

vi.mock('./use-app-lock', () => ({
  useAppLock: () => lock.controller
}))

function given(state: LockState, over: Partial<AppLockController> = {}): AppLockController {
  lock.controller = { state, unavailableReason: null, unlock: vi.fn(), ...over }
  return lock.controller
}

function flatStyle(style: unknown): Record<string, unknown> {
  const list = Array.isArray(style) ? style : style == null ? [] : [style]
  return list.reduce<Record<string, unknown>>((merged, one) => Object.assign(merged, one), {})
}

describe('LockGate', () => {
  let renderer: ReactTestRenderer | undefined

  const mount = (character?: ReactNode): void => {
    act(() => {
      renderer = create(
        <LockGate character={character}>
          <Text>SECRETO</Text>
        </LockGate>
      )
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
    expect(texts()).toContain('Jarvis está bloqueado')
    const wrapper = hiddenContentWrapper()
    expect(wrapper).toBeDefined()
    expect(wrapper?.props.importantForAccessibility).toBe('no-hide-descendants')
    expect(textsOf(wrapper!)).toContain('SECRETO')
  })

  it('shows the app once unlocked, with no cover and nothing hidden', () => {
    given('unlocked')
    mount()
    expect(texts()).toContain('SECRETO')
    expect(texts()).not.toContain('Jarvis está bloqueado')
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
    given('locked-disarmed', {
      unavailableReason:
        'Este teléfono no tiene bloqueo de pantalla. Configura un PIN, patrón o huella para usar Jarvis.'
    })
    mount()
    expect(texts()).toContain(
      'Este teléfono no tiene bloqueo de pantalla. Configura un PIN, patrón o huella para usar Jarvis.'
    )
  })

  it('renders the character slot integration passes in', () => {
    given('locked-disarmed')
    mount(<Text>PERSONAJE</Text>)
    expect(texts()).toContain('PERSONAJE')
    expect(texts()).toContain('Jarvis está bloqueado')
  })
})

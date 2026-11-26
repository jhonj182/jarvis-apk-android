import { createElement, type ReactElement } from 'react'
import { act, create, type ReactTestInstance } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  JarvisPreferencesController,
  JarvisWorkspaceOption,
  JarvisWorkspaceOptions,
  JarvisWorkspaceRef
} from '../jarvis-contract'
import { JARVIS_MIN_TOUCH_TARGET } from '../jarvis-theme'
import { jarvisCopy } from './jarvis-copy'
import { JarvisSettingsPanel, type JarvisSettingsPanelProps } from './JarvisSettingsPanel'
import { JarvisWorkspacePicker } from './JarvisWorkspacePicker'

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  View: 'View',
  Switch: 'Switch',
  Platform: { OS: 'android' },
  Text: 'Text',
  TextInput: 'TextInput',
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1, scale: 1 }),
  StyleSheet: { create: <T,>(styles: T) => styles }
}))
vi.mock('lucide-react-native', () => ({
  Check: 'Check',
  ChevronLeft: 'ChevronLeft',
  ChevronRight: 'ChevronRight',
  Lock: 'Lock'
}))

type FlatStyle = Record<string, unknown>

// Why a module array and not a local `| null`: the type-aware lint cannot resolve that union.
const unmounts: (() => void)[] = []

function render(element: ReactElement): ReactTestInstance {
  let readRoot!: () => ReactTestInstance
  act(() => {
    const renderer = create(element)
    unmounts.push(() => renderer.unmount())
    readRoot = () => renderer.root
  })
  return readRoot()
}

function flattenStyle(style: unknown): FlatStyle {
  if (typeof style === 'function') {
    return flattenStyle(style({ pressed: false }))
  }
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map(flattenStyle))
  }
  return style && typeof style === 'object' ? (style as FlatStyle) : {}
}

function heightOf(node: ReactTestInstance): number {
  const style = flattenStyle(node.props.style)
  return Number(style.height ?? style.minHeight ?? 0)
}

function pressables(root: ReactTestInstance): ReactTestInstance[] {
  return root.findAll((node) => node.type === 'Pressable')
}

function byLabel(root: ReactTestInstance, label: string): ReactTestInstance {
  const found = pressables(root).filter((node) => node.props.accessibilityLabel === label)
  if (found.length !== 1) {
    throw new Error(`expected exactly one control called "${label}", found ${found.length}`)
  }
  return found[0]!
}

function textsOf(root: ReactTestInstance): string[] {
  return root.findAllByType('Text').map((node) => node.children.join(''))
}

const JARVIS: JarvisWorkspaceRef = { hostId: 'fedora', worktreeId: 'wt-jarvis', name: 'jarvis' }

function option(
  hostId: string,
  hostName: string,
  worktreeId: string,
  name: string
): JarvisWorkspaceOption {
  return { hostId, hostName, worktreeId, name }
}

const OPTIONS: JarvisWorkspaceOption[] = [
  option('fedora', 'fedora', 'wt-jarvis', 'jarvis'),
  option('fedora', 'fedora', 'wt-orca', 'orca'),
  option('macbook', 'macbook', 'wt-sarlaft', 'sarlaft')
]

function controller(
  overrides: Partial<JarvisPreferencesController> = {}
): JarvisPreferencesController {
  return {
    preferences: { workspace: JARVIS, speechEnabled: true },
    setWorkspace: vi.fn(async () => {}),
    setSpeechEnabled: vi.fn(async () => {}),
    ...overrides
  }
}

function listing(overrides: Partial<JarvisWorkspaceOptions> = {}): JarvisWorkspaceOptions {
  return { options: OPTIONS, loading: false, error: null, refresh: vi.fn(), ...overrides }
}

function panelProps(overrides: Partial<JarvisSettingsPanelProps> = {}): JarvisSettingsPanelProps {
  return {
    controller: controller(),
    options: listing(),
    topInset: 0,
    bottomInset: 0,
    onBack: vi.fn(),
    onOpenVoiceSettings: vi.fn(),
    onScanPairingCode: vi.fn(),
    ...overrides
  }
}

afterEach(() => {
  act(() => unmounts.splice(0).forEach((unmount) => unmount()))
  vi.clearAllMocks()
})

describe('JarvisWorkspacePicker', () => {
  it('groups the workspaces under their desktop, in the order the desktops appear', () => {
    const root = render(
      createElement(JarvisWorkspacePicker, { controller: controller(), options: listing() })
    )
    expect(textsOf(root)).toEqual(['fedora', 'jarvis', 'orca', 'macbook', 'sarlaft'])
    const radios = pressables(root).map((node) => node.props.accessibilityRole)
    expect(radios).toEqual(['radio', 'radio', 'radio'])
  })

  it('marks the chosen workspace and reports the choice as a radio group', () => {
    const root = render(
      createElement(JarvisWorkspacePicker, { controller: controller(), options: listing() })
    )
    const jarvis = byLabel(root, 'jarvis')
    expect(jarvis.props.accessibilityState).toEqual({ checked: true, disabled: false })
    expect(byLabel(root, 'orca').props.accessibilityState.checked).toBe(false)
    expect(
      root.findAll((node) => node.type === 'View' && node.props.accessibilityRole === 'radiogroup')
    ).toHaveLength(1)
  })

  it('tells the engine when another workspace is chosen', async () => {
    const preferences = controller()
    const root = render(
      createElement(JarvisWorkspacePicker, { controller: preferences, options: listing() })
    )
    await act(async () => byLabel(root, 'sarlaft').props.onPress())
    expect(preferences.setWorkspace).toHaveBeenCalledWith({
      hostId: 'macbook',
      worktreeId: 'wt-sarlaft',
      name: 'sarlaft'
    })
  })

  it('leaves the engine alone when the workspace already chosen is tapped', () => {
    const preferences = controller()
    const root = render(
      createElement(JarvisWorkspacePicker, { controller: preferences, options: listing() })
    )
    act(() => byLabel(root, 'jarvis').props.onPress())
    expect(preferences.setWorkspace).not.toHaveBeenCalled()
  })

  it('says when the choice could not be saved', async () => {
    const preferences = controller({
      setWorkspace: vi.fn(async () => {
        throw new Error('disk')
      })
    })
    const root = render(
      createElement(JarvisWorkspacePicker, { controller: preferences, options: listing() })
    )
    await act(async () => byLabel(root, 'orca').props.onPress())
    expect(textsOf(root)).toContain(jarvisCopy.settingsScreen.saveFailed)
  })

  it('asks to retry when the desktops cannot be listed', () => {
    const options = listing({ options: [], error: 'offline' })
    const root = render(createElement(JarvisWorkspacePicker, { controller: controller(), options }))
    expect(textsOf(root)).toContain(jarvisCopy.settingsScreen.workspaceError)
    const retry = byLabel(root, jarvisCopy.settingsScreen.retry)
    expect(heightOf(retry)).toBeGreaterThanOrEqual(JARVIS_MIN_TOUCH_TARGET)
    act(() => retry.props.onPress())
    expect(options.refresh).toHaveBeenCalledTimes(1)
  })

  it('offers to scan a code when no desktop is paired', () => {
    const onScanPairingCode = vi.fn()
    const root = render(
      createElement(JarvisWorkspacePicker, {
        controller: controller(),
        options: listing({ options: [] }),
        onScanPairingCode
      })
    )
    expect(textsOf(root)).toContain(jarvisCopy.settingsScreen.workspaceEmpty)
    const scan = byLabel(root, jarvisCopy.settingsScreen.scan)
    expect(heightOf(scan)).toBeGreaterThanOrEqual(JARVIS_MIN_TOUCH_TARGET)
    act(() => scan.props.onPress())
    expect(onScanPairingCode).toHaveBeenCalledTimes(1)
  })

  it('waits without offering anything while the desktops are still loading', () => {
    const root = render(
      createElement(JarvisWorkspacePicker, {
        controller: controller(),
        options: listing({ options: [], loading: true }),
        onScanPairingCode: vi.fn()
      })
    )
    expect(textsOf(root)).toEqual([jarvisCopy.settingsScreen.workspaceLoading])
    expect(pressables(root)).toHaveLength(0)
  })
})

describe('JarvisSettingsPanel', () => {
  it('is called "Ajustes de Jarvis" and goes back', () => {
    const props = panelProps()
    const root = render(createElement(JarvisSettingsPanel, props))
    expect(textsOf(root)).toContain(jarvisCopy.settings)
    const back = byLabel(root, jarvisCopy.back)
    expect(heightOf(back)).toBeGreaterThanOrEqual(JARVIS_MIN_TOUCH_TARGET)
    act(() => back.props.onPress())
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })

  it('reads aloud or not as the switch says, and writes the state when it is off', async () => {
    const preferences = controller()
    const root = render(createElement(JarvisSettingsPanel, panelProps({ controller: preferences })))
    const readAloud = byLabel(root, jarvisCopy.settingsScreen.readAloud)
    expect(readAloud.props.accessibilityRole).toBe('switch')
    expect(readAloud.props.accessibilityState.checked).toBe(true)
    expect(textsOf(root)).not.toContain(jarvisCopy.settingsScreen.readAloudOff)

    await act(async () => readAloud.props.onPress())
    expect(preferences.setSpeechEnabled).toHaveBeenCalledWith(false)
  })

  it('names the off state in text', () => {
    const root = render(
      createElement(
        JarvisSettingsPanel,
        panelProps({
          controller: controller({ preferences: { workspace: JARVIS, speechEnabled: false } })
        })
      )
    )
    expect(textsOf(root)).toContain(jarvisCopy.settingsScreen.readAloudOff)
    expect(
      byLabel(root, jarvisCopy.settingsScreen.readAloud).props.accessibilityState.checked
    ).toBe(false)
  })

  it('opens the voice settings and explains they live on the desktop', () => {
    const props = panelProps()
    const root = render(createElement(JarvisSettingsPanel, props))
    expect(textsOf(root)).toContain(jarvisCopy.settingsScreen.voiceExplanation)
    const voice = byLabel(
      root,
      `${jarvisCopy.settingsScreen.voice}. ${jarvisCopy.settingsScreen.voiceExplanation}`
    )
    act(() => voice.props.onPress())
    expect(props.onOpenVoiceSettings).toHaveBeenCalledTimes(1)
  })

  it('explains the biometric lock', () => {
    const root = render(createElement(JarvisSettingsPanel, panelProps()))
    expect(textsOf(root)).toContain(jarvisCopy.settingsScreen.lock)
  })

  it('keeps every control at least 44 tall', () => {
    const root = render(createElement(JarvisSettingsPanel, panelProps()))
    for (const control of pressables(root)) {
      expect(heightOf(control), control.props.accessibilityLabel).toBeGreaterThanOrEqual(
        JARVIS_MIN_TOUCH_TARGET
      )
    }
  })

  it('sends the owner to scan a code from settings when no desktop is paired', () => {
    const props = panelProps({ options: listing({ options: [] }) })
    const root = render(createElement(JarvisSettingsPanel, props))
    act(() => byLabel(root, jarvisCopy.settingsScreen.scan).props.onPress())
    expect(props.onScanPairingCode).toHaveBeenCalledTimes(1)
  })
})

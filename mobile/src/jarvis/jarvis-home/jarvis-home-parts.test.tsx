import { createElement, type ReactElement } from 'react'
import type { FlatList, FlatListProps, ListRenderItemInfo } from 'react-native'
import { act, create, type ReactTestInstance } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JarvisConversation, JarvisMessage } from '../jarvis-contract'
import { JARVIS_MIN_TOUCH_TARGET, JARVIS_TALK_BUTTON_MIN_SIZE } from '../jarvis-theme'
import { triggerMediumImpact, triggerSelection } from '../../platform/haptics'
import { JarvisComposer } from './JarvisComposer'
import { JarvisHomeScreen, type JarvisHomeScreenProps } from './JarvisHomeScreen'
import { JarvisQuickActions } from './JarvisQuickActions'
import { JarvisSetupNotice } from './JarvisSetupNotice'
import { JarvisStage } from './JarvisStage'
import { JarvisStatusBar } from './JarvisStatusBar'
import { JarvisTranscript } from './JarvisTranscript'

const list = vi.hoisted(() => ({ scrollToOffset: vi.fn() }))
// Why held in a hoisted object: the mock of react-native below is hoisted too, and the tests
// need to open and close the keyboard and to see whether it was dismissed.
const keyboard = vi.hoisted(() => ({
  listeners: new Map<string, () => void>(),
  dismiss: vi.fn()
}))

vi.mock('react-native', async () => {
  const { createElement, forwardRef, useImperativeHandle } = await import('react')
  // Why a stand-in that draws its rows: the real list virtualizes on a native view. Here the
  // rows must exist to be read, and scrollToOffset has to be observable.
  const flatList = forwardRef<FlatList<unknown>, FlatListProps<unknown>>((props, ref) => {
    useImperativeHandle(ref, () => ({ scrollToOffset: list.scrollToOffset }))
    const { data, renderItem } = props
    const rows = (data ?? []).map((item, index) =>
      createElement(
        'View',
        { key: String(index) },
        renderItem({ item, index } as ListRenderItemInfo<unknown>)
      )
    )
    // Why every prop again on the host: the list's own settings (inverted, data) are under test.
    return createElement('FlatList', props, ...rows)
  })
  return {
    Pressable: 'Pressable',
    View: 'View',
    Switch: 'Switch',
    FlatList: flatList,
    Keyboard: {
      addListener: (type: string, handler: () => void) => {
        keyboard.listeners.set(type, handler)
        return { remove: () => keyboard.listeners.delete(type) }
      },
      dismiss: keyboard.dismiss
    },
    Platform: { OS: 'android' },
    Text: 'Text',
    TextInput: 'TextInput',
    useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1, scale: 1 }),
    StyleSheet: { create: <T,>(styles: T) => styles }
  }
})
vi.mock('lucide-react-native', () => ({
  Check: 'Check',
  ChevronLeft: 'ChevronLeft',
  ChevronRight: 'ChevronRight',
  Mic: 'Mic',
  RefreshCw: 'RefreshCw',
  Send: 'Send',
  Settings: 'Settings'
}))
vi.mock('../../platform/haptics', () => ({
  triggerMediumImpact: vi.fn(),
  triggerSelection: vi.fn()
}))
vi.mock('./use-clock-time', () => ({ useClockTime: () => '09:41' }))
vi.mock('./use-display-font', () => ({
  useJarvisDisplayFont: () => ({ fontFamily: 'ChakraPetch-SemiBold' })
}))
vi.mock('../character/JarvisCharacter', () => ({ JarvisCharacter: 'JarvisCharacter' }))

type FlatStyle = Record<string, unknown>

// Why a union held in a module variable: holding the renderer in a `| null` union trips the
// type-aware lint, which cannot resolve its type (same as src/components/touch-targets.test.tsx).
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

/** The same tree, updated in place: what a new message does to a list already on screen. */
function mount(element: ReactElement): {
  root: () => ReactTestInstance
  update: (next: ReactElement) => void
} {
  let renderer!: ReturnType<typeof create>
  act(() => {
    renderer = create(element)
    unmounts.push(() => renderer.unmount())
  })
  return {
    root: () => renderer.root,
    update: (next) => {
      act(() => renderer.update(next))
    }
  }
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

function pressableByLabel(root: ReactTestInstance, label: string): ReactTestInstance {
  return root.find((node) => node.type === 'Pressable' && node.props.accessibilityLabel === label)
}

function textsOf(root: ReactTestInstance): string[] {
  return root.findAllByType('Text').map((node) => node.children.join(''))
}

function size(node: ReactTestInstance): { width: number; height: number } {
  const style = flattenStyle(node.props.style)
  return {
    width: Number(style.width ?? style.minWidth ?? 0),
    height: Number(style.height ?? style.minHeight ?? 0)
  }
}

function message(
  id: string,
  role: JarvisMessage['role'],
  text: string,
  streaming = false
): JarvisMessage {
  return { id, role, text, streaming }
}

function conversation(overrides: Partial<JarvisConversation> = {}): JarvisConversation {
  return {
    activity: 'idle',
    statusText: '¿Qué necesitas?',
    messages: [],
    connected: true,
    setupNeed: null,
    speechEnabled: true,
    startListening: vi.fn(),
    stopListening: vi.fn(),
    sendText: vi.fn(),
    toggleSpeech: vi.fn(),
    stopSpeaking: vi.fn(),
    ...overrides
  }
}

function homeProps(overrides: Partial<JarvisHomeScreenProps> = {}): JarvisHomeScreenProps {
  return {
    conversation: conversation(),
    focused: true,
    topInset: 0,
    bottomInset: 0,
    onOpenSettings: vi.fn(),
    onOpenOrca: vi.fn(),
    onOpenPairing: vi.fn(),
    onOpenWorkspaceSettings: vi.fn(),
    onOpenVoiceSettings: vi.fn(),
    ...overrides
  }
}

beforeEach(() => {
  list.scrollToOffset.mockReset()
  keyboard.listeners.clear()
})

afterEach(() => {
  act(() => unmounts.splice(0).forEach((unmount) => unmount()))
  vi.clearAllMocks()
})

describe('JarvisComposer', () => {
  const composerProps = (overrides: Partial<React.ComponentProps<typeof JarvisComposer>> = {}) => ({
    listening: false,
    talkDisabled: false,
    keyboardDisabled: false,
    bottomInset: 0,
    onStartTalking: vi.fn(),
    onStopTalking: vi.fn(),
    onSend: vi.fn(),
    ...overrides
  })

  it('starts listening on press-in and stops on press-out, with a haptic on each', () => {
    const props = composerProps()
    const root = render(createElement(JarvisComposer, props))
    const talk = pressableByLabel(root, 'Micrófono')

    act(() => talk.props.onPressIn())
    expect(props.onStartTalking).toHaveBeenCalledTimes(1)
    expect(triggerMediumImpact).toHaveBeenCalledTimes(1)
    expect(props.onStopTalking).not.toHaveBeenCalled()

    act(() => talk.props.onPressOut())
    expect(props.onStopTalking).toHaveBeenCalledTimes(1)
    expect(triggerSelection).toHaveBeenCalledTimes(1)
  })

  it('closes the keyboard when the microphone is pressed, so the character comes back', () => {
    const root = render(createElement(JarvisComposer, composerProps()))
    act(() => pressableByLabel(root, 'Micrófono').props.onPressIn())
    expect(keyboard.dismiss).toHaveBeenCalledTimes(1)
  })

  it('does not start while it is thinking', () => {
    const props = composerProps({ talkDisabled: true })
    const root = render(createElement(JarvisComposer, props))
    const talk = pressableByLabel(root, 'Micrófono')
    expect(talk.props.disabled).toBe(true)

    act(() => talk.props.onPressIn())
    expect(props.onStartTalking).not.toHaveBeenCalled()
    expect(triggerMediumImpact).not.toHaveBeenCalled()
  })

  it('ignores a press-out that never pressed in', () => {
    const props = composerProps()
    const root = render(createElement(JarvisComposer, props))
    act(() => pressableByLabel(root, 'Micrófono').props.onPressOut())
    expect(props.onStopTalking).not.toHaveBeenCalled()
  })

  it('stops listening if it unmounts while still held', () => {
    const props = composerProps()
    const view = mount(createElement(JarvisComposer, props))
    const talk = pressableByLabel(view.root(), 'Micrófono')
    act(() => talk.props.onPressIn())
    act(() => unmounts.splice(0).forEach((unmount) => unmount()))
    expect(props.onStopTalking).toHaveBeenCalledTimes(1)
  })

  it('sends the trimmed text and clears the draft', () => {
    const props = composerProps()
    const root = render(createElement(JarvisComposer, props))
    const input = root.findByType('TextInput')
    act(() => input.props.onChangeText('  Hola Jarvis  '))
    const send = pressableByLabel(root, 'Enviar')
    expect(send.props.disabled).toBe(false)

    act(() => send.props.onPress())
    expect(props.onSend).toHaveBeenCalledWith('Hola Jarvis')
    expect(root.findByType('TextInput').props.value).toBe('')
  })

  it('will not send an empty message or type when no workspace is chosen', () => {
    const root = render(createElement(JarvisComposer, composerProps()))
    act(() => root.findByType('TextInput').props.onChangeText('   '))
    const send = pressableByLabel(root, 'Enviar')
    expect(send.props.disabled).toBe(true)

    act(() => send.props.onPress())
    expect(root.findByType('TextInput').props.value).toBe('   ')
  })

  it('locks the keyboard while the desktop or the workspace is missing', () => {
    const root = render(createElement(JarvisComposer, composerProps({ keyboardDisabled: true })))
    expect(root.findByType('TextInput').props.editable).toBe(false)
  })

  it('sizes the talk button at 72 or more and every other control at 44 or more', () => {
    const root = render(createElement(JarvisComposer, composerProps()))
    const talk = size(pressableByLabel(root, 'Micrófono'))
    expect(talk.width).toBeGreaterThanOrEqual(JARVIS_TALK_BUTTON_MIN_SIZE)
    expect(talk.height).toBeGreaterThanOrEqual(JARVIS_TALK_BUTTON_MIN_SIZE)
    const send = size(pressableByLabel(root, 'Enviar'))
    expect(send.width).toBeGreaterThanOrEqual(JARVIS_MIN_TOUCH_TARGET)
    expect(send.height).toBeGreaterThanOrEqual(JARVIS_MIN_TOUCH_TARGET)
  })

  it('tells the reader what the talk button does and when it is listening', () => {
    const root = render(createElement(JarvisComposer, composerProps({ listening: true })))
    const talk = pressableByLabel(root, 'Micrófono')
    expect(talk.props.accessibilityRole).toBe('button')
    expect(String(talk.props.accessibilityHint)).toContain('Mantén')
    expect(talk.props.accessibilityState).toMatchObject({ selected: true })
    expect(textsOf(root)).toContain('Suelta para enviar')
  })
})

describe('JarvisStage', () => {
  const stageProps = (overrides: Partial<React.ComponentProps<typeof JarvisStage>> = {}) => ({
    activity: 'idle' as const,
    statusText: '¿Qué necesitas?',
    speechOff: false,
    size: 200,
    active: true,
    onStopSpeaking: vi.fn(),
    ...overrides
  })

  it('shows the character in its state under a status line that readers hear change', () => {
    const root = render(
      createElement(JarvisStage, stageProps({ activity: 'thinking', statusText: 'Pensando' }))
    )
    expect(root.findByType('JarvisCharacter').props.activity).toBe('thinking')
    const status = root.find(
      (node) => node.type === 'Text' && node.children.join('') === 'Pensando'
    )
    expect(status.props.accessibilityLiveRegion).toBe('polite')
  })

  it('lets the owner stop the voice by tapping the character or the stop button while it speaks', () => {
    const props = stageProps({
      activity: 'speaking',
      statusText: 'Van dos en revisión.',
      phrase: 'Van dos en revisión.'
    })
    const root = render(createElement(JarvisStage, props))
    expect(root.findByType('JarvisCharacter').props.phrase).toBe('Van dos en revisión.')
    act(() => pressableByLabel(root, 'Jarvis está hablando').props.onPress())
    act(() => pressableByLabel(root, 'Detener lectura').props.onPress())
    expect(props.onStopSpeaking).toHaveBeenCalledTimes(2)
    expect(textsOf(root)).toContain('Detener lectura')
  })

  it('offers no way to stop when it is not speaking', () => {
    const root = render(createElement(JarvisStage, stageProps()))
    expect(root.findAll((node) => node.type === 'Pressable')).toHaveLength(0)
    expect(textsOf(root)).not.toContain('Detener lectura')
  })

  it('rests the character while the screen is not in front, keeping its place', () => {
    const root = render(createElement(JarvisStage, stageProps({ active: false })))
    expect(root.findAllByType('JarvisCharacter')).toHaveLength(0)
    const placeholder = root.find((node) => node.props.testID === 'jarvis-stage-resting')
    expect(size(placeholder)).toEqual({ width: 200, height: 200 })
  })

  it('says out loud, in text, that the voice is switched off', () => {
    const root = render(createElement(JarvisStage, stageProps({ speechOff: true })))
    expect(textsOf(root)).toContain('Leer respuestas en voz alta: desactivado')
  })
})

describe('JarvisQuickActions', () => {
  it('offers the three actions as plain text and calls back on each', () => {
    const props = { onPlanToday: vi.fn(), onMusic: vi.fn(), onOpenOrca: vi.fn() }
    const root = render(createElement(JarvisQuickActions, props))
    expect(textsOf(root)).toEqual(['Plan de hoy', 'Música', 'Orca'])

    act(() => pressableByLabel(root, 'Plan de hoy').props.onPress())
    act(() => pressableByLabel(root, 'Música').props.onPress())
    act(() => pressableByLabel(root, 'Orca').props.onPress())
    expect(props.onPlanToday).toHaveBeenCalledTimes(1)
    expect(props.onMusic).toHaveBeenCalledTimes(1)
    expect(props.onOpenOrca).toHaveBeenCalledTimes(1)

    for (const label of ['Plan de hoy', 'Música', 'Orca']) {
      const action = pressableByLabel(root, label)
      expect(size(action).height).toBeGreaterThanOrEqual(JARVIS_MIN_TOUCH_TARGET)
      expect(textDecorationOf(action)).toBe('underline')
    }
  })
})

describe('JarvisSetupNotice', () => {
  const callbacks = {
    onOpenPairing: vi.fn(),
    onOpenWorkspaceSettings: vi.fn(),
    onOpenVoiceSettings: vi.fn()
  }

  it.each([
    ['pair-desktop', 'Empareja tu escritorio para empezar', 'Escanear código', 'onOpenPairing'],
    [
      'choose-workspace',
      'Elige desde qué espacio de trabajo habla Jarvis',
      'Elegir',
      'onOpenWorkspaceSettings'
    ],
    [
      'dictation-off',
      'El dictado no está activo en el escritorio',
      'Abrir ajustes de voz',
      'onOpenVoiceSettings'
    ]
  ] as const)('explains %s and opens the screen that fixes it', (need, text, action, callback) => {
    const root = render(createElement(JarvisSetupNotice, { need, ...callbacks }))
    expect(textsOf(root)).toEqual([text, action])
    const button = pressableByLabel(root, action)
    expect(size(button).height).toBeGreaterThanOrEqual(JARVIS_MIN_TOUCH_TARGET)
    act(() => button.props.onPress())
    expect(callbacks[callback]).toHaveBeenCalledTimes(1)
  })
})

describe('JarvisStatusBar', () => {
  it('shows the clock, the wordmark and a settings button the size of a fingertip', () => {
    const onOpenSettings = vi.fn()
    const root = render(
      createElement(JarvisStatusBar, { connected: true, onOpenSettings, topInset: 0 })
    )
    expect(textsOf(root)).toEqual(['09:41', 'JARVIS'])
    const settings = pressableByLabel(root, 'Ajustes de Jarvis')
    expect(size(settings).width).toBeGreaterThanOrEqual(JARVIS_MIN_TOUCH_TARGET)
    expect(size(settings).height).toBeGreaterThanOrEqual(JARVIS_MIN_TOUCH_TARGET)
    act(() => settings.props.onPress())
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('names the connection state for readers', () => {
    const online = render(
      createElement(JarvisStatusBar, { connected: true, onOpenSettings: vi.fn(), topInset: 0 })
    )
    expect(online.findByProps({ testID: 'jarvis-connection-dot' }).props.accessibilityLabel).toBe(
      'Escritorio conectado'
    )
    const offline = render(
      createElement(JarvisStatusBar, { connected: false, onOpenSettings: vi.fn(), topInset: 0 })
    )
    expect(offline.findByProps({ testID: 'jarvis-connection-dot' }).props.accessibilityLabel).toBe(
      'Sin conexión con el escritorio'
    )
  })
})

describe('JarvisTranscript', () => {
  const scroll = (root: ReactTestInstance, y: number): void => {
    act(() => root.findByType('FlatList').props.onScroll({ nativeEvent: { contentOffset: { y } } }))
  }
  const grown = (root: ReactTestInstance): void => {
    act(() => root.findByType('FlatList').props.onContentSizeChange())
  }

  it('shows who speaks, the owner words as written and the assistant markdown as plain lines', () => {
    const root = render(
      createElement(JarvisTranscript, {
        messages: [
          message('1', 'user', '¿Cómo van los PRs?'),
          message('2', 'assistant', '**Listo.**\n1. Uno\n- Dos')
        ]
      })
    )
    expect(textsOf(root)).toEqual([
      'Jarvis',
      'Listo.',
      '1. Uno',
      '– Dos',
      'Tú',
      '¿Cómo van los PRs?'
    ])
  })

  it('keeps a placeholder while the first words of an answer arrive', () => {
    const root = render(
      createElement(JarvisTranscript, { messages: [message('1', 'assistant', '', true)] })
    )
    expect(textsOf(root)).toContain('…')
  })

  it('hands the list the newest message first because the list is inverted', () => {
    const root = render(
      createElement(JarvisTranscript, {
        messages: [message('1', 'user', 'a'), message('2', 'assistant', 'b')]
      })
    )
    const listProps = root.findByType('FlatList').props
    expect(listProps.inverted).toBe(true)
    expect(listProps.data.map((item: JarvisMessage) => item.id)).toEqual(['2', '1'])
  })

  it('follows the answer while it grows, once the owner is at the newest message', () => {
    const root = render(createElement(JarvisTranscript, { messages: [message('1', 'user', 'a')] }))
    scroll(root, 0)
    grown(root)
    expect(list.scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false })
  })

  it('does not yank the owner away while reading older messages', () => {
    const root = render(createElement(JarvisTranscript, { messages: [message('1', 'user', 'a')] }))
    scroll(root, 300)
    grown(root)
    expect(list.scrollToOffset).not.toHaveBeenCalled()
  })

  it('jumps to the newest message when the owner writes', () => {
    const view = mount(
      createElement(JarvisTranscript, { messages: [message('1', 'assistant', 'a')] })
    )
    scroll(view.root(), 300)
    view.update(
      createElement(JarvisTranscript, {
        messages: [message('1', 'assistant', 'a'), message('2', 'user', 'b')]
      })
    )
    grown(view.root())
    expect(list.scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false })
  })

  it('does not move when more answer arrives while the owner reads older messages', () => {
    const view = mount(createElement(JarvisTranscript, { messages: [message('1', 'user', 'a')] }))
    scroll(view.root(), 300)
    view.update(
      createElement(JarvisTranscript, {
        messages: [message('1', 'user', 'a'), message('2', 'assistant', 'b', true)]
      })
    )
    grown(view.root())
    expect(list.scrollToOffset).not.toHaveBeenCalled()
  })
})

describe('JarvisHomeScreen', () => {
  function character(root: ReactTestInstance): ReactTestInstance {
    return root.findByType('JarvisCharacter')
  }

  it('leaves the character out when the screen is not in front', () => {
    const root = render(createElement(JarvisHomeScreen, homeProps({ focused: false })))
    expect(root.findAllByType('JarvisCharacter')).toHaveLength(0)
  })

  it('shows the character offline when the desktop does not answer, whatever the engine is doing', () => {
    const offline = render(
      createElement(
        JarvisHomeScreen,
        homeProps({
          conversation: conversation({
            connected: false,
            activity: 'thinking',
            statusText: 'Pensando'
          })
        })
      )
    )
    expect(character(offline).props.activity).toBe('offline')
  })

  it('drives the character with the engine while the desktop answers', () => {
    const root = render(
      createElement(
        JarvisHomeScreen,
        homeProps({
          conversation: conversation({ activity: 'listening', statusText: 'Te escucho' })
        })
      )
    )
    expect(character(root).props.activity).toBe('listening')
    expect(textsOf(root)).toContain('Te escucho')
  })

  it('beats the ring on each phrase while it speaks', () => {
    const root = render(
      createElement(
        JarvisHomeScreen,
        homeProps({
          conversation: conversation({ activity: 'speaking', statusText: 'Van dos en revisión.' })
        })
      )
    )
    expect(character(root).props.phrase).toBe('Van dos en revisión.')
  })

  it('press-in and press-out of the talk button reach the engine', () => {
    const engine = conversation()
    const root = render(createElement(JarvisHomeScreen, homeProps({ conversation: engine })))
    const talk = pressableByLabel(root, 'Micrófono')
    act(() => talk.props.onPressIn())
    act(() => talk.props.onPressOut())
    expect(engine.startListening).toHaveBeenCalledTimes(1)
    expect(engine.stopListening).toHaveBeenCalledTimes(1)
  })

  it('typing reaches the engine with the same sendText the voice path uses', () => {
    const engine = conversation()
    const root = render(createElement(JarvisHomeScreen, homeProps({ conversation: engine })))
    act(() => root.findByType('TextInput').props.onChangeText('¿Cómo van los PRs?'))
    act(() => pressableByLabel(root, 'Enviar').props.onPress())
    expect(engine.sendText).toHaveBeenCalledWith('¿Cómo van los PRs?')
  })

  it('tapping the character while it speaks interrupts the reading', () => {
    const engine = conversation({ activity: 'speaking', statusText: 'Uno.' })
    const root = render(createElement(JarvisHomeScreen, homeProps({ conversation: engine })))
    act(() => pressableByLabel(root, 'Detener lectura').props.onPress())
    expect(engine.stopSpeaking).toHaveBeenCalledTimes(1)
  })

  it('sends the quick actions as text and opens Orca Lab', () => {
    const engine = conversation()
    const props = homeProps({ conversation: engine })
    const root = render(createElement(JarvisHomeScreen, props))
    act(() => pressableByLabel(root, 'Plan de hoy').props.onPress())
    act(() => pressableByLabel(root, 'Música').props.onPress())
    act(() => pressableByLabel(root, 'Orca').props.onPress())
    expect(engine.sendText).toHaveBeenNthCalledWith(1, 'Hazme el plan de hoy')
    expect(engine.sendText).toHaveBeenNthCalledWith(2, 'Pon música')
    expect(props.onOpenOrca).toHaveBeenCalledTimes(1)
  })

  it('opens settings from the status row', () => {
    const props = homeProps()
    const root = render(createElement(JarvisHomeScreen, props))
    act(() => pressableByLabel(root, 'Ajustes de Jarvis').props.onPress())
    expect(props.onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('routes each setup need to the screen that resolves it', () => {
    const props = homeProps({
      conversation: conversation({ connected: false, setupNeed: 'pair-desktop' })
    })
    let root = render(createElement(JarvisHomeScreen, props))
    act(() => pressableByLabel(root, 'Escanear código').props.onPress())
    expect(props.onOpenPairing).toHaveBeenCalledTimes(1)

    root = render(
      createElement(JarvisHomeScreen, {
        ...props,
        conversation: conversation({ setupNeed: 'choose-workspace' })
      })
    )
    act(() => pressableByLabel(root, 'Elegir').props.onPress())
    expect(props.onOpenWorkspaceSettings).toHaveBeenCalledTimes(1)

    root = render(
      createElement(JarvisHomeScreen, {
        ...props,
        conversation: conversation({ setupNeed: 'dictation-off' })
      })
    )
    act(() => pressableByLabel(root, 'Abrir ajustes de voz').props.onPress())
    expect(props.onOpenVoiceSettings).toHaveBeenCalledTimes(1)
  })

  it('says a setup sentence once: the engine already shows it under the character', () => {
    const sentence = 'Empareja tu escritorio para empezar'
    const engine = conversation({
      connected: false,
      setupNeed: 'pair-desktop',
      statusText: sentence
    })
    const root = render(createElement(JarvisHomeScreen, homeProps({ conversation: engine })))
    expect(textsOf(root).filter((text) => text === sentence)).toHaveLength(1)
    expect(textsOf(root)).toContain('Escanear código')
  })

  it('keeps the setup sentence beside an error line, since they say different things', () => {
    const sentence = 'Empareja tu escritorio para empezar'
    const engine = conversation({
      connected: false,
      setupNeed: 'pair-desktop',
      statusText: 'No encuentro el escritorio. ¿Está abierto Orca Lab?'
    })
    const root = render(createElement(JarvisHomeScreen, homeProps({ conversation: engine })))
    expect(textsOf(root)).toContain(sentence)
    expect(textsOf(root)).toContain('No encuentro el escritorio. ¿Está abierto Orca Lab?')
  })

  it('keeps the talk button quiet while it thinks, and the keyboard until a workspace exists', () => {
    const thinking = render(
      createElement(
        JarvisHomeScreen,
        homeProps({ conversation: conversation({ activity: 'thinking' }) })
      )
    )
    expect(pressableByLabel(thinking, 'Micrófono').props.disabled).toBe(true)
    expect(thinking.findByType('TextInput').props.editable).toBe(true)

    const unpaired = render(
      createElement(
        JarvisHomeScreen,
        homeProps({ conversation: conversation({ setupNeed: 'pair-desktop' }) })
      )
    )
    expect(pressableByLabel(unpaired, 'Micrófono').props.disabled).toBe(true)
    expect(unpaired.findByType('TextInput').props.editable).toBe(false)

    const noDictation = render(
      createElement(
        JarvisHomeScreen,
        homeProps({ conversation: conversation({ setupNeed: 'dictation-off' }) })
      )
    )
    expect(pressableByLabel(noDictation, 'Micrófono').props.disabled).toBe(true)
    expect(noDictation.findByType('TextInput').props.editable).toBe(true)
  })

  it('steps aside while the keyboard is open: the conversation and the composer only', () => {
    const root = render(
      createElement(
        JarvisHomeScreen,
        homeProps({ conversation: conversation({ messages: [message('1', 'user', 'Hola')] }) })
      )
    )
    expect(root.findAllByType('JarvisCharacter')).toHaveLength(1)

    // Why it matters: with the keyboard up, a Pixel-sized phone has about 500 dp left, and the
    // character with its status line would leave the conversation none.
    act(() => keyboard.listeners.get('keyboardDidShow')?.())
    expect(root.findAllByType('JarvisCharacter')).toHaveLength(0)
    expect(textsOf(root)).not.toContain('Plan de hoy')
    expect(root.findAllByType('FlatList')).toHaveLength(1)
    expect(root.findAllByType('TextInput')).toHaveLength(1)
    expect(pressableByLabel(root, 'Micrófono')).toBeDefined()

    act(() => keyboard.listeners.get('keyboardDidHide')?.())
    expect(root.findAllByType('JarvisCharacter')).toHaveLength(1)
    expect(textsOf(root)).toContain('Plan de hoy')
  })

  it('shows the conversation in place of the empty stage once something was said', () => {
    const empty = render(createElement(JarvisHomeScreen, homeProps()))
    expect(empty.findAllByType('FlatList')).toHaveLength(0)
    expect(textsOf(empty)).toContain('¿Qué necesitas?')

    const talking = render(
      createElement(
        JarvisHomeScreen,
        homeProps({ conversation: conversation({ messages: [message('1', 'user', 'Hola')] }) })
      )
    )
    expect(talking.findAllByType('FlatList')).toHaveLength(1)
    expect(character(talking).props.size).toBeLessThan(character(empty).props.size)
  })
})

function textDecorationOf(node: ReactTestInstance): unknown {
  const label = node.find((child) => child.type === 'Text')
  return flattenStyle(label.props.style).textDecorationLine
}

import { StyleSheet, View } from 'react-native'
import type { JarvisConversation } from '../jarvis-contract'
import type { JarvisCharacterActivity } from '../character/character-motion'
import { jarvisMetrics, jarvisPalette, jarvisSpacing } from '../jarvis-theme'
import { jarvisCopy } from './jarvis-copy'
import { JarvisComposer } from './JarvisComposer'
import { JarvisQuickActions } from './JarvisQuickActions'
import { JarvisSetupNotice } from './JarvisSetupNotice'
import { JarvisStage } from './JarvisStage'
import { JarvisStatusBar } from './JarvisStatusBar'
import { JarvisTranscript } from './JarvisTranscript'
import { useKeyboardVisible } from './use-keyboard-visible'

export interface JarvisHomeScreenProps {
  conversation: JarvisConversation
  /** Whether the assistant screen is the one in front. */
  focused: boolean
  /** Room the system status bar and the navigation bar leave free. */
  topInset: number
  bottomInset: number
  onOpenSettings: () => void
  onOpenOrca: () => void
  onOpenPairing: () => void
  onOpenWorkspaceSettings: () => void
  onOpenVoiceSettings: () => void
}

const PLAN_TODAY_TEXT = 'Hazme el plan de hoy'
const MUSIC_TEXT = 'Pon música'

/**
 * The assistant screen. It only presents: every action is the engine's or the router's,
 * passed in from the route.
 */
export function JarvisHomeScreen(props: JarvisHomeScreenProps) {
  const { conversation: engine, focused, topInset, bottomInset } = props
  const keyboardVisible = useKeyboardVisible()
  const hasConversation = engine.messages.length > 0
  const speaking = engine.activity === 'speaking'
  const setupNeed = engine.setupNeed
  // Why the connection wins over the engine: without the desktop nothing it reports is current.
  const characterActivity: JarvisCharacterActivity = engine.connected ? engine.activity : 'offline'
  const keyboardLocked =
    engine.setupNeed === 'pair-desktop' || engine.setupNeed === 'choose-workspace'

  const stage = (
    <JarvisStage
      activity={characterActivity}
      phrase={speaking ? engine.statusText : null}
      statusText={engine.statusText}
      speechOff={!engine.speechEnabled}
      size={hasConversation ? jarvisMetrics.characterSizeCompact : jarvisMetrics.characterSize}
      active={focused}
      onStopSpeaking={engine.stopSpeaking}
    />
  )

  // Why the keyboard clears the deck: with it open, a Pixel-sized phone keeps about 500 dp, and
  // the character with its status line and the actions would leave the conversation none. The
  // conversation, the input and the microphone stay; the microphone closes the keyboard.
  const typing = keyboardVisible

  return (
    <View style={[styles.screen, { paddingTop: topInset }]}>
      <JarvisStatusBar connected={engine.connected} onOpenSettings={props.onOpenSettings} />
      {hasConversation ? (
        <>
          {typing ? null : <View style={styles.stageTop}>{stage}</View>}
          <JarvisTranscript messages={engine.messages} />
        </>
      ) : typing ? (
        <View style={styles.center} />
      ) : (
        <View style={styles.center}>{stage}</View>
      )}
      {typing ? null : (
        <View style={styles.actions}>
          {setupNeed ? (
            <JarvisSetupNotice
              need={setupNeed}
              // Why often only the button: for a setup need the engine already shows this very
              // sentence under the character. It stays here only when a failure outranks it there.
              text={engine.statusText === jarvisCopy.setup[setupNeed].text ? null : undefined}
              onOpenPairing={props.onOpenPairing}
              onOpenWorkspaceSettings={props.onOpenWorkspaceSettings}
              onOpenVoiceSettings={props.onOpenVoiceSettings}
            />
          ) : (
            <JarvisQuickActions
              onPlanToday={() => engine.sendText(PLAN_TODAY_TEXT)}
              onMusic={() => engine.sendText(MUSIC_TEXT)}
              onOpenOrca={props.onOpenOrca}
            />
          )}
        </View>
      )}
      <JarvisComposer
        listening={engine.activity === 'listening'}
        talkDisabled={engine.activity === 'thinking' || engine.setupNeed !== null}
        keyboardDisabled={keyboardLocked}
        bottomInset={keyboardVisible ? 0 : bottomInset}
        onStartTalking={engine.startListening}
        onStopTalking={engine.stopListening}
        onSend={engine.sendText}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: jarvisPalette.abyss
  },
  // Before anything is said the character owns the middle of the screen (design doc, "Composición").
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stageTop: {
    marginTop: jarvisSpacing.sm
  },
  actions: {
    marginTop: jarvisSpacing.sm
  }
})

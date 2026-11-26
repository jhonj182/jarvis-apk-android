import { useEffect, useRef, useState } from 'react'
import { Keyboard, Pressable, StyleSheet, View } from 'react-native'
import { Mic, Send } from 'lucide-react-native'
import { Text, TextInput } from '../../theme/dynamic-type-text'
import { triggerMediumImpact, triggerSelection } from '../../platform/haptics'
import {
  JARVIS_MIN_TOUCH_TARGET,
  JARVIS_TALK_BUTTON_MIN_SIZE,
  jarvisAlpha,
  jarvisMetrics,
  jarvisPalette,
  jarvisSpacing,
  jarvisTypeSizes
} from '../jarvis-theme'
import { jarvisCopy } from './jarvis-copy'

interface JarvisComposerProps {
  listening: boolean
  /** True while the engine thinks or something must be set up first. */
  talkDisabled: boolean
  /** True until a desktop is paired and a workspace is chosen: there is nobody to write to. */
  keyboardDisabled: boolean
  /** Room the system leaves free at the bottom; zero while the keyboard is open. */
  bottomInset: number
  onStartTalking: () => void
  onStopTalking: () => void
  onSend: (text: string) => void
}

const MAX_DRAFT_LENGTH = 4000
// Why so far: the thumb drifts while its owner talks, and the press must outlive the drift.
const TALK_PRESS_RETENTION_PX = 160

/** Push-to-talk under a keyboard row: hold the microphone to dictate, or write and send. */
export function JarvisComposer({
  listening,
  talkDisabled,
  keyboardDisabled,
  bottomInset,
  onStartTalking,
  onStopTalking,
  onSend
}: JarvisComposerProps) {
  const [draft, setDraft] = useState('')
  const holding = useRef(false)
  const stopTalking = useRef(onStopTalking)
  stopTalking.current = onStopTalking

  // Why a cleanup: leaving the screen with the button still held must not leave the mic open.
  useEffect(
    () => () => {
      if (holding.current) {
        holding.current = false
        stopTalking.current()
      }
    },
    []
  )

  // Why the keyboard closes here: holding the microphone means talking now, and with the
  // keyboard up the screen hides the character to leave the conversation its room.
  const handlePressIn = (): void => {
    if (talkDisabled) {
      return
    }
    holding.current = true
    Keyboard.dismiss()
    triggerMediumImpact()
    onStartTalking()
  }

  const handlePressOut = (): void => {
    if (!holding.current) {
      return
    }
    holding.current = false
    triggerSelection()
    onStopTalking()
  }

  const canSend = !keyboardDisabled && draft.trim().length > 0

  const handleSend = (): void => {
    const text = draft.trim()
    if (!canSend || !text) {
      return
    }
    onSend(text)
    setDraft('')
  }

  return (
    <View style={[styles.composer, { paddingBottom: bottomInset + jarvisSpacing.sm }]}>
      <View style={styles.inputRow}>
        <TextInput
          testID="jarvis-composer-input"
          style={[styles.input, keyboardDisabled && styles.inputDisabled]}
          value={draft}
          onChangeText={setDraft}
          placeholder={jarvisCopy.write}
          placeholderTextColor={jarvisPalette.mist}
          maxLength={MAX_DRAFT_LENGTH}
          multiline
          editable={!keyboardDisabled}
          accessibilityLabel={jarvisCopy.write}
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={jarvisCopy.send}
          accessibilityState={{ disabled: !canSend }}
          android_ripple={{ color: jarvisAlpha('abyss', 0.2), borderless: true, radius: 24 }}
          style={({ pressed }) => [
            styles.send,
            canSend ? styles.sendReady : styles.sendIdle,
            pressed && canSend && styles.sendPressed
          ]}
        >
          <Send size={20} color={canSend ? jarvisPalette.abyss : jarvisPalette.mist} />
        </Pressable>
      </View>
      <Pressable
        testID="jarvis-talk-button"
        disabled={talkDisabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        pressRetentionOffset={TALK_PRESS_RETENTION_PX}
        accessibilityRole="button"
        accessibilityLabel={jarvisCopy.talkLabel}
        accessibilityHint={jarvisCopy.talkHint}
        accessibilityState={{ disabled: talkDisabled, selected: listening }}
        android_ripple={{
          color: jarvisAlpha('ice', 0.3),
          radius: jarvisMetrics.talkButtonSize / 2
        }}
        style={({ pressed }) => [
          styles.talk,
          talkDisabled && styles.talkDisabled,
          (listening || pressed) && styles.talkLive
        ]}
      >
        <Mic
          size={30}
          color={
            talkDisabled ? jarvisPalette.mist : listening ? jarvisPalette.abyss : jarvisPalette.gold
          }
        />
      </Pressable>
      <Text style={[styles.caption, talkDisabled && styles.captionIdle]}>
        {listening ? jarvisCopy.talkRelease : jarvisCopy.talk}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  composer: {
    paddingHorizontal: jarvisSpacing.screenGutter,
    alignItems: 'center'
  },
  inputRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    alignItems: 'flex-end',
    gap: jarvisSpacing.sm
  },
  input: {
    flex: 1,
    maxHeight: jarvisMetrics.composerMaxHeight,
    minHeight: JARVIS_MIN_TOUCH_TARGET,
    paddingHorizontal: jarvisSpacing.lg,
    paddingTop: jarvisSpacing.md,
    paddingBottom: jarvisSpacing.md,
    borderRadius: 22,
    backgroundColor: jarvisPalette.ink,
    color: jarvisPalette.fog,
    fontSize: jarvisTypeSizes.conversation,
    lineHeight: 22,
    textAlignVertical: 'center'
  },
  inputDisabled: {
    opacity: 0.55
  },
  send: {
    width: JARVIS_MIN_TOUCH_TARGET,
    height: JARVIS_MIN_TOUCH_TARGET,
    borderRadius: JARVIS_MIN_TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sendReady: {
    backgroundColor: jarvisPalette.gold
  },
  sendIdle: {
    borderWidth: 1.5,
    borderColor: jarvisPalette.mist
  },
  sendPressed: {
    backgroundColor: jarvisAlpha('gold', 0.8)
  },
  // Why a floor under the size: the design doc wants at least 72 under the thumb, whatever the metric says.
  talk: {
    marginTop: jarvisSpacing.md,
    width: jarvisMetrics.talkButtonSize,
    height: jarvisMetrics.talkButtonSize,
    minWidth: JARVIS_TALK_BUTTON_MIN_SIZE,
    minHeight: JARVIS_TALK_BUTTON_MIN_SIZE,
    borderRadius: jarvisMetrics.talkButtonSize / 2,
    borderWidth: 2.5,
    borderColor: jarvisPalette.gold,
    backgroundColor: jarvisPalette.abyss,
    alignItems: 'center',
    justifyContent: 'center'
  },
  talkLive: {
    backgroundColor: jarvisPalette.ice,
    borderColor: jarvisPalette.ice
  },
  talkDisabled: {
    borderColor: jarvisPalette.mist
  },
  caption: {
    marginTop: jarvisSpacing.xs,
    fontSize: jarvisTypeSizes.label,
    color: jarvisPalette.mist
  },
  captionIdle: {
    color: jarvisAlpha('mist', 0.6)
  }
})

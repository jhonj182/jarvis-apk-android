import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../../theme/dynamic-type-text'
import { JarvisCharacter } from '../character/JarvisCharacter'
import type { JarvisCharacterActivity } from '../character/character-motion'
import {
  JARVIS_MIN_TOUCH_TARGET,
  jarvisAlpha,
  jarvisFontWeights,
  jarvisPalette,
  jarvisSpacing,
  jarvisTypeSizes
} from '../jarvis-theme'
import { jarvisCopy } from './jarvis-copy'

interface JarvisStageProps {
  activity: JarvisCharacterActivity
  /** The sentence being read aloud. The ring beats each time it changes. */
  phrase?: string | null
  statusText: string
  speechOff: boolean
  size: number
  /** False while the screen is not in front: the character rests, so nothing animates offscreen. */
  active?: boolean
  onStopSpeaking: () => void
}

/**
 * The character with the line that says what it is doing. While it speaks, touching the
 * character or the "stop" line under it cuts the voice.
 */
export function JarvisStage({
  activity,
  phrase = null,
  statusText,
  speechOff,
  size,
  active = true,
  onStopSpeaking
}: JarvisStageProps) {
  const speaking = activity === 'speaking'
  const character = active ? (
    <JarvisCharacter activity={activity} phrase={phrase} size={size} />
  ) : (
    <View testID="jarvis-stage-resting" style={{ width: size, height: size }} />
  )

  return (
    <View style={styles.stage}>
      {speaking ? (
        // Why its own label and not the button's: two controls called the same thing are one
        // thing too many for a screen reader; the hint still says what the touch does.
        <Pressable
          onPress={onStopSpeaking}
          hitSlop={jarvisSpacing.md}
          accessibilityRole="button"
          accessibilityLabel={jarvisCopy.speakingNow}
          accessibilityHint={jarvisCopy.speakingNowHint}
          style={({ pressed }) => [styles.touch, pressed && styles.touchPressed]}
        >
          {character}
        </Pressable>
      ) : (
        <View style={styles.touch} pointerEvents="none">
          {character}
        </View>
      )}
      {/* Why three lines: a failure says what went wrong and what to do (design doc §2), and
          it has to arrive whole. */}
      <Text
        style={[styles.status, speaking && styles.statusDim]}
        accessibilityLiveRegion="polite"
        numberOfLines={3}
      >
        {statusText}
      </Text>
      {speaking ? (
        <Pressable
          onPress={onStopSpeaking}
          hitSlop={jarvisSpacing.sm}
          accessibilityRole="button"
          accessibilityLabel={jarvisCopy.stopSpeaking}
          style={({ pressed }) => [styles.stop, pressed && styles.touchPressed]}
        >
          <Text style={styles.stopText}>{jarvisCopy.stopSpeaking}</Text>
        </Pressable>
      ) : null}
      {speechOff ? <Text style={styles.speechOff}>{jarvisCopy.speechOff}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center'
  },
  // Why so round a press area: it wraps a round drawing, so the pressed halo is a disc.
  touch: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  touchPressed: {
    backgroundColor: jarvisAlpha('fog', 0.08)
  },
  status: {
    marginTop: jarvisSpacing.sm,
    paddingHorizontal: jarvisSpacing.xl,
    fontSize: jarvisTypeSizes.status,
    lineHeight: 21,
    textAlign: 'center',
    color: jarvisPalette.fog
  },
  statusDim: {
    color: jarvisAlpha('fog', 0.7)
  },
  stop: {
    marginTop: jarvisSpacing.xs,
    minHeight: JARVIS_MIN_TOUCH_TARGET,
    paddingHorizontal: jarvisSpacing.lg,
    justifyContent: 'center'
  },
  stopText: {
    fontSize: jarvisTypeSizes.label,
    fontWeight: jarvisFontWeights.label,
    color: jarvisPalette.ice,
    textDecorationLine: 'underline',
    textDecorationColor: jarvisAlpha('ice', 0.5)
  },
  speechOff: {
    marginTop: jarvisSpacing.xs,
    fontSize: jarvisTypeSizes.label,
    color: jarvisPalette.mist
  }
})

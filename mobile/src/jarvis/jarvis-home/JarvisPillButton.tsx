import { Pressable, StyleSheet } from 'react-native'
import { Text } from '../../theme/dynamic-type-text'
import {
  JARVIS_MIN_TOUCH_TARGET,
  jarvisAlpha,
  jarvisFontWeights,
  jarvisPalette,
  jarvisSpacing,
  jarvisTypeSizes
} from '../jarvis-theme'

interface JarvisPillButtonProps {
  label: string
  onPress: () => void
  testID?: string
}

/** The secondary button of the Jarvis screens: amber outline, transparent fill. */
export function JarvisPillButton({ label, onPress, testID }: JarvisPillButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      hitSlop={jarvisSpacing.sm}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    minHeight: JARVIS_MIN_TOUCH_TARGET,
    paddingHorizontal: jarvisSpacing.xl,
    borderRadius: JARVIS_MIN_TOUCH_TARGET / 2,
    borderWidth: 1.5,
    borderColor: jarvisPalette.gold,
    justifyContent: 'center',
    alignItems: 'center'
  },
  buttonPressed: {
    backgroundColor: jarvisAlpha('gold', 0.16)
  },
  text: {
    fontSize: jarvisTypeSizes.status,
    fontWeight: jarvisFontWeights.label,
    color: jarvisPalette.gold
  }
})

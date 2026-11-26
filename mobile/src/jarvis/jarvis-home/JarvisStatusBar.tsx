import { Pressable, StyleSheet, View } from 'react-native'
import { Settings } from 'lucide-react-native'
import { Text } from '../../theme/dynamic-type-text'
import {
  JARVIS_MIN_TOUCH_TARGET,
  jarvisAlpha,
  jarvisPalette,
  jarvisSpacing,
  jarvisTypeSizes
} from '../jarvis-theme'
import { jarvisCopy } from './jarvis-copy'
import { useClockTime } from './use-clock-time'
import { useJarvisDisplayFont } from './use-display-font'

interface JarvisStatusBarProps {
  connected: boolean
  onOpenSettings: () => void
  /** Room the system status bar leaves free on top. */
  topInset?: number
}

/** The thin row at the top: the time, the name, whether the desktop answers, and settings. */
export function JarvisStatusBar({ connected, onOpenSettings, topInset = 0 }: JarvisStatusBarProps) {
  const time = useClockTime()
  const display = useJarvisDisplayFont()

  return (
    <View style={[styles.bar, { paddingTop: topInset }]}>
      <Text style={[styles.clock, display]} testID="jarvis-clock">
        {time}
      </Text>
      <Text style={[styles.wordmark, display]}>{jarvisCopy.wordmark}</Text>
      <View style={styles.trailing}>
        <View
          testID="jarvis-connection-dot"
          accessible
          accessibilityLabel={connected ? jarvisCopy.connected : jarvisCopy.disconnected}
          style={[styles.dot, !connected && styles.dotOffline]}
        />
        <Pressable
          onPress={onOpenSettings}
          accessibilityRole="button"
          accessibilityLabel={jarvisCopy.settings}
          style={({ pressed }) => [styles.settings, pressed && styles.settingsPressed]}
        >
          <Settings size={20} color={jarvisPalette.fog} strokeWidth={1.75} />
        </Pressable>
      </View>
    </View>
  )
}

// Why both sides share a minimum width: the name sits in the exact center whatever the hour reads.
const SIDE_WIDTH = 68

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: JARVIS_MIN_TOUCH_TARGET,
    paddingHorizontal: jarvisSpacing.screenGutter
  },
  clock: {
    minWidth: SIDE_WIDTH,
    fontSize: jarvisTypeSizes.wordmark,
    letterSpacing: 1,
    color: jarvisPalette.fog
  },
  wordmark: {
    flex: 1,
    fontSize: jarvisTypeSizes.wordmark,
    letterSpacing: 4,
    textAlign: 'center',
    color: jarvisPalette.gold
  },
  trailing: {
    minWidth: SIDE_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: jarvisSpacing.sm
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: jarvisPalette.ice
  },
  dotOffline: {
    backgroundColor: jarvisPalette.mist
  },
  settings: {
    width: JARVIS_MIN_TOUCH_TARGET,
    height: JARVIS_MIN_TOUCH_TARGET,
    borderRadius: JARVIS_MIN_TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  settingsPressed: {
    backgroundColor: jarvisAlpha('fog', 0.12)
  }
})

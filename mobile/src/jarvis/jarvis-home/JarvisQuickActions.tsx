import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../../theme/dynamic-type-text'
import {
  JARVIS_MIN_TOUCH_TARGET,
  jarvisAlpha,
  jarvisPalette,
  jarvisSpacing,
  jarvisTypeSizes
} from '../jarvis-theme'
import { jarvisCopy } from './jarvis-copy'

interface JarvisQuickActionsProps {
  onPlanToday: () => void
  onMusic: () => void
  onOpenOrca: () => void
}

interface QuickAction {
  label: string
  hint: string
  testID: string
  run: (props: JarvisQuickActionsProps) => void
}

const ACTIONS: QuickAction[] = [
  {
    label: jarvisCopy.planToday,
    hint: jarvisCopy.planTodayHint,
    testID: 'jarvis-action-plan-today',
    run: (props) => props.onPlanToday()
  },
  {
    label: jarvisCopy.music,
    hint: jarvisCopy.musicHint,
    testID: 'jarvis-action-music',
    run: (props) => props.onMusic()
  },
  {
    label: jarvisCopy.orca,
    hint: jarvisCopy.orcaHint,
    testID: 'jarvis-action-orca',
    run: (props) => props.onOpenOrca()
  }
]

/** What Jarvis is asked most, written as text with a line under it: not cards. */
export function JarvisQuickActions(props: JarvisQuickActionsProps) {
  return (
    <View style={styles.row}>
      {ACTIONS.map((action) => (
        <Pressable
          key={action.label}
          testID={action.testID}
          onPress={() => action.run(props)}
          hitSlop={jarvisSpacing.sm}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityHint={action.hint}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        >
          <Text style={styles.actionText}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: jarvisSpacing.xs,
    paddingHorizontal: jarvisSpacing.screenGutter
  },
  action: {
    minHeight: JARVIS_MIN_TOUCH_TARGET,
    paddingHorizontal: jarvisSpacing.lg,
    borderRadius: JARVIS_MIN_TOUCH_TARGET / 2,
    justifyContent: 'center'
  },
  actionPressed: {
    backgroundColor: jarvisAlpha('fog', 0.1)
  },
  actionText: {
    fontSize: jarvisTypeSizes.status,
    color: jarvisPalette.fog,
    textDecorationLine: 'underline',
    textDecorationColor: jarvisAlpha('fog', 0.45)
  }
})

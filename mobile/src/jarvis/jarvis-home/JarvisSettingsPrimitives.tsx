import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import { Text } from '../../theme/dynamic-type-text'
import {
  JARVIS_MIN_TOUCH_TARGET,
  jarvisAlpha,
  jarvisFontWeights,
  jarvisPalette,
  jarvisSpacing,
  jarvisTypeSizes
} from '../jarvis-theme'

/** A titled group of settings, with one sentence of context when it needs one. */
export function JarvisSettingsGroup({
  title,
  intro,
  children
}: {
  title: string
  intro?: string
  children: ReactNode
}) {
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={styles.heading}>
        {title.toUpperCase()}
      </Text>
      {intro ? <Text style={styles.intro}>{intro}</Text> : null}
      {children}
    </View>
  )
}

/** The ink surface the rows of a group sit on. */
export function JarvisSettingsCard({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>
}

export function JarvisSettingsDivider() {
  return <View style={styles.divider} />
}

export type JarvisSettingsRole = 'button' | 'radio' | 'switch'

interface JarvisSettingsRowProps {
  label: string
  sublabel?: string
  role: JarvisSettingsRole
  /** For a radio or a switch: whether it is on. */
  checked?: boolean
  /** What sits at the right end. A chevron when omitted. */
  accessory?: ReactNode
  onPress: () => void
  disabled?: boolean
  testID?: string
}

export function JarvisSettingsRow({
  label,
  sublabel,
  role,
  checked = false,
  accessory,
  onPress,
  disabled = false,
  testID
}: JarvisSettingsRowProps) {
  // Why a switch leaves its sublabel out of its name: the state already says whether it is on,
  // and the sublabel is the same sentence.
  const spoken = role === 'switch' || !sublabel ? label : `${label}. ${sublabel}`
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole={role}
      accessibilityLabel={spoken}
      accessibilityState={{ checked: role === 'button' ? undefined : checked, disabled }}
      style={({ pressed }) => [styles.row, pressed && !disabled && styles.rowPressed]}
    >
      <View style={styles.texts}>
        <Text style={styles.label}>{label}</Text>
        {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
      </View>
      {accessory ?? <ChevronRight size={18} color={jarvisPalette.mist} />}
    </Pressable>
  )
}

/** The moving part of a switch, drawn here so it takes the Jarvis palette. */
export function JarvisSettingsSwitch({ on }: { on: boolean }) {
  return (
    <View style={[styles.track, on && styles.trackOn]}>
      <View style={[styles.thumb, on && styles.thumbOn]} />
    </View>
  )
}

const styles = StyleSheet.create({
  group: {
    marginTop: jarvisSpacing.xl
  },
  heading: {
    marginBottom: jarvisSpacing.sm,
    paddingHorizontal: jarvisSpacing.xs,
    fontSize: jarvisTypeSizes.speakerLabel,
    fontWeight: jarvisFontWeights.label,
    letterSpacing: 0.8,
    color: jarvisPalette.mist
  },
  intro: {
    marginBottom: jarvisSpacing.sm,
    paddingHorizontal: jarvisSpacing.xs,
    fontSize: jarvisTypeSizes.label,
    lineHeight: 18,
    color: jarvisPalette.mist
  },
  card: {
    backgroundColor: jarvisPalette.ink,
    borderRadius: 14,
    overflow: 'hidden'
  },
  row: {
    minHeight: JARVIS_MIN_TOUCH_TARGET + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: jarvisSpacing.md,
    paddingHorizontal: jarvisSpacing.lg,
    paddingVertical: jarvisSpacing.sm + 2
  },
  rowPressed: {
    backgroundColor: jarvisAlpha('fog', 0.08)
  },
  texts: {
    flex: 1
  },
  label: {
    fontSize: jarvisTypeSizes.status,
    color: jarvisPalette.fog
  },
  sublabel: {
    marginTop: 2,
    fontSize: jarvisTypeSizes.label,
    lineHeight: 18,
    color: jarvisPalette.mist
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: jarvisSpacing.lg,
    backgroundColor: jarvisAlpha('mist', 0.3)
  },
  track: {
    width: 44,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 2,
    justifyContent: 'center',
    backgroundColor: jarvisAlpha('mist', 0.35)
  },
  trackOn: {
    backgroundColor: jarvisPalette.ice
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignSelf: 'flex-start',
    backgroundColor: jarvisPalette.mist
  },
  thumbOn: {
    alignSelf: 'flex-end',
    backgroundColor: jarvisPalette.abyss
  }
})

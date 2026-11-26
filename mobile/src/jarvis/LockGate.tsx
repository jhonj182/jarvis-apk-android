import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../theme/dynamic-type-text'
import { MIN_TOUCH_TARGET, colors, radii, spacing, typography } from '../theme/mobile-theme'
import type { LockState } from './lock-policy'
import { useAppLock } from './use-app-lock'

export interface LockGateProps {
  children: ReactNode
  /** Slot for the animated character integration passes in above the copy. */
  character?: ReactNode
}

const HINTS: Record<Exclude<LockState, 'unlocked'>, string> = {
  'locked-armed': 'Preparando el desbloqueo…',
  authenticating: 'Comprobando que eres tú…',
  'locked-disarmed': 'Toca Desbloquear para entrar.'
}

const styles = StyleSheet.create({
  gate: { flex: 1 },
  content: { flex: 1 },
  cover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bgBase,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg
  },
  title: { color: colors.textPrimary, fontSize: typography.titleSize, textAlign: 'center' },
  hint: { color: colors.textSecondary, fontSize: typography.bodySize, textAlign: 'center' },
  reason: { color: colors.statusAmber, fontSize: typography.bodySize, textAlign: 'center' },
  button: {
    backgroundColor: colors.surfaceBright,
    borderRadius: radii.button,
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonText: { color: colors.bgBase, fontSize: typography.bodySize }
})

// Mandatory app lock (docs/01-prd.md RF-2): everything the app shows sits under
// this gate. Children stay mounted while locked so navigation state survives;
// the cover just hides them from eyes and screen readers.
export function LockGate({ children, character }: LockGateProps): React.JSX.Element {
  const lock = useAppLock()
  const state = lock.state
  return (
    <View style={styles.gate}>
      <View
        style={styles.content}
        {...(state !== 'unlocked'
          ? { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' }
          : null)}
      >
        {children}
      </View>
      {state !== 'unlocked' && (
        <View style={styles.cover}>
          {character ?? null}
          <Text style={styles.title}>Jarvis está bloqueado</Text>
          <Text style={styles.hint}>{HINTS[state]}</Text>
          {lock.unavailableReason ? (
            <Text style={styles.reason}>{lock.unavailableReason}</Text>
          ) : null}
          {state === 'locked-disarmed' && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Desbloquear"
              onPress={lock.unlock}
              style={styles.button}
            >
              <Text style={styles.buttonText}>Desbloquear</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}

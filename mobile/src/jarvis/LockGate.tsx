import type { ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../theme/dynamic-type-text'
import {
  JARVIS_MIN_TOUCH_TARGET,
  jarvisPalette,
  jarvisSpacing,
  jarvisTypeSizes
} from './jarvis-theme'
import type { LockState } from './lock-policy'
import { useAppLock } from './use-app-lock'
import { LockStateProvider } from './use-lock-state'

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

// Why the Jarvis palette and not the app theme: the lock screen is the character
// asleep (docs/personaje/jarvis.md §3), and it is the one screen that shows
// before the owner has proven who they are.
const styles = StyleSheet.create({
  gate: { flex: 1 },
  content: { flex: 1 },
  cover: {
    flex: 1,
    backgroundColor: jarvisPalette.abyss,
    alignItems: 'center',
    justifyContent: 'center',
    padding: jarvisSpacing.xl,
    gap: jarvisSpacing.lg
  },
  title: { color: jarvisPalette.fog, fontSize: jarvisTypeSizes.status, textAlign: 'center' },
  hint: { color: jarvisPalette.mist, fontSize: jarvisTypeSizes.status, textAlign: 'center' },
  reason: { color: jarvisPalette.coral, fontSize: jarvisTypeSizes.status, textAlign: 'center' },
  button: {
    backgroundColor: jarvisPalette.gold,
    borderRadius: 22,
    minHeight: JARVIS_MIN_TOUCH_TARGET,
    minWidth: JARVIS_MIN_TOUCH_TARGET,
    paddingHorizontal: jarvisSpacing.xl,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonText: { color: jarvisPalette.abyss, fontSize: jarvisTypeSizes.status, fontWeight: '600' }
})

/** Back does nothing while locked: it neither lifts the cover nor reaches the app behind it. */
function swallowBack(): void {}

// Mandatory app lock (docs/01-prd.md RF-2): everything the app shows sits under
// this gate. Children stay mounted while locked so navigation state survives;
// the cover just hides them from eyes and screen readers.
export function LockGate({ children, character }: LockGateProps): React.JSX.Element {
  const lock = useAppLock()
  const state = lock.state
  const locked = state !== 'unlocked'
  return (
    <LockStateProvider value={state}>
      <View style={styles.gate}>
        <View
          style={styles.content}
          {...(locked
            ? {
                accessibilityElementsHidden: true,
                importantForAccessibility: 'no-hide-descendants'
              }
            : null)}
        >
          {children}
        </View>
      </View>
      {/* Why a native Modal and not a View laid over the app: the app's drawers are native
          modals too, in a window of their own, and no View of ours can cover one. A drawer left
          open would stay visible and tappable above the lock, and Back would still reach the app. */}
      {locked && (
        <Modal
          visible
          transparent={false}
          animationType="none"
          onRequestClose={swallowBack}
          supportedOrientations={[
            'portrait',
            'portrait-upside-down',
            'landscape',
            'landscape-left',
            'landscape-right'
          ]}
        >
          <View style={styles.cover}>
            {character ?? null}
            <Text style={styles.title}>Jarvis está descansando</Text>
            {lock.unavailableReason ? (
              <Text style={styles.reason}>{lock.unavailableReason}</Text>
            ) : (
              <>
                <Text style={styles.hint}>{HINTS[state]}</Text>
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
              </>
            )}
          </View>
        </Modal>
      )}
    </LockStateProvider>
  )
}

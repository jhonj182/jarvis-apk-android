import { StyleSheet, View } from 'react-native'
import { Text } from '../../theme/dynamic-type-text'
import type { JarvisSetupNeed } from '../jarvis-contract'
import { jarvisPalette, jarvisSpacing, jarvisTypeSizes } from '../jarvis-theme'
import { jarvisCopy } from './jarvis-copy'
import { JarvisPillButton } from './JarvisPillButton'

/** A setup need the owner still has to resolve; the contract's `null` means there is none. */
export type JarvisSetupNeedId = Exclude<JarvisSetupNeed, null>

interface JarvisSetupNoticeProps {
  need: JarvisSetupNeedId
  /** The sentence to show: omitted, the one the design doc gives this need; null, only the button. */
  text?: string | null
  onOpenPairing: () => void
  onOpenWorkspaceSettings: () => void
  onOpenVoiceSettings: () => void
}

const RESOLVES: Record<JarvisSetupNeedId, (props: JarvisSetupNoticeProps) => void> = {
  'pair-desktop': (props) => props.onOpenPairing(),
  'choose-workspace': (props) => props.onOpenWorkspaceSettings(),
  'dictation-off': (props) => props.onOpenVoiceSettings()
}

/** What is missing before talking, and the one screen that fixes it. */
export function JarvisSetupNotice(props: JarvisSetupNoticeProps) {
  const sentence = props.text === undefined ? jarvisCopy.setup[props.need].text : props.text
  return (
    <View style={styles.notice}>
      {sentence !== null ? <Text style={styles.text}>{sentence}</Text> : null}
      <JarvisPillButton
        label={jarvisCopy.setup[props.need].action}
        onPress={() => RESOLVES[props.need](props)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  notice: {
    alignItems: 'center',
    paddingHorizontal: jarvisSpacing.xl
  },
  text: {
    fontSize: jarvisTypeSizes.status,
    lineHeight: 21,
    textAlign: 'center',
    color: jarvisPalette.fog
  }
})

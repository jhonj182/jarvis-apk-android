import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { ChevronLeft } from 'lucide-react-native'
import { Text } from '../../theme/dynamic-type-text'
import type { JarvisPreferencesController, JarvisWorkspaceOptions } from '../jarvis-contract'
import {
  JARVIS_MIN_TOUCH_TARGET,
  jarvisAlpha,
  jarvisFontWeights,
  jarvisPalette,
  jarvisSpacing,
  jarvisTypeSizes
} from '../jarvis-theme'
import { jarvisCopy } from './jarvis-copy'
import {
  JarvisSettingsCard,
  JarvisSettingsDivider,
  JarvisSettingsGroup,
  JarvisSettingsRow,
  JarvisSettingsSwitch
} from './JarvisSettingsPrimitives'
import { JarvisWorkspacePicker } from './JarvisWorkspacePicker'

export interface JarvisSettingsPanelProps {
  controller: JarvisPreferencesController
  options: JarvisWorkspaceOptions
  /** Room the system status bar and the navigation bar leave free. */
  topInset: number
  bottomInset: number
  onBack: () => void
  onOpenVoiceSettings: () => void
  onScanPairingCode: () => void
}

const copy = jarvisCopy.settingsScreen

/** "Ajustes de Jarvis": which workspace speaks, whether answers are read aloud, and the lock. */
export function JarvisSettingsPanel({
  controller,
  options,
  topInset,
  bottomInset,
  onBack,
  onOpenVoiceSettings,
  onScanPairingCode
}: JarvisSettingsPanelProps) {
  const { speechEnabled } = controller.preferences
  const [savingSpeech, setSavingSpeech] = useState(false)
  const [speechSaveFailed, setSpeechSaveFailed] = useState(false)

  const toggleSpeech = async (): Promise<void> => {
    if (savingSpeech) {
      return
    }
    setSavingSpeech(true)
    setSpeechSaveFailed(false)
    try {
      await controller.setSpeechEnabled(!speechEnabled)
    } catch {
      setSpeechSaveFailed(true)
    } finally {
      setSavingSpeech(false)
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable
          testID="jarvis-settings-back"
          onPress={onBack}
          hitSlop={jarvisSpacing.sm}
          accessibilityRole="button"
          accessibilityLabel={jarvisCopy.back}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        >
          <ChevronLeft size={22} color={jarvisPalette.fog} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          {jarvisCopy.settings}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset + jarvisSpacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <JarvisSettingsGroup title={copy.workspaceHeading} intro={copy.workspaceExplanation}>
          <JarvisSettingsCard>
            <JarvisWorkspacePicker
              controller={controller}
              options={options}
              onScanPairingCode={onScanPairingCode}
            />
          </JarvisSettingsCard>
        </JarvisSettingsGroup>

        <JarvisSettingsGroup title={copy.voiceHeading}>
          <JarvisSettingsCard>
            <JarvisSettingsRow
              testID="jarvis-setting-read-aloud"
              label={copy.readAloud}
              sublabel={speechEnabled ? undefined : copy.readAloudOff}
              role="switch"
              checked={speechEnabled}
              disabled={savingSpeech}
              onPress={() => void toggleSpeech()}
              accessory={<JarvisSettingsSwitch on={speechEnabled} />}
            />
            <JarvisSettingsDivider />
            <JarvisSettingsRow
              testID="jarvis-setting-voice"
              label={copy.voice}
              sublabel={copy.voiceExplanation}
              role="button"
              onPress={onOpenVoiceSettings}
            />
          </JarvisSettingsCard>
          {speechSaveFailed ? <Text style={styles.error}>{copy.saveFailed}</Text> : null}
        </JarvisSettingsGroup>

        <JarvisSettingsGroup title={copy.lockHeading}>
          <Text style={styles.lock}>{copy.lock}</Text>
        </JarvisSettingsGroup>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: jarvisPalette.abyss
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: jarvisSpacing.sm,
    paddingHorizontal: jarvisSpacing.md,
    marginBottom: jarvisSpacing.xs
  },
  back: {
    width: JARVIS_MIN_TOUCH_TARGET,
    height: JARVIS_MIN_TOUCH_TARGET,
    borderRadius: JARVIS_MIN_TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  backPressed: {
    backgroundColor: jarvisAlpha('fog', 0.12)
  },
  title: {
    fontSize: jarvisTypeSizes.title,
    fontWeight: jarvisFontWeights.title,
    color: jarvisPalette.fog
  },
  content: {
    paddingHorizontal: jarvisSpacing.lg
  },
  lock: {
    paddingHorizontal: jarvisSpacing.xs,
    fontSize: jarvisTypeSizes.status,
    lineHeight: 21,
    color: jarvisPalette.mist
  },
  error: {
    marginTop: jarvisSpacing.sm,
    paddingHorizontal: jarvisSpacing.xs,
    fontSize: jarvisTypeSizes.label,
    color: jarvisPalette.coral
  }
})

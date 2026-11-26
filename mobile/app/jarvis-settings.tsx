import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { JarvisSettingsPanel } from '../src/jarvis/jarvis-home/JarvisSettingsPanel'
import { useJarvisPreferences } from '../src/jarvis/use-jarvis-preferences'
import { useJarvisWorkspaceOptions } from '../src/jarvis/use-jarvis-workspace-options'

/** "Ajustes de Jarvis". It only binds: what to show and do lives in src/jarvis. */
export default function JarvisSettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const controller = useJarvisPreferences()
  const workspaceOptions = useJarvisWorkspaceOptions()

  return (
    <>
      <StatusBar style="light" />
      <JarvisSettingsPanel
        controller={controller}
        options={workspaceOptions}
        topInset={insets.top}
        bottomInset={insets.bottom}
        onBack={() => router.back()}
        onOpenVoiceSettings={() => router.push('/voice-settings')}
        onScanPairingCode={() => router.push('/pair-scan')}
      />
    </>
  )
}

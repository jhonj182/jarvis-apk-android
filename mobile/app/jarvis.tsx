import { StatusBar } from 'expo-status-bar'
import { useIsFocused, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { defaultLocalIntentHandler } from '../src/jarvis/default-local-intent-handler'
import { JarvisHomeScreen } from '../src/jarvis/jarvis-home/JarvisHomeScreen'
import { useJarvisConversation } from '../src/jarvis/use-jarvis-conversation'

// Said once per cold start, not after each unlock (docs/personaje/jarvis.md §2).
const GREETING = 'Aquí Jarvis. ¿Qué necesitas?'

/** The assistant screen. It only binds: what to show and do lives in src/jarvis. */
export default function JarvisScreen() {
  const router = useRouter()
  const focused = useIsFocused()
  const insets = useSafeAreaInsets()
  const conversation = useJarvisConversation({
    localIntents: defaultLocalIntentHandler,
    greeting: GREETING
  })

  return (
    <>
      <StatusBar style="light" />
      <JarvisHomeScreen
        conversation={conversation}
        focused={focused}
        topInset={insets.top}
        bottomInset={insets.bottom}
        onOpenSettings={() => router.push('/jarvis-settings')}
        onOpenOrca={() => router.push('/')}
        onOpenPairing={() => router.push('/pair-scan')}
        onOpenWorkspaceSettings={() => router.push('/jarvis-settings')}
        onOpenVoiceSettings={() => router.push('/voice-settings')}
      />
    </>
  )
}

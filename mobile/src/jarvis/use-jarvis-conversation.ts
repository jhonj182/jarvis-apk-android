// The conversation engine. It only coordinates: where Jarvis lives, its session, the dictation,
// the orders resolved on the phone, and the voice that reads the replies.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMobileDictation } from '../hooks/use-mobile-dictation'
import { useHostClient } from '../transport/client-context'
import type {
  JarvisConversation,
  JarvisLocalIntentHandler,
  JarvisOrderVoice,
  JarvisSetupNeed
} from './jarvis-contract'
import { deriveJarvisActivity, jarvisStatusText } from './conversation-activity'
import { jarvisDictationFailure } from './jarvis-dictation-status'
import { JARVIS_AGENT, resolveJarvisWorkspace } from './jarvis-session-attach'
import { useJarvisDictationAvailability } from './use-jarvis-dictation-availability'
import { useJarvisHostWorktrees } from './use-jarvis-host-worktrees'
import { useJarvisOutbox, type JarvisOutbox } from './use-jarvis-outbox'
import { useJarvisPreferences } from './use-jarvis-preferences'
import { useJarvisReplyVoice } from './use-jarvis-reply-voice'
import { useJarvisSessionAttach } from './use-jarvis-session-attach'
import { useJarvisTranscript, type JarvisTranscript } from './use-jarvis-transcript'
import { useLockState } from './use-lock-state'

export type JarvisConversationOptions = {
  localIntents: JarvisLocalIntentHandler
  /** Said once, the first time the session is connected and idle with the app open. */
  greeting?: string | null
}

/** How long a line about a failed send or dictation stays under the character. */
const NOTICE_MS = 10_000

/** What the callbacks need from the render they run in, without being recreated for it. */
type Latest = {
  localIntents: JarvisLocalIntentHandler
  transcript: JarvisTranscript
  outbox: JarvisOutbox
  speechOn: boolean
  say: (text: string) => void
  /** Silences the voice now and drops the rest of the reply being read. */
  silence: () => void
  /** The voice a local order may use before it runs; none when it could not be heard. */
  orderVoice: () => JarvisOrderVoice | undefined
  announce: (text: string) => void
  sendText: (text: string) => void
}

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error))

export function useJarvisConversation(options: JarvisConversationOptions): JarvisConversation {
  const { preferences, setSpeechEnabled } = useJarvisPreferences()
  // Why: filled in at the end of every render, so callbacks read current state without being recreated.
  const latest = useRef<Latest | null>(null)
  const catalogs = useJarvisHostWorktrees()
  const { hostsLoaded, pairedHostIds, hosts } = catalogs
  const { workspace } = preferences
  const resolution = useMemo(
    () =>
      resolveJarvisWorkspace({
        hostsLoaded,
        pairedHostIds,
        preference: workspace,
        catalogs: hosts.map((entry) => ({
          hostId: entry.host.id,
          hostName: entry.host.name,
          lastConnected: entry.host.lastConnected,
          worktrees: entry.worktrees
        }))
      }),
    [hosts, hostsLoaded, pairedHostIds, workspace]
  )
  const chosen = resolution.workspace
  const { client, state: hostState } = useHostClient(chosen?.hostId)
  const hostConnected = hostState === 'connected'
  // Why the lock reaches the engine (RF-2.1): the screen stays mounted while the app is locked,
  // so without this Jarvis would greet behind the prompt and read replies to a locked phone.
  const unlocked = useLockState() === 'unlocked'
  const attach = useJarvisSessionAttach({
    client,
    hostState,
    worktreeId: chosen?.worktreeId ?? null,
    // Why: the screens are mounted before the owner has unlocked. A session that already exists
    // is found, but none is opened on the desktop for someone who has not authenticated yet.
    mayCreate: unlocked
  })
  const target = attach.target
  const agentBusy = target?.agentBusy ?? false
  const agentWaiting = target?.agentWaiting ?? false
  const connected = hostConnected && attach.phase === 'attached' && target !== null
  const attached = attach.phase === 'attached' && target !== null

  const transcript = useJarvisTranscript({
    client,
    hostId: chosen?.hostId ?? '',
    worktreeId: chosen?.worktreeId ?? '',
    agent: target ? JARVIS_AGENT : null,
    sessionId: target?.sessionId ?? null,
    transcriptPath: target?.transcriptPath ?? null,
    agentBusy
  })
  const dictationSetup = useJarvisDictationAvailability({ client, active: attached })
  const speechOn = preferences.speechEnabled
  const voice = useJarvisReplyVoice({
    identity: `${chosen?.hostId ?? ''}\u0000${chosen?.worktreeId ?? ''}\u0000${target?.sessionId ?? ''}`,
    transcript: transcript.transcript,
    echoes: transcript.echoes,
    settled: transcript.settled,
    enabled: speechOn && unlocked,
    agentBusy
  })

  // A line about what became of the owner's last action; it fades unless something else replaces it.
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const announce = useCallback((text: string) => {
    setNotice(text)
    if (noticeTimer.current) {
      clearTimeout(noticeTimer.current)
    }
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS)
    if (latest.current?.speechOn) {
      latest.current.say(text)
    }
  }, [])
  useEffect(
    () => () => {
      if (noticeTimer.current) {
        clearTimeout(noticeTimer.current)
      }
    },
    []
  )

  const mobileClientId = useMemo(
    () => hosts.find((entry) => entry.host.id === chosen?.hostId)?.host.deviceToken ?? null,
    [chosen?.hostId, hosts]
  )
  const lastReplyKey = useMemo(() => {
    let key = ''
    for (const message of transcript.transcript) {
      if (message.role === 'assistant') {
        key = `${message.id}:${message.text.length}`
      }
    }
    return key
  }, [transcript.transcript])
  const outbox = useJarvisOutbox({
    client,
    hostConnected,
    terminal: target?.terminal ?? null,
    mobileClientId,
    attaching: attach.attaching,
    agentBusy,
    agentWaiting,
    lastReplyKey,
    onNotice: announce
  })

  const [dictationOff, setDictationOff] = useState(false)
  const reportDictationError = useCallback((error: Error) => {
    const failure = jarvisDictationFailure(error.message)
    if (failure.setupNeed) {
      setDictationOff(true)
    }
    latest.current?.announce(failure.text)
  }, [])

  const dispatch = useCallback(async (raw: string): Promise<void> => {
    const text = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
    if (text === '') {
      return
    }
    const now = latest.current
    if (!now) {
      return
    }
    const local = await now.localIntents.handle(text, now.orderVoice()).catch((error: unknown) => {
      console.warn('Jarvis could not resolve an order on the phone', error)
      return null
    })
    if (local !== null) {
      now.transcript.addEcho({ role: 'user', text })
      now.transcript.addEcho({ role: 'assistant', text: local })
      // What had to be heard, the order said through the voice it was given, before it ran.
      return
    }
    const echoId = now.transcript.addEcho({ role: 'user', text })
    if (!(await now.outbox.sendToAgent(text))) {
      now.transcript.removeEcho(echoId)
    }
  }, [])
  const sendText = useCallback((text: string) => void dispatch(text), [dispatch])

  // Why `unlocked` too: on Android a system dialog, the microphone permission first of all, is
  // another Activity, and the app passing through it locks. The dictation must not open the
  // microphone behind the lock; the hook cancels the moment this turns false.
  const canListen = useRef(connected && unlocked)
  canListen.current = connected && unlocked
  const dictation = useMobileDictation({
    client: connected && client ? client : null,
    enabled: connected && unlocked,
    onTranscript: (text) => latest.current?.sendText(text),
    onError: (error) => reportDictationError(error)
  })
  const dictationNow = useRef(dictation)
  dictationNow.current = dictation
  const startListening = useCallback(() => {
    if (!canListen.current) {
      return
    }
    // Why before the dictation: its microphone would hear Jarvis's own voice and send it
    // back as if the owner had said it. Pressing to talk is also the way to interrupt.
    latest.current?.silence()
    void dictation.start().catch((error: unknown) => reportDictationError(asError(error)))
  }, [dictation.start, reportDictationError])
  const stopListening = useCallback(() => {
    // Why cancel while it starts: `stop` does nothing until the dictation exists on the desktop,
    // and a short tap would leave the microphone open with nobody holding the button.
    const now = dictationNow.current
    const release = now.isStarting ? now.cancel : now.stop
    void release().catch((error: unknown) => reportDictationError(asError(error)))
  }, [reportDictationError])
  // Why the order speaks and not the engine afterwards: opening another app silences the voice,
  // so a confirmation has to be said before that happens, and only the order knows when it will.
  const orderVoice = useCallback(
    (): JarvisOrderVoice | undefined =>
      speechOn && unlocked ? { say: voice.sayBeforeActing } : undefined,
    [speechOn, unlocked, voice.sayBeforeActing]
  )
  latest.current = {
    localIntents: options.localIntents,
    transcript,
    outbox,
    speechOn,
    say: voice.say,
    silence: voice.discard,
    orderVoice,
    announce,
    sendText
  }

  const greeted = useRef(false)
  const greeting = options.greeting ?? null
  const { say } = voice
  useEffect(() => {
    if (!connected || agentBusy || greeted.current || !greeting || !unlocked) {
      return
    }
    greeted.current = true
    if (speechOn) {
      say(greeting)
    }
  }, [connected, agentBusy, greeting, speechOn, say, unlocked])

  const setupNeed: JarvisSetupNeed =
    resolution.setupNeed ??
    (dictationOff || dictationSetup.availability === 'off' ? 'dictation-off' : null)
  const activity = deriveJarvisActivity({
    listening: dictation.isStarting || dictation.isRecording,
    transcribing: dictation.isProcessing,
    speaking: voice.speaking,
    agentBusy,
    agentWaiting,
    awaitingReply: outbox.awaitingReply
  })

  return {
    activity,
    statusText: jarvisStatusText({
      activity,
      connected,
      setupNeed,
      spokenText: voice.spokenText,
      error: notice ?? (hostConnected ? attach.error : null) ?? transcript.error,
      attaching: attach.attaching,
      agentWaiting
    }),
    messages: transcript.messages,
    connected,
    setupNeed,
    speechEnabled: speechOn,
    startListening,
    stopListening,
    sendText,
    toggleSpeech: useCallback(() => void setSpeechEnabled(!speechOn), [setSpeechEnabled, speechOn]),
    stopSpeaking: voice.discard
  }
}

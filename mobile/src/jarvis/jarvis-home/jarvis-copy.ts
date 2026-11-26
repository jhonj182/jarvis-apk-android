// Every sentence the Jarvis screens show, in one place to read them all: Spanish from
// Colombia, "tú" or impersonal, never voseo, no emojis. Source: docs/personaje/jarvis.md,
// tables "Estados" and "Texto de la interfaz"; what it does not carry says so here.
// The status line under the character is the engine's: it is not repeated here.

export const jarvisCopy = {
  wordmark: 'JARVIS',
  settings: 'Ajustes de Jarvis',
  back: 'Volver',
  connected: 'Escritorio conectado',
  disconnected: 'Sin conexión con el escritorio',
  speechOff: 'Leer respuestas en voz alta: desactivado',
  speakingNow: 'Jarvis está hablando',
  speakingNowHint: 'Toca para detener la lectura',
  stopSpeaking: 'Detener lectura',
  talk: 'Mantén para hablar',
  talkLabel: 'Micrófono',
  talkHint: 'Mantén presionado para hablar; suelta para enviar',
  talkRelease: 'Suelta para enviar',
  write: 'Escribe tu mensaje',
  send: 'Enviar',
  planToday: 'Plan de hoy',
  planTodayHint: 'Pide a Jarvis el plan de hoy',
  music: 'Música',
  musicHint: 'Pide música',
  orca: 'Orca',
  orcaHint: 'Abre Orca Lab',
  you: 'Tú',
  jarvis: 'Jarvis',
  conversation: 'Conversación',
  writing: '…',
  writingLabel: 'Jarvis está escribiendo',
  actions: 'Acciones rápidas',
  setup: {
    'pair-desktop': { text: 'Empareja tu escritorio para empezar', action: 'Escanear código' },
    'choose-workspace': {
      text: 'Elige desde qué espacio de trabajo habla Jarvis',
      action: 'Elegir'
    },
    'dictation-off': {
      text: 'El dictado no está activo en el escritorio',
      action: 'Abrir ajustes de voz'
    }
  } as const,
  settingsScreen: {
    workspaceHeading: 'Espacio de trabajo',
    workspaceExplanation: 'Elige desde qué espacio de trabajo habla Jarvis.',
    workspaceGroup: 'Espacio de trabajo de Jarvis',
    workspaceOption: 'Espacio de trabajo',
    workspaceLoading: 'Buscando espacios de trabajo…',
    workspaceError: 'No se pudieron cargar los espacios de trabajo.',
    workspaceEmpty: 'Todavía no hay un escritorio emparejado.',
    retry: 'Reintentar',
    scan: 'Escanear código',
    voiceHeading: 'Voz',
    readAloud: 'Leer respuestas en voz alta',
    readAloudOff: 'Leer respuestas en voz alta: desactivado',
    voice: 'Ajustes de voz',
    voiceExplanation: 'El dictado se configura en el escritorio.',
    lockHeading: 'Bloqueo',
    lock: 'Jarvis se bloquea con tu huella o tu rostro al abrir y cada vez que la app vuelve a primer plano. Sin desbloquear, no muestra nada.',
    saveFailed: 'No se pudo guardar. Vuelve a intentarlo.'
  }
} as const

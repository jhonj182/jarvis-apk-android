import { describe, expect, it } from 'vitest'
import { deriveJarvisActivity, jarvisStatusText } from './conversation-activity'

const IDLE = {
  listening: false,
  transcribing: false,
  speaking: false,
  agentBusy: false,
  agentWaiting: false,
  awaitingReply: false
}

describe('deriveJarvisActivity', () => {
  it.each([
    ['nothing happening', {}, 'idle'],
    ['the agent is working', { agentBusy: true }, 'thinking'],
    ['the agent waits for a permission on the desktop', { agentWaiting: true }, 'thinking'],
    ['a message was sent and no reply is visible yet', { awaitingReply: true }, 'thinking'],
    ['the dictation is being transcribed', { transcribing: true }, 'thinking'],
    ['the voice is reading', { speaking: true }, 'speaking'],
    [
      'the voice reads while the agent still works',
      { speaking: true, agentBusy: true },
      'speaking'
    ],
    ['the owner is dictating', { listening: true }, 'listening'],
    [
      'the owner dictates while the voice reads and the agent works',
      { listening: true, speaking: true, agentBusy: true },
      'listening'
    ]
  ])('%s → %s', (_name, flags, expected) => {
    expect(deriveJarvisActivity({ ...IDLE, ...flags })).toBe(expected)
  })
})

describe('jarvisStatusText', () => {
  const BASE = { activity: 'idle' as const, connected: true, setupNeed: null }

  it.each([
    ['idle', 'idle', '¿Qué necesitas?'],
    ['listening', 'listening', 'Te escucho'],
    ['thinking', 'thinking', 'Pensando']
  ])('names the activity %s', (_name, activity, expected) => {
    expect(jarvisStatusText({ ...BASE, activity })).toBe(expected)
  })

  // Why: Claude's permission dialog is on the desktop. Without this line the owner waits for an
  // answer that cannot come, with nothing telling where to go.
  it.each([
    ['thinking', 'Espero tu permiso en Orca Lab'],
    ['listening', 'Te escucho'],
    ['speaking', 'Hablando']
  ])('says where the agent waits while the activity is %s', (activity, expected) => {
    expect(jarvisStatusText({ ...BASE, activity, agentWaiting: true })).toBe(expected)
  })

  it('shows the sentence being read while speaking', () => {
    expect(
      jarvisStatusText({ ...BASE, activity: 'speaking', spokenText: 'Van dos en revisión.' })
    ).toBe('Van dos en revisión.')
    expect(jarvisStatusText({ ...BASE, activity: 'speaking' })).toBe('Hablando')
  })

  it.each(['listening', 'thinking', 'speaking'] as const)(
    'shows the offline line when the desktop is gone, even while %s',
    (activity) => {
      expect(jarvisStatusText({ ...BASE, activity, connected: false })).toBe(
        'Sin conexión con el escritorio'
      )
    }
  )

  it.each([
    ['pair-desktop', 'Empareja tu escritorio para empezar'],
    ['choose-workspace', 'Elige desde qué espacio de trabajo habla Jarvis']
  ])('names what the owner must do for %s', (setupNeed, expected) => {
    expect(jarvisStatusText({ ...BASE, setupNeed })).toBe(expected)
  })

  it('keeps the conversation line when only the dictation is off: the keyboard still works', () => {
    expect(jarvisStatusText({ ...BASE, setupNeed: 'dictation-off' })).toBe('¿Qué necesitas?')
  })

  it('says it is connecting while the session is being opened on a connected desktop', () => {
    expect(jarvisStatusText({ ...BASE, connected: false, attaching: true })).toBe(
      'Conectando con Jarvis…'
    )
  })

  it('an error says what failed and outranks every other line', () => {
    expect(
      jarvisStatusText({
        ...BASE,
        activity: 'speaking',
        connected: false,
        setupNeed: 'choose-workspace',
        error: 'No encuentro el escritorio. ¿Está abierto Orca Lab?'
      })
    ).toBe('No encuentro el escritorio. ¿Está abierto Orca Lab?')
  })
})

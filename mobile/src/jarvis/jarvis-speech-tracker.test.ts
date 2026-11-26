import { describe, expect, it } from 'vitest'
import type { JarvisMessage } from './jarvis-contract'
import { createJarvisSpeechTracker } from './jarvis-speech-tracker'

const assistant = (text: string, streaming = false, id = 'a1'): JarvisMessage => ({
  id,
  role: 'assistant',
  text,
  streaming
})
const user = (text: string, id = 'u1'): JarvisMessage => ({
  id,
  role: 'user',
  text,
  streaming: false
})

const collect = (
  tracker: ReturnType<typeof createJarvisSpeechTracker>,
  ...steps: JarvisMessage[][]
) => steps.map((messages) => tracker.collect(messages))

describe('createJarvisSpeechTracker', () => {
  it('reads each sentence of a finished reply once', () => {
    const tracker = createJarvisSpeechTracker()

    expect(
      collect(tracker, [assistant('Hola. ¿Qué necesitas?')], [assistant('Hola. ¿Qué necesitas?')])
    ).toEqual([['Hola.', '¿Qué necesitas?'], []])
  })

  it('reads a reply sentence by sentence while it streams, holding back the unfinished last one', () => {
    const tracker = createJarvisSpeechTracker()

    expect(
      collect(
        tracker,
        [assistant('Voy a revisar', true)],
        [assistant('Voy a revisar los PRs. Hay', true)],
        [assistant('Voy a revisar los PRs. Hay dos en revisión', true)],
        [assistant('Voy a revisar los PRs. Hay dos en revisión y uno en rojo.', true)],
        [assistant('Voy a revisar los PRs. Hay dos en revisión y uno en rojo.', false)]
      )
    ).toEqual([[], ['Voy a revisar los PRs.'], [], ['Hay dos en revisión y uno en rojo.'], []])
  })

  it('reads the unfinished tail once the reply is no longer streaming', () => {
    const tracker = createJarvisSpeechTracker()

    expect(
      collect(tracker, [assistant('Espérame', true)], [assistant('Espérame un momento', false)])
    ).toEqual([[], ['Espérame un momento.']])
  })

  it('reads a finished list item before the next one arrives', () => {
    const tracker = createJarvisSpeechTracker()

    expect(
      collect(
        tracker,
        [assistant('1. Revisa los PRs\n2. Mira el CI', true)],
        [assistant('1. Revisa los PRs\n2. Mira el CI\n3. Avísame.', true)]
      )
    ).toEqual([['1. Revisa los PRs.'], ['2. Mira el CI.', '3. Avísame.']])
  })

  it('reads at most eight sentences and then the notice, however much the reply grows', () => {
    const tracker = createJarvisSpeechTracker()
    const reply = (count: number): JarvisMessage =>
      assistant(
        Array.from({ length: count }, (_unused, index) => `Frase ${index + 1}.`).join(' '),
        true
      )

    expect(collect(tracker, [reply(5)], [reply(12)], [reply(40)])).toEqual([
      ['Frase 1.', 'Frase 2.', 'Frase 3.', 'Frase 4.', 'Frase 5.'],
      ['Frase 6.', 'Frase 7.', 'Frase 8.', 'El detalle completo está en pantalla.'],
      []
    ])
  })

  it('never reads the owner, and skips anything but code and noise', () => {
    const tracker = createJarvisSpeechTracker()

    expect(
      collect(
        tracker,
        [user('¿Y?'), assistant('```\nconst a = 1\n```\nHecho. Revisa `src/x.ts`.')],
        [user('gracias')]
      )
    ).toEqual([['Hecho.', 'Revisa.'], []])
  })

  it('does not read history that was already there when the conversation attached', () => {
    const tracker = createJarvisSpeechTracker()
    const history = [user('vieja pregunta', 'u0'), assistant('vieja respuesta', false, 'a0')]

    tracker.skip(history)
    expect(tracker.collect(history)).toEqual([])
    expect(tracker.collect([...history, assistant('nueva respuesta', false, 'a1')])).toEqual([
      'nueva respuesta.'
    ])
  })

  it('reads the first reply of a brand-new session, which lands inside the first transcript read', () => {
    const tracker = createJarvisSpeechTracker()
    const first = [user('hola', 'u1'), assistant('Hola. ¿Qué necesitas?', false, 'a1')]

    tracker.skip(first, 'u1')

    expect(tracker.collect(first)).toEqual(['Hola.', '¿Qué necesitas?'])
  })

  it('reads nothing when the reply that confirms the sent prompt is not in the first read', () => {
    const tracker = createJarvisSpeechTracker()
    const first = [user('otra cosa', 'u0'), assistant('respuesta vieja', false, 'a0')]

    tracker.skip(first, 'u1')

    expect(tracker.collect(first)).toEqual([])
  })

  it('a stop discards the rest of what was being read, but not what comes after', () => {
    const tracker = createJarvisSpeechTracker()
    const midTurn = [user('plan', 'u1'), assistant('Paso uno. Paso', true, 'a1')]

    expect(tracker.collect(midTurn)).toEqual(['Paso uno.'])
    tracker.skip(midTurn)
    expect(
      tracker.collect([user('plan', 'u1'), assistant('Paso uno. Paso dos. Paso tres.', true, 'a1')])
    ).toEqual([])
    expect(
      tracker.collect([
        user('plan', 'u1'),
        assistant('Paso uno. Paso dos. Paso tres.', false, 'a1'),
        assistant('Listo.', false, 'a2')
      ])
    ).toEqual(['Listo.'])
  })

  it('does not read a message again when it leaves the window and comes back', () => {
    const tracker = createJarvisSpeechTracker()
    const one = assistant('Uno.', false, 'a1')
    const two = assistant('Dos.', false, 'a2')

    expect(collect(tracker, [one], [two], [one, two])).toEqual([['Uno.'], ['Dos.'], []])
  })
})

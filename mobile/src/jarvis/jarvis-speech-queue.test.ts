import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpeechOptions, Voice } from 'expo-speech'
import {
  createJarvisSpeechQueue,
  pickSpanishVoice,
  speechChunks,
  type SpeechEngine
} from './jarvis-speech-queue'
import { SPEECH_TRUNCATED_NOTICE } from './speech-text'

const voice = (language: string, identifier = `${language}-voice`): Voice => ({
  identifier,
  name: identifier,
  quality: 'Default' as unknown as Voice['quality'],
  language
})

type Utterance = { text: string; options: SpeechOptions | undefined }

function fakeEngine(voices: Voice[] = []) {
  const utterances: Utterance[] = []
  const stops = vi.fn(async () => undefined)
  const engine: SpeechEngine = {
    speak: vi.fn((text: string, options?: SpeechOptions) => {
      utterances.push({ text, options })
    }),
    stop: stops,
    getAvailableVoicesAsync: vi.fn(async () => voices),
    maxSpeechInputLength: 4000
  }
  return { engine, utterances, stops }
}

const finish = (utterance: Utterance, event: 'onDone' | 'onStopped' | 'onError' = 'onDone') => {
  const callback = utterance.options?.[event]
  if (typeof callback === 'function') {
    ;(callback as () => void)()
  }
}

describe('pickSpanishVoice', () => {
  it.each([
    ['every Spanish voice installed', ['en-us', 'es-mx', 'es-es', 'es-us', 'es-co'], 'es-co'],
    ['no Colombian voice', ['en-us', 'es-mx', 'es-es', 'es-us'], 'es-us'],
    ['only Spain', ['en-us', 'es-es', 'en-gb'], 'es-es'],
    ['another Spanish region', ['en-us', 'es-ar', 'it-it'], 'es-ar'],
    ['Spanish without a region', ['en-us', 'es', 'fr-fr'], 'es'],
    ['no Spanish at all', ['en-us', 'pt-br'], null],
    ['no voices', [], null]
  ])('picks the first available in order: %s', (_name, languages, expected) => {
    const picked = pickSpanishVoice(languages.map((language) => voice(language)))
    expect(picked?.language ?? null).toBe(expected)
  })

  it('ignores the case of the language tag', () => {
    expect(pickSpanishVoice([voice('es-CO')])?.identifier).toBe('es-CO-voice')
  })

  it('does not confuse es with a language that merely starts the same way', () => {
    expect(pickSpanishVoice([voice('est'), voice('esl')])).toBeNull()
  })
})

describe('speechChunks', () => {
  it('returns a short text as is', () => {
    expect(speechChunks('Hola.', 4000)).toEqual(['Hola.'])
  })

  it('cuts a long text at word boundaries without losing a word', () => {
    const text = `${'palabra '.repeat(90).trim()}.`
    const chunks = speechChunks(text, 200)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join(' ')).toBe(text)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200)
    }
  })

  it('leaves a single word longer than the limit alone', () => {
    expect(speechChunks('a'.repeat(50), 10)).toEqual(['a'.repeat(50)])
  })
})

describe('createJarvisSpeechQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  async function started(voices: Voice[] = [voice('es-CO')]) {
    const fake = fakeEngine(voices)
    const queue = createJarvisSpeechQueue(fake.engine)
    queue.speak('Hola.')
    await vi.advanceTimersByTimeAsync(0)
    return { ...fake, queue }
  }

  it('hands every sentence to the engine at once, in order, with the Spanish voice and no rate or pitch', async () => {
    const { engine, utterances } = await started()

    expect(engine.speak).toHaveBeenCalledTimes(1)
    expect(utterances[0]).toMatchObject({
      text: 'Hola.',
      options: { voice: 'es-CO-voice', language: 'es-CO' }
    })
    expect(utterances[0]?.options).not.toHaveProperty('rate')
    expect(utterances[0]?.options).not.toHaveProperty('pitch')
  })

  it('splits a text into sentences and queues each one without waiting for the previous to end', async () => {
    const { engine, utterances, queue } = await started()

    queue.speak('Van dos en revisión. Uno tiene CI en rojo.')

    expect(engine.speak).toHaveBeenCalledTimes(3)
    expect(utterances.map((utterance) => utterance.text)).toEqual([
      'Hola.',
      'Van dos en revisión.',
      'Uno tiene CI en rojo.'
    ])
  })

  it('caps what it reads at eight sentences and announces the cut', async () => {
    const { utterances, queue } = await started()
    queue.stop()

    queue.speak(Array.from({ length: 12 }, (_unused, index) => `Frase ${index + 1}.`).join(' '))

    expect(utterances.slice(1).map((utterance) => utterance.text)).toEqual([
      ...Array.from({ length: 8 }, (_unused, index) => `Frase ${index + 1}.`),
      SPEECH_TRUNCATED_NOTICE
    ])
  })

  it('ignores empty text', async () => {
    const { engine, queue } = await started()
    queue.stop()

    queue.speak('   \n ')
    await vi.advanceTimersByTimeAsync(0)

    expect(engine.speak).toHaveBeenCalledTimes(1)
    expect(queue.getSnapshot().speaking).toBe(false)
  })

  // Why: an order that opens another app must say its confirmation first, because leaving the
  // foreground silences the voice. Whoever gives the order needs to know when it was read.
  it('lets a caller wait until what it queued has been read', async () => {
    const { utterances, queue } = await started()
    queue.stop()

    const settled = vi.fn()
    void queue.speakAndWait('Reproduciendo salsa.', 60_000).then(settled)
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).not.toHaveBeenCalled()

    finish(utterances[1]!)
    await vi.advanceTimersByTimeAsync(0)

    expect(settled).toHaveBeenCalledTimes(1)
  })

  it('stops waiting when the voice is stopped', async () => {
    const { queue } = await started()
    queue.stop()

    const settled = vi.fn()
    void queue.speakAndWait('Reproduciendo salsa.', 60_000).then(settled)
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).not.toHaveBeenCalled()

    queue.stop()
    await vi.advanceTimersByTimeAsync(0)

    expect(settled).toHaveBeenCalledTimes(1)
  })

  it('gives up waiting when the engine stays silent for too long', async () => {
    const { queue } = await started()
    queue.stop()

    const settled = vi.fn()
    void queue.speakAndWait('Reproduciendo salsa.', 5_000).then(settled)
    await vi.advanceTimersByTimeAsync(4_000)
    expect(settled).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1_000)

    expect(settled).toHaveBeenCalledTimes(1)
  })

  it('does not wait when there was nothing to read', async () => {
    const { queue } = await started()
    queue.stop()

    await expect(queue.speakAndWait('   ', 60_000)).resolves.toBeUndefined()
  })

  it('reports speaking, with the sentence being read, until the last one finishes', async () => {
    const { utterances, queue } = await started()
    queue.speak('¿Qué necesitas?')
    const listener = vi.fn()
    queue.subscribe(listener)

    expect(queue.getSnapshot()).toEqual({ speaking: true, spokenText: '¿Qué necesitas?' })

    finish(utterances[0]!)
    expect(queue.getSnapshot()).toEqual({ speaking: true, spokenText: '¿Qué necesitas?' })

    finish(utterances[1]!, 'onError')
    expect(queue.getSnapshot()).toEqual({ speaking: false, spokenText: null })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('waits for the voice list instead of reading with an unknown voice', async () => {
    let resolveVoices: (voices: Voice[]) => void = () => undefined
    const fake = fakeEngine()
    fake.engine.getAvailableVoicesAsync = vi.fn(
      () => new Promise<Voice[]>((resolve) => (resolveVoices = resolve))
    )
    const queue = createJarvisSpeechQueue(fake.engine)

    queue.speak('Hola.')
    await vi.advanceTimersByTimeAsync(0)
    expect(fake.engine.speak).not.toHaveBeenCalled()

    resolveVoices([voice('es-US')])
    await vi.advanceTimersByTimeAsync(0)

    expect(fake.utterances[0]?.options).toMatchObject({ voice: 'es-US-voice', language: 'es-US' })
  })

  it('reads with the system voice when the list takes too long, and still keeps reading', async () => {
    const fake = fakeEngine([voice('es-CO')])
    fake.engine.getAvailableVoicesAsync = vi.fn(() => new Promise<Voice[]>(() => undefined))
    const queue = createJarvisSpeechQueue(fake.engine, { voiceTimeoutMs: 1000 })

    queue.speak('Hola.')
    await vi.advanceTimersByTimeAsync(1000)

    expect(fake.utterances[0]?.options).toMatchObject({ language: 'es-CO' })
    expect(fake.utterances[0]?.options).not.toHaveProperty('voice')

    queue.speak('Otra.')
    expect(fake.engine.speak).toHaveBeenCalledTimes(2)
  })

  it('reads with the system voice when the list fails, and says so in the log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fake = fakeEngine()
    fake.engine.getAvailableVoicesAsync = vi.fn(async () => {
      throw new Error('TTS not initialized')
    })
    const queue = createJarvisSpeechQueue(fake.engine)

    queue.speak('Hola.')
    await vi.advanceTimersByTimeAsync(0)

    expect(fake.utterances[0]?.text).toBe('Hola.')
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('stops at once: drops what is queued, silences the engine and forgets what was playing', async () => {
    const { engine, utterances, stops, queue } = await started()
    queue.speak('Primero.')
    queue.speak('Segundo.')

    queue.stop()

    expect(stops).toHaveBeenCalledTimes(1)
    expect(queue.getSnapshot()).toEqual({ speaking: false, spokenText: null })

    finish(utterances[0]!)
    queue.speak('Tras parar.')
    expect(engine.speak).toHaveBeenCalledTimes(4)
    finish(utterances[1]!)
    finish(utterances[2]!)

    expect(queue.getSnapshot()).toEqual({ speaking: true, spokenText: 'Tras parar.' })
    finish(utterances[3]!)
    expect(queue.getSnapshot().speaking).toBe(false)
  })

  it('skips a sentence the engine refuses and keeps reading', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fake = fakeEngine([voice('es-CO')])
    const speak = vi
      .spyOn(fake.engine, 'speak')
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('engine busy')
      })
    const queue = createJarvisSpeechQueue(fake.engine)

    queue.speak('Primero. Segundo. Tercero.')
    await vi.advanceTimersByTimeAsync(0)

    expect(speak).toHaveBeenCalledTimes(3)
    expect(queue.getSnapshot()).toEqual({ speaking: true, spokenText: 'Tercero.' })
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('does not throw to the caller when the engine throws on stop', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { engine, queue } = await started()
    ;(engine.stop as () => Promise<void>) = vi.fn(async () => {
      throw new Error('engine gone')
    })

    expect(() => queue.stop()).not.toThrow()
    await vi.advanceTimersByTimeAsync(0)

    expect(queue.getSnapshot().speaking).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('gives up on an engine that never reports the end of a sentence', async () => {
    const { queue } = await started()

    await vi.advanceTimersByTimeAsync(29_000)
    expect(queue.getSnapshot().speaking).toBe(true)
    await vi.advanceTimersByTimeAsync(2000)

    expect(queue.getSnapshot()).toEqual({ speaking: false, spokenText: null })
  })

  it('cuts an utterance the engine could not accept for its length', async () => {
    const fake = fakeEngine([voice('es-CO')])
    fake.engine.maxSpeechInputLength = 20
    const queue = createJarvisSpeechQueue(fake.engine)

    queue.speak(`${'palabra '.repeat(8).trim()}.`)
    await vi.advanceTimersByTimeAsync(0)

    expect(fake.utterances.length).toBeGreaterThan(1)
    expect(fake.utterances.every((utterance) => utterance.text.length <= 20)).toBe(true)
  })

  it('prepares the voice once so the first sentence does not wait for the list', async () => {
    const fake = fakeEngine([voice('es-CO')])
    const queue = createJarvisSpeechQueue(fake.engine)

    queue.prepare()
    queue.prepare()
    await vi.advanceTimersByTimeAsync(0)
    queue.speak('Hola.')

    expect(fake.engine.getAvailableVoicesAsync).toHaveBeenCalledTimes(1)
    expect(fake.utterances[0]?.options).toMatchObject({ voice: 'es-CO-voice' })
  })

  it('ignores text that is not a string', async () => {
    const { engine, queue } = await started()
    queue.stop()

    queue.speak(undefined as unknown as string)
    await vi.advanceTimersByTimeAsync(0)

    expect(engine.speak).toHaveBeenCalledTimes(1)
  })

  it('ignores speak after dispose and stops notifying', async () => {
    const { engine, queue } = await started()
    const listener = vi.fn()
    queue.subscribe(listener)

    queue.dispose()
    queue.speak('Nada.')
    await vi.advanceTimersByTimeAsync(0)

    expect(engine.speak).toHaveBeenCalledTimes(1)
    expect(listener).not.toHaveBeenCalled()
  })
})

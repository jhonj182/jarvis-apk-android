import { describe, expect, it } from 'vitest'

import { classifyLocalIntent, musicConfirmation } from './local-intents'

// Why so many table cases: the classifier trades false positives for false
// negatives — sending a music order to the agent is cheap, hijacking a normal
// message is not. Each row pins one side of that trade.
describe('classifyLocalIntent', () => {
  describe('recognizes play orders', () => {
    it.each([
      ['ponme música de salsa', 'salsa'],
      ['toca a Joe Arroyo', 'Joe Arroyo'],
      ['reproduce la playlist de entrenamiento', 'playlist de entrenamiento'],
      ['pon música', ''],
      ['toca salsa', 'salsa'],
      ['PON MÚSICA DE ROCK', 'ROCK'],
      ['¿Pon música de rock?', 'rock'],
      ['quiero escuchar algo de salsa dura', 'salsa dura'],
      ['métele música de Diomedes Díaz', 'Diomedes Díaz'],
      ['pon a sonar la lista de los 80', 'lista de los 80'],
      ['póngame una de Shakira', 'Shakira'],
      ['escucho la canción de Héctor Lavoe', 'Héctor Lavoe'],
      ['reproduzca la música de la película Amélie', 'película Amélie'],
      ['Ponme algo de música electrónica', 'electrónica'],
      ['déjame escuchar a Binomio de Oro', 'Binomio de Oro'],
      ['tocáme música', '']
    ])('%s -> music.play %s', (text, query) => {
      expect(classifyLocalIntent(text)).toEqual({ kind: 'music.play', query })
    })
  })

  describe('rejects everything else', () => {
    it.each([
      '',
      '   ',
      'hola',
      '¿qué música le gusta a Shakira?',
      'busca la música de la película El Pianista en Plane',
      'escribe un ensayo sobre la música de los 80',
      'ponencia sobre música latina',
      'quiero escucharte un cuento'
    ])('%s -> unknown', (text) => {
      expect(classifyLocalIntent(text)).toEqual({ kind: 'unknown' })
    })
  })
})

describe('musicConfirmation', () => {
  it('names what it is about to play', () => {
    expect(musicConfirmation({ kind: 'music.play', query: 'salsa' })).toBe(
      'Reproduciendo salsa en YouTube Music.'
    )
  })

  it('falls back to plain music when the query is empty', () => {
    expect(musicConfirmation({ kind: 'music.play', query: '' })).toBe(
      'Reproduciendo música en YouTube Music.'
    )
  })
})

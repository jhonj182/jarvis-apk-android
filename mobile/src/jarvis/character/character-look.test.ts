import { describe, expect, it } from 'vitest'
import { jarvisAlpha, jarvisPalette } from '../jarvis-theme'
import { characterLookFor } from './character-look'
import type { JarvisCharacterActivity } from './character-motion'

const ACTIVITIES: JarvisCharacterActivity[] = [
  'idle',
  'listening',
  'thinking',
  'speaking',
  'sleeping',
  'offline'
]

function rgbOf(color: string): string {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16))
  return channels.join(', ')
}

describe('characterLookFor', () => {
  it('mixes no color outside the palette', () => {
    const palette = new Set(Object.values(jarvisPalette).map(rgbOf))
    for (const activity of ACTIVITIES) {
      const look = characterLookFor(activity)
      for (const [key, value] of Object.entries(look)) {
        if (typeof value !== 'string') {
          continue
        }
        const rgba = /^rgba\((\d+, \d+, \d+), [0-9.]+\)$/.exec(value)
        expect(palette.has(rgba ? rgba[1] : rgbOf(value)), `${activity}.${key} = ${value}`).toBe(
          true
        )
      }
    }
  })

  it('listens in ice and rests in gold', () => {
    expect(characterLookFor('listening').eye).toBe(jarvisPalette.ice)
    expect(characterLookFor('listening').arc).toBe(jarvisPalette.ice)
    expect(characterLookFor('idle').ring).toBe(jarvisPalette.gold)
    expect(characterLookFor('idle').eye).toBe(jarvisPalette.gold)
    expect(characterLookFor('speaking').ring).toBe(jarvisPalette.gold)
  })

  it('thinks over a slate ring with a pale sweep', () => {
    expect(characterLookFor('thinking').ring).toBe(jarvisPalette.mist)
    expect(characterLookFor('thinking').sweep).toBe(jarvisPalette.fog)
    expect(characterLookFor('thinking').eye).toBe(jarvisPalette.gold)
  })

  it('dims the base ring under the listening arcs so they stand out', () => {
    expect(characterLookFor('listening').ring).toBe(jarvisAlpha('ice', 0.32))
    expect(characterLookFor('listening').ring).not.toBe(characterLookFor('listening').arc)
  })

  it('switches the ring off to sleep and when the desktop is gone', () => {
    expect(characterLookFor('sleeping')).toMatchObject({
      ring: jarvisAlpha('gold', 0.16),
      ticks: false
    })
    expect(characterLookFor('offline')).toMatchObject({
      ring: jarvisAlpha('mist', 0.6),
      ticks: false
    })
    expect(characterLookFor('idle').ticks).toBe(true)
  })
})

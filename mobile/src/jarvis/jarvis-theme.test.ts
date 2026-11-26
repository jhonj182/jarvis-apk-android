import { describe, expect, it } from 'vitest'
import {
  JARVIS_MIN_TOUCH_TARGET,
  JARVIS_TALK_BUTTON_MIN_SIZE,
  jarvisAlpha,
  jarvisPalette
} from './jarvis-theme'

// The identity of the character (ADR-008, docs/personaje/jarvis.md §3). A hex that drifts here
// drifts on the screen and on the icon, which is drawn from these same colors.
describe('jarvis theme', () => {
  it('carries the seven colors of the character document, with their exact values', () => {
    expect(jarvisPalette).toEqual({
      abyss: '#071019',
      ink: '#10243A',
      gold: '#F2B544',
      ice: '#7FD8F0',
      coral: '#FF6B57',
      mist: '#7C8FA3',
      fog: '#C9D6E3'
    })
  })

  it('keeps every control reachable and the talk button under a thumb', () => {
    expect(JARVIS_MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(44)
    expect(JARVIS_TALK_BUTTON_MIN_SIZE).toBeGreaterThanOrEqual(72)
  })

  it('dims a palette color without inventing another', () => {
    expect(jarvisAlpha('gold', 0.5)).toBe('rgba(242, 181, 68, 0.5)')
  })
})

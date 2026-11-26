// Colors of the character in each state. Pure: palette tokens in, colors out.
// The table is the "Estados" table of docs/personaje/jarvis.md §3, with the two
// additions the screen needs: thinking turns the ring slate so the state stays
// recognizable without its sweep, and the base ring dims under the listening arcs.

import { jarvisAlpha, jarvisPalette } from '../jarvis-theme'
import type { JarvisCharacterActivity } from './character-motion'

export interface JarvisCharacterLook {
  eye: string
  ring: string
  tick: string
  arc: string
  sweep: string
  /** False when the twelve marks are switched off. */
  ticks: boolean
}

const LOOKS: Record<JarvisCharacterActivity, JarvisCharacterLook> = {
  idle: {
    eye: jarvisPalette.gold,
    ring: jarvisPalette.gold,
    tick: jarvisAlpha('gold', 0.5),
    arc: jarvisPalette.ice,
    sweep: jarvisPalette.fog,
    ticks: true
  },
  listening: {
    eye: jarvisPalette.ice,
    ring: jarvisAlpha('ice', 0.32),
    tick: jarvisAlpha('ice', 0.45),
    arc: jarvisPalette.ice,
    sweep: jarvisPalette.fog,
    ticks: true
  },
  thinking: {
    eye: jarvisPalette.gold,
    ring: jarvisPalette.mist,
    tick: jarvisAlpha('mist', 0.7),
    arc: jarvisPalette.ice,
    sweep: jarvisPalette.fog,
    ticks: true
  },
  speaking: {
    eye: jarvisPalette.gold,
    ring: jarvisPalette.gold,
    tick: jarvisAlpha('gold', 0.5),
    arc: jarvisPalette.ice,
    sweep: jarvisPalette.fog,
    ticks: true
  },
  sleeping: {
    eye: jarvisAlpha('gold', 0.4),
    ring: jarvisAlpha('gold', 0.16),
    tick: jarvisAlpha('gold', 0.3),
    arc: jarvisPalette.ice,
    sweep: jarvisPalette.fog,
    ticks: false
  },
  offline: {
    eye: jarvisAlpha('gold', 0.55),
    ring: jarvisAlpha('mist', 0.6),
    tick: jarvisAlpha('mist', 0.4),
    arc: jarvisPalette.ice,
    sweep: jarvisPalette.fog,
    ticks: false
  }
}

export function characterLookFor(activity: JarvisCharacterActivity): JarvisCharacterLook {
  return LOOKS[activity]
}

// Tokens of the Jarvis screens. Source of truth: docs/personaje/jarvis.md §3.
// Only the assistant screen and its settings use these; the Orca Lab screens keep
// src/theme/mobile-theme.ts. Pure data: the character's motion math imports it and
// must stay free of React Native.

export const jarvisPalette = {
  /** Fondo de la pantalla del asistente. */
  abyss: '#071019',
  /** Superficies: burbujas de la conversación. */
  ink: '#10243A',
  /** El personaje: ojos y anillo en reposo y hablando. */
  gold: '#F2B544',
  /** El personaje escuchando; estados del sistema. */
  ice: '#7FD8F0',
  /** Errores. */
  coral: '#FF6B57',
  /** Texto secundario. */
  mist: '#7C8FA3',
  /** Texto principal. */
  fog: '#C9D6E3'
} as const

export type JarvisPaletteColor = keyof typeof jarvisPalette

/** The same palette colors at a lower opacity; nothing outside the palette is mixed in. */
export function jarvisAlpha(color: JarvisPaletteColor, opacity: number): string {
  const hex = jarvisPalette[color]
  const channel = (offset: number): number => Number.parseInt(hex.slice(offset, offset + 2), 16)
  return `rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${opacity})`
}

export const jarvisSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  screenGutter: 16
} as const

/** Smallest touch target, and the push-to-talk button's minimum side. */
export const JARVIS_MIN_TOUCH_TARGET = 44
export const JARVIS_TALK_BUTTON_MIN_SIZE = 72

export const jarvisMetrics = {
  /** Ring diameter of the character at rest, as the design doc draws it. */
  characterSize: 208,
  /** Character size once a conversation takes the screen. */
  characterSizeCompact: 136,
  talkButtonSize: 84,
  composerMaxHeight: 132
} as const

export const jarvisTypeSizes = {
  /** Quién habla, encima de cada mensaje. */
  speakerLabel: 12,
  /** Acciones, leyenda del botón y textos de apoyo: el tramo bajo de "13 a 15". */
  label: 13,
  /** El nombre y la hora: el tramo alto de "13 a 15". */
  wordmark: 15,
  /** Línea de estado, ajustes y avisos. */
  status: 15,
  /** La conversación: lo que se lee de verdad. */
  conversation: 17,
  /** Título de una pantalla, igual que el resto de la app. */
  title: 20
} as const

export const jarvisFontWeights = {
  label: '600',
  title: '700'
} as const

/** Family the display face is loaded under at startup (see useJarvisDisplayFont). */
export const JARVIS_DISPLAY_FONT_FAMILY = 'ChakraPetch-SemiBold'

export type JarvisDisplayStyle = { fontFamily?: string; fontWeight?: '600' }

/**
 * Style for rotulados: the name and the clock. The face is already semibold, so it
 * must not be asked for a weight; the system fallback asks for 600 instead.
 */
export function jarvisDisplayStyle(displayFontLoaded: boolean): JarvisDisplayStyle {
  return displayFontLoaded ? { fontFamily: JARVIS_DISPLAY_FONT_FAMILY } : { fontWeight: '600' }
}

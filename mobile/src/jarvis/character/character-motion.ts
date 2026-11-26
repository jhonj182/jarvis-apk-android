// Geometry and motion curves of the character. Pure: no React, no React Native.
// The icon assets are drawn from CHARACTER_GEOMETRY as well, so the app and its
// icon stay one drawing (docs/personaje/jarvis.md §3).
//
// Kept worklet-safe (no captures beyond module constants): the functions marked
// 'worklet' run on the UI thread, and the tests run the very same functions.

import type { JarvisActivity } from '../jarvis-contract'

/** What the character expresses: the conversation states, plus the two the screen adds. */
export type JarvisCharacterActivity = JarvisActivity | 'sleeping' | 'offline'

/** Laid out in a 200 x 200 box. The ring is the base; the marks sit just outside it. */
export const CHARACTER_GEOMETRY = {
  viewbox: 200,
  center: 100,
  ringRadius: 88,
  ringStroke: 2.5,
  tickCount: 12,
  tickInnerRadius: 92.5,
  tickOuterRadius: 98.5,
  tickStroke: 2,
  eye: { centerX: 31, centerY: 100, width: 30, height: 40 }
} as const

export interface JarvisEyePose {
  /** 1 is the resting open eye; above 1 is wider; 0 is shut. */
  openness: number
  /** Where the eyes look, in box units. */
  gazeX: number
  gazeY: number
}

const EYE_POSES: Record<JarvisCharacterActivity, JarvisEyePose> = {
  idle: { openness: 1, gazeX: 0, gazeY: 0 },
  listening: { openness: 1.18, gazeX: 0, gazeY: 0 },
  thinking: { openness: 0.5, gazeX: 0, gazeY: -7 },
  speaking: { openness: 0.7, gazeX: 0, gazeY: 0 },
  sleeping: { openness: 0, gazeX: 0, gazeY: 0 },
  offline: { openness: 1, gazeX: 0, gazeY: 0 }
}

export function eyePoseFor(activity: JarvisCharacterActivity): JarvisEyePose {
  return EYE_POSES[activity]
}

/** A shut eye keeps a thin line instead of vanishing, so it still reads as an eye. */
export const EYE_CLOSED_SCALE = 0.04

export function eyesBlink(activity: JarvisCharacterActivity): boolean {
  return activity !== 'sleeping' && activity !== 'offline'
}

export type JarvisRingMood = 'rest' | 'listen' | 'think' | 'off'

export function ringMoodFor(activity: JarvisCharacterActivity): JarvisRingMood {
  if (activity === 'listening') {
    return 'listen'
  }
  if (activity === 'thinking') {
    return 'think'
  }
  if (activity === 'sleeping' || activity === 'offline') {
    return 'off'
  }
  return 'rest'
}

export function ringIsDashed(activity: JarvisCharacterActivity): boolean {
  return activity === 'offline'
}

export const BLINK_MIN_DELAY_MS = 4000
export const BLINK_MAX_DELAY_MS = 7000
export const BLINK_CLOSE_MS = 90
export const BLINK_OPEN_MS = 160
/** Breathing is the one movement that runs without interaction; the others follow it. */
export const BREATHING_PERIOD_MS = 3200
export const SWEEP_PERIOD_MS = 1600
export const SPEECH_BEAT_PERIOD_MS = 1500
/** How long a change of state takes to settle (eyes narrowing, gaze moving). */
export const POSE_CHANGE_MS = 240

const BREATHING_GAIN = 0.035
const SPEECH_BEAT_GAIN = 0.06

export function nextBlinkDelayMs(random: () => number = Math.random): number {
  const span = BLINK_MAX_DELAY_MS - BLINK_MIN_DELAY_MS
  return BLINK_MIN_DELAY_MS + Math.min(span - 1, Math.floor(random() * span))
}

/** Anything that is not a finite number between 0 and 1 counts as silence. */
export function clampMicrophoneLevel(level: number | undefined | null): number {
  'worklet'
  if (typeof level !== 'number' || !Number.isFinite(level)) {
    return 0
  }
  return Math.min(1, Math.max(0, level))
}

export interface JarvisArc {
  /** Degrees clockwise from twelve o'clock where the arc begins. */
  startDeg: number
  /** Share of the circumference the arc covers. */
  lengthFraction: number
}

const LISTENING_ARC_MIN = 0.08
const LISTENING_ARC_MAX = 0.5
const LISTENING_ARC_REST = 0.16
const LISTENING_ARC_REST_WIDTH = 3
const LISTENING_ARC_EXTRA_WIDTH = 2.5

export const LISTENING_SPIN_PERIOD_MS = 20_000

export function listeningArcLength(level: number | undefined): number {
  'worklet'
  if (level === undefined) {
    return LISTENING_ARC_REST
  }
  return LISTENING_ARC_MIN + (LISTENING_ARC_MAX - LISTENING_ARC_MIN) * clampMicrophoneLevel(level)
}

/** Two arcs facing each other, the first centered on twelve o'clock. */
export function listeningArcs(level: number | undefined): JarvisArc[] {
  const lengthFraction = listeningArcLength(level)
  return [0, 180].map((turn) => ({
    startDeg: -90 - (lengthFraction * 360) / 2 + turn,
    lengthFraction
  }))
}

export function listeningArcWidth(level: number | undefined): number {
  'worklet'
  if (level === undefined) {
    return LISTENING_ARC_REST_WIDTH
  }
  return CHARACTER_GEOMETRY.ringStroke + LISTENING_ARC_EXTRA_WIDTH * clampMicrophoneLevel(level)
}

export interface JarvisArcDashProps {
  strokeDasharray: number[]
  strokeDashoffset: number
  strokeWidth: number
}

export const RING_CIRCUMFERENCE = 2 * Math.PI * CHARACTER_GEOMETRY.ringRadius

/**
 * How to stroke one listening arc as a dashed ring. The pattern starts at three
 * o'clock; shifting it by half the arc centers it there, so a quarter turn puts it at twelve.
 */
export function arcDashProps(level: number | undefined): JarvisArcDashProps {
  'worklet'
  const length = listeningArcLength(level) * RING_CIRCUMFERENCE
  return {
    strokeDasharray: [length, RING_CIRCUMFERENCE - length],
    strokeDashoffset: length / 2,
    strokeWidth: listeningArcWidth(level)
  }
}

/** Degrees to turn the sweep overlay, clockwise: one full turn per unit of progress, from twelve. */
export function sweepAngleDeg(progress: number): number {
  'worklet'
  return 360 * (((progress % 1) + 1) % 1)
}

/** SVG path of an arc between two angles, measured clockwise from twelve o'clock. */
export function arcPath(startDeg: number, sweepDeg: number, radius: number): string {
  const point = (deg: number): string => {
    const radians = (deg * Math.PI) / 180
    return `${CHARACTER_GEOMETRY.center + radius * Math.sin(radians)} ${CHARACTER_GEOMETRY.center - radius * Math.cos(radians)}`
  }
  const largeArc = Math.abs(sweepDeg) > 180 ? 1 : 0
  const sweepFlag = sweepDeg < 0 ? 0 : 1
  return `M ${point(startDeg)} A ${radius} ${radius} 0 ${largeArc} ${sweepFlag} ${point(startDeg + sweepDeg)}`
}

/** 1 at both ends, a little larger in the middle: one beat per cycle. */
export function speechBeatScale(progress: number): number {
  'worklet'
  return 1 + SPEECH_BEAT_GAIN * Math.sin(Math.PI * progress)
}

export function breathingScale(progress: number): number {
  'worklet'
  return 1 + (BREATHING_GAIN * (1 - Math.cos(2 * Math.PI * progress))) / 2
}

export interface JarvisTickMark {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** The short marks around the ring, from twelve o'clock and clockwise. */
export function tickMarks(count: number = CHARACTER_GEOMETRY.tickCount): JarvisTickMark[] {
  const { center, tickInnerRadius, tickOuterRadius } = CHARACTER_GEOMETRY
  return Array.from({ length: count }, (_, index) => {
    const radians = (index / count) * 2 * Math.PI
    const sine = Math.sin(radians)
    const cosine = Math.cos(radians)
    return {
      x1: center + tickInnerRadius * sine,
      y1: center - tickInnerRadius * cosine,
      x2: center + tickOuterRadius * sine,
      y2: center - tickOuterRadius * cosine
    }
  })
}

import { describe, expect, it } from 'vitest'
import {
  CHARACTER_GEOMETRY,
  RING_CIRCUMFERENCE,
  arcDashProps,
  arcPath,
  breathingScale,
  clampMicrophoneLevel,
  eyePoseFor,
  eyesBlink,
  listeningArcWidth,
  listeningArcs,
  nextBlinkDelayMs,
  ringIsDashed,
  ringMoodFor,
  speechBeatScale,
  sweepAngleDeg,
  tickMarks,
  type JarvisCharacterActivity
} from './character-motion'

const ACTIVITIES: JarvisCharacterActivity[] = [
  'idle',
  'listening',
  'thinking',
  'speaking',
  'sleeping',
  'offline'
]

describe('eyePoseFor', () => {
  it('rests with open eyes and a quiet gaze', () => {
    expect(eyePoseFor('idle')).toEqual({ openness: 1, gazeX: 0, gazeY: 0 })
  })

  it('opens the eyes wider and looks straight while listening', () => {
    const pose = eyePoseFor('listening')
    expect(pose.openness).toBeGreaterThan(1)
    expect(pose.gazeX).toBe(0)
    expect(pose.gazeY).toBe(0)
  })

  it('narrows the eyes and looks up while thinking', () => {
    const pose = eyePoseFor('thinking')
    expect(pose.openness).toBeLessThan(0.6)
    expect(pose.gazeY).toBeLessThan(0)
  })

  it('keeps the eyes half relaxed while speaking, with no gaze drift', () => {
    const pose = eyePoseFor('speaking')
    expect(pose.openness).toBeGreaterThan(eyePoseFor('thinking').openness)
    expect(pose.openness).toBeLessThan(1)
    expect(pose.gazeX).toBe(0)
    expect(pose.gazeY).toBe(0)
  })

  it('shuts the eyes to sleep and opens them still when offline', () => {
    expect(eyePoseFor('sleeping').openness).toBe(0)
    expect(eyePoseFor('offline')).toEqual({ openness: 1, gazeX: 0, gazeY: 0 })
  })

  it('gives every state a look of its own once the blink and the ring are counted', () => {
    // Reposo and sin conexión share the same open eyes on purpose (design doc, "Estados"):
    // what tells them apart is that one blinks over a living ring and the other holds still
    // over a dashed, switched-off one.
    const looks = new Set(
      ACTIVITIES.map((activity) =>
        JSON.stringify([
          eyePoseFor(activity),
          eyesBlink(activity),
          ringMoodFor(activity),
          ringIsDashed(activity)
        ])
      )
    )
    expect(looks.size).toBe(ACTIVITIES.length)
  })
})

describe('blink', () => {
  it('blinks while awake and still, but not asleep or offline', () => {
    expect(ACTIVITIES.map(eyesBlink)).toEqual([true, true, true, true, false, false])
  })

  it('schedules the next blink between four and seven seconds out', () => {
    expect(nextBlinkDelayMs(() => 0)).toBe(4000)
    expect(nextBlinkDelayMs(() => 0.5)).toBe(5500)
    expect(nextBlinkDelayMs(() => 0.999)).toBeLessThan(7000)
    for (let sample = 0; sample < 50; sample += 1) {
      const delay = nextBlinkDelayMs()
      expect(delay).toBeGreaterThanOrEqual(4000)
      expect(delay).toBeLessThan(7000)
    }
  })
})

describe('ring', () => {
  it('changes mood with the state', () => {
    expect(ACTIVITIES.map(ringMoodFor)).toEqual(['rest', 'listen', 'think', 'rest', 'off', 'off'])
  })

  it('is dashed only when the desktop cannot be reached', () => {
    expect(ACTIVITIES.map(ringIsDashed)).toEqual([false, false, false, false, false, true])
  })
})

describe('clampMicrophoneLevel', () => {
  it('maps anything unexpected to silence', () => {
    expect(clampMicrophoneLevel(undefined)).toBe(0)
    expect(clampMicrophoneLevel(Number.NaN)).toBe(0)
    expect(clampMicrophoneLevel(-1)).toBe(0)
    expect(clampMicrophoneLevel(2)).toBe(1)
    expect(clampMicrophoneLevel(0.42)).toBeCloseTo(0.42)
  })
})

describe('listening arcs', () => {
  it('places two arcs opposite each other', () => {
    const arcs = listeningArcs(0.5)
    expect(arcs).toHaveLength(2)
    expect(arcs[0].lengthFraction).toBe(arcs[1].lengthFraction)
    expect(Math.abs(arcs[0].startDeg - arcs[1].startDeg)).toBe(180)
  })

  it('grow with the microphone level and settle at a resting length without one', () => {
    expect(listeningArcs(0)[0].lengthFraction).toBe(0.08)
    expect(listeningArcs(1)[0].lengthFraction).toBe(0.5)
    const half = listeningArcs(0.5)[0].lengthFraction
    expect(half).toBeGreaterThan(listeningArcs(0.2)[0].lengthFraction)
    expect(half).toBeLessThan(listeningArcs(0.8)[0].lengthFraction)
    const resting = listeningArcs(undefined)[0].lengthFraction
    expect(resting).toBeGreaterThan(0.08)
    expect(resting).toBeLessThan(0.5)
  })

  it('thickens as the level rises and keeps a resting width without one', () => {
    expect(listeningArcWidth(undefined)).toBe(3)
    expect(listeningArcWidth(0)).toBeLessThan(listeningArcWidth(1))
    expect(listeningArcWidth(2)).toBe(listeningArcWidth(1))
  })

  it('strokes each arc as a dash centered on its start, never longer than the ring', () => {
    for (const level of [0, 0.2, 0.5, 0.9, 1]) {
      const { strokeDasharray, strokeDashoffset, strokeWidth } = arcDashProps(level)
      const [dash, gap] = strokeDasharray
      expect(dash + gap).toBeCloseTo(RING_CIRCUMFERENCE)
      expect(strokeDashoffset).toBeCloseTo(dash / 2)
      expect(strokeWidth).toBeCloseTo(listeningArcWidth(level))
      expect(dash).toBeCloseTo(listeningArcs(level)[0].lengthFraction * RING_CIRCUMFERENCE)
    }
    const [dash] = arcDashProps(1).strokeDasharray
    const [rest] = arcDashProps(undefined).strokeDasharray
    expect(dash).toBeGreaterThan(rest)
  })
})

describe('time curves', () => {
  it('starts the sweep at twelve and wraps after a full turn', () => {
    expect(sweepAngleDeg(0)).toBe(0)
    expect(sweepAngleDeg(0.25)).toBe(90)
    expect(sweepAngleDeg(0.5)).toBe(180)
    expect(sweepAngleDeg(1.25)).toBe(90)
    expect(sweepAngleDeg(-0.25)).toBe(270)
  })

  it("draws a short arc as a clockwise path that hugs twelve o'clock", () => {
    const comet = arcPath(-9, 18, 98)
    // x, y, radius, radius, rotation, large-arc flag, sweep flag, x, y: the arc's nine numbers.
    const [startX, startY, radiusX, radiusY, , , sweepFlag, endX, endY] = comet
      .match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)!
      .map(Number)
    expect(comet).toContain(' A 98 98 0 0 1 ')
    expect([radiusX, radiusY, sweepFlag]).toEqual([98, 98, 1])
    expect(startX).toBeCloseTo(84.6694, 3)
    expect(endX).toBeCloseTo(115.3306, 3)
    expect(startY).toBeCloseTo(3.2066, 3)
    expect(endY).toBeCloseTo(3.2066, 3)
    expect(arcPath(0, 270, 50)).toContain(' A 50 50 0 1 1 ')
    expect(arcPath(10, -20, 50)).toContain(' A 50 50 0 0 0 ')
    expect(arcPath(0, 90, 50)).toMatch(/^M 100 50 A 50 50 0 0 1 150 100$/)
  })

  it('beats once per cycle while speaking and rests at both ends', () => {
    expect(speechBeatScale(0)).toBe(1)
    expect(speechBeatScale(1)).toBe(1)
    expect(speechBeatScale(0.5)).toBeCloseTo(1.06)
    expect(speechBeatScale(0.5)).toBeGreaterThan(speechBeatScale(0.25))
  })

  it('breathes gently around the resting size', () => {
    expect(breathingScale(0)).toBe(1)
    expect(breathingScale(1)).toBe(1)
    expect(breathingScale(0.5)).toBeCloseTo(1.035)
    expect(breathingScale(0.5) - 1).toBeLessThan(speechBeatScale(0.5) - 1)
  })
})

describe('drawing geometry', () => {
  it('draws the ring about 180 wide with a two-to-three point stroke', () => {
    const { ringRadius, ringStroke } = CHARACTER_GEOMETRY
    expect(ringRadius * 2).toBeGreaterThanOrEqual(175)
    expect(ringRadius * 2).toBeLessThanOrEqual(185)
    expect(ringStroke).toBeGreaterThanOrEqual(2)
    expect(ringStroke).toBeLessThanOrEqual(3)
  })

  it('keeps both eyes inside the ring, about one eye apart', () => {
    const {
      ringRadius,
      ringStroke,
      eye: { centerX, width }
    } = CHARACTER_GEOMETRY
    expect(centerX - width / 2).toBeGreaterThan(0)
    expect(centerX + width / 2).toBeLessThan(ringRadius - ringStroke)
    const gap = 2 * centerX - width
    expect(gap / width).toBeGreaterThan(0.8)
    expect(gap / width).toBeLessThan(1.2)
  })

  it('lays twelve short marks outside the ring, inside the box', () => {
    const marks = tickMarks()
    const { viewbox, ringRadius, ringStroke, tickCount, tickInnerRadius, tickOuterRadius } =
      CHARACTER_GEOMETRY
    expect(tickCount).toBe(12)
    expect(marks).toHaveLength(12)
    expect(tickInnerRadius).toBeGreaterThan(ringRadius + ringStroke)
    for (const mark of marks) {
      for (const value of [mark.x1, mark.y1, mark.x2, mark.y2]) {
        expect(value).toBeGreaterThan(0)
        expect(value).toBeLessThan(viewbox)
      }
    }
    const center = viewbox / 2
    const distance = (x1: number, y1: number, x2: number, y2: number): number =>
      Math.hypot(x2 - x1, y2 - y1)
    for (const mark of marks) {
      expect(distance(center, center, mark.x1, mark.y1)).toBeCloseTo(tickInnerRadius)
      expect(distance(center, center, mark.x2, mark.y2)).toBeCloseTo(tickOuterRadius)
    }
  })

  it('puts the first mark at twelve and the third at three', () => {
    const center = CHARACTER_GEOMETRY.viewbox / 2
    const marks = tickMarks()
    expect(marks[0].x1).toBeCloseTo(center)
    expect(marks[0].y2).toBeLessThan(marks[0].y1)
    expect(marks[3].y1).toBeCloseTo(center)
    expect(marks[3].x1).toBeLessThan(marks[3].x2)
  })
})

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jarvisAlpha, jarvisPalette } from '../jarvis-theme'
import { RING_CIRCUMFERENCE } from './character-motion'
import { JarvisCharacter } from './JarvisCharacter'
import type { JarvisCharacterActivity } from './character-motion'

// Why a wrapper: the published mock has no useReducedMotion, so the import would not link.
const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('react-native-reanimated', async (importOriginal) => {
  const published = await importOriginal<Record<string, unknown>>()
  return { ...published, default: published.default, useReducedMotion: () => motion.reduced }
})

// Why a DOM stand-in: react-native-svg ships native components; the real drawing is the test.
vi.mock('react-native-svg', async () => {
  const { createElement, forwardRef } = await import('react')
  type SvgProps = Record<string, unknown> & { animatedProps?: Record<string, unknown> }
  const attributes = (props: SvgProps): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries({ ...props, ...props.animatedProps })) {
      if (value === undefined || value === null || key === 'children' || key === 'animatedProps') {
        continue
      }
      const name =
        key === 'viewBox' ? key : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
      out[name] = Array.isArray(value) ? value.join(' ') : String(value)
    }
    return out
  }
  const node =
    (tag: string) =>
    ({ children, ...props }: SvgProps, ref: unknown) =>
      createElement(tag, { ...attributes(props), ref }, children)
  const group = ({ children, rotation, originX, originY, ...props }: SvgProps, ref: unknown) =>
    createElement(
      'g',
      {
        ...attributes(props),
        ref,
        transform: `rotate(${String(rotation)} ${String(originX)} ${String(originY)})`
      },
      children
    )
  return {
    default: forwardRef(node('svg')),
    Svg: forwardRef(node('svg')),
    Circle: forwardRef(node('circle')),
    Ellipse: forwardRef(node('ellipse')),
    Line: forwardRef(node('line')),
    Path: forwardRef(node('path')),
    G: forwardRef(group)
  }
})

function eyeTransform(side: 'left' | 'right'): string {
  const eye = document.body.querySelector<HTMLElement>(`[data-testid="jarvis-eye-${side}"]`)
  return eye?.style.transform ?? ''
}

/** The two drawn eyes, wherever they are: never inside the ring, which pulses without them. */
function eyeFills(): (string | null)[] {
  return [
    ...document.body.querySelectorAll<SVGEllipseElement>('[data-testid^="jarvis-eye-"] ellipse')
  ].map((ellipse) => ellipse.getAttribute('fill'))
}

function ringSvg(): SVGElement | null {
  return document.body.querySelector('[data-testid="jarvis-ring"] svg')
}

function ringStroke(): string | null {
  return ringSvg()?.querySelector('circle')?.getAttribute('stroke') ?? null
}

function arcs(): SVGCircleElement[] {
  return [
    ...document.body.querySelectorAll<SVGCircleElement>('[data-testid="jarvis-ring"] svg circle')
  ].slice(1)
}

function tickCount(): number {
  return ringSvg()?.querySelectorAll('line').length ?? 0
}

function sweeps(): SVGPathElement[] {
  return [...document.body.querySelectorAll<SVGPathElement>('[data-testid="jarvis-ring"] svg path')]
}

describe('JarvisCharacter', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    motion.reduced = false
  })

  const render = (
    activity: JarvisCharacterActivity,
    extra: { level?: number; size?: number } = {}
  ) => {
    act(() => root.render(<JarvisCharacter activity={activity} {...extra} />))
  }

  it('rests on a gold ring with twelve marks and open gold eyes', () => {
    render('idle')
    expect(ringStroke()).toBe(jarvisPalette.gold)
    expect(ringSvg()?.querySelector('circle')?.getAttribute('stroke-dasharray')).toBeNull()
    expect(tickCount()).toBe(12)
    expect(arcs()).toHaveLength(0)
    expect(eyeTransform('left')).toContain('scaleY(1)')
    expect(eyeTransform('right')).toContain('scaleY(1)')
    expect(eyeFills()).toEqual([jarvisPalette.gold, jarvisPalette.gold])
    expect(ringSvg()?.querySelector('ellipse')).toBeNull()
  })

  it('listens in ice, eyes wider, over two arcs', () => {
    render('listening')
    expect(ringStroke()).toBe(jarvisAlpha('ice', 0.32))
    expect(eyeFills()).toEqual([jarvisPalette.ice, jarvisPalette.ice])
    expect(eyeTransform('left')).toContain('scaleY(1.18)')
    const listening = arcs()
    expect(listening).toHaveLength(2)
    for (const arc of listening) {
      expect(arc.getAttribute('stroke')).toBe(jarvisPalette.ice)
      const [dash, gap] = (arc.getAttribute('stroke-dasharray') ?? '').split(' ').map(Number)
      expect(dash + gap).toBeCloseTo(RING_CIRCUMFERENCE)
      expect(arc.getAttribute('stroke-dashoffset')).toBeCloseTo(dash / 2, 5)
    }
  })

  it('grows the arcs with the microphone level', () => {
    const dashOf = (arc: SVGCircleElement | undefined): number =>
      Number((arc?.getAttribute('stroke-dasharray') ?? '').split(' ')[0])
    render('listening', { level: 0 })
    const quiet = dashOf(arcs()[0])
    expect(quiet).toBeCloseTo(RING_CIRCUMFERENCE * 0.08)
    // Why a fresh mount: the mock evaluates animated props while rendering, from the value at mount.
    act(() => root.render(<JarvisCharacter key="loud" activity="listening" level={1} />))
    const loud = dashOf(arcs()[0])
    expect(loud).toBeGreaterThan(quiet)
    expect(loud).toBeCloseTo(RING_CIRCUMFERENCE / 2)
  })

  it('thinks over a slate ring while a pale sweep runs the marks', () => {
    render('thinking')
    expect(ringStroke()).toBe(jarvisPalette.mist)
    expect(eyeTransform('left')).toContain('scaleY(0.5)')
    expect(eyeTransform('left')).toContain('translateY(')
    expect(sweeps().length).toBeGreaterThan(0)
    expect(sweeps().every((path) => path.getAttribute('stroke') === jarvisPalette.fog)).toBe(true)
  })

  it('speaks with relaxed eyes on a gold ring', () => {
    render('speaking')
    expect(ringStroke()).toBe(jarvisPalette.gold)
    expect(eyeTransform('right')).toContain('scaleY(0.7)')
    expect(arcs()).toHaveLength(0)
  })

  it('sleeps with shut eyes over a switched-off ring without marks', () => {
    render('sleeping')
    expect(ringStroke()).toBe(jarvisAlpha('gold', 0.16))
    expect(tickCount()).toBe(0)
    expect(eyeTransform('left')).toContain('scaleY(0.04)')
    expect(arcs()).toHaveLength(0)
    expect(sweeps()).toHaveLength(0)
  })

  it('holds still, dotted and dim, when the desktop cannot be reached', () => {
    render('offline')
    expect(ringSvg()?.querySelector('circle')?.getAttribute('stroke-dasharray')).not.toBeNull()
    expect(tickCount()).toBe(0)
    expect(eyeTransform('left')).toContain('scaleY(1)')
    expect(arcs()).toHaveLength(0)
  })

  it('drops the sweep and keeps the arcs still when motion is reduced', () => {
    motion.reduced = true
    render('thinking')
    expect(ringStroke()).toBe(jarvisPalette.mist)
    expect(sweeps()).toHaveLength(0)
    render('listening')
    expect(arcs()).toHaveLength(2)
  })

  it('draws at the requested size', () => {
    render('idle', { size: 180 })
    const svg = ringSvg()
    expect(svg?.getAttribute('width')).toBe('180')
    expect(svg?.getAttribute('height')).toBe('180')
  })

  it('stays out of the accessibility tree: the status line speaks for it', () => {
    render('idle')
    expect(document.body.querySelector('[role="image"]')).toBeNull()
    expect(document.body.querySelector('[aria-label]')).toBeNull()
  })
})

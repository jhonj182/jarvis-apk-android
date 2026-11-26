import { describe, expect, it } from 'vitest'
import { formatClockTime, millisecondsUntilNextMinute } from './clock-time'

describe('formatClockTime', () => {
  it('shows hours and minutes on a 24-hour clock with a leading zero', () => {
    expect(formatClockTime(new Date(2026, 10, 25, 9, 41))).toBe('09:41')
    expect(formatClockTime(new Date(2026, 10, 25, 0, 5))).toBe('00:05')
    expect(formatClockTime(new Date(2026, 10, 25, 12, 0))).toBe('12:00')
    expect(formatClockTime(new Date(2026, 10, 25, 23, 59, 30))).toBe('23:59')
  })
})

describe('millisecondsUntilNextMinute', () => {
  it('waits exactly until the minute changes', () => {
    expect(millisecondsUntilNextMinute(new Date(2026, 10, 25, 9, 41, 0, 0))).toBe(60_000)
    expect(millisecondsUntilNextMinute(new Date(2026, 10, 25, 9, 41, 30, 500))).toBe(29_500)
    expect(millisecondsUntilNextMinute(new Date(2026, 10, 25, 9, 41, 59, 999))).toBe(1)
  })

  it('never waits nothing or more than a minute', () => {
    for (let seconds = 0; seconds < 60; seconds += 1) {
      const wait = millisecondsUntilNextMinute(new Date(2026, 10, 25, 9, 41, seconds, 250))
      expect(wait).toBeGreaterThan(0)
      expect(wait).toBeLessThanOrEqual(60_000)
    }
  })
})

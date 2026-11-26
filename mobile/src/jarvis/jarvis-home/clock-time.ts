// The clock of the status row. Pure, so the minute tick is tested without timers.

/** "09:41": 24 hours, zero-padded, as the design doc draws the status row. */
export function formatClockTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

export function millisecondsUntilNextMinute(date: Date): number {
  return 60_000 - (date.getSeconds() * 1000 + date.getMilliseconds())
}

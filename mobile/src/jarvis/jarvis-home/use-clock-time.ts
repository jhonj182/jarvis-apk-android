import { useEffect, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { formatClockTime, millisecondsUntilNextMinute } from './clock-time'

// Why a few extra milliseconds: timers may fire a hair early, which would read the old minute
// and then wait a whole minute more for the right one.
const MINUTE_EDGE_GRACE_MS = 50

/** "09:41", kept current with one timer to the next minute, re-aimed when the app comes back. */
export function useClockTime(): string {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = (): void => {
      if (timer !== null) {
        clearTimeout(timer)
      }
      timer = setTimeout(
        () => {
          setNow(new Date())
          schedule()
        },
        millisecondsUntilNextMinute(new Date()) + MINUTE_EDGE_GRACE_MS
      )
    }
    schedule()

    // Why listen for "active": while the app is away the timers may be paused or fire late.
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') {
        setNow(new Date())
        schedule()
      }
    })
    return () => {
      if (timer !== null) {
        clearTimeout(timer)
      }
      subscription.remove()
    }
  }, [])

  return formatClockTime(now)
}

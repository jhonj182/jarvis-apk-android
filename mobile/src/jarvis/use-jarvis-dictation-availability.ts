// Whether the paired desktop can dictate right now: switched on, with a model that finished downloading.
import { useCallback, useEffect, useState } from 'react'
import { fetchDictationSetup, isDictationReady } from '../dictation/mobile-dictation-setup'
import type { RpcClient } from '../transport/rpc-client'

/** `unknown` until the desktop answers: an unanswered check never reads as "off". */
export type JarvisDictationAvailability = 'unknown' | 'ready' | 'off'

export function useJarvisDictationAvailability(args: {
  client: RpcClient | null
  active: boolean
}): { availability: JarvisDictationAvailability; recheck: () => void } {
  const { client, active } = args
  const [tick, setTick] = useState(0)
  const [answer, setAnswer] = useState<{
    client: RpcClient | null
    availability: JarvisDictationAvailability
  }>({ client: null, availability: 'unknown' })

  useEffect(() => {
    if (!client || !active) {
      return undefined
    }
    let cancelled = false
    void fetchDictationSetup(client).then(
      (setup) => {
        if (!cancelled) {
          setAnswer({ client, availability: isDictationReady(setup) ? 'ready' : 'off' })
        }
      },
      (error: unknown) => {
        if (cancelled) {
          return
        }
        console.warn('Jarvis could not read the dictation setup of the desktop', error)
        setAnswer({ client, availability: 'unknown' })
      }
    )
    return () => {
      cancelled = true
    }
  }, [client, active, tick])

  return {
    // Why: an answer that belonged to another connection says nothing about this one.
    availability: active && answer.client === client ? answer.availability : 'unknown',
    recheck: useCallback(() => setTick((count) => count + 1), [])
  }
}

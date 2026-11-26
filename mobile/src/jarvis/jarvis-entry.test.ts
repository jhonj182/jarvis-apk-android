import { beforeEach, describe, expect, it, vi } from 'vitest'
// Why only the decision is imported statically: the once-per-process flag is read through a
// fresh module below, which is the only way to see it reset.
import { shouldLandOnAssistant, type JarvisColdStartInput } from './jarvis-entry'

const plainLaunch: JarvisColdStartInput = { initialUrl: null, initialNotificationResponse: null }

describe('shouldLandOnAssistant', () => {
  it('lands on the assistant on a plain cold start', () => {
    expect(shouldLandOnAssistant(plainLaunch)).toBe(true)
  })

  it('does not land on the assistant when a deep link opened the app', () => {
    expect(shouldLandOnAssistant({ ...plainLaunch, initialUrl: 'jarvis://pair?code=abc' })).toBe(
      false
    )
    expect(shouldLandOnAssistant({ ...plainLaunch, initialUrl: 'orca://pair#abc' })).toBe(false)
  })

  it('does not land on the assistant when a notification tap opened the app', () => {
    expect(
      shouldLandOnAssistant({
        ...plainLaunch,
        initialNotificationResponse: { notification: { request: { identifier: 'n1' } } }
      })
    ).toBe(false)
  })

  it('treats an empty URL as no link', () => {
    expect(shouldLandOnAssistant({ ...plainLaunch, initialUrl: '' })).toBe(true)
  })

  it('does not mutate its input', () => {
    const input = { initialUrl: 'jarvis://pair', initialNotificationResponse: null }
    shouldLandOnAssistant(input)
    expect(input).toEqual({ initialUrl: 'jarvis://pair', initialNotificationResponse: null })
  })
})

describe('consumeJarvisColdStart', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('is true the first time in a process and false afterwards', async () => {
    const fresh = await import('./jarvis-entry')
    expect(fresh.consumeJarvisColdStart()).toBe(true)
    expect(fresh.consumeJarvisColdStart()).toBe(false)
    expect(fresh.consumeJarvisColdStart()).toBe(false)
  })

  it('is consumed even when the launch goes elsewhere, so a later return home stays home', async () => {
    const fresh = await import('./jarvis-entry')
    const launch: JarvisColdStartInput = {
      initialUrl: 'jarvis://pair',
      initialNotificationResponse: null
    }
    expect(fresh.consumeJarvisColdStart()).toBe(true)
    expect(fresh.shouldLandOnAssistant(launch)).toBe(false)
    expect(fresh.consumeJarvisColdStart()).toBe(false)
  })
})

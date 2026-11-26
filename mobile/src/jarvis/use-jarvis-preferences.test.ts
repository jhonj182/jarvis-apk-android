import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JarvisPreferences, JarvisWorkspaceRef } from './jarvis-contract'
import { createJarvisPreferencesStore } from './jarvis-preferences-store'
import { useJarvisPreferences } from './use-jarvis-preferences'

const DEFAULTS: JarvisPreferences = { workspace: null, speechEnabled: true }
const WORKSPACE: JarvisWorkspaceRef = { hostId: 'h', worktreeId: 'w', name: 'jarvis' }
type Controller = ReturnType<typeof useJarvisPreferences>

describe('useJarvisPreferences', () => {
  const mounted: { renderer?: ReactTestRenderer } = {}
  const load = vi.fn<() => Promise<JarvisPreferences>>()
  const save = vi.fn<(patch: Partial<JarvisPreferences>) => Promise<JarvisPreferences>>()
  const seen: Controller[] = []

  function Probe() {
    seen.push(useJarvisPreferences(store))
    return null
  }

  let store = createJarvisPreferencesStore({ load, save })
  let stored: JarvisPreferences = { ...DEFAULTS, speechEnabled: false }

  beforeEach(() => {
    stored = { ...DEFAULTS, speechEnabled: false }
    load.mockReset().mockImplementation(async () => stored)
    save.mockReset().mockImplementation(async (patch) => {
      stored = { ...stored, ...patch }
      return stored
    })
    store = createJarvisPreferencesStore({ load, save })
    seen.length = 0
  })

  afterEach(() => {
    act(() => mounted.renderer?.unmount())
    mounted.renderer = undefined
  })

  async function mount(): Promise<() => Controller> {
    await act(async () => {
      mounted.renderer = create(createElement(Probe))
    })
    return () => seen.at(-1)!
  }

  it('shows the defaults, then the stored record once it loads', async () => {
    expect(seen[0]?.preferences).toBeUndefined()
    const hook = await mount()

    expect(hook().preferences).toEqual({ workspace: null, speechEnabled: false })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('follows a change made through the shared store', async () => {
    const hook = await mount()

    await act(async () => {
      await store.update({ workspace: WORKSPACE })
    })

    expect(hook().preferences.workspace).toEqual(WORKSPACE)
  })

  it('saves the workspace and the speech flag through the store', async () => {
    const hook = await mount()

    await act(async () => {
      await hook().setWorkspace(WORKSPACE)
      await hook().setSpeechEnabled(true)
    })

    expect(save).toHaveBeenNthCalledWith(1, { workspace: WORKSPACE })
    expect(save).toHaveBeenNthCalledWith(2, { speechEnabled: true })
    expect(hook().preferences).toEqual({ workspace: WORKSPACE, speechEnabled: true })
  })

  it('hands out the same callbacks across renders', async () => {
    const hook = await mount()
    const before = hook()

    await act(async () => {
      await hook().setSpeechEnabled(true)
    })

    expect(hook().setWorkspace).toBe(before.setWorkspace)
    expect(hook().setSpeechEnabled).toBe(before.setSpeechEnabled)
  })

  it('does not reject to the screen when the save fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    save.mockImplementation(async () => {
      throw new Error('disk full')
    })
    const hook = await mount()

    await expect(hook().setSpeechEnabled(true)).resolves.toBeUndefined()

    expect(hook().preferences).toEqual({ workspace: null, speechEnabled: false })
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

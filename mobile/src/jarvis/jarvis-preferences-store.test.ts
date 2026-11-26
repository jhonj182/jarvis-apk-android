import { describe, expect, it, vi } from 'vitest'
import type { JarvisPreferences, JarvisWorkspaceRef } from './jarvis-contract'
import { createJarvisPreferencesStore } from './jarvis-preferences-store'

const DEFAULTS: JarvisPreferences = { workspace: null, speechEnabled: true }
const WORKSPACE: JarvisWorkspaceRef = { hostId: 'h', worktreeId: 'w', name: 'jarvis' }

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('createJarvisPreferencesStore', () => {
  it('starts from the defaults and hands out the same snapshot until something changes', () => {
    const store = createJarvisPreferencesStore({
      load: async () => DEFAULTS,
      save: async () => DEFAULTS
    })
    expect(store.getSnapshot()).toEqual(DEFAULTS)
    expect(store.getSnapshot()).toBe(store.getSnapshot())
  })

  it('loads once and notifies its readers', async () => {
    const loaded = { workspace: WORKSPACE, speechEnabled: false }
    const load = vi.fn(async () => loaded)
    const store = createJarvisPreferencesStore({ load, save: async () => loaded })
    const listener = vi.fn()
    store.subscribe(listener)

    await expect(store.load()).resolves.toEqual(loaded)
    expect(store.getSnapshot()).toEqual(loaded)
    expect(listener).toHaveBeenCalledTimes(1)

    await store.load()
    expect(load).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('shares one read between callers that load at the same time', () => {
    const read = deferred<JarvisPreferences>()
    const load = vi.fn(() => read.promise)
    const store = createJarvisPreferencesStore({ load, save: async () => DEFAULTS })

    const first = store.load()
    const second = store.load()
    read.resolve({ ...DEFAULTS, speechEnabled: false })

    return expect(Promise.all([first, second])).resolves.toEqual([
      { workspace: null, speechEnabled: false },
      { workspace: null, speechEnabled: false }
    ])
  })

  it('keeps an update made while the first load was still reading', async () => {
    const read = deferred<JarvisPreferences>()
    const saved = { workspace: null, speechEnabled: false }
    const store = createJarvisPreferencesStore({
      load: () => read.promise,
      save: async () => saved
    })

    const loading = store.load()
    await store.update({ speechEnabled: false })
    read.resolve(DEFAULTS)
    await loading

    expect(store.getSnapshot()).toEqual(saved)
  })

  it('updates at once, saves the patch and settles on what was saved', async () => {
    const saved: JarvisPreferences = { workspace: WORKSPACE, speechEnabled: true }
    const save = vi.fn(async () => saved)
    const store = createJarvisPreferencesStore({ load: async () => DEFAULTS, save })
    const listener = vi.fn()
    store.subscribe(listener)

    const updating = store.update({ workspace: WORKSPACE })
    expect(store.getSnapshot().workspace).toEqual(WORKSPACE)

    await expect(updating).resolves.toEqual(saved)
    expect(save).toHaveBeenCalledWith({ workspace: WORKSPACE })
    expect(store.getSnapshot()).toBe(saved)
  })

  it('puts back what was there when the save fails, and rejects', async () => {
    const save = vi.fn(async () => {
      throw new Error('disk full')
    })
    const store = createJarvisPreferencesStore({ load: async () => DEFAULTS, save })

    await expect(store.update({ speechEnabled: false })).rejects.toThrow('disk full')
    expect(store.getSnapshot()).toEqual(DEFAULTS)
  })

  it('does not let an older update overwrite or undo a newer one', async () => {
    const firstWrite = deferred<JarvisPreferences>()
    let call = 0
    const save = vi.fn(() => {
      call += 1
      return call === 1
        ? firstWrite.promise
        : Promise.resolve({ workspace: WORKSPACE, speechEnabled: false })
    })
    const store = createJarvisPreferencesStore({ load: async () => DEFAULTS, save })

    const older = store.update({ speechEnabled: false })
    const newer = store.update({ workspace: WORKSPACE })
    firstWrite.resolve({ workspace: null, speechEnabled: false })
    await Promise.all([older, newer])

    expect(store.getSnapshot()).toEqual({ workspace: WORKSPACE, speechEnabled: false })
  })

  it('keeps the newer update when the older of two fails', async () => {
    const firstWrite = deferred<JarvisPreferences>()
    let call = 0
    const save = vi.fn((): Promise<JarvisPreferences> => {
      call += 1
      return call === 1
        ? firstWrite.promise
        : Promise.resolve({ workspace: WORKSPACE, speechEnabled: true })
    })
    const load = vi.fn(async () => ({ workspace: WORKSPACE, speechEnabled: true }))
    const store = createJarvisPreferencesStore({ load, save })

    const older = store.update({ speechEnabled: false })
    const newer = store.update({ workspace: WORKSPACE })
    firstWrite.reject(new Error('disk full'))
    const olderOutcome = older.catch((error: unknown) => error)
    await newer
    await olderOutcome
    await vi.waitFor(() =>
      expect(store.getSnapshot()).toEqual({ workspace: WORKSPACE, speechEnabled: true })
    )
  })

  it('shows only the newer change when both updates fail', async () => {
    const save = vi.fn(async (): Promise<JarvisPreferences> => {
      throw new Error('disk full')
    })
    const store = createJarvisPreferencesStore({ load: async () => DEFAULTS, save })

    const older = store.update({ speechEnabled: false }).catch((error: unknown) => error)
    const newer = store.update({ workspace: WORKSPACE }).catch((error: unknown) => error)
    await Promise.all([older, newer])

    expect(store.getSnapshot()).toEqual(DEFAULTS)
  })

  it('stops notifying after unsubscribe', () => {
    const store = createJarvisPreferencesStore({
      load: async () => DEFAULTS,
      save: async () => DEFAULTS
    })
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    unsubscribe()

    void store.update({ speechEnabled: false })

    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps the defaults when loading itself fails', async () => {
    const store = createJarvisPreferencesStore({
      load: async () => {
        throw new Error('storage unavailable')
      },
      save: async () => DEFAULTS
    })

    await expect(store.load()).resolves.toEqual(DEFAULTS)
    expect(store.getSnapshot()).toEqual(DEFAULTS)
  })
})

import AsyncStorage from '@react-native-async-storage/async-storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JarvisWorkspaceRef } from './jarvis-contract'
import {
  DEFAULT_JARVIS_PREFERENCES,
  JARVIS_PREFERENCES_KEY,
  loadJarvisPreferences,
  parseJarvisPreferences,
  saveJarvisPreferences
} from './jarvis-preferences'

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn()
  }
}))

const WORKSPACE: JarvisWorkspaceRef = {
  hostId: 'host-1',
  worktreeId: 'repo-a::/w/jarvis',
  name: 'jarvis-mobile-brain'
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('parseJarvisPreferences', () => {
  it.each([
    ['nothing stored', null],
    ['an empty string', ''],
    ['broken JSON', '{not json'],
    ['JSON of another shape', '[1, 2]'],
    ['a string', '"speech"']
  ])('falls back to the defaults for %s', (_name, raw) => {
    expect(parseJarvisPreferences(raw)).toEqual(DEFAULT_JARVIS_PREFERENCES)
  })

  it('keeps a well-formed record and drops unknown keys', () => {
    expect(
      parseJarvisPreferences(
        JSON.stringify({ workspace: WORKSPACE, speechEnabled: false, theme: 'amber' })
      )
    ).toEqual({ workspace: WORKSPACE, speechEnabled: false })
  })

  it.each([
    ['a missing field', { speechEnabled: false }, { workspace: null, speechEnabled: false }],
    [
      'a workspace with empty ids',
      { workspace: { hostId: ' ', worktreeId: 'w', name: 'n' } },
      { workspace: null, speechEnabled: true }
    ],
    [
      'a workspace that is a string',
      { workspace: 'host-1' },
      { workspace: null, speechEnabled: true }
    ],
    [
      'a speech flag that is not boolean',
      { speechEnabled: 'false' },
      { workspace: null, speechEnabled: true }
    ]
  ])('repairs %s field by field', (_name, stored, expected) => {
    expect(parseJarvisPreferences(JSON.stringify(stored))).toEqual(expected)
  })
})

describe('loadJarvisPreferences', () => {
  beforeEach(() => {
    vi.mocked(AsyncStorage.getItem).mockReset()
    vi.mocked(AsyncStorage.setItem).mockReset()
  })

  it('reads the stored record under the versioned key', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(
      JSON.stringify({ workspace: WORKSPACE, speechEnabled: false })
    )

    await expect(loadJarvisPreferences()).resolves.toEqual({
      workspace: WORKSPACE,
      speechEnabled: false
    })
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(JARVIS_PREFERENCES_KEY)
  })

  it('returns the defaults when nothing is stored', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(null)

    await expect(loadJarvisPreferences()).resolves.toEqual(DEFAULT_JARVIS_PREFERENCES)
  })

  it('returns the defaults instead of throwing on corrupt JSON', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue('{"workspace":')

    await expect(loadJarvisPreferences()).resolves.toEqual(DEFAULT_JARVIS_PREFERENCES)
  })

  it('returns the defaults instead of throwing when storage cannot be read', async () => {
    vi.mocked(AsyncStorage.getItem).mockRejectedValue(new Error('storage unavailable'))

    await expect(loadJarvisPreferences()).resolves.toEqual(DEFAULT_JARVIS_PREFERENCES)
  })
})

describe('saveJarvisPreferences', () => {
  beforeEach(() => {
    vi.mocked(AsyncStorage.getItem).mockReset()
    vi.mocked(AsyncStorage.setItem).mockReset()
  })

  it('merges the patch over the stored record, saves it and returns the result', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(
      JSON.stringify({ workspace: WORKSPACE, speechEnabled: true })
    )

    await expect(saveJarvisPreferences({ speechEnabled: false })).resolves.toEqual({
      workspace: WORKSPACE,
      speechEnabled: false
    })
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      JARVIS_PREFERENCES_KEY,
      JSON.stringify({ workspace: WORKSPACE, speechEnabled: false })
    )
  })

  it('starts from the defaults when the stored record is corrupt', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue('not-json')

    await expect(saveJarvisPreferences({ workspace: WORKSPACE })).resolves.toEqual({
      workspace: WORKSPACE,
      speechEnabled: true
    })
  })

  it('normalizes what it is given before saving', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(null)

    await expect(
      saveJarvisPreferences({ workspace: { hostId: '', worktreeId: 'w', name: 'n' } })
    ).resolves.toEqual(DEFAULT_JARVIS_PREFERENCES)
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      JARVIS_PREFERENCES_KEY,
      JSON.stringify(DEFAULT_JARVIS_PREFERENCES)
    )
  })

  it('refuses to write over a record it could not read', async () => {
    vi.mocked(AsyncStorage.getItem).mockRejectedValue(new Error('storage unavailable'))

    await expect(saveJarvisPreferences({ speechEnabled: false })).rejects.toThrow(
      'storage unavailable'
    )
    expect(AsyncStorage.setItem).not.toHaveBeenCalled()
  })

  it('surfaces a failed write', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(null)
    vi.mocked(AsyncStorage.setItem).mockRejectedValue(new Error('disk full'))

    await expect(saveJarvisPreferences({ speechEnabled: false })).rejects.toThrow('disk full')
  })

  it('saves one at a time so the second read sees the first write', async () => {
    let stored: string | null = null
    const firstWrite = deferred<void>()
    vi.mocked(AsyncStorage.getItem).mockImplementation(async () => stored)
    vi.mocked(AsyncStorage.setItem)
      .mockImplementationOnce(async (_key, value) => {
        await firstWrite.promise
        stored = value
      })
      .mockImplementation(async (_key, value) => {
        stored = value
      })

    const first = saveJarvisPreferences({ workspace: WORKSPACE })
    await vi.waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1))
    const second = saveJarvisPreferences({ speechEnabled: false })
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1)
    firstWrite.resolve()

    await expect(first).resolves.toEqual({ workspace: WORKSPACE, speechEnabled: true })
    await expect(second).resolves.toEqual({ workspace: WORKSPACE, speechEnabled: false })
  })

  it('keeps saving after a failed write', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(null)
    vi.mocked(AsyncStorage.setItem)
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue(undefined)

    await expect(saveJarvisPreferences({ speechEnabled: false })).rejects.toThrow('disk full')
    await expect(saveJarvisPreferences({ speechEnabled: false })).resolves.toEqual({
      workspace: null,
      speechEnabled: false
    })
  })
})

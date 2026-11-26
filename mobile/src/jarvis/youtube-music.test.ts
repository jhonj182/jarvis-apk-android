import * as Linking from 'expo-linking'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { playYouTubeMusic } from './youtube-music'

vi.mock('expo-linking', () => ({
  canOpenURL: vi.fn(),
  sendIntent: vi.fn(),
  openURL: vi.fn()
}))

const mockedCanOpenURL = vi.mocked(Linking.canOpenURL)
const mockedSendIntent = vi.mocked(Linking.sendIntent)
const mockedOpenURL = vi.mocked(Linking.openURL)

const PLAY_FROM_SEARCH = 'android.media.action.MEDIA_PLAY_FROM_SEARCH'

describe('playYouTubeMusic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedOpenURL.mockResolvedValue()
  })

  it('plays through the system media search intent when YouTube Music answers', async () => {
    mockedCanOpenURL.mockResolvedValue(true)
    mockedSendIntent.mockResolvedValue()

    const launch = await playYouTubeMusic('salsa')

    expect(launch).toEqual({ ok: true, via: 'play-from-search' })
    expect(mockedSendIntent).toHaveBeenCalledWith(PLAY_FROM_SEARCH, [
      { key: 'query', value: 'salsa' }
    ])
    expect(mockedOpenURL).not.toHaveBeenCalled()
  })

  it('falls back to the web search when no app can open the domain', async () => {
    mockedCanOpenURL.mockResolvedValue(false)

    const launch = await playYouTubeMusic('joe arroyo')

    expect(launch).toEqual({ ok: true, via: 'url' })
    expect(mockedSendIntent).not.toHaveBeenCalled()
    expect(mockedOpenURL).toHaveBeenCalledWith(
      'https://music.youtube.com/search?q=joe%20arroyo'
    )
  })

  it('falls back to the web search when the intent throws', async () => {
    mockedCanOpenURL.mockResolvedValue(true)
    mockedSendIntent.mockRejectedValue(new Error('intent crashed'))

    const launch = await playYouTubeMusic('salsa')

    expect(launch).toEqual({ ok: true, via: 'url' })
    expect(mockedOpenURL).toHaveBeenCalledWith('https://music.youtube.com/search?q=salsa')
  })

  it('falls back to the web search when canOpenURL itself throws', async () => {
    mockedCanOpenURL.mockRejectedValue(new Error('probe crashed'))

    const launch = await playYouTubeMusic('salsa')

    expect(launch).toEqual({ ok: true, via: 'url' })
  })

  it('reports no_handler with the error detail when everything fails', async () => {
    mockedCanOpenURL.mockResolvedValue(false)
    mockedOpenURL.mockRejectedValue(new Error('no activity found'))

    const launch = await playYouTubeMusic('salsa')

    expect(launch).toEqual({ ok: false, reason: 'no_handler', detail: 'no activity found' })
  })
})

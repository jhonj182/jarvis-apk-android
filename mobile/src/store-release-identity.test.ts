import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { IOSConfig } from 'expo/config-plugins'
import { describe, expect, it } from 'vitest'

const BUNDLE_ID = 'dev.jhontamayo.jarvis'
const DISPLAY_NAME = 'Jarvis'
// The app this fork came from, which an upstream sync can bring back where no conflict
// forces a decision.
const ORCA_LAB_BUNDLE_ID = 'com.ab2web.orca.mobile'
const ORCA_LAB_NAME = 'Orca Lab'

// Why parked and not deleted: the iOS release lane (fastlane) still belongs to Orca Lab. The
// fork ships Android only (docs/01-prd.md §7) and renaming the lane was not part of the
// change that renamed the app. Flip this once Fastfile and Appfile carry the Jarvis identity.
const IOS_LANE_RENAMED = false

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8')
}

const appConfig = JSON.parse(read('app.json')) as {
  expo: { name: string; ios: { bundleIdentifier: string }; android: { package: string } }
}

function declaredIdentifier(relativePath: string, pattern: RegExp): string {
  const match = read(relativePath).match(pattern)
  expect(match, `no identifier found in ${relativePath}`).not.toBeNull()
  return match![1]
}

const FASTFILE_BUNDLE_ID = /BUNDLE_ID\s*=\s*"([^"]+)"/
const APPFILE_BUNDLE_ID = /app_identifier\([^)]*?"([^"]+)"\s*\)/

// Why its own file: the store identifier is permanent from the first upload and
// Android's is public in the listing URL, so a silent revert is unrecoverable —
// and it fails at the store, not in a build.
describe('mobile store release identity', () => {
  it('publishes iOS and Android under the Jarvis identifier', () => {
    expect(appConfig.expo.ios.bundleIdentifier).toBe(BUNDLE_ID)
    expect(appConfig.expo.android.package).toBe(BUNDLE_ID)
  })

  it('installs under the Jarvis name', () => {
    expect(appConfig.expo.name).toBe(DISPLAY_NAME)
  })

  it('never carries the Orca Lab identity back into the app', () => {
    expect(read('app.json')).not.toContain(ORCA_LAB_BUNDLE_ID)
    expect(appConfig.expo.name).not.toBe(ORCA_LAB_NAME)
  })

  // Why upstream is named explicitly: an upstream sync re-adds it in files that
  // merge clean, where no conflict forces a decision.
  it('never carries upstream identifier back in', () => {
    for (const path of ['app.json', 'fastlane/Fastfile', 'fastlane/Appfile']) {
      expect(read(path), path).not.toContain('com.stably.orca')
    }
  })

  // Why checked while the lane waits: the half-renamed lane is the partial revert the parked
  // guards below exist for, and it must not slip in before they return.
  it('keeps the iOS release lane under one identity in both of its files', () => {
    expect(declaredIdentifier('fastlane/Appfile', APPFILE_BUNDLE_ID)).toBe(
      declaredIdentifier('fastlane/Fastfile', FASTFILE_BUNDLE_ID)
    )
  })

  describe('iOS release lane, once it is renamed for Jarvis', () => {
    // Why fastlane is checked separately: it carries its own copies, so a partial
    // revert would sign and upload under an identifier app.json never names.
    it.runIf(IOS_LANE_RENAMED)('signs and uploads under that same identifier', () => {
      expect(declaredIdentifier('fastlane/Fastfile', FASTFILE_BUNDLE_ID)).toBe(BUNDLE_ID)
      expect(declaredIdentifier('fastlane/Appfile', APPFILE_BUNDLE_ID)).toBe(BUNDLE_ID)
    })

    // Why: prebuild also names the Xcode project and scheme after expo.name, and
    // the iOS lane pins both — a rename that skips the Fastfile fails only in CI.
    it.runIf(IOS_LANE_RENAMED)(
      'builds iOS from the workspace and scheme prebuild derives from that name',
      () => {
        const projectName = IOSConfig.XcodeUtils.sanitizedName(appConfig.expo.name)
        expect(declaredIdentifier('fastlane/Fastfile', /^SCHEME\s*=\s*"([^"]+)"/m)).toBe(
          projectName
        )
        expect(
          declaredIdentifier(
            'fastlane/Fastfile',
            /WORKSPACE\s*=\s*File\.join\([^)]*"([^"]+)\.xcworkspace"\)/
          )
        ).toBe(projectName)
      }
    )
  })
})

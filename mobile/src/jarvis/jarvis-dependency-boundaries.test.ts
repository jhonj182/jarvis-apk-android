// The four dependency rules of docs/02-arquitectura.md §5, checked against the sources themselves.
// An assertion about a file that does not exist yet is skipped, so this passes while the MVP is
// still being built and starts guarding the moment each file appears.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const mobileRoot = fileURLToPath(new URL('../..', import.meta.url))
const repoRoot = dirname(mobileRoot)
const jarvisRoot = join(mobileRoot, 'src', 'jarvis')

const SCREENS = ['app/jarvis.tsx', 'app/jarvis-settings.tsx']
const SCREEN_FOLDER = join(jarvisRoot, 'jarvis-home')
const CHARACTER_FOLDER = join(jarvisRoot, 'character')
/** Rule 3 names three; the rest are the engine's own pure modules, held to the same rule. */
const PURE_MODULES = [
  'speech-text.ts',
  'speech-markdown.ts',
  'speech-sentences.ts',
  'local-intents.ts',
  'lock-policy.ts',
  'conversation-activity.ts',
  'jarvis-transcript-merge.ts',
  'jarvis-speech-tracker.ts',
  'jarvis-session-attach.ts',
  'local-intent-handler.ts',
  'jarvis-dictation-status.ts'
]
/** What the screens may import from `src/jarvis/`: the contract, the look, the engine hooks, their own parts. */
const SCREEN_IMPORTS_FROM_JARVIS = [
  /^jarvis-contract$/,
  /^jarvis-theme$/,
  /^use-jarvis-/,
  /^character\//,
  /^jarvis-home\//,
  // The transcript renderer's own Markdown reader; it is screen code, not engine code.
  /^jarvis-markdown$/,
  /^default-local-intent-handler$/
]
/** Rule 1 forbids these outright, however they are written (relative path or `@/` alias). */
const SCREEN_NEVER_IMPORTS_FROM = ['transport', 'session', 'hooks']
/** Rule 3: a pure module imports neither React nor the platform. */
const PLATFORM_PACKAGES = [
  /^react$/,
  /^react-native/,
  /^react-dom$/,
  /^expo($|\/)/,
  /^@expo\//,
  /^@react-native/
]
/** Rule 4: the upstream files the fork edits. Every entry must also be listed in docs/02-arquitectura.md §5. */
const EDITED_UPSTREAM_FILES = new Set([
  'mobile/app/_layout.tsx',
  'mobile/app/index.tsx',
  'mobile/app.json',
  'mobile/package.json',
  'mobile/pnpm-lock.yaml',
  // App identity (RF-1.1): the fork's own URL scheme and its release identity.
  'mobile/src/transport/pairing.ts',
  'mobile/src/transport/pairing.test.ts',
  'mobile/src/store-release-identity.test.ts'
])
const UPSTREAM_EDITED_BY_RULE_1 = new Set(['app/_layout.tsx', 'app/index.tsx'])
/** Files that belong to the fork, or are the two upstream screens that register it: both may import it. */
const mayImportTheFork = (path: string): boolean =>
  path.startsWith('src/jarvis/') ||
  path.startsWith('app/jarvis') ||
  // The fork's own Expo plugins (mobile/plugins/jarvis-*.js).
  path.startsWith('plugins/jarvis-') ||
  // The fork's own scripts (mobile/scripts/jarvis-*.mjs).
  path.startsWith('scripts/jarvis-') ||
  UPSTREAM_EDITED_BY_RULE_1.has(path)

const toPosix = (path: string): string => path.split(sep).join('/')

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return []
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : [path]
  })
}

const isSource = (path: string): boolean =>
  /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.endsWith('.d.ts')

/** Every module a file asks for: static imports, re-exports, `require` and dynamic `import()`. */
function importSpecifiers(path: string, source: string): string[] {
  return ts.preProcessFile(source, true, true).importedFiles.map((imported) => imported.fileName)
}

/** Where an import lands inside `src/jarvis/`, without extension; null when it lands elsewhere or is a package. */
const jarvisPathOf = (fromFile: string, specifier: string): string | null => {
  const base = specifier.startsWith('@/')
    ? join(mobileRoot, 'src', specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(fromFile), specifier)
      : null
  return base === null
    ? null
    : toPosix(relative(jarvisRoot, base)).replace(/\.(ts|tsx|js|jsx|mjs)$/, '')
}

/** Where an import lands inside `mobile/src/`, for relative paths and the `@/` alias alike. */
const srcPathOf = (fromFile: string, specifier: string): string | null => {
  const base = specifier.startsWith('@/')
    ? join(mobileRoot, 'src', specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(fromFile), specifier)
      : null
  return base === null ? null : toPosix(relative(join(mobileRoot, 'src'), base))
}

/** Specifiers a screen may not have: the transport, the session and dictation hooks, engine internals. */
function violationsIn(path: string, source: string): string[] {
  return importSpecifiers(path, source).flatMap((specifier) => {
    const inSrc = srcPathOf(path, specifier)
    if (
      SCREEN_NEVER_IMPORTS_FROM.some(
        (folder) => inSrc === folder || inSrc?.startsWith(`${folder}/`)
      )
    ) {
      return [specifier]
    }
    const inJarvis = jarvisPathOf(path, specifier)
    const engineInternal =
      inJarvis !== null &&
      !inJarvis.startsWith('..') &&
      !SCREEN_IMPORTS_FROM_JARVIS.some((allowed) => allowed.test(inJarvis))
    return engineInternal ? [specifier] : []
  })
}

describe('helpers', () => {
  it('finds every kind of import, and only imports', () => {
    const source = [
      "import { a } from './a'",
      "import type { B } from '../types/b'",
      "export * from './reexport'",
      "const c = require('../c')",
      "const load = () => import('../d')",
      'const notAnImport = "import x from \'./fake\'"'
    ].join('\n')

    expect(importSpecifiers('x.ts', source)).toEqual([
      './a',
      '../types/b',
      './reexport',
      '../c',
      '../d'
    ])
  })

  it('resolves relative paths and the @/ alias into src/jarvis', () => {
    expect(jarvisPathOf(join(mobileRoot, 'app', 'jarvis.tsx'), '../src/jarvis/jarvis-theme')).toBe(
      'jarvis-theme'
    )
    expect(
      jarvisPathOf(
        join(mobileRoot, 'app', 'jarvis.tsx'),
        '@/session/use-mobile-native-chat-session'
      )
    ).toBe('../session/use-mobile-native-chat-session')
  })

  it('flags a screen that reaches into the transport, a session hook or engine internals', () => {
    const screen = join(mobileRoot, 'app', 'jarvis.tsx')
    const bad = [
      "import { useHostClient } from '../src/transport/client-context'",
      "import { useMobileDictation } from '@/hooks/use-mobile-dictation'",
      "import { x } from '../src/session/use-mobile-native-chat-session'",
      "import { planSpeech } from '../src/jarvis/speech-text'"
    ].map((line) => violationsIn(screen, line))
    const good = [
      "import { useJarvisConversation } from '../src/jarvis/use-jarvis-conversation'",
      "import { JarvisCharacter } from '../src/jarvis/character/JarvisCharacter'",
      "import type { JarvisMessage } from '../src/jarvis/jarvis-contract'",
      "import { Text } from '../src/theme/dynamic-type-text'",
      "import { useRouter } from 'expo-router'"
    ].map((line) => violationsIn(screen, line))

    expect(bad.map((found) => found.length)).toEqual([1, 1, 1, 1])
    expect(good.every((found) => found.length === 0)).toBe(true)
  })
})

function describeWhenPresent(title: string, path: string, body: (source: string) => void): void {
  it(title, () => {
    if (!existsSync(path)) {
      return
    }
    body(readFileSync(path, 'utf8'))
  })
}

describe('rule 1: the screens depend on the contract, the character, the theme and the engine hooks', () => {
  const screens = [
    ...SCREENS.map((path) => join(mobileRoot, path)),
    ...sourceFiles(SCREEN_FOLDER).filter(isSource)
  ]
  const present = screens.filter((path) => existsSync(path))

  it('checks every screen that exists', () => {
    const checked = new Set(present.map((path) => toPosix(relative(mobileRoot, path))))
    for (const screen of SCREENS.filter((path) => existsSync(join(mobileRoot, path)))) {
      expect(checked.has(screen)).toBe(true)
    }
  })

  for (const path of screens) {
    describeWhenPresent(`imports of ${toPosix(relative(mobileRoot, path))}`, path, (source) => {
      expect(violationsIn(path, source)).toEqual([])
    })
  }
})

describe('rule 2: the character imports nothing from the engine or the transport', () => {
  const files = sourceFiles(CHARACTER_FOLDER).filter(isSource)

  it('animates from its own files, the contract and the theme alone', () => {
    const offenders = files.flatMap((path) =>
      importSpecifiers(path, readFileSync(path, 'utf8')).flatMap((specifier) => {
        const inside = jarvisPathOf(path, specifier)
        if (inside === null || inside.startsWith('..')) {
          return []
        }
        const allowed =
          inside.startsWith('character/') ||
          inside === 'jarvis-contract' ||
          inside === 'jarvis-theme'
        return allowed ? [] : [`${toPosix(relative(mobileRoot, path))} imports ${specifier}`]
      })
    )

    expect(offenders).toEqual([])
  })
})

describe('rule 3: pure modules import neither React nor the platform, and are tested without mocks', () => {
  const offenders = PURE_MODULES.filter((name) => existsSync(join(jarvisRoot, name))).flatMap(
    (name) => {
      const specifiers = importSpecifiers(
        join(jarvisRoot, name),
        readFileSync(join(jarvisRoot, name), 'utf8')
      )
      const platform = specifiers.filter((specifier) =>
        PLATFORM_PACKAGES.some((pattern) => pattern.test(specifier))
      )
      const test = `${name.replace(/\.ts$/, '')}.test.ts`
      const mocked =
        existsSync(join(jarvisRoot, test)) &&
        /\bvi\.mock\(/.test(readFileSync(join(jarvisRoot, test), 'utf8'))
      return [
        ...platform.map((specifier) => `${name} imports ${specifier}`),
        ...(mocked ? [`${test} mocks a module`] : [])
      ]
    }
  )

  it('stays pure', () => {
    expect(offenders).toEqual([])
  })
})

describe('rule 4: nothing in src/jarvis changes upstream files', () => {
  it('no upstream module imports the fork, outside the two screens that register it', () => {
    // Why the pre-filter: only a file that names the fork can import it, and it keeps the scan quick.
    const mentionsJarvis = (path: string): boolean => /jarvis/i.test(readFileSync(path, 'utf8'))
    const offenders = ['src', 'app']
      .flatMap((folder) => sourceFiles(join(mobileRoot, folder)))
      .filter((path) => isSource(path) && !mayImportTheFork(toPosix(relative(mobileRoot, path))))
      .filter(mentionsJarvis)
      .flatMap((path) =>
        importSpecifiers(path, readFileSync(path, 'utf8'))
          .map((specifier) => jarvisPathOf(path, specifier))
          .filter((inside): inside is string => inside !== null && !inside.startsWith('..'))
          .map(() => toPosix(relative(mobileRoot, path)))
      )

    expect(offenders).toEqual([])
  })

  it('the upstream files the fork edits are the listed ones', () => {
    const git = (args: string[]): string | null => {
      try {
        return execFileSync('git', args, {
          cwd: repoRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        })
      } catch {
        return null
      }
    }
    const base = ['upstream/main', 'origin/main', 'main']
      .map((ref) => git(['merge-base', 'HEAD', ref])?.trim())
      .find((sha) => sha !== undefined && sha !== '')
    const head = git(['rev-parse', 'HEAD'])?.trim()
    if (!base || !head) {
      // Why: a shallow checkout has no history to compare with; the import check above still runs.
      return
    }
    // Everything that exists upstream and is now different: committed, or still in the working tree.
    const committed = (
      git(['diff', '--name-only', '--diff-filter=CDMRTUXB', base, head, '--', 'mobile']) ?? ''
    )
      .split('\n')
      .filter((line) => line.startsWith('mobile/'))
    const uncommitted = (
      git(['status', '--porcelain', '--untracked-files=all', '--', 'mobile']) ?? ''
    )
      .split('\n')
      .filter((line) => /^.[MDR]/.test(line))
      .map((line) => line.slice(3).trim())
    // Why: a fork file committed and then edited again shows as modified, but upstream never had it.
    const upstreamOnly = (path: string): boolean =>
      !mayImportTheFork(toPosix(relative(mobileRoot, join(repoRoot, path))))
    const unlisted = [...new Set([...committed, ...uncommitted])]
      .filter(upstreamOnly)
      .filter((path) => !EDITED_UPSTREAM_FILES.has(path))

    expect(unlisted).toEqual([])
  })
})

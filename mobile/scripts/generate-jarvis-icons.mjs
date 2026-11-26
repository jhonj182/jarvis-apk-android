// Draws the Jarvis app icons from the character's own geometry and look, so the icon on the
// launcher and the character on the screen stay one drawing.
//
//   cd mobile && pnpm exec tsx scripts/generate-jarvis-icons.mjs
//
// Why tsx and not node: the geometry modules import each other without extensions, which
// plain Node ESM cannot resolve.
//
// Needs: ImageMagick with the RSVG delegate (magick). Writes the SVG sources and the PNGs into
// mobile/assets/jarvis/. Run it after changing the character's geometry or look: the icon on the
// launcher and the character on the screen are the same drawing.

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const project = join(import.meta.dirname, '..')

const motion = await import(
  pathToFileURL(join(project, 'src/jarvis/character/character-motion.ts')).href
)
const look = await import(
  pathToFileURL(join(project, 'src/jarvis/character/character-look.ts')).href
)
const theme = await import(pathToFileURL(join(project, 'src/jarvis/jarvis-theme.ts')).href)

const { CHARACTER_GEOMETRY: g, tickMarks } = motion
const idle = look.characterLookFor('idle')
// Why brighter than the idle look: at launcher size the marks fade into the background at 50%.
const TICK = theme.jarvisAlpha('gold', 0.78)
const OUT = join(project, 'assets/jarvis')
mkdirSync(OUT, { recursive: true })

const round = (value) => Math.round(value * 100) / 100

/** The idle face: ring, twelve marks, two open eyes. `scale` is pixels per drawing unit. */
function faceSvg({ canvas, scale, background }) {
  // Drawing units to pixels, with the center of the box at the center of the canvas.
  const px = (units) => round(canvas / 2 + (units - g.center) * scale)
  const size = (units) => round(units * scale)
  const parts = []
  if (background) {
    parts.push(`<rect width="${canvas}" height="${canvas}" fill="${background}"/>`)
  }
  parts.push(
    `<circle cx="${px(g.center)}" cy="${px(g.center)}" r="${size(g.ringRadius)}" fill="none" stroke="${idle.ring}" stroke-width="${size(g.ringStroke)}"/>`
  )
  for (const tick of tickMarks()) {
    parts.push(
      `<line x1="${px(tick.x1)}" y1="${px(tick.y1)}" x2="${px(tick.x2)}" y2="${px(tick.y2)}" stroke="${TICK}" stroke-width="${size(g.tickStroke)}" stroke-linecap="round"/>`
    )
  }
  for (const side of [-1, 1]) {
    parts.push(
      `<ellipse cx="${px(g.center + side * g.eye.centerX)}" cy="${px(g.eye.centerY)}" rx="${size(g.eye.width / 2)}" ry="${size(g.eye.height / 2)}" fill="${idle.eye}"/>`
    )
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">${parts.join('')}</svg>`
}

// scale = canvas / 200 puts the whole drawing (marks included) across the canvas.
const ICONS = [
  // Legacy and store icon: full bleed, the face across 70% of the canvas.
  {
    name: 'icon',
    canvas: 1024,
    scale: (1024 * 0.7) / g.viewbox,
    background: theme.jarvisPalette.abyss
  },
  // Adaptive foreground: transparent. The face fits the 72dp circle of the 108dp canvas, with room.
  { name: 'adaptive-icon', canvas: 1024, scale: (1024 * 0.625) / g.viewbox, background: null },
  // Splash: the face alone on the splash background. Expo shows a contained splash logo at
  // 288dp at most, so the source is drawn at 288 px and lands in every density unresampled.
  { name: 'splash-icon', canvas: 288, scale: 288 / g.viewbox, background: null }
]

const SUPERSAMPLE = 4

for (const icon of ICONS) {
  const svg = faceSvg(icon)
  const svgPath = join(OUT, `${icon.name}.svg`)
  const pngPath = join(OUT, `${icon.name}.png`)
  writeFileSync(svgPath, `${svg}\n`)
  execFileSync(
    'magick',
    [
      '-background',
      'none',
      '-density',
      String(96 * SUPERSAMPLE),
      svgPath,
      '-filter',
      'Lanczos',
      '-resize',
      `${icon.canvas}x${icon.canvas}`,
      // Why stripped: ImageMagick stamps the wall-clock time into every PNG, so two runs of
      // this script would differ byte for byte and dirty the repository for nothing.
      '-strip',
      '-define',
      'png:exclude-chunks=date,time',
      '-density',
      '96',
      'PNG32:' + pngPath
    ],
    { stdio: 'inherit' }
  )
  console.log(`${icon.name}.png ${icon.canvas}x${icon.canvas} (scale ${round(icon.scale)})`)
}

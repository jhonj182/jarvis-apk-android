#!/usr/bin/env node
/**
 * Puerta de especificación y trazabilidad del fork Jarvis Mobile.
 *
 * La regla es «ningún código sin especificación previa y sin tarea trazable»
 * (GOBERNANZA.md, «Cómo se especifica un cambio»). Este script la hace cumplir: no es un párrafo en un
 * documento, es un proceso que falla y deja ver qué falta.
 *
 * Un cambio que toca código necesita AMBAS cosas:
 *
 *   1. Especificación: un cambio SDD en openspec/changes/<nombre>/ con spec.md
 *      y tasks.md de contenido real. Un spec.md vacío no cuenta.
 *   2. Tarea del gestor: un identificador ORCA-<número> en el nombre de la rama,
 *      en los mensajes de commit del cambio o dentro de los archivos del cambio.
 *
 * Código = todo archivo bajo mobile/ que no sea documentación (*.md, LICENSE),
 * lockfile o recurso binario (imagen, fuente, audio, video). Las pruebas cuentan:
 * son parte de la implementación.
 *
 * Uso, desde la raíz del repositorio:
 *   node scripts/spec-gate.mjs                    rama actual contra su base, incluido lo sin commitear
 *   node scripts/spec-gate.mjs --change <nombre>  exige ese cambio SDD en particular
 *   node scripts/spec-gate.mjs --staged           solo lo que está en el índice (antes de un commit)
 *   node scripts/spec-gate.mjs --base <ref>       compara contra <ref> en vez de la base automática
 *
 * La base automática es origin/main, main o upstream/main, la primera que exista.
 * Si no la halla, la puerta falla cerrada y pide --base.
 *
 * Solo usa Node: no requiere instalar dependencias ni tener el gestor a mano.
 * Por eso no crea la tarea que falta: lo dice y bloquea.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIRECTORIO_CODIGO = 'mobile/'
const NO_ES_CODIGO = [
  /(\.md|\.markdown|\/LICENSE)$/i,
  /(^|\/)(pnpm-lock\.yaml|Gemfile\.lock)$/,
  /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif|ttf|otf|woff2?|mp3|m4a|wav|ogg|mp4|webm|pdf)$/i
]
const DIRECTORIO_CAMBIOS = 'openspec/changes'
// Los cambios cerrados viven en openspec/changes/archive/ y no respaldan código nuevo.
const CAMBIOS_EXCLUIDOS = ['archive']
const REQUERIDOS = ['spec.md', 'tasks.md']
// Caracteres de contenido, sin comentarios HTML ni espacios: menos que esto es un marcador de posición.
const MINIMO_UTIL = 200
const PATRON_TAREA = /ORCA-\d+/
const BASES = ['origin/main', 'main', 'upstream/main']
const MAXIMO_BYTES_LEIDOS = 1024 * 1024

const args = process.argv.slice(2)

function git(...argumentos) {
  return execFileSync('git', argumentos, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

/** Rutas separadas por NUL: un nombre con espacios o tildes no se parte en dos. */
function rutas(...argumentos) {
  return git(...argumentos).split('\0').filter(Boolean)
}

function opcion(nombre) {
  const i = args.indexOf(nombre)
  return i === -1 ? null : (args[i + 1] ?? '')
}

function hayCommits() {
  try {
    git('rev-parse', '--verify', '--quiet', 'HEAD')
    return true
  } catch {
    return false
  }
}

function ramaActual() {
  try {
    const rama = git('rev-parse', '--abbrev-ref', 'HEAD').trim()
    return rama === 'HEAD' ? '' : rama
  } catch {
    return ''
  }
}

/** La base que manda es la que se pasa con --base; si no, la primera automática que exista. */
function baseDeComparacion() {
  return opcion('--base') ?? BASES.find((ref) => existeRef(ref)) ?? null
}

/**
 * Ancestro común entre la base y HEAD. Sin base ni ancestro devuelve `null`, salvo que
 * `exigir` sea true: ahí lanza, porque sin base no se puede saber qué cambió la rama.
 */
function ancestroComun(exigir) {
  const base = baseDeComparacion()
  if (!base) {
    if (!exigir) return null
    throw new Error(
      `No se halló la base de la rama (se buscó ${BASES.join(', ')}). ` +
        'Corre la puerta con --base <ref>, por ejemplo --base origin/main.'
    )
  }
  try {
    return git('merge-base', base, 'HEAD').trim()
  } catch {
    if (!exigir) return null
    throw new Error(
      `No hay ancestro común entre ${base} y HEAD. Corre la puerta con --base <ref>, ` +
        'la rama de la que salió esta.'
    )
  }
}

function existeRef(ref) {
  try {
    git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`)
    return true
  } catch {
    return false
  }
}

function sinRastrear() {
  try {
    return rutas('ls-files', '-z', '--others', '--exclude-standard')
  } catch {
    return []
  }
}

/**
 * Archivos del cambio. Con --staged, los del índice. Si no, lo que la rama cambió
 * contra su ancestro común, más lo que todavía no está commiteado en el árbol de trabajo.
 */
function archivosDelCambio(ancestro) {
  if (args.includes('--staged') || !hayCommits()) {
    const enIndice = rutas('diff', '--cached', '-z', '--name-only', '--diff-filter=ACMR')
    return args.includes('--staged') ? enIndice : [...new Set([...enIndice, ...sinRastrear()])]
  }
  const rastreados = rutas('diff', '-z', '--name-only', '--diff-filter=ACMR', ancestro)
  return [...new Set([...rastreados, ...sinRastrear()])]
}

function esCodigo(ruta) {
  return ruta.startsWith(DIRECTORIO_CODIGO) && !NO_ES_CODIGO.some((patron) => patron.test(ruta))
}

function contenidoUtil(texto) {
  return texto.replace(/<!--[\S\s]*?-->/g, '').replace(/\s+/g, '').length
}

function leerCambio(nombre) {
  const ruta = join(DIRECTORIO_CAMBIOS, nombre)
  if (!existsSync(ruta)) {
    throw new Error(`El cambio «${nombre}» no existe en ${DIRECTORIO_CAMBIOS}/.`)
  }
  const faltantes = REQUERIDOS.filter((archivo) => {
    const completo = join(ruta, archivo)
    if (!existsSync(completo)) return true
    return contenidoUtil(readFileSync(completo, 'utf8')) < MINIMO_UTIL
  })
  return { nombre, ruta, faltantes }
}

/** Cambios SDD abiertos: cada carpeta de openspec/changes/, menos los cerrados. */
function cambiosAbiertos() {
  if (!existsSync(DIRECTORIO_CAMBIOS)) return []
  return readdirSync(DIRECTORIO_CAMBIOS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !CAMBIOS_EXCLUIDOS.includes(e.name))
    .map((e) => leerCambio(e.name))
}

/** Texto de los archivos del cambio. Salta binarios y archivos de más de 1 MiB. */
function textosDelCambio(ruta) {
  let entradas
  try {
    entradas = readdirSync(ruta, { withFileTypes: true })
  } catch {
    return []
  }
  return entradas.flatMap((e) => {
    const completo = join(ruta, e.name)
    if (e.isDirectory()) return textosDelCambio(completo)
    if (!e.isFile() || statSync(completo).size > MAXIMO_BYTES_LEIDOS) return []
    const texto = readFileSync(completo, 'utf8')
    return texto.includes('\0') ? [] : [texto]
  })
}

/** Busca la referencia a la tarea donde razonablemente puede estar. */
function referenciaTarea(cambios, ancestro) {
  const rama = ramaActual()
  const enRama = rama.match(PATRON_TAREA)
  if (enRama) return { origen: `la rama \`${rama}\``, ref: enRama[0] }

  if (ancestro) {
    try {
      const enCommits = git('log', '--format=%B', `${ancestro}..HEAD`).match(PATRON_TAREA)
      if (enCommits) return { origen: 'un mensaje de commit del cambio', ref: enCommits[0] }
    } catch {
      // Sin historial legible: se busca en los archivos del cambio.
    }
  }

  for (const cambio of cambios) {
    for (const texto of textosDelCambio(cambio.ruta)) {
      const enArchivo = texto.match(PATRON_TAREA)
      if (enArchivo) return { origen: `un archivo de \`${cambio.nombre}\``, ref: enArchivo[0] }
    }
  }
  return null
}

function main() {
  const conCommits = hayCommits()
  const pedido = opcion('--change')

  let archivos
  let cambios
  let ancestro = null
  try {
    // El ancestro solo hace falta si hay commits: es la base de la comparación y del historial.
    // Con --staged los archivos salen del índice, así que ahí la base es opcional.
    if (conCommits) ancestro = ancestroComun(!args.includes('--staged'))
    archivos = archivosDelCambio(ancestro)
    if (pedido === '') throw new Error('Falta el nombre del cambio: se usa --change <nombre>.')
    cambios = pedido !== null ? [leerCambio(pedido)] : cambiosAbiertos()
  } catch (error) {
    console.error(`\n  PUERTA DE ESPECIFICACIÓN: NO SE PUDO EVALUAR\n\n  ${error.message}\n`)
    return 1
  }

  const codigo = archivos.filter(esCodigo)
  if (codigo.length === 0) {
    console.log(`Puerta de especificación: el cambio no toca código bajo ${DIRECTORIO_CODIGO}. Pasa.`)
    return 0
  }

  const completos = cambios.filter((c) => c.faltantes.length === 0)
  const tarea = referenciaTarea(completos, ancestro)
  if (completos.length > 0 && tarea) {
    const nombres = completos.map((c) => c.nombre).join('», «')
    console.log(
      `Puerta de especificación: pasa. ${codigo.length} archivo(s) de código respaldados por ` +
        `«${nombres}» y por la tarea ${tarea.ref}, hallada en ${tarea.origen}.`
    )
    return 0
  }

  console.error('\n  PUERTA DE ESPECIFICACIÓN: BLOQUEADO\n')
  console.error(`  Este cambio toca código bajo ${DIRECTORIO_CODIGO}:`)
  for (const ruta of codigo.slice(0, 15)) console.error(`    ${ruta}`)
  if (codigo.length > 15) console.error(`    … y ${codigo.length - 15} más`)

  console.error('\n  Falta:\n')
  if (completos.length === 0) {
    const incompletos = cambios.filter((c) => c.faltantes.length > 0)
    console.error('    [x] Especificación')
    if (incompletos.length === 0) {
      console.error(`        No hay ningún cambio SDD en ${DIRECTORIO_CAMBIOS}/.`)
    }
    for (const c of incompletos) {
      console.error(`        ${c.nombre}: falta o está vacío ${c.faltantes.join(', ')}`)
    }
  } else {
    console.error('    [ok] Especificación')
  }
  if (tarea) {
    console.error(`    [ok] Tarea (${tarea.ref})`)
  } else {
    console.error(
      `    [x] Tarea: no se halla ${PATRON_TAREA.source} en la rama, en los commits del cambio ` +
        'ni en los archivos del cambio.'
    )
  }

  console.error(`
  El camino es:

    /sdd-explore <tema>             investigar antes de comprometerse
    /sdd-ff <nombre-del-cambio>     propuesta, spec, diseño y tareas en ${DIRECTORIO_CAMBIOS}/<nombre>/

    Y referenciar una tarea del gestor (ORCA-<número>) desde la rama, desde un
    commit o desde el spec.

  Si el cambio no necesita especificación (corregir un texto, subir una dependencia
  de parche), no debería tocar código bajo ${DIRECTORIO_CODIGO}. El criterio está en
  GOBERNANZA.md, «Cómo se especifica un cambio».
`)
  return 1
}

process.exit(main())

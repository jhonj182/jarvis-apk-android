import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Pruebas de la puerta de especificación. Cada caso arma un repositorio temporal
// y corre el script real: lo que se prueba es el código de salida, no una función suelta.
// Se ejecutan con: node --test scripts/spec-gate.test.mjs

const PUERTA = fileURLToPath(new URL('./spec-gate.mjs', import.meta.url))

// Más de 200 caracteres de contenido: por debajo, la puerta ve un marcador de posición.
const RELLENO = 'Requisito con escenarios dados, cuando y entonces, cada uno verificable. '.repeat(6)
const SPEC = `# Spec\n\n## Requisitos\n\n${RELLENO}\n`
const TAREAS = `# Tareas\n\n- [ ] Implementar\n- [ ] Probar\n\n${RELLENO}\n`

function git(repo, ...argumentos) {
  return spawnSync('git', argumentos, { cwd: repo, encoding: 'utf8' })
}

function correr(repo, ...argumentos) {
  return spawnSync(process.execPath, [PUERTA, ...argumentos], { cwd: repo, encoding: 'utf8' })
}

function escribir(repo, ruta, texto) {
  const completo = join(repo, ruta)
  mkdirSync(dirname(completo), { recursive: true })
  writeFileSync(completo, texto)
}

function commit(repo, mensaje) {
  git(repo, 'add', '-A')
  const r = git(repo, 'commit', '-q', '-m', mensaje)
  assert.equal(r.status, 0, `el commit de prueba falló: ${r.stderr}`)
}

/** Repositorio con un commit en main y una rama de trabajo ya creada. */
function repositorio(rama = 'jarvis/prueba') {
  const repo = mkdtempSync(join(tmpdir(), 'spec-gate-'))
  git(repo, 'init', '-q')
  git(repo, 'symbolic-ref', 'HEAD', 'refs/heads/main')
  git(repo, 'config', 'user.name', 'Prueba')
  git(repo, 'config', 'user.email', 'prueba@example.com')
  git(repo, 'config', 'commit.gpgsign', 'false')
  escribir(repo, 'LEEME.md', '# Repositorio de prueba\n')
  commit(repo, 'base')
  git(repo, 'checkout', '-q', '-b', rama)
  return repo
}

function sinRepositorio(repo) {
  return () => rmSync(repo, { recursive: true, force: true })
}

function codigo(repo, ruta = 'mobile/src/jarvis/ejemplo.ts') {
  escribir(repo, ruta, 'export const ejemplo = 1\n')
}

function cambio(repo, nombre, archivos) {
  for (const [archivo, texto] of Object.entries(archivos)) {
    escribir(repo, join('openspec/changes', nombre, archivo), texto)
  }
}

test('pasa con spec, tareas y la tarea referenciada en tasks.md', (t) => {
  const repo = repositorio()
  t.after(sinRepositorio(repo))
  codigo(repo)
  cambio(repo, 'bloqueo', { 'spec.md': SPEC, 'tasks.md': `${TAREAS}\nTarea ORCA-4242.\n` })
  commit(repo, 'feat(jarvis): ejemplo')

  const r = correr(repo, '--base', 'main')
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /pasa\. 1 archivo\(s\) de código respaldados por «bloqueo»/)
  assert.match(r.stdout, /ORCA-4242, hallada en un archivo de `bloqueo`/)
})

test('pasa cuando la tarea solo está en el nombre de la rama', (t) => {
  const repo = repositorio('jarvis/ORCA-17-bloqueo')
  t.after(sinRepositorio(repo))
  codigo(repo)
  cambio(repo, 'bloqueo', { 'spec.md': SPEC, 'tasks.md': TAREAS })
  commit(repo, 'feat(jarvis): ejemplo')

  const r = correr(repo, '--base', 'main')
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /ORCA-17, hallada en la rama `jarvis\/ORCA-17-bloqueo`/)
})

test('pasa cuando la tarea solo está en el mensaje de commit', (t) => {
  const repo = repositorio()
  t.after(sinRepositorio(repo))
  codigo(repo)
  cambio(repo, 'bloqueo', { 'spec.md': SPEC, 'tasks.md': TAREAS })
  commit(repo, 'feat(jarvis): ejemplo (ORCA-99)')

  const r = correr(repo, '--base', 'main')
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /ORCA-99, hallada en un mensaje de commit del cambio/)
})

test('falla sin spec', (t) => {
  const repo = repositorio()
  t.after(sinRepositorio(repo))
  codigo(repo)
  commit(repo, 'feat(jarvis): ejemplo')

  const r = correr(repo, '--base', 'main')
  assert.equal(r.status, 1, r.stdout)
  assert.match(r.stderr, /PUERTA DE ESPECIFICACIÓN: BLOQUEADO/)
  assert.match(r.stderr, /\[x\] Especificación/)
  assert.match(r.stderr, /No hay ningún cambio SDD en openspec\/changes\//)
  assert.match(r.stderr, /mobile\/src\/jarvis\/ejemplo\.ts/)
})

test('falla con spec vacío aunque tasks.md esté completo', (t) => {
  const repo = repositorio()
  t.after(sinRepositorio(repo))
  codigo(repo)
  const vacio = `# Spec\n\n<!-- ${RELLENO} -->\n\nPendiente.\n`
  cambio(repo, 'bloqueo', { 'spec.md': vacio, 'tasks.md': `${TAREAS}\nTarea ORCA-4242.\n` })
  commit(repo, 'feat(jarvis): ejemplo')

  const r = correr(repo, '--base', 'main')
  assert.equal(r.status, 1, r.stdout)
  assert.match(r.stderr, /PUERTA DE ESPECIFICACIÓN: BLOQUEADO/)
  // Un comentario largo no es contenido: cuenta como vacío y solo acusa spec.md.
  assert.match(r.stderr, /bloqueo: falta o está vacío spec\.md\n/)
})

test('falla cuando falta tasks.md', (t) => {
  const repo = repositorio()
  t.after(sinRepositorio(repo))
  codigo(repo)
  cambio(repo, 'bloqueo', { 'spec.md': SPEC })
  commit(repo, 'feat(jarvis): ejemplo')

  const r = correr(repo, '--base', 'main')
  assert.equal(r.status, 1, r.stdout)
  assert.match(r.stderr, /bloqueo: falta o está vacío tasks\.md\n/)
})

test('falla sin tarea aunque la spec esté completa', (t) => {
  const repo = repositorio()
  t.after(sinRepositorio(repo))
  codigo(repo)
  cambio(repo, 'bloqueo', { 'spec.md': SPEC, 'tasks.md': TAREAS })
  commit(repo, 'feat(jarvis): ejemplo')

  const r = correr(repo, '--base', 'main')
  assert.equal(r.status, 1, r.stdout)
  assert.match(r.stderr, /PUERTA DE ESPECIFICACIÓN: BLOQUEADO/)
  assert.match(r.stderr, /\[ok\] Especificación/)
  assert.match(r.stderr, /\[x\] Tarea: no se halla ORCA-\\d\+/)
})

test('pasa sin código aunque no haya spec', (t) => {
  const repo = repositorio()
  t.after(sinRepositorio(repo))
  escribir(repo, 'docs/notas.md', '# Notas\n')
  commit(repo, 'docs(jarvis): notas')

  const r = correr(repo, '--base', 'main')
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /el cambio no toca código bajo mobile\/\. Pasa\./)
})

test('pasa si lo que cambia bajo mobile/ no es código', (t) => {
  const repo = repositorio()
  t.after(sinRepositorio(repo))
  escribir(repo, 'mobile/README.md', '# Mobile\n')
  escribir(repo, 'mobile/pnpm-lock.yaml', 'lockfileVersion: 9\n')
  escribir(repo, 'mobile/assets/icono.png', 'png')

  const r = correr(repo, '--base', 'main')
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /no toca código/)
})

test('cuenta como código una prueba y el manifiesto', (t) => {
  const repo = repositorio()
  t.after(sinRepositorio(repo))
  codigo(repo, 'mobile/src/jarvis/ejemplo.test.ts')
  escribir(repo, 'mobile/package.json', '{"name":"prueba"}\n')

  const r = correr(repo, '--base', 'main')
  assert.equal(r.status, 1, r.stdout)
  assert.match(r.stderr, /mobile\/src\/jarvis\/ejemplo\.test\.ts/)
  assert.match(r.stderr, /mobile\/package\.json/)
})

test('--change exige ese cambio y no otro', (t) => {
  const repo = repositorio()
  t.after(sinRepositorio(repo))
  codigo(repo)
  cambio(repo, 'otro', { 'spec.md': SPEC, 'tasks.md': `${TAREAS}\nTarea ORCA-1.\n` })
  cambio(repo, 'mio', { 'spec.md': SPEC })
  commit(repo, 'feat(jarvis): ejemplo')

  const mio = correr(repo, '--change', 'mio', '--base', 'main')
  assert.equal(mio.status, 1, mio.stdout)
  assert.match(mio.stderr, /mio: falta o está vacío tasks\.md/)

  const otro = correr(repo, '--change', 'otro', '--base', 'main')
  assert.equal(otro.status, 0, otro.stderr)

  const inexistente = correr(repo, '--change', 'no-existe', '--base', 'main')
  assert.equal(inexistente.status, 1, inexistente.stdout)
  assert.match(inexistente.stderr, /El cambio «no-existe» no existe en openspec\/changes\//)
})

test('un cambio archivado no respalda código nuevo', (t) => {
  const repo = repositorio()
  t.after(sinRepositorio(repo))
  codigo(repo)
  cambio(repo, 'archive/2026-01-01-viejo', { 'spec.md': SPEC, 'tasks.md': `${TAREAS}\nTarea ORCA-5.\n` })
  commit(repo, 'feat(jarvis): ejemplo')

  const r = correr(repo, '--base', 'main')
  assert.equal(r.status, 1, r.stdout)
  assert.match(r.stderr, /No hay ningún cambio SDD en openspec\/changes\//)
})

test('--staged solo mira el índice', (t) => {
  const repo = repositorio()
  t.after(sinRepositorio(repo))
  codigo(repo)
  git(repo, 'add', 'mobile')

  const bloqueado = correr(repo, '--staged')
  assert.equal(bloqueado.status, 1, bloqueado.stdout)
  assert.match(bloqueado.stderr, /PUERTA DE ESPECIFICACIÓN: BLOQUEADO/)

  git(repo, 'reset', '-q')
  const libre = correr(repo, '--staged')
  assert.equal(libre.status, 0, libre.stderr)
  assert.match(libre.stdout, /no toca código/)
})

test('el modo por defecto incluye lo que aún no está commiteado', (t) => {
  const repo = repositorio()
  t.after(sinRepositorio(repo))
  codigo(repo)

  const r = correr(repo, '--base', 'main')
  assert.equal(r.status, 1, r.stdout)
  assert.match(r.stderr, /mobile\/src\/jarvis\/ejemplo\.ts/)
})

test('falla cerrada si no halla la base de la rama, y --base la resuelve', (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'spec-gate-'))
  t.after(sinRepositorio(repo))
  git(repo, 'init', '-q')
  git(repo, 'symbolic-ref', 'HEAD', 'refs/heads/jarvis/sin-base')
  git(repo, 'config', 'user.name', 'Prueba')
  git(repo, 'config', 'user.email', 'prueba@example.com')
  git(repo, 'config', 'commit.gpgsign', 'false')
  escribir(repo, 'LEEME.md', '# Repositorio de prueba\n')
  commit(repo, 'base')

  const sinBase = correr(repo)
  assert.equal(sinBase.status, 1, sinBase.stdout)
  assert.match(sinBase.stderr, /NO SE PUDO EVALUAR/)
  assert.match(sinBase.stderr, /--base <ref>/)

  const conBase = correr(repo, '--base', 'HEAD')
  assert.equal(conBase.status, 0, conBase.stderr)
})

test('repositorio sin commits: cuenta lo que está en el índice', (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'spec-gate-'))
  t.after(sinRepositorio(repo))
  git(repo, 'init', '-q')
  git(repo, 'config', 'user.name', 'Prueba')
  git(repo, 'config', 'user.email', 'prueba@example.com')
  git(repo, 'config', 'commit.gpgsign', 'false')
  codigo(repo)
  git(repo, 'add', 'mobile')

  const r = correr(repo)
  assert.equal(r.status, 1, r.stdout)
  assert.match(r.stderr, /PUERTA DE ESPECIFICACIÓN: BLOQUEADO/)
  assert.match(r.stderr, /mobile\/src\/jarvis\/ejemplo\.ts/)
})

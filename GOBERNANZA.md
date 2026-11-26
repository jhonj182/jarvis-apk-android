# Gobernanza de Jarvis Mobile

**Última actualización:** 2026-11-25

Este es el documento único de gobernanza del proyecto: quién decide, cómo entra un cambio, cuándo
está terminado y cómo se entrega. Las reglas de trabajo heredadas siguen en `AGENTS.md` (del
upstream). Lo que se construye y por qué está en `docs/01-prd.md`.

## 1. Qué es y para quién

Jarvis Mobile es una app Android de uso personal del dueño: asistente de voz con personaje animado,
bloqueo biométrico obligatorio, voz de salida y música de YouTube, que razona con sesiones de agente
del Orca Lab de escritorio. Es un fork de `ab2webco/orca-oss` (MIT). Todos los cambios viven en
`mobile/`, más documentación y scripts propios. El escritorio no se modifica.

## 2. Dueño y roles

| Rol | Quién | Qué hace |
|---|---|---|
| Dueño del producto y del sistema | Jhon Tamayo | Decide alcance y prioridades, acepta el trabajo, autoriza la entrega y valida en su teléfono. |
| Agentes que implementan | Agentes de este repositorio | Escriben código y pruebas a partir de un cambio especificado. Su trabajo entra por PR revisado. |
| Agentes remotos | PC con Windows y MacBook Pro | Aportan código y revisión. No compilan: no tienen JDK ni SDK Android. |

## 3. Cómo se especifica un cambio

Un cambio vive en `openspec/changes/<cambio>/` y tiene cuatro archivos:

| Archivo | Qué contiene |
|---|---|
| `proposal.md` | Qué se quiere cambiar y por qué. |
| `spec.md` | Requisitos con criterios de aceptación, en Dado / Cuando / Entonces. |
| `design.md` | Cómo se va a construir. |
| `tasks.md` | Las tareas, en orden, cada una con su prueba. |

Un cambio con código y sin `spec.md` y `tasks.md` de contenido real no entra. Lo hace cumplir
`scripts/spec-gate.mjs`, que corre en CI (`.github/workflows/jarvis-checks.yml`) y bloquea todo
cambio con archivos bajo `mobile/` que no cumpla. Un `spec.md` vacío no cuenta.

Todo cambio referencia su tarea de Plane (sección 9) desde la rama, desde un commit o desde el spec.

## 4. Criterios de aceptación

Cada requisito trae escenarios verificables. Lo que se prueba con código lleva su prueba al lado.
Lo que solo se puede verificar en el teléfono lo valida el dueño con la tabla de
`docs/instalacion-y-prueba.md` (sección 7) y queda registrado en la tarea de Plane.

## 5. Definición de terminado

Un cambio está terminado cuando cumple todo esto:

- Toda prueba nueva falló antes de su arreglo.
- `pnpm test`, `pnpm lint`, `pnpm typecheck` y `pnpm format:check` en verde en CI.
- Sin secretos: el escaneo de gitleaks pasa.
- La tarea de Plane está actualizada.
- Si el cambio mueve una decisión, su ADR en `docs/03-decisiones/` quedó actualizado.
- Si toca al dispositivo, está probado en el teléfono.

## 6. Ramas y PRs

- `main` es espejo del upstream. Nada entra directo ahí.
- `jarvis/mvp` es la rama de integración del fork.
- El trabajo va en ramas `feat/jarvis-*`, que entran por PR con el CI en verde.
- Commits convencionales, en español, sin firmas ni menciones a herramientas de IA.

## 7. Construcción y entrega

El APK se construye en GitHub Actions con `.github/workflows/mobile-android-release.yml`, disparado
a mano:

```bash
gh workflow run mobile-android-release.yml --ref <rama> -f publish_github_release=false
```

Tarda unos veinte minutos y deja el artefacto `orca-mobile-android`. La firma es estable: usa los
secretos `ANDROID_UPLOAD_KEYSTORE`, `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS` y
`ANDROID_UPLOAD_KEY_PASSWORD` del repositorio. La clave vive en `~/.config/jarvis-mobile/signing/`
del equipo del dueño y nunca entra al repositorio. Con cada APK entregado suben `version`, en
`mobile/app.json`, y `versionCode`.

La entrega se hace por WhatsApp al dueño, que lo instala con `docs/instalacion-y-prueba.md`. El
buzón de WhatsApp admite adjuntos de hasta 64 MB y el APK de la 0.1.0 pesa 143 MB, así que hoy no va
adjunto: se publica como pre-release del fork, con la etiqueta `mobile-android-v<versión>` apuntando
al commit que se compiló, y se le envía el enlace. Antes de publicarlo se comprueba que el APK va
firmado con la clave del proyecto y no con la de depuración, y que no trae secretos ni datos
personales. Hacer que vuelva a caber como adjunto es la tarea T100 de `openspec/`.

## 8. Seguridad mínima

El repositorio es público y no guarda nada sensible.

| Qué nunca entra | Por qué | Control que lo verifica |
|---|---|---|
| Tokens de emparejamiento y claves del escritorio | Dan acceso al Orca Lab | Viven en `orca-devices.json` y `orca-e2ee-keypair.json` del escritorio, nunca en git. Escaneo de secretos en `.github/workflows/jarvis-checks.yml`. |
| Keystores de firma | Permiten firmar apps como el dueño | `*.jks` ignorado en `mobile/.gitignore` y secretos de GitHub Actions. |
| Datos personales, conversaciones o credenciales del dueño | El repositorio es público | El repositorio solo trae la fuente genérica del personaje (`personaje/jarvis-mobile/`); lo propio del dueño se instala en el escritorio con `scripts/jarvis/install-workspace.sh`. Más el escaneo de secretos. |
| Contraseñas o API keys | Permitirían suplantar servicios | Escaneo de secretos con gitleaks. |

El personaje se instala en el escritorio con `scripts/jarvis/install-workspace.sh`: el APK no lo
conoce. El bloqueo biométrico va siempre activo, sin periodo de gracia (ADR-005).

**Riesgos y limitaciones heredados del upstream que se conocen hoy** (`docs/02-arquitectura.md` §6,
ADR-005 y `docs/01-prd.md` §11):

| Riesgo | Evidencia |
|---|---|
| Una vez emparejado, el servidor del escritorio escucha en todas las interfaces y no filtra por IP. | `src/main/runtime/runtime-rpc.ts:1588-1592` |
| Los tokens de dispositivo del escritorio quedan en un archivo JSON sin cifrar. Solo los protegen los permisos restringidos con los que se escribe ese archivo. | `src/main/runtime/device-registry.ts:60,81`, `src/shared/secure-file.ts:91-93` |
| El socket va sin TLS. Lo compensa el cifrado de punta a punta dentro de la app. | `mobile/app.json` (`usesCleartextTraffic: true`), `mobile/src/transport/e2ee.ts:1-4` |
| La vista previa de «apps recientes» puede mostrar lo último que se vio antes de bloquear. | `docs/01-prd.md` §11, ADR-005 |
| Tras reiniciar el teléfono, hasta el primer desbloqueo la app no puede leer el token de emparejamiento y no conecta con el escritorio. No hay que emparejar de nuevo. | `mobile/src/transport/pairing-keychain.ts:5-8` |

Para el primero, la mitigación operativa del MVP es usar la tailnet y no la red local abierta.

## 9. Seguimiento en Plane

El proyecto es ORCA (Orca Lab) y la tarea padre del MVP es `ORCA-1443`. Hay una issue por cada grupo
de tareas del spec. Los estados son Todo, In Progress y Done. Al cerrar, un comentario final con el
resumen de lo que se hizo.

## 10. Sincronía con el upstream

```bash
git fetch upstream
git merge upstream/main   # sobre main
```

De ahí el avance pasa a `jarvis/mvp`. Nada del fork entra por PR a `main`: esa rama solo recibe
el upstream, y el trabajo del fork se revisa en los PR hacia `jarvis/mvp`.

Estos son los archivos del upstream que el fork edita, y por tanto los que pueden dar conflicto:
`mobile/app/_layout.tsx`, `mobile/app/index.tsx`, `mobile/app.json`, `mobile/package.json`,
`mobile/pnpm-lock.yaml`, `mobile/src/transport/pairing.ts` y su prueba,
`mobile/src/store-release-identity.test.ts`, `.gitignore` y `README.md`. También
`.github/scripts/check-root-directory-entries.mjs` y su prueba: su guardia de la raíz admite
cuatro entradas propias (`GOBERNANZA.md`, `openspec/`, `personaje/` y `scripts/`) y sigue
bloqueando cualquier otra.

## 11. Qué se excluyó a propósito

El dueño decidió el 2026-11-25 que este proyecto **no usa** hoja de vida (FOR-TEC-04), ni puertas
P1 a P6, ni modelado de amenazas. Es una app de una sola persona, que vive solo en su teléfono.

Se reevalúa si la app deja de vivir solo en el teléfono del dueño o pasa a manejar datos de
terceros.

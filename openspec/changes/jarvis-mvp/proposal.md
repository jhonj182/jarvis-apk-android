# Proposal: Jarvis MVP (Android)

**Cambio:** `jarvis-mvp` · **Tarea de tracking:** ORCA-1443 (Plane, proyecto ORCA "Orca Lab") ·
**Rama de trabajo:** `jarvis/mvp` · **Fecha:** 2026-11-25

## Intent

Hoy Jhon habla con Jarvis por WhatsApp y ese canal solo lleva texto: no puede dictar ni escuchar la
respuesta, no puede pedir música y cualquiera que tome su teléfono desbloqueado lee la conversación
de su asistente. La app móvil de Orca Lab ya resuelve lo costoso (conexión cifrada con el
escritorio, chat con agentes, dictado). Lo que falta es el producto alrededor, no la infraestructura.

Este cambio entrega la fase F1 (MVP) del PRD: sobre un fork de `ab2webco/orca-oss` (carpeta
`mobile/`, MIT) añade personaje y pantalla de asistente, bloqueo biométrico obligatorio, voz de
salida, intenciones locales y música de YouTube. Rige el principio «el teléfono es la cara y el
oído; Orca Lab es el cerebro»: nada sensible vive en el teléfono y ninguna regla se escribe dos
veces.

Fuentes: `docs/01-prd.md`, `docs/02-arquitectura.md`, ADR-001 a ADR-008,
`docs/personaje/jarvis.md` y los dos encargos de `docs/agentes/`.

## Scope

### In Scope

- Identidad propia y entrada (RF-1.1 a RF-1.3): la app se llama Jarvis, convive con la app oficial
  y arranca en la pantalla del asistente.
- Bloqueo biométrico obligatorio, sin periodo de gracia (RF-2.1 a RF-2.5).
- Asistente (RF-3.1 a RF-3.6): mantener para hablar, teclado, personaje de cinco estados, sesión de
  Jarvis en el Orca Lab emparejado, elección del espacio de trabajo y botón Orca.
- Respuesta rápida y voz (RF-4.1 a RF-4.7): intenciones locales, lectura por frases mientras llega
  la respuesta, limpieza del texto, recorte a ocho frases, interruptor, interrupción y planes.
- Música (RF-5.1 a RF-5.3): órdenes resueltas en el teléfono que abren YouTube Music.
- Integración en `mobile/app/_layout.tsx`, `mobile/app/index.tsx`, `mobile/app.json` y
  `mobile/src/jarvis/default-local-intent-handler.ts`.
- Entrega: APK construido en GitHub Actions con firma estable, instalado en el teléfono del dueño,
  emparejado por Tailscale y entregado por WhatsApp.

### Out of Scope

- iOS, publicación en tiendas y distribución a otras personas; más de un usuario o dueño.
- Pausar, saltar o bajar el volumen de la música; lista de reproducción favorita; palabra de
  activación sin tocar la pantalla (fase F2 del PRD).
- Reproducción de música dentro de la propia app.
- Voz de nube con calidad de locución y personalización del timbre (fase F3 del PRD).
- Llamadas telefónicas, recordatorios del sistema y calendario.
- Cambios en la app de escritorio de Orca Lab y uso del relevo en la nube del upstream
  (`relay.onorca.dev`).
- Periodo de gracia del bloqueo y bloqueo de capturas de pantalla o de la vista previa de apps
  recientes: son decisiones abiertas del dueño (PRD §10).

## Capabilities

No hay capabilities existentes que modificar: el fork parte sin especificaciones base.

### New Capabilities

- `app-identity-and-entry`: identidad propia de la app y entrada en frío (RF-1).
- `app-lock`: bloqueo biométrico obligatorio (RF-2).
- `assistant-conversation`: pantalla del asistente, personaje y conversación con la sesión de
  Jarvis (RF-3).
- `fast-answer-and-voice`: intenciones locales, respuesta rápida y voz de salida (RF-4).
- `music-intent`: órdenes de música resueltas en YouTube Music (RF-5).

### Modified Capabilities

Ninguna. El envoltorio de `LockGate` en `mobile/app/_layout.tsx` y la redirección de
`mobile/app/index.tsx` se especifican como requisitos nuevos dentro de `app-lock` e
`app-identity-and-entry`.

## Approach

- Fork del monorepo. Todo lo propio vive en `mobile/src/jarvis/`, más dos pantallas nuevas
  (`mobile/app/jarvis.tsx` y `mobile/app/jarvis-settings.tsx`), dos archivos del upstream editados
  al mínimo (`mobile/app/_layout.tsx` y `mobile/app/index.tsx`) y un plugin de configuración Expo
  (`mobile/plugins/jarvis-android-manifest.js`). `main` del fork se mantiene igual al upstream.
- El razonamiento ocurre en una sesión de agente `claude` del Orca Lab emparejado, en el espacio de
  trabajo de Jarvis. El teléfono no guarda claves ni el personaje.
- Voz de salida en el teléfono con `expo-speech`, en una cola por frases. Es la única dependencia
  nueva decidida.
- La música se resuelve con un clasificador puro y un lanzador hacia YouTube Music, sin tocar la red.
- El bloqueo lo decide una máquina de estados pura (`reduceLock`) que un hook conecta con
  `AppState` y la biometría, y que `LockGate` hace visible tapando el contenido.
- Trabajo por carriles en paralelo: `macbook-agent` (bloqueo, rama `feat/jarvis-lock`),
  `windows-agent` (música e intenciones locales, rama `feat/jarvis-music`), `local-ui-agent`
  (pantalla, personaje y marca), `local-engine-agent` (voz, motor e integración) y `orchestrator`
  (documentación y proceso, verificación y release). Cada carril entrega por PR a `jarvis/mvp`.
- Ningún equipo local compila Android: la lógica se prueba con Vitest antes de cada compilación.

## ADR que aplica

| ADR | Estado | Cómo lo aplica este cambio |
|---|---|---|
| ADR-001 | propuesta | App separada desde un fork; cambios solo en `mobile/` y documentación. |
| ADR-002 | aceptada | Jarvis es una sesión de agente `claude` del escritorio emparejado. |
| ADR-003 | aceptada | Voz de salida con `expo-speech`, por frases, en el teléfono. |
| ADR-004 | aceptada | La música se abre en YouTube Music con la cuenta del teléfono. |
| ADR-005 | propuesta | Bloqueo biométrico en cada regreso a primer plano, sin gracia. |
| ADR-006 | aceptada | El APK se construye en GitHub Actions, con firma estable. |
| ADR-007 | aceptada | El personaje se instala en el escritorio; el repositorio es público. |
| ADR-008 | aceptada | Dos ojos en un anillo, ámbar sobre azul profundo. |

## Affected Areas

| Área | Impacto | Descripción |
|---|---|---|
| `mobile/src/jarvis/jarvis-contract.ts` | Existente | Contrato pantalla ↔ motor. Este cambio lo consume y no lo modifica. |
| `mobile/src/jarvis/lock-policy.ts`, `use-app-lock.ts`, `LockGate.tsx` | Nuevo | Bloqueo: máquina de estados, hook y candado. |
| `mobile/src/jarvis/local-intents.ts`, `youtube-music.ts` | Nuevo | Clasificador de intenciones y lanzador de YouTube Music. |
| `mobile/plugins/jarvis-android-manifest.js` | Nuevo | Declara `<queries>` para ver YouTube Music. |
| `mobile/src/jarvis/default-local-intent-handler.ts` | Modificado | Hoy es temporal (devuelve `null`); integración lo conecta. |
| `mobile/src/jarvis/speech-text.ts`, `use-jarvis-speech.ts` | Nuevo | Limpieza del texto y cola de lectura en voz alta. |
| `mobile/src/jarvis/jarvis-preferences.ts` | Nuevo | Espacio de trabajo elegido y voz activada. |
| `mobile/src/jarvis/use-jarvis-conversation.ts` | Nuevo | Motor: coordina dictado, sesión, intenciones y voz. |
| `mobile/src/jarvis/jarvis-theme.ts`, `mobile/src/jarvis/character/` | Nuevo | Paleta, tipografía y personaje animado. |
| `mobile/src/jarvis/jarvis-dependency-boundaries.test.ts` | Nuevo | Prueba las reglas de dependencia del fork. |
| `mobile/app/jarvis.tsx`, `mobile/app/jarvis-settings.tsx` | Nuevo | Pantalla del asistente y sus ajustes. |
| `mobile/app/_layout.tsx` | Modificado | Registra las dos pantallas y envuelve la navegación en `LockGate`. |
| `mobile/app/index.tsx` | Modificado | En arranque en frío redirige a `/jarvis`. |
| `mobile/app.json` | Modificado | Identidad de Jarvis y registro del plugin del manifiesto. |
| `mobile/package.json`, `mobile/pnpm-lock.yaml` | Modificado | Se agrega `expo-speech`. |
| `mobile/assets/` | Modificado | Ícono y pantalla de bienvenida propios. |
| `personaje/jarvis-mobile/`, `scripts/jarvis/install-workspace.sh` | Existente | Personaje e instalador; ya están en el repositorio. |

## Risks

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| El prompt biométrico emite eventos de ciclo de vida y puede bloquear la app o entrar en bucle de prompts. | Media | La regla vive en una función pura; `authenticating` ignora esos eventos y la tabla completa se prueba, incluida la secuencia de cancelación. |
| Cada compilación tarda unos 30 minutos y no hay ciclo rápido en el teléfono. | Alta | Probar la lógica con Vitest antes de disparar una compilación y juntar los cambios de aspecto en una sola. |
| Sin firma estable, cada APK exige desinstalar y volver a emparejar. | Media | Configurar los secretos `ANDROID_UPLOAD_*` con un almacén de claves propio antes de la primera entrega. |
| Conflicto al fusionar `upstream/main` en los dos archivos editados. | Alta | Ediciones mínimas en `_layout.tsx` e `index.tsx`; fusionar seguido. |
| El puerto 6768 del escritorio escucha en todas las interfaces, sin TLS ni filtro por IP (riesgo heredado). | Media | Usar la tailnet de Tailscale y nunca la red local abierta; se cruza con el modelo de amenazas. |
| El clasificador intercepta una orden que no era de música. | Baja | Falla hacia `unknown`: es peor interceptar de más que enviar una orden de música al agente. |
| Jarvis no funciona sin el escritorio encendido y con Orca Lab abierto. | Alta | La pantalla lo dice con `setupNeed` y el estado «Sin conexión con el escritorio». |
| La calidad de la voz depende de que el teléfono tenga voz en español. | Media | Orden de voz preferida `es-CO`, `es-US`, `es-ES`, cualquier `es`; el dueño lo verifica en el teléfono. |
| El repositorio es público y el personaje opera sobre la infraestructura del dueño. | Media | El personaje se instala en el escritorio; escaneo de secretos en `jarvis-checks.yml` y lista de lo que nunca entra en el `README.md`. |
| El MacBook tiene Node 22 y el proyecto pide Node 24. | Alta | Correr las pruebas de `feat/jarvis-lock` en el equipo principal antes de fusionar. |
| La vista previa de «apps recientes» puede mostrar lo último que se vio. | Media | No se resuelve en el MVP: es decisión abierta del dueño y exige una línea nativa. |

## Rollback Plan

- Código: cada carril entra por su propia rama con PR a `jarvis/mvp`. Revertir el PR de un módulo
  lo retira sin tocar los demás. `main` del fork se mantiene igual al upstream, así que revertir la
  fusión de `jarvis/mvp` devuelve el árbol al upstream.
- Teléfono: desinstalar Jarvis e instalar el APK anterior del artefacto `orca-mobile-android` de
  Actions. Con la misma firma se instala encima si su `versionCode` no es menor.
- Escritorio: no hay cambios que revertir. Para retirar el personaje se borra la carpeta del espacio
  de trabajo (por defecto `$HOME/orca/projects/jarvis-mobile-brain`) y se quita su registro en Orca
  Lab. Cambiar cómo habla Jarvis no exige recompilar: se vuelve a correr el instalador, que es
  idempotente.

## Dependencies

- Orca Lab de escritorio con la app móvil habilitada (puerto 6768) y el modelo de dictado descargado
  en ese equipo.
- Tailscale en el teléfono y en el escritorio.
- Espacio de trabajo de Jarvis instalado en el escritorio y una cuenta de IA administrada por Orca.
- YouTube Music instalado y con sesión iniciada en el teléfono (lo confirma el dueño al probar).
- GitHub Actions habilitado en el fork, secretos `ANDROID_UPLOAD_*` configurados y ninguno de los
  workflows del upstream que no aplican activo.

## Success Criteria

- [ ] El dueño instala el APK en su teléfono y completa el flujo de `docs/01-prd.md` §4 de principio
  a fin (cierre de la fase F1).
- [ ] La confirmación de una orden de música suena en menos de 1 segundo tras soltar el micrófono.
- [ ] La primera frase de la respuesta se oye en menos de 8 segundos tras terminar de hablar.
- [ ] Cero pedidos de desbloqueo sin que la app haya ido a segundo plano.
- [ ] Instalación y emparejamiento salen en el primer intento.
- [ ] En `mobile/`: `pnpm test` sin agregar fallos a la línea base de 7 archivos, `pnpm lint`,
  `pnpm exec tsc --noEmit` y `pnpm format:check` en verde, y la prueba de límites de dependencia en
  verde.
- [ ] El APK queda entregado al dueño por WhatsApp.

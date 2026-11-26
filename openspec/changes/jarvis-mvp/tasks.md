# Tasks: Jarvis MVP (Android)

**Cambio:** `jarvis-mvp` · **Tarea:** ORCA-1443 (Plane, proyecto ORCA "Orca Lab")

Reglas para todas las tareas:

- TDD estricto donde aplica: primero la prueba, se comprueba que falla, y después el código que la
  hace pasar.
- Comandos desde `mobile/`: `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm format:check`.
  En los equipos Windows y MacBook se usa `corepack pnpm` desde la raíz, como dicen los encargos.
- Vitest solo recolecta pruebas que vivan bajo `mobile/src/` (`*.test.ts(x)` o `*.render.test.tsx`).
- Archivos de menos de 300 líneas, sin `any`, sin deshabilitar reglas de lint. Comentarios solo para
  un porqué no obvio, en inglés; texto de la interfaz en español de Colombia.
- Ningún carril sube cambios a `main` ni a `jarvis/mvp`: entrega por PR.

## 1. Documentación y proceso

- [x] T001 (orchestrator) Pasar ORCA-1443 a In Progress y dejar un comentario con las ramas por carril (`feat/jarvis-lock`, `feat/jarvis-music`) y este cambio SDD.
- [x] T002 (orchestrator) Ejecutar `node scripts/spec-gate.mjs --change jarvis-mvp` desde la raíz: debe pasar, porque `spec.md` y `tasks.md` tienen contenido real y ORCA-1443 aparece en los archivos del cambio.
- [x] T003 (orchestrator) Anotar la línea base: correr `pnpm test` en `mobile/` sobre `jarvis/mvp` sin cambios y dejar en un comentario de ORCA-1443 la lista exacta de los 7 archivos de prueba del upstream que fallan. La lista quedó en un comentario de ORCA-1443.
- [x] T004 (orchestrator) Confirmar que `.github/workflows/jarvis-checks.yml` (escaneo de secretos, ADR-007) existe y pasa en la rama; si aún no está en el árbol, crearlo antes de abrir el PR. Pasó en el PR #3 y en el push de la rama (runs 45770085089 y 45769669032).
- [x] T005 (orchestrator) Confirmar que el `README.md` trae la cláusula de clasificación y la lista de lo que nunca entra al repositorio, con el control que lo verifica (ADR-007).
- [x] T006 (orchestrator) Resolver con el dueño, antes de T063, los puntos abiertos del diseño que bloquean código: valores de `slug`, `scheme` y `package`; tipografía Chakra Petch y sus dependencias; política de `versionCode`.
- [x] T007 (orchestrator) Si la tipografía exige `expo-font` o `expo-asset`, actualizar ADR-003 y `docs/02-arquitectura.md` §4, donde se dice que `expo-speech` es la única dependencia nueva.

## 2. Módulo de bloqueo — rama `feat/jarvis-lock`

- [x] T010 (macbook-agent) Escribir primero `mobile/src/jarvis/lock-policy.test.ts`: la tabla completa de transiciones, las celdas que dejan el estado igual y la secuencia `APP_ACTIVE`, `APP_BACKGROUND`, `APP_ACTIVE`, `AUTH_FAILURE`, `APP_ACTIVE`, que termina en `locked-disarmed` con un solo `prompt`. Comprobar que falla porque `lock-policy.ts` no existe.
- [x] T011 (macbook-agent) Implementar `mobile/src/jarvis/lock-policy.ts` con el contrato exacto del diseño hasta que T010 pase.
- [x] T012 (macbook-agent) Escribir primero `mobile/src/jarvis/use-app-lock.test.ts` simulando `react-native` (`AppState`) y `expo-local-authentication`: pide al montar, éxito desbloquea, cancelación no vuelve a pedir, regreso del segundo plano vuelve a pedir, `inactive` no dispara nada, un dispositivo sin ningún método no llama al prompt, argumentos exactos de `authenticateAsync` y `unlock` estable entre renders.
- [x] T013 (macbook-agent) Implementar `mobile/src/jarvis/use-app-lock.ts` hasta que T012 pase.
- [x] T014 (macbook-agent) Escribir primero `mobile/src/jarvis/LockGate.render.test.tsx`: los hijos siempre montados; tapados con una vista absoluta y ocultos para accesibilidad; el botón «Desbloquear» visible solo en `locked-disarmed` y llama a `unlock`; muestra `unavailableReason`; texto breve mientras autentica; acepta `character`.
- [x] T015 (macbook-agent) Implementar `mobile/src/jarvis/LockGate.tsx` con los tokens de `mobile/src/theme/mobile-theme.ts` y `MIN_TOUCH_TARGET`, sin colores hex inline, hasta que T014 pase.
- [x] T016 (macbook-agent) Validar en la rama: `pnpm test` sin agregar fallos a la línea base, `pnpm lint`, `pnpm exec tsc --noEmit` y `pnpm format:check`.
- [x] T017 (macbook-agent) Abrir el PR de `feat/jarvis-lock` contra `jarvis/mvp` y cerrar con el bloque `=== REPORTE FINAL ===`.
- [x] T018 (orchestrator) Correr las pruebas de `feat/jarvis-lock` en el equipo principal, con Node 24, antes de fusionar: el MacBook tiene Node 22 y el proyecto pide 24 (ADR-006).
- [x] T019 (orchestrator) Revisar y fusionar el PR de `feat/jarvis-lock` en `jarvis/mvp`.

## 3. Música e intenciones locales — rama `feat/jarvis-music`

- [x] T020 (windows-agent) Escribir primero `mobile/src/jarvis/local-intents.test.ts` con al menos 14 casos: los cuatro textos de ejemplo con su `query`, los negativos, tildes, mayúsculas, texto vacío y signos de interrogación; y los dos textos exactos de `musicConfirmation`.
- [x] T021 (windows-agent) Implementar `mobile/src/jarvis/local-intents.ts` con el contrato exacto del diseño, fallando hacia `unknown`, hasta que T020 pase.
- [x] T022 (windows-agent) Escribir primero `mobile/src/jarvis/youtube-music.test.ts` simulando `expo-linking`: los tres resultados y los argumentos exactos de `sendIntent` y `openURL`.
- [x] T023 (windows-agent) Implementar `mobile/src/jarvis/youtube-music.ts`, sin lanzar nunca, hasta que T022 pase.
- [x] T024 (windows-agent) Escribir primero `mobile/src/jarvis/jarvis-android-manifest.test.ts`: agrega los dos `<intent>` dentro de `<queries>` y no duplica si `<queries>` ya existe.
- [x] T025 (windows-agent) Implementar `mobile/plugins/jarvis-android-manifest.js` siguiendo el patrón de `mobile/plugins/android-respect-rotation-lock.js`, hasta que T024 pase.
- [x] T026 (windows-agent) Validar en la rama: `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit` y `pnpm format:check`, sin editar `app.json` ni `package.json`.
- [x] T027 (windows-agent) Abrir el PR de `feat/jarvis-music` contra `jarvis/mvp` y cerrar con el bloque `=== REPORTE FINAL ===`.
- [x] T028 (orchestrator) Revisar y fusionar el PR de `feat/jarvis-music` en `jarvis/mvp`.
- [x] T029 (orchestrator) Corregir los dos `<intent>` que el plugin pone en `<queries>`: la acción va en un hijo `<action>`, no en un atributo del `<intent>`. La 0.1.0 no instalaba en Android 15 ni en 16 (`INSTALL_PARSE_FAILED_MANIFEST_MALFORMED`, «intent tags must contain either an action or data», línea 34 del manifiesto). T024 codificaba la forma equivocada; la prueba nueva falló contra el plugin anterior y pasa con el arreglo.

## 4. Voz de salida

- [x] T030 (local-engine-agent) Agregar `expo-speech`, en la versión de la línea de SDK 55, a `mobile/package.json` y regenerar `mobile/pnpm-lock.yaml` en el mismo cambio; comprobar que `pnpm install --frozen-lockfile` vuelve a pasar en `mobile/`.
- [x] T031 (local-engine-agent) Escribir primero `mobile/src/jarvis/speech-text.test.ts`: omite bloques de código, símbolos de formato y rutas; corta a ocho frases y añade «El detalle completo está en pantalla.»; emite cada frase completa en cuanto cierra, con el mensaje aún incompleto; lista numerada a una frase por paso y en orden; texto plano sin cambios; ocho frases o menos sin aviso.
- [x] T032 (local-engine-agent) Implementar `mobile/src/jarvis/speech-text.ts` puro, sin React ni React Native, hasta que T031 pase.
- [x] T033 (local-engine-agent) Escribir primero `mobile/src/jarvis/use-jarvis-speech.test.ts` simulando `expo-speech`: encola una frase mientras el mensaje sigue llegando; lee en orden; `stopSpeaking` detiene la lectura y descarta la cola; con la voz apagada no lee; elige la voz en orden `es-CO`, `es-US`, `es-ES`, cualquier `es`.
- [x] T034 (local-engine-agent) Implementar `mobile/src/jarvis/use-jarvis-speech.ts` hasta que T033 pase.

## 5. Motor de conversación

- [x] T040 (local-engine-agent) Escribir primero `mobile/src/jarvis/jarvis-preferences.test.ts` con el doble `mobile/test-doubles/async-storage-memory.ts`: valores por defecto sin nada guardado; `setWorkspace` y `setSpeechEnabled` persisten y se leen de vuelta.
- [x] T041 (local-engine-agent) Implementar `mobile/src/jarvis/jarvis-preferences.ts` con las claves del diseño hasta que T040 pase.
- [x] T042 (local-engine-agent) Escribir primero la prueba de la derivación de la actividad (nombre propuesto: `mobile/src/jarvis/jarvis-activity.test.ts`): dictado iniciando o grabando da `listening`; la cola de voz leyendo da `speaking`; transcribiendo o esperando la respuesta da `thinking`; el resto da `idle`.
- [x] T043 (local-engine-agent) Implementar la derivación como función pura hasta que T042 pase.
- [x] T044 (local-engine-agent) Escribir primero `mobile/src/jarvis/use-jarvis-conversation.test.ts` simulando `useMobileDictation` y `useMobileNativeChatSession` e inyectando un doble de `JarvisLocalIntentHandler`: cubre los escenarios de RF-3.1, RF-3.2, RF-3.4, RF-3.5, RF-4.1 y las frases de la app de `spec.md`.
- [x] T045 (local-engine-agent) Implementar `mobile/src/jarvis/use-jarvis-conversation.ts`: coordina dictado, sesión, intenciones y voz; crea la sesión `claude` si no existe; deriva `activity`, `statusText`, `connected` y `setupNeed`. Si pasa de 300 líneas, repartir en archivos con nombre propio.
- [x] T046 (local-engine-agent) Escribir primero `mobile/src/jarvis/jarvis-dependency-boundaries.test.ts` con las cuatro reglas del diseño: debe fallar mientras alguna importación las viole.
- [x] T047 (local-engine-agent) Corregir las importaciones de `mobile/src/jarvis/` y de las dos pantallas hasta que T046 pase.

## 6. Pantalla, personaje y marca

- [x] T050 (local-ui-agent) Escribir primero `mobile/src/jarvis/jarvis-theme.test.ts` con los valores exactos de la paleta: `abyss`, `ink`, `gold`, `ice`, `coral`, `mist` y `fog`.
- [x] T051 (local-ui-agent) Implementar `mobile/src/jarvis/jarvis-theme.ts` con la paleta y la tipografía de `docs/personaje/jarvis.md` hasta que T050 pase.
- [x] T052 (local-ui-agent) Escribir primero la prueba de `JarvisCharacter` en `mobile/src/jarvis/character/` (render, o con `react-native-svg` simulado como `mobile/src/components/touch-targets.test.tsx`): salida distinta por `activity`, estado dormido y estado sin conexión; no importa nada del motor ni del transporte.
- [x] T053 (local-ui-agent) Implementar `mobile/src/jarvis/character/JarvisCharacter.tsx` con `react-native-svg` y `react-native-reanimated`: anillo de 2 a 3 puntos y unos 180 de diámetro, ojos y doce marcas; parpadeo en reposo cada 4 a 7 segundos; sin animación en reposo mientras el estado no cambia; respeta «reducir movimiento».
- [x] T054 (local-ui-agent) Cargar la tipografía Chakra Petch para los rotulados, con respaldo a la fuente del sistema si falla, según lo resuelto en T006 y T007.
- [x] T055 (local-ui-agent) Escribir primero la prueba de render de la pantalla del asistente desde `mobile/src/jarvis/`, simulando `expo-router`: personaje centrado, línea de estado, conversación a la izquierda solo cuando hay algo dicho, botón de mantener de al menos 72 por 72, acciones «Plan de hoy» y «Orca», y los textos de cada `setupNeed`.
- [x] T056 (local-ui-agent) Implementar `mobile/app/jarvis.tsx`: solo presenta, con el contrato `JarvisConversation`; importa de `jarvis-contract.ts`, `character/`, `jarvis-theme.ts` y los hooks del motor.
- [x] T057 (local-ui-agent) Escribir primero la prueba de render de los ajustes: elección de espacio de trabajo y el texto «Leer respuestas en voz alta: desactivado».
- [x] T058 (local-ui-agent) Implementar `mobile/app/jarvis-settings.tsx` hasta que T057 pase.
- [x] T059 (local-ui-agent) Crear en `mobile/assets/` el ícono adaptativo (dos ojos en ámbar sobre `abyss`), el ícono y la pantalla de bienvenida propios.

## 7. Integración (requiere los módulos 2 a 6 fusionados)

- [x] T060 (local-engine-agent) Escribir primero `mobile/src/jarvis/local-intent-handler.test.ts` (nombre propuesto): con dobles del clasificador y del lanzador, una orden `music.play` devuelve la frase de confirmación; `unknown` devuelve `null`; un fallo de lanzamiento nunca lanza.
- [x] T061 (local-engine-agent) Implementar `createLocalIntentHandler({ classify, playYouTubeMusic })` y reemplazar el cuerpo temporal de `mobile/src/jarvis/default-local-intent-handler.ts` por esa llamada con `classifyLocalIntent` y `playYouTubeMusic`, quitando el comentario temporal.
- [x] T062 (local-engine-agent) Escribir primero `mobile/src/jarvis/jarvis-app-config.test.ts`, que lee `mobile/app.json`: nombre «Jarvis», paquete y esquema distintos de los de Orca Lab, el plugin del manifiesto registrado y los permisos `RECORD_AUDIO` y `MODIFY_AUDIO_SETTINGS` presentes.
- [x] T063 (local-engine-agent) Editar `mobile/app.json` con los valores resueltos en T006 hasta que T062 pase.
- [x] T064 (local-engine-agent) Editar `mobile/app/_layout.tsx`: registrar `jarvis` y `jarvis-settings` sin cabecera y envolver el `Stack` en `<LockGate character={…}>`; no cambiar nada más.
- [x] T065 (local-engine-agent) Editar `mobile/app/index.tsx`: redirigir a `/jarvis` una sola vez por arranque en frío, de modo que el botón «Orca» siga abriendo el inicio de Orca Lab sin rebote.
- [x] T066 (local-engine-agent) Ejecutar `pnpm exec expo config --type introspect` en `mobile/` y comprobar en el manifiesto resuelto el paquete, el esquema y `<queries>` con los dos intents.

- [x] T067 (orchestrator) Escribir primero la prueba de render y mover la tapa del candado a un `Modal` nativo: los paneles desplegables de Orca Lab son ventanas nativas propias y quedaban visibles y tocables sobre la pantalla de bloqueo (RF-2.1).
- [x] T068 (orchestrator) Escribir primero las pruebas de flujo y hacer que la voz se calle al bloquear, que el saludo espere el desbloqueo y que mantener el micrófono corte la lectura (RF-2.1, RF-3.1, RF-4.6).
- [x] T069 (orchestrator) Cerrar lo que halló la revisión independiente antes del primer APK, cada punto con su prueba en rojo antes: dictado solo con la app desbloqueada y cancelado si se suelta antes de grabar; ninguna sesión creada antes de desbloquear; sesión reabierta si el dueño cierra su pestaña; confirmación de música dicha antes de abrirla; aviso cuando el agente espera un permiso; «toca + infinitivo» no es música; prompt biométrico sin respuesta; plugin del manifiesto que no se confunde con un `VIEW` genérico.

## 8. Verificación

- [x] T070 (orchestrator) `cd mobile && pnpm test`: comparar los archivos que fallan con la línea base de T003. No puede haber ninguno nuevo.
- [x] T071 (orchestrator) `pnpm lint`: sin reglas deshabilitadas y sin aumento de `max-lines`.
- [x] T072 (orchestrator) `pnpm exec tsc --noEmit` sin errores. En local queda un error ambiental (tipos de la raíz sin instalar); `pnpm typecheck` pasó en el CI del PR #3.
- [x] T073 (orchestrator) `pnpm format:check` sin diferencias.
- [x] T074 (orchestrator) `pnpm exec vitest run src/jarvis/jarvis-dependency-boundaries.test.ts` en verde, y cada prueba de `mobile/src/jarvis/` en verde por separado.
- [x] T075 (orchestrator) `node scripts/spec-gate.mjs --change jarvis-mvp` desde la raíz antes de cada commit, y el workflow `mobile.yml` en verde en el PR. `mobile.yml` y `jarvis-checks.yml` en verde en el PR #3.
- [ ] T076 (orchestrator) Verificar la implementación contra cada escenario de `spec.md` con `/sdd-verify`. Los escenarios «a mano en el teléfono» quedan pendientes hasta T087.
- [ ] T077 (orchestrator) Comentar en ORCA-1443 lo verificado y lo pendiente.

## 9. Release

- [x] T080 (orchestrator) Generar una vez el almacén de claves propio del proyecto, fuera del repositorio, y configurar en el fork los secretos `ANDROID_UPLOAD_KEYSTORE` (en base64), `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS` y `ANDROID_UPLOAD_KEY_PASSWORD`.
- [x] T081 (orchestrator) Instalar el personaje en el escritorio con `scripts/jarvis/install-workspace.sh` y confirmar que Orca Lab registra el espacio de trabajo.
- [x] T082 (orchestrator) Disparar `gh workflow run mobile-android-release.yml --ref <rama> -f publish_github_release=false` sobre la rama integrada; esperar unos 30 minutos y comprobar que el paso «Verify the bundle signer» no avisa firma de depuración. Run 45770110343 sobre `b26bc28a`: el paso del firmante pasó.
- [x] T083 (orchestrator) Descargar el artefacto `orca-mobile-android` y quedarse con el `.apk`. Artefacto descargado y verificado: firmado con la clave del proyecto (huella SHA-256 del certificado `d43a4931…5330`), paquete `dev.jhontamayo.jarvis`, versión 0.1.0.
- [x] T084 (orchestrator) Entregar el APK al dueño por su canal de WhatsApp. Como enlace, no como adjunto: el APK pesa 143 MB y el buzón de WhatsApp admite 64 MB. Publicado en la pre-release `mobile-android-v0.1.0`; enlace enviado por WhatsApp (T100).
- [ ] T085 (orchestrator) El dueño instala el APK en su teléfono y completa el emparejamiento por Tailscale: «Escanear código» contra el escritorio con Orca Lab abierto.
- [ ] T086 (orchestrator) El dueño elige el espacio de trabajo de Jarvis en «Ajustes de Jarvis».
- [ ] T087 (orchestrator) El dueño recorre el flujo de `docs/01-prd.md` §4 de principio a fin y la lista de «solo en el teléfono» de `spec.md`; el resultado se registra en ORCA-1443 (cierre de F1).
- [ ] T088 (orchestrator) Archivar el cambio con `/sdd-archive` y pasar ORCA-1443 a Done.
- [x] T089 (orchestrator) Construir la 0.1.1 (`versionCode` 2) con T029, instalarla en un emulador con la API 36 y publicarla; entregar el enlace en reemplazo de la 0.1.0, que no instala. Run 45868259762 sobre `8ca86138a` (el primer intento falló por un 429 de Maven Central antes de compilar). Instalada en el emulador de API 36 con la firma del proyecto; el candado pasó ahí los pasos 1 a 3 de la guía. Publicada como pre-release `mobile-android-v0.1.1` con `Jarvis-0.1.1.apk` y su `.sha256`; la 0.1.0 quedó marcada como inutilizable y el enlace se envió por WhatsApp.

## 10. Post-MVP

- [ ] T090 (orchestrator) F2: pausar, saltar y bajar el volumen de la música. Exige código nativo para teclas multimedia; empieza con `/sdd-explore`, sin código antes de su especificación.
- [ ] T091 (orchestrator) F2: lista de reproducción favorita y palabra de activación «oye Jarvis». Se especifica después de probar F1.
- [ ] T092 (orchestrator) F3: voz de nube y personalización del timbre. Exige un método RPC nuevo y una app de escritorio propia.
- [ ] T093 (orchestrator) Recoger las decisiones abiertas de `docs/01-prd.md` §10 tras probar F1: periodo de gracia, bloqueo de capturas y de la vista previa de apps recientes, confirmación de ADR-001 y cuenta de IA por defecto.
- [ ] T094 (orchestrator) Evaluar aportar el bloqueo de app al upstream de Orca Lab y montar un relevo en la nube propio.
- [ ] T095 (orchestrator) F2: al emparejar desde Jarvis, volver al asistente y no al inicio de Orca Lab.
- [ ] T096 (orchestrator) F2: línea de estado y latido del anillo según la frase que está sonando, no la última encolada.
- [ ] T097 (orchestrator) F2: en Android, no bloquear con los diálogos que la propia app inicia (permisos, selector de fotos, hoja de compartir). Exige distinguir la pausa en código nativo; hoy se acepta porque ninguna salida deja el candado abierto.
- [ ] T098 (orchestrator) F2: leer la respuesta del flujo en vivo cuando Claude escribe cada mensaje de una sola vez (RF-4.2).
- [ ] T099 (orchestrator) F2: decidir la autonomía de Jarvis en el escritorio (permisos del agente) y, si el dueño la amplía, configurarla en el espacio de trabajo.
- [ ] T100 (orchestrator) Reducir el APK por debajo de 64 MB para que vuelva a ir adjunto por WhatsApp: quitar las arquitecturas de emulador (`x86`, `x86_64`, 53 de los 143 MB) y evaluar el recorte de código. Es decisión del dueño si se deja solo `arm64-v8a`: baja a unos 74 MB y no instala en teléfonos de 32 bits ni en emuladores.

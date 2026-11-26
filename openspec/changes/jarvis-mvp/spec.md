# Especificación: Jarvis MVP (Android)

**Cambio:** `jarvis-mvp` · **Tarea:** ORCA-1443 (Plane, proyecto ORCA "Orca Lab")

Especificación completa, no delta: el fork parte sin especificaciones base. Cada requisito traza a un
requisito funcional del PRD (`docs/01-prd.md` §5), nombra el archivo que lo implementa cuando eso ya
está decidido y el tipo de prueba que lo demuestra. Las palabras MUST, MUST NOT, SHOULD y MAY tienen
su sentido normativo de RFC 2119.

| Tipo de prueba | Qué es |
|---|---|
| Unidad | Archivo puro probado en el proyecto `node` de Vitest, sin simulaciones. |
| Hook con simulaciones | Hook probado con `vi.mock` de `react-native` y de los módulos `expo-*`. |
| Render | Componente montado con `react-test-renderer` o con react-native-web (`*.render.test.tsx`). |
| Configuración | `mobile/app.json` leído por una prueba, y configuración resuelta con `expo config`. |
| A mano en el teléfono | Solo verificable en el teléfono del dueño; el resultado se registra en ORCA-1443. |

## app-identity-and-entry — Identidad y entrada

### Requirement: Identidad propia de la app (RF-1.1)

La app MUST llamarse Jarvis y MUST tener ícono, identificador de paquete y esquema de enlace propios,
distintos de los de Orca Lab, de modo que ambas convivan instaladas sin que una reemplace a la otra.
- Implementa `mobile/app.json` (`expo.name`, `expo.icon`, `expo.android.adaptiveIcon`, `expo.android.package`, `expo.scheme`) y `mobile/assets/`. Prueba: configuración; convivencia a mano en el teléfono.

#### Scenario: Valores propios en la configuración
- **Dado** `mobile/app.json` resuelto por Expo
- **Cuando** se leen `name`, `android.package` y `scheme`
- **Entonces** el nombre es "Jarvis" y ni el paquete ni el esquema coinciden con los de Orca Lab (`com.ab2web.orca.mobile` y `orca`)

### Requirement: Entrada en frío en el asistente (RF-1.2)

Al abrir en frío, después del desbloqueo la app MUST entrar a la pantalla del asistente.
- Implementa `mobile/app/index.tsx` (redirección en el arranque en frío) y `mobile/app/jarvis.tsx`. Prueba: a mano en el teléfono.

#### Scenario: Arranque en frío
- **Dado** Jarvis instalado y con el proceso cerrado
- **Cuando** el dueño abre la app y se autentica
- **Entonces** la primera pantalla que ve tras el desbloqueo es la del asistente

### Requirement: Regreso a la pantalla donde estaba (RF-1.3)

Volver del segundo plano después del desbloqueo MUST devolver al usuario a la pantalla donde estaba.
- Implementa `mobile/src/jarvis/LockGate.tsx` y `mobile/src/jarvis/use-app-lock.ts`. Prueba: render y hook con simulaciones; a mano en el teléfono.

#### Scenario: Los hijos no se desmontan al bloquear
- **Dado** el contenido visible (estado `unlocked`)
- **Cuando** la app pasa a segundo plano y queda `locked-armed`
- **Entonces** los hijos de `LockGate` siguen montados, solo quedan tapados, y al autenticar se ve la misma pantalla

## app-lock — Bloqueo

### Requirement: Nada se muestra sin autenticar (RF-2.1)

Mientras está bloqueada, la app MUST NOT mostrar contenido ni hablar: solo se ve la pantalla de
bloqueo, con el personaje dormido, el texto "Jarvis está descansando" y, cuando corresponde, el botón
"Desbloquear".
- Implementa `mobile/src/jarvis/lock-policy.ts` (`INITIAL_LOCK_STATE`), `mobile/src/jarvis/LockGate.tsx`, `mobile/src/jarvis/use-lock-state.ts` y `mobile/src/jarvis/use-jarvis-conversation.ts` (el candado le pasa su estado al motor). Prueba: unidad, render y motor con simulaciones; a mano en el teléfono.

#### Scenario: Estado inicial
- **Dado** el estado inicial `INITIAL_LOCK_STATE`
- **Cuando** la app arranca
- **Entonces** el estado es `locked-armed` y los hijos de `LockGate` están tapados antes de cualquier autenticación

#### Scenario: Lectores de pantalla
- **Dado** el contenido tapado
- **Cuando** un lector de pantalla recorre la pantalla de bloqueo
- **Entonces** no lee nada detrás del candado (`accessibilityElementsHidden` e `importantForAccessibility="no-hide-descendants"`)

#### Scenario: Sin voz con la app bloqueada
- **Dado** la app bloqueada
- **Cuando** la sesión de Jarvis se conecta, o llega una respuesta, o Jarvis estaba leyendo al bloquearse
- **Entonces** no suena nada: el saludo y las respuestas se leen solo con la app desbloqueada, y lo que llegó bloqueada se queda en pantalla sin leerse

#### Scenario: Nada queda por encima de la tapa
- **Dado** un panel desplegable de Orca Lab abierto, que es una ventana nativa propia
- **Cuando** la app pasa a segundo plano y vuelve
- **Entonces** la pantalla de bloqueo lo cubre, no se toca nada de él ni retrocede el botón Atrás, y al autenticar sigue abierto donde estaba

### Requirement: Autenticación en cada regreso a primer plano, sin gracia (RF-2.2)

La app MUST pedir autenticación biométrica al entrar y en cada regreso a primer plano, sin periodo de
gracia. La máquina de estados MUST obedecer esta tabla; toda celda vacía deja el estado igual y
devuelve `action: 'none'`.

| Estado | Evento | Siguiente | Acción |
|---|---|---|---|
| `locked-armed` | `APP_ACTIVE` | `authenticating` | `prompt` |
| `locked-disarmed` | `USER_UNLOCK` | `authenticating` | `prompt` |
| `locked-disarmed` | `APP_BACKGROUND` | `locked-armed` | `none` |
| `authenticating` | `AUTH_SUCCESS` | `unlocked` | `none` |
| `authenticating` | `AUTH_FAILURE` | `locked-disarmed` | `none` |
| `unlocked` | `APP_BACKGROUND` | `locked-armed` | `none` |

- Implementa `mobile/src/jarvis/lock-policy.ts` (`reduceLock`) y `mobile/src/jarvis/use-app-lock.ts`. Prueba: unidad y hook con simulaciones; a mano en el teléfono.

#### Scenario: La tabla completa
- **Dado** cada fila de la tabla de transiciones
- **Cuando** se aplica `reduceLock(estado, evento)`
- **Entonces** devuelve el estado y la acción de esa fila, y para cualquier otra pareja estado-evento deja el estado igual con `action: 'none'`

#### Scenario: `inactive` no dispara nada
- **Dado** el hook `useAppLock` montado
- **Cuando** `AppState` pasa a `inactive` (persiana de notificaciones o el propio prompt)
- **Entonces** no se despacha ningún evento de bloqueo; solo `active` despacha `APP_ACTIVE` y `background` despacha `APP_BACKGROUND`

#### Scenario: Un diálogo del sistema en Android
- **Dado** un teléfono Android, donde el diálogo de un permiso es otra Activity y llega como `background`, no como `inactive`
- **Cuando** el dueño mantiene el micrófono por primera vez y Android pide el permiso
- **Entonces** la app se bloquea y el dictado no abre el micrófono; tras volver y autenticar, el dueño mantiene de nuevo y ahí dicta

### Requirement: Cancelación sin auto-prompt (RF-2.3)

Si el usuario cancela el prompt, la app MUST quedar bloqueada y MUST NOT volver a preguntar hasta que
toque "Desbloquear" o regrese de nuevo a primer plano.
- Implementa `mobile/src/jarvis/lock-policy.ts`, `mobile/src/jarvis/use-app-lock.ts` y `mobile/src/jarvis/LockGate.tsx`. Prueba: unidad, hook con simulaciones y render; a mano en el teléfono.

#### Scenario: Secuencia sin segundo prompt
- **Dado** la secuencia `APP_ACTIVE`, `APP_BACKGROUND`, `APP_ACTIVE`, `AUTH_FAILURE`, `APP_ACTIVE`
- **Cuando** se reduce con `reduceLock`
- **Entonces** termina en `locked-disarmed` y en toda la secuencia se emitió un solo `prompt`

#### Scenario: El botón Desbloquear vuelve a pedir
- **Dado** `locked-disarmed` y el botón "Desbloquear" visible en la pantalla de bloqueo
- **Cuando** el usuario lo toca (`USER_UNLOCK`)
- **Entonces** el estado es `authenticating` con acción `prompt`

#### Scenario: Un prompt sin respuesta
- **Dado** el estado `authenticating`
- **Cuando** el sistema no responde el prompt en 60 segundos
- **Entonces** el estado pasa a `locked-disarmed`, con el botón "Desbloquear", y una respuesta tardía de ese prompt no abre la app

### Requirement: PIN o patrón sin biometría inscrita (RF-2.4)

Sin biometría inscrita la app MUST aceptar el PIN o el patrón del dispositivo.
- Implementa `mobile/src/jarvis/use-app-lock.ts`. Prueba: hook con simulaciones; a mano en el teléfono.

#### Scenario: Argumentos del prompt
- **Dado** un dispositivo que puede proteger la app
- **Cuando** una transición devuelve `action: 'prompt'`
- **Entonces** se llama a `LocalAuthentication.authenticateAsync` una sola vez con `promptMessage: 'Desbloquea Jarvis'`, `cancelLabel: 'Cancelar'`, `disableDeviceFallback: false` y `requireConfirmation: true`. (`requireConfirmation` es la opción que existe en `expo-local-authentication`; el primer borrador de este escenario pedía `requireAuthentication`, que no existe en la versión del upstream.)

### Requirement: Sin método de bloqueo, falla cerrada (RF-2.5)

Si el dispositivo no tiene ningún método de bloqueo, la app MUST quedarse cerrada y MUST explicar el
motivo.
- Implementa `mobile/src/jarvis/use-app-lock.ts` (`unavailableReason`) y `mobile/src/jarvis/LockGate.tsx`. Prueba: hook con simulaciones y render; a mano en el teléfono.

#### Scenario: Dispositivo sin bloqueo de pantalla
- **Dado** un dispositivo sin PIN, patrón, huella ni rostro
- **Cuando** `useAppLock` se monta
- **Entonces** no llama a `authenticateAsync`, el estado sigue bloqueado y la pantalla de bloqueo muestra «Este teléfono no tiene bloqueo de pantalla. Configura un PIN, patrón o huella para usar Jarvis.» sin botón "Desbloquear", porque volver a pedir no serviría de nada

## assistant-conversation — Asistente

### Requirement: Mantener para hablar (RF-3.1)

Mantener presionado el micrófono MUST dictar por voz y soltarlo MUST poner el texto en pantalla y
enviarlo. Mantener el micrófono también MUST interrumpir la lectura en voz alta: el dictado oye por
el micrófono del teléfono y tomaría la voz del propio Jarvis como si fuera del dueño.
- Implementa `mobile/src/jarvis/use-jarvis-conversation.ts` (`startListening`, `stopListening`) sobre el dictado del upstream (`mobile/src/hooks/use-mobile-dictation.ts`), y `mobile/app/jarvis.tsx`. Prueba: hook con simulaciones; a mano en el teléfono.

#### Scenario: Mantener, hablar, soltar
- **Dado** el asistente listo (`setupNeed` es `null`)
- **Cuando** se llama `startListening`, luego `stopListening` y el dictado devuelve «¿Cómo van los PRs?»
- **Entonces** `activity` fue `listening` durante el dictado, `messages` contiene un mensaje del usuario con ese texto y el texto se envió a la sesión

#### Scenario: Mantener interrumpe la lectura
- **Dado** Jarvis leyendo una respuesta que aún está llegando
- **Cuando** el dueño mantiene el micrófono
- **Entonces** la lectura se corta antes de que empiece el dictado y el resto de esa respuesta, ya terminada, no se lee

#### Scenario: Soltar antes de que arranque la grabación
- **Dado** el dictado arrancando, con el micrófono todavía cerrado
- **Cuando** el dueño suelta el botón
- **Entonces** el dictado se cancela y ningún micrófono queda abierto sin nadie presionando

#### Scenario: Dictado sin configurar
- **Dado** el escritorio emparejado con el dictado desactivado o sin modelo
- **Cuando** se abre el asistente
- **Entonces** `setupNeed` es `'dictation-off'` y la pantalla muestra "El dictado no está activo en el escritorio" con el botón "Abrir ajustes de voz"

### Requirement: Teclado (RF-3.2)

El usuario MUST poder escribir con el teclado, y ese texto MUST pasar por las mismas intenciones
locales que la voz.
- Implementa `mobile/src/jarvis/use-jarvis-conversation.ts` (`sendText`) y `mobile/app/jarvis.tsx`. Prueba: hook con simulaciones; a mano en el teléfono.

#### Scenario: Escribir y enviar
- **Dado** el asistente listo
- **Cuando** el usuario escribe una pregunta con el teclado y la envía
- **Entonces** aparece como mensaje del usuario, se envía a la sesión y el agente responde

#### Scenario: El teclado también activa la música
- **Dado** el asistente listo
- **Cuando** el usuario escribe "pon música" y la envía
- **Entonces** se resuelve como intención local y la sesión de agente no recibe nada

### Requirement: Personaje con cinco estados (RF-3.3)

El personaje MUST reaccionar a cinco estados: reposo, escuchando, pensando, hablando y dormido, cada
uno con una animación distinta y reconocible.
- Implementa `mobile/src/jarvis/character/` (`JarvisCharacter`), `mobile/src/jarvis/jarvis-theme.ts` y `mobile/src/jarvis/jarvis-contract.ts` (`JarvisActivity`); dormido en la pantalla de bloqueo (`LockGate.tsx`, hueco `character`). Prueba: render; a mano en el teléfono.

#### Scenario: Los cuatro estados de la conversación
- **Dado** `JarvisCharacter` montado
- **Cuando** `activity` toma cada valor de `JarvisActivity` (`idle`, `listening`, `thinking`, `speaking`)
- **Entonces** produce una salida distinta por valor, con ámbar en reposo y hablando, e hielo escuchando

#### Scenario: Dormido en la pantalla de bloqueo
- **Dado** la app bloqueada
- **Cuando** se muestra la pantalla de bloqueo
- **Entonces** el personaje aparece dormido: ojos cerrados y anillo apagado

#### Scenario: Reducir movimiento y batería
- **Dado** "reducir movimiento" activado en el sistema
- **Cuando** cambia el estado
- **Entonces** los ojos cambian de forma y el anillo de color, sin barridos ni pulsos; y en reposo, mientras el estado no cambia, no corre animación

### Requirement: Conversación con la sesión de Jarvis (RF-3.4)

La conversación MUST ocurrir con la sesión de Jarvis en el Orca Lab emparejado, usando las cuentas de
IA de Orca. La app MUST NOT guardar claves de IA ni las instrucciones del personaje.
- Implementa `mobile/src/jarvis/use-jarvis-conversation.ts`, que coordina `mobile/src/hooks/use-mobile-dictation.ts` y `mobile/src/session/use-mobile-native-chat-session.ts`. Prueba: hook con simulaciones; a mano en el teléfono.

#### Scenario: Envío, recepción y creación de la sesión
- **Dado** un espacio de trabajo elegido y un texto que no es intención local
- **Cuando** el motor lo envía
- **Entonces** la sesión se crea con `terminal.createAgentSession` (agente `claude`, sin `claudeAccountId`) si no existía, el texto viaja con `terminal.send` y la respuesta llega por `nativeChat.subscribe`

#### Scenario: Sin cambiar nada en el escritorio
- **Dado** un escritorio emparejado y un espacio de trabajo elegido
- **Cuando** el dueño habla con Jarvis
- **Entonces** la respuesta llega del agente de Orca Lab con la cuenta de IA seleccionada en el escritorio

#### Scenario: Sin escritorio emparejado
- **Dado** el teléfono sin escritorio emparejado
- **Cuando** se abre el asistente
- **Entonces** `setupNeed` es `'pair-desktop'` y la pantalla muestra "Empareja tu escritorio para empezar" con el botón "Escanear código"

#### Scenario: Se corta la conexión
- **Dado** una conversación en curso
- **Cuando** el escritorio deja de responder
- **Entonces** `connected` es `false` y el personaje pasa a «Sin conexión»: ojos abiertos y quietos, anillo punteado y apagado

#### Scenario: Nada se abre antes de autenticar
- **Dado** la app arrancada y todavía bloqueada
- **Cuando** el espacio de trabajo no tiene aún una pestaña de Claude
- **Entonces** ninguna sesión se crea en el escritorio; se crea en cuanto el dueño desbloquea. Una sesión que ya existe sí se encuentra

#### Scenario: El agente pide permiso en el escritorio
- **Dado** el agente detenido, esperando un permiso en un diálogo de Orca Lab
- **Cuando** el dueño dicta o escribe
- **Entonces** la línea de estado dice «Espero tu permiso en Orca Lab», no se envía nada al escritorio y Jarvis dice «Jarvis espera tu permiso en Orca Lab. Apruébalo allí y repíteme el mensaje.»

#### Scenario: La pestaña de Jarvis se cierra en el escritorio
- **Dado** una sesión que la propia app abrió
- **Cuando** el dueño cierra esa pestaña en el escritorio
- **Entonces** la app abre otra, bajo un identificador de operación nuevo, y la conversación puede seguir

### Requirement: Elegir el espacio de trabajo de Jarvis (RF-3.5)

El usuario MUST poder elegir qué espacio de trabajo de qué escritorio es "Jarvis", y la elección MUST
persistir entre arranques.
- Implementa `mobile/app/jarvis-settings.tsx` y `mobile/src/jarvis/jarvis-preferences.ts`. Prueba: unidad y hook con simulaciones; a mano en el teléfono.

#### Scenario: Elegir en ajustes y volver a entrar
- **Dado** al menos un escritorio emparejado
- **Cuando** el dueño elige un espacio de trabajo en "Ajustes de Jarvis" y la app se cierra y vuelve a abrirse
- **Entonces** `setWorkspace` guardó un `JarvisWorkspaceRef` con ese `hostId`, `worktreeId` y `name`, la preferencia sigue ahí y la sesión abre en ese espacio de trabajo

#### Scenario: Sin espacio elegido
- **Dado** un escritorio emparejado y ninguna preferencia guardada
- **Cuando** se abre el asistente
- **Entonces** `setupNeed` es `'choose-workspace'` y la pantalla muestra "Elige desde qué espacio de trabajo habla Jarvis" con el botón "Elegir"

### Requirement: Botón Orca (RF-3.6)

Desde el asistente MUST poder llegarse a la interfaz completa de Orca Lab.
- Implementa `mobile/app/jarvis.tsx` y `mobile/app/index.tsx`. Prueba: a mano en el teléfono.

#### Scenario: El botón Orca
- **Dado** la pantalla del asistente ya mostrada en este arranque
- **Cuando** el dueño toca "Orca"
- **Entonces** se abre el inicio de Orca Lab y la app no lo devuelve sola al asistente

## fast-answer-and-voice — Respuesta rápida y voz

### Requirement: Órdenes de música sin llamar a la IA (RF-4.1)

Las órdenes de música MUST resolverse en el teléfono, sin llamar a la IA.
- Implementa `mobile/src/jarvis/local-intents.ts`, `mobile/src/jarvis/default-local-intent-handler.ts` y `mobile/src/jarvis/use-jarvis-conversation.ts`. Prueba: unidad y hook con simulaciones; a mano en el teléfono (tiempo).

#### Scenario: "Ponme música de salsa"
- **Dado** el asistente listo
- **Cuando** el dictado devuelve «ponme música de salsa»
- **Entonces** se abre YouTube Music y la sesión de agente no recibe nada

#### Scenario: Lo que no es música va al agente
- **Dado** los textos «¿qué música le gusta a X?», «busca la música de la película Y en Plane», «escribe un ensayo sobre la música de los 80», «toca revisar los PRs» y «Jarvis, toca revisar el plan de hoy»
- **Cuando** se clasifican
- **Entonces** dan `{ kind: 'unknown' }` y el texto se envía a la sesión. En Colombia «toca revisar» significa «hay que revisar»; solo es una orden de tocar si nombra un género o la palabra «música»

### Requirement: Primera frase antes del final (RF-4.2)

La primera frase de una respuesta MUST empezar a leerse antes de que la respuesta termine de llegar.
- Implementa `mobile/src/jarvis/use-jarvis-speech.ts` (cola de lectura) y `mobile/src/jarvis/speech-text.ts`. Prueba: unidad y hook con simulaciones; a mano en el teléfono.

#### Scenario: Frase a frase
- **Dado** una respuesta del agente que llega por bloques (`streaming` en `true`)
- **Cuando** se completa la primera frase
- **Entonces** esa frase entra a la cola de voz y se empieza a leer aunque el mensaje siga llegando

#### Scenario: Voz en español
- **Dado** un teléfono con voces en español instaladas
- **Cuando** Jarvis lee
- **Entonces** usa la primera voz disponible en este orden: `es-CO`, `es-US`, `es-ES`, cualquier `es`

### Requirement: Omitir código, formato y rutas (RF-4.3)

Al leer en voz alta la app MUST omitir bloques de código, símbolos de formato y rutas de archivo.
- Implementa `mobile/src/jarvis/speech-text.ts`. Prueba: unidad.

#### Scenario: Bloque de código
- **Dado** un mensaje con un bloque de código
- **Cuando** se convierte a texto hablable
- **Entonces** el código no aparece en lo que se lee

#### Scenario: Símbolos de formato y rutas
- **Dado** un mensaje con negritas, encabezados, viñetas, enlaces y rutas como `src/main/runtime/rpc-client.ts`
- **Cuando** se convierte a texto hablable
- **Entonces** se lee el texto sin los símbolos de Markdown y sin las rutas

### Requirement: Recorte a ocho frases (RF-4.4)

Las respuestas largas MUST recortarse al hablar a ocho frases como máximo y la app MUST avisar que el
detalle está en pantalla.
- Implementa `mobile/src/jarvis/speech-text.ts`. Prueba: unidad.

#### Scenario: Más de ocho frases
- **Dado** una respuesta de más de ocho frases
- **Cuando** se prepara para leer
- **Entonces** se leen las primeras ocho y después se anuncia «El detalle completo está en pantalla.»

#### Scenario: Ocho frases o menos
- **Dado** una respuesta de ocho frases o menos
- **Cuando** se prepara para leer
- **Entonces** se lee completa y no se anuncia ningún recorte

### Requirement: Voz apagada y encendida (RF-4.5)

Leer en voz alta MUST poder apagarse y encenderse, y la elección MUST guardarse en las preferencias
de Jarvis (`JarvisPreferences.speechEnabled`).
- Implementa `mobile/src/jarvis/use-jarvis-conversation.ts` (`toggleSpeech`), `mobile/src/jarvis/jarvis-preferences.ts` y `mobile/app/jarvis-settings.tsx`. Prueba: hook con simulaciones y unidad; a mano en el teléfono.

#### Scenario: Apagar y encender
- **Dado** la voz encendida
- **Cuando** el dueño la apaga y llega una respuesta
- **Entonces** `speechEnabled` es `false`, esa respuesta no se lee y la pantalla muestra "Leer respuestas en voz alta: desactivado"; al encenderla de nuevo, la siguiente respuesta sí se lee

### Requirement: Interrumpir la lectura (RF-4.6)

Tocar el personaje o un botón de detener MUST interrumpir la lectura.
- Implementa `mobile/src/jarvis/use-jarvis-speech.ts`, `mobile/src/jarvis/use-jarvis-conversation.ts` (`stopSpeaking`) y `mobile/app/jarvis.tsx`. Prueba: hook con simulaciones; a mano en el teléfono.

#### Scenario: Tocar detener
- **Dado** Jarvis leyendo una respuesta
- **Cuando** el dueño toca el personaje o el botón de detener
- **Entonces** se calla de inmediato, descarta lo que faltaba y `activity` vuelve a `idle`

#### Scenario: El turno sigue tras la interrupción
- **Dado** Jarvis interrumpido mientras el agente sigue trabajando
- **Cuando** el agente escribe otro mensaje del mismo turno, por ejemplo después de llamar una herramienta
- **Entonces** ese mensaje no se lee; la respuesta del turno siguiente sí

### Requirement: Planes dictados (RF-4.7)

Los planes MUST dictarse como pasos cortos y numerados.
- Implementa `mobile/src/jarvis/speech-text.ts` (lista numerada a una frase por paso, en orden) y las reglas del personaje en el escritorio (`personaje/jarvis-mobile/AGENTS.md`). Prueba: unidad; a mano en el teléfono.

#### Scenario: Lista numerada
- **Dado** una respuesta con una lista numerada de pasos
- **Cuando** se convierte a texto hablable
- **Entonces** cada paso entra a la cola de voz como una frase, en el orden de la lista

### Requirement: Frases propias de la app (sin RF; `docs/personaje/jarvis.md` §2)

Las frases de la app, que no son las del agente, MUST decirse tal como están escritas en
`docs/personaje/jarvis.md`, en español de Colombia.
- Implementa `mobile/src/jarvis/use-jarvis-conversation.ts`, `mobile/src/jarvis/use-jarvis-speech.ts` y `mobile/src/jarvis/local-intents.ts` (`musicConfirmation`). Prueba: hook con simulaciones y unidad; a mano en el teléfono.

#### Scenario: Saludo una vez por arranque en frío
- **Dado** un arranque en frío
- **Cuando** el dueño desbloquea por primera vez
- **Entonces** Jarvis dice «Aquí Jarvis. ¿Qué necesitas?»; tras ir a segundo plano y desbloquear de nuevo, no lo repite

#### Scenario: No entendió el dictado
- **Dado** un dictado que termina sin texto reconocible
- **Cuando** el motor recibe el error
- **Entonces** no se envía nada y Jarvis dice «No te entendí. ¿Me lo repites?»

#### Scenario: Sin conexión con el escritorio
- **Dado** `connected` en `false`
- **Cuando** el dueño intenta hablar con Jarvis y el texto no puede enviarse
- **Entonces** Jarvis dice «No encuentro el escritorio. ¿Está abierto Orca Lab?»

#### Scenario: Error de la app
- **Dado** un error de la app
- **Cuando** Jarvis lo reporta
- **Entonces** dice qué falló y qué hacer; no se disculpa ni es vago

## music-intent — Música

### Requirement: "Pon / toca / reproduce X" abre YouTube Music (RF-5.1)

"Pon / toca / reproduce X" MUST abrir YouTube Music con la cuenta del teléfono y reproducir X.
- Implementa `mobile/src/jarvis/local-intents.ts` (`classifyLocalIntent`), `mobile/src/jarvis/youtube-music.ts` (`playYouTubeMusic`) y `mobile/plugins/jarvis-android-manifest.js`. Prueba: unidad y configuración; a mano en el teléfono.

#### Scenario: Los cuatro textos de ejemplo
- **Dado** los textos «ponme música de salsa», «toca a Joe Arroyo», «reproduce la playlist de entrenamiento» y «pon música»
- **Cuando** se clasifican con `classifyLocalIntent`
- **Entonces** dan `music.play` con `query` «salsa», «Joe Arroyo», «playlist de entrenamiento» y «», respectivamente

#### Scenario: Mayúsculas, tildes y signos
- **Dado** los textos «PON MÚSICA», «pon musica.» y «¿toca música?», y aparte el texto vacío
- **Cuando** se clasifican
- **Entonces** los tres primeros dan `music.play` con `query` vacía (la comparación ignora mayúsculas, tildes y signos de los extremos) y el texto vacío da `unknown`

#### Scenario: Con YouTube Music instalado
- **Dado** `Linking.canOpenURL('https://music.youtube.com')` en `true`
- **Cuando** se llama `playYouTubeMusic('salsa')`
- **Entonces** lanza `Linking.sendIntent('android.media.action.MEDIA_PLAY_FROM_SEARCH', { query: 'salsa' })` y devuelve `{ ok: true, via: 'play-from-search' }`

#### Scenario: YouTube Music visible para Android
- **Dado** el plugin `mobile/plugins/jarvis-android-manifest.js` registrado en `mobile/app.json`
- **Cuando** Expo resuelve el manifiesto de Android (`expo config --type introspect`)
- **Entonces** `<queries>` declara el intent `android.media.action.MEDIA_PLAY_FROM_SEARCH` y el intent `VIEW` de `https://music.youtube.com`, sin duplicarse

### Requirement: Sin YouTube Music, el navegador (RF-5.2)

Si YouTube Music no está instalado, la app MUST abrir la búsqueda en el navegador.
- Implementa `mobile/src/jarvis/youtube-music.ts`. Prueba: unidad; a mano en el teléfono.

#### Scenario: Sin la app
- **Dado** `Linking.canOpenURL('https://music.youtube.com')` en `false`
- **Cuando** se llama `playYouTubeMusic('Joe Arroyo')`
- **Entonces** abre `https://music.youtube.com/search?q=Joe%20Arroyo` con `Linking.openURL` (query codificada con `encodeURIComponent`) y devuelve `{ ok: true, via: 'url' }`

#### Scenario: El intent falla con la app presente
- **Dado** `canOpenURL` en `true`
- **Cuando** `sendIntent` falla
- **Entonces** abre la búsqueda en el navegador y devuelve `via: 'url'`

#### Scenario: Todo falla
- **Dado** que ni el intent ni el navegador se pueden abrir
- **Cuando** se llama `playYouTubeMusic`
- **Entonces** devuelve `{ ok: false, reason: 'no_handler', detail }` y nunca lanza

### Requirement: Confirmación en voz alta (RF-5.3)

Tras una orden de música, la app MUST confirmar en voz alta lo que va a reproducir.
- Implementa `mobile/src/jarvis/local-intents.ts` (`musicConfirmation`) y `mobile/src/jarvis/use-jarvis-speech.ts`. Prueba: unidad; a mano en el teléfono.

#### Scenario: Con tema y sin tema
- **Dado** la intención `{ kind: 'music.play', query: 'salsa' }` y, aparte, `{ kind: 'music.play', query: '' }`
- **Cuando** se construye la confirmación con `musicConfirmation`
- **Entonces** son «Reproduciendo salsa en YouTube Music.» y «Reproduciendo música en YouTube Music.», respectivamente

#### Scenario: La confirmación se oye antes de que la música abra
- **Dado** la voz encendida y la app desbloqueada
- **Cuando** una orden de música se resuelve
- **Entonces** Jarvis dice la confirmación, espera a que termine de leerse (seis segundos como máximo) y solo entonces abre YouTube Music, porque al abrirse la app pasa a segundo plano y se calla. Con la voz apagada o la app bloqueada abre de inmediato y no dice nada

## Lo que solo se verifica en el teléfono del dueño

Lo que depende del hardware, del sistema o del escritorio no tiene prueba automatizada. Son los
criterios de aceptación textuales del PRD y se registran en ORCA-1443.

| Qué se comprueba a mano | RF |
|---|---|
| Con ambas apps instaladas, el lanzador muestra dos con nombres e íconos distintos; ninguna reemplaza a la otra. | RF-1.1 |
| Arranque en frío: la primera pantalla tras el desbloqueo es la del asistente. | RF-1.2 |
| Con una pantalla de Orca abierta, ir al segundo plano, volver y desbloquear: sigue esa pantalla. | RF-1.3 |
| Al arrancar, antes de autenticar, solo se ve la pantalla de bloqueo. | RF-2.1 |
| Con un panel desplegable de Orca Lab abierto, ir a segundo plano, volver y cancelar la huella: la tapa lo cubre y Atrás no hace nada. | RF-2.1 |
| Primera vez que se mantiene el micrófono: Android pide el permiso, Jarvis vuelve a pedir la huella al volver, y el micrófono no se abre solo. | RF-2.2, RF-3.1 |
| Teléfono desbloqueado, app en segundo plano 1 segundo, volver: pide huella o rostro. | RF-2.2 |
| Cancelar el prompt: no aparece otro prompt de forma automática. | RF-2.3 |
| Dispositivo sin huella y con PIN: el prompt ofrece el PIN y desbloquea. | RF-2.4 |
| Dispositivo sin bloqueo de pantalla: mensaje claro, nunca entra. | RF-2.5 |
| Mantener, hablar, soltar: el texto aparece en pantalla y se envía. | RF-3.1 |
| Cada estado produce una animación distinta y reconocible; «reducir movimiento»; sin gastar batería en reposo. | RF-3.3 |
| Sin cambiar nada en el escritorio, la respuesta llega del agente de Orca con la cuenta seleccionada. | RF-3.4 |
| En ajustes, elegir escritorio y espacio de trabajo; al volver a entrar, la sesión abre ahí. | RF-3.5 |
| Con YouTube Music instalado y sesión iniciada: suena X o abre su búsqueda. | RF-5.1 |
| Confirmación de la orden de música en menos de 1 segundo tras soltar el micrófono. | RF-4.1 |
| Respuesta de tres párrafos: la voz empieza con el primer párrafo completo, no al final; primera frase en menos de 8 segundos; voz en español. | RF-4.2 |
| Apagar: la siguiente respuesta no se lee. Encender: sí. | RF-4.5 |
| Mientras habla, tocar detener: se calla de inmediato. | RF-4.6 |
| Pedir un plan: el audio dice los pasos en orden, cada uno en una frase. | RF-4.7 |
| Sin YouTube Music: se abre `music.youtube.com` con la búsqueda. | RF-5.2 |
| Tras la orden, la voz dice qué va a sonar, y YouTube Music abre cuando termina de decirlo. | RF-5.3 |
| Con Claude pidiendo permiso en el escritorio, dictar: Jarvis dice que espera el permiso y no envía nada. | RF-3.4 |
| Cerrar en el escritorio la pestaña que Jarvis abrió y volver a hablar: responde. | RF-3.4 |

# Design: Jarvis MVP (Android)

**Cambio:** `jarvis-mvp` · **Tarea:** ORCA-1443 (Plane, proyecto ORCA "Orca Lab")

## Technical Approach

El fork añade una capa propia sobre la app móvil de Orca Lab sin reescribir lo que ya funciona. El
dictado, el transporte cifrado y el chat nativo son los del upstream; Jarvis los coordina y añade
cuatro pasos alrededor: el candado antes de mostrar nada, la intención local antes de enviar, la voz
al recibir, y la pantalla del asistente con el personaje.

Lo nuevo vive en `mobile/src/jarvis/` (archivos puros, hooks y el personaje), en dos pantallas que
solo presentan, en dos archivos del upstream editados al mínimo (`mobile/app/_layout.tsx` y
`mobile/app/index.tsx`), en `mobile/app.json` y en un plugin de configuración Expo. Las decisiones con
sus alternativas descartadas están en `docs/03-decisiones/`; este documento describe el estado.

## Architecture Decisions

| Decisión (ADR) | Alternativas descartadas | Fundamento |
|---|---|---|
| App separada desde un fork del monorepo (ADR-001, propuesta) | La misma app con un candado; una app desde cero; aportar al upstream; un plugin | `mobile/` ya resuelve transporte, chat y dictado; otra firma no se instala encima del mismo paquete; no hay superficie de plugin móvil. |
| El razonamiento ocurre en una sesión de agente `claude` del Orca Lab emparejado (ADR-002) | Llamar a un modelo desde el teléfono; un backend propio; reutilizar el bot de WhatsApp; bot en la nube | Nada sensible vive en el teléfono; el agente ya tiene herramientas, memoria y cuentas de IA de Orca. |
| Voz de salida con `expo-speech`, por frases, en el teléfono (ADR-003) | Síntesis en la nube; voz propia en `expo-two-way-audio`; solo texto; leer al final | Sin método RPC nuevo, porque el fork no toca el escritorio; costo cero; suena con el retraso de una frase. |
| La música se abre en YouTube Music con la cuenta del teléfono (ADR-004) | WebView con el reproductor incrustado; extraer el audio; que el agente devuelva un enlace | No hay API pública; responde en menos de un segundo y no toca los términos de servicio. |
| Bloqueo biométrico en cada regreso a primer plano, sin gracia (ADR-005, propuesta) | Periodo de gracia; pedir solo al arrancar; disparar también con `inactive`; temporizador | «Siempre» significa siempre; `inactive` genera bucle de prompts; un temporizador en JavaScript no corre garantizado en segundo plano. |
| El APK se construye en GitHub Actions (ADR-006) | JDK y SDK en Windows o MacBook; contenedor; EAS Build; `expo run:android` | Ningún equipo del proyecto puede compilar; el runner ya lo tiene todo. |
| El personaje se instala en el escritorio (ADR-007) | Instrucciones con datos del dueño en el repositorio; empaquetarlas en el APK; pasarlas en el primer mensaje | El repositorio es público; cambiar una frase no debe costar 30 minutos de compilación. |
| Dos ojos en un anillo, ámbar sobre azul profundo (ADR-008) | Orbe que pulsa; cian sobre negro; avatar humano; solo texto; la pantalla de sesión maquillada | Un solo elemento memorable; se dibuja con `react-native-svg` y `react-native-reanimated`, ya presentes. |

## Módulos

| Archivo | Qué hace | Prueba | Carril |
|---|---|---|---|
| `mobile/src/jarvis/jarvis-contract.ts` | Tipos del contrato pantalla ↔ motor. Sin código ejecutable. Ya existe. | Lo consumen pantalla y motor | — |
| `mobile/src/jarvis/lock-policy.ts` | Máquina de estados pura del bloqueo. | `lock-policy.test.ts` (unidad) | `macbook-agent` |
| `mobile/src/jarvis/use-app-lock.ts` | Conecta la máquina con `AppState` y `expo-local-authentication`. | `use-app-lock.test.ts` (hook con simulaciones) | `macbook-agent` |
| `mobile/src/jarvis/LockGate.tsx` | El candado: tapa el contenido y muestra la pantalla de bloqueo. | `LockGate.render.test.tsx` (render) | `macbook-agent` |
| `mobile/src/jarvis/local-intents.ts` | Clasificador de intenciones y frase de confirmación. Puro. | `local-intents.test.ts` (unidad) | `windows-agent` |
| `mobile/src/jarvis/youtube-music.ts` | Lanzador de YouTube Music. | `youtube-music.test.ts` (unidad) | `windows-agent` |
| `mobile/plugins/jarvis-android-manifest.js` | Declara `<queries>` en el manifiesto de Android. | `jarvis-android-manifest.test.ts` (unidad) | `windows-agent` |
| `mobile/src/jarvis/default-local-intent-handler.ts` | El `JarvisLocalIntentHandler` por defecto. Hoy es temporal. | `local-intent-handler.test.ts` (unidad) | `local-engine-agent` |
| `mobile/src/jarvis/speech-text.ts` | Markdown a texto hablable. Puro. | `speech-text.test.ts` (unidad) | `local-engine-agent` |
| `mobile/src/jarvis/use-jarvis-speech.ts` | Cola de lectura en voz alta. | `use-jarvis-speech.test.ts` (hook con simulaciones) | `local-engine-agent` |
| `mobile/src/jarvis/jarvis-preferences.ts` | Espacio de trabajo elegido y voz activada. | `jarvis-preferences.test.ts` (unidad) | `local-engine-agent` |
| `mobile/src/jarvis/jarvis-activity.ts` | Derivación pura de `JarvisActivity`. Nombre propuesto. | `jarvis-activity.test.ts` (unidad) | `local-engine-agent` |
| `mobile/src/jarvis/use-jarvis-conversation.ts` | Motor: coordina dictado, sesión, intenciones y voz. | `use-jarvis-conversation.test.ts` (hook con simulaciones) | `local-engine-agent` |
| `mobile/src/jarvis/jarvis-dependency-boundaries.test.ts` | Verifica las reglas de dependencia. | — | `local-engine-agent` |
| `mobile/src/jarvis/jarvis-theme.ts` | Paleta y tipografía del personaje. | `jarvis-theme.test.ts` (unidad) | `local-ui-agent` |
| `mobile/src/jarvis/character/JarvisCharacter.tsx` | El personaje animado. No sabe nada de conversación. | Prueba de componente en `character/` | `local-ui-agent` |
| `mobile/app/jarvis.tsx`, `mobile/app/jarvis-settings.tsx` | Pantallas. Solo presentan. | Render desde `mobile/src/jarvis/` | `local-ui-agent` |
| `mobile/app/_layout.tsx`, `mobile/app/index.tsx`, `mobile/app.json` | Integración (editados). | `jarvis-app-config.test.ts` (configuración) | `local-engine-agent` |

## Contratos

### Pantalla ↔ motor (`mobile/src/jarvis/jarvis-contract.ts`, textual)

```ts
/** What the character expresses. Drives the animation, nothing else. */
export type JarvisActivity = 'idle' | 'listening' | 'thinking' | 'speaking'
export type JarvisMessageRole = 'user' | 'assistant'
export interface JarvisMessage {
  id: string
  role: JarvisMessageRole
  /** Markdown source as the agent wrote it. The screen renders it; speech cleans it. */
  text: string
  /** True while the text of this message is still arriving. */
  streaming: boolean
}
/** What the owner must do before talking, if anything. `null` means ready. */
export type JarvisSetupNeed = 'pair-desktop' | 'choose-workspace' | 'dictation-off' | null
/**
 * Resolves an order on the phone, without the agent. Returns the sentence to
 * speak aloud when it handled the text, or null to send the text to the agent.
 */
export interface JarvisLocalIntentHandler {
  handle: (text: string) => Promise<string | null>
}
export interface JarvisConversation {
  activity: JarvisActivity
  /** One short line in Spanish under the character: what Jarvis is doing right now. */
  statusText: string
  messages: JarvisMessage[]
  /** True when the paired desktop answers and the Jarvis session is attached. */
  connected: boolean
  setupNeed: JarvisSetupNeed
  speechEnabled: boolean
  /** Push-to-talk: press starts the dictation, release sends. */
  startListening: () => void
  stopListening: () => void
  /** Keyboard path. Runs through the same local intents as the voice path. */
  sendText: (text: string) => void
  toggleSpeech: () => void
  /** Interrupts whatever is being read aloud. */
  stopSpeaking: () => void
}
/** The desktop workspace that plays Jarvis. See docs/personaje/jarvis.md. */
export interface JarvisWorkspaceRef {
  hostId: string
  worktreeId: string
  name: string
}
export interface JarvisWorkspaceOption {
  hostId: string
  hostName: string
  worktreeId: string
  name: string
}
export interface JarvisPreferences {
  workspace: JarvisWorkspaceRef | null
  speechEnabled: boolean
}
export interface JarvisWorkspaceOptions {
  options: JarvisWorkspaceOption[]
  loading: boolean
  error: string | null
  refresh: () => void
}
export interface JarvisPreferencesController {
  preferences: JarvisPreferences
  setWorkspace: (workspace: JarvisWorkspaceRef | null) => Promise<void>
  setSpeechEnabled: (enabled: boolean) => Promise<void>
}
```

### Bloqueo (`docs/agentes/encargo-bloqueo-macbook.md`, textual)

```ts
export type LockState = 'locked-armed' | 'locked-disarmed' | 'authenticating' | 'unlocked'
export type LockEvent = 'APP_ACTIVE' | 'APP_BACKGROUND' | 'AUTH_SUCCESS' | 'AUTH_FAILURE' | 'USER_UNLOCK'
export type LockAction = 'prompt' | 'none'
export interface LockTransition {
  state: LockState
  action: LockAction
}
export const INITIAL_LOCK_STATE: LockState = 'locked-armed'
export function reduceLock(state: LockState, event: LockEvent): LockTransition
export interface AppLockController {
  state: LockState
  unavailableReason: string | null
  unlock: () => void
}
export function useAppLock(): AppLockController
export interface LockGateProps {
  children: ReactNode
  /** Hueco para el personaje dormido que la integración pasa desde `app/_layout.tsx`. */
  character?: ReactNode
}
export function LockGate({ children, character }: LockGateProps): JSX.Element
// Lo que corre debajo del candado (el motor de conversación) lee el estado por aquí.
export function useLockState(): LockState
```

### Música e intenciones locales (`docs/agentes/encargo-musica-windows.md`, textual)

```ts
export type LocalIntent =
  | { kind: 'music.play'; query: string }
  | { kind: 'unknown' }
export function classifyLocalIntent(text: string): LocalIntent
export function musicConfirmation(intent: { kind: 'music.play'; query: string }): string
```

```ts
import * as Linking from 'expo-linking'
export type MusicLaunch =
  | { ok: true; via: 'play-from-search' | 'url' }
  | { ok: false; reason: 'no_handler'; detail?: string }
export async function playYouTubeMusic(query: string): Promise<MusicLaunch>
```

Reglas que acompañan a esos contratos y vienen en los encargos:

- `useAppLock`: `active` despacha `APP_ACTIVE`, `background` despacha `APP_BACKGROUND`, `inactive` se ignora. Al montar, si la app ya está activa, pide de una vez. Antes del primer prompt revisa si el dispositivo tiene huella, rostro o al menos PIN o patrón. Lanza un solo prompt a la vez (con una referencia) y `unlock` es estable entre renders.
- **Android no emite `inactive`.** En React Native 0.83 `onHostPause` emite `background`, así que el diálogo de un permiso, el selector de fotos o la hoja de compartir bloquean la app al abrirse. Es un costo asumido: a cambio ninguna salida de la app deja el candado abierto. Por eso el dictado también exige `unlocked`: sin eso, el permiso del micrófono bloquearía la app con la grabación a punto de abrirse.
- **Prompt sin respuesta.** En `authenticating` no hay botón. Un temporizador de 60 segundos (`PROMPT_WATCHDOG_MS`) pasa a `locked-disarmed`, y la respuesta tardía de ese prompt no cuenta.
- `LockGate`: los hijos se montan siempre; con un estado distinto de `unlocked` los tapa y les quita la accesibilidad. **La tapa es un `Modal` nativo**, no una vista encima: los paneles desplegables de Orca Lab son ventanas nativas propias y una vista no puede cubrirlos. El `Modal` se queda también con el botón Atrás. Botones de al menos `MIN_TOUCH_TARGET` (44), con los tokens de `mobile/src/theme/mobile-theme.ts` y sin colores hex inline.
- `classifyLocalIntent`: reconoce pon, ponme, pone, póngame, toca, tocáme, reproduce, reproduzca, quiero escuchar, escucho, pon a sonar, métele, déjame escuchar, y giros con «música», «canción», «algo de», «una de», «playlist», «lista». `query` es lo que se quiere escuchar, sin el verbo ni la palabra «música». Ante cualquier duda devuelve `unknown`.
- `playYouTubeMusic`: primero el intent `android.media.action.MEDIA_PLAY_FROM_SEARCH` con `{ query }`, si `Linking.canOpenURL('https://music.youtube.com')` es verdadero; si no hay app o el intent falla, abre `https://music.youtube.com/search?q=` con la consulta codificada; si todo falla, `{ ok: false, reason: 'no_handler', detail }`. Nunca lanza.
- Plugin del manifiesto: sigue el patrón de `mobile/plugins/android-respect-rotation-lock.js` (CommonJS, `withAndroidManifest` de `expo/config-plugins`) y es idempotente: si `<queries>` ya existe, no lo duplica.

### Contratos que este diseño propone (las fuentes no los fijan)

```ts
// El comentario de default-local-intent-handler.ts fija la llamada; el archivo y la firma son de este diseño.
export function createLocalIntentHandler(deps: {
  classify: (text: string) => LocalIntent
  play: (query: string) => Promise<MusicLaunch>
  confirm: (intent: MusicOrder) => string
}): JarvisLocalIntentHandler
// JarvisLocalIntentHandler.handle(text, voice?)
// `voice` es la voz del motor (JarvisOrderVoice). La orden dice por ahí su confirmación ANTES de
// abrir YouTube Music: al abrirse, la app pasa a segundo plano y el candado la calla. `say`
// resuelve cuando terminó de leerse, con un tope de 6 segundos.
// Además: `JarvisTabTarget.agentWaiting`, `useJarvisSessionAttach({ ..., mayCreate })` y el
// attacher expone `setMayCreate` y acepta `nextOperationId`.
// Actividad del personaje: función pura.
type JarvisActivityInput = {
  dictation: 'idle' | 'starting' | 'recording' | 'processing' | 'error'
  speaking: boolean
  awaitingReply: boolean
}
export function deriveJarvisActivity(input: JarvisActivityInput): JarvisActivity
```

Los hooks de voz, motor y preferencias devuelven lo que fija el contrato (`JarvisConversation`, `JarvisPreferencesController`, `JarvisWorkspaceOptions`). Sus opciones no están en las fuentes y las define el carril del motor.

## Reglas de dependencia

Las verifica `mobile/src/jarvis/jarvis-dependency-boundaries.test.ts`, no la buena voluntad:

1. `app/jarvis.tsx` y `app/jarvis-settings.tsx` importan de `jarvis-contract.ts`, `character/`, `jarvis-theme.ts` y los hooks del motor. Nunca de `src/transport`, `src/session` ni `src/hooks`.
2. `character/` no importa nada del motor ni del transporte. Solo recibe un estado y lo anima.
3. Los archivos puros (`speech-text.ts`, `local-intents.ts`, `lock-policy.ts`) no importan React ni React Native, y se prueban sin simulaciones.
4. Nada de `src/jarvis/` modifica archivos del upstream, salvo los dos editados de `app/`.

## Máquinas de estado

### Bloqueo (`reduceLock`)

| Estado | Evento | Siguiente | Acción |
|---|---|---|---|
| `locked-armed` | `APP_ACTIVE` | `authenticating` | `prompt` |
| `locked-disarmed` | `USER_UNLOCK` | `authenticating` | `prompt` |
| `locked-disarmed` | `APP_BACKGROUND` | `locked-armed` | `none` |
| `authenticating` | `AUTH_SUCCESS` | `unlocked` | `none` |
| `authenticating` | `AUTH_FAILURE` | `locked-disarmed` | `none` |
| `unlocked` | `APP_BACKGROUND` | `locked-armed` | `none` |

Cualquier celda vacía deja el estado igual y devuelve `action: 'none'`. Tres reglas la hacen segura:

1. Solo `background` dispara el bloqueo. `inactive` se ignora: aparece con la persiana de notificaciones y con el propio prompt.
2. Mientras `authenticating`, los eventos de ciclo de vida no cambian el estado.
3. Tras una cancelación no hay auto-prompt: se vuelve a pedir con el botón «Desbloquear» o al salir de la app y regresar.

### Actividad del personaje (derivación propuesta)

`JarvisActivity` tiene cuatro valores. «Dormido» es la pantalla de bloqueo y «sin conexión» se suma cuando `connected` es `false`. Gana la primera condición que se cumple, en este orden:

| Señal (en orden) | `activity` | `statusText` |
|---|---|---|
| Dictado en `starting` o `recording` | `listening` | «Te escucho» |
| La cola de voz está leyendo | `speaking` | La frase que se está leyendo, atenuada |
| Dictado en `processing`, o mensaje enviado a la espera de la respuesta | `thinking` | «Pensando» |
| Ninguna de las anteriores | `idle` | «¿Qué necesitas?» |

Por encima de la actividad: con la app bloqueada el personaje está dormido («Descansando hasta que desbloquees»); con `connected` en `false`, ojos abiertos y quietos y anillo punteado («Sin conexión con el escritorio»).

## Flujos de datos

### Hablar con Jarvis

```
Pantalla (app/jarvis.tsx) ── startListening · stopListening · sendText ──▶ Motor (use-jarvis-conversation.ts)
Motor ── useMobileDictation ── speech.dictation.start · chunk · finish ──▶ Escritorio (dictado local)
Motor ◀── texto transcrito
Motor ──▶ JarvisLocalIntentHandler.handle(texto)
            ├─ music.play ──▶ playYouTubeMusic ──▶ YouTube Music     (no toca la red ni la sesión)
            └─ unknown     ──▶ terminal.send ──▶ sesión claude del espacio de Jarvis
Motor ◀── nativeChat.subscribe, por bloques ──▶ messages[].text (streaming)
Motor ──▶ speech-text.ts (limpia, parte en frases, recorta a ocho) ──▶ use-jarvis-speech.ts (cola) ──▶ expo-speech
```

- Dictado y chat nativo no se reescriben: son `mobile/src/hooks/use-mobile-dictation.ts` y `mobile/src/session/use-mobile-native-chat-session.ts`.
- El envío reutiliza el helper del upstream para `terminal.send` (`mobile/src/session/mobile-native-chat-send.ts`), que distingue aceptado, rechazado y entrega desconocida. Ante entrega desconocida no se reintenta.
- El texto que produce el agente es un dato que se lee, nunca una instrucción para la app.
- `setupNeed` se deriva así: sin escritorio emparejado da `'pair-desktop'`; sin espacio de trabajo guardado da `'choose-workspace'`; con el dictado desactivado en el escritorio da `'dictation-off'`, estado que el upstream ya consulta con `speech.models.list` (`mobile/src/dictation/mobile-dictation-setup.ts`); si no, `null`.

### Orden de música

```
texto ──▶ classifyLocalIntent ──▶ { kind: 'music.play', query }
       ──▶ playYouTubeMusic(query) ──▶ { ok: true, via } · { ok: false, reason: 'no_handler', detail }
       ──▶ musicConfirmation(intent) ──▶ cola de voz ──▶ «Reproduciendo salsa en YouTube Music.»
```

Nada de este flujo toca la red; por eso responde en menos de un segundo. Abrir YouTube Music saca a Jarvis del primer plano, así que al volver pide la biometría.

### Bloqueo y desbloqueo

```
AppState ──▶ use-app-lock ──▶ reduceLock ──▶ { state, action }
action 'prompt' ──▶ authenticateAsync ──▶ éxito: AUTH_SUCCESS · error, cancelación o excepción: AUTH_FAILURE
state ──▶ LockGate: con `unlocked` muestra a los hijos; con otro estado los tapa con la pantalla de bloqueo
```

Los hijos se mantienen montados para no perder la navegación: el regreso es inmediato tras autenticar.

## Manejo de errores

| Caso | Comportamiento | Fuente |
|---|---|---|
| Cancelación, error o excepción del prompt biométrico | `AUTH_FAILURE`; la app vuelve a quedar bloqueada | Encargo de bloqueo |
| Dispositivo sin ningún método de bloqueo | No se llama al prompt; `unavailableReason` con el mensaje en español; falla cerrada | Encargo de bloqueo, ADR-005 |
| Texto que no es claramente una orden de música | `classifyLocalIntent` devuelve `unknown` y el texto va al agente | ADR-004 |
| Lanzamiento de música falla | `playYouTubeMusic` devuelve `{ ok: false, reason: 'no_handler', detail }` y nunca lanza; quien llama decide el mensaje | Encargo de música |
| Dictado sin texto reconocible | No se envía nada; Jarvis dice «No te entendí. ¿Me lo repites?» | `docs/personaje/jarvis.md` |
| Sin conexión con el escritorio | `connected` en `false`, personaje en «Sin conexión»; «No encuentro el escritorio. ¿Está abierto Orca Lab?» | `docs/personaje/jarvis.md` |
| Error de la app | Dice qué falló y qué hacer; no se disculpa ni es vago | `docs/personaje/jarvis.md` |
| Falla la carga de la tipografía | Se usa la fuente del sistema | ADR-008 |

## Persistencia

| Dato | Dónde | Clave |
|---|---|---|
| Token de emparejamiento | Almacén seguro del dispositivo (upstream, `mobile/src/transport/host-device-token-store.ts`) | Sin cambio |
| Espacio de trabajo de Jarvis (`JarvisWorkspaceRef`) | AsyncStorage, con el patrón de `mobile/src/storage/preferences.ts` | `jarvis:workspace` (JSON), propuesto |
| Voz activada | AsyncStorage, mismo patrón | `jarvis:speechEnabled` (`'true'` o `'false'`), propuesto |

Las claves son una propuesta de este diseño: las fuentes fijan el archivo (`jarvis-preferences.ts`) y el tipo (`JarvisPreferences`), no los nombres. El personaje no se persiste en el teléfono: vive en el espacio de trabajo del escritorio.

## Lo que queda como upstream

- Transporte y emparejamiento (`mobile/src/transport/`), sesión y chat nativo (`mobile/src/session/`), dictado (`mobile/src/hooks/`, `mobile/src/dictation/`), tokens de tema (`mobile/src/theme/mobile-theme.ts`) y la confirmación biométrica puntual de `mobile/src/remote-update/`.
- Los métodos RPC, sin cambios: no se añade ninguno en el escritorio. Jarvis usa `worktree.ps` para encontrar su espacio de trabajo, `session.tabs.subscribe` para encontrar y seguir su pestaña de Claude, `terminal.createAgentSession` cuando no existe, `terminal.send`, `nativeChat.subscribe`, `speech.models.list` y los del dictado (`speech.dictation.*`). Todos están en la lista permitida para móviles.
- Las dependencias, salvo `expo-speech` y la declaración directa de `expo-font`.

## Puntos de integración

### `mobile/app/_layout.tsx` (editado al mínimo)

- Registrar `<Stack.Screen name="jarvis" options={{ headerShown: false }} />` y `jarvis-settings` con la misma opción.
- Envolver el `<Stack>` con `<LockGate character={…}>`, dentro del `View` raíz. El hueco `character` recibe al personaje dormido. Que ninguna pantalla quede fuera lo revisa `jarvis-root-gate.test.ts` sobre el árbol sintáctico del archivo.
- Nada más cambia: enrutamiento de enlaces profundos y de notificaciones, pantalla de bienvenida y `RpcClientProvider`.

### `mobile/app.json` (editado al mínimo)

- Identidad propia, tipografía y el plugin `./plugins/jarvis-android-manifest.js` registrado junto a los del upstream, que se conservan todos. Lo revisa `jarvis-app-config.test.ts`.

### `mobile/app/index.tsx` (editado al mínimo)

- En arranque en frío redirige a `/jarvis` una sola vez por lanzamiento. El botón «Orca» debe poder abrir después el inicio de Orca Lab sin que esa pantalla lo devuelva al asistente.

### `mobile/app.json`

| Campo | Hoy (upstream) | Jarvis |
|---|---|---|
| `expo.name` | "Orca Lab" | "Jarvis" |
| `expo.slug`, `expo.scheme`, `expo.android.package` | `orca-mobile`, `orca`, `com.ab2web.orca.mobile` | Valores propios (ver puntos abiertos) |
| `expo.icon`, `expo.android.adaptiveIcon`, `expo.splash` | Recursos de Orca Lab | El personaje: dos ojos en ámbar sobre `abyss` |
| `expo.plugins` | Plugins del upstream | Añade `./plugins/jarvis-android-manifest.js` |
| `expo.android.permissions` | `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` | Sin cambio |
| `usesCleartextTraffic`, `allowBackup` | `true`, `false` | Sin cambio |

## Compilación y firma (GitHub Actions)

- No hay compilación local. `gh workflow run mobile-android-release.yml --ref <rama> -f publish_github_release=false` compila en `ubuntu-24.04` con JDK 17: instala dependencias solo en `mobile/` con `--frozen-lockfile`, corre `expo prebuild` (ahí actúa el plugin del manifiesto), firma y ejecuta `bundleRelease assembleRelease`. Tarda unos 30 minutos.
- Firma estable: los secretos `ANDROID_UPLOAD_KEYSTORE` (en base64), `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS` y `ANDROID_UPLOAD_KEY_PASSWORD`, con un almacén de claves propio generado una vez fuera del repositorio. Sin ellos cada ejecución firma con el almacén de depuración del runner, que cambia entre ejecuciones, e instalar una versión nueva exige desinstalar y volver a emparejar. El paso «Verify the bundle signer» detecta la firma de depuración.
- El artefacto `orca-mobile-android` trae el `.aab` y el `.apk`. La versión sale de `app.json` (`expo.version` y `android.versionCode`), y Android rechaza instalar un `versionCode` menor.
- El workflow `mobile.yml` corre en cada PR que toca `mobile/**`: typecheck, pruebas, lint y formato. Los workflows del escritorio están desactivados en el fork.

## Instalación del personaje en el escritorio

1. `scripts/jarvis/install-workspace.sh [directorio]` crea el espacio de trabajo (por defecto `$HOME/orca/projects/jarvis-mobile-brain`) y copia ahí `personaje/jarvis-mobile/AGENTS.md` y `CLAUDE.md`.
2. Inicia un repositorio git en esa carpeta y deja las instrucciones en un commit; si solo cambió el contenido, hace un commit nuevo. Es idempotente.
3. Registra la carpeta en Orca Lab con `orca repo add --path`. Si Orca Lab no está disponible desde ahí, lo dice y no falla.
4. En la app: «Ajustes de Jarvis», «Elegir espacio de trabajo», esa carpeta. El APK no conoce al personaje.

## Testing Strategy

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unidad | `lock-policy.ts`, `local-intents.ts`, `speech-text.ts`, el plugin del manifiesto, `jarvis-preferences.ts`, la derivación de actividad y los tokens del tema | Proyecto `node` de Vitest; los puros, sin simulaciones |
| Hook con simulaciones | `use-app-lock.ts`, `use-jarvis-speech.ts`, `use-jarvis-conversation.ts` | `vi.mock` de `react-native`, `expo-local-authentication`, `expo-speech` y de los hooks del upstream |
| Render | `LockGate.tsx`, `JarvisCharacter`, las dos pantallas | `*.render.test.tsx` con react-native-web, o `react-test-renderer` con `react-native-svg` simulado, como en `mobile/src/components/touch-targets.test.tsx` |
| Configuración | `app.json` y el manifiesto resuelto | Prueba que lee `app.json`; `pnpm exec expo config --type introspect` |
| Límites | Las cuatro reglas de dependencia | `jarvis-dependency-boundaries.test.ts` |
| A mano | Lo que depende del hardware y del escritorio | Teléfono del dueño, con la lista de `spec.md` |

Dos límites del arnés: las pruebas solo se recolectan bajo `mobile/src/`, así que las de las pantallas viven en `mobile/src/jarvis/`; y la línea base tiene 7 archivos de prueba del upstream que fallan antes de cualquier cambio.

## Migration / Rollout

No hay migración de datos: es una app nueva que convive con la oficial. El despliegue es la secuencia de `tasks.md`: almacén de claves y secretos, personaje instalado en el escritorio, compilación, entrega por WhatsApp, instalación, emparejamiento y elección del espacio de trabajo.

## Puntos abiertos que las fuentes no resuelven

Cada uno tenía su tarea en `tasks.md`. Aquí se registran como se resolvieron en la implementación;
un cambio de cualquiera pasa por un cambio nuevo de especificación.

| Punto | Cómo quedó |
|---|---|
| `expo.slug`, `expo.scheme` y `expo.android.package` | `jarvis-mobile`, `jarvis` y `dev.jhontamayo.jarvis`. `pairing.ts` acepta enlaces de los dos esquemas, `jarvis` y `orca`, porque el código QR del escritorio sigue codificando `orca://`. |
| `expo.version` y `android.versionCode` | `0.1.0` y `1` para el primer APK. Cada APK entregado sube ambos, nunca por debajo del instalado. |
| Arranque en frío por un enlace o por una notificación | `jarvis-entry.ts`: solo entra al asistente cuando el arranque no trae URL inicial ni respuesta de notificación, y una sola vez por proceso. |
| Onboarding del upstream | Queda donde estaba, en el inicio de Orca Lab. Al abrir en frío no se ve porque Jarvis entra al asistente. |
| Qué dice la app si falla la música | «No pude abrir YouTube Music en este teléfono. Revisa que la app esté instalada.» |
| Archivo y firma de `createLocalIntentHandler` | `local-intent-handler.ts`, con `{ classify, play, confirm }`. |
| Si mantener el micrófono interrumpe la lectura | Sí. El dictado oye por el micrófono del teléfono: sin cortar la voz, tomaría la de Jarvis como palabra del dueño. |
| Cómo sabe el motor que hubo un primer desbloqueo | `LockGate` publica su estado en un contexto (`use-lock-state.ts`). El motor saluda la primera vez que la sesión está conectada y en reposo **con la app desbloqueada**, y no lee nada mientras está bloqueada. |
| `speechEnabled` por defecto y claves de AsyncStorage | Activada. Una sola clave, `orca:jarvis:preferences:v1`, con el espacio de trabajo y la voz. |
| Tipografía Chakra Petch | `expo-font` declarado de forma directa: el módulo ya venía compilado en la app. No hizo falta declarar `expo-asset`. |
| Código en línea y número de cada paso en `speech-text.ts` | El código en línea se omite como los bloques. Cada paso numerado es una frase y conserva su número (`1. Revisa…`); cómo lo pronuncia el motor de voz del teléfono solo se sabe probándolo en el teléfono. |
| Cómo descubre el teléfono la sesión de Jarvis | Se suscribe a las pestañas del espacio de trabajo (`session.tabs.subscribe`) y toma la mejor pestaña de Claude que haya; su `sessionId` y `transcriptPath` salen del estado del agente. Si no hay ninguna, la abre con `terminal.createAgentSession`. |

# ADR-002 · El razonamiento ocurre en una sesión de agente del Orca Lab emparejado

| | |
|---|---|
| **Estado** | aceptada |
| **Fecha** | 2026-11-25 |

## Contexto

El dueño pidió dos cosas que juntas definen la arquitectura: hablar con Jarvis desde la APK y
razonar "con las cuentas de IA de Orca". Hoy su Jarvis vive en el escritorio: es una sesión de agente
de Orca Lab que atiende el canal de WhatsApp por medio del plugin `ab2web.orca-wa-inbox`.

El upstream ya ofrece desde el teléfono las piezas para conducir una sesión de agente:
`terminal.createAgentSession` (crea la sesión con un agente y permite fijar la cuenta de IA,
`src/main/runtime/rpc/methods/agent-session.ts:160-185`), `terminal.send` (envía texto) y
`nativeChat.subscribe` (recibe la transcripción).

## Decisión

**Jarvis es una sesión de agente `claude` en un espacio de trabajo del Orca Lab emparejado.** El
teléfono crea esa sesión si no existe, le envía lo que oye o lee, y recibe la transcripción.

El espacio de trabajo contiene las instrucciones del personaje (ADR-007). La cuenta de IA es la que
el escritorio tenga seleccionada; la app puede fijar otra con `claudeAccountId`.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Llamar a un modelo de IA directamente desde el teléfono | Obliga a guardar una clave de API en el teléfono, contra el principio de que nada sensible vive ahí. Y no tiene herramientas ni memoria: no puede consultar Plane, enviar un WhatsApp ni revisar un repositorio. |
| Un backend propio para el bot (por ejemplo, el proyecto `miguelito-core`) | Es un sistema más que operar, monitorear y asegurar. El dueño ya opera Orca Lab. |
| Reutilizar el bot de WhatsApp tal cual | Ese canal es un plugin de escritorio que consume mensajes de WhatsApp; no ofrece una interfaz a la que un teléfono se conecte. |
| Un bot de WhatsApp para empresas en la nube | Costo por conversación y dependencia de un proveedor, para resolver un canal que ya existe. |

## Consecuencias

- Facilita: Jarvis hereda todo lo que el agente ya tiene: herramientas, memoria, cuentas de IA
  administradas por Orca y reglas globales del dueño. Mejorar al personaje no exige volver a
  compilar la app.
- Facilita: WhatsApp pasa a ser un canal más del mismo asistente. Desde el teléfono se le puede
  pedir "envíame ese plan por WhatsApp" y lo resuelve el agente en el escritorio.
- Dificulta: **Jarvis no funciona sin el escritorio.** Este PC debe estar encendido y con Orca Lab
  abierto; el teléfono lo alcanza por la tailnet.
- Dificulta: la latencia es la del agente. Si el agente usa herramientas antes de responder, la
  primera frase tarda. Por eso existen las intenciones locales y la regla del personaje de responder
  primero y investigar después (`docs/personaje/jarvis.md`).
- No se usa el relevo en la nube del upstream (`relay.onorca.dev`): exige la cuenta del upstream y no
  está bajo control del fork. Queda como posible trabajo futuro.

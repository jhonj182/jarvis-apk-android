# ADR-001 · App separada, construida desde un fork del monorepo

| | |
|---|---|
| **Estado** | propuesta (el dueño confirma; el MVP avanza con ella) |
| **Fecha** | 2026-11-25 |

## Contexto

El dueño pidió una versión Android de Jarvis conectada a Orca Lab y dejó abierta la pregunta: ¿una
app diferente o la misma app de Orca Lab con un candado? Dos hechos del upstream acotan la
respuesta:

- `mobile/` ya resuelve lo caro: emparejamiento con cifrado de punta a punta
  (`mobile/src/transport/rpc-client.ts:358-432`), chat con agentes
  (`mobile/src/session/use-mobile-native-chat-session.ts`) y dictado
  (`mobile/src/hooks/use-mobile-dictation.ts`). Reescribirlo es semanas de trabajo y de riesgo.
- La app oficial se distribuye como APK adjunto a releases `mobile-android-v*`, firmado por el
  upstream. Un APK con el mismo identificador de paquete y otra firma no se instala encima.

Además el requisito nuevo no es un ajuste menor: bloqueo biométrico en cada regreso, una pantalla de
asistente con personaje y música. Cambia para qué se abre la app.

## Decisión

**Fork del monorepo que compila una app distinta**: se llama Jarvis, tiene su propio identificador de
paquete, ícono y esquema de enlace, y convive con la app oficial si ambas están instaladas.

Todos los cambios viven en `mobile/` (más documentación). `main` del fork se mantiene igual al
upstream y se sincroniza con `git merge upstream/main`; el trabajo propio va en ramas que entran por
PR.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| La misma app (mismo paquete) con un ajuste de candado | Rompe el canal de actualizaciones del upstream: la firma distinta impide instalar encima. Además el candado en cada regreso perjudica el uso rápido de Orca Lab (mirar un PR, leer un terminal). |
| Una app nueva desde cero | Reescribe transporte cifrado, chat y dictado que ya existen y están probados. Semanas de trabajo para llegar al mismo punto. |
| Aportar los cambios al upstream y esperar su release | Depende del ciclo y de las prioridades de otro equipo. No entrega un MVP esta semana. |
| Un plugin de Orca Lab | Los plugins corren en el escritorio (`src/main/runtime/rpc/methods/plugins.ts`); no existe superficie de plugin para la app móvil. |

## Consecuencias

- Facilita: la app oficial sigue actualizándose por su canal; Jarvis puede ser radical en su interfaz
  sin afectar a nadie más.
- Dificulta: mantener un monorepo muy activo (varios commits al día en `upstream/main`) obliga a
  fusionar seguido y a resolver conflictos en los dos archivos del upstream que el fork edita
  (`mobile/app/_layout.tsx` y `mobile/app/index.tsx`). Por eso las ediciones ahí son mínimas.
- El checkout es pesado (unos 480 MB) y cualquier agente que trabaje en el repo lo descarga completo.
- El fork es público porque el upstream lo es. Ver ADR-007.
- Esta decisión queda como decisión abierta en `docs/01-prd.md` §10 hasta que el dueño la confirme.

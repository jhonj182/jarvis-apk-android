# ADR-005 · Bloqueo biométrico en cada regreso a primer plano, sin gracia

| | |
|---|---|
| **Estado** | propuesta (el dueño confirmó el requisito; la gracia queda como decisión abierta) |
| **Fecha** | 2026-11-25 |

## Contexto

El dueño pidió que la app pida autenticación biométrica siempre, aunque la pantalla ya esté
desbloqueada. La app de Orca Lab solo usa la biometría para confirmar una acción puntual
(`mobile/src/remote-update/remote-update-install-confirm.ts:13-32`); no tiene bloqueo de app.

Hay una trampa conocida: el prompt biométrico de Android hace que la propia app reciba eventos de
ciclo de vida. Un bloqueo que reaccione a ellos sin cuidado se bloquea a sí mismo o entra en un bucle
de prompts.

## Decisión

**La app se bloquea cada vez que pasa a segundo plano y pide biometría al volver, sin periodo de
gracia.** El comportamiento lo decide una función pura, `reduceLock` en
`mobile/src/jarvis/lock-policy.ts`, con cuatro estados:

| Estado | Qué significa |
|---|---|
| `locked-armed` | Bloqueada; pide la huella en cuanto la app esté activa. Es el estado inicial. |
| `authenticating` | El prompt está abierto. Ignora los eventos de ciclo de vida. |
| `locked-disarmed` | El usuario canceló el prompt. No se le vuelve a pedir solo. |
| `unlocked` | Se ve la app. |

Tres reglas hacen que sea seguro:

1. Solo el estado `background` dispara el bloqueo. `inactive` se ignora: aparece con la persiana de
   notificaciones y con el propio prompt.
2. Mientras `authenticating`, los eventos de ciclo de vida no cambian el estado.
3. Tras una cancelación no hay auto-prompt: se vuelve a pedir cuando el usuario toca "Desbloquear" o
   cuando sale de la app y regresa.

Sin biometría inscrita se acepta el PIN o patrón del dispositivo. Sin ningún método de bloqueo, la
app se queda cerrada y lo explica: falla cerrada.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Un periodo de gracia (15 o 30 segundos) al volver | Más cómodo, pero incumple "siempre". Queda como decisión abierta en el PRD por si el dueño la quiere después de probar. |
| Pedir biometría solo al arrancar | Basta con mandar la app a segundo plano y volver para no volver a pedirla. No protege nada. |
| Disparar el bloqueo también con `inactive` | El propio prompt biométrico genera `inactive`: bucle de prompts. |
| Re bloquear con un temporizador en lugar del estado de la app | Depende de que un temporizador en JavaScript corran en segundo plano, lo que Android no garantiza. |

## Consecuencias

- Facilita: la regla es fácil de explicar y de probar; la función pura se verifica con la tabla
  completa de transiciones.
- Dificulta: **cada interrupción cuesta una biometría.** Abrir YouTube Music, contestar un mensaje o
  desplegar los ajustes rápidos y volver, todo pide la huella o el rostro.
- Los hijos del candado se mantienen montados para no perder la navegación, así que el regreso es
  inmediato tras autenticar. Mientras están tapados se ocultan también de los lectores de pantalla.
- No está resuelto en el MVP: la vista previa de "apps recientes" puede mostrar lo último que se vio
  antes de bloquear. Bloquearla exige una línea de código nativo y es decisión abierta en el PRD.
- El token de emparejamiento no sobrevive un reinicio del teléfono hasta el primer desbloqueo; es
  comportamiento heredado y deseable.

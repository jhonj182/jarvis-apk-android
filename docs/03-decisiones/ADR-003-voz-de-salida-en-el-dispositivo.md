# ADR-003 · Voz de salida con `expo-speech`, por frases, en el teléfono

| | |
|---|---|
| **Estado** | aceptada |
| **Fecha** | 2026-11-25 |

## Contexto

El dueño pidió que Jarvis responda rápido y le mande audios con planes. El upstream no tiene voz de
salida: ningún método RPC de síntesis de voz y ningún módulo de voz en la app. Lo único que hay es
captura de micrófono (`mobile/packages/expo-two-way-audio`, con reproducción de PCM sin uso desde
`src/`).

Una restricción acota la solución: el fork no modifica el escritorio (ADR-001), así que no se puede
añadir un método RPC nuevo.

## Decisión

**La app lee las respuestas en el teléfono con `expo-speech`**, en una cola por frases: cada frase
completa de la transcripción entra a la cola en cuanto llega, sin esperar el final de la respuesta.
Antes de leer, el texto se limpia con un función pura (`mobile/src/jarvis/speech-text.ts`) que
quita código, símbolos de formato y rutas, y recorta a ocho frases.

`expo-speech` es el único **módulo nuevo** del fork. (`expo-font` también pasa a declararse como
dependencia directa, pero solo para que su plugin de configuración sea resolvable: ya venía compilado
por otras dependencias. Ver ADR-008.)

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Síntesis de voz en la nube, transmitida como audio desde el escritorio | Calidad muy superior, pero exige un método RPC nuevo en el escritorio y por tanto compilar e instalar una app de escritorio propia. Fuera del alcance del MVP; queda para la fase F3 del PRD. |
| Añadir síntesis de voz propia al módulo nativo `expo-two-way-audio` | Código Kotlin y Swift que mantener, para usar el mismo motor de voz del sistema. No gana nada sobre `expo-speech` en el MVP. |
| No leer en voz alta y mostrar solo texto | Incumple el requisito. |
| Esperar la respuesta completa y leerla de una vez | Incumple "responder rápido": una respuesta de un minuto tardaría un minuto en empezar a sonar. |

## Consecuencias

- Facilita: funciona sin red para la voz, con costo cero, y suena con el retraso de una frase.
- Dificulta: la calidad depende de la voz en español que traiga el teléfono. Si no hay voz en
  español instalada, se oye mal o se oye en inglés; el dueño lo verifica al probar (RF-4.2).
- Dificulta: una cola por frases puede cortar una enumeración si el agente todavía está escribiendo
  el siguiente punto. Se acepta en el MVP.
- Lo que se lee es texto producido por un agente: se trata como dato, nunca como instrucción para la
  app.
- No se agrega ningún permiso: la voz de salida no necesita uno, y el dictado ya usa `RECORD_AUDIO`
  y `MODIFY_AUDIO_SETTINGS`, que están en `mobile/app.json` desde el upstream.
- Se agrega una dependencia que actualiza el lockfile de `mobile/`.

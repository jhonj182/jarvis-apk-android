# ADR-004 · La música se abre en YouTube Music con la cuenta del teléfono

| | |
|---|---|
| **Estado** | aceptada |
| **Fecha** | 2026-11-25 |

## Contexto

El dueño pidió "poner música desde mi cuenta de YouTube". No existe una API pública para reproducir
audio de YouTube Music dentro de una app de terceros. Y pidió además que la respuesta sea rápida.

## Decisión

**La orden de música se resuelve en el teléfono, sin consultar a la IA.** Un clasificador puro
(`mobile/src/jarvis/local-intents.ts`) reconoce la orden y extrae lo que se quiere escuchar; un
lanzador (`mobile/src/jarvis/youtube-music.ts`) envía a YouTube Music el intent de Android
`android.media.action.MEDIA_PLAY_FROM_SEARCH` con esa búsqueda, para que reproduzca con la cuenta ya
iniciada. Si YouTube Music no está instalado, abre la búsqueda en el navegador.

YouTube Music queda declarado en `<queries>` del manifiesto por un plugin de configuración Expo
(`mobile/plugins/jarvis-android-manifest.js`), porque Android 11 y posteriores ocultan las apps que
no se declaran.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Reproducir dentro de Jarvis con un WebView y el reproductor incrustado de YouTube | Muchos temas oficiales tienen deshabilitada la reproducción en otros sitios; el audio en segundo plano es frágil; e iniciar sesión con Google dentro del WebView es incómodo. |
| Extraer el audio con una librería de terceros | Viola los términos de YouTube, suele ser GPL y se rompe cada vez que YouTube cambia. |
| Dejar que el agente decida y devuelva un enlace | Suma varios segundos de ida y vuelta a la nube, para una orden que no necesita razonamiento. |

## Consecuencias

- Facilita: responde en menos de un segundo, usa la cuenta real del dueño y sus listas, y no toca
  los términos de servicio de YouTube.
- Dificulta: **no hay control de reproducción desde Jarvis.** Pausar, saltar o bajar el volumen
  exige código nativo para enviar teclas multimedia; queda fuera del MVP (PRD §7) y entra en la fase
  F2.
- Dificulta: abrir YouTube Music saca a Jarvis del primer plano, así que al volver pide la biometría
  (ADR-005).
- Si hay más de una app que atiende ese intent (por ejemplo Spotify), Android muestra un selector.
- El clasificador debe fallar hacia "no es música": interceptar una orden que no lo era es peor que
  enviar una de música al agente.
- No se puede probar en simulador desde los equipos del proyecto: el dueño lo valida en su teléfono
  (RF-5.1).

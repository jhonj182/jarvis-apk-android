# ADR-008 · Identidad visual: dos ojos en un anillo, ámbar sobre azul profundo

| | |
|---|---|
| **Estado** | aceptada (sujeta a ajuste del dueño al verlo en el teléfono) |
| **Fecha** | 2026-11-25 |

## Contexto

El dueño pidió una interfaz "tipo Jarvis o asistente de IA moderno" y nombró una referencia: Troko,
un robot de escritorio cuyo rasgo distintivo son los ojos animados en una pantalla. Pidió también
"diseñar el personaje". La app de Orca Lab trae una interfaz de trabajo en grafito, sin personaje.

## Decisión

**El personaje es un par de ojos dentro de un anillo fino.** Los ojos le dan carácter; el anillo
muestra lo que está haciendo. Un solo elemento memorable, y todo lo demás quieto.

- **Paleta**: azul muy profundo de fondo (`abyss`, `#071019`), tinta para las superficies (`ink`,
  `#10243A`), ámbar como color del personaje (`gold`, `#F2B544`), hielo para cuando escucha (`ice`,
  `#7FD8F0`), coral para errores (`coral`, `#FF6B57`), niebla para el texto secundario (`mist`,
  `#7C8FA3`) y bruma para el texto principal (`fog`, `#C9D6E3`). Los tokens viven en
  `mobile/src/jarvis/jarvis-theme.ts`, y una prueba los fija a los valores de `docs/personaje/jarvis.md`.
- **Tipografía**: Chakra Petch solo para rotulados (nombre, hora, estados) y la fuente del sistema
  para conversación, que es lo que se lee de verdad.
- **Cinco estados**: reposo (respira, parpadea), escuchando (ojos abiertos, anillo en hielo),
  pensando (ojos entrecerrados, barrido del anillo), hablando (anillo late por frase), dormido (ojos
  cerrados; es la pantalla de bloqueo).
- **Composición**: el personaje arriba y centrado; la conversación abajo, alineada a la izquierda;
  un botón grande de mantener para hablar.

El detalle completo está en `docs/personaje/jarvis.md`.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Un orbe luminoso que pulsa | Es el clon de Jarvis de siempre. No tiene carácter: no mira, no parpadea, no expresa nada. |
| Cian sobre negro puro | El otro valor por defecto de esta clase de interfaz. Además el ámbar es el tono de la interfaz de las películas. |
| Un avatar humano o una cara realista | Caen en lo inquietante, exigen recursos gráficos y envejecen mal. |
| Sin personaje: solo texto y un micrófono | Cumple la función, ignora lo que pidió el dueño. |
| Reutilizar la pantalla de sesión de Orca Lab maquillada | Es una interfaz de terminal con chat al lado; no se lee a un metro ni se usa caminando. |

## Consecuencias

- Facilita: el personaje se dibuja con `react-native-svg` y se anima con `react-native-reanimated`,
  las dos dependencias ya presentes. Sin imágenes que mantener en varias densidades.
- Facilita: el estado del personaje es un dato (`JarvisActivity`), así que la pantalla y el motor se
  prueban por separado.
- Dificulta: una tipografía nueva agrega archivos de fuente al repositorio y un paso al arranque
  (cargar la fuente). Si falla la carga, se usa la del sistema.
- Dificulta: las animaciones deben respetar el ajuste de "reducir movimiento" del sistema y no
  gastar batería en reposo.
- El ícono y la pantalla de bloqueo salen del mismo dibujo, para que la app se reconozca en el
  lanzador sin leer el nombre.

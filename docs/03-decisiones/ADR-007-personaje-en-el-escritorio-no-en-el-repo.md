# ADR-007 · El personaje se instala en el escritorio; el repositorio es público

| | |
|---|---|
| **Estado** | aceptada |
| **Fecha** | 2026-11-25 |

## Contexto

El dueño pidió diseñar el personaje de Jarvis. Ese personaje tiene tres partes: cómo se ve, cómo
suena y cómo piensa. La tercera son instrucciones para el agente, y el agente de Jarvis opera sobre
la infraestructura del dueño: proyectos, bots, líneas de WhatsApp.

El repositorio es un fork de uno público y GitHub no permite forks privados de repositorios
públicos. Todo lo que entre ahí es visible para cualquiera.

## Decisión

**El repositorio guarda la fuente genérica del personaje y su instalador; los detalles del dueño
viven en el escritorio.**

- `docs/personaje/jarvis.md`: diseño del personaje (personalidad, voz, aspecto, reglas de
  respuesta).
- `personaje/jarvis-mobile/`: instrucciones del agente, escritas sin datos personales.
- `scripts/jarvis/install-workspace.sh`: crea el espacio de trabajo de Jarvis en el escritorio y
  copia ahí las instrucciones.

El APK no conoce al personaje: solo abre el espacio de trabajo que el dueño elija en los ajustes.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Escribir las instrucciones con los detalles del dueño en el repositorio | Quedan públicas. |
| Empaquetar las instrucciones dentro del APK | Cambiar una frase exige recompilar (30 minutos, ADR-006), y sigue siendo legible con ingeniería inversa. |
| Pasar las instrucciones en el primer mensaje de cada conversación | Gasta una vuelta del modelo en cada sesión y se pierde si la sesión se reinicia. |

## Consecuencias

- Facilita: se puede cambiar cómo habla Jarvis en segundos, sin tocar la app.
- Dificulta: dos pasos para un cambio (editar en el repositorio, instalar en el escritorio). El
  instalador es idempotente para que el segundo paso sea un solo comando.
- Regla dura para quien contribuya: **ningún secreto, token, conversación ni dato personal entra al
  repositorio.** Lo hace cumplir el escaneo de secretos de `.github/workflows/jarvis-checks.yml` y
  lo lista el `README.md`.
- La clasificación de la información que Jarvis trata no se formaliza en este proyecto (decisión del
  dueño del 2026-11-25; ver `GOBERNANZA.md`). La regla práctica es la anterior: nada sensible en el
  repositorio.

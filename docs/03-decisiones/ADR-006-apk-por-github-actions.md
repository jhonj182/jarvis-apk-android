# ADR-006 · El APK se construye en GitHub Actions

| | |
|---|---|
| **Estado** | aceptada |
| **Fecha** | 2026-11-25 |

## Contexto

Hay que entregar un APK instalable esta semana. El inventario de los tres equipos del proyecto, hecho
el 2026-11-25:

| Equipo | Node | JDK | SDK Android | Gradle |
|---|---|---|---|---|
| Fedora (principal) | 24.20 | 25 (el proyecto pide 17) | no | no |
| PC Windows | 24.20 | no | no | no |
| MacBook Pro | 22.23 | no | no | no |

Ninguno puede compilar hoy. El upstream ya trae `.github/workflows/mobile-android-release.yml`,
que compila el APK en un runner `ubuntu-24.04` con JDK 17, instala dependencias solo en `mobile/` y
adjunta el resultado como artefacto.

## Decisión

**El APK se compila con el workflow del upstream, disparado a mano en el fork, sin publicar
release:**

```bash
gh workflow run mobile-android-release.yml --ref <rama> -f publish_github_release=false
```

El artefacto `orca-mobile-android` contiene el APK. Para que una versión se instale encima de la
anterior, la firma debe ser estable entre compilaciones: se usa el soporte de firma que el workflow
ya trae (secretos `ANDROID_UPLOAD_KEYSTORE`, `ANDROID_UPLOAD_KEYSTORE_PASSWORD`,
`ANDROID_UPLOAD_KEY_ALIAS`, `ANDROID_UPLOAD_KEY_PASSWORD`) con un almacén de claves propio del
proyecto, generado una vez.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Instalar JDK y SDK Android en el PC Windows y compilar ahí | Unos 10 GB de descarga en el equipo del dueño, más la primera compilación de React Native, más mantenerlo actualizado. Resuelve un cuello de botella que no existe: el runner ya lo tiene. |
| Lo mismo en el MacBook Pro | Igual, y con Node 22 cuando el proyecto pide 24. |
| Un contenedor con el SDK Android en el Fedora | Misma descarga, más una imagen que mantener. |
| Expo Application Services (EAS Build) | Cola y costo de un servicio externo, cuando el repositorio ya tiene el workflow. |
| Compilar en el escritorio con `expo run:android` | Requiere SDK Android local; es desarrollo, no entrega. |

## Consecuencias

- Facilita: cero instalación en los equipos del dueño; la compilación es reproducible y queda
  registrada como ejecución de Actions.
- Facilita: el workflow de verificación (`mobile.yml`) corre en cada PR.
- Dificulta: **unos 30 minutos por compilación.** No hay ciclo rápido de "cambiar y ver en el
  teléfono"; cada intento cuenta. Por eso la lógica se prueba con Vitest antes de disparar una
  compilación.
- Dificulta: el problema de firma. Sin secretos, cada ejecución firma con el almacén de depuración
  del runner, que cambia entre ejecuciones: instalar una versión nueva exige desinstalar la anterior
  y volver a emparejar. Con los secretos configurados, la firma es estable.
- Los agentes de Windows y MacBook contribuyen con código, pruebas y revisión, no con compilación.
- Se desactivaron en el fork los workflows del upstream que no aplican (compilaciones de escritorio,
  releases, sitios) para que no corran por accidente.

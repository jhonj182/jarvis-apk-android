# Instalar y probar Jarvis Mobile

**Última actualización:** 2026-11-26

Guía para el dueño: del APK a la primera conversación. Está escrita para la versión del MVP
(`0.1.0`); si algo no coincide con lo que ves, dilo y se corrige este documento junto con la app.

---

## 1. Lo que hace falta antes

| Qué | Dónde | Para qué |
|---|---|---|
| Orca Lab abierto | El escritorio que va a ser el cerebro (hoy `fedora`) | La app habla con él. Sin Orca Lab abierto, Jarvis no responde. |
| Tailscale activo | El teléfono y el escritorio | El teléfono llega al escritorio por la tailnet. |
| El espacio de trabajo de Jarvis | El escritorio | Se instala con `scripts/jarvis/install-workspace.sh`. |
| YouTube Music con tu sesión | El teléfono (solo para la música) | Para que suene con tu cuenta. |

## 2. Instalar el APK

1. Abre el APK que llegó por WhatsApp.
2. Android avisa que es de un origen desconocido: permite la instalación para ese origen.
3. Busca "Jarvis" en el lanzador. Convive con la app de Orca Lab si también la tienes: no la
   reemplaza.

Las versiones siguientes se instalan encima de esta: todas van firmadas con la misma clave.

## 3. Entrar

Al abrir, Jarvis aparece dormido y pide tu huella o tu rostro. Si cancelas, se queda cerrado hasta
que toques **Desbloquear**.

Cada vez que la app vuelve del segundo plano vuelve a pedirlo, aunque el teléfono siga
desbloqueado. Es a propósito.

## 4. Conectar el escritorio

Solo la primera vez.

1. En el escritorio, abre Orca Lab y ve a **Settings › Mobile**.
2. En «How the phone reaches this computer» elige **LAN**. No uses Orca Relay: ese pasa por la nube.
3. En el selector de dirección elige la de Tailscale del escritorio (empieza por `100.`). Si no
   aparece, agrégala como dirección personalizada. Así el teléfono lo encuentra aunque no esté en
   el mismo Wi-Fi.
4. Genera el código QR.
5. En Jarvis, toca **Escanear código** y apunta la cámara al QR.
6. Confirma el emparejamiento en las dos pantallas.

El código va dentro de `orca://pair?...`; la app lo entiende aunque su propio enlace sea `jarvis://`.

Al terminar, las pantallas de emparejamiento (que son las de Orca Lab) te dejan en el inicio de Orca
Lab. Vuelve con **Atrás**: Jarvis ya tiene el escritorio.

## 5. Elegir desde dónde habla Jarvis

1. En la pantalla del asistente, toca el ícono de ajustes.
2. En **Espacio de trabajo**, elige `jarvis-mobile-brain` del escritorio que emparejaste.

Si no lo eliges, la app toma el primero cuyo nombre contenga `jarvis-mobile`.

## 6. Activar la voz

La entrada por voz la transcribe el escritorio. Si nunca usaste el dictado de la app de Orca Lab:

1. En **Ajustes de Jarvis**, toca **Ajustes de voz**.
2. Actívalo y espera a que el modelo termine de descargarse en el escritorio (ya está descargado en
   `fedora`).

La voz de salida usa la del teléfono. Si suena mal o en inglés, revisa en los ajustes de
accesibilidad de Android que haya una voz en español instalada (Google, Samsung u otra).

## 7. Probar

En este orden. Cada fila es un criterio del PRD.

| # | Qué haces | Qué debe pasar |
|---|---|---|
| 1 | Abre la app con el teléfono ya desbloqueado | Pide huella o rostro antes de mostrar nada. |
| 2 | Cancela el prompt | Se queda en la pantalla de bloqueo y no vuelve a pedir solo. |
| 3 | Manda la app al segundo plano y vuelve | Vuelve a pedir la biometría. |
| 4 | Mantén el botón y di "¿Qué tal todo?" | Te escucha, el personaje cambia a "escuchando" y sueltas el botón. |
| 5 | Espera | La respuesta empieza a sonar frase a frase antes de terminar de llegar. |
| 6 | Toca el personaje mientras habla | Se calla. |
| 7 | Di "Jarvis, ponme música de salsa" | Abre YouTube Music y reproduce; la app lo confirma en voz alta. |
| 8 | Di "hazme un plan para mañana" | Dicta pasos cortos y numerados. |
| 9 | Escribe con el teclado "¿cómo van mis PRs?" | Responde con datos reales del escritorio. |
| 10 | Toca **Orca** | Se abre la interfaz completa de Orca Lab. |
| 11 | Mantén el botón mientras Jarvis está hablando | Se calla en seco, sin terminar la frase, y te empieza a escuchar. |
| 12 | Manda la app al segundo plano mientras habla | Se calla de inmediato. Al desbloquear ves lo que respondió, pero no te lo vuelve a leer. |
| 13 | Abre la app y no desbloqueas | No se oye nada: ni el saludo ni ninguna respuesta suenan con la app bloqueada. |
| 14 | Mantén el botón por primera vez | Android pide el permiso del micrófono. Al cerrarlo Jarvis pide la huella; desbloquea y mantén de nuevo. |
| 15 | Con un panel desplegable de Orca Lab abierto, manda la app al segundo plano y vuelve | La pantalla de bloqueo lo cubre y el botón Atrás no hace nada. |
| 16 | Pídele algo que haga que Claude pida permiso en el escritorio | La línea de estado dice "Espero tu permiso en Orca Lab". Si dictas, Jarvis te lo dice y no envía nada. |

## 8. Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| "No encuentro el escritorio" | Orca Lab cerrado, o Tailscale apagado en el teléfono o el escritorio | Revisa los dos y vuelve a entrar. |
| El dictado no arranca | El dictado no está activo en el escritorio | Actívalo desde Ajustes de Jarvis. |
| Suena en inglés o con voz robótica | El teléfono no tiene voz en español | Instala una desde los ajustes de accesibilidad. |
| Al pedir música Android pregunta con qué app abrir | Hay más de una app que responde a la orden | Elige YouTube Music la primera vez. |
| La música no suena | YouTube Music sin sesión o sin conexión | Inicia sesión en YouTube Music. |
| Pide la huella al volver de YouTube Music | Es el bloqueo siempre activo | Es lo esperado; se puede cambiar si molesta (decisión abierta del PRD). |
| Pide la huella justo después de un diálogo de Android (un permiso, el selector de fotos) | En Android todo diálogo del sistema cuenta como irse de la app | Desbloquea y repite lo que estabas haciendo. |
| "Espero tu permiso en Orca Lab" | Claude pide permiso para una herramienta en el escritorio | Apruébalo en el escritorio y repite el mensaje. |
| La música abre dos segundos después de la orden | Jarvis dice la confirmación antes de abrir YouTube Music, porque al abrirse se calla | Es lo esperado. Con la voz apagada abre de inmediato. |
| No instala encima de la versión anterior | La firma cambió | Desinstala, instala y vuelve a emparejar. |

## 9. Desinstalar

1. Desinstala Jarvis en el teléfono.
2. En el escritorio, Orca Lab › Settings › Mobile › Paired Devices: revoca el teléfono.

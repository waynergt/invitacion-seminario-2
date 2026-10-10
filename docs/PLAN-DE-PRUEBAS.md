# Plan de pruebas

## 1. Alcance

Invitación web estática: verificación del enlace personal, descifrado del nombre, escaneo con
la red neuronal, pase VIP, imagen PNG, calendario, mapas y generación de enlaces.

## 2. Niveles de prueba

| Nivel | Qué cubre | Cómo se ejecuta |
|---|---|---|
| **Unitarias** | Núcleo criptográfico (`static/invitacion-core.js`), CSV, calendario `.ics`, validación de `config.js`. | `npm test` |
| **Integración** | Generación de la lista (`npm run invitados`) → descifrado con cada código; build completo (`npm run build`) con verificación de su salida. | `npm test`, `npm run build` |
| **Seguridad estática** | Cabeceras HTTP, CSP, SRI, ausencia de `eval`/`innerHTML`, datos privados fuera de git. | `npm test` (`tests/seguridad.test.mjs`) |
| **Sistema (E2E)** | Flujo completo en el navegador. | Manual, con la tabla de la sección 4 |
| **Integración continua** | Todo lo anterior automático en cada push (Node 20 y 22) + `npm audit`. | GitHub Actions (`.github/workflows/ci.yml`) |

Vercel también corre `npm test` antes de cada build: **si una prueba falla, no se publica**.

## 3. Pruebas automáticas (67 casos)

```bash
npm test
```

Incluyen, entre otras: códigos válidos e inválidos (incluido HTML en el enlace), cifrado de
ida y vuelta, que otro código no descifre, que una alteración de un bit se detecte, que el
IV no se repita, que el JSON no contenga nombres en claro, inyección de fórmulas en CSV,
conversión de hora a UTC y CRLF del `.ics`, validación de cada campo de `config.js`, y la mesa asignada
(cifrada junto al nombre, opcional, y sin cambiar los códigos ya enviados).

### Calidad de las pruebas: prueba de mutación

Para comprobar que las pruebas realmente detectan errores, se introdujeron fallos a propósito
en el código y se verificó que alguna prueba fallara:

| Mutación introducida | ¿Detectada? |
|---|---|
| Buscar en la lista sin `hasOwnProperty` (acepta propiedades heredadas) | ✅ |
| Generador de códigos con sesgo / fuera del alfabeto | ✅ |
| Aceptar códigos de cualquier largo | ✅ |
| IV fijo (reutilización de IV en AES-GCM) | ✅ |
| No limpiar caracteres de control del nombre | ✅ |
| Quitar la protección contra fórmulas en CSV | ✅ |
| `.ics` con saltos de línea LF en lugar de CRLF | ✅ |
| Aceptar una hora de fin anterior a la de inicio | ✅ |

**Puntaje de mutación: 8/8 (100 %).**

## 4. Casos de prueba de sistema (manuales)

| ID | Caso | Pasos | Resultado esperado |
|---|---|---|---|
| CP-01 | Enlace válido | Abrir el enlace personal de un invitado | Muestra DESTINATARIO cifrado y "CLAVE VÁLIDA ✓"; botón habilitado |
| CP-02 | Sin código | Abrir la URL sin `#código` | "ACCESO DENEGADO"; sin botón de escaneo |
| CP-03 | Código inventado | `…/#ABCDEFGHJKMN` | "ACCESO DENEGADO" |
| CP-04 | Inyección en el enlace | `…/#<img src=x onerror=alert(1)>` | "ACCESO DENEGADO"; no se ejecuta nada |
| CP-05 | Sin internet | Abrir el enlace en modo avión (con la página en caché) | "SIN CONEXIÓN" con botón Reintentar |
| CP-06 | Código en minúsculas | Escribir el código del enlace en minúsculas | Funciona igual que CP-01 |
| CP-07 | Escaneo: billetera | Mostrar una billetera a la cámara | Barra BILLETERA sube; desbloquea; pase dice "Billetera" |
| CP-08 | Escaneo: zapato | Mostrar un zapato | Igual que CP-07 con "Zapato" |
| CP-09 | Cámara denegada | Rechazar el permiso de cámara | Aparece "Acceso alternativo" y permite continuar |
| CP-10 | Nombre en el pase | Completar CP-07 | El nombre aparece descifrado y coincide con el CSV |
| CP-11 | ID estable | Repetir el flujo con el mismo enlace | Mismo ID VIP |
| CP-12 | Guardar imagen | Pulsar "Guardar invitación" | Se comparte/descarga un PNG con logo, nombre y pie "SEMINARIO 2026…" |
| CP-13 | Calendario | Agendar → Google Calendar / .ics | Evento el 24-oct, 18:00–22:00 hora de Guatemala |
| CP-14 | Mapas | Cómo llegar → Maps / Waze | Abre la ubicación del hotel |
| CP-15 | Cuenta regresiva | Ver el pase | Días/horas/min/seg correctos; tras el evento dice "EVENTO FINALIZADO" |
| CP-16 | Vista previa | Pegar el enlace en WhatsApp | Imagen con el logo y texto del evento |
| CP-17 | Cabeceras | Revisar en securityheaders.com | CSP, HSTS, X-Frame-Options, etc. presentes |
| CP-18 | Consola limpia | Abrir DevTools durante CP-01 a CP-12 | Sin errores de CSP ni de JavaScript |
| CP-19 | Mesa asignada | Abrir el enlace de un invitado con mesa y completar el escaneo | El pase y el PNG muestran el recuadro MESA con su número |
| CP-20 | Sin mesa | Igual que CP-19 con un invitado sin mesa | No aparece el recuadro MESA |
| CP-21 | Cambio de mesa | Cambiar la mesa en el CSV, `npm run invitados`, publicar y reabrir el mismo enlace | Muestra la mesa nueva; el enlace no cambió |
| CP-22 | Botón estable | Abrir un enlace válido en un teléfono y observar 5 segundos | El botón "Iniciar escaneo neuronal" no se mueve mientras el nombre cifrado cambia |

Dispositivos sugeridos: Android (Chrome), iPhone (Safari) y computadora (Chrome/Firefox).

## 5. Criterios de aceptación

- 100 % de las pruebas automáticas aprobadas (CI en verde).
- CP-01 a CP-22 aprobados en al menos un Android y un iPhone.
- Sin errores en la consola del navegador.

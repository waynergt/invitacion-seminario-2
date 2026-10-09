# Seguridad

Este documento describe qué protege la invitación, de qué se protege, cómo lo hace y
qué límites tiene. El sitio es 100 % estático (Vercel): no hay servidor, base de datos
ni cuentas de usuario.

## 1. Activos

| Activo | Por qué importa |
|---|---|
| Lista de invitados (nombres y mesas) | Datos personales: no deben poder leerse desde el sitio ni desde el repositorio público. |
| Códigos de invitación | Quien tiene el código puede abrir esa invitación. |
| Imágenes de la cámara | Privacidad del invitado. |
| Integridad del sitio | Que nadie inyecte código ni modifique lo que ve el invitado. |

## 2. Modelo de amenazas (STRIDE resumido)

| Amenaza | Ejemplo | Control | Riesgo residual |
|---|---|---|---|
| **Suplantación** | Entrar escribiendo cualquier nombre. | Ya no se escribe el nombre: sale de la lista cifrada y solo se descifra con un código válido. | Quien recibe un enlace reenviado ve esa invitación (el enlace funciona como una llave). |
| **Adivinar códigos** | Probar códigos al azar. | 12 caracteres de un alfabeto de 30 → 30¹² ≈ 5·10¹⁷ combinaciones (~59 bits) generadas con `crypto.getRandomValues`. Ni con miles de invitados es viable. | Bajo. |
| **Divulgación de información** | Leer los nombres o mesas desde `invitados.json` o desde GitHub. | Cada nombre (con su mesa) va cifrado con **AES-256-GCM**; la llave sale del código (SHA-256) y el código **nunca** se sube: está solo en el `#fragmento` del enlace (los navegadores no lo envían al servidor) y en `invitados/`, ignorada por git. Hay una prueba que falla si se versiona algo de `invitados/`. | Se puede inferir el **largo** del nombre y el número de invitados. |
| **Manipulación** | Editar `invitados.json` para que aparezca otro nombre. | GCM autentica el cifrado: si cambia un solo bit, el descifrado falla. Se valida el formato de la lista y del nombre (texto, 1–80 caracteres, sin caracteres de control). | Bajo. |
| **XSS / inyección de código** | Un nombre como `<img onerror=…>` o código en el enlace. | Todo dato variable se inserta con `textContent` (nunca `innerHTML`); el código del enlace se valida contra el alfabeto; **CSP** sin `unsafe-inline` ni `unsafe-eval`. Hay pruebas que lo verifican. | Bajo. |
| **Inyección de fórmulas en CSV** | Un nombre `=HYPERLINK(...)` que Excel ejecuta al abrir `enlaces.csv`. | Los valores que empiezan con `= + - @` se escriben con `'` delante (recomendación OWASP). | Bajo. |
| **Cadena de suministro** | Que el CDN sirva una versión alterada de ONNX Runtime. | Versión fijada (`1.20.1`), **Subresource Integrity** (`sha256`) en el script principal, CSP que solo permite esa ruta exacta del CDN, `npm ci` con `package-lock.json` y `npm audit` en CI. | El `.wasm` que carga ONNX Runtime no lleva SRI (lo carga la librería), pero la CSP lo limita a esa versión inmutable de npm. |
| **Clickjacking** | Meter el sitio en un `<iframe>` engañoso. | `X-Frame-Options: DENY` y `frame-ancestors 'none'`. | Bajo. |
| **Privacidad de la cámara** | Que las imágenes salgan del teléfono. | La red neuronal corre localmente (WebAssembly); no hay ninguna petición que envíe imágenes. `Permissions-Policy` limita la cámara al propio sitio y bloquea micrófono y ubicación. | Bajo. |

## 3. Cabeceras HTTP (vercel.json)

- `Content-Security-Policy`: solo scripts propios y la ruta exacta de ONNX Runtime 1.20.1; `wasm-unsafe-eval` (necesario para WebAssembly, no permite `eval` de JavaScript); sin iframes, plugins, `<base>` ni formularios.
- `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy`.

Se pueden verificar en <https://securityheaders.com> con la URL del sitio.

## 4. Lo que NO es (límites honestos)

- **El escaneo con IA es parte de la experiencia, no un control de acceso.** Desde las herramientas de desarrollador se puede saltar la cámara; lo que protege la invitación es el código del enlace y el cifrado, no la red neuronal.
- **El enlace es la llave.** Si un invitado lo reenvía, quien lo reciba verá esa invitación. Para revocarlo: borrar la fila del CSV y correr `npm run invitados`.
- **El ID VIP del pase no es un boleto verificable**: es solo decorativo (sale del código del invitado).
- Las fuentes se cargan de Google Fonts, que recibe la IP del visitante (como cualquier sitio que las use).

## 5. Reportar un problema

Si encuentras una vulnerabilidad, avísale directamente a los organizadores (Décimo Ciclo de Ingeniería en Sistemas, UMG Chiquimulilla) en lugar de publicarla.

# Invitación · Seminario de Ingeniería en Sistemas (UMG)

Invitación web con desbloqueo por visión artificial. El invitado escribe su nombre,
le muestra una **taza de café** o un **teclado** a la cámara y una red neuronal
(MobileNetV3) que corre **en su propio teléfono** desbloquea su pase VIP.

Todo es estático: no hay servidor ni costos. Vercel solo sirve los archivos.

## Cambiar los datos del evento

Todo está en **`static/config.js`**: nombre, fecha, horario, lugar, coordenadas, organizador
y la dirección del sitio. De ahí salen la invitación, Google Calendar, el archivo `.ics`
(iPhone/Outlook), la vista previa de WhatsApp y la imagen del pase.

## Comandos

```bash
npm install        # una sola vez
npm run dev        # genera dist/ y lo regenera cada vez que guardas
npm run preview    # (en otra terminal) abre dist/ en http://localhost:3000
npm run build      # lo que corre Vercel al publicar
```

> La cámara solo funciona en `localhost` o con HTTPS.

## Estructura

```
static/                 ← código del sitio (lo que editas)
  config.js             ← DATOS DEL EVENTO
  index.html            ← estructura de las 3 pantallas
  app.js                ← cámara, red neuronal, pase, calendario, mapas, imagen PNG
  icons.js              ← los íconos de Lucide que se usan (local, ~6 KB)
  img/                  ← logo UMG, favicon, imagen para compartir (og-image.jpg)
  model/                ← MobileNetV3-Large en ONNX, pesos int8 (6 MB) + etiquetas
src/input.css           ← tema (colores UMG) y efectos, con Tailwind v4
scripts/build.mjs       ← arma dist/: copia static/, genera seminario.ics y las etiquetas para compartir, compila el CSS
tools/                  ← solo para regenerar el modelo (Python, opcional)
dist/                   ← generado, no se sube a git
```

## Colores (escudo de la Universidad Mariano Gálvez)

| Color  | Oficial   | Versión luminosa (sobre fondo oscuro) |
|--------|-----------|---------------------------------------|
| Rojo   | `#CB3332` | `#E5524F`                             |
| Azul   | `#1C72A5` | `#4FB0E8`                             |
| Oro    | `#B1873B` | `#E2BC6A`                             |

Están definidos una sola vez en `src/input.css` (`@theme`) y se usan como
`text-azul-luz`, `bg-rojo`, `border-oro-luz`, etc.

## La red neuronal

- Modelo: MobileNetV3-Large (ImageNet), exportado de PyTorch a ONNX.
- Se ejecuta con ONNX Runtime Web (WebAssembly) en el navegador del invitado; las imágenes nunca salen del teléfono.
- Los pesos se guardan en int8 por canal (22 MB → 6 MB) y se reconstruyen a float32 al cargar, así que la precisión y la velocidad son prácticamente las mismas.
- Para regenerarlo: `pip install -r tools/requirements.txt` y `python tools/export_model.py`.
  Si cambias el modelo, cámbiale el nombre al archivo y a `MODELO` en `static/app.js` (se guarda en caché un año).

# Invitación · Seminario de Ingeniería en Sistemas (UMG)

Invitación web con desbloqueo por visión artificial. Cada invitado recibe **su propio enlace**;
al abrirlo ve su nombre cifrado, le muestra una **billetera** o un **zapato** a la cámara y una
red neuronal (MobileNetV3) que corre **en su propio teléfono** desbloquea su pase VIP con su nombre.

Todo es estático: no hay servidor ni costos. Vercel solo sirve los archivos.

## Cambiar los datos del evento

Todo está en **`static/config.js`**: nombre, fecha, horario, lugar, coordenadas, organizador
y la dirección del sitio. De ahí salen la invitación, Google Calendar, el archivo `.ics`
(iPhone/Outlook), la vista previa de WhatsApp y la imagen del pase.

## Invitados (enlaces personales)

1. Escribe los nombres en **`invitados/invitados.csv`** (una persona por fila, columna `nombre`).
   La primera vez, `npm run invitados` crea ese archivo a partir de `invitados.ejemplo.csv`.
2. Corre **`npm run invitados`**. Esto:
   - le asigna a cada invitado un código único (se guarda en el mismo CSV; si vuelves a correrlo, los enlaces no cambian),
   - genera **`static/invitados.json`**, la lista **cifrada con AES-256-GCM**: cada nombre solo se puede descifrar con el código de su enlace,
   - genera **`invitados/enlaces.csv`** con el enlace y un mensaje listo para copiar en WhatsApp.
3. Sube los cambios (`static/invitados.json`) y envía a cada quien su enlace.

- Un enlace sin código o con un código inventado muestra **"Acceso denegado"**: no se puede entrar con cualquier nombre.
- Para quitarle el acceso a alguien, borra su fila del CSV y vuelve a correr `npm run invitados`.
- La carpeta `invitados/` **no se sube a git** (el repo es público y ahí están los nombres y códigos en claro).
  Guárdala en un lugar seguro: si la pierdes, puedes generar enlaces nuevos, pero los anteriores dejarán de funcionar.

## Comandos

```bash
npm install        # una sola vez
npm run dev        # genera dist/ y lo regenera cada vez que guardas
npm run preview    # (en otra terminal) abre dist/ en http://localhost:3000
npm run build      # lo que corre Vercel al publicar
npm run invitados  # genera los enlaces personales y la lista cifrada
```

> La cámara solo funciona en `localhost` o con HTTPS.

## Estructura

```
static/                 ← código del sitio (lo que editas)
  config.js             ← DATOS DEL EVENTO
  invitados.json        ← lista de invitados CIFRADA (la genera npm run invitados)
  index.html            ← estructura de las 3 pantallas
  app.js                ← cámara, red neuronal, pase, calendario, mapas, imagen PNG
  icons.js              ← los íconos de Lucide que se usan (local, ~6 KB)
  img/                  ← logo UMG, favicon, imagen para compartir (og-image.jpg)
  model/                ← MobileNetV3-Large en ONNX, pesos int8 (6 MB) + etiquetas
src/input.css           ← tema (colores UMG) y efectos, con Tailwind v4
scripts/invitados.mjs   ← genera los códigos, la lista cifrada y los enlaces
invitados/              ← TU lista en claro + enlaces (privada, no se sube a git)
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

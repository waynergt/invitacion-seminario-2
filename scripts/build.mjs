/**
 * Construye el sitio estático en dist/ (lo que publica Vercel).
 *
 *   npm run build   → genera dist/ una vez
 *   npm run dev     → igual, y lo regenera cada vez que guardas un cambio
 *
 * Pasos:
 *   1. Valida static/config.js (si algo está mal, el build falla con un mensaje claro)
 *   2. Copia static/ → dist/
 *   3. Genera dist/seminario.ics (calendario de iPhone/Outlook)
 *   4. Rellena las etiquetas para compartir (WhatsApp/Facebook) en dist/index.html
 *   5. Compila Tailwind → dist/output.css
 *   6. Verifica el resultado (no quedan marcadores sin reemplazar, existen los archivos clave)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { leerConfig, RAIZ, validarConfig } from "./lib/config.mjs";
import { generarICS } from "./lib/ics.mjs";

const STATIC = path.join(RAIZ, "static");
const DIST = path.join(RAIZ, "dist");

const escaparAtributo = (v) =>
  String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function describirFecha(C) {
  const inicio = new Date(`${C.fecha}T${C.hora}:00${C.utcOffset}`);
  const dia = inicio.toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long", timeZone: C.zonaHoraria });
  const hora = inicio.toLocaleTimeString("es-GT", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: C.zonaHoraria });
  return `${dia[0].toUpperCase()}${dia.slice(1)} · ${hora} · ${C.lugar}, ${C.direccion.split(",")[0]}`;
}

export function construir({ css = !process.env.SKIP_CSS } = {}) {
  const t0 = Date.now();
  const C = leerConfig();
  const errores = validarConfig(C);
  if (errores.length) throw new Error("Revisa static/config.js:\n  - " + errores.join("\n  - "));

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.cpSync(STATIC, DIST, { recursive: true });

  // En Vercel se usa el dominio de producción real si está disponible
  const sitio = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : C.sitio;
  fs.writeFileSync(path.join(DIST, "seminario.ics"), generarICS({ ...C, sitio }));

  const html = path.join(DIST, "index.html");
  const reemplazos = {
    "{{SITIO}}": sitio,
    "{{EVENTO}}": C.evento,
    "{{DESCRIPCION}}": `Invitación cifrada · ${describirFecha(C)}. Desbloquéala con visión artificial.`,
  };
  let contenido = fs.readFileSync(html, "utf8");
  for (const [k, v] of Object.entries(reemplazos)) contenido = contenido.replaceAll(k, escaparAtributo(v));
  fs.writeFileSync(html, contenido);

  if (css) {
    const r = spawnSync("npx", ["tailwindcss", "-i", "src/input.css", "-o", "dist/output.css", "--minify"], {
      cwd: RAIZ, stdio: "inherit", shell: process.platform === "win32",
    });
    if (r.status !== 0) throw new Error("Falló la compilación de Tailwind");
  }

  // Verificación del resultado
  const faltan = ["index.html", "app.js", "config.js", "invitacion-core.js", "icons.js", "seminario.ics", "invitados.json"]
    .filter((f) => !fs.existsSync(path.join(DIST, f)));
  if (faltan.length) throw new Error(`Faltan archivos en dist/: ${faltan.join(", ")}`);
  if (/\{\{[A-Z]+\}\}/.test(contenido)) throw new Error("Quedaron marcadores {{...}} sin reemplazar en index.html");

  console.log(`✓ dist/ listo en ${Date.now() - t0} ms`);
}

// Solo se ejecuta si se llama directamente (no cuando lo importan las pruebas)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { construir(); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }

  if (process.argv.includes("--watch")) {
    let espera;
    const reconstruir = () => {
      clearTimeout(espera);
      espera = setTimeout(() => { try { construir(); } catch (e) { console.error(`✗ ${e.message}`); } }, 150);
    };
    for (const dir of [STATIC, path.join(RAIZ, "src")]) fs.watch(dir, { recursive: true }, reconstruir);
    console.log("Observando cambios en static/ y src/ … (Ctrl+C para salir)");
  }
}

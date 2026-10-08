/**
 * Construye el sitio estático en dist/ (lo que publica Vercel).
 *
 *   npm run build   → genera dist/ una vez
 *   npm run dev     → igual, y lo regenera cada vez que guardas un cambio
 *
 * Pasos:
 *   1. Copia static/ → dist/
 *   2. Lee los datos del evento de static/config.js
 *   3. Genera dist/seminario.ics (calendario de iPhone/Outlook) con esos datos
 *   4. Rellena las etiquetas para compartir (WhatsApp/Facebook) en dist/index.html
 *   5. Compila Tailwind → dist/output.css
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATIC = path.join(RAIZ, "static");
const DIST = path.join(RAIZ, "dist");

function leerConfig() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(STATIC, "config.js"), "utf8"), ctx);
  return ctx.window.CONFIG;
}

const icsTexto = (t = "") =>
  String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

const utc = (fecha, hora, offset) =>
  new Date(`${fecha}T${hora}:00${offset}`).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function generarICS(C) {
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Seminario UMG//Invitacion//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:seminario-${C.fecha}@${new URL(C.sitio).host}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `DTSTART:${utc(C.fecha, C.hora, C.utcOffset)}`,
    `DTEND:${utc(C.fecha, C.horaFin, C.utcOffset)}`,
    `SUMMARY:${icsTexto(C.evento)}`,
    `LOCATION:${icsTexto(`${C.lugar}, ${C.direccion}`)}`,
    ...(C.lat != null && C.lng != null ? [`GEO:${C.lat};${C.lng}`] : []),
    `DESCRIPTION:${icsTexto(`Organiza: ${C.organiza}\n${C.universidad} · ${C.sede}`)}`,
    `URL:${C.sitio}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsTexto(`${C.evento} empieza en 2 horas`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lineas.join("\r\n") + "\r\n"; // el estándar iCalendar exige CRLF
}

function describirFecha(C) {
  const inicio = new Date(`${C.fecha}T${C.hora}:00${C.utcOffset}`);
  const dia = inicio.toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long", timeZone: C.zonaHoraria });
  const hora = inicio.toLocaleTimeString("es-GT", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: C.zonaHoraria });
  return `${dia[0].toUpperCase()}${dia.slice(1)} · ${hora} · ${C.lugar}, ${C.direccion.split(",")[0]}`;
}

function construir() {
  const t0 = Date.now();
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.cpSync(STATIC, DIST, { recursive: true });

  const C = leerConfig();
  // En Vercel se usa el dominio de producción real si está disponible
  const sitio = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : C.sitio;

  fs.writeFileSync(path.join(DIST, "seminario.ics"), generarICS({ ...C, sitio }));

  const html = path.join(DIST, "index.html");
  const reemplazos = {
    "{{SITIO}}": sitio,
    "{{EVENTO}}": C.evento,
    "{{DESCRIPCION}}": `Invitación cifrada · ${describirFecha(C)}. Desbloquéala con visión artificial.`,
  };
  let contenido = fs.readFileSync(html, "utf8");
  for (const [k, v] of Object.entries(reemplazos)) contenido = contenido.replaceAll(k, v.replace(/"/g, "&quot;"));
  fs.writeFileSync(html, contenido);

  if (!process.env.SKIP_CSS) {
    const r = spawnSync("npx", ["tailwindcss", "-i", "src/input.css", "-o", "dist/output.css", "--minify"], {
      cwd: RAIZ, stdio: "inherit", shell: process.platform === "win32",
    });
    if (r.status !== 0) throw new Error("Falló la compilación de Tailwind");
  }
  console.log(`✓ dist/ listo en ${Date.now() - t0} ms`);
}

construir();

if (process.argv.includes("--watch")) {
  let espera;
  const reconstruir = () => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      try { construir(); } catch (e) { console.error(e.message); }
    }, 150);
  };
  for (const dir of [STATIC, path.join(RAIZ, "src")]) fs.watch(dir, { recursive: true }, reconstruir);
  console.log("Observando cambios en static/ y src/ … (Ctrl+C para salir)");
}

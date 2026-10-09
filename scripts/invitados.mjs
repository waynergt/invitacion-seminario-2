/**
 * Genera los enlaces personales de cada invitado.
 *
 *   npm run invitados
 *
 * 1. Lee invitados/invitados.csv  (columnas "nombre" y "mesa" (opcional); la columna "codigo" se llena sola)
 * 2. A quien no tenga código le crea uno aleatorio (criptográficamente seguro) y lo guarda
 *    en el mismo CSV, así los enlaces no cambian aunque vuelvas a correr el script.
 * 3. Escribe static/invitados.json: la lista CIFRADA (AES-256-GCM, ver static/invitacion-core.js).
 *    Cada nombre solo se puede descifrar con el código de su propio enlace.
 * 4. Escribe invitados/enlaces.csv con el enlace y un mensaje listo para WhatsApp.
 *
 * La carpeta invitados/ NO se sube a git (tiene los nombres y códigos en claro).
 * Para quitarle el acceso a alguien, borra su fila y vuelve a correr el script.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import "../static/invitacion-core.js";
import { leerConfig, RAIZ } from "./lib/config.mjs";
import { filaCSV, parsearCSV } from "./lib/csv.mjs";

const { Invitacion } = globalThis;
const CARPETA = path.join(RAIZ, "invitados");
const CSV = path.join(CARPETA, "invitados.csv");
const EJEMPLO = path.join(CARPETA, "invitados.ejemplo.csv");
const SALIDA_JSON = path.join(RAIZ, "static", "invitados.json");
const SALIDA_ENLACES = path.join(CARPETA, "enlaces.csv");

/** Convierte el CSV en filas {nombre, mesa, codigo} validadas. Lanza error con el número de fila si algo está mal. */
export function leerInvitados(texto) {
  const { cabecera, filas } = parsearCSV(texto);
  const iNombre = cabecera.indexOf("nombre"), iCodigo = cabecera.indexOf("codigo"), iMesa = cabecera.indexOf("mesa");
  if (iNombre < 0) throw new Error('El CSV necesita una columna llamada "nombre"');
  const errores = [];
  const invitados = [];
  filas.forEach((c, i) => {
    const crudo = c[iNombre] ?? "";
    if (!crudo.trim()) return; // filas vacías se ignoran
    let nombre, mesa;
    try { nombre = Invitacion.validarNombre(crudo); } catch {
      errores.push(`fila ${i + 2}: nombre vacío o de más de ${Invitacion.MAX_NOMBRE} caracteres`);
    }
    try { mesa = Invitacion.validarMesa(iMesa >= 0 ? c[iMesa] : null); } catch {
      errores.push(`fila ${i + 2}: la mesa no puede tener más de ${Invitacion.MAX_MESA} caracteres`);
    }
    if (nombre) invitados.push({ nombre, mesa: mesa ?? null, codigo: Invitacion.normalizarCodigo(iCodigo >= 0 ? c[iCodigo] : "") });
  });
  if (errores.length) throw new Error("Revisa invitados.csv:\n  - " + errores.join("\n  - "));
  return invitados;
}

/** Asigna código a quien no tenga uno válido, sin repetir. */
export function asignarCodigos(invitados, generar = Invitacion.generarCodigo) {
  const usados = new Set();
  for (const f of invitados) {
    if (!Invitacion.codigoValido(f.codigo) || usados.has(f.codigo)) {
      do f.codigo = generar(); while (usados.has(f.codigo));
    }
    usados.add(f.codigo);
  }
  return invitados;
}

/** Lista cifrada, ordenada por id para no revelar el orden original. */
export async function construirLista(invitados) {
  const entradas = [];
  for (const f of invitados) entradas.push([await Invitacion.idDe(f.codigo), await Invitacion.cifrar(f.codigo, f.nombre, { mesa: f.mesa })]);
  entradas.sort(([a], [b]) => a.localeCompare(b));
  return { v: 1, e: Object.fromEntries(entradas) };
}

// "Ing. María José López" → "Ing. María"; "Brayan Corado" → "Brayan"
export const saludo = (nombre) => {
  const p = nombre.split(/\s+/);
  return /^(ing|lic|licda|dr|dra|arq|msc|mba|prof|profa|sr|sra|srta|don|doña)\.?$/i.test(p[0]) ? p.slice(0, 2).join(" ") : p[0];
};

async function main() {
  const C = leerConfig();
  if (!fs.existsSync(CSV)) {
    fs.mkdirSync(CARPETA, { recursive: true });
    fs.copyFileSync(EJEMPLO, CSV);
    console.log("Creé invitados/invitados.csv a partir del ejemplo. Escribe ahí los nombres y vuelve a correr: npm run invitados");
  }

  const invitados = asignarCodigos(leerInvitados(fs.readFileSync(CSV, "utf8")));
  const repetidos = invitados.map((f) => f.nombre.toLowerCase()).filter((n, i, a) => a.indexOf(n) !== i);
  if (repetidos.length) console.warn(`⚠ Nombres repetidos (cada uno tendrá su propio enlace): ${[...new Set(repetidos)].join(", ")}`);

  // Guarda los códigos en el CSV para que los enlaces sean siempre los mismos
  fs.writeFileSync(CSV, "\uFEFFnombre,mesa,codigo\n" + invitados.map((f) => filaCSV([f.nombre, f.mesa ?? "", f.codigo])).join("\n") + "\n");
  fs.writeFileSync(SALIDA_JSON, JSON.stringify(await construirLista(invitados)) + "\n");

  const enlace = (codigo) => `${C.sitio}/#${codigo}`;
  const mensaje = (f) =>
    `Hola ${saludo(f.nombre)} 👋 Tienes una invitación cifrada al ${C.evento}. Solo tú puedes desbloquearla: ${enlace(f.codigo)}`;
  fs.writeFileSync(SALIDA_ENLACES, "\uFEFFnombre,mesa,enlace,mensaje\n" +
    invitados.map((f) => filaCSV([f.nombre, f.mesa ?? "", enlace(f.codigo), mensaje(f)])).join("\n") + "\n");

  console.log(`✓ ${invitados.length} invitados`);
  const sinMesa = invitados.filter((f) => !f.mesa).length;
  for (const f of invitados) console.log(`  ${f.nombre.padEnd(32)} ${(f.mesa ? `Mesa ${f.mesa}` : "—").padEnd(10)} ${enlace(f.codigo)}`);
  if (sinMesa) console.log(`\nℹ ${sinMesa} invitado(s) sin mesa: su pase no mostrará la mesa.`);
  console.log("\n→ static/invitados.json (cifrado, este sí se sube a git)");
  console.log("→ invitados/enlaces.csv  (enlaces y mensajes para enviar, NO se sube a git)");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
}

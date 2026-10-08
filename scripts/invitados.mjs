/**
 * Genera los enlaces personales de cada invitado.
 *
 *   npm run invitados
 *
 * 1. Lee invitados/invitados.csv  (columna "nombre"; la columna "codigo" se llena sola)
 * 2. A quien no tenga código le crea uno aleatorio y lo guarda en el mismo CSV,
 *    así los enlaces no cambian aunque vuelvas a correr el script.
 * 3. Escribe static/invitados.json: la lista CIFRADA (AES-256-GCM). Cada nombre solo
 *    se puede descifrar con el código de su propio enlace; sin él, el archivo no revela nada.
 * 4. Escribe invitados/enlaces.csv con el enlace y un mensaje listo para WhatsApp.
 *
 * La carpeta invitados/ NO se sube a git (tiene los nombres y códigos en claro).
 * Para quitarle el acceso a alguien, borra su fila y vuelve a correr el script.
 */
import { webcrypto as crypto } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CARPETA = path.join(RAIZ, "invitados");
const CSV = path.join(CARPETA, "invitados.csv");
const EJEMPLO = path.join(CARPETA, "invitados.ejemplo.csv");
const SALIDA_JSON = path.join(RAIZ, "static", "invitados.json");
const SALIDA_ENLACES = path.join(CARPETA, "enlaces.csv");

// Sin 0/O, 1/I/L ni U para que nadie se confunda si tiene que dictarlo
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const LARGO = 12; // 30^12 ≈ 5 × 10^17 combinaciones: imposible adivinar uno válido

const C = (() => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "static", "config.js"), "utf8"), ctx);
  return ctx.window.CONFIG;
})();

/* ---------- mismo algoritmo que static/app.js ---------- */
const utf8 = (s) => new TextEncoder().encode(s);
const sha256 = async (s) => new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(s)));
const hex = (b) => Buffer.from(b).toString("hex");
const b64url = (b) => Buffer.from(b).toString("base64url");
const normalizar = (c) => String(c || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
const idDe = async (codigo) => hex(await sha256(`umg-invitado-id:${codigo}`)).slice(0, 32);

async function cifrar(codigo, datos) {
  const key = await crypto.subtle.importKey("raw", await sha256(`umg-invitado-key:${codigo}`), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, utf8(JSON.stringify(datos)));
  return { iv: b64url(iv), ct: b64url(new Uint8Array(ct)) };
}

function nuevoCodigo(usados) {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(LARGO * 2));
    let c = "";
    for (const b of bytes) {
      if (b < 240) c += ALFABETO[b % 30]; // 240 = 8 × 30, evita sesgo
      if (c.length === LARGO) break;
    }
    if (c.length === LARGO && !usados.has(c)) return c;
  }
}

/* ---------- CSV sencillo (acepta , o ; como lo guarda Excel) ---------- */
function leerCSV(texto) {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const sep = (lineas[0] || "").includes(";") ? ";" : ",";
  const celdas = (l) => {
    const out = [];
    let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) {
        if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const cab = celdas(lineas[0]).map((h) => h.toLowerCase());
  const iNombre = cab.indexOf("nombre"), iCodigo = cab.indexOf("codigo");
  if (iNombre < 0) throw new Error('El CSV necesita una columna llamada "nombre"');
  return lineas.slice(1).map((l) => {
    const c = celdas(l);
    return { nombre: c[iNombre] || "", codigo: normalizar(iCodigo >= 0 ? c[iCodigo] : "") };
  }).filter((f) => f.nombre);
}

const campo = (s) => (/[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/* ---------- principal ---------- */
if (!fs.existsSync(CSV)) {
  fs.mkdirSync(CARPETA, { recursive: true });
  fs.copyFileSync(EJEMPLO, CSV);
  console.log("Creé invitados/invitados.csv a partir del ejemplo. Escribe ahí los nombres y vuelve a correr: npm run invitados");
}

const filas = leerCSV(fs.readFileSync(CSV, "utf8"));
const usados = new Set(filas.map((f) => f.codigo).filter(Boolean));
for (const f of filas) {
  if (f.codigo.length !== LARGO) {
    f.codigo = nuevoCodigo(usados);
    usados.add(f.codigo);
  }
}

// Guarda los códigos en el CSV para que los enlaces sean siempre los mismos
fs.writeFileSync(CSV, "﻿nombre,codigo\n" + filas.map((f) => `${campo(f.nombre)},${f.codigo}`).join("\n") + "\n");

// Lista cifrada (ordenada por id para no revelar el orden de la lista)
const entradas = [];
for (const f of filas) entradas.push([await idDe(f.codigo), await cifrar(f.codigo, { n: f.nombre })]);
entradas.sort(([a], [b]) => a.localeCompare(b));
fs.writeFileSync(SALIDA_JSON, JSON.stringify({ v: 1, e: Object.fromEntries(entradas) }) + "\n");

// Enlaces + mensaje para WhatsApp
const enlace = (codigo) => `${C.sitio}/#${codigo}`;
// "Ing. María José López" → "Ing. María"; "Brayan Corado" → "Brayan"
const saludo = (nombre) => {
  const p = nombre.split(/\s+/);
  return /^(ing|lic|licda|dr|dra|arq|msc|mba|prof|profa|sr|sra|srta|don|doña)\.?$/i.test(p[0]) ? p.slice(0, 2).join(" ") : p[0];
};
const mensaje = (f) =>
  `Hola ${saludo(f.nombre)} 👋 Tienes una invitación cifrada al ${C.evento}. ` +
  `Solo tú puedes desbloquearla: ${enlace(f.codigo)}`;
fs.writeFileSync(SALIDA_ENLACES, "﻿nombre,enlace,mensaje\n" +
  filas.map((f) => [f.nombre, enlace(f.codigo), mensaje(f)].map(campo).join(",")).join("\n") + "\n");

console.log(`✓ ${filas.length} invitados`);
for (const f of filas) console.log(`  ${f.nombre.padEnd(32)} ${enlace(f.codigo)}`);
console.log("\n→ static/invitados.json (cifrado, este sí se sube a git)");
console.log("→ invitados/enlaces.csv  (enlaces y mensajes para enviar, NO se sube a git)");

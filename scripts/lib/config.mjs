/** Lee static/config.js y valida que los datos del evento tengan sentido (falla rápido en el build). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function leerConfig(archivo = path.join(RAIZ, "static", "config.js")) {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(archivo, "utf8"), ctx, { timeout: 1000 });
  return ctx.window.CONFIG;
}

/** Devuelve la lista de errores (vacía si todo está bien). */
export function validarConfig(C) {
  const err = [];
  const texto = (k) => { if (typeof C?.[k] !== "string" || !C[k].trim()) err.push(`"${k}" debe ser un texto no vacío`); };
  if (!C || typeof C !== "object") return ["config.js no define window.CONFIG"];

  ["evento", "lugar", "direccion", "organiza", "universidad", "sede", "zonaHoraria"].forEach(texto);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(C.fecha ?? "") || Number.isNaN(Date.parse(C.fecha))) err.push('"fecha" debe tener el formato AAAA-MM-DD');
  for (const k of ["hora", "horaFin"]) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(C[k] ?? "")) err.push(`"${k}" debe tener el formato HH:MM (24 h)`);
  if (!/^[+-]\d{2}:\d{2}$/.test(C.utcOffset ?? "")) err.push('"utcOffset" debe tener el formato -06:00');
  if (!err.length && C.horaFin <= C.hora) err.push('"horaFin" debe ser después de "hora"');
  try { new Intl.DateTimeFormat("es", { timeZone: C.zonaHoraria }); } catch { err.push('"zonaHoraria" no es válida'); }

  if (C.lat != null && !(typeof C.lat === "number" && C.lat >= -90 && C.lat <= 90)) err.push('"lat" debe estar entre -90 y 90');
  if (C.lng != null && !(typeof C.lng === "number" && C.lng >= -180 && C.lng <= 180)) err.push('"lng" debe estar entre -180 y 180');

  try { if (new URL(C.sitio).protocol !== "https:") err.push('"sitio" debe usar https://'); } catch { err.push('"sitio" debe ser una URL válida'); }

  const rango = (k, min, max, entero = false) => {
    const v = C[k];
    if (typeof v !== "number" || !(v > min && v <= max) || (entero && !Number.isInteger(v))) err.push(`"${k}" debe ser un número entre ${min} (excluido) y ${max}`);
  };
  rango("umbral", 0, 1);
  rango("intervalo", 50, 10000, true);
  rango("confirmaciones", 0, 20, true);
  rango("tiempoAlternativo", 0, 600000, true);
  return err;
}

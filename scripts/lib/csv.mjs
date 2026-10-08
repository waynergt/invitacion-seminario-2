/** CSV sencillo: acepta "," o ";" (como lo guarda Excel en español), comillas y BOM. */

export function parsearCSV(texto) {
  const lineas = String(texto).replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lineas.length) return { cabecera: [], filas: [] };
  const sep = lineas[0].includes(";") ? ";" : ",";
  const celdas = (l) => {
    const out = [];
    let cur = "", enComillas = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (enComillas) {
        if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') enComillas = false;
        else cur += ch;
      } else if (ch === '"') enComillas = true;
      else if (ch === sep) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  return {
    cabecera: celdas(lineas[0]).map((h) => h.toLowerCase()),
    filas: lineas.slice(1).map(celdas),
  };
}

/**
 * Escapa un valor para escribirlo en CSV.
 * Incluye protección contra "CSV/Formula injection" (OWASP): si un valor empieza con
 * = + - @ o tabulador, Excel lo ejecutaría como fórmula al abrir el archivo;
 * se antepone un apóstrofo para que se muestre como texto.
 */
export function campoCSV(valor) {
  let s = String(valor ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const filaCSV = (valores) => valores.map(campoCSV).join(",");

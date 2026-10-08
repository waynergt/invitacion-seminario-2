// Pruebas de los scripts: CSV, calendario .ics, configuración y generación de la lista.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../static/invitacion-core.js";
import { leerConfig, validarConfig } from "../scripts/lib/config.mjs";
import { campoCSV, parsearCSV } from "../scripts/lib/csv.mjs";
import { aUTC, generarICS, icsTexto } from "../scripts/lib/ics.mjs";
import { asignarCodigos, construirLista, leerInvitados, saludo } from "../scripts/invitados.mjs";

const I = globalThis.Invitacion;

describe("CSV", () => {
  it("lee CSV con coma, con punto y coma (Excel en español) y con BOM", () => {
    for (const t of ["nombre,codigo\nAna,\n", "﻿nombre;codigo\r\nAna;\r\n"]) {
      assert.deepEqual(parsearCSV(t).filas, [["Ana", ""]]);
    }
  });
  it("respeta comillas y comas dentro del nombre", () => {
    assert.deepEqual(parsearCSV('nombre\n"López, Ana ""la Ing."""\n').filas, [['López, Ana "la Ing."']]);
  });
  it("protege contra inyección de fórmulas al abrir en Excel (OWASP CSV Injection)", () => {
    assert.equal(campoCSV("=HYPERLINK(\"http://malo\")"), "\"'=HYPERLINK(\"\"http://malo\"\")\"");
    for (const v of ["+1", "-1", "@SUM(A1)"]) assert.ok(campoCSV(v).startsWith("'"), v);
    assert.equal(campoCSV("Ana"), "Ana");
  });
});

describe("Lista de invitados", () => {
  it("exige la columna nombre", () => {
    assert.throws(() => leerInvitados("persona\nAna\n"), /columna llamada "nombre"/);
  });
  it("ignora filas vacías y valida el largo del nombre", () => {
    assert.equal(leerInvitados("nombre\nAna\n\n,\n").length, 1);
    assert.throws(() => leerInvitados(`nombre\n${"x".repeat(81)}\n`), /fila 2/);
  });
  it("conserva los códigos existentes y asigna nuevos sin repetir", () => {
    const filas = asignarCodigos(leerInvitados("nombre,codigo\nAna,K7Q29XMBA4TR\nBeto,\nCarla,K7Q29XMBA4TR\nDani,MALO\n"));
    assert.equal(filas[0].codigo, "K7Q29XMBA4TR");
    assert.equal(new Set(filas.map((f) => f.codigo)).size, 4, "códigos repetidos");
    assert.ok(filas.every((f) => I.codigoValido(f.codigo)));
  });
  it("la lista generada abre con cada código y no contiene nombres en claro", async () => {
    const filas = asignarCodigos(leerInvitados("nombre\nByron Flores\nIng. María López\n"));
    const lista = await construirLista(filas);
    const json = JSON.stringify(lista);
    assert.ok(!/Byron|María|Flores|López/.test(json));
    for (const f of filas) assert.equal((await I.abrir(f.codigo, lista)).nombre, f.nombre);
  });
  it("saluda con el título y el primer nombre", () => {
    assert.equal(saludo("Ing. María José López"), "Ing. María");
    assert.equal(saludo("Brayan Corado"), "Brayan");
  });
});

describe("Calendario (.ics)", () => {
  const C = leerConfig();
  it("convierte la hora de Guatemala a UTC (18:00 −06:00 → 00:00 Z del día siguiente)", () => {
    assert.equal(aUTC("2026-10-24", "18:00", "-06:00"), "20261025T000000Z");
  });
  it("escapa comas, punto y coma y saltos de línea (RFC 5545)", () => {
    assert.equal(icsTexto("a,b;c\nd\\e"), "a\\,b\\;c\\nd\\\\e");
  });
  it("usa saltos de línea CRLF y contiene los campos obligatorios", () => {
    const ics = generarICS(C, new Date("2026-01-01T00:00:00Z"));
    assert.ok(ics.endsWith("\r\n") && !/[^\r]\n/.test(ics));
    for (const k of ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:", "DTSTAMP:20260101T000000Z", "DTSTART:", "DTEND:", "SUMMARY:", "END:VCALENDAR"]) {
      assert.ok(ics.includes(k), k);
    }
  });
});

describe("Configuración del evento (static/config.js)", () => {
  it("la configuración actual es válida", () => {
    assert.deepEqual(validarConfig(leerConfig()), []);
  });
  it("detecta errores comunes", () => {
    const base = leerConfig();
    const casos = {
      fecha: "24/10/2026", hora: "6pm", horaFin: "17:00", umbral: 1.5, sitio: "http://sitio.com", lat: 200, zonaHoraria: "Marte/Base",
    };
    for (const [k, v] of Object.entries(casos)) {
      assert.ok(validarConfig({ ...base, [k]: v }).length > 0, `no detectó error en "${k}" = ${v}`);
    }
  });
});

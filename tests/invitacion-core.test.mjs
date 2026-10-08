// Pruebas unitarias del núcleo criptográfico (el mismo archivo que usa el navegador).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../static/invitacion-core.js";

const I = globalThis.Invitacion;
const CODIGO = "K7Q29XMBA4TR";

describe("Códigos de invitación", () => {
  it("genera códigos de 12 caracteres con el alfabeto permitido", () => {
    for (let i = 0; i < 500; i++) {
      const c = I.generarCodigo();
      assert.equal(c.length, I.LARGO);
      assert.ok(I.codigoValido(c), `código inválido: ${c}`);
    }
  });

  it("no usa caracteres confusos (0, O, 1, I, L, U)", () => {
    for (const ch of "0O1ILU") assert.ok(!I.ALFABETO.includes(ch), ch);
  });

  it("no repite códigos en 10 000 generaciones", () => {
    const vistos = new Set(Array.from({ length: 10000 }, I.generarCodigo));
    assert.equal(vistos.size, 10000);
  });

  it("acepta el código del enlace en minúsculas, con guiones o espacios", () => {
    assert.equal(I.codigoDesdeHash("#k7q2-9xmb a4tr"), CODIGO);
    assert.equal(I.codigoDesdeHash("#K7Q2%209XMBA4TR"), CODIGO);
  });

  it("rechaza enlaces sin código", () => {
    for (const h of ["", "#", null, undefined]) {
      assert.throws(() => I.codigoDesdeHash(h), { tipo: "SIN_CODIGO" });
    }
  });

  it("rechaza códigos de largo incorrecto o con caracteres fuera del alfabeto", () => {
    for (const h of ["#ABC", "#K7Q29XMBA4TRX", "#K7Q29XMBA4T0", "#<script>alert(1)</script>", "#%E0%A4%A"]) {
      assert.throws(() => I.codigoDesdeHash(h), { tipo: "CODIGO_INVALIDO" }, h);
    }
  });
});

describe("Cifrado AES-256-GCM", () => {
  it("cifra y descifra el nombre (ida y vuelta)", async () => {
    const entrada = await I.cifrar(CODIGO, "Ing. María José López");
    assert.equal(await I.descifrar(CODIGO, entrada), "Ing. María José López");
  });

  it("el archivo cifrado no contiene el nombre en claro", async () => {
    const entrada = await I.cifrar(CODIGO, "Byron Flores");
    assert.ok(!JSON.stringify(entrada).includes("Byron"));
  });

  it("con otro código NO se puede descifrar", async () => {
    const entrada = await I.cifrar(CODIGO, "Byron Flores");
    await assert.rejects(I.descifrar("ABCDEFGHJKMN", entrada), { tipo: "DATOS_ALTERADOS" });
  });

  it("si alguien altera el texto cifrado, se detecta (no muestra un nombre falso)", async () => {
    const entrada = await I.cifrar(CODIGO, "Byron Flores");
    const bytes = I.desdeB64url(entrada.ct);
    bytes[0] ^= 1;
    await assert.rejects(I.descifrar(CODIGO, { ...entrada, ct: I.aB64url(bytes) }), { tipo: "DATOS_ALTERADOS" });
  });

  it("es determinista: el mismo nombre con el mismo código da el mismo resultado", async () => {
    assert.deepEqual(await I.cifrar(CODIGO, "Ana"), await I.cifrar(CODIGO, "Ana"));
  });

  it("nombres distintos con el mismo código usan IV distintos (no se reutiliza IV)", async () => {
    const a = await I.cifrar(CODIGO, "Ana"), b = await I.cifrar(CODIGO, "Beto");
    assert.notEqual(a.iv, b.iv);
  });

  it("el id es determinista y no revela el código", async () => {
    const id = await I.idDe(CODIGO);
    assert.match(id, /^[0-9a-f]{32}$/);
    assert.equal(id, await I.idDe(CODIGO));
    assert.ok(!id.toUpperCase().includes(CODIGO));
  });
});

describe("Validación de nombres", () => {
  it("limpia espacios y caracteres de control", () => {
    assert.equal(I.validarNombre("  Ana \t  María\u0000 "), "Ana María");
  });
  it("rechaza nombres vacíos, de más de 80 caracteres o que no son texto", () => {
    for (const n of ["", "   ", "x".repeat(81), 42, null, {}]) assert.throws(() => I.validarNombre(n), { tipo: "DATOS_ALTERADOS" });
  });
  it("el nombre se trata como texto, no como HTML (se guarda tal cual, el navegador usa textContent)", async () => {
    const n = '<img src=x onerror="alert(1)">';
    assert.equal(await I.descifrar(CODIGO, await I.cifrar(CODIGO, n)), n);
  });
});

describe("Lista de invitados (invitados.json)", () => {
  it("abre la invitación correcta dentro de una lista", async () => {
    const otro = "ABCDEFGHJKMN";
    const lista = { v: 1, e: {
      [await I.idDe(CODIGO)]: await I.cifrar(CODIGO, "Ana"),
      [await I.idDe(otro)]: await I.cifrar(otro, "Beto"),
    } };
    assert.equal((await I.abrir(CODIGO, lista)).nombre, "Ana");
    assert.equal((await I.abrir(otro, lista)).nombre, "Beto");
  });

  it("un código que no está en la lista se rechaza", async () => {
    await assert.rejects(I.abrir(CODIGO, { v: 1, e: {} }), { tipo: "NO_REGISTRADO" });
  });

  it("no se deja engañar por propiedades heredadas del prototipo", async () => {
    const heredada = Object.create({ [await I.idDe(CODIGO)]: await I.cifrar(CODIGO, "Intruso") });
    await assert.rejects(I.abrir(CODIGO, { v: 1, e: heredada }), { tipo: "NO_REGISTRADO" });
  });

  it("rechaza listas con formato inesperado", () => {
    for (const l of [null, {}, { v: 2, e: {} }, { v: 1, e: [] }, { v: 1, e: { malo: { iv: "a", ct: "b" } } },
      { v: 1, e: { ["a".repeat(32)]: { iv: 1, ct: "b" } } }]) {
      assert.throws(() => I.validarLista(l), { tipo: "LISTA_INVALIDA" });
    }
  });
});

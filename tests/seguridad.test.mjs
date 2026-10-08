// Pruebas de seguridad estáticas: revisan el código y la configuración antes de publicar.
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { RAIZ } from "../scripts/lib/config.mjs";

const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");
const vercel = JSON.parse(leer("vercel.json"));
const cabeceras = Object.fromEntries(vercel.headers.find((h) => h.source === "/(.*)").headers.map((h) => [h.key, h.value]));

describe("Cabeceras HTTP de seguridad (vercel.json)", () => {
  for (const k of ["Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy",
    "Strict-Transport-Security", "Permissions-Policy", "Cross-Origin-Opener-Policy"]) {
    it(`define ${k}`, () => assert.ok(cabeceras[k]));
  }

  const csp = cabeceras["Content-Security-Policy"] ?? "";
  it("la CSP no permite scripts inline ni eval de JavaScript", () => {
    assert.ok(!csp.includes("'unsafe-inline'"));
    assert.ok(!/'unsafe-eval'/.test(csp));
  });
  it("la CSP bloquea iframes, plugins, <base> y formularios", () => {
    for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.includes(d), d);
  });
  it("la CSP solo permite la versión exacta de ONNX Runtime en el CDN", () => {
    const externos = csp.match(/https:\/\/[^\s;]+/g);
    assert.ok(externos.every((u) => u.startsWith("https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/") || u.startsWith("https://fonts.")), externos.join(" "));
  });
  it("la cámara solo se permite en el propio sitio; micrófono y ubicación bloqueados", () => {
    assert.match(cabeceras["Permissions-Policy"], /camera=\(self\)/);
    assert.match(cabeceras["Permissions-Policy"], /microphone=\(\)/);
    assert.match(cabeceras["Permissions-Policy"], /geolocation=\(\)/);
  });
  it("las dependencias se instalan con npm ci (versiones exactas del package-lock)", () => {
    assert.equal(vercel.installCommand, "npm ci");
  });
});

describe("HTML y JavaScript", () => {
  const html = leer("static/index.html");
  it("los scripts externos tienen integridad (SRI) y crossorigin", () => {
    const externos = [...html.matchAll(/<script[^>]+src="https:[^>]+>/g)].map((m) => m[0]);
    assert.ok(externos.length > 0);
    for (const s of externos) {
      assert.match(s, /integrity="sha(256|384|512)-[A-Za-z0-9+/=]+"/, s);
      assert.match(s, /crossorigin="anonymous"/, s);
    }
  });
  it("las versiones externas están fijadas (sin @latest)", () => {
    assert.ok(!/@latest/.test(html));
  });
  it("no hay scripts inline ni manejadores on*= en el HTML (compatibles con la CSP)", () => {
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), "script inline");
    assert.ok(!/\son[a-z]+\s*=/.test(html), "atributo on*=");
  });
  for (const f of ["static/app.js", "static/invitacion-core.js", "static/config.js"]) {
    it(`${f}: sin eval, new Function, document.write ni innerHTML`, () => {
      const codigo = leer(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""); // sin comentarios
      for (const p of [/\beval\s*\(/, /new Function\s*\(/, /document\.write/, /\.innerHTML\s*=/, /insertAdjacentHTML/]) {
        assert.ok(!p.test(codigo), `${p} en ${f}`);
      }
    });
  }
  it("los enlaces que abren otra pestaña usan noopener", () => {
    assert.ok(!/target\s*=\s*"_blank"/.test(leer("static/app.js")) || /noopener/.test(leer("static/app.js")));
  });
});

describe("Datos de invitados", () => {
  it("la carpeta invitados/ (nombres y códigos en claro) está ignorada por git", () => {
    const gi = leer(".gitignore");
    assert.match(gi, /^invitados\/\*$/m);
  });
  it("git no tiene archivos privados de invitados", () => {
    let archivos;
    try { archivos = execSync("git ls-files invitados", { cwd: RAIZ, encoding: "utf8" }).trim().split("\n").filter(Boolean); }
    catch { return; } // fuera de un repositorio git (p. ej. un zip)
    assert.deepEqual(archivos.filter((f) => f !== "invitados/invitados.ejemplo.csv"), []);
  });
  it("static/invitados.json tiene el formato cifrado esperado", async () => {
    await import("../static/invitacion-core.js");
    const lista = JSON.parse(leer("static/invitados.json"));
    assert.doesNotThrow(() => globalThis.Invitacion.validarLista(lista));
  });
});

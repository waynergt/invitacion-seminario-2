// Pruebas de regresión de la interfaz (errores visuales que ya se corrigieron).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { RAIZ } from "../scripts/lib/config.mjs";

const html = fs.readFileSync(path.join(RAIZ, "static", "index.html"), "utf8");
const clasesDe = (id) => (html.match(new RegExp(`id="${id}"[^>]*class="([^"]*)"`)) || [])[1] || "";

describe("Pantalla de inicio", () => {
  // Bug: el nombre cifrado cambia de símbolos 10 veces por segundo; con una fuente proporcional
  // a veces ocupaba 1 línea y a veces 2, y el botón "Iniciar escaneo neuronal" saltaba.
  it("el nombre cifrado tiene altura fija y fuente monoespaciada (el botón no se mueve)", () => {
    const c = clasesDe("dest-nombre");
    assert.match(c, /\bh-\[/, "debe tener altura fija");
    assert.match(c, /\boverflow-hidden\b/);
    assert.match(c, /\bfont-mono\b/, "debe usar fuente monoespaciada");
    assert.match(c, /\bbreak-all\b/, "debe cortar por carácter, no por palabra");
  });
  it("el texto cifrado de fondo también tiene altura fija", () => {
    assert.match(clasesDe("cipher"), /\bh-\[/);
  });
});

/**
 * Núcleo criptográfico de las invitaciones personales.
 *
 * Este MISMO archivo lo usan:
 *   - el navegador (static/index.html → descifra el nombre del invitado),
 *   - scripts/invitados.mjs (cifra la lista),
 *   - las pruebas automáticas (tests/).
 * Así no hay dos implementaciones que se puedan desincronizar.
 *
 * Esquema:
 *   código (12 caracteres, ~59 bits de entropía, va en el #fragmento del enlace)
 *     ├─ id    = SHA-256("umg-invitado-id:"  + código)  → primeros 128 bits en hex (para buscar la entrada)
 *     └─ llave = SHA-256("umg-invitado-key:" + código)  → llave AES-256-GCM
 *   iv = SHA-256("umg-invitado-iv:" + código + ":" + nombre) → primeros 96 bits
 *        (determinista: si el nombre no cambia, el archivo cifrado tampoco; si cambia, el iv cambia,
 *         así nunca se repite iv con texto distinto bajo la misma llave)
 *   texto cifrado = AES-256-GCM(llave, iv, JSON {"n": nombre})  — GCM autentica: si alguien altera
 *        el archivo, el descifrado falla en lugar de mostrar un nombre falso.
 *
 * Al no usar import/export, funciona como <script> clásico y como módulo de Node (18+ tiene WebCrypto).
 */
(function (raiz) {
  "use strict";

  const ALFABETO = "23456789ABCDEFGHJKMNPQRSTVWXYZ"; // sin 0/O, 1/I/L ni U
  const LARGO = 12;
  const MAX_NOMBRE = 80;
  const subtle = () => {
    if (!raiz.crypto?.subtle) throw new ErrorInvitacion("SIN_CRYPTO", "Se requiere HTTPS para descifrar la invitación");
    return raiz.crypto.subtle;
  };

  class ErrorInvitacion extends Error {
    constructor(tipo, mensaje) {
      super(mensaje);
      this.name = "ErrorInvitacion";
      this.tipo = tipo; // SIN_CODIGO | CODIGO_INVALIDO | NO_REGISTRADO | LISTA_INVALIDA | DATOS_ALTERADOS | RED | SIN_CRYPTO
    }
  }

  const utf8 = (s) => new TextEncoder().encode(s);
  const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const aB64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  function desdeB64url(s) {
    if (typeof s !== "string" || !/^[A-Za-z0-9_-]+$/.test(s)) throw new ErrorInvitacion("LISTA_INVALIDA", "Base64 inválido");
    return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  }
  const sha256 = async (s) => new Uint8Array(await subtle().digest("SHA-256", utf8(s)));

  /** Limpia lo que venga en el enlace: mayúsculas, sin espacios ni guiones. */
  const normalizarCodigo = (c) => String(c ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");

  /** Un código es válido solo si tiene el largo exacto y usa el alfabeto permitido. */
  const codigoValido = (c) => c.length === LARGO && [...c].every((ch) => ALFABETO.includes(ch));

  /** Extrae y valida el código del #fragmento de la URL (el fragmento nunca se envía al servidor). */
  function codigoDesdeHash(hash) {
    let crudo = String(hash ?? "").replace(/^#/, "");
    try { crudo = decodeURIComponent(crudo); } catch { /* se valida abajo */ }
    if (!crudo) throw new ErrorInvitacion("SIN_CODIGO", "El enlace no trae código de invitación");
    const codigo = normalizarCodigo(crudo);
    if (!codigoValido(codigo)) throw new ErrorInvitacion("CODIGO_INVALIDO", "El código del enlace no tiene un formato válido");
    return codigo;
  }

  const idDe = async (codigo) => hex(await sha256(`umg-invitado-id:${codigo}`)).slice(0, 32);
  const llaveDe = async (codigo, uso) =>
    subtle().importKey("raw", await sha256(`umg-invitado-key:${codigo}`), "AES-GCM", false, [uso]);

  /** Valida y recorta el nombre: texto, sin caracteres de control, 1 a 80 caracteres. */
  function validarNombre(nombre) {
    if (typeof nombre !== "string") throw new ErrorInvitacion("DATOS_ALTERADOS", "Nombre inválido");
    const limpio = nombre.replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
    if (!limpio || limpio.length > MAX_NOMBRE) throw new ErrorInvitacion("DATOS_ALTERADOS", "Nombre vacío o demasiado largo");
    return limpio;
  }

  async function cifrar(codigo, nombre) {
    nombre = validarNombre(nombre);
    const iv = (await sha256(`umg-invitado-iv:${codigo}:${nombre}`)).slice(0, 12);
    const ct = await subtle().encrypt({ name: "AES-GCM", iv }, await llaveDe(codigo, "encrypt"), utf8(JSON.stringify({ n: nombre })));
    return { iv: aB64url(iv), ct: aB64url(new Uint8Array(ct)) };
  }

  async function descifrar(codigo, entrada) {
    let plano;
    try {
      plano = await subtle().decrypt({ name: "AES-GCM", iv: desdeB64url(entrada.iv) }, await llaveDe(codigo, "decrypt"), desdeB64url(entrada.ct));
    } catch (e) {
      if (e instanceof ErrorInvitacion) throw e;
      throw new ErrorInvitacion("DATOS_ALTERADOS", "No se pudo descifrar (datos alterados o llave incorrecta)");
    }
    let datos;
    try { datos = JSON.parse(new TextDecoder().decode(plano)); } catch {
      throw new ErrorInvitacion("DATOS_ALTERADOS", "Contenido descifrado inválido");
    }
    return validarNombre(datos?.n);
  }

  /** Revisa que invitados.json tenga la forma esperada antes de usarlo. */
  function validarLista(lista) {
    const ok = lista && lista.v === 1 && lista.e && typeof lista.e === "object" && !Array.isArray(lista.e) &&
      Object.entries(lista.e).every(([id, x]) =>
        /^[0-9a-f]{32}$/.test(id) && x && typeof x.iv === "string" && typeof x.ct === "string");
    if (!ok) throw new ErrorInvitacion("LISTA_INVALIDA", "El archivo de invitados no tiene el formato esperado");
    return lista;
  }

  /** Busca y descifra la invitación de un código dentro de la lista. */
  async function abrir(codigo, lista) {
    validarLista(lista);
    const id = await idDe(codigo);
    if (!Object.prototype.hasOwnProperty.call(lista.e, id)) throw new ErrorInvitacion("NO_REGISTRADO", "Código no registrado");
    return { id, nombre: await descifrar(codigo, lista.e[id]) };
  }

  /** Genera un código aleatorio criptográficamente seguro, sin sesgo de módulo. */
  function generarCodigo() {
    let c = "";
    while (c.length < LARGO) {
      for (const b of raiz.crypto.getRandomValues(new Uint8Array(LARGO * 2))) {
        if (b < 240) c += ALFABETO[b % 30]; // 240 = 8 × 30
        if (c.length === LARGO) break;
      }
    }
    return c;
  }

  raiz.Invitacion = Object.freeze({
    ALFABETO, LARGO, MAX_NOMBRE, ErrorInvitacion,
    normalizarCodigo, codigoValido, codigoDesdeHash, validarNombre,
    idDe, cifrar, descifrar, validarLista, abrir, generarCodigo, aB64url, desdeB64url,
  });
})(globalThis);

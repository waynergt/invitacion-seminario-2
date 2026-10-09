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
 *   datos = JSON {"n": nombre, "m": mesa (opcional)}
 *   iv = SHA-256("umg-invitado-iv:" + código + ":" + datos) → primeros 96 bits
 *        (determinista: si los datos no cambian, el archivo cifrado tampoco; si cambian, el iv cambia,
 *         así nunca se repite iv con texto distinto bajo la misma llave)
 *   texto cifrado = AES-256-GCM(llave, iv, datos)  — GCM autentica: si alguien altera
 *        el archivo, el descifrado falla en lugar de mostrar un nombre falso.
 *
 * Al no usar import/export, funciona como <script> clásico y como módulo de Node (18+ tiene WebCrypto).
 */
(function (raiz) {
  "use strict";

  const ALFABETO = "23456789ABCDEFGHJKMNPQRSTVWXYZ"; // sin 0/O, 1/I/L ni U
  const LARGO = 12;
  const MAX_NOMBRE = 80;
  const MAX_MESA = 20;
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

  /** Mesa opcional: vacía → null; si viene, texto de 1 a 20 caracteres (p. ej. "5", "VIP 2"). */
  function validarMesa(mesa) {
    if (mesa == null) return null;
    if (typeof mesa !== "string" && typeof mesa !== "number") throw new ErrorInvitacion("DATOS_ALTERADOS", "Mesa inválida");
    const limpia = String(mesa).replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
    if (!limpia) return null;
    if (limpia.length > MAX_MESA) throw new ErrorInvitacion("DATOS_ALTERADOS", "Mesa demasiado larga");
    return limpia;
  }

  /** Cifra los datos del invitado. `extra.mesa` es opcional. */
  async function cifrar(codigo, nombre, extra = {}) {
    const datos = { n: validarNombre(nombre) };
    const mesa = validarMesa(extra.mesa);
    if (mesa) datos.m = mesa;
    const plano = JSON.stringify(datos);
    const iv = (await sha256(`umg-invitado-iv:${codigo}:${plano}`)).slice(0, 12);
    const ct = await subtle().encrypt({ name: "AES-GCM", iv }, await llaveDe(codigo, "encrypt"), utf8(plano));
    return { iv: aB64url(iv), ct: aB64url(new Uint8Array(ct)) };
  }

  /** Descifra y valida los datos: { nombre, mesa } (mesa es null si no tiene). */
  async function descifrarDatos(codigo, entrada) {
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
    return { nombre: validarNombre(datos?.n), mesa: validarMesa(datos?.m) };
  }

  /** Solo el nombre (compatibilidad). */
  const descifrar = async (codigo, entrada) => (await descifrarDatos(codigo, entrada)).nombre;

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
    return { id, ...(await descifrarDatos(codigo, lista.e[id])) };
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
    ALFABETO, LARGO, MAX_NOMBRE, MAX_MESA, ErrorInvitacion,
    normalizarCodigo, codigoValido, codigoDesdeHash, validarNombre, validarMesa,
    idDe, cifrar, descifrar, descifrarDatos, validarLista, abrir, generarCodigo, aB64url, desdeB64url,
  });
})(globalThis);

/* Los datos del evento están en config.js */
const CONFIG = window.CONFIG;

const $ = (s) => document.querySelector(s);
const GLYPHS = "ABCDEF0123456789#$%&@<>/\\{}[]=+*";
const rnd = (n) => Array.from({ length: n }, () => GLYPHS[(Math.random() * GLYPHS.length) | 0]).join("");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Momento exacto del evento (con la zona horaria de Guatemala, sin importar dónde esté el invitado)
const INICIO = new Date(`${CONFIG.fecha}T${CONFIG.hora}:00${CONFIG.utcOffset}`);
const FIN = new Date(`${CONFIG.fecha}T${CONFIG.horaFin}:00${CONFIG.utcOffset}`);

// Textos de la página que vienen de config.js
document.querySelectorAll("[data-cfg]").forEach((el) => (el.textContent = CONFIG[el.dataset.cfg] ?? ""));

/* ---------- Red neuronal (ONNX Runtime Web) ---------- */
// Si cambias el modelo, cámbiale también el nombre al archivo (los navegadores lo guardan en caché 1 año)
const MODELO = "model/mobilenet_v3_large.int8.onnx";
// Clases de ImageNet que cuentan como cada objeto (se suman sus probabilidades)
const OBJETIVOS = {
  lapicero: ["ballpoint", "fountain pen", "quill"],
  zapato: ["running shoe", "Loafer", "clog", "cowboy boot", "sandal", "shoe shop"],
};
const NOMBRES = { lapicero: "Lapicero", zapato: "Zapato" };
const ICONO_OBJETIVO = { lapicero: "pen-line", zapato: "footprints" };
const SIZE = 224, MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
let session = null, labels = [];
const indices = {};

ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/";
ort.env.wasm.numThreads = 1; // sin cabeceras COOP/COEP el navegador no permite hilos

// Empieza a descargar el modelo desde que abre la página (mientras escribe su nombre)
const modelReady = (async () => {
  labels = await (await fetch("model/labels.json")).json();
  for (const [k, nombres] of Object.entries(OBJETIVOS)) {
    indices[k] = nombres.map((n) => labels.indexOf(n)).filter((i) => i >= 0);
  }
  session = await ort.InferenceSession.create(MODELO, { executionProviders: ["wasm"] });
})();
modelReady.catch(() => {}); // el error se muestra al escanear

const inCanvas = document.createElement("canvas");
inCanvas.width = inCanvas.height = SIZE;
const inCtx = inCanvas.getContext("2d", { willReadFrequently: true });
const N = SIZE * SIZE, input = new Float32Array(3 * N);

async function classify() {
  // Recorta el centro en cuadrado y lo reduce a 224x224
  const vw = video.videoWidth, vh = video.videoHeight, s = Math.min(vw, vh);
  inCtx.drawImage(video, (vw - s) / 2, (vh - s) / 2, s, s, 0, 0, SIZE, SIZE);
  const { data } = inCtx.getImageData(0, 0, SIZE, SIZE);

  // Convierte a tensor normalizado [1, 3, 224, 224] (igual que torchvision)
  for (let i = 0; i < N; i++)
    for (let c = 0; c < 3; c++) input[c * N + i] = (data[i * 4 + c] / 255 - MEAN[c]) / STD[c];

  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]) });
  const logits = out[session.outputNames[0]].data;

  // Softmax
  let max = -Infinity;
  for (const v of logits) if (v > max) max = v;
  const exps = Array.from(logits, (v) => Math.exp(v - max));
  const total = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / total);

  const scores = {};
  for (const k in indices) scores[k] = indices[k].reduce((a, i) => a + probs[i], 0);
  const objetivo = Object.keys(scores).reduce((a, b) => (scores[b] > scores[a] ? b : a));
  let topI = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[topI]) topI = i;

  return {
    unlocked: scores[objetivo] >= CONFIG.umbral,
    objetivo, confianza: scores[objetivo], umbral: CONFIG.umbral, scores,
    top: [{ label: labels[topI], score: probs[topI] }],
  };
}

/* ---------- Fondo de red neuronal ---------- */
const fondo = (() => {
  const c = $("#bg"), ctx = c.getContext("2d");
  let w, h, pts, dpr, raf = 0, pausado = false;
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = c.width = innerWidth * dpr; h = c.height = innerHeight * dpr;
    c.style.width = innerWidth + "px"; c.style.height = innerHeight + "px";
    const n = Math.min(70, Math.floor(innerWidth / 14));
    pts = Array.from({ length: n }, (_, i) => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.35 * dpr, vy: (Math.random() - 0.5) * 0.35 * dpr,
      oro: i % 9 === 0, // algunos nodos dorados, como los filetes del escudo
    }));
    if (reduceMotion || pausado) draw(false);
  };
  const draw = (mover = true) => {
    ctx.clearRect(0, 0, w, h);
    const D = 130 * dpr;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < D) {
          ctx.strokeStyle = `rgba(28,114,165,${(1 - d / D) * 0.55})`;
          ctx.lineWidth = dpr;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    for (const p of pts) {
      if (mover) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }
      ctx.fillStyle = p.oro ? "rgba(226,188,106,.85)" : "rgba(79,176,232,.7)";
      ctx.fillRect(p.x, p.y, 2 * dpr, 2 * dpr);
    }
  };
  const loop = () => { draw(); raf = requestAnimationFrame(loop); };
  resize(); addEventListener("resize", resize);
  if (!reduceMotion) loop();
  return {
    // Mientras la red neuronal analiza la cámara, el fondo se congela para no robarle CPU
    pausar() { pausado = true; cancelAnimationFrame(raf); },
    reanudar() { if (pausado && !reduceMotion) { pausado = false; loop(); } },
  };
})();

/* ---------- Utilidades ---------- */
function show(id) {
  document.querySelectorAll(".stage").forEach((s) => {
    const on = s.id === id;
    s.classList.toggle("hidden", !on);
    s.classList.toggle("flex", on);
  });
  scrollTo({ top: 0, behavior: "smooth" });
}

const LOG_COLORS = { ok: "text-oro-luz", err: "text-rojo-luz", hi: "text-azul-luz" };
function log(msg, type = "") {
  const t = $("#log"), line = document.createElement("div");
  line.className = `truncate animate-stage ${LOG_COLORS[type] || ""}`;
  line.textContent = `> ${msg}`;
  t.appendChild(line);
  while (t.children.length > 6) t.firstChild.remove();
}

function scramble(el, text, dur = 1000) {
  text = String(text ?? "");
  return new Promise((res) => {
    if (reduceMotion || !text) { el.textContent = text; return res(); }
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur), n = Math.floor(p * text.length);
      el.textContent = text.slice(0, n) +
        [...text.slice(n)].map((ch) => (ch === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join("");
      p < 1 ? requestAnimationFrame(step) : res();
    };
    requestAnimationFrame(step);
  });
}

function mostrarAccesoAlternativo() {
  $("#btn-alt").classList.replace("hidden", "flex");
}

/* ---------- Etapa 1: Intro ---------- */
const cipherTimer = setInterval(() => ($("#cipher").textContent = rnd(140)), reduceMotion ? 1500 : 80);
let guestName = "Invitado Especial";

async function iniciar() {
  guestName = $("#guest").value.trim() || "Invitado Especial";
  clearInterval(cipherTimer);
  show("s-scan");
  await startCamera();
}
$("#btn-start").addEventListener("click", iniciar, { once: true });
$("#guest").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#btn-start").click(); });

/* ---------- Etapa 2: Escáner ---------- */
const video = $("#video");
let stream = null, timer = null, altTimer = null;
let busy = false, hits = 0, fails = 0, unlocked = false;

async function startCamera() {
  log("Inicializando sensor óptico…");
  altTimer = setTimeout(mostrarAccesoAlternativo, CONFIG.tiempoAlternativo);

  if (!navigator.mediaDevices?.getUserMedia) {
    log("Cámara no disponible (se requiere HTTPS)", "err");
    mostrarAccesoAlternativo();
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (e) {
    log(`Acceso a cámara denegado (${e.name})`, "err");
    mostrarAccesoAlternativo();
    return;
  }
  video.srcObject = stream;
  await video.play().catch(() => {});
  log("Sensor óptico enlazado ✓", "ok");

  log("Cargando red neuronal MobileNetV3…", "hi");
  try {
    await modelReady;
  } catch (e) {
    console.error(e);
    log("No se pudo cargar la red neuronal", "err");
    mostrarAccesoAlternativo();
    return;
  }
  log("Red neuronal en línea · inferencia local ✓", "ok");
  fondo.pausar();
  loop();
}

async function loop() {
  if (unlocked) return;
  if (!busy && video.readyState >= 2) {
    busy = true;
    try {
      handle(await classify());
      fails = 0;
    } catch (e) {
      console.error(e);
      if (++fails % 5 === 1) log("Error en la red neuronal…", "err");
    } finally {
      busy = false;
    }
  }
  timer = setTimeout(loop, CONFIG.intervalo);
}

function handle(d) {
  if (unlocked) return;
  const pc = (v) => Math.round(v * 100);
  for (const k of Object.keys(OBJETIVOS)) {
    $(`#b-${k}`).style.width = `${Math.min(100, (d.scores[k] / d.umbral) * 100)}%`;
    $(`#v-${k}`).textContent = `${pc(d.scores[k])}%`;
  }
  const top = d.top[0];
  $("#vp-label").textContent = d.unlocked
    ? `OBJETIVO: ${NOMBRES[d.objetivo].toUpperCase()} · ${pc(d.confianza)}%`
    : `ANALIZANDO: ${top.label.toUpperCase()}`;
  log(`${top.label} · ${pc(top.score)}%`, d.unlocked ? "ok" : "");
  $("#viewport").classList.toggle("lock", d.unlocked);
  hits = d.unlocked ? hits + 1 : 0;
  if (hits >= CONFIG.confirmaciones) unlock(d.objetivo, d.confianza);
}

$("#btn-alt").addEventListener("click", () => unlock("manual", null));

async function unlock(kind, conf) {
  if (unlocked) return;
  unlocked = true;
  clearTimeout(timer); clearTimeout(altTimer);
  $("#flash").classList.add("go");
  navigator.vibrate?.([60, 40, 120]);
  log("Firma neuronal verificada ✓", "ok");
  await sleep(700);
  stream?.getTracks().forEach((t) => t.stop());
  fondo.reanudar();
  show("s-pass");
  await decrypt();
  renderPass(kind, conf);
}

/* ---------- Etapa 3: Descifrado + Pase VIP ---------- */
async function decrypt() {
  const steps = ["Validando clave neuronal", "Descifrando bloques AES-256", "Reconstruyendo invitación", "Generando credencial VIP"];
  const label = $("#dec-step"), pct = $("#dec-pct");
  for (let i = 0; i < steps.length; i++) {
    scramble(label, steps[i], 400);
    for (let p = i * 25; p <= (i + 1) * 25; p++) { pct.textContent = `${p}%`; await sleep(14); }
    await sleep(220);
  }
  $("#decrypt").classList.replace("flex", "hidden");
}

const fmtHora = (d) => d.toLocaleTimeString("es-GT", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: CONFIG.zonaHoraria });
const capitalizar = (s) => s.replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());

let passId = "";
function renderPass(kind, conf) {
  const hex = [...crypto.getRandomValues(new Uint8Array(4))]
    .map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  passId = `VIP-${hex.slice(0, 4)}-${hex.slice(4)}`;

  $("#p-date").textContent = capitalizar(INICIO.toLocaleDateString("es-GT", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: CONFIG.zonaHoraria,
  }));
  // "6:00 – 10:00 p. m." en lugar de repetir "p. m." cuando ambas horas lo comparten
  const [hi, hf] = [fmtHora(INICIO), fmtHora(FIN)];
  const sufijo = (t) => t.replace(/^[\d:]+\s*/, "");
  $("#p-time").textContent = sufijo(hi) === sufijo(hf) ? `${hi.replace(sufijo(hi), "").trim()} – ${hf}` : `${hi} – ${hf}`;
  $("#p-place").textContent = CONFIG.lugar;
  $("#p-org").textContent = CONFIG.organiza;
  $("#p-id").textContent = passId;

  const icono = kind === "manual" ? "key-round" : ICONO_OBJETIVO[kind];
  const texto = kind === "manual"
    ? "Acceso alternativo autorizado"
    : `Autenticado por IA · ${NOMBRES[kind]} · ${Math.round(conf * 100)}%`;
  const ai = $("#p-ai");
  ai.innerHTML = `<span class="inline-flex items-center gap-1.5"><i data-lucide="${icono}" class="size-3.5"></i><span></span></span>`;
  ai.querySelector("span span").textContent = texto;
  lucide.createIcons();

  const bc = $("#barcode");
  bc.innerHTML = "";
  for (let i = 0; i < 48; i++) {
    const bar = document.createElement("i");
    bar.className = "block shrink-0 bg-haze";
    bar.style.width = `${1 + ((Math.random() * 3) | 0)}px`;
    bar.style.opacity = Math.random() > 0.15 ? 1 : 0.3;
    bc.appendChild(bar);
  }

  iniciarCuentaRegresiva();

  const wrap = $("#pass-wrap");
  wrap.classList.remove("hidden");
  wrap.classList.add("animate-reveal");
  scramble($("#p-title"), CONFIG.evento, 1200);
  scramble($("#p-guest"), guestName.toUpperCase(), 1600);
}

/* Cuenta regresiva al evento */
function iniciarCuentaRegresiva() {
  const box = $("#countdown"), label = $("#cd-label");
  const unidades = [["d", "DÍAS", 86400], ["h", "HORAS", 3600], ["m", "MIN", 60], ["s", "SEG", 1]];
  box.innerHTML = unidades.map(([k, u]) => `<div><b class="cd-num" data-u="${k}">00</b><span class="cd-unit">${u}</span></div>`).join("");
  const tick = () => {
    const ahora = Date.now();
    if (ahora >= FIN.getTime()) {
      label.lastChild.textContent = "EVENTO FINALIZADO · ¡GRACIAS POR VENIR!";
      box.classList.add("hidden");
      return clearInterval(id);
    }
    if (ahora >= INICIO.getTime()) {
      label.lastChild.textContent = "¡EL EVENTO ESTÁ EN CURSO!";
      box.classList.add("hidden");
      return;
    }
    let resto = Math.floor((INICIO.getTime() - ahora) / 1000);
    for (const [k, , seg] of unidades) {
      box.querySelector(`[data-u="${k}"]`).textContent = String(Math.floor(resto / seg)).padStart(2, "0");
      resto %= seg;
    }
  };
  const id = setInterval(tick, 1000);
  tick();
}

/* Efecto holográfico 3D */
const pass = $("#pass");
$("#pass-wrap").addEventListener("pointermove", (e) => {
  const r = pass.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  pass.style.setProperty("--rx", `${(x - 0.5) * 14}deg`);
  pass.style.setProperty("--ry", `${(0.5 - y) * 14}deg`);
  pass.style.setProperty("--mx", `${x * 100}%`);
  pass.style.setProperty("--my", `${y * 100}%`);
});
$("#pass-wrap").addEventListener("pointerleave", () => {
  pass.style.setProperty("--rx", "0deg");
  pass.style.setProperty("--ry", "0deg");
});

/* ---------- Menú de opciones ---------- */
const sheet = $("#sheet");
function openSheet(title, options) {
  $("#sheet-title").textContent = title;
  const box = $("#sheet-options");
  box.innerHTML = "";
  for (const o of options) {
    const a = document.createElement("a");
    a.href = o.href;
    if (o.newTab) { a.target = "_blank"; a.rel = "noopener"; }
    a.className = "flex items-center gap-3.5 rounded-2xl border border-line bg-glass p-4 transition hover:border-azul-luz active:scale-[.98]";
    a.innerHTML = `
      <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-linear-to-br from-azul/40 to-rojo/25 text-azul-luz">
        <i data-lucide="${o.icon}" class="size-5"></i>
      </span>
      <span class="flex flex-1 flex-col">
        <span class="font-display text-sm font-bold tracking-wide">${o.label}</span>
        <span class="mt-0.5 text-xs text-dim">${o.sub}</span>
      </span>
      <i data-lucide="chevron-right" class="size-4 text-dim"></i>`;
    a.addEventListener("click", closeSheet);
    box.appendChild(a);
  }
  lucide.createIcons();
  sheet.classList.replace("hidden", "flex");
}
function closeSheet() { sheet.classList.replace("flex", "hidden"); }
sheet.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(); });
$("#sheet-close").addEventListener("click", closeSheet);
addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

/* Agendar: Google Calendar + Calendario de iPhone / .ics */
$("#btn-cal").addEventListener("click", () => {
  const utc = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const google = "https://calendar.google.com/calendar/render?" + new URLSearchParams({
    action: "TEMPLATE",
    text: CONFIG.evento,
    dates: `${utc(INICIO)}/${utc(FIN)}`,
    ctz: CONFIG.zonaHoraria,
    details: `Pase VIP: ${passId}\nOrganiza: ${CONFIG.organiza}\n${CONFIG.universidad} · ${CONFIG.sede}\n${location.origin}`,
    location: `${CONFIG.lugar}, ${CONFIG.direccion}`,
  });

  const opciones = [
    { icon: "calendar-plus", label: "Google Calendar", sub: "Android, iPhone o computadora", href: google, newTab: true },
    isIOS
      ? { icon: "calendar-check", label: "Calendario de iPhone", sub: "Se agrega al calendario de Apple", href: "seminario.ics" }
      : { icon: "download", label: "Otro calendario", sub: "Samsung, Outlook y otros (.ics)", href: "seminario.ics" },
  ];
  if (isIOS) opciones.reverse();
  openSheet("AGREGAR AL CALENDARIO", opciones);
});

/* Cómo llegar: Google Maps + Waze (+ Apple Maps en iPhone) */
$("#btn-map").addEventListener("click", () => {
  const coords = CONFIG.lat != null && CONFIG.lng != null;
  const ll = `${CONFIG.lat},${CONFIG.lng}`;
  const q = encodeURIComponent(`${CONFIG.lugar}, ${CONFIG.direccion}`);

  const opciones = [
    { icon: "map", label: "Google Maps", sub: "Ver ruta con Google Maps", newTab: true,
      href: `https://www.google.com/maps/dir/?api=1&destination=${coords ? ll : q}` },
    { icon: "car", label: "Waze", sub: "Navegar con Waze", newTab: true,
      href: coords ? `https://waze.com/ul?ll=${ll}&navigate=yes` : `https://waze.com/ul?q=${q}&navigate=yes` },
  ];
  if (isIOS) {
    opciones.push({ icon: "compass", label: "Apple Maps", sub: "Mapas de iPhone", newTab: true,
      href: `https://maps.apple.com/?daddr=${coords ? ll : q}&q=${encodeURIComponent(CONFIG.lugar)}` });
  }
  openSheet("CÓMO LLEGAR", opciones);
});

$("#btn-again").addEventListener("click", () => location.reload());

/* Dibuja los iconos al cargar la página */
lucide.createIcons();


/* ======================================================
   GUARDAR INVITACIÓN COMO IMAGEN (PNG)
   ====================================================== */
const COLORES = {
  ink: "#040a14", haze: "#eaf2f8", dim: "#8ba0b6",
  azul: "#1c72a5", azulLuz: "#4fb0e8", rojo: "#cb3332", rojoLuz: "#e5524f",
  oro: "#b1873b", oroLuz: "#e2bc6a",
};
let imagenPase = null;

function partirLineas(ctx, texto, maxW) {
  const palabras = String(texto || "").split(" ");
  const lineas = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width > maxW && actual) { lineas.push(actual); actual = p; }
    else actual = prueba;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

function cargarImagen(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

async function crearImagenPase() {
  await document.fonts.ready;
  await Promise.all([
    '900 56px "Orbitron"', '700 48px "Orbitron"', '600 22px "JetBrains Mono"',
    '400 24px "JetBrains Mono"', '400 30px "Inter"', '600 32px "Inter"',
  ].map((f) => document.fonts.load(f)));
  const logo = await cargarImagen("img/umg-logo.webp").catch(() => null);

  const C = COLORES;
  const W = 1080, M = 70;
  const CX = M, CW = W - M * 2, CY = M;
  const X = CX + 60, IW = CW - 120;

  // Dibuja (o solo mide) el contenido del pase. Devuelve dónde termina la tarjeta.
  const contenido = (ctx, dibujar) => {
    const txt = (t, x, y, font, color, ls = "0px", align = "left") => {
      ctx.font = font; ctx.fillStyle = color; ctx.letterSpacing = ls; ctx.textAlign = align;
      if (dibujar) ctx.fillText(t, x, y);
      return ctx.measureText(t).width;
    };
    const bloque = (texto, font, color, maxW, lh, ls = "0px") => {
      ctx.font = font; ctx.letterSpacing = ls;
      const lineas = partirLineas(ctx, texto, maxW);
      lineas.forEach((l, i) => txt(l, X, y + i * lh, font, color, ls));
      return Math.max(0, lineas.length - 1) * lh;
    };

    let y = CY + 110;

    // Logo de la UMG + UMG//SIS
    const L = 104;
    if (dibujar && logo) {
      ctx.save();
      ctx.shadowColor = "rgba(226,188,106,.5)"; ctx.shadowBlur = 30;
      ctx.drawImage(logo, X, y - 74, L, L);
      ctx.restore();
    }
    let lx = X + (logo ? L + 26 : 0);
    const lx0 = lx;
    lx += txt("UMG", lx, y - 8, '900 44px "Orbitron"', C.haze, "4px");
    lx += txt("//", lx, y - 8, '900 44px "Orbitron"', C.rojoLuz, "4px");
    txt("SIS", lx, y - 8, '900 44px "Orbitron"', C.haze, "4px");
    txt(CONFIG.sede.toUpperCase(), lx0, y + 30, '600 20px "JetBrains Mono"', C.dim, "6px");

    // Etiqueta VIP
    if (dibujar) {
      const bw = 160, bh = 60, bx = X + IW - bw, by = y - 54;
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, C.oroLuz); g.addColorStop(1, C.oro);
      ctx.save();
      ctx.shadowColor = "rgba(226,188,106,.5)"; ctx.shadowBlur = 30;
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 14); ctx.fill();
      ctx.restore();
      txt("VIP", bx + bw / 2 + 4, by + 41, '900 26px "Orbitron"', "#1a1000", "8px", "center");
    }

    // Encabezado
    y += 140;
    txt("● INVITACIÓN DESENCRIPTADA", X, y, '600 22px "JetBrains Mono"', C.oroLuz, "6px");
    y += 80;
    y += bloque(CONFIG.evento, '900 56px "Orbitron"', C.haze, IW, 68);

    // Invitado
    y += 90;
    txt("INVITADO", X, y, '600 20px "JetBrains Mono"', C.dim, "5px");
    y += 60;
    const gradNombre = ctx.createLinearGradient(X, 0, X + IW * 0.8, 0);
    gradNombre.addColorStop(0, "#ffffff"); gradNombre.addColorStop(1, C.azulLuz);
    y += bloque(guestName.toUpperCase(), '700 48px "Orbitron"', gradNombre, IW, 58, "2px");

    // Datos en dos columnas
    const colW = IW / 2 - 20;
    const celda = (label, valor, cx) => {
      txt(label, cx, y, '600 20px "JetBrains Mono"', C.dim, "5px");
      ctx.font = '600 32px "Inter"'; ctx.letterSpacing = "0px";
      const lineas = partirLineas(ctx, valor, colW);
      lineas.forEach((l, i) => txt(l, cx, y + 48 + i * 42, '600 32px "Inter"', C.haze));
      return 48 + (lineas.length - 1) * 42;
    };
    const fila = (a, b) => {
      const h = Math.max(celda(a[0], a[1], X), celda(b[0], b[1], X + IW / 2 + 20));
      y += h;
    };
    y += 90;
    fila(["FECHA", $("#p-date").textContent], ["HORARIO", $("#p-time").textContent]);
    y += 80;
    fila(["LUGAR", $("#p-place").textContent], ["ORGANIZA", $("#p-org").textContent]);

    // Línea perforada
    y += 70;
    if (dibujar) {
      ctx.save();
      ctx.setLineDash([14, 12]); ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(CX + 34, y); ctx.lineTo(CX + CW - 34, y); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = C.ink;
      for (const nx of [CX, CX + CW]) { ctx.beginPath(); ctx.arc(nx, y, 26, 0, Math.PI * 2); ctx.fill(); }
    }

    // Código de barras + ID
    y += 70;
    const barTop = y;
    if (dibujar) {
      let bx = X;
      const limite = X + IW - 330;
      ctx.fillStyle = C.haze;
      for (const b of $("#barcode").children) {
        const bw = (parseFloat(b.style.width) || 2) * 3;
        if (bx + bw > limite) break;
        ctx.globalAlpha = parseFloat(b.style.opacity || 1);
        ctx.fillRect(bx, barTop, bw, 110);
        bx += bw + 6;
      }
      ctx.globalAlpha = 1;
    }
    txt("ID DE ACCESO", X + IW, barTop + 40, '600 20px "JetBrains Mono"', C.dim, "5px", "right");
    txt(passId, X + IW, barTop + 92, '600 36px "JetBrains Mono"', C.azulLuz, "0px", "right");
    y = barTop + 110;

    // Autenticación por IA
    y += 70;
    if (dibujar) {
      ctx.save();
      ctx.fillStyle = C.oroLuz; ctx.shadowColor = C.oroLuz; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(X + 8, y - 8, 8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    txt($("#p-ai").textContent.trim(), X + 32, y, '400 24px "JetBrains Mono"', C.dim);

    return y + 70;
  };

  // 1) Medir para saber la altura total
  const medidor = document.createElement("canvas").getContext("2d");
  const finTarjeta = contenido(medidor, false);
  const CH = finTarjeta - CY;
  const H = finTarjeta + 130;

  // 2) Dibujar
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");

  // Fondo
  ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
  const bgAzul = ctx.createRadialGradient(W / 2, -200, 50, W / 2, -200, H * 0.9);
  bgAzul.addColorStop(0, "rgba(28,114,165,.55)"); bgAzul.addColorStop(1, "rgba(28,114,165,0)");
  ctx.fillStyle = bgAzul; ctx.fillRect(0, 0, W, H);
  const bgRojo = ctx.createRadialGradient(W, H + 100, 50, W, H + 100, H * 0.6);
  bgRojo.addColorStop(0, "rgba(203,51,50,.22)"); bgRojo.addColorStop(1, "rgba(203,51,50,0)");
  ctx.fillStyle = bgRojo; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(79,176,232,.05)"; ctx.lineWidth = 1;
  for (let gx = 0; gx <= W; gx += 60) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
  for (let gy = 0; gy <= H; gy += 60) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = i % 9 === 0 ? "rgba(226,188,106,.7)" : "rgba(79,176,232,.6)";
    ctx.fillRect(Math.random() * W, Math.random() * H, 3, 3);
  }

  // Tarjeta con brillo
  const fondoTarjeta = ctx.createLinearGradient(CX, CY, CX + CW * 0.4, CY + CH);
  fondoTarjeta.addColorStop(0, "rgba(14,40,70,.97)");
  fondoTarjeta.addColorStop(1, "rgba(4,10,20,.98)");
  ctx.save();
  ctx.shadowColor = "rgba(28,114,165,.6)"; ctx.shadowBlur = 90; ctx.shadowOffsetY = 30;
  ctx.fillStyle = fondoTarjeta;
  ctx.beginPath(); ctx.roundRect(CX, CY, CW, CH, 48); ctx.fill();
  ctx.restore();

  // Reflejo holográfico + marca de agua del escudo
  ctx.save();
  ctx.beginPath(); ctx.roundRect(CX, CY, CW, CH, 48); ctx.clip();
  const holo = ctx.createLinearGradient(CX, CY, CX + CW, CY + CH);
  holo.addColorStop(0.2, "rgba(79,176,232,0)");
  holo.addColorStop(0.35, "rgba(79,176,232,.08)");
  holo.addColorStop(0.5, "rgba(226,188,106,.08)");
  holo.addColorStop(0.65, "rgba(229,82,79,.07)");
  holo.addColorStop(0.8, "rgba(229,82,79,0)");
  ctx.fillStyle = holo; ctx.fillRect(CX, CY, CW, CH);
  if (logo) {
    ctx.globalAlpha = 0.05;
    const wm = 520;
    ctx.drawImage(logo, CX + CW - wm * 0.72, CY + CH * 0.42, wm, wm);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Borde en los colores del escudo
  const borde = ctx.createLinearGradient(CX, CY, CX + CW, CY + CH);
  borde.addColorStop(0, C.oroLuz); borde.addColorStop(0.3, C.rojoLuz);
  borde.addColorStop(0.5, "#ffffff"); borde.addColorStop(0.75, C.azulLuz); borde.addColorStop(1, C.oroLuz);
  ctx.strokeStyle = borde; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(CX, CY, CW, CH, 48); ctx.stroke();

  contenido(ctx, true);

  // Pie: SEMINARIO 2026 · INGENIERÍA EN SISTEMAS, entre dos líneas rojo → dorado
  const pie = (CONFIG.pie || CONFIG.evento).toUpperCase();
  const yPie = H - 52;
  ctx.font = '700 22px "Orbitron"'; ctx.letterSpacing = "4px"; ctx.textAlign = "center";
  const anchoPie = ctx.measureText(pie).width;
  const gradPie = ctx.createLinearGradient(W / 2 - anchoPie / 2, 0, W / 2 + anchoPie / 2, 0);
  gradPie.addColorStop(0, C.oroLuz); gradPie.addColorStop(0.5, "#ffffff"); gradPie.addColorStop(1, C.oroLuz);
  ctx.fillStyle = gradPie;
  ctx.fillText(pie, W / 2, yPie);
  const largoLinea = Math.max(0, Math.min(90, (W - anchoPie) / 2 - 50));
  for (const lado of [-1, 1]) {
    const x0 = W / 2 + lado * (anchoPie / 2 + 22), x1 = x0 + lado * largoLinea;
    const gl = ctx.createLinearGradient(x0, 0, x1, 0);
    gl.addColorStop(0, C.oroLuz); gl.addColorStop(1, "rgba(203,51,50,0)");
    ctx.strokeStyle = gl; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, yPie - 9); ctx.lineTo(x1, yPie - 9); ctx.stroke();
  }

  return new Promise((r) => cv.toBlob(r, "image/png"));
}

// La imagen se prepara en cuanto aparece el pase, así el botón responde al instante
new MutationObserver(() => {
  if (!passId) return;
  setTimeout(async () => {
    try { imagenPase = await crearImagenPase(); } catch (e) { console.error(e); }
  }, 400);
}).observe($("#p-id"), { childList: true });

function descargarArchivo(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

$("#btn-save").addEventListener("click", async () => {
  const btn = $("#btn-save");
  const original = btn.innerHTML;
  btn.disabled = true;
  try {
    if (!imagenPase) {
      btn.textContent = "Generando…";
      imagenPase = await crearImagenPase();
    }
    const nombre = `pase-vip-${passId}.png`;
    const archivo = new File([imagenPase], nombre, { type: "image/png" });

    if (navigator.canShare?.({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: "Mi pase VIP" });
      } catch (e) {
        if (e.name === "AbortError") return;   // el usuario cerró el menú
        descargarArchivo(imagenPase, nombre);  // si compartir falla, descarga
      }
    } else {
      descargarArchivo(imagenPase, nombre);
    }
  } catch (e) {
    console.error(e);
    alert("No se pudo generar la imagen. Puedes tomar una captura de pantalla 📸");
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
});

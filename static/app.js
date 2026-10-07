/* ============ CONFIGURA TU EVENTO AQUÍ ============ */
const CONFIG = {
  evento: "Seminario de Ingeniería en Sistemas",
  tema: "Inteligencia Artificial: el código que aprende", // o "" si no quieres subtítulo
  fecha: "2026-10-24",       // AAAA-MM-DD
  hora: "18:00",             // formato 24 h
  horaFin: "22:00",
  lugar: "Hostal Las Marías",
  direccion: "Taxisco, Santa Rosa, Guatemala",
  lat: null,                 // ← latitud exacta (sin comillas)
  lng: null,                 // ← longitud exacta (sin comillas)
  organiza: "Décimo Ciclo de Ingeniería en Sistemas",
  zonaHoraria: "America/Guatemala",
  umbral: 0.35,              // confianza mínima para desbloquear (0 a 1)
  intervalo: 400,            // ms entre análisis
  confirmaciones: 2,         // detecciones seguidas para desbloquear
  tiempoAlternativo: 25000,  // ms antes de mostrar el acceso alternativo
};
/* ================================================== */

const $ = (s) => document.querySelector(s);
const GLYPHS = "ABCDEF0123456789#$%&@<>/\\{}[]=+*";
const rnd = (n) => Array.from({ length: n }, () => GLYPHS[(Math.random() * GLYPHS.length) | 0]).join("");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/* ---------- Red neuronal (ONNX Runtime Web) ---------- */
const OBJETIVOS = {
  cafe: ["coffee mug", "cup", "espresso", "coffeepot"],
  teclado: ["computer keyboard", "typewriter keyboard", "space bar", "laptop", "notebook"],
};
const SIZE = 224, MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
let session = null, labels = [];
const indices = {};

ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/";

// Empieza a descargar el modelo desde que abre la página (mientras escribe su nombre)
const modelReady = (async () => {
  labels = await (await fetch("model/labels.json")).json();
  for (const [k, nombres] of Object.entries(OBJETIVOS)) {
    indices[k] = nombres.map((n) => labels.indexOf(n)).filter((i) => i >= 0);
  }
  session = await ort.InferenceSession.create("model/mobilenet_v3.onnx", { executionProviders: ["wasm"] });
})();

const inCanvas = document.createElement("canvas");
inCanvas.width = inCanvas.height = SIZE;
const inCtx = inCanvas.getContext("2d", { willReadFrequently: true });

async function classify() {
  // Recorta el centro en cuadrado y lo reduce a 224x224
  const vw = video.videoWidth, vh = video.videoHeight, s = Math.min(vw, vh);
  inCtx.drawImage(video, (vw - s) / 2, (vh - s) / 2, s, s, 0, 0, SIZE, SIZE);
  const { data } = inCtx.getImageData(0, 0, SIZE, SIZE);

  // Convierte a tensor normalizado [1, 3, 224, 224] (igual que torchvision)
  const N = SIZE * SIZE, input = new Float32Array(3 * N);
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
  const objetivo = scores.cafe >= scores.teclado ? "cafe" : "teclado";
  let topI = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[topI]) topI = i;

  return {
    unlocked: scores[objetivo] >= CONFIG.umbral,
    objetivo, confianza: scores[objetivo], umbral: CONFIG.umbral, scores,
    top: [{ label: labels[topI], score: probs[topI] }],
  };
}

/* ---------- Fondo de red neuronal ---------- */
(() => {
  const c = $("#bg"), ctx = c.getContext("2d");
  let w, h, pts, dpr;
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = c.width = innerWidth * dpr; h = c.height = innerHeight * dpr;
    c.style.width = innerWidth + "px"; c.style.height = innerHeight + "px";
    const n = Math.min(70, Math.floor(innerWidth / 14));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.35 * dpr, vy: (Math.random() - 0.5) * 0.35 * dpr,
    }));
  };
  resize(); addEventListener("resize", resize);
  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    const D = 130 * dpr;
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.fillStyle = "rgba(0,240,255,.7)";
      ctx.fillRect(p.x, p.y, 2 * dpr, 2 * dpr);
    }
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < D) {
          ctx.strokeStyle = `rgba(139,92,246,${(1 - d / D) * 0.35})`;
          ctx.lineWidth = dpr;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    requestAnimationFrame(draw);
  };
  draw();
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

const LOG_COLORS = { ok: "text-neon-green", err: "text-rose-400", hi: "text-neon-cyan" };
function log(msg, type = "") {
  const t = $("#log"), line = document.createElement("div");
  line.className = `truncate animate-stage ${LOG_COLORS[type] || ""}`;
  line.textContent = `> ${msg}`;
  t.appendChild(line);
  while (t.children.length > 6) t.firstChild.remove();
}

function scramble(el, text, dur = 1000) {
  return new Promise((res) => {
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
const cipherTimer = setInterval(() => ($("#cipher").textContent = rnd(140)), 80);
let guestName = "Invitado Especial";

$("#btn-start").addEventListener("click", async () => {
  guestName = $("#guest").value.trim() || "Invitado Especial";
  clearInterval(cipherTimer);
  show("s-scan");
  await startCamera();
});

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
  for (const k of ["cafe", "teclado"]) {
    $(`#b-${k}`).style.width = `${Math.min(100, (d.scores[k] / d.umbral) * 100)}%`;
    $(`#v-${k}`).textContent = `${pc(d.scores[k])}%`;
  }
  const top = d.top[0];
  $("#vp-label").textContent = d.unlocked
    ? `OBJETIVO: ${d.objetivo === "cafe" ? "CAFÉ" : "TECLADO"} · ${pc(d.confianza)}%`
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

const h12 = (t) => new Date(`2000-01-01T${t}`).toLocaleTimeString("es", { hour: "numeric", minute: "2-digit", hour12: true });

let passId = "";
function renderPass(kind, conf) {
  const hex = [...crypto.getRandomValues(new Uint8Array(4))]
    .map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  passId = `VIP-${hex.slice(0, 4)}-${hex.slice(4)}`;

  const fecha = new Date(`${CONFIG.fecha}T${CONFIG.hora}`);
  $("#p-date").textContent = fecha.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  $("#p-time").textContent = `${h12(CONFIG.hora)} – ${h12(CONFIG.horaFin)}`;
  $("#p-place").textContent = CONFIG.lugar;
  $("#p-org").textContent = CONFIG.organiza;
  $("#p-id").textContent = passId;

  const icono = kind === "manual" ? "key-round" : kind === "cafe" ? "coffee" : "keyboard";
  const texto = kind === "manual"
    ? "Acceso alternativo autorizado"
    : `Autenticado por IA · ${kind === "cafe" ? "Café" : "Teclado"} · ${Math.round(conf * 100)}%`;
  $("#p-ai").innerHTML = `<span class="inline-flex items-center gap-1.5"><i data-lucide="${icono}" class="size-3.5"></i>${texto}</span>`;
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

  const wrap = $("#pass-wrap");
  wrap.classList.remove("hidden");
  wrap.classList.add("animate-reveal");
  scramble($("#p-title"), CONFIG.evento, 1200);
  scramble($("#p-theme"), CONFIG.tema, 1400);
  scramble($("#p-guest"), guestName.toUpperCase(), 1600);
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
    a.className = "flex items-center gap-3.5 rounded-2xl border border-line bg-glass p-4 transition hover:border-neon-cyan active:scale-[.98]";
    a.innerHTML = `
      <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-linear-to-br from-neon-cyan/20 to-neon-violet/20 text-neon-cyan">
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

/* Agendar: Google Calendar + Calendario de iPhone / .ics */
$("#btn-cal").addEventListener("click", () => {
  const d = CONFIG.fecha.replace(/-/g, "");
  const t = (h) => h.replace(":", "") + "00";
  const google = "https://calendar.google.com/calendar/render?" + new URLSearchParams({
    action: "TEMPLATE",
    text: CONFIG.evento,
    dates: `${d}T${t(CONFIG.hora)}/${d}T${t(CONFIG.horaFin)}`,
    ctz: CONFIG.zonaHoraria,
    details: `${CONFIG.tema}\nPase VIP: ${passId}\nOrganiza: ${CONFIG.organiza}`,
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
      href: `https://maps.apple.com/?daddr=${coords ? ll : q}` });
  }
  openSheet("CÓMO LLEGAR", opciones);
});

$("#btn-again").addEventListener("click", () => location.reload());

/* Dibuja los iconos de Lucide al cargar la página */
lucide.createIcons();
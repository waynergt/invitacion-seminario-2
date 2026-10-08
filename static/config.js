/* ==================================================================
   CONFIGURA TU EVENTO AQUÍ
   Este es el ÚNICO lugar donde van los datos del evento. De aquí salen:
   la invitación, Google Calendar, el archivo .ics (iPhone/Outlook),
   la vista previa al compartir por WhatsApp y la imagen del pase.
   ================================================================== */
window.CONFIG = {
  evento: "Seminario de Ingeniería en Sistemas",
  fecha: "2026-10-24",       // AAAA-MM-DD
  hora: "18:00",             // formato 24 h
  horaFin: "22:00",
  zonaHoraria: "America/Guatemala",
  utcOffset: "-06:00",       // Guatemala no usa horario de verano

  lugar: "Hostal Las Marías",
  direccion: "Taxisco, Santa Rosa, Guatemala",
  lat: 14.064941,            // coordenadas exactas para Maps y Waze
  lng: -90.4566038,

  organiza: "Décimo Ciclo de Ingeniería en Sistemas",
  universidad: "Universidad Mariano Gálvez",
  sede: "Chiquimulilla",
  pie: "SEMINARIO 2026 · INGENIERÍA EN SISTEMAS", // texto al pie de la imagen del pase

  // Dirección pública del sitio (para la vista previa en WhatsApp/Facebook)
  sitio: "https://invitacion-seminario-2.vercel.app",

  // Red neuronal
  umbral: 0.20,              // confianza mínima para desbloquear (0 a 1)
  intervalo: 400,            // ms entre análisis
  confirmaciones: 2,         // detecciones seguidas para desbloquear
  tiempoAlternativo: 25000,  // ms antes de mostrar el acceso alternativo
};

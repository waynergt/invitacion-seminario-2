/** Archivo de calendario iCalendar (RFC 5545) para iPhone, Outlook y otros. */

/** Escapa texto según RFC 5545 §3.3.11. */
export const icsTexto = (t = "") =>
  String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** "2026-10-24", "18:00", "-06:00" → "20261025T000000Z" */
export const aUTC = (fecha, hora, offset) => formatoUTC(new Date(`${fecha}T${hora}:00${offset}`));
export const formatoUTC = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function generarICS(C, ahora = new Date()) {
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Seminario UMG//Invitacion//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:seminario-${C.fecha}@${new URL(C.sitio).host}`,
    `DTSTAMP:${formatoUTC(ahora)}`,
    `DTSTART:${aUTC(C.fecha, C.hora, C.utcOffset)}`,
    `DTEND:${aUTC(C.fecha, C.horaFin, C.utcOffset)}`,
    `SUMMARY:${icsTexto(C.evento)}`,
    `LOCATION:${icsTexto(`${C.lugar}, ${C.direccion}`)}`,
    ...(C.lat != null && C.lng != null ? [`GEO:${C.lat};${C.lng}`] : []),
    `DESCRIPTION:${icsTexto(`Organiza: ${C.organiza}\n${C.universidad} · ${C.sede}`)}`,
    `URL:${C.sitio}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsTexto(`${C.evento} empieza en 2 horas`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lineas.join("\r\n") + "\r\n"; // el estándar exige CRLF
}

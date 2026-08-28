/**
 * STATLAB — exportación a CSV
 * ---------------------------------------------------------------------------
 * Compatibilidad buscada a propósito:
 *   · UTF-8 con BOM → Excel en Windows abre los acentos correctamente;
 *   · separador COMA y comillas dobles con escape RFC 4180 → R (`read.csv`),
 *     Python (`pandas.read_csv`), SPSS y Excel lo leen sin configurar nada;
 *   · punto decimal (no coma) en los números → evita la ambigüedad con el
 *     separador de columnas. Se documenta en el README.
 *   · booleanos como 0/1 → listos para modelos.
 *   · fechas en ISO 8601 → ordenables y sin ambigüedad de formato.
 *
 * Dos modos de exportación (requisito de privacidad):
 *   IDENTIFICADA     incluye nombre, apellidos y correo. Para seguimiento docente.
 *   PSEUDONIMIZADA   sustituye la identidad por un UUID estable derivado por
 *                    hash. Permite análisis longitudinal y publicación de
 *                    resultados sin datos personales.
 */

/** Convierte un array de objetos en texto CSV. */
export function toCsv(rows, { columns = null, delimiter = ',' } = {}) {
  if (!rows || !rows.length) return '';
  const cols = columns || Array.from(
    rows.reduce((set, r) => {
      Object.keys(r).forEach((k) => { if (r[k] !== undefined) set.add(k); });
      return set;
    }, new Set()),
  );

  const cell = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object') v = JSON.stringify(v);
    const s = String(v);
    return /["\n\r,;\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [cols.join(delimiter)];
  for (const r of rows) lines.push(cols.map((c) => cell(r[c])).join(delimiter));
  return lines.join('\r\n');
}

/** Descarga un CSV en el navegador (BOM incluido). */
export function downloadCsv(filename, rows, opts = {}) {
  const csv = toCsv(rows, opts);
  downloadText(filename, '﻿' + csv, 'text/csv;charset=utf-8');
}

export function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Descarga un JSON (para respaldos de contenido y retos). */
export function downloadJson(filename, obj) {
  downloadText(filename, JSON.stringify(obj, null, 2), 'application/json');
}

/**
 * Descarga todas las tablas como un ZIP sin dependencias externas.
 * Se construye un ZIP «store» (sin compresión), que es un formato lo bastante
 * simple para generarlo a mano y que cualquier sistema descomprime.
 */
export async function downloadZip(filename, files) {
  const enc = new TextEncoder();
  const entries = [];
  let offset = 0;
  const chunks = [];

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const dataBytes = typeof content === 'string' ? enc.encode(content) : content;
    const crc = crc32(dataBytes);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);      // firma local
    lv.setUint16(4, 20, true);              // versión
    lv.setUint16(6, 0, true);               // flags
    lv.setUint16(8, 0, true);               // método 0 = almacenado
    lv.setUint16(10, 0, true);              // hora
    lv.setUint16(12, 0, true);              // fecha
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    chunks.push(local, dataBytes);
    entries.push({ nameBytes, crc, size: dataBytes.length, offset });
    offset += local.length + dataBytes.length;
  }

  const central = [];
  let centralSize = 0;
  for (const e of entries) {
    const h = new Uint8Array(46 + e.nameBytes.length);
    const hv = new DataView(h.buffer);
    hv.setUint32(0, 0x02014b50, true);
    hv.setUint16(4, 20, true);
    hv.setUint16(6, 20, true);
    hv.setUint16(8, 0, true);
    hv.setUint16(10, 0, true);
    hv.setUint16(12, 0, true);
    hv.setUint16(14, 0, true);
    hv.setUint32(16, e.crc, true);
    hv.setUint32(20, e.size, true);
    hv.setUint32(24, e.size, true);
    hv.setUint16(28, e.nameBytes.length, true);
    hv.setUint16(30, 0, true);
    hv.setUint16(32, 0, true);
    hv.setUint16(34, 0, true);
    hv.setUint16(36, 0, true);
    hv.setUint32(38, 0, true);
    hv.setUint32(42, e.offset, true);
    h.set(e.nameBytes, 46);
    central.push(h);
    centralSize += h.length;
  }

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const blob = new Blob([...chunks, ...central, end], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Prepara el paquete completo de exportación con su archivo LÉEME. */
export function buildExportBundle(tables, { className, pseudonymised, generatedAt = new Date() }) {
  const files = {};
  for (const [name, rows] of Object.entries(tables)) {
    files[name] = '﻿' + toCsv(rows);
  }
  files['LEEME.txt'] = readme({ className, pseudonymised, generatedAt, tables });
  return files;
}

function readme({ className, pseudonymised, generatedAt, tables }) {
  const counts = Object.entries(tables).map(([k, v]) => `  ${k}: ${v.length} filas`).join('\n');
  return `STATLAB — exportación de datos
==============================================================

Clase:          ${className || '—'}
Generado:       ${generatedAt.toISOString()}
Modo:           ${pseudonymised ? 'PSEUDONIMIZADA' : 'IDENTIFICADA'}

Archivos incluidos:
${counts}

FORMATO
  · Codificación UTF-8 con BOM (Excel abre los acentos correctamente).
  · Separador de columnas: coma (,).
  · Separador decimal: punto (.).
  · Texto entrecomillado según RFC 4180.
  · Booleanos: 0 / 1.
  · Fechas: ISO 8601 (UTC).

LECTURA
  R:       datos <- read.csv("attempts.csv", encoding = "UTF-8")
  Python:  import pandas as pd; df = pd.read_csv("attempts.csv")
  SPSS:    Archivo → Abrir → Datos → tipo "CSV", delimitador coma, UTF-8.
  Excel:   doble clic (el BOM fuerza UTF-8).

CLAVE DE UNIÓN
  Todas las tablas comparten la columna student_uuid, así que se pueden unir:
  R:       merge(attempts, progress, by = "student_uuid")
  pandas:  attempts.merge(progress, on = "student_uuid")

${pseudonymised ? `PSEUDONIMIZACIÓN
  La columna student_uuid NO es el identificador real: es un valor derivado por
  hash, estable entre exportaciones, que permite seguir a la misma persona a lo
  largo del tiempo sin identificarla. No se incluyen nombre, apellidos ni
  correo electrónico. Aun así, los datos siguen siendo datos personales
  pseudonimizados a efectos del RGPD: consérvalos con las mismas cautelas y no
  los publiques junto a información que permita reidentificar (por ejemplo, un
  grupo de prácticas de tres personas).` : `DATOS IDENTIFICADOS
  Esta exportación INCLUYE nombre, apellidos y correo electrónico. Son datos
  personales: guárdalos en un soporte cifrado, no los envíes por canales no
  seguros y bórralos cuando ya no sean necesarios para el seguimiento docente.
  Para análisis o publicación usa la exportación PSEUDONIMIZADA.`}

AVISO PEDAGÓGICO
  XP, Challenge Points y mastery son indicadores formativos del uso de la
  plataforma. NO son calificaciones académicas y no deben convertirse
  automáticamente en notas.
`;
}

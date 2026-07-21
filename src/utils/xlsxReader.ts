/**
 * Lector mínimo de .xlsx para el importador de fallas.
 *
 * Un .xlsx es un ZIP con XML dentro. Se descomprime con fflate (cargado bajo
 * demanda) y se extraen las filas de la primera hoja como texto TSV, para
 * alimentarlo al mismo parseFallas() que usa el pegado y el CSV.
 *
 * Las fechas y horas de Excel se guardan como números (serial de días y
 * fracción de día). Aquí NO se convierten: se dejan como el número crudo y es
 * parseFecha/parseHora quien los interpreta, porque solo ahí se sabe —por la
 * columna— si un número es una fecha, una hora o una potencia.
 */

/** 'A' -> 0, 'B' -> 1, 'AA' -> 26, ... */
function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/** Extrae los textos compartidos (sharedStrings.xml). */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const parts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]);
    out.push(decodeEntities(parts.join('')));
  }
  return out;
}

/** Resuelve el archivo de la PRIMERA hoja del libro (por orden en workbook.xml). */
function firstSheetPath(files: Record<string, Uint8Array>, dec: (u: Uint8Array) => string): string {
  const wb = files['xl/workbook.xml'];
  const rels = files['xl/_rels/workbook.xml.rels'];
  if (wb && rels) {
    const rid = (dec(wb).match(/<sheet[^>]*r:id="([^"]+)"/) || [])[1];
    if (rid) {
      const target = (dec(rels).match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`)) || [])[1];
      if (target) {
        const clean = target.replace(/^\/?xl\//, '').replace(/^\//, '');
        if (files[`xl/${clean}`]) return `xl/${clean}`;
        if (files[target.replace(/^\//, '')]) return target.replace(/^\//, '');
      }
    }
  }
  // Respaldo: la hoja 1 por convención.
  return 'xl/worksheets/sheet1.xml';
}

/** Convierte una hoja a matriz densa de celdas (texto). */
function sheetToRows(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const cells: string[] = [];
    const cellRe = /<c[^>]*r="([A-Z]+)\d+"([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rm[2]))) {
      const idx = colToIndex(cm[1]);
      const attrs = cm[2] || '';
      const inner = cm[3] || '';
      const t = (attrs.match(/t="([^"]+)"/) || [])[1];
      let value = '';
      if (t === 'inlineStr') {
        value = decodeEntities([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
      } else {
        const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (v !== undefined) value = t === 's' ? (shared[Number(v)] ?? '') : decodeEntities(v);
      }
      cells[idx] = value;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
    rows.push(cells);
  }
  return rows;
}

/**
 * Lee un .xlsx y devuelve la primera hoja como texto TSV (filas por salto de
 * línea, celdas por tabulador), listo para parseFallas().
 */
export async function readXlsxToText(file: File): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const buf = new Uint8Array(await file.arrayBuffer());
  const files = unzipSync(buf);
  const dec = (u: Uint8Array) => strFromU8(u);

  const sharedXml = files['xl/sharedStrings.xml'];
  const shared = sharedXml ? parseSharedStrings(dec(sharedXml)) : [];

  const sheetPath = firstSheetPath(files, dec);
  const sheetU8 = files[sheetPath];
  if (!sheetU8) throw new Error('No se encontró la hoja de datos en el archivo.');

  const rows = sheetToRows(dec(sheetU8), shared);
  return rows.map((r) => r.join('\t')).join('\n');
}

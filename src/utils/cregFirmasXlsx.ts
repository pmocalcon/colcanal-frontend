import type { XlsxRow } from './xlsxWriter';

/**
 * Bloque de firmas al pie de los Excel de CREG (Liquidación, ID OFF, ID ON).
 *
 * Dos columnas de firma: la Interventoría a la izquierda y el representante
 * legal del municipio a la derecha, cada una con su raya, el nombre en negrilla
 * y el cargo debajo.
 *
 * Los nombres salen de la hoja de Parámetros del municipio; si no están, la raya
 * se imprime igual para firmar a mano.
 */

export interface FirmasOpciones {
  /** Total de columnas de la hoja (A..). Define hasta dónde llega cada bloque. */
  columnas: number;
  /** Nombre de quien firma por la Interventoría. */
  interventoria?: string | null;
  /** Nombre del representante legal. */
  representanteLegal?: string | null;
  /** Empresa/municipio: acompaña al cargo del representante legal. */
  empresa?: string | null;
}

/** 0→A … 25→Z. Las hojas de CREG no pasan de la Z. */
const CL = (i: number) => String.fromCharCode(65 + i);

/**
 * Agrega el bloque al final de `rows` y registra sus combinaciones en `merges`.
 * Muta los dos arreglos, que es como los construyen las páginas.
 */
export function agregarFirmas(
  rows: XlsxRow[],
  merges: string[],
  { columnas, interventoria, representanteLegal, empresa }: FirmasOpciones,
): void {
  const blank = (): XlsxRow => Array.from({ length: columnas }, () => ({ v: '' as string }));

  // Aire entre la tabla y las firmas.
  rows.push(blank(), blank(), blank());

  // La hoja se parte en dos mitades: la izquierda arranca en A, la derecha en
  // la primera columna de la segunda mitad.
  const medio = Math.floor(columnas / 2);
  const izqIni = 0;
  const izqFin = Math.max(0, medio - 2); // deja una columna de aire al centro
  const derIni = Math.min(columnas - 1, medio + 1);
  const derFin = columnas - 1;

  const filaRaya = rows.length + 1; // 1-based, como las referencias de Excel
  const raya = blank();
  raya[izqIni] = { v: '', s: 'signLine' };
  raya[derIni] = { v: '', s: 'signLine' };
  rows.push(raya);

  const filaNombre = rows.length + 1;
  const nombres = blank();
  nombres[izqIni] = { v: (interventoria ?? '').toString().toUpperCase(), s: 'signName' };
  nombres[derIni] = { v: (representanteLegal ?? '').toString().toUpperCase(), s: 'signName' };
  rows.push(nombres);

  const filaCargo = rows.length + 1;
  const cargos = blank();
  cargos[izqIni] = { v: 'INTERVENTORÍA', s: 'signRole' };
  cargos[derIni] = {
    v: `REPRESENTANTE LEGAL ${(empresa ?? '').toUpperCase()}`.trim(),
    s: 'signRole',
  };
  rows.push(cargos);

  for (const f of [filaRaya, filaNombre, filaCargo]) {
    merges.push(
      `${CL(izqIni)}${f}:${CL(izqFin)}${f}`,
      `${CL(derIni)}${f}:${CL(derFin)}${f}`,
    );
  }
}

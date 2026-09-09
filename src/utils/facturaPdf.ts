/**
 * Lectura de la representación gráfica en PDF de la factura electrónica.
 *
 * Es el camino de segunda y hay que decirlo de frente: el XML **declara** sus cifras
 * —cada importe viene en su etiqueta y no hay nada que interpretar—, mientras que el PDF
 * solo tiene texto pintado en una página, y sacar de ahí «cuál de estos números es el
 * subtotal» es leerle la mente al que diseñó el formato. Cada proveedor tecnológico
 * arma el suyo distinto.
 *
 * Por eso acá todo lo leído queda marcado como leído del PDF, se muestra **el texto que
 * se alcanzó a leer** junto al resultado, y lo que no se encuentra se reporta como no
 * encontrado en vez de suponerlo. Un número mal leído en un control contable es peor que
 * un número ausente: el ausente se busca a mano, el mal leído se aprueba.
 *
 * Los PDF escaneados —una foto de la factura— no traen texto y no se pueden leer. Se
 * detecta y se dice, en vez de devolver una factura en blanco.
 */

/** Una línea reconstruida de la página, con el texto en orden de lectura. */
interface LineaPdf {
  /** Página en la que está, empezando en 1. */
  pagina: number;
  texto: string;
}

const sinTildes = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Convierte a número un importe escrito para leerlo.
 *
 * Tiene que aguantar las dos convenciones porque las dos aparecen: «45.000.000,00» a la
 * colombiana y «45,000,000.00» a la inglesa, que algunos proveedores dejan salir. Se
 * decide por el último separador: si lo siguen una o dos cifras es el decimal, y si lo
 * siguen tres es un separador de miles. No hay ambigüedad real, porque nadie escribe
 * milésimas de peso.
 */
export const importeEscrito = (t: string): number | null => {
  let s = t.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;

  const coma = s.lastIndexOf(',');
  const punto = s.lastIndexOf('.');
  const ultimo = Math.max(coma, punto);
  if (ultimo >= 0) {
    const decimales = s.length - ultimo - 1;
    s = decimales === 1 || decimales === 2
      ? s.slice(0, ultimo).replace(/[.,]/g, '') + '.' + s.slice(ultimo + 1)
      : s.replace(/[.,]/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * El último importe de una línea.
 *
 * En una representación gráfica el rótulo va a la izquierda y la cifra a la derecha
 * —«TOTAL A PAGAR ... $ 45.000.000,00»—, así que el número que interesa es el último de
 * la línea y no el primero: en el primero suelen caer el número de ítem o el porcentaje.
 */
const importeDeLinea = (linea: string): number | null => {
  const encontrados = linea.match(/\$?\s*\d[\d.,]*/g);
  if (!encontrados) return null;
  for (let i = encontrados.length - 1; i >= 0; i--) {
    const n = importeEscrito(encontrados[i]);
    // Se descartan los números pequeños: son consecutivos, cantidades y porcentajes,
    // no importes de una factura de alumbrado público.
    if (n != null && n >= 1000) return n;
  }
  return null;
};

/** El primer importe de la primera línea cuyo rótulo case, con el rótulo que casó. */
const buscarImporte = (
  lineas: LineaPdf[],
  casa: (rotulo: string) => boolean,
): { valor: number; linea: string } | null => {
  for (const l of lineas) {
    if (!casa(sinTildes(l.texto))) continue;
    const valor = importeDeLinea(l.texto);
    if (valor != null) return { valor, linea: l.texto.trim() };
  }
  return null;
};

/** Lo que se pudo sacar de la representación gráfica. */
export interface LecturaPdf {
  numero: string | null;
  cufe: string | null;
  fechaEmision: string | null;
  baseGravable: number | null;
  totalConImpuestos: number | null;
  totalAPagar: number | null;
  impuestos: { nombre: string; valor: number; porcentaje: number | null }[];
  retenciones: { nombre: string; valor: number; porcentaje: number | null }[];
  /** El texto que se leyó, línea por línea. Es la prueba de lo que se interpretó. */
  lineas: string[];
}

/**
 * Reconstruye las líneas de la página a partir de los fragmentos de texto.
 *
 * `getTextContent` no entrega renglones sino trozos sueltos con su posición, y un rótulo
 * y su cifra casi siempre son trozos distintos. Se agrupan por la coordenada vertical
 * —los que están a la misma altura son el mismo renglón— y se ordenan por la horizontal.
 * Sin esto, «TOTAL A PAGAR» y «45.000.000» quedarían separados y no habría cómo saber
 * cuál cifra le corresponde a cuál rótulo.
 */
const lineasDeLaPagina = (
  items: { str: string; transform: number[] }[],
  pagina: number,
): LineaPdf[] => {
  const filas = new Map<number, { x: number; str: string }[]>();
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const y = Math.round(it.transform[5]);
    // Se redondea a dos puntos: dentro de un mismo renglón los trozos varían un poco
    // en altura, sobre todo cuando cambia el tamaño de la letra.
    const clave = Math.round(y / 2) * 2;
    const fila = filas.get(clave) ?? [];
    fila.push({ x: it.transform[4], str: it.str });
    filas.set(clave, fila);
  }
  return [...filas.entries()]
    .sort((a, b) => b[0] - a[0]) // de arriba hacia abajo
    .map(([, fila]) => ({
      pagina,
      texto: fila.sort((a, b) => a.x - b.x).map((f) => f.str).join(' ').replace(/\s+/g, ' '),
    }));
};

/**
 * Los rótulos con que cada cifra aparece en las representaciones gráficas.
 *
 * Van varios por concepto porque no hay un formato único: la misma cifra es «Subtotal»
 * en un proveedor, «Total Bruto Factura» en otro y «Valor antes de impuestos» en un
 * tercero. El orden importa: se toma el primero que aparezca en el documento.
 */
const ROTULOS = {
  base: (r: string) =>
    /subtotal|total bruto|valor bruto|base gravable|antes de impuestos|suma total bruta/.test(r),
  conImpuestos: (r: string) =>
    /total factura|valor total|total con impuestos|total mas impuestos/.test(r),
  aPagar: (r: string) =>
    /total a pagar|valor a pagar|neto a pagar|total neto/.test(r),
};

/**
 * Los renglones de texto de un PDF, en orden de lectura.
 *
 * Va aparte del lector de facturas porque la orden de pago del municipio se lee del
 * mismo modo: lo que cambia entre los dos documentos es qué se busca, no cómo se saca
 * el texto de la página. Todo lo de pdf.js —el worker, la tarea de carga, las páginas—
 * vive acá una sola vez.
 */
export async function lineasDelPdf(datos: ArrayBuffer): Promise<LineaPdf[]> {
  /*
   * pdf.js se carga solo cuando alguien suelta un PDF. Pesa más que el resto de la
   * pantalla junta y la mayoría de las facturas entran por el XML, que no lo necesita.
   */
  const pdfjs = await import('pdfjs-dist');
  const { default: workerSrc } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  /*
   * Se guarda la tarea de carga y no solo el documento: lo que libera el worker es
   * `tarea.destroy()`, no el documento. Sin esto queda un hilo vivo por cada documento
   * que alguien abra, y quien revisa un mes abre varios seguidos.
   */
  const tarea = pdfjs.getDocument({ data: new Uint8Array(datos) });
  const doc = await tarea.promise;

  const lineas: LineaPdf[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const pagina = await doc.getPage(p);
      const contenido = await pagina.getTextContent();
      lineas.push(...lineasDeLaPagina(
        contenido.items.filter((i): i is typeof i & { str: string; transform: number[] } =>
          'str' in i && 'transform' in i),
        p,
      ));
    }
  } finally {
    await tarea.destroy();
  }

  if (lineas.length === 0) {
    throw new Error(
      'El PDF no tiene texto: es una imagen escaneada. De un documento escaneado no se '
      + 'pueden sacar las cifras.',
    );
  }
  return lineas;
}

export async function leerFacturaPdf(datos: ArrayBuffer): Promise<LecturaPdf> {
  const lineas = await lineasDelPdf(datos);
  const todo = lineas.map((l) => l.texto).join('\n');

  const base = buscarImporte(lineas, ROTULOS.base);
  const conImpuestos = buscarImporte(lineas, ROTULOS.conImpuestos);
  const aPagar = buscarImporte(lineas, ROTULOS.aPagar);

  const impuestos: LecturaPdf['impuestos'] = [];
  const iva = buscarImporte(lineas, (r) => /\biva\b/.test(r) && !/sin iva|no responsable/.test(r));
  if (iva) impuestos.push({ nombre: 'IVA', valor: iva.valor, porcentaje: null });

  const retenciones: LecturaPdf['retenciones'] = [];
  for (const [nombre, patron] of [
    ['ReteFuente', /rete\s?fuente|retencion en la fuente|rte\.? *fte/],
    ['ReteICA', /rete\s?ica|retencion de ica|rte\.? *ica/],
    ['Timbre', /timbre/],
    ['Estampillas', /estampilla/],
  ] as [string, RegExp][]) {
    const r = buscarImporte(lineas, (rot) => patron.test(rot));
    if (r) retenciones.push({ nombre, valor: r.valor, porcentaje: null });
  }

  const cufe = /\b([0-9a-f]{96})\b/i.exec(todo)?.[1]
    ?? /cufe[^0-9a-z]{0,12}([0-9a-f]{40,})/i.exec(todo)?.[1]
    ?? null;

  const fecha =
    /(\d{4}-\d{2}-\d{2})/.exec(todo)?.[1]
    ?? (() => {
      const m = /(\d{2})[/-](\d{2})[/-](\d{4})/.exec(todo);
      return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
    })();

  const numero =
    /(?:factura(?:\s+electr[oó]nica)?(?:\s+de\s+venta)?)[^\n]{0,30}?(?:n[o°ºu]\.?|n[uú]mero|#)[:\s]*([A-Z0-9][A-Z0-9-]{2,24})/i.exec(todo)?.[1]
    ?? /\b([A-Z]{2,6}-?\d{3,12})\b/.exec(todo)?.[1]
    ?? null;

  if (!base && !conImpuestos && !aPagar) {
    throw new Error(
      'Se leyó el PDF pero no se encontró ningún total con un rótulo reconocible. '
      + 'Cargue el XML de la factura, que trae las cifras declaradas.',
    );
  }

  return {
    numero,
    cufe,
    fechaEmision: fecha,
    baseGravable: base?.valor ?? null,
    totalConImpuestos: conImpuestos?.valor ?? null,
    totalAPagar: aPagar?.valor ?? null,
    impuestos,
    retenciones,
    lineas: lineas.map((l) => l.texto),
  };
}

import { importeEscrito, lineasDelPdf } from './facturaPdf';

/**
 * Lectura de la orden de pago del municipio.
 *
 * **No es una tabla, es una carta.** El municipio le escribe a la fiduciaria pidiéndole
 * que pague, y las cifras van dentro de las frases: «presentada por valor de ($ ...)»,
 * «El valor neto por girar ... es la suma de ... ($ ...)», «se le realiza el descuento de
 * RETENCION DE ICA $ ... y RETENCIÓN EN LA FUENTE (6%) $ ...».
 *
 * Eso obliga a leerla distinto que la factura. En una representación gráfica el rótulo
 * está a la izquierda y su cifra a la derecha, y basta con emparejarlos; acá un mismo
 * renglón trae tres importes seguidos y el que interesa es el que va después de una
 * frase concreta. Por eso se busca por la frase que ancla cada cifra y no por rótulos
 * sueltos: en «descuento de ICA $ 2.990.248 y FUENTE (6%) $ 22.426.865» un lector de
 * rótulos se llevaría el último número para las dos retenciones.
 *
 * Es lectura de mejor esfuerzo y así se reporta: lo que no se encuentra queda en nulo, y
 * la pantalla muestra el texto leído para poder revisar la interpretación. Un número mal
 * leído en un cotejo de plata es peor que un número ausente.
 */

export interface LecturaOrdenPago {
  /** El consecutivo de la factura que la orden manda pagar. */
  numeroFactura: string | null;
  /** El oficio o radicado de la propia orden. */
  oficio: string | null;
  /** Municipio al que se refiere, tal como lo nombra la carta. */
  municipio: string | null;
  /** El mes del servicio que se está pagando, en minúsculas. */
  mesServicio: string | null;
  /** Lo que la orden dice que se presentó a cobro: comparable con el subtotal. */
  valorPresentado: number | null;
  /** Lo que se gira de verdad: comparable con el valor pago. */
  valorNeto: number | null;
  /** Lo que suman los descuentos, según la propia carta. */
  totalDescuentos: number | null;
  retenciones: { key: string; nombre: string; valor: number; porcentaje: number | null }[];
  /** El texto que se leyó, renglón por renglón. Es la prueba de la interpretación. */
  lineas: string[];
}

/**
 * El importe que sigue a una frase.
 *
 * Se admite cualquier cosa entre la frase y el signo pesos —«es la suma de TRESCIENTOS
 * CUARENTA Y OCHO MILLONES ... M/CTE ($ 348.363.979,60)»— porque estas cartas escriben
 * la cifra en letras antes de ponerla en números. Lo que no se admite es saltarse otro
 * importe por el camino: `[^$]` corta en el primer peso que aparezca, que es el que la
 * frase estaba anunciando.
 */
const trasLaFrase = (texto: string, frase: RegExp): number | null => {
  /*
   * La frase va envuelta en `(?:…)` y no pegada tal cual. Casi todas traen alternativas
   * —«retención en la fuente|retefuente|rte. fte»— y al concatenarlas sin agrupar, el
   * `|` se lleva por delante el resto: el patrón pasa a decir «A, o B, o C seguido del
   * importe», así que al casar por A la captura queda sin participar y devuelve
   * `undefined`. Un paréntesis es la diferencia entre leer la cifra y no leer nada.
   */
  const re = new RegExp(`(?:${frase.source})` + String.raw`[^$]{0,200}?\$\s*([\d.,]+)`, 'i');
  const m = re.exec(texto);
  return m?.[1] ? importeEscrito(m[1]) : null;
};

/** Las retenciones que estas cartas nombran, con el concepto del sistema al que van. */
const RETENCIONES: { key: string; nombre: string; frase: RegExp }[] = [
  {
    key: 'rteFte',
    nombre: 'Retención en la fuente',
    frase: /retenci[oó]n\s+en\s+la\s+fuente|rete\s?fuente|rte\.?\s*fte/,
  },
  {
    key: 'rteIca',
    nombre: 'Retención de ICA',
    frase: /retenci[oó]n\s+de\s+ica|rete\s?ica|rte\.?\s*ica/,
  },
  { key: 'timbre', nombre: 'Timbre', frase: /timbre/ },
  { key: 'estampillas', nombre: 'Estampillas', frase: /estampilla/ },
];

/**
 * El porcentaje que la carta pone junto a la retención: «EN LA FUENTE (6%) $ ...».
 *
 * Sirve para cotejar la tarifa y no solo el valor: si el municipio retuvo al 4% donde
 * Parámetros dice 6%, las dos cifras difieren y el porcentaje explica por qué.
 */
const porcentajeTras = (texto: string, frase: RegExp): number | null => {
  const re = new RegExp(`(?:${frase.source})` + String.raw`\s*\(?\s*([\d,.]+)\s*%`, 'i');
  const m = re.exec(texto);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export async function leerOrdenPagoPdf(datos: ArrayBuffer): Promise<LecturaOrdenPago> {
  const lineas = await lineasDelPdf(datos);
  // Se une con espacio y no con salto: la carta parte sus frases en varios renglones y
  // «el valor neto por girar de la factura» puede quedar cortado a la mitad.
  const todo = lineas.map((l) => l.texto).join(' ').replace(/\s+/g, ' ');

  const valorPresentado =
    trasLaFrase(todo, /presentada\s+por\s+valor\s+de/)
    ?? trasLaFrase(todo, /por\s+valor\s+de/);

  const valorNeto =
    trasLaFrase(todo, /valor\s+neto\s+por\s+girar/)
    ?? trasLaFrase(todo, /valor\s+neto/)
    ?? trasLaFrase(todo, /neto\s+a\s+(?:pagar|girar)/);

  const totalDescuentos =
    trasLaFrase(todo, /descuentos\s+legales/)
    ?? trasLaFrase(todo, /total\s+(?:de\s+)?descuentos/);

  const retenciones: LecturaOrdenPago['retenciones'] = [];
  for (const r of RETENCIONES) {
    const valor = trasLaFrase(todo, r.frase);
    if (valor == null) continue;
    retenciones.push({
      key: r.key,
      nombre: r.nombre,
      valor,
      porcentaje: porcentajeTras(todo, r.frase),
    });
  }

  const numeroFactura =
    /factura\s+No\.?\s*([A-Z0-9][A-Z0-9-]{1,20})/i.exec(todo)?.[1]
    ?? /remisi[oó]n\s+de\s+factura[^A-Z0-9]{0,20}([A-Z0-9][A-Z0-9-]{1,20})/i.exec(todo)?.[1]
    ?? null;

  /*
   * El radicado va anclado a su forma final —«224-2026»— y no a un largo de caracteres:
   * la carta lo escribe como «oficio No EAAAP ESP-SG 224-2026», sin separador que diga
   * dónde termina, y cortar por longitud se traía media frase siguiente.
   */
  const oficio = /oficio\s+No\.?\s*([A-Za-z][A-Za-z0-9\s.-]{0,28}?\d{2,5}-\d{4})/i
    .exec(todo)?.[1]?.trim() ?? null;

  /*
   * El nombre del municipio termina donde empieza la puntuación. Se acepta que no haya
   * espacio antes de la coma, que es como está escrito: «municipio de Puerto Asís, se
   * tramite…». Exigiendo el espacio no casaba ningún municipio de nombre compuesto.
   */
  const municipio = /municipio\s+de\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+){0,3}?)(?=\s*(?:de\s+acuerdo|[.,]|$))/i
    .exec(todo)?.[1]?.trim() ?? null;

  const mesServicio = new RegExp(`mes\\s+de\\s+(${MESES.join('|')})`, 'i')
    .exec(todo)?.[1]?.toLowerCase() ?? null;

  if (valorPresentado == null && valorNeto == null && retenciones.length === 0) {
    throw new Error(
      'Se leyó el PDF pero no se encontró ninguna cifra de la orden: ni el valor '
      + 'presentado, ni el neto a girar, ni los descuentos. Verifique que sea la orden '
      + 'de pago del municipio.',
    );
  }

  return {
    numeroFactura,
    oficio,
    municipio,
    mesServicio,
    valorPresentado,
    valorNeto,
    totalDescuentos,
    retenciones,
    lineas: lineas.map((l) => l.texto),
  };
}

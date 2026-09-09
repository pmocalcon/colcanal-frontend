/**
 * Lector de la factura electrónica de la DIAN.
 *
 * Lee el archivo tal como llega del proveedor tecnológico —el XML suelto o el ZIP que lo
 * trae dentro— y devuelve sus cifras. No consulta a la DIAN ni valida el CUFE: para eso
 * está el portal de la DIAN. Acá el archivo se usa como **fuente de las cifras**, para
 * poder enfrentarlas con las que armó el sistema sin que nadie las transcriba.
 *
 * Se hace en el navegador y no en el servidor a propósito: el archivo no se guarda ni se
 * sube a ninguna parte. Es una lectura de un momento, como poner la factura al lado de la
 * pantalla, y así no hay que decidir dónde se archivan facturas ni por cuánto tiempo.
 *
 * Tres formas de archivo, que son las tres en que llega:
 *
 * 1. `Invoice` — el XML de la factura, tal cual.
 * 2. `AttachedDocument` — el sobre que firma el proveedor tecnológico. La factura de
 *    verdad va **adentro, como texto**, dentro de un CDATA; hay que sacarla y volverla
 *    a leer. Es la forma más común de lo que llega por correo.
 * 3. `.zip` — cualquiera de los dos anteriores comprimido, casi siempre junto al PDF.
 *
 * Los nombres de las etiquetas se buscan por su nombre local y nunca por el prefijo
 * (`cbc:`, `cac:`): el prefijo lo elige quien genera el XML y cambia entre proveedores,
 * mientras que el nombre local lo fija el estándar UBL.
 */

export interface FacturaDianLinea {
  descripcion: string;
  valor: number;
}

/** Un impuesto o una retención de la factura. */
export interface FacturaDianTributo {
  /** IVA, INC, ReteFuente, ReteICA… tal como lo nombra el XML. */
  nombre: string;
  valor: number;
  /** El porcentaje aplicado, si el XML lo trae. */
  porcentaje: number | null;
}

export interface FacturaDian {
  /** El consecutivo, con su prefijo. */
  numero: string;
  cufe: string | null;
  /** 'YYYY-MM-DD'. */
  fechaEmision: string | null;
  moneda: string | null;
  emisor: { nombre: string; nit: string | null };
  adquiriente: { nombre: string; nit: string | null };
  lineas: FacturaDianLinea[];
  /** Suma de las líneas, antes de impuestos. Es lo comparable con el subtotal. */
  baseGravable: number | null;
  /** Base más impuestos. */
  totalConImpuestos: number | null;
  /** Lo que el documento dice que hay que pagar. */
  totalAPagar: number | null;
  impuestos: FacturaDianTributo[];
  /**
   * Retenciones que trae el propio documento.
   *
   * Suele venir vacío, y eso no es un error: la retención la practica quien paga, no
   * quien factura, así que la mayoría de las facturas no la traen. Quien la lea tiene
   * que distinguir «no la trae» de «la trae distinta».
   */
  retenciones: FacturaDianTributo[];
  archivo: string;
}

/** Error con un texto que se le puede mostrar a quien cargó el archivo. */
export class FacturaDianError extends Error {}

// ── Recorrido del XML ────────────────────────────────────────────────

/** Los hijos directos con ese nombre local, sin importar el prefijo del espacio. */
const hijos = (nodo: Element | Document, nombre: string): Element[] => {
  const salida: Element[] = [];
  const lista = 'children' in nodo ? nodo.children : [];
  for (const el of Array.from(lista)) {
    if (el.localName === nombre) salida.push(el);
  }
  return salida;
};

/** El primer hijo directo con ese nombre local. */
const hijo = (nodo: Element | Document | null, nombre: string): Element | null =>
  nodo ? (hijos(nodo, nombre)[0] ?? null) : null;

/** Baja por una ruta de nombres locales: `ruta(inv, 'LegalMonetaryTotal', 'PayableAmount')`. */
const ruta = (nodo: Element | Document | null, ...nombres: string[]): Element | null =>
  nombres.reduce<Element | Document | null>((n, nombre) => hijo(n, nombre), nodo) as Element | null;

/** El primer descendiente con ese nombre local, a cualquier profundidad. */
const buscar = (nodo: Element | Document, nombre: string): Element | null => {
  const lista = nodo.getElementsByTagName('*');
  for (const el of Array.from(lista)) {
    if (el.localName === nombre) return el;
  }
  return null;
};

const texto = (el: Element | null): string => (el?.textContent ?? '').trim();

/**
 * El número de una etiqueta de importe.
 *
 * El XML siempre escribe los importes con punto decimal y sin separador de miles, así
 * que no hay que interpretar formatos locales; lo que puede faltar es la etiqueta.
 */
const numero = (el: Element | null): number | null => {
  const t = texto(el);
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

// ── Las partes de la factura ─────────────────────────────────────────

/**
 * El nombre y el NIT de una de las dos partes.
 *
 * El nombre puede estar en `RegistrationName` —el de la cámara de comercio— o en `Name`,
 * y no todos los proveedores llenan los dos. El NIT va en `CompanyID`, a veces con el
 * dígito de verificación pegado y a veces aparte; se devuelve sin él, porque es lo que
 * la gente reconoce como «el NIT».
 */
const parte = (contenedor: Element | null): { nombre: string; nit: string | null } => {
  const party = ruta(contenedor, 'Party');
  const legal = ruta(party, 'PartyTaxScheme') ?? ruta(party, 'PartyLegalEntity');
  const nombre =
    texto(ruta(legal, 'RegistrationName'))
    || texto(ruta(party, 'PartyName', 'Name'))
    || texto(ruta(party, 'PartyLegalEntity', 'RegistrationName'))
    || '';
  const nit = texto(ruta(legal, 'CompanyID')) || texto(ruta(party, 'PartyIdentification', 'ID'));
  return { nombre, nit: nit ? nit.replace(/\D/g, '').slice(0, 9) || null : null };
};

/** Los tributos de un bloque `TaxTotal` o `WithholdingTaxTotal`. */
const tributos = (invoice: Element, etiqueta: string): FacturaDianTributo[] => {
  const salida: FacturaDianTributo[] = [];
  for (const total of hijos(invoice, etiqueta)) {
    const subtotales = hijos(total, 'TaxSubtotal');
    if (subtotales.length === 0) {
      const valor = numero(ruta(total, 'TaxAmount'));
      if (valor != null) salida.push({ nombre: etiqueta === 'TaxTotal' ? 'Impuesto' : 'Retención', valor, porcentaje: null });
      continue;
    }
    for (const sub of subtotales) {
      const categoria = ruta(sub, 'TaxCategory');
      const nombre =
        texto(ruta(categoria, 'TaxScheme', 'Name'))
        || texto(ruta(categoria, 'TaxScheme', 'ID'))
        || (etiqueta === 'TaxTotal' ? 'Impuesto' : 'Retención');
      const valor = numero(ruta(sub, 'TaxAmount'));
      if (valor == null) continue;
      salida.push({ nombre, valor, porcentaje: numero(ruta(categoria, 'Percent')) });
    }
  }
  return salida;
};

/** Lee un documento ya parseado que se sabe que es un `Invoice`. */
const deInvoice = (invoice: Element, archivo: string): FacturaDian => {
  const totales = ruta(invoice, 'LegalMonetaryTotal');

  const lineas: FacturaDianLinea[] = hijos(invoice, 'InvoiceLine').map((l) => ({
    descripcion:
      texto(ruta(l, 'Item', 'Description'))
      || texto(ruta(l, 'Item', 'Name'))
      || '(sin descripción)',
    valor: numero(ruta(l, 'LineExtensionAmount')) ?? 0,
  }));

  return {
    numero: texto(hijo(invoice, 'ID')) || '(sin número)',
    cufe: texto(hijo(invoice, 'UUID')) || null,
    fechaEmision: texto(hijo(invoice, 'IssueDate')) || null,
    moneda: texto(hijo(invoice, 'DocumentCurrencyCode')) || null,
    emisor: parte(hijo(invoice, 'AccountingSupplierParty')),
    adquiriente: parte(hijo(invoice, 'AccountingCustomerParty')),
    lineas,
    baseGravable:
      numero(ruta(totales, 'LineExtensionAmount'))
      ?? numero(ruta(totales, 'TaxExclusiveAmount')),
    totalConImpuestos: numero(ruta(totales, 'TaxInclusiveAmount')),
    totalAPagar: numero(ruta(totales, 'PayableAmount')),
    impuestos: tributos(invoice, 'TaxTotal'),
    retenciones: tributos(invoice, 'WithholdingTaxTotal'),
    archivo,
  };
};

/**
 * Saca la factura de un texto XML, abriendo el sobre si viene envuelta.
 *
 * `AttachedDocument` es el sobre firmado del proveedor tecnológico: la factura va dentro
 * como texto plano, escapada o en un CDATA. `DOMParser` la entrega como el contenido de
 * `Description`, así que hay que volver a parsear ese texto.
 */
const deTextoXml = (xml: string, archivo: string, nivel = 0): FacturaDian => {
  if (nivel > 3) throw new FacturaDianError('El archivo tiene demasiados sobres anidados.');

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new FacturaDianError('El archivo no es un XML que se pueda leer.');
  }

  const raiz = doc.documentElement;
  if (!raiz) throw new FacturaDianError('El XML llegó vacío.');

  if (raiz.localName === 'Invoice') return deInvoice(raiz, archivo);

  // El sobre: la factura va dentro de Attachment → ExternalReference → Description.
  const dentro = texto(
    ruta(raiz, 'Attachment', 'ExternalReference', 'Description')
    ?? buscar(doc, 'Description'),
  );
  if (dentro.includes('<') && /Invoice|AttachedDocument/.test(dentro)) {
    return deTextoXml(dentro, archivo, nivel + 1);
  }

  // Algunos proveedores anidan el Invoice directamente, sin CDATA.
  const anidada = buscar(doc, 'Invoice');
  if (anidada) return deInvoice(anidada, archivo);

  throw new FacturaDianError(
    `El XML es un «${raiz.localName}» y no trae una factura adentro. `
    + 'Si tiene el ZIP que mandó la DIAN, cárguelo completo.',
  );
};

// ── La entrada ───────────────────────────────────────────────────────

/**
 * Lee el archivo que se cargó y devuelve las cifras de la factura.
 *
 * Lanza `FacturaDianError` con un texto que se le puede mostrar a quien lo cargó: qué
 * archivo cargó y qué se esperaba, que es lo que permite corregir sin adivinar.
 */
export async function leerFacturaDian(file: File): Promise<FacturaDian> {
  const nombre = file.name;
  const esZip = /\.zip$/i.test(nombre);

  if (!esZip && !/\.xml$/i.test(nombre)) {
    throw new FacturaDianError(
      'Se espera el XML de la factura electrónica o el ZIP en que la mandaron. '
      + 'El PDF es la representación gráfica y no trae las cifras en forma legible.',
    );
  }

  if (!esZip) return deTextoXml(await file.text(), nombre);

  // fflate ya se usa para leer libros de Excel; se carga aparte para no meterlo en
  // el paquete de quien nunca abre una factura.
  const { unzipSync, strFromU8 } = await import('fflate');
  const contenido = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const xmls = Object.keys(contenido).filter((n) => /\.xml$/i.test(n));
  if (xmls.length === 0) {
    throw new FacturaDianError(
      'El ZIP no trae ningún XML adentro; suele traer solo el PDF. '
      + 'Pida el archivo XML de la factura electrónica.',
    );
  }

  /*
   * Se prueban todos los XML del ZIP y no solo el primero: junto a la factura viajan
   * el documento firmado y a veces los eventos de acuse, y cuál va de primero depende
   * del proveedor. Si ninguno sirve se reporta el error del primero, que es el que más
   * probablemente describe lo que llegó.
   */
  let primerFallo: unknown = null;
  for (const n of xmls) {
    try {
      return deTextoXml(strFromU8(contenido[n]), `${nombre} → ${n}`);
    } catch (e) {
      primerFallo ??= e;
    }
  }
  throw primerFallo instanceof Error
    ? primerFallo
    : new FacturaDianError('Ningún XML del ZIP resultó ser una factura.');
}

/**
 * Compara dos nombres de empresa como los compararía una persona.
 *
 * No sirve el `===`: el mismo municipio aparece como «UT ALUMBRADO PUBLICO CIRCASIA» en
 * un lado y «Unión Temporal Alumbrado Público Circasia» en el otro. Se comparan las
 * palabras con contenido —quitando tildes, mayúsculas y las que se repiten en todos los
 * nombres— y basta con que compartan una para no dar la alarma.
 */
const RELLENO = new Set([
  'union', 'temporal', 'ut', 'alumbrado', 'publico', 'sa', 'sas', 'ltda', 'de', 'del',
  'la', 'el', 'los', 'las', 'y', 'consorcio', 'municipio', 'alcaldia',
]);

export const mismoNombreDeEmpresa = (a: string, b: string): boolean => {
  const palabras = (t: string) =>
    new Set(
      t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((p) => p.length > 2 && !RELLENO.has(p)),
    );
  const pa = palabras(a);
  const pb = palabras(b);
  if (pa.size === 0 || pb.size === 0) return true;
  for (const p of pa) if (pb.has(p)) return true;
  return false;
};

/**
 * Compara un inventario de campo contra el censo del SGE.
 *
 * El inventario llega como texto tabular: lo que Excel deja en el portapapeles
 * (TSV) o un CSV/XLSX ya convertido. Cada FILA es una luminaria física, así que
 * la cantidad de un tipo es cuántas veces aparece. El censo del SGE, en cambio,
 * guarda cantidades por UCAP.
 *
 * El puente NO puede ser la descripción literal. En el censo real de Puerto Asís
 * la misma luminaria de 35 W aparece escrita de ocho formas distintas —"LUMINARIA
 * LED DRAKE 35W", "LUMINARIA LED 35W", "LUMINARIA AXIA 35W 21 SCHREDE",
 * "UL-LINUS 35W"...— porque el campo trae la marca y el modelo. Y al revés,
 * "PROYECTOR LED DE 100W" y la UCAP "Proyector LED 100 W" son lo mismo con un
 * "DE" de diferencia.
 *
 * Lo que sí identifica a una UCAP es la terna **clase + tecnología + potencia**:
 * un proyector no es una luminaria aunque tengan la misma potencia, y la tarifa
 * CREG va por potencia. Esa terna es la clave; la marca se ignora.
 */

const sinTildes = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '');

const normHeader = (s: string): string =>
  sinTildes(s).toLowerCase().replace(/\s+/g, ' ').trim();

/** Clave de respaldo para lo que no se puede descomponer en la terna. */
export const claveDescripcion = (s: string): string =>
  `desc:${sinTildes(s).toLowerCase().replace(/[^a-z0-9]/g, '')}`;

/**
 * Clase del aparato. Un proyector y una luminaria de la misma potencia son
 * UCAPs distintas, así que la clase entra en la clave.
 */
export type Clase = 'PROYECTOR' | 'LUMINARIA SOLAR' | 'LUMINARIA';

export const claseDe = (desc: string): Clase => {
  const d = sinTildes(desc).toUpperCase();
  if (d.includes('PROYECTOR') || d.includes('REFLECTOR')) return 'PROYECTOR';
  if (d.includes('SOLAR')) return 'LUMINARIA SOLAR';
  return 'LUMINARIA';
};

/** Tecnologías conocidas, buscadas dentro de la descripción. */
const TECNOLOGIAS = ['LED', 'SODIO', 'MERCURIO', 'METAL HALIDE', 'HALOGENURO', 'FLUORESCENTE'];

export const tecnologiaDe = (desc: string): string | null => {
  const d = sinTildes(desc).toUpperCase();
  return TECNOLOGIAS.find((t) => d.includes(t)) ?? null;
};

/**
 * Potencia en W leída de la descripción: "35W", "35 W", "DE 100W", "LED 150".
 * Se toma el ÚLTIMO número seguido (o no) de W, que es como se escriben estas
 * descripciones; un "21" de modelo intercalado no la pisa.
 */
export const potenciaDe = (desc: string): number | null => {
  const d = sinTildes(desc).toUpperCase();
  const conW = [...d.matchAll(/(\d+(?:[.,]\d+)?)\s*W\b/g)];
  if (conW.length > 0) return Number(conW[conW.length - 1][1].replace(',', '.'));
  // Sin la W: "LUMINARIA LED 150". Se toma el último número del texto.
  const nums = [...d.matchAll(/(\d+(?:[.,]\d+)?)/g)];
  if (nums.length > 0) return Number(nums[nums.length - 1][1].replace(',', '.'));
  return null;
};

/** "35.00" | "35,00" -> 35. null si no parsea. */
const num = (raw: string): number | null => {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const limpio = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
};

export interface Terna {
  clase: Clase;
  tecnologia: string | null;
  potencia: number | null;
}

/** Clave estable de la terna; cae a la descripción si falta tecnología o potencia. */
export const claveDe = (t: Terna, descripcion: string): string =>
  t.tecnologia && t.potencia != null
    ? `${t.clase}|${t.tecnologia}|${t.potencia}`
    : claveDescripcion(descripcion);

/** "Luminaria LED 35 W" a partir de la terna. */
export const etiquetaDe = (t: Terna): string => {
  const clase = t.clase === 'LUMINARIA' ? 'Luminaria'
    : t.clase === 'PROYECTOR' ? 'Proyector' : 'Luminaria solar';
  return [clase, t.tecnologia, t.potencia != null ? `${t.potencia} W` : null]
    .filter(Boolean).join(' ');
};

// ============ Lado del archivo ============

const COL_TIPO = new Set([
  'tipo_material', 'tipo material', 'tipo de material', 's_tipo_material',
  'material', 'descripcion', 'descripcion material', 'elemento',
]);
const COL_TEC = new Set(['tecnologia', 's_tecnologia', 'tecnolog']);
const COL_POT = new Set(['potencia', 'potencia (w)', 'potencia w', 's_pot_w', 'pot']);

const detectSep = (line: string): string => {
  if (line.includes('\t')) return '\t';
  if (line.includes(';')) return ';';
  return ',';
};

/** Una descripción tal cual la escribe el archivo, con cuántas veces aparece. */
export interface DescripcionContada {
  descripcion: string;
  cantidad: number;
}

export interface TipoContado {
  clave: string;
  /** Nombre normalizado ("Luminaria LED 35 W"). */
  etiqueta: string;
  terna: Terna;
  cantidad: number;
  /** Cómo lo escribe el archivo; suele haber varias por marca. */
  descripciones: DescripcionContada[];
}

export interface ConteoInventario {
  tipos: TipoContado[];
  total: number;
  columnas: string[];
  avisos: string[];
  error?: string;
}

/**
 * Cuenta las filas del archivo agrupadas por clase + tecnología + potencia.
 *
 * Manda la columna POTENCIA sobre lo que diga la descripción: es el campo
 * estructurado del censo y es el que fija la tarifa. Cuando las dos se
 * contradicen (hay filas "PROYECTOR LED 146W" con POTENCIA=130) se cuenta por la
 * columna y se avisa, porque es un error del censo que hay que corregir allá y
 * no algo que esta pantalla deba tapar.
 */
export function contarInventario(text: string): ConteoInventario {
  const lineas = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lineas.length === 0) {
    return { tipos: [], total: 0, columnas: [], avisos: [], error: 'No hay nada que comparar.' };
  }

  const sep = detectSep(lineas[0]);
  const filas = lineas.map((l) => l.split(sep));

  let headerIdx = -1;
  let colTipo = -1;
  let colTec = -1;
  let colPot = -1;
  for (let i = 0; i < Math.min(filas.length, 10); i++) {
    const h = filas[i].map(normHeader);
    const t = h.findIndex((c) => COL_TIPO.has(c));
    const tec = h.findIndex((c) => COL_TEC.has(c));
    const pot = h.findIndex((c) => COL_POT.has(c));
    if (t >= 0 || (tec >= 0 && pot >= 0)) {
      headerIdx = i; colTipo = t; colTec = tec; colPot = pot;
      break;
    }
  }
  if (headerIdx < 0) {
    return {
      tipos: [], total: 0, columnas: [], avisos: [],
      error: 'No reconocí las columnas. Incluye la fila de títulos con TIPO_MATERIAL (o TECNOLOGIA y POTENCIA).',
    };
  }

  const columnas: string[] = [];
  if (colTipo >= 0) columnas.push(filas[headerIdx][colTipo].trim());
  if (colTec >= 0) columnas.push(filas[headerIdx][colTec].trim());
  if (colPot >= 0) columnas.push(filas[headerIdx][colPot].trim());

  const avisos: string[] = [];
  const acc = new Map<string, TipoContado>();
  let total = 0;
  let sinDatos = 0;
  /** Filas donde la descripción y la columna POTENCIA no coinciden. */
  const discordantes = new Map<string, { pot: number; n: number }>();

  for (let i = headerIdx + 1; i < filas.length; i++) {
    const fila = filas[i];
    if (fila.every((c) => (c ?? '').trim() === '')) continue;

    const desc = colTipo >= 0 ? (fila[colTipo] ?? '').trim() : '';
    const tecCol = colTec >= 0 ? (fila[colTec] ?? '').trim().toUpperCase() : '';
    const potCol = colPot >= 0 ? num(fila[colPot] ?? '') : null;

    // El export marca los vacíos con "0": es su nulo, no un dato.
    const descUtil = desc && desc !== '0' ? desc : '';
    if (!descUtil && !tecCol && potCol == null) { sinDatos++; continue; }

    const clase = claseDe(descUtil);
    const tecnologia = (tecCol && tecCol !== '0' ? tecCol : null) ?? tecnologiaDe(descUtil);
    const potDesc = potenciaDe(descUtil);
    const potencia = potCol ?? potDesc;

    if (potencia == null || !tecnologia) { sinDatos++; continue; }

    if (potCol != null && potDesc != null && potCol !== potDesc && descUtil) {
      const k = `${descUtil} → ${potCol} W`;
      const prev = discordantes.get(k);
      if (prev) prev.n++;
      else discordantes.set(k, { pot: potCol, n: 1 });
    }

    const terna: Terna = { clase, tecnologia, potencia };
    const clave = claveDe(terna, descUtil);
    const prev = acc.get(clave);
    if (prev) {
      prev.cantidad++;
      const d = prev.descripciones.find((x) => x.descripcion === descUtil);
      if (d) d.cantidad++;
      else if (descUtil) prev.descripciones.push({ descripcion: descUtil, cantidad: 1 });
    } else {
      acc.set(clave, {
        clave, terna, etiqueta: etiquetaDe(terna), cantidad: 1,
        descripciones: descUtil ? [{ descripcion: descUtil, cantidad: 1 }] : [],
      });
    }
    total++;
  }

  if (sinDatos > 0) {
    avisos.push(`Se omitieron ${sinDatos} fila(s) sin tecnología o sin potencia.`);
  }
  if (discordantes.size > 0) {
    const n = [...discordantes.values()].reduce((a, d) => a + d.n, 0);
    const detalle = [...discordantes.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 6)
      .map(([k, d]) => `${k} (${d.n})`)
      .join('; ');
    avisos.push(
      `En ${n} fila(s) la descripción y la columna POTENCIA no coinciden; se contó por la columna: ${detalle}${discordantes.size > 6 ? '…' : ''}. Conviene corregirlo en el censo.`,
    );
  }
  if (total === 0) avisos.push('No encontré filas de datos debajo de los encabezados.');

  return {
    tipos: [...acc.values()].sort((a, b) => b.cantidad - a.cantidad),
    total,
    columnas,
    avisos,
  };
}

// ============ Lado del SGE ============

/** Una UCAP concreta del censo, con su cantidad propia. */
export interface UcapDetalle {
  codigo: string;
  descripcion: string;
  cantidad: number;
}

export interface TipoSge {
  clave: string;
  /** Descripción tal cual la UCAP. */
  descripcion: string;
  etiqueta: string;
  cantidad: number;
  /**
   * Las UCAPs que aportan a este tipo, cada una con lo suyo. El archivo no sabe
   * de UCAPs —solo cuenta luminarias—, así que la comparación se hace por tipo;
   * pero el desglose es lo que permite ver de dónde sale la diferencia.
   */
  ucaps: UcapDetalle[];
  grupo: string | null;
}

/** Convierte una UCAP del censo en una entrada comparable. */
export function tipoSgeDe(
  descripcion: string,
  cantidad: number,
  codigo: string,
  grupo: string | null,
): TipoSge {
  const terna: Terna = {
    clase: claseDe(descripcion),
    tecnologia: tecnologiaDe(descripcion),
    potencia: potenciaDe(descripcion),
  };
  return {
    clave: claveDe(terna, descripcion),
    descripcion,
    etiqueta: terna.tecnologia && terna.potencia != null ? etiquetaDe(terna) : descripcion,
    cantidad,
    ucaps: [{ codigo, descripcion, cantidad }],
    grupo,
  };
}

/** Suma `b` dentro de `a` conservando el desglose por UCAP. */
export function fusionarTipoSge(a: TipoSge, b: TipoSge): void {
  a.cantidad += b.cantidad;
  for (const u of b.ucaps) {
    const prev = a.ucaps.find((x) => x.codigo === u.codigo && x.descripcion === u.descripcion);
    if (prev) prev.cantidad += u.cantidad;
    else a.ucaps.push({ ...u });
  }
  if (!a.descripcion.split(' / ').includes(b.descripcion)) {
    a.descripcion += ` / ${b.descripcion}`;
  }
}

// ============ Cruce ============

/** Una UCAP dentro de un tipo, ya con su propio cruce contra el archivo. */
export interface UcapComparada extends UcapDetalle {
  /** Cuántas del archivo le tocaron. */
  campo: number;
  /** campo − cantidad. */
  diferencia: number;
  /** Qué descripciones del archivo se le asignaron, para poder auditarlo. */
  desdeArchivo: DescripcionContada[];
}

export interface FilaComparacion {
  clave: string;
  etiqueta: string;
  /** Descripciones crudas del archivo que cayeron en este tipo. */
  descripcionesCampo: DescripcionContada[];
  /** Las UCAPs del tipo, cada una con su total y su diferencia. */
  ucaps: UcapComparada[];
  /** true si hubo que repartir el archivo entre varias UCAPs (es una decisión). */
  repartido: boolean;
  sge: number | null;
  campo: number | null;
  /** campo − sge. null si el tipo solo está en un lado. */
  diferencia: number | null;
}

/** Palabras de una descripción, con "100W" partido en "100" y "w". */
const tokens = (s: string): Set<string> => {
  const t = sinTildes(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const out = new Set<string>();
  for (const p of t.split(' ')) {
    if (!p) continue;
    const m = /^(\d+)([a-z]+)$/.exec(p);
    if (m) { out.add(m[1]); out.add(m[2]); } else out.add(p);
  }
  return out;
};

/** Jaccard entre dos descripciones: 1 = idénticas, 0 = nada en común. */
const parecido = (a: string, b: string): number => {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let comunes = 0;
  for (const x of A) if (B.has(x)) comunes++;
  return comunes / (A.size + B.size - comunes);
};

/**
 * Reparte las descripciones del archivo entre las UCAPs de un mismo tipo.
 *
 * Con una sola UCAP no hay nada que decidir: se lleva todo. Con varias —el
 * "Proyector Led 100W Nuevo" y el "Proyector Genérico LED 100 W Color" son dos
 * UCAPs de 100 W— el archivo no dice a cuál pertenece cada luminaria, así que
 * cada descripción se asigna a la UCAP con la que más se parece. Es una
 * heurística, no un dato: por eso queda registrada en `desdeArchivo` y la
 * pantalla lo marca, para que se pueda revisar en vez de darlo por cierto.
 */
function repartirEntreUcaps(
  ucaps: UcapDetalle[],
  descripciones: DescripcionContada[],
): UcapComparada[] {
  const out: UcapComparada[] = ucaps.map((u) => ({
    ...u, campo: 0, diferencia: -u.cantidad, desdeArchivo: [],
  }));
  if (out.length === 0) return out;

  for (const d of descripciones) {
    let mejor = out[0];
    let mejorPunt = -1;
    for (const u of out) {
      const p = parecido(d.descripcion, u.descripcion);
      // Empate: gana la UCAP con más cantidad en el censo, que es la principal.
      if (p > mejorPunt || (p === mejorPunt && u.cantidad > mejor.cantidad)) {
        mejor = u; mejorPunt = p;
      }
    }
    mejor.campo += d.cantidad;
    mejor.desdeArchivo.push(d);
  }
  for (const u of out) u.diferencia = u.campo - u.cantidad;
  return out;
}

export interface Comparacion {
  filas: FilaComparacion[];
  totalSge: number;
  totalCampo: number;
  conDiferencia: number;
  soloEnCampo: number;
  soloEnSge: number;
}

/**
 * Cruza el conteo del archivo con el censo del SGE.
 *
 * Se listan los tres casos —coincide, solo en el archivo, solo en el SGE— porque
 * un tipo que falta en un lado es justo lo que hay que revisar; ocultarlo daría
 * una comparación que siempre cuadra.
 */
export function compararConSge(
  inventario: TipoContado[],
  sge: TipoSge[],
): Comparacion {
  // Varias UCAPs pueden caer en la misma terna: se suman y se listan sus códigos.
  const porClaveSge = new Map<string, TipoSge>();
  for (const t of sge) {
    const prev = porClaveSge.get(t.clave);
    if (prev) fusionarTipoSge(prev, t);
    else porClaveSge.set(t.clave, { ...t, ucaps: t.ucaps.map((u) => ({ ...u })) });
  }
  const porClaveCampo = new Map(inventario.map((t) => [t.clave, t]));

  /**
   * Segunda pasada: emparejar por clase + potencia lo que quedó suelto.
   *
   * Una UCAP que se llama "Luminaria Solar 60 W" no dice su tecnología, así que
   * su clave cae al respaldo por descripción y nunca cruzaría con el
   * "LUMINARIA SOLAR|LED|60" del archivo. Solo se emparejan cuando hay
   * exactamente un huérfano de cada lado con esa clase y potencia: con dos
   * candidatos no se puede saber cuál es cuál, y adivinar sería peor que
   * mostrarlos separados.
   */
  const huerfanosCampo = inventario.filter((t) => !porClaveSge.has(t.clave));
  const huerfanosSge = [...porClaveSge.values()].filter((t) => !porClaveCampo.has(t.clave));
  const porClasePot = (clase: Clase, pot: number | null) => `${clase}|${pot}`;
  const equivalencias = new Map<string, string>(); // clave SGE -> clave campo
  function agrupar<T>(lista: T[], ternaDe: (x: T) => Terna | null): Map<string, T[]> {
    const m = new Map<string, T[]>();
    for (const x of lista) {
      const t = ternaDe(x);
      if (!t || t.potencia == null) continue;
      const k = porClasePot(t.clase, t.potencia);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(x);
    }
    return m;
  }
  const gCampo = agrupar(huerfanosCampo, (x) => x.terna);
  const gSge = agrupar(huerfanosSge, (x) => ({
    clase: claseDe(x.descripcion),
    tecnologia: tecnologiaDe(x.descripcion),
    potencia: potenciaDe(x.descripcion),
  }));
  for (const [k, sgeLista] of gSge) {
    const campoLista = gCampo.get(k);
    if (sgeLista.length === 1 && campoLista?.length === 1) {
      equivalencias.set(sgeLista[0].clave, campoLista[0].clave);
    }
  }
  // Se reindexa el SGE con la clave del archivo para que caigan en la misma fila.
  for (const [claveSge, claveCampo] of equivalencias) {
    const t = porClaveSge.get(claveSge);
    if (!t) continue;
    porClaveSge.delete(claveSge);
    porClaveSge.set(claveCampo, { ...t, clave: claveCampo });
  }

  const claves = new Set([...porClaveCampo.keys(), ...porClaveSge.keys()]);

  const filas: FilaComparacion[] = [];
  let conDiferencia = 0;
  let soloEnCampo = 0;
  let soloEnSge = 0;

  for (const clave of claves) {
    const c = porClaveCampo.get(clave);
    const s = porClaveSge.get(clave);
    const campo = c?.cantidad ?? null;
    const sgeCant = s?.cantidad ?? null;
    const diferencia = campo != null && sgeCant != null ? campo - sgeCant : null;

    if (campo != null && sgeCant == null) soloEnCampo++;
    else if (campo == null && sgeCant != null) soloEnSge++;
    else if (diferencia !== 0) conDiferencia++;

    // Cada UCAP con su total y su diferencia, de mayor a menor: al buscar de
    // dónde sale un descuadre se empieza por la que más pesa.
    const ucaps = repartirEntreUcaps(
      (s?.ucaps ?? []).slice().sort((a, b) => b.cantidad - a.cantidad),
      c?.descripciones ?? [],
    );

    filas.push({
      clave,
      etiqueta: s?.etiqueta ?? c?.etiqueta ?? '',
      descripcionesCampo: c?.descripciones ?? [],
      ucaps,
      repartido: ucaps.length > 1,
      sge: sgeCant,
      campo,
      diferencia,
    });
  }

  // Primero lo que hay que mirar: faltantes, sobrantes y diferencias grandes.
  const peso = (f: FilaComparacion) =>
    f.diferencia == null ? Infinity : Math.abs(f.diferencia);
  filas.sort((a, b) => peso(b) - peso(a) || a.etiqueta.localeCompare(b.etiqueta));

  return {
    filas,
    totalSge: [...porClaveSge.values()].reduce((a, t) => a + t.cantidad, 0),
    totalCampo: inventario.reduce((a, t) => a + t.cantidad, 0),
    conDiferencia,
    soloEnCampo,
    soloEnSge,
  };
}

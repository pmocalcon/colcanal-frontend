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
 *
 * ── Los demás grupos ──
 * La comparación cubre todos los grupos de UCAP, pero no todos se comparan
 * igual, porque el censo es un censo de LUMINARIAS: cada fila es una luminaria
 * y las demás columnas describen lo que la sostiene y la alimenta.
 *
 *  · LUMINARIAS         una fila = una unidad, se cruza tipo a tipo.
 *  · ELEMENTOS DE SOPORTE, FOTOCONTROLES   una fila = una unidad (TIPO_BRAZO,
 *                       TIPO_ENCENDIDO), pero el archivo no dice de qué UCAP es:
 *                       se compara el TOTAL del grupo, no cada UCAP.
 *  · POSTES, TRANSFORMADORES   varias luminarias comparten el mismo apoyo o el
 *                       mismo transformador: se cuentan ID distintos, no filas.
 *  · REDES, CANALIZACIONES, PUESTA A TIERRA, BOMBILLAS   el censo no los mide
 *                       (la red va en metros, no en unidades). Se listan con lo
 *                       del SGE y sin diferencia: inventar un conteo sería peor
 *                       que decir que no se puede.
 */

const sinTildes = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '');

const normHeader = (s: string): string =>
  sinTildes(s).toLowerCase().replace(/\s+/g, ' ').trim();

/** Mayúsculas sin tildes, para comparar valores del archivo y nombres de grupo. */
const norm = (s: string | null | undefined): string =>
  sinTildes((s ?? '').trim()).toUpperCase().replace(/\s+/g, ' ');

/** Nombre del grupo de una UCAP tal como se agrupa en la comparación. */
export const grupoDe = (g: string | null | undefined): string =>
  (g ?? '').trim().toUpperCase() || 'SIN GRUPO';

/**
 * Los grupos que se cruzan tipo a tipo por clase + tecnología + potencia.
 * Son los que el censo cuenta fila a fila con su descripción.
 */
export const esGrupoLuminaria = (grupo: string): boolean =>
  norm(grupo) === 'LUMINARIAS' || norm(grupo) === 'PROYECTORES';

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

/**
 * Lo que el archivo puede decir de un grupo que no es de luminarias.
 *
 * El total no siempre es un número: hay filas que quedan fuera porque el censo
 * dice que no aplica —"SIN BRAZO" es un hecho— y otras que quedan fuera porque
 * el censo no las midió. Esas dos no se pueden sumar en un mismo "no se contó":
 * en el censo de Puerto Asís, las 588 filas sin TIPO_BRAZO tampoco traen
 * fijación, vía ni reparación, o sea que son registros incompletos, no
 * luminarias sin brazo. Por eso el conteo viaja como rango: `total` es el piso
 * (lo confirmado) y `maximo` el techo (si todo lo no medido tuviera brazo).
 */
export interface ConteoGrupo {
  grupo: string;
  /** La regla de conteo en una frase, para poder auditar el número. */
  regla: string;
  /** Qué se está contando: filas del censo, apoyos distintos, transformadores. */
  unidad: string;
  /** Piso: lo que el archivo confirma. null si falta la columna que hace falta. */
  total: number | null;
  /** Techo: el piso más lo que el censo no midió. */
  maximo: number | null;
  /**
   * Dónde caería el total si lo no medido se comportara como lo medido. No es
   * un dato: es la extrapolación de la tasa observada, y sirve para no dejar el
   * rango como única respuesta cuando el rango es ancho.
   */
  esperado: number | null;
  /** Qué valores componen el total. */
  detalle: DescripcionContada[];
  /** Filas que el censo dice que no llevan la unidad (un hecho). */
  noAplica: DescripcionContada[];
  /** Filas donde el censo no lo midió (una ausencia). */
  sinDato: DescripcionContada[];
  /** Por qué no se pudo contar, cuando total es null. */
  nota?: string;
}

/** En qué cubeta cae una fila del censo para un grupo dado. */
type Cubeta = 'cuenta' | 'noAplica' | 'sinDato';

export interface ConteoInventario {
  tipos: TipoContado[];
  total: number;
  columnas: string[];
  avisos: string[];
  /** Conteos de los grupos que no son luminarias. */
  grupos: ConteoGrupo[];
  error?: string;
}

// ---- Reglas de conteo por grupo ----

const mapaAContadas = (m: Map<string, number>): DescripcionContada[] =>
  [...m.entries()]
    .map(([descripcion, cantidad]) => ({ descripcion, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

interface Conteo {
  total: number;
  detalle: Map<string, number>;
  noAplica: Map<string, number>;
  sinDato: Map<string, number>;
}
const nuevoConteo = (): Conteo => ({
  total: 0, detalle: new Map(), noAplica: new Map(), sinDato: new Map(),
});
const anotar = (c: Conteo, cubeta: Cubeta, etiqueta: string) => {
  const m = cubeta === 'cuenta' ? c.detalle : cubeta === 'noAplica' ? c.noAplica : c.sinDato;
  m.set(etiqueta, (m.get(etiqueta) ?? 0) + 1);
  if (cubeta === 'cuenta') c.total++;
};

/** El export marca los vacíos con "0": es su nulo, no un dato. */
const vacio = (v: string): boolean => !v || v === '0';

/**
 * Una unidad por fila, según el valor de una columna. Sirve para lo que va
 * pegado a cada luminaria: su brazo, su fotocelda.
 */
const contarPorFila = (
  datos: string[][],
  col: number,
  clasificar: (valor: string) => Cubeta,
): Conteo => {
  const c = nuevoConteo();
  for (const f of datos) {
    const v = (f[col] ?? '').trim();
    if (vacio(v)) anotar(c, 'sinDato', '(sin dato)');
    else anotar(c, clasificar(norm(v)), v);
  }
  return c;
};

/**
 * Unidades compartidas: varias luminarias cuelgan del mismo apoyo y del mismo
 * transformador, así que contar filas los multiplicaría. Se cuentan IDs
 * distintos y se clasifican por otras columnas (el propietario, la potencia).
 */
const contarDistintos = (
  datos: string[][],
  colId: number,
  etiquetaDeFila: (f: string[]) => string,
  clasificar: (etiqueta: string) => Cubeta,
): Conteo => {
  const etiquetaDeId = new Map<string, string>();
  for (const f of datos) {
    const id = (f[colId] ?? '').trim();
    if (vacio(id) || etiquetaDeId.has(id)) continue;
    etiquetaDeId.set(id, etiquetaDeFila(f));
  }
  const c = nuevoConteo();
  // Sin cubeta automática para "(sin dato)": que falte el propietario de un
  // apoyo impide saber si es del contrato, pero que falte la potencia de un
  // transformador no lo hace desaparecer. Lo decide cada regla.
  for (const [, etiqueta] of etiquetaDeId) anotar(c, clasificar(norm(etiqueta)), etiqueta);
  return c;
};

interface ReglaGrupo {
  grupo: string;
  regla: string;
  /** Qué cuenta la regla, para poder leer el desglose sin adivinar. */
  unidad: string;
  /** Columnas del censo que necesita, en orden de preferencia. */
  columnas: string[][];
  contar: (datos: string[][], cols: number[]) => Conteo;
}

/**
 * Cómo se cuenta cada grupo desde el censo de luminarias.
 *
 * Los umbrales no son arbitrarios: el brazo "SIN BRAZO" no es un elemento de
 * soporte, y los apoyos de la electrificadora no son postes del municipio —
 * remunerar esos sería cobrar activo ajeno. Lo excluido queda a la vista para
 * que la decisión se pueda discutir con el número al lado.
 */
const REGLAS: ReglaGrupo[] = [
  {
    grupo: 'ELEMENTOS DE SOPORTE',
    regla: 'una fila = un brazo, por TIPO_BRAZO',
    unidad: 'filas del censo',
    columnas: [['tipo_brazo', 'brazo']],
    contar: (datos, [col]) =>
      contarPorFila(datos, col, (v) => (v.includes('SIN BRAZO') ? 'noAplica' : 'cuenta')),
  },
  {
    grupo: 'FOTOCONTROLES',
    regla: 'una fila = un fotocontrol, por TIPO_ENCENDIDO (foto celda / foto control)',
    unidad: 'filas del censo',
    columnas: [['tipo_encendido', 'encendido']],
    contar: (datos, [col]) =>
      contarPorFila(datos, col, (v) => (/FOTO\s*(CELDA|CONTROL)/.test(v) ? 'cuenta' : 'noAplica')),
  },
  {
    grupo: 'POSTES',
    // Varias luminarias comparten apoyo: son 4.303 filas sobre 4.070 apoyos.
    // La etiqueta es el propietario y nada más: es el criterio que decide si el
    // apoyo entra o no. Partirla además por RED_EXCLUSIVA rompía los 483 del
    // municipio en tres pedazos que no significan nada por separado.
    regla: 'apoyos distintos (ID_APOYO) cuyo PROPIETARIO es el municipio',
    unidad: 'apoyos distintos',
    columnas: [['id_apoyo', 'apoyo'], ['propietario']],
    contar: (datos, [colId, colProp]) => contarDistintos(
      datos,
      colId,
      (f) => {
        const prop = colProp >= 0 ? (f[colProp] ?? '').trim() : '';
        return vacio(prop) ? '(sin dato)' : prop;
      },
      (e) => {
        // "SIN DEFINIR" es el nulo del censo escrito con palabras: el
        // encuestador no determinó de quién es el apoyo.
        if (e === '(SIN DATO)' || e.startsWith('SIN DEFINIR')) return 'sinDato';
        return colProp < 0 || e.includes('MUNICIPIO') ? 'cuenta' : 'noAplica';
      },
    ),
  },
  {
    grupo: 'TRANSFORMADORES',
    regla: 'transformadores distintos (ID_TRAFO), clasificados por POTENCIA_TRAFO',
    unidad: 'transformadores distintos',
    columnas: [['id_trafo', 'trafo'], ['potencia_trafo']],
    contar: (datos, [colId, colPot]) => contarDistintos(
      datos,
      colId,
      (f) => {
        const p = colPot >= 0 ? (f[colPot] ?? '').trim() : '';
        return vacio(p) ? '(sin dato)' : `${p} kVA`;
      },
      () => 'cuenta',
    ),
  },
];

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
    return {
      tipos: [], total: 0, columnas: [], avisos: [], grupos: [],
      error: 'No hay nada que comparar.',
    };
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
      tipos: [], total: 0, columnas: [], avisos: [], grupos: [],
      error: 'No reconocí las columnas. Incluye la fila de títulos con TIPO_MATERIAL (o TECNOLOGIA y POTENCIA).',
    };
  }

  // Índice de todos los títulos: los demás grupos se cuentan de columnas que
  // la luminaria no usa (TIPO_BRAZO, ID_APOYO, PROPIETARIO…).
  const idxCol = new Map<string, number>();
  filas[headerIdx].forEach((h, i) => {
    const k = normHeader(h ?? '');
    if (k && !idxCol.has(k)) idxCol.set(k, i);
  });

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

  const datos = filas
    .slice(headerIdx + 1)
    .filter((f) => !f.every((c) => (c ?? '').trim() === ''));

  for (const fila of datos) {
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

  // ── Los demás grupos ──
  // La primera columna de cada regla es la que hace falta; las otras solo
  // clasifican, y sin ellas la regla sigue contando (y lo dice).
  const grupos: ConteoGrupo[] = REGLAS.map((r) => {
    const cols = r.columnas.map((alias) => {
      for (const a of alias) {
        const i = idxCol.get(normHeader(a));
        if (i != null) return i;
      }
      return -1;
    });
    if (cols[0] < 0) {
      return {
        grupo: r.grupo,
        regla: r.regla,
        unidad: r.unidad,
        total: null,
        maximo: null,
        esperado: null,
        detalle: [],
        noAplica: [],
        sinDato: [],
        nota: `El archivo no trae la columna ${r.columnas[0][0].toUpperCase()}.`,
      };
    }
    const c = r.contar(datos, cols);
    const faltan = r.columnas
      .slice(1)
      .map((alias, i) => (cols[i + 1] < 0 ? alias[0].toUpperCase() : null))
      .filter((x): x is string => x !== null);
    const sinDato = mapaAContadas(c.sinDato);
    const noMedido = sinDato.reduce((a, d) => a + d.cantidad, 0);
    const noAplica = mapaAContadas(c.noAplica);
    // Tasa observada entre lo que sí se midió: de 3.715 luminarias medidas,
    // 3.681 llevan brazo. Aplicarla a lo no medido da el valor esperado.
    const medidas = c.total + noAplica.reduce((a, d) => a + d.cantidad, 0);
    return {
      grupo: r.grupo,
      regla: r.regla,
      unidad: r.unidad,
      total: c.total,
      maximo: c.total + noMedido,
      esperado: medidas > 0 ? c.total + Math.round(noMedido * (c.total / medidas)) : null,
      detalle: mapaAContadas(c.detalle),
      noAplica,
      sinDato,
      nota: faltan.length > 0
        ? `Sin la columna ${faltan.join(' ni ')}: se contaron todos, sin filtrar.`
        : undefined,
    };
  });

  return {
    tipos: [...acc.values()].sort((a, b) => b.cantidad - a.cantidad),
    total,
    columnas,
    avisos,
    grupos,
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

/**
 * Convierte una UCAP del censo en una entrada comparable.
 *
 * Solo las luminarias se normalizan a la terna: un "Poste Metálico 6 mt sin
 * brazo" no tiene tecnología ni potencia, y forzarlo a esa clave lo dejaría
 * emparejado con cualquier cosa. Fuera de luminarias cada UCAP es su propia
 * fila, que es exactamente lo que el archivo puede o no confirmar.
 */
export function tipoSgeDe(
  descripcion: string,
  cantidad: number,
  codigo: string,
  grupo: string | null,
): TipoSge {
  const g = grupoDe(grupo);
  if (!esGrupoLuminaria(g)) {
    return {
      clave: `${g}|${claveDescripcion(descripcion)}`,
      descripcion,
      etiqueta: descripcion,
      cantidad,
      ucaps: [{ codigo, descripcion, cantidad }],
      grupo: g,
    };
  }
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
    grupo: g,
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

/** Un grupo de UCAP con su cruce contra el archivo. */
export interface GrupoComparado {
  grupo: string;
  /** Cómo se contó el archivo. null = el censo no mide este grupo. */
  regla: string | null;
  /** Qué unidad cuenta la regla ("filas del censo", "apoyos distintos"). */
  unidadCampo: string | null;
  /** Aclaración de la regla (columna que faltó, filtro que no se pudo aplicar). */
  nota?: string;
  /** true si las filas se cruzaron una a una; false si solo cuadra el total. */
  cruzadoPorTipo: boolean;
  /** Piso del conteo del archivo. */
  campo: number | null;
  /** Techo: el piso más las filas que el censo no midió. */
  campoMax: number | null;
  /** Extrapolación de la tasa observada a lo no medido. No es un dato. */
  campoEsperado: number | null;
  /** campoEsperado − sge, para saber hacia dónde apunta el rango. */
  diferenciaEsperada: number | null;
  sge: number;
  /** campo − sge. null cuando el archivo no puede contar el grupo. */
  diferencia: number | null;
  /**
   * true si el SGE cae dentro del rango [campo, campoMax]. Ahí no hay
   * diferencia que reportar: lo que falta es censo, no unidades.
   */
  indeterminado: boolean;
  /** De qué se compone el total del archivo. */
  detalleCampo: DescripcionContada[];
  /** Filas que el censo dice que no llevan la unidad. */
  noAplicaCampo: DescripcionContada[];
  /** Filas donde el censo no lo midió. */
  sinDatoCampo: DescripcionContada[];
  filas: FilaComparacion[];
}

export interface Comparacion {
  grupos: GrupoComparado[];
  /** Suma de los grupos que el archivo sí puede contar. */
  totalSge: number;
  totalCampo: number;
  /** Lo que el SGE tiene en grupos que el censo no mide. */
  sgeNoMedido: number;
  conDiferencia: number;
  soloEnCampo: number;
  soloEnSge: number;
}

/**
 * Cruza el conteo del archivo con el censo del SGE, grupo por grupo.
 *
 * Dentro de LUMINARIAS se listan los tres casos —coincide, solo en el archivo,
 * solo en el SGE— porque un tipo que falta en un lado es justo lo que hay que
 * revisar; ocultarlo daría una comparación que siempre cuadra.
 *
 * En los demás grupos el archivo da un total pero no dice de qué UCAP es cada
 * unidad: el censo tiene "TIPO 2 (1,5 A 2 M)" y el SGE tiene "Brazo Galvanizado"
 * y "Brazo Galvanizado de 1.5\" x 2mt". Ahí se compara el TOTAL del grupo y las
 * UCAPs se listan con lo suyo, sin repartirles el archivo: adivinar el reparto
 * daría diferencias por UCAP que no significan nada.
 */
export function compararConSge(
  conteo: ConteoInventario,
  sge: TipoSge[],
): Comparacion {
  const inventario = conteo.tipos;
  const sgeLuminarias = sge.filter((t) => esGrupoLuminaria(grupoDe(t.grupo)));
  const sgeOtros = sge.filter((t) => !esGrupoLuminaria(grupoDe(t.grupo)));

  // Varias UCAPs pueden caer en la misma terna: se suman y se listan sus códigos.
  const porClaveSge = new Map<string, TipoSge>();
  for (const t of sgeLuminarias) {
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

  const sgeLuminariasTotal = [...porClaveSge.values()].reduce((a, t) => a + t.cantidad, 0);
  const campoLuminarias = inventario.reduce((a, t) => a + t.cantidad, 0);

  const grupos: GrupoComparado[] = [];
  if (filas.length > 0) {
    grupos.push({
      grupo: 'LUMINARIAS',
      regla: 'una fila del archivo = una luminaria, agrupadas por clase, tecnología y potencia',
      unidadCampo: 'filas del censo',
      cruzadoPorTipo: true,
      campo: campoLuminarias,
      campoMax: campoLuminarias,
      campoEsperado: campoLuminarias,
      sge: sgeLuminariasTotal,
      diferencia: campoLuminarias - sgeLuminariasTotal,
      diferenciaEsperada: campoLuminarias - sgeLuminariasTotal,
      indeterminado: false,
      detalleCampo: [],
      noAplicaCampo: [],
      sinDatoCampo: [],
      filas,
    });
  }

  // ── Los demás grupos ──
  // Cada UCAP es su propia fila; lo que se compara es el total del grupo.
  const conteoPorGrupo = new Map(conteo.grupos.map((g) => [grupoDe(g.grupo), g]));
  const ucapsPorGrupo = new Map<string, TipoSge[]>();
  for (const t of sgeOtros) {
    const g = grupoDe(t.grupo);
    if (!ucapsPorGrupo.has(g)) ucapsPorGrupo.set(g, []);
    ucapsPorGrupo.get(g)!.push(t);
  }

  for (const [g, tipos] of ucapsPorGrupo) {
    const sgeTotal = tipos.reduce((a, t) => a + t.cantidad, 0);
    const c = conteoPorGrupo.get(g);
    const campo = c?.total ?? null;
    const campoMax = c?.maximo ?? null;
    const diferencia = campo != null ? campo - sgeTotal : null;
    // La diferencia que se reporta es contra lo que el archivo confirma, que es
    // el único dato duro. `indeterminado` no la tapa: solo avisa de que el censo
    // dejó filas sin medir y que por eso el número puede moverse.
    const indeterminado = campo != null && campoMax != null
      && campoMax > campo && sgeTotal >= campo && sgeTotal <= campoMax;
    if (diferencia != null && diferencia !== 0) conDiferencia++;

    grupos.push({
      grupo: g,
      regla: c?.regla ?? null,
      unidadCampo: c?.unidad ?? null,
      nota: c?.nota,
      cruzadoPorTipo: false,
      campo,
      campoMax,
      campoEsperado: c?.esperado ?? null,
      sge: sgeTotal,
      diferencia,
      diferenciaEsperada: c?.esperado != null ? c.esperado - sgeTotal : null,
      indeterminado,
      detalleCampo: c?.detalle ?? [],
      noAplicaCampo: c?.noAplica ?? [],
      sinDatoCampo: c?.sinDato ?? [],
      filas: tipos
        .slice()
        .sort((a, b) => b.cantidad - a.cantidad)
        .map((t) => ({
          clave: t.clave,
          etiqueta: t.etiqueta,
          descripcionesCampo: [],
          // La UCAP con lo suyo; el archivo no se reparte entre ellas.
          ucaps: t.ucaps.map((u) => ({
            ...u, campo: 0, diferencia: 0, desdeArchivo: [],
          })),
          repartido: false,
          sge: t.cantidad,
          campo: null,
          diferencia: null,
        })),
    });
  }

  // Los grupos comparables primero, y dentro de ellos el más grande arriba:
  // LUMINARIAS encabeza siempre, que es donde está el dinero de la liquidación.
  grupos.sort((a, b) =>
    Number(b.campo != null) - Number(a.campo != null)
    || b.sge - a.sge
    || a.grupo.localeCompare(b.grupo));

  const comparables = grupos.filter((g) => g.campo != null);

  return {
    grupos,
    totalSge: comparables.reduce((a, g) => a + g.sge, 0),
    totalCampo: comparables.reduce((a, g) => a + (g.campo ?? 0), 0),
    sgeNoMedido: grupos.filter((g) => g.campo == null).reduce((a, g) => a + g.sge, 0),
    conDiferencia,
    soloEnCampo,
    soloEnSge,
  };
}

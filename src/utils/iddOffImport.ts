import type { IddOffFalla, IddOnFalla } from '@/services/creg.service';

/**
 * Importa las filas de IDD OFF (apagadas) y de ID ON (encendidas) desde texto
 * tabular: lo que Excel deja en el portapapeles al copiar filas (TSV) o el
 * contenido de un CSV.
 *
 * Las dos hojas comparten casi todas las columnas; ID ON agrega hora inicial y
 * final. Se reconocen todas y cada página usa las suyas: una columna de más en
 * el pegado es inofensiva.
 *
 * No se lee .xlsx binario a proposito: requeriria una dependencia de ~1 MB, y
 * copiar/pegar desde la hoja abierta cubre el mismo caso sin instalar nada.
 *
 * Horas y Wi x HSSi se ignoran aunque vengan: se calculan a partir de las
 * fechas y la potencia, y aceptarlos abriria la puerta a que el archivo
 * contradiga al calculo.
 */

/**
 * Una fila importada: campos de las dos hojas. La página se queda con los que
 * le sirven.
 */
export type FallaImportada = IddOffFalla & IddOnFalla;

/** Encabezados reconocidos -> campo. La clave va normalizada (sin tildes, minusculas). */
const HEADER_MAP: Record<string, keyof FallaImportada> = {
  'codigo': 'codigo',
  'potencia': 'potencia',
  'potencia lum': 'potencia',
  'potencia lum [w]': 'potencia',
  'potencia+xl': 'potenciaXl',
  'potenciacia+xl': 'potenciaXl',
  'potencia xl': 'potenciaXl',
  'tecnologia': 'tecnologia',
  'localizacion': 'localizacion',
  'barrio': 'barrio',
  'fecha inicial': 'fechaInicial',
  'inicial': 'fechaInicial',
  'fecha final': 'fechaFinal',
  'final': 'fechaFinal',
  // Solo ID ON: una luminaria prendida de dia se mide en horas.
  'hora inicial': 'horaInicial',
  'hora final': 'horaFinal',
  // Export crudo del sistema de mantenimiento (columnas S_*). El reporte es el
  // inicio de la falla; la correccion/ejecucion, el fin.
  's_no_serie_lum': 'codigo',
  's_pot_w': 'potencia',
  's_tecnologia': 'tecnologia',
  's_direccion': 'localizacion',
  's_barrio': 'barrio',
  's_fecha_reporte': 'fechaInicial',
  's_fecha_correcion': 'fechaFinal',
  's_fecha_correccion': 'fechaFinal',
  's_hora_reporte': 'horaInicial',
  's_hora_ejecucion': 'horaFinal',
};

/** Campos que se guardan como hora HH:MM. */
const CAMPOS_HORA: ReadonlySet<keyof FallaImportada> = new Set(['horaInicial', 'horaFinal']);
/** Campos que se guardan como fecha ISO. */
const CAMPOS_FECHA: ReadonlySet<keyof FallaImportada> = new Set(['fechaInicial', 'fechaFinal']);
/** Campos numericos. */
const CAMPOS_NUM: ReadonlySet<keyof FallaImportada> = new Set(['potencia', 'potenciaXl']);

const normalize = (s: string): string =>
  s.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Detecta el separador: Excel copia con tabuladores; un CSV usa ; o ,. */
const detectSep = (line: string): string => {
  if (line.includes('\t')) return '\t';
  if (line.includes(';')) return ';';
  return ',';
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Serial de Excel (días desde 1899-12-30) -> 'YYYY-MM-DD'. */
const excelSerialAFecha = (serial: number): string => {
  const d = new Date(Math.round((serial - 25569) * 86_400_000));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

/** Fracción de día de Excel (0..1) -> 'HH:MM:SS'. */
const excelFraccionAHora = (frac: number): string => {
  let s = Math.round(frac * 86_400);
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
};

/** '7/06/2025' | '2025-06-07' | '07-06-2025' | serial de Excel -> '2025-06-07'. Vacio si no parsea. */
export const parseFecha = (raw: string): string => {
  const s = raw.trim();
  if (!s) return '';
  // ISO ya normalizado
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return s;
  // d/m/yyyy o d-m-yyyy (formato colombiano)
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Serial de Excel de un .xlsx: numero puro en rango de años ~1954-2119.
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n >= 20000 && n <= 80000) return excelSerialAFecha(n);
  }
  return '';
};

/**
 * '18:30' | '18:30:45' | '6:05' -> 'HH:MM' o 'HH:MM:SS'. Vacio si no parsea.
 * Conserva los segundos si vienen: en ID ON la falla puede durar minutos y el
 * segundo mueve el Qi × Ti.
 */
export const parseHora = (raw: string): string => {
  const s = raw.trim();
  if (!s) return '';
  // Fracción de día de un .xlsx (0..1): p. ej. 0,6736 = 16:10:00.
  if (/^\d*\.\d+$/.test(s)) {
    const f = Number(s);
    if (f >= 0 && f < 1) return excelFraccionAHora(f);
    return '';
  }
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return '';
  const [, h, min, sec] = m;
  if (Number(h) > 23 || Number(min) > 59 || (sec && Number(sec) > 59)) return '';
  return sec ? `${h.padStart(2, '0')}:${min}:${sec}` : `${h.padStart(2, '0')}:${min}`;
};

/**
 * Potencia + pérdidas del balasto (XL). Réplica exacta de la columna
 * POTENCIA+XL del Excel CREG (hoja ID_OFF):
 *   =IF(tec="LED", potencia, IF(pot=70,81, IF(pot=150,169, IF(pot=200,220,
 *      IF(pot=250,279, IF(pot=400,440))))))
 * LED no lleva balasto externo, así que su +XL es la potencia nominal. Las de
 * descarga (sodio, metal-halide) suman las pérdidas según la tabla. Una
 * potencia no-LED fuera de la tabla cae a la nominal: en los datos reales solo
 * aparecen esas potencias en descarga, y así la columna nunca queda vacía.
 */
const XL_POR_POTENCIA: Readonly<Record<number, number>> = { 70: 81, 150: 169, 200: 220, 250: 279, 400: 440 };
export const potenciaXlDe = (tecnologia: string | undefined, potencia: number | null): number | null => {
  if (potencia == null) return null;
  if ((tecnologia ?? '').trim().toUpperCase() === 'LED') return potencia;
  return XL_POR_POTENCIA[potencia] ?? potencia;
};

/** '35' | '1.234,5' | '1,5' -> number. null si no parsea. */
export const parseNumero = (raw: string): number | null => {
  const s = raw.trim();
  if (!s) return null;
  // Miles con punto y decimal con coma (es-CO); si no hay coma, el punto es decimal.
  const limpio = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
};

export interface ImportResult {
  fallas: FallaImportada[];
  /** Columnas reconocidas, para que la UI diga que entendio. */
  columnas: string[];
  /** Problemas que no impiden importar, pero que hay que ver. */
  avisos: string[];
  error?: string;
}

const nuevoId = (i: number) => `imp-${Date.now()}-${i}`;

/**
 * Desempata columnas repetidas del encabezado de ID ON.
 *
 * Si el pegado trae `INICIAL|FINAL` dos veces sin los titulos FECHA/HORA
 * encima, el segundo par es el de hora: sin esto las horas sobrescribirian a
 * las fechas.
 */
function desambiguarInicialFinal(
  mapa: (keyof FallaImportada | null)[],
): (keyof FallaImportada | null)[] {
  const visto = new Set<keyof FallaImportada>();
  return mapa.map((campo) => {
    if (!campo) return campo;
    if (!visto.has(campo)) { visto.add(campo); return campo; }
    if (campo === 'fechaInicial' && !visto.has('horaInicial')) { visto.add('horaInicial'); return 'horaInicial'; }
    if (campo === 'fechaFinal' && !visto.has('horaFinal')) { visto.add('horaFinal'); return 'horaFinal'; }
    // Repetida y sin lectura sensata: mejor ignorarla que sobrescribir.
    return null;
  });
}

type Mapa = (keyof FallaImportada | null)[];
const reconocidas = (m: Mapa) => m.filter(Boolean).length;
const mapaDe = (fila: string[]): Mapa => fila.map((c) => HEADER_MAP[normalize(c)] ?? null);

/**
 * Combina dos filas de encabezado en una.
 *
 * El Excel de ID ON titula con celdas combinadas: FECHA abarca INICIAL|FINAL y
 * HORA abarca otro INICIAL|FINAL. Al pegar, la combinada deja su texto solo en
 * la primera columna, asi que ninguna de las dos filas por separado dice
 * "fecha inicial": hay que pegarlas por columna.
 */
const mapaCombinado = (arriba: string[], abajo: string[]): Mapa => {
  const ancho = Math.max(arriba.length, abajo.length);
  const out: Mapa = [];
  let titulo = '';
  for (let c = 0; c < ancho; c++) {
    // Una celda combinada solo trae texto en su primera columna: se arrastra.
    const t = normalize(arriba[c] ?? '');
    if (t) titulo = t;
    const sub = normalize(abajo[c] ?? '');
    out.push(
      HEADER_MAP[`${titulo} ${sub}`.trim()] ??
      HEADER_MAP[sub] ??
      HEADER_MAP[t] ??
      null,
    );
  }
  return out;
};

export interface ParseOpts {
  /**
   * Si viene, solo se importan las filas cuyo S_ESTADO coincida con alguno de
   * los valores (sin tildes ni distinción de mayúsculas). IDD OFF usa
   * ['APAGADA', 'INTERMITENTE']; ID ON, 'ENCENDIDA DE DIA'. Si el archivo no
   * trae columna de estado, no se filtra y se avisa.
   */
  soloEstado?: string | string[];
  /**
   * Igual que soloEstado, pero sobre S_TIPO_MANTENIMIENTO. IDD OFF usa
   * 'MANTENIMIENTO CORRECTIVO': lo preventivo, las reparaciones en bodega y las
   * visitas técnicas no son fallas de disponibilidad.
   */
  soloTipoMantenimiento?: string | string[];
}

/** Encabezados que identifican la columna de estado del export de mantenimiento. */
const ESTADO_HEADERS = new Set(['s_estado', 'estado']);

/** Encabezados de la columna de tipo de mantenimiento. */
const TIPO_MANT_HEADERS = new Set([
  's_tipo_mantenimiento', 'tipo de mantenimiento', 'tipo mantenimiento',
]);

/**
 * Filtro por columna de texto del export. Compara por contención y no por
 * igualdad porque el reporte antepone palabras a los valores ("EN BUEN ESTADO"
 * en vez de "BUEN ESTADO"), y guarda lo descartado para poder avisar de ello.
 */
class FiltroColumna {
  readonly terminos: string[];
  readonly etiqueta: string;
  readonly descartados = new Map<string, number>();

  constructor(pedido: string | string[] | undefined) {
    const lista = pedido ? (Array.isArray(pedido) ? pedido : [pedido]) : [];
    this.terminos = lista.map(normalize).filter(Boolean);
    this.etiqueta = lista.join(' o ');
  }

  get activo(): boolean {
    return this.terminos.length > 0;
  }

  /** true si la fila pasa; si no, la contabiliza como descartada. */
  acepta(valor: string): boolean {
    const v = normalize(valor);
    if (this.terminos.some((t) => v === t || v.includes(t))) return true;
    const bruto = valor.trim();
    if (bruto) this.descartados.set(bruto, (this.descartados.get(bruto) ?? 0) + 1);
    return false;
  }

  /** Detalle "VALOR (n), OTRO (m)" para el aviso. */
  get detalle(): string {
    return [...this.descartados.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([valor, n]) => `${valor} (${n})`)
      .join(', ');
  }
}

export function parseFallas(text: string, opts: ParseOpts = {}): ImportResult {
  const lineas = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lineas.length === 0) return { fallas: [], columnas: [], avisos: [], error: 'No hay nada que importar.' };

  const sep = detectSep(lineas[0]);
  const filas = lineas.map((l) => l.split(sep));

  // Se prueba cada fila como encabezado de una sola linea y como par de dos, y
  // gana la lectura que reconozca mas columnas. Con el encabezado de dos filas
  // de ID ON, la fila de arriba sola solo ve CODIGO/POTENCIA/BARRIO y se
  // perderian las fechas: por eso no vale quedarse con la primera que encaje.
  let headerIdx = -1;
  let headerFilas = 1;
  let mapa: Mapa = [];
  let mejor = 1; // hay que reconocer al menos 2 columnas
  for (let i = 0; i < Math.min(filas.length, 10); i++) {
    const simple = mapaDe(filas[i]);
    if (reconocidas(simple) > mejor) {
      mejor = reconocidas(simple); headerIdx = i; headerFilas = 1; mapa = simple;
    }
    if (i + 1 < filas.length) {
      const doble = mapaCombinado(filas[i], filas[i + 1]);
      if (reconocidas(doble) > mejor) {
        mejor = reconocidas(doble); headerIdx = i; headerFilas = 2; mapa = doble;
      }
    }
  }
  if (headerIdx < 0) {
    return {
      fallas: [], columnas: [], avisos: [],
      error: 'No reconocí los encabezados. Incluye la fila de títulos (Código, Potencia+XL, Fecha inicial, Fecha final...).',
    };
  }
  mapa = desambiguarInicialFinal(mapa);
  headerIdx += headerFilas - 1; // los datos empiezan tras la ultima fila de titulos

  // Columnas de filtrado (S_ESTADO y S_TIPO_MANTENIMIENTO). Se buscan en las
  // filas de titulo (una o dos).
  const buscarCol = (headers: ReadonlySet<string>): number => {
    for (let h = headerIdx; h >= Math.max(0, headerIdx - (headerFilas - 1)); h--) {
      const idx = filas[h].findIndex((c) => headers.has(normalize(c)));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const estadoCol = buscarCol(ESTADO_HEADERS);
  const tipoMantCol = buscarCol(TIPO_MANT_HEADERS);

  const filtroEstado = new FiltroColumna(opts.soloEstado);
  const filtroTipoMant = new FiltroColumna(opts.soloTipoMantenimiento);

  const columnas = mapa.filter(Boolean) as string[];
  const avisos: string[] = [];
  if (filtroTipoMant.activo && tipoMantCol < 0) {
    avisos.push(`El archivo no trae columna de tipo de mantenimiento: no pude filtrar por "${filtroTipoMant.etiqueta}"; se importan todas las filas.`);
  }
  if (filtroEstado.activo && estadoCol < 0) {
    avisos.push(`El archivo no trae columna de estado: no pude filtrar por "${filtroEstado.etiqueta}"; se importan todas las filas.`);
  }
  // El export de mantenimiento solo trae la potencia nominal y la tecnología.
  // Sin columna Potencia+XL, se calcula con la tabla del Excel (LED = nominal;
  // descarga suma las pérdidas del balasto), para que el Qi × Ti use el mismo
  // valor que la hoja CREG.
  const sinXl = !mapa.includes('potenciaXl');
  if (sinXl) avisos.push('Sin columna "Potencia+XL": se calcula desde la tecnología y la potencia (LED = nominal; descarga suma pérdidas de balasto).');
  // Con columna de potencia, una fila sin potencia es un reporte sin luminaria
  // identificada (en el export de mantenimiento salen con código basura tipo
  // "43", sin tecnología). El Excel las descarta: no aportan Wi × HSSi y solo
  // inflan el total de horas. Sin columna de potencia no se puede distinguir, y
  // no se filtra.
  const tienePotCol = mapa.includes('potencia');
  if (!mapa.includes('fechaInicial') || !mapa.includes('fechaFinal')) {
    avisos.push('Faltan fechas: sin ellas las horas quedan en 0.');
  }

  const fallas: FallaImportada[] = [];
  let fechasMalas = 0;
  let horasMalas = 0;
  let omitidasPorEstado = 0;
  let omitidasPorTipoMant = 0;
  let omitidasSinPotencia = 0;

  for (let i = headerIdx + 1; i < filas.length; i++) {
    const fila = filas[i];
    if (fila.every((c) => (c ?? '').trim() === '')) continue; // fila vacía
    // Tipo de mantenimiento: solo el correctivo es una falla de disponibilidad.
    // Va antes que el estado para que el conteo de omitidas no se solape.
    if (filtroTipoMant.activo && tipoMantCol >= 0 && !filtroTipoMant.acepta(fila[tipoMantCol] ?? '')) {
      omitidasPorTipoMant++;
      continue;
    }
    // Filtro por estado: los apagados (IDD OFF) o ENCENDIDA DE DIA (ID ON).
    if (filtroEstado.activo && estadoCol >= 0 && !filtroEstado.acepta(fila[estadoCol] ?? '')) {
      omitidasPorEstado++;
      continue;
    }
    const f: FallaImportada = { id: nuevoId(i) };
    let tieneAlgo = false;

    mapa.forEach((campo, col) => {
      if (!campo) return;
      const raw = (fila[col] ?? '').trim();
      if (!raw) return;
      tieneAlgo = true;
      if (CAMPOS_NUM.has(campo)) {
        (f[campo] as number | null) = parseNumero(raw);
      } else if (CAMPOS_FECHA.has(campo)) {
        const fecha = parseFecha(raw);
        if (!fecha) fechasMalas++;
        (f[campo] as string) = fecha;
      } else if (CAMPOS_HORA.has(campo)) {
        const hora = parseHora(raw);
        if (!hora) horasMalas++;
        (f[campo] as string) = hora;
      } else {
        // El export de mantenimiento marca los textos vacíos con "0" (p. ej.
        // S_DIRECCION="0"). Es su marcador de nulo, no un dato: se ignora.
        if (raw !== '0') (f[campo] as string) = raw;
      }
    });

    // Reporte sin luminaria identificada (sin potencia): el Excel lo descarta.
    if (tienePotCol && f.potencia == null) { omitidasSinPotencia++; continue; }

    // El export deja la dirección en "0"; el Excel usa el barrio como
    // localización. Si quedó vacía, se rellena con el barrio.
    if (!f.localizacion && f.barrio) f.localizacion = f.barrio;

    // Sin columna Potencia+XL, se calcula desde tecnología y potencia (tabla CREG).
    if (sinXl && f.potenciaXl == null) f.potenciaXl = potenciaXlDe(f.tecnologia, f.potencia ?? null);

    // Las filas de totales del Excel no traen codigo ni fechas: se descartan.
    if (tieneAlgo) fallas.push(f);
  }

  if (fechasMalas > 0) {
    avisos.push(`${fechasMalas} fecha(s) no se entendieron y quedaron vacías (formatos: 7/06/2025 o 2025-06-07).`);
  }
  if (horasMalas > 0) {
    avisos.push(`${horasMalas} hora(s) no se entendieron y quedaron vacías (formato: 18:30).`);
  }
  // En los dos avisos se listan los valores descartados: si el reporte escribe
  // alguno de otra forma (p. ej. "EN MAL ESTADO"), aquí se ve en vez de perderse
  // en silencio.
  if (omitidasPorTipoMant > 0) {
    avisos.push(
      `Se omitieron ${omitidasPorTipoMant} fila(s) con tipo de mantenimiento distinto de "${filtroTipoMant.etiqueta}".`
      + (filtroTipoMant.detalle ? ` Tipos omitidos: ${filtroTipoMant.detalle}.` : '')
    );
  }
  if (omitidasPorEstado > 0) {
    avisos.push(
      `Se omitieron ${omitidasPorEstado} fila(s) con estado distinto de "${filtroEstado.etiqueta}".`
      + (filtroEstado.detalle ? ` Estados omitidos: ${filtroEstado.detalle}.` : '')
    );
  }
  if (omitidasSinPotencia > 0) {
    avisos.push(`Se omitieron ${omitidasSinPotencia} fila(s) sin potencia (reportes sin luminaria identificada).`);
  }
  if (fallas.length === 0) avisos.push('No encontré filas de datos debajo de los encabezados.');

  return { fallas, columnas, avisos };
}

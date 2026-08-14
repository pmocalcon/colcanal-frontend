/**
 * Motor de cálculo CREG compartido (Res. 123 de 2011 / 101 de 2013).
 *
 * Extrae las fórmulas verificadas de la página de Liquidación para poder
 * desplegarlas mes a mes en el módulo de Flujo de Caja (hojas CAOM y CINV). El
 * cálculo por mes es idéntico al de un mes liquidado; el flujo solo lo recorre
 * en todo el horizonte del censo.
 *
 * Verificado (en Liquidación) contra el Excel de Puerto Asís al peso.
 */

import type { Ucap } from '@/services/surveys.service';
import {
  UCAP_GRUPOS, indiceDisponibilidad, indiceDisponibilidadOn,
  type IddOffMes, type IddOnMes, type LiquidacionMes,
} from '@/services/creg.service';

export const toNum = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** PAGO de Excel (PMT): cuota que amortiza `pv` en `nper` periodos a `rate`. */
export const pago = (rate: number, nper: number, pv: number): number => {
  if (nper <= 0) return 0;
  if (rate === 0) return -pv / nper;
  return (-pv * rate) / (1 - Math.pow(1 + rate, -nper));
};

/**
 * Anualidad de inversión (CINV anual):
 *   (PAGO(r, vidaUtil, -valorInversion) + PAGO(r, vidaUtil, -valorTotal) * ne) * IDapagadas
 */
export const cinvAnual = (p: {
  r: number | null;
  ne: number | null;
  idApagadas: number | null;
  vidaUtil: number | null;
  valorInversion: number;
  valorTotal: number;
}): number | null => {
  const { r, ne, idApagadas, vidaUtil } = p;
  if (r == null || ne == null || vidaUtil == null || vidaUtil <= 0) return null;
  const inversion = pago(r, vidaUtil, -p.valorInversion);
  const reposicion = pago(r, vidaUtil, -p.valorTotal) * ne;
  return (inversion + reposicion) * (idApagadas ?? 1);
};

/** Cantidad de una celda del censo, desglosada por origen. */
export interface CellQty { inv: number; mun: number; con: number; }

export const normalizeCell = (raw: CellQty | number | undefined | null): CellQty => {
  if (raw == null) return { inv: 0, mun: 0, con: 0 };
  if (typeof raw === 'number') return { inv: raw, mun: 0, con: 0 };
  return { inv: raw.inv || 0, mun: raw.mun || 0, con: raw.con || 0 };
};

/**
 * Vida útil (años) según el grupo de la UCAP → clave del parámetro.
 *
 * Las claves son las de la hoja de Parámetros (`CregParametrosPage`) y tienen que
 * escribirse igual: una clave que no existe deja la UCAP sin vida útil, y sin
 * `nper` la anualidad no se puede calcular, así que esa fila aporta 0 a la
 * inversión sin decirlo. Es lo que pasaba con luminarias y fotocontroles.
 */
const VIDA_UTIL_KEY: Record<string, string> = {
  'LUMINARIAS': 'vuLuminariaLed',
  'FOTOCONTROLES': 'vuFotocontrol',
  'ELEMENTOS DE SOPORTE': 'vuElementosSoporte',
  'BOMBILLAS': 'vuBombillas',
  'POSTES': 'vuPostes',
  'REDES': 'vuRedes',
  'CANALIZACIONES': 'vuCanalizaciones',
  'TRANSFORMADORES': 'vuTransformadores',
  'MEDIDORES': 'vuMedidores',
  'PUESTA A TIERRA': 'vuPuestaTierra',
  'TELEGESTIÓN': 'vuTelegestion',
};

/** Parámetros del municipio, ya normalizados a número. */
export interface CregParamsDerived {
  r: number | null;            // WACC (%)
  faom: number | null;         // FAOM 123 (%)
  faoms: number;               // FAOMS (%)
  ne: number | null;           // Fracción Activos NE (%)
  idApagadas: number | null;
  idEncendidasParam: number | null;
  ippo: number | null;         // IPPo nov 2015
  ippFinal: number | null;     // IPP(m-1) por defecto
  efMinima: number | null;     // Valor Ef. Mínima (101)
  costosAmbientales: number | null;
  es101: boolean;
  faomRows: any[];
  params: Record<string, any>;
}

export const deriveParams = (params: Record<string, any>): CregParamsDerived => ({
  r: toNum(params.waccPropuesto),
  faom: toNum(params.faomOficial),
  faoms: toNum(params.faomsOficial) ?? 0,
  ne: toNum(params.ne),
  idApagadas: toNum(params.idApagadas),
  idEncendidasParam: toNum(params.idEncendidas),
  ippo: toNum(params.ippoNov2015),
  ippFinal: toNum(params.ippFinal),
  efMinima: toNum(params.eficienciaLuminarias),
  costosAmbientales: toNum(params.costosAmbientalesDisposicion),
  es101: params.resolucionVigente === '101-103',
  faomRows: Array.isArray(params.faomRows) ? params.faomRows : [],
  params,
});

/**
 * IPP(m-1) que le corresponde a un mes.
 *
 * Manda la tabla "IPP por mes" de Parámetros, donde el municipio lleva el índice
 * mes a mes; si ese mes no tiene valor, cae al "IPP final", que es el respaldo
 * único para todo el contrato. Recibe los parámetros crudos para poder llamarse
 * tanto desde la Liquidación como desde el Flujo de Caja.
 */
export const ippDelMes = (params: Record<string, any>, ym: string): number | null => {
  const tabla = params?.ippMeses;
  if (ym && tabla && typeof tabla === 'object') {
    const v = toNum(tabla[ym]);
    if (v != null) return v;
  }
  return toNum(params?.ippFinal);
};

/** Meses de `desde` a `hasta`, ambos 'YYYY-MM'. Negativo si `hasta` es anterior. */
const mesesEntre = (desde: string, hasta: string): number => {
  const [a1, m1] = desde.split('-').map(Number);
  const [a2, m2] = hasta.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
};

export interface IppMes {
  /** El índice que se usa en el mes. */
  valor: number | null;
  /** true cuando no es un dato del DANE sino la proyección. */
  proyectado: boolean;
  /** Último mes con dato real desde el que se proyectó. */
  anclaYm?: string;
}

/**
 * IPP del mes para el **flujo de caja**, proyectando hacia adelante.
 *
 * La tabla de Parámetros llega hasta el último mes publicado por el DANE. Antes,
 * los meses siguientes caían al "IPP final" —un valor fijo—, así que el índice se
 * congelaba y con él el CAOM y el CINV: un contrato a 20 años quedaba proyectado
 * a precios de hoy.
 *
 * Se replica lo que hace el modelo en Excel (hoja IPP, columna "IPP Oferta
 * Interna"): desde el último mes con dato real, cada mes siguiente es el anterior
 * por (1 + IPP mensual), **redondeado a dos decimales en cada paso**. Se encadena
 * en vez de elevar a la potencia porque así está definido en la hoja; con la serie
 * actual las dos formas coinciden, pero la que manda es la del archivo.
 *
 * Sin ningún dato real en la tabla no se proyecta nada: se cae al "IPP final",
 * que es el comportamiento de siempre.
 */
export const ippProyectadoDelMes = (
  params: Record<string, any>,
  ym: string,
  ippAnual: number,
): IppMes => {
  const tabla = params?.ippMeses;
  if (!ym || !tabla || typeof tabla !== 'object') {
    return { valor: toNum(params?.ippFinal), proyectado: false };
  }

  const propio = toNum(tabla[ym]);
  if (propio != null) return { valor: propio, proyectado: false };

  // El ancla es el mes con dato real más cercano por debajo del que se pide.
  let ancla: string | null = null;
  for (const k of Object.keys(tabla)) {
    if (!/^\d{4}-\d{2}$/.test(k) || toNum(tabla[k]) == null) continue;
    if (k >= ym) continue;
    if (ancla === null || k > ancla) ancla = k;
  }
  if (ancla === null) {
    return { valor: toNum(params?.ippFinal), proyectado: false };
  }

  const pasos = mesesEntre(ancla, ym);
  const mensual = (1 + (ippAnual || 0) / 100) ** (1 / 12) - 1;
  let v = toNum(tabla[ancla])!;
  for (let i = 0; i < pasos; i++) v = Math.round(v * (1 + mensual) * 100) / 100;
  return { valor: v, proyectado: true, anclaYm: ancla };
};

/** FAOML del año (101-013); en la 123 no aplica. */
export const faomlDelAnio = (P: CregParamsDerived, ym: string): number | null => {
  if (!P.es101 || !ym) return null;
  const anio = Number(ym.slice(0, 4));
  const fila = P.faomRows.find((f) => Number(f?.year) === anio);
  return fila?.faomlA != null ? Number(fila.faomlA) * 100 : null;
};

/** Factor de AOM del mes: (FAOML + FAOMS) en 101, (FAOM + FAOMS) en 123. Fracción. */
export const factorAomDe = (P: CregParamsDerived, ym: string): number | null => {
  const base = P.es101 ? faomlDelAnio(P, ym) : P.faom;
  return base != null ? (base + P.faoms) / 100 : null;
};

/**
 * Vida útil (años) de una UCAP según su grupo, leída de los parámetros crudos.
 *
 * Se exporta para que la Liquidación no lleve su propia copia de la tabla: es
 * un mapa de nombres, y dos copias acaban discrepando en una tecla sin que nada
 * falle —la fila simplemente deja de aportar inversión—.
 */
export const vidaUtilDeGrupo = (
  params: Record<string, any>,
  grupo: string | null,
): number | null => {
  const key = VIDA_UTIL_KEY[(grupo || '').trim().toUpperCase()];
  return key ? toNum(params[key]) : null;
};

const vidaUtilDe = (P: CregParamsDerived, grupo: string | null): number | null =>
  vidaUtilDeGrupo(P.params, grupo);

/** Mes del censo que le aplica a una columna del flujo. */
export interface CensoDelMes {
  /** Mes de donde salen las cantidades. */
  ym: string;
  /** true si no es el mes propio sino el último cierre anterior. */
  arrastrado: boolean;
}

/**
 * Para cada columna del horizonte, de qué mes del censo salen las cantidades.
 *
 * El censo tiene columnas hasta el último cierre. De ahí en adelante el flujo
 * sigue —el contrato dura 20 años— y dejarlo en cero apagaría el alumbrado de
 * golpe: ni CAOM, ni CINV, ni consumo de energía. Lo instalado sigue instalado,
 * así que el último cierre se arrastra hacia adelante y queda marcado.
 *
 * Antes del primer cierre no hay nada que arrastrar: esos meses quedan como
 * están, sin cantidades, y cada cálculo decide su propio respaldo.
 */
export const censoVigente = (
  cols: FlujoMonthCol[],
  quantities: Record<string, Record<string, CellQty | number>>,
): CensoDelMes[] => {
  const conDato = new Set<string>();
  for (const porMes of Object.values(quantities ?? {})) {
    for (const [ym, celda] of Object.entries(porMes ?? {})) {
      if (conDato.has(ym)) continue;
      const q = normalizeCell(celda);
      if (q.inv + q.mun + q.con > 0) conDato.add(ym);
    }
  }
  // Las dos series van en orden, así que basta un puntero: para cada columna se
  // avanza hasta el último mes censado que no la pase.
  const censados = [...conDato].sort();
  let i = 0;
  let ultimo: string | null = null;
  return cols.map((c) => {
    while (i < censados.length && censados[i] <= c.ym) { ultimo = censados[i]; i++; }
    if (ultimo === c.ym) return { ym: c.ym, arrastrado: false };
    return ultimo != null
      ? { ym: ultimo, arrastrado: true }
      : { ym: c.ym, arrastrado: false };
  });
};

/** Una fila del cálculo: cada UCAP se abre por apellido/variante (o una base). */
interface CalcRow { key: string; ucap: Ucap; grupo: string | null; }
const rowsForUcap = (u: Ucap): CalcRow[] =>
  u.apellidos.length === 0
    ? [{ key: String(u.ucapId), ucap: u, grupo: u.grupo }]
    : u.apellidos.map((a) => ({ key: `${u.ucapId}:${a.apellidoId}`, ucap: u, grupo: u.grupo }));

/** Agregado por grupo de un mes. */
export interface GrupoMes {
  grupo: string;
  activo: number;   // Σ valor × cantidad total
  aomMes: number;   // AOM del mes (sin índice)
  invMes: number;   // Inversión del mes (sin índice)
}

/** Grupo con que se contabiliza una UCAP que no trae ninguno. */
const SIN_GRUPO = 'SIN GRUPO';

const grupoDe = (u: Ucap): string => (u.grupo || '').trim().toUpperCase() || SIN_GRUPO;

/**
 * Los grupos con que se agrupa el cálculo: los 11 de la lista fija más los que
 * traigan las UCAPs por fuera de ella.
 *
 * Los de fuera existen —una UCAP sin grupo, o con uno escrito distinto— y valen
 * lo mismo que las demás. Antes no tenían casillero y se caían del cálculo en
 * silencio, mientras la Liquidación sí las sumaba: el mismo municipio daba dos
 * cifras según la pantalla. Salen de `ucaps`, no de las cantidades, así que la
 * lista es la misma en todos los meses y se puede indexar por posición.
 */
export const gruposDe = (ucaps: Ucap[]): string[] => {
  const extra: string[] = [];
  for (const u of ucaps) {
    const g = grupoDe(u);
    if (!UCAP_GRUPOS.includes(g as (typeof UCAP_GRUPOS)[number]) && !extra.includes(g)) {
      extra.push(g);
    }
  }
  return [...UCAP_GRUPOS, ...extra];
};

export interface MesResultado {
  ym: string;
  /** Mes del censo de donde salieron las cantidades (ver `censoVigente`). */
  censoYm: string;
  /** true si ese censo es el de un mes anterior, arrastrado hasta aquí. */
  censoArrastrado: boolean;
  indice: number | null;      // IPP(m-1) / IPPo
  grupos: GrupoMes[];         // los 11 fijos y los de fuera (ver `gruposDe`)
  activo: number;             // total infraestructura
  aomMes: number;             // Σ aomMes (sin índice)
  invMes: number;             // Σ invMes (sin índice)
  caomMensual: number;        // aomMes × índice  (CAOM MENSUAL)
  cinvMensual: number;        // invMes × índice  (CINV actualizado)
}

/**
 * Calcula un mes completo (todos los grupos) con las mismas reglas de la página
 * de Liquidación. `ids` e `ipp` caen a los parámetros cuando no hay dato propio
 * del mes (proyección hacia el futuro).
 */
export const computeMes = (
  ucaps: Ucap[],
  quantities: Record<string, Record<string, CellQty | number>>,
  P: CregParamsDerived,
  ym: string,
  opts: {
    idApagadas: number | null; idEncendidas: number; ippMes: number | null;
    /** Mes de donde leer las cantidades, si no es el propio (censo arrastrado). */
    censoYm?: string;
  },
): MesResultado => {
  // El factor de AOM sí es del mes propio: cambia por año de resolución, no por
  // el censo. Solo las cantidades vienen del mes censado.
  const factorAom = factorAomDe(P, ym);
  const censoYm = opts.censoYm || ym;
  const { idApagadas, idEncendidas } = opts;
  const indice = opts.ippMes != null && P.ippo ? opts.ippMes / P.ippo : null;

  const orden = gruposDe(ucaps);
  const acc = new Map<string, GrupoMes>();
  for (const g of orden) acc.set(g, { grupo: g, activo: 0, aomMes: 0, invMes: 0 });

  for (const u of ucaps) {
    const bucket = acc.get(grupoDe(u))!;
    for (const row of rowsForUcap(u)) {
      const c = normalizeCell(quantities[row.key]?.[censoYm]);
      const cantA = c.inv;
      const cantB = c.mun + c.con;
      const total = cantA + cantB;
      const vu = row.ucap.value || 0;
      const activo = vu * total;
      const aomAnual = factorAom != null ? activo * factorAom * idEncendidas : 0;

      const k = P.es101
        ? (row.ucap.efficiencyLmW != null && P.efMinima ? row.ucap.efficiencyLmW / P.efMinima : null)
        : 1;
      const cantInversion = P.es101 ? c.inv + c.con : cantA;
      const inversion = k != null ? vu * k * cantInversion : 0;
      const vidaUtil = vidaUtilDe(P, row.grupo);
      const invAnual =
        cinvAnual({
          r: P.r != null ? P.r / 100 : null,
          ne: P.ne != null ? P.ne / 100 : null,
          idApagadas,
          vidaUtil,
          valorInversion: inversion,
          valorTotal: activo,
        }) ?? 0;

      bucket.activo += activo;
      bucket.aomMes += aomAnual / 12;
      bucket.invMes += invAnual / 12;
    }
  }

  const grupos = orden.map((g) => acc.get(g)!);
  const activo = grupos.reduce((a, g) => a + g.activo, 0);
  const aomMes = grupos.reduce((a, g) => a + g.aomMes, 0);
  const invMes = grupos.reduce((a, g) => a + g.invMes, 0);
  const f = indice ?? 1;
  return {
    ym, censoYm, censoArrastrado: censoYm !== ym,
    indice, grupos, activo, aomMes, invMes,
    caomMensual: aomMes * f,
    cinvMensual: invMes * f,
  };
};

/* ── Valor a pagar del mes ──────────────────────────────────────────────────
 * La tarjeta LIQUIDACIÓN de la pantalla de Liquidación y su barra verde: lo que
 * se le cobra al municipio ese mes.
 *
 * Vive acá porque la Factura de concesión factura exactamente eso. Si cada
 * pantalla lo calculara por su lado, la factura podría salir por un valor que la
 * liquidación no reconoce, y el municipio tendría dos cifras del mismo mes.
 */

/** Las hojas CREG de un municipio: todo lo que hace falta para liquidar un mes. */
export interface HojasCreg {
  ucaps: Ucap[];
  quantities: Record<string, Record<string, CellQty | number>>;
  /** Parámetros del municipio, con la serie `ippMeses` del DANE ya inyectada. */
  params: Record<string, any>;
  /** Lo propio de cada mes liquidado: el IPP con que se liquidó y los ajustes. */
  meses: Record<string, LiquidacionMes>;
  iddOff: Record<string, IddOffMes>;
  iddOn: Record<string, IddOnMes>;
  /** El +12 en las horas fuera de servicio. Es por proyecto (ver `horasFuera`). */
  sumaMediaNoche: boolean;
}

export interface LiquidacionResultado {
  ym: string;
  es101: boolean;
  indice: number | null;
  ippMes: number | null;
  idApagadas: number | null;
  idEncendidas: number;
  /** Los dos "Valor a pagar" de la tarjeta, antes de ajustes. */
  valorAom: number;
  valorInv: number;
  /** Costos ambientales del mes. Solo en la 101-013. */
  ambMes: number;
  ajusteAom: number;
  ajusteInv: number;
  ajusteAmb: number;
  valorChura: number;
  /**
   * Los tres conceptos como van a la factura, ya redondeados al peso.
   *
   * Cada uno lleva su ajuste incorporado: el ajuste no es una nota al margen,
   * es parte de lo que se cobra —en el mes de la foto, la inversión se cobra
   * con 16,7 millones de ajuste— y una factura sin él saldría corta.
   */
  aom: number;
  inversion: number;
  /** Ambientales y CVURA, que en la factura no son AOM ni inversión. */
  otros: number;
  /** aom + inversion + otros. Se suma ya redondeado, que es lo que se factura. */
  total: number;
  /** El mes está cerrado en la Liquidación: la cifra ya no se mueve. */
  aprobado: boolean;
  /** false cuando el censo no tiene ese mes: todavía no hay nada que liquidar. */
  hayCenso: boolean;
}

/** Lo que se le cobra al municipio en `ym`, con las reglas de su resolución. */
export const liquidarMes = (h: HojasCreg, ym: string): LiquidacionResultado => {
  const P = deriveParams(h.params);
  const mes = h.meses[ym] ?? {};

  // Los índices del mes mandan sobre los parámetros: el de la hoja está quemado
  // a un mes concreto y solo sirve de respaldo.
  const off = h.iddOff[ym];
  const on = h.iddOn[ym];
  const idApagadas =
    (off ? indiceDisponibilidad(off.fallas ?? [], off.wt, off.t, h.sumaMediaNoche) : null)
    ?? P.idApagadas;
  const idEncendidas =
    (on ? indiceDisponibilidadOn(on.fallas ?? [], on.wt, on.t) : null)
    ?? P.idEncendidasParam ?? 1;

  // El IPP con que se liquidó el mes manda sobre la tabla del DANE: es el que
  // quedó firmado. Sin proyectar hacia adelante — esto liquida meses que ya
  // pasaron, no proyecta el contrato como el flujo de caja.
  const ippMes = mes.ippMes ?? ippDelMes(h.params, ym);

  const r = computeMes(h.ucaps, h.quantities, P, ym, { idApagadas, idEncendidas, ippMes });

  const valorAom = r.caomMensual;
  const valorInv = r.cinvMensual;
  const pctAmbiental = P.es101 && P.costosAmbientales != null ? P.costosAmbientales / 100 : 0;
  const ambMes = r.aomMes * pctAmbiental * (r.indice ?? 1);
  const ajusteAom = mes.ajusteAom ?? 0;
  const ajusteInv = mes.ajusteInv ?? 0;
  const ajusteAmb = P.es101 ? (mes.ajusteAmb ?? 0) : 0;
  const valorChura = P.es101 ? (mes.valorChura ?? 0) : 0;

  const aom = Math.round(valorAom + ajusteAom);
  const inversion = Math.round(valorInv + ajusteInv);
  const otros = Math.round(ambMes + ajusteAmb + valorChura);

  return {
    ym, es101: P.es101, indice: r.indice, ippMes, idApagadas, idEncendidas,
    valorAom, valorInv, ambMes, ajusteAom, ajusteInv, ajusteAmb, valorChura,
    aom, inversion, otros,
    // Se suman los tres ya redondeados y no el total con decimales: así el
    // subtotal de la factura da exactamente esto y no un peso más.
    total: aom + inversion + otros,
    aprobado: !!mes.aprobado,
    hayCenso: r.activo > 0,
  };
};

/** 'YYYY-MM' -> 'ene-24'. */
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export interface FlujoMonthCol { ym: string; label: string; year: number; mes: number; }

/* ── Supuestos del flujo (proyección) y Flujo de Caja Mensual (FCM) ─────────
 * Se guardan dentro del blob de Parámetros (params.flujoSupuestos), así no hay
 * cambios de esquema en la base de producción. Las series de ingresos y energía
 * se capturan por año (más práctico que 336 celdas mensuales) y el motor las
 * reparte a meses (÷12). Lo demás (CAOM, CINV) ya viene de computeMes.
 */

export interface FlujoSupuestosYear {
  impuestoAP: number; // Ingreso anual por Impuesto de A.P.
  energia: number;    // Costo anual de energía consumida ($)
}

export interface FlujoSupuestos {
  years: Record<string, FlujoSupuestosYear>;
  ambientalOn: boolean; ambientalPct: number; // Gestión ambiental = CAOM × %
  /**
   * Fiduciarios de arranque. La interventoría ya no vive aquí: su valor sale del
   * módulo de Recurso Económico, que lo lleva por año y por proyecto.
   */
  fiduciariosMes: number;
  expNavidenaPct: number;                      // % del impuesto A.P. mensual, solo diciembre
  /** Desde qué mes ('YYYY-MM') aplica la navideña; vacío = todo el horizonte. */
  expNavidenaDesde: string;
  gmf: boolean;                                // 4×1000
  /* ── Capturas mes a mes (ver computeFcm) ── */
  /**
   * Impuesto de A.P. recaudado en el mes. En el Excel la fila 10 son 337 valores
   * escritos uno por uno, y oscilan entre 190 y 280 millones dentro de un mismo
   * año: repartir el anual ÷ 12 aplana esa estacionalidad, así que el mes manda.
   */
  impuestoApMeses: Record<string, number>;
  /** Las otras dos líneas de ingreso de la hoja (filas 11 y 12). */
  equityMeses: Record<string, number>;
  otrosIngresosMeses: Record<string, number>;
  /** Interventoría y gastos fiduciarios facturados en el mes. */
  interventoriaMeses: Record<string, number>;
  fiduciariosMeses: Record<string, number>;
  /** % anual con que suben interventoría y fiduciarios cada enero (IPC). Dat!B28. */
  ipcAnual: number;
  /**
   * % anual con que se proyecta el IPP más allá del último dato del DANE (Dat!B27).
   * Es el índice que escala el CAOM y el CINV, así que mueve todo el flujo.
   */
  ippAnual: number;
  /** Expansiones vegetativas: % del total de ingresos, desde 'YYYY-MM'. */
  expVegetativaPct: number;
  expVegetativaDesde: string;
  /**
   * Saldo acumulado fijado a mano en un mes ('YYYY-MM'), que reemplaza el
   * acumulado en vez de sumarse. Es el corte real de la fiducia cuando el
   * arrastre contable no coincide con el saldo del banco.
   */
  saldoInicial: number;
  saldoInicialDesde: string;
  /* ENERGÍA (ver computeEnergia) */
  energiaHorasDia: number;                     // horas de encendido al día (12)
  energiaFactorPerdidas: number;               // factor de pérdidas aprobado (1.08)
  /**
   * Factor de pérdidas de un mes concreto: 'YYYY-MM' -> factor. El aprobado no
   * rige siempre — en el Excel de Puerto Asís hay 9 meses (feb a oct-2025) con
   * 1,00 escrito a mano en vez de 1,08 —, así que el mes manda sobre el global.
   */
  energiaFactores: Record<string, number>;
  energiaCrecimientoAnual: number;             // % anual del $/kWh en los meses proyectados
  /** Factura del mes ($): 'YYYY-MM' -> total pagado. Es el dato real. */
  energiaFacturas: Record<string, number>;
  /**
   * $/kWh fijado a mano: 'YYYY-MM' -> tarifa. Para el mes en que ya se conoce
   * la tarifa pero todavía no la factura (en el Excel, la celda BP132 escrita
   * a mano de la que arranca toda la proyección).
   */
  energiaValoresKwh: Record<string, number>;
}

export const emptySupuestos = (): FlujoSupuestos => ({
  years: {},
  ambientalOn: false, ambientalPct: 0,
  fiduciariosMes: 0,
  expNavidenaPct: 0,
  expNavidenaDesde: '',
  gmf: true,
  impuestoApMeses: {},
  equityMeses: {},
  otrosIngresosMeses: {},
  interventoriaMeses: {},
  fiduciariosMeses: {},
  ipcAnual: 6,
  ippAnual: 4,
  expVegetativaPct: 0,
  expVegetativaDesde: '',
  saldoInicial: 0,
  saldoInicialDesde: '',
  energiaHorasDia: 12,
  energiaFactorPerdidas: 1.08,
  energiaCrecimientoAnual: 4,
  energiaFacturas: {},
  energiaValoresKwh: {},
  energiaFactores: {},
});

/* ── ENERGÍA ────────────────────────────────────────────────────────────────
 * Réplica de la hoja ENERGÍA del Excel (Puerto Asís V2, columnas E en adelante):
 *
 *   potencia instalada (W)  = Σ cantidad del mes × Kte de la UCAP     (filas 68-125)
 *   TOTAL POTENCIA (kW)     = Σ / 1000                                (fila 126)
 *   días del mes            = DAY(EOMONTH(mes))                       (fila 127)
 *   energía (kWh)           = kW × 12 h × días                        (fila 128)
 *   factor de pérdidas      = 1,08, salvo los meses ajustados a mano  (fila 129)
 *   TOTAL ENERGÍA (kWh)     = ROUND(factor × energía)                 (fila 131)
 *   VALOR DEL kWh           = total pagado ÷ TOTAL ENERGÍA            (fila 132)
 *   TOTAL A PAGAR ($)       = valor escrito de la factura             (fila 133)
 *
 * Las dos últimas filas se invierten según el mes, y en el Excel hay tres
 * regímenes (columnas E-BO, BP-BR y BS en adelante):
 *
 *   factura    el TOTAL está escrito y el $/kWh se despeja de él.
 *   precio     el $/kWh está escrito —ya se conoce la tarifa, todavía no la
 *              factura— y el total sale de multiplicar.
 *   proyectado el $/kWh se arrastra del mes anterior con el crecimiento.
 *
 * Por eso `origen` viaja con cada mes: un total facturado y uno proyectado no
 * se leen igual aunque estén en la misma fila.
 *
 * El régimen `factura` tiene a su vez dos fuentes, y `facturaFuente` las separa:
 * la factura cargada en el módulo Factura de energía (el documento) y el total
 * tecleado en esta misma tabla, que la sobreescribe. Cuando las dos existen y no
 * coinciden, ambas viajan en el mes para poder mostrarlo.
 *
 * Kte es la potencia por luminaria CON pérdidas (sodio 70 W ⇒ 81 W por el
 * balasto); en LED no hay pérdidas y Kte es la nominal. Las solares no consumen
 * de la red: entran con Kte 0, igual que en el Excel.
 */

export interface EnergiaUcapMes {
  key: string;
  code: string;
  description: string;
  /** Potencia por luminaria (W), con pérdidas. */
  kte: number;
  cantidad: number;
  /** cantidad × kte, en W. */
  potenciaW: number;
  solar: boolean;
}

export interface EnergiaMes {
  ym: string; year: number; mes: number;
  potenciaKw: number;
  /**
   * true cuando la potencia no viene del censo de ese mes sino del último mes
   * que sí lo tiene. Las luminarias instaladas no se desinstalan porque el censo
   * deje de tener columnas, pero es un arrastre y hay que poder distinguirlo.
   */
  potenciaProyectada: boolean;
  dias: number;
  horasDia: number;
  /** kW × horas/día × días. */
  energiaKwh: number;
  factorPerdidas: number;
  /** ROUND(factor × energiaKwh). */
  totalKwh: number;
  valorKwh: number;
  total: number;
  /**
   * De dónde sale el total del mes:
   *  factura    — lo pagado, capturado a mano; el $/kWh se despeja de ahí.
   *  precio     — la tarifa está fijada a mano; el total sale de multiplicar.
   *  proyectado — $/kWh arrastrado del mes anterior × crecimiento.
   *  supuesto   — no hay potencia instalada en el censo: cae al costo anual
   *               de Supuestos ÷ 12 para no dejar el flujo en cero sin avisar.
   */
  origen: 'factura' | 'precio' | 'proyectado' | 'supuesto';
  /**
   * Cuando el mes es facturado, de dónde salió el total:
   *  documento — de la factura cargada en el módulo Factura de energía;
   *  manual    — tecleado en esta misma fila, que manda sobre el documento.
   */
  facturaFuente?: 'documento' | 'manual';
  /** Total del documento, aunque mande el capturado a mano: sirve para contrastar. */
  totalDocumento?: number | null;
  /** Consumo medido por el comercializador (kWh), del documento. */
  consumoFacturado?: number | null;
  /** Costo unitario impreso en la factura ($/kWh), del documento. */
  costoUnitarioFacturado?: number | null;
  /** N.º de documento (DEE) de la factura del mes. */
  facturaDoc?: string;
  detalle: EnergiaUcapMes[];
}

/**
 * Lo que el flujo necesita de la factura del comercializador. Es un resumen del
 * documento que guarda el módulo Factura de energía, no otra captura: aquí solo
 * llega ya resuelto qué cifra del documento es la que se gira.
 */
export interface FacturaDelMes {
  /** Lo que se paga: el total del documento, ya redondeado al peso. */
  total: number;
  consumoKwh?: number | null;
  costoUnitario?: number | null;
  documento?: string;
}

/** Días del mes de 'YYYY-MM'. */
const diasDelMes = (year: number, mes: number): number => new Date(year, mes, 0).getDate();

/** Las solares no consumen de la red. */
const esSolar = (u: Ucap): boolean => /\bSOLAR/i.test(u.description ?? '');

/** Potencia por luminaria (W) con pérdidas; 0 si la UCAP no la tiene cargada. */
export const kteDe = (u: Ucap): number => {
  if (esSolar(u)) return 0;
  const con = u.powerWithLosses;
  if (typeof con === 'number' && Number.isFinite(con) && con > 0) return con;
  return num(u.powerNominal) + num(u.powerLosses);
};

/**
 * Arma la hoja de ENERGÍA mes a mes.
 *
 * Solo entran las UCAPs del grupo LUMINARIAS: son las que consumen. Las
 * bombillas del censo son el repuesto de una luminaria ya contada, y sumarlas
 * duplicaría la potencia.
 */
export const computeEnergia = (
  cols: FlujoMonthCol[],
  ucaps: Ucap[],
  quantities: Record<string, Record<string, CellQty | number>>,
  sup: FlujoSupuestos,
  facturasDoc?: Record<string, FacturaDelMes>,
): EnergiaMes[] => {
  const luminarias = ucaps.filter((u) => (u.grupo || '').trim().toUpperCase() === 'LUMINARIAS');
  const horasDia = num(sup.energiaHorasDia) || 12;
  const factorGlobal = num(sup.energiaFactorPerdidas) || 1;
  const factores = sup.energiaFactores ?? {};
  // El Excel escala el $/kWh con el IPP mensual, que sale del anual.
  const crecMensual = (1 + num(sup.energiaCrecimientoAnual) / 100) ** (1 / 12) - 1;
  const facturas = sup.energiaFacturas ?? {};
  const precios = sup.energiaValoresKwh ?? {};

  // Pasado el último cierre, el parque instalado se arrastra: lo que está
  // instalado sigue consumiendo aunque el censo no tenga más columnas.
  const censo = censoVigente(cols, quantities);

  let valorAnterior = 0;
  return cols.map((c, i) => {
    const censoYm = censo[i]?.ym ?? c.ym;
    const potenciaProyectada = censo[i]?.arrastrado ?? false;
    const detalle: EnergiaUcapMes[] = luminarias.map((u) => {
      const kte = kteDe(u);
      // Los apellidos son el origen de la luminaria, no otra luminaria: suman.
      const cantidad = rowsForUcap(u).reduce((a, row) => {
        const q = normalizeCell(quantities[row.key]?.[censoYm]);
        return a + q.inv + q.mun + q.con;
      }, 0);
      return {
        key: String(u.ucapId), code: u.code, description: u.description,
        kte, cantidad, potenciaW: cantidad * kte, solar: esSolar(u),
      };
    }).filter((d) => d.cantidad > 0 || d.potenciaW > 0);

    const potenciaKw = detalle.reduce((a, d) => a + d.potenciaW, 0) / 1000;
    const dias = diasDelMes(c.year, c.mes);
    const energiaKwh = potenciaKw * horasDia * dias;
    const factorPerdidas = num(factores[c.ym]) || factorGlobal;
    const totalKwh = Math.round(factorPerdidas * energiaKwh);

    const doc = facturasDoc?.[c.ym];
    const delDoc = num(doc?.total);
    const aMano = num(facturas[c.ym]);
    // El documento es la fuente natural del mes; el número tecleado aquí sigue
    // mandando sobre él, igual que en la interventoría: es un ajuste explícito
    // sobre un dato que ya está, y borrarlo devuelve el mes al documento.
    const facturado = aMano > 0 ? aMano : delDoc;
    const fuente: EnergiaMes['facturaFuente'] = aMano > 0 ? 'manual' : 'documento';
    let valorKwh = 0;
    let total = 0;
    let origen: EnergiaMes['origen'] = 'proyectado';
    let facturaFuente: EnergiaMes['facturaFuente'];

    if (facturado > 0) {
      // El dato firme es la factura; el $/kWh se despeja. Manda sobre una tarifa
      // fijada a mano: lo que se pagó pesa más que lo que se esperaba pagar.
      total = facturado;
      valorKwh = totalKwh > 0 ? facturado / totalKwh : 0;
      origen = 'factura';
      facturaFuente = fuente;
    } else if (totalKwh > 0) {
      const fijado = num(precios[c.ym]);
      if (fijado > 0) {
        valorKwh = fijado;
        origen = 'precio';
      } else {
        // Se arrastra el $/kWh del mes anterior con el crecimiento del periodo.
        valorKwh = valorAnterior > 0 ? valorAnterior * (1 + crecMensual) : 0;
      }
      total = Math.round(valorKwh * totalKwh);
    } else {
      // Sin potencia instalada no hay nada que calcular: se usa el respaldo
      // anual de Supuestos para no dejar el flujo en cero en silencio.
      const anual = num(sup.years[String(c.year)]?.energia);
      total = anual / 12;
      origen = 'supuesto';
    }
    if (valorKwh > 0) valorAnterior = valorKwh;

    return {
      ym: c.ym, year: c.year, mes: c.mes,
      potenciaKw, potenciaProyectada, dias, horasDia, energiaKwh, factorPerdidas, totalKwh,
      valorKwh, total, origen, facturaFuente,
      totalDocumento: doc ? delDoc : null,
      consumoFacturado: doc?.consumoKwh ?? null,
      costoUnitarioFacturado: doc?.costoUnitario ?? null,
      facturaDoc: doc?.documento,
      detalle,
    };
  });
};

/** Fila del Flujo de Caja Mensual. */
export interface FcmMes {
  ym: string; year: number; mes: number;
  impuestoAP: number; equity: number; otrosIngresos: number; totalIngresos: number;
  energia: number; interventoria: number; fiduciarios: number; egresosOper: number;
  caom: number; cinv: number; ambiental: number; expNavidena: number;
  expVegetativa: number; totalPConcesionario: number;
  gmf: number; totalImpuestos: number;
  totalEgresos: number; saldoOperativo: number; saldoAcumulado: number;
  /** true si el impuesto salió del anual ÷ 12 y no de un recaudo capturado. */
  impuestoApEstimado: boolean;
  /** true si el acumulado de este mes se fijó a mano. */
  saldoFijado: boolean;
}

const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Arma el FCM mes a mes a partir de los resultados CAOM/CINV y los supuestos.
 *
 * Réplica de la hoja FCM del Excel (columnas C en adelante):
 *
 *   fila 10  Impuesto de A.P.        escrito mes a mes
 *   fila 13  TOTAL INGRESOS          = SUM(10:12)
 *   filas 17-19 energía              referencia directa a la hoja ENERGÍA
 *   fila 20  Interventoría           la factura del mes si está; si no, el valor
 *                                    del año que lleva Recurso Económico; y sin
 *                                    ninguno de los dos, el mes anterior subido
 *                                    cada enero por el IPC
 *   fila 21  Gastos fiduciarios      escritos mientras hay factura; después
 *                                    arrastran y suben cada enero por el IPC
 *   fila 22  Total oper.             = SUM(19:21)
 *   fila 27  Gestión ambiental       = ROUND(CAOM × %)
 *   fila 28  Sist. de Gestión de     no se replica: en el archivo el interruptor
 *            Activos (SIAP)          A28 está en 0 y la fórmula quedó rota
 *                                    (ENERGÍA!#REF!), así que no aporta al total.
 *                                    El SIAP se cobra por luminaria y vive en la
 *                                    Liquidación, no en el flujo de caja.
 *   fila 29  Expansión navideña      = ROUND(Impuesto A.P. × %) solo diciembre
 *   fila 30  Expansiones vegetativas = % × TOTAL INGRESOS, desde un mes dado
 *   fila 31  Total concesionario     = SUM(25:30)
 *   fila 34  GMF 4×1000              = ROUND((13 − 19) × 4/1000)
 *   fila 37  TOTAL EGRESOS           = 22 + 31 + 35
 *   fila 39  SALDO OPERATIVO         = 13 − 37
 *   fila 41  SALDO ACUMULADO         acumula, salvo el mes cuyo saldo se fija
 *                                    a mano, que lo reemplaza
 *
 * El GMF grava el ingreso menos la energía porque el pago de la energía sale de
 * la misma cuenta y no vuelve a girarse; así está en la fila 34 y así se replica.
 */
export const computeFcm = (
  cols: FlujoMonthCol[],
  resultados: MesResultado[],
  sup: FlujoSupuestos,
  energia?: EnergiaMes[],
  /** Interventoría del proyecto por año ('YYYY' -> $ mensual), de Recurso Económico. */
  interventoriaAnual?: Record<string, number>,
): FcmMes[] => {
  let acum = 0;
  // Interventoría y fiduciarios se arrastran de un mes al siguiente.
  let ultimaInterventoria = 0;
  let ultimoFiduciario = num(sup.fiduciariosMes);
  const ipc = num(sup.ipcAnual) / 100;
  const desdeVegetativa = (sup.expVegetativaDesde ?? '').trim();
  const desdeNavidena = (sup.expNavidenaDesde ?? '').trim();
  const mesSaldoFijo = (sup.saldoInicialDesde ?? '').trim();
  /**
   * Un mes capturado en cero no es un mes sin capturar: en el Excel hay meses
   * con 0 escrito —enero de 2022 no tuvo interventoría— y estimarlos borraría
   * ese hecho. Manda que la clave exista, no que el valor sea positivo.
   */
  const capturado = (serie: Record<string, number> | undefined, ym: string): number | null => {
    const v = serie?.[ym];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };

  return cols.map((c, i) => {
    const yr = sup.years[String(c.year)] ?? { impuestoAP: 0, energia: 0 };
    const recaudo = capturado(sup.impuestoApMeses, c.ym);
    const impuestoAP = recaudo != null ? recaudo : num(yr.impuestoAP) / 12;
    const equity = capturado(sup.equityMeses, c.ym) ?? 0;
    const otrosIngresos = capturado(sup.otrosIngresosMeses, c.ym) ?? 0;
    const energiaMes = energia?.[i];
    const energia$ = energiaMes ? energiaMes.total : num(yr.energia) / 12;
    const totalIngresos = impuestoAP + equity + otrosIngresos;   // fila 13 = SUM(10:12)

    /*
     * Interventoría, en orden de mando:
     *   1. la factura del mes, que es un hecho;
     *   2. el contrato del año, que lleva Recurso Económico —ese valor ya viene
     *      con su SMLV, su SMMLV y su IVA resueltos—;
     *   3. el arrastre del mes anterior subiendo cada enero por el IPC
     *      (fila 20: BS20 + IF(MONTH=1; BS20×IPC; 0)), para el tramo del
     *      horizonte que todavía no tiene contrato cargado.
     * El escalón de enero no se aplica cuando manda el contrato del año: ese
     * valor ya es el del año y volver a indexarlo lo contaría dos veces.
     */
    const capturaInt = capturado(sup.interventoriaMeses, c.ym);
    const delContrato = num(interventoriaAnual?.[String(c.year)]);
    if (capturaInt != null) ultimaInterventoria = capturaInt;
    else if (delContrato > 0) ultimaInterventoria = delContrato;
    else if (c.mes === 1 && i > 0) ultimaInterventoria *= 1 + ipc;
    const interventoria = ultimaInterventoria;

    const capturaFid = capturado(sup.fiduciariosMeses, c.ym);
    if (capturaFid != null) ultimoFiduciario = capturaFid;
    else if (c.mes === 1 && i > 0) ultimoFiduciario *= 1 + ipc;
    const fiduciarios = ultimoFiduciario;

    const caom = resultados[i]?.caomMensual ?? 0;
    const cinv = resultados[i]?.cinvMensual ?? 0;
    const ambiental = sup.ambientalOn ? Math.round(caom * (num(sup.ambientalPct) / 100)) : 0;
    const expNavidena = c.mes === 12 && (!desdeNavidena || c.ym >= desdeNavidena)
      ? Math.round(impuestoAP * (num(sup.expNavidenaPct) / 100))
      : 0;
    const expVegetativa = desdeVegetativa && c.ym >= desdeVegetativa
      ? totalIngresos * (num(sup.expVegetativaPct) / 100)
      : 0;

    const egresosOper = energia$ + interventoria + fiduciarios;
    const totalPConcesionario = caom + cinv + ambiental + expNavidena + expVegetativa;
    const gmf = sup.gmf ? Math.round((totalIngresos - energia$) * 4 / 1000) : 0;
    const totalImpuestos = gmf;
    const totalEgresos = egresosOper + totalPConcesionario + totalImpuestos;
    const saldoOperativo = totalIngresos - totalEgresos;

    // El corte a mano reemplaza el acumulado; no se le suma el mes.
    const saldoFijado = !!mesSaldoFijo && c.ym === mesSaldoFijo;
    if (saldoFijado) acum = num(sup.saldoInicial);
    else acum += saldoOperativo;

    return {
      ym: c.ym, year: c.year, mes: c.mes,
      impuestoAP, equity, otrosIngresos, totalIngresos,
      energia: energia$, interventoria, fiduciarios, egresosOper,
      caom, cinv, ambiental, expNavidena, expVegetativa, totalPConcesionario,
      gmf, totalImpuestos,
      totalEgresos, saldoOperativo, saldoAcumulado: acum,
      impuestoApEstimado: recaudo <= 0,
      saldoFijado,
    };
  });
};

/** Fila anual: suma de las filas mensuales del FCM por año. */
export interface FcmAnual {
  year: number;
  totalIngresos: number; energia: number; egresosOper: number;
  caom: number; cinv: number; ambiental: number; expNavidena: number;
  expVegetativa: number; totalPConcesionario: number;
  totalImpuestos: number; totalEgresos: number; saldoOperativo: number; saldoAcumulado: number;
}

export const rollupAnual = (fcm: FcmMes[]): FcmAnual[] => {
  const byYear = new Map<number, FcmAnual>();
  for (const m of fcm) {
    let a = byYear.get(m.year);
    if (!a) {
      a = { year: m.year, totalIngresos: 0, energia: 0, egresosOper: 0, caom: 0, cinv: 0, ambiental: 0, expNavidena: 0, expVegetativa: 0, totalPConcesionario: 0, totalImpuestos: 0, totalEgresos: 0, saldoOperativo: 0, saldoAcumulado: 0 };
      byYear.set(m.year, a);
    }
    a.totalIngresos += m.totalIngresos; a.energia += m.energia; a.egresosOper += m.egresosOper;
    a.caom += m.caom; a.cinv += m.cinv; a.ambiental += m.ambiental;
    a.expNavidena += m.expNavidena; a.expVegetativa += m.expVegetativa;
    a.totalPConcesionario += m.totalPConcesionario; a.totalImpuestos += m.totalImpuestos;
    a.totalEgresos += m.totalEgresos; a.saldoOperativo += m.saldoOperativo;
    a.saldoAcumulado = m.saldoAcumulado; // el acumulado del último mes del año
  }
  return [...byYear.values()].sort((x, y) => x.year - y.year);
};

export const monthsBetween = (start: string, end: string): FlujoMonthCol[] => {
  if (!start || !end) return [];
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  if (!sy || !sm || !ey || !em) return [];
  const cols: FlujoMonthCol[] = [];
  let y = sy, m = sm, guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard < 600) {
    cols.push({ ym: `${y}-${String(m).padStart(2, '0')}`, label: `${MESES[m - 1]}-${String(y).slice(2)}`, year: y, mes: m });
    m++; if (m > 12) { m = 1; y++; }
    guard++;
  }
  return cols;
};

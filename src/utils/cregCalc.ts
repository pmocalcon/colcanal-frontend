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
import { UCAP_GRUPOS } from '@/services/creg.service';

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

/** Vida útil (años) según el grupo de la UCAP → clave del parámetro. */
const VIDA_UTIL_KEY: Record<string, string> = {
  'LUMINARIAS': 'vuLuminarias',
  'FOTOCONTROLES': 'vuFotocontroles',
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

const vidaUtilDe = (P: CregParamsDerived, grupo: string | null): number | null => {
  const key = VIDA_UTIL_KEY[(grupo || '').trim().toUpperCase()];
  return key ? toNum(P.params[key]) : null;
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

export interface MesResultado {
  ym: string;
  indice: number | null;      // IPP(m-1) / IPPo
  grupos: GrupoMes[];         // 11 grupos, en orden fijo
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
  opts: { idApagadas: number | null; idEncendidas: number; ippMes: number | null },
): MesResultado => {
  const factorAom = factorAomDe(P, ym);
  const { idApagadas, idEncendidas } = opts;
  const indice = opts.ippMes != null && P.ippo ? opts.ippMes / P.ippo : null;

  const acc = new Map<string, GrupoMes>();
  for (const g of UCAP_GRUPOS) acc.set(g, { grupo: g, activo: 0, aomMes: 0, invMes: 0 });

  for (const u of ucaps) {
    const grupoKey = (u.grupo || '').trim().toUpperCase();
    const bucket = acc.get(grupoKey);
    for (const row of rowsForUcap(u)) {
      const c = normalizeCell(quantities[row.key]?.[ym]);
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

      if (bucket) {
        bucket.activo += activo;
        bucket.aomMes += aomAnual / 12;
        bucket.invMes += invAnual / 12;
      }
    }
  }

  const grupos = UCAP_GRUPOS.map((g) => acc.get(g)!);
  const activo = grupos.reduce((a, g) => a + g.activo, 0);
  const aomMes = grupos.reduce((a, g) => a + g.aomMes, 0);
  const invMes = grupos.reduce((a, g) => a + g.invMes, 0);
  const f = indice ?? 1;
  return {
    ym, indice, grupos, activo, aomMes, invMes,
    caomMensual: aomMes * f,
    cinvMensual: invMes * f,
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
  siapOn: boolean; siapValor: number;          // SIAP: $ por mes
  interventoriaMes: number; fiduciariosMes: number;
  expNavidenaPct: number;                      // % del impuesto A.P. mensual, solo diciembre
  gmf: boolean;                                // 4×1000
}

export const emptySupuestos = (): FlujoSupuestos => ({
  years: {},
  ambientalOn: false, ambientalPct: 0,
  siapOn: false, siapValor: 0,
  interventoriaMes: 0, fiduciariosMes: 0,
  expNavidenaPct: 0,
  gmf: true,
});

/** Fila del Flujo de Caja Mensual. */
export interface FcmMes {
  ym: string; year: number; mes: number;
  impuestoAP: number; totalIngresos: number;
  energia: number; interventoria: number; fiduciarios: number; egresosOper: number;
  caom: number; cinv: number; ambiental: number; siap: number; expNavidena: number; totalPConcesionario: number;
  gmf: number; totalImpuestos: number;
  totalEgresos: number; saldoOperativo: number; saldoAcumulado: number;
}

const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Arma el FCM mes a mes a partir de los resultados CAOM/CINV y los supuestos. */
export const computeFcm = (
  cols: FlujoMonthCol[],
  resultados: MesResultado[],
  sup: FlujoSupuestos,
): FcmMes[] => {
  let acum = 0;
  return cols.map((c, i) => {
    const yr = sup.years[String(c.year)] ?? { impuestoAP: 0, energia: 0 };
    const impuestoAP = num(yr.impuestoAP) / 12;
    const energia = num(yr.energia) / 12;
    const totalIngresos = impuestoAP;

    const caom = resultados[i]?.caomMensual ?? 0;
    const cinv = resultados[i]?.cinvMensual ?? 0;
    const ambiental = sup.ambientalOn ? Math.round(caom * (num(sup.ambientalPct) / 100)) : 0;
    const siap = sup.siapOn ? num(sup.siapValor) : 0;
    const expNavidena = c.mes === 12 ? Math.round(impuestoAP * (num(sup.expNavidenaPct) / 100)) : 0;
    const interventoria = num(sup.interventoriaMes);
    const fiduciarios = num(sup.fiduciariosMes);

    const egresosOper = energia + interventoria + fiduciarios;
    const totalPConcesionario = caom + cinv + ambiental + siap + expNavidena;
    const gmf = sup.gmf ? Math.round((totalIngresos - energia) * 4 / 1000) : 0;
    const totalImpuestos = gmf;
    const totalEgresos = egresosOper + totalPConcesionario + totalImpuestos;
    const saldoOperativo = totalIngresos - totalEgresos;
    acum += saldoOperativo;

    return {
      ym: c.ym, year: c.year, mes: c.mes,
      impuestoAP, totalIngresos,
      energia, interventoria, fiduciarios, egresosOper,
      caom, cinv, ambiental, siap, expNavidena, totalPConcesionario,
      gmf, totalImpuestos,
      totalEgresos, saldoOperativo, saldoAcumulado: acum,
    };
  });
};

/** Fila anual: suma de las filas mensuales del FCM por año. */
export interface FcmAnual {
  year: number;
  totalIngresos: number; energia: number; egresosOper: number;
  caom: number; cinv: number; ambiental: number; siap: number; expNavidena: number; totalPConcesionario: number;
  totalImpuestos: number; totalEgresos: number; saldoOperativo: number; saldoAcumulado: number;
}

export const rollupAnual = (fcm: FcmMes[]): FcmAnual[] => {
  const byYear = new Map<number, FcmAnual>();
  for (const m of fcm) {
    let a = byYear.get(m.year);
    if (!a) {
      a = { year: m.year, totalIngresos: 0, energia: 0, egresosOper: 0, caom: 0, cinv: 0, ambiental: 0, siap: 0, expNavidena: 0, totalPConcesionario: 0, totalImpuestos: 0, totalEgresos: 0, saldoOperativo: 0, saldoAcumulado: 0 };
      byYear.set(m.year, a);
    }
    a.totalIngresos += m.totalIngresos; a.energia += m.energia; a.egresosOper += m.egresosOper;
    a.caom += m.caom; a.cinv += m.cinv; a.ambiental += m.ambiental; a.siap += m.siap; a.expNavidena += m.expNavidena;
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

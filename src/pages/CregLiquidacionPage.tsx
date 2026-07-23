import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cregService, UCAP_GRUPOS, indiceDisponibilidad, indiceDisponibilidadOn, vceein } from '@/services/creg.service';
import type { LiquidacionMes, IddOffMes, IddOnMes } from '@/services/creg.service';
import { surveysService } from '@/services/surveys.service';
import type { Ucap } from '@/services/surveys.service';
import { masterDataService } from '@/services/master-data.service';
import type { Company, Project } from '@/services/master-data.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Save, Receipt, AlertCircle, Download } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { buildXlsxBlob, downloadBlob } from '@/utils/xlsxWriter';
import type { XlsxRow, XlsxImage } from '@/utils/xlsxWriter';

const EXCLUDED_COMPANY_NAMES = [
  'Inversiones Garcés Escalante',
  'Uniones y Alianzas',
  'Unión Temporal Alumbrado Público Jamundí',
];

const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const fmtCOP = (n: number) =>
  '$' + Math.round(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
const fmtQty = (n: number) => (n || 0).toLocaleString('es-CO');
const fmtNum = (n: number | null, dec = 2) =>
  n == null ? '—' : n.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtPct = (n: number | null) => (n == null ? '—' : `${fmtNum(n, 1)}%`);

/** 'YYYY-MM' -> 'enero de 2025' */
const monthLongLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return `${MONTH_NAMES[m - 1]} de ${y}`;
};

interface MonthCol { ym: string; label: string; mes: number; }

function monthsBetween(start: string, end: string): MonthCol[] {
  if (!start || !end) return [];
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  if (!sy || !sm || !ey || !em) return [];
  const cols: MonthCol[] = [];
  let y = sy, m = sm, guard = 0, i = 0;
  while ((y < ey || (y === ey && m <= em)) && guard < 600) {
    cols.push({
      ym: `${y}-${String(m).padStart(2, '0')}`,
      label: `${MONTH_ABBR[m - 1]}-${String(y).slice(2)}`,
      mes: 1 + i,
    });
    m++; if (m > 12) { m = 1; y++; }
    guard++; i++;
  }
  return cols;
}

// ---- Celda del censo (mismo formato que el Censo físico) ----
interface CellQty { inv: number; mun: number; con: number; }
const normalizeCell = (raw: CellQty | number | undefined | null): CellQty => {
  if (raw == null) return { inv: 0, mun: 0, con: 0 };
  if (typeof raw === 'number') return { inv: raw, mun: 0, con: 0 };
  return { inv: raw.inv || 0, mun: raw.mun || 0, con: raw.con || 0 };
};

/** Fila de la liquidación: una por UCAP y apellido (igual que el censo). */
interface LiqRow {
  key: string;
  ucap: Ucap;
  apellido: string | null;
}
const rowsForUcap = (u: Ucap): LiqRow[] =>
  u.apellidos.length === 0
    ? [{ key: String(u.ucapId), ucap: u, apellido: null }]
    : u.apellidos.map((a) => ({ key: `${u.ucapId}:${a.apellidoId}`, ucap: u, apellido: a.apellido }));

const rowLabel = (r: LiqRow) =>
  r.apellido ? `${r.ucap.description} (${r.apellido})` : r.ucap.description;

/**
 * Vida útil por grupo de UCAP: cada grupo tiene su propia clave en la hoja de
 * Parámetros (el Excel usa 15 años en luminarias y 10 en medidores/diseños).
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

const toNum = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/**
 * PAGO de Excel (PMT): cuota que amortiza `pv` en `nper` periodos a `rate`.
 * El Excel la invoca con pv negativo para que la cuota salga positiva.
 */
const pago = (rate: number, nper: number, pv: number): number => {
  if (nper <= 0) return 0;
  if (rate === 0) return -pv / nper;
  return (-pv * rate) / (1 - Math.pow(1 + rate, -nper));
};

/**
 * Anualidad de inversión (CINV anual), réplica de la hoja UCAPs del Excel CREG:
 *
 *   =(PAGO(r; vidaUtil; -valorInversion)
 *     + PAGO(r; vidaUtil; -valorTotal) * ne) * IDapagadas
 *
 * Los dos PAGO usan la vida útil del grupo de la UCAP (15 años luminarias, 30
 * postes/redes, 10 medidores). El primero amortiza el valor de la inversión
 * UTAP; el segundo, el valor total, ponderado por NE (reposición). No se escala
 * por eficiencia luminosa ni se usa un periodo Vi aparte. Verificado contra el
 * Excel de Puerto Asís (junio 2026): fila LED 35W = 962.270.282,95, al peso.
 */
const cinvAnual = (p: {
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

export default function CregLiquidacionPage() {
  const navigate = useNavigate();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const [ucaps, setUcaps] = useState<Ucap[]>([]);
  const [params, setParams] = useState<Record<string, any>>({});
  const [quantities, setQuantities] = useState<Record<string, Record<string, CellQty | number>>>({});
  const [meses, setMeses] = useState<Record<string, LiquidacionMes>>({});
  const [iddMeses, setIddMeses] = useState<Record<string, IddOffMes>>({});
  const [iddOnMeses, setIddOnMeses] = useState<Record<string, IddOnMes>>({});
  const [selYm, setSelYm] = useState<string | null>(null);

  // Las UCAPs sin cantidades en el mes se ocultan: aportan 0 a todas las
  // columnas, así que esconderlas no cambia subtotales ni total.
  const [mostrarSinCantidad, setMostrarSinCantidad] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    masterDataService.getCompanies()
      .then((res) => {
        setCompanies(res.filter((c) => !EXCLUDED_COMPANY_NAMES.some((e) => c.name.includes(e))));
        setLoadingCompanies(false);
      })
      .catch(() => { setError('Error al cargar empresas'); setLoadingCompanies(false); });
  }, []);

  const selectedCompany = companies.find((c) => c.companyId === selectedCompanyId);
  const isCanalesContactos = selectedCompany?.name === 'Canales & Contactos';

  useEffect(() => {
    if (!selectedCompanyId || !isCanalesContactos) { setProjects([]); setSelectedProjectId(null); return; }
    masterDataService.getProjects(selectedCompanyId)
      .then((res) => setProjects(Array.isArray(res) ? res : []))
      .catch(() => {});
  }, [selectedCompanyId, isCanalesContactos]);

  const load = useCallback((companyId: number, projectId: number | null) => {
    setLoading(true);
    setError(null);
    Promise.all([
      surveysService.getUcaps(companyId, projectId ?? undefined),
      cregService.getParametrizacion(companyId, projectId),
      cregService.getCenso(companyId, projectId),
      cregService.getLiquidacion(companyId, projectId),
      cregService.getIddOff(companyId, projectId),
      cregService.getIddOn(companyId, projectId),
    ])
      .then(([ucapsRes, param, censo, liq, idd, iddOn]) => {
        setUcaps(ucapsRes.ucaps);
        setParams(param.data ?? {});
        setQuantities(censo.data?.quantities ?? {});
        setMeses(liq.data?.meses ?? {});
        setIddMeses(idd.data?.meses ?? {});
        setIddOnMeses(iddOn.data?.meses ?? {});
        setLoading(false);
      })
      .catch(() => { setError('Error al cargar la liquidación'); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) return;
    if (isCanalesContactos && !selectedProjectId) return;
    load(selectedCompanyId, selectedProjectId);
  }, [selectedCompanyId, selectedProjectId, isCanalesContactos, load]);

  // Los meses liquidables son los del censo (rango definido en Parámetros).
  const cols = useMemo(
    () => monthsBetween(params.fechaInicio ?? '', params.fechaFinal ?? ''),
    [params.fechaInicio, params.fechaFinal],
  );

  useEffect(() => {
    if (cols.length === 0) { setSelYm(null); return; }
    setSelYm((cur) => (cur && cols.some((c) => c.ym === cur) ? cur : cols[cols.length - 1].ym));
  }, [cols]);

  // ---- Parámetros del municipio (solo lectura; se editan en Parámetros) ----
  const P = useMemo(() => ({
    municipio: params.municipioContratante ?? null,
    contratista: params.contratista ?? null,
    resolucion: params.resolucionVigente ?? null,
    // r = WACC Propuesto: es el 11,3% que el Excel usa como r y rotula en la
    // columna "CINV Anual 11,3%". El Oficial (12,09%) no interviene.
    r: toNum(params.waccPropuesto),                // r (WACC)
    faom: toNum(params.faomOficial),               // FAOM CREG 123/11
    faoms: toNum(params.faomsOficial) ?? 0,        // FAOMS: 2º factor de AOM (0 si no aplica)
    idEncendidasParam: toNum(params.idEncendidas), // ID encendidas (respaldo)
    ippo: toNum(params.ippoNov2015),               // IPPo nov 2015
    ippFinal: toNum(params.ippFinal),              // IPP(m-1) por defecto
    // Entradas de la anualidad de inversión (CINV).
    ne: toNum(params.ne),                          // Fracción Activos NE
    idApagadas: toNum(params.idApagadas),          // IDapagadas
    costosAmbientales: toNum(params.costosAmbientalesDisposicion), // Costos ambientales
    // Divisor del factor de ajuste de eficacia (k) en la 101-013: el Excel lo
    // rotula "Valor Ef. Mínima" y en Santa Bárbara vale 130.
    efMinima: toNum(params.eficienciaLuminarias),
  }), [params]);

  /** true cuando el municipio liquida por la Res. 101-013 en vez de la 123. */
  const es101 = params.resolucionVigente === '101-103';

  /**
   * FAOML del año liquidado (Res. 101-013). Sale de la tabla FAOML/FAOMn de
   * Parámetros, columna 101-013, que varía año a año. En la 123 no aplica: allí
   * el factor de AOM es el FAOM Oficial, constante.
   */
  const faomlDelAnio = useMemo(() => {
    if (!es101 || !selYm) return null;
    const anio = Number(selYm.slice(0, 4));
    const filas: any[] = Array.isArray(params.faomRows) ? params.faomRows : [];
    const fila = filas.find((f) => Number(f?.year) === anio);
    return fila?.faomlA != null ? Number(fila.faomlA) * 100 : null;
  }, [es101, selYm, params.faomRows]);

  /** Factor de AOM: (FAOML + FAOMS) en la 101-013, (FAOM + FAOMS) en la 123. */
  const factorAom = useMemo(() => {
    const base = es101 ? faomlDelAnio : P.faom;
    return base != null ? (base + P.faoms) / 100 : null;
  }, [es101, faomlDelAnio, P.faom, P.faoms]);

  /** Vida útil (años) de una UCAP según su grupo. */
  const vidaUtilDe = useCallback((grupo: string | null): number | null => {
    const key = VIDA_UTIL_KEY[(grupo || '').trim().toUpperCase()];
    return key ? toNum(params[key]) : null;
  }, [params]);

  /**
   * IDapagadas del mes: lo calcula IDD OFF con las fallas de ese periodo. El
   * parámetro de la hoja es solo respaldo — está quemado a un mes concreto, así
   * que si hay datos del periodo mandan ellos.
   */
  const idCalculado = useMemo(() => {
    if (!selYm) return null;
    const m = iddMeses[selYm];
    return m ? indiceDisponibilidad(m.fallas ?? [], m.wt, m.t) : null;
  }, [iddMeses, selYm]);

  const idApagadas = idCalculado ?? P.idApagadas;

  /**
   * ID de encendidas y VCEEIn del mes: los calcula ID ON con las fallas del
   * periodo (luminarias prendidas de día). El Excel multiplica el AOM por este
   * ID. Si no hay datos del mes, cae al parámetro (respaldo, por defecto 1).
   */
  const idOnMes = selYm ? iddOnMeses[selYm] : undefined;
  const idEncendidasCalc = useMemo(
    () => (idOnMes ? indiceDisponibilidadOn(idOnMes.fallas ?? [], idOnMes.wt, idOnMes.t) : null),
    [idOnMes],
  );
  const idEncendidas = idEncendidasCalc ?? P.idEncendidasParam ?? 1;
  const vceeinMes = useMemo(
    () => (idOnMes ? vceein(idOnMes.fallas ?? [], idOnMes.teen) : null),
    [idOnMes],
  );

  const mesActual: LiquidacionMes = (selYm && meses[selYm]) || {};
  const ippMes = mesActual.ippMes ?? P.ippFinal;
  const ajusteAom = mesActual.ajusteAom ?? 0;
  const ajusteInv = mesActual.ajusteInv ?? 0;

  const setMesField = (field: keyof LiquidacionMes, value: number | null) => {
    if (!selYm) return;
    setMeses((prev) => ({ ...prev, [selYm]: { ...(prev[selYm] ?? {}), [field]: value } }));
  };

  const [guardandoResolucion, setGuardandoResolucion] = useState(false);

  /**
   * La resolución vive en los Parámetros del municipio, no en el mes. Se guarda
   * de una vez —sin pasar por el botón Guardar, que persiste los meses— y hay que
   * reenviar el resto de parámetros: saveParametrizacion reemplaza el JSON entero.
   */
  const cambiarResolucion = async (valor: string) => {
    if (!selectedCompanyId || valor === params.resolucionVigente) return;
    const previos = params;
    setParams({ ...previos, resolucionVigente: valor });
    setGuardandoResolucion(true);
    try {
      await cregService.saveParametrizacion(
        selectedCompanyId,
        { ...previos, resolucionVigente: valor },
        selectedProjectId,
      );
      toast.success(`Resolución vigente: ${valor}`);
    } catch (err: any) {
      setParams(previos);
      toast.error(err?.response?.data?.message || 'No se pudo guardar la resolución');
    } finally {
      setGuardandoResolucion(false);
    }
  };

  /** Índice de actualización de precio = IPP(m-1) / IPPo nov 2015. */
  const indice = useMemo(
    () => (ippMes != null && P.ippo ? ippMes / P.ippo : null),
    [ippMes, P.ippo],
  );

  const allRows = useMemo(() => ucaps.flatMap(rowsForUcap), [ucaps]);

  const getCell = useCallback(
    (key: string, ym: string): CellQty => normalizeCell(quantities[key]?.[ym]),
    [quantities],
  );

  /**
   * Cálculo por fila (Res. CREG 123 de 2011).
   *  cantA  = inversión inicial            -> "Cantidades Inversión UTAP Nuevas"
   *  cantB  = municipios y terceros + concesionario -> "Inversión Municipio y Otros"
   *  total  = cantA + cantB
   *  activo      = valor unitario x total   -> "Valor UCAPs"
   *  aomAnual    = activo x FAOM ;  aomMes = aomAnual / 12
   *  inversion   = valor unitario x cantA   -> "Valor Total UCAPs"
   *  invAnual    = anualidad del Excel (ver cinvAnual) ;  invMes = invAnual / 12
   */
  const filas = useMemo(() => {
    if (!selYm) return [];
    return allRows.map((row) => {
      const c = getCell(row.key, selYm);
      const cantA = c.inv;
      const cantB = c.mun + c.con;
      const total = cantA + cantB;
      const vu = row.ucap.value || 0;
      const activo = vu * total;
      // AOM anual = activo × factor × ID_encendidas. El factor lo decide la
      // resolución: FAOML en la 101-013, FAOM en la 123.
      const aomAnual = factorAom != null ? activo * factorAom * idEncendidas : 0;
      /**
       * Base de la inversión.
       *  123      → V/Unit × cantidades de inversión (sin ajuste de eficacia).
       *  101-013  → V/Unit × k × (Modernización + Expansión), con
       *             k = eficacia Lm/W de la UCAP ÷ Valor Ef. Mínima.
       * Sin eficacia cargada en la UCAP no hay k, y esa fila aporta 0 a la
       * inversión: se avisa arriba en vez de calcularla como si k fuese 1.
       */
      const k = es101
        ? (row.ucap.efficiencyLmW != null && P.efMinima ? row.ucap.efficiencyLmW / P.efMinima : null)
        : 1;
      const cantInversion = es101 ? c.inv + c.con : cantA;
      const inversion = k != null ? vu * k * cantInversion : 0;
      // La anualidad amortiza inversión y valor total a la vida útil del grupo de
      // la UCAP, ponderando la reposición por NE. Es la misma en las dos
      // resoluciones; lo que cambia es la base de inversión que entra aquí.
      const vidaUtil = vidaUtilDe(row.ucap.grupo);
      const invAnual =
        cinvAnual({
          r: P.r != null ? P.r / 100 : null,
          ne: P.ne != null ? P.ne / 100 : null,
          idApagadas,
          vidaUtil,
          valorInversion: inversion,
          valorTotal: activo,
        }) ?? 0;
      return {
        ...row,
        vidaUtil,
        cantA, cantB, total, cantInversion,
        activo,
        aomAnual,
        aomMes: aomAnual / 12,
        inversion,
        invAnual,
        invMes: invAnual / 12,
      };
    });
  }, [allRows, selYm, getCell, factorAom, es101, P.efMinima, P.r, P.ne, idApagadas, idEncendidas, vidaUtilDe]);

  /**
   * UCAPs con cantidades de inversión pero sin eficacia Lm/W: en la 101-013 no se
   * les puede calcular k, así que quedan fuera de la inversión.
   */
  const sinEficacia = useMemo(() => {
    if (!es101) return [];
    return filas
      .filter((f) => f.ucap.efficiencyLmW == null && f.cantInversion > 0)
      .map((f) => f.ucap.code);
  }, [es101, filas]);

  const filaPorKey = useMemo(() => new Map(filas.map((f) => [f.key, f])), [filas]);

  // UCAPs agrupadas por grupo, en el orden de la lista fija.
  const grupos = useMemo(() => {
    const order = new Map<string, number>();
    UCAP_GRUPOS.forEach((g, i) => order.set(g, i));
    const byGroup = new Map<string, Ucap[]>();
    for (const u of ucaps) {
      const key = u.grupo?.trim() || 'Sin grupo';
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(u);
    }
    const rank = (k: string) => (order.has(k) ? order.get(k)! : k === 'Sin grupo' ? 9999 : 5000);
    return [...byGroup.keys()]
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
      .map((grupo) => ({ grupo, items: byGroup.get(grupo)! }));
  }, [ucaps]);

  const sumar = (rows: typeof filas) => rows.reduce((a, f) => ({
    cantA: a.cantA + f.cantA,
    cantB: a.cantB + f.cantB,
    total: a.total + f.total,
    activo: a.activo + f.activo,
    aomAnual: a.aomAnual + f.aomAnual,
    aomMes: a.aomMes + f.aomMes,
    inversion: a.inversion + f.inversion,
    invAnual: a.invAnual + f.invAnual,
    invMes: a.invMes + f.invMes,
  }), { cantA: 0, cantB: 0, total: 0, activo: 0, aomAnual: 0, aomMes: 0, inversion: 0, invAnual: 0, invMes: 0 });

  const totalGeneral = useMemo(() => sumar(filas), [filas]);

  // ---- Bloque de resultados ----
  // AOM e INV van SIN los ajustes; el valor a pagar los suma aparte.
  //   123      → AOM + INV + ajuste AOM + ajuste inversión.
  //   101-013  → agrega los costos ambientales mensuales, su ajuste y el CVURA.
  const valorAom = totalGeneral.aomMes * (indice ?? 1);
  const valorInv = totalGeneral.invMes * (indice ?? 1);
  // Costos ambientales = CAOM × % ambiental × índice (Excel: L81×L5×O2 anual,
  // M81×L5×O2 mensual). Solo existen en la 101-013.
  const pctAmbiental = es101 && P.costosAmbientales != null ? P.costosAmbientales / 100 : 0;
  const ambAnual = totalGeneral.aomAnual * pctAmbiental * (indice ?? 1);
  const ambMes = totalGeneral.aomMes * pctAmbiental * (indice ?? 1);
  const ajusteAmb = es101 ? (mesActual.ajusteAmb ?? 0) : 0;
  const valorChura = es101 ? (mesActual.valorChura ?? 0) : 0;
  const valorAPagar = es101
    ? valorAom + valorInv + ambMes + ajusteAom + ajusteInv + ajusteAmb + valorChura
    : valorAom + valorInv + ajusteAom + ajusteInv;

  const handleSave = async () => {
    if (!selectedCompanyId) return;
    setSaving(true);
    try {
      await cregService.saveLiquidacion(selectedCompanyId, { meses }, selectedProjectId);
      toast.success('Liquidación guardada');
    } catch {
      toast.error('Error al guardar la liquidación');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Exporta la liquidación del mes a un .xlsx que reproduce lo que se ve en
   * pantalla: encabezado (municipio, mes, resolución), parámetros, resultados,
   * el valor a pagar y la tabla de activo con subtotales por grupo y total. Los
   * campos de resumen van como texto con el mismo formato de la pantalla; las
   * celdas de la tabla van como números reales para que Excel pueda re-sumar.
   */
  const handleExportExcel = async () => {
    if (!selectedCompanyId || !selYm) return;
    setExporting(true);
    try {
      const projName = isCanalesContactos
        ? projects.find((p) => p.projectId === selectedProjectId)?.name
        : undefined;
      const municipioLabel = [selectedCompany?.name, projName].filter(Boolean).join(' — ');
      const resLabel = es101 ? '101 de 2013' : '123 de 2011';
      const mesLabel = monthLongLabel(selYm);
      const rows: XlsxRow[] = [];
      const merges: string[] = [];
      // Fila de 13 celdas vacías (una por columna A..M) para posicionar cada
      // tarjeta en su franja de columnas.
      const blank = (): XlsxRow => Array.from({ length: 13 }, () => ({ v: '' as string }));

      // ── Encabezado en 3 tarjetas, tal como en pantalla ──
      // Izquierda: identidad + contexto. Centro: PARÁMETROS. Derecha:
      // LIQUIDACIÓN (resultados + ajustes). Debajo, la barra verde del total.
      const leftCard: [string, string][] = [
        ['Mes de liquidación', mesLabel],
        ['Resolución vigente', `Res. CREG ${resLabel}`],
        ['IPP(m-1) del mes liquidado', fmtNum(ippMes)],
      ];
      const midCard: [string, string][] = [
        ['r', fmtPct(P.r)],
        ['VCEEIn', vceeinMes != null ? fmtCOP(vceeinMes) : '—'],
        ['ID encendidas', fmtNum(idEncendidas, 9)],
        ['ID apagadas', fmtNum(idApagadas, 9)],
        [es101 ? 'FAOML' : 'FAOM', fmtPct(es101 ? faomlDelAnio : P.faom)],
        ['FAOMS', fmtPct(P.faoms)],
        ...(es101 ? [['Costos ambientales', fmtPct(P.costosAmbientales)] as [string, string]] : []),
        ['Fracción Activos NE', fmtNum(P.ne, 3)],
        ...(es101 ? [['Valor Ef. Mínima', fmtNum(P.efMinima)] as [string, string]] : []),
        ['IPPo noviembre 2015', fmtNum(P.ippo)],
      ];
      // El valor es número (dinero, formato $) o texto (el índice).
      const rightCard: { label: string; value: number | string; money: boolean }[] = [
        { label: 'Índice actualización precio', value: fmtNum(indice), money: false },
        { label: 'Valor a pagar AOM', value: Math.round(valorAom), money: true },
        { label: 'Valor a pagar INV', value: Math.round(valorInv), money: true },
        ...(es101 ? [
          { label: 'Costos ambientales anuales', value: Math.round(ambAnual), money: true },
          { label: 'Costos ambientales mensuales', value: Math.round(ambMes), money: true },
        ] : []),
        { label: 'Ajuste AOM', value: Math.round(ajusteAom), money: true },
        { label: 'Ajuste inversión', value: Math.round(ajusteInv), money: true },
        ...(es101 ? [
          { label: 'Ajuste costos ambientales', value: Math.round(ajusteAmb), money: true },
          { label: 'Valor a pagar c/hura (inversión)', value: Math.round(valorChura), money: true },
        ] : []),
      ];

      // ── Cuadrícula del encabezado en 3 tarjetas ──
      // La tarjeta izquierda reserva las primeras filas para el logo; el título
      // (municipio) y sus datos van debajo. Las tarjetas central y derecha
      // arrancan desde la fila 1.
      const LOGO_ROWS = 6;
      const leftHeaderRow = LOGO_ROWS;        // fila (0-based) del título del municipio
      const leftFirstItem = LOGO_ROWS + 1;
      const headerHeight = Math.max(
        1 + midCard.length,
        1 + rightCard.length,
        leftFirstItem + leftCard.length,
      );
      const grid: XlsxRow[] = Array.from({ length: headerHeight }, () => blank());
      const XLR = (i: number) => i + 1; // fila Excel del índice de grid (bloque desde la fila 1)

      // Tarjeta central (PARÁMETROS): título en la fila 1, datos debajo.
      grid[0][4] = { v: 'PARÁMETROS', s: 'cardHeader' };
      [5, 6, 7].forEach((c) => { grid[0][c] = { v: '', s: 'cardHeader' }; });
      merges.push('E1:H1');
      midCard.forEach(([label, value], j) => {
        const gi = 1 + j;
        grid[gi][4] = { v: label, s: 'cardLabel' };
        grid[gi][5] = { v: '', s: 'cardLabel' };
        grid[gi][6] = { v: value, s: 'cardValue' };
        grid[gi][7] = { v: '', s: 'cardValue' };
        merges.push(`E${XLR(gi)}:F${XLR(gi)}`, `G${XLR(gi)}:H${XLR(gi)}`);
      });

      // Tarjeta derecha (LIQUIDACIÓN).
      grid[0][8] = { v: 'LIQUIDACIÓN', s: 'cardHeader' };
      [9, 10, 11, 12].forEach((c) => { grid[0][c] = { v: '', s: 'cardHeader' }; });
      merges.push('I1:M1');
      rightCard.forEach((it, j) => {
        const gi = 1 + j;
        const vStyle = it.money ? 'value' : 'cardValue';
        grid[gi][8] = { v: it.label, s: 'cardLabel' };
        grid[gi][9] = { v: '', s: 'cardLabel' };
        grid[gi][10] = { v: '', s: 'cardLabel' };
        grid[gi][11] = { v: it.value, s: vStyle };
        grid[gi][12] = { v: '', s: vStyle };
        merges.push(`I${XLR(gi)}:K${XLR(gi)}`, `L${XLR(gi)}:M${XLR(gi)}`);
      });

      // Tarjeta izquierda: logo arriba (A1:D{LOGO_ROWS}), luego municipio y datos.
      grid[leftHeaderRow][0] = { v: municipioLabel, s: 'cardHeader' };
      [1, 2, 3].forEach((c) => { grid[leftHeaderRow][c] = { v: '', s: 'cardHeader' }; });
      merges.push(`A${XLR(leftHeaderRow)}:D${XLR(leftHeaderRow)}`);
      leftCard.forEach(([label, value], j) => {
        const gi = leftFirstItem + j;
        grid[gi][0] = { v: label, s: 'cardLabel' };
        grid[gi][1] = { v: value, s: 'cardValue' };
        grid[gi][2] = { v: '', s: 'cardValue' };
        grid[gi][3] = { v: '', s: 'cardValue' };
        merges.push(`B${XLR(gi)}:D${XLR(gi)}`);
      });

      grid.forEach((r) => rows.push(r));

      // Barra verde del total, abarcando todo el ancho (como la fila del Excel).
      rows.push(blank());
      const gR = rows.length + 1;
      const bar = blank();
      for (let c = 0; c <= 7; c++) bar[c] = { v: '', s: 'greenBarText' };
      bar[0] = { v: `VALOR A PAGAR ${mesLabel.toUpperCase()}`, s: 'greenBarText' };
      for (let c = 8; c <= 12; c++) bar[c] = { v: '', s: 'greenBarMoney' };
      bar[8] = { v: Math.round(valorAPagar), s: 'greenBarMoney' };
      rows.push(bar);
      merges.push(`A${gR}:H${gR}`, `I${gR}:M${gR}`);
      // Los valores de tarjeta van con formato de pantalla (texto): silenciamos
      // el aviso "número guardado como texto" en toda la franja del encabezado.
      const ignoredTextRanges = [`A1:M${gR}`];
      rows.push(blank());

      // ---- Tabla de activo ----
      rows.push([{ v: `Cálculo de activo en Resolución CREG ${resLabel}`, s: 'title' }]);
      const header = ['UCAP', 'Un.', 'Vida útil', 'Valor unit.', 'Inv. inicial', 'Mun./conc.',
        'Total', 'Activo', 'AOM anual', 'AOM mes', 'Inversión', 'Inv. anual', 'Inv. mes'];
      rows.push(header.map((h) => ({ v: h, s: 'header' as const })));

      for (const g of grupos) {
        const groupRows = g.items.flatMap(rowsForUcap)
          .map((r) => filaPorKey.get(r.key))
          .filter((f): f is NonNullable<typeof f> => !!f);
        const visibles = mostrarSinCantidad ? groupRows : groupRows.filter((f) => f.total > 0);
        if (visibles.length === 0) continue;
        const st = sumar(groupRows);
        // Subtotal del grupo (encabeza el bloque, como en pantalla).
        rows.push([
          { v: g.grupo, s: 'groupText' },
          { v: '', s: 'groupText' }, { v: '', s: 'groupText' }, { v: '', s: 'groupText' },
          { v: st.cantA, s: 'groupQty' },
          { v: st.cantB, s: 'groupQty' },
          { v: st.total, s: 'groupQty' },
          { v: Math.round(st.activo), s: 'groupMoney' },
          { v: Math.round(st.aomAnual), s: 'groupMoney' },
          { v: Math.round(st.aomMes), s: 'groupMoney' },
          { v: Math.round(st.inversion), s: 'groupMoney' },
          { v: Math.round(st.invAnual), s: 'groupMoney' },
          { v: Math.round(st.invMes), s: 'groupMoney' },
        ]);
        for (const f of visibles) {
          rows.push([
            { v: rowLabel(f), s: 'text' },
            { v: 'Un.', s: 'text' },
            { v: f.vidaUtil ?? '', s: 'qty' },
            { v: Math.round(f.ucap.value || 0), s: 'money' },
            { v: f.cantA || '', s: 'qty' },
            { v: f.cantB || '', s: 'qty' },
            { v: f.total || '', s: 'qty' },
            { v: f.activo ? Math.round(f.activo) : '', s: 'money' },
            { v: f.aomAnual ? Math.round(f.aomAnual) : '', s: 'money' },
            { v: f.aomMes ? Math.round(f.aomMes) : '', s: 'money' },
            { v: f.inversion ? Math.round(f.inversion) : '', s: 'money' },
            { v: f.invAnual ? Math.round(f.invAnual) : '', s: 'money' },
            { v: f.invMes ? Math.round(f.invMes) : '', s: 'money' },
          ]);
        }
      }

      // ---- Total general ----
      rows.push([
        { v: `Total Costo (Pesos Diciembre 2015) Resolución CREG ${es101 ? '101' : '123'}`, s: 'totalText' },
        { v: '', s: 'totalText' }, { v: '', s: 'totalText' }, { v: '', s: 'totalText' },
        { v: totalGeneral.cantA, s: 'totalQty' },
        { v: totalGeneral.cantB, s: 'totalQty' },
        { v: totalGeneral.total, s: 'totalQty' },
        { v: Math.round(totalGeneral.activo), s: 'totalMoney' },
        { v: Math.round(totalGeneral.aomAnual), s: 'totalMoney' },
        { v: Math.round(totalGeneral.aomMes), s: 'totalMoney' },
        { v: Math.round(totalGeneral.inversion), s: 'totalMoney' },
        { v: Math.round(totalGeneral.invAnual), s: 'totalMoney' },
        { v: Math.round(totalGeneral.invMes), s: 'totalMoney' },
      ]);

      const colWidths = [44, 8, 10, 15, 13, 13, 12, 17, 16, 15, 17, 16, 15];
      // Conserva letras con tilde; solo quita lo que Windows prohíbe en nombres
      // de archivo (\ / : * ? " < > |) y colapsa espacios en guion bajo.
      const fileMuni = (selectedCompany?.name || 'liquidacion')
        .replace(/[\\/:*?"<>|]+/g, '')
        .replace(/\s+/g, '_');

      // Logo (membrete) en la esquina superior izquierda, sobre la tarjeta del
      // municipio. Si falla la carga se exporta sin logo, sin romper.
      let logo: XlsxImage | undefined;
      try {
        const resp = await fetch('/assets/images/logo-alumbrado.png');
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          const dv = new DataView(buf);
          // PNG: ancho/alto (big-endian) en el chunk IHDR, offsets 16 y 20.
          const wPx = dv.getUint32(16);
          const hPx = dv.getUint32(20);
          if (wPx > 0 && hPx > 0) {
            const EMU = 9525; // EMU por pixel a 96 dpi
            // Dimensiono por ALTO para que el logo quepa en las LOGO_ROWS filas
            // reservadas (fila ≈ 20 px) y no se encime con el título de abajo.
            // El ancho sale de la proporción real del PNG.
            const heightPx = LOGO_ROWS * 20 - 12;
            const widthPx = heightPx * (wPx / hPx);
            logo = {
              data: new Uint8Array(buf),
              col: 0, row: 0, colOff: 45720, rowOff: 45720,
              widthEmu: widthPx * EMU,
              heightEmu: heightPx * EMU,
            };
          }
        }
      } catch { /* sin logo */ }

      const blob = await buildXlsxBlob(`Liquidación ${selYm}`, rows, colWidths, merges, ignoredTextRanges, logo);
      downloadBlob(blob, `Liquidacion_${fileMuni}_${selYm}.xlsx`);
    } catch {
      toast.error('No se pudo generar el Excel');
    } finally {
      setExporting(false);
    }
  };

  const ready = selectedCompanyId && (!isCanalesContactos || selectedProjectId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-20 print:hidden">
        <div className="max-w-[1700px] mx-auto px-6 py-4 flex items-center gap-4">
          <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
            <img src="/assets/images/logo-canalco.png" alt="Canales Contactos" className="w-full h-full object-contain" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/creg')} className="hover:bg-[hsl(var(--canalco-neutral-200))]">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Receipt className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> Liquidación
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
              Cálculo de activo y valor a pagar del mes (Res. CREG {es101 ? '101 de 2013' : '123 de 2011'})
            </p>
          </div>
          {ready && (
            <>
              <Button variant="outline" onClick={handleExportExcel}
                disabled={exporting || loading || ucaps.length === 0}
                className="gap-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50">
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Excel
              </Button>
              <Button onClick={handleSave} disabled={saving || loading}
                className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar
              </Button>
            </>
          )}
        </div>
      </header>

      <main className="max-w-[1700px] mx-auto px-6 py-8 space-y-6">
        {/* Selector de municipio + mes */}
        <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-5">
          {loadingCompanies ? (
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--canalco-neutral-600))]">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando empresas...
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">Municipio / empresa</label>
                <Select value={selectedCompanyId ? String(selectedCompanyId) : ''}
                  onValueChange={(v) => { setSelectedCompanyId(Number(v)); setSelectedProjectId(null); }}>
                  <SelectTrigger className="w-72"><SelectValue placeholder="— Selecciona una empresa —" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (<SelectItem key={c.companyId} value={String(c.companyId)}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              {isCanalesContactos && (
                <div>
                  <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">Proyecto <span className="text-red-500">*</span></label>
                  <Select value={selectedProjectId ? String(selectedProjectId) : ''} onValueChange={(v) => setSelectedProjectId(Number(v))}>
                    <SelectTrigger className="w-64"><SelectValue placeholder="— Selecciona un proyecto —" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (<SelectItem key={p.projectId} value={String(p.projectId)}>{p.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {ready && cols.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">Mes de liquidación</label>
                  <Select value={selYm ?? ''} onValueChange={(v) => setSelYm(v)}>
                    <SelectTrigger className="w-56"><SelectValue placeholder="Selecciona un mes" /></SelectTrigger>
                    <SelectContent>
                      {cols.map((c) => (<SelectItem key={c.ym} value={c.ym}>{monthLongLabel(c.ym)}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {!ready && !loadingCompanies && (
          <div className="text-center py-20 text-[hsl(var(--canalco-neutral-500))]">
            <Receipt className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">
              {selectedCompanyId && isCanalesContactos
                ? 'Selecciona un proyecto de Canales & Contactos'
                : 'Selecciona una empresa para liquidar'}
            </p>
          </div>
        )}

        {ready && loading && (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-10 h-10 animate-spin text-[hsl(var(--canalco-primary))]" /></div>
        )}

        {ready && !loading && cols.length === 0 && (
          <div className="text-center py-16 text-[hsl(var(--canalco-neutral-500))]">
            <p className="text-base font-medium">Define la fecha de inicio y la fecha final en <strong>Parámetros</strong> para generar los meses.</p>
          </div>
        )}

        {ready && !loading && selYm && (
          <>
            {/* Cabecera: contrato + parámetros + resultados */}
            {sinEficacia.length > 0 && (
              <div className="mb-4 flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>
                  <strong>{sinEficacia.length}</strong>{' '}
                  {sinEficacia.length === 1 ? 'UCAP tiene cantidades' : 'UCAPs tienen cantidades'} de
                  inversión pero no {sinEficacia.length === 1 ? 'tiene' : 'tienen'} eficacia Lm/W
                  cargada, así que no aportan a la inversión. Cárgala en la hoja de cada UCAP:{' '}
                  <span className="font-mono">{sinEficacia.slice(0, 8).join(', ')}</span>
                  {sinEficacia.length > 8 && ` y ${sinEficacia.length - 8} más`}.
                </p>
              </div>
            )}

            {/* Encabezado estilo Excel: identidad · parámetros · resultados, con la
                barra del total abajo abarcando todo. */}
            <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[hsl(var(--canalco-neutral-200))]">

                {/* Identidad + entradas de contexto */}
                <div className="p-4 space-y-3">
                  <div className="text-sm font-bold uppercase leading-tight text-[hsl(var(--canalco-neutral-800))]">
                    {P.municipio ?? 'Contrato'}
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">Mes de liquidación</label>
                    <div className="text-sm font-bold text-[hsl(var(--canalco-neutral-900))]">{monthLongLabel(selYm)}</div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">Resolución vigente</label>
                    <Select
                      value={P.resolucion ?? ''}
                      disabled={!selectedCompanyId || guardandoResolucion}
                      onValueChange={cambiarResolucion}
                    >
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— Selecciona —" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="123-11">123-11</SelectItem>
                        <SelectItem value="101-103">101-103</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">IPP(m-1) del mes liquidado</label>
                    <Input
                      type="number" step="0.01" placeholder={P.ippFinal != null ? String(P.ippFinal) : '—'}
                      value={mesActual.ippMes ?? ''}
                      onChange={(e) => setMesField('ippMes', e.target.value === '' ? null : parseFloat(e.target.value))}
                      className="h-8 text-sm"
                    />
                    <p className="text-[10px] text-[hsl(var(--canalco-neutral-400))] mt-0.5">
                      Vacío = IPP final de Parámetros ({fmtNum(P.ippFinal)}).
                    </p>
                  </div>
                </div>

                {/* Parámetros (solo lectura) */}
                <div className="p-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-wide text-[hsl(var(--canalco-neutral-500))] mb-2">Parámetros</h3>
                  <dl className="space-y-1.5 text-sm">
                    <Row label="r" value={fmtPct(P.r)} />
                    <Row label="VCEEIn" value={vceeinMes != null ? fmtCOP(vceeinMes) : '—'}
                      hint="valor de energía de las encendidas (ID ON)" />
                    <Row label="ID encendidas" value={fmtNum(idEncendidas, 9)}
                      hint={idEncendidasCalc != null ? 'calculado en ID ON con las fallas del mes' : 'de Parámetros: sin fallas cargadas en ID ON'} />
                    <Row label="ID apagadas" value={fmtNum(idApagadas, 9)}
                      hint={idCalculado != null ? 'calculado en IDD OFF con las fallas del mes' : 'de Parámetros: sin fallas cargadas en IDD OFF'} />
                    <Row label={es101 ? 'FAOML' : 'FAOM'} value={fmtPct(es101 ? faomlDelAnio : P.faom)}
                      hint={es101 ? 'de la tabla FAOML/FAOMn del año liquidado' : undefined} />
                    <Row label="FAOMS" value={fmtPct(P.faoms)} />
                    {es101 && <Row label="Costos ambientales" value={fmtPct(P.costosAmbientales)} />}
                    <Row label="Fracción Activos NE" value={fmtNum(P.ne, 3)} />
                    {es101 && <Row label="Valor Ef. Mínima" value={fmtNum(P.efMinima)} hint="divisor del factor k" />}
                    <Row label="IPPo noviembre 2015" value={fmtNum(P.ippo)} />
                  </dl>
                </div>

                {/* Resultados + ajustes editables inline */}
                <div className="p-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-wide text-[hsl(var(--canalco-neutral-500))] mb-2">Liquidación</h3>
                  <dl className="space-y-1.5 text-sm">
                    <Row label="Índice actualización precio" value={fmtNum(indice)} hint="IPP(m-1) / IPPo" />
                    <Row label="Valor a pagar AOM" value={fmtCOP(valorAom)} />
                    <Row label="Valor a pagar INV" value={fmtCOP(valorInv)} />
                    {es101 && (
                      <>
                        <Row label="Costos ambientales anuales" value={fmtCOP(ambAnual)} />
                        <Row label="Costos ambientales mensuales" value={fmtCOP(ambMes)} />
                      </>
                    )}
                    <div className="pt-1.5 mt-1.5 border-t border-[hsl(var(--canalco-neutral-200))] space-y-1.5">
                      <InputRow label="Ajuste AOM" value={mesActual.ajusteAom}
                        onChange={(v) => setMesField('ajusteAom', v)} />
                      <InputRow label="Ajuste inversión" value={mesActual.ajusteInv}
                        onChange={(v) => setMesField('ajusteInv', v)} />
                      {es101 && (
                        <>
                          <InputRow label="Ajuste costos ambientales" value={mesActual.ajusteAmb}
                            onChange={(v) => setMesField('ajusteAmb', v)} />
                          <InputRow label="Valor a pagar c/hura (inversión)" value={mesActual.valorChura}
                            onChange={(v) => setMesField('valorChura', v)} />
                        </>
                      )}
                    </div>
                  </dl>
                </div>
              </div>

              {/* Barra del total, como la fila verde del Excel */}
              <div className="bg-emerald-600 px-4 py-2.5 flex items-center justify-between">
                <span className="text-sm font-bold uppercase tracking-wide text-white">
                  Valor a pagar {monthLongLabel(selYm)}
                </span>
                <span className="text-xl font-bold tabular-nums text-white">
                  {fmtCOP(valorAPagar)}
                </span>
              </div>
            </div>

            {/* Tabla: cálculo de activo */}
            <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
              <div className="px-4 py-2 bg-[hsl(var(--canalco-primary))]/10 border-b border-[hsl(var(--canalco-neutral-200))] flex items-center gap-3">
                <h2 className="flex-1 text-sm font-bold text-center uppercase tracking-wide text-[hsl(var(--canalco-neutral-800))]">
                  Cálculo de activo en Resolución CREG {es101 ? '101 de 2013' : '123 de 2011'}
                </h2>
                <label className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--canalco-neutral-700))] cursor-pointer select-none whitespace-nowrap print:hidden"
                  title="Por defecto solo se listan las UCAPs con cantidades en el mes. Los subtotales no cambian: las ocultas valen 0.">
                  <input type="checkbox" checked={mostrarSinCantidad}
                    onChange={(e) => setMostrarSinCantidad(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[hsl(var(--canalco-primary))]" />
                  Mostrar UCAPs sin cantidades
                </label>
              </div>
              <div className="overflow-auto max-h-[65vh]">
                <table className="text-xs border-collapse w-full">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[hsl(var(--canalco-neutral-100))]">
                      <th className="px-2 py-2 text-left font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[260px]">UCAP</th>
                      <th className="px-2 py-2 text-center font-semibold border border-[hsl(var(--canalco-neutral-200))] w-14">Un.</th>
                      <th className="px-2 py-2 text-center font-semibold border border-[hsl(var(--canalco-neutral-200))] w-16">Vida útil</th>
                      <th className="px-2 py-2 text-right font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[96px]">Valor unit.</th>
                      <th className="px-2 py-2 text-center font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[70px]">Inv. inicial</th>
                      <th className="px-2 py-2 text-center font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[70px]">Mun./conc.</th>
                      <th className="px-2 py-2 text-center font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[70px] bg-[hsl(var(--canalco-primary))]/[0.06]">Total</th>
                      <th className="px-2 py-2 text-right font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[110px]">Activo</th>
                      <th className="px-2 py-2 text-right font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[100px]">AOM anual</th>
                      <th className="px-2 py-2 text-right font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[100px]">AOM mes</th>
                      <th className="px-2 py-2 text-right font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[110px]">Inversión</th>
                      <th className="px-2 py-2 text-right font-semibold border border-[hsl(var(--canalco-neutral-300))] min-w-[100px]">Inv. anual</th>
                      <th className="px-2 py-2 text-right font-semibold border border-[hsl(var(--canalco-neutral-300))] min-w-[100px]">Inv. mes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ucaps.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="text-center py-10 text-[hsl(var(--canalco-neutral-500))]">
                          Este municipio no tiene UCAPs registradas.
                        </td>
                      </tr>
                    ) : (
                      grupos.map((g) => {
                        const rows = g.items.flatMap(rowsForUcap)
                          .map((r) => filaPorKey.get(r.key))
                          .filter((f): f is NonNullable<typeof f> => !!f);
                        const st = sumar(rows);
                        // Solo las que tienen cantidades este mes (el subtotal no
                        // cambia: las ocultas valen 0 en todas las columnas).
                        const visibles = mostrarSinCantidad ? rows : rows.filter((f) => f.total > 0);
                        if (visibles.length === 0) return null;
                        return (
                          <Fragment key={g.grupo}>
                            {/* Subtotal del grupo (como en el Excel: encabeza el bloque) */}
                            <tr className="bg-[hsl(var(--canalco-neutral-200))] font-semibold">
                              <td className="px-2 py-1.5 border border-[hsl(var(--canalco-neutral-300))] uppercase text-[11px] tracking-wide">{g.grupo}</td>
                              <td className="border border-[hsl(var(--canalco-neutral-300))]" />
                              <td className="border border-[hsl(var(--canalco-neutral-300))]" />
                              <td className="border border-[hsl(var(--canalco-neutral-300))]" />
                              <td className="px-2 py-1.5 text-center tabular-nums border border-[hsl(var(--canalco-neutral-300))]">{fmtQty(st.cantA)}</td>
                              <td className="px-2 py-1.5 text-center tabular-nums border border-[hsl(var(--canalco-neutral-300))]">{fmtQty(st.cantB)}</td>
                              <td className="px-2 py-1.5 text-center tabular-nums border border-[hsl(var(--canalco-neutral-300))] bg-[hsl(var(--canalco-primary))]/10">{fmtQty(st.total)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums border border-[hsl(var(--canalco-neutral-300))]">{fmtCOP(st.activo)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums border border-[hsl(var(--canalco-neutral-300))]">{fmtCOP(st.aomAnual)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums border border-[hsl(var(--canalco-neutral-300))]">{fmtCOP(st.aomMes)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums border border-[hsl(var(--canalco-neutral-300))]">{fmtCOP(st.inversion)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums border border-[hsl(var(--canalco-neutral-300))]">{fmtCOP(st.invAnual)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums border border-[hsl(var(--canalco-neutral-300))]">{fmtCOP(st.invMes)}</td>
                            </tr>
                            {visibles.map((f) => (
                              <tr key={f.key} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                                <td className="px-2 py-1 border border-[hsl(var(--canalco-neutral-100))] whitespace-nowrap">{rowLabel(f)}</td>
                                <td className="px-2 py-1 text-center border border-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-500))]">Un.</td>
                                <td className="px-2 py-1 text-center tabular-nums border border-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-500))]">
                                  {f.vidaUtil ?? '—'}
                                </td>
                                <td className="px-2 py-1 text-right tabular-nums border border-[hsl(var(--canalco-neutral-100))]">{fmtCOP(f.ucap.value || 0)}</td>
                                <td className="px-2 py-1 text-center tabular-nums border border-[hsl(var(--canalco-neutral-100))]">{f.cantA ? fmtQty(f.cantA) : <Dash />}</td>
                                <td className="px-2 py-1 text-center tabular-nums border border-[hsl(var(--canalco-neutral-100))]">{f.cantB ? fmtQty(f.cantB) : <Dash />}</td>
                                <td className="px-2 py-1 text-center tabular-nums font-semibold border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-primary))]/[0.04]">{f.total ? fmtQty(f.total) : <Dash />}</td>
                                <td className="px-2 py-1 text-right tabular-nums border border-[hsl(var(--canalco-neutral-100))]">{f.activo ? fmtCOP(f.activo) : <Dash />}</td>
                                <td className="px-2 py-1 text-right tabular-nums border border-[hsl(var(--canalco-neutral-100))]">{f.aomAnual ? fmtCOP(f.aomAnual) : <Dash />}</td>
                                <td className="px-2 py-1 text-right tabular-nums border border-[hsl(var(--canalco-neutral-100))]">{f.aomMes ? fmtCOP(f.aomMes) : <Dash />}</td>
                                <td className="px-2 py-1 text-right tabular-nums border border-[hsl(var(--canalco-neutral-100))]">{f.inversion ? fmtCOP(f.inversion) : <Dash />}</td>
                                <td className="px-2 py-1 text-right tabular-nums border border-[hsl(var(--canalco-neutral-200))]">{f.invAnual ? fmtCOP(f.invAnual) : <Dash />}</td>
                                <td className="px-2 py-1 text-right tabular-nums border border-[hsl(var(--canalco-neutral-200))]">{f.invMes ? fmtCOP(f.invMes) : <Dash />}</td>
                              </tr>
                            ))}
                          </Fragment>
                        );
                      })
                    )}
                    {ucaps.length > 0 && !mostrarSinCantidad && !filas.some((f) => f.total > 0) && (
                      <tr>
                        <td colSpan={13} className="text-center py-10 text-[hsl(var(--canalco-neutral-500))]">
                          <p className="text-sm">Ninguna UCAP tiene cantidades en {monthLongLabel(selYm)}.</p>
                          <p className="text-xs mt-1">Se cargan en el <strong>Censo</strong>. Marca «Mostrar UCAPs sin cantidades» para ver el catálogo completo.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {ucaps.length > 0 && (
                    <tfoot className="sticky bottom-0 z-10">
                      <tr className="bg-emerald-100 font-bold border-t-2 border-emerald-600">
                        <td colSpan={4} className="px-2 py-2 border border-emerald-300 whitespace-nowrap">
                          Total Costo (Pesos Diciembre 2015) Resolución CREG {es101 ? '101' : '123'}
                        </td>
                        <td className="px-2 py-2 text-center tabular-nums border border-emerald-300">{fmtQty(totalGeneral.cantA)}</td>
                        <td className="px-2 py-2 text-center tabular-nums border border-emerald-300">{fmtQty(totalGeneral.cantB)}</td>
                        <td className="px-2 py-2 text-center tabular-nums border border-emerald-300">{fmtQty(totalGeneral.total)}</td>
                        <td className="px-2 py-2 text-right tabular-nums border border-emerald-300">{fmtCOP(totalGeneral.activo)}</td>
                        <td className="px-2 py-2 text-right tabular-nums border border-emerald-300">{fmtCOP(totalGeneral.aomAnual)}</td>
                        <td className="px-2 py-2 text-right tabular-nums border border-emerald-300">{fmtCOP(totalGeneral.aomMes)}</td>
                        <td className="px-2 py-2 text-right tabular-nums border border-emerald-300">{fmtCOP(totalGeneral.inversion)}</td>
                        <td className="px-2 py-2 text-right tabular-nums border border-[hsl(var(--canalco-neutral-400))]">{fmtCOP(totalGeneral.invAnual)}</td>
                        <td className="px-2 py-2 text-right tabular-nums border border-[hsl(var(--canalco-neutral-400))]">{fmtCOP(totalGeneral.invMes)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

const Dash = () => <span className="text-[hsl(var(--canalco-neutral-300))]">–</span>;

/** Fila con la etiqueta a la izquierda y un input numérico a la derecha (como los
 *  "AJUSTE AOM = 0" del Excel). */
function InputRow({ label, value, onChange }: {
  label: string; value: number | null | undefined; onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[hsl(var(--canalco-neutral-600))] text-xs italic">{label}</dt>
      <Input
        type="number" placeholder="0" value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
        className="h-7 w-28 text-sm text-right"
      />
    </div>
  );
}

/** Celda compacta (etiqueta arriba, valor abajo) para la franja de parámetros. */
function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt
        className={`text-[10px] uppercase tracking-wide text-[hsl(var(--canalco-neutral-500))] truncate ${
          hint ? 'underline decoration-dotted decoration-[hsl(var(--canalco-neutral-300))] underline-offset-2 cursor-help' : ''
        }`}
        title={hint}
      >
        {label}
      </dt>
      <dd className="tabular-nums text-sm font-semibold text-[hsl(var(--canalco-neutral-900))] truncate">{value}</dd>
    </div>
  );
}

function Row({ label, value, hint, strong, pending }: {
  label: string; value: string; hint?: string; strong?: boolean; pending?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      {/* El hint va como tooltip, no como segundo renglón: mantiene la tarjeta
          compacta sin perder la explicación. El subrayado punteado lo señala. */}
      <dt
        className={`text-[hsl(var(--canalco-neutral-600))] text-xs ${
          hint ? 'underline decoration-dotted decoration-[hsl(var(--canalco-neutral-300))] underline-offset-2 cursor-help' : ''
        }`}
        title={hint}
      >
        {label}
      </dt>
      <dd className={`tabular-nums text-right ${strong ? 'font-bold' : 'font-medium'} ${
        pending ? 'text-amber-700' : 'text-[hsl(var(--canalco-neutral-900))]'
      }`}>
        {value}
        {pending && <span className="ml-1 text-[10px] text-amber-600">⚠</span>}
      </dd>
    </div>
  );
}

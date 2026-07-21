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
import { ArrowLeft, Loader2, Save, Receipt, AlertCircle } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

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
    ne: toNum(params.ne),                          // NE: 2º término de la anualidad
    idApagadas: toNum(params.idApagadas),          // IDapagadas
  }), [params]);

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
      // AOM anual = activo × (FAOM + FAOMS) × ID_encendidas (Excel: H×(I5+I6)×I3).
      const aomAnual = P.faom != null ? activo * ((P.faom + P.faoms) / 100) * idEncendidas : 0;
      const inversion = vu * cantA;
      // La anualidad amortiza inversión y valor total a la vida útil del grupo
      // de la UCAP (Res. CREG 123), ponderando la reposición por NE.
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
        cantA, cantB, total,
        activo,
        aomAnual,
        aomMes: aomAnual / 12,
        inversion,
        invAnual,
        invMes: invAnual / 12,
      };
    });
  }, [allRows, selYm, getCell, P.faom, P.faoms, P.r, P.ne, idApagadas, idEncendidas, vidaUtilDe]);

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
  // Estructura del Excel: AOM e INV van SIN los ajustes, y el valor a pagar los
  // suma aparte: total = AOM + INV + ajuste AOM + ajuste inversión [+ CVURA,
  // pendiente]. No hay costos ambientales ni SIAP en la liquidación CREG 123.
  const valorAom = totalGeneral.aomMes * (indice ?? 1);
  const valorInv = totalGeneral.invMes * (indice ?? 1);
  const valorAPagar = valorAom + valorInv + ajusteAom + ajusteInv;

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
              Cálculo de activo y valor a pagar del mes (Res. CREG 123 de 2011)
            </p>
          </div>
          {ready && (
            <Button onClick={handleSave} disabled={saving || loading}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </Button>
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Contrato */}
              <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-5">
                <h2 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))] mb-3">Contrato</h2>
                <dl className="space-y-2 text-sm">
                  <Row label="Municipio contratante" value={P.municipio ?? '—'} />
                  <Row label="Contratista" value={P.contratista ?? '—'} />
                  <Row label="Resolución vigente" value={P.resolucion ?? '—'} />
                  <Row label="Mes de liquidación" value={monthLongLabel(selYm)} strong />
                </dl>
              </div>

              {/* Parámetros (solo lectura) */}
              <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-5">
                <h2 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))] mb-1">Parámetros</h2>
                <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))] mb-3">
                  Se editan en la hoja de <strong>Parámetros</strong> del municipio.
                </p>
                <dl className="space-y-2 text-sm">
                  <Row label="r" value={fmtPct(P.r)} />
                  <Row label="VCEEIn" value={vceeinMes != null ? fmtCOP(vceeinMes) : '—'}
                    hint="valor de energía de las encendidas (ID ON)" />
                  <Row label="IDencendidas" value={fmtNum(idEncendidas, 9)}
                    hint={idEncendidasCalc != null ? 'calculado en ID ON con las fallas del mes' : 'de Parámetros: sin fallas cargadas en ID ON'} />
                  <Row label="IDapagadas" value={fmtNum(idApagadas, 9)}
                    hint={idCalculado != null ? 'calculado en IDD OFF con las fallas del mes' : 'de Parámetros: sin fallas cargadas en IDD OFF'} />
                  <Row label="FAOM" value={fmtPct(P.faom)} />
                  <Row label="FAOMS" value={fmtPct(P.faoms)} />
                  <Row label="IPPo noviembre 2015" value={fmtNum(P.ippo)} />
                </dl>
                <div className="mt-4 pt-3 border-t border-[hsl(var(--canalco-neutral-200))]">
                  <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                    IPP(m-1) del mes liquidado
                  </label>
                  <Input
                    type="number" step="0.01" placeholder={P.ippFinal != null ? String(P.ippFinal) : '—'}
                    value={mesActual.ippMes ?? ''}
                    onChange={(e) => setMesField('ippMes', e.target.value === '' ? null : parseFloat(e.target.value))}
                    className="h-8 text-sm"
                  />
                  <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))] mt-1">
                    Vacío = usa el IPP final de Parámetros ({fmtNum(P.ippFinal)}).
                  </p>
                </div>
              </div>

              {/* Resultados */}
              <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-5">
                <h2 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))] mb-3">Liquidación del mes</h2>
                <dl className="space-y-2 text-sm">
                  <Row label="Índice actualización precio" value={fmtNum(indice)} hint="IPP(m-1) / IPPo" />
                  <Row label="Valor a pagar AOM" value={fmtCOP(valorAom)} />
                  <Row label="Valor a pagar INV" value={fmtCOP(valorInv)} />
                </dl>
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[hsl(var(--canalco-neutral-200))]">
                  <div>
                    <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">Ajuste AOM</label>
                    <Input type="number" placeholder="0" value={mesActual.ajusteAom ?? ''}
                      onChange={(e) => setMesField('ajusteAom', e.target.value === '' ? null : parseFloat(e.target.value))}
                      className="h-8 text-sm text-right" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">Ajuste inversión</label>
                    <Input type="number" placeholder="0" value={mesActual.ajusteInv ?? ''}
                      onChange={(e) => setMesField('ajusteInv', e.target.value === '' ? null : parseFloat(e.target.value))}
                      className="h-8 text-sm text-right" />
                  </div>
                </div>
                <div className="mt-4 bg-[hsl(var(--canalco-primary))]/10 border-2 border-[hsl(var(--canalco-primary))] rounded-md px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-[hsl(var(--canalco-neutral-800))]">
                    Valor a pagar
                  </span>
                  <span className="text-lg font-bold tabular-nums text-[hsl(var(--canalco-primary))]">
                    {fmtCOP(valorAPagar)}
                  </span>
                </div>
              </div>
            </div>

            {/* Tabla: cálculo de activo */}
            <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
              <div className="px-4 py-2 bg-[hsl(var(--canalco-primary))]/10 border-b border-[hsl(var(--canalco-neutral-200))] flex items-center gap-3">
                <h2 className="flex-1 text-sm font-bold text-center uppercase tracking-wide text-[hsl(var(--canalco-neutral-800))]">
                  Cálculo de activo en Resolución CREG 123 de 2011
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
                          Total Costo (Pesos Diciembre 2015) Resolución CREG 123
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

function Row({ label, value, hint, strong, pending }: {
  label: string; value: string; hint?: string; strong?: boolean; pending?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[hsl(var(--canalco-neutral-600))] text-xs">
        {label}
        {hint && <span className="block text-[10px] text-[hsl(var(--canalco-neutral-400))]">{hint}</span>}
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

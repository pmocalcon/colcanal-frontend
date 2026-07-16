import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cregService, UCAP_GRUPOS } from '@/services/creg.service';
import type { LiquidacionMes } from '@/services/creg.service';
import { surveysService } from '@/services/surveys.service';
import type { Ucap } from '@/services/surveys.service';
import { masterDataService } from '@/services/master-data.service';
import type { Company, Project } from '@/services/master-data.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Save, Receipt, AlertCircle, AlertTriangle } from 'lucide-react';
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
 * Anualidad clásica: r / (1 - (1+r)^-n).
 *
 * ⚠️ PENDIENTE DE CONFIRMAR: en el Excel de Puerto Asís el factor observado
 * varía por fila (0,14746 / 0,14756 / 0,14727) aunque todas tengan vida útil 15,
 * mientras que esta fórmula con r=11,3% y n=15 da 0,14139 (~4% por debajo).
 * Falta la fórmula real de esa columna.
 */
const annuityFactor = (r: number | null, n: number | null): number | null => {
  if (r == null || n == null || n <= 0) return null;
  if (r === 0) return 1 / n;
  return r / (1 - Math.pow(1 + r, -n));
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
  const [selYm, setSelYm] = useState<string | null>(null);

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
    ])
      .then(([ucapsRes, param, censo, liq]) => {
        setUcaps(ucapsRes.ucaps);
        setParams(param.data ?? {});
        setQuantities(censo.data?.quantities ?? {});
        setMeses(liq.data?.meses ?? {});
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
    r: toNum(params.waccOficial),                  // r (WACC)
    faom: toNum(params.faomOficial),               // FAOM CREG 123/11
    ippo: toNum(params.ippoNov2015),               // IPPo nov 2015
    ippFinal: toNum(params.ippFinal),              // IPP(m-1) por defecto
    siapLum: toNum(params.costoSiapLuminaria),     // costo SIAP por luminaria
    ambiental: toNum(params.costosAmbientalesMensual) ?? toNum(params.costosAmbientalesAnual),
  }), [params]);

  /** Vida útil (años) de una UCAP según su grupo. */
  const vidaUtilDe = useCallback((grupo: string | null): number | null => {
    const key = VIDA_UTIL_KEY[(grupo || '').trim().toUpperCase()];
    return key ? toNum(params[key]) : null;
  }, [params]);

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
   *  cantA  = inversión inicial            -> base de INVERSIÓN
   *  cantB  = municipios y terceros + concesionario
   *  total  = cantA + cantB                -> base de AOM
   *  activo      = valor unitario x total
   *  aomAnual    = activo x FAOM ;  aomMes = aomAnual / 12
   *  inversion   = valor unitario x cantA
   *  invAnual    = inversion x anualidad(r, vida útil) ;  invMes = invAnual / 12
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
      const aomAnual = P.faom != null ? activo * (P.faom / 100) : 0;
      const inversion = vu * cantA;
      // La anualidad depende de la vida útil del grupo de la UCAP.
      const vidaUtil = vidaUtilDe(row.ucap.grupo);
      const factor = annuityFactor(P.r != null ? P.r / 100 : null, vidaUtil);
      const invAnual = factor != null ? inversion * factor : 0;
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
  }, [allRows, selYm, getCell, P.faom, P.r, vidaUtilDe]);

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
  // Verificado contra el Excel: ambientales = AOM x %; SIAP = costo/lum x luminarias;
  // total = AOM + INV + ambientales + SIAP + ajustes.
  const valorAom = totalGeneral.aomMes * (indice ?? 1) + ajusteAom;
  const valorInv = totalGeneral.invMes * (indice ?? 1) + ajusteInv;
  const costosAmbientales = P.ambiental != null ? valorAom * (P.ambiental / 100) : 0;
  const luminarias = useMemo(
    () => filas
      .filter((f) => (f.ucap.grupo || '').toUpperCase().includes('LUMINARIA'))
      .reduce((a, f) => a + f.total, 0),
    [filas],
  );
  const costoSiap = (P.siapLum ?? 0) * luminarias;
  const valorAPagar = valorAom + valorInv + costosAmbientales + costoSiap;

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
            {/* Aviso: fórmula pendiente de confirmar */}
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900">
                <p className="font-semibold">La anualidad de inversión está pendiente de confirmar</p>
                <p className="text-xs mt-1 text-amber-800">
                  Las columnas <strong>Inv. anual</strong> e <strong>Inv. mes</strong> (y por tanto el VALOR A PAGAR INV)
                  usan la anualidad clásica <code>r / (1 − (1+r)^−n)</code>, con la vida útil del grupo de cada UCAP.
                  En el Excel de Puerto Asís el factor observado es ~0,1475 y varía por fila, mientras que con r={fmtPct(P.r)} y
                  n=15 esta fórmula da {fmtNum(annuityFactor(P.r != null ? P.r / 100 : null, 15), 5)}, así que estos dos valores
                  aún <strong>no cuadran con el Excel</strong>. El resto (activo, AOM, índice, ambientales, SIAP y el total) sí está verificado.
                </p>
              </div>
            </div>

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
                  <Row label="r (WACC)" value={fmtPct(P.r)} />
                  <Row label="Vida útil (luminarias)" value={vidaUtilDe('LUMINARIAS') != null ? `${vidaUtilDe('LUMINARIAS')} años` : '—'}
                    hint="cada grupo usa la suya" />
                  <Row label="IPPo noviembre 2015" value={fmtNum(P.ippo)} />
                  <Row label="FAOM CREG 123/11" value={fmtPct(P.faom)} />
                  <Row label="% Costos ambientales" value={fmtPct(P.ambiental)} />
                  <Row label="Costo SIAP / luminaria" value={P.siapLum != null ? fmtCOP(P.siapLum) : '—'} />
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
                  <Row label="Valor a pagar INV" value={fmtCOP(valorInv)} pending />
                  <Row label="Costos ambientales A.P." value={fmtCOP(costosAmbientales)} hint={`AOM × ${fmtPct(P.ambiental)}`} />
                  <Row label={`Costo SIAP (${fmtQty(luminarias)} lum.)`} value={fmtCOP(costoSiap)} />
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
              <div className="px-4 py-2 bg-[hsl(var(--canalco-primary))]/10 border-b border-[hsl(var(--canalco-neutral-200))]">
                <h2 className="text-sm font-bold text-center uppercase tracking-wide text-[hsl(var(--canalco-neutral-800))]">
                  Cálculo de activo en Resolución CREG 123 de 2011
                </h2>
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
                      <th className="px-2 py-2 text-right font-semibold border border-amber-300 bg-amber-50 min-w-[100px]">Inv. anual</th>
                      <th className="px-2 py-2 text-right font-semibold border border-amber-300 bg-amber-50 min-w-[100px]">Inv. mes</th>
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
                              <td className="px-2 py-1.5 text-right tabular-nums border border-amber-300 bg-amber-50/60">{fmtCOP(st.invAnual)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums border border-amber-300 bg-amber-50/60">{fmtCOP(st.invMes)}</td>
                            </tr>
                            {rows.map((f) => (
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
                                <td className="px-2 py-1 text-right tabular-nums border border-amber-200 bg-amber-50/40">{f.invAnual ? fmtCOP(f.invAnual) : <Dash />}</td>
                                <td className="px-2 py-1 text-right tabular-nums border border-amber-200 bg-amber-50/40">{f.invMes ? fmtCOP(f.invMes) : <Dash />}</td>
                              </tr>
                            ))}
                          </Fragment>
                        );
                      })
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
                        <td className="px-2 py-2 text-right tabular-nums border border-amber-400 bg-amber-100">{fmtCOP(totalGeneral.invAnual)}</td>
                        <td className="px-2 py-2 text-right tabular-nums border border-amber-400 bg-amber-100">{fmtCOP(totalGeneral.invMes)}</td>
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

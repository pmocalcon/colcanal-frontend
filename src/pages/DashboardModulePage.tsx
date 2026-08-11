import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSurveyAccess } from '@/hooks/useSurveyAccess';
import { surveysService, type Work, type WorkActa } from '@/services/surveys.service';
import { requisitionsService } from '@/services/requisitions.service';
import { getPendingPurchaseOrdersForApproval } from '@/services/purchase-orders.service';
import { mapCompaniesToDepartments, getMunicipioName, esEmpresaMatriz } from '@/utils/departmentMapper';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Loader2, HardHat, DollarSign, ShoppingCart,
  TrendingUp, PackageCheck, Filter, BadgeCheck, Printer,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Cell, AreaChart, Area, LineChart, Line, Legend,
} from 'recharts';

const fmtCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
const fmtNum = (v: number) => new Intl.NumberFormat('es-CO').format(v || 0);

// Delta año vs. año: se omite cuando el año anterior es parcial/de arranque
// (menos del 20% del actual), porque el % no sería representativo (ej. +2927%).
const yoyDelta = (cur: number, prev: number): number | null =>
  prev > 0 && (cur - prev) / prev <= 4 ? (cur - prev) / prev : null;

// Paleta para las gráficas (naranja de marca + complementarios).
const PRIMARY = '#F59E0B';
const PALETTE = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#14B8A6', '#EC4899', '#6366F1', '#F97316', '#0EA5E9'];

type ModuleKey = 'obras' | 'compras';
const MODULE_STORAGE_KEY = 'dashboard.module';

// Identidad de un acta: (empresa, proyecto, número).
const actaKey = (companyId: number, projectId: number | null | undefined, record: string) =>
  `${companyId ?? 0}:${projectId ?? 0}:${record}`;

// Etiquetas y orden del embudo de actas.
const ACTA_STATUS_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  en_revision: 'En revisión',
  en_aprobacion: 'En aprobación',
  aprobada: 'Aprobada',
};
const ACTA_STATUS_ORDER = ['borrador', 'en_revision', 'en_aprobacion', 'aprobada'];
const ACTA_STATUS_COLOR: Record<string, string> = {
  borrador: '#94A3B8',
  en_revision: '#F59E0B',
  en_aprobacion: '#3B82F6',
  aprobada: '#10B981',
};

type NameValue = { name: string; value: number };
type StatusVal = { name: string; count: number; value: number };

interface ComprasData {
  available: boolean;
  years: number[];
  reqTotal: number;
  poTotal: number;
  poPending: number;
  poValue: number;
  poPendingValue: number;
  savings: number;
  savingsItems: number;
  reqByStatus: NameValue[];
  poByStatus: StatusVal[];
  bySupplier: StatusVal[];
  byCompany: StatusVal[];
  byCategory: NameValue[];
  reqMonthly: { month: string; count: number }[];
  poMonthly: { month: string; count: number; value: number }[];
  poByYear: { year: number; count: number; value: number }[];
  monthlyByYear: { year: number; month: number; value: number }[];
}

const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-');
  return `${MONTH_ABBR[Number(m) - 1] ?? m} ${y.slice(2)}`;
};

export default function DashboardModulePage() {
  const navigate = useNavigate();
  const { access, loading: accessLoading } = useSurveyAccess();

  const [works, setWorks] = useState<Work[]>([]);
  const [values, setValues] = useState<Map<number, number>>(new Map());
  // IPP base/mes por obra, para el valor base vs. actualizado.
  const [ippByWork, setIppByWork] = useState<Map<number, { baseIpp: number | null; mesIpp: number | null }>>(new Map());
  // Estado de cada acta, para el embudo en $ y lo pendiente de aprobación.
  const [actaStatusMap, setActaStatusMap] = useState<Map<string, WorkActa>>(new Map());
  const [compras, setCompras] = useState<ComprasData | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtros de la sección Obras + métrica (valor $ / cantidad).
  const [filterYear, setFilterYear] = useState<number | 'all'>('all');
  const [filterDept, setFilterDept] = useState<string>('all');
  // Filtro de año de la sección Compras (siempre en valor $).
  const [comprasYear, setComprasYear] = useState<number | 'all'>('all');

  const companyIds = useMemo(
    () => (access?.companies || []).map((c) => c.companyId),
    [access],
  );

  const projectIdToName = useMemo(() => {
    const map = new Map<number, string>();
    (access?.projects || []).forEach((p) => map.set(p.projectId, p.name));
    return map;
  }, [access]);

  /**
   * Municipio de una obra. Donde la UT es propia (Santa Bárbara, Quimbaya, Puerto
   * Asís...) el municipio ES la empresa; en Antioquia las obras son de "Canales &
   * Contactos" y el municipio sale del PROYECTO (Tarso, Pueblorico, Jericó...).
   *
   * Devuelve '' cuando no se puede saber. Es a propósito: caer al nombre de la
   * empresa juntaría cuatro municipios bajo la matriz, que no es ninguno.
   */
  const municipioDeObra = useCallback((w: Work): string => {
    if (w.projectId != null) {
      const nombre = projectIdToName.get(w.projectId);
      return nombre ? getMunicipioName(nombre) : '';
    }
    const empresa = w.company?.name ?? '';
    return esEmpresaMatriz(empresa) ? '' : getMunicipioName(empresa);
  }, [projectIdToName]);

  const companyIdToDept = useMemo(() => {
    const map = new Map<number, string>();
    if (access?.companies) {
      mapCompaniesToDepartments(access.companies).forEach((dept) =>
        dept.companyIds.forEach((id) => map.set(id, dept.name)),
      );
    }
    return map;
  }, [access]);

  useEffect(() => {
    if (accessLoading) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      // Obras del alcance del usuario + sus valores.
      let worksData: Work[] = [];
      if (companyIds.length > 0) {
        try {
          const res = await surveysService.getWorks({ companyId: companyIds });
          worksData = Array.isArray(res) ? res : (res.data || []);
        } catch {
          worksData = [];
        }
      }
      if (cancelled) return;
      setWorks(worksData);

      const ids = worksData.map((w) => w.workId);
      if (ids.length > 0) {
        try {
          const vals = await surveysService.getWorksValue(ids);
          if (!cancelled) {
            setValues(new Map(vals.map((v) => [v.workId, v.value])));
            setIppByWork(new Map(vals.map((v) => [v.workId, { baseIpp: v.baseIpp, mesIpp: v.mesIpp }])));
          }
        } catch {
          if (!cancelled) { setValues(new Map()); setIppByWork(new Map()); }
        }
      }

      // Estados de las actas (para el embudo en $ y lo pendiente de aprobación).
      const actaPairs = new Map<string, { companyId: number; projectId: number | null; actaNumber: string }>();
      worksData.forEach((w) => {
        if (!w.recordNumber) return;
        const k = actaKey(w.companyId, w.projectId ?? null, w.recordNumber);
        if (!actaPairs.has(k)) actaPairs.set(k, { companyId: w.companyId, projectId: w.projectId ?? null, actaNumber: w.recordNumber });
      });
      if (actaPairs.size > 0) {
        try {
          const actas = await surveysService.getWorkActasBulk([...actaPairs.values()]);
          if (!cancelled) setActaStatusMap(new Map(actas.map((a) => [actaKey(a.companyId, a.projectId, a.actaNumber), a])));
        } catch {
          if (!cancelled) setActaStatusMap(new Map());
        }
      }

      // El desglose de compras se carga en su propio efecto (depende del año).

      if (!cancelled) setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [accessLoading, companyIds]);

  // Compras: se recarga al cambiar el año seleccionado.
  useEffect(() => {
    if (accessLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const sum = await requisitionsService.getDashboardSummary(comprasYear === 'all' ? undefined : comprasYear);
        let poPending = 0;
        try {
          const pend = await getPendingPurchaseOrdersForApproval(1, 1);
          poPending = pend.total ?? 0;
        } catch { /* sin permiso de aprobación */ }
        if (!cancelled) {
          setCompras({
            available: true,
            years: sum.years,
            reqTotal: sum.requisitions.total,
            reqByStatus: sum.requisitions.byStatus.map((x) => ({ name: x.name, value: x.count })),
            reqMonthly: sum.requisitions.monthly,
            poTotal: sum.purchaseOrders.total,
            poValue: sum.purchaseOrders.value,
            poByStatus: sum.purchaseOrders.byStatus,
            bySupplier: sum.purchaseOrders.bySupplier,
            poMonthly: sum.purchaseOrders.monthly,
            poByYear: sum.purchaseOrders.byYear,
            monthlyByYear: sum.monthlyByYear,
            byCompany: sum.byCompany,
            byCategory: sum.byCategory,
            poPendingValue: sum.poPending?.value ?? 0,
            savings: sum.savings?.value ?? 0,
            savingsItems: sum.savings?.items ?? 0,
            poPending,
          });
        }
      } catch {
        if (!cancelled) setCompras({ available: false, years: [], reqTotal: 0, poTotal: 0, poPending: 0, poValue: 0, poPendingValue: 0, savings: 0, savingsItems: 0, reqByStatus: [], poByStatus: [], bySupplier: [], byCompany: [], byCategory: [], reqMonthly: [], poMonthly: [], poByYear: [], monthlyByYear: [] });
      }
    })();
    return () => { cancelled = true; };
  }, [accessLoading, comprasYear]);

  // Años y departamentos disponibles (para los filtros de Obras).
  const years = useMemo(
    () => [...new Set(works.filter((w) => w.annualPlan != null).map((w) => w.annualPlan!))].sort((a, b) => a - b),
    [works],
  );
  const depts = useMemo(
    () => [...new Set(works.map((w) => companyIdToDept.get(w.companyId) ?? 'Sin departamento'))].sort(),
    [works, companyIdToDept],
  );

  // ---- Métricas derivadas de Obras (con filtros + valores en $) ----
  const obrasView = useMemo(() => {
    const valOf = (w: Work) => values.get(w.workId) ?? 0;
    // Valor base = valor actualizado ÷ factor IPP (factor = ippMes / ippBase).
    const baseOf = (w: Work) => {
      const v = valOf(w);
      const ipp = ippByWork.get(w.workId);
      if (ipp?.baseIpp && ipp?.mesIpp && ipp.mesIpp !== 0) return v * (ipp.baseIpp / ipp.mesIpp);
      return v;
    };

    const fw = works.filter(
      (w) =>
        (filterYear === 'all' || w.annualPlan === filterYear) &&
        (filterDept === 'all' || (companyIdToDept.get(w.companyId) ?? 'Sin departamento') === filterDept),
    );

    const valorTotal = fw.reduce((s, w) => s + valOf(w), 0);
    const valorBase = fw.reduce((s, w) => s + baseOf(w), 0);
    const deltaIpp = valorTotal - valorBase;
    const inActas = fw.filter((w) => !!w.recordNumber).length;

    // Por año de plan (valor + cantidad)
    const byYearMap = new Map<number, { value: number; count: number }>();
    fw.filter((w) => w.annualPlan != null).forEach((w) => {
      const e = byYearMap.get(w.annualPlan!) ?? { value: 0, count: 0 };
      e.value += valOf(w); e.count += 1;
      byYearMap.set(w.annualPlan!, e);
    });
    const byYear = [...byYearMap.entries()]
      .map(([year, e]) => ({ year: String(year), ...e }))
      .sort((a, b) => Number(a.year) - Number(b.year));

    // Por departamento (valor + cantidad)
    const byDeptMap = new Map<string, { value: number; count: number }>();
    fw.forEach((w) => {
      const d = companyIdToDept.get(w.companyId) ?? 'Sin departamento';
      const e = byDeptMap.get(d) ?? { value: 0, count: 0 };
      e.value += valOf(w); e.count += 1;
      byDeptMap.set(d, e);
    });
    const byDept = [...byDeptMap.entries()]
      .map(([name, e]) => ({ name, ...e }))
      .sort((a, b) => b.value - a.value);

    // Por municipio (valor)
    const byMuniMap = new Map<string, { value: number; count: number }>();
    fw.forEach((w) => {
      const m = municipioDeObra(w) || 'Sin municipio';
      const e = byMuniMap.get(m) ?? { value: 0, count: 0 };
      e.value += valOf(w); e.count += 1;
      byMuniMap.set(m, e);
    });
    const byMuni = [...byMuniMap.entries()]
      .map(([name, e]) => ({ name, ...e }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Embudo de actas en $ (suma del valor de las obras de cada acta, agrupado por estado)
    const actaVal = new Map<string, number>();
    // Municipio de cada acta. El número se repite —Tarso y Pueblorico tienen cada
    // uno su "01-2026"—, así que sin el municipio las barras son indistinguibles.
    const actaMuni = new Map<string, string>();
    fw.forEach((w) => {
      if (!w.recordNumber) return;
      const k = actaKey(w.companyId, w.projectId ?? null, w.recordNumber);
      actaVal.set(k, (actaVal.get(k) ?? 0) + valOf(w));
      if (!actaMuni.has(k)) actaMuni.set(k, municipioDeObra(w));
    });
    const funnelMap = new Map<string, { value: number; count: number }>();
    actaVal.forEach((v, k) => {
      const st = actaStatusMap.get(k)?.status ?? 'borrador';
      const e = funnelMap.get(st) ?? { value: 0, count: 0 };
      e.value += v; e.count += 1;
      funnelMap.set(st, e);
    });
    const funnel = ACTA_STATUS_ORDER.filter((s) => funnelMap.has(s)).map((s) => ({
      name: ACTA_STATUS_LABEL[s] ?? s,
      status: s,
      value: funnelMap.get(s)!.value,
      count: funnelMap.get(s)!.count,
    }));
    const pendiente = funnelMap.get('en_aprobacion') ?? { value: 0, count: 0 };

    const municipios = new Set(fw.map(municipioDeObra).filter(Boolean));

    // Top obras por valor.
    const topObras = fw
      .map((w) => ({ name: (w.name?.trim() || w.workCode || `Obra ${w.workId}`), value: valOf(w) }))
      .filter((o) => o.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Top actas por valor (agrupadas por acta).
    const topActas = [...actaVal.entries()]
      .map(([k, value]) => {
        const num = actaStatusMap.get(k)?.actaNumber ?? k.split(':')[2] ?? '—';
        const muni = actaMuni.get(k);
        // El título de la tarjeta ya dice "actas", así que la etiqueta gasta el
        // espacio en el municipio, que es lo que desempata.
        return { name: muni ? `${muni} · ${num}` : `Acta ${num}`, value };
      })
      .filter((a) => a.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Ticket promedio.
    const actaCount = actaVal.size;
    const avgPerObra = fw.length > 0 ? valorTotal / fw.length : 0;
    const avgPerActa = actaCount > 0 ? [...actaVal.values()].reduce((s, v) => s + v, 0) / actaCount : 0;

    // Comparativo año vs. año (últimos dos años de plan con valor).
    const yoy = byYear.length >= 2
      ? {
          curYear: byYear[byYear.length - 1].year,
          curValue: byYear[byYear.length - 1].value,
          prevYear: byYear[byYear.length - 2].year,
          prevValue: byYear[byYear.length - 2].value,
        }
      : null;

    return {
      total: fw.length,
      valorTotal,
      valorBase,
      deltaIpp,
      inActas,
      byYear,
      byDept,
      byMuni,
      funnel,
      pendienteValor: pendiente.value,
      pendienteCount: pendiente.count,
      municipios: municipios.size,
      topObras,
      topActas,
      actaCount,
      avgPerObra,
      avgPerActa,
      yoy,
    };
  }, [works, values, ippByWork, actaStatusMap, companyIdToDept, municipioDeObra, filterYear, filterDept]);

  const busy = accessLoading || loading;

  // Módulos disponibles según el acceso/datos del usuario.
  const modules = useMemo(() => {
    const list: { key: ModuleKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [];
    if (works.length > 0) list.push({ key: 'obras', label: 'Obras', icon: HardHat });
    if (compras?.available) list.push({ key: 'compras', label: 'Compras', icon: ShoppingCart });
    return list;
  }, [works.length, compras]);

  // Módulo seleccionado: se recuerda la última elección (localStorage).
  const [selectedModule, setSelectedModule] = useState<ModuleKey | null>(
    () => (localStorage.getItem(MODULE_STORAGE_KEY) as ModuleKey | null) || null,
  );
  useEffect(() => {
    if (modules.length === 0) return;
    const keys = modules.map((m) => m.key);
    setSelectedModule((cur) => {
      if (cur && keys.includes(cur)) return cur;
      const remembered = localStorage.getItem(MODULE_STORAGE_KEY) as ModuleKey | null;
      // El módulo Compras se resuelve en su propio efecto: si es el recordado y
      // aún no ha cargado, esperar en vez de saltar a otro módulo.
      if (remembered === 'compras' && compras === null) return cur;
      return remembered && keys.includes(remembered) ? remembered : keys[0];
    });
  }, [modules, compras]);

  const selectModule = (key: ModuleKey) => {
    setSelectedModule(key);
    localStorage.setItem(MODULE_STORAGE_KEY, key);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          header { position: static !important; box-shadow: none !important; }
          .recharts-wrapper, .recharts-surface { overflow: visible !important; }
        }
      `}</style>
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
            <img src="/assets/images/logo-canalco.png" alt="Canales Contactos" className="w-full h-full object-contain" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="hover:bg-[hsl(var(--canalco-neutral-200))]" title="Volver">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> Dashboard
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
              Indicadores y resumen general de tu operación
            </p>
          </div>
          <Button
            onClick={() => window.print()}
            className="ml-auto print:hidden bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white gap-2"
            title="Exportar el tablero a PDF"
          >
            <Printer className="w-4 h-4" /> <span className="hidden sm:inline">Exportar PDF</span>
          </Button>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto px-6 py-8 w-full space-y-6">
        {busy ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-10 h-10 animate-spin text-[hsl(var(--canalco-primary))]" />
          </div>
        ) : modules.length === 0 ? (
          <EmptyDashboard onGoHome={() => navigate('/dashboard')} />
        ) : (
          <>
            {/* Selector de módulo */}
            <div className="print:hidden">
              <ModuleTabs modules={modules} active={selectedModule} onSelect={selectModule} />
            </div>

            {/* Obras */}
            {selectedModule === 'obras' && works.length > 0 && (() => {
              const isVal = true;
              const dataKey = 'value';
              const fmtMetric = (v: number) => fmtCOP(v);
              const metricLabel = 'Valor';
              return (
              <section className="space-y-5">
                <SectionHeader icon={HardHat} title="Obras" />

                {/* Filtros + métrica */}
                <div className="flex flex-wrap items-end gap-3 bg-white rounded-2xl border border-[hsl(var(--canalco-neutral-200))] shadow-sm p-4">
                  <div className="flex items-center gap-2 text-[hsl(var(--canalco-neutral-500))] pb-1.5">
                    <Filter className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wide">Filtros</span>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[hsl(var(--canalco-neutral-500))] mb-1">Año de plan</label>
                    <select
                      value={String(filterYear)}
                      onChange={(e) => setFilterYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                      className="h-9 rounded-lg border border-[hsl(var(--canalco-neutral-300))] bg-white px-3 text-sm min-w-[120px]"
                    >
                      <option value="all">Todos</option>
                      {years.map((y) => (<option key={y} value={y}>{y}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[hsl(var(--canalco-neutral-500))] mb-1">Departamento</label>
                    <select
                      value={filterDept}
                      onChange={(e) => setFilterDept(e.target.value)}
                      className="h-9 rounded-lg border border-[hsl(var(--canalco-neutral-300))] bg-white px-3 text-sm min-w-[160px]"
                    >
                      <option value="all">Todos</option>
                      {depts.map((d) => (<option key={d} value={d}>{d}</option>))}
                    </select>
                  </div>
                </div>

                {/* KPIs (foco en plata) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <StatCard icon={DollarSign} label="Valor total (actualizado)" value={fmtCOP(obrasView.valorTotal)}
                    hint={`${fmtNum(obrasView.total)} obra${obrasView.total !== 1 ? 's' : ''} · prom. ${fmtCOP(obrasView.avgPerObra)}/obra`} accent
                    onClick={() => navigate('/dashboard/levantamiento-obras')} />
                  <StatCard icon={BadgeCheck} label="Pendiente de tu aprobación" value={fmtCOP(obrasView.pendienteValor)}
                    hint={`${fmtNum(obrasView.pendienteCount)} acta${obrasView.pendienteCount !== 1 ? 's' : ''} en aprobación`}
                    accent={obrasView.pendienteValor > 0}
                    onClick={() => navigate('/dashboard/levantamiento-obras')} />
                </div>

                {/* Indicadores: ejecución presupuestal, año vs. año y ticket por acta */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {compras?.available ? (
                    <MiniPanel label="Ejecución presupuestal"
                      value={`${obrasView.valorTotal > 0 ? Math.round((compras.poValue / obrasView.valorTotal) * 100) : 0}%`}
                      hint={`Ejecutado ${fmtCOP(compras.poValue)} · Planeado ${fmtCOP(obrasView.valorTotal)}`}
                      progress={obrasView.valorTotal > 0 ? compras.poValue / obrasView.valorTotal : 0} />
                  ) : (
                    <MiniPanel label="Ejecución presupuestal" value="—" hint="Sin acceso a compras" />
                  )}
                  {obrasView.yoy ? (
                    <MiniPanel label={`Comparativo ${obrasView.yoy.prevYear} vs ${obrasView.yoy.curYear}`}
                      value={fmtCOP(obrasView.yoy.curValue)}
                      delta={yoyDelta(obrasView.yoy.curValue, obrasView.yoy.prevValue)}
                      hint={`${obrasView.yoy.prevYear}: ${fmtCOP(obrasView.yoy.prevValue)}`} />
                  ) : (
                    <MiniPanel label="Comparativo año vs año" value="—" hint="Se necesitan 2+ años de plan" />
                  )}
                  <MiniPanel label="Ticket promedio por acta"
                    value={fmtCOP(obrasView.avgPerActa)}
                    hint={`${fmtNum(obrasView.actaCount)} acta${obrasView.actaCount !== 1 ? 's' : ''} · ${fmtCOP(obrasView.avgPerObra)}/obra`} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Por departamento */}
                  <ChartCard title={`${metricLabel} por departamento`} className="lg:col-span-2">
                    {obrasView.byDept.length === 0 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={Math.max(160, obrasView.byDept.length * 42)}>
                        <BarChart data={obrasView.byDept} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }}
                            tickFormatter={isVal ? (v: number) => fmtCOP(v) : undefined} />
                          <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                          <RTooltip formatter={(v: number) => [fmtMetric(v), metricLabel]} />
                          <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} maxBarSize={28}>
                            {obrasView.byDept.map((_, i) => (<Cell key={i} fill={PALETTE[i % PALETTE.length]} />))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>

                  {/* Top municipios por valor */}
                  <ChartCard title="Top municipios por valor">
                    {obrasView.byMuni.length === 0 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={Math.max(160, obrasView.byMuni.length * 34)}>
                        <BarChart data={obrasView.byMuni} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmtCOP(v)} />
                          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                          <RTooltip formatter={(v: number) => [fmtCOP(v), 'Valor']} />
                          <Bar dataKey="value" fill={PRIMARY} radius={[0, 4, 4, 0]} maxBarSize={24} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>

                  {/* Top obras por valor */}
                  <ChartCard title="Top obras por valor" className="lg:col-span-2">
                    {obrasView.topObras.length === 0 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={Math.max(160, obrasView.topObras.length * 34)}>
                        <BarChart data={obrasView.topObras} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmtCOP(v)} />
                          <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 11 }}
                            tickFormatter={(v: string) => (v.length > 30 ? `${v.slice(0, 29)}…` : v)} />
                          <RTooltip formatter={(v: number) => [fmtCOP(v), 'Valor']} />
                          <Bar dataKey="value" fill={PRIMARY} radius={[0, 4, 4, 0]} maxBarSize={22} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>

                  {/* Top actas por valor */}
                  <ChartCard title="Top actas por valor">
                    {obrasView.topActas.length === 0 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={Math.max(160, obrasView.topActas.length * 34)}>
                        <BarChart data={obrasView.topActas} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmtCOP(v)} />
                          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
                          <RTooltip formatter={(v: number) => [fmtCOP(v), 'Valor']} />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
                            {obrasView.topActas.map((_, i) => (<Cell key={i} fill={PALETTE[i % PALETTE.length]} />))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>

                  {/* Por año de plan */}
                  <ChartCard title={`${metricLabel} por año de plan`} className="lg:col-span-2">
                    {obrasView.byYear.length === 0 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={obrasView.byYear} margin={{ top: 8, right: 8, left: isVal ? 12 : -16, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                          <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={isVal ? 84 : 40}
                            tickFormatter={isVal ? (v: number) => fmtCOP(v) : undefined} />
                          <RTooltip formatter={(v: number) => [fmtMetric(v), metricLabel]} />
                          <Bar dataKey={dataKey} fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={56} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>

                  {/* Embudo de actas (siempre en $) */}
                  <ChartCard title="Actas por estado (valor)">
                    {obrasView.funnel.length === 0 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={Math.max(200, obrasView.funnel.length * 56)}>
                        <BarChart data={obrasView.funnel} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmtCOP(v)} />
                          <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 11 }} />
                          <RTooltip formatter={(v: number, _n, p: any) => [`${fmtCOP(v)} · ${p?.payload?.count ?? 0} acta(s)`, 'Valor']} />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={30}>
                            {obrasView.funnel.map((d, i) => (<Cell key={i} fill={ACTA_STATUS_COLOR[d.status] ?? PRIMARY} />))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>
              </section>
              );
            })()}

            {/* Desglose de compras */}
            {selectedModule === 'compras' && compras?.available && (() => {
              const promedio = compras.poTotal > 0 ? compras.poValue / compras.poTotal : 0;
              // Comparativo año vs. año (valor de OC, últimos dos años).
              const poYoY = compras.poByYear.length >= 2
                ? {
                    curYear: compras.poByYear[compras.poByYear.length - 1].year,
                    curValue: compras.poByYear[compras.poByYear.length - 1].value,
                    prevYear: compras.poByYear[compras.poByYear.length - 2].year,
                    prevValue: compras.poByYear[compras.poByYear.length - 2].value,
                  }
                : null;
              // Gasto acumulado a partir de la serie mensual de OC.
              let acc = 0;
              const cumulative = compras.poMonthly.map((m) => {
                acc += m.value;
                return { label: monthLabel(m.month), value: acc };
              });
              // Tasa de aprobación de órdenes (aprobadas / total).
              const approvedCount = compras.poByStatus
                .filter((s) => /aprob/i.test(s.name) && !/rech/i.test(s.name))
                .reduce((n, s) => n + s.count, 0);
              const tasaAprob = compras.poTotal > 0 ? approvedCount / compras.poTotal : 0;
              // Comparativo mensual sobrepuesto (una línea por año).
              const moYears = [...new Set(compras.monthlyByYear.map((r) => r.year))].sort((a, b) => a - b);
              const overlay = MONTH_ABBR.map((abbr, i) => {
                const row: Record<string, number | string> = { month: abbr };
                moYears.forEach((y) => {
                  row[String(y)] = compras.monthlyByYear.find((r) => r.year === y && r.month === i + 1)?.value ?? 0;
                });
                return row;
              });
              return (
              <section className="space-y-5">
                <SectionHeader icon={ShoppingCart} title="Compras" />

                {/* Filtros + métrica */}
                <div className="flex flex-wrap items-end gap-3 bg-white rounded-2xl border border-[hsl(var(--canalco-neutral-200))] shadow-sm p-4">
                  <div className="flex items-center gap-2 text-[hsl(var(--canalco-neutral-500))] pb-1.5">
                    <Filter className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wide">Filtros</span>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[hsl(var(--canalco-neutral-500))] mb-1">Año</label>
                    <select
                      value={String(comprasYear)}
                      onChange={(e) => setComprasYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                      className="h-9 rounded-lg border border-[hsl(var(--canalco-neutral-300))] bg-white px-3 text-sm min-w-[120px]"
                    >
                      <option value="all">Todos</option>
                      {compras.years.map((y) => (<option key={y} value={y}>{y}</option>))}
                    </select>
                  </div>
                </div>

                {/* KPIs (todo en plata) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <StatCard icon={DollarSign} label="Valor total órdenes" value={fmtCOP(compras.poValue)}
                    hint={`Ticket promedio ${fmtCOP(promedio)}`} accent
                    onClick={() => navigate('/dashboard/compras/ordenes')} />
                  <StatCard icon={PackageCheck} label="Valor pendiente de aprobación" value={fmtCOP(compras.poPendingValue)}
                    hint="Esperando tu visto bueno" accent={compras.poPendingValue > 0}
                    onClick={() => navigate('/dashboard/compras/ordenes-compra/aprobar')} />
                </div>

                {/* Tasa de aprobación + comparativo año vs. año */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <MiniPanel label="Tasa de aprobación"
                    value={`${Math.round(tasaAprob * 100)}%`}
                    progress={tasaAprob}
                    hint="Órdenes aprobadas sobre el total" />
                  {poYoY ? (
                    <MiniPanel label={`Comparativo ${poYoY.prevYear} vs ${poYoY.curYear}`}
                      value={fmtCOP(poYoY.curValue)}
                      delta={yoyDelta(poYoY.curValue, poYoY.prevValue)}
                      hint={`${poYoY.prevYear}: ${fmtCOP(poYoY.prevValue)}`} />
                  ) : (
                    <MiniPanel label="Comparativo año vs año" value="—" hint="Se necesitan 2+ años de órdenes" />
                  )}
                </div>

                {/* Órdenes por estado (valor) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ChartCard title="Órdenes por estado (valor)">
                  {compras.poByStatus.length === 0 ? <EmptyChart /> : (
                    <ResponsiveContainer width="100%" height={Math.max(160, compras.poByStatus.length * 40)}>
                      <BarChart data={compras.poByStatus} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmtCOP(v)} />
                        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
                        <RTooltip formatter={(v: number, _n, p: any) => [`${fmtCOP(v)} · ${fmtNum(p?.payload?.count ?? 0)} OC`, 'Valor']} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={26}>
                          {compras.poByStatus.map((_, i) => (<Cell key={i} fill={PALETTE[i % PALETTE.length]} />))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                  </ChartCard>

                  {/* Valor de órdenes por año (comparativo) */}
                  <ChartCard title="Valor de órdenes por año">
                    {compras.poByYear.length === 0 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={compras.poByYear.map((y) => ({ year: String(y.year), value: y.value, count: y.count }))}
                          margin={{ top: 8, right: 8, left: 12, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                          <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 11 }} width={84} tickFormatter={(v: number) => fmtCOP(v)} />
                          <RTooltip formatter={(v: number, _n, p: any) => [`${fmtCOP(v)} · ${fmtNum(p?.payload?.count ?? 0)} OC`, 'Valor']} />
                          <Bar dataKey="value" fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={56} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>

                {/* Top proveedores por valor */}
                {compras.bySupplier.length > 0 && (
                  <ChartCard title="Top proveedores por valor de órdenes">
                    <ResponsiveContainer width="100%" height={Math.max(160, compras.bySupplier.length * 36)}>
                      <BarChart data={compras.bySupplier} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmtCOP(v)} />
                        <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11 }} />
                        <RTooltip formatter={(v: number, _n, p: any) => [`${fmtCOP(v)} · ${fmtNum(p?.payload?.count ?? 0)} OC`, 'Valor']} />
                        <Bar dataKey="value" fill={PRIMARY} radius={[0, 4, 4, 0]} maxBarSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Gasto por empresa / municipio */}
                  <ChartCard title="Gasto por empresa / municipio">
                    {compras.byCompany.length === 0 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={Math.max(160, compras.byCompany.length * 36)}>
                        <BarChart data={compras.byCompany.map((c) => ({ name: getMunicipioName(c.name) || c.name, value: c.value, count: c.count }))}
                          layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmtCOP(v)} />
                          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }}
                            tickFormatter={(v: string) => (v.length > 24 ? `${v.slice(0, 23)}…` : v)} />
                          <RTooltip formatter={(v: number, _n, p: any) => [`${fmtCOP(v)} · ${fmtNum(p?.payload?.count ?? 0)} OC`, 'Valor']} />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={24}>
                            {compras.byCompany.map((_, i) => (<Cell key={i} fill={PALETTE[i % PALETTE.length]} />))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>

                  {/* Gasto por categoría de material */}
                  <ChartCard title="Gasto por categoría de material">
                    {compras.byCategory.length === 0 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={Math.max(160, compras.byCategory.length * 36)}>
                        <BarChart data={compras.byCategory} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmtCOP(v)} />
                          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }}
                            tickFormatter={(v: string) => (v.length > 24 ? `${v.slice(0, 23)}…` : v)} />
                          <RTooltip formatter={(v: number) => [fmtCOP(v), 'Valor']} />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={24}>
                            {compras.byCategory.map((_, i) => (<Cell key={i} fill={PALETTE[i % PALETTE.length]} />))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ChartCard title="Valor de órdenes por mes">
                    <MonthlyAreaChart
                      data={compras.poMonthly.map((m) => ({ label: monthLabel(m.month), value: m.value }))}
                      label="Valor" currency />
                  </ChartCard>

                  {/* Gasto acumulado */}
                  <ChartCard title="Gasto acumulado (órdenes)">
                    <MonthlyAreaChart data={cumulative} label="Acumulado" currency />
                  </ChartCard>
                </div>

                {/* Comparativo mensual sobrepuesto (una línea por año) */}
                {moYears.length > 0 && (
                  <ChartCard title="Comparativo mensual por año (valor de órdenes)">
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={overlay} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} width={84} tickFormatter={(v: number) => fmtCOP(v)} />
                        <RTooltip formatter={(v: number, n) => [fmtCOP(v), String(n)]} />
                        <Legend />
                        {moYears.map((y, i) => (
                          <Line key={y} type="monotone" dataKey={String(y)} name={String(y)}
                            stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={{ r: 2 }} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}
              </section>
              );
            })()}
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, accent, onClick }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; hint?: string; accent?: boolean; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border p-5 transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:shadow-lg hover:-translate-y-1' : 'hover:shadow-md'
      } ${accent
        ? 'border-[hsl(var(--canalco-primary))]/30 bg-gradient-to-br from-[hsl(var(--canalco-primary))]/[0.08] to-white shadow-sm'
        : 'border-[hsl(var(--canalco-neutral-200))] bg-white shadow-sm'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--canalco-neutral-500))]">{label}</p>
          <p className="mt-1.5 text-[1.7rem] leading-tight font-bold text-[hsl(var(--canalco-neutral-900))] truncate">{value}</p>
          {hint && <p className="mt-1 text-xs text-[hsl(var(--canalco-neutral-500))] truncate">{hint}</p>}
        </div>
        <div className={`flex items-center justify-center w-11 h-11 rounded-xl flex-shrink-0 transition-colors ${
          accent
            ? 'bg-[hsl(var(--canalco-primary))] text-white shadow-sm'
            : 'bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))] group-hover:bg-[hsl(var(--canalco-primary))]/15'
        }`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {onClick && (
        <span className="absolute bottom-0 left-0 h-1 w-0 bg-[hsl(var(--canalco-primary))] transition-all duration-300 group-hover:w-full" />
      )}
    </div>
  );
}

function MiniPanel({ label, value, hint, delta, progress }: {
  label: string; value: string; hint?: string; delta?: number | null; progress?: number;
}) {
  const up = (delta ?? 0) >= 0;
  const pct = progress != null ? Math.min(100, Math.max(0, progress * 100)) : null;
  return (
    <div className="rounded-2xl border border-[hsl(var(--canalco-neutral-200))] bg-white shadow-sm p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--canalco-neutral-500))]">{label}</p>
        {delta != null && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-md ${
            up ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'
          }`}>
            {up ? '▲' : '▼'} {Math.abs(delta * 100).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[1.4rem] leading-tight font-bold text-[hsl(var(--canalco-neutral-900))] truncate">{value}</p>
      {pct != null && (
        <div className="mt-2 h-1.5 w-full rounded-full bg-[hsl(var(--canalco-neutral-100))] overflow-hidden">
          <div className="h-full rounded-full bg-[hsl(var(--canalco-primary))]" style={{ width: `${pct}%` }} />
        </div>
      )}
      {hint && <p className="mt-1.5 text-xs text-[hsl(var(--canalco-neutral-500))] truncate">{hint}</p>}
    </div>
  );
}

function ModuleTabs({ modules, active, onSelect }: {
  modules: { key: ModuleKey; label: string; icon: React.ComponentType<{ className?: string }> }[];
  active: ModuleKey | null;
  onSelect: (key: ModuleKey) => void;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1.5 rounded-2xl bg-white border border-[hsl(var(--canalco-neutral-200))] shadow-sm p-1.5">
      {modules.map(({ key, label, icon: Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              isActive
                ? 'bg-[hsl(var(--canalco-primary))] text-white shadow-sm'
                : 'text-[hsl(var(--canalco-neutral-600))] hover:bg-[hsl(var(--canalco-neutral-100))]'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        );
      })}
    </div>
  );
}

function EmptyDashboard({ onGoHome }: { onGoHome: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-28 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--canalco-primary))]/10 flex items-center justify-center mb-4">
        <TrendingUp className="w-8 h-8 text-[hsl(var(--canalco-primary))]" />
      </div>
      <p className="text-lg font-semibold text-[hsl(var(--canalco-neutral-800))]">Aún no hay indicadores para mostrar</p>
      <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1 max-w-md">
        Cuando tengas obras o compras en tu alcance, sus indicadores aparecerán aquí.
      </p>
      <Button onClick={onGoHome} className="mt-5 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white">
        Ir al inicio
      </Button>
    </div>
  );
}

function ChartCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-[hsl(var(--canalco-neutral-200))] p-5 transition-shadow hover:shadow-md ${className}`}>
      <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-800))] mb-4 flex items-center gap-2">
        <span className="w-1.5 h-4 rounded-full bg-[hsl(var(--canalco-primary))] inline-block" /> {title}
      </h3>
      {children}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-[200px] text-sm text-[hsl(var(--canalco-neutral-400))]">
      Sin datos para mostrar.
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: {
  icon: React.ComponentType<{ className?: string }>; title: string;
}) {
  return (
    <div className="flex items-center gap-2.5 pt-1">
      <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))]">
        <Icon className="w-5 h-5" />
      </div>
      <h2 className="text-base font-bold text-[hsl(var(--canalco-neutral-800))]">{title}</h2>
    </div>
  );
}

function MonthlyAreaChart({ data, label, currency }: {
  data: { label: string; value: number }[]; label: string; currency?: boolean;
}) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: currency ? 12 : -16, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.35} />
            <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={currency ? 84 : 40}
          tickFormatter={currency ? (v: number) => fmtCOP(v) : undefined} />
        <RTooltip formatter={(v: number) => [currency ? fmtCOP(v) : fmtNum(v), label]} />
        <Area type="monotone" dataKey="value" stroke={PRIMARY} strokeWidth={2} fill={`url(#grad-${label})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}


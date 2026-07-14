import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSurveyAccess } from '@/hooks/useSurveyAccess';
import { surveysService, type Work, type WorkActa } from '@/services/surveys.service';
import { requisitionsService } from '@/services/requisitions.service';
import { getPendingPurchaseOrdersForApproval } from '@/services/purchase-orders.service';
import { cregService, type CregSummary } from '@/services/creg.service';
import { mapCompaniesToDepartments, getMunicipioName } from '@/utils/departmentMapper';
import { Button } from '@/components/ui/button';
import {
  Home, ArrowLeft, Loader2, HardHat, CalendarDays, DollarSign, ShoppingCart,
  Layers, ArrowRight, Zap, TrendingUp, ClipboardList, ClipboardCheck, PackageCheck,
  Filter, BadgeCheck,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Cell, AreaChart, Area,
} from 'recharts';

const fmtCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
const fmtNum = (v: number) => new Intl.NumberFormat('es-CO').format(v || 0);

// Paleta para las gráficas (naranja de marca + complementarios).
const PRIMARY = '#F59E0B';
const PALETTE = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#14B8A6', '#EC4899', '#6366F1', '#F97316', '#0EA5E9'];

type ModuleKey = 'obras' | 'compras' | 'creg';
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

interface ComprasData {
  available: boolean;
  reqTotal: number;
  poTotal: number;
  poPending: number;
  poValue: number;
  reqByStatus: NameValue[];
  poByStatus: NameValue[];
  reqMonthly: { month: string; count: number }[];
  poMonthly: { month: string; value: number }[];
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
  const [pendingReqs, setPendingReqs] = useState<number | null>(null);
  const [compras, setCompras] = useState<ComprasData | null>(null);
  const [creg, setCreg] = useState<CregSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtros de la sección Obras + métrica (valor $ / cantidad).
  const [filterYear, setFilterYear] = useState<number | 'all'>('all');
  const [filterDept, setFilterDept] = useState<string>('all');
  const [obrasMetric, setObrasMetric] = useState<'valor' | 'cantidad'>('valor');

  const companyIds = useMemo(
    () => (access?.companies || []).map((c) => c.companyId),
    [access],
  );

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

      // Requisiciones pendientes de acción (puede no tener permiso → se oculta).
      try {
        const res = await requisitionsService.getPendingActions();
        if (!cancelled) setPendingReqs(res.total ?? res.data?.length ?? 0);
      } catch {
        if (!cancelled) setPendingReqs(null);
      }

      // Desglose de compras: resumen agregado exacto (se oculta si no hay acceso).
      try {
        const sum = await requisitionsService.getDashboardSummary();
        let poPending = 0;
        try {
          const pend = await getPendingPurchaseOrdersForApproval(1, 1);
          poPending = pend.total ?? 0;
        } catch { /* sin permiso de aprobación */ }

        if (!cancelled) {
          setCompras({
            available: true,
            reqTotal: sum.requisitions.total,
            reqByStatus: sum.requisitions.byStatus.map((x) => ({ name: x.name, value: x.count })),
            reqMonthly: sum.requisitions.monthly,
            poTotal: sum.purchaseOrders.total,
            poValue: sum.purchaseOrders.value,
            poByStatus: sum.purchaseOrders.byStatus.map((x) => ({ name: x.name, value: x.count })),
            poMonthly: sum.purchaseOrders.monthly.map((m) => ({ month: m.month, value: m.value })),
            poPending,
          });
        }
      } catch {
        if (!cancelled) setCompras({ available: false, reqTotal: 0, poTotal: 0, poPending: 0, poValue: 0, reqByStatus: [], poByStatus: [], reqMonthly: [], poMonthly: [] });
      }

      // Resumen CREG (si el rol no tiene acceso, la sección se oculta).
      try {
        const summary = await cregService.getSummary();
        if (!cancelled) setCreg(summary);
      } catch {
        if (!cancelled) setCreg(null);
      }

      if (!cancelled) setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [accessLoading, companyIds]);

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
      .sort((a, b) => (obrasMetric === 'valor' ? b.value - a.value : b.count - a.count));

    // Por municipio (valor)
    const byMuniMap = new Map<string, { value: number; count: number }>();
    fw.forEach((w) => {
      const m = getMunicipioName(w.company?.name || '') || '—';
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
    fw.forEach((w) => {
      if (!w.recordNumber) return;
      const k = actaKey(w.companyId, w.projectId ?? null, w.recordNumber);
      actaVal.set(k, (actaVal.get(k) ?? 0) + valOf(w));
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

    const municipios = new Set(fw.map((w) => getMunicipioName(w.company?.name || '')).filter(Boolean));

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
    };
  }, [works, values, ippByWork, actaStatusMap, companyIdToDept, filterYear, filterDept, obrasMetric]);

  const busy = accessLoading || loading;

  // Módulos disponibles según el acceso/datos del usuario.
  const modules = useMemo(() => {
    const list: { key: ModuleKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [];
    if (works.length > 0) list.push({ key: 'obras', label: 'Obras', icon: HardHat });
    if (compras?.available) list.push({ key: 'compras', label: 'Compras', icon: ShoppingCart });
    if (creg && creg.totalUcaps > 0) list.push({ key: 'creg', label: 'CREG', icon: Zap });
    return list;
  }, [works.length, compras, creg]);

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
      return remembered && keys.includes(remembered) ? remembered : keys[0];
    });
  }, [modules]);

  const selectModule = (key: ModuleKey) => {
    setSelectedModule(key);
    localStorage.setItem(MODULE_STORAGE_KEY, key);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
            <img src="/assets/images/logo-canalco.png" alt="Canales Contactos" className="w-full h-full object-contain" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="hover:bg-[hsl(var(--canalco-neutral-200))]" title="Inicio">
            <Home className="w-5 h-5" />
          </Button>
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
            <ModuleTabs modules={modules} active={selectedModule} onSelect={selectModule} />

            {/* Obras */}
            {selectedModule === 'obras' && works.length > 0 && (() => {
              const isVal = obrasMetric === 'valor';
              const dataKey = isVal ? 'value' : 'count';
              const fmtMetric = (v: number) => (isVal ? fmtCOP(v) : fmtNum(v));
              const metricLabel = isVal ? 'Valor' : 'Obras';
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
                  <div className="ml-auto inline-flex items-center gap-1 rounded-lg bg-[hsl(var(--canalco-neutral-100))] p-1">
                    {(['valor', 'cantidad'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setObrasMetric(m)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                          obrasMetric === m ? 'bg-white text-[hsl(var(--canalco-primary))] shadow-sm' : 'text-[hsl(var(--canalco-neutral-500))]'
                        }`}
                      >
                        {m === 'valor' ? 'Valor $' : 'Cantidad'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* KPIs (foco en plata) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard icon={DollarSign} label="Valor total (actualizado)" value={fmtCOP(obrasView.valorTotal)}
                    hint={`${fmtNum(obrasView.total)} obra${obrasView.total !== 1 ? 's' : ''}`} accent />
                  <StatCard icon={BadgeCheck} label="Pendiente de tu aprobación" value={fmtCOP(obrasView.pendienteValor)}
                    hint={`${fmtNum(obrasView.pendienteCount)} acta${obrasView.pendienteCount !== 1 ? 's' : ''} en aprobación`}
                    accent={obrasView.pendienteValor > 0}
                    onClick={() => navigate('/dashboard/levantamiento-obras')} />
                  <StatCard icon={TrendingUp} label="Efecto IPP (indexación)" value={fmtCOP(obrasView.deltaIpp)}
                    hint={`Valor base: ${fmtCOP(obrasView.valorBase)}`} />
                  <StatCard icon={HardHat} label="Obras" value={fmtNum(obrasView.total)}
                    hint={`${obrasView.municipios} municipio${obrasView.municipios !== 1 ? 's' : ''} · ${obrasView.inActas} en actas`}
                    onClick={() => navigate('/dashboard/levantamiento-obras')} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                </div>
              </section>
              );
            })()}

            {/* Desglose de compras */}
            {selectedModule === 'compras' && compras?.available && (
              <section className="space-y-5">
                <SectionHeader icon={ShoppingCart} title="Compras" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard icon={ClipboardList} label="Requisiciones" value={fmtNum(compras.reqTotal)}
                    hint="Total en el sistema" onClick={() => navigate('/dashboard/compras/requisiciones')} />
                  <StatCard icon={ClipboardCheck} label="Pendientes de tu acción"
                    value={pendingReqs == null ? '—' : fmtNum(pendingReqs)}
                    hint="Requieren tu revisión"
                    accent={(pendingReqs ?? 0) > 0}
                    onClick={() => navigate('/dashboard/compras')} />
                  <StatCard icon={ShoppingCart} label="Órdenes de compra" value={fmtNum(compras.poTotal)}
                    hint={compras.poValue > 0 ? `${fmtCOP(compras.poValue)} recientes` : 'Total emitidas'}
                    onClick={() => navigate('/dashboard/compras/ordenes')} />
                  <StatCard icon={PackageCheck} label="Órdenes por aprobar" value={fmtNum(compras.poPending)}
                    hint="Pendientes de aprobación" accent={compras.poPending > 0}
                    onClick={() => navigate('/dashboard/compras/ordenes-compra/aprobar')} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ChartCard title="Requisiciones por estado">
                    <StatusBarChart data={compras.reqByStatus} label="Requisiciones" />
                  </ChartCard>
                  <ChartCard title="Órdenes de compra por estado">
                    <StatusBarChart data={compras.poByStatus} label="Órdenes" />
                  </ChartCard>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ChartCard title="Requisiciones por mes">
                    <MonthlyAreaChart
                      data={compras.reqMonthly.map((m) => ({ label: monthLabel(m.month), value: m.count }))}
                      label="Requisiciones" />
                  </ChartCard>
                  {compras.poTotal > 0 && (
                    <ChartCard title="Valor de órdenes por mes">
                      <MonthlyAreaChart
                        data={compras.poMonthly.map((m) => ({ label: monthLabel(m.month), value: m.value }))}
                        label="Valor" currency />
                    </ChartCard>
                  )}
                </div>
              </section>
            )}

            {/* Desglose CREG */}
            {selectedModule === 'creg' && creg && creg.totalUcaps > 0 && (
              <section className="space-y-5">
                <SectionHeader icon={Zap} title="CREG · Unidades constructivas" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard icon={Zap} label="UCAPs valoradas" value={fmtNum(creg.totalUcaps)}
                    hint={`${fmtNum(creg.totalUcapsAll)} UCAPs en total`} onClick={() => navigate('/dashboard/creg/resumen')} />
                  <StatCard icon={DollarSign} label="Valor total UCAPs" value={fmtCOP(creg.totalValue)}
                    hint="Suma de totales c/indirectos" accent />
                  <StatCard icon={Layers} label="Municipios con UCAPs" value={fmtNum(creg.municipios)}
                    hint="Con hoja de costos" />
                  <StatCard icon={TrendingUp} label="Valor promedio / UCAP"
                    value={fmtCOP(creg.totalUcaps > 0 ? creg.totalValue / creg.totalUcaps : 0)}
                    hint="Total c/indirectos medio" />
                </div>

                {creg.byMunicipio.length > 0 && (
                  <ChartCard title="Valor de UCAPs por municipio">
                    <ResponsiveContainer width="100%" height={Math.max(180, Math.min(creg.byMunicipio.length, 12) * 42)}>
                      <BarChart data={creg.byMunicipio.slice(0, 12)} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtCOP(v)} />
                        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
                        <RTooltip formatter={(v: number) => [fmtCOP(v), 'Valor']} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
                          {creg.byMunicipio.slice(0, 12).map((_, i) => (<Cell key={i} fill={PALETTE[i % PALETTE.length]} />))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}
              </section>
            )}

            {/* Accesos rápidos */}
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--canalco-neutral-500))] mb-3">Accesos rápidos</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <QuickLink icon={HardHat} label="Obras" onClick={() => navigate('/dashboard/levantamiento-obras')} />
                <QuickLink icon={CalendarDays} label="Plan Anual" onClick={() => navigate('/dashboard/levantamiento-obras/plan-anual')} />
                <QuickLink icon={Zap} label="CREG" onClick={() => navigate('/dashboard/creg')} />
                <QuickLink icon={ShoppingCart} label="Compras" onClick={() => navigate('/dashboard/compras')} />
              </div>
            </div>
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
        Cuando tengas obras, compras o UCAPs en tu alcance, sus indicadores aparecerán aquí.
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

function StatusBarChart({ data, label }: { data: NameValue[]; label: string }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
        <RTooltip formatter={(v: number) => [fmtNum(v), label]} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={26}>
          {data.map((_, i) => (<Cell key={i} fill={PALETTE[i % PALETTE.length]} />))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function QuickLink({ icon: Icon, label, onClick }: {
  icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 bg-white rounded-2xl shadow-sm border border-[hsl(var(--canalco-neutral-200))] p-4 text-left transition-all hover:shadow-md hover:border-[hsl(var(--canalco-primary))] hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))] flex-shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <span className="flex-1 text-sm font-semibold text-[hsl(var(--canalco-neutral-800))]">{label}</span>
      <ArrowRight className="w-4 h-4 text-[hsl(var(--canalco-neutral-400))] group-hover:text-[hsl(var(--canalco-primary))] group-hover:translate-x-0.5 transition-all" />
    </button>
  );
}

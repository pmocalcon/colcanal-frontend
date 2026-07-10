import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSurveyAccess } from '@/hooks/useSurveyAccess';
import { surveysService, type Work } from '@/services/surveys.service';
import { requisitionsService } from '@/services/requisitions.service';
import { getPendingPurchaseOrdersForApproval } from '@/services/purchase-orders.service';
import { cregService, type CregSummary } from '@/services/creg.service';
import { mapCompaniesToDepartments, getMunicipioName } from '@/utils/departmentMapper';
import { Button } from '@/components/ui/button';
import {
  Home, ArrowLeft, Loader2, HardHat, CalendarDays, DollarSign, ShoppingCart,
  Layers, ArrowRight, Zap, TrendingUp, ClipboardList, ClipboardCheck, PackageCheck,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';

const fmtCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
const fmtNum = (v: number) => new Intl.NumberFormat('es-CO').format(v || 0);

// Paleta para las gráficas (naranja de marca + complementarios).
const PRIMARY = '#F59E0B';
const PALETTE = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#14B8A6', '#EC4899', '#6366F1', '#F97316', '#0EA5E9'];

const CURRENT_YEAR = new Date().getFullYear();

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
  const [pendingReqs, setPendingReqs] = useState<number | null>(null);
  const [compras, setCompras] = useState<ComprasData | null>(null);
  const [creg, setCreg] = useState<CregSummary | null>(null);
  const [loading, setLoading] = useState(true);

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
          if (!cancelled) setValues(new Map(vals.map((v) => [v.workId, v.value])));
        } catch {
          if (!cancelled) setValues(new Map());
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

  // ---- Métricas derivadas ----
  const stats = useMemo(() => {
    const assigned = works.filter((w) => w.annualPlan != null);
    const inCurrentPlan = works.filter((w) => w.annualPlan === CURRENT_YEAR);
    const inActas = works.filter((w) => !!w.recordNumber);

    const budgetCurrent = inCurrentPlan.reduce((s, w) => s + (values.get(w.workId) ?? 0), 0);
    const budgetTotal = works.reduce((s, w) => s + (values.get(w.workId) ?? 0), 0);

    // Obras por año de plan
    const byYearMap = new Map<number, number>();
    assigned.forEach((w) => byYearMap.set(w.annualPlan!, (byYearMap.get(w.annualPlan!) ?? 0) + 1));
    const byYear = Array.from(byYearMap.entries())
      .map(([year, count]) => ({ year: String(year), count }))
      .sort((a, b) => Number(a.year) - Number(b.year));

    // Obras por departamento
    const byDeptMap = new Map<string, number>();
    works.forEach((w) => {
      const dept = companyIdToDept.get(w.companyId) ?? 'Sin departamento';
      byDeptMap.set(dept, (byDeptMap.get(dept) ?? 0) + 1);
    });
    const byDept = Array.from(byDeptMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Estado del plan (donut)
    const otherYears = assigned.length - inCurrentPlan.length;
    const unassigned = works.length - assigned.length;
    const planStatus = [
      { name: `En Plan ${CURRENT_YEAR}`, value: inCurrentPlan.length },
      { name: 'Otros años', value: otherYears },
      { name: 'Sin asignar', value: unassigned },
    ].filter((d) => d.value > 0);

    const municipios = new Set(
      works.map((w) => getMunicipioName(w.company?.name || '')).filter(Boolean),
    );

    return {
      total: works.length,
      inCurrentPlan: inCurrentPlan.length,
      assigned: assigned.length,
      unassigned,
      inActas: inActas.length,
      budgetCurrent,
      budgetTotal,
      byYear,
      byDept,
      planStatus,
      municipios: municipios.size,
    };
  }, [works, values, companyIdToDept]);

  const busy = accessLoading || loading;

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
        ) : (
          <>
            {/* Obras (solo si hay obras en el alcance del usuario) */}
            {stats.total > 0 && (
              <section className="space-y-4">
                <SectionHeader icon={HardHat} title="Obras" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <StatCard icon={HardHat} label="Total de obras" value={fmtNum(stats.total)}
                    hint={`${stats.municipios} municipio${stats.municipios !== 1 ? 's' : ''} · ${stats.inActas} en actas`}
                    onClick={() => navigate('/dashboard/levantamiento-obras')} />
                  <StatCard icon={CalendarDays} label={`Obras en Plan ${CURRENT_YEAR}`} value={fmtNum(stats.inCurrentPlan)}
                    hint={`${stats.unassigned} sin asignar`} accent />
                  <StatCard icon={DollarSign} label={`Valor presupuestado ${CURRENT_YEAR}`} value={fmtCOP(stats.budgetCurrent)}
                    hint={`Total histórico: ${fmtCOP(stats.budgetTotal)}`} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Obras por año de plan */}
                <ChartCard title="Obras por año de plan" className="lg:col-span-2">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={stats.byYear} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                      <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <RTooltip formatter={(v: number) => [fmtNum(v), 'Obras']} />
                      <Bar dataKey="count" fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={56} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* Estado del plan */}
                <ChartCard title="Estado del plan anual">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={stats.planStatus} dataKey="value" nameKey="name" cx="50%" cy="50%"
                        innerRadius={55} outerRadius={85} paddingAngle={2}>
                        {stats.planStatus.map((_, i) => (<Cell key={i} fill={PALETTE[i % PALETTE.length]} />))}
                      </Pie>
                      <RTooltip formatter={(v: number) => fmtNum(v)} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle"
                        formatter={(value) => <span className="text-xs text-[hsl(var(--canalco-neutral-600))]">{value}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* Obras por departamento */}
                <ChartCard title="Obras por departamento" className="lg:col-span-3">
                  <ResponsiveContainer width="100%" height={Math.max(160, stats.byDept.length * 42)}>
                    <BarChart data={stats.byDept} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                      <RTooltip formatter={(v: number) => [fmtNum(v), 'Obras']} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                        {stats.byDept.map((_, i) => (<Cell key={i} fill={PALETTE[i % PALETTE.length]} />))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                </div>
              </section>
            )}

            {/* Desglose de compras */}
            {compras?.available && (
              <section className="space-y-4">
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
            {creg && creg.totalUcaps > 0 && (
              <section className="space-y-4">
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
      className={`bg-white rounded-xl shadow-sm border p-5 transition-all ${
        onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''
      } ${accent ? 'border-[hsl(var(--canalco-primary))]/40' : 'border-[hsl(var(--canalco-neutral-200))]'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--canalco-neutral-500))]">{label}</p>
          <p className="mt-1 text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] truncate">{value}</p>
          {hint && <p className="mt-1 text-xs text-[hsl(var(--canalco-neutral-500))] truncate">{hint}</p>}
        </div>
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))] flex-shrink-0">
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-[hsl(var(--canalco-neutral-200))] p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-800))] mb-4 flex items-center gap-2">
        <Layers className="w-4 h-4 text-[hsl(var(--canalco-primary))]" /> {title}
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
    <div className="flex items-center gap-2 pt-2">
      <div className="flex items-center justify-center w-7 h-7 rounded-md bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))]">
        <Icon className="w-4 h-4" />
      </div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--canalco-neutral-600))]">{title}</h2>
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
      className="group flex items-center gap-3 bg-white rounded-xl shadow-sm border border-[hsl(var(--canalco-neutral-200))] p-4 text-left transition-all hover:shadow-md hover:border-[hsl(var(--canalco-primary))] hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))] flex-shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <span className="flex-1 text-sm font-semibold text-[hsl(var(--canalco-neutral-800))]">{label}</span>
      <ArrowRight className="w-4 h-4 text-[hsl(var(--canalco-neutral-400))] group-hover:text-[hsl(var(--canalco-primary))] group-hover:translate-x-0.5 transition-all" />
    </button>
  );
}

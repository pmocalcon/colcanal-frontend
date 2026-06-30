import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { parseLocalDate } from '@/utils/colombianCalendar';
import type { DailyPlanEntry, ScheduleDetail } from '@/services/schedules.service';

// ─── tipos ────────────────────────────────────────────────────────────────

export interface ActaGanttPlanPoint {
  date: string;
  quantity: number;
}

export interface ActaGanttUcap {
  ucapId: number;
  code: string;
  description: string;
  start: string | null;
  end: string | null;
  plannedQuantity: number;
  executedQuantity: number;
  unitValue: number;
  planPoints: ActaGanttPlanPoint[];
  progress: number; // 0–100
}

export interface ActaGanttObra {
  workId: number;
  workCode: string;
  name: string;
  start: string | null; // barra de la obra = rango del plan (unión de sus UCAPs)
  end: string | null;
  contextStart: string | null; // fechas contractuales: solo dan contexto al eje, no se dibujan
  contextEnd: string | null;
  progress: number; // 0–100 (promedio simple del % de cada UCAP)
  weight: number; // nº de UCAPs con plan (informativo; el avance general usa promedio simple)
  metrics: {
    timePct: number | null;
    scopePct: number;
    budgetPct: number | null;
    executedValue: number; // valor ejecutado de las UCAPs a la fecha (COP)
  };
  ucaps: ActaGanttUcap[];
}

// ─── helpers de construcción ────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function ucapPct(executed: number, planned: number): number {
  if (!planned) return 0;
  return clamp01(executed / planned) * 100;
}

function timePctFor(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const startMs = dateMs(start);
  const endMs = dateMs(end);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  if (endMs <= startMs) return todayMs >= endMs ? 100 : 0;
  return clamp01((todayMs - startMs) / (endMs - startMs)) * 100;
}

/**
 * Transforma los schedules de las obras de un acta en filas para el Gantt.
 * - Progreso de la obra: promedio simple del % de avance de cada UCAP (con plan > 0).
 * - Fechas de la obra: contractuales si existen; si no, el rango de fechas de sus UCAPs.
 */
export function buildActaGanttObras(
  items: Array<{
    work: { workId: number; workCode?: string | null; name: string };
    schedule: ScheduleDetail;
    plans?: DailyPlanEntry[];
  }>,
): ActaGanttObra[] {
  return items.map(({ work, schedule, plans = [] }) => {
    const ippFactor = Number(schedule.ippFactor) || 1;
    const planPointsByUcap = new Map<number, Map<string, number>>();
    plans.forEach((plan) => {
      const date = plan.planDate?.slice(0, 10);
      const quantity = Number(plan.plannedQuantity) || 0;
      if (!date || quantity <= 0) return;

      const byDate = planPointsByUcap.get(plan.ucapId) ?? new Map<string, number>();
      byDate.set(date, (byDate.get(date) ?? 0) + quantity);
      planPointsByUcap.set(plan.ucapId, byDate);
    });
    const getPlanPoints = (ucapId: number): ActaGanttPlanPoint[] =>
      Array.from(planPointsByUcap.get(ucapId)?.entries() ?? [])
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, quantity]) => ({ date, quantity }));

    const ucaps: ActaGanttUcap[] = schedule.items.map((it) => ({
      ucapId: it.ucapId,
      code: it.ucapCode,
      description: it.ucapDescription,
      start: it.ucapStartDate,
      end: it.ucapEndDate,
      plannedQuantity: Number(it.plannedQuantity) || 0,
      executedQuantity: Number(it.executedQuantity) || 0,
      unitValue: (Number(it.unitValue) || 0) * ippFactor,
      planPoints: getPlanPoints(it.ucapId),
      progress: ucapPct(it.executedQuantity, it.plannedQuantity),
    }));

    // Avance del alcance = ponderado por cantidad: Σ ejecutado (topado al plan) / Σ planeado.
    const scopePlannedQty = schedule.items.reduce((sum, it) => sum + (Number(it.plannedQuantity) || 0), 0);
    const scopeExecutedQty = schedule.items.reduce(
      (sum, it) => sum + Math.min(Number(it.executedQuantity) || 0, Number(it.plannedQuantity) || 0),
      0,
    );
    const progress = scopePlannedQty > 0 ? clamp01(scopeExecutedQty / scopePlannedQty) * 100 : 0;
    const ucapsWithPlan = schedule.items.filter((it) => (Number(it.plannedQuantity) || 0) > 0).length;

    // Barra de la obra = rango del plan (unión de las fechas de sus UCAPs).
    // Si no hay plan, se usan las fechas contractuales.
    const starts = ucaps.map((u) => u.start).filter((d): d is string => !!d);
    const ends = ucaps.map((u) => u.end).filter((d): d is string => !!d);
    const start = starts.length
      ? starts.reduce((a, b) => (a < b ? a : b))
      : schedule.contractualStart || null;
    const end = ends.length
      ? ends.reduce((a, b) => (a > b ? a : b))
      : schedule.contractualEnd || null;
    const budgetTotal = schedule.items.reduce(
      (sum, item) => sum + (Number(item.plannedQuantity) || 0) * (Number(item.unitValue) || 0) * ippFactor,
      0,
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    const plannedByUcapToDate = new Map<number, number>();
    plans.forEach((plan) => {
      if (!plan.planDate || dateMs(plan.planDate.slice(0, 10)) > todayMs) return;
      plannedByUcapToDate.set(
        plan.ucapId,
        (plannedByUcapToDate.get(plan.ucapId) ?? 0) + (Number(plan.plannedQuantity) || 0),
      );
    });
    const budgetProgrammedToDate = schedule.items.reduce(
      (sum, item) => {
        const plannedToDate = Math.min(plannedByUcapToDate.get(item.ucapId) ?? 0, Number(item.plannedQuantity) || 0);
        return sum + plannedToDate * (Number(item.unitValue) || 0) * ippFactor;
      },
      0,
    );
    const budgetExecuted = schedule.items.reduce(
      (sum, item) => {
        const executed = Math.min(Number(item.executedQuantity) || 0, Number(item.plannedQuantity) || 0);
        return sum + executed * (Number(item.unitValue) || 0) * ippFactor;
      },
      0,
    );
    const budgetReference = budgetProgrammedToDate > 0 ? budgetProgrammedToDate : budgetExecuted;
    const budgetPct = budgetTotal > 0 ? clamp01(budgetReference / budgetTotal) * 100 : null;

    return {
      workId: work.workId,
      workCode: work.workCode || '',
      name: work.name,
      start: start || null,
      end: end || null,
      // Contractual: solo amplía el eje de tiempo para dar contexto (no se dibuja).
      contextStart: schedule.contractualStart || null,
      contextEnd: schedule.contractualEnd || null,
      progress,
      weight: ucapsWithPlan,
      metrics: {
        timePct: timePctFor(start || null, end || null),
        scopePct: progress,
        budgetPct,
        executedValue: budgetExecuted,
      },
      ucaps,
    };
  });
}

// ─── componente ──────────────────────────────────────────────────────────────

function dateMs(s: string): number {
  return parseLocalDate(s).getTime();
}

const DAY_MS = 86_400_000;
const LABEL = 'w-56 flex-shrink-0';
const METRICS = 'w-64 flex-shrink-0';

/** Color de la barra según el desfase entre avance esperado (temporal) y real. */
function fillColorFor(start: string | null, end: string | null, progress: number): string {
  if (!start || !end) {
    // Sin fechas: color según el % de avance.
    return progress >= 100 ? '#22c55e' : progress >= 70 ? '#f59e0b' : 'hsl(var(--canalco-primary))';
  }
  const startMs = dateMs(start);
  const endMs = dateMs(end);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const temporal =
    todayMs <= startMs ? 0 : todayMs >= endMs ? 100 : ((todayMs - startMs) / (endMs - startMs)) * 100;
  const diff = temporal - progress;
  return diff <= 5 ? '#22c55e' : diff <= 20 ? '#f59e0b' : '#ef4444';
}

/** Texto + fondo tenue del badge de porcentaje, derivado del color de la barra. */
function badgeStyle(color: string): { color: string; background: string } {
  const map: Record<string, { color: string; background: string }> = {
    '#22c55e': { color: '#15803d', background: 'rgba(34, 197, 94, 0.12)' },
    '#f59e0b': { color: '#b45309', background: 'rgba(245, 158, 11, 0.15)' },
    '#ef4444': { color: '#dc2626', background: 'rgba(239, 68, 68, 0.12)' },
  };
  return (
    map[color] ?? {
      color: 'hsl(var(--canalco-primary))',
      background: 'hsl(var(--canalco-primary) / 0.13)',
    }
  );
}

function formatMetric(value: number | null): string {
  return value === null ? '-' : `${Math.round(value)}%`;
}

function formatQuantity(value: number): string {
  return value.toLocaleString('es-CO', { maximumFractionDigits: 2 });
}

function formatCurrency(value: number): string {
  if (!value) return '-';
  return value.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}

export function ActaGantt({ obras, dark = false }: { obras: ActaGanttObra[]; dark?: boolean }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Paleta: claro (por defecto) u oscuro (para incrustar en el dashboard #0d1117).
  const t = dark
    ? {
        title: 'text-slate-100',
        subtitle: 'text-slate-400',
        summaryBox: 'border-slate-700 bg-slate-900/60',
        progressTrack: 'bg-slate-700',
        dateBorder: 'border-slate-700',
        muted: 'text-slate-400',
        rowBorder: 'border-slate-800',
        rowOpen: 'bg-slate-800/40',
        rowStripe: 'bg-slate-800/20',
        rowHover: 'hover:bg-slate-800/40',
        chevron: 'text-slate-400 group-hover:text-slate-200',
        code: 'text-amber-400',
        name: 'text-slate-100',
        ucapCode: 'text-slate-300',
        ucapBadge: 'bg-slate-700 text-slate-300',
        ucapDesc: 'text-slate-400',
        barTrack: 'bg-slate-700',
        barDashed: 'border-slate-600',
        execPill: 'bg-emerald-500/15 text-emerald-300',
        expectedPill: 'bg-amber-500/15 text-amber-300',
        metricPill: 'bg-slate-700/50 text-slate-200',
      }
    : {
        title: 'text-[hsl(var(--canalco-neutral-800))]',
        subtitle: 'text-[hsl(var(--canalco-neutral-400))]',
        summaryBox: 'border-[hsl(var(--canalco-neutral-200))] bg-gradient-to-br from-white to-[hsl(var(--canalco-neutral-50))] shadow-sm',
        progressTrack: 'bg-[hsl(var(--canalco-neutral-200))]',
        dateBorder: 'border-[hsl(var(--canalco-neutral-200))]',
        muted: 'text-[hsl(var(--canalco-neutral-400))]',
        rowBorder: 'border-[hsl(var(--canalco-neutral-100))]',
        rowOpen: 'bg-[hsl(var(--canalco-primary))]/[0.04]',
        rowStripe: 'bg-[hsl(var(--canalco-neutral-50))]/50',
        rowHover: 'hover:bg-[hsl(var(--canalco-neutral-100))]/60',
        chevron: 'text-[hsl(var(--canalco-neutral-400))] group-hover:text-[hsl(var(--canalco-neutral-600))]',
        code: 'text-[hsl(var(--canalco-primary))]',
        name: 'text-[hsl(var(--canalco-neutral-800))]',
        ucapCode: 'text-[hsl(var(--canalco-neutral-600))]',
        ucapBadge: 'bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-600))]',
        ucapDesc: 'text-[hsl(var(--canalco-neutral-500))]',
        barTrack: 'bg-[hsl(var(--canalco-neutral-100))]',
        barDashed: 'border-[hsl(var(--canalco-neutral-200))]',
        execPill: 'bg-emerald-100 text-emerald-700',
        expectedPill: 'bg-amber-100 text-amber-700',
        metricPill: 'bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))]',
      };

  const toggle = (workId: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(workId) ? next.delete(workId) : next.add(workId);
      return next;
    });

  const timeline = useMemo(() => {
    const allMs: number[] = [];
    for (const o of obras) {
      if (o.start) allMs.push(dateMs(o.start));
      if (o.end) allMs.push(dateMs(o.end));
      // Contractual amplía el eje para dar contexto, aunque no se dibuje.
      if (o.contextStart) allMs.push(dateMs(o.contextStart));
      if (o.contextEnd) allMs.push(dateMs(o.contextEnd));
      for (const u of o.ucaps) {
        if (u.start) allMs.push(dateMs(u.start));
        if (u.end) allMs.push(dateMs(u.end));
        for (const point of u.planPoints) {
          allMs.push(dateMs(point.date));
        }
      }
    }
    if (allMs.length < 2) return null;

    const minMs = Math.min(...allMs);
    const maxMs = Math.max(...allMs);
    const rangeMs = maxMs - minMs;
    if (!rangeMs) return null;

    const toPos = (s: string) =>
      Math.max(0, Math.min(100, ((dateMs(s) - minMs) / rangeMs) * 100));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayPct = ((today.getTime() - minMs) / rangeMs) * 100;
    const showToday = todayPct >= 0 && todayPct <= 100;

    const totalDays = rangeMs / DAY_MS;
    const step = totalDays <= 21 ? 3 : totalDays <= 60 ? 7 : totalDays <= 120 ? 14 : 30;
    const labels: Array<{ label: string; pct: number }> = [];
    const cur = new Date(minMs);
    const maxDate = new Date(maxMs);
    while (cur <= maxDate) {
      labels.push({
        label: cur.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' }),
        pct: ((cur.getTime() - minMs) / rangeMs) * 100,
      });
      cur.setDate(cur.getDate() + step);
    }

    return { toPos, todayPct, showToday, labels };
  }, [obras]);

  if (obras.length === 0) {
    return (
      <p className={`text-sm py-6 text-center ${t.muted}`}>
        Esta acta no tiene obras con cronograma para mostrar.
      </p>
    );
  }

  const TodayLine = () =>
    timeline?.showToday ? (
      <div
        className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none"
        style={{ left: `${timeline.todayPct}%` }}
      />
    ) : null;

  // Barra (track + fill) reutilizable
  const Bar = ({
    start,
    end,
    progress,
    height,
    planPoints = [],
  }: {
    start: string | null;
    end: string | null;
    progress: number;
    height: string;
    planPoints?: ActaGanttPlanPoint[];
  }) => {
    const innerH = height === 'h-7' ? 'h-3.5' : 'h-2.5';
    if (!timeline || !start || !end) {
      // Sin fechas de cronograma: barra de progreso simple basada en el % de avance.
      const color = fillColorFor(start, end, progress);
      return (
        <div className={`flex-1 ${height} flex items-center relative`}>
          {progress > 0 ? (
            <div className={`w-full ${innerH} rounded-full ${t.barTrack} overflow-hidden`}>
              <div
                className="h-full rounded-full transition-all duration-500 shadow-sm"
                style={{ width: `${Math.min(100, progress)}%`, background: color }}
              />
            </div>
          ) : (
            // 0% sin avance: línea punteada sutil ("planeado, sin iniciar"), no un riel gris lleno.
            <div className={`w-full border-t-2 border-dashed ${t.barDashed}`} />
          )}
        </div>
      );
    }
    const left = timeline.toPos(start);
    const barWidth = Math.max(0.5, timeline.toPos(end) - left);
    const fillWidth = (progress / 100) * barWidth;
    const color = fillColorFor(start, end, progress);
    return (
      <div className={`flex-1 relative ${height} overflow-hidden`}>
        <TodayLine />
        {progress > 0 ? (
          <div
            className={`absolute top-1/2 -translate-y-1/2 ${innerH} rounded-full ${t.barTrack}`}
            style={{ left: `${left}%`, width: `${barWidth}%` }}
          />
        ) : (
          // 0%: el tramo planeado se marca con línea punteada en vez de riel gris lleno.
          <div
            className={`absolute top-1/2 -translate-y-1/2 border-t-2 border-dashed ${t.barDashed}`}
            style={{ left: `${left}%`, width: `${barWidth}%` }}
          />
        )}
        {progress > 0 && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 ${innerH} rounded-full transition-all duration-500 shadow-sm`}
            style={{ left: `${left}%`, width: `${fillWidth}%`, background: color }}
          />
        )}
      </div>
    );
  };

  // Avance general del acta = promedio del avance de cada obra. Cada proyecto
  // cuenta igual: se promedia el % de llenado de la barra de cada obra.
  const overall =
    obras.length > 0
      ? obras.reduce((s, o) => s + o.progress, 0) / obras.length
      : 0;
  const overallColor =
    overall >= 100 ? '#22c55e' : overall >= 70 ? '#f59e0b' : 'hsl(var(--canalco-primary))';
  // Sumatoria del valor ejecutado de las UCAPs de todas las obras del acta (COP).
  const totalExecutedValue = obras.reduce((s, o) => s + (o.metrics.executedValue || 0), 0);
  // Esperado a la fecha: valor que se debería haber ejecutado según el plan diario hasta hoy.
  // = Σ (cantidad planeada acumulada hasta hoy × valor unitario) de cada UCAP.
  const todayStr = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  })();
  const totalExpectedValue = obras.reduce(
    (s, o) =>
      s +
      o.ucaps.reduce((us, u) => {
        const plannedToDate = (u.planPoints || []).reduce(
          (q, p) => q + (p.date.slice(0, 10) <= todayStr ? p.quantity : 0),
          0,
        );
        return us + plannedToDate * (Number(u.unitValue) || 0);
      }, 0),
    0,
  );
  const formatCOP = (v: number) =>
    v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  const MetricPill = ({ label, value }: { label: string; value: number | null }) => (
    <span className={`inline-flex items-center justify-between gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${t.metricPill}`}>
      <span className="font-medium opacity-70">{label}</span>
      <span>{formatMetric(value)}</span>
    </span>
  );
  const RowMetrics = ({ obra }: { obra: ActaGanttObra }) => (
    <div className={`${METRICS} grid grid-cols-2 gap-1.5`}>
      <MetricPill label="Avance en el alcance" value={obra.metrics.scopePct} />
      <MetricPill label="Avance en el Ppto" value={obra.metrics.budgetPct} />
    </div>
  );

  return (
    <div>
      {/* ── Avance general (promedio simple del avance de cada obra) ── */}
      <div className={`mb-5 rounded-xl border px-5 py-4 ${t.summaryBox}`}>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <span className={`text-sm font-semibold ${t.title}`}>
            Avance general por acta
            <span className={`ml-2 text-xs font-normal ${t.subtitle}`}>
              ({obras.length} obras · promedio del avance)
            </span>
          </span>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${t.execPill}`}
              title="Sumatoria del valor ejecutado de las UCAPs"
            >
              <span className="font-medium opacity-80">Ejecutado UCAPs</span>
              <span>{formatCOP(totalExecutedValue)}</span>
            </span>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${t.expectedPill}`}
              title="Valor que se debería haber ejecutado según el plan a la fecha de hoy"
            >
              <span className="font-medium opacity-80">Esperado UCAPs</span>
              <span>{formatCOP(totalExpectedValue)}</span>
            </span>
            <span
              className="text-base font-bold tabular-nums rounded-full px-3 py-1"
              style={badgeStyle(overallColor)}
            >
              {Math.round(overall)}%
            </span>
          </div>
        </div>
        <div className={`h-2.5 w-full rounded-full overflow-hidden ${t.progressTrack}`}>
          <div
            className="h-full rounded-full transition-all duration-500 shadow-sm"
            style={{ width: `${Math.min(100, overall)}%`, background: overallColor }}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 720 }}>
          {/* ── Etiquetas de fecha ── */}
        {timeline && (
          <div className={`flex gap-2 h-7 mb-1.5 pb-1 border-b ${t.dateBorder}`}>
            <div className={LABEL} />
            <div className="flex-1 relative">
              {timeline.labels.map(({ label, pct }) => (
                <span
                  key={label + pct}
                  className={`absolute bottom-0 text-[11px] -translate-x-1/2 select-none whitespace-nowrap ${t.muted}`}
                  style={{ left: `${pct}%` }}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className={`${METRICS} grid grid-cols-2 gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${t.muted}`}>
              <span>Avance en el alcance</span>
              <span>Avance en el Ppto</span>
            </div>
          </div>
        )}

        {/* ── Filas de obras ── */}
        {obras.map((obra, idx) => {
          const isOpen = expanded.has(obra.workId);
          return (
            <div
              key={obra.workId}
              className={`border-b last:border-b-0 ${t.rowBorder} ${
                isOpen
                  ? t.rowOpen
                  : idx % 2 === 1
                  ? t.rowStripe
                  : ''
              }`}
            >
              {/* fila de la obra (clic = desplegar) */}
              <button
                onClick={() => toggle(obra.workId)}
                className={`w-full flex items-center gap-2 py-2.5 transition-colors text-left group ${t.rowHover}`}
              >
                <div className={`${LABEL} flex items-center gap-1 pr-2 min-w-0`}>
                  {isOpen ? (
                    <ChevronDown className={`w-4 h-4 flex-shrink-0 ${t.code}`} />
                  ) : (
                    <ChevronRight className={`w-4 h-4 flex-shrink-0 ${t.chevron}`} />
                  )}
                  <div className="min-w-0">
                    {obra.workCode && (
                      <p className={`text-[11px] font-mono font-semibold truncate leading-tight ${t.code}`}>
                        {obra.workCode}
                      </p>
                    )}
                    <p className={`text-xs font-medium truncate leading-tight ${t.name}`}>
                      {obra.name}
                    </p>
                  </div>
                </div>
                <Bar start={obra.start} end={obra.end} progress={obra.progress} height="h-7" />
                <RowMetrics obra={obra} />
              </button>

              {/* sub-filas de UCAPs */}
              {isOpen && (
                <div className="pb-2 pt-0.5">
                  {obra.ucaps.length === 0 ? (
                    <div className="flex items-center gap-2 py-1">
                      <div className={LABEL} />
                      <div className={`flex-1 text-[11px] italic ${t.muted}`}>
                        Sin UCAPs registradas
                      </div>
                      <div className={METRICS} />
                    </div>
                  ) : (
                    obra.ucaps.map((u) => {
                      const uColor = fillColorFor(u.start, u.end, u.progress);
                      const executedValue = (Number(u.executedQuantity) || 0) * (Number(u.unitValue) || 0);
                      return (
                        <div key={u.ucapId} className="flex items-center gap-2 py-1">
                          <div className={`${LABEL} pl-7 pr-2 min-w-0`}>
                            <div className="flex items-center gap-1.5 min-w-0 leading-tight flex-wrap">
                              <p className={`text-[11px] font-mono font-semibold truncate ${t.ucapCode}`}>
                                {u.code}
                              </p>
                              <span className={`flex-shrink-0 text-[10px] font-semibold tabular-nums rounded-full px-1.5 py-0.5 ${t.ucapBadge}`}>
                                Cant. {formatQuantity(u.plannedQuantity)}
                              </span>
                              <span className="flex-shrink-0 text-[10px] font-bold tabular-nums rounded-full px-1.5 py-0.5 bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))]">
                                Ejec. {formatQuantity(u.executedQuantity)}
                              </span>
                            </div>
                            <p className={`text-[11px] truncate leading-tight ${t.ucapDesc}`}>
                              {u.description}
                            </p>
                          </div>
                          <Bar
                            start={u.start}
                            end={u.end}
                            progress={u.progress}
                            height="h-6"
                            planPoints={u.planPoints}
                          />
                          <div className={`${METRICS} flex justify-end gap-1.5`}>
                            <span className={`text-[10px] font-semibold tabular-nums rounded-full px-1.5 py-0.5 ${t.execPill}`}>
                              Vr. {formatCurrency(executedValue)}
                            </span>
                            <span
                              className="text-[10px] font-semibold tabular-nums rounded-full px-1.5 py-0.5"
                              style={badgeStyle(uColor)}
                            >
                              {Math.round(u.progress)}%
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* ── Etiqueta "hoy" ── */}
        {timeline?.showToday && (
          <div className="flex items-center gap-2 mt-1">
            <div className={LABEL} />
            <div className="flex-1 relative h-4 overflow-hidden">
              <span
                className="absolute text-[10px] text-red-400 font-semibold -translate-x-1/2"
                style={{ left: `${timeline.todayPct}%` }}
              >
                hoy
              </span>
            </div>
            <div className={METRICS} />
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

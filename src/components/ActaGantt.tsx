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

    // Avance agregado = promedio simple del % de avance de cada UCAP (con plan > 0).
    const ucapPcts = schedule.items
      .filter((it) => it.plannedQuantity > 0)
      .map((it) => ucapPct(it.executedQuantity, it.plannedQuantity));
    const progress =
      ucapPcts.length > 0
        ? ucapPcts.reduce((sum, p) => sum + p, 0) / ucapPcts.length
        : 0;

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
      weight: ucapPcts.length,
      metrics: {
        timePct: timePctFor(start || null, end || null),
        scopePct: progress,
        budgetPct,
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
const LABEL = 'w-72 flex-shrink-0';
const METRICS = 'w-80 flex-shrink-0';

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

function averageMetric(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function metricColor(value: number | null): string {
  if (value === null) return '#94a3b8';
  if (value >= 100) return '#22c55e';
  if (value >= 70) return '#f59e0b';
  return '#ef4444';
}

function metricBadgeStyle(value: number | null): { color: string; background: string } {
  if (value === null) return { color: '#64748b', background: 'rgba(148, 163, 184, 0.14)' };
  return badgeStyle(metricColor(value));
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

export function ActaGantt({ obras }: { obras: ActaGanttObra[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

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
      <p className="text-sm text-[hsl(var(--canalco-neutral-500))] py-6 text-center">
        Este acta no tiene obras con cronograma para mostrar.
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
    const PlanPointMarkers = () =>
      timeline && planPoints.length > 0 ? (
        <>
          {planPoints.map((point) => (
            <span
              key={`${point.date}-${point.quantity}`}
              className="absolute top-1/2 z-20 min-w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-300 bg-amber-50 px-1 text-center text-[10px] font-bold leading-4 text-amber-700 shadow-sm"
              style={{ left: `${timeline.toPos(point.date)}%` }}
              title={`${point.date} - Plan: ${formatQuantity(point.quantity)}`}
            >
              {formatQuantity(point.quantity)}
            </span>
          ))}
        </>
      ) : null;
    if (!timeline || !start || !end) {
      // Sin fechas de cronograma: barra de progreso simple basada en el % de avance.
      const color = fillColorFor(start, end, progress);
      return (
        <div className={`flex-1 ${height} flex items-center relative`}>
          {progress > 0 ? (
            <div className={`w-full ${innerH} rounded-full bg-[hsl(var(--canalco-neutral-100))] overflow-hidden`}>
              <div
                className="h-full rounded-full transition-all duration-500 shadow-sm"
                style={{ width: `${Math.min(100, progress)}%`, background: color }}
              />
            </div>
          ) : (
            // 0% sin avance: línea punteada sutil ("planeado, sin iniciar"), no un riel gris lleno.
            <div className="w-full border-t-2 border-dashed border-[hsl(var(--canalco-neutral-200))]" />
          )}
          <PlanPointMarkers />
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
            className={`absolute top-1/2 -translate-y-1/2 ${innerH} rounded-full bg-[hsl(var(--canalco-neutral-100))]`}
            style={{ left: `${left}%`, width: `${barWidth}%` }}
          />
        ) : (
          // 0%: el tramo planeado se marca con línea punteada en vez de riel gris lleno.
          <div
            className="absolute top-1/2 -translate-y-1/2 border-t-2 border-dashed border-[hsl(var(--canalco-neutral-200))]"
            style={{ left: `${left}%`, width: `${barWidth}%` }}
          />
        )}
        {progress > 0 && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 ${innerH} rounded-full transition-all duration-500 shadow-sm`}
            style={{ left: `${left}%`, width: `${fillWidth}%`, background: color }}
          />
        )}
        <PlanPointMarkers />
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
  const overallScope = averageMetric(obras.map((obra) => obra.metrics.scopePct));
  const overallBudget = averageMetric(obras.map((obra) => obra.metrics.budgetPct));
  const MetricPill = ({ label, value }: { label: string; value: number | null }) => (
    <span
      className="inline-flex items-center justify-between gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums"
      style={metricBadgeStyle(value)}
    >
      <span className="font-medium opacity-80">{label}</span>
      <span>{formatMetric(value)}</span>
    </span>
  );
  const RowMetrics = ({ obra }: { obra: ActaGanttObra }) => (
    <div className={`${METRICS} grid grid-cols-2 gap-1.5`}>
      <MetricPill label="Alcance" value={obra.metrics.scopePct} />
      <MetricPill label="Ppto" value={obra.metrics.budgetPct} />
    </div>
  );

  return (
    <div>
      {/* ── Avance general (promedio simple del avance de cada obra) ── */}
      <div className="mb-5 rounded-xl border border-[hsl(var(--canalco-neutral-200))] bg-gradient-to-br from-white to-[hsl(var(--canalco-neutral-50))] px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <span className="text-sm font-semibold text-[hsl(var(--canalco-neutral-800))]">
            Avance general por proyecto
            <span className="ml-2 text-xs font-normal text-[hsl(var(--canalco-neutral-400))]">
              ({obras.length} obras · promedio del avance)
            </span>
          </span>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <MetricPill label="Alcance" value={overallScope} />
            <MetricPill label="Ppto" value={overallBudget} />
            <span
              className="text-base font-bold tabular-nums rounded-full px-3 py-1"
              style={badgeStyle(overallColor)}
            >
              {Math.round(overall)}%
            </span>
          </div>
        </div>
        <div className="h-2.5 w-full rounded-full bg-[hsl(var(--canalco-neutral-200))] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 shadow-sm"
            style={{ width: `${Math.min(100, overall)}%`, background: overallColor }}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 1120 }}>
          {/* ── Etiquetas de fecha ── */}
        {timeline && (
          <div className="flex gap-2 h-7 mb-1.5 pb-1 border-b border-[hsl(var(--canalco-neutral-200))]">
            <div className={LABEL} />
            <div className="flex-1 relative">
              {timeline.labels.map(({ label, pct }) => (
                <span
                  key={label + pct}
                  className="absolute bottom-0 text-[11px] text-[hsl(var(--canalco-neutral-400))] -translate-x-1/2 select-none whitespace-nowrap"
                  style={{ left: `${pct}%` }}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className={`${METRICS} grid grid-cols-2 gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--canalco-neutral-400))]`}>
              <span>Alcance</span>
              <span>Ppto</span>
            </div>
          </div>
        )}

        {/* ── Filas de obras ── */}
        {obras.map((obra, idx) => {
          const isOpen = expanded.has(obra.workId);
          return (
            <div
              key={obra.workId}
              className={`border-b border-[hsl(var(--canalco-neutral-100))] last:border-b-0 ${
                isOpen
                  ? 'bg-[hsl(var(--canalco-primary))]/[0.04]'
                  : idx % 2 === 1
                  ? 'bg-[hsl(var(--canalco-neutral-50))]/50'
                  : ''
              }`}
            >
              {/* fila de la obra (clic = desplegar) */}
              <button
                onClick={() => toggle(obra.workId)}
                className="w-full flex items-center gap-2 py-2.5 hover:bg-[hsl(var(--canalco-neutral-100))]/60 transition-colors text-left group"
              >
                <div className={`${LABEL} flex items-center gap-1 pr-2 min-w-0`}>
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 flex-shrink-0 text-[hsl(var(--canalco-primary))]" />
                  ) : (
                    <ChevronRight className="w-4 h-4 flex-shrink-0 text-[hsl(var(--canalco-neutral-400))] group-hover:text-[hsl(var(--canalco-neutral-600))]" />
                  )}
                  <div className="min-w-0">
                    {obra.workCode && (
                      <p className="text-[11px] font-mono font-semibold text-[hsl(var(--canalco-primary))] truncate leading-tight">
                        {obra.workCode}
                      </p>
                    )}
                    <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-800))] truncate leading-tight">
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
                      <div className="flex-1 text-[11px] text-[hsl(var(--canalco-neutral-400))] italic">
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
                              <p className="text-[11px] font-mono font-semibold text-[hsl(var(--canalco-neutral-600))] truncate">
                                {u.code}
                              </p>
                              <span className="flex-shrink-0 text-[10px] font-semibold tabular-nums rounded-full px-1.5 py-0.5 bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-600))]">
                                Cant. {formatQuantity(u.plannedQuantity)}
                              </span>
                              <span className="flex-shrink-0 text-[10px] font-bold tabular-nums rounded-full px-1.5 py-0.5 bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))]">
                                Ejec. {formatQuantity(u.executedQuantity)}
                              </span>
                            </div>
                            <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))] truncate leading-tight">
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
                            <span className="text-[10px] font-semibold tabular-nums rounded-full px-1.5 py-0.5 bg-emerald-50 text-emerald-700">
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

import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { parseLocalDate } from '@/utils/colombianCalendar';
import type { ScheduleDetail } from '@/services/schedules.service';

// ─── tipos ────────────────────────────────────────────────────────────────

export interface ActaGanttUcap {
  ucapId: number;
  code: string;
  description: string;
  start: string | null;
  end: string | null;
  progress: number; // 0–100
}

export interface ActaGanttObra {
  workId: number;
  workCode: string;
  name: string;
  start: string | null; // barra de la obra (fechas contractuales o rango de UCAPs)
  end: string | null;
  progress: number; // 0–100 (avance agregado, ponderado por valor)
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

/**
 * Transforma los schedules de las obras de un acta en filas para el Gantt.
 * - Progreso de la obra: ponderado por valor (Σ ejecutado·valor / Σ planeado·valor),
 *   con respaldo por cantidad si no hay valores.
 * - Fechas de la obra: contractuales si existen; si no, el rango de fechas de sus UCAPs.
 */
export function buildActaGanttObras(
  items: Array<{
    work: { workId: number; workCode?: string | null; name: string };
    schedule: ScheduleDetail;
  }>,
): ActaGanttObra[] {
  return items.map(({ work, schedule }) => {
    const ucaps: ActaGanttUcap[] = schedule.items.map((it) => ({
      ucapId: it.ucapId,
      code: it.ucapCode,
      description: it.ucapDescription,
      start: it.ucapStartDate,
      end: it.ucapEndDate,
      progress: ucapPct(it.executedQuantity, it.plannedQuantity),
    }));

    // Avance agregado ponderado por valor
    let plannedValue = 0;
    let executedValue = 0;
    let plannedQty = 0;
    let executedQty = 0;
    for (const it of schedule.items) {
      const v = it.unitValue || 0;
      plannedValue += it.plannedQuantity * v;
      executedValue += it.executedQuantity * v;
      plannedQty += it.plannedQuantity;
      executedQty += it.executedQuantity;
    }
    const progress =
      plannedValue > 0
        ? clamp01(executedValue / plannedValue) * 100
        : plannedQty > 0
        ? clamp01(executedQty / plannedQty) * 100
        : 0;

    // Fechas de la barra de la obra
    let start = schedule.contractualStart;
    let end = schedule.contractualEnd;
    if (!start || !end) {
      const starts = ucaps.map((u) => u.start).filter((d): d is string => !!d);
      const ends = ucaps.map((u) => u.end).filter((d): d is string => !!d);
      if (starts.length) start = start || starts.reduce((a, b) => (a < b ? a : b));
      if (ends.length) end = end || ends.reduce((a, b) => (a > b ? a : b));
    }

    return {
      workId: work.workId,
      workCode: work.workCode || '',
      name: work.name,
      start: start || null,
      end: end || null,
      progress,
      ucaps,
    };
  });
}

// ─── componente ──────────────────────────────────────────────────────────────

function dateMs(s: string): number {
  return parseLocalDate(s).getTime();
}

const DAY_MS = 86_400_000;
const LABEL = 'w-52 flex-shrink-0';
const PCT = 'w-12 flex-shrink-0';

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
      for (const u of o.ucaps) {
        if (u.start) allMs.push(dateMs(u.start));
        if (u.end) allMs.push(dateMs(u.end));
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
  const Bar = ({ start, end, progress, height }: { start: string | null; end: string | null; progress: number; height: string }) => {
    const innerH = height === 'h-7' ? 'h-3.5' : 'h-2.5';
    if (!timeline || !start || !end) {
      // Sin fechas de cronograma: barra de progreso simple basada en el % de avance.
      const color = fillColorFor(start, end, progress);
      return (
        <div className={`flex-1 ${height} flex items-center`}>
          <div className={`w-full ${innerH} rounded-full bg-[hsl(var(--canalco-neutral-200))] overflow-hidden`}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, progress)}%`, background: color }}
            />
          </div>
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
        <div
          className={`absolute top-1/2 -translate-y-1/2 ${innerH} rounded-full bg-[hsl(var(--canalco-neutral-200))]`}
          style={{ left: `${left}%`, width: `${barWidth}%` }}
        />
        <div
          className={`absolute top-1/2 -translate-y-1/2 ${innerH} rounded-full transition-all`}
          style={{ left: `${left}%`, width: `${fillWidth}%`, background: color }}
        />
      </div>
    );
  };

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 680 }}>
        {/* ── Etiquetas de fecha ── */}
        {timeline && (
          <div className="flex gap-2 h-7 mb-1">
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
            <div className={PCT} />
          </div>
        )}

        {/* ── Filas de obras ── */}
        {obras.map((obra) => {
          const isOpen = expanded.has(obra.workId);
          const color = fillColorFor(obra.start, obra.end, obra.progress);
          return (
            <div key={obra.workId} className="border-b border-[hsl(var(--canalco-neutral-100))] last:border-b-0">
              {/* fila de la obra (clic = desplegar) */}
              <button
                onClick={() => toggle(obra.workId)}
                className="w-full flex items-center gap-2 py-2 hover:bg-[hsl(var(--canalco-neutral-50))] transition-colors text-left"
              >
                <div className={`${LABEL} flex items-center gap-1 pr-2 min-w-0`}>
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 flex-shrink-0 text-[hsl(var(--canalco-neutral-500))]" />
                  ) : (
                    <ChevronRight className="w-4 h-4 flex-shrink-0 text-[hsl(var(--canalco-neutral-500))]" />
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
                <div className={`${PCT} text-right`}>
                  <span className="text-xs font-bold" style={{ color }}>
                    {Math.round(obra.progress)}%
                  </span>
                </div>
              </button>

              {/* sub-filas de UCAPs */}
              {isOpen && (
                <div className="pb-1.5 bg-[hsl(var(--canalco-neutral-50))]/40">
                  {obra.ucaps.length === 0 ? (
                    <div className="flex items-center gap-2 py-1">
                      <div className={LABEL} />
                      <div className="flex-1 text-[11px] text-[hsl(var(--canalco-neutral-400))] italic">
                        Sin UCAPs registradas
                      </div>
                      <div className={PCT} />
                    </div>
                  ) : (
                    obra.ucaps.map((u) => {
                      const uColor = fillColorFor(u.start, u.end, u.progress);
                      return (
                        <div key={u.ucapId} className="flex items-center gap-2 py-1">
                          <div className={`${LABEL} pl-7 pr-2 min-w-0`}>
                            <p className="text-[11px] font-mono font-semibold text-[hsl(var(--canalco-neutral-600))] truncate leading-tight">
                              {u.code}
                            </p>
                            <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))] truncate leading-tight">
                              {u.description}
                            </p>
                          </div>
                          <Bar start={u.start} end={u.end} progress={u.progress} height="h-5" />
                          <div className={`${PCT} text-right`}>
                            <span className="text-[11px] font-semibold" style={{ color: uColor }}>
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
            <div className={PCT} />
          </div>
        )}
      </div>
    </div>
  );
}

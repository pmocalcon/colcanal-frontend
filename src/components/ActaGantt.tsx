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
  start: string | null; // barra de la obra = rango del plan (unión de sus UCAPs)
  end: string | null;
  contextStart: string | null; // fechas contractuales: solo dan contexto al eje, no se dibujan
  contextEnd: string | null;
  progress: number; // 0–100 (promedio simple del % de cada UCAP)
  weight: number; // nº de UCAPs con plan (informativo; el avance general usa promedio simple)
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
 * - Progreso de la obra: promedio simple del % de avance de cada UCAP (con plan > 0).
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
const PCT = 'w-14 flex-shrink-0';

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

  return (
    <div>
      {/* ── Avance general (promedio simple del avance de cada obra) ── */}
      <div className="mb-5 rounded-xl border border-[hsl(var(--canalco-neutral-200))] bg-gradient-to-br from-white to-[hsl(var(--canalco-neutral-50))] px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-sm font-semibold text-[hsl(var(--canalco-neutral-800))]">
            Avance general del acta
            <span className="ml-2 text-xs font-normal text-[hsl(var(--canalco-neutral-400))]">
              ({obras.length} obras · promedio del avance)
            </span>
          </span>
          <span
            className="text-base font-bold tabular-nums rounded-full px-3 py-1"
            style={badgeStyle(overallColor)}
          >
            {Math.round(overall)}%
          </span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-[hsl(var(--canalco-neutral-200))] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 shadow-sm"
            style={{ width: `${Math.min(100, overall)}%`, background: overallColor }}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 680 }}>
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
            <div className={PCT} />
          </div>
        )}

        {/* ── Filas de obras ── */}
        {obras.map((obra, idx) => {
          const isOpen = expanded.has(obra.workId);
          const color = fillColorFor(obra.start, obra.end, obra.progress);
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
                <div className={`${PCT} flex justify-end`}>
                  <span
                    className="text-[11px] font-bold tabular-nums rounded-full px-2 py-0.5"
                    style={badgeStyle(color)}
                  >
                    {Math.round(obra.progress)}%
                  </span>
                </div>
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
                          <div className={`${PCT} flex justify-end`}>
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
            <div className={PCT} />
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
